# Buff Manual Automation Test Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repeatable, manually started Buff automation test window that drives the fixture-only scheduler through a natural tick and proves the isolated Buff T1 ingestion chain while leaving production DB15, Armor DB14, and historical DB16 untouched.

**Architecture:** The local shell wrapper starts a Node coordinator with a fixed T1 fixture profile. The coordinator derives a run identity, reserves Redis DB13 and three run-derived MySQL schemas through the existing system driver, enables only `fixture-changed-only`, waits for the scheduler's natural tick, runs the existing Buff T1 acceptance executor, and always disables and cleans up in a `finally` path. The driver owns backend lifecycle, queue state, leases, temporary accounts, schema cleanup, and independent readback; the coordinator owns the bounded window state machine and private evidence artifact.

**Tech Stack:** Node.js ESM and `node:test`, Bash, Spring Boot crawler-monitor fixture mode, MySQL, Redis V2 queue, existing `buff-canonical-t1-acceptance.mjs`, and the existing `crawler-queue-v2-scheduler-system-driver.mjs`.

**Design source:** `docs/superpowers/specs/2026-10-10-buff-manual-automation-test-window-design.md`

---

### Task 1: Lock the test-window identity and fixture contracts

**Files:**
- Create: `pipelines/automation/buff-automation-test-window.mjs`
- Create: `pipelines/automation/buff-automation-test-window.test.mjs`
- Test: `pipelines/automation/automation-test-profile.test.mjs`

- [x] **Step 1: Write failing contract tests.**

  Add `node:test` cases for these exact contracts:

  - `parseWindowArgs([])` returns `{ profile: 't1', windowMinutes: 5 }`.
  - Only `--fixture-profile=t1` is accepted; `t0`, `t2-readonly`, unknown flags, non-integers, zero, and values above `15` throw.
  - `buildBuffAutomationTestIdentity(runId)` produces a run key matching `^[a-z0-9]{1,3}_[a-f0-9]{16}$`, schemas matching `terria_v1_automation_acceptance_<runKey>_{local,maint,relation}`, Redis DB `13`, and a namespace matching `terrapedia:crawler:wiki-monitor:v2:test:<runId>:`.
  - `assertTestWindowResources` rejects formal schemas and Redis DB14, DB15, DB16, zero, and out-of-range values before any driver call.
  - `assertFixtureAutomationPayload` accepts only `enabled=true`, `mode=fixture-changed-only`, `sweepIntervalMinutes=1`, and `canaryActionId=crawler-queue-v2-fixture`.
  - `assertNaturalFixtureTick` requires exactly one changed fixture detection, exactly one accepted fixture dispatch, and `manualSweepCalls=0` when that field is present.
  - `assertTerminalFixtureAttempt` accepts only `completed`, `failed`, `timed_out`, or `cancelled`.

  Run:

  ```bash
  cd /home/lolben/TerraPedia/.worktrees/automation-domain-buff
  node --test pipelines/automation/buff-automation-test-window.test.mjs
  ```

  Expected: the new tests fail because the coordinator exports do not exist or do not enforce the contracts.

- [x] **Step 2: Implement the pure identity and assertion helpers.**

  In `buff-automation-test-window.mjs`, define and export `DEFAULT_WINDOW_MINUTES=5`, `MAX_WINDOW_MINUTES=15`, `TEST_REDIS_DB=13`, `FIXTURE_ACTION_ID='crawler-queue-v2-fixture'`, `FIXTURE_DOMAIN='crawler_queue_v2_fixture'`, and `FIXTURE_MODE='fixture-changed-only'`. Implement `parseWindowArgs`, `buildBuffAutomationTestIdentity`, `assertTestWindowResources`, `assertFixtureAutomationPayload`, `assertNaturalFixtureTick`, `assertTerminalFixtureAttempt`, and `buildWindowArtifact` using the existing `FORMAL_DATABASES` and `assertAutomationRedisLogicalDb` contracts. Hash `pipelines/buff/fixtures/buff-t1.sample.json` with SHA-256 for `fixtureSha256`; do not hash or modify the production Wiki manifest.

- [x] **Step 3: Run the contract tests.**

  ```bash
  node --test pipelines/automation/buff-automation-test-window.test.mjs pipelines/automation/automation-test-profile.test.mjs
  ```

  Expected: all contract tests pass, and no MySQL or Redis process is started by either test file.

- [x] **Step 4: Commit the pure contract checkpoint.**

  ```bash
  git add pipelines/automation/buff-automation-test-window.mjs pipelines/automation/buff-automation-test-window.test.mjs
  git commit -m "test(buff): define isolated automation window contracts"
  ```

  Stage only the two task files; do not stage existing Buff audit or runtime changes.

### Task 2: Implement the bounded window state machine

**Files:**
- Modify: `pipelines/automation/buff-automation-test-window.mjs`
- Modify: `pipelines/automation/buff-automation-test-window.test.mjs`

- [x] **Step 1: Add failing lifecycle tests.**

  Use a fake driver with methods `prepare`, `observeDisabledTick`, `enableAutomation`, `waitForScheduledTick`, `waitForProgress`, `disableAutomation`, `cleanup`, and `independentReadback`. Assert this call order on success:

  ```text
  prepare -> observeDisabledTick -> enableAutomation -> waitForScheduledTick
  -> waitForProgress -> disableAutomation -> cleanup -> independentReadback
  ```

  Add failure cases where the natural tick times out, the attempt finishes non-completed, Buff acceptance is not `passed`, disable returns `enabled != false`, cleanup throws, or independent readback reports non-zero live work. Each case must write an artifact, must attempt disable, and must return `failed` when disable is confirmed or `blocked` when it is not.

- [x] **Step 2: Implement `runBuffAutomationTestWindow`.**

  Record `startedAt` and `expiresAt` before enabling. Call `driver.prepare()` and fail if the initial disabled observation reports a dispatch. Enable only with `{ enabled: true, mode: FIXTURE_MODE, sweepIntervalMinutes: 1, canaryActionId: FIXTURE_ACTION_ID }`. Wait for the natural tick deadline, read terminal progress, require `status=completed`, and require `progress.buffAcceptance.status='passed'`. In `finally`, call `disableAutomation` if it was not confirmed, call `cleanup` with diagnostics retained on failure, then call `independentReadback`. Treat non-zero `liveAttempts`, `liveClaims`, `liveFences`, backend/child processes, Redis keys, credentials, files, ports, or databases as a failure. Write one artifact containing `manual_isolated_acceptance=true`, `production_source_delta=false`, and `databaseWritesToFormalRuntime=false` in addition to the run identity, fixture hash, responses, natural tick, terminal attempt, Buff acceptance, failure, and readback fields.

- [x] **Step 3: Run lifecycle tests and syntax validation.**

  ```bash
  node --test pipelines/automation/buff-automation-test-window.test.mjs
  node --check pipelines/automation/buff-automation-test-window.mjs
  git diff --check
  ```

  Expected: success, timeout, disable-failure, cleanup-failure, and dirty-readback cases all produce the specified terminal status without network or database access.

### Task 3: Bind the fixture window to the existing scheduler system driver

**Files:**
- Modify: `pipelines/monitor/crawler-queue-v2-scheduler-system-driver.mjs`
- Modify: `pipelines/monitor/crawler-queue-v2-scheduler-lifecycle.test.mjs`
- Test: `pipelines/buff/buff-canonical-t1-acceptance.test.mjs`

- [x] **Step 1: Add driver contract tests before implementation.**

  Assert that `createSystemDriver` rejects combining `itemMode` and `buffMode`, accepts only loopback MySQL and an isolated Redis logical DB, starts the backend with `fixtureMode=true`, uses operation ID `canonical-buff-manual-automation-test-window`, and maps fixture terminal progress to `buffAcceptance`. Assert that cleanup drops only the manifest's run-derived schemas, releases only the manifest's Redis reservation, cleans temporary accounts, and reports zero resources after cleanup.

- [x] **Step 2: Implement Buff driver mode.**

  Add `buffMode` and `fixtureMode` options to the driver state and backend environment. When `fixtureMode` is true, pass the fixture-enabled scheduler environment and preserve the run-derived fixture namespace. When `buffMode` is true, select `runBuffCanonicalT1Acceptance` at terminal progress using the provisioner account for writes and the read-only account for formal source reads. Return its result as `buffAcceptance` and expose it through `waitForProgress` and `independentReadback`. Keep item and recipe paths unchanged.

- [x] **Step 3: Verify the existing Buff T1 chain in isolation.**

  ```bash
  node --test pipelines/buff/buff-canonical-t1-acceptance.test.mjs
  node --test pipelines/monitor/crawler-queue-v2-scheduler-lifecycle.test.mjs
  ```

  Expected: two fixture Buff rows reach isolated local/maint/relation/projection tables, eleven item-Buff relations and four inflicting-NPC relations are exact, projection payloads match the fixture, and formal databases remain read-only.

- [x] **Step 4: Commit the driver checkpoint.**

  ```bash
  git add pipelines/monitor/crawler-queue-v2-scheduler-system-driver.mjs pipelines/monitor/crawler-queue-v2-scheduler-lifecycle.test.mjs pipelines/buff/buff-canonical-t1-acceptance.test.mjs
  git commit -m "feat(buff): connect fixture window to isolated scheduler driver"
  ```

  Stage the existing lifecycle test that covers `createSystemDriver`; do not stage unrelated scheduler or Armor files.

### Task 4: Enforce fixture-only mode in the backend

**Files:**
- Modify: `services/catalog-api/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Test: `services/catalog-api/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`
- Check: `services/catalog-api/src/main/resources/application.yml`

- [x] **Step 1: Add focused backend tests.**

  Cover both branches of the mode gate: a fixture-enabled test profile accepts `fixture-changed-only` with the registered `crawler-queue-v2-fixture` canary, while a normal profile rejects the mode with an `IllegalArgumentException` and continues to report `changed-only`. Verify that reading persisted fixture mode from a non-fixture profile forces disabled state. Verify that production `changed-only` behavior remains unchanged.

- [x] **Step 2: Implement the mode gate.**

  Normalize the request mode in `CrawlerMonitorServiceImpl`. Accept `fixture-changed-only` only when `fixtureScheduledAutomationEnabled` is true; otherwise throw before writing scheduler state. When reading configuration, expose fixture mode only in the fixture-enabled profile and force `enabled=false` for persisted fixture mode in a normal profile. Keep the canary ID normalized through the existing registered-action validation.

- [x] **Step 3: Run the focused Maven tests.**

  ```bash
  cd services/catalog-api
  mvn -Dtest=CrawlerMonitorServiceImplTest test
  ```

  Expected: focused backend tests pass and no production service is restarted or enabled by the test run.

### Task 5: Add the manual shell entrypoint and private evidence output

**Files:**
- Create: `platform/local/run-buff-automation-test-window.sh`
- Modify: `platform/local/run-buff-automation-test-window.test.mjs`
- Modify: `platform/local/quality-gate.sh`
- Modify: `platform/local/quality-gate-automation-live-contract.test.mjs`

- [x] **Step 1: Add shell validation tests.**

  Assert `--fixture-profile=t1` and `--window-minutes=1..15` are forwarded, while other profiles, non-integers, zero, values above `15`, and unknown flags exit `2`. Assert the wrapper resolves the repository root from its own directory and invokes exactly `node pipelines/automation/buff-automation-test-window.mjs`.

- [x] **Step 2: Implement the wrapper.**

  Use `set -euo pipefail`, require `node`, parse only `--fixture-profile` and `--window-minutes`, enforce `t1` and the `1..15` range, `cd` to the repository root, and `exec` the Node coordinator. Do not accept arbitrary config paths, database names, Redis DBs, source paths, or commands.

- [x] **Step 3: Register deterministic unit coverage in the quality gate.**

  Add `pipelines/automation/buff-automation-test-window.test.mjs` to the `Crawler automation contract tests` list in `platform/local/quality-gate.sh`. Do not add the live five-minute command to the default quality gate; the live window remains an explicit operator action.

- [x] **Step 4: Run shell and gate contract checks.**

  ```bash
  bash -n platform/local/run-buff-automation-test-window.sh
  node --test platform/local/quality-gate-automation-live-contract.test.mjs platform/local/run-buff-automation-test-window.test.mjs pipelines/automation/buff-automation-test-window.test.mjs
  git diff --check
  ```

### Task 6: Execute the isolated runtime acceptance and close the evidence

**Files:**
- Runtime output: `.local/tmp/buff-automation-test-window-<runKey>.json` (mode `0600`)
- Update: `docs/devlog/current.md`
- Update: `docs/devlog/entries/2026-09-29-automation-domain-buff.md`

- [x] **Step 1: Run the narrow preflight.**

  Confirm the active Buff runtime is `18105` with Redis DB15 and `enabled=false`; confirm Armor is `18104` with DB14; confirm no active test DB13 keys, test schemas, live attempts, claims, or fences. Do not issue `FLUSHDB`, direct Redis writes, production scheduler writes, or permit/decision replay.

- [x] **Step 2: Run the manual test window.**

  ```bash
  cd /home/lolben/TerraPedia/.worktrees/automation-domain-buff
  bash ./platform/local/run-buff-automation-test-window.sh --fixture-profile=t1 --window-minutes=5
  ```

  Expected: one natural scheduler tick with `manualSweepCalls=0`, one accepted fixture dispatch, a completed terminal attempt, Buff T1 status `passed`, confirmed disable, and an artifact under `.local/tmp/` with zero live resources after cleanup. A failed or timed-out run must exit non-zero and retain diagnostics without retrying its run ID.

- [x] **Step 3: Independently read back production isolation.**

  Verify authenticated Buff API health/automation/overview on `18105` returns `200`, `enabled=false`, `liveAttempts=0`, `sweepClaims=0`, healthy reconciler, and unchanged source fingerprint. Verify Armor DB14 is unchanged. Query only the run-derived schemas and Redis DB13 for cleanup evidence; never query-write formal tables.

- [x] **Step 4: Run final focused validation.**

  ```bash
  node --test \
    pipelines/automation/buff-automation-test-window.test.mjs \
    pipelines/automation/automation-test-profile.test.mjs \
    pipelines/automation/run-live-automation-acceptance.test.mjs \
    pipelines/buff/buff-canonical-t1-acceptance.test.mjs
  node --check pipelines/automation/buff-automation-test-window.mjs
  node --check pipelines/monitor/crawler-queue-v2-scheduler-system-driver.mjs
  git diff --check
  git status --short
  ```

  Expected: all focused tests pass, syntax checks exit `0`, whitespace checks exit `0`, and the final status identifies only this task's explicitly staged paths plus pre-existing user changes.

- [x] **Step 5: Update the devlog and commit only task evidence.**

  Record the run key, fixture hash, artifact path, natural tick timestamp, attempt ID, terminal status, cleanup readback, production zero-write checks, and any residual risk. Stage only the runner, wrapper, driver/backend changes, focused tests, this plan, and the devlog entry. Use a focused message such as:

  ```bash
  git add docs/superpowers/plans/2026-10-10-buff-manual-automation-test-window.md docs/devlog/current.md docs/devlog/entries/2026-09-29-automation-domain-buff.md
  git commit -m "feat(buff): add manual isolated automation window"
  ```

## Stop Conditions

- Stop before enabling anything if the active runtime is not Buff `18105`/DB15, if Armor DB14 or historical DB16 is selected, if DB13 is non-empty, or if a formal database name appears in the derived manifest.
- Stop and preserve diagnostics if the natural tick is absent, `manualSweepCalls` is non-zero, the fixture attempt does not reach a terminal completed state, Buff T1 readback is not exact, or reconciler/live-work cleanup is not zero.
- Never resolve a failure by calling `/v2/automation/sweep`, editing Redis markers, flushing a logical DB, replaying an old permit/decision, or writing formal Buff/Armor tables.
