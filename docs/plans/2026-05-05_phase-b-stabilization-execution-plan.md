# TerraPedia Phase B Stabilization Execution Plan Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement these plans task-by-task. Execute the linked task cards serially unless a task explicitly says read-only only.

**Goal:** Provide the ordered entry point for Phase B stabilization execution after splitting the original large plan into independent task cards.

**Architecture:** This index owns ordering, hard boundaries, and final verification. Each child task card owns one commit-sized scope and can be executed independently without reading the entire original plan.

**Tech Stack:** GitHub Actions Windows runner, PowerShell, Node.js `node --test`, Spring Boot + Java 17 + Maven, Nuxt 4 admin app, Vue 3 + Vite public front, existing TerraPedia reports under `reports/**`.

---

## Source Inputs

- Boundary decisions: `docs/plans/2026-05-05_phase-b-boundary-options.md`
- Split task cards: `docs/plans/2026-05-05_phase-b-stabilization-execution-plan/`

## Fixed Decisions

```text
O1=A
O2=C
O3=A
O4=A
O5=A
O6=C
O7=A
O8=A
O9=A
O10=A
O11=A
O12=A
O13=A
O14=A+C
O15=A
O16=A
O17=A
```

## Hard Boundaries

- Do not run crawler/import/backfill/load/apply or DB-writing commands.
- Acceptance UI/API must not generate evidence or refresh data.
- Refresh plan output remains manual-only: `executeMode=manual`, `executionPolicy=plan-only`.
- Any Item Group blocked consumer reference is always blocking.
- Missing/stale/unknown/unreadable evidence is at least warning; public-blocking evidence is blocking.
- Public front fallback cannot make readiness pass.
- `verify-local-stack.ps1` is local runtime verification, not CI quality gate.
- Do not use `git add .`; stage exact files only.

## Execution Order

1. [P0-00 Project Management Records](2026-05-05_phase-b-stabilization-execution-plan/P0-00-project-management-records.md)
2. [P0-01 CI Quality Gate](2026-05-05_phase-b-stabilization-execution-plan/P0-01-ci-quality-gate.md)
3. [P0-02a Data Source Acceptance Failure Samples API](2026-05-05_phase-b-stabilization-execution-plan/P0-02a-data-source-acceptance-api.md)
4. [P0-02b Data Source Acceptance Admin Drilldown](2026-05-05_phase-b-stabilization-execution-plan/P0-02b-data-source-acceptance-admin.md)
5. [P0.5a Domain Acceptance Script And Gate Closeout](2026-05-05_phase-b-stabilization-execution-plan/P0-5a-domain-acceptance-gate.md)
6. [P0.5b Domain Acceptance Backend Projection](2026-05-05_phase-b-stabilization-execution-plan/P0-5b-domain-acceptance-backend.md)
7. [P0.5c Domain Acceptance Admin View](2026-05-05_phase-b-stabilization-execution-plan/P0-5c-domain-acceptance-admin.md)
8. [P1 Item/NPC Public Acceptance](2026-05-05_phase-b-stabilization-execution-plan/P1-item-npc-public-acceptance.md)
9. [P2 Public Domain Readiness Records](2026-05-05_phase-b-stabilization-execution-plan/P2-public-domain-readiness.md)

## Commit Order

```text
docs: add phase b project management records
ci: add phase b safe quality gate
feat: add data source acceptance failure samples api
feat: show data source acceptance failure samples
test: harden domain acceptance workflow gates
feat: harden domain acceptance backend projection
feat: harden domain acceptance admin view
test: add item npc public acceptance coverage
docs: record phase b p2 public domain readiness
```

## Final Verification

Run after all task cards are complete:

```powershell
node --test scripts/dev/quality-gate.test.mjs scripts/data/workflow/data-source-acceptance-report-manifest.test.mjs scripts/data/workflow/data-source-acceptance-freshness-audit.test.mjs scripts/data/workflow/data-source-acceptance-refresh-plan.test.mjs scripts/data/workflow/domain-acceptance-report-manifest.test.mjs scripts/data/workflow/domain-acceptance-freshness-audit.test.mjs scripts/data/workflow/domain-acceptance-refresh-plan.test.mjs scripts/data/workflow/domain-acceptance-a-grade-gate.test.mjs
cd back
mvn "-Dtest=DataSourceAcceptanceServiceImplTest,AdminDataSourceAcceptanceControllerTest,DomainAcceptanceServiceImplTest,AdminDomainAcceptanceControllerTest" test
cd ..\data-query-app
pnpm run test
cd ..\front
pnpm run test
```

Run local full gate before a release checkpoint:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\quality-gate.ps1
```

## Stop Conditions

Stop and update project records if any task requires DB writes, crawler/import/backfill/load/apply execution, real-time DB gate queries, public planned-domain route creation, or downgrading Any Item Group blocking evidence.
