import { readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { parseArgs } from "node:util";

/** The `Paper Airplane` folder on the reMarkable where every Dispatch lands. */
export const HANGAR = "/Paper Airplane";

const USAGE = "usage: fly file <path.md> [--title <title>]";

export interface RenderRequest {
  markdown: string;
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
  switch (command) {
    case "file":
      return flyFile(rest, deps);
    default:
      deps.stderr(USAGE);
      return 2;
  }
}

async function flyFile(argv: string[], deps: Deps): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { title: { type: "string" } },
    allowPositionals: true,
  });
  const [path] = positionals;
  if (path === undefined || positionals.length > 1) {
    deps.stderr(USAGE);
    return 2;
  }

  const fullPath = resolve(deps.cwd, path);
  let markdown: string;
  try {
    markdown = await readFile(fullPath, "utf8");
  } catch (error) {
    deps.stderr(`fly: can't read ${fullPath}: ${(error as Error).message}`);
    return 1;
  }
  const title = values.title ?? firstHeading(markdown) ?? basename(fullPath, extname(fullPath));
  // The transport names documents after local files, so path separators can't appear.
  const name = `${formatTimestamp(deps.now())} ${title}`.replace(/[/\\]/g, "-");

  const pdf = await deps.renderer.render({ markdown });
  await deps.transport.ensureFolder(HANGAR);
  await deps.transport.upload(HANGAR, name, pdf);
  deps.stdout(JSON.stringify({ name, state: "landed" }));
  return 0;
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

/** `YYYY-MM-DD HH:MM` in local time. */
function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
