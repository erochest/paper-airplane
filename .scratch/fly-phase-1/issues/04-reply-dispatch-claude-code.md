# 04: Reply Dispatch from a Claude Code Session

**What to build:** Inside a Claude Code Session, `fly reply` reads the current Session's transcript and sends the most recent Long Reply (more than 300 words, counting prose and code) as a Reply Dispatch. The content is taken word for word from the transcript and never retyped by the agent (see ADR 0002). The name uses the Reply's own timestamp and the Session Title.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] The transcript is located from `CLAUDE_CODE_SESSION_ID` and the current project's directory under the Claude Code projects folder.
- [ ] Transcript reading sits behind a host interface (Session → ordered prompts/Replies with timestamps), so a second host (Pi, ticket 08) can be added without touching Long Reply selection, naming, or the Flight Log.
- [ ] Reply text is assembled from assistant `text` blocks for that Reply. Thinking, tool use, tool results, `isMeta` injections and bookkeeping records are left out.
- [ ] The most recent Long Reply is selected, so trailing short Replies like "Done." are skipped. If there is no Long Reply, the command says so clearly and sends nothing.
- [ ] The name is `YYYY-MM-DD HH:MM <Session Title>` using the Reply's timestamp.
- [ ] Session Title order of preference: `--title`, then the title already fixed for this Session in the Flight Log, then Claude Code's generated title. If none exists, the CLI exits saying a title is needed, so the agent can propose one.
- [ ] The Session Title is fixed in the Flight Log at the Session's first Dispatch. The Flight Log records the Session ID, host and source reply reference.
- [ ] Unrecognised transcript record shapes cause a clear, loud error, not silent dropping.
- [ ] Scrubbed Claude Code fixture transcripts cover: trailing short Replies, multi-block Replies with interleaved tool calls, `isMeta` injections, a Session with and without a generated title.
