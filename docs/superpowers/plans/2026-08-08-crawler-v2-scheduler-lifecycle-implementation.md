# Crawler V2 Scheduler Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prove the existing Spring-owned V2 changed-only scheduler, lease renewal, and restart recovery in an isolated fixture runtime, then produce (but do not consume) a current-hash ADMIN activation proposal.

**Architecture:** Extend the existing V2 fixture and monitor acceptance conventions with a marker-owned lifecycle harness. The harness starts an isolated backend and fixture child, enables automation only through the authenticated loopback API, observes scheduled dispatch and Redis/manifest/progress identity, restarts the same backend, and performs exact cleanup. Add a separate canonical operation contract for the formal scheduler activation; this batch only builds its manifest/request/proposal and leaves production `enabled=false`.

**Tech Stack:** Node.js ESM scripts/tests, Bash harnesses, Spring Boot/Maven focused tests, Redis CLI/API readback, existing canonical ADMIN authorization helpers.

---

### Task 1: Add the V2 operation and contract fixtures

**Files:**
- Modify: `scripts/data/automation/canonical-operation-catalog.mjs`
- Modify: `scripts/data/automation/canonical-operation-catalog.test.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.test.mjs`
- Create: `scripts/data/automation/fixtures/crawler-v2-scheduler-activation.json`
- Test: `scripts/data/automation/crawler-v2-scheduler-activation-contract.test.mjs`

- [ ] **Step 1: Write failing contract tests.** Assert both operation IDs are registered, the T1 operation accepts only `crawler_queue_v2_fixture`/`crawler-queue-v2-fixture`, `databaseWrites=false`, and the formal activation manifest requires the T1 report hash, exact scheduler/reconciler/recovery/config/API code hashes, durable marker/epoch/production namespace, disabled state, zero live attempts, healthy reconciler, eligible-domain readiness, interval/actor/reason/expiry/rollback/postcondition.
- [ ] **Step 2: Run the focused Node tests and verify they fail** because the operation IDs and manifest fields are absent.
- [ ] **Step 3: Implement the smallest catalog/manifest additions.** Keep formal databases out of both operations, reject production namespaces and manual-sweep entrypoints, and make the fixture operation's output/report paths marker-owned.
- [ ] **Step 4: Run the focused tests and `git diff --check`; expect all contract assertions to pass.**

### Task 2: Make fixture progress and lifecycle evidence complete

**Files:**
- Modify: `scripts/data/monitor/crawler-queue-v2-fixture.mjs`
- Modify: `scripts/data/monitor/crawler-queue-v2-fixture.test.mjs`
- Create: `scripts/data/monitor/crawler-queue-v2-scheduler-lifecycle.mjs`
- Create: `scripts/data/monitor/crawler-queue-v2-scheduler-lifecycle.test.mjs`

- [ ] **Step 1: Write failing tests** for atomic progress writes (`running` before wait, monotonic sequence/current, heartbeat, terminal status), exact attempt identity matching across overview/Redis/manifest/log/progress, at least two renewals, concurrent-sweep single dispatch, forced lease-loss child reap, and cleanup refusing non-marker-owned paths or unrelated PIDs.
- [ ] **Step 2: Run the Node tests and verify the new lifecycle assertions fail.**
- [ ] **Step 3: Implement the harness as explicit phases:** allocate run ID, namespace, empty Redis DB, ports, fixture root and ephemeral credential; start backend with an isolated env; poll disabled scheduled ticks; enable only via authenticated loopback PUT; wait for a real scheduled tick; collect renewal/recovery evidence; stop/restart only the harness-owned backend; exercise mismatch and lease-loss branches; stop children; exact-prefix cleanup; independent readback; write `reports/canonical-migration/canonical-crawler-v2-scheduler-t1-acceptance.json` without secrets.
- [ ] **Step 4: Run the lifecycle unit tests and existing `scripts/data/monitor/crawler-queue-v2-fixture.test.mjs`; expect PASS.**

### Task 3: Add backend observability/guards only for gaps exposed by T1 tests

**Files:**
- Modify only the specific Spring class exposed by Task 2, chosen from:
  `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`,
  `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Reconciler.java`,
  `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2RecoveryService.java`,
  or `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptSupervisor.java`
- Test: corresponding focused test under `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/` or `CrawlerMonitorServiceImplTest.java`

- [ ] **Step 1: Capture a concrete failing runtime assertion from the isolated harness; do not pre-emptively refactor.**
- [ ] **Step 2: Add the narrowest failing Spring test** for scheduled-only dispatch, exact lease identity/renewal evidence, restart adopt/reject, or unhealthy-round no-claim behavior.
- [ ] **Step 3: Implement the minimal guard/telemetry change** while preserving Spring scheduler ownership and fail-closed semantics.
- [ ] **Step 4: Run the focused Maven class set:** `cd back && mvn -Dtest=CrawlerMonitorServiceImplTest,CrawlerQueueV2ReconcilerTest,CrawlerQueueV2RecoveryServiceTest,CrawlerAttemptSupervisorTest,RedisCrawlerQueueV2RepositoryTest,CrawlerQueueV2ApplicationServiceTest,AdminCrawlerMonitorControllerTest,CrawlerQueueV2ConfigurationTest test`.

### Task 4: Execute isolated Scheduler Lifecycle T1 under fresh ADMIN authorization

**Files:**
- Modify: `scripts/data/automation/canonical-operation-catalog.mjs` only if Task 1 contract tests identify a missing path
- Create: `reports/authorization/canonical/canonical-crawler-v2-scheduler-t1-acceptance.input.json`
- Create: `reports/authorization/canonical/canonical-crawler-v2-scheduler-t1-acceptance.request.json`
- Create: `reports/authorization/canonical/canonical-crawler-v2-scheduler-t1-acceptance.packet.json`
- Create: `reports/authorization/canonical/canonical-crawler-v2-scheduler-t1-acceptance.permit.json` (private, consumed/revoked during run)
- Create: `reports/canonical-migration/canonical-crawler-v2-scheduler-t1-acceptance.json`

- [ ] **Step 1: Generate fresh current-hash manifest/request/packet/permit** using the canonical authorization builder; record no bearer token, password, or permit secret in tracked evidence.
- [ ] **Step 2: Run only the isolated lifecycle harness** with offline/local fixtures, derived test namespace, empty Redis logical DB, marker-owned root, temporary backend port and credential. The harness must prove all ten lifecycle assertions from the design and must never call the manual sweep endpoint or write formal DB/Redis namespaces.
- [ ] **Step 3: Run independent cleanup readback** for exact Redis prefixes, child/backend PIDs, ports, fixture root, temporary credentials, leases, dedupe and ready/live membership; require all zero and `cleanupPassed=true`.
- [ ] **Step 4: Validate the retained JSON schema/hash and run focused Node plus Maven tests.** On any failure, classify the gap in the devlog, repair the plan/implementation, and rerun from a fresh isolated run ID.

### Task 5: Build the formal activation proposal without enabling production

**Files:**
- Create: `scripts/data/automation/build-canonical-crawler-v2-scheduler-activation-proposal.mjs`
- Create: `scripts/data/automation/build-canonical-crawler-v2-scheduler-activation-proposal.test.mjs`
- Create: `reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.input.json`
- Create: `reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.request.json`
- Create: `reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.proposal.json`
- Modify: `docs/devlog/entries/2026-08-08-crawler-v2-scheduler-lifecycle.md`
- Modify: `docs/devlog/current.md`

- [ ] **Step 1: Write failing proposal tests** for current-hash binding, `enabled=false`, changed-only mode, zero live attempts, domain readiness, authenticated loopback PUT as the sole future mutation, explicit rollback, and rejection of direct JSON/Redis writes, manual sweep, daemon start, or formal permit consumption.
- [ ] **Step 2: Implement the proposal builder** by hashing the fresh T1 report and exact code/config/API bundle, reading current durable marker/epoch/namespace and readiness evidence, and emitting technically complete input/request/proposal files with no permit.
- [ ] **Step 3: Run proposal tests, `git diff --check`, targeted consistency scans, and confirm the production automation config remains absent or `enabled=false`.**
- [ ] **Step 4: Update the active devlog with plan path, test/report hashes, cleanup evidence, residual risks, and the next explicit OWNER/ADMIN checkpoint; commit docs/plan separately before implementation and commit the implementation as one focused task.

### Task 6: Final verification and handoff

- [ ] **Step 1:** Run all focused Node contract/lifecycle/fixture tests and the focused Maven suite.
- [ ] **Step 2:** Validate the retained T1 report and activation proposal against current hashes; run independent zero-resource readback again.
- [ ] **Step 3:** Run `git status --short`, `git diff --check`, and `git diff --cached --stat`; verify `data/generated/wiki-town-npc-maintenance.latest.json` and `data/generated/resume/` remain unstaged and untouched.
- [ ] **Step 4:** Leave formal activation disabled, do not run a real scheduled Wiki sweep, do not push/merge, and report the T1 decision/report plus the exact next activation checkpoint.

## Self-review against the specification

- Disabled tick, API-bound isolated enable, real scheduled enqueue, identity/progress, two renewals, concurrent dedupe, restart adopt/reject, lease-loss fail-closed, V1/epoch boundaries, and dual cleanup each have explicit tasks and evidence.
- Production activation is a separate operation and ends at proposal generation; no formal permit is consumed.
- No placeholder task is delegated to memory: every code/data path, command, boundary, and failure branch is named. A runtime gap must be captured and repaired under Task 3 before proceeding.
