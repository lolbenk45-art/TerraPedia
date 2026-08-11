# Crawler V2 Items T1 Isolated Acceptance Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that the real V2 `items/sample` action can be scheduled, execute its bounded offline Item fixture, persist the expected Item-derived rows in disposable local/maint/relation schemas, and clean every resource back to zero.

**Architecture:** Reuse the existing owned system-driver lifecycle and fixture-only scheduler boundary. Add an Item-specific recorded/offline executor that reads only the approved tracked Item fixture, copies the exact Item dependency closure from the formal source through the readonly account, runs the existing Item import/sync path against run-derived databases, and emits marker-owned progress plus DB readback. The run remains isolated on Redis DB 14 and a run-derived backend/database/account set.

**Tech Stack:** Node.js ESM tests and executors, Spring Boot V2 monitor, MySQL derived schemas, Redis V2 namespace, Maven focused tests.

**Out of scope:** Formal `terria_v1_*` writes, production scheduler enablement, Wiki/network access, permit creation/consumption, activation proposal, unrelated NPC/Town data, and frontend changes.

---

### Task 1: Freeze the Item fixture and dependency contract

**Files:**
- Read: `scripts/data/monitor/crawler-queue-v2-items-fixture.mjs`
- Read: `scripts/data/monitor/crawler-queue-v2-items-fixture.test.mjs`
- Read: `data/standardized/items.standardized.json`
- Create: `scripts/data/monitor/recorded-item-auto-ingestion.mjs`
- Create: `scripts/data/monitor/recorded-item-auto-ingestion.test.mjs`

- [ ] Write a failing test that requires the Item executor to select at most one hundred explicit fixture records, expose `networkAccess=false`, and reject an absolute/network source path.
- [ ] Write a failing dependency-closure test requiring every selected `internalName` to resolve through readonly formal `local.items`, with no broad table snapshot or `LIMIT` fallback.
- [ ] Implement the bounded response reader and exact Item dependency selector using the existing `recorded-http-fixture-source.mjs` and the repository's Item fixture identity; keep the generic five-record cap unchanged for other domains.
- [ ] Run `node --test scripts/data/monitor/recorded-item-auto-ingestion.test.mjs`; expected result is all new tests passing with zero network requests.

### Task 2: Add disposable Item DB import and readback

**Files:**
- Read: the existing Item import/sync entrypoint used by the fixture action
- Modify: `scripts/data/monitor/recorded-item-auto-ingestion.mjs`
- Create: `scripts/data/monitor/recorded-item-t1-acceptance.mjs`
- Create: `scripts/data/monitor/recorded-item-t1-acceptance.test.mjs`

- [ ] Write a failing fake-connection test requiring writes to only the run-derived local/maint/relation names, exact selected Item count, maint lineage count, relation projection count, and zero unresolved identities.
- [ ] Implement the minimal executor using the provisioner account for targets and readonly account for formal source rows; require the three database names to share one run key.
- [ ] Add marker-owned progress states `starting`, `running`, and `completed` with a terminal sequence and a redacted summary containing Item/maint/relation counts.
- [ ] Add failure-path coverage proving a missing formal Item fails closed and rolls back/cleans target writes.
- [ ] Run the Item executor and acceptance tests; expected result is zero failures and no formal database mutation.

### Task 3: Wire Item into the owned scheduler driver

**Files:**
- Modify: `scripts/data/monitor/crawler-queue-v2-scheduler-system-driver.mjs`
- Modify: `scripts/data/monitor/crawler-queue-v2-scheduler-lifecycle.mjs`
- Modify: `scripts/data/monitor/crawler-queue-v2-scheduler-lifecycle.test.mjs`
- Modify: `scripts/data/automation/canonical-operation-catalog.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.test.mjs`

- [ ] Add a failing runtime-hook test requiring the driver to seed the Item dependency closure before backend startup and to assert Item progress/readback, while retaining the Recipe fixture contract.
- [ ] Add an explicit `items` scheduled fixture route that cannot dispatch formal `items` rules and cannot call `check-source-updates.mjs`.
- [ ] Extend the driver report with `itemIngestion`, `itemDbReadback`, and marker-owned progress paths; keep the existing renewal, restart/adopt, lease-loss/reap, and zero-cleanup assertions.
- [ ] Update the governed Item T1 manifest definition and its stable operation-ID test without changing activation proposal behavior.
- [ ] Run focused scheduler, Item, manifest, recorded-response, and backend fixture tests before any live run.

### Task 4: Execute one fresh real isolated Item lifecycle

**Files:**
- Create: `/tmp/terrapedia-crawler-v2-items-t1-<run-id>/` (runtime only)
- Create: `reports/canonical-migration/canonical-crawler-v2-items-t1-acceptance.json`
- Do not modify: `data/generated/wiki-town-npc-maintenance.latest.json`, `data/generated/resume/`

- [ ] Verify loopback MySQL/Redis endpoints, Redis DB 14 emptiness, no listener on the chosen backend port, and no matching derived schemas/accounts.
- [ ] Run the live lifecycle with a new run ID and marker root; require disabled tick `0`, exactly one scheduled Item fixture dispatch, two lease renewals, backend restart adoption plus mismatch rejection, lease-loss reap, terminal Item progress, and DB/relationship readback.
- [ ] On success, independently query Redis, MySQL schemas/accounts, process listeners, marker root, and permits; require every cleanup count to be zero.
- [ ] On failure, preserve only redacted private diagnostics, record the blocker in the active devlog, and do not promote the report.

### Task 5: Evidence and handoff

**Files:**
- Modify: `docs/devlog/entries/2026-08-09-crawler-v2-items-t1-isolated-acceptance.md`
- Modify: `docs/devlog/current.md`
- Create only after a passed run: `reports/authorization/canonical/canonical-crawler-v2-items-t1-acceptance-<date>.execution-manifest.json`
- Create only after a passed run: `reports/authorization/canonical/canonical-crawler-v2-items-t1-acceptance-<date>.request.json`

- [ ] Record exact run identity, Item/maint/relation counts, progress sequence, cleanup readback, test commands, and residual risk in the devlog.
- [ ] Run `git diff --check`, `git status --short`, and explicit-path scope review; keep user-preserved artifacts unstaged.
- [ ] Only after all runtime assertions pass, generate a current-hash `AWAITING_OWNER` request; never authorize it, create a permit, enable production scheduler, or generate an activation proposal in this task.

## Validation Matrix

- Unit/contract: Item recorded executor, dependency closure, fixture routing, manifest tests.
- Backend: `mvn -Dtest=CrawlerMonitorServiceImplTest test` plus the fixture-specific scheduler selection.
- Runtime: one real loopback Spring lifecycle on Redis DB 14 with independent all-zero cleanup.
- Boundary: no Wiki requests, no formal DB writes, no production Redis namespace, no permit, no activation proposal.

## Failure Continuity

If any step discovers a source/schema/route mismatch, stop the live run, preserve the redacted diagnostic, repair this plan and its focused tests, rerun the affected validation, and only then continue to the next task. Do not broaden the generic snapshot cap or bypass the offline/read-only boundary.
