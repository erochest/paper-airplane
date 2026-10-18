import { access, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { NotLoggedInError, UserError } from "./errors.ts";
import { runTool } from "./exec.ts";
import { FlightLog, type LogFilter } from "./flight-log.ts";
import { conversationMarkdown } from "./conversation.ts";
import { firstHeading } from "./markdown.ts";
import { LONG_REPLY_WORDS, findReply, mostRecentLongReply, replySummaries } from "./selection.ts";
import { currentSession } from "./session.ts";

/** The `Paper Airplane` folder on the reMarkable where every Dispatch lands. */
export const HANGAR = "/Paper Airplane";

const FILE_USAGE = "usage: fly file <path.md> [--title <title>]";
const LOG_USAGE = "usage: fly log [--all | --session <id> | --grounded]";
const REPLY_USAGE = "usage: fly reply [--reply <ref>] [--title <title>] [--again]";
const REPLIES_USAGE = "usage: fly replies";
const CONVERSATION_USAGE = "usage: fly conversation [--title <title>]";
const RETRY_USAGE = "usage: fly retry";
const DOCTOR_USAGE = "usage: fly doctor";
const USAGE = [REPLY_USAGE, REPLIES_USAGE, CONVERSATION_USAGE, FILE_USAGE, RETRY_USAGE, LOG_USAGE, DOCTOR_USAGE].join(
  "\n",
);

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
  /** The names of the documents (not folders) directly in `folder`. */
  documentNames(folder: string): Promise<string[]>;
  /** Uploads a new document; `name` must not already be taken in `folder`. */
  upload(folder: string, name: string, pdf: Uint8Array): Promise<void>;
  /** Succeeds when the transport is logged in; throws `NotLoggedInError` when it isn't. */
  checkLogin(): Promise<void>;
}

/** The external tools `fly` depends on. */
export type Tool = "pandoc" | "typst" | "rmapi";

/** Finds out which external tools are installed. */
export interface Toolchain {
  /** The installed version of `tool`, or null when it isn't installed. */
  version(tool: Tool): Promise<string | null>;
}

export interface Deps {
  env: Record<string, string | undefined>;
  cwd: string;
  now: () => Date;
  transport: Transport;
  renderer: Renderer;
  toolchain: Toolchain;
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
      case "replies":
        return await flyReplies(rest, deps);
      case "conversation":
        return await flyConversation(rest, deps);
      case "file":
        return await flyFile(rest, deps);
      case "retry":
        return await flyRetry(rest, deps);
      case "log":
        return await flyLog(rest, deps);
      case "doctor":
        return await flyDoctor(rest, deps);
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
  let values: { reply?: string; title?: string; again?: boolean };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: { reply: { type: "string" }, title: { type: "string" }, again: { type: "boolean" } },
    }));
  } catch {
    deps.stderr(REPLY_USAGE);
    return 2;
  }

  const session = await currentSession(deps.env, deps.cwd);
  const reply = values.reply !== undefined ? findReply(session, values.reply) : mostRecentLongReply(session);
  if (reply === undefined) {
    throw new UserError(
      values.reply !== undefined
        ? `this Session has no Reply with reference ${values.reply}; run fly replies to list them; nothing was sent`
        : `this Session has no Long Reply (more than ${LONG_REPLY_WORDS} words) to send; nothing was sent`,
    );
  }
  const { landed, grounded, fixedTitle } = await withFlightLog(deps, async (log) => ({
    landed: log.replyDispatch(session.host, session.id, reply.ref, "landed"),
    grounded: log.replyDispatch(session.host, session.id, reply.ref, "grounded"),
    fixedTitle: log.sessionTitle(session.host, session.id),
  }));
  if (landed !== null && !values.again) {
    throw new UserError(
      `this Reply already landed as "${landed.name}", sent ${formatTimestamp(new Date(landed.sentAt)).replace(/:/g, "-")}; ` +
        "pass --again to send another copy; nothing was sent",
    );
  }
  // Sending it again would leave two copies once `fly retry` sends the Grounded one.
  if (grounded !== null && !values.again) {
    throw new UserError(
      `this Reply is already Grounded as "${grounded.name}"; run fly retry to send it, ` +
        "or pass --again to send another copy; nothing was sent",
    );
  }
  return send(deps, {
    markdown: reply.text,
    title: dispatchTitle(values.title, fixedTitle, session.title),
    kind: "Reply",
    writtenAt: reply.timestamp,
    source: { host: session.host, sessionId: session.id, replyRef: reply.ref },
  });
}

/**
 * The title for a Dispatch from a Session. `--title` names this Dispatch only; the Session Title
 * fixed at the first Dispatch stays.
 */
function dispatchTitle(flag: string | undefined, fixedTitle: string | null, hostTitle: string | null): string {
  const title = flag ?? fixedTitle ?? hostTitle;
  if (title === null) {
    throw new UserError("this Session has no Session Title yet; run again with --title <title>");
  }
  return title;
}

async function flyConversation(argv: string[], deps: Deps): Promise<number> {
  let values: { title?: string };
  try {
    ({ values } = parseArgs({ args: argv, options: { title: { type: "string" } } }));
  } catch {
    deps.stderr(CONVERSATION_USAGE);
    return 2;
  }

  const session = await currentSession(deps.env, deps.cwd);
  if (session.turns.length === 0) throw new UserError("this Session has no prompts or Replies yet; nothing was sent");
  const fixedTitle = await withFlightLog(deps, async (log) => log.sessionTitle(session.host, session.id));
  return send(deps, {
    markdown: conversationMarkdown(session),
    title: dispatchTitle(values.title, fixedTitle, session.title),
    kind: "Conversation",
    source: { host: session.host, sessionId: session.id, replyRef: null },
  });
}

async function flyReplies(argv: string[], deps: Deps): Promise<number> {
  try {
    parseArgs({ args: argv, options: {} });
  } catch {
    deps.stderr(REPLIES_USAGE);
    return 2;
  }
  const session = await currentSession(deps.env, deps.cwd);
  deps.stdout(JSON.stringify(replySummaries(session), null, 2));
  return 0;
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

/**
 * Renders a Dispatch, delivers it to the Hangar, records it in the Flight Log and reports it. If
 * delivery fails, the PDF is kept and the Dispatch is recorded as Grounded, with its failed attempt
 * as its sent-at time until it lands.
 */
async function send(deps: Deps, content: DispatchContent): Promise<number> {
  const { markdown, title, kind, source } = content;
  const sentAt = deps.now();
  const writtenAt = content.writtenAt ?? sentAt;
  let timestamp = formatTimestamp(writtenAt);
  // Colons in filenames aren't valid on Windows, so replace them with hyphens.
  timestamp = timestamp.replace(/:/g, "-");
  // The transport names documents after local files, so path separators can't appear.
  // A Conversation Dispatch's suffix tells it apart from Reply Dispatches from the same Session.
  const suffix = kind === "Conversation" ? " (conversation)" : "";
  const baseName = `${timestamp} ${title}${suffix}`.replace(/[\/\\]/g, "-");

  const dispatchId = crypto.randomUUID();
  const projectPath = await projectRoot(deps.cwd);
  const header: PageHeader = { title, timestamp, project: basename(projectPath), kind };
  const pdf = await deps.renderer.render({ markdown, dispatchId, header });

  let name = baseName;
  let grounded: { error: unknown; pdfPath: string } | null = null;
  try {
    name = await deliver(deps.transport, baseName, pdf);
  } catch (error) {
    // Nothing the user asked to send is lost: the PDF is kept for `fly retry` or a manual upload.
    const pdfPath = groundedPdfPath(deps.env, dispatchId);
    await mkdir(dirname(pdfPath), { recursive: true });
    await writeFile(pdfPath, pdf);
    grounded = { error, pdfPath };
  }

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
      state: grounded === null ? "landed" : "grounded",
      pdfPath: grounded?.pdfPath ?? null,
    }),
  );
  if (grounded === null) return reportLanded(deps, dispatchId, name);
  return reportGrounded(deps, dispatchId, name, grounded.pdfPath, grounded.error);
}

/**
 * Resends every Grounded Dispatch's kept PDF, from any project, under its original name and ID.
 * A name taken in the Hangar since is resolved with a counter, as for a first send. Dispatches that
 * fail again stay Grounded. Two `fly retry` processes at once could both send the same Dispatch;
 * that is left open.
 */
async function flyRetry(argv: string[], deps: Deps): Promise<number> {
  try {
    parseArgs({ args: argv, options: {} });
  } catch {
    deps.stderr(RETRY_USAGE);
    return 2;
  }

  const grounded = await withFlightLog(deps, async (log) => log.dispatches({ state: "grounded" }));
  if (grounded.length === 0) {
    deps.stderr("fly: no Dispatches are Grounded; nothing was sent");
    return 0;
  }
  let code = 0;
  for (const { id, name, pdfPath } of grounded) {
    // Every Grounded Dispatch is recorded with the path its PDF was kept at.
    const path = pdfPath ?? "";
    let pdf: Uint8Array;
    try {
      pdf = await readFile(path);
    } catch (error) {
      deps.stderr(
        `fly: the kept PDF for "${name}" can't be read at ${path} (${(error as Error).message}); ` +
          "it stays Grounded",
      );
      code = 1;
      continue;
    }
    let landedName: string;
    try {
      landedName = await deliver(deps.transport, name, pdf);
    } catch (error) {
      code = reportGrounded(deps, id, name, path, error);
      continue;
    }
    const sentAt = deps.now().toISOString();
    await withFlightLog(deps, async (log) => log.land(id, landedName, sentAt));
    await rm(path, { force: true });
    reportLanded(deps, id, landedName);
  }
  return code;
}

/**
 * Uploads `pdf` to the Hangar under `baseName`, or under a counter-suffixed name if that is taken,
 * and returns the name used.
 */
async function deliver(transport: Transport, baseName: string, pdf: Uint8Array): Promise<string> {
  await transport.ensureFolder(HANGAR);
  const name = freeName(baseName, new Set(await transport.documentNames(HANGAR)));
  await transport.upload(HANGAR, name, pdf);
  return name;
}

/** Prints the machine-readable result for a Dispatch that reached the Hangar; returns exit code 0. */
function reportLanded(deps: Deps, id: string, name: string): number {
  deps.stdout(JSON.stringify({ id, name, state: "landed" }));
  return 0;
}

/**
 * Prints the machine-readable result for a Dispatch Grounded by the upload `error`, and why it was
 * grounded and where its PDF is kept; returns exit code 1. A missing login is for the user to fix,
 * so they are pointed to `fly doctor` first.
 */
function reportGrounded(deps: Deps, id: string, name: string, pdfPath: string, error: unknown): number {
  deps.stdout(JSON.stringify({ id, name, state: "grounded", pdfPath }));
  const [reason, next] = error instanceof NotLoggedInError
    ? [
        `the upload failed because ${NOT_LOGGED_IN}`,
        "run fly doctor to fix the login, then fly retry to send it again",
      ]
    : [`the upload failed (${(error as Error).message})`, "run fly retry to send it again"];
  deps.stderr(`fly: ${reason}; the Dispatch is Grounded and its PDF is kept at ${pdfPath}; ${next}`);
  return 1;
}

/**
 * `baseName`, or the first of `baseName (2)`, `baseName (3)`, … not in `taken`. Collisions are
 * resolved here rather than left to the transport, so no Dispatch ever replaces another. Two `fly`
 * processes sending the same name at the same moment can still both pick it; that is left open.
 */
function freeName(baseName: string, taken: Set<string>): string {
  if (!taken.has(baseName)) return baseName;
  for (let n = 2; ; n++) {
    const name = `${baseName} (${n})`;
    if (!taken.has(name)) return name;
  }
}

async function flyLog(argv: string[], deps: Deps): Promise<number> {
  let values: { all?: boolean; session?: string; grounded?: boolean };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: { all: { type: "boolean" }, session: { type: "string" }, grounded: { type: "boolean" } },
    }));
  } catch {
    deps.stderr(LOG_USAGE);
    return 2;
  }
  if ([values.all, values.session !== undefined, values.grounded].filter(Boolean).length > 1) {
    deps.stderr(LOG_USAGE);
    return 2;
  }

  // A Session ID is unique on its own, so `--session` looks across every project. `--grounded`
  // does too, matching `fly retry`, which sends every project's Grounded Dispatches.
  const filter: LogFilter = values.session !== undefined
    ? { sessionId: values.session }
    : values.grounded
      ? { state: "grounded" }
      : values.all
        ? {}
        : { projectPath: await projectRoot(deps.cwd) };
  const dispatches = await withFlightLog(deps, async (log) => log.dispatches(filter));
  deps.stdout(JSON.stringify(dispatches, null, 2));
  return 0;
}

/** One thing `fly doctor` checked: fine, or a problem with an exact fix. */
type Check =
  | { name: string; ok: true; version?: string }
  | { name: string; ok: false; problem: string; fix: string };

const TOOLS: readonly Tool[] = ["pandoc", "typst", "rmapi"];

/** The fix for each tool that isn't installed, or doesn't run. */
const INSTALL_FIX: Record<Tool, string> = {
  pandoc: "brew install pandoc",
  typst: "brew install typst",
  rmapi: "go install github.com/ddvk/rmapi@v0.0.35",
};

const LOGIN_CHECK = "rmapi login";
const NOT_LOGGED_IN = "rmapi is not logged in to the reMarkable cloud, or its login has expired";

/**
 * Checks every external dependency and prints the result as JSON, with an exact fix for each
 * problem; exits 1 when anything is wrong.
 */
async function flyDoctor(argv: string[], deps: Deps): Promise<number> {
  try {
    parseArgs({ args: argv, options: {} });
  } catch {
    deps.stderr(DOCTOR_USAGE);
    return 2;
  }

  const checks: Check[] = [];
  for (const tool of TOOLS) checks.push(await checkTool(deps.toolchain, tool));
  // The transport is rmapi, so its login can only be checked once rmapi runs.
  const rmapiRuns = checks[TOOLS.indexOf("rmapi")]?.ok;
  checks.push(
    rmapiRuns
      ? await checkLogin(deps.transport)
      : {
          name: LOGIN_CHECK,
          ok: false,
          problem: "the login can't be checked until rmapi is installed",
          fix: INSTALL_FIX.rmapi,
        },
  );

  const ok = checks.every((check) => check.ok);
  deps.stdout(JSON.stringify({ ok, checks }, null, 2));
  for (const check of checks) {
    if (!check.ok) deps.stderr(`fly: ${check.problem}; to fix it: ${check.fix}`);
  }
  return ok ? 0 : 1;
}

/** Whether `tool` is installed and runs, and its version. */
async function checkTool(toolchain: Toolchain, tool: Tool): Promise<Check> {
  const fix = INSTALL_FIX[tool];
  try {
    const version = await toolchain.version(tool);
    if (version === null) return { name: tool, ok: false, problem: `${tool} is not installed`, fix };
    return { name: tool, ok: true, version };
  } catch (error) {
    return { name: tool, ok: false, problem: `${tool} is installed but doesn't run (${(error as Error).message})`, fix };
  }
}

/** Whether the transport is logged in, without printing anything the login holds. */
async function checkLogin(transport: Transport): Promise<Check> {
  try {
    await transport.checkLogin();
    return { name: LOGIN_CHECK, ok: true };
  } catch (error) {
    if (error instanceof NotLoggedInError) {
      return {
        name: LOGIN_CHECK,
        ok: false,
        problem: NOT_LOGGED_IN,
        fix: "run `! rmapi` and enter the code from my.remarkable.com",
      };
    }
    return {
      name: LOGIN_CHECK,
      ok: false,
      problem: `the login couldn't be checked (${(error as Error).message})`,
      fix: "check the network connection, then run fly doctor again",
    };
  }
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

/** Where a Grounded Dispatch's PDF is kept until it lands. */
function groundedPdfPath(env: Deps["env"], dispatchId: string): string {
  return join(dataDir(env), "grounded", `${dispatchId}.pdf`);
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
