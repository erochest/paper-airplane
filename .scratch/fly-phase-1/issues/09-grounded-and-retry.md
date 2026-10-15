# 09: Grounded Dispatches and `fly retry`

**What to build:** When an upload fails (no network, expired login, API change), nothing is lost. The rendered PDF is kept, the Dispatch is marked Grounded, and its local path is printed so it can be dragged into the reMarkable app by hand. `fly retry` later sends every Grounded Dispatch.

**Blocked by:** 03

**Status:** ready-for-agent

- [x] A failed upload saves the PDF in the user data directory, records the Dispatch as Grounded, and prints the failure reason and local path.
- [x] `fly retry` resends every Grounded Dispatch under its original name and Dispatch ID, and marks each landed on success. Dispatches that fail again stay Grounded.
- [x] `fly log --grounded` lists only Grounded Dispatches.
- [x] Tests use the fake device's failure modes (no login, network down) to cover grounding and retry.

## Comments

- Implemented. Notes for later tickets:
  - Any transport error (`ensureFolder`, `documentNames` or `upload`) grounds the Dispatch. Render failures don't, because there is no PDF to keep.
  - The PDF is kept at `<data dir>/grounded/<Dispatch ID>.pdf`. When it lands, the file is deleted and `pdfPath` is cleared.
  - A Grounded send prints its usual JSON line with `state: "grounded"` and `pdfPath`. The reason and path go to stderr, and the exit code is 1. `fly retry` prints one line per Dispatch. It exits 1 if any stay Grounded, and exits 0 with a stderr note when nothing is Grounded.
  - Deliberate decision: `fly retry` keeps the original name unless something has taken that name in the Hangar since. In that case it adds the usual counter ("(2)"), so that no Dispatch overwrites another (story 25). The Flight Log records the name it landed under. Revisit this if names must never change.
  - A Grounded record's `sentAt` is the time of the failed attempt. It becomes the landing time when the Dispatch lands.
  - `fly retry` and `fly log --grounded` cover every project, not just the current one.
  - `fly reply` refuses a Reply that is already Grounded and points to `fly retry`, unless `--again` is passed. Otherwise a retry would leave two copies on the device.
  - If a kept PDF has gone missing, `fly retry` says so, and the Dispatch stays Grounded. There is no way yet to discard a Grounded Dispatch.
  - Open: a Grounded Conversation Dispatch that a later one has superseded is still sent by `fly retry`. Two concurrent `fly retry` runs could send the same Dispatch twice.
  - Login-specific messages ("run `fly doctor`") are left to ticket 10. The fake device's failure messages are guesses at what rmapi prints.
