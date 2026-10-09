# Spec: `/fly` phase 1: send Replies and Conversations to the reMarkable

Status: ready-for-agent

## Problem Statement

Long agent output (plans, research, designs, reviews) is hard to read critically on screen, sandwiched between tool calls in a terminal. I want to read it on my reMarkable 2, away from the computer, and mark it up with a pen. Today that means copying text out of the Session, converting it to something the tablet accepts, and uploading it by hand. The friction is high enough that I rarely bother, so agent output gets skimmed rather than reviewed.

## Solution

A single agent skill, `/fly`, that works in both Claude Code and Pi. When I invoke it, it reads the current Session's transcript and builds a Dispatch:

- **`/fly reply`** (the default) builds a Reply Dispatch from the most recent Long Reply, or from a Reply I describe in a hint.
- **`/fly conversation`** builds a Conversation Dispatch containing every prompt and Reply in the Session so far.

The Dispatch is typeset as an A5 PDF sized for the rM2 screen and uploaded to the Hangar, the `Paper Airplane` folder on my reMarkable. Its name tells me when the content was written and which Session it came from. Every Dispatch gets a stable identity and is recorded in the Flight Log, so I can find it later and, in a future phase, sync my annotations back. If delivery fails, the Dispatch is kept as Grounded and can be resent with `/fly retry`.

## User Stories

### Sending a Reply

1. As a user, I want to type `/fly` after the agent writes a long plan, so that the plan appears on my reMarkable without any manual copying or converting.
2. As a user, I want `/fly` with no mode to mean `/fly reply`, so that the most common action is the shortest to type.
3. As a user, I want `/fly reply` to pick the most recent Long Reply (over 300 words) rather than the literal last Reply, so that a trailing "Done." or a short answer to a follow-up doesn't get sent instead of the substantive content.
4. As a user, I want to give a hint like "send the plan from this morning", so that I can send an earlier Long Reply that isn't the most recent one.
5. As a user, I want the agent to resolve my hint to a specific Reply in the transcript, so that the CLI sends exactly that Reply and not something the agent retyped.
6. As a user, I want a clear message when the Session has no Long Reply, so that I understand why nothing was sent.
7. As a user, I want a Reply's content taken word for word from the transcript, so that what I review on paper is exactly what the agent wrote, not a paraphrase or a trimmed copy.
8. As a user, I want the agent's thinking blocks and tool calls excluded from a Reply Dispatch, so that only the prose and code I would read on screen ends up on paper.

### Sending a Conversation

9. As a user, I want `/fly conversation` to send every prompt and Reply in the Session so far, so that I can review a whole back-and-forth in context.
10. As a user, I want tool calls and tool results left out of a Conversation Dispatch entirely, so that the document isn't padded with file reads and command output.
11. As a user, I want my prompts visually set apart from the agent's Replies (labelled "You", indented, grey), so that I can tell at a glance who is speaking.
12. As a user, I want a Conversation Dispatch to include turns that have been compacted out of the agent's working context, so that the whole Session is on paper even in long Sessions.
13. As a Pi user, I want a Conversation Dispatch to include only the current branch of my Session tree, so that abandoned branches don't show up as if they were part of the conversation.
14. As a user, I want injected material such as skill bodies and system reminders left out, so that only what I typed and what the agent wrote appears.

### Naming and finding Dispatches on the device

15. As a user, I want every Dispatch to land in a `Paper Airplane` folder (the Hangar), so that the agent's output is kept apart from my other notebooks.
16. As a user, I want the Hangar created automatically the first time it's needed, so that I don't have to set it up on the device.
17. As a user, I want Dispatches named `YYYY-MM-DD HH:MM <Session Title>`, so that they sort by date and I can tell which Session each came from.
18. As a user, I want a Reply Dispatch's timestamp to be when the Reply was written, not when I sent it, so that the name reflects when the content was produced.
19. As a user, I want a Conversation Dispatch's timestamp to be when I sent it, and its name to end in "(conversation)", so that I can tell it apart from Reply Dispatches from the same Session.
20. As a user, I want every Dispatch from a Session to share one Session Title, so that related Dispatches are easy to group in a list on the device.
21. As a user, I want the Session Title taken from the agent's own generated title when there is one, so that I don't have to name it.
22. As a user, I want the agent to propose a Session Title when the host doesn't provide one, so that every Dispatch still has a meaningful name.
23. As a user, I want to override the Session Title with `--title`, so that I can fix a poor automatic title.
24. As a user, I want the Session Title fixed at the Session's first Dispatch and reused after that, so that names stay consistent within a Session.
25. As a user, I want any remaining name collision resolved with a counter suffix like "(2)", so that no Dispatch ever overwrites another on the device.

### Resending

26. As a user, I want `/fly` to refuse to resend a Reply that already landed, saying when and under what name it was sent, so that I don't get accidental duplicates.
27. As a user, I want `--again` to override that refusal, so that I can deliberately send a fresh copy (for example after annotating the first one).
28. As a user, I want every send to create a new Dispatch rather than replacing an old one, so that my annotations are never destroyed.
29. As a user, I want the Flight Log to record that a later Conversation Dispatch supersedes an earlier one from the same Session, so that annotation sync can later work out which is current.

### The page

30. As a reader, I want Dispatches typeset on A5 pages, so that they display at roughly true size on the rM2 screen.
31. As a reader, I want a wide margin, so that I have room for handwritten notes.
32. As a reader, I want a small header on page 1 with the Session Title, timestamp, project name and Dispatch kind, so that a printout or screenshot is self-explanatory.
33. As a reader, I want a footer on every page with the page number and a short Dispatch ID, so that I can refer to a specific page and Dispatch.
34. As a reader, I want GitHub-flavored Markdown (headings, lists, tables, task lists, block quotes, links) rendered properly, so that structured Replies stay readable.
35. As a reader, I want code blocks syntax-highlighted and long lines wrapped, so that code is readable and never runs off the page.
36. As a reader, I want Mermaid diagrams shown as code blocks, so that their content is still visible even though they aren't drawn.
37. As a reader, I want unsupported characters such as some emoji to degrade gracefully instead of breaking the render, so that one odd character never stops a Dispatch.

### Delivery and failure

38. As a user, I want Dispatches delivered over the reMarkable cloud, so that sending works on any network, including a VPN, without a USB cable.
39. As a user, I want `fly doctor` to check that pandoc, Typst and rmapi are installed and that rmapi is logged in, so that setup problems are found before a send fails.
40. As a user, I want the agent to stop and tell me to run `! rmapi` when the login is missing or expired, so that I can do the one-time pairing step myself.
41. As a user, I want a failed upload to keep the rendered PDF locally and mark the Dispatch as Grounded, so that nothing I asked to send is lost.
42. As a user, I want the local path of a Grounded PDF printed, so that I can drag it into the reMarkable app by hand if I need it right away.
43. As a user, I want `/fly retry` to resend all Grounded Dispatches, so that I can recover from outages in one step.
44. As a user, I want a Grounded Dispatch that's later sent to keep its original identity and name, so that a retry doesn't create a different Dispatch.

### The Flight Log

45. As a user, I want every Dispatch recorded in a Flight Log with its ID, kind, Session, source Reply, project path, git remote, name, timestamps and state (landed or Grounded), so that there is a durable record of what was sent.
46. As an agent, I want `fly log` to print JSON for the current project's Dispatches, so that I can answer "what have I sent from this repo?" without parsing files.
47. As an agent, I want `fly log --all`, `--session` and `--grounded` filters, so that I can widen or narrow the search.
48. As a user, I want the Flight Log kept outside every repo, in my user data directory, so that it is never committed by accident.
49. As a user, I want several agent Sessions to be able to send at the same time without corrupting the Flight Log, so that I can use `/fly` in parallel Sessions.

### Hosts and platforms

50. As a Claude Code user, I want `/fly` to find the current Session's transcript automatically, so that I don't have to point it at a file.
51. As a Pi user, I want `/fly` to work the same way through Pi's skill support, so that I get the same behaviour in both agents.
52. As a user, I want one copy of the skill in this repo, linked into both agents' skill directories, so that there is a single thing to update.
53. As a Windows user, I want the CLI written without macOS-only assumptions, so that it can be made to work on Windows with little effort.
54. As a user, I want the CLI usable directly from a shell, so that I can send a Markdown file (for example a plan document) that isn't in any transcript.

### Groundwork for later phases

55. As a future annotation-sync feature, I want the Dispatch ID embedded in the PDF metadata, so that a document found on the device can be matched to its Flight Log record.
56. As a future Auto-Dispatch feature, I want sending to be a single CLI call that takes a Session and a Reply, so that a Claude Code `Stop` hook or a Pi extension can call it without going through the skill.

## Implementation Decisions

- **Shape:** a single skill named `fly` (the skill name is the slash command) whose instructions call a TypeScript CLI also named `fly`. The CLI is run with Bun and installed globally from this repo (`bun link`). The skill directory lives in this repo and is symlinked into the Claude Code and Pi (`~/.agents/skills`) skill directories. The skill description mentions the reMarkable so that plain requests like "send this to my reMarkable" also trigger it.
- **CLI commands:**
  - `fly reply [--reply <ref>] [--title <t>] [--again]`
  - `fly conversation [--title <t>]`
  - `fly file <path.md> [--title <t>]`
  - `fly retry`
  - `fly log [--all | --session <id> | --grounded]` (JSON output)
  - `fly doctor`
  - Commands that send print a short machine-readable result: Dispatch ID, name, state, and the local PDF path when Grounded.
- **Modules:**
  - **Transcript readers**, one per host. Each turns a host transcript into a common, ordered list of turns (role, text, timestamp, stable reply reference) and reports the host's own Session Title if it has one.
    - *Claude Code:* the Session is found from `CLAUDE_CODE_SESSION_ID` and the project directory under `~/.claude/projects/`. User prompts are `user` records with string content that aren't `isMeta`. Reply text comes from `assistant` records with `text` blocks, grouped by request. `thinking`, `tool_use`, tool results and bookkeeping records are dropped. The title comes from the `ai-title` record.
    - *Pi:* the Session is found from `PI_SESSION_FILE`. The current branch is rebuilt by walking `parentId` back from the leaf. Only `user` and `assistant` message text is kept.
  - **Selection**: picks the Reply for a Reply Dispatch: the most recent with more than 300 words (prose plus code), or the one named by `--reply`.
  - **Dispatch builder**: assembles the Markdown document (header fields, turns with speaker styling for Conversations), the name (timestamp rules, Session Title, "(conversation)" suffix, counter for collisions) and the metadata (Dispatch ID, kind, Session, source Reply).
  - **Renderer** (swappable): pandoc's GitHub-flavored Markdown reader feeding Typst, producing an A5 PDF with a wide outer margin, a page-1 header, a footer with page number and short Dispatch ID, and the Dispatch ID in the PDF metadata. Typst's bundled fonts only; long code lines wrap; Mermaid is left as code.
  - **Transport** (swappable): rmapi, the ddvk fork pinned to v0.0.35 and installed with `go install`. Responsibilities: make sure the Hangar exists, upload a PDF under a given name, and report clear errors for missing login, network failure and name conflicts.
  - **Flight Log**: one SQLite database for the whole user account (`bun:sqlite`) in the platform user data directory. It stores Dispatch ID, kind, Session ID, host, source reply reference, project path, git remote, Session Title, document name, written-at and sent-at timestamps, state (landed or Grounded), local PDF path, and a supersedes link. The Session Title is stored per Session on first Dispatch. Agents access it only through `fly log`.
- **Resend rule:** sending a Reply whose reference already has a landed Dispatch is refused with the earlier name and time unless `--again` is passed. Conversation Dispatches are never refused; each new one supersedes the previous one from that Session.
- **Retry rule:** `fly retry` resends every Grounded Dispatch's saved PDF under its original name and ID, and marks it landed on success.
- **Cross-platform:** paths are built with path utilities and the home directory lookup, external tools are started with argument arrays (no shell), and data directories follow each platform's convention. Only macOS is tested in this phase.
- **Agent's role in the skill:** decide the mode, turn any hint into a `--reply` reference (by asking the CLI to list candidate Replies), propose a Session Title only when the CLI reports there isn't one, and relay `fly doctor` instructions. The agent never passes Reply content itself.
- Decisions recorded as ADRs: A5 PDF rather than ePub (0001), reading transcripts rather than retyping (0002), a global SQLite Flight Log (0003).

## Testing Decisions

- **Good tests check external behaviour only:** what reached the device (folder, name, content), what the CLI printed, and what `fly log` reports afterwards. They never assert on internal module calls, SQL layout or intermediate data structures, so internals can be refactored freely.
- **One test seam:** the CLI's core entry point, called with arguments, a fake environment (session variables pointing at fixture transcripts, a temporary data directory, a temporary home), a fixed clock, and two swappable parts:
  - **Fake transport**: an in-memory device that records the folder, name and file for each upload. It can be told to fail (no login, network down, name exists) to exercise Grounded Dispatches, retry and collision handling.
  - **Fake renderer** (the default in tests): captures the Markdown and metadata that would be typeset, so content rules (Long Reply selection, no tool calls, speaker labels, header fields, Dispatch ID) can be checked without extracting text from PDFs.
- **Real-renderer tests:** a small number of tests run pandoc and Typst for real and check that the output is a valid PDF, A5 sized, with the Dispatch ID in its metadata. They are skipped when the tools are missing.
- **Fixtures:** small, scrubbed transcripts for Claude Code and Pi covering:
  - trailing short Replies after a Long Reply
  - multi-block Replies with interleaved tool calls
  - `isMeta` injections
  - compacted Sessions
  - a Pi Session with abandoned branches
  - a Session with and without a host title
- **Work order:** test-first (red, green, refactor) through the seam above.
- **Prior art:** none; this is a new repo.
- **Manual check:** one end-to-end send to the real tablet, confirming the Hangar, the name, A5 display and legibility.

## Out of Scope

- Auto-Dispatch (automatically sending each Long Reply), planned for phase 2 using a Claude Code `Stop` hook and a Pi extension that call the same CLI.
- Annotation sync (reading marks from the tablet and feeding them back into a Session), to be designed in its own session after phase 1.
- ePub output, other page sizes, custom fonts and drawing Mermaid diagrams.
- USB, SSH and email delivery.
- Content filtering or redaction. Sending is an explicit choice, and choosing suitable Sessions is up to the user.
- Testing on Windows, and configurable settings such as the Long Reply threshold or the Hangar name.
- Hosts other than Claude Code and Pi.

## Further Notes

- The transcript formats for both hosts are undocumented and change between versions. The readers should fail loudly, with a clear message, when they meet a record shape they don't recognise, rather than silently dropping content.
- rmapi's behaviour when a name already exists in the folder hasn't been checked. The Dispatch builder's counter avoids depending on it.
- The `Stop` hook payload fields for phase 2 (`last_assistant_message`, `transcript_path`) were read from the docs and should be checked against a real payload before phase 2.
- Glossary: GLOSSARY.md (Session, Reply, Long Reply, Session Title, Dispatch, Reply Dispatch, Conversation Dispatch, Auto-Dispatch, Hangar, Flight Log, Grounded).
