# TerraPedia Current Status

## Date

2026-05-06

## Current Phase

Phase B stabilization.

## Active Sequence

P0-00 -> P0-01 -> P0-02a -> P0-02b -> P0.5a -> P0.5b -> P0.5c -> P1 -> P2-docs.

## Current Gate Boundary

CI v1 is a CI-safe gate and is not equivalent to the local full gate.
The local full gate remains `scripts/dev/quality-gate.ps1`.

## Data Chain Boundary

Acceptance status must flow through manifest, report evidence, freshness audit, manual refresh plan, quality gate, then UI/API.
UI/API must not generate evidence, refresh data, or query DB as gate evidence.

## Public Domain Boundary

Boss, Buff, Projectile, and ArmorSet remain planned-public until Domain Acceptance permits public exposure.
Current public-blocking policy: missing or unknown evidence blocks. `public-blocking stale` is warning by default; only explicit `accepted-warning` may continue to readiness-only evaluation, and stale evidence cannot make a domain route-ready.

## Monitor Boundary

Data Source Acceptance `crawlerMonitor` is read-only monitor projection and external monitor evidence. It is not crawler execution, not a refresh-plan/evidence command, and not an evidence generator.
Future DB-backed or real-time crawler diagnostics must be marked `notGateEvidence=true` and must not affect gate status.

## Local Self-start Boundary

Local self-start acceptance is runtime-only. `verify-local-stack.ps1`, `start-local-stack.ps1`, `smoke-local-stack.ps1`, and `stop-local-stack.ps1` do not change acceptance readiness.
Smoke is read-only business probing and report writing under `reports/local-start`; it must not generate evidence, refresh data, run storage sync, or bypass manifest -> report evidence -> freshness audit -> manual refresh plan -> quality gate.

## P2 Status

P2 is readiness-only after P1. No new public Boss, Buff, Projectile, or ArmorSet code is scheduled in Phase B.

## Next TODO

- Add an automatic NPC zh-name gate for the next iteration. Current evidence shows `npc-id-row-images.json` can contain Chinese names while `npcs.name_zh` may still regress to empty if a write path skips zh persistence. Add a DB/API coverage check so this fails before UI review.
