# Monitoring

Collectors, Prometheus and alerting: everything that produces or stores metrics. The application
that displays them is in [app.md](app.md).

## Pending

Nothing outstanding.

There is deliberately **no bypass route** — no static `alertmanager.yml` route around atalaya for
Telegram or anything else. Reasoning in *Why there is no bypass route* in [PLAN.md](PLAN.md).
Telegram itself is not excluded: it is a channel *through* atalaya, same as email (see Done
below) — exactly what the plan calls for.

## Runbook

Validate config and rules before touching a running Prometheus — a broken `prometheus.yml` stops
the container, and a broken rules file can pass unnoticed. `--entrypoint promtool` is required:
the image's entrypoint is `prometheus`, which swallows the argument and fails with
`unexpected promtool`. `check config` follows `rule_files`, so one command covers both.

```bash
cd infra/homeserver/prometheus
docker run --rm --entrypoint promtool -v "$PWD:/etc/prometheus" \
  prom/prometheus:v3.7.3 check config /etc/prometheus/prometheus.yml
```

After editing rules, re-read without restarting (no gap in the data):

```bash
curl -X POST http://127.0.0.1:9090/-/reload
```

Target health, and the web UI from a workstation — the port is loopback-only and Prometheus has
no authentication of its own:

```bash
curl -s http://127.0.0.1:9090/api/v1/targets | \
  python3 -c 'import json,sys; [print(t["labels"]["job"], t["labels"]["instance"], t["health"]) for t in json.load(sys.stdin)["data"]["activeTargets"]]'

ssh -L 9090:127.0.0.1:9090 homeserver   # then http://localhost:9090
ssh -L 9093:127.0.0.1:9093 homeserver   # Alertmanager
```

Alertmanager, same shape:

```bash
docker run --rm -v "$PWD:/etc/alertmanager" prom/alertmanager:v0.28.1 \
  amtool check-config /etc/alertmanager/alertmanager.yml
curl -X POST http://127.0.0.1:9093/-/reload
```

`http://127.0.0.1:9093/api/v2/alerts` should always show at least `Watchdog`, which fires
permanently by design. If it stops, healthchecks.io reports it from outside — that is the point.

## Done

- [x] Setup artifact in `infra/fleet/server-setup/`: idempotent, parameterised, covering the whole
      onboarding in one pass.
- [x] `node_exporter` (native, apt) on `marsella-test`, bound to `100.100.0.4`.
- [x] `cAdvisor` (container) on `marsella-test`, with `--whitelisted_container_labels`.
- [x] Prometheus on `homeserver` over `/var/lib/prometheus`, ≈395-day retention, targets via
      `file_sd_configs`.
- [x] Capacity rules (`predict_linear` over disk and RAM), and their days-remaining now drawn in
      the app via the same regression. See *Full metrics dashboard* in [app.md](app.md).
- [x] Per-instance liveness consumed by the app: `unknown` from SSH resolved against cAdvisor's
      live container set. See *Liveness from Prometheus* in [app.md](app.md).
- [x] Full metrics dashboard in the app: CPU/RAM/disk, per-instance/engine usage, scrape health,
      backup duration, active alerts. See *Full metrics dashboard* in [app.md](app.md).
- [x] Backup rules: `BackupFailed`, `NoRecentIncrementalBackup` (26 h, not 24, so cron jitter
      does not fire it) and `NoRecentFullBackup` (40 days). These are what make this morning's
      incident — a day without backups, found only by opening a file by hand — impossible to
      miss again.
- [x] Per-client usage measurable end to end.
- [x] `Watchdog` rule, `infra/homeserver/alertmanager/` (routing config, `network_mode: host` on
      every homeserver service so they can reach each other and atalaya's loopback-only API), and
      `POST /api/webhooks/alertmanager` in the backend — Watchdog pings healthchecks.io, everything
      else lands in `Incident`. **Full chain verified on `homeserver`, 2026-08-19**: Prometheus
      evaluates `Watchdog` firing → Alertmanager receives and routes it → `POST` reaches atalaya's
      webhook → healthchecks.io confirms a received ping. Every hop proven on the real machine, not
      just compiled.
- [x] atalaya itself deployed on `homeserver` — `infra/homeserver/atalaya/`, `network_mode: host`,
      published on the tailnet via `tailscale serve --bg 4200`
      (`https://ubuntu.example-tailnet.ts.net/`).
- [x] `infra/` reorganised into `homeserver/` (Prometheus, Alertmanager, atalaya — one
      `docker-compose.yml`, all four services on `network_mode: host`) and `fleet/` (what gets
      installed on each managed stack server). `deploy/`'s Dockerfiles moved into
      `infra/homeserver/atalaya/` and deleted from the root: atalaya is **not** `stack`-managed —
      its `tailscale serve`/loopback identity model conflicts with `stack`'s per-instance Docker
      network reachable only through Traefik by domain.
- [x] **Fleet fully instrumented, 2026-08-19**: `marsella-prod` and `madrid-prod` registered
      through the real UI (name only, everything else deduced), artifact run by hand on each,
      both reading real inventory and metrics. The generator tested itself on the second one —
      "perfect", no fixes needed. `marsella-prod` needed a `stack` update first (`develop` merged
      into `main`: `inventory` no longer needs `SERVER` in `.env`, reads the manifest already on
      disk instead) — the panel showed `unreachable` until the next scheduled refresh picked up
      the fix, resolved immediately by a manual `POST /:name/refresh` rather than waiting 5
      minutes. All three fleet servers now live in atalaya.
- [x] **Alert delivery, first channel — 2026-08-20**: `NotificationChannel` (already in the
      schema) gets a full CRUD (`channels/`) and a `notifier/` that fans a new incident out to
      every enabled channel whose `severities` include it — on the two edges only (first seen,
      firing → resolved), never on Alertmanager's own repeat while still firing. One adapter
      built, `email` (`nodemailer`, SMTP per channel, config built fresh per send rather than a
      held-open transport since a channel can be edited or disabled between two incidents) — the
      interface is generic, so Telegram is a second adapter away. `config` never round-trips out
      of `GET /api/channels`; verified end to end against a real SMTP host (`smtp.ionos.es`) with
      a wrong password on purpose — a real `535 Authentication credentials invalid` came back from
      the server, caught and logged without the webhook itself failing, proving the whole path
      short of the actual send. Managed entirely from the browser (`/settings`, "Notification
      channels"), per the explicit ask: nothing hardcoded, nothing in an env var.
- [x] **Channel credentials encrypted at rest, 2026-08-20**: `config` (the SMTP password, later a
      Telegram bot token) is AES-256-GCM, not bcrypt/argon2 — those are one-way, built for
      verifying a login, and useless here since atalaya has to hand the real password back to
      nodemailer on every send. `shared/crypto/encryption.service.ts`, keyed by `ENCRYPTION_KEY`
      (32 bytes, base64, `openssl rand -base64 32` — one for development, a separate one generated
      for production). Encrypted in `ChannelsService` before the row is written, decrypted in
      `NotifierService` right before use; verified by reading the raw SQLite row after creating a
      channel (ciphertext, not the password) and by re-triggering the webhook afterward to confirm
      the notifier still authenticates against the real SMTP server with it.
- [x] **Verify-before-save, and a second channel (Telegram) — 2026-08-20**: `NotificationAdapter`
      gained a `verify(config)` alongside `send()` — `ChannelsService.create()`/`update()` calls
      it before a row is ever written, so a channel with the wrong credentials cannot exist in the
      table in the first place. Deliberately not a separate "test connection" button: one action,
      one outcome. `EmailAdapter.verify()` is `transporter.verify()`; `TelegramAdapter.verify()`
      is `getChat`, not `sendMessage` — it proves the bot token and the chat id both work without
      posting anything visible. Both verified against real APIs with wrong credentials on purpose:
      a genuine `535 Authentication credentials invalid` from `smtp.ionos.es` and a genuine
      `Unauthorized` from `api.telegram.org`, neither channel persisted. Telegram itself: config is
      just `{ botToken, chatId }`, `sendMessage` for delivery — the adapter interface built generic
      from the start meant no changes anywhere else, only a `type` selector on the frontend form
      swapping which fields show.
- [x] **Both `stack` changes named in PLAN.md's "Changes to the `stack` repo" — 2026-08-23**: the
      backup-metrics half (`stack_backup_*.prom`) already existed; the deployed-version half did
      not. Added `write_deploy_metric()` to `stack` (the CLI, not `backup.sh`): one `.prom` file
      per instance, `stack_deploy_info{app,version} 1` (an info-metric — the version travels as a
      label since it is not itself a number) and `stack_deploy_timestamp_seconds{app}`. Called
      from `cmd_deploy` on every successful deploy, which covers `cmd_start` and `cmd_rollback`
      too since both call `cmd_deploy` internally — one insertion point, three commands covered.
      `cmd_retire` deletes the file on the way out, so a retired instance does not leave a ghost
      series behind. Nothing queries this yet — see *Deployment history screen* in Pending; the
      metric was the half of this that PLAN.md's own checklist was missing.
- [x] **First-deploy backup seeding — 2026-08-23**: found while adding a new app (`pulsar`) to
      `stack` on `develop` — its first backup after deploy failed because incremental mode diffs
      against a previous snapshot and a brand-new instance has none, and `backup.sh` `die()`s on
      that, aborting the *whole* server's backup run for every other instance too, not just the
      new one. `cmd_deploy` now checks whether `state/$app.version` existed before this deploy and,
      if not, runs `scripts/backup.sh full "$app"` right after a successful deploy to seed a
      baseline — a failure there only warns, it does not roll back a deploy that already passed
      its health check. Not itself a fix for atalaya's original complaint (backup status is
      still one value for the whole server, not broken down per app) — see *Backups are
      server-wide, not per-app* below for why that was deliberately scoped out.
- [x] **Historical charts and deployment history, closing out Phase 2 — 2026-08-23**:
      `PrometheusService.queryRange()` (`/api/v1/query_range`), capped at 300 points and never
      finer than the 30 s scrape interval regardless of window — Prometheus itself refuses above
      11,000 points per series, hit once while testing a 90-day deploy-history query with a fixed
      5-minute step before the step was made to scale with the window like the metrics chart's
      already did. `GET /api/monitoring/:name/history?hours=` returns CPU/RAM/disk as one
      percent-used series each (RAM/disk computed in PromQL, not ratio'd client-side from two
      series) so a chart is one line, not two to zip together by timestamp. `GET
      /api/monitoring/:name/:instance/deploys?days=` turns `stack_deploy_info`'s own shape into a
      timeline for free: each distinct `version` label is already its own Prometheus series, live
      only for the window that version was deployed, so grouping by label and taking each series'
      first/last timestamp *is* the history — no separate event log needed. Charting library:
      **Chart.js via `ng2-charts`** (`provideCharts(withDefaultRegisterables())` in
      `app.config.ts`) over building from scratch — matches "no Grafana in the product, our own UI"
      from PLAN.md; it is a drawing library, not a dashboard platform. `HistoryChart`
      (`shared/ui/history-chart/`) renders CPU/RAM/disk on one 0–100% axis with a 24h/7d/30d
      selector on the server page, peaks computed in TypeScript (`Math.max`) and shown as text
      rather than pulling in `chartjs-plugin-annotation` for one number. `DeployHistory`
      (`shared/ui/deploy-history/`) lists each version's run on the instance page. Verified with
      an SSH tunnel to `homeserver`'s Prometheus against real `marsella-test` data — the 7-day
      chart surfaced real CPU spikes (up to 38%) the instant snapshot never would have shown, which
      was the entire point. Deploy history came back empty, correctly: `stack_deploy_info` only
      started being written today (see above) and nothing has redeployed since.
- [x] **Certificate expiry, closing Phase 2's incident-inbox list for real — 2026-08-23**: Traefik
      does not publish this — no `--metrics.prometheus*` flag anywhere in `stack`'s
      `docker-compose.yml`, and no current Traefik version exposes cert-expiry as a metric even
      when metrics are on, so that path was a dead end regardless. `blackbox_exporter` instead,
      probing every domain's TLS handshake directly over the public internet — the same way a
      visitor would, so what it reports is what a visitor would actually see, not what the origin
      thinks it is serving. One instance, centrally, on `homeserver`: it needs no Tailscale route
      to any fleet server, since it is hitting each domain's public HTTPS port from the outside,
      same as everyone else. Module is a bare `tcp` probe with `tls: true` — no HTTP request, no
      status-code question to answer per domain, just the handshake and the certificate it hands
      back. `targets/domains.json` is new atalaya-generated fourth target file, `TargetsService.
      regenerateDomains()`, sourced from `Instance.domains` (already cached from `stack inventory`,
      already what the app's own domain links use) — deduplicated, since a domain declared on two
      instances at once must not become two probes fighting over one series. Regenerated on every
      inventory refresh, not only register/deregister: a domain can appear or disappear on any
      deploy, `InventoryModule` now imports `RegistrationModule` for this one call. Two rules,
      `CertificateExpiringSoon` (<14 days, `probe_ssl_earliest_cert_expiry`) and
      `CertificateProbeFailed` (`probe_success == 0`) — no new screen, they reach the existing
      incident inbox through the same webhook everything else already does. Verified against a
      real domain by running blackbox_exporter by hand on `homeserver` and probing
      `app.example.com:443`: correct SNI (`subject="CN=app.example.com"`, not a default/
      wildcard cert — Traefik hosts many domains behind one IP, so SNI actually mattered here),
      `probe_success 1`, and a real expiry date 83 days out. `promtool check rules`/`check config`
      run against the real Prometheus binary on `homeserver`, not just eyeballed. **Deployed and
      confirmed live, same day**: `domains.json` regenerated with all 19 real domains across the
      three fleet servers (a manual refresh was enough — no need to wait for the 5-minute cron),
      every one `up{job="blackbox"} == 1`, both rules `health: ok`, days-remaining a sane 81–88
      across the board.
- [x] **Per-app volume sizes — 2026-08-23**: `stack inventory`'s reading account is deliberately
      not in the `docker` group (same reason container state comes back `unknown`), so it cannot
      itself ask docker how big a named volume is. `backup.sh` already can — it already has docker
      access and already loops over every instance's volumes to pack them — so it measures each
      one there (`du -sb` inside the same ephemeral `mysql:8.0` container it packs the archive
      with, no extra image pulled) and writes `state/<app>.volumes` (`source=bytes` lines, same
      shape as the `.version`/`.previous` files `inventory.py` already parses). `inventory.py`
      only reads it — no new docker calls on the unprivileged side. `null` (file absent) means "no
      backup has run yet"; `[]` means it ran and the instance declares no volumes — the same
      None-vs-empty distinction the file already draws for containers. Sizes are therefore only as
      fresh as the last backup (daily via cron), not live — deliberately not wired through
      Prometheus/cAdvisor for continuous history, since unlike disk-full there is no hard failure
      point that would make a days-remaining trend worth the extra infrastructure. Shown on the
      instance-detail page under Domains.

## Backups are server-wide, not per-app — 2026-08-23

Deploying `pulsar` surfaced the real complaint: atalaya's "backup failed" says nothing about
*which* app or *why*. Investigated turning that into a per-instance status before touching
anything, because the fix above only closes the one specific failure mode (a new instance with no
prior snapshot) — it does nothing for atalaya's diagnostic message in general.

What `stack` actually reports today is server-wide, at every layer: `backup.sh` writes one
`last_status` file for the whole run, `die()` on any instance's failure aborts the *entire* run
rather than just that instance (so a bad instance mid-loop can silently skip every instance after
it too), the Prometheus metrics (`stack_backup_success{mode}`) carry no instance label, and
`stack inventory`'s `backup` field sits at the top level of the JSON, a sibling of `instances[]`,
not nested inside each one. There is no per-instance signal anywhere to surface.

Making it per-instance would mean `backup.sh` catching a failure and continuing to the next
instance instead of dying, a status recorded per instance instead of one shared file, metrics
labelled by instance, and `stack inventory` moving `backup` inside each `StackInstance`. Real
work, and explicitly **not done here** — deliberately scoped out for now in favour of the smaller
fix above, which was the actual trigger. Revisit if "which app, and why" keeps coming up.

First real run of the artifact. Verified from `homeserver` over the tailnet, not just locally:

- `node_exporter`: 3748 host metrics, `node_textfile_scrape_error 0`.
- `cAdvisor` `v0.52.1`: 22 containers measured, container `healthy`.
- `ss -lntp` confirms both bound to `100.100.0.4` only — no `0.0.0.0` anywhere.
- Neither port answers on the public IP `203.0.113.12`. The plan's constraint verified rather
  than assumed.
- A second run reported `Nothing to change`. Idempotence confirmed on a real machine.

Prometheus targets, split by job because node and cAdvisor metrics are queried separately:

```json
// targets/node.json
{ "targets": ["100.100.0.4:9100"], "labels": { "server": "marsella-test" } }
// targets/cadvisor.json
{ "targets": ["100.100.0.4:8080"], "labels": { "server": "marsella-test" } }
```

## Prometheus running — 2026-08-18

`prom/prometheus:v3.7.3` in a container on `homeserver`, config in
`/home/carlos/docker/atalaya/infra/homeserver/prometheus/` (source of truth, deployed by
`git pull`), data in `/var/lib/prometheus`.

- All three targets `up`; five rules loaded and evaluating.
- **6974 active series from `marsella-test` alone** — the server holding 20 of the fleet's 43
  containers. Extrapolating to all four gives 15–18k, matching the estimate the disk was sized
  against: ≈35 GB over 395 days on a 79 G disk. The 70 GB retention cap should never engage.
- Bound to `127.0.0.1:9090`; the web UI needs an SSH tunnel. Prometheus has no authentication of
  its own.

## One artifact, not three — 2026-08-18

Onboarding a server had drifted into separate passes: run the collectors script, then create the
`atalaya` account by hand, then whatever the missing metrics needed. Consolidated into
`infra/fleet/server-setup/setup-server.sh`.

The consolidation was not tidiness. Splitting the steps had already produced a defect nobody had
hit yet: the collectors script created the textfile directory as `root`, `stack` writes its backup
metric there as `ubuntu` from cron, and cron discards its output — so the metric whose purpose is
to report silent failures would itself have failed silently. Steps split across passes make
assumptions about each other and nobody checks the seam.

The script now verifies both directions:

```
✓ ubuntu can write to /var/lib/prometheus/node-exporter
✓ label 'stack.client' present in the metrics
✓ atalaya reads stack's inventory
✓ atalaya cannot read the secrets
✓ atalaya has no sudo
```

Two more bugs surfaced while proving it on `marsella-test`:

- Moving the compose file orphaned the running cAdvisor under the old project name, and Docker
  refused to recreate it. The compose now declares an explicit `name:`, and the script takes down
  a container left by a previous layout.
- `authorized_keys` was rewritten on every run: `$(cat …)` strips trailing newlines, so content
  carrying one never compared equal. `write_if_changed` now normalises it.

## Per-client usage — working end to end, 2026-08-18

`client` in `servers/<server>.json` → `stack.client` on the container → kept by cAdvisor →
indexed by Prometheus. Measured on `marsella-test` with all ten instances redeployed:

| Client | Memory | Containers |
|---|---|---|
| vega | 49.7 MB | 2 |
| orion | 32.2 MB | 4 |
| acme | 31.0 MB | 4 |
| lyra | 30.7 MB | 2 |
| nova | 6.5 MB | 2 |
| enerflow | 5.8 MB | 2 |
| atlas | 3.1 MB | 1 |

This is the figure the whole project was started to get: what each client costs, measured rather
than guessed.
