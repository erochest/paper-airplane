# 10: `fly doctor`

**What to build:** Setup problems are diagnosed before a send fails. `fly doctor` checks every external dependency and gives exact instructions for anything missing, including the one-time rmapi pairing the user has to do themselves.

**Blocked by:** 01

**Status:** ready-for-agent

- [x] Checks that pandoc, Typst and rmapi are installed, and reports their versions.
- [x] Checks that rmapi is logged in, without printing any token contents.
- [x] For each problem, prints an exact fix: `brew install typst`, `go install github.com/ddvk/rmapi@v0.0.35`, or "run `! rmapi` and enter the code from my.remarkable.com".
- [x] Prints JSON for agents and exits non-zero when anything is wrong.
- [x] Upload failures caused by a missing or expired login tell the user to run `fly doctor`.
