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
- Domain A-grade remains blocked after remaining-blocker repair execution: `generatedBlockedCount=2`, `generatedWarningCount=16`.
- Public V0.1 must be described as a preview surface, not final A-grade release readiness.

## Data Chain Boundary

Acceptance status must flow through manifest, report evidence, freshness audit, manual refresh plan, quality gate, then UI/API.
UI/API must not generate evidence, refresh data, or query DB as gate evidence.

## Public Domain Boundary

The V0.1 Nuxt public preview now exposes public pages for Items, NPCs, Bosses, Buffs, Projectiles, Armor Sets, Biomes, Crafting, Categories, Search, Articles, and About.

This preview surface does not override Domain Acceptance. Current public-blocking policy: missing or unknown evidence blocks. `public-blocking stale` is warning by default; only explicit `accepted-warning` may continue to readiness-only evaluation, and stale evidence cannot make a domain route-ready.

The 2026-05-24 remaining-blocker repair closed the four Group B source snapshot blockers with durable gate-consumed evidence. The remaining A-grade blockers are `bosses/imageReadiness` and `projectiles/relationReadiness`; both are now blocked by the incomplete local DB read environment because `terria_v1_maint` is missing. Task 1 of the preview closeout loop reran the read-only inventory against `127.0.0.1:13306` and found only `terria_v1_local` and `terria_v1_relation`. A blocker is cleared only when the gate-consumed evidence is durable across machines; local-only ignored evidence is classification support, not closure.

## Monitor Boundary

Data Source Acceptance `crawlerMonitor` is read-only monitor projection and external monitor evidence. It is not crawler execution, not a refresh-plan/evidence command, and not an evidence generator.
Future DB-backed or real-time crawler diagnostics must be marked `notGateEvidence=true` and must not affect gate status.

## Local Self-start Boundary

Local self-start acceptance is runtime-only. `verify-local-stack.ps1`, `start-local-stack.ps1`, `smoke-local-stack.ps1`, and `stop-local-stack.ps1` do not change acceptance readiness.
Smoke is read-only business probing and report writing under `reports/local-start`; it must not generate evidence, refresh data, run storage sync, or bypass manifest -> report evidence -> freshness audit -> manual refresh plan -> quality gate.

## P2 Status

P2 UI work is allowed only after the P0 blocker triage and burn-down path is under control. New public feature expansion should not be prioritized ahead of the Domain A-grade blocker triage unless explicitly accepted as preview-only work.

## Next Actions

- Keep V0.1 preview-only until an operator provides or restores readable `terria_v1_maint`; then rerun Boss image lineage and projectile relation coverage evidence from the preview closeout loop.
- Decide whether to push local `main` to `origin/main`; local `main` is ahead of remote after the V0.1 preview merge.
- Add an automatic NPC zh-name gate in the next data-quality iteration. Current evidence shows `npc-id-row-images.json` can contain Chinese names while `npcs.name_zh` may still regress to empty if a write path skips zh persistence. Add a DB/API coverage check so this fails before UI review.
- Run staging or preview-origin smoke before any external release claim.
