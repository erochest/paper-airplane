import { readFile } from "node:fs/promises";
import { UserError } from "./errors.ts";
import type { Session, Turn } from "./session.ts";

/** How the Flight Log names Pi as a Session's host. */
export const HOST = "pi";

// Entry types that carry nothing the user typed or the agent wrote as a Reply: settings, usage,
// extension state, bookmarks, and summaries Pi generates (compaction keeps the entries it
// summarises on the branch, so nothing is lost by leaving the summary out).
const SKIPPED_ENTRIES = new Set([
  "model_change",
  "thinking_level_change",
  "usage",
  "compaction",
  "context_edit",
  "branch_summary",
  "custom",
  "custom_message",
  "label",
  "session_info",
]);

// Message roles that aren't prompts or Replies: the system prompt, tool output, commands the user
// ran directly with `!`, extension-injected context, and Pi's summary messages.
const SKIPPED_ROLES = new Set(["system", "toolResult", "bashExecution", "custom", "branchSummary", "compactionSummary"]);

const SKIPPED_ASSISTANT_BLOCKS = new Set(["thinking", "toolCall"]);

const SKILL = /^<skill name="([^"]+)" location="[^"]+">\n[\s\S]*?\n<\/skill>(?:\n\n([\s\S]+))?$/;

/** A session entry or content block, before its shape is checked. */
type Json = Record<string, unknown>;

/** A session entry and the line of the file it was read from, for error messages. */
interface LocatedEntry {
  entry: Json;
  line: number;
}

/**
 * Reads a Pi Session from its session file. Entries form a tree through `parentId`; the current
 * branch is the path from the last entry back to the root, which is how Pi itself picks the leaf
 * when it loads a file. Entries on abandoned branches are never read.
 *
 * The format is documented but changes between versions, so an entry type, message role or
 * content block this reader doesn't know is an error rather than being dropped.
 */
export async function readPiSession(path: string): Promise<Session> {
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch {
    throw new UserError(`can't read the Pi Session file ${path} (from PI_SESSION_FILE)`);
  }
  const lines = source.split("\n");

  let header: Json | undefined;
  const entries = new Map<string, LocatedEntry>();
  let leaf: string | undefined;
  let title: string | null = null;

  lines.forEach((text, index) => {
    if (text.trim() === "") return;
    let entry: Json;
    try {
      entry = JSON.parse(text);
    } catch {
      // Pi may be partway through appending the last line while we read.
      if (index === lines.length - 1) return;
      throw new UserError(`${path}:${index + 1}: session line isn't JSON`);
    }
    if (entry.type === "session") {
      header ??= entry;
      return;
    }
    if (typeof entry.id !== "string") {
      throw new UserError(`${path}:${index + 1}: unrecognised Pi session entry (${String(entry.type)} entry without an id); fly may need updating`);
    }
    entries.set(entry.id, { entry, line: index + 1 });
    leaf = entry.id;
    // Pi names a Session from its latest `session_info`, on any branch; an empty name clears it.
    if (entry.type === "session_info") title = typeof entry.name === "string" && entry.name.trim() !== "" ? entry.name.trim() : null;
  });

  if (typeof header?.id !== "string") throw new UserError(`${path}: not a Pi Session file (no session header)`);

  const turns: Turn[] = [];
  let reply: Turn | undefined;
  for (const { entry, line } of branch(path, entries, leaf)) {
    const where = `${path}:${line}`;
    const unrecognised = (what: string) =>
      new UserError(`${where}: unrecognised Pi session entry (${what}); fly may need updating`);
    if (SKIPPED_ENTRIES.has(String(entry.type))) continue;
    if (entry.type !== "message") throw unrecognised(`"${String(entry.type)}" entry`);

    const timestamp = new Date(String(entry.timestamp));
    if (Number.isNaN(timestamp.getTime())) throw unrecognised("message without a timestamp");
    const ref = entry.id as string;
    const message = entry.message as Json | null;
    const role = message?.role;
    const content = message?.content;

    if (role === "user") {
      let text: string;
      if (typeof content === "string") {
        text = content;
      } else if (Array.isArray(content)) {
        const unknown = content.find((block: Json) => block?.type !== "text" && block?.type !== "image");
        if (unknown !== undefined) throw unrecognised(`user content block "${String(unknown?.type)}"`);
        text = content
          .filter((block: Json) => block.type === "text")
          .map((block: Json) => String(block.text))
          .join("\n\n");
      } else {
        throw unrecognised("user message without content");
      }
      reply = undefined;
      turns.push({ role: "user", text: skillCommand(text) ?? text, timestamp, ref });
    } else if (role === "assistant") {
      if (!Array.isArray(content)) throw unrecognised("assistant message without content blocks");
      for (const block of content as Json[]) {
        if (block?.type === "text" && typeof block.text === "string") {
          // Every text block until the next prompt belongs to the same Reply.
          if (reply === undefined) {
            reply = { role: "assistant", text: block.text, timestamp, ref };
            turns.push(reply);
          } else {
            reply.text += `\n\n${block.text}`;
            reply.timestamp = timestamp;
          }
        } else if (!SKIPPED_ASSISTANT_BLOCKS.has(String(block?.type))) {
          throw unrecognised(`assistant content block "${String(block?.type)}"`);
        }
      }
    } else if (!SKIPPED_ROLES.has(String(role))) {
      throw unrecognised(`message with role "${String(role)}"`);
    }
  }

  return { host: HOST, id: header.id, title, turns };
}

/** The entries on the current branch, root first, found by walking `parentId` back from `leaf`. */
function branch(file: string, entries: Map<string, LocatedEntry>, leaf: string | undefined): LocatedEntry[] {
  const onBranch: LocatedEntry[] = [];
  const seen = new Set<string>();
  for (let id = leaf; id !== undefined; ) {
    const found = entries.get(id);
    if (found === undefined || seen.has(id)) {
      throw new UserError(`${file}: Pi session tree is broken at entry ${id}; fly may need updating`);
    }
    seen.add(id);
    onBranch.push(found);
    const parent = found.entry.parentId;
    id = typeof parent === "string" ? parent : undefined;
  }
  return onBranch.reverse();
}

/**
 * A skill command as the user typed it (`/skill:review the plan`), from the skill body Pi expands it
 * into, or undefined when `text` isn't a skill command.
 */
function skillCommand(text: string): string | undefined {
  const match = SKILL.exec(text);
  if (match === null) return undefined;
  const args = match[2]?.trim() ?? "";
  return args === "" ? `/skill:${match[1]}` : `/skill:${match[1]} ${args}`;
}
