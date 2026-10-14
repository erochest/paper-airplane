# 06: Resend protection and name collisions

**What to build:** Accidentally running `/fly` twice for the same Reply doesn't create a duplicate on the tablet. A deliberate resend still works with `--again`. No Dispatch ever overwrites another on the device.

**Blocked by:** 04

**Status:** ready-for-agent

- [x] `fly reply` for a Reply that already has a landed Dispatch is refused, with a message giving the earlier document name and send time.
- [x] `--again` overrides the refusal and creates a new Dispatch with its own ID.
- [x] When a name would collide with an existing Dispatch in the Hangar, a counter suffix is added: `… (2)`, `… (3)`.
- [x] Collision handling doesn't rely on rmapi's behaviour when a name already exists.
- [x] Tests cover the refusal, `--again`, and the counter using the fake device.

## Comments

- Implemented. Notes for later tickets:
  - `Transport` gained `documentNames(folder)`. `send` lists the Hangar and picks the first free name (`… (2)`, `… (3)`) before uploading, so a taken name never reaches the transport. `RmapiTransport` parses plain `rmapi ls` (`[f]\t<name>` lines); that format was checked against a real device on 2026-10-14.
  - The fake device refuses an upload whose name is taken. That way the tests prove `fly` doesn't rely on what rmapi does with one. `FakeDevice.place()` seeds documents that this machine didn't send.
  - The resend check matches on host, Session and Reply reference with `kind = 'Reply'` and `state = 'landed'`, so Conversation Dispatches (07) aren't affected and a Grounded Reply (09) can be sent again.
  - Known gap: two `fly` processes sending the same name at the same moment can both pick it (list, then upload, isn't atomic).
  - For 09: the name now depends on listing the Hangar, and the listing fails when the network or login is down. Decide whether `retry` keeps the Grounded Dispatch's original name strictly or runs the counter again at retry time; a name picked offline may be taken by then.
