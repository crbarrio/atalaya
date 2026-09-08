# atalaya

Rules and pointers only. The content lives in `docs/`; this file says where.

## What this is, and where it stands

A self-hosted panel for the servers that run the `stack` deployment engine: one place to see
every instance's version, backups, certificates, metrics and incidents, and to run `stack` on
any server without a terminal. NestJS + Angular + Prisma/SQLite, Prometheus underneath as an
invisible engine, reachable over Tailscale only.

**Complete and in production** on `homeserver` since 2026-08-19; the last planned phase closed
on 2026-08-30. There is no half-built code. What accumulates now is ideas to weigh, and those go
to the decision log (see *Where pending work lives*), never into the code as markers.

## Layout

```
backend/            NestJS 11 API. Conventions in backend/CLAUDE.md
frontend/           Angular 22 + Tailwind 4. Conventions in frontend/CLAUDE.md
backend/prisma/     schema, migrations, seed. SQLite; client generated into backend/src/generated
infra/homeserver/   what runs on homeserver: one docker-compose.yml (Prometheus, Alertmanager,
                    blackbox, atalaya itself), rules, .env.example
infra/fleet/        setup-server.sh, the artifact run once on each managed server
docs/               reference and the decision log. Index: docs/README.md
```

Root `package.json` orchestrates with `concurrently` + `npm --prefix`; no npm workspaces.

## Running it locally

```bash
npm run install:all
cp backend/.env.example backend/.env     # set ENCRYPTION_KEY (openssl rand -base64 32)
npm run prisma:migrate
npm run dev                              # backend :3000, frontend :4200
```

Check at **http://localhost:4200**. The dev server proxies `/api` to `127.0.0.1:3000`
(`frontend/proxy.conf.json`); Swagger is at http://localhost:3000/api/docs. Identity is the
`DEV_USER_EMAIL` stand-in, since there is no `tailscale serve` in front.

For real data, tunnel to homeserver and point `PROMETHEUS_URL` / `ALERTMANAGER_URL` at the tunnel:

```bash
ssh -L 9090:127.0.0.1:9090 -L 9093:127.0.0.1:9093 homeserver
```

SSH to the fleet works from this workstation with the atalaya key (the `authorized_keys`
restriction allows it; see `docs/infrastructure.md`). **`marsella-test` is the test server**;
`madrid-prod` and `marsella-prod` have clients on them.

Production is a clone on `homeserver`, updated by `git pull` + `docker compose build` + migrate +
`up -d` (README). Never run that from a session without explicit confirmation.

## Before calling anything done

```bash
npm run build                        # both halves; the frontend build is the type check that matters
npm --prefix backend run lint        # WRITES: it runs eslint --fix. Only on a clean tree.
```

There is no frontend lint. The four `*.spec.ts` files are the scaffolding `nest new` / `ng new`
left; a green test run proves nothing. **Real verification is against a real server**: every
feature so far was proven on `marsella-test` (or `homeserver` for infra), and the docs record what
that found that inspection had not. "Compiles" is not "works".

## The `stack` repo

`../stack` is the deployment engine on every managed server. atalaya never reads its files:
it runs fixed subcommands and parses JSON contracts. The contracts and where each is implemented:

| Contract | In `stack` | Shape on this side |
|---|---|---|
| `stack inventory` | `scripts/inventory.py` | `backend/src/inventory/interfaces/stack-inventory.interface.ts` |
| `stack catalogue` | `stack` (reads `apps.json`) | `backend/src/catalogue/interfaces/catalogue.interface.ts` |
| `stack secrets --json/--set` | `scripts/secrets_report.py`, `scripts/write_secrets.py` | `backend/src/variables/interfaces/variables.interface.ts` |
| `stack versions --json` | `stack` | `backend/src/actions/interfaces/versions.interface.ts` |
| `stack add --json` | `scripts/add_instance.py` | `backend/src/instances/interfaces/instance-plan.interface.ts` |

A contract change is made in both repos in the same session, and `stack` gets its own commit
there. `stack` has no `CLAUDE.md`; its `README.md` and `RESTORE.md` are the reference.

## Rules that are not up for discussion

Each has its reasoning in `docs/architecture.md`; the rule alone is here so it is never forgotten.

- **The API binds `127.0.0.1` only**, and the guard refuses the identity header otherwise.
  Anywhere else, anyone on the tailnet can forge `Tailscale-User-Login`.
- **Never a free shell over SSH.** Every command is an entry in
  `backend/src/shared/ssh/ssh-commands.ts`, built as an argv from regex-checked values. The same
  list exists in the root-owned dispatcher `setup-server.sh` installs; that copy is the boundary.
  `exec` and `engine` are absent from both and stay absent.
- **atalaya never installs anything remotely.** It generates the artifact and verifies the result.
- **Secrets are write-only.** A value goes from a request body to SSH stdin and nowhere else:
  not logged, not audited, not returned, never an argument (visible in `ps`).
- **Every mutating action writes an `AuditEntry`.**
- **No bypass route around atalaya for alerts.** The watchdog through atalaya covers its outage.

## Conventions

- **English throughout**: code, comments, docs, commits, UI. A recorded decision (2026-08-18).
- **Commits**: `type: what changed, as a sentence` in lowercase. Types used: `feat`, `fix`,
  `docs`, `refactor`. The subject describes the outcome, not the mechanics: `fix: the monthly full
  backup was firing the missing-incremental alert`. Small, one type per commit.
- **Comments say why**, and record what testing found that reading did not. The code is written
  that way throughout; match it.
- Prettier: single quotes, trailing commas; frontend at 100 columns. Lint does not check format.
- No new dependencies without asking first.

## Where pending work lives

**`docs/decisions/`, one document per topic, indexed in `docs/decisions/INDEX.md`.** That index
is the only inventory of what is open. The repo diverges from the usual `docs/decisiones/` name
because of *English throughout*; the format is the shared one (dated file, header, per-section
status table).

- **No `TODO`/`FIXME` markers in code.** `git grep -n "TODO\|FIXME\|XXX\|HACK"` returns nothing
  today and should keep doing so: a marker turns an undecided idea into declared debt in code that
  is fine.
- **Reference documents carry no "Pending" section.** Each one used to; all four said "nothing
  outstanding" while two real deferrals sat in their prose. See
  `docs/decisions/docs-structure-2026-09-08.md`.
- A deferred item found while working goes to the decision log, not into the reference document
  and not into memory.

## Sessions

A session is one unit with a natural "done". On closing, what was learned goes to the repo:
a convention to the `CLAUDE.md` it belongs to, how something newly built works to its reference
document, what was examined or decided to the decision log with its line in the index. Update the
document that already covers a topic rather than opening a new one.

## Documentation

`docs/README.md` is the index. Do not repeat its list here or in the root README.
