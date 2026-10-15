import { Database } from "bun:sqlite";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { appendFile, copyFile, mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/core.ts";
import { FakeDevice, FakeRenderer, FakeToolchain } from "./fakes.ts";

const FIXTURES = join(import.meta.dir, "fixtures", "claude-code");

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

/** Runs `fly log` with `args` and returns the parsed records. */
async function flyLog(...args: string[]) {
  out = [];
  expect(await fly("log", ...args)).toBe(0);
  return JSON.parse(out.join("\n"));
}

test("fly conversation sends every prompt and Reply in order, including turns from before compaction", async () => {
  await inSession("compacted");

  const code = await fly("conversation");

  expect(err).toEqual([]);
  expect(code).toBe(0);
  expect(renderer.requests.map((r) => r.markdown)).toEqual([
    await readFile(join(FIXTURES, "compacted.expected.md"), "utf8"),
  ]);
  const [markdown] = renderer.requests.map((r) => r.markdown);
  for (const leftOut of [
    "The user wants a staged plan",
    "grep -n Risks",
    "21:## Risks",
    "Base directory for this skill",
    "This session is being continued",
    "task-notification",
    "Request interrupted",
    "<command-name>",
  ]) {
    expect(markdown).not.toContain(leftOut);
  }
});

test("a Conversation Dispatch is named for when it was sent, ending in (conversation)", async () => {
  await inSession("compacted");
  now = new Date("2026-10-14T08:07:30Z");

  expect(await fly("conversation")).toBe(0);

  expect(device.uploads.map((u) => [u.folder, u.name])).toEqual([
    ["/Paper Airplane", "2026-10-14 08:07 Rollout plan for sending (conversation)"],
  ]);
  expect(renderer.requests[0]?.header).toEqual({
    title: "Rollout plan for sending",
    timestamp: "2026-10-14 08:07",
    project: "paper-airplane",
    kind: "Conversation",
  });
  expect(out.map((line) => JSON.parse(line))).toEqual([
    {
      id: renderer.requests[0]?.dispatchId,
      name: "2026-10-14 08:07 Rollout plan for sending (conversation)",
      state: "landed",
    },
  ]);
});

test("a Conversation Dispatch uses the Session Title fixed by an earlier Reply Dispatch", async () => {
  await inSession("compacted");
  expect(await fly("reply", "--title", "Sending rollout")).toBe(0);

  expect(await fly("conversation")).toBe(0);

  expect(device.uploads.map((u) => u.name)).toEqual([
    "2026-10-13 09:01 Sending rollout",
    "2026-10-14 08:00 Sending rollout (conversation)",
  ]);
});

test("without --title, a Session with no Session Title is refused so the agent can propose one", async () => {
  await inSession("interleaved-tools");

  expect(await fly("conversation")).toBe(1);

  expect(err).toEqual(["fly: this Session has no Session Title yet; run again with --title <title>"]);
  expect(device.uploads).toEqual([]);

  err = [];
  expect(await fly("conversation", "--title", "Ticket 04")).toBe(0);
  expect(err).toEqual([]);
  expect(device.uploads.map((u) => u.name)).toEqual(["2026-10-14 08:00 Ticket 04 (conversation)"]);
});

test("a Conversation Dispatch is never refused as a resend, and supersedes the Session's previous one", async () => {
  const { sessionId } = await inSession("compacted");
  expect(await fly("conversation")).toBe(0);
  expect(await fly("reply")).toBe(0);
  now = new Date("2026-10-14T09:30:00Z");

  expect(await fly("conversation")).toBe(0);
  expect(await fly("conversation")).toBe(0);

  expect(err).toEqual([]);
  const [first, reply, second, third] = renderer.requests.map((r) => r.dispatchId);
  expect(device.uploads.map((u) => u.name)).toEqual([
    "2026-10-14 08:00 Rollout plan for sending (conversation)",
    "2026-10-13 09:01 Rollout plan for sending",
    "2026-10-14 09:30 Rollout plan for sending (conversation)",
    "2026-10-14 09:30 Rollout plan for sending (conversation) (2)",
  ]);
  const dispatches = await flyLog("--session", sessionId);
  expect(dispatches.map((d: { id: string; kind: string; replyRef: string | null; supersedes: string | null }) => [
    d.id,
    d.kind,
    d.replyRef,
    d.supersedes,
  ])).toEqual([
    [first, "Conversation", null, null],
    [reply, "Reply", "00000000-0000-4000-8000-000000000051", null],
    [second, "Conversation", null, first],
    [third, "Conversation", null, second],
  ]);
});

test("a Conversation Dispatch supersedes only one from its own Session", async () => {
  await inSession("compacted", "first-session");
  expect(await fly("conversation")).toBe(0);
  const { sessionId: otherSession } = await inSession("compacted", "second-session");

  expect(await fly("conversation")).toBe(0);

  const [dispatch] = await flyLog("--session", otherSession);
  expect(dispatch.supersedes).toBeNull();
});

test("a Flight Log from before Conversation Dispatches is upgraded in place", async () => {
  // The schema as it was before the supersedes link, with one Reply Dispatch in it.
  await mkdir(join(dir, "data"), { recursive: true });
  const db = new Database(join(dir, "data", "flight-log.sqlite"), { create: true });
  db.run(`
    CREATE TABLE sessions (host TEXT NOT NULL, session_id TEXT NOT NULL, title TEXT NOT NULL, PRIMARY KEY (host, session_id));
    CREATE TABLE dispatches (
      seq INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, host TEXT, session_id TEXT,
      reply_ref TEXT, session_title TEXT, project_path TEXT NOT NULL, git_remote TEXT, name TEXT NOT NULL,
      written_at TEXT NOT NULL, sent_at TEXT NOT NULL, state TEXT NOT NULL, pdf_path TEXT
    );
    INSERT INTO dispatches (id, kind, project_path, name, written_at, sent_at, state)
      VALUES ('old-dispatch', 'File', '/old/project', '2026-10-01 10:00 Old', '2026-10-01T10:00:00.000Z', '2026-10-01T10:00:00.000Z', 'landed');
  `);
  db.close();
  await inSession("compacted");

  expect(await fly("conversation")).toBe(0);
  expect(await fly("conversation")).toBe(0);

  expect(err).toEqual([]);
  const dispatches = await flyLog("--all");
  expect(dispatches.map((d: { id: string; supersedes: string | null }) => [d.id, d.supersedes])).toEqual([
    ["old-dispatch", null],
    [renderer.requests[0]?.dispatchId, null],
    [renderer.requests[1]?.dispatchId, renderer.requests[0]?.dispatchId],
  ]);
});

test("a user record from an origin fly doesn't know is a loud error, not sent as a prompt", async () => {
  const { transcript } = await inSession("compacted");
  await appendFile(
    transcript,
    JSON.stringify({
      type: "user",
      isSidechain: false,
      uuid: "from-a-peer",
      timestamp: "2026-10-13T10:00:00.000Z",
      message: { role: "user", content: "A message from another agent." },
      origin: { kind: "peer-agent" },
    }) + "\n",
  );

  expect(await fly("conversation")).toBe(1);

  expect(err).toHaveLength(1);
  expect(err[0]).toMatch(/^fly: .*session-compacted\.jsonl:40: unrecognised Claude Code transcript record/);
  expect(err[0]).toContain('user record from origin "peer-agent"');
  expect(device.uploads).toEqual([]);
});

test.skipIf(!Bun.which("pandoc"))("turn text can't open or close a prompt block of its own", async () => {
  const { transcript } = await inSession("no-long-reply");
  const record = (fields: object) => JSON.stringify({ isSidechain: false, timestamp: "2026-10-13T16:10:00.000Z", ...fields });
  await appendFile(
    transcript,
    [
      record({ type: "user", uuid: "tricky-prompt", message: { role: "user", content: "before\n:::\nafter" } }),
      record({
        type: "assistant",
        uuid: "tricky-reply",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "::: prompt\nNot a prompt.\n:::\n\n```\n:::\n```" }],
        },
      }),
    ].join("\n") + "\n",
  );

  expect(await fly("conversation")).toBe(0);

  // Parse the Markdown as the renderer does, and list each prompt block's text.
  const markdown = renderer.requests[0]?.markdown ?? "";
  const proc = Bun.spawnSync(["pandoc", "--from=gfm+fenced_divs", "--to=json"], { stdin: Buffer.from(markdown) });
  const blocks: { t: string; c: unknown }[] = JSON.parse(proc.stdout.toString()).blocks;
  const prompts = blocks
    .filter((b) => b.t === "Div" && (b.c as [[string, string[]]])[0][1].includes("prompt"))
    .map((b) => JSON.stringify(b.c));
  expect(prompts).toHaveLength(2);
  expect(prompts[0]).toContain("Hello");
  expect(prompts[1]).toContain("before");
  expect(prompts[1]).toContain("after");
  expect(prompts.join()).not.toContain("Not a prompt");
  expect(blocks.some((b) => b.t === "CodeBlock" && (b.c as [unknown, string])[1] === ":::")).toBe(true);
});
