# Email transport for alert delivery

| | |
|---|---|
| Type | decision |
| State | **open** again · 2026-09-10 (section 3) |
| Opened | 2026-08-18 |

| Section | State |
|---|---|
| 1. The constraint | closed · 2026-08-18 |
| 2. What was built | closed · 2026-08-20 |
| 3. The channel has been failing every send, and only the container log knows | **open** |

## 1. The constraint · CLOSED 2026-08-18

No self-hosted MTA on `homeserver`. Outbound mail from a residential IP lands in spam or gets
rejected — the kind of thing that works in testing and fails on the day it matters. A
transactional provider with SPF and DKIM on a domain we control was the likely answer.

The dead man's switch did not wait for this: healthchecks.io notifies through its own channels,
so the "everything is broken" case was covered before any SMTP question was settled. What waited
was ordinary alert delivery, which had nowhere to go until a channel existed.

## 2. What was built · CLOSED 2026-08-20

The question dissolved rather than being answered: the email channel takes **any SMTP host, per
channel**, configured from the UI and verified against the real server before the row is written
(a wrong password on purpose produced a genuine `535 Authentication credentials invalid`, and no
channel was saved). Which provider sits behind that is a per-channel setting, not a repository
decision. Details in *Alert delivery, first channel* in [monitoring.md](../monitoring.md).

## 3. The channel has been failing every send, and only the container log knows · OPEN

Found on 2026-09-10 while investigating something else
([collector-boot-race-2026-09-10.md](collector-boot-race-2026-09-10.md)). Every notification the
`Ionos` channel has attempted comes back:

```
[NotifierService] Could not notify 'Ionos': Mail command failed:
550-Requested action not taken: mailbox unavailable
550 invalid DNS MX or A/AAAA resource record
```

**The cause is DNS on the sender's side, not atalaya.** `crbarrio.es` publishes
`MX 10 mail.crbarrio.es`, and `mail.crbarrio.es` has no `A` and no `AAAA` record, so IONOS rejects
the envelope sender at `MAIL FROM` — nodemailer's "Mail command failed" is that stage, not the
recipient. `SPF` is `v=spf1 mx ~all`, which delegates to the same unresolvable host, so the zone
needs fixing in both places at once: an `MX` that resolves, and an `SPF` that authorises whoever
actually sends. That is a change in the IONOS zone, outside this repository.

**What is ours is that nothing surfaced it.** The failure is caught and logged
(`notifier.service.ts`), which was deliberate — a broken channel must not fail the webhook that
carries the alert — but the consequence is that a channel can be dead for weeks and the panel will
show it as `enabled` with nothing to suggest otherwise. Telegram delivered throughout, so the
alerts did arrive; had email been the only channel, nothing would have.

`verify()` at save time does not catch this and could not have: `transporter.verify()` proves the
credentials authenticate, and this send was refused several commands later, on a DNS record that
was fine at the time the channel was created.

Open: what the panel should show. The cheap version is a `lastError`/`lastSuccessAt` pair on
`NotificationChannel`, written by the notifier and rendered on the channel row in Settings — no
new machinery, and it turns "enabled" into something that can be contradicted. The question is
whether a channel failing repeatedly should also become an incident in its own right, which is
circular in the obvious way (the notification about notifications not working goes out over the
notification channels) and is arguably what healthchecks.io is already for.
