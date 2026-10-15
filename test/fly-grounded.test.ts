import { afterEach, beforeEach, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/core.ts";
import { FakeDevice, FakeRenderer, FakeToolchain } from "./fakes.ts";

let dir: string;
let project: string;
let device: FakeDevice;
let renderer: FakeRenderer;
let out: string[];
let err: string[];
// Set per test; starts at 2026-10-13 09:05 in the local time zone.
let now: Date;
let env: Record<string, string | undefined>;

beforeEach(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), "fly-test-")));
  project = join(dir, "paper-airplane");
  await mkdir(join(project, ".git"), { recursive: true });
  device = new FakeDevice();
  renderer = new FakeRenderer();
  out = [];
  err = [];
  now = new Date(2026, 9, 13, 9, 5);
  env = { HOME: dir, FLY_DATA_DIR: dataDir() };
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const dataDir = () => join(dir, "data");

function fly(...args: string[]) {
  return flyIn(project, ...args);
}

function flyIn(cwd: string, ...args: string[]) {
  return run(args, {
    env,
    cwd,
    now: () => now,
    transport: device,
    renderer,
    toolchain: new FakeToolchain(),
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
  });
}

/** Runs `fly log` with `args` and returns the parsed records, leaving `out` and `err` as they were. */
async function flyLog(...args: string[]) {
  const [savedOut, savedErr] = [out, err];
  out = [];
  err = [];
  const code = await fly("log", ...args);
  expect(err).toEqual([]);
  expect(code).toBe(0);
  const records = JSON.parse(out.join("\n"));
  [out, err] = [savedOut, savedErr];
  return records;
}

/** Sends a File Dispatch of a Markdown file titled `title` from `cwd`, and returns its exit code. */
async function sendFile(title: string, cwd = project) {
  const path = join(cwd, `${title}.md`);
  await writeFile(path, `# ${title}\n`);
  return flyIn(cwd, "file", path);
}

const printed = () => out.map((line) => JSON.parse(line));

test("a failed upload keeps the PDF, records the Dispatch as Grounded, and prints the reason and path", async () => {
  device.failure = "network-down";

  const code = await sendFile("Rollout plan");

  expect(code).toBe(1);
  expect(device.uploads).toEqual([]);
  const id = renderer.requests[0]?.dispatchId;
  const [result] = printed();
  expect(result).toEqual({
    id,
    name: "2026-10-13 09:05 Rollout plan",
    state: "grounded",
    pdfPath: expect.stringMatching(/\.pdf$/),
  });
  expect(result.pdfPath.startsWith(dataDir())).toBe(true);
  expect(new TextDecoder().decode(await readFile(result.pdfPath))).toBe("%PDF-fake\n# Rollout plan\n");
  expect(err).toEqual([
    "fly: the upload failed (rmapi exited with 1: dial tcp: lookup internal.cloud.remarkable.com: no such host); " +
      `the Dispatch is Grounded and its PDF is kept at ${result.pdfPath}; run fly retry to send it again`,
  ]);

  const [record] = await flyLog();
  expect(record).toMatchObject({ id, name: "2026-10-13 09:05 Rollout plan", state: "grounded", pdfPath: result.pdfPath });
});

test("an upload that fails for want of a login tells the user to run fly doctor", async () => {
  device.failure = "no-login";

  expect(await sendFile("Rollout plan")).toBe(1);

  const [{ pdfPath }] = printed();
  expect(err).toEqual([
    "fly: the upload failed because rmapi is not logged in to the reMarkable cloud, or its login has expired; " +
      `the Dispatch is Grounded and its PDF is kept at ${pdfPath}; run fly doctor to fix the login, ` +
      "then fly retry to send it again",
  ]);
});

test("a retry that fails for want of a login tells the user to run fly doctor", async () => {
  device.failure = "network-down";
  await sendFile("Rollout plan");
  const [{ pdfPath }] = printed();

  device.failure = "no-login";
  err = [];
  expect(await fly("retry")).toBe(1);

  expect(err).toEqual([
    "fly: the upload failed because rmapi is not logged in to the reMarkable cloud, or its login has expired; " +
      `the Dispatch is Grounded and its PDF is kept at ${pdfPath}; run fly doctor to fix the login, ` +
      "then fly retry to send it again",
  ]);
});

test("fly retry sends a Grounded Dispatch under its original name and ID, and marks it landed", async () => {
  device.failure = "no-login";
  await sendFile("Rollout plan");
  const id = renderer.requests[0]?.dispatchId;
  const [{ pdfPath }] = printed();

  device.failure = null;
  now = new Date(2026, 9, 13, 11, 40);
  out = [];
  err = [];
  const code = await fly("retry");

  expect(err).toEqual([]);
  expect(code).toBe(0);
  expect(printed()).toEqual([{ id, name: "2026-10-13 09:05 Rollout plan", state: "landed" }]);
  expect(device.uploads.map((u) => [u.folder, u.name, new TextDecoder().decode(u.content)])).toEqual([
    ["/Paper Airplane", "2026-10-13 09:05 Rollout plan", "%PDF-fake\n# Rollout plan\n"],
  ]);
  // Retrying resends the kept PDF; nothing is typeset again.
  expect(renderer.requests).toHaveLength(1);
  expect(await flyLog()).toEqual([
    expect.objectContaining({ id, state: "landed", pdfPath: null, sentAt: now.toISOString() }),
  ]);
  expect(await Bun.file(pdfPath).exists()).toBe(false);
});

test("Dispatches that fail again stay Grounded, and a later retry sends them all", async () => {
  device.failure = "network-down";
  await sendFile("First");
  now = new Date(2026, 9, 13, 9, 10);
  await sendFile("Second");
  const ids = renderer.requests.map((r) => r.dispatchId);
  const pdfPaths = printed().map((r) => r.pdfPath);

  out = [];
  err = [];
  expect(await fly("retry")).toBe(1);
  expect(device.uploads).toEqual([]);
  expect(printed()).toEqual([
    { id: ids[0], name: "2026-10-13 09:05 First", state: "grounded", pdfPath: pdfPaths[0] },
    { id: ids[1], name: "2026-10-13 09:10 Second", state: "grounded", pdfPath: pdfPaths[1] },
  ]);
  expect(err).toHaveLength(2);
  expect((await flyLog()).map((r: { state: string }) => r.state)).toEqual(["grounded", "grounded"]);
  for (const path of pdfPaths) expect(await Bun.file(path).exists()).toBe(true);

  device.failure = null;
  out = [];
  err = [];
  expect(await fly("retry")).toBe(0);
  expect(err).toEqual([]);
  expect(device.uploads.map((u) => u.name)).toEqual(["2026-10-13 09:05 First", "2026-10-13 09:10 Second"]);
  expect((await flyLog()).map((r: { state: string }) => r.state)).toEqual(["landed", "landed"]);
});

test("fly retry with nothing Grounded sends nothing", async () => {
  await sendFile("Landed fine");
  out = [];

  expect(await fly("retry")).toBe(0);

  expect(out).toEqual([]);
  expect(err).toEqual(["fly: no Dispatches are Grounded; nothing was sent"]);
  expect(device.uploads).toHaveLength(1);
});

test("fly retry sends Grounded Dispatches from every project", async () => {
  const other = join(dir, "other-project");
  await mkdir(join(other, ".git"), { recursive: true });
  device.failure = "network-down";
  await sendFile("Elsewhere", other);

  device.failure = null;
  expect(await fly("retry")).toBe(0);

  expect(device.uploads.map((u) => u.name)).toEqual(["2026-10-13 09:05 Elsewhere"]);
});

test("a retry whose name was taken in the meantime gets a counter rather than replacing it", async () => {
  device.failure = "network-down";
  await sendFile("Rollout plan");
  device.failure = null;
  device.place("/Paper Airplane", "2026-10-13 09:05 Rollout plan");
  out = [];

  expect(await fly("retry")).toBe(0);

  expect(device.uploads.map((u) => u.name)).toEqual(["2026-10-13 09:05 Rollout plan (2)"]);
  expect(printed()[0].name).toBe("2026-10-13 09:05 Rollout plan (2)");
  expect((await flyLog())[0].name).toBe("2026-10-13 09:05 Rollout plan (2)");
});

test("fly log --grounded lists only Grounded Dispatches, from every project", async () => {
  const other = join(dir, "other-project");
  await mkdir(join(other, ".git"), { recursive: true });
  await sendFile("Landed");
  device.failure = "no-login";
  now = new Date(2026, 9, 13, 9, 10);
  await sendFile("Stuck here");
  now = new Date(2026, 9, 13, 9, 15);
  await sendFile("Stuck elsewhere", other);

  const names = (records: { name: string }[]) => records.map((r) => r.name);
  expect(names(await flyLog("--grounded"))).toEqual(["2026-10-13 09:10 Stuck here", "2026-10-13 09:15 Stuck elsewhere"]);

  device.failure = null;
  await fly("retry");
  expect(await flyLog("--grounded")).toEqual([]);
});

test("fly retry and fly log reject unknown or conflicting options", async () => {
  expect(await fly("retry", "--bogus")).toBe(2);
  expect(await fly("log", "--grounded", "--all")).toBe(2);
  expect(await fly("log", "--grounded", "--session", "x")).toBe(2);
  expect(err).toEqual([
    "usage: fly retry",
    "usage: fly log [--all | --session <id> | --grounded]",
    "usage: fly log [--all | --session <id> | --grounded]",
  ]);
});

test("a Grounded Reply Dispatch that lands through fly retry is then protected from resending", async () => {
  const projects = join(dir, ".claude", "projects", project.replace(/[^a-zA-Z0-9]/g, "-"));
  await mkdir(projects, { recursive: true });
  await copyFile(join(import.meta.dir, "fixtures", "claude-code", "trailing-short.jsonl"), join(projects, "s1.jsonl"));
  env.CLAUDE_CODE_SESSION_ID = "s1";
  device.failure = "network-down";
  expect(await fly("reply")).toBe(1);
  const [{ id, name }] = printed();

  device.failure = null;
  out = [];
  err = [];
  expect(await fly("retry")).toBe(0);
  expect(printed()).toEqual([{ id, name, state: "landed" }]);

  err = [];
  expect(await fly("reply")).toBe(1);
  expect(err).toEqual([expect.stringContaining(`this Reply already landed as "${name}"`)]);
  expect(device.uploads).toHaveLength(1);
});

test("a Grounded Reply isn't sent again as a new Dispatch unless --again is passed", async () => {
  const projects = join(dir, ".claude", "projects", project.replace(/[^a-zA-Z0-9]/g, "-"));
  await mkdir(projects, { recursive: true });
  await copyFile(join(import.meta.dir, "fixtures", "claude-code", "trailing-short.jsonl"), join(projects, "s1.jsonl"));
  env.CLAUDE_CODE_SESSION_ID = "s1";
  device.failure = "network-down";
  await fly("reply");
  const [{ name }] = printed();

  device.failure = null;
  err = [];
  expect(await fly("reply")).toBe(1);
  expect(err).toEqual([
    `fly: this Reply is already Grounded as "${name}"; run fly retry to send it, ` +
      "or pass --again to send another copy; nothing was sent",
  ]);
  expect(device.uploads).toEqual([]);

  expect(await fly("reply", "--again")).toBe(0);
  expect(device.uploads).toHaveLength(1);
});

test("a kept PDF that has gone missing is reported as such, and the Dispatch stays Grounded", async () => {
  device.failure = "network-down";
  await sendFile("Rollout plan");
  const [{ pdfPath }] = printed();
  await rm(pdfPath);

  device.failure = null;
  out = [];
  err = [];
  expect(await fly("retry")).toBe(1);

  expect(device.uploads).toEqual([]);
  expect(err).toEqual([
    expect.stringMatching(new RegExp(`^fly: the kept PDF for "2026-10-13 09:05 Rollout plan" can't be read at ${pdfPath}`)),
  ]);
  expect((await flyLog("--grounded")).map((r: { name: string }) => r.name)).toEqual(["2026-10-13 09:05 Rollout plan"]);
});
