# 11: The `/fly` skill and install

**What to build:** The user can type `/fly`, `/fly conversation` or `/fly retry`, or just say "send this to my reMarkable", in either Claude Code or Pi. The agent drives the CLI correctly. One skill in this repo is linked into both agents, and the CLI is installed globally.

**Blocked by:** 02, 06, 08, 09, 10

**Status:** ready-for-agent

- [ ] One `fly` skill (Agent Skills `SKILL.md` format) with modes `reply` (the default), `conversation` and `retry`. Its description mentions the reMarkable so that plain requests trigger it.
- [ ] The skill tells the agent to:
  - turn a hint into a reference with `fly replies`, then call `fly reply --reply <ref>`
  - propose a Session Title only when the CLI reports one is needed
  - relay `fly doctor` fixes, including asking the user to run `! rmapi` themselves
  - never pass Reply content itself
- [ ] Install steps: `bun link` for the CLI, and symlinks from this repo's skill into the Claude Code skills directory and `~/.agents/skills` for Pi.
- [ ] The skill follows the repo's writing-for-agents guidance and uses the glossary vocabulary.
- [ ] Manual end-to-end test in both Claude Code and Pi:
  - a Reply Dispatch and a Conversation Dispatch land in the Hangar, display at A5, and are legible
  - resend protection triggers
  - `fly log` shows both Dispatches
