import { access, readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { UserError } from "./errors.ts";
import { runTool } from "./exec.ts";
import { FlightLog, type LogFilter } from "./flight-log.ts";
import { LONG_REPLY_WORDS, mostRecentLongReply } from "./selection.ts";
import { currentSession } from "./session.ts";

/** The `Paper Airplane` folder on the reMarkable where every Dispatch lands. */
export const HANGAR = "/Paper Airplane";

const FILE_USAGE = "usage: fly file <path.md> [--title <title>]";
const LOG_USAGE = "usage: fly log [--all | --session <id>]";
const REPLY_USAGE = "usage: fly reply [--title <title>]";
const USAGE = `${REPLY_USAGE}\n${FILE_USAGE}\n${LOG_USAGE}`;

export type DispatchKind = "Reply" | "Conversation" | "File";

/** What the small header on a Dispatch's first page shows. */
export interface PageHeader {
  title: string;
  /** `YYYY-MM-DD HH:MM`, matching the Dispatch's name. */
  timestamp: string;
  /** The repo or project the Dispatch came from. */
  project: string;
  kind: DispatchKind;
}

export interface RenderRequest {
  markdown: string;
  /** The Dispatch's full ID, which the renderer embeds in the PDF metadata. */
  dispatchId: string;
  header: PageHeader;
}

/** Typesets a Dispatch's Markdown as a PDF. */
export interface Renderer {
  render(request: RenderRequest): Promise<Uint8Array>;
}

/** Delivers PDFs to the reMarkable. */
export interface Transport {
  /** Creates the folder if it doesn't already exist. */
  ensureFolder(folder: string): Promise<void>;
  upload(folder: string, name: string, pdf: Uint8Array): Promise<void>;
}

export interface Deps {
  env: Record<string, string | undefined>;
  cwd: string;
  now: () => Date;
  transport: Transport;
  renderer: Renderer;
  stdout: (line: string) => void;
  stderr: (line: string) => void;
}

/** Runs the `fly` CLI with `argv` (excluding the executable) and returns the exit code. */
export async function run(argv: string[], deps: Deps): Promise<number> {
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case "reply":
        return await flyReply(rest, deps);
      case "file":
        return await flyFile(rest, deps);
      case "log":
        return await flyLog(rest, deps);
      default:
        deps.stderr(USAGE);
        return 2;
    }
  } catch (error) {
    if (!(error instanceof UserError)) throw error;
    deps.stderr(`fly: ${error.message}`);
    return 1;
  }
}

async function flyReply(argv: string[], deps: Deps): Promise<number> {
  let values: { title?: string };
  try {
    ({ values } = parseArgs({ args: argv, options: { title: { type: "string" } } }));
  } catch {
    deps.stderr(REPLY_USAGE);
    return 2;
  }

  const session = await currentSession(deps.env, deps.cwd);
  const reply = mostRecentLongReply(session);
  if (reply === undefined) {
    throw new UserError(`this Session has no Long Reply (more than ${LONG_REPLY_WORDS} words) to send; nothing was sent`);
  }
  // `--title` names this Dispatch only; the Session Title fixed at the first Dispatch stays.
  const title =
    values.title ??
    (await withFlightLog(deps, async (log) => log.sessionTitle(session.host, session.id))) ??
    session.title;
  if (title === null) {
    throw new UserError("this Session has no Session Title yet; run again with --title <title>");
  }

  return send(deps, {
    markdown: reply.text,
    title,
    kind: "Reply",
    writtenAt: reply.timestamp,
    source: { host: session.host, sessionId: session.id, replyRef: reply.ref },
  });
}

async function flyFile(argv: string[], deps: Deps): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { title: { type: "string" } },
    allowPositionals: true,
  });
  const [path] = positionals;
  if (path === undefined || positionals.length > 1) {
    deps.stderr(FILE_USAGE);
    return 2;
  }

  const fullPath = resolve(deps.cwd, path);
  let markdown: string;
  try {
    markdown = await readFile(fullPath, "utf8");
  } catch (error) {
    throw new UserError(`can't read ${fullPath}: ${(error as Error).message}`);
  }
  const title = values.title ?? firstHeading(markdown) ?? basename(fullPath, extname(fullPath));
  return send(deps, { markdown, title, kind: "File", source: null });
}

/** Where in a Session a Dispatch's content came from. */
interface SessionSource {
  host: string;
  sessionId: string;
  replyRef: string | null;
}

/** A Dispatch's content and provenance, before it is sent. */
interface DispatchContent {
  markdown: string;
  title: string;
  kind: DispatchKind;
  /**
   * When the content was written; the Dispatch is named for this time. Without one (a File
   * Dispatch), the Dispatch is named for when it was sent, so that is when it counts as written.
   */
  writtenAt?: Date;
  /** Where in a Session the content came from, or null for a File Dispatch. */
  source: SessionSource | null;
}

/** Renders a Dispatch, delivers it to the Hangar, records it in the Flight Log and reports it. */
async function send(deps: Deps, content: DispatchContent): Promise<number> {
  const { markdown, title, kind, source } = content;
  const sentAt = deps.now();
  const writtenAt = content.writtenAt ?? sentAt;
  const timestamp = formatTimestamp(writtenAt);
  // The transport names documents after local files, so path separators can't appear.
  const name = `${timestamp} ${title}`.replace(/[/\\]/g, "-");

  const dispatchId = crypto.randomUUID();
  const projectPath = await projectRoot(deps.cwd);
  const header: PageHeader = { title, timestamp, project: basename(projectPath), kind };
  const pdf = await deps.renderer.render({ markdown, dispatchId, header });
  await deps.transport.ensureFolder(HANGAR);
  await deps.transport.upload(HANGAR, name, pdf);
  await withFlightLog(deps, async (log) =>
    log.record({
      id: dispatchId,
      kind,
      host: source?.host ?? null,
      sessionId: source?.sessionId ?? null,
      replyRef: source?.replyRef ?? null,
      projectPath,
      gitRemote: await gitRemote(projectPath),
      sessionTitle: source === null ? null : title,
      name,
      writtenAt: writtenAt.toISOString(),
      sentAt: sentAt.toISOString(),
      state: "landed",
      pdfPath: null,
    }),
  );
  deps.stdout(JSON.stringify({ id: dispatchId, name, state: "landed" }));
  return 0;
}

async function flyLog(argv: string[], deps: Deps): Promise<number> {
  let values: { all?: boolean; session?: string };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: { all: { type: "boolean" }, session: { type: "string" } },
    }));
  } catch {
    deps.stderr(LOG_USAGE);
    return 2;
  }
  if (values.all && values.session !== undefined) {
    deps.stderr(LOG_USAGE);
    return 2;
  }

  // A Session ID is unique on its own, so `--session` looks across every project.
  const filter: LogFilter = values.session !== undefined
    ? { sessionId: values.session }
    : values.all
      ? {}
      : { projectPath: await projectRoot(deps.cwd) };
  const dispatches = await withFlightLog(deps, async (log) => log.dispatches(filter));
  deps.stdout(JSON.stringify(dispatches, null, 2));
  return 0;
}

/** Opens the Flight Log for the length of `fn`. */
async function withFlightLog<T>(deps: Deps, fn: (log: FlightLog) => Promise<T>): Promise<T> {
  const log = FlightLog.open(dataDir(deps.env));
  try {
    return await fn(log);
  } finally {
    log.close();
  }
}

/** Where `fly` keeps its own files: `FLY_DATA_DIR`, or the platform's user data directory. */
function dataDir(env: Deps["env"]): string {
  if (env.FLY_DATA_DIR) return env.FLY_DATA_DIR;
  const home = env.HOME ?? homedir();
  switch (process.platform) {
    case "darwin":
      return join(home, "Library", "Application Support", "paper-airplane");
    case "win32":
      return join(env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "paper-airplane");
    default:
      return join(env.XDG_DATA_HOME ?? join(home, ".local", "share"), "paper-airplane");
  }
}

/** The URL of the repo's `origin` remote, if it has one. */
async function gitRemote(projectPath: string): Promise<string | null> {
  try {
    return (await runTool(["git", "-C", projectPath, "remote", "get-url", "origin"])).trim() || null;
  } catch {
    // Not a git repo, no `origin`, or git isn't installed.
    return null;
  }
}

/** The text of the first ATX heading outside a fenced code block, if any. */
function firstHeading(markdown: string): string | undefined {
  let fence: string | undefined;
  for (const line of markdown.split(/\r?\n/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker !== undefined) {
      if (fence === undefined) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = undefined;
      continue;
    }
    if (fence !== undefined) continue;
    const heading = /^ {0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(line)?.[1];
    if (heading) return heading;
  }
  return undefined;
}

/**
 * The root of the git repo containing `cwd`, or `cwd` itself when it isn't in one. Symlinks are
 * resolved, so a project reached by different paths is still one project in the Flight Log.
 */
async function projectRoot(cwd: string): Promise<string> {
  const start = await realpath(cwd);
  for (let dir = start; ; dir = dirname(dir)) {
    // `.git` is a directory in a normal checkout and a file in a worktree.
    if (await exists(join(dir, ".git"))) return dir;
    if (dirname(dir) === dir) return start;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** `YYYY-MM-DD HH:MM` in local time. */
function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
