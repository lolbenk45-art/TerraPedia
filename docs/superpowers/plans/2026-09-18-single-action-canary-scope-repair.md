# Single-Action Scheduler Canary Scope Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind a fresh scheduler authorization to exactly one eligible action and make the backend reject every other action during that authorization window.

**Architecture:** The selected action enters the read-only preflight as a canonical `{ actionId, domainId }` scope, then flows unchanged through proposal, Owner request, and frozen policy-decision input. The decision writer persists it immutably; the backend checks that stored scope before probing or dispatching. Local-stack configuration supplies independent durable-state and command roots so a canonical restart cannot use a stale monitor producer.

**Tech Stack:** Node.js ESM and `node:test`, Spring Boot/Java 17/JUnit, MyBatis annotations, Flyway SQL, Bash.

---

### Task 1: Persist local command-root configuration

**Files:**
- Modify: `platform/local/lib/runtime-config.sh`, `platform/local/start-local-stack.sh`, `platform/local/config/local-stack.config.example.json`
- Test: `platform/local/local-stack.test.mjs`

- [ ] Write the failing test:

```js
assert.match(runtimeConfig, /TP_CRAWLER_QUEUE_V2_COMMAND_ROOT/);
assert.match(source, /TERRAPEDIA_CRAWLER_QUEUE_V2_COMMAND_ROOT/);
assert.match(exampleConfig, /"crawlerQueueV2"/);
```

- [ ] Run `node --test platform/local/local-stack.test.mjs` and observe the missing export failure.
- [ ] Add `backend.crawlerQueueV2.{repoRoot,commandRoot}`, defaulted to `.` and overridable by `TERRAPEDIA_CRAWLER_QUEUE_V2_*_ROOT`; resolve both paths and forward them to the backend as JVM `-Dterrapedia.crawler.queue-v2.*-root` properties. Add only sanitized roots to `run-manifest.json`.
- [ ] Re-run `node --test platform/local/local-stack.test.mjs` and require exit `0`.

### Task 2: Bind one action through read-only artifacts

**Files:**
- Modify: `pipelines/automation/crawler-v2-scheduler-activation-preflight.mjs`, `pipelines/automation/build-canonical-crawler-v2-scheduler-activation-proposal.mjs`, `pipelines/automation/build-canonical-scheduler-activation-request.mjs`, `pipelines/automation/capture-crawler-v2-scheduler-activation-input.mjs`
- Test: their four matching `*.test.mjs` files

- [ ] Write failing tests proving a preflight carries `{ actionId: 'wiki-items-refresh', domainId: 'items' }`, an unknown action fails, proposal/request retain the identical scope, and capture rejects a request whose scope differs from its input.
- [ ] Run:

```bash
node --test pipelines/automation/crawler-v2-scheduler-activation-preflight.test.mjs \
  pipelines/automation/build-canonical-crawler-v2-scheduler-activation-proposal.test.mjs \
  pipelines/automation/build-canonical-scheduler-activation-request.test.mjs \
  pipelines/automation/capture-crawler-v2-scheduler-activation-input.test.mjs
```

Expected: new scope assertions fail.

- [ ] Implement `normalizeSchedulerCanaryAction(actionId, domains)` against the registered domain/action mapping. The preflight CLI requires `--canary-action-id`; proposal, request, and capture preserve the exact scope. Capture requires `--request`, validates the request before its `START TRANSACTION READ ONLY`, and includes request path/file hash/request hash plus scope in the private input.
- [ ] Re-run the four suites and require exit `0`.

### Task 3: Persist and enforce authorized scope

**Files:**
- Create: `services/catalog-api/src/main/resources/db/migration/V61__bind_scheduler_activation_canary_scope.sql`
- Modify: `pipelines/automation/run-automation-policy-decision.mjs`, `services/catalog-api/src/main/java/com/terraria/skills/service/CrawlerAutomationPolicyService.java`, `services/catalog-api/src/main/java/com/terraria/skills/mapper/CrawlerAutomationActivationDecisionMapper.java`, `services/catalog-api/src/main/java/com/terraria/skills/service/impl/CrawlerAutomationPolicyServiceImpl.java`, `services/catalog-api/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Test: corresponding Node/JUnit/mapper contract tests

- [ ] Add RED tests proving the writer passes `authorizedActionId`, absent or mismatched scope yields `SCHEDULER_CANARY_SCOPE_REQUIRED` or `SCHEDULER_CANARY_ACTION_MISMATCH`, and the V2 monitor skips non-selected changed actions.
- [ ] Run:

```bash
node --test pipelines/automation/run-automation-policy-decision.test.mjs
cd services/catalog-api && mvn -Dtest=CrawlerAutomationPolicyServiceImplTest,CrawlerMonitorServiceImplTest,CrawlerAutomationActivationDecisionMapperSqlContractTest test
```

Expected: new scope assertions fail.

- [ ] Add V61 `authorized_action_id VARCHAR(128) NULL` to the immutable decision table. Require and insert this field only for `automation-crawler-v2-scheduler-activation`; expose it through the record/mapper. Add an action-aware scheduler eligibility method. In V2, a missing configured action, a legacy null decision scope, or any mismatch blocks before source probe; recheck the same scope inside the mutation permit before enqueue/retry.
- [ ] Re-run the Node and Maven commands above and require exit `0`. Do not start the backend or apply V61 in this task.

### Task 4: Bind changed runtime code into the execution manifest

**Files:**
- Modify: `pipelines/automation/canonical-operation-execution-manifest.mjs`
- Test: `pipelines/automation/canonical-operation-execution-manifest.test.mjs`

- [ ] Add RED assertions that the scheduler proposal code bundle contains `start-local-stack.sh`, `runtime-config.sh`, `CrawlerMonitorServiceImpl.java`, `CrawlerAutomationPolicyServiceImpl.java`, the mapper, and V61.
- [ ] Run `node --test pipelines/automation/canonical-operation-execution-manifest.test.mjs` and observe failure.
- [ ] Add those exact paths to the scheduler activation governing bundle, then re-run the test and require exit `0`.

### Task 5: Validate and resume only read-only work

**Files:**
- Modify: `docs/devlog/current.md`, `docs/devlog/entries/2026-08-31-automation-scheduler-activation-handoff.md`

- [ ] Run all focused Node suites from Tasks 1-4, the focused Maven suite from Task 3, and `git diff --check`.
- [ ] Record results, explicit un-applied V61 status, and that this repair made no scheduler control, source probe, crawler/import, Redis queue, or business-data write.
- [ ] After a later canonical restart applies V61 and an authenticated readback proves the configured roots, create a new retry-labelled read-only preflight with `--canary-action-id=wiki-items-refresh`. No old preflight, packet, or decision is reusable.
