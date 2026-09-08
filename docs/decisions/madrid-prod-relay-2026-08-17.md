# `madrid-prod` connects via relay

| | |
|---|---|
| Type | analysis |
| State | **closed** · 2026-08-27 (accepted, not investigated) |
| Opened | 2026-08-17 |

| Section | State |
|---|---|
| 1. What was observed | closed · 2026-08-17 |
| 2. Accepted | closed · 2026-08-27 |

## 1. What was observed · CLOSED 2026-08-17

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
admit inbound UDP on 41641.

## 2. Accepted · CLOSED 2026-08-27

**Deliberately not investigated, and closed rather than left pending** — at 11 ms it affects
nothing. Metric scraping never noticed, and Phase 3's log streaming was verified over this very
relay: 200 lines of a live `stack logs` from `madrid-prod`, with no perceptible lag.

If it ever does matter: `tailscale status` distinguishes `direct` from `relay "xxx"`, and
`tailscale ping <ip>` reports which route each packet takes.
