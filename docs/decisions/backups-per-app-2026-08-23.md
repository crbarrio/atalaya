# Backup status is server-wide, not per app

| | |
|---|---|
| Type | analysis |
| State | **open** |
| Opened | 2026-08-23 |

| Section | State |
|---|---|
| 1. What surfaced it | closed · 2026-08-23 |
| 2. What `stack` reports today | — |
| 3. What per-app would take | open |

## 1. What surfaced it · CLOSED 2026-08-23

Deploying a new app (`pulsar`) surfaced the real complaint: atalaya's "backup failed" says
nothing about *which* app or *why*. Its first backup after deploy failed because incremental mode
diffs against a previous snapshot and a brand-new instance has none, and `backup.sh` `die()`s on
that, aborting the *whole* server's backup run for every other instance too.

The specific failure was fixed the same day: `cmd_deploy` seeds a full backup right after the
first successful deploy of an instance (recorded in *First-deploy backup seeding* in
[monitoring.md](../monitoring.md)). That closes one failure mode and does nothing for the
diagnostic message in general, which is what this document is about.

## 2. What `stack` reports today

Server-wide, at every layer: `backup.sh` writes one `last_status` file for the whole run, `die()`
on any instance's failure aborts the *entire* run rather than just that instance (so a bad
instance mid-loop can silently skip every instance after it too), the Prometheus metrics
(`stack_backup_success{mode}`) carry no instance label, and `stack inventory`'s `backup` field
sits at the top level of the JSON, a sibling of `instances[]`, not nested inside each one. There
is no per-instance signal anywhere to surface.

## 3. What per-app would take · OPEN

`backup.sh` catching a failure and continuing to the next instance instead of dying; a status
recorded per instance instead of one shared file; metrics labelled by instance; `stack inventory`
moving `backup` inside each instance; and atalaya's `Instance` cache, the Backups screen and the
backup rules following. Real work across both repos.

**Deliberately not done**, in favour of the smaller fix above, which was the actual trigger.
Revisit if "which app, and why" keeps coming up.
