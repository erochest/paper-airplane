import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Transport } from "./core.ts";
import { NotLoggedInError } from "./errors.ts";
import { runTool, withTempDir } from "./exec.ts";

/**
 * How rmapi reports a missing login (`missing token`, with `-ni`) or one the cloud no longer
 * accepts (`401 Unauthorized`, after which rmapi forgets the device token).
 */
const NO_LOGIN = /missing token|401 Unauthorized/;

/** Runs rmapi, reporting a missing or expired login as a `NotLoggedInError`. */
async function runRmapi(...args: string[]): Promise<string> {
  try {
    return await runTool(["rmapi", "-ni", ...args]);
  } catch (error) {
    const message = (error as Error).message;
    throw NO_LOGIN.test(message) ? new NotLoggedInError(message) : error;
  }
}

/**
 * Delivers PDFs over the reMarkable cloud with rmapi (the ddvk fork, v0.0.35).
 * `-ni` stops rmapi from prompting for a pairing code when the login is missing.
 */
export class RmapiTransport implements Transport {
  async ensureFolder(folder: string): Promise<void> {
    // rmapi's mkdir succeeds without changes when the folder already exists.
    await runRmapi("mkdir", folder);
  }

  async documentNames(folder: string): Promise<string[]> {
    // Plain `ls` prints one `[f]\t<name>` (document) or `[d]\t<name>` (folder) line per entry.
    const document = "[f]\t";
    const listing = await runRmapi("ls", folder);
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
      await runRmapi("put", file, folder);
    });
  }

  async checkLogin(): Promise<void> {
    // Fetching the account info needs a working login; what it prints is discarded.
    await runRmapi("account");
  }
}
