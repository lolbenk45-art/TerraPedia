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

## D-2026-05-06-01: public-blocking stale requires accepted-warning

Decision: `public-blocking stale` evidence defaults to warning. `public-blocking missing/unknown` evidence remains blocking. A stale public-blocking panel may continue to readiness-only evaluation only when it is explicitly recorded as `accepted-warning`; it must not become route-ready directly from stale evidence.
Reason: Stale public evidence should stay visible and bounded without silently opening public routes or making every stale report a hard block.

## D-2026-05-06-02: crawlerMonitor is external monitor evidence only

Decision: Data Source Acceptance `crawlerMonitor` is a read-only monitor projection and external monitor evidence. It is not crawler execution and is not an evidence generator. If future DB-backed or real-time diagnostics are added, every such sample must carry `notGateEvidence=true` and must not affect gate status.
Reason: Monitor visibility must not bypass the manifest -> report evidence -> freshness audit -> manual refresh plan -> quality gate chain.

## D-2026-05-06-03: Local acceptance uses separate verify, start, smoke, and stop steps

Decision: Local acceptance separates preflight verification, service startup, post-start smoke, and shutdown. Startup port checks are not business health, and smoke is not the local full quality gate.
Reason: A single startup script cannot safely represent compile/type health, runtime health, data freshness, and acceptance gate status.

## D-2026-05-06-04: Local stop defaults to recorded pid-only cleanup

Decision: `stop-local-stack.ps1` stops recorded pid files by default. Port cleanup is available only through explicit `-ForcePorts` and still requires local stack ownership checks.
Reason: Port-based cleanup can terminate unrelated developer services when ports overlap or stale report files exist.

## D-2026-05-06-05: Local smoke is read-only and cannot replace acceptance evidence

Decision: `smoke-local-stack.ps1` may issue read-oriented HTTP probes and optional auth login only for authenticated reads. It must not run crawler, import, backfill, load, apply, write, refresh, storage sync, or evidence generation.
Reason: Local runtime probing must not bypass the manifest -> report evidence -> freshness audit -> manual refresh plan -> quality gate chain.
