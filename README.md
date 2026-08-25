# atalaya

A self-hosted panel for the servers that run the [`stack`](../stack) deployment engine. One place
to see every instance's deployed version, backup status, certificate expiry, CPU/RAM/disk history
and incidents — instead of SSH-ing into each machine to run `./stack` by hand.

Collectors (`node_exporter`, `cAdvisor`) on each server, Prometheus and Alertmanager on
`homeserver`, and a NestJS + Angular application that queries them and draws its own charts.
Reachable over Tailscale only.

## Requirements

On the host that runs it:

- **Docker** with the Compose plugin (`docker compose`, not `docker-compose`).
- **Tailscale**, joined to the tailnet. It is the only way in: the API binds `127.0.0.1` and
  access arrives through `tailscale serve`, never `funnel`.
- **A data directory for Prometheus** at `/var/lib/prometheus`, owned by uid `65534` — a
  dedicated disk if the retention limits below matter to you:
  ```bash
  sudo mkdir -p /var/lib/prometheus && sudo chown 65534:65534 /var/lib/prometheus
  ```
  Prometheus keeps 395 days or 70 GB, whichever comes first; at a 30s scrape interval that is
  roughly 35 GB for four servers.
- **An SSH keypair for atalaya** at `~/.ssh/atalaya_ed25519{,.pub}`, mounted read-only into the
  backend. One key for the whole fleet: `ssh-keygen -t ed25519 -f ~/.ssh/atalaya_ed25519`.

On each managed server: Docker, Tailscale and `stack`, already installed. atalaya reads them over
SSH and never installs anything remotely.

## Install

Runs on the machine that hosts Prometheus.

```bash
git clone git@github.com:crbarrio/atalaya.git /home/carlos/docker/atalaya
cd /home/carlos/docker/atalaya/infra/homeserver

cp .env.example .env
# edit .env: FRONTEND_URL and ENCRYPTION_KEY. Nothing else needs changing.

docker compose build
docker compose run --rm backend npx prisma migrate deploy
docker compose up -d

tailscale serve --bg localhost:4200   # once, to publish the UI
```

Updating is the same without the `cp`: `git pull`, then rebuild, migrate and `up -d`.

`ENCRYPTION_KEY` on an existing install must be the key already in use — stored channel
credentials are encrypted with it, not hashed, and a new one makes them unrecoverable.

## Development

Needs Node 22+. Configuration is `backend/.env` (copy `backend/.env.example`), separate from the
Docker install above — the frontend needs none.

```bash
npm run install:all
cp backend/.env.example backend/.env
# set ENCRYPTION_KEY; PROMETHEUS_URL/ALERTMANAGER_URL can point at a tunnelled
# homeserver (ssh -L 9090:127.0.0.1:9090 homeserver) to work against real data.
npm run prisma:migrate
npm run dev          # backend on :3000, frontend on :4200
```

There is no Tailscale in front locally, so `TRUST_TAILSCALE_HEADER=false` and `DEV_USER_EMAIL`
stands in for the identity header.

## Adding a server

From the UI: *Register server* records it, then hands back a personalised
`infra/fleet/server-setup/setup-server.sh` to run once, with `sudo`, on the machine itself.
atalaya then verifies the result. It generates and checks; it never installs anything remotely.

## Documentation

Each file carries its own **Pending** list at the top and the log of what was done below it.

| File | What is in it |
|---|---|
| [PLAN.md](docs/PLAN.md) | The plan of record: decisions, architecture, security constraints, phases. |
| [infrastructure.md](docs/infrastructure.md) | The machines: tailnet, resources, disks, ports, SSH. |
| [monitoring.md](docs/monitoring.md) | Collectors, Prometheus, alerting, and the runbook. |
| [stack-integration.md](docs/stack-integration.md) | The `stack inventory` contract and the changes made there. |
| [app.md](docs/app.md) | The monorepo: backend, frontend, and the modules built so far. |
