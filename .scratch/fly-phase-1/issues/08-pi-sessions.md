# 08: Pi Sessions

**What to build:** Everything that works in a Claude Code Session also works in a Pi Session. `fly reply`, `fly replies` and `fly conversation` read Pi's transcript and follow only the current branch of Pi's session tree, so abandoned branches never appear.

**Blocked by:** 05, 07

**Status:** ready-for-agent

- [ ] The Session is located from `PI_SESSION_FILE`, and the host (Claude Code or Pi) is detected from the environment.
- [ ] The current branch is rebuilt by walking `parentId` back from the leaf entry.
- [ ] Only `user` and `assistant` message text is kept. Thinking, tool calls, tool results and other entries are dropped.
- [ ] The Session Title comes from Pi when it provides one, otherwise follows the same rules as ticket 04.
- [ ] Long Reply selection, `--reply` references, resend protection and Conversation styling behave exactly as for Claude Code.
- [ ] Unrecognised entry shapes cause a clear, loud error.
- [ ] Scrubbed Pi fixtures include a Session with abandoned branches and trailing short Replies.
