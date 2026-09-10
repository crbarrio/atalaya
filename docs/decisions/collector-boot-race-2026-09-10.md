# The collector that loses a boot race stays down for good

| | |
|---|---|
| Type | analysis |
| State | **open** (section 2) |
| Opened | 2026-09-10 — after the fleet was rebooted following an update on 2026-09-09 |

| Section | State |
|---|---|
| 1. What the `TargetDown` on `marsella-prod` actually was | closed · 2026-09-10 |
| 2. What did *not* fire, and whether absence should alert | **open** |
| 3. The downloads volume was never muted | closed · 2026-09-10 |
| 4. `$value` in the disk annotation is the projection, not the free space | closed · 2026-09-10 |

Three incidents sat in the inbox on the morning of 2026-09-10 and none of them said what they
appeared to say. This is what each turned out to be. The third, `NoRecentIncrementalBackup` on
`marsella-prod` from 2026-09-01, needs no section: it is the monthly-full-versus-incremental bug
already fixed in `ebe132f`, and the row is history rather than a live condition.

## 1. What the `TargetDown` on `marsella-prod` actually was · CLOSED 2026-09-10

It read as "the server is unreachable" and the server was plainly reachable — SSH answered and
cAdvisor was being scraped over the same tailnet address without a hiccup. The alert was true
anyway; only `node_exporter` was gone:

```
prometheus-node-exporter.service: failed (Result: exit-code) since 2026-09-09 21:44:27 UTC
err="listen tcp 100.126.236.127:9100: bind: cannot assign requested address"
Scheduled restart job, restart counter is at 5.
Start request repeated too quickly.
```

The collectors bind the tailnet address and nothing else (see [monitoring.md](../monitoring.md)),
and that address does not exist until `tailscaled` has brought the interface up. On the reboot
`node_exporter` got there first, failed to bind five times inside one second, exhausted systemd's
default start limit — and **that is permanent**. No further retry is ever scheduled once the burst
is spent. cAdvisor came through the identical race only because Docker retries a container with
backoff and no burst limit; the difference in outcome was entirely the supervisor, not the code.

`homeserver` is not exposed to this: its `node-exporter` is a container on `127.0.0.1`, an address
that exists before anything starts.

Fixed in the onboarding artifact rather than on the machine, since the machine was not what was
wrong: `install_node_exporter_ordering()` in
[setup-server.sh](../../infra/fleet/server-setup/setup-server.sh) writes a drop-in ordering the
unit after `tailscaled`, sets `StartLimitIntervalSec=0` so a late dependency stops being fatal,
and adds an `ExecStartPre` that blocks until the address actually exists. Ordering alone would not
have been enough — `tailscaled` being active is not the same as the address being assigned, and
systemd has no way to express the latter. The wait is a script on disk, not an inline
`ExecStartPre`, because systemd expands `$` in unit lines and a shell loop written there is
silently mangled.

`verify()` gained a check for it, which matters more than it looks: the race is invisible while
the machine is up, so nothing short of a reboot would have caught it, and by the time a reboot
happens nobody is watching. Applied to all three fleet servers the same day. Both branches of the
wait were exercised on `marsella-prod` — instant success on the real address, a clean failure
after the limit on an address that does not exist.

## 2. What did *not* fire, and whether absence should alert · OPEN

This is the part worth keeping. With the collector gone, `marsella-prod` published no series at
all — and every rule that watches it evaluates over series that had simply disappeared:

```
stack_backup_last_success_timestamp_seconds → marsella-test, madrid-prod, homeserver
                                              (marsella-prod: nothing)
```

`NoRecentBackup`, `NoRecentFullBackup`, `BackupFailed`, `DiskAlmostFull`,
`MemoryWillExhaustIn24h` — none of them *can* fire on a server that reports nothing. A vector
selector matching no series yields an empty vector, and an empty vector is not a firing alert. So
the server carrying the client instances went nine hours with its backups, disks and memory
unwatched, and the only thing standing between that and complete silence was one `TargetDown`
whose own wording invited dismissing it.

The backups had in fact run — `stack_backup_last_success_timestamp_seconds` came back with an
incremental from 02:02 the moment the collector was restarted. Nothing was lost. But nothing would
have told us either way.

Open question: whether the rule set should assert the *presence* of what it depends on, with
`absent()` or `absent_over_time()` per server, instead of leaning on `TargetDown` to imply it.
`TargetDown` does cover the case as long as the collector is what died. It does not cover a
collector that runs while its textfile directory has gone unwritable, which is a failure this repo
has already had once (see *One artifact, not three* in [monitoring.md](../monitoring.md)) and
which would again produce absent series with every target `up`.

Against it: an `absent()` rule per metric per server is a lot of rule surface, it needs a list of
which servers ought to publish what (`host` servers publish no `stack_backup_*` at all, by
design), and a server legitimately deregistered from the panel would start alerting about metrics
nobody expects any more. Not decided.

## 3. The downloads volume was never muted · CLOSED 2026-09-10

`DiskWillFillIn4Days` fired on `homeserver:/home/carlos/downloads` at 22:46 and resolved itself at
02:22. The disk is at 61% with 372 GB free; this is `predict_linear` extrapolating the churn of a
volume that fills and empties by design.

It is exactly the case the per-disk switches were built for — *Every disk, and switches for the
ones that lie* in [monitoring.md](../monitoring.md) names a downloads volume as the first of the
two reasons they exist. The switches were built and then applied to the other disk: the only
`DiskAlertPreference` row was `/var/lib/prometheus`. `trendAlerts` is now off for the downloads
volume too, `capacityAlerts` left on — a 984 GB disk that genuinely fills is still worth knowing
about; it is only the four-day projection that lies here.

Worth re-checking while nearby: the `/var/lib/prometheus` mute was justified on the grounds that
the disk "sits near 88% by its own retention cap". It is at 3% — 1.6 GB after 23 days, which
extrapolates to roughly 25 GB a year against a 79 GB disk. Whatever that reading was, it does not
hold now, and the mute may be hiding a signal rather than a lie.

## 4. `$value` in the disk annotation is the projection, not the free space · CLOSED 2026-09-10

The description said `Currently {{ $value | humanize1024 }}B free`, and `$value` is what the
expression returned — the `predict_linear` result four days out. Firing means that value is
negative, so **every** disk incident in the history reported a negative amount of free space, on
disks with hundreds of gigabytes left. It is the reason the downloads alert read as an emergency
rather than as noise. The annotation now says what the number is.
