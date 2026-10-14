import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Renderer, RenderRequest } from "./core.ts";
import { runTool, withTempDir } from "./exec.ts";

const TEMPLATE = fileURLToPath(new URL("./dispatch.typ", import.meta.url));
const PROMPT_FILTER = fileURLToPath(new URL("./prompt.lua", import.meta.url));

/**
 * Renders GitHub-flavored Markdown to an A5 PDF: pandoc converts it to Typst markup using the
 * Dispatch template, then Typst typesets it with its bundled fonts only.
 */
export class PandocTypstRenderer implements Renderer {
  render(request: RenderRequest): Promise<Uint8Array> {
    return withTempDir("fly-render-", async (dir) => {
      const input = join(dir, "dispatch.md");
      const typst = join(dir, "dispatch.typ");
      const output = join(dir, "dispatch.pdf");
      await writeFile(input, request.markdown);
      // A Conversation marks each prompt as a fenced div; other Dispatches are plain GFM.
      const conversation = request.header.kind === "Conversation";
      await runTool([
        "pandoc",
        conversation ? "--from=gfm+fenced_divs" : "--from=gfm",
        ...(conversation ? [`--lua-filter=${PROMPT_FILTER}`] : []),
        "--to=typst",
        `--template=${TEMPLATE}`,
        `--output=${typst}`,
        input,
      ]);
      // The template reads these as `sys.inputs`.
      const inputs = { "dispatch-id": request.dispatchId, ...request.header };
      await runTool([
        "typst",
        "compile",
        "--ignore-system-fonts",
        ...Object.entries(inputs).flatMap(([key, value]) => ["--input", `${key}=${value}`]),
        typst,
        output,
      ]);
      return new Uint8Array(await readFile(output));
    });
  }
}
