import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Renderer, RenderRequest } from "./core.ts";
import { runTool, withTempDir } from "./exec.ts";

/** Renders GitHub-flavored Markdown to an A5 PDF with pandoc, using Typst as the PDF engine. */
export class PandocTypstRenderer implements Renderer {
  render(request: RenderRequest): Promise<Uint8Array> {
    return withTempDir("fly-render-", async (dir) => {
      const input = join(dir, "dispatch.md");
      const output = join(dir, "dispatch.pdf");
      await writeFile(input, request.markdown);
      await runTool([
        "pandoc",
        "--from=gfm",
        "--pdf-engine=typst",
        "--variable=papersize:a5",
        `--output=${output}`,
        input,
      ]);
      return new Uint8Array(await readFile(output));
    });
  }
}
