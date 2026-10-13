# 09: Grounded Dispatches and `fly retry`

**What to build:** When an upload fails (no network, expired login, API change), nothing is lost. The rendered PDF is kept, the Dispatch is marked Grounded, and its local path is printed so it can be dragged into the reMarkable app by hand. `fly retry` later sends every Grounded Dispatch.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] A failed upload saves the PDF in the user data directory, records the Dispatch as Grounded, and prints the failure reason and local path.
- [ ] `fly retry` resends every Grounded Dispatch under its original name and Dispatch ID, and marks each landed on success. Dispatches that fail again stay Grounded.
- [ ] `fly log --grounded` lists only Grounded Dispatches.
- [ ] Tests use the fake device's failure modes (no login, network down) to cover grounding and retry.
