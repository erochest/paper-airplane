/** The text of the first ATX heading outside a fenced code block, if any. */
export function firstHeading(markdown: string): string | undefined {
  for (const { line, inCode } of lines(markdown)) {
    if (inCode) continue;
    const heading = /^ {0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(line)?.[1];
    if (heading) return heading;
  }
  return undefined;
}

/**
 * `markdown` with every line outside a fenced code block that would open or close a fenced div
 * (`:::`) escaped, so the text can sit inside a div without ending it or starting one.
 */
export function escapeDivFences(markdown: string): string {
  return lines(markdown)
    .map(({ line, inCode }) => (inCode ? line : line.replace(/^( {0,3}):{3}/, "$1\\:::")))
    .join("\n");
}

/** Each line of `markdown`, and whether it is part of a fenced code block, fences included. */
function lines(markdown: string): { line: string; inCode: boolean }[] {
  let fence: string | undefined;
  return markdown.split(/\r?\n/).map((line) => {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker === undefined) return { line, inCode: fence !== undefined };
    if (fence === undefined) fence = marker;
    else if (marker[0] === fence[0] && marker.length >= fence.length) fence = undefined;
    return { line, inCode: true };
  });
}
