# Email transport for alert delivery

| | |
|---|---|
| Type | decision |
| State | **closed** · 2026-08-20 |
| Opened | 2026-08-18 |

| Section | State |
|---|---|
| 1. The constraint | closed · 2026-08-18 |
| 2. What was built | closed · 2026-08-20 |

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
