# 03: Flight Log and `fly log`

**What to build:** Every Dispatch is recorded in the Flight Log: one SQLite database for the whole user account, kept in the platform's user data directory and outside every repo (see ADR 0003). Agents can ask `fly log` what has been sent, and get JSON back.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Each Dispatch is recorded with: Dispatch ID, kind, Session ID and host (when there is one), source reply reference (when there is one), project path, git remote, Session Title, document name, written-at and sent-at timestamps, state, and local PDF path.
- [ ] `fly log` prints JSON for the current project's Dispatches. `--all` widens to every project, and `--session <id>` narrows to one Session.
- [ ] Session Titles are stored per Session, so later tickets can fix a Session Title at the Session's first Dispatch.
- [ ] Concurrent `fly` processes can write safely, using SQLite's own locking with no lock files.
- [ ] The data directory can be set in tests (temporary directory), and tests assert only through `fly log` output, never on SQL layout.
