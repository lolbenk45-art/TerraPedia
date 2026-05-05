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

## D-2026-05-05-06: CI v1 warning policy

Decision: CI v1 fails on blocking, unsafe generator command, DB-writing generator command, and public-blocking missing/unknown evidence. CI v1 does not fail on ordinary warning.
Reason: Existing stale reports and relation warnings should remain visible without making initial CI permanently red.

## D-2026-05-05-07: Domain Acceptance blocks P2 public domains

Decision: Domain Acceptance is P0.5 and must close before Item/NPC public acceptance and before new public Boss/Buff/Projectile/ArmorSet work.
Reason: Public consumers must not define readiness independently of registry, reports, freshness, refresh plan, and gate.
