import { escapeDivFences } from "./markdown.ts";
import type { Session } from "./session.ts";

/**
 * The Markdown for a Conversation Dispatch: every prompt and Reply in order. Each prompt is a
 * `prompt` div labelled "You", which the page template sets apart from the Replies around it.
 */
export function conversationMarkdown(session: Session): string {
  const blocks = session.turns.map((turn) => {
    const text = escapeDivFences(turn.text.trim());
    return turn.role === "user" ? `::: prompt\n**You**\n\n${text}\n:::` : text;
  });
  return `${blocks.join("\n\n")}\n`;
}
