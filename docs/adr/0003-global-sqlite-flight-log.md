# The Flight Log is one SQLite database for the whole user account

The Flight Log is a single SQLite database (via `bun:sqlite`) in the user's data directory, not a file per project or a file inside any repo. Annotation sync will need to look up any Dispatch found on the device, whichever project it came from. Several agent sessions may write at once, and SQLite handles that safely without lock files on both macOS and Windows. Keeping the log outside repos means it can never be committed by accident.

## Consequences

Each record stores the project path and git remote so Dispatches can still be found by project. Agents query it only through `fly log`, never by opening the database, so the database layout can change without breaking them.
