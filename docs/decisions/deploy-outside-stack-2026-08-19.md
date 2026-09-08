# Deploying atalaya: not as a `stack` instance

| | |
|---|---|
| Type | decision |
| State | **discarded** · 2026-08-27 (the idea of running atalaya through `stack`) |
| Opened | 2026-08-19 |

| Section | State |
|---|---|
| 1. Why not `stack` | closed · 2026-08-19 |
| 2. Phase 5, revisited and dropped | discarded · 2026-08-27 |
| 3. What deploying atalaya is instead | — |

## 1. Why not `stack` · CLOSED 2026-08-19

The obvious move once the Dockerfiles existed was to onboard atalaya as just another `stack`
instance, the same as any client application. Rejected: `stack` reaches every instance through
Traefik, by domain, over its own isolated Docker network — a completely different exposure model
from atalaya's, which is `tailscale serve` injecting `Tailscale-User-Login` straight to a process
bound to the host's real loopback. Putting atalaya behind `stack` would reintroduce the exact
container-cannot-reach-host-loopback problem `network_mode: host` was built to solve for
Prometheus and Alertmanager, and would mean giving up the tailnet-only identity model for a
public-domain one.

`deploy/` was removed; `infra/homeserver/atalaya/` replaced it. No registry push, no CI pipeline
putting atalaya through `stack`'s `ghcr.io` flow: the repo is cloned on `homeserver` and built
there.

## 2. Phase 5, revisited and dropped · DISCARDED 2026-08-27

The plan had a Phase 5: add `atalaya` to `stack`'s catalogue and run it as one more instance, to
avoid a separate deployment mechanism for this one app. Dropped, for reasons that were already on
the page before this became a phase to schedule:

- **The identity models conflict.** Section 1 above.
- **The mechanism it would replace is barely a mechanism.** Deploying atalaya is `git clone`,
  edit one file of two values, and three compose commands. That was true only after the install
  rework of 2026-08-25; the "separate deployment mechanism" this phase was written against — a
  scratch clone, a build, and a directory swap — no longer exists.
- **It would have atalaya deploy itself.** The audit row is written on completion, so the one
  action guaranteed to restart the process mid-run is the one that would never be recorded.

## 3. What deploying atalaya is instead

A clone on `homeserver`, `git pull`, `docker compose build`, `prisma migrate deploy`, `up -d`.
The README's *Install* section is the whole procedure. It is done by hand, on purpose.
