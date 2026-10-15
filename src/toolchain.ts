import type { Tool, Toolchain } from "./core.ts";
import { runTool } from "./exec.ts";

/** Finds the external tools on the `PATH` and asks each for its version. */
export class PathToolchain implements Toolchain {
  async version(tool: Tool): Promise<string | null> {
    const path = Bun.which(tool);
    if (path === null) return null;
    switch (tool) {
      case "pandoc":
      case "typst":
        // `pandoc 3.12.1` or `typst 0.15.1 (abc1234)` on the first line.
        return versionWord(await runTool([path, "--version"]));
      case "rmapi":
        return rmapiVersion(path);
    }
  }
}

/** The second word of the first line of a `<tool> <version> …` banner, or the whole line. */
function versionWord(banner: string): string {
  const line = banner.trim().split("\n")[0] ?? "";
  return line.split(/\s+/)[1] ?? line;
}

/**
 * rmapi's own version, or, for a build that only knows itself as `dev` (as `go install` builds
 * are), the module version Go recorded in the binary.
 */
async function rmapiVersion(path: string): Promise<string> {
  const own = (await runTool([path, "version"])).trim();
  if (own !== "dev" && own !== "") return own;
  try {
    // A `mod\t<module path>\t<version>\t<sum>` line.
    const info = await runTool(["go", "version", "-m", path]);
    const mod = info.split("\n").map((line) => line.trim().split(/\s+/)).find((fields) => fields[0] === "mod");
    if (mod?.[2] !== undefined) return `${mod[1]} ${mod[2]}`;
  } catch {
    // Go isn't installed, or the binary has no build info.
  }
  return own || "unknown";
}
