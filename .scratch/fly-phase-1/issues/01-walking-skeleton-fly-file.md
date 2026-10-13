# 01: Walking skeleton: `fly file` puts a Markdown file on the tablet

**What to build:** Running `fly file notes.md --title "Design notes"` produces a plain A5 PDF from the Markdown and uploads it to the Hangar (the `Paper Airplane` folder) on the reMarkable as `YYYY-MM-DD HH:MM Design notes`, then prints a short result. This ticket also sets up the Bun + TypeScript project, the CLI entry point (`fly`, installable via `bun link`), and the single test seam described in the spec: the CLI's core function, called with arguments, a fake environment, a fixed clock, and two swappable parts.
- **Transport:** real rmapi (ddvk fork, v0.0.35), or a fake in-memory device in tests.
- **Renderer:** real pandoc → Typst, or a fake that captures the Markdown and metadata in tests.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `fly file <path> --title <t>` renders an A5 PDF (pandoc GitHub-flavored Markdown reader feeding Typst) and uploads it to `/Paper Airplane`.
- [ ] The Hangar is created on the device if it doesn't exist.
- [ ] The document name is `YYYY-MM-DD HH:MM <title>` using the send time. Without `--title`, the first heading is used, then the file name.
- [ ] The CLI prints a short machine-readable result: name and state.
- [ ] Tests drive the CLI core with a fake transport and fake renderer and assert on what reached the fake device (folder, name, content).
- [ ] One real-renderer test produces a valid A5 PDF. It is skipped when pandoc or Typst is missing.
- [ ] External tools are started with argument arrays (no shell), and paths are built cross-platform.
- [ ] A manual run sends a real file to the tablet.
