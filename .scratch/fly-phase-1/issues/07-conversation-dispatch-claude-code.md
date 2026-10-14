# 07: Conversation Dispatch from a Claude Code Session

**What to build:** `fly conversation` sends the whole Claude Code Session so far as a Conversation Dispatch, containing only the user's prompts and the agent's Replies. Prompts are clearly set apart from Replies. Turns compacted out of the agent's context are still included, because they come from the transcript.

**Blocked by:** 04

**Status:** ready-for-agent

- [x] Includes every real user prompt and every Reply, in order. Leaves out tool calls, tool results, thinking, `isMeta` injections and bookkeeping records.
- [x] Prompts are labelled "You" and styled differently from Replies (e.g. indented, grey).
- [x] The name is `YYYY-MM-DD HH:MM <Session Title> (conversation)`, using the send time.
- [x] Shares the Session Title rules from ticket 04.
- [x] Conversation Dispatches are never refused as resends. Each one is recorded in the Flight Log as superseding the Session's previous Conversation Dispatch.
- [x] A compacted-Session fixture shows early turns are present.

## Comments

- Implemented. Notes for later tickets:
  - Prompts are emitted as pandoc fenced divs (`::: prompt` with a `**You**` label). `fenced_divs` and `src/prompt.lua` are used only for Conversation Dispatches; the filter wraps each div in the template's `#prompt[…]` (indented, grey, 9pt). Turn text has `:::` lines outside code fences escaped, so a turn can't close or open a prompt block.
  - The Flight Log gained `supersedes` (shown by `fly log`). It is filled inside the insert's transaction with the ID of the Session's most recent Conversation Dispatch in any state, so concurrent sends chain correctly. Older Flight Logs get the column added on open.
  - Compaction needs nothing special: Claude Code keeps the earlier records in the transcript, and the `compact_boundary` (no `message`) and `isCompactSummary` records were already skipped.
  - Reader changes that also affect `fly reply`: slash commands read as `/name args` rather than the raw `<command-name>` tags; `origin.kind: "task-notification"` records and `[Request interrupted by user…]` markers are left out but still end the current Reply, so Reply references don't shift; any other non-`human` origin kind is a loud error.
  - Not handled: single line breaks inside a prompt are soft breaks, so a multi-line prompt runs together into one paragraph. Old-style `<local-command-stdout>` user records (none seen in local transcripts from 2.1.x) would show as prompts with raw tags.
  - The prompt styling was checked by eye on a PNG render; nothing tests it automatically. Look at it during the manual tablet check.
