# The `stack` repo

Everything atalaya needs from `stack`, and the changes made there. The repo itself is at
`../stack`.

## Pending

**Phase 4 needs a secrets contract.** `stack` already computes required/optional/missing inside
`verify_secrets`; the panel cannot, because `secrets/` is `700 ubuntu`. Tasks tracked in
[app.md](app.md), but the `stack` half lands here:

- [ ] `stack secrets <inst> --json` — variable names and whether each is set. **Never values**;
      that is the whole reason it can be exposed at all.
- [ ] A dispatcher entry for writing one. The first that carries operator input rather than a
      name from a closed list, so its validation matters more than the others'.

**Phase 5 — atalaya as a `stack` instance.** Adding it to the catalogue closes the circle and
drops the one bespoke deployment path. Not obviously right, and worth deciding before building:

- [ ] Resolve the conflict [PLAN.md](PLAN.md) already records — atalaya's identity model is
      `tailscale serve` injecting a header into a loopback-bound process, while `stack` reaches
      instances only through Traefik by domain. Putting atalaya behind `stack` reintroduces the
      container-cannot-reach-host-loopback problem `network_mode: host` exists to solve.
- [ ] Decide what happens when atalaya deploys itself and the container restarts mid-action: the
      audit row is written on completion, so it would be lost.
- [ ] Weigh it against what replaced the old flow: install is already `git clone` plus three
      compose commands, so the bespoke path this phase removes is no longer very bespoke.

## Done

- [x] Repository translated to English, prose trimmed at the same time (~300 lines net removed).
- [x] `client` per instance in `servers/<server>.json`, emitted as a `stack.client` container
      label by `generate.py`.
- [x] `stack add`, symmetric to `retire`: declares the instance, writes its secrets file and
      creates the database. Non-interactive with `--dry-run` and `--json` so atalaya can drive it.
- [x] `optional` variables declared in the catalogue, plus checks for undeclared variables and
      for domain/`NODE_ENV` coherence.
- [x] `stack inventory` — the contract with atalaya. See below.
- [x] All three servers migrated to the renamed layout; every instance redeployed so the label
      landed.
- [x] The backup publishes its result as metrics. See below.
- [x] `stack add --reuse-secrets`, for re-adding a retired instance.
- [x] `stack` exports the deployed version per instance as a metric, the same way the backup
      does — `stack_deploy_info{app,version}`, written by `write_deploy_metric()`. Each version
      becomes its own series, live only while it was deployed, so ranging over it *is* the
      deployment history with no event log to keep.
- [x] `backup.sh` measures each volume's size and writes `state/<app>.volumes`, which
      `inventory.py` reads back. It is the one place with docker access that already walks every
      volume; the reading account has none.
- [x] Running `stack` from atalaya, through a dispatcher. See below.
- [x] `stack versions --json`, so the panel can report which versions exist and which one a bare
      `deploy` would pick without parsing prose. See the dispatcher section below.
- [x] `MIGRATION.md` deleted: all three servers were migrated to the renamed layout and nothing
      referenced it. Recoverable from history if the rename ever needs retracing.

## The backup as a metric — 2026-08-18

`backup.sh` writes one `.prom` file per mode into node_exporter's textfile directory. Nothing is
installed for it: node_exporter publishes whatever it finds there, and `setup-server.sh` already
makes the directory writable by `stack`'s owner.

```
stack_backup_success{mode="incremental"} 1
stack_backup_last_success_timestamp_seconds{mode="incremental"} 1787068607
stack_backup_duration_seconds{mode="incremental"} 259
```

Two decisions worth keeping:

- **A failure does not move the timestamp.** It is the time of the last *success*, carried
  forward from the previous file. Without that, "no good backup for 26 hours" could never fire,
  because every failed run would look recent. Verified by forcing a failure: `success` went to 0
  and the timestamp stayed put.
- **One file per mode.** "No incremental since yesterday" and "no full since last month" are
  different failures, and a single file would erase whichever mode ran last.

Written to a temporary file and renamed, because node_exporter reads the directory on every
scrape and would happily publish half a file.

### A defect the work uncovered

The translation had changed where the status file is uploaded, from `motor/` to `engine/`, while
everything else — and `RESTORE.md`'s first instruction — still points at `motor/`. So since the
migration the first thing you are told to check during a recovery has been returning a file from
before it. Fixed.

## `--reuse-secrets` — 2026-08-18

`retire` keeps the secrets and the database unless told otherwise, so `add` refused and offered
no way forward. That is what happened with `lyra`, which ended up added by hand.

The flag says the leftovers are intended, and then the secrets file is the source of truth: not
rewritten, no new password generated that would no longer match the user it names, database left
alone — and the database **name read from it**, from `DB_NAME` or the path of `DATABASE_URL`.
Deriving that from the instance name instead would have declared `lyra` while the application
connects to `lyra_app`.

## `stack inventory` — the contract, 2026-08-18

Rather than reading `state/` and `backups/` file by file, atalaya runs **one fixed command** and
parses one JSON document: every instance with its app, client, domains, database, current and
previous version, plus the last backup's status. That satisfies *never a free shell over SSH*
literally, takes one round trip instead of twenty-one, and stops atalaya knowing which file holds
what — the names it would have hardcoded are the ones `stack` renamed this same day.

Building it surfaced two things the panel has to respect:

**No `.env`.** The command reads the manifest `stack` already wrote instead of rebuilding it,
because rebuilding needs the server name from the `.env`, and the `.env` holds the database root
passwords and is out of the `atalaya` account's reach by design. The manifest's mtime comes back
as `manifest_at`, so staleness is visible rather than assumed away.

**No docker.** The `atalaya` account is not in the `docker` group — that group is root in all but
name — so it cannot see container state. The command answers `containers_observable: false` and
`state: "unknown"` rather than conflating it with `stopped`.

That second point splits the data sources cleanly, and the split is the right one:

| Question | Source |
|---|---|
| Which version is deployed, domains, database, backup status | SSH, `stack inventory` |
| Is it actually running | Prometheus, from cAdvisor |

atalaya already has the metrics engine; liveness is a question for it. Asking SSH would have meant
either lying or handing the panel the docker socket.

## Running `stack` — the dispatcher, 2026-08-27

`inventory` was designed to fit inside what the `atalaya` account can do: no docker, no `.env`.
Every other subcommand needs both — `.env` is `600 ubuntu` because it holds the database root
passwords — so none of them was reachable, and that was the blocker for Phase 3, not the UI.

The account now gets one narrow exception. `setup-server.sh` installs
`/usr/local/sbin/atalaya-stack`, owned by root, holding the list of subcommands atalaya may run,
and one sudoers line naming it exactly:

```
atalaya ALL=(ubuntu) NOPASSWD: /usr/local/sbin/atalaya-stack
```

No wildcard, so sudo has no pattern to match wrong. The allowlist lives in a file the account
cannot write, rather than in sudoers globs — historically a rich source of privilege escalation —
or in atalaya's own code, where a bug would widen what the server accepts.

Allowed: `status`, `versions` (optionally `--json`), `logs`, `deploy` (optionally
`--version <tag>`), `rollback`, `start`, `stop`, `backup {full|incremental}`. Instance names and
tags must match `^[a-z0-9][a-z0-9._-]*$`; arguments are forwarded as an array, never re-split
from a string. Each flag is accepted only on the subcommand that takes it — `logs --json` and
`versions --dry-run` are both refused.

`versions --json` exists for the same reason `inventory` does. The printed form is prose with
ANSI and unicode in it, and the panel needs three things from it: which versions are published,
which is running, and which one a bare `deploy` would pick — that last being the only way to say
"deploying would change nothing". Parsing the human output would have broken at the first label
change. The JSON rows are collected while that output is produced, so the two cannot disagree.

**`exec` is absent and must stay absent.** `stack exec` is `docker compose exec <svc>
<command...>` — a remote shell, which is the one thing PLAN.md prohibits outright. `retire` and
`add` are absent too: destructive and configuration-writing respectively, each its own decision
rather than a parameter.

`inventory` deliberately does **not** go through the dispatcher. It still runs directly and
unprivileged, so the panel keeps reading a server whose dispatcher has not been installed yet —
which is every server until the artifact is re-run.

What this costs, stated plainly: `ubuntu` is in the docker group, so anything running as `ubuntu`
is effectively root. The dispatcher's allowlist is the security boundary, and nothing else is.
`verify()` therefore asserts its refusals rather than assuming them, and `--uninstall` removes
the privilege along with the collectors.

## The English migration — 2026-08-18

The rename had no backwards-compatible fallback, so each server was migrated in the same window
as the deployment: `.env` variables, `state/*.anterior`, the `backups/` file names, the old
`traefik/dynamic/motor.yml`, and the cron line (`backup total` → `backup full`).

All three done. Two things it taught, recorded because they apply to any future estate-wide
change:

- Redeploying to pick up a label also **moves the instance to the latest build**, because
  `deploy` without `--version` takes the newest on the branch. Production redeploys must pin
  `--version` to whatever `status` reports.
- Old `<app>-interna` networks are left behind. Check each is empty individually rather than
  running `docker network prune`.

The renamed backup path was proved before trusting the nightly cron: an incremental was run by
hand on all three, and all three reported `OK` with every volume as `incremental, streamed`, so
the snapshot chain survived the directory rename.
