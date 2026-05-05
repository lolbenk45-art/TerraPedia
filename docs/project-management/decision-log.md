# TerraPedia Decision Log

## D-2026-05-05-01: CI v1 uses Windows CI-safe gate

Decision: Use `windows-latest` and a CI-safe PowerShell gate for first CI integration.
Reason: Current local scripts are Windows-oriented, and full local gate may include DB/service assumptions.

## D-2026-05-05-02: verify-local-stack is not CI

Decision: `scripts/dev/verify-local-stack.ps1` remains local runtime verification only.
Reason: CI should not depend on local DB TCP, ports, or already-running services.

## D-2026-05-05-03: Drilldown reads reports only

Decision: Data Source Acceptance Drilldown first version uses latest report JSON and parsed report fields only.
Reason: Real-time DB queries would bypass evidence freshness and refresh-plan gates.

## D-2026-05-05-04: Domain Acceptance is P0.5

Decision: Domain Acceptance closes before Item/NPC public acceptance and before new public domains.
Reason: New public surfaces must not define their own readiness rules.

## D-2026-05-05-05: B-tier public domains stay planned-public

Decision: Boss, Buff, Projectile, and ArmorSet keep `publicExposure=planned-public` and `publicRoute=null`.
Reason: Phase B is readiness and admin visibility, not new public page implementation.
