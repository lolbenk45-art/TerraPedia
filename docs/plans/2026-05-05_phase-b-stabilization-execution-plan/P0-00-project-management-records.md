# P0-00 Project Management Records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish durable Phase B project-management records before code changes.

**Architecture:** Create compact git-tracked management files that record current status, risks, decisions, and the 2026-05-05 daily queue. Later tasks update these files instead of burying risk decisions in implementation notes.

**Tech Stack:** Markdown project records under `docs/project-management/`.

---

## Files

- Create: `docs/project-management/current-status.md`
- Create: `docs/project-management/risk-register.md`
- Create: `docs/project-management/decision-log.md`
- Create: `docs/project-management/daily/2026-05-05.md`

## Steps

- [ ] **Step 1: Verify files are absent or read existing content**

Run:

```powershell
Test-Path .\docs\project-management\current-status.md
Test-Path .\docs\project-management\risk-register.md
Test-Path .\docs\project-management\decision-log.md
Test-Path .\docs\project-management\daily\2026-05-05.md
```

Expected before first implementation: missing files return `False`. If any file exists, read it and append without deleting content.

- [ ] **Step 2: Create `current-status.md`**

Use this content:

```markdown
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
```

- [ ] **Step 3: Create `risk-register.md`**

Use this content:

```markdown
# TerraPedia Risk Register

| Risk ID | Severity | Area | Risk | Mitigation | Status |
| --- | --- | --- | --- | --- | --- |
| R-2026-05-05-01 | High | CI | CI becomes permanently red because it runs DB/service-dependent checks | CI v1 runs CI-safe gate only; full gate remains local | Open |
| R-2026-05-05-02 | High | Data Source Acceptance | Drilldown uses real-time DB and bypasses report evidence | First version reads reports only; DB diagnostics must be `notGateEvidence=true` | Open |
| R-2026-05-05-03 | High | Domain Acceptance | Public domains are implemented before readiness gates | Domain Acceptance is P0.5 and blocks P2 public routes | Open |
| R-2026-05-05-04 | High | Any Item Group | Blocked group references are downgraded as warnings | `blockedGroupReferences > 0` remains blocking | Open |
| R-2026-05-05-05 | Medium | Images | Public fallback hides image readiness failure | Fallback is tested as UI behavior only and never changes readiness status | Open |
```

- [ ] **Step 4: Create `decision-log.md`**

Use this content:

```markdown
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
```

- [ ] **Step 5: Create daily note**

Use this content:

```markdown
# Daily Summary - 2026-05-05

## Focus

Phase B stabilization execution plan and first P0 tasks.

## Decisions Applied

- CI v1 is safe gate, not full local gate.
- Data Source Drilldown reads reports only.
- Domain Acceptance moves to P0.5.
- Item/NPC public work waits for P0.5.

## Next Queue

1. P0-01 CI quality gate.
2. P0-02a Data Source Acceptance backend failure samples.
3. P0-02b Data Source Acceptance admin drilldown.
4. P0.5 Domain Acceptance closeout.

## Blockers

None recorded at plan creation time.
```

- [ ] **Step 6: Validate docs**

Run:

```powershell
Test-Path .\docs\project-management\current-status.md
Test-Path .\docs\project-management\risk-register.md
Test-Path .\docs\project-management\decision-log.md
Test-Path .\docs\project-management\daily\2026-05-05.md
Select-String -Path .\docs\project-management\decision-log.md -Pattern "CI v1"
Select-String -Path .\docs\project-management\risk-register.md -Pattern "notGateEvidence"
```

Expected: all files exist and both `Select-String` commands return at least one match.

- [ ] **Step 7: Commit**

Run:

```powershell
git add docs/project-management/current-status.md docs/project-management/risk-register.md docs/project-management/decision-log.md docs/project-management/daily/2026-05-05.md
git commit -m "docs: add phase b project management records"
```
