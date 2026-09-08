# backend

NestJS 11, global `api` prefix, Prisma 7 over SQLite through `@prisma/adapter-better-sqlite3`.
Conventions below are read off the code, not the framework's defaults. Where they differ from
what Nest usually does, the code wins.

## Layout

```
src/<feature>/            controller, service, module, interfaces/*.interface.ts, mapper when rows ≠ views
src/shared/ssh/           ssh-commands.ts (the allowlist), ssh.service.ts (connects, executes, knows nothing else)
src/shared/prometheus/    thin client for /api/v1/query, query_range, alerts
src/shared/audit/         AuditService.record(): the only writer of AuditEntry
src/shared/crypto/        AES-256-GCM for channel credentials, keyed by ENCRYPTION_KEY
src/shared/guards/        TailscaleIdentityGuard, registered as APP_GUARD; @Public() opts out
src/generated/prisma/     generated, gitignored; `npm run prisma:generate`
prisma/                   schema.prisma, migrations/, seed.ts (`npm run seed`, uses tsx)
```

One module per feature directory, imported in `app.module.ts` (or by the module that uses it,
as `NotifierModule` is). Modules import each other's modules (`VariablesModule` imports
`ActionsModule`), never each other's providers directly.

## How things are done here

- **No `dto/` and no `class-validator` decorators**, though the pipe is installed with
  `whitelist` + `forbidNonWhitelisted`. Bodies are typed as interfaces and checked by hand in the
  service (`VariablesService.check`), because the real boundary is on the server and the check
  here exists to fail before a round trip with a better message. Say so in a comment when you do it.
- **Interfaces document contracts.** A file under `<feature>/interfaces/` that mirrors a `stack
  --json` output is the written contract with that repo; comment every field that carries a rule.
- **The actor is `request.user?.login ?? 'unknown'`**, pulled in the controller and passed down.
  Every mutating path records an audit row with names only, never values.
- **SSH is only reached through `ActionsService`**: `resolve()` (server exists, is `kind: stack`,
  instance exists, with one inventory refresh before giving up), `withLock()` for anything that
  changes an instance, `describe()` to turn a dispatcher refusal into a sentence the operator can
  act on. `SshService` itself is never injected into a feature to run a command on its own,
  except for the two unprivileged reads (`inventory`, `catalogue`).
- **Streaming is `@Sse()` over an Observable** wrapping `ssh.stream()`; the lock is released on
  completion, error and unsubscribe alike. Streamed endpoints are `@Get` because `EventSource`
  forces it; anything that carries a value is a real `PUT`/`POST` with a body.
- **Prometheus queries live in `monitoring/monitoring.queries.ts`**, named. No loose PromQL
  anywhere else.
- **Degrade, do not fail.** A server that does not answer keeps its last known state and the
  age of it; Prometheus being down leaves instance state as SSH reported it. A 500 because one
  data source is unreachable is a bug.
- **`unknown` is a real state** and reaches the API as `unknown`, never as `stopped`.
- **Errors are `BadRequestException(message)`** with the reason extracted from `stack`'s own
  `error: …` line (`messageOf` in `variables.service.ts`), so the panel shows the cause, not
  the plumbing.
- Comments explain why, and record what testing against a real server found. Match that.

## Recipe: a new feature that runs a `stack` command

Taken from `variables/` (read + write through the dispatcher) and `instances/` (a command with
its own flags). Every step exists in those two; compare against them.

1. **`stack` side, in `../stack`**: the subcommand exists and has a `--json` form whose stdout
   carries only the document. Narration goes to stderr (that bit `add --json` once).
2. **`src/shared/ssh/ssh-commands.ts`**: add the `CommandName`, its `CommandSpec` (`kind`,
   `streams`, `timeoutMs`, `needsInstance`, `subcommand`/`label` when the key is not what runs),
   and the argv branch in `buildCommand()`. Every value passes a regex before it joins the argv.
   Two entries for one subcommand when one form reads and the other writes (`secrets`/
   `secretsSet`, `add`/`addPreview`): a `read` takes no lock and no audit row.
3. **`infra/fleet/server-setup/setup-server.sh`**, the dispatcher heredoc: a `case` arm accepting
   exactly that shape and nothing else, and an assertion in `verify()` that a malformed call is
   refused. The dispatcher is the boundary; step 2 is convenience. A server refuses the new
   command until the artifact is re-run on it, and `ActionsService.explain()` already says so.
4. **`src/<feature>/interfaces/<feature>.interface.ts`**: the JSON contract, field by field.
5. **`src/<feature>/<feature>.service.ts`**: `actions.resolve()`, then `ssh.run()` /
   `ssh.runWithInput()` (stdin for anything secret) / `actions.stream()`; parse; on a JSON parse
   failure say the server's `stack` may predate the command. Wrap writes in
   `actions.withLock(key, …)` and record the audit row on both outcomes.
6. **Controller**: `@ApiTags`, `@ApiOperation({ summary })` on every route, actor from
   `request.user`. **Module**: imports `ActionsModule`; register in `app.module.ts`.
7. Prove it on `marsella-test` with the real `stack`, including the refusal paths, and write
   what that found into the feature's section of `docs/app.md` and the contract into
   `docs/stack-integration.md`.

## Schema changes

`npm run prisma:migrate` (that is `prisma migrate dev`; it prompts for a name). Migrations are
committed. Comment the field in `schema.prisma` with the rule it carries, as every field there is.
The client regenerates into `src/generated/prisma`, which is gitignored.

## Verifying

```bash
npm run build          # nest build
npm run lint           # eslint --fix: WRITES. Clean tree only.
```

`npm test` runs the one scaffold spec. Real verification is against `marsella-test`.
