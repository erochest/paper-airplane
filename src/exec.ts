import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Runs an external tool from an argument array (never through a shell) and returns its stdout.
 * Throws with the tool's own error output when it exits non-zero.
 */
export async function runTool(argv: string[]): Promise<string> {
  const proc = Bun.spawn(argv, { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    const detail = (stderr || stdout).trim();
    throw new Error(`${argv[0]} exited with ${exitCode}${detail ? `: ${detail}` : ""}`);
  }
  return stdout;
}

/** Calls `fn` with a fresh temporary directory, and removes the directory afterwards. */
export async function withTempDir<T>(prefix: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
