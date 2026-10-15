
# Paper Airplane

This is a system to review chats from LLMs on my reMarkable 2.

## MVP

This is an agent skill with scripts and all for taking a formatted response from an agent, export it as an ePub or PDF, and send it to a reMarkable 2 for review.

## Stretch

Long-term, it might be nice to sync the comments that user makes on the document on their reMarkable, and use those to continue the conversation.

## Install

From the repo root:

```sh
bun install
bun link                                              # links `fly` into Bun's global bin directory
mkdir -p ~/.claude/skills ~/.agents/skills
ln -s "$PWD/skills/fly" ~/.claude/skills/fly          # Claude Code
ln -s "$PWD/skills/fly" ~/.agents/skills/fly          # Pi
fly doctor                                            # checks pandoc, Typst, rmapi and the rmapi login
```

Bun's global bin directory (`bun pm bin -g`) must be on your PATH for the agents to find `fly`; in fish, `fish_add_path (bun pm bin -g)`.

The skill in `skills/fly` is the single copy; both agents read it through the symlinks, so edits here take effect in both. Follow any fixes `fly doctor` prints.

Then type `/fly`, `/fly conversation` or `/fly retry` in either agent, or ask it to send something to your reMarkable.
