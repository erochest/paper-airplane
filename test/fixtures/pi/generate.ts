// Writes the scrubbed Pi fixture Sessions in this directory, and the text each test expects next to
// them. The entries copy the shapes of real Pi 1.1.x session files (format version 3), trimmed of
// fields the reader never looks at. Run with: bun test/fixtures/pi/generate.ts
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = import.meta.dir;
const CWD = "/Users/someone/p/paper-airplane";

let counter = 0;
const entryId = () => (0xa0000000 + ++counter).toString(16);

const USAGE = { input: 10, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 20 };

/**
 * A Pi Session file. Entries form a tree through `parentId`; `leaf` is where the next entry goes,
 * and `at` moves it, as Pi's `/tree` does, so later entries start a new branch.
 */
class PiSession {
  entries: object[] = [];
  leaf: string | null = null;
  private clock: number;

  constructor(
    readonly sessionId: string,
    start: string,
  ) {
    this.clock = Date.parse(start);
    this.entries.push({ type: "session", version: 3, id: sessionId, timestamp: new Date(this.clock).toISOString(), cwd: CWD });
  }

  private entry(type: string, fields: object, seconds: number): string {
    this.clock += seconds * 1000;
    const id = entryId();
    this.entries.push({ type, id, parentId: this.leaf, timestamp: new Date(this.clock).toISOString(), ...fields });
    this.leaf = id;
    return id;
  }

  private message(message: object, seconds: number): string {
    return this.entry("message", { message: { ...message, timestamp: this.clock + seconds * 1000 } }, seconds);
  }

  /** Moves the leaf to `id`, so the next entry branches from there. */
  at(id: string | null) {
    this.leaf = id;
    return this;
  }

  /** Remembers the current leaf, to branch from later. */
  mark(into: (id: string) => void) {
    if (this.leaf !== null) into(this.leaf);
    return this;
  }

  start() {
    this.entry("model_change", { provider: "anthropic", modelId: "claude-opus-5-5" }, 0);
    this.entry("thinking_level_change", { thinkingLevel: "medium" }, 0);
    return this;
  }

  system() {
    this.message({ role: "system", content: "", sections: { preamble: "You are an expert coding assistant." }, toolsAdded: [] }, 1);
    return this;
  }

  prompt(text: string, seconds = 30) {
    this.message({ role: "user", content: [{ type: "text", text }] }, seconds);
    return this;
  }

  /** `/skill:name args` as Pi records it: the skill body, then the arguments as the user's request. */
  skill(name: string, args: string, seconds = 30) {
    const body = "Follow these steps. ".repeat(40);
    return this.prompt(
      `<skill name="${name}" location="/skills/${name}/SKILL.md">\nReferences are relative to /skills/${name}.\n\n${body}\n</skill>\n\n${args}`,
      seconds,
    );
  }

  private assistant(content: object[], stopReason: string, seconds: number) {
    this.message(
      { role: "assistant", content, api: "anthropic-messages", provider: "anthropic", model: "claude-opus-5-5", usage: USAGE, stopReason },
      seconds,
    );
  }

  text(text: string, seconds = 10) {
    this.assistant([{ type: "text", text }], "stop", seconds);
    return this;
  }

  /** An assistant message that thinks, says something and calls a tool, then the tool's result. */
  tool(command: string, output: string, { thinking, text }: { thinking?: string; text?: string } = {}, seconds = 5) {
    const id = `toolu_${String(counter).padStart(8, "0")}`;
    const content: object[] = [];
    if (thinking !== undefined) content.push({ type: "thinking", thinking, thinkingSignature: "c2NydWJiZWQ=" });
    if (text !== undefined) content.push({ type: "text", text });
    content.push({ type: "toolCall", id, name: "bash", arguments: { command } });
    this.assistant(content, "toolUse", seconds);
    this.message({ role: "toolResult", toolCallId: id, toolName: "bash", content: [{ type: "text", text: output }], isError: false }, 2);
    return this;
  }

  /** A command the user ran directly with `!`, which isn't a prompt. */
  bash(command: string, output: string, seconds = 20) {
    this.message({ role: "bashExecution", command, output, exitCode: 0, cancelled: false, truncated: false }, seconds);
    return this;
  }

  /** Context an extension injects, which isn't something the user typed. */
  customMessage(content: string, seconds = 1) {
    this.entry("custom_message", { customType: "reminders", content, display: true }, seconds);
    this.message({ role: "custom", customType: "reminders", content, display: false }, 0);
    return this;
  }

  compact(firstKeptEntryId: string, seconds = 5) {
    this.entry("compaction", { summary: "A rollout plan was written.", firstKeptEntryId, tokensBefore: 160000 }, seconds);
    return this;
  }

  /** What `/tree` writes when the user leaves a branch with a summary of it. */
  branchSummary(fromId: string, seconds = 5) {
    this.entry("branch_summary", { fromId, summary: "Explored a big-bang rollout and dropped it." }, seconds);
    return this;
  }

  label(targetId: string, label: string) {
    this.entry("label", { targetId, label }, 1);
    return this;
  }

  name(name: string) {
    this.entry("session_info", { name }, 1);
    return this;
  }

  extensionState() {
    this.entry("custom", { customType: "pi.virtual-model-state", data: { provider: "anthropic", modelId: "auto", state: {} } }, 0);
    return this;
  }

  write(name: string) {
    writeFileSync(join(DIR, `${name}.jsonl`), this.entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  }
}

function expected(name: string, text: string) {
  writeFileSync(join(DIR, `${name}.expected.md`), text);
}

const BIG_BANG_PLAN = `# Rollout plan: all at once

We switch every account to the new sending path on a single day, early in the week, so that the whole team is around for the days that follow. The old path is removed in the same release, which keeps the code simple and means there is only ever one way that a document reaches the tablet.

## Before the day

The new path runs in staging for two weeks beforehand, with the whole team using it for their own work. Anything that surprises someone is written down and either fixed or explained before the date is confirmed. Support gets a short note describing what changes for users, which is very little, and what to look for if something goes wrong, which is mostly a document that never arrives.

## On the day

We deploy in the morning and watch three numbers for the rest of the day: the error rate, the time a send takes from start to landing, and how often people send the same thing twice in a row. If any of them moves by more than a fifth from its baseline, we roll back the whole release, since there is no old path left to switch to without one.

## Afterwards

For the first week, someone on the team checks the numbers each morning and posts them where everyone can see. After a week without a rollback, the plan is finished, and the monitoring goes back to its usual thresholds and its usual owner.

## Risks

The biggest risk is that a problem only shows up at full volume, and with this plan full volume arrives on the first morning. A rollback is the only way out, and it takes a full deploy, so a bad morning could mean an hour or more of failed sends for every account at once, with nothing that support can do for users in the meantime.
`;

const STAGED_PLAN = `# Rollout plan: in stages

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

The biggest risk is that the second stage hides a problem that only shows up at full volume, such as a rate limit on the upstream service. To catch that early we will run a load test at twice the expected peak before stage three, against a staging copy of the upstream service.
`;

const LONGER_PLAN = `${STAGED_PLAN}
## Appendix: who does what

Each stage has one owner, who decides when its exit condition is met and who writes a short note when the stage ends. The owner of stage one is whoever is on call that week. The owner of stage two is the person who wrote the sending path, since they will recognise its failures fastest. The owner of stage three is the team lead, who also decides when the old path is finally deleted.
`;

const ON_IT = "I'll draft the plan now.";
const SHORT_DONE = "Done.";
const SHORT_THANKS = "Glad it helps. Let me know when you want to start stage one.";
const SHORT_ABANDONED = "Saved it to docs/rollout.md and opened a pull request.";

// A Session with abandoned branches. The user asked for a plan, didn't like it, went back with
// `/tree` and asked again; later asked for a longer plan, went back again, and carried on from the
// staged plan with two short Replies. The longer plan is the most recent Long Reply in the file,
// but it isn't on the current branch.
let beforeFirstPrompt = "";
let bigBangLeaf = "";
let afterStagedPlan = "";
let thanksLeaf = "";
new PiSession("01a12177-6743-708c-918d-8c497293cf87", "2026-10-13T13:30:00Z")
  .start()
  .system()
  .mark((id) => (beforeFirstPrompt = id))
  .prompt("Write me a rollout plan for the new sending path.")
  .tool("cat docs/sending.md", "# Sending\n\nThe new path uploads over the cloud.", { thinking: "Read the design first." })
  .text(BIG_BANG_PLAN, 40)
  .mark((id) => (bigBangLeaf = id))
  .at(beforeFirstPrompt)
  .branchSummary(bigBangLeaf)
  .prompt("Write me a rollout plan for the new sending path, in stages this time.")
  .tool("cat docs/sending.md", "# Sending\n\nThe new path uploads over the cloud.", { thinking: "Read the design first.", text: ON_IT })
  .text(STAGED_PLAN, 40)
  .mark((id) => (afterStagedPlan = id))
  .name("Rollout plan for sending")
  .prompt("Make it longer, with owners.")
  .text(LONGER_PLAN, 40)
  .at(afterStagedPlan)
  .label(afterStagedPlan, "staged-plan")
  .extensionState()
  .prompt("Thanks! Can you save it to docs/rollout.md?")
  .tool("cat > docs/rollout.md", "")
  .mark((id) => (thanksLeaf = id))
  .text(SHORT_ABANDONED)
  .at(thanksLeaf)
  .text(SHORT_DONE)
  .prompt("Great.")
  .text(SHORT_THANKS)
  // The agent's own call to `fly`, which Pi has written by the time `fly` reads the file.
  .tool("fly reply", "")
  .write("branched");
expected("branched-reply", `${ON_IT}\n\n${STAGED_PLAN}`);
expected(
  "branched-conversation",
  [
    "::: prompt\n**You**\n\nWrite me a rollout plan for the new sending path, in stages this time.\n:::",
    `${ON_IT}\n\n${STAGED_PLAN.trimEnd()}`,
    "::: prompt\n**You**\n\nThanks! Can you save it to docs/rollout.md?\n:::",
    SHORT_DONE,
    "::: prompt\n**You**\n\nGreat.\n:::",
    SHORT_THANKS,
  ].join("\n\n") + "\n",
);

// A Session with no name, started from a skill, with a Reply whose text is split across tool calls,
// injected context, a direct shell command, and a compaction partway through.
const BLOCK_A = "I'll start by reading the plan, since the review has to check every stage against its exit condition.";
const BLOCK_B = "## Review\n\nThe plan is sound. Stage two should name who watches the three numbers each day.";
const RISKS = "The main risk is a rate limit upstream that only shows at full volume.";
let firstKept = "";
new PiSession("01a12178-0000-7000-8000-000000000002", "2026-10-13T15:00:00Z")
  .start()
  .system()
  .skill("review", "the rollout plan")
  .tool("cat docs/rollout.md", STAGED_PLAN, { thinking: "Read the plan.", text: BLOCK_A })
  .customMessage("<system-reminder>The task tools haven't been used recently.</system-reminder>")
  .tool("bun test", "12 pass\n0 fail", { thinking: "Check the tests too." })
  .text(BLOCK_B)
  .bash("git status", "nothing to commit, working tree clean")
  .mark((id) => (firstKept = id))
  .compact(firstKept)
  .prompt("What's the *main* risk?")
  .text(RISKS)
  .write("untitled");
expected(
  "untitled-conversation",
  [
    "::: prompt\n**You**\n\n/skill:review the rollout plan\n:::",
    `${BLOCK_A}\n\n${BLOCK_B}`,
    "::: prompt\n**You**\n\nWhat's the *main* risk?\n:::",
    RISKS,
  ].join("\n\n") + "\n",
);

const unknown = new PiSession("01a12179-0000-7000-8000-000000000003", "2026-10-13T17:00:00Z")
  .start()
  .prompt("Write me a rollout plan.")
  .text(STAGED_PLAN)
  .name("Unknown shapes");
unknown.entries.push({ type: "hologram", id: entryId(), parentId: unknown.leaf, timestamp: "2026-10-13T17:01:00.000Z" });
unknown.write("unknown-entry");
