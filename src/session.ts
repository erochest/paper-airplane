import { readClaudeCodeSession } from "./claude-code.ts";
import { UserError } from "./errors.ts";
import { readPiSession } from "./pi.ts";

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
  /** The agent the Session runs in, e.g. `claude-code` or `pi`. */
  host: string;
  id: string;
  /** The host's own title for the Session, if it has one. */
  title: string | null;
  /** Every prompt and Reply, oldest first. */
  turns: Turn[];
}

/**
 * The Session `fly` is running inside, found from the host's environment variables. Each host sets
 * its own variable for the commands its agent runs; if both are set, one agent was started inside
 * the other and either could be running `fly`, so it refuses to guess.
 */
export async function currentSession(env: Record<string, string | undefined>, cwd: string): Promise<Session> {
  const claudeCode = env.CLAUDE_CODE_SESSION_ID;
  // Pi sets PI_SESSION_ID in every Session, but PI_SESSION_FILE only when the Session is saved.
  const piVariable = env.PI_SESSION_FILE ? "PI_SESSION_FILE" : env.PI_SESSION_ID ? "PI_SESSION_ID" : undefined;
  if (claudeCode && piVariable) {
    throw new UserError(
      `both CLAUDE_CODE_SESSION_ID and ${piVariable} are set, so fly can't tell whether it is in a ` +
        "Claude Code or a Pi Session; unset the one from the outer agent (e.g. env -u CLAUDE_CODE_SESSION_ID fly …)",
    );
  }
  if (env.PI_SESSION_FILE) return readPiSession(env.PI_SESSION_FILE);
  if (env.PI_SESSION_ID) {
    throw new UserError(
      "this Pi Session is ephemeral (PI_SESSION_ID is set but PI_SESSION_FILE isn't), so there is no session file to read",
    );
  }
  if (claudeCode) return readClaudeCodeSession(env, cwd, claudeCode);
  throw new UserError("not inside an agent Session (neither CLAUDE_CODE_SESSION_ID nor PI_SESSION_FILE is set)");
}
