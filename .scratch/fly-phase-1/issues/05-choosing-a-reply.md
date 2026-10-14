# 05: Choosing a specific Reply

**What to build:** When the user gives a hint like "send the plan from this morning", the agent can find the right Reply and send exactly that one. `fly replies` lists the Session's Replies, and `fly reply --reply <ref>` sends a chosen one.

**Blocked by:** 04

**Status:** ready-for-agent

- [x] `fly replies` prints JSON listing each Reply in the Session: a stable reference, timestamp, word count, whether it is a Long Reply, and its first heading or first line.
- [x] `fly reply --reply <ref>` sends that Reply, even if it isn't the most recent or isn't a Long Reply.
- [x] An unknown reference gives a clear error and sends nothing.
- [x] Reply references stay stable across calls within the same Session.

## Comments

- Implemented. Notes for later tickets:
  - `fly replies` prints a JSON array, oldest first, of `{ref, timestamp, words, long, preview}`. `ref` is the same transcript uuid stored as `replyRef` in the Flight Log, so it stays stable as the Session grows.
  - `timestamp` is local time with its UTC offset (`2026-10-13T09:31:15-04:00`), so the agent can resolve hints like "this morning" without knowing the timezone.
  - `preview` is the first heading, or else the first non-blank line, cut to 100 characters. A Reply that opens with a code fence previews as the fence line (e.g. "```ts"). Skipping fence lines would be a small follow-up if that turns out to matter.
  - `firstHeading` moved to `src/markdown.ts`, shared by `fly file` titles and Reply previews.
