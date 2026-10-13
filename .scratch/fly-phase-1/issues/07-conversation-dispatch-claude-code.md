# 07: Conversation Dispatch from a Claude Code Session

**What to build:** `fly conversation` sends the whole Claude Code Session so far as a Conversation Dispatch, containing only the user's prompts and the agent's Replies. Prompts are clearly set apart from Replies. Turns compacted out of the agent's context are still included, because they come from the transcript.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] Includes every real user prompt and every Reply, in order. Leaves out tool calls, tool results, thinking, `isMeta` injections and bookkeeping records.
- [ ] Prompts are labelled "You" and styled differently from Replies (e.g. indented, grey).
- [ ] The name is `YYYY-MM-DD HH:MM <Session Title> (conversation)`, using the send time.
- [ ] Shares the Session Title rules from ticket 04.
- [ ] Conversation Dispatches are never refused as resends. Each one is recorded in the Flight Log as superseding the Session's previous Conversation Dispatch.
- [ ] A compacted-Session fixture shows early turns are present.
