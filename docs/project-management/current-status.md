# TerraPedia Current Status

## Date

2026-05-24

## Current Phase

Phase C public preview stabilization.

## Active Sequence

V0.1 public preview has been merged into local `main`.

Next sequence:

P0 domain A-grade blocker triage and burn-down -> P0 staging/preview smoke -> P1 release decision -> P2 UI polish and feature expansion.

## Current Gate Boundary

CI v1 is a CI-safe gate and is not equivalent to the local full gate.
The local full gate remains `scripts/dev/quality-gate.ps1`.

As of 2026-05-24:

- Domain freshness is current: `freshCount=45`, `missingCount=0`, `staleCount=0`, `unknownCount=0`.
- Domain A-grade final closeout has no generated blockers: `summary.generatedBlockedCount=0`, `summary.generatedWarningCount=18`, `overallStatus=warning`.
- Front Nuxt preview final smoke passed on the local Task 5 stack: public route check `24` routes, visual gate `failureCount=0`, `warningCount=0`, typecheck exit `0`.
- Local stack preview closeout smoke passed from the Task 6 worktree: backend `18088`, admin `3001`, front `5174`, Redis `6380`, MinIO public `9000`, built-in smoke `passed=9 failed=0`, public route smoke `13/13` returned `200`.
- Public V0.1 must be described as a preview surface, not final A-grade release readiness.

## Data Chain Boundary

Acceptance status must flow through manifest, report evidence, freshness audit, manual refresh plan, quality gate, then UI/API.
UI/API must not generate evidence, refresh data, or query DB as gate evidence.

## Public Domain Boundary

The V0.1 Nuxt public preview now exposes public pages for Items, NPCs, Bosses, Buffs, Projectiles, Armor Sets, Biomes, Crafting, Categories, Search, Articles, and About.

This preview surface does not override Domain Acceptance. Current public-blocking policy: missing or unknown evidence blocks. `public-blocking stale` is warning by default; only explicit `accepted-warning` may continue to readiness-only evaluation, and stale evidence cannot make a domain route-ready.

The 2026-05-24 remaining-blocker repair closed the four Group B source snapshot blockers with durable gate-consumed evidence. Task 1 of the preview closeout loop initially found only `terria_v1_local` and `terria_v1_relation`, then the operator provided the Windows MySQL source and `terria_v1_maint` was restored into WSL `127.0.0.1:13306`. Task 2 generated Boss image lineage evidence and reclassified `bosses/imageReadiness` from blocked to warning; the warning is a real contract gap (`missing_relation_image_rows`, `missing_projection_rows`) but no longer blocks on missing evidence. Task 3 regenerated relation coverage and reclassified `projectiles/relationReadiness` from blocked to warning; the old `nameZh.gap=1006` was stale evidence, and fresh `projectiles.nameZh.gap=0`. Task 4 final closeout confirmed freshness `pass` and A-grade gate exit `0` with 18 warning panels. Task 5 front-nuxt final smoke passed after stabilizing the route readiness wait for the visual checker. Task 6 local stack closeout smoke passed from the updated main-derived worktree and confirmed backend/admin/front route reachability without stale process roots. A blocker is cleared only when the gate-consumed evidence is durable across machines; local-only ignored evidence is classification support, not closure.

## Monitor Boundary

Data Source Acceptance `crawlerMonitor` is read-only monitor projection and external monitor evidence. It is not crawler execution, not a refresh-plan/evidence command, and not an evidence generator.
Future DB-backed or real-time crawler diagnostics must be marked `notGateEvidence=true` and must not affect gate status.

## Local Self-start Boundary

Local self-start acceptance is runtime-only. `verify-local-stack.ps1`, `start-local-stack.ps1`, `smoke-local-stack.ps1`, and `stop-local-stack.ps1` do not change acceptance readiness.
Smoke is read-only business probing and report writing under `reports/local-start`; it must not generate evidence, refresh data, run storage sync, or bypass manifest -> report evidence -> freshness audit -> manual refresh plan -> quality gate.

## P2 Status

P2 UI work is allowed only after the P0 blocker triage and burn-down path is under control. New public feature expansion should not be prioritized ahead of the Domain A-grade blocker triage unless explicitly accepted as preview-only work.

## Next Actions

- Continue the preview closeout loop with release-decision review.
- Decide whether to push local `main` to `origin/main`; local `main` is ahead of remote after the V0.1 preview merge.
- Add an automatic NPC zh-name gate in the next data-quality iteration. Current evidence shows `npc-id-row-images.json` can contain Chinese names while `npcs.name_zh` may still regress to empty if a write path skips zh persistence. Add a DB/API coverage check so this fails before UI review.
- Run staging or preview-origin smoke before any external release claim.
