# The application

The monorepo itself: backend, frontend, and what is built so far.

## Pending

- [ ] The SSH client does not verify host keys. Over Tailscale the transport is already
      authenticated end to end by WireGuard, so impersonating a node means having compromised it,
      but this is a deliberate omission rather than an oversight and worth revisiting before
      anything runs outside the tailnet.

## Done

- [x] Monorepo scaffolded: `backend/` (NestJS 11), `frontend/` (Angular 22 + Tailwind 4),
      `backend/prisma/` (SQLite).
- [x] Tailscale identity guard, registered as `APP_GUARD` so routes are private by default.
- [x] Inventory module over SSH, against the `stack inventory` contract.
- [x] The four v1 screens — overview, server, instance, backups — wired to the real API
      (`httpResource()`), no fake data left. See below.
- [x] Liveness from Prometheus: SSH's `unknown` is resolved against cAdvisor's live container
      set on every request. See below.
- [x] Full metrics dashboard: CPU/RAM/disk (server, Overview cards, and per-instance/engine),
      capacity days-remaining, scrape health, backup duration, active alerts, uptime/load — all
      from `GET /api/monitoring/:name/metrics`, polling every 30s. See below.
- [x] Alertmanager + watchdog: `POST /api/webhooks/alertmanager`, `Incident` upserts, healthchecks
      ping for `Watchdog`. Full chain verified on `homeserver` — Prometheus → Alertmanager →
      webhook → healthchecks.io ping received. See *Alertmanager + watchdog* in
      [monitoring.md](monitoring.md).
- [x] `deploy/` replaced by `infra/homeserver/atalaya/`: atalaya is **not** `stack`-managed — see
      *Why not `stack`* below.
- [x] **atalaya deployed and live on `homeserver`**: `network_mode: host`, published on the
      tailnet at `https://ubuntu.example-tailnet.ts.net/` via `tailscale serve --bg 4200`.
      `marsella-test` registered (`prisma/seed.ts`) and reading real inventory in production.
- [x] **Incident inbox screen**: `/incidents` lists every `Incident` (firing/resolved, most recent
      first), with per-incident silencing pushed straight to Alertmanager's REST API
      (`POST /api/incidents/:id/silence`) rather than reimplemented in atalaya.
- [x] **Server registration** — the last v1 piece. `POST /api/servers` records the row and
      regenerates `targets/*.json`; `GET /api/servers/:name/setup-script` personalises
      `infra/fleet/server-setup/setup-server.sh` by rewriting its own `--- Defaults ---` block (IP,
      ports, `--atalaya-key`/`--atalaya-from`) so running it needs no flags at all;
      `POST /api/servers/:name/verify` is three traffic lights — `node_exporter` and `cAdvisor`
      probed directly (answers the moment the artifact finishes, before targets even exist),
      `prometheus_target` through Prometheus's own `up`, which proves the whole chain including
      the regenerated targets actually being scraped. The form asks only the machine's tailnet
      name — IP resolved over MagicDNS, `host` = that IP. A modal off the topbar's Register
      Server button, the same pattern `compas` uses — not a routed page, after all three fleet
      servers went through it cleanly. See below.
- [x] **Deregistering a server**: `DELETE /api/servers/:name` drops the row (instances and
      provision checks cascade; incidents keep their history with `serverId` set null) and
      regenerates `targets/*.json`, triggered from a "Danger zone" section on the server detail
      page with an inline confirm step. Deregistering only removes the machine from atalaya's
      registry — node_exporter and cAdvisor keep running on it. No new script needed for that:
      `setup-server.sh` already had an `--uninstall` mode, so the confirm step offers the same
      personalised artifact `GET /api/servers/:name/setup-script` already serves for onboarding —
      downloaded and run once, before or after — and disables "Yes, deregister" until it has been.
      That gate exists because building this feature deregistered the one real test server by
      accident: two clicks land on "Deregister" then "Yes, deregister" in roughly the same screen
      position, and a stray click meant for the first can land on the second once the confirm step
      is showing.
- [x] **Settings screen** for the one value with no other home: the Watchdog ping URL. A singleton
      `Settings` row rather than a key-value table — there is exactly one setting today, and a
      generic table would solve a problem that does not exist yet. `HEALTHCHECKS_URL` as an env
      var is gone entirely, not just from the example files — the screen (at `/settings`,
      replacing the sidebar's disabled "System Logs" placeholder) is the only way to set it now,
      so it must be re-entered there after this deploys or Watchdog pings stop silently. Confirmed
      the value is genuinely global, not per-server, by checking
      `infra/homeserver/prometheus/rules/watchdog.yml`: one `vector(1)` rule, no `server` label,
      before building anywhere for it to live.
- [x] **Topbar search — 2026-08-23**: `GET /api/search?q=` matches servers by name and instances
      by name/`app`/`client` in one query each, substring, case-insensitive for free on SQLite.
      Debounced with Angular 22's native `debounced()` signal (`@angular/core`) rather than the
      manual `toObservable`/`debounceTime`/`toSignal` RxJS interop dance, chained into
      `httpResource` — which itself skips the request entirely while the box is empty, so there is
      no "search for nothing" round trip either. Verified against real production data: "mad" →
      `madrid-prod`, "circ" → every acme instance across both `marsella-test` and
      `madrid-prod` (matched via `client`, not just `name`), same as the two examples that framed
      the feature.
- [x] **Instance rows fully clickable, explicit back buttons — 2026-08-23**: the server page's
      instance table used to navigate only from the name cell; the whole `<tr>` does now
      (`routerLink` works on any element, not only `<a>`), with a chevron that fades in on hover
      as the affordance and `$event.stopPropagation()` on the nested instance-name and domain
      links so a click there does not *also* fire the row's own navigation. Both detail pages
      (server, instance) gained an explicit "← Back" button — by route, not `Location.back()`,
      since a bookmarked or refreshed detail URL has no in-app history to return to.
- [x] **Mobile-responsive layout — 2026-08-23**: the panel was desktop-only (fixed always-visible
      sidebar, instance table with only horizontal scroll on narrow screens). Added a
      `MobileNavService`-driven off-canvas drawer sidebar (hamburger toggle, backdrop, auto-close
      on navigation) below the `lg` breakpoint; a stacked-card fallback for the server page's
      instance table (`md:hidden` alongside the existing `hidden md:block` table); responsive
      widths for both CDK dialogs (register-server, channel-form-dialog) and their form grids;
      and `flex-col`/`flex-wrap` fixes on a few rows (danger zone, notification channels, history
      chart peak stats) that overflowed at narrow widths. Verified with Playwright at 375×812.
- [x] **A `host` server type — 2026-08-25**: `homeserver` runs no `stack`, so the screens that
      assume instances and backups had to say so rather than show zeros and a red "NEVER". The
      card drops the running/unknown/down counts, the "last read" line and the backup footer,
      keeping the metrics half; the server page swaps the instance table for a list of the
      machine's containers (docker's own names — `instanceOfContainer` expects stack's
      `app-<instance>-<service>-N`) and hides the danger zone, since deregistering hands back a
      cleanup script for a machine atalaya provisioned and this is not one. Design and the
      backend half in [monitoring.md](monitoring.md).
- [x] **Per-disk usage and alert switches — 2026-08-27**: one usage bar per mounted filesystem
      instead of a single hardcoded `/`, fullest first, on both the card and the server page.
      Each carries two checkboxes — `trend` and `capacity` — that switch off the corresponding
      alert for that disk alone, for the disks that sit near-full or churn by design. Absent
      preference means both on, so a new disk needs no setup. Backend and the reasoning in
      [monitoring.md](monitoring.md).
- [x] **Actions, with a live console — 2026-08-27**: `deploy`/`rollback`/`stop`/`start`/`logs` on
      the instance page, `status`/`backup` on the server page. Confirmation is inline rather than
      a dialog — the same shape the danger zone already proved — and names the instance, the
      server and, for `rollback`, the exact version it would return to: the buttons look alike
      and act on different things.
      `actions/` in the backend gates three things before SSH — the command is in the catalogue,
      the instance exists (checked against the cache, refreshed once before giving up, which is
      PLAN.md's requirement and was until now unimplemented), and no other mutating action holds
      that instance. Streaming is `@Sse()` over an Observable wrapping the same `ssh2` exec;
      `nginx.conf` had `proxy_buffering off` waiting for it since the infra reorganisation.
      Output needs real parsing: `stack` colours its output and, under a pty, `docker compose`
      adds cursor redraws. `shared/console-output.ts` strips escapes, collapses `\r` redraws to
      what stayed visible, and keeps a chunk that ends mid-line open for the next one. The pty
      itself was needed to stop `logs` leaking processes — see
      [stack-integration.md](stack-integration.md) — and it turns every newline into `\r\n`,
      which the redraw handling first read as "replace this line", rendering every line empty.
- [x] **Real version data, and two columns — 2026-08-27**: the version card showed the inventory
      cache — what was deployed as of the last read — which goes stale the moment anything is
      deployed outside the panel, and said nothing about what is *available*. It now reads
      `stack versions --json` on entering the page: what stack currently sees, whether a newer
      version is published, which branch the server follows, and which tag a bare deploy would
      pick. Deploy gained a selector, so choosing a specific version no longer needs a terminal;
      the backend already accepted `--version` and nothing surfaced it. A `Versions` button still
      shows the printed form, which carries sizes and which images are downloaded — detail a
      dropdown would lose. The page was also capped at `max-w-2xl`, leaving one narrow column on
      the left. Two columns was the first attempt and was wrong: Actions is a row of buttons, so
      it left a tall empty gap beside the information cards whenever nothing was running. The
      toolbar and its console run full width instead — the console reads better wide anyway — and
      the four information cards sit in a two-column grid below, where their heights balance.
- [x] **Errored resources no longer blank a page — 2026-08-27**: reading `.value()` on a failed
      `httpResource` throws, and a throw during change detection takes the whole view with it.
      With Prometheus unreachable, one 500 from the deploy-history request stopped the entire
      instance page rendering — actions included. Found while testing actions, not by inspection.
      `shared/resource-value.ts` guards the four reads that could do it.

## Layout, modelled on `compas`

Reusing a layout already in daily use beat inventing one. What `compas` does:

| Aspect | `compas` |
|---|---|
| Monorepo | **No npm workspaces.** Root `package.json` with `concurrently` + `npm --prefix`. |
| Directories | `backend/` and `frontend/`, each with its own `package.json` and install. |
| Backend | NestJS 11, global `api` prefix, Swagger, `class-validator`, global filter. |
| Backend layout | Feature modules (`controller`/`service`/`module`/`dto`) plus `shared/`. |
| Frontend | Angular 22 standalone: `core/`, `features/`, `layouts/`, `shared/`. |
| ORM | Prisma 7 in `backend/prisma/`, client generated into `backend/src/generated/prisma`. |
| Deployment | ~~`deploy/`~~ → `infra/homeserver/atalaya/`, `network_mode: host` instead of an internal Docker network. See *Why not `stack`* below. |

Deliberate divergences: **SQLite instead of Postgres** (single user, self-hosted, almost no data
kept), which needs Prisma's `@prisma/adapter-better-sqlite3` rather than the `pg` one; identity
from the `Tailscale-User-Login` header instead of JWT cookies; and **no i18n** — one user, English
UI, cheap to add later and expensive to carry unused.

### Decisions taken while scaffolding

- **Angular 22 sets up Tailwind itself** via `ng new --style=tailwind`: it writes
  `.postcssrc.json` and the `@import 'tailwindcss'`. No `tailwind.config.js` — v4 is configured
  from CSS.
- **Prisma 7 no longer accepts `url` in the schema.** The connection string moved to
  `prisma.config.ts`, and the client reaches the database through a driver adapter. Seeding needs
  `tsx` rather than `ts-node`: the generated client is TypeScript with explicit `.js` import
  extensions, which ts-node cannot map back.
- **`eslint-plugin-prettier` removed.** Linting formatting turns every space into an error and
  buries real findings. Prettier stays available as `npm run format`.
- **The runtime image is Debian slim, not Alpine.** `better-sqlite3` is a native module whose
  prebuilt binaries target glibc; on Alpine's musl it falls back to compiling from source.
- **The guard fails closed.** It refuses to trust `Tailscale-User-Login` unless the process is
  bound to a loopback address, so a misconfigured deployment loses access rather than silently
  losing authentication.

## Inventory module — working, 2026-08-18

Split by responsibility rather than by layer convenience:

```
shared/ssh/ssh-commands.ts     what may be run, and the only place it is written
shared/ssh/ssh.service.ts      connects and executes; knows nothing else
inventory/inventory.reader     server → parsed document
inventory/inventory.repository parsed document → cache, in one transaction
inventory/inventory.service    the order, and what a failure means
inventory/inventory.scheduler  only when
servers/servers.service        reads the cache; never touches SSH
servers/servers.mapper         rows → views
servers/server-health.ts       ok | stale | unreachable | never read
```

`GET /api/servers`, `GET /api/servers/:name`, and refresh endpoints for one server or all.
Scheduled every five minutes.

Verified against `marsella-test` from this workstation over the tailnet, as the `atalaya`
account — so development sees the same shape production will: `containersObservable: false` and
every state `unknown`, rather than a guess dressed as a fact.

The degradation the plan asks for was verified by pointing the row at an address that does not
answer:

```
refresh   → { ok: false, error: "timed out after 20000ms" }
health    → unreachable
instances → 10 still cached, with their age
backup    → last known status kept
```

A server that is down leaves the panel showing what it last knew and how old that is, which is
the useful answer. Restoring the address brought it back to `ok` on the next refresh.

### A rule for the screens

`unknown` must read as unknown, not as an outage. It is what SSH will always answer, and the
interface is the easiest place to throw away the distinction we protected all the way from the
JSON. Grey and "no data", with liveness arriving separately from Prometheus.

Likewise every card shows how old its data is: without that, an unreachable server looks
identical to a healthy one.

## The four screens — working, 2026-08-18, live since 2026-08-19

Built against `ServersService` returning data shaped exactly like `GET /api/servers` and
`GET /api/servers/:name` already do — down to `containersObservable: false` and every instance
`unknown`, the real shape verified against `marsella-test` the same day. Now wired for real, on
`httpResource()` rather than fake bodies.

```
core/models/server.model.ts, instance.model.ts   mirror the backend's *View interfaces by hand
core/services/servers.service.ts                 httpResource() against GET /api/servers[/:name]
shared/ui/state-badge/                            one state → one look, everywhere a state shows
shared/ui/meta-chip/                              icon + label + value, two sizes, four call sites
shared/health-tone.ts                             health → tone, shared by the card border and tiles
shared/pipes/relative-time.pipe.ts                "2m ago" — every card's answer to "how stale?"
features/overview/server-card/                    one card per server
features/server-detail/, instance-detail/         detail pages, route-bound via input()
features/backups/                                 per-server backup status, aggregated
features/coming-soon/                              honest placeholder — used by `/incidents`
```

Visual language borrowed from a Stitch mockup, but only where it could be backed by data that is
real: aggregate stat tiles (servers / instances / issues) computed from the servers already
loaded, a coloured left border per server health, monospace terminal-styled failure detail.
**Deliberately not copied**: per-server CPU/RAM/disk, hardware specs, notification-channel
toggles, incident data — none of that exists in the contract yet, and faking it would have looked
better and been worse.

### Two real bugs, not just styling

**`RouterLinkActive` was never imported** in `Sidebar`'s standalone `imports` array. The directive
sat in the template doing nothing — no nav item highlighted, on any route, ever. Confirmed via
`classList.contains(...)` before and after the fix, on all four routes.

**`/servers` and `/incidents` silently bounced to `/overview`** — a `redirectTo` and the wildcard
fallback respectively — so clicking either landed you on a different screen than the one you
clicked, with the wrong nav item lit up. `/servers` now serves the overview component directly
(same content, stable URL); `/incidents` is a real route rendering `ComingSoon` instead of falling
through the wildcard.

**Icon circles wouldn't centre.** `styles.css` fixes `display: inline-block` on
`.material-symbols-outlined` for the whole app; a `flex` utility on that same element loses to it
regardless of Tailwind's layer order, because both rules have equal specificity and the base rule
comes from a hand-written `@layer base` block. Fixed by splitting the circle (owns `flex`) from
the icon glyph (owns nothing) everywhere the pattern appeared — four places.

## Liveness from Prometheus — working, 2026-08-19

```
shared/prometheus/prometheus.service.ts   thin client for /api/v1/query, nothing else
monitoring/monitoring.reader.ts           server → set of container names cAdvisor has seen
monitoring/monitoring.service.ts          container names → running/stopped, per instance
monitoring/monitoring.controller.ts       GET /api/monitoring/:name, used to verify this in isolation
```

`GET /api/servers` and `GET /api/servers/:name` now resolve `unknown` against Prometheus on every
request — not cached, unlike the SSH inventory, because it is already the fast live source
`unknown` exists to be resolved against. A categorical state (`disabled`, `not deployed`) is
deployment intent, not liveness, and is left alone; if Prometheus itself does not answer, the
instances are returned exactly as SSH left them rather than failing the request.

The frontend needed **no changes** to show it: `StateBadge` already had a look for `running`, it
was just never being sent one. One vocabulary, one map, paid off the moment the second data source
came online.

**Joining container to instance is not a prefix match.** `generate.py` names every compose
project `app-<instance>`, so containers are `app-<instance>-<service>-<n>` — but a prefix match on
`app-<instance>-` also matches `app-<instance>-test-...` when one instance name is itself a prefix
of another (`acme` / `acme-test`, both real, both on `marsella-test`). Fixed with a
regex that peels the trailing `-<service>-<n>` off first and compares what remains for equality,
since service names never contain a dash. Caught by testing against `marsella-test`'s real
containers, not by inspection.

## Full metrics dashboard — working, 2026-08-19

```
monitoring/monitoring.queries.ts   the PromQL catalogue PLAN.md asks for, named, nothing loose
monitoring/metrics.reader.ts       raw numbers per server/instance/engine container
monitoring/metrics.service.ts      shapes them: used/total, days-remaining, up/down
shared/prometheus/prometheus.service.ts  now also wraps /api/v1/alerts, not just /api/v1/query
shared/poll-resource.ts            30s reload on any httpResource — same cadence as the scrape
```

Per-instance CPU/memory, and the engine's (traefik/mysql/postgres), read from the same
`container_name → instance` join liveness already uses — not aggregated by `stack.client`, since
that label conflates sibling instances (`acme` / `acme-test`). Capacity days-remaining
reuses the exact `deriv()` regression the alerting rules already run. Active alerts come straight
from Prometheus's own `/api/v1/alerts`, no Alertmanager needed for a read-only preview.

`httpResource()` fetches once and never again on its own — discovered when a manually-opened SSH
tunnel updated the server-detail page (new component, new resource) but left Overview stale (its
resource is a `providedIn: 'root'` singleton, created once). Fixed generally with `pollResource()`
rather than per-page ad hoc timers.

## Alertmanager + watchdog, and why not `stack` — working, 2026-08-19

Built and verified on `homeserver` — see *Alertmanager + watchdog* and the reorganisation entry in
[monitoring.md](monitoring.md) for the infra side. On the app side: `POST /api/webhooks/alertmanager`
(`@Public()`, reachable only from the loopback address it shares with Alertmanager), `Watchdog`
pinging the URL from `SettingsService` (see *Settings screen* below), everything else upserted
into `Incident` by Alertmanager's own fingerprint.

**Why not `stack`.** The obvious move once `deploy/`'s Dockerfiles existed was to onboard atalaya
as just another `stack` instance, the same as `acme` or `vega`. Rejected: `stack` reaches
every instance through Traefik, by domain, over its own isolated Docker network — a completely
different exposure model from atalaya's, which is `tailscale serve` injecting
`Tailscale-User-Login` straight to a process bound to the host's real loopback. Putting atalaya
behind `stack` would reintroduce the exact container-can't-reach-host-loopback problem
`network_mode: host` was built to solve for Prometheus and Alertmanager, and would mean giving up
the tailnet-only identity model for a public-domain one. `deploy/` is gone; `infra/homeserver/atalaya/`
replaces it. No registry push, no CI pipeline putting atalaya through `stack`'s `ghcr.io` flow: the
repo is cloned on `homeserver` and built there — see *One install process* below.

## Server registration — working, 2026-08-19

```
registration/registration.service.ts     creates the row, triggers targets.regenerate()
registration/setup-script.service.ts      personalises setup-server.sh's own Defaults block
registration/provision-check.service.ts   three traffic lights, ProvisionCheck rows kept
registration/targets.service.ts           rewrites targets/*.json, temp file + rename
features/register-server/                 form → download → verify, a modal off the topbar
```

**The form asks one question: the machine's name.** Being on the tailnet is already a
prerequisite of the artifact, so at registration time the machine exists there and MagicDNS can
answer for it — `registration/resolve-tailnet-ip.ts` resolves the bare name through the system
resolver (tailscaled installs the tailnet domain as a DNS search suffix on every member, and the
container inherits the host's resolver via `network_mode: host`), and rejects any answer outside
the CGNAT range so a name that happens to resolve on the LAN or public DNS cannot be silently
registered pointing off the tailnet. `host` is then simply the resolved IP — SSH stays on the
tailnet, where the key is restricted to work from, the same convention the `marsella-test` seed
established. Verified against real names: `ubuntu` → `100.100.0.1`; a nonexistent name → a
clean 422 telling you to join the machine first.

**The artifact needs no flags.** `setup-server.sh` already reads everything from CLI arguments;
personalising it means replacing the script's own `--- Defaults ---` assignments (`TAILNET_IP=""`,
`ATALAYA_KEY=""`, ...) with the real values, so `sudo ./setup-<name>.sh` is the entire instruction.
Each replacement fails loudly if its expected default is not found in the template, rather than
silently leaving a placeholder in a downloaded script — caught once already, see below.

**Three checks, not one, and in a deliberate order.** `node_exporter` and `cAdvisor` are probed
directly (`fetch` against `/metrics`) because they can answer the moment the artifact finishes —
before `targets/*.json` is even involved. `prometheus_target` queries Prometheus's own `up`
instead, which is the only one that proves the *whole* chain: the regenerated target file,
reloaded, actually scraped. A green first two and a red third means "the collectors are up, atalaya
just has not told Prometheus about them yet" — a real, useful, distinct state from all three red.

**Nothing about the artifact is an env var.** The first pass had `SETUP_SCRIPT_PATH` and
`ATALAYA_TAILNET_IPS` as configuration. Neither should have been: the template's path in
production is exactly wherever `backend.Dockerfile` copies it, always — a fixed constant, not a
setting anyone would ever want to change independently. And `--atalaya-from` is not a fact about
the world to configure, it is a fact about *this machine* — `registration/detect-tailnet-ip.ts`
reads it off the host's own network interfaces (Tailscale's CGNAT range, `100.64.0.0/10`), which
is also simpler than it sounds: because atalaya shares the host's network namespace
(`network_mode: host`), this finds `homeserver`'s real address in production and the workstation's
in development, with the same code and no branching.

**Three bugs caught by testing against the real template and the real deployed compose, not by
inspection:**

- `STACK_DIR="/home/ubuntu/docker/stack/stack"` — doubled. `Server.stackPath` is the path to the
  `stack` *executable* (`.../stack/stack`, what `InventoryReader` runs over SSH), but
  `setup-server.sh --stack-dir` wants the containing *directory*. Fixed with `dirname()` rather
  than assuming the two concepts were the same field.
- `PROMETHEUS_TARGETS_DIR` in `infra/homeserver/atalaya/backend.env.example` still pointed at
  `/home/carlos/docker/prometheus/targets` — the path from before the `infra/` reorganisation
  earlier this session, never updated because nothing had written there yet to notice. The backend
  container also had no volume mount for it at all, read-write or otherwise, and no mount for the
  SSH key's `.pub` half needed to read `ATALAYA_KEY`. All three fixed in
  `infra/homeserver/docker-compose.yml` before this could reach `homeserver` and fail silently
  there too.
- The template path computed from `__dirname` assumed development ran TypeScript directly out of
  `src/`. It does not — `nest start --watch` compiles to `dist/src/registration/` same as
  production, one directory level deeper than assumed, so `../../../` landed inside `backend/`
  instead of the repo root. Caught immediately by actually calling the endpoint rather than
  reasoning about where the file "should" be.
