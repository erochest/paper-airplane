// Pandoc template for a Dispatch page, sized and laid out for reading and annotating on the rM2.
// The Dispatch's fields arrive as Typst inputs (`typst compile --input key=value`) rather than
// through pandoc variables, so titles are plain strings and never parsed as markup.
#let dispatch = (
  id: sys.inputs.at("dispatch-id"),
  title: sys.inputs.at("title"),
  timestamp: sys.inputs.at("timestamp"),
  project: sys.inputs.at("project"),
  kind: sys.inputs.at("kind"),
)
// The short form is the first block of the ID, enough to tell Dispatches apart on paper.
#let short-id = dispatch.id.slice(0, 8)

// The keyword lets a future annotation sync match a document on the device to its Flight Log record.
#set document(title: dispatch.title, keywords: ("dispatch-id:" + dispatch.id,))

// The wide right margin leaves room for handwritten notes.
#set page(
  paper: "a5",
  margin: (left: 12mm, right: 42mm, top: 14mm, bottom: 16mm),
  footer: context text(size: 8pt, fill: luma(110))[#short-id #h(1fr) #counter(page).display()],
)
#set text(font: "Libertinus Serif", size: 10pt)

// Typst highlights code blocks natively.
#show raw: set text(font: "DejaVu Sans Mono")
#show raw.where(block: true): set text(size: 7.5pt)
#show raw.where(block: true): it => block(width: 100%, fill: luma(245), inset: 5pt, radius: 2pt, it)
// Long code lines wrap at spaces; break opportunities inside long tokens stop them overflowing.
#show raw: it => {
  show regex("\S{16,}"): token => token.text.clusters().join(sym.zws)
  it
}

#show link: it => underline(text(fill: rgb("#1a4f8b"), it))
#show quote.where(block: true): it => block(
  stroke: (left: 1.5pt + luma(170)),
  inset: (left: 8pt, y: 2pt),
  it.body,
)
#set table(
  inset: 4pt,
  stroke: (x, y) => if y == 0 { (bottom: 0.6pt) } else { (top: 0.3pt + luma(190)) },
)
#show table.cell.where(y: 0): set text(weight: "bold")

// Pandoc's Typst writer emits `#divider()` for horizontal rules; Typst before 0.15 lacks it, so
// fall back to a line, as pandoc's default template does.
#let horizontalRule = line(start: (25%, 0%), end: (75%, 0%))
#let divider = if "divider" in std { divider } else { horizontalRule }

// A Conversation's prompts, which the prompt filter wraps in this: indented and grey, so who is
// speaking shows at a glance.
#let prompt(body) = block(
  inset: (left: 10pt),
  above: 14pt,
  below: 14pt,
  text(size: 9pt, fill: luma(100), body),
)

#block(below: 14pt, text(size: 8pt, fill: luma(90))[
  #text(weight: "bold", dispatch.title) \
  #dispatch.timestamp · #dispatch.project · #dispatch.kind
])

$body$
