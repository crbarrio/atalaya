# Infrastructure

The machines, the tailnet, and how atalaya reaches them. Facts about the estate, not about the
application.

## Pending

Nothing outstanding.

## The fleet

Checked over SSH on 2026-08-17:

| Host (SSH alias) | System | Tailscale | Tailnet IP |
|---|---|---|---|
| `homeserver` (hostname `ubuntu`) | — | v1.102.2 | `100.100.0.1` |
| `madrid-prod` | Ubuntu 24.04.4 LTS aarch64 | v1.102.2 | `100.100.0.2` |
| `marsella-prod` | Ubuntu 24.04.4 LTS aarch64 | v1.102.2 | `100.100.0.3` |
| `marsella-test` | Ubuntu 24.04.4 LTS aarch64 | v1.102.2 | `100.100.0.4` |

Tailnet `example-tailnet.ts.net`. The three remotes joined on 2026-08-17 with an auth key (since
revoked). They are identical in system and architecture (arm64), which allows a single
installation procedure for all three. The home server additionally offers exit-node service.

These IPs are what `prometheus.yml` uses as scrape targets: Prometheus runs in a container and
does not inherit the host's resolver, so it cannot use MagicDNS. The same reasoning applies to
SSH, which keeps it on the tailnet where the key is restricted to work from.

- [x] Home server already on the tailnet.
- [x] `madrid-prod`, `marsella-prod` and `marsella-test` installed and joined.
- [x] Key expiry disabled on the three new nodes.
- [x] `tag:ollama` removed from `homeserver`.

### Machine resources

| Host | vCPU | RAM | Root disk | Containers |
|---|---|---|---|---|
| `homeserver` | 4 | 11 GiB (10 free) | 67 G, **26 G free** | 5 |
| `madrid-prod` | 4 | 23 GiB | 45 G, 33 G free | 9 |
| `marsella-prod` | 2 | 11 GiB | 45 G, 25 G free | 9 |
| `marsella-test` | 2 | 11 GiB | 45 G, 25 G free | 20 |

`homeserver` is also the household server: Plex, qBittorrent, Pi-hole, Home Assistant and
Syncthing. Its root disk (`sda3`, 68 G) is **fully assigned to the LV**, with no free space in the
volume group: growing it means going through Proxmox.

## SSH access from atalaya — done 2026-08-18

- [x] `ed25519` key pair on `homeserver` (`~/.ssh/atalaya_ed25519`), used by an `atalaya` user on
      each of the three remotes. `~/.ssh/config` there resolves the aliases to tailnet IPs.

The permissions already on the machines decided the design, so nothing had to be loosened:

```
/home/ubuntu               750 ubuntu:ubuntu   group can traverse
  docker/stack             775 / 664           group can read
  docker/stack/secrets     700 ubuntu:ubuntu   group cannot
ubuntu                     (ALL) NOPASSWD: ALL
```

`atalaya` is in the `ubuntu` **group** and has no general sudo. That gives it exactly the
inventory — `state/`, `apps.json`, `servers/`, `last_status` — and denies it the secrets, because
`secrets/` is `700` and group membership stops at the door. Reusing the `ubuntu` user instead
would have handed atalaya passwordless root on all three servers.

Since Phase 3 there is **one** exception, and it is not a rule pointing at `stack` directly as
this file used to anticipate: the account may run `/usr/local/sbin/atalaya-stack` as `ubuntu`, a
root-owned dispatcher holding the list of subcommands it accepts. The indirection is the point —
the allowlist lives in a file `atalaya` cannot write, and sudo gets one exact path with no
wildcard to mis-match. Reasoning and rejected alternatives in
[stack-integration.md](stack-integration.md).

The key is restricted in `authorized_keys` with `from="…",restrict,pty`. `pty` is there because
`stack logs` never exits: without a terminal, closing the channel does not signal the remote
process group and every viewer who walked away left a follower running. Verified on
`marsella-test`:

| Check | Result |
|---|---|
| Read `state/manifest.json` | 10 instances, 7 clients |
| Read `secrets/acme.env` | `Permission denied` |
| `sudo -n id` | `a password is required` |
| `sudo -n -u ubuntu id` | `a password is required` — the rule is bound to the dispatcher, not the user |
| `atalaya-stack exec …` | refused; so are `retire`, `add` and metacharacters in a name |
| Same key over the public hostname | `Permission denied (publickey)` |

That last row is the point: SSH-over-Tailscale stops being an intention and becomes an enforced
property of the key. The two rows above it are the same idea applied to the privilege: what the
account may do is asserted, not assumed, and `setup-server.sh --check` re-asserts it.

### Development access

This workstation joined the tailnet as `carlos-torre` (`100.100.0.5`). Rather than a second
identity, `authorized_keys` allows the one atalaya key
`from="100.100.0.1,100.100.0.5"`, and the private key is copied here. The restriction still
holds: the key works from those two addresses and nowhere else.

## Ports 80 and 443 on `homeserver` — freed 2026-08-17

Pi-hole held `0.0.0.0:80` and `0.0.0.0:443`, which covered the tailnet IP and prevented
`tailscale serve` from taking the node's 443. Moved to `8080` and `8443` in
`/home/carlos/docker/pihole/docker-compose.yml` (prior copy at `docker-compose.yml.bak-20260817`).
DNS and admin panel verified after the change.

Consequence: the Pi-hole panel now lives at `:8080/admin`, and block pages are no longer served —
a blocked domain gives a connection error rather than Pi-hole's page.

## Prometheus disk — ready 2026-08-17

A dedicated 80 G disk added to the VM in Proxmox, partitioned (GPT, `/dev/sdc1`) and formatted
ext4 with `-m 0`. Mounted at `/var/lib/prometheus`, **79 G free**, owned by `65534:65534` (the uid
of the official `prom/prometheus` image).

In `/etc/fstab` by UUID and with `nofail`, so that a disk failing to attach in Proxmox does not
leave the server in emergency mode with no remote access. Verified across a real reboot: it mounts
on its own.

A separate disk on purpose: if metrics run away, they fill their own disk without taking down the
system of the machine that runs the household DNS, Plex and Home Assistant.

## Accepted — `madrid-prod` connects via relay

Tailscale first attempts a **direct** connection between nodes, punching through each side's NAT
over UDP/41641. Failing that, it falls back to **DERP**, Tailscale's relay network: an outbound
TCP connection that always works. Encryption remains end to end with WireGuard — the relay moves
packets it cannot read — so this is not a security matter, only latency and shared bandwidth.

The punch-through is not instantaneous. All three nodes started on DERP; ten minutes later:

| Node | Route | Latency from homeserver |
|---|---|---|
| `madrid-prod` | relay `mad` | 11 ms |
| `marsella-prod` | direct `203.0.113.11:41641` | 10 ms (was 113 ms) |
| `marsella-test` | direct `203.0.113.12:41641` | 10 ms (was 45 ms) |

`madrid-prod` stayed on the relay. Unverified hypothesis: its Oracle Cloud security list does not
admit inbound UDP on 41641. **Deliberately not investigated, and closed rather than left
pending** — at 11 ms it affects nothing. Metric scraping never noticed, and Phase 3's log
streaming was verified over this very relay: 200 lines of a live `stack logs` from `madrid-prod`,
with no perceptible lag.

If it ever does matter: `tailscale status` distinguishes `direct` from `relay "xxx"`, and
`tailscale ping <ip>` reports which route each packet takes.
