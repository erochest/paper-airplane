import { readClaudeCodeSession } from "./claude-code.ts";
import { UserError } from "./errors.ts";

/** One prompt or Reply in a Session, in the form every host's transcript reader produces. */
export interface Turn {
  role: "user" | "assistant";
  /** The prompt as typed, or the Reply's prose and code, word for word. */
  text: string;
  /** When the turn was written; for a Reply, when its last text was written. */
  timestamp: Date;
  /** The host's stable reference to this turn. */
  ref: string;
}

export interface Session {
  /** The agent the Session runs in, e.g. `claude-code`. */
  host: string;
  id: string;
  /** The host's own title for the Session, if it has one. */
  title: string | null;
  /** Every prompt and Reply, oldest first. */
  turns: Turn[];
}

/** The Session `fly` is running inside, found from the host's environment variables. */
export async function currentSession(env: Record<string, string | undefined>, cwd: string): Promise<Session> {
  if (env.CLAUDE_CODE_SESSION_ID) return readClaudeCodeSession(env, cwd, env.CLAUDE_CODE_SESSION_ID);
  throw new UserError("not inside an agent Session (CLAUDE_CODE_SESSION_ID isn't set)");
}
