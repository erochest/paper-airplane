import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { UserError } from "./errors.ts";
import type { Session, Turn } from "./session.ts";

/** How the Flight Log names Claude Code as a Session's host. */
export const HOST = "claude-code";

// Assistant content blocks that never reach a Dispatch.
const SKIPPED_ASSISTANT_BLOCKS = new Set([
  "thinking",
  "redacted_thinking",
  "tool_use",
  "server_tool_use",
  "web_search_tool_result",
  "web_fetch_tool_result",
]);

/** A transcript record or content block, before its shape is checked. */
type Json = Record<string, unknown>;

/**
 * Reads a Claude Code Session from its transcript, `<config>/projects/<project>/<session>.jsonl`.
 *
 * The format is undocumented, so any record that carries a message in a shape this reader doesn't
 * know is an error rather than being dropped. Records without a message are bookkeeping (modes,
 * file history, costs and so on), which Claude Code adds to often, and are skipped.
 */
export async function readClaudeCodeSession(
  env: Record<string, string | undefined>,
  cwd: string,
  sessionId: string,
): Promise<Session> {
  const path = await transcriptPath(env, cwd, sessionId);
  const lines = (await readFile(path, "utf8")).split("\n");

  const turns: Turn[] = [];
  let reply: Turn | undefined;
  let aiTitle: string | null = null;
  let customTitle: string | null = null;

  lines.forEach((line, index) => {
    if (line.trim() === "") return;
    const where = `${path}:${index + 1}`;
    let record: Json;
    try {
      record = JSON.parse(line);
    } catch {
      // Claude Code may be partway through appending the last line while we read.
      if (index === lines.length - 1) return;
      throw new UserError(`${where}: transcript line isn't JSON`);
    }

    if (record.type === "ai-title" && typeof record.aiTitle === "string") aiTitle = record.aiTitle;
    if (record.type === "custom-title" && typeof record.customTitle === "string") customTitle = record.customTitle;
    if (!("message" in record) || record.isSidechain === true) return;

    const unrecognised = (what: string) =>
      new UserError(`${where}: unrecognised Claude Code transcript record (${what}); fly may need updating`);
    const timestamp = new Date(String(record.timestamp));
    const ref = String(record.uuid);
    if (typeof record.uuid !== "string" || Number.isNaN(timestamp.getTime())) {
      throw unrecognised(`${String(record.type)} record without a uuid and timestamp`);
    }
    const content = (record.message as Json | null)?.content;

    switch (record.type) {
      case "user": {
        // Injected material: skill bodies, system reminders, compaction summaries.
        if (record.isMeta === true || record.isCompactSummary === true || record.isVisibleInTranscriptOnly === true) {
          return;
        }
        let text: string;
        if (typeof content === "string") {
          text = content;
        } else if (Array.isArray(content)) {
          const types = content.map((block: Json) => block?.type);
          if (types.every((type) => type === "tool_result")) return;
          const unknown = types.find((type) => type !== "text" && type !== "image");
          if (unknown !== undefined) throw unrecognised(`user content block "${String(unknown)}"`);
          text = content
            .filter((block: Json) => block.type === "text")
            .map((block: Json) => String(block.text))
            .join("\n\n");
        } else {
          throw unrecognised("user message without content");
        }
        reply = undefined;
        turns.push({ role: "user", text, timestamp, ref });
        return;
      }
      case "assistant": {
        // Claude Code writes API errors into the transcript as synthetic assistant messages.
        if (record.isApiErrorMessage === true) return;
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
        return;
      }
      default:
        throw unrecognised(`"${String(record.type)}" record with a message`);
    }
  });

  return { host: HOST, id: sessionId, title: customTitle ?? aiTitle, turns };
}

/**
 * Claude Code keeps a project's Sessions in a directory named after the directory it was started
 * in. That is normally `cwd`; if the agent has moved elsewhere, every project is searched.
 */
async function transcriptPath(env: Record<string, string | undefined>, cwd: string, sessionId: string): Promise<string> {
  const projects = join(env.CLAUDE_CONFIG_DIR ?? join(env.HOME ?? homedir(), ".claude"), "projects");
  const file = `${sessionId}.jsonl`;
  const candidates = [join(projects, cwd.replace(/[^a-zA-Z0-9]/g, "-"), file)];
  try {
    for (const entry of await readdir(projects, { withFileTypes: true })) {
      if (entry.isDirectory()) candidates.push(join(projects, entry.name, file));
    }
  } catch {
    // No projects directory; the error below says where we looked.
  }
  for (const candidate of candidates) {
    if (await Bun.file(candidate).exists()) return candidate;
  }
  throw new UserError(`can't find the transcript for Claude Code Session ${sessionId} under ${projects}`);
}
