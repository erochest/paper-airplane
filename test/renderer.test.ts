import { expect, test } from "bun:test";
import type { DispatchKind, RenderRequest } from "../src/core.ts";
import { PandocTypstRenderer } from "../src/renderer.ts";

const toolsMissing = !Bun.which("pandoc") || !Bun.which("typst");

// A5 is 148 × 210 mm, which is 419.53 × 595.28 pt.
const A5 = { width: 419.53, height: 595.28 };

const dispatchId = "3f2b9c1e-7a4d-4e8b-9c0f-5d6e7f8a9b0c";

function request(markdown: string, kind: DispatchKind): RenderRequest {
  return {
    markdown,
    dispatchId,
    header: { title: 'A "quoted" #title', timestamp: "2026-10-13 09:05", project: "paper-airplane", kind },
  };
}

function render(markdown: string, kind: DispatchKind = "File") {
  return new PandocTypstRenderer().render(request(markdown, kind)).then((pdf) => new TextDecoder("latin1").decode(pdf));
}

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

  const text = await render(markdown);

  expect(text.startsWith("%PDF-")).toBe(true);
  expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  const boxes = [...text.matchAll(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/g)];
  expect(boxes.length).toBeGreaterThan(0);
  for (const [, width, height] of boxes) {
    expect(Number(width)).toBeCloseTo(A5.width, 0);
    expect(Number(height)).toBeCloseTo(A5.height, 0);
  }
});

test.skipIf(toolsMissing)("the full Dispatch ID is embedded in the PDF metadata", async () => {
  const text = await render("Notes.\n");

  const info = /\/Keywords\s*\(([^)]*)\)/.exec(text)?.[1];
  expect(info).toContain(dispatchId);
});

test.skipIf(toolsMissing)("block quotes, links, Mermaid, long code lines and emoji don't break the render", async () => {
  const markdown = [
    "# Launch 🚀 plan 🫠",
    "",
    "> A block quote with a [link](https://example.com).",
    "",
    "```mermaid",
    "graph TD; A-->B",
    "```",
    "",
    "```",
    `const ${"x".repeat(300)} = 1; // ${"long line ".repeat(30)}`,
    "```",
    "",
    "---",
    "",
    "Inline `#raw` with Typst-looking text: #set page(width: 1pt) and $math$.",
    "",
  ].join("\n");

  const text = await render(markdown);

  expect(text.startsWith("%PDF-")).toBe(true);
  // Typst-looking text in the Markdown is content, not markup, so the page stays A5.
  for (const [, width] of text.matchAll(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/g)) {
    expect(Number(width)).toBeCloseTo(A5.width, 0);
  }
});

test.skipIf(toolsMissing)("a Conversation's prompts render as their own blocks, whatever characters they hold", async () => {
  const markdown = [
    "::: prompt",
    "**You**",
    "",
    "Fix the `]` and #set page(width: 1pt) [unbalanced",
    ":::",
    "",
    "# A Reply",
    "",
    "Some prose.",
    "",
  ].join("\n");

  const text = await render(markdown, "Conversation");

  expect(text.startsWith("%PDF-")).toBe(true);
  for (const [, width] of text.matchAll(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/g)) {
    expect(Number(width)).toBeCloseTo(A5.width, 0);
  }
});
