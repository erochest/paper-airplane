import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { appendFile, copyFile, mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/core.ts";
import { FakeDevice, FakeRenderer } from "./fakes.ts";

const FIXTURES = join(import.meta.dir, "fixtures", "claude-code");

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

beforeEach(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), "fly-test-")));
  project = join(dir, "paper-airplane");
  await mkdir(join(project, ".git"), { recursive: true });
  device = new FakeDevice();
  renderer = new FakeRenderer();
  out = [];
  err = [];
  env = { HOME: dir, FLY_DATA_DIR: join(dir, "data") };
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const sentAt = new Date("2026-10-14T08:00:00Z");

function fly(...args: string[]) {
  return flyIn(project, ...args);
}

function flyIn(cwd: string, ...args: string[]) {
  return run(args, {
    env,
    cwd,
    now: () => sentAt,
    transport: device,
    renderer,
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
  });
}

/**
 * Puts a fixture transcript where Claude Code keeps this project's Sessions, and makes it current.
 * Returns the Session ID and the transcript's path.
 */
async function inSession(fixture: string, sessionId = `session-${fixture}`) {
  const projects = join(dir, ".claude", "projects", project.replace(/[^a-zA-Z0-9]/g, "-"));
  await mkdir(projects, { recursive: true });
  const transcript = join(projects, `${sessionId}.jsonl`);
  await copyFile(join(FIXTURES, `${fixture}.jsonl`), transcript);
  env.CLAUDE_CODE_SESSION_ID = sessionId;
  return { sessionId, transcript };
}

const expectedReply = (fixture: string) => readFile(join(FIXTURES, `${fixture}.expected.md`), "utf8");

test("fly reply sends the most recent Long Reply, skipping trailing short Replies", async () => {
  await inSession("trailing-short");

  const code = await fly("reply");

  expect(err).toEqual([]);
  expect(code).toBe(0);
  expect(device.uploads.map((u) => [u.folder, u.name])).toEqual([
    ["/Paper Airplane", "2026-10-13 13:31 Rollout plan for sending"],
  ]);
  expect(renderer.requests.map((r) => r.markdown)).toEqual([await expectedReply("trailing-short")]);
  expect(renderer.requests[0]?.header).toEqual({
    title: "Rollout plan for sending",
    timestamp: "2026-10-13 13:31",
    project: "paper-airplane",
    kind: "Reply",
  });
  expect(out.map((line) => JSON.parse(line))).toEqual([
    { id: renderer.requests[0]?.dispatchId, name: "2026-10-13 13:31 Rollout plan for sending", state: "landed" },
  ]);
});

test("a Reply's text blocks are joined across tool calls, leaving out thinking, tools and injections", async () => {
  await inSession("interleaved-tools");

  expect(await fly("reply", "--title", "Ticket 04")).toBe(0);

  const [markdown] = renderer.requests.map((r) => r.markdown);
  expect(markdown).toBe(await expectedReply("interleaved-tools"));
  for (const leftOut of ["Let me look at the Flight Log helper", "grep -n", "12 pass", "Base directory", "system-reminder"]) {
    expect(markdown).not.toContain(leftOut);
  }
  // Named for the Reply's last text block, at 15:01:22.
  expect(device.uploads.map((u) => u.name)).toEqual(["2026-10-13 15:01 Ticket 04"]);
});

test("without --title, a Session with no Session Title is refused so the agent can propose one", async () => {
  await inSession("interleaved-tools");

  expect(await fly("reply")).toBe(1);

  expect(err).toEqual(["fly: this Session has no Session Title yet; run again with --title <title>"]);
  expect(device.uploads).toEqual([]);
  expect(out).toEqual([]);
});

/** Runs `fly log` with `args` and returns the parsed records. */
async function flyLog(...args: string[]) {
  out = [];
  expect(await fly("log", ...args)).toBe(0);
  return JSON.parse(out.join("\n"));
}

test("a Reply Dispatch is recorded with its Session, host and source Reply", async () => {
  const { sessionId } = await inSession("trailing-short");
  await fly("reply");
  const id = renderer.requests[0]?.dispatchId;

  expect(await flyLog("--session", sessionId)).toEqual([
    {
      id,
      kind: "Reply",
      host: "claude-code",
      sessionId,
      // The uuid of the transcript record holding the Reply's first text block.
      replyRef: "00000000-0000-4000-8000-000000000006",
      projectPath: project,
      gitRemote: null,
      sessionTitle: "Rollout plan for sending",
      name: "2026-10-13 13:31 Rollout plan for sending",
      writtenAt: "2026-10-13T13:31:15.000Z",
      sentAt: sentAt.toISOString(),
      state: "landed",
      pdfPath: null,
      supersedes: null,
    },
  ]);
  expect(await flyLog("--session", "another-session")).toEqual([]);
});

test("the Session Title is fixed at the Session's first Dispatch and reused after that", async () => {
  await inSession("interleaved-tools", "fixed-title-session");
  expect(await fly("reply", "--title", "Ticket 04")).toBe(0);

  // The same Session again, now without --title: the title fixed in the Flight Log is used.
  expect(await fly("reply", "--again")).toBe(0);

  expect(err).toEqual([]);
  expect(device.uploads.map((u) => u.name)).toEqual(["2026-10-13 15:01 Ticket 04", "2026-10-13 15:01 Ticket 04 (2)"]);
});

test("a Session Title fixed in the Flight Log is preferred over Claude Code's generated title", async () => {
  await inSession("trailing-short", "renamed-session");
  expect(await fly("reply", "--title", "Sending rollout")).toBe(0);

  expect(await fly("reply", "--again")).toBe(0);

  expect(device.uploads.map((u) => u.name)).toEqual([
    "2026-10-13 13:31 Sending rollout",
    "2026-10-13 13:31 Sending rollout (2)",
  ]);
});

test("a Session with no Long Reply says so and sends nothing", async () => {
  await inSession("no-long-reply");

  expect(await fly("reply")).toBe(1);

  expect(err).toEqual(["fly: this Session has no Long Reply (more than 300 words) to send; nothing was sent"]);
  expect(device.uploads).toEqual([]);
  expect(await flyLog("--all")).toEqual([]);
});

test("an unrecognised transcript record is a loud error, not silently dropped", async () => {
  await inSession("unknown-block");

  expect(await fly("reply")).toBe(1);

  expect(err).toHaveLength(1);
  expect(err[0]).toMatch(/^fly: .*session-unknown-block\.jsonl:4: unrecognised Claude Code transcript record/);
  expect(err[0]).toContain('assistant content block "hologram"');
  expect(device.uploads).toEqual([]);
});

test("fly reply outside an agent Session says so", async () => {
  expect(await fly("reply")).toBe(1);

  expect(err).toEqual(["fly: not inside an agent Session (CLAUDE_CODE_SESSION_ID isn't set)"]);
});

test("a Session whose transcript can't be found says where fly looked", async () => {
  env.CLAUDE_CODE_SESSION_ID = "missing-session";

  expect(await fly("reply")).toBe(1);

  expect(err).toEqual([
    `fly: can't find the transcript for Claude Code Session missing-session under ${join(dir, ".claude", "projects")}`,
  ]);
});

test("the transcript is found under another project's directory when fly runs elsewhere", async () => {
  await inSession("trailing-short");
  const elsewhere = join(dir, "elsewhere");
  await mkdir(join(elsewhere, ".git"), { recursive: true });

  const code = await flyIn(elsewhere, "reply");

  expect(err).toEqual([]);
  expect(code).toBe(0);
  expect(device.uploads.map((u) => u.name)).toEqual(["2026-10-13 13:31 Rollout plan for sending"]);
});

test("a last transcript line that Claude Code is still writing is ignored", async () => {
  const { transcript } = await inSession("trailing-short");
  await appendFile(transcript, '{"parentUuid":"00000000-0000-4000-8000-0000000000');

  expect(await fly("reply")).toBe(0);
  expect(err).toEqual([]);
});

test("--title on a later Dispatch names only that Dispatch; the fixed Session Title stays", async () => {
  await inSession("trailing-short");
  expect(await fly("reply")).toBe(0);
  expect(await fly("reply", "--again", "--title", "One-off name")).toBe(0);

  expect(await fly("reply", "--again")).toBe(0);

  expect(device.uploads.map((u) => u.name)).toEqual([
    "2026-10-13 13:31 Rollout plan for sending",
    "2026-10-13 13:31 One-off name",
    "2026-10-13 13:31 Rollout plan for sending (2)",
  ]);
});

test("fly replies lists every Reply in the Session with what an agent needs to pick one", async () => {
  await inSession("trailing-short");

  expect(await fly("replies")).toBe(0);

  expect(err).toEqual([]);
  expect(JSON.parse(out.join("\n"))).toEqual([
    {
      ref: "00000000-0000-4000-8000-000000000006",
      timestamp: "2026-10-13T13:31:15+00:00",
      words: 395,
      long: true,
      preview: "Rollout plan",
    },
    { ref: "00000000-0000-4000-8000-000000000013", timestamp: "2026-10-13T13:32:00+00:00", words: 1, long: false, preview: "Done." },
    {
      ref: "00000000-0000-4000-8000-000000000018",
      timestamp: "2026-10-13T13:32:40+00:00",
      words: 13,
      long: false,
      preview: "Glad it helps. Let me know when you want to start stage one.",
    },
  ]);
  expect(device.uploads).toEqual([]);
});

test("fly reply --reply sends the named Reply, even one that is short and not the most recent", async () => {
  const { sessionId } = await inSession("trailing-short");

  expect(await fly("reply", "--reply", "00000000-0000-4000-8000-000000000013")).toBe(0);

  expect(err).toEqual([]);
  expect(renderer.requests.map((r) => r.markdown)).toEqual(["Done."]);
  expect(device.uploads.map((u) => u.name)).toEqual(["2026-10-13 13:32 Rollout plan for sending"]);
  const [dispatch] = await flyLog("--session", sessionId);
  expect(dispatch.replyRef).toBe("00000000-0000-4000-8000-000000000013");
});

test("fly reply --reply with an unknown reference says so and sends nothing", async () => {
  await inSession("trailing-short");

  expect(await fly("reply", "--reply", "no-such-reply")).toBe(1);

  expect(err).toEqual([
    "fly: this Session has no Reply with reference no-such-reply; run fly replies to list them; nothing was sent",
  ]);
  expect(device.uploads).toEqual([]);
  expect(await flyLog("--all")).toEqual([]);
});

test("Reply references stay the same as the Session goes on", async () => {
  const { transcript } = await inSession("trailing-short");
  await fly("replies");
  const before = JSON.parse(out.join("\n"));

  // The Session goes on with another prompt and Reply.
  const record = (fields: object) => JSON.stringify({ isSidechain: false, sessionId: "session-trailing-short", ...fields });
  await appendFile(
    transcript,
    [
      record({ type: "user", uuid: "later-prompt", timestamp: "2026-10-13T14:00:00.000Z", message: { role: "user", content: "One more thing." } }),
      record({
        type: "assistant",
        uuid: "later-reply",
        timestamp: "2026-10-13T14:00:10.000Z",
        message: { role: "assistant", content: [{ type: "text", text: "Sure." }] },
      }),
    ].join("\n") + "\n",
  );
  out = [];
  await fly("replies");
  const after = JSON.parse(out.join("\n"));

  expect(after.slice(0, before.length)).toEqual(before);
  expect(after.map((r: { ref: string }) => r.ref).slice(before.length)).toEqual(["later-reply"]);
  expect(await fly("reply", "--reply", before[0].ref)).toBe(0);
  expect(renderer.requests.map((r) => r.markdown)).toEqual([await expectedReply("trailing-short")]);
});

test("fly replies gives timestamps in local time with the UTC offset", async () => {
  await inSession("trailing-short");
  process.env.TZ = "America/New_York";
  try {
    expect(await fly("replies")).toBe(0);
  } finally {
    process.env.TZ = "UTC";
  }

  expect(JSON.parse(out.join("\n"))[0].timestamp).toBe("2026-10-13T09:31:15-04:00");
});

test("a Reply that already landed is refused, naming the earlier Dispatch and when it was sent", async () => {
  await inSession("trailing-short");
  expect(await fly("reply")).toBe(0);

  expect(await fly("reply")).toBe(1);

  expect(err).toEqual([
    'fly: this Reply already landed as "2026-10-13 13:31 Rollout plan for sending", sent 2026-10-14 08:00; ' +
      "pass --again to send another copy; nothing was sent",
  ]);
  expect(device.uploads).toHaveLength(1);
  expect(await flyLog("--all")).toHaveLength(1);
});

test("--again sends a Reply that already landed as a new Dispatch with its own ID", async () => {
  const { sessionId } = await inSession("trailing-short");
  expect(await fly("reply")).toBe(0);

  expect(await fly("reply", "--again")).toBe(0);

  expect(err).toEqual([]);
  const [first, second] = renderer.requests.map((r) => r.dispatchId);
  expect(second).not.toBe(first);
  const dispatches = await flyLog("--session", sessionId);
  expect(dispatches.map((d: { id: string }) => d.id)).toEqual([first, second]);
  expect(new Set(dispatches.map((d: { replyRef: string }) => d.replyRef)).size).toBe(1);
});
