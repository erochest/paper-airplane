import { expect, test } from "bun:test";
import { PandocTypstRenderer } from "../src/renderer.ts";

const toolsMissing = !Bun.which("pandoc") || !Bun.which("typst");

// A5 is 148 × 210 mm, which is 419.53 × 595.28 pt.
const A5 = { width: 419.53, height: 595.28 };

test.skipIf(toolsMissing)("the real renderer produces an A5 PDF from GitHub-flavored Markdown", async () => {
  const markdown = [
    "# Design notes",
    "",
    "| a | b |",
    "|---|---|",
    "| 1 | 2 |",
    "",
    "- [x] done",
    "- [ ] not done",
    "",
    "```ts",
    "const x = 1;",
    "```",
    "",
  ].join("\n");

  const pdf = await new PandocTypstRenderer().render({ markdown });

  const text = new TextDecoder("latin1").decode(pdf);
  expect(text.startsWith("%PDF-")).toBe(true);
  expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  const boxes = [...text.matchAll(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/g)];
  expect(boxes.length).toBeGreaterThan(0);
  for (const [, width, height] of boxes) {
    expect(Number(width)).toBeCloseTo(A5.width, 0);
    expect(Number(height)).toBeCloseTo(A5.height, 0);
  }
});
