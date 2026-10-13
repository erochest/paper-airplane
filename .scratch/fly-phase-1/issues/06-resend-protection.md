# 06: Resend protection and name collisions

**What to build:** Accidentally running `/fly` twice for the same Reply doesn't create a duplicate on the tablet. A deliberate resend still works with `--again`. No Dispatch ever overwrites another on the device.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] `fly reply` for a Reply that already has a landed Dispatch is refused, with a message giving the earlier document name and send time.
- [ ] `--again` overrides the refusal and creates a new Dispatch with its own ID.
- [ ] When a name would collide with an existing Dispatch in the Hangar, a counter suffix is added: `… (2)`, `… (3)`.
- [ ] Collision handling doesn't rely on rmapi's behaviour when a name already exists.
- [ ] Tests cover the refusal, `--again`, and the counter using the fake device.
