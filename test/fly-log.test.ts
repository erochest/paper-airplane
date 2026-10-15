import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/core.ts";
import { FakeDevice, FakeRenderer } from "./fakes.ts";

let dir: string;
let project: string;
let device: FakeDevice;
let renderer: FakeRenderer;
let out: string[];
let err: string[];

beforeEach(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), "fly-test-")));
  project = join(dir, "paper-airplane");
  await mkdir(join(project, ".git"), { recursive: true });
  device = new FakeDevice();
  renderer = new FakeRenderer();
  out = [];
  err = [];
  now = new Date(2026, 9, 13, 9, 5);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

// Set per test; starts at 2026-10-13 09:05 in the local time zone.
let now: Date;

function flyIn(cwd: string, ...args: string[]) {
  return run(args, {
    env: { HOME: dir, FLY_DATA_DIR: join(dir, "data") },
    cwd,
    now: () => now,
    transport: device,
    renderer,
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
  });
}

/** Runs `fly log` with `args` in `cwd` and returns the parsed records. */
async function flyLog(cwd: string, ...args: string[]) {
  out = [];
  const code = await flyIn(cwd, "log", ...args);
  expect(err).toEqual([]);
  expect(code).toBe(0);
  return JSON.parse(out.join("\n"));
}

async function sendFile(cwd: string, name: string, title: string) {
  const path = join(cwd, name);
  await writeFile(path, `# ${title}\n`);
  expect(await flyIn(cwd, "file", path)).toBe(0);
}

test("a File Dispatch is recorded in the Flight Log", async () => {
  now = new Date(2026, 9, 13, 9, 5);
  await sendFile(project, "plan.md", "Rollout plan");
  const id = renderer.requests[0]?.dispatchId;

  expect(await flyLog(project)).toEqual([
    {
      id,
      kind: "File",
      host: null,
      sessionId: null,
      replyRef: null,
      projectPath: project,
      gitRemote: null,
      sessionTitle: null,
      name: "2026-10-13 09:05 Rollout plan",
      writtenAt: now.toISOString(),
      sentAt: now.toISOString(),
      state: "landed",
      pdfPath: null,
      supersedes: null,
    },
  ]);
});

test("the project's git remote is recorded", async () => {
  const repo = join(dir, "with-remote");
  await mkdir(repo);
  for (const args of [["init", "--quiet"], ["remote", "add", "origin", "git@github.com:example/with-remote.git"]]) {
    expect(Bun.spawnSync(["git", "-C", repo, ...args]).exitCode).toBe(0);
  }
  await mkdir(join(repo, "docs"));
  await sendFile(join(repo, "docs"), "plan.md", "Plan");

  const [dispatch] = await flyLog(join(repo, "docs"));
  expect(dispatch.projectPath).toBe(repo);
  expect(dispatch.gitRemote).toBe("git@github.com:example/with-remote.git");
});

test("fly log lists only the current project's Dispatches, oldest first; --all lists every project's", async () => {
  const other = join(dir, "other-project");
  await mkdir(join(other, ".git"), { recursive: true });
  await mkdir(join(project, "src"));

  now = new Date(2026, 9, 13, 9, 5);
  await sendFile(project, "a.md", "First");
  now = new Date(2026, 9, 13, 9, 10);
  await sendFile(other, "b.md", "Elsewhere");
  now = new Date(2026, 9, 13, 9, 15);
  await sendFile(join(project, "src"), "c.md", "Second");

  const names = (records: { name: string }[]) => records.map((r) => r.name);
  expect(names(await flyLog(join(project, "src")))).toEqual(["2026-10-13 09:05 First", "2026-10-13 09:15 Second"]);
  expect(names(await flyLog(other))).toEqual(["2026-10-13 09:10 Elsewhere"]);
  expect(names(await flyLog(other, "--all"))).toEqual([
    "2026-10-13 09:05 First",
    "2026-10-13 09:10 Elsewhere",
    "2026-10-13 09:15 Second",
  ]);
});

test("fly log is an empty list before anything is sent", async () => {
  expect(await flyLog(project)).toEqual([]);
  expect(await flyLog(project, "--all")).toEqual([]);
});

test("fly log --session narrows to one Session", async () => {
  await sendFile(project, "a.md", "Not from a Session");

  // File Dispatches have no Session; Session Dispatches arrive with `fly reply`.
  expect(await flyLog(project, "--session", "some-session")).toEqual([]);
});

test("fly log rejects unknown or conflicting options", async () => {
  expect(await flyIn(project, "log", "--bogus")).toBe(2);
  expect(await flyIn(project, "log", "--all", "--session", "x")).toBe(2);
  expect(err).toEqual([
    "usage: fly log [--all | --session <id> | --grounded]",
    "usage: fly log [--all | --session <id> | --grounded]",
  ]);
});

test("several fly processes sending at once are all recorded", async () => {
  const count = 8;
  for (let i = 0; i < count; i++) await writeFile(join(project, `${i}.md`), `# Note ${i}\n`);
  const script = join(import.meta.dir, "fly-with-fakes.ts");

  const procs = Array.from({ length: count }, (_, i) =>
    Bun.spawn([process.execPath, script, project, join(dir, "data"), "file", `${i}.md`], {
      stdout: "pipe",
      stderr: "pipe",
    }),
  );
  const results = await Promise.all(procs.map(async (p) => [await p.exited, await new Response(p.stderr).text()]));

  expect(results).toEqual(Array.from({ length: count }, () => [0, ""]));
  const records: { name: string }[] = await flyLog(project);
  expect(records.map((r) => r.name.slice("YYYY-MM-DD HH:MM ".length)).sort()).toEqual(
    Array.from({ length: count }, (_, i) => `Note ${i}`).sort(),
  );
}, 20_000);

test("a project reached through a symlink is the same project", async () => {
  const link = join(dir, "link-to-project");
  await symlink(project, link);

  await sendFile(link, "a.md", "Via link");

  expect((await flyLog(project)).map((r: { name: string }) => r.name)).toEqual(["2026-10-13 09:05 Via link"]);
});
