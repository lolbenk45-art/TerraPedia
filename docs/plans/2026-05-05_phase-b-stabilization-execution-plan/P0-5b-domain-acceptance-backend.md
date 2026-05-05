# P0.5b Domain Acceptance Backend Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure `/admin/domain-acceptance/overview` exposes a complete, report-derived P0.5 projection.

**Architecture:** The backend projection must derive status from the domain acceptance registry and latest report evidence only. It must never execute generator commands or query DB as a readiness shortcut.

**Tech Stack:** Spring Boot DTO/service/controller tests, existing domain acceptance registry and reports.

---

## Files

- Modify: `back/src/main/java/com/terraria/skills/dto/DomainAcceptanceOverviewDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/DomainAcceptanceServiceImpl.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/DomainAcceptanceServiceImplTest.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/AdminDomainAcceptanceControllerTest.java`

## Steps

- [ ] **Step 1: Add backend tests**

Required assertions:

- Fresh report panel has `freshnessStatus="fresh"` and no `nextEvidenceCommand`.
- Stale report panel has `freshnessStatus="stale"` and `nextEvidenceCommand`.
- Unreadable JSON panel is blocked or unknown and never fresh.
- Missing public-blocking panel blocks public gate.
- Planned-public domain with `publicRoute=null` remains non-public and visible.
- Refresh action has `executeMode="manual"` and `executionPolicy="plan-only"`.

- [ ] **Step 2: Run tests and verify current behavior**

Run:

```powershell
cd back
mvn "-Dtest=DomainAcceptanceServiceImplTest,AdminDomainAcceptanceControllerTest" test
```

Expected: PASS if current implementation already satisfies these cases; otherwise fail only on the missing case being added.

- [ ] **Step 3: Implement minimal backend projection changes**

Allowed data sources:

- `scripts/data/workflow/domain-acceptance-registry.json`
- latest `reports/domain/<domainId>/*.json`
- report modified time when `generatedAt` is absent

Forbidden data sources:

- real-time DB gate query
- crawler monitor mutation endpoint
- execution of `generatorCommand`

- [ ] **Step 4: Validate backend**

Run:

```powershell
cd back
mvn "-Dtest=DomainAcceptanceServiceImplTest,AdminDomainAcceptanceControllerTest" test
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add back/src/main/java/com/terraria/skills/dto/DomainAcceptanceOverviewDTO.java back/src/main/java/com/terraria/skills/service/impl/DomainAcceptanceServiceImpl.java back/src/test/java/com/terraria/skills/service/impl/DomainAcceptanceServiceImplTest.java back/src/test/java/com/terraria/skills/controller/AdminDomainAcceptanceControllerTest.java
git commit -m "feat: harden domain acceptance backend projection"
```
