# Decision log

One line per document. Regenerable from each document's header; if they disagree, the document
is right. **Open** is what is pending in this repository; there is no other list.

| Document | Type | State | Topic |
|---|---|---|---|
| [backups-per-app-2026-08-23.md](backups-per-app-2026-08-23.md) | analysis | **open** | Backup status is one value per server; per-app would touch `backup.sh`, the metrics and `inventory`. |
| [ssh-host-keys-2026-09-08.md](ssh-host-keys-2026-09-08.md) | decision | **open** | The SSH client skips host-key verification; must change before anything runs off the tailnet. |
| [plan-phases-2026-08-17.md](plan-phases-2026-08-17.md) | decision | closed · 2026-08-30 | The original plan, phase by phase, and its revisions. |
| [email-transport-2026-08-18.md](email-transport-2026-08-18.md) | decision | closed · 2026-08-20 | No self-hosted MTA; any SMTP host, per channel, from the UI. |
| [deploy-outside-stack-2026-08-19.md](deploy-outside-stack-2026-08-19.md) | decision | discarded · 2026-08-27 | Running atalaya as a `stack` instance. Identity models conflict. |
| [madrid-prod-relay-2026-08-17.md](madrid-prod-relay-2026-08-17.md) | analysis | closed · 2026-08-27 | `madrid-prod` stays on DERP; 11 ms, accepted. |
| [docs-structure-2026-09-08.md](docs-structure-2026-09-08.md) | decision | closed · 2026-09-08 | Two documentation layers; the "Pending" sections removed; no markers in code. |
