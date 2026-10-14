import type { Session, Turn } from "./session.ts";

/** A Reply with more words than this, counting prose and code, is a Long Reply. */
export const LONG_REPLY_WORDS = 300;

/** The most recent Long Reply in the Session, if there is one. */
export function mostRecentLongReply(session: Session): Turn | undefined {
  return session.turns.findLast((turn) => turn.role === "assistant" && wordCount(turn.text) > LONG_REPLY_WORDS);
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
