# Documentation

Two layers. **Reference** describes what is built and changes when the code does. The
**decision log** records what was examined, decided or deferred, one dated document per topic,
updated in place; its index is the only list of what is pending.

## Reference

| File | What is in it |
|---|---|
| [architecture.md](architecture.md) | The layers, the data sources, the security constraints and the alerting design, with the reasoning behind each. |
| [app.md](app.md) | The monorepo: backend, frontend, and how each module is built. |
| [monitoring.md](monitoring.md) | Collectors, Prometheus, Alertmanager, rules, and the runbook. |
| [stack-integration.md](stack-integration.md) | The `stack` contracts atalaya reads, the dispatcher, and the changes made in that repo. |
| [infrastructure.md](infrastructure.md) | The machines: tailnet, resources, disks, ports, SSH access. |

## Decision log

[decisions/INDEX.md](decisions/INDEX.md). Open items are marked there.

Conventions for both layers are in the root `CLAUDE.md` and in
[decisions/docs-structure-2026-09-08.md](decisions/docs-structure-2026-09-08.md).
