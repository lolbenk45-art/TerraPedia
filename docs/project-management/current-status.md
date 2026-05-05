# TerraPedia Current Status

## Date

2026-05-05

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
