# 05: Choosing a specific Reply

**What to build:** When the user gives a hint like "send the plan from this morning", the agent can find the right Reply and send exactly that one. `fly replies` lists the Session's Replies, and `fly reply --reply <ref>` sends a chosen one.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] `fly replies` prints JSON listing each Reply in the Session: a stable reference, timestamp, word count, whether it is a Long Reply, and its first heading or first line.
- [ ] `fly reply --reply <ref>` sends that Reply, even if it isn't the most recent or isn't a Long Reply.
- [ ] An unknown reference gives a clear error and sends nothing.
- [ ] Reply references stay stable across calls within the same Session.
