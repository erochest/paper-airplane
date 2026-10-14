import { firstHeading } from "./markdown.ts";
import type { Session, Turn } from "./session.ts";

/** A Reply with more words than this, counting prose and code, is a Long Reply. */
export const LONG_REPLY_WORDS = 300;

/** The longest preview `replySummaries` gives, in characters. */
const PREVIEW_LENGTH = 100;

/** What an agent needs to tell a Session's Replies apart and pick one for `--reply`. */
export interface ReplySummary {
  ref: string;
  /**
   * When the Reply's last text was written: ISO 8601 in local time with its UTC offset, so an
   * agent can match hints like "this morning" without knowing the user's timezone.
   */
  timestamp: string;
  words: number;
  long: boolean;
  /** The Reply's first heading, or else its first line. */
  preview: string;
}

/** The Session's Replies, oldest first. */
function replies(session: Session): Turn[] {
  return session.turns.filter((turn) => turn.role === "assistant");
}

/** The most recent Long Reply in the Session, if there is one. */
export function mostRecentLongReply(session: Session): Turn | undefined {
  return replies(session).findLast(isLongReply);
}

/** The Session's Reply with reference `ref`, if there is one. */
export function findReply(session: Session, ref: string): Turn | undefined {
  return replies(session).find((reply) => reply.ref === ref);
}

/** A summary of each of the Session's Replies, oldest first. */
export function replySummaries(session: Session): ReplySummary[] {
  return replies(session).map((reply) => ({
    ref: reply.ref,
    timestamp: localIsoString(reply.timestamp),
    words: wordCount(reply.text),
    long: isLongReply(reply),
    preview: preview(reply.text),
  }));
}

function isLongReply(reply: Turn): boolean {
  return wordCount(reply.text) > LONG_REPLY_WORDS;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function preview(text: string): string {
  const line = firstHeading(text) ?? text.split(/\r?\n/).find((l) => l.trim() !== "")?.trim() ?? "";
  return line.length > PREVIEW_LENGTH ? `${line.slice(0, PREVIEW_LENGTH - 1)}…` : line;
}

/** `YYYY-MM-DDTHH:MM:SS±HH:MM` in local time. */
function localIsoString(date: Date): string {
  const pad = (n: number) => String(Math.trunc(Math.abs(n))).padStart(2, "0");
  const offset = -date.getTimezoneOffset();
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${offset < 0 ? "-" : "+"}${pad(offset / 60)}:${pad(offset % 60)}`
  );
}
