# 02: Page design

**What to build:** Every Dispatch gets a stable Dispatch ID and reads well on the rM2. The PDF has a wide margin for handwritten notes, a small page-1 header, a footer on every page, properly wrapped and highlighted code, and the Dispatch ID embedded in its metadata so a future annotation sync can match a document on the device back to its record.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Each Dispatch is assigned a unique Dispatch ID. A short form is shown on the page and the full ID is stored in the PDF metadata.
- [ ] The page-1 header shows the Session Title, timestamp, project or repo name, and Dispatch kind (Reply, Conversation or File).
- [ ] The footer on every page shows the page number and short Dispatch ID.
- [ ] A wide outer margin leaves room for notes.
- [ ] Code blocks are syntax-highlighted, and long lines wrap instead of overflowing.
- [ ] Tables, task lists, block quotes and links render correctly. Mermaid blocks appear as code.
- [ ] Unsupported characters (e.g. some emoji) don't make the render fail.
- [ ] Fake-renderer tests check the header fields and Dispatch ID passed to the renderer. A real-renderer test checks the Dispatch ID is in the PDF metadata.
