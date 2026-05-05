# TerraPedia Risk Register

| Risk ID | Severity | Area | Risk | Mitigation | Status |
| --- | --- | --- | --- | --- | --- |
| R-2026-05-05-01 | High | CI | CI becomes permanently red because it runs DB/service-dependent checks | CI v1 runs CI-safe gate only; full gate remains local | Open |
| R-2026-05-05-02 | High | Data Source Acceptance | Drilldown uses real-time DB and bypasses report evidence | First version reads reports only; DB diagnostics must be `notGateEvidence=true` | Open |
| R-2026-05-05-03 | High | Domain Acceptance | Public domains are implemented before readiness gates | Domain Acceptance is P0.5 and blocks P2 public routes | Open |
| R-2026-05-05-04 | High | Any Item Group | Blocked group references are downgraded as warnings | `blockedGroupReferences > 0` remains blocking | Open |
| R-2026-05-05-05 | Medium | Images | Public fallback hides image readiness failure | Fallback is tested as UI behavior only and never changes readiness status | Open |
