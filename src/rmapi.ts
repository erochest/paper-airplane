import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Transport } from "./core.ts";
import { runTool, withTempDir } from "./exec.ts";

/**
 * Delivers PDFs over the reMarkable cloud with rmapi (the ddvk fork, v0.0.35).
 * `-ni` stops rmapi from prompting for a pairing code when the login is missing.
 */
export class RmapiTransport implements Transport {
  async ensureFolder(folder: string): Promise<void> {
    // rmapi's mkdir succeeds without changes when the folder already exists.
    await runTool(["rmapi", "-ni", "mkdir", folder]);
  }

  async documentNames(folder: string): Promise<string[]> {
    // Plain `ls` prints one `[f]\t<name>` (document) or `[d]\t<name>` (folder) line per entry.
    const document = "[f]\t";
    const listing = await runTool(["rmapi", "-ni", "ls", folder]);
    return listing
      .split("\n")
      .filter((line) => line.startsWith(document))
      .map((line) => line.slice(document.length));
  }

  upload(folder: string, name: string, pdf: Uint8Array): Promise<void> {
    // rmapi names the document after the local file, minus its extension.
    // TODO(windows): names contain `HH:MM`, and Windows file names can't contain `:`.
    return withTempDir("fly-upload-", async (dir) => {
      const file = join(dir, `${name}.pdf`);
      await writeFile(file, pdf);
      await runTool(["rmapi", "-ni", "put", file, folder]);
    });
  }
}
