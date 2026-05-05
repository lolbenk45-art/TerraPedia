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

## P2 Status

P2 is readiness-only after P1. No new public Boss, Buff, Projectile, or ArmorSet code is scheduled in Phase B.
