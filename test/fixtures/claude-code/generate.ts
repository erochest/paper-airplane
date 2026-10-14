// Writes the scrubbed Claude Code fixture transcripts in this directory, and the Reply text each
// test expects next to them. The records copy the shapes of real Claude Code 2.1.x transcripts,
// trimmed of fields the reader never looks at. Run with: bun test/fixtures/claude-code/generate.ts
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = import.meta.dir;
const CWD = "/Users/someone/p/paper-airplane";
const VERSION = "2.1.296";

let counter = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

class Transcript {
  records: object[] = [];
  private parent: string | null = null;
  private clock: number;

  constructor(
    readonly sessionId: string,
    start: string,
  ) {
    this.clock = Date.parse(start);
  }

  private base(seconds: number) {
    this.clock += seconds * 1000;
    const id = uuid();
    const record = {
      parentUuid: this.parent,
      isSidechain: false,
      uuid: id,
      timestamp: new Date(this.clock).toISOString(),
      userType: "external",
      entrypoint: "cli",
      cwd: CWD,
      sessionId: this.sessionId,
      version: VERSION,
      gitBranch: "main",
    };
    this.parent = id;
    return record;
  }

  bookkeeping() {
    this.records.push(
      { type: "permission-mode", permissionMode: "default", sessionId: this.sessionId },
      { type: "mode", mode: "normal", sessionId: this.sessionId },
      { type: "file-history-snapshot", messageId: uuid(), snapshot: { trackedFileBackups: {} }, isSnapshotUpdate: false },
    );
    return this;
  }

  prompt(text: string, seconds = 30) {
    this.records.push({
      ...this.base(seconds),
      promptId: uuid(),
      type: "user",
      message: { role: "user", content: text },
      origin: { kind: "human" },
      turnOrigin: "human",
    });
    this.records.push({
      ...this.base(0),
      type: "attachment",
      attachment: { type: "environment", snapshot: { workingDirectory: CWD } },
    });
    return this;
  }

  /** Text injected by the harness, such as a skill body or a system reminder. */
  meta(text: string, seconds = 1) {
    this.records.push({
      ...this.base(seconds),
      type: "user",
      message: { role: "user", content: [{ type: "text", text }] },
      isMeta: true,
    });
    return this;
  }

  private assistant(block: object, seconds: number) {
    this.records.push({
      ...this.base(seconds),
      type: "assistant",
      requestId: `req_${counter}`,
      message: {
        id: `msg_${counter}`,
        model: "claude-opus-5-5",
        role: "assistant",
        type: "message",
        content: [block],
        stop_reason: null,
        usage: { input_tokens: 10, output_tokens: 10 },
      },
    });
  }

  thinking(text: string, seconds = 5) {
    this.assistant({ type: "thinking", thinking: text, signature: "c2NydWJiZWQ=" }, seconds);
    return this;
  }

  text(text: string, seconds = 10) {
    this.assistant({ type: "text", text }, seconds);
    return this;
  }

  tool(command: string, output: string, seconds = 3) {
    const id = `toolu_${String(counter).padStart(8, "0")}`;
    this.assistant({ type: "tool_use", id, name: "Bash", input: { command } }, seconds);
    this.records.push({
      ...this.base(2),
      type: "user",
      message: { role: "user", content: [{ tool_use_id: id, type: "tool_result", content: output, is_error: false }] },
      toolUseResult: { stdout: output, stderr: "", interrupted: false },
    });
    return this;
  }

  turnEnd() {
    this.records.push({ ...this.base(0), type: "system", subtype: "turn_duration", durationMs: 1000, isMeta: false });
    this.records.push({ type: "last-prompt", lastPrompt: "…", sessionId: this.sessionId });
    return this;
  }

  /** A slash command as Claude Code records it, followed by the skill body it injects. */
  command(name: string, args: string, seconds = 30) {
    this.records.push({
      ...this.base(seconds),
      promptId: uuid(),
      type: "user",
      message: {
        role: "user",
        content: `<command-message>${name}</command-message>\n<command-name>/${name}</command-name>\n<command-args>${args}</command-args>`,
      },
      origin: { kind: "human" },
      turnOrigin: "human",
    });
    return this.meta(`Base directory for this skill: /skills/${name}\n\n` + "Follow these steps. ".repeat(40));
  }

  /** A background task finishing, which Claude Code queues as a user record. */
  taskNotification(seconds = 60) {
    this.records.push({
      ...this.base(seconds),
      promptId: uuid(),
      type: "user",
      message: {
        role: "user",
        content: "<task-notification>\n<task-id>a1b2c3d4e5f6a7b8c</task-id>\n<status>completed</status>\n</task-notification>",
      },
      origin: { kind: "task-notification", producer: "session-task" },
      promptSource: "system",
      queueTranscriptOnly: true,
    });
    return this;
  }

  interrupted(seconds = 2) {
    this.records.push({
      ...this.base(seconds),
      type: "user",
      message: { role: "user", content: [{ type: "text", text: "[Request interrupted by user]" }] },
    });
    return this;
  }

  /**
   * Compaction: Claude Code keeps every earlier record in the transcript, then writes a boundary
   * and a summary that replace them in the agent's context.
   */
  compact(seconds = 5) {
    const last = (this.records.findLast((r) => "uuid" in r) as { uuid: string }).uuid;
    const boundary = { ...this.base(seconds), parentUuid: null };
    this.records.push({
      ...boundary,
      logicalParentUuid: last,
      type: "system",
      subtype: "compact_boundary",
      content: "Conversation compacted",
      isMeta: false,
      level: "info",
      compactMetadata: { trigger: "auto", preTokens: 167000 },
    });
    this.records.push({
      ...this.base(1),
      type: "user",
      message: {
        role: "user",
        content:
          "This session is being continued from a previous conversation that ran out of context. " +
          "The summary below covers the earlier portion of the conversation.\n\nSummary: a rollout plan was written.",
      },
      isVisibleInTranscriptOnly: true,
      isCompactSummary: true,
    });
    return this;
  }

  aiTitle(title: string) {
    this.records.push({ type: "ai-title", aiTitle: title, sessionId: this.sessionId });
    return this;
  }

  custom(record: object) {
    this.records.push(record);
    return this;
  }

  write(name: string) {
    writeFileSync(join(DIR, `${name}.jsonl`), this.records.map((r) => JSON.stringify(r)).join("\n") + "\n");
  }
}

function expected(name: string, text: string) {
  writeFileSync(join(DIR, `${name}.expected.md`), text);
}

const LONG_PLAN = `# Rollout plan

The rollout happens in three stages, and each stage has a clear exit condition so that nobody has to guess whether it is safe to move on.

## Stage one: internal users

We turn the feature on for the team first. Everyone uses it for a full working week, writes down anything that surprises them, and files a ticket for anything that blocks real work. The exit condition is a week with no new blocking tickets. During this stage the old path stays in place, and the switch between the two is a single setting that anyone on the team can flip back without a deploy.

## Stage two: a tenth of accounts

Next we enable it for one account in ten, chosen at random but stable, so the same accounts stay in the group from day to day. We watch three numbers: error rate, the time a send takes from start to landing, and how often people send the same thing twice in a row, which usually means the first attempt looked like it failed. If any of the three moves by more than a fifth from its baseline, we stop and look before going further.

\`\`\`ts
const inRollout = (accountId: string) => hash(accountId) % 10 === 0;
\`\`\`

## Stage three: everyone

Finally we enable it for all accounts and leave the old path in the code for one more release, switched off but available. Once that release has been out for two weeks without a rollback, we delete the old path and the setting that chose between them, along with the tests that only existed to cover the switch.

## Risks

The biggest risk is that the second stage hides a problem that only shows up at full volume, such as a rate limit on the upstream service. To catch that early we will run a load test at twice the expected peak before stage three, against a staging copy of the upstream service, and we will keep the person who owns that service informed of the dates so that they can watch their own dashboards while it runs.

## Open questions

Do we need a way for a single account to opt out during stage two? I think not, since the switch is global and fast, but it is worth a quick check with support before we begin.
`;

const SHORT_DONE = "Done.";
const SHORT_THANKS = "Glad it helps. Let me know when you want to start stage one.";

new Transcript("11111111-1111-4111-8111-111111111111", "2026-10-13T13:30:00Z")
  .bookkeeping()
  .prompt("Write me a rollout plan for the new sending path.")
  .thinking("The user wants a staged plan with exit conditions.")
  .text(LONG_PLAN, 40)
  .turnEnd()
  .aiTitle("Rollout plan for sending")
  .prompt("Thanks! Can you save it to docs/rollout.md?")
  .tool("cat > docs/rollout.md", "")
  .text(SHORT_DONE)
  .turnEnd()
  .prompt("Great.")
  .text(SHORT_THANKS)
  .turnEnd()
  .aiTitle("Rollout plan for sending")
  .write("trailing-short");
expected("trailing-short", LONG_PLAN);

// One Reply whose text blocks are separated by thinking, tool calls and an injected skill body.
// No block is a Long Reply by itself; together they are.
const BLOCK_A = `I'll start by looking at how the Flight Log is opened today, since the new command has to share it with \`fly file\` and the two must not step on each other when several Sessions send at once. The relevant code is the \`withFlightLog\` helper, which opens the database, runs one function and closes it again, so each command holds the database only for as long as it needs to. That keeps the window for contention small, and SQLite's busy timeout covers the rest.`;
const BLOCK_B = `The helper looks like this, and it is the only place that opens the database:

\`\`\`ts
async function withFlightLog<T>(deps: Deps, fn: (log: FlightLog) => Promise<T>): Promise<T> {
  const log = FlightLog.open(dataDir(deps.env));
  try {
    return await fn(log);
  } finally {
    log.close();
  }
}
\`\`\`

Because it always closes the log, even when the function throws, a failed upload can't leave the database locked for the next process. That matters for retries, which will often run straight after a failure, perhaps from a different Session that has been waiting on the same lock for a few seconds.`;
const BLOCK_C = `So the plan for the new command is simple. It reads the transcript, picks the Reply, works out the Session Title and then hands everything to the same sending path that \`fly file\` uses. The Flight Log gains nothing new except the Session fields, which were already in the schema from the previous ticket, so no migration is needed. I'll write the first failing test now, starting with the most common case: a Session whose last Reply is long enough to send on its own, and whose host has already given it a title that we can use without asking the user for one. After that I'll cover the case where the user has to supply a title themselves, and then the error paths, one test at a time, so that each new behaviour is driven by a test that failed first.`;

new Transcript("22222222-2222-4222-8222-222222222222", "2026-10-13T15:00:00Z")
  .bookkeeping()
  .prompt("/implement ticket 04")
  .meta("Base directory for this skill: /skills/implement\n\n" + "Implement the work described by the user. ".repeat(80))
  .thinking("Let me look at the Flight Log helper first.")
  .text(BLOCK_A)
  .tool("grep -n withFlightLog src/core.ts", "128:async function withFlightLog<T>(")
  .thinking("Now show the helper.")
  .text(BLOCK_B)
  .tool("bun test", "12 pass\n0 fail")
  .meta("<system-reminder>The task tools haven't been used recently.</system-reminder>")
  .text(BLOCK_C)
  .turnEnd()
  .write("interleaved-tools");
expected("interleaved-tools", [BLOCK_A, BLOCK_B, BLOCK_C].join("\n\n"));

new Transcript("33333333-3333-4333-8333-333333333333", "2026-10-13T16:00:00Z")
  .prompt("Hello")
  .text(SHORT_THANKS)
  .turnEnd()
  .aiTitle("Greeting")
  .write("no-long-reply");

const unknown = new Transcript("44444444-4444-4444-8444-444444444444", "2026-10-13T17:00:00Z")
  .prompt("Write me a rollout plan.")
  .text(LONG_PLAN);
unknown.records.push({
  ...(unknown.records.at(-1) as object),
  uuid: uuid(),
  message: { role: "assistant", type: "message", content: [{ type: "hologram", data: "…" }] },
});
unknown.aiTitle("Unknown shapes").write("unknown-block");

// A long Session compacted partway through. The early turns are no longer in the agent's context
// but are still in the transcript, so a Conversation Dispatch includes them.
const RISKS = "The main risk is a rate limit upstream that only shows at full volume.";
const REVIEW = `## Review

The plan is sound. Stage two should name who watches the three numbers each day, and the load test needs a date before stage three can start.`;
const BACKGROUND = "The background check finished: every link in the plan resolves.";
new Transcript("55555555-5555-4555-8555-555555555555", "2026-10-13T09:00:00Z")
  .bookkeeping()
  .prompt("Write me a rollout plan for the new sending path.")
  .thinking("The user wants a staged plan with exit conditions.")
  .text(LONG_PLAN, 40)
  .turnEnd()
  .aiTitle("Rollout plan for sending")
  .prompt("What's the *main* risk? [one line]")
  .tool("grep -n Risks docs/rollout.md", "21:## Risks")
  .text(RISKS)
  .turnEnd()
  .compact()
  .command("review", "the plan")
  .thinking("Review the plan against the exit conditions.")
  .text(REVIEW)
  .turnEnd()
  .taskNotification()
  .text(BACKGROUND)
  .turnEnd()
  .prompt("Start stage one.")
  .tool("git checkout -b stage-one", "")
  .interrupted()
  .prompt("Actually, wait until Monday.\nThanks.")
  .text(SHORT_DONE)
  .turnEnd()
  .write("compacted");
expected(
  "compacted",
  [
    "::: prompt\n**You**\n\nWrite me a rollout plan for the new sending path.\n:::",
    LONG_PLAN.trimEnd(),
    "::: prompt\n**You**\n\nWhat's the *main* risk? [one line]\n:::",
    RISKS,
    "::: prompt\n**You**\n\n/review the plan\n:::",
    REVIEW,
    BACKGROUND,
    "::: prompt\n**You**\n\nStart stage one.\n:::",
    "::: prompt\n**You**\n\nActually, wait until Monday.\nThanks.\n:::",
    SHORT_DONE,
  ].join("\n\n") + "\n",
);
