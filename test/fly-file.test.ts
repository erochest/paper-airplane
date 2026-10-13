import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/core.ts";
import { FakeDevice, FakeRenderer } from "./fakes.ts";

let dir: string;
let device: FakeDevice;
let renderer: FakeRenderer;
let out: string[];
let err: string[];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "fly-test-"));
  device = new FakeDevice();
  renderer = new FakeRenderer();
  out = [];
  err = [];
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

// 2026-10-13 09:05 in the local time zone, so names don't depend on TZ.
const sentAt = new Date(2026, 9, 13, 9, 5);

function fly(...args: string[]) {
  return flyIn(dir, ...args);
}

function flyIn(cwd: string, ...args: string[]) {
  return run(args, {
    env: { HOME: dir },
    cwd,
    now: () => sentAt,
    transport: device,
    renderer,
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
  });
}

async function markdownFile(name: string, content: string) {
  await writeFile(join(dir, name), content);
  return join(dir, name);
}

test("fly file uploads the rendered Markdown to the Hangar under a timestamped name", async () => {
  const path = await markdownFile("notes.md", "Some *design* notes.\n");

  const code = await fly("file", path, "--title", "Design notes");

  expect(code).toBe(0);
  expect(device.uploads).toHaveLength(1);
  const [upload] = device.uploads;
  expect(upload?.folder).toBe("/Paper Airplane");
  expect(upload?.name).toBe("2026-10-13 09:05 Design notes");
  expect(new TextDecoder().decode(upload?.content)).toBe("%PDF-fake\nSome *design* notes.\n");
});

test("fly file prints the Dispatch's ID, name and state as JSON", async () => {
  const path = await markdownFile("notes.md", "Notes.\n");

  await fly("file", path, "--title", "Design notes");

  expect(out.map((line) => JSON.parse(line))).toEqual([
    { id: renderer.requests[0]?.dispatchId, name: "2026-10-13 09:05 Design notes", state: "landed" },
  ]);
});

test("every Dispatch gets its own Dispatch ID, which is passed to the renderer", async () => {
  const path = await markdownFile("notes.md", "Notes.\n");

  await fly("file", path);
  await fly("file", path);

  const ids = renderer.requests.map((r) => r.dispatchId);
  expect(ids).toHaveLength(2);
  for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  expect(ids[0]).not.toBe(ids[1]);
});

test("without --title, the first heading names the Dispatch", async () => {
  const path = await markdownFile(
    "plan.md",
    "Intro text.\n\n```md\n# Not this one\n```\n\n## Rollout plan ##  \n\n# Later heading\n",
  );

  await fly("file", path);

  expect(device.uploads.map((u) => u.name)).toEqual(["2026-10-13 09:05 Rollout plan"]);
});

test("without --title or a heading, the file name names the Dispatch", async () => {
  const path = await markdownFile("meeting notes.v2.md", "Just text.\n\n```\n# a comment\n```\n");

  await fly("file", path);

  expect(device.uploads.map((u) => u.name)).toEqual(["2026-10-13 09:05 meeting notes.v2"]);
});

test("the page-1 header shows the title, send time, project and kind", async () => {
  const repo = join(dir, "paper-airplane");
  await mkdir(join(repo, ".git"), { recursive: true });
  await mkdir(join(repo, "docs", "plans"), { recursive: true });
  await writeFile(join(repo, "docs", "plans", "plan.md"), "# Rollout plan\n");

  await flyIn(join(repo, "docs", "plans"), "file", "plan.md");

  expect(renderer.requests.map((r) => r.header)).toEqual([
    { title: "Rollout plan", timestamp: "2026-10-13 09:05", project: "paper-airplane", kind: "File" },
  ]);
});

test("outside a git repo, the header's project is the working directory's name", async () => {
  const project = join(dir, "scratch notes");
  await mkdir(project);
  await writeFile(join(project, "notes.md"), "Notes.\n");

  await flyIn(project, "file", "notes.md", "--title", "Notes");

  expect(renderer.requests[0]?.header.project).toBe("scratch notes");
});

test("a relative path is read from the working directory", async () => {
  await markdownFile("notes.md", "# Relative\n");

  await fly("file", "notes.md");

  expect(device.uploads.map((u) => u.name)).toEqual(["2026-10-13 09:05 Relative"]);
});

test("the Hangar is created on a device that doesn't have it", async () => {
  const path = await markdownFile("notes.md", "# Notes\n");
  expect(device.folders.size).toBe(0);

  await fly("file", path);

  expect([...device.folders]).toEqual(["/Paper Airplane"]);
});

test("a slash in the title doesn't become a folder on the device", async () => {
  const path = await markdownFile("notes.md", "Notes.\n");

  await fly("file", path, "--title", "A/B testing");

  expect(device.uploads.map((u) => [u.folder, u.name])).toEqual([
    ["/Paper Airplane", "2026-10-13 09:05 A-B testing"],
  ]);
});

test("a missing file is reported and nothing is sent", async () => {
  const code = await fly("file", join(dir, "nope.md"));

  expect(code).toBe(1);
  expect(err.join("\n")).toContain("nope.md");
  expect(out).toEqual([]);
  expect(device.uploads).toEqual([]);
});
