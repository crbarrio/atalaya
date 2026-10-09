# Resetting an instance's database from the panel

| | |
|---|---|
| Type | decision |
| State | **open** (design agreed, not built) |
| Opened | 2026-10-09 |

| Section | State |
|---|---|
| 1. What surfaced it | closed · 2026-10-09 |
| 2. What `stack` does today | closed · 2026-10-09 |
| 3. The design | agreed · 2026-10-09 |
| 4. Where a MySQL template lives | open |
| 5. What is deliberately left out | closed · 2026-10-09 |
| 6. Verification | open |
| 7. What the code already offers | closed · 2026-10-09 |
| 8. Until it is built | closed · 2026-10-09 |
| 9. Other database tools weighed | open |

## 1. What surfaced it · CLOSED 2026-10-09

`compas` is under development and only runs on `marsella-test`. Its schema was reshaped locally,
and the wanted step was "throw away the database there and start a new one". atalaya had no way to
do it. The only route inside the panel, `retire --with-data` + `add` + variables + `deploy`, also
deletes the volumes and the secrets file, so every variable has to be typed again to change one
database.

The request was for a solution that works for every app, not for `compas`.

## 2. What `stack` does today · CLOSED 2026-10-09

The two engines get their schema from different places:

- **Postgres apps** (`compas`, `enerflow`, `wanikani`, `fincas`) declare a `migrate` command per
  service in `apps.json` (`npx prisma migrate deploy`). `deploy` runs it in an ephemeral container
  of the new version before bringing it up, after `backup_db` when `backupBeforeMigrate` is set.
  On an empty database the next deploy rebuilds the whole schema by itself.
- **MySQL apps** (`booking-platform`, `energia-app`, `energia-datos`) have no equivalent. `add`
  creates an empty database and nothing loads the schema. The empty template is a `.sql` file
  versioned in each app's repository, mostly under `build/mysql/`, and it has been loaded by hand.

## 3. The design · AGREED 2026-10-09

Three pieces, the first two in `stack`, the third in both repos.

**A schema step for MySQL in `deploy`.** `apps.json` gains `database.schema`: the path of the
template **inside the app's image**. On `deploy`, right where `migrate` runs and only when the
database has no tables, `stack` reads the file out of the image of the version being deployed
(`docker run --rm <image>:<version> cat <path>`) and loads it. Then the deploy carries on as
usual.
- The template travels with the image, so every version brings the one that matches it. No copy
  on the server to drift, and the server needs no access to GitHub.
- It also fixes MySQL instances that are new: `add` + `deploy` gives a working app with no step in
  phpMyAdmin.
- It never touches a database that already has tables. Evolving an existing MySQL schema is a
  separate problem (migrations) and is not in scope.

**`stack db-reset <instance>`, the same for both engines.** Stops the instance, dumps the
database with `backup_db` and refuses to go on if the dump fails its checks, drops the database
and recreates it **with the same name, user and password**, then deploys the current version.
From there each engine follows its own path: `migrate` for Postgres, the schema step for MySQL.
Volumes and secrets are untouched. The dump is kept under `backups/<instance>/`, so the reset can
be undone.

**`stack db-load <instance>`, optional: load a dump with data.** For "use the database from my
machine". A `.sql` or `.sql.gz` uploaded in atalaya goes to SSH stdin, the way secrets do, and is
loaded into the freshly emptied database instead of the template. The same for both engines.

**In atalaya**: in the instance page's danger zone, *Reset database*, with a choice of
*empty schema* or *load a dump*. It needs the instance name typed, streams its output, and writes
an `AuditEntry`. Two new allowlisted commands (`dbReset`, `dbLoad`), in `ssh-commands.ts` and in
the dispatcher `setup-server.sh` installs. Neither takes SQL as an argument.

## 4. Where a MySQL template lives · OPEN

The template is in the repository, usually under `build/mysql/`, but being in the repository does
not put it in the image. The convention to agree before building:

- every MySQL app keeps its template at the same repository path, moved there where it is not;
- each Dockerfile copies it to the same path in the image;
- `apps.json` names that path explicitly in `database.schema`, with no default that hides it.

Checking each MySQL app's Dockerfile is the first step.

## 5. What is deliberately left out · CLOSED 2026-10-09

- **A SQL console in atalaya.** Free SQL with the root credentials is a free shell with another
  name. phpMyAdmin and Adminer, already linked from the server page, are where data is browsed and
  edited.
- **`stack` fetching the template from GitHub.** It would give every server read access to every
  app repository, and decouple the template from the version actually deployed.
- **Resetting through `retire --with-data` + `add`.** It deletes the secrets and volumes too.

## 6. Verification · OPEN

On `marsella-test`: a reset of `compas` (Postgres, rebuilt by `migrate`), a reset of a MySQL app
(rebuilt from its template), a load of a dump, and the refusal when the pre-reset dump fails.

## 7. What the code already offers · CLOSED 2026-10-09

Read in `stack` while designing, so the next session starts from it rather than from scratch.
Built in another environment, because this one cannot reach `marsella-test`.

- **The dump before the reset exists already**: `backup_db` in `stack` writes
  `backups/<instance>/pre-<version>.sql.gz` and checks it three ways (gzip, the engine's end marker,
  a size floor). The floor only applies when the dump has tables, so an almost empty database does
  not block it the way it blocked the first `retire` test in `app.md`. Today it only runs when a
  service sets `backupBeforeMigrate`; `db-reset` would call it unconditionally.
- **It connects as the application**, through `DATABASE_URL` (`read_db_url`). Dropping and
  recreating needs the engine's root, as `retire --with-data` does: `mysql -uroot` with
  `MYSQL_ROOT_PASSWORD` inside `stack-mysql-1`, `psql -U $POSTGRES_USER` inside `stack-postgres-1`.
- **Creating is `create_database`**, used by `cmd_add` with the user and password `add` generated.
  The reset reuses it with the user and password read from the existing `DATABASE_URL`, which is
  what keeps the secrets file valid. A recreated Postgres database must again belong to that user,
  or `prisma migrate deploy` fails on permissions.
- **The schema step goes in `cmd_deploy`** next to `migrate "$app" "$version"`, after the images
  are pulled (the template is read from them) and before `docker compose up`.
- **The allowlist** gains two entries in `backend/src/shared/ssh/ssh-commands.ts` and two cases
  in `infra/fleet/server-setup/setup-server.sh`, next to `retire`. `dbLoad` is the second command
  after `secretsSet` whose payload travels on stdin; its size limit has to be decided there.

## 8. Until it is built · CLOSED 2026-10-09

What resets a database today without retiring anything, using the managers the server page
already links to:

1. Stop the instance from atalaya, so nothing writes while the tables go.
2. In Adminer (Postgres) or phpMyAdmin (MySQL), drop every table, not the database: dropping the
   database would also lose the grants its user has on it.
3. **Postgres with Prisma** (`compas`): deploy from atalaya. `migrate` runs on the empty
   database and rebuilds the whole schema. **MySQL**: import the app's template, or a dump with
   data, through the manager's import screen. Its upload size limit can get in the way of a large
   dump.
4. Start or deploy from atalaya.

Not through `retire --with-data` + `add`: see section 5.

## 9. Other database tools weighed · OPEN

Discussed in the same session, before the reset became the concrete need. None is decided; each
is a candidate, ordered by cost.

- **A link from the instance page straight to its database.** The inventory already carries
  `database: {engine, name}` per instance, so the server page's phpMyAdmin/Adminer link could open
  the instance's database instead of the login screen. No change in `stack`. Unverified: whether
  each manager honours a `db=` parameter after its login has to be checked on `marsella-test`.
- **Read-only facts per database.** Size, table count, open connections, on the instance page.
  Needs a new `read` contract in `stack` (something like `db-info --json`).
- **Every database in the engine, on the server page, with the instance that owns it.** The value
  is the orphans: `retire` without `--with-data` leaves the database behind on purpose, and nothing
  in the panel says it is still there taking disk. The `wnikani`/`wanikani` mismatch recorded in
  [stack-integration.md](../stack-integration.md) is the kind of thing it would also surface.
  Shares the contract above.
- **Restoring a database from a backup.** `RESTORE.md` in `stack` is a manual procedure today.
  It would sit in the danger zone with the same gate as `retire --with-data`. Overlaps with
  `db-load` in section 3, which may make it a variant of that rather than its own command.
- **Rotating the database user's password.** `ALTER USER` and the instance's secrets file
  rewritten together, the value on stdin, then a deploy.

Not on the catalogue page (`/apps`): a database always belongs to an instance on one server, and
that page describes an application independently of where it runs.
