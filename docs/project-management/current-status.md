# TerraPedia Current Status

## Date

2026-07-09

## Current Phase

Project governance reset and crawler reliability stabilization.

## Active Sequence

Document-level judgment: July work is focused on crawler monitor reliability, crawler resume/recovery hardening, and project documentation governance.

Current sequence:

P0 governance/status synchronization -> P1 crawler monitor and resume/recovery stabilization -> P2 homepage aggregation and public UI polish.

## Current Gate Boundary

Current workflow authority is `docs/project-governance/00_WORKFLOW.md`.
Bash/WSL is the primary local automation path. The full local gate is:

```bash
bash ./scripts/dev/quality-gate.sh
```

No runtime/backend/frontend/data gate was run for the 2026-07-09 governance audit. Treat old May release evidence as historical until rerun.

## Data Chain Boundary

Acceptance status must flow through manifest, report evidence, freshness audit, manual refresh plan, quality gate, then UI/API.
UI/API must not generate evidence, refresh data, or query DB as gate evidence.

## Public Domain Boundary

The May V0.1 Nuxt public preview evidence covered Items, NPCs, Bosses, Buffs, Projectiles, Armor Sets, Biomes, Crafting, Categories, Search, Articles, and About. Treat that evidence as historical until the current Bash gate and route checks are rerun.

Public surface readiness still does not override Domain Acceptance. Missing or unknown evidence blocks; stale evidence is warning-only unless a current decision explicitly accepts it as `accepted-warning`. A blocker is cleared only when gate-consumed evidence is durable across machines; local-only ignored evidence is classification support, not closure.

## Monitor Boundary

Data Source Acceptance `crawlerMonitor` is read-only monitor projection and external monitor evidence. It is not crawler execution, not a refresh-plan/evidence command, and not an evidence generator.
Future DB-backed or real-time crawler diagnostics must be marked `notGateEvidence=true` and must not affect gate status.

## Local Self-start Boundary

Local self-start acceptance is runtime-only. Current maintained entrypoints are Bash/WSL scripts:

```bash
bash ./scripts/dev/start-local-stack.sh
bash ./scripts/dev/stop-local-stack.sh
```

Legacy `.ps1` local-stack scripts may appear in older May records or compatibility wrappers, but they are not current workflow authority and do not change acceptance readiness.
Smoke is read-only business probing and report writing under `reports/local-start`; it must not generate evidence, refresh data, run storage sync, or bypass manifest -> report evidence -> freshness audit -> manual refresh plan -> quality gate.

## P2 Status

P2 UI work is allowed only after P0 governance/status synchronization and P1 crawler/data reliability control points are stable. New public feature expansion should not be prioritized ahead of crawler/data reliability work unless explicitly accepted as preview-only work.

## Next Actions

- Finish classifying and controlling `docs/project-governance/` so old planning files do not drive current execution.
- Keep `docs/project-governance/current/PROJECT_CONTROL.md` aligned with `docs/project-management/current-status.md`.
- Continue crawler monitor/resume stabilization from the current July plans before broad public feature expansion.
- Decide whether to push local `main`, open a PR, or keep the governance rename local; local `main` is currently ahead of `origin/main`.
- Rerun runtime/backend/frontend/data gates before making any release, staging, or public-readiness claim.
