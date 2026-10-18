import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { appendFile, copyFile, mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/core.ts";
import { FakeDevice, FakeRenderer, FakeToolchain } from "./fakes.ts";

const FIXTURES = join(import.meta.dir, "fixtures", "pi");

// Reply Dispatches are named for the Reply's own timestamp, which fixtures record in UTC.
let savedTz: string | undefined;
beforeAll(() => {
  savedTz = process.env.TZ;
  process.env.TZ = "UTC";
});
afterAll(() => {
  if (savedTz === undefined) delete process.env.TZ;
  else process.env.TZ = savedTz;
});

let dir: string;
let project: string;
let device: FakeDevice;
let renderer: FakeRenderer;
let out: string[];
let err: string[];
let env: Record<string, string | undefined>;
let now: Date;

beforeEach(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), "fly-test-")));
  project = join(dir, "paper-airplane");
  await mkdir(join(project, ".git"), { recursive: true });
  device = new FakeDevice();
  renderer = new FakeRenderer();
  out = [];
  err = [];
  env = { HOME: dir, FLY_DATA_DIR: join(dir, "data") };
  now = new Date("2026-10-14T08:00:00Z");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function fly(...args: string[]) {
  return run(args, {
    env,
    cwd: project,
    now: () => now,
    transport: device,
    renderer,
    toolchain: new FakeToolchain(),
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
  });
}

/**
 * Copies a fixture Session file and makes it current, as Pi does through PI_SESSION_FILE.
 * Returns the Session ID and the file's path.
 */
async function inSession(fixture: string) {
  const file = join(dir, `2026-10-13T13-30-00-000Z_${fixture}.jsonl`);
  await copyFile(join(FIXTURES, `${fixture}.jsonl`), file);
  env.PI_SESSION_FILE = file;
  const header = JSON.parse((await readFile(file, "utf8")).split("\n")[0] ?? "");
  return { sessionId: header.id as string, file };
}

/** Appends an entry to a Session file as a child of its last entry, so it becomes the leaf. */
async function appendEntry(file: string, entry: object) {
  const last = JSON.parse((await readFile(file, "utf8")).trimEnd().split("\n").at(-1) ?? "");
  await appendFile(file, `${JSON.stringify({ ...entry, parentId: last.id, timestamp: last.timestamp })}\n`);
}

const expected = (name: string) => readFile(join(FIXTURES, `${name}.expected.md`), "utf8");

/** Runs `fly log` with `args` and returns the parsed records. */
async function flyLog(...args: string[]) {
  out = [];
  expect(await fly("log", ...args)).toBe(0);
  return JSON.parse(out.join("\n"));
}

test("fly reply sends the current branch's most recent Long Reply, ignoring abandoned branches", async () => {
  const { sessionId } = await inSession("branched");

  const code = await fly("reply");

  expect(err).toEqual([]);
  expect(code).toBe(0);
  expect(renderer.requests.map((r) => r.markdown)).toEqual([await expected("branched-reply")]);
  expect(device.uploads.map((u) => [u.folder, u.name])).toEqual([
    ["/Paper Airplane", "2026-10-13 13-32 Rollout plan for sending"],
  ]);
  const [dispatch] = await flyLog("--session", sessionId);
  expect([dispatch.host, dispatch.sessionId, dispatch.replyRef]).toEqual(["pi", sessionId, "a000000a"]);
});

test("fly replies lists only the current branch's Replies, and --reply can't name an abandoned one", async () => {
  await inSession("branched");

  expect(await fly("replies")).toBe(0);

  expect(err).toEqual([]);
  expect(JSON.parse(out.join("\n"))).toEqual([
    { ref: "a000000a", timestamp: "2026-10-13T13:32:40+00:00", words: 337, long: true, preview: "Rollout plan: in stages" },
    { ref: "a0000016", timestamp: "2026-10-13T13:34:49+00:00", words: 1, long: false, preview: "Done." },
    {
      ref: "a0000018",
      timestamp: "2026-10-13T13:35:29+00:00",
      words: 13,
      long: false,
      preview: "Glad it helps. Let me know when you want to start stage one.",
    },
  ]);

  // The longer plan, on a branch the user went back from.
  err = [];
  expect(await fly("reply", "--reply", "a000000f")).toBe(1);
  expect(err).toEqual([
    "fly: this Session has no Reply with reference a000000f; run fly replies to list them; nothing was sent",
  ]);
  expect(device.uploads).toEqual([]);
});

test("fly reply --reply sends a named short Reply from the current branch", async () => {
  await inSession("branched");

  expect(await fly("reply", "--reply", "a0000016")).toBe(0);

  expect(renderer.requests.map((r) => r.markdown)).toEqual(["Done."]);
  expect(device.uploads.map((u) => u.name)).toEqual(["2026-10-13 13-34 Rollout plan for sending"]);
});

test("fly conversation sends only the current branch, with prompts set apart from Replies", async () => {
  const { sessionId } = await inSession("branched");

  expect(await fly("conversation")).toBe(0);

  expect(err).toEqual([]);
  const [markdown] = renderer.requests.map((r) => r.markdown);
  expect(markdown).toBe(await expected("branched-conversation"));
  for (const leftOut of ["all at once", "Appendix: who does what", "opened a pull request", "Read the design first", "The new path uploads"]) {
    expect(markdown).not.toContain(leftOut);
  }
  expect(device.uploads.map((u) => u.name)).toEqual(["2026-10-14 08-00 Rollout plan for sending (conversation)"]);
  const [dispatch] = await flyLog("--session", sessionId);
  expect([dispatch.kind, dispatch.host, dispatch.replyRef]).toEqual(["Conversation", "pi", null]);
});

test("a Conversation Dispatch shows skill commands as typed, and leaves out injected context and shell commands", async () => {
  await inSession("untitled");

  expect(await fly("conversation", "--title", "Plan review")).toBe(0);

  expect(err).toEqual([]);
  const [markdown] = renderer.requests.map((r) => r.markdown);
  expect(markdown).toBe(await expected("untitled-conversation"));
  for (const leftOut of ["Follow these steps", "<skill", "system-reminder", "git status", "12 pass", "A rollout plan was written"]) {
    expect(markdown).not.toContain(leftOut);
  }
});

test("a Conversation Dispatch supersedes the Pi Session's previous one", async () => {
  const { sessionId } = await inSession("branched");
  expect(await fly("conversation")).toBe(0);
  now = new Date("2026-10-14T09:30:00Z");

  expect(await fly("conversation")).toBe(0);

  const [first, second] = renderer.requests.map((r) => r.dispatchId);
  const dispatches = await flyLog("--session", sessionId);
  expect(dispatches.map((d: { id: string; supersedes: string | null }) => [d.id, d.supersedes])).toEqual([
    [first, null],
    [second, first],
  ]);
});

test("without --title, a Pi Session that Pi hasn't named has no Session Title, so the agent must propose one", async () => {
  await inSession("untitled");

  expect(await fly("reply", "--reply", "a000001f")).toBe(1);
  expect(err).toEqual(["fly: this Session has no Session Title yet; run again with --title <title>"]);

  err = [];
  expect(await fly("reply", "--reply", "a000001f", "--title", "Plan review")).toBe(0);
  expect(await fly("reply", "--reply", "a0000029")).toBe(0);
  expect(err).toEqual([]);
  // The title given at the first Dispatch is fixed for the Session.
  expect(device.uploads.map((u) => u.name)).toEqual(["2026-10-13 15-00 Plan review", "2026-10-13 15-02 Plan review"]);
});

test("the Session Title comes from the latest name Pi gave the Session, trimmed", async () => {
  const { file } = await inSession("branched");
  await appendEntry(file, { type: "session_info", id: "renamed1", name: "  Staged rollout  " });

  expect(await fly("conversation")).toBe(0);
  expect(device.uploads.map((u) => u.name)).toEqual(["2026-10-14 08-00 Staged rollout (conversation)"]);
});

test("a name that Pi has cleared leaves the Session without a Session Title", async () => {
  const { file } = await inSession("branched");
  await appendEntry(file, { type: "session_info", id: "cleared1", name: "" });

  expect(await fly("reply")).toBe(1);
  expect(err).toEqual(["fly: this Session has no Session Title yet; run again with --title <title>"]);
});

test("a Reply that already landed is refused, and --again sends another copy", async () => {
  await inSession("branched");
  expect(await fly("reply")).toBe(0);

  expect(await fly("reply")).toBe(1);
  expect(err).toEqual([
    'fly: this Reply already landed as "2026-10-13 13-32 Rollout plan for sending", sent 2026-10-14 08-00; ' +
      "pass --again to send another copy; nothing was sent",
  ]);

  err = [];
  expect(await fly("reply", "--again")).toBe(0);
  expect(err).toEqual([]);
  expect(device.uploads.map((u) => u.name)).toEqual([
    "2026-10-13 13-32 Rollout plan for sending",
    "2026-10-13 13-32 Rollout plan for sending (2)",
  ]);
});

test("an unrecognised Pi session entry is a loud error, not silently dropped", async () => {
  await inSession("unknown-entry");

  expect(await fly("reply")).toBe(1);

  expect(err).toHaveLength(1);
  expect(err[0]).toMatch(/^fly: .*_unknown-entry\.jsonl:7: unrecognised Pi session entry \("hologram" entry\)/);
  expect(device.uploads).toEqual([]);
});

test("an unrecognised content block or message role is a loud error", async () => {
  for (const [message, what] of [
    [{ role: "assistant", content: [{ type: "hologram" }] }, 'assistant content block "hologram"'],
    [{ role: "user", content: [{ type: "audio" }] }, 'user content block "audio"'],
    [{ role: "narrator", content: "…" }, 'message with role "narrator"'],
  ] as const) {
    const { file } = await inSession("branched");
    await appendEntry(file, { type: "message", id: "odd00001", message });
    err = [];

    expect(await fly("conversation")).toBe(1);

    expect(err).toEqual([expect.stringContaining(`unrecognised Pi session entry (${what})`)]);
  }
  expect(device.uploads).toEqual([]);
});

test("a last line that Pi is still writing is ignored", async () => {
  const { file } = await inSession("branched");
  await appendFile(file, '{"type":"message","id":"a00000');

  expect(await fly("reply")).toBe(0);
  expect(err).toEqual([]);
});

test("a PI_SESSION_FILE that can't be read says so", async () => {
  env.PI_SESSION_FILE = join(dir, "missing.jsonl");

  expect(await fly("reply")).toBe(1);

  expect(err).toEqual([`fly: can't read the Pi Session file ${join(dir, "missing.jsonl")} (from PI_SESSION_FILE)`]);
});

test("when both hosts' variables are set, fly refuses to guess which Session it is in", async () => {
  await inSession("branched");
  env.CLAUDE_CODE_SESSION_ID = "some-claude-session";

  expect(await fly("reply")).toBe(1);

  expect(err).toEqual([
    "fly: both CLAUDE_CODE_SESSION_ID and PI_SESSION_FILE are set, so fly can't tell whether it is in a " +
      "Claude Code or a Pi Session; unset the one from the outer agent (e.g. env -u CLAUDE_CODE_SESSION_ID fly …)",
  ]);
  expect(device.uploads).toEqual([]);
});

test("an ephemeral Pi Session, which has no session file, says fly can't read it", async () => {
  env.PI_SESSION_ID = "01a1217a-0000-7000-8000-000000000004";

  expect(await fly("reply")).toBe(1);

  expect(err).toEqual([
    "fly: this Pi Session is ephemeral (PI_SESSION_ID is set but PI_SESSION_FILE isn't), so there is no session file to read",
  ]);
});

test("an ephemeral Pi Session started inside Claude Code isn't mistaken for the Claude Code Session", async () => {
  env.PI_SESSION_ID = "01a1217a-0000-7000-8000-000000000004";
  env.CLAUDE_CODE_SESSION_ID = "some-claude-session";

  expect(await fly("reply")).toBe(1);

  expect(err).toEqual([expect.stringMatching(/^fly: both CLAUDE_CODE_SESSION_ID and PI_SESSION_ID are set, /)]);
});
