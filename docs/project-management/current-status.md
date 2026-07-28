# TerraPedia Current Status

## Date

2026-07-29

## Current Phase

Crawler reliability stabilization and approval-gated automated-ingestion closure.

## Active Sequence

Document-level judgment: July work is focused on crawler monitor reliability, crawler resume/recovery hardening, and project documentation governance.

Current sequence:

P0 governance/status synchronization -> P1 crawler monitor and resume/recovery stabilization -> P2 homepage aggregation and public UI polish.

The automated-ingestion closure branch has reached group `CODE_READY/T1_VERIFIED`,
NPC fixture `CODE_READY`, formal Flyway V58, and one L0/DISABLED `biomes`
policy. Batch 02 completed the repaired 25-target NPC crawler and localized
1,788 item images. Formal relation item-group schema, group T2, NPC apply/T1,
five warning panels, one blocked item-image panel, the first two L1 applies,
L2, and scheduler activation remain approval- or evidence-gated.

## Current Gate Boundary

Current workflow authority is `docs/project-governance/00_WORKFLOW.md`.
Current progress-control authority is `docs/project-governance/current/PROJECT_CONTROL.md`.
Current stack, code style, architecture, API contract, and validation/release
summaries live in
`docs/project-governance/current/CURRENT_TECH_STACK.md`,
`docs/project-governance/current/CURRENT_CODE_STYLE.md`,
`docs/project-governance/current/CURRENT_ARCHITECTURE.md`,
`docs/project-governance/current/CURRENT_API_CONTRACTS.md`, and
`docs/project-governance/current/CURRENT_VALIDATION_AND_RELEASE.md`.
Bash/WSL is the primary local automation path. The full local gate is:

```bash
bash ./scripts/dev/quality-gate.sh
```

No runtime/backend/frontend/data gate was run for the 2026-07-09 governance
audit or the current status/risk synchronization task. Treat old May release
evidence as historical until rerun.

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

## Current Blockers And Risks

- Stale root governance files `03`, `04`, and `07-12` were removed from the current tree on 2026-07-10; Git history remains audit-only recovery, not current authority.
- Current companion docs now define stack, code style, architecture, API
  contract, validation, and release boundaries; they must be updated when
  package scripts, runtime config, API route families, response/auth contracts,
  data chain, or gate behavior changes.
- Code style now has a current document and EditorConfig baseline, but
  Prettier/ESLint/Spotless and strong style gates remain staged until each
  maintained line has a clean baseline.
- `docs/project-management/risk-register.md` is the current risk surface; old May risk rows are historical unless revalidated into the current table.
- Release, staging, or public-readiness claims remain blocked until fresh Bash gate, route, and data-readiness evidence exists.
- Crawler monitor and resume/recovery stabilization remains P1 until current plans and validation evidence show the reliability loop is stable.
- Automated ingestion remains fail-closed: Batch 03 schema/recipe/boss retries
  require exact request-hash authorization; NPC apply has no ownership-valid
  executor; item image readiness blocks on missing/unresolved source uploads.

## Next Actions

- Keep `docs/project-governance/current/PROJECT_CONTROL.md` aligned with `docs/project-management/current-status.md`.
- Keep current stack, code style, architecture, API contract, validation, and
  release summaries aligned with code and workflow changes.
- Introduce frontend and backend formatter/linter tooling through separate
  baseline migrations before adding read-only style checks to the full gate.
- Keep `docs/project-governance/00_CURRENT_SPEC.md`, `docs/devlog/current.md`, and project-management records synchronized when project facts or risks change.
- Continue crawler monitor/resume stabilization from the current July plans before broad public feature expansion.
- Decide whether to push or PR the local governance/status branches when the operator is ready.
- Rerun runtime/backend/frontend/data gates before making any release, staging, or public-readiness claim.
