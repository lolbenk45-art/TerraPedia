# Crawler Monitor Real Dispatch Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real operator-driven crawler monitor dispatch queue so manually triggered tasks are accepted, ordered, cancellable, observable, and executed when the active lock is free, while clearly explaining why stalled tasks cannot currently resume from a checkpoint.

**Architecture:** Keep the existing two execution locks: standard wiki monitor dispatch and 10-domain smoke dispatch. Add a persistent orchestration layer above them with one queue list and per-lane runnable rules. Dispatch clicks create queue items; a drain worker starts the next eligible item for each free lane after completion, cancellation, failure, startup reconciliation, or scheduled sweep. The UI must display only real queued requests as queue state; static registered tasks and sample domain rows must not pretend to be queued.

**Tech Stack:** Spring Boot backend, `CrawlerMonitorServiceImpl`, `StringRedisTemplate`, JSON file mirror under `reports/crawler-monitor/`, Nuxt/Vue admin page `data-query-app/pages/operations/crawler-monitor.vue`, Node contract tests, Maven backend tests.

---

## 0. User-Visible Problems To Close

1. **Current queue is not real enough.**
   - The page can show `队列中` for registered task rows or pending approval rows.
   - `dispatchWikiMonitorTask` still rejects a second manual dispatch when `wiki-monitor-dispatch.lock.json` exists.
   - That rejected click is not persisted as an operator request, so it cannot be ordered, cancelled, or started later.

2. **Task orchestration is currently static in places.**
   - `WIKI_MONITOR_RULES` is the execution allowlist, which is correct.
   - But operator-triggered queue entries must be dynamic: each click becomes a queue item with domain, action, request time, status, and blocker.
   - Do not create a fixed visual list and call it a queue.

3. **Stage progress must monitor the 10 base domains, not only one merged smoke row.**
   - The existing domain smoke task has 10 domain progress cards.
   - The next implementation must preserve this and attach real queue/run/report fields per domain where available.
   - The detail panel remains the source of detailed selected-domain files and reports.

4. **The cancel/stalled message is unclear.**
   - `no matching wiki monitor dispatch is active` is an implementation phrase.
   - Operators need Chinese feedback that says whether the target is not running, already finished, queued instead of active, blocked by another run, or missing from latest dispatch state.

5. **Stalled tasks cannot safely resume today.**
   - Current progress JSON files are monitoring snapshots, not resume checkpoints.
   - A stale heartbeat only proves the script stopped updating; it does not prove which unit was fully committed.
   - Some scripts write bulk output or overwrite latest reports. There is no durable completed-unit ledger, stable input cursor, idempotent output contract, or `--resume-from` runner contract for every action.
   - Therefore the safe current behavior is cancel + explicit rerun/recrawl. Automatic resume would risk duplicate writes, skipped uncommitted units, or corrupted partial outputs.

## 1. Scope

In scope:

- Real backend dispatch queue for crawler monitor actions.
- Queue result fields in dispatch API.
- Queue list in overview API.
- Queue drain worker.
- Cancel queued request.
- Chinese operator messages for locked, queued, missing active dispatch, stalled, cancelled, and cooldown states.
- UI changes that show real queue state and remove misleading fake queue labels.
- Integration checks proving a second click is accepted as queued and later starts.
- Documentation of the stalled/resume limitation and the contract required before real resume can be added.

Out of scope for this plan:

- RabbitMQ. Add it only after the Redis/file queue is insufficient for multi-machine ACK/dead-letter/delayed scheduling needs.
- Global checkpoint resume for every crawler script.
- Automatic production auto-dispatch enablement.
- Destructive data cleanup outside current sample-domain cleanup endpoints.

## 2. Source Of Truth And Data Chain

- **Execution allowlist:** `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java` `WIKI_MONITOR_RULES`.
- **Active execution locks:** standard lane uses `reports/crawler-monitor/wiki-monitor-dispatch.lock.json`; domain-smoke lane uses `reports/crawler-monitor/wiki-monitor-domain-smoke.lock.json`.
- **Latest active/finished dispatch:** `reports/crawler-monitor/wiki-monitor-dispatch.latest.json`.
- **New queue source of truth:** Redis keys, mirrored to `reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json` for debugging and report preview.
- **Overview consumer:** `CrawlerMonitorOverviewDTO.WikiMonitorDTO`.
- **Admin page:** `data-query-app/pages/operations/crawler-monitor.vue`.
- **Frontend helper tests:** `data-query-app/tests/crawler-monitor-page-contract.test.mjs` and `data-query-app/tests/base-domain-orchestration.test.mjs`.
- **Backend tests:** `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java` and `back/src/test/java/com/terraria/skills/controller/AdminCrawlerMonitorControllerTest.java`.

## 3. Queue Contract

### 3.1 Queue Item Fields

Each accepted operator request must create or update one queue item with these fields:

- `queueId`: `wiki-monitor-queue-<timestamp>-<8-char-uuid>`.
- `dispatchId`: null while queued; set when started.
- `lane`: `standard` or `domain_smoke`; this determines which lock controls execution.
- `domain`: requested domain, or `all` for 10-domain smoke. This is `requestedDomain` — the domain the operator/auto-sweep clicked.
- `coveredDomains`: domains the action actually refreshes (e.g. `wiki-core-refresh` covers `items`, `npcs`, `projectiles`). For UI display only; dedupe and execution key off `lane + actionId`, not this list.
- `actionId`: execution action, for example `wiki-core-refresh`, `domain-source-bosses`, or `wiki-monitor-domain-smoke`.
- `status`: `queued`, `blocked_cooldown`, `starting`, `running`, `completed`, `failed`, `timed_out`, `cancelled`.
  - `starting` means a drain worker has atomically claimed the item and is launching the process. It is not a wait-list state and must not be counted in `position`/`lanePosition`.
  - Do not add `skipped` in this plan; no task sets it and adding it would create an unowned terminal state.
- `requestedAt`, `startedAt`, `completedAt`.
- `claimOwner`, `claimedAt`, `claimExpiresAt`: internal repository fields set only while `status=starting`. `claimExpiresAt` is a fixed 5 minute launch lease, separate from the 30 second drain mutex. It exists to recover a crash after queue claim but before `markRunning`. Do not expose these fields in public DTOs unless a later debug UI explicitly needs them.
- `pid`, `processStartedAt`: OS pid and process start time, set on `markRunning`. Required for restart reconciliation in BOTH lanes. The standard lane already persists pid via `recordDispatchRuntime`, but the smoke lock writes only `dispatchId/domain/actionId/limit/lockedAt` (no pid) — so the queue item is the uniform pid source the reconcile reads, independent of which lane wrote which lock file.
- `requestedBy`: admin identity if available; otherwise `admin`.
- `blockedByDispatchId`, `blockedByDomain`, `blockedByActionId`, `blockedSince`.
- `cooldownUntil`: set only when `status=blocked_cooldown`; this is the authoritative time for remaining cooldown display.
- `progressPath`, `reportPath`, `lockPath`, `outputPath`.
- `message`: Chinese-first operator message.

Response-only derived fields:

- `position`: 1-based queue position among **queued and blocked_cooldown** items only (`starting`, `running`, and terminal items are excluded). Computed in memory when building `wikiMonitor.dispatchQueue`; not stored in Redis item JSON or file mirror.
- `lanePosition`: 1-based position among **queued and blocked_cooldown** items in the same `lane` (`starting`, `running`, and terminal items are excluded). A drain may claim an item only when `lanePosition=1` and that lane's lock is free. Excluding `running` means: while A is running in the standard lane, B queued in standard gets `lanePosition=1`, matching the operator message "已加入队列第 1 位" and the Task 4 test assertion `queuePosition=1`.

Public `WikiMonitorQueueItemDTO` fields are the operator-facing subset of section 3.1: include queue identity, lane/domain/action, status, timestamps, pid/processStartedAt when present, blocker fields, cooldownUntil, paths, message, `position`, and `lanePosition`; exclude internal claim fields by default.

### 3.2 Dispatch Identity Mapping

Every running process must be traceable back to exactly one queue item.

- When a queue item starts, atomically claim it first (`queued`/eligible `blocked_cooldown` -> `starting`) before launching any process. Then generate `dispatchId`, launch, and write:
  - queue item: `queueId`, `dispatchId`, `status=running`, `startedAt`.
  - dispatch state file: `queueId`, `dispatchId`, `domain`, `actionId`, `status=running`.
- For the `standard` lane, the durable dispatch state is `wiki-monitor-dispatch.latest.json` plus the standard lock/runtime files. For the `domain_smoke` lane, the durable state is `wiki-monitor-domain-smoke.lock.json` plus smoke progress/report files. A queued smoke launch must write `queueId` into the smoke lock when `queueIdOrNull` is non-null; otherwise expired `starting` recovery and active-cancel fallback cannot prove which queue item owns the smoke process.
- The `starting` claim must write `claimOwner`, `claimedAt`, and `claimExpiresAt=claimedAt+5 minutes`.
- Startup reconciliation and the 15 second sweep must inspect expired `starting` items:
  - If the lane lock/latest state contains the same `queueId`, and `dispatchId` is either absent on the queue item or matches the durable state, and a live pid can be resolved from the lock or queue item, repair the queue item to `running`, persist `dispatchId` if newly discovered, persist `pid`/`processStartedAt`, and re-attach the watcher.
  - If the lane lock/latest state contains the same `queueId`, and `dispatchId` is either absent on the queue item or matches the durable state, but the process is dead, resolve terminal state from the lane report/latest/progress files, mark the item terminal, clear reverse/dedupe keys, and release the lane lock.
  - If no matching lane lock or process can be proven, mark the item `failed` with Chinese message `队列项启动超时，未检测到对应运行进程；请重新加入队列。` and clear dedupe. Do not silently return it to `queued`, because a process may have been launched in the crash window without a durable queue update.
- Add Redis reverse mapping:
  - `terrapedia:crawler:wiki-monitor:dispatch-queue:dispatch:<dispatchId>` -> `queueId`.
- `watchDispatchProcess` must use the passed `queueIdOrNull` first; if it is null, resolve `queueId` from the reverse mapping or from `wiki-monitor-dispatch.latest.json.queueId` before marking terminal state.
- `watchDomainSmokeProcess` must use the passed `queueIdOrNull` first; if it is null, use the same reverse mapping for smoke queue items and may fall back to `wiki-monitor-domain-smoke.lock.json.queueId` only when the lock contains it.
- `watchDomainSmokeProcess` must not infer terminal status only from process exit code. It must call `resolveSmokeTerminalStatus(dispatchId, reportPath, latestPath, progressPath, exitCodeOrNull)` and map smoke report status `completed -> completed`, `partial -> failed`, `failed -> failed`; if the process exited non-zero and no report resolves a status, use `failed`; if recovery has no real exit code and no file resolves a status, use `timed_out`.
- If a watcher cannot resolve a `queueId`, it must still update the legacy latest dispatch state and write a warning to the report/log; it must not start the next queued item until `drainWikiMonitorDispatchQueue("orphan-terminal")` has checked the active lock is released.

This mapping closes the lifecycle gap: the queue repository, watcher, and drain worker all agree which queue item moved from `running` to `completed`, `failed`, `timed_out`, or `cancelled`.

### 3.3 Redis Keys

Use existing `StringRedisTemplate` when available; do not add a new external dependency. `StringRedisTemplate` is optional in the current service constructors, so the non-Redis path must be functional in tests and in a single-instance runtime.

- `terrapedia:crawler:wiki-monitor:dispatch-queue:ids`: Redis list of queue ids in FIFO order.
- `terrapedia:crawler:wiki-monitor:dispatch-queue:item:<queueId>`: JSON string payload for the queue item.
- `terrapedia:crawler:wiki-monitor:dispatch-queue:dedupe:<lane>:<actionId>`: queue id for a queued/blocked_cooldown/starting/running duplicate guard, keyed by lane + action (NOT domain — see 3.4; shared actions like `wiki-core-refresh` must not enqueue once per covered domain).
- `terrapedia:crawler:wiki-monitor:dispatch-queue:dispatch:<dispatchId>`: reverse lookup from running process to queue item.
- `terrapedia:crawler:wiki-monitor:dispatch-queue:cooldown:<lane>:<actionId>`: JSON payload `{lane, actionId, completedDispatchId, completedAt, cooldownUntil}`. This is the authoritative cooldown source after the real queue is introduced; `wiki-monitor-dispatch.latest.json` is a legacy fallback only.
- `terrapedia:crawler:wiki-monitor:dispatch-queue:drain-lock`: drain lock with a fixed 30 second TTL.

Mirror:

- `reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json`
  - Contains `generatedAt`, `items`, `runningCount`, `queuedCount`, `blockedCooldownCount`, `completedCount`, `failedCount`, `cooldowns`.
  - This file is not the primary source when Redis is available.

No-Redis fallback:

- Store queue items in the JSON mirror file.
- Store cooldown entries in the same JSON mirror under `cooldowns` when Redis is null.
- Protect queue mutations and drain with a process-local `ReentrantLock` or `synchronized` guard.
- This fallback is single-instance only. It is acceptable for current unit tests and local single-backend runtime, but it is not a multi-instance coordination mechanism.
- The drain path must use the Redis lock when Redis exists and the process-local lock when Redis is null.

### 3.4 Enqueue Semantics

- If the requested lane lock is free and no earlier waiting/starting/running item exists in the same lane, a dispatch request may start immediately, but it still creates a queue item and transitions through `starting` before `running`.
- If the requested lane lock exists or same-lane backlog exists, and dedupe does not find an existing `queued`/`blocked_cooldown`/`starting`/`running` item for the same `lane + actionId`, the request is persisted as `queued` and returns `accepted=true`, `status=queued`, `queueId`, and `queuePosition` where `queuePosition` means `lanePosition`.
- Cooldown is evaluated before immediate start. If `cooldownUntilFor(lane, actionId)` is still in the future, enqueue a `blocked_cooldown` item even when the lane lock is currently free.
- Deduplicate by `lane + actionId`, NOT by `actionId + domain`. In `WIKI_MONITOR_RULES` the base domains `items`, `npcs`, `projectiles` all map to the same `actionId=wiki-core-refresh` and run the identical command (`run-backend-data-refresh.mjs --steps=wiki-core-refresh`). Deduping by `actionId+domain` would let `wiki-core-refresh` enqueue three times and run the same refresh three times. The action is the execution unit, so one queued/blocked/starting/running `wiki-core-refresh` blocks duplicates regardless of which covered domain triggered it.
- Dedupe covers `queued`, `blocked_cooldown`, `starting`, and `running`. Repeated clicks during cooldown must return the same `blocked_cooldown` queue item and must not create another item.
- Cooldown does not silently reject a queue item. It becomes `blocked_cooldown` with `cooldownUntil` and a clear message; the drain sweep checks it again after cooldown expires.
- Deduplication keys must never be the only source of truth. If a dedupe key points to a missing or terminal queue item, enqueue must delete that stale dedupe key and create a new queue item.
- Dedupe keys get a 24 hour TTL when created and are deleted immediately when the queue item reaches `completed`, `failed`, `timed_out`, or `cancelled`.
- Terminal queue items are retained for recent observability only: keep the newest 100 terminal items or terminal items from the last 7 days, whichever keeps more recent context, but never prune `queued`, `blocked_cooldown`, `starting`, or `running` items.

Drain eligibility:

- `standard` and `domain_smoke` lanes are independent because the existing code has two locks and two active process maps.
- Execution eligibility = the lane lock is free AND the item is the first **waiting** item (`queued` or eligible `blocked_cooldown`) in that lane. A `starting` item is already claimed and must block that lane from being claimed again until it becomes `running` or terminal. A `running` item is represented by the held lane lock, not by waiting position (consistent with 3.1, which excludes `running` from `lanePosition`). Do not phrase this as "first non-terminal item", because `starting`/`running` are non-terminal and would make the rule self-contradict 3.1.
- A running standard dispatch must not block a queued domain-smoke item when the smoke lock is free.
- A running domain-smoke dispatch must not block a queued standard item when the standard lock is free.
- One drain invocation may start at most one item per lane, so at most two processes can be started: one standard and one smoke.

Cooldown source:

- Do not use `wiki-monitor-dispatch.latest.json` as the only cooldown source after queueing exists. It is a single latest slot and a later different action can overwrite the completed action's cooldown evidence.
- When `markTerminal` records a successful standard-lane completion, write/update `cooldown:<lane>:<actionId>` with `completedAt + WIKI_MONITOR_DISPATCH_COOLDOWN`.
- `cooldownUntilFor(lane, actionId)` reads this cooldown entry first. It may fall back to legacy `wiki-monitor-dispatch.latest.json` only when no queue cooldown entry exists.
- If a `blocked_cooldown` item has missing/unparseable `cooldownUntil`, drain must not block the lane forever. It must recompute from `cooldown:<lane>:<actionId>`; if still missing, mark the item `failed` with a Chinese message and clear dedupe so the operator can retry.

Dispatch result truth table:

| Scenario | `accepted` | `status` | `queued` | `queueId` | `queuePosition` | Message rule |
| --- | --- | --- | --- | --- | --- | --- |
| immediate start | `true` | `running` | `false` | present | null | `message` says started |
| queued behind same lane | `true` | `queued` | `true` | present | lane position | `queueMessage` says joined queue |
| duplicate queued/starting/running/cooldown | `true` | existing item status | `true` only when existing item is still waiting | existing queue id | existing lane position if waiting | `queueMessage` says existing request reused |
| cooldown accepted | `true` | `blocked_cooldown` | `true` | present | lane position | `queueMessage` includes `cooldownUntil` |
| queued cancel success | `true` | `cancelled` | `false` | cancelled queue id | null | Chinese cancellation message |
| queued cancel missing | `false` | `missing` | `false` | requested queue id if supplied | null | Chinese not-found message |
| queued cancel on starting item | `false` | `starting` | `false` | queue id | null | Chinese message says the item is starting and asks operator to refresh or use active cancel after it becomes running |
| queued cancel on running item | `false` | `running` | `false` | queue id | null | Chinese message points to active cancel |

Auto-dispatch scheduler coordination:

- Existing `scheduledAutoDispatchSweep` continues to decide what should be requested.
- After Task 4, its call to `dispatchWikiMonitorTask(...)` creates or starts a standard-lane queue item through the same path as manual dispatch.
- The 60 second auto-dispatch scheduler must not bypass the queue or directly compete with the 15 second drain sweep.
- The 15 second drain sweep is the only periodic worker that starts queued items after they have been accepted.

### 3.5 Executor Adapter Contract

Use one queue model with two executor adapters.

`WikiMonitorQueueExecutor`:

- `String lane()`
- `boolean supports(WikiMonitorQueueItem item)`
- `WikiMonitorQueueStartResult start(Path repoRoot, WikiMonitorQueueItem item)`
- `String lockPath(Path repoRoot)`
- `String progressPath(Path repoRoot, WikiMonitorQueueItem item)`
- `String reportPath(Path repoRoot, WikiMonitorQueueItem item)`

Do not put `actionId()` on this interface. The standard executor supports many actions from `WIKI_MONITOR_RULES`; action matching belongs in `supports(item)` and rule lookup, not in a single executor identity.

Adapters:

- `StandardWikiMonitorQueueExecutor`
  - wraps the raw standard launch path extracted from current `dispatchWikiMonitorTask`,
  - must not call public/service `dispatchWikiMonitorTask(...)` after Task 4, because that method becomes the enqueue entrypoint and calling it from the executor would recursively enqueue,
  - uses `WIKI_MONITOR_DISPATCH_LOCK_FILE`,
  - starts `watchDispatchProcess(repoRoot, queueId, dispatchId, rule, paths, process)`.
- `DomainSmokeQueueExecutor`
  - wraps the raw smoke launch path extracted from current `dispatchWikiMonitorDomainSmoke`,
  - must not call public/service `dispatchWikiMonitorDomainSmoke()` after Task 4, because that method becomes the enqueue entrypoint and calling it from the executor would recursively enqueue,
  - uses `WIKI_MONITOR_DOMAIN_SMOKE_LOCK_FILE`,
  - keeps `limit=10`,
  - starts `watchDomainSmokeProcess(repoRoot, queueId, dispatchId, lockPath, process)`,
  - keeps cleanup as a separate explicit endpoint that cleans smoke artifacts, not queue history.

Both adapters must return `WikiMonitorQueueStartResult` containing `queueId`, `dispatchId`, `status`, `lockPath`, `progressPath`, `reportPath`, `outputPath`, `startedAt`, `pid`, `processStartedAt`, and `message`. If the executor internally calls `queueRepository.markRunning(...)` instead of returning the pid, document that path explicitly and still expose pid/processStartedAt in the test seam so restart recovery can be asserted.

Claim/start boundary:

- Queue repository owns `queued/blocked_cooldown -> starting`.
- Executor adapters own only OS process launch and lock acquisition.
- `startWikiMonitorQueueItem` (Task 4) is the orchestration method that calls executor start and then `markRunning(...)` on `STARTED`, or releases/reverts the queue item on `LOCK_BUSY`/`LAUNCH_FAILED`.
- Task 3 may expose executor test seams, but it must not require public dispatch paths to use queue claim/start until Task 4.
- Active running cancellation remains in the existing service control handlers in this plan. Do not put `cancelRunning(...)` on `WikiMonitorQueueExecutor` for v1 unless a later task explicitly rewires active cancel through executors and tests both lanes.

### 3.6 `pendingDispatches` Compatibility

Do not overload `pendingDispatches` as a real queue.

- `pendingDispatches` remains a detection/approval projection: work that source-change detection recommends but the operator has not clicked yet.
- `dispatchQueue` is the only source for accepted operator requests.
- UI `queue-state` must read `dispatchQueue` first.
- If a domain/action exists only in `pendingDispatches`, label it `待确认`, not `队列中`.
- If it exists in `dispatchQueue`, label it from queue item status and show position/cancel controls.
- Do not remove `pendingDispatches` in this plan; deprecating it requires a separate API compatibility change.

### 3.7 Incremental Commit Boundary

Every task must compile and pass its focused tests at the end of that task.

- Each task may introduce only tests that can pass at the end of that same task. Do not add behavior tests in an earlier task when the behavior is implemented in a later task.
- If a task's focused tests fail, stop within that task, fix the plan or implementation for that task, rerun the focused tests, and only then continue. Do not skip ahead to later tasks to make an earlier task pass indirectly.
- Task 3 must not break the existing direct dispatch path before Task 4 rewires dispatch through the queue.
- Implement watcher signatures with nullable queue id first:
  - `watchDispatchProcess(Path repoRoot, String queueIdOrNull, String dispatchId, WikiMonitorRule rule, DispatchPaths paths, Process process)`
  - `watchDomainSmokeProcess(Path repoRoot, String queueIdOrNull, String dispatchId, Path lockPath, Process process)`
- If `queueIdOrNull` is null, watcher keeps current legacy behavior and skips queue terminal update.
- Task 4 then passes a real `queueId`.
- Do not leave a task in a state where existing `dispatchWikiMonitorTask` or `dispatchWikiMonitorDomainSmoke` call sites fail to compile.
- New helper types that later tasks depend on must be introduced before the first interface/method signature references them:
  - Task 2 introduces the internal queue item model and repository result types.
  - Task 3 introduces `WikiMonitorQueueStartResult` and `StartStatus` before `WikiMonitorQueueExecutor.start(...)` references them.
  - Task 6 introduces `queueId` on `CrawlerMonitorDispatchRequestDTO` before controller/service tests post `cancelQueued`.

### 3.8 Base-Domain Queue Row Adapter

`buildBaseDomainOrchestrationRow` currently receives `queueRow` in `ProgressRow` shape. `dispatchQueue` items use a different shape and must be adapted before they enter the base-domain helper.

Add `buildBaseDomainQueueStateRow({ queueItem, pendingDispatch, statusLabel })` in `data-query-app/utils/baseDomainOrchestration.mjs`:

- When `queueItem` exists, return a normalized queue-state object:
  - `status`: `queueItem.status`
  - `value`: `statusLabel(queueItem.status)`
  - `detail`: status-dependent, because `running` items have no `position`/`lanePosition` (3.1 excludes `running` from position counting):
    - `starting` → `正在启动 / ${queueItem.actionId}`
    - `running` → `运行中 / ${queueItem.actionId}`
    - `queued` or `blocked_cooldown` → `本车道第 ${queueItem.lanePosition} 位 / ${queueItem.actionId}` (use `lanePosition`, not global `position`; base domains are all `standard` lane)
    - otherwise → `${statusLabel(queueItem.status)} / ${queueItem.actionId}`
  - `queueId`, `actionId`, `domain`, `requestedAt`, `blockedByDomain`, `blockedByActionId`
  - `lane`, `lanePosition`
- Base-domain queue matching must treat shared actions as covering all included domains. Match a queue item to a domain when any of these are true:
  - `queueItem.domain === domain.domain`
  - `queueItem.coveredDomains.includes(domain.domain)`
  - `queueItem.actionId === domain.recommendedActionId`
  This prevents `wiki-core-refresh` queued from `items` from disappearing when the operator selects `npcs` or `projectiles`.
- When only `pendingDispatch` exists, return:
  - `status`: `pending`
  - `value`: `待确认`
  - `detail`: `检测建议，尚未加入真实队列`
- When neither exists, return null.

Then update `buildBaseDomainSteps` to consume this normalized object for `queue-state` instead of calling `rowStatus(queueRow)` blindly. Existing tests that pass a ProgressRow fixture must be updated to either pass a normalized queue-state object or use `buildBaseDomainQueueStateRow`.

## 4. Task Breakdown

### Task 0: Baseline And Branch Hygiene

**Files:**

- No source changes unless a baseline command reveals an unrelated pre-existing failure that must be documented before execution starts.

- [ ] Confirm branch and dirty state:
  - `git branch --show-current`
  - `git status --short`
- [ ] Record known unrelated runtime artifacts separately (`back/logs/`, `dump.rdb`, local reports) and do not include them in commits.
- [ ] Run a cheap compile/test baseline before code changes:
  - `cd back && mvn -DskipTests compile`
  - `cd data-query-app && pnpm run check`
- [ ] If either baseline fails before this plan's edits, write the exact failure into the task handoff and decide whether to fix it first or mark it as pre-existing. Do not let later agents hide baseline failures inside queue work.

**Acceptance:** Executors know the starting branch state and can distinguish new regressions from pre-existing failures.

### Task 1: Add Queue DTO Contract

**Files:**

- Modify: `back/src/main/java/com/terraria/skills/dto/CrawlerMonitorOverviewDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/dto/CrawlerMonitorDispatchResultDTO.java`
- Modify: `data-query-app/types/crawlerMonitor.ts`
- Test: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`
- Test: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] Add `queueId`, `queued`, `queuePosition`, `requestedAt`, `queueMessage`, and `cooldownUntil` to `CrawlerMonitorDispatchResultDTO`.
- [ ] Add `List<WikiMonitorQueueItemDTO> dispatchQueue` to `CrawlerMonitorOverviewDTO.WikiMonitorDTO`.
- [ ] Define `WikiMonitorQueueItemDTO` with the public fields described in section 3.1. Do not blindly copy internal repository-only fields.
- [ ] Add `lane` to DTO and TypeScript types with values `standard` and `domain_smoke`.
- [ ] Add `position` to DTO only as response-derived read-only data; do not write it into Redis item JSON.
- [ ] Add `lanePosition` to DTO only as response-derived read-only data; `CrawlerMonitorDispatchResultDTO.queuePosition` maps to `lanePosition`.
- [ ] Add `cooldownUntil` to DTO and TypeScript types for `blocked_cooldown` queue items.
- [ ] Do not expose `claimOwner`, `claimedAt`, or `claimExpiresAt` in public DTOs in this task. They are internal repository fields added in Task 2 unless a later UI/debug requirement explicitly needs them.
- [ ] Do not add `attempt`, `maxAttempts`, or `source`; retry semantics are outside this plan.
- [ ] Do not add `skipped`; this plan has no skipped producer.
- [ ] Add DTO serialization tests only for fields that exist after this task: `dispatchQueue` defaults to empty list, queue result fields serialize when set, and `CrawlerMonitorDispatchResultDTO` remains backward-compatible when queue fields are null.
- [ ] Do not add dispatch behavior tests in this task. The truth-table behavior is implemented and tested in Tasks 4 and 6; adding those tests here would make Task 1 fail by design.
- [ ] Add matching TypeScript interfaces.
- [ ] Update `data-query-app/types/crawlerMonitor.typecheck.ts` with at least one `dispatchQueue` item and one `CrawlerMonitorDispatchResult` value containing `queueId`, `queued`, `queuePosition`, `queueMessage`, and `cooldownUntil`.
- [ ] Write backend assertion that `overview.getWikiMonitor().getDispatchQueue()` is present and empty when no queue exists.
- [ ] Write frontend type/contract assertion that `data-query-app/types/crawlerMonitor.ts` and `crawlerMonitor.typecheck.ts` include `dispatchQueue`, `queueId`, and `queuePosition`.
- [ ] Do not require `crawler-monitor.vue` to render or reference `dispatchQueue` in Task 1; the page consumes it in Task 7b.
- [ ] Run:
  - `cd back && mvn -Dtest=CrawlerMonitorServiceImplTest test`
  - `cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs`
  - `cd data-query-app && pnpm run check`

**Acceptance:** The API contract can carry real queued requests without overloading `pendingDispatches`.

### Task 2: Implement Queue Repository

**Files:**

- Create: `back/src/main/java/com/terraria/skills/service/impl/WikiMonitorQueueItem.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/WikiMonitorDispatchQueueRepository.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/WikiMonitorDispatchQueueRepositoryTest.java`

- [ ] Create internal `WikiMonitorQueueItem` model with fields from section 3.1, including `claimOwner`, `claimedAt`, and `claimExpiresAt`. Keep it package-private or implementation-scoped if possible; the public API uses DTOs from Task 1.
- [ ] Create small repository result/value types needed by Task 2 only, for example `QueuePosition`, `ClaimResult`, or `QueueSnapshot`. Do not reference `WikiMonitorQueueStartResult` here; launch belongs to Task 3.
- [ ] Implement `enqueue`, `listItems`, `findItem`, `findByDispatchId`, `claimForStart`, `markRunning`, `markTerminal`, `cancelQueued`, `dedupeLookup`, `clearDedupe`, `cooldownUntilFor`, `recordCooldown`, `pruneTerminalItems`, and `mirrorSnapshot`.
- [ ] Use Redis as primary when `StringRedisTemplate` is available.
- [ ] Redis `enqueue` must enforce `lane + actionId` dedupe atomically with item creation and FIFO list append. Use a Lua script or WATCH/MULTI transaction; do not implement enqueue as plain `dedupeLookup` then `SET`/`RPUSH`, because two concurrent clicks can create duplicate queue items before either request observes the other's dedupe key.
- [ ] If Redis enqueue wins the dedupe race but item/list persistence fails, it must delete the just-created dedupe key or write a recoverable placeholder that stale-dedupe cleanup can safely remove on the next enqueue.
- [ ] Fall back to the JSON mirror file for queue item storage when Redis is null.
- [ ] Wire the repository into `CrawlerMonitorServiceImpl` constructors without breaking existing tests:
  - production constructor builds it from `objectMapper`, `repoRoot`, and optional `StringRedisTemplate`,
  - existing test constructors with null Redis use JSON fallback automatically,
  - add a package-private constructor overload only if tests need to inject a fake repository; do not remove current constructors.
- [ ] Add a drain mutex abstraction:
  - Redis path: `setIfAbsent(terrapedia:crawler:wiki-monitor:dispatch-queue:drain-lock, owner, 30, TimeUnit.SECONDS)`.
  - No-Redis path: process-local `ReentrantLock.tryLock()` or `synchronized` guard.
- [ ] Drain lock owner value must include `reason`, lane if scoped, host/process identity if available, and timestamp.
- [ ] Preserve FIFO order from the Redis id list.
- [ ] Keep terminal items in snapshot for recent observability, but exclude terminal items from response-derived position counts.
- [ ] Prune terminal items by policy: retain newest 100 terminal items or terminal items from the last 7 days, whichever keeps more recent context; never prune `queued`, `blocked_cooldown`, `starting`, or `running`.
- [ ] Do not persist `position` inside `item:<queueId>` JSON or mirror item JSON.
- [ ] Do not persist `lanePosition` inside `item:<queueId>` JSON or mirror item JSON.
- [ ] Repository may expose helper methods to compute waiting positions for service responses, but Task 2 must not require overview DTO projection. Overview mapping is Task 7a.
- [ ] `claimForStart(queueId, owner)` must atomically transition only `queued` or eligible `blocked_cooldown` to `starting`; if the item is already `starting`, `running`, terminal, or the compare-and-set fails, the drain invocation must skip it.
  - Redis path must use a real atomic CAS mechanism: Lua script or WATCH/MULTI. Do not implement this as plain `GET` then `SET`.
  - No-Redis path performs the JSON read/update while holding the process-local repository lock.
- [ ] `claimForStart(queueId, owner)` must also persist `claimOwner`, `claimedAt`, and `claimExpiresAt=claimedAt+5 minutes`.
- [ ] Add `releaseStartingClaimToQueued(queueId, message)` for `LOCK_BUSY` only; it must clear `claimOwner`/`claimedAt`/`claimExpiresAt`, keep dedupe, and restore `status=queued`.
- [ ] Add `markExpiredStartingFailed(queueId, message)` for startup/sweep recovery when no matching lock/process can be proven; it must clear claim fields, clear dedupe, and mark terminal `failed`.
- [ ] `markRunning(queueId, dispatchId, pid, processStartedAt, startedAt, paths)` writes `dispatch:<dispatchId> -> queueId` AND persists `pid`/`processStartedAt` into the queue item (so restart reconciliation can resolve the OS process for both lanes — the smoke lock has no pid).
- [ ] `markRunning(...)` must clear `claimOwner`, `claimedAt`, and `claimExpiresAt`.
- [ ] When `markTerminal` runs, delete `dispatch:<dispatchId>` and `dedupe:<lane>:<actionId>` immediately.
- [ ] When `markTerminal` records a successful standard-lane completion, write/update `cooldown:<lane>:<actionId>` with `completedAt + WIKI_MONITOR_DISPATCH_COOLDOWN`.
- [ ] Create dedupe keys with 24 hour TTL so an interrupted process cannot block new clicks forever.
- [ ] If `dedupeLookup` points to a missing or terminal item, delete the stale key and allow enqueue.
- [ ] If `dedupeLookup` points to `queued`, `blocked_cooldown`, `starting`, or `running`, return that existing item and do not create another one.
- [ ] Test list order, position helper output after the first item becomes terminal if helper exists, atomic Redis enqueue dedupe under two simulated same-action clicks, dedupe, stale dedupe cleanup, dedupe TTL set, duplicate blocked_cooldown reuse, queued cancellation, starting claim, Redis CAS failed compare-and-set claim, no-Redis locked claim, running transition, dispatch reverse lookup, terminal transition, terminal dedupe cleanup, cooldown record/read, terminal retention pruning, JSON fallback, and mirror generation.
- [ ] Test serialized queue item JSON does not contain `position` or `lanePosition`.
- [ ] Test serialized queue item JSON does not contain `skipped`.
- [ ] Test serialized `starting` item JSON contains `claimOwner`, `claimedAt`, and `claimExpiresAt`, and `markRunning`/terminal transitions clear those fields.
- [ ] Test pruning/recovery never prunes `starting` or `running` items, even when they are older than terminal retention cutoffs.
- [ ] Test no-Redis queue mutations and drain mutex work with `new CrawlerMonitorServiceImpl(objectMapper, repoRoot)`.
- [ ] Test `CrawlerMonitorServiceImpl` can still be constructed by every existing package-private constructor used in `CrawlerMonitorServiceImplTest`; this guards against breaking current tests before dispatch behavior is rewired.
- [ ] Run:
  - `cd back && mvn -Dtest=WikiMonitorDispatchQueueRepositoryTest,CrawlerMonitorServiceImplTest test`

**Acceptance:** Queue state is durable across overview calls and can be inspected independently of UI rendering.

### Task 3: Add Queue Executors And Start Mapping

**Files:**

- Create: `back/src/main/java/com/terraria/skills/service/impl/WikiMonitorQueueExecutor.java`
- Create or define package-private: `back/src/main/java/com/terraria/skills/service/impl/WikiMonitorQueueStartResult.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`

- [ ] Create `WikiMonitorQueueStartResult` and `StartStatus` before `WikiMonitorQueueExecutor` references them:
  - `StartStatus`: `STARTED`, `LOCK_BUSY`, `LAUNCH_FAILED`
  - fields: `queueId`, `dispatchId`, `status`, `lockPath`, `progressPath`, `reportPath`, `outputPath`, `startedAt`, `pid`, `processStartedAt`, `message`.
- [ ] Create the `WikiMonitorQueueExecutor` interface from section 3.5. Do not include unused active-cancel methods.
- [ ] Extract raw launch helpers from the current dispatch methods:
  - `startStandardQueueItemRaw(repoRoot, queueItem, rule)` reuses `buildLaunchRequest`, `buildDispatchPaths`, `activeDispatchProcesses`, and `watchDispatchProcess`.
  - `startDomainSmokeQueueItemRaw(repoRoot, queueItem)` reuses `buildDomainSmokeLaunchRequest`, `activeDomainSmokeProcesses`, and `watchDomainSmokeProcess`.
- [ ] Implement `StandardWikiMonitorQueueExecutor` inside `CrawlerMonitorServiceImpl` first, calling only `startStandardQueueItemRaw(...)`.
- [ ] Implement `DomainSmokeQueueExecutor` inside `CrawlerMonitorServiceImpl` first, calling only `startDomainSmokeQueueItemRaw(...)`.
- [ ] Add tests proving executor start does not call public `dispatchWikiMonitorTask(...)` or `dispatchWikiMonitorDomainSmoke()` recursively after those methods become enqueue entrypoints.
- [ ] Change watcher signatures without breaking current call sites:
  - `watchDispatchProcess(Path repoRoot, String queueIdOrNull, String dispatchId, WikiMonitorRule rule, DispatchPaths paths, Process process)`
  - `watchDomainSmokeProcess(Path repoRoot, String queueIdOrNull, String dispatchId, Path lockPath, Process process)`
- [ ] Update existing direct-dispatch call sites in the same task to pass `null` for `queueIdOrNull`.
- [ ] If `queueIdOrNull` is null, watcher must preserve legacy behavior and skip queue terminal update.
- [ ] Add executor start methods that can pass real `queueId`, but do not require existing direct dispatch to use them until Task 4.
- [ ] During executor start with a non-null `queueId`, write `queueId` into `wiki-monitor-dispatch.latest.json` for standard dispatch. Existing direct dispatch path passes null and remains legacy until Task 4.
- [ ] During smoke executor start with a non-null `queueId`, write `queueId` into `wiki-monitor-domain-smoke.lock.json`. Keep pid/processStartedAt in `WikiMonitorQueueStartResult` and later queue item state; do not require the smoke lock itself to contain pid in Task 3.
- [ ] The `DomainSmokeQueueExecutor` start must return the smoke process pid + start time in `WikiMonitorQueueStartResult`. Task 4 persists those fields through `markRunning(...)`.
- [ ] Do not call `queueRepository.markRunning(...)` from the executor in Task 3. The executor returns `WikiMonitorQueueStartResult`; Task 4's `startWikiMonitorQueueItem` performs `markRunning(...)` after a successful launch. If an implementation chooses to call `markRunning(...)` inside the executor later, it must be done in Task 4 with tests proving no double mark.
- [ ] Ensure `WikiMonitorQueueStartResult` or the executor test seam exposes `pid` and `processStartedAt`; tests must fail if queued start cannot prove the persisted pid came from the launched process.
- [ ] Add `resolveSmokeTerminalStatus(dispatchId, reportPath, latestPath, progressPath, exitCodeOrNull)` and use it from both live `watchDomainSmokeProcess` and recovery logic. Live smoke completion must prefer report/latest/progress status over raw process exit when the report is parseable.
- [ ] Add tests that legacy direct dispatch still compiles/runs with null queue id.
- [ ] Add tests that queued standard executor start writes `queueId` into latest dispatch and returns pid/processStartedAt in `WikiMonitorQueueStartResult`; reverse lookup is asserted in Task 4 after `markRunning(...)`.
- [ ] Add tests that queued smoke executor start writes `queueId` into the smoke lock and returns `actionId=wiki-monitor-domain-smoke`, `domain=all`, `limit=10`, smoke lock path, smoke progress path, and pid/processStartedAt in `WikiMonitorQueueStartResult`; queue item mutation and reverse lookup are asserted in Task 4.
- [ ] Add `resolveSmokeTerminalStatus` unit tests for `completed`, `partial`, and `failed` report statuses. Do not assert queue item terminal mutation in Task 3; watcher-to-queue `markTerminal(...)` is wired in Task 5.
- [ ] Run:
  - `cd back && mvn -Dtest=CrawlerMonitorServiceImplTest test`
  - `cd back && mvn -DskipTests compile`

**Acceptance:** Existing direct dispatch remains test-green, and queued standard/smoke executor starts can return enough launch metadata for Task 4 to persist `dispatchId -> queueId`.

### Task 4: Change Dispatch To Enqueue Instead Of Rejecting When Busy

**Files:**

- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`

- [ ] Split dispatch into `enqueueWikiMonitorRequest` and `startWikiMonitorQueueItem`.
- [ ] `startWikiMonitorQueueItem` must require the item to already be `starting` from `claimForStart`; it must not launch a `queued` item directly. Immediate dispatch path still creates item, claims it, then starts it.
- [ ] Dispatch ordering must be: resolve lane/action/rule -> evaluate action-scoped cooldown -> call atomic enqueue/dedupe -> build a response from an existing active item if dedupe returned `starting` or `running` -> only then decide whether a newly queued/waiting item may be claimed for immediate start. Do not branch on the lock file before dedupe, or duplicate clicks on a currently running action will incorrectly create a second queued item.
- [ ] Keep existing lane lock acquisition inside executor `start`, but return a typed start result that distinguishes lock contention from launch failure:
  - `LOCK_BUSY`: lane lock could not be acquired after claim; transition `starting -> queued`, keep dedupe, and let a later drain retry.
  - `LAUNCH_FAILED`: process launch threw after lock acquisition attempt; transition `starting -> failed`, clear dedupe/reverse mapping, release any acquired lock.
  - `STARTED`: process launched and `markRunning` can persist `dispatchId`, pid, paths, and timestamps.
- [ ] In `dispatchWikiMonitorTask`, use `lane=standard`; if the standard lock exists or standard-lane backlog exists, enqueue/dedupe first. A new distinct action becomes a queued item; a duplicate of an existing `starting`/`running`/waiting action returns that same existing queue item.
- [ ] If the standard lock is free and no standard-lane backlog exists, create a standard queue item and start it immediately via `StandardWikiMonitorQueueExecutor`.
- [ ] Before immediate start, check `cooldownUntilFor(lane, actionId)`. A future cooldown creates/reuses a `blocked_cooldown` queue item and must not call executor start even when the lane lock is free.
- [ ] On `STARTED`, call `queueRepository.markRunning(queueId, dispatchId, pid, processStartedAt, startedAt, paths)` exactly once and write the reverse mapping. Add a test that reverse lookup exists only after `STARTED`.
- [ ] Every dispatch response must be built from the queue item after enqueue/claim/start, not from legacy helper assumptions:
  - immediate `STARTED` -> `accepted=true`, `status=running`, `queued=false`, `queueId` present, `dispatchId` present,
  - accepted wait -> `accepted=true`, `status=queued` or `blocked_cooldown`, `queued=true`, `queuePosition=lanePosition`,
  - duplicate -> same existing queue item and no new item.
- [ ] Task 4 must compute `lanePosition` for dispatch results using the repository list/helper before Task 7a overview projection exists. `queuePosition` in `CrawlerMonitorDispatchResultDTO` cannot depend on `wikiMonitor.dispatchQueue` being populated.
- [ ] If immediate-start claim loses a race (`claimForStart` fails or another same-lane item appears), return the current queue item state as queued/duplicate instead of launching directly. Do not bypass the claim state machine.
- [ ] After any enqueue, start, queue-state transition, or terminal transition triggered synchronously in the request, invalidate `cachedOverview` so the next `/overview` call sees the queue immediately.
- [ ] Dedupe on `lane + actionId` (per 3.4). Set `domain=requestedDomain` and `coveredDomains` from `coveredDomainsFor(actionId)` so the UI can show which domains a shared action (e.g. `wiki-core-refresh`) refreshes.
- [ ] Add `coveredDomainsFor(actionId)` by grouping `WIKI_MONITOR_RULES` with the same `actionId` and `wikiDomain=true`; do not assume a single `WikiMonitorRule` has a coverage field.
- [ ] In `dispatchWikiMonitorDomainSmoke`, use `lane=domain_smoke` and the same enqueue path with `DomainSmokeQueueExecutor`.
- [ ] If smoke lock exists, return accepted queued result instead of rejected `locked`.
- [ ] Add `cooldownUntilFor(String lane, String actionId)`:
  - Match on `actionId`, NOT `domain`. The existing `isInCooldown` matches by `rule.domain()` (`CrawlerMonitorServiceImpl` ~line 1197), but dedupe/execution are now `lane + actionId`. Since `items`, `npcs`, `projectiles` share `wiki-core-refresh`, a domain-scoped cooldown lets `npcs` run right after `items` completed and re-run the same action. Reuse the already-present action-scoped helper `isActionInCooldown(actionId, payload)` / `completedDispatchIsInCooldown(payload)` (~line 1204).
  - Read `cooldown:<lane>:<actionId>` from the queue repository first. This prevents `wiki-monitor-dispatch.latest.json` from losing cooldown evidence when a later different action overwrites the latest dispatch slot.
  - Use `wiki-monitor-dispatch.latest.json` only as a legacy fallback when no queue cooldown entry exists.
  - Return null unless the cooldown entry/latest fallback has matching `actionId`, completed status or completed timestamp evidence, and parseable `cooldownUntil`/`completedAt`.
  - Use this helper for both the standard-lane cooldown gate (action-scoped) and blocked queue item `cooldownUntil`, so the boolean gate and displayed deadline cannot drift.
- [ ] Test shared-action cooldown: after `wiki-core-refresh` (via `items`) completes, an enqueue for `npcs` (same action) is gated `blocked_cooldown` with the same `cooldownUntil`, not allowed to run.
- [ ] Test cooldown survives latest-slot overwrite: after `wiki-core-refresh` completes and records `cooldown:<standard>:<wiki-core-refresh>`, starting a different standard action that overwrites `wiki-monitor-dispatch.latest.json` must not remove `wiki-core-refresh` cooldown.
- [ ] When queueing a blocked cooldown item, set `cooldownUntil` from `cooldownUntilFor(...)`; do not derive it from `blockedSince`.
- [ ] Replace English locked message with Chinese:
  - `已有爬虫任务正在运行，已加入队列第 N 位。当前占用：<domain>/<actionId>，开始于 <time>。`
- [ ] Preserve `blockedByDispatchId`, `blockedByDomain`, `blockedByActionId`, `blockedSince`.
- [ ] Test `blocked_cooldown` queue item stores `cooldownUntil=completedAt + WIKI_MONITOR_DISPATCH_COOLDOWN`.
- [ ] Test first dispatch returns `running`.
- [ ] Test second dispatch while first lock exists returns `accepted=true`, `status=queued`, `queuePosition=1`.
- [ ] Test overview immediately after the second dispatch contains the queued item without waiting for scheduled cache expiry.
- [ ] Test duplicate second click returns the same queued item instead of creating another item.
- [ ] Test repeated clicks during `blocked_cooldown` return the same queue item instead of creating multiple cooldown blockers.
- [ ] Test shared-action dedupe: enqueueing `wiki-core-refresh` for `items` then for `npcs` returns the same queue item (one `wiki-core-refresh`, not two), since dedupe is `lane + actionId`.
- [ ] Test retry compatibility: existing `retryWikiMonitorDispatch` → `dispatchWikiMonitorTask(repoRoot, rule, metadata)` still creates/starts a queue item and preserves the existing process-level `retryOf`, `retryCount`, `retryReason`, `controlAction=retry` metadata; the dedupe guard must not swallow a retry whose original is already terminal. Do NOT introduce queue-level `attempt`/`maxAttempts`; the existing `WIKI_MONITOR_RETRY_LIMIT` process-level mechanism stays the source of truth for retry counting.
- [ ] Test second smoke click while smoke lock exists returns `accepted=true`, `status=queued`, `actionId=wiki-monitor-domain-smoke`, and `queuePosition=1`.
- [ ] Test running standard dispatch does not force a smoke dispatch into queued when smoke lock is free.
- [ ] Test running smoke dispatch does not force a standard dispatch into queued when standard lock is free.
- [ ] Test auto-dispatch metadata path: `runAutoDispatchSweepOnce` calling `dispatchWikiMonitorTask(repoRoot, firstRule, metadata)` creates/starts a standard-lane queue item through the same enqueue path and does not bypass drain behavior.
- [ ] Run:
  - `cd back && mvn -Dtest=CrawlerMonitorServiceImplTest test`

**Acceptance:** A second operator click is registered as a real queued request, not rejected as `locked`.

### Task 5: Drain Queue After Completion, Cancel, Failure, Startup, And Sweep

**Files:**

- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`

- [ ] Add `drainWikiMonitorDispatchQueue(reason)` guarded by the drain mutex abstraction from Task 2.
- [ ] The drain method must re-check active standard lock and active smoke lock after obtaining the drain mutex.
- [ ] The drain method must evaluate runnable items per lane.
- [ ] The drain method may start at most one runnable item (`queued` or eligible `blocked_cooldown`) per lane per invocation.
- [ ] Before launching, drain must call `claimForStart(queueId, owner)` and continue only if it atomically changes the item to `starting`. This prevents a second drainer from launching the same item if the 30s Redis drain lock expires while process launch is slow.
- [ ] If executor returns `LOCK_BUSY` after `starting` but before `running`, move the item back to `queued`, keep dedupe, release no process resources, and stop this lane; a later drain can retry without losing the operator request.
- [ ] If executor returns `LAUNCH_FAILED` after `starting` but before `running`, mark that item `failed`, clear reverse/dedupe keys, release any acquired active lock, and then stop; the scheduled sweep can drain the next item.
- [ ] If executor start fails after queue item is marked `running`, mark that item `failed`, clear reverse/dedupe keys, release any acquired active lock, and then stop; the scheduled sweep can drain the next item.
- [ ] `watchDispatchProcess` must call `queueRepository.markTerminal(queueId, status, completedAt, message)` before drain.
- [ ] `watchDomainSmokeProcess` must call `queueRepository.markTerminal(queueId, status, completedAt, message)` before drain.
- [ ] Call drain after `watchDispatchProcess` writes `completed`, `failed`, or `timed_out` and releases the active lock.
- [ ] Call drain after `watchDomainSmokeProcess` writes terminal status and releases the smoke lock.
- [ ] Cancel does NOT flow through the watcher: `controlWikiMonitorDispatch(cancel)` writes terminal state directly in the handler (`status=cancelled`, releases lock, removes from `activeDispatchProcesses`) and the watcher is suppressed via `cancellingDispatches`. Therefore the cancel handler itself — not the watcher — must call `queueRepository.markTerminal(queueId, "cancelled", ...)`, clear reverse/dedupe keys, then drain. The same applies to `controlWikiMonitorDomainSmoke(cancel)` (it also destroys + releases inline). If `markTerminal` lived only in the watcher, a cancelled running item would stay `running` in the queue forever and permanently block its lane.
- [ ] Resolve the `queueId` for an active-cancel from `queueRepository.findByDispatchId(dispatchId)` first. Standard lane may fall back to `wiki-monitor-dispatch.latest.json.queueId`; smoke lane may fall back to the smoke lock only if that lock is updated to contain `queueId`. If no queue id exists (legacy/null), skip the queue update but still release the lock and drain.
- [ ] Test: active cancel of a running standard queue item marks that queue item `cancelled` (not left `running`) and the next queued standard item starts on drain.
- [ ] Test: active cancel of a running smoke queue item marks it `cancelled` and unblocks the smoke lane.
- [ ] Extend `reconcileActiveDispatchesOnStartup` to handle queue items in `status=running` state. NOTE: the existing method reads only `WIKI_MONITOR_DISPATCH_LOCK_FILE` (standard lane); it must also read `WIKI_MONITOR_DOMAIN_SMOKE_LOCK_FILE` so a smoke item left `running` after restart is reconciled too.
  - For each queue item where `status=running`, resolve `dispatchId` and `pid` from the item / its lane lock file.
  - `ProcessHandle.of(pid)`:
    - **Process alive**: re-attach a watcher with the real `queueId`. This is supported and already the existing pattern — `reconcileActiveDispatchesOnStartup` wraps the handle in `HandleBackedProcess` (a `Process` whose `waitFor()` polls `isAlive()`). IMPORTANT: a recovered `HandleBackedProcess.exitValue()` is a synthetic `0` (a non-spawned process exposes no real exit code), so the recovered watcher must derive terminal status via `resolveRecoveredTerminalStatus` (below), NOT from the exit code.
    - **Process dead or lock missing**: call `resolveRecoveredTerminalStatus`, `queueRepository.markTerminal(queueId, status, ...)`, delete reverse/dedupe keys, release the lane lock if still held.
  - A ghost `running` item (process dead, no watcher) left in the queue permanently blocks its lane. This reconcile is mandatory before the first drain invocation.
- [ ] Extend startup reconciliation and scheduled sweep to handle queue items in expired `status=starting` state:
  - If `claimExpiresAt` is still in the future, leave it alone; it is an in-flight launch claim.
  - If `claimExpiresAt <= now` and the lane lock/latest state contains the same `queueId`, with `dispatchId` either absent on the queue item or matching durable state, and a live pid, repair it to `running` and re-attach watcher.
  - If `claimExpiresAt <= now` and the lane lock/latest state contains the same `queueId`, with `dispatchId` either absent on the queue item or matching durable state, but the process is dead, resolve terminal status with `resolveRecoveredTerminalStatus`/`resolveSmokeTerminalStatus`, mark terminal, clear reverse/dedupe, and release the lane lock.
  - If `claimExpiresAt <= now` and there is no matching durable lock/latest/process evidence, mark the item `failed` with `队列项启动超时，未检测到对应运行进程；请重新加入队列。`, clear claim fields and dedupe, then continue draining that lane.
- [ ] Add `resolveRecoveredTerminalStatus(lane, queueItem, paths)` so recovery/sweep terminalization is not guesswork (the synthetic exit code cannot be used):
  - `standard` lane: read `wiki-monitor-dispatch.latest.json` (and the action report at `paths.reportPath()`); if `status=completed`/`failed` is recorded for this `dispatchId`, return it; if the report exists but is incomplete, return `failed`; if neither file resolves a status, return `timed_out`.
  - `domain_smoke` lane: delegate to `resolveSmokeTerminalStatus(dispatchId, reportPath, latestPath, progressPath, null)` so live watcher and recovery use one smoke terminal mapping. If it records this run completed/partial/failed, map to `completed`/`failed`; if missing or unparseable, return `timed_out`.
  - Default fallback when no file resolves anything: `timed_out` (process gone, no proof of clean completion).
- [ ] Safety net in the 15-second scheduled sweep (covers crashes after reconcile and processes that die with no live watcher): for each `status=running` queue item with no entry in `activeDispatchProcesses`/`activeDomainSmokeProcesses` and a dead/absent `ProcessHandle`, mark it `timed_out`, clear keys, release the lane lock, and drain. This is the reviewer's polling fallback, kept as a backstop in addition to (not instead of) watcher re-attach.
- [ ] Call drain from startup reconciliation after orphaned active dispatch state is converged.
- [ ] Add scheduled sweep every 15 seconds for missed completion hooks.
- [ ] The 15-second queue drain sweep must run independently of the auto-dispatch feature flag. `autoDispatchEnabled=false` stops creation of automatic queue requests, but it must not stop draining already accepted manual queue items.
- [ ] Name the scheduler method distinctly from `scheduledAutoDispatchSweep`, for example `scheduledWikiMonitorQueueDrainSweep`, so future maintainers do not confuse request creation with queue execution.
- [ ] If the next item in a lane is `blocked_cooldown` with a future parseable `cooldownUntil`, leave that lane blocked and do not start a later item in the same lane.
- [ ] A blocked standard lane must not block the smoke lane, and a blocked smoke lane must not block the standard lane.
- [ ] When `cooldownUntil <= now`, transition `blocked_cooldown` back to `queued` and start it on the next drain.
- [ ] If a `blocked_cooldown` item has missing/unparseable `cooldownUntil`, recompute from `cooldown:<lane>:<actionId>`. If still missing, mark the queue item `failed` with message `冷却时间无法解析，已停止该队列项；请重新加入队列。`, clear dedupe, and continue draining the lane.
- [ ] Test with fake process launcher:
  - first item completes,
  - drain starts second queued item,
  - second item gets a real `dispatchId`,
  - overview shows second item `running`.
- [ ] Test slow-launch race:
  - first drain claims item as `starting`,
  - second drain sees `starting` and does not call executor start,
  - item is launched exactly once even if the mocked Redis drain-lock branch says a later drain acquired a fresh lock.
- [ ] Test expired starting recovery:
  - expired `starting` with matching live process is repaired to `running` and watcher re-attaches,
  - expired `starting` with matching dead process is terminalized from report/latest/progress,
  - expired `starting` with no durable evidence becomes `failed` and clears dedupe.
- [ ] Test lock contention after claim:
  - drain claims an item as `starting`,
  - executor reports `LOCK_BUSY`,
  - item returns to `queued`,
  - dedupe remains,
  - the operator request is not lost or marked failed.
- [ ] Test smoke completion:
  - smoke item starts,
  - `watchDomainSmokeProcess` marks that queue item terminal,
  - smoke lock releases,
  - queued standard item starts on drain.
- [ ] Test smoke restart recovery: a `running` smoke queue item with a persisted `pid` is reconciled on startup — alive process re-attaches a watcher; dead process is terminalized via `resolveRecoveredTerminalStatus` and the smoke lane unblocks. This proves the smoke lane (which writes no pid into its lock today) is recoverable via the queue item's `pid`.
- [ ] Test drain lock contention:
  - Redis branch: use a mocked `StringRedisTemplate`/repository lock adapter where first `setIfAbsent(..., 30, TimeUnit.SECONDS)` returns `true` and second returns `false`; verify the second drain exits without calling executor start.
  - No-Redis branch: construct service with null Redis and trigger two drain calls concurrently; verify the process-local lock allows only one drain body at a time.
- [ ] Test a free smoke lane starts while standard lane is running.
- [ ] Test a free standard lane starts while smoke lane is running.
- [ ] Test queue drain sweep still starts an already queued manual item when auto-dispatch is disabled.
- [ ] Add a note in the Redis branch test name or assertion message that this is a unit-level Redis lock-branch test; true Redis atomic contention requires a Redis integration test environment and is covered by Redis command semantics, not by tmpdir-only service tests.
- [ ] Test bad cooldown recovery: a lane-head `blocked_cooldown` item with missing/unparseable `cooldownUntil` does not block the lane forever; it is recomputed or marked `failed` and dedupe is cleared.
- [ ] Run:
  - `cd back && mvn -Dtest=CrawlerMonitorServiceImplTest test`

**Acceptance:** The queue is not only visible; it actually orchestrates execution.

### Task 6: Add Cancel Queued Request

**Files:**

- Modify: `back/src/main/java/com/terraria/skills/dto/CrawlerMonitorDispatchRequestDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/service/CrawlerMonitorService.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminCrawlerMonitorController.java`
- Test: `back/src/test/java/com/terraria/skills/controller/AdminCrawlerMonitorControllerTest.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`

- [ ] Add `queueId` to request DTO.
- [ ] Let `/dispatch/control` accept `controlAction=cancelQueued` with `queueId`.
- [ ] Keep the existing `/admin/crawler-monitor/dispatch/control` endpoint; do not add a second queue-cancel endpoint in this plan. The controller stays thin and routes through `CrawlerMonitorService.controlWikiMonitorDispatch(...)`.
- [ ] Handle `controlAction=cancelQueued` before `isDomainSmokeControl(request)` or standard active-control resolution. Queue cancellation is keyed by `queueId`; a queued smoke item must not be routed into `controlWikiMonitorDomainSmoke(cancel)`.
- [ ] If the queue item is `queued` or `blocked_cooldown`, mark it `cancelled`.
- [ ] If the queue item is `starting`, reject queued cancellation with:
  - `该队列项正在启动，请稍后刷新；如果已经进入运行中，请使用当前运行任务的终止按钮。`
  This plan intentionally does not cancel `starting` optimistically because launch may already have created an OS process while the queue item has not yet reached `running`.
- [ ] If the queue item is already `running`, return Chinese message telling the operator to use active task cancel:
  - `该队列项已开始运行，请使用当前运行任务的终止按钮。`
- [ ] If not found, return Chinese message:
  - `未找到可取消的队列项，可能已运行、已完成或已被清理。`
- [ ] After a successful queued cancel, call `drainWikiMonitorDispatchQueue("queued-cancel")`. Cancelling a lane-head `blocked_cooldown`/`queued` item when that lane's lock is free must let the next item start immediately, not wait up to 15s for the scheduled sweep.
- [ ] Test queued cancel, missing queue id, starting item rejection, and running item rejection.
- [ ] Test queued smoke cancel: request `{controlAction:"cancelQueued", queueId, actionId:"wiki-monitor-domain-smoke"}` cancels the queue item and does not call active smoke cancel.
- [ ] Test cancelling a queued item deletes its dedupe key.
- [ ] Test cancelling the lane-head item (lane lock free) starts the next lane item on the same call, without waiting for the sweep.
- [ ] Run:
  - `cd back && mvn -Dtest=CrawlerMonitorServiceImplTest,AdminCrawlerMonitorControllerTest test`

**Acceptance:** Operators can remove a waiting request without killing the active process.

### Task 7: Expose Real Queue In Overview And Stop Fake Queue Labels

**Agent ownership (Task 7 spans backend + frontend, so it violates the Section 5 single-owner rule unless split):**

- **7a (backend agent):** the single backend bullet "Populate `wikiMonitor.dispatchQueue` from repository list" plus a backend assertion in `CrawlerMonitorServiceImplTest` that overview exposes queued items with derived `position`/`lanePosition`. Run `cd back && mvn -Dtest=CrawlerMonitorServiceImplTest test` and commit before 7b starts.
- **7b (frontend agent):** all Vue/`baseDomainOrchestration.mjs`/frontend-test bullets, after 7a is merged. The frontend agent must not edit `CrawlerMonitorServiceImpl.java`. Runs the frontend commands below.

#### Task 7a: Backend Overview Projection

**Files:**

- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`

- [ ] Populate `wikiMonitor.dispatchQueue` from repository list.
- [ ] Keep `wikiMonitor.pendingDispatches` as source-change pending approval only.
- [ ] Do not use `pendingDispatches` to mean accepted queue.
- [ ] Backend overview projection must map repository items to `WikiMonitorQueueItemDTO`, computing response-only `position`/`lanePosition` at projection time and leaving internal JSON unchanged.
- [ ] Compute `position` by counting only `queued` and `blocked_cooldown` items in queue list order; exclude `starting`, `running`, and terminal items.
- [ ] Compute `lanePosition` by counting only `queued` and `blocked_cooldown` items in the same lane; exclude `starting`, `running`, and terminal items.
- [ ] Invalidate `cachedOverview` after repository mutations, and make overview generation read the repository each time the cache is cold.
- [ ] Backend test: queued, running, and terminal queue items appear in `wikiMonitor.dispatchQueue` with derived positions only on waiting rows.
- [ ] Backend test: `pendingDispatches` still contains detection suggestions and does not duplicate accepted queue items as fake queued rows.
- [ ] Run (7a, backend):
  - `cd back && mvn -Dtest=CrawlerMonitorServiceImplTest test`

#### Task 7b: Frontend Queue UI

**Files:**

- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
- Modify: `data-query-app/utils/baseDomainOrchestration.mjs`
- Modify: `data-query-app/types/crawlerMonitor.ts` only if Task 1's queue type needs frontend-only refinement; do not add backend DTO fields here.
- Test: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`
- Test: `data-query-app/tests/base-domain-orchestration.test.mjs`

- [ ] Stage progress must show 10 base domain rows for sample-domain progress.
- [ ] Add a real queue section immediately after the `阶段进度` section header/content block and before `.recovery-domain-panel`.
- [ ] Give the queue section `class="wiki-monitor-dispatch-queue"` and `aria-label="真实任务队列"`.
- [ ] Only show `队列中` when a row has a real queue item with `status=queued` or `blocked_cooldown`.
- [ ] Rename static registered-task waiting state to `待触发` or `未运行`, not `队列中`.
- [ ] If a domain/action exists in `pendingDispatches` but not `dispatchQueue`, show `待确认`.
- [ ] If a domain/action exists in `dispatchQueue`, show queue item status, position, and controls.
- [ ] Update frontend status helpers (`statusLabel`, `statusTone`, and any queue-row adapter using them) to support `starting` explicitly:
  - label: `正在启动`
  - tone: non-terminal in-progress tone, not terminal success/error and not queued wait tone.
- [ ] The real queue section must be grouped:
  - `正在运行/启动中`: `starting` and `running`.
  - `等待队列`: `queued` and `blocked_cooldown`.
  - `最近完成`: `completed`, `failed`, `timed_out`, and `cancelled`.
- [ ] Show queue position only for waiting items (`queued`/`blocked_cooldown`), because `starting`/`running` are excluded from derived position.
- [ ] Show domain/action, requested time, blocker, and status for every queue item.
- [ ] Show `取消队列项` only for `queued` and `blocked_cooldown`; do not show an enabled cancel button for terminal, `starting`, or `running` items.
- [ ] Show `starting` as `正在启动 / <actionId>` with no queue position and with a disabled control reason.
- [ ] For the current selected domain detail, show queue/run/report/progress paths for that domain/action.
- [ ] Add `buildBaseDomainQueueStateRow` from section 3.8.
- [ ] Update `buildBaseDomainSteps` so `queue-state` reads the normalized queue-state object and no longer assumes a `ProgressRow` shape.
- [ ] Update existing `base-domain-orchestration.test.mjs` fixtures that pass `queueRow` as a ProgressRow to use `buildBaseDomainQueueStateRow` or the normalized queue-state shape.
- [ ] Match queue items to base domains by requested domain, `coveredDomains`, or `recommendedActionId`/`actionId`; shared `wiki-core-refresh` must appear for `items`, `npcs`, and `projectiles` even if the request was made from only one of those domains.
- [ ] Test that `queue-state` in base domain orchestration uses real `dispatchQueue` items through the adapter, not raw `registeredTasks.queueState`.
- [ ] Test shared action matching: a `wiki-core-refresh` queue item requested by `items` appears in the base-domain queue state for `npcs` and `projectiles`.
- [ ] Test `starting` renders as `正在启动`, has no queue position, and does not show enabled queued-cancel control.
- [ ] Test `statusLabel('starting')` and `statusTone('starting')` return explicit values instead of falling through to unknown/default labels.
- [ ] Test terminal items render under `最近完成` and do not show queued-cancel controls.
- [ ] Test that a pending-only item renders `待确认`, not `队列中`.
- [ ] Test page contains `class="wiki-monitor-dispatch-queue"`, `aria-label="真实任务队列"`, `dispatchQueue` rendering, and queued cancel action.
- [ ] Run (7b, frontend):
  - `cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs tests/base-domain-orchestration.test.mjs`
  - `cd data-query-app && pnpm run check`

**Acceptance:** The UI no longer claims a task is queued unless the backend has accepted a queue item.

### Task 8: Fix Operator Feedback For Active Cancel, Stalled, And Missing Dispatch

**Agent ownership (also spans backend + frontend):**

- **8a (backend agent):** the backend message bullets + backend test. Commit before 8b.
- **8b (frontend agent):** the UI label/cooldown-blocker bullets + frontend test, after 8a is merged.

#### Task 8a: Backend Operator Messages

**Files:**

- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`

- [ ] Replace `no matching wiki monitor dispatch is active` with Chinese backend message:
  - `当前没有匹配的运行中爬虫任务。可能原因：任务已结束、只是在队列中等待、页面状态过期，或当前选中的域不属于最新运行任务。请刷新后查看“真实队列”和“当前运行任务”。`
- [ ] When target is queued, point operator to cancel queued request.
- [ ] When target is stalled but still has an active lock, explain:
  - `心跳已过期，但后端仍检测到运行锁。当前版本没有断点续跑能力；请先确认是否仍在运行，必要时终止后重新重爬。`
- [ ] Test backend message for no active matching dispatch.
- [ ] Run (8a, backend):
  - `cd back && mvn -Dtest=CrawlerMonitorServiceImplTest test`

#### Task 8b: Frontend Feedback And Cooldown Copy

**Files:**

- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
- Test: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] In UI feedback, do not say “刷新派发”. Use:
  - `开始重爬`
  - `加入重爬队列`
  - `取消队列项`
  - `终止当前运行任务`
- [ ] Lane-scoped cooldown blocker (the lane model in 3.4 makes a global `dispatchQueue[0]` check wrong): for an item with `lanePosition > 1`, find the `lanePosition=1` item in the **same lane**; if that lane-head item is `blocked_cooldown`, show on the waiting item:
  - `当前同类任务队首正在冷却（预计剩余 X 分钟），你的请求排在本车道第 ${lanePosition} 位，冷却结束后自动启动。`
  - Compute X from the lane-head item's `cooldownUntil - now`; `blockedSince` is an audit timestamp only and must not be used for remaining cooldown.
  - A `blocked_cooldown` item in the standard lane must not show this message on a `domain_smoke` waiter, and vice versa.
- [ ] Test frontend renders the cooldown-blocker message when the same-lane lane-head item is `blocked_cooldown` and `cooldownUntil` is in the future.
- [ ] Test a `blocked_cooldown` standard lane-head does not paint the blocker message on a smoke-lane waiter.
- [ ] Test frontend falls back to `冷却中，等待后端重新检查` when `cooldownUntil` is missing.
- [ ] Test frontend dispatch feedback follows the truth table in section 3.4:
  - `status=queued` uses `queueMessage` and labels the action `加入重爬队列`.
  - duplicate waiting item shows the existing `queueId`/position, not a second queued row.
  - `cancelQueued` success shows `取消队列项`.
  - `status=running` cancellation rejection points to `终止当前运行任务`.
- [ ] Test frontend does not contain `刷新派发` and does contain the new Chinese labels.
- [ ] Run (8b, frontend):
  - `cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs`

**Acceptance:** Operators can tell whether a task is running, queued, stale, blocked, or already gone.

### Task 9: Document The Resume Gap And Add A Runtime Hint

**Files:**

- Create: `docs/runbooks/crawler-monitor-checkpoint-resume-contract.md`
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
- Test: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] Run Task 9 only after Task 7b and Task 8b are merged, because all three edit `crawler-monitor.vue`. Do not run the resume documentation/UI hint agent in parallel with frontend queue UI work.
- [ ] Document why current stalled tasks require rerun/recrawl:
  - progress files are snapshots,
  - no stable cursor,
  - no completed-unit ledger,
  - no idempotent per-unit output contract,
  - no universal `--resume-from`,
  - lock state does not prove safe commit position.
- [ ] Define the future resume contract:
  - each task must emit stable unit id,
  - each unit commit must be idempotent,
  - completed units must be written to a durable ledger,
  - runner must accept `--resume-from` or `--resume-ledger`,
  - tests must prove interrupted run resumes without duplicate/skip.
- [ ] Add a compact UI hint on stalled rows linking the idea:
  - `当前版本不支持断点续跑；终止后会重新重爬。`
- [ ] Test the page includes the Chinese hint.
- [ ] Run:
  - `cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs`

**Acceptance:** The product no longer implies stalled tasks can be resumed when the data contract cannot support it.

### Task 10: End-To-End Runtime Validation

**Files:**

- No code changes unless validation finds a defect.
- Use local stack scripts and admin page.

- [ ] Start current worktree stack:
  - `bash ./scripts/dev/start-local-stack.sh`
- [ ] Confirm admin page URL from stack output. For this branch it has recently been `http://127.0.0.1:13004/operations/crawler-monitor`; do not assume `13001`.
- [ ] Trigger a known long-running action as the first dispatch. Use `domain-source-bosses` or `wiki-core-refresh` — both take at least 30 seconds and will hold the active lock long enough to observe a second queued click. Do not use a "fake slow test runner" from the browser; that concept has no implementation in the admin stack.
- [ ] While it is running, trigger another **distinct standard-lane action** (e.g. first `domain-source-bosses`, second `domain-source-armor-sets`). Do not reuse the same `actionId` — `lane + actionId` dedupe (3.4) would return the same item, not a new queued one; and do not use a smoke action — it runs in a different lane and would start immediately.
- [ ] Verify API response:
  - `accepted=true`
  - `status=queued`
  - `queueId` present
  - `queuePosition=1` (first waiter; the running item is excluded from position per 3.1)
- [ ] Trigger the same second action again and verify it returns the same `queueId`, not a duplicate queue row.
- [ ] Verify `/admin/crawler-monitor/overview` contains the queued item in `wikiMonitor.dispatchQueue`.
- [ ] Verify UI shows that item in the real queue area, with cancel button.
- [ ] Verify real queue area groups rows into `正在运行/启动中`, `等待队列`, and `最近完成`, and only waiting rows expose `取消队列项`.
- [ ] If the queued action is `wiki-core-refresh`, verify selecting `items`, `npcs`, and `projectiles` all shows the same shared queue item through `coveredDomains`.
- [ ] Let first dispatch complete or cancel it.
- [ ] Verify queued item transitions to `running` and receives `dispatchId`.
- [ ] Verify `wikiMonitor.dispatchQueue` shows the completed first item and the running second item with correct `queueId`.
- [ ] Lane independence check: trigger 10-domain smoke while a standard task is running. Because the smoke lane lock is free, the smoke item must start **immediately** (`status=running`), NOT queue behind the standard task. (Pre-lane-model wording "verify it enters the queue" was wrong — the lanes are independent.)
- [ ] Smoke queuing check: while a smoke task is running, trigger a SECOND smoke. Only then does it enter the real queue (`status=queued`), not a rejected locked result.
- [ ] Cancel the queued second smoke item and verify the API uses `controlAction=cancelQueued` by `queueId`, not active smoke cancel.
- [ ] Let a smoke item run and verify its queue item reaches terminal state through `watchDomainSmokeProcess` (terminal status read from the report/progress file).
- [ ] For 10-domain smoke, verify stage progress shows 10 domain rows, not one merged row.
- [ ] Verify completed domain rows keep report/progress/output paths.
- [ ] Run final checks:
  - `cd back && mvn -Dtest=CrawlerMonitorServiceImplTest,AdminCrawlerMonitorControllerTest test`
  - `cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs tests/base-domain-orchestration.test.mjs`
  - `cd data-query-app && pnpm run check`

**Acceptance:** The user can manually queue multiple crawler tasks, see their true order, cancel waiting tasks, and watch the next task start after the current task exits.

## 5. Multi-Agent Split

Use separate agents only with these write boundaries. The backend service lifecycle is intentionally mostly serial because Tasks 2-6 all touch `CrawlerMonitorServiceImpl.java`.

- **Baseline/read-only verifier:** Task 0 only. Runs status/baseline commands and records pre-existing failures. No source edits.
- **Backend contract owner:** Task 1 only. May edit DTO/type contract files and matching contract tests. Must finish and pass Task 1 checks before Task 2 starts.
- **Backend queue repository owner:** Task 2. May create `WikiMonitorQueueItem.java`, `WikiMonitorDispatchQueueRepository.java`, and repository tests. Any `CrawlerMonitorServiceImpl.java` constructor wiring in this task is owned by the same backend serial owner; do not run another backend writer in parallel.
- **Backend service owner:** Tasks 3-6, in order. This owner is the only writer to `CrawlerMonitorServiceImpl.java`, `CrawlerMonitorService.java`, backend controller, and backend service/controller tests during these tasks.
- **Backend overview owner:** Task 7a only, after Tasks 1-6 are green. This is also a `CrawlerMonitorServiceImpl.java` writer, so it must not overlap with Tasks 3-6.
- **Frontend queue UI owner:** Task 7b only. May edit `crawler-monitor.vue`, `baseDomainOrchestration.mjs`, frontend queue types if needed, and frontend tests. It must not change backend files.
- **Frontend message owner:** Task 8b only, after Task 8a and Task 7b are merged. It edits `crawler-monitor.vue`, so it must not overlap with Task 7b or Task 9.
- **Resume documentation owner:** Task 9 only, after Task 7b/8b are merged. May create the runbook and add the stalled hint to `crawler-monitor.vue`.
- **Integration verifier:** Task 10. Read-only runtime validation plus test execution unless validation finds a defect; if a defect is found, route it back to the single owner of the affected file.

Do not allow two agents to edit `CrawlerMonitorServiceImpl.java`, `CrawlerMonitorServiceImplTest.java`, `crawler-monitor.vue`, or `crawler-monitor-page-contract.test.mjs` at the same time. If parallel work is desired, use it for read-only review, repository-only implementation before service wiring, or frontend work only after backend API contracts are stable.

## 6. Final Merge Gate

- [ ] `git status --short` shows only intended source/test/doc changes plus known ignored runtime artifacts.
- [ ] `git diff --cached --stat` is checked before commit.
- [ ] Backend focused tests pass.
- [ ] Frontend contract tests pass.
- [ ] `pnpm run check` passes for `data-query-app`.
- [ ] Runtime validation proves second dispatch queues and later starts.
- [ ] Final user-facing summary states:
  - real queue added,
  - fake queue labels removed,
  - queued cancel added,
  - stalled resume limitation documented,
  - exact local admin URL used for validation.

## 7. Plan Self-Review

**Goal lock:** The plan closes the exact complaint: a second task must be accepted as a real queue item, not rejected or shown as a fake visual queue.

**Source-chain lock:** Redis/file queue is the queue source of truth; overview and UI consume it. Existing lock remains the execution mutual-exclusion source of truth.

**Boundary lock:** No RabbitMQ in v1, no global checkpoint resume, no production auto-dispatch enablement.

**Evidence lock:** Task 10 forces the real runtime path: start one task, click another, observe queued, release first, observe second starts.

**Execution continuity:** If implementation finds Redis unavailable in local test constructors, use repository fallback and keep production Redis path primary.

**Residual risk:** True checkpoint resume remains a follow-up per crawler action. It must not be claimed complete until individual scripts implement the resume contract.
