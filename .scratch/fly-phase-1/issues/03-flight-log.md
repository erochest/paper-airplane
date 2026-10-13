# 03: Flight Log and `fly log`

**What to build:** Every Dispatch is recorded in the Flight Log: one SQLite database for the whole user account, kept in the platform's user data directory and outside every repo (see ADR 0003). Agents can ask `fly log` what has been sent, and get JSON back.

**Blocked by:** 01

**Status:** ready-for-agent

- [x] Each Dispatch is recorded with: Dispatch ID, kind, Session ID and host (when there is one), source reply reference (when there is one), project path, git remote, Session Title, document name, written-at and sent-at timestamps, state, and local PDF path.
- [x] `fly log` prints JSON for the current project's Dispatches. `--all` widens to every project, and `--session <id>` narrows to one Session.
- [x] Session Titles are stored per Session, so later tickets can fix a Session Title at the Session's first Dispatch.
- [x] Concurrent `fly` processes can write safely, using SQLite's own locking with no lock files.
- [x] The data directory can be set in tests (temporary directory), and tests assert only through `fly log` output, never on SQL layout.

## Comments

- Implemented. Notes for later tickets:
  - Ticket 04 should add the positive `fly log --session` test (a Session's Dispatches come back) once Session Dispatches exist; today only the File-Dispatch exclusion is tested.
  - `--session` filters on Session ID alone across hosts; the `sessions` table is keyed by (host, Session ID).
  - The data directory can be overridden with `FLY_DATA_DIR` (used by tests).
  - A File Dispatch's written-at is its sent-at, matching its name.
  - The record is written after upload; ticket 09 should decide what happens if the Flight Log can't be opened after a successful upload.
