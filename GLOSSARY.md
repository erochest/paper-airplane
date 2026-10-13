# Paper Airplane

Paper Airplane moves agent output onto a reMarkable 2 so it can be read and annotated on paper-like e-ink, away from the screen.

## Language

### What gets sent

**Session**:
One conversation between the user and an agent (Claude Code or Pi), which Dispatches are taken from.
_Avoid_: Chat, thread

**Reply**:
A single response from the agent within a Session.
_Avoid_: Response, message, answer

**Dispatch**:
A single document sent to the reMarkable, made from part or all of a Session, with a stable identity of its own.
_Avoid_: Export, upload, doc

**Session Title**:
A short name for a Session, fixed at its first Dispatch and shared by every Dispatch from it.
_Avoid_: Document title, name

**Long Reply**:
A Reply substantial enough to be worth reading on paper, as opposed to a short acknowledgement.

**Reply Dispatch**:
A Dispatch containing one Reply, by default the most recent Long Reply.

**Conversation Dispatch**:
A Dispatch containing the whole Session so far.
_Avoid_: Transcript export

**File Dispatch**:
A Dispatch made from a Markdown file the user names, rather than from a Session.

**Auto-Dispatch**:
A per-Session mode, switched on by the user, in which each long Reply automatically becomes a Reply Dispatch.
_Avoid_: Auto-send, watch mode

### Where it goes

**Hangar**:
The `Paper Airplane` folder on the reMarkable where every Dispatch lands.
_Avoid_: Inbox, outbox

**Grounded**:
The state of a Dispatch that was made but never reached the Hangar, kept so it can be sent again.
_Avoid_: Failed, pending

**Flight Log**:
The local record of every Dispatch sent: its identity, where it came from, and where it landed.
_Avoid_: Manifest, history, registry
