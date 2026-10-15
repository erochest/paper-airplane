---
name: fly
description: Send a Reply or the whole Session to the user's reMarkable as a Dispatch, or resend Grounded Dispatches. Use when the user types /fly, /fly conversation or /fly retry, asks to send something to their reMarkable, or asks to check the reMarkable setup.
---

# fly

The `fly` CLI turns this Session into a Dispatch: it reads the Reply straight from the Session's transcript and sends it to the Hangar (the `Paper Airplane` folder on the reMarkable). Your job is to pick the mode, pick the Reply, and relay what the CLI says. The CLI is the only source of content; everything you pass it is a mode, a reference, a title or a flag.

## 1. Pick the mode

| The user asks for | Mode | Command |
| --- | --- | --- |
| `/fly`, `/fly reply`, "send this / the plan to my reMarkable" | `reply` (the default) | `fly reply` |
| `/fly conversation`, "send the whole Session" | `conversation` | `fly conversation` |
| `/fly retry`, "resend what didn't go through" | `retry` | `fly retry` |

Done when you have one mode. Ask only if the request fits none of them.

## 2. Pick the Reply (`reply` mode only)

- **No hint** ("send this", plain `/fly`): run `fly reply`. The CLI picks the most recent Long Reply.
- **A hint** ("the plan from this morning", "your second review"): run `fly replies`. It prints JSON, one entry per Reply, oldest first, with `ref`, `timestamp` (local time), `words`, `long` and `preview` (its first heading or line). Match the hint to one entry, then run `fly reply --reply <ref>`.

Done when you hold exactly one `ref`. If two entries fit the hint equally well, show the user both previews and ask which.

## 3. Send and relay

Run the command and read both stdout and stderr.

- **Landed**: stdout has one `{"id", "name", "state": "landed"}` line per Dispatch sent (`fly retry` can send several). Tell the user each Dispatch's name.
- **No Session Title**: stderr says the Session has no Session Title yet. Propose a short one (a few words naming what the Session is about) and ask the user. Once they accept it or give their own, rerun the same command with `--title "<title>"`. The first Dispatch fixes the Session Title for every later Dispatch from this Session, which is why the user decides.
- **Already sent**: stderr says the Reply already landed, or is Grounded, with its name. Relay that. Rerun with `--again` only when the user says they want another copy.
- **Grounded**: stdout has `"state": "grounded"` and a `pdfPath`. Tell the user it is Grounded, why (from stderr), and where the PDF is kept. If stderr points to `fly doctor`, go to step 4. Otherwise suggest `/fly retry` once the problem is fixed.
- **Any other `fly:` message** (no Long Reply, unrecognised transcript, not in a Session, nothing Grounded): relay it as it is.

Done when the user knows the Dispatch's name and state, or exactly why nothing was sent.

## 4. Fix the setup with `fly doctor`

Run `fly doctor` when a send fails because of a tool or the login, or when the user asks to check the setup. It prints JSON `{"ok", "checks"}`, where each failing check has a `problem` and an exact `fix`.

- Relay every failing check's problem and fix.
- The rmapi login fix (`! rmapi`) is interactive, so the user runs it themselves in the prompt. Wait for them to say it's done.
- Run an install fix only once the user agrees.

Done when `fly doctor` reports `"ok": true`, or the user declines a fix. Then rerun the command that failed, or run `fly retry` if a Dispatch was Grounded.
