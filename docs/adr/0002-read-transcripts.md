# Dispatch content is read from the Session transcript

The CLI reads Reply content directly from the agent's Session transcript (Claude Code's `~/.claude/projects/…/<session>.jsonl`, located via `CLAUDE_CODE_SESSION_ID`, or Pi's `PI_SESSION_FILE`). The agent never retypes it into a file. Retyping costs output tokens, lets the agent quietly paraphrase or trim, and makes a Conversation Dispatch impossible once early turns have been compacted out of the agent's context.

## Consequences

Each agent needs its own small transcript reader, and those readers depend on undocumented, version-specific JSONL formats that may change. A Markdown file passed in directly is still accepted as input, for content that isn't in a transcript.
