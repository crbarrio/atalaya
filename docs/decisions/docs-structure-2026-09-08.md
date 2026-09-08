# How the documentation is organised, and why the "Pending" sections went

| | |
|---|---|
| Type | decision |
| State | **closed** · 2026-09-08 |
| Opened | 2026-09-08 |

| Section | State |
|---|---|
| 1. What was found | closed · 2026-09-08 |
| 2. Two layers, one index each | closed · 2026-09-08 |
| 3. No "Pending" sections, no markers in code | closed · 2026-09-08 |
| 4. What was left as it was | — |

## 1. What was found · CLOSED 2026-09-08

Every document under `docs/` opened with a `Pending` list and a dated `Done` checklist above its
reference sections. All four `Pending` lists said "nothing outstanding". Two real deferrals sat
in prose elsewhere in the same files — backup status being server-wide ("revisit if…"), and
host-key verification ("revisit before…") — and neither was in any list. The mechanism produced
four copies of an empty inventory and missed the two items that existed.

`PLAN.md` mixed what is built with how it was decided, and was the document with the most
statements that had stopped being true: "email transport not decided" (built 2026-08-20),
"nothing queries the deploy metric yet" (the instance page does), "v1 is read-only" (Phases 3 to
4.5), "next is the first run on marsella-test" (Phase 0). `infrastructure.md` still said `retire`
and `add` were refused; `app.md` listed a `features/coming-soon/` directory that no longer
exists, and `monitoring.md` pointed at a *Deployment history screen* entry in a Pending list that
had none. Every one of these was a document describing a moment rather than a state.

## 2. Two layers, one index each · CLOSED 2026-09-08

- **Reference** (`docs/*.md`): how what exists works. No status, no dates in headings except
  where a section records what a real test found on a given day. Changes when the code changes.
  Index: [../README.md](../README.md).
- **Decision log** (`docs/decisions/`): what was examined, decided or deferred, one document per
  topic, dated by opening, updated in place, with a header and a per-section status table.
  Index: [INDEX.md](INDEX.md), the only inventory of what is open.

`PLAN.md` was split along that line: the architecture, constraints and alerting design became
[architecture.md](../architecture.md); the phases and revisions became
[plan-phases-2026-08-17.md](plan-phases-2026-08-17.md). The root `README.md` and `CLAUDE.md`
point at the indexes and do not repeat them.

The directory is `decisions/` rather than the `decisiones/` the shared convention names, because
this repository is English throughout by an earlier decision.

## 3. No "Pending" sections, no markers in code · CLOSED 2026-09-08

The `Pending` sections were removed, not emptied: a section that exists invites the next
"nothing outstanding". A deferred item goes to the decision log. A `TODO`/`FIXME` marker in code
is the wrong tool for this repository — there is no half-built code to anchor one to, and a marker
turns an undecided idea into declared debt in code that is fine. `git grep` for them returns
nothing and should keep doing so.

## 4. What was left as it was

The `Done` checklists in `app.md`, `monitoring.md` and `stack-integration.md` are still where
they were. They are a changelog inside reference documents and would belong in the log; moving
them means rewriting each entry into the section that describes the feature, which is a session
of its own. Until then they are read as history, and the section below each list is the
reference.

Two dead pointers in comments were noticed and not touched, being outside a documentation pass:
`infra/homeserver/atalaya/backend.Dockerfile` refers to `infra/atalaya/README.md`, which does not
exist, and `app.md`'s 2026-08-19 registration entry names `backend.env.example`, a file the
install rework later removed (accurate as history).
