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
