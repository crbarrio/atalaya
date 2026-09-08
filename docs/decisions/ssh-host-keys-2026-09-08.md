# The SSH client does not verify host keys

| | |
|---|---|
| Type | decision |
| State | **open** (a deliberate omission with a stated condition for revisiting) |
| Opened | 2026-09-08 — the decision itself predates this document and was recorded undated in `app.md` |

| Section | State |
|---|---|
| 1. The decision | closed |
| 2. When it has to be revisited | open |

## 1. The decision · CLOSED

`SshService` (`backend/src/shared/ssh/ssh.service.ts`) does not verify the host key of the
server it connects to. Over Tailscale the transport is already authenticated end to end by
WireGuard, so impersonating a node means having compromised it first. A deliberate omission, not
an oversight.

## 2. When it has to be revisited · OPEN

Before anything runs outside the tailnet. The key's `authorized_keys` restriction already makes
SSH-over-Tailscale an enforced property rather than an intention (see
[infrastructure.md](../infrastructure.md)); host-key verification would be the matching property
on the client side, and is what a development connection over a public hostname would need.
