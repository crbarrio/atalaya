# The `stack` repo

Everything atalaya needs from `stack`, and the changes made there. The repo itself is at
`../stack`.

## Pending

Nothing. Deploying atalaya itself is **not** pending: it is a clone and three compose commands,
decided already. See *Why not `stack`* in [app.md](app.md).

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
- [x] `stack catalogue` — what each application *is*, as JSON. Like `inventory`, it needs
      neither docker nor `.env`, so it runs unprivileged and needs no dispatcher entry. See below.
- [x] `stack versions --json`, so the panel can report which versions exist and which one a bare
      `deploy` would pick without parsing prose. See the dispatcher section below.
- [x] `MIGRATION.md` deleted: all three servers were migrated to the renamed layout and nothing
      referenced it. Recoverable from history if the rename ever needs retracing.
- [x] `stack secrets <inst> {--json|--set}` — the variables of one instance, read and written.
      See below.
- [x] The instance declaration left git and became machine state. See below.
- [x] `add` and `retire` rebuild the manifest they changed. `merge_manifest` runs at startup,
      before the declaration is written, so `stack inventory` — which is what atalaya reads — kept
      reporting the old set until some unrelated command happened to run.

## The declaration is machine state — 2026-08-30

`servers/<server>.json` says what this machine runs, and `stack add`/`stack retire` rewrite it in
place. It was also tracked in git, so one file had two owners — and the machines had already won
without anyone noticing:

```diff
   "wanikani": {
-    "client": "wanikani",
-    "database": "wnikani"      ← the repository
+    "database": "wanikani"     ← the machine
```

That correction was live on `marsella-test` and in no commit. A `git checkout --` or a fresh clone
would have pointed the instance at a database that does not exist.

`.gitignore` already drew the line, in these words: *"Deployed version of each application. This is
server state, not project state: each machine runs its own."* `servers/` was the last piece of
per-machine state on the wrong side of it, and the only one that had drifted. Applying the existing
rule, not inventing one.

**The file did not move**, only stopped being tracked. Relocating it to `state/` would have touched
`server_file()`, `merge_manifest`, `backup.sh`, both Python scripts and three documents for no
functional gain — and an ignored directory inside the repo is already the pattern here, shared with
`secrets/`, `backups/`, `apps/*/docker-compose.yml` and `traefik/dynamic/*.yml`.

**One writer, one copy.** `stack` still writes it; the terminal and the panel are two ways of
invoking `stack`, exactly as they already are for `deploy`. atalaya gains no second source of truth
— its `Instance` table stays a cache of what `inventory` reports. So the drift ends, each server
stays self-sufficient with atalaya down, everything is doable from the panel, and there is nothing
to reconcile.

Safety did not need adding: `backup.sh` already copies `servers/` into the encrypted engine
archive. `RESTORE.md` now says that archive is the only copy. atalaya's inventory cache is a second,
independent replica of the same facts.

`merge_manifest` creates an empty declaration when there is none, and `merge.py` stopped treating
"no instances" as an error — a machine that was just set up can now run `stack add` without a file
written by hand first, which is what onboarding a server from the panel will need.

**Migration.** A commit that deletes tracked files still deletes them from the working tree on
`git pull`, ignored or not. Each server's live copy was taken first, then the pull, then the copy
restored — so the machine's version became the truth with no repo copy left to contradict it. Git
refused the pull on `marsella-test` outright, protecting the drift rather than overwriting it.

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

## `stack catalogue` — 2026-08-30

`inventory` answers "what does this machine run". This answers the other half: what each
application *is* — description, repo, database engine, services with their images, volumes and
declared variables. That lives in `apps.json`, which reaches every server from the same git
repo, so it is fleet-wide information that happens to sit on each machine.

Reading `apps.json` needs neither docker nor `.env`, so like `inventory` it runs as the
unprivileged atalaya account and is excluded from the manifest merge at startup. **No dispatcher
entry**: nothing here can change anything.

Only variable **names** are emitted, never values. Values live in `secrets/`, which is `700` and
stays that way; names are what makes "which variables is this instance missing" answerable
without exposing anything — and they are what Phase 4 will need.

atalaya reads it from the first server that answers and reports which one, rather than merging
all three. The file is identical across the fleet today (same sha256, verified), but a server on
`develop` can legitimately carry a newer catalogue than one on `main`, so which machine answered
is worth showing rather than hiding. A stale copy is served if none answers: `apps.json` changes
rarely, and a catalogue read an hour ago beats an empty screen.

## `stack secrets` — 2026-08-30

`inventory` says what runs here, `catalogue` says what each application is. This says what one
instance is *configured with* — which variables it declares, which are set, and how to change
them. It needs `secrets/`, which is `700 ubuntu`, so unlike those two it goes through the
dispatcher and runs as the owner.

`--json` emits names, kinds (`required`, `optional`, `undeclared`) and set-or-not. **No value, no
length, no fingerprint.** Any of those turns a report that is safe to send over the network into
one that is not, and there is no field for them to go in.

"Set" means what `verify_secrets` means by it — a line matching `^NAME=.` — so an empty value is
unset, and so is the `# NAME=` form `stack add` writes for a variable still to be filled in.
Anything else would have the panel call a variable set that the deployment then refuses over.

`--set` reads `{"set": {...}, "unset": [...]}` from **stdin**. Not arguments: an argument is
visible in `ps` to every user on the machine for as long as the command runs, and these are
passwords. `sudo` and the dispatcher's final `exec` both pass stdin through untouched, so the
dispatcher never sees the value and needs no rule about it.

Three rules in `write_secrets.py`, all applied before anything is written:

- **Setting is limited to names `apps.json` declares.** The editor cannot invent keys, and the
  list it is checked against is in a file the calling account cannot write. This is the gate.
- **Unsetting is not limited**, deliberately: the leftovers of a retired feature are exactly what
  wants clearing, and clearing a value exposes nothing.
- Values are single-line, ≤ 4096 characters, no control characters. Not fastidiousness — the file
  is consumed as a Compose `env_file`, which cannot represent a newline in a value at all.

The write goes to a temporary file in the same directory, opened `600` from the start and renamed
over the original: no window with the value in a world-readable file, and a crash cannot truncate
the real one. Every line assigning a name is removed and the new one goes where the first was, so
uncommenting a `# NAME=` placeholder cannot leave a stale assignment behind it, and the file's
comments and ordering survive.

## The dispatcher could be bypassed — found and fixed 2026-08-30

Verifying the above turned up a hole in Phase 3's design, not in Phase 4's.

The atalaya account is in the owner's group so it can read `state/manifest.json`. Ubuntu gives an
account whose group matches its name a umask of **002**, so every file `git pull` wrote was group
writable — including `stack` itself, and `.git/hooks`. The dispatcher `exec`s `stack` as `ubuntu`,
who is in the docker group. So the account could replace the program the dispatcher runs, and
reach root through it.

The allowlist was bounding what could be *asked for* while the program answering could be
replaced. Measured, not theorised: `sudo -u atalaya test -w …/stack` returned true on
`marsella-test`.

Three changes, because one was not enough:

- `setup-server.sh` removes group and other write from the whole tree, `.git` **included** — a
  writable `.git/hooks` is the same hole by a slower route, since a `post-merge` hook there runs
  as the owner on the next pull.
- It sets the owner's umask to 022, **prepended** to `~/.bashrc`. The stock file returns in its
  first lines when the shell is not interactive, and `ssh <host> '<command>'` — which is how this
  repository actually gets updated — is not interactive, so a line appended at the end is never
  reached. Appending it was the first attempt and did nothing; `umask` still reported 002.
- The dispatcher itself refuses to run when `stack` or `scripts/` are writable by group or other.
  Checked on every call, not once at install time, because a pull can undo the permissions at any
  moment. This is the part that fails closed rather than silently reopening.

`verify()` now asserts the account cannot write what the dispatcher runs, so the check is part of
every setup run rather than something remembered.

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
`add` is absent too: creating an instance writes secrets and a database, which is its own decision
rather than a parameter.

`retire` was absent when this was written and is present now, in **both** its forms — including
`--with-data`, which deletes the volumes, the database and the secrets. Withholding it was taking
the operator's decision for them. The dispatcher accepts the flag only as the exact second
argument, so a malformed call cannot become a deletion, and `verify()` asserts that.

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
