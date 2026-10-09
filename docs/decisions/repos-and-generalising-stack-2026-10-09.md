# One repository or two, an app contract, and making `stack` usable by others

| | |
|---|---|
| Type | analysis |
| State | **open** (nothing decided; written down so the next session starts from it) |
| Opened | 2026-10-09 |

| Section | State |
|---|---|
| 1. Merging `atalaya` and `stack` into one repository | recommended against · 2026-10-09 |
| 2. A contract for new applications | open |
| 3. Generalising and publishing | open |

The question, in three parts: `atalaya` depends entirely on `stack` while `stack` works alone as a
CLI, so should they be one repository; can the way an app has to be built for `stack` be written
down as rules for new apps; and what would it take to publish both for anyone to use.

## 1. Merging `atalaya` and `stack` into one repository · RECOMMENDED AGAINST 2026-10-09

The dependency is real but runs one way, through a narrow and deliberate boundary. Merging would
erase what works.

- **They are deployed in different places.** `stack` is a clone on every managed server, updated
  with `git pull`; `atalaya` lives only on `homeserver`. In one repository every client server
  would carry the NestJS/Angular code, and every panel commit would show as a pending change on
  production servers that do not use it. Avoiding that means sparse checkouts or separate
  packaging: complexity to solve a problem that does not exist today.
- **The boundary is already a contract, not shared code.** `atalaya` never reads `stack`'s files:
  it runs fixed subcommands and parses JSON (the table in the root `CLAUDE.md`). That is what lets
  `stack` change how it stores things without breaking the panel. In one repository, importing
  directly becomes the easy path.
- **`stack` has value on its own**, which matters for publishing: a deployment engine without a
  panel is what many people will want, and a small self-contained repository is easier to read,
  audit and adopt.
- **Bringing `atalaya` closer to `stack` was tried and went badly**:
  [deploy-outside-stack-2026-08-19.md](deploy-outside-stack-2026-08-19.md), the identity models
  conflict.

What does hurt is changing a contract in two places at once. That is solved without merging:

- **Version the contract.** A `"contract": N` field in every JSON output, or a
  `stack contract-version`. `atalaya` could then say "`stack` too old on `marsella-prod`" instead
  of failing to parse. Today a version skew between servers cannot be detected.
- **Publish the contract as JSON Schema in `stack`**, with a real sample output `atalaya` validates
  against, so the contract stops being a TypeScript and a Python shape that are hoped to match.

Merging would make sense in one case: if, on publishing, the product is `atalaya` with `stack` as a
component, and `stack` stops being installed by `git clone` and is shipped as a versioned release.
While servers `git pull` the repository, two repositories is right.

## 2. A contract for new applications · OPEN

The rules exist implicitly in `apps.json` and in `stack`'s code. Written down as an application
contract, they are:

| Rule | Why `stack` requires it |
|---|---|
| Images built by CI and published to a registry, tagged like `20260815-1046-develop-fadaf4c` | The server builds nothing and keeps no code. Deploying is picking a tag and pulling; `versions` and `rollback` depend on the format. |
| All configuration through environment variables, declared as required (`env`) or optional (`optional`) | `deploy` refuses to start with a required one missing, and it is what lets `atalaya` fill variables without reading the code. |
| Database: the shared Postgres 17 or MySQL 8, read from `DB_*` or `DATABASE_URL`, one database per instance | `stack add` creates the database, user and grants, and backs them up. The app brings no database container of its own. |
| Migrations as a separate, idempotent command inside the image (`migrate`), never at start | A failed migration leaves the previous version running instead of a container in a restart loop. |
| Backward-compatible migrations (add before removing) | `rollback` goes back to the previous image but does not undo the schema. |
| For MySQL apps, the empty schema template in the image | See [database-reset-2026-10-09.md](database-reset-2026-10-09.md), section 4. |
| Stateless containers; anything persistent only in declared, stable named volumes | Backups cover the database and the volumes only. Renaming a volume orphans its data. |
| Exactly one service receives traffic (`proxy: true`), plain HTTP on one port | Traefik terminates TLS and owns the domain. The app has to trust the proxy headers (`compas` needs `TRUST_PROXY=2`). |
| A healthcheck path that answers 200/302 without a session | It is what `deploy` checks before keeping a version, and what monitoring probes. |
| Logs to stdout/stderr, clean stop on SIGTERM | `stack logs` and Docker assume both. |
| Background work as one more service, same image, different `command` | The `booking-platform` cron pattern: if the daemon dies, the container dies and Docker restarts it. |
| One client = one instance | One instance per client, with its own database and `stack.client` label; no multi-tenancy inside the app. |

Three pieces would make this usable when starting a new app:

1. An `APP-CONTRACT.md` in `stack` with these rules.
2. A template repository: a multi-stage Dockerfile, the CI workflow that publishes with the right
   tag format, a health endpoint and a sample `migrate`.
3. Later, `stack check-app <image>`, checking what can be checked: the image starts, answers the
   healthcheck, and the migration command exists.

## 3. Generalising and publishing · OPEN

The biggest obstacle is not technical: **the app catalogue lives inside the engine's repository**.
`apps.json` describes `booking-platform`, `compas`, `enerflow`… and its default registry is
`ghcr.io/crbarrio`. For anyone else to use `stack`, engine and catalogue have to separate. Two ways:

- (a) each app carries its own `stack.json` in its repository, read by `stack add`;
- (b) the catalogue lives in a configuration repository of the user's, which `stack` points at
  from its `.env`.

(b) is the leaning: less invasive, and it keeps the rule that the server holds no application code.

Then, in order:

1. **Remove the values that are this fleet's**, checked on 2026-10-09:
   - `TZ` defaulting to `Europe/Madrid` in `scripts/generate.py` (and `defaults.tz` in `apps.json`);
   - the default registry in `apps.json`;
   - the pinned `mysql:8.0` / `postgres:17-alpine` images;
   - the container names `stack-mysql-1` / `stack-postgres-1`, written into `stack` in 7 places;
   - in `atalaya`, the default `STACK_DIR=/home/ubuntu/docker/stack` in
     `infra/fleet/server-setup/setup-server.sh` and `setup-script.service.ts`. `stack` itself
     resolves its own root and has no such path.
2. **The versioned contract** from section 1. Essential once every user has version combinations
   nobody controls.
3. **Reproducible installation**: an installer or versioned release of `stack` instead of "clone
   and edit"; for `atalaya`, the existing `setup-server.sh` documented for third parties.
4. **Close the open security items**:
   - [ssh-host-keys-2026-09-08.md](ssh-host-keys-2026-09-08.md): this log already says it must
     change before anything runs off the tailnet;
   - state that `atalaya` requires Tailscale for identity, or offer another way to authenticate.
     It is the first thing a public user will ask.
5. **Clean up before publishing.** The history and the docs carry client names, real domains
   (`cvg.cat` in `stack`'s README) and server names. The cleanest route is publishing with a fresh
   history, after a secrets scan over the whole existing one. Not done: the clone in this session
   was shallow.
6. **Choose a licence.**
7. **More engines** (Redis, SQLite on a volume, other versions) only when someone asks. The rules
   in section 2 cover most web apps.
