# Crawler Queue V2 Runtime Convergence Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every registered V2 domain either start and report truthful progress, or fail promptly with a visible actionable reason; specifically close the NPC no-process/no-log failure and the armor-sets file-completed/Redis-timeout failure.

**Architecture:** Keep Redis V2 as the only live-state authority and the attempt directory as immutable execution evidence. Give backend-refresh attempts deterministic report artifacts before enqueue, converge every post-claim launch failure to a terminal attempt, and make process exit the terminal authority while merging a matching final progress payload into the terminal state. Do not trust a terminal file without exact epoch/queue/attempt/fence identity and confirmed process-group exit.

**Tech Stack:** Spring Boot, Java 17 records, Redis/Lua V2 repository, Linux/WSL process groups, Node crawler progress JSON, Nuxt admin monitor.

---

## Goal And Safety Lock

### Closure conditions

- A backend-refresh domain such as `npcs` receives a non-null attempt-scoped report path before its command is rendered.
- If command rendering, manifest validation, or process launch fails after claim, the attempt becomes `failed` immediately, releases its covered domains, preserves the real reason, and never waits for heartbeat timeout.
- A short direct domain such as `armor_sets` can write `running` and `completed` before the next five-second reconcile without becoming `timed_out`.
- A successful short process produces one Redis `completed` attempt whose phase, current, total, progress sequence, output/report paths, and log availability agree with the final attempt evidence.
- All 12 registry actions pass an offline launch-contract matrix with no unresolved placeholders or missing required artifacts.
- The original admin symptoms can be retested without reading Redis manually: NPC either runs with PID/log/heartbeat or shows a specific launch failure; armor sets completes instead of showing heartbeat expiry.

### In scope

- `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionDefinition.java`
- `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ApplicationService.java`
- `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptArtifactStore.java`
- `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptSupervisor.java`
- `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/ProcessBuilderCrawlerAttemptLauncher.java`
- `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Reconciler.java`
- `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ReasonCode.java`
- Focused backend tests, monitor contract tests, and current devlog state.

### Out of scope

- No direct edits to Redis keys, epoch resets, or state-store cleanup.
- No crawler, import, backfill, or database-writing command during Tasks 1–7.
- No changes to generated Boss, Town NPC, armor-set, resume, report, or attempt evidence.
- No V1 live fallback and no relaxation of epoch/fence/state-version checks.
- No real 12-domain crawl matrix without a separate explicit operator authorization.

## Source And State Chain

```text
registry action
  -> deterministic attempt artifacts + immutable manifest
  -> Redis queued attempt
  -> reconciler claim
  -> supervisor launch + exact PID/start identity
  -> running progress ingestion
  -> process exit + matching terminal progress merge
  -> Redis terminal attempt + released domains
  -> overview DTO
  -> admin card/detail/history/log/artifact views
```

Redis remains authoritative for live lifecycle state. `progress.json`, `run.log`, and `attempt-manifest.json` are evidence used only after exact identity validation.

---

### Task 1: Demote The Invalid Acceptance State

**Files:**
- Modify: `docs/devlog/current.md`
- Modify: `docs/devlog/entries/2026-07-14-crawler-monitor-registered-idle-domains.md`

- [ ] **Step 1: Set the entry back to active**

Change the top-level status from `ready-for-commit` to `active` and record these verified findings:

```text
Critical: backend-refresh actions cannot render because every V2 reportPath is null.
Critical: post-claim start failures remain STARTING until timeout and hide the real error.
Important: three armor attempts have completed progress files but timed-out Redis states.
Important: three NPC attempts have no PID, progress, or log and timed-out Redis states.
```

- [ ] **Step 2: Update the current index**

Set the open entry to `active`, point the next start location to this plan, and replace the stale epoch statement with the observed current epoch `epoch-8e4f7049-6788-48cd-90b2-9d9ce09e6645`.

- [ ] **Step 3: Validate devlog shape**

Run:

```bash
rg -n "^## Status$|`active`|runtime-convergence-repair|epoch-8e4f7049" \
  docs/devlog/current.md \
  docs/devlog/entries/2026-07-14-crawler-monitor-registered-idle-domains.md
git diff --check
```

Expected: the entry has exactly one parsed top-level `active` status and `git diff --check` exits 0.

---

### Task 2: Give Backend Actions Deterministic Report Artifacts

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ApplicationService.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptArtifactStore.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ApplicationServiceTest.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptArtifactStoreTest.java`

- [ ] **Step 1: Write the failing enqueue and retry tests**

Add tests proving both initial enqueue and retry produce matching Redis/manifest artifacts:

```java
@Test
void backendRefreshAttemptGetsAnAttemptScopedReportBeforeReconcile() {
    DispatchResult result = service.enqueue(new EnqueueCommand(
        "npcs", "wiki-npcs-refresh", "standard", "fresh", "admin", null
    ));

    CrawlerQueueV2Attempt attempt = repository.findAttempt(result.attemptId()).orElseThrow();
    CrawlerAttemptManifest manifest = artifactStore.readManifest(result.attemptId()).orElseThrow();
    assertEquals(
        "reports/crawler-monitor/v2/2026-07-12/" + result.attemptId() + "/report.json",
        attempt.artifacts().reportPath()
    );
    assertEquals(attempt.artifacts().reportPath(), manifest.reportPath());
}

@Test
void directAttemptKeepsReportPathAbsent() {
    DispatchResult result = service.enqueue(new EnqueueCommand(
        "armor_sets", "domain-source-armor-sets", "standard", "fresh", "admin", null
    ));
    assertNull(repository.findAttempt(result.attemptId()).orElseThrow().artifacts().reportPath());
}
```

Add the same backend/direct assertions for `retry()` so a retry cannot regress to null artifacts.

- [ ] **Step 2: Run RED**

Run:

```bash
cd back
mvn -Dtest=CrawlerQueueV2ApplicationServiceTest,CrawlerAttemptArtifactStoreTest test
```

Expected: backend report-path assertions fail because `deterministicArtifacts()` currently returns null report/output paths.

- [ ] **Step 3: Make artifact calculation action-aware**

Change artifact construction to accept the registry action:

```java
private CrawlerQueueV2Artifacts deterministicArtifacts(
    Instant requestedAt,
    String attemptId,
    CrawlerMonitorActionDefinition action
) {
    String date = DateTimeFormatter.ISO_LOCAL_DATE.withZone(ZoneOffset.UTC).format(requestedAt);
    String base = "reports/crawler-monitor/v2/" + date + "/" + attemptId + "/";
    String reportPath = action.backendRefresh() ? base + "report.json" : null;
    return new CrawlerQueueV2Artifacts(base + "progress.json", base + "run.log", reportPath, null);
}
```

Use this exact artifact value for initial enqueue and retry. Do not derive report paths a second time later.

- [ ] **Step 4: Make manifest preparation consume the same artifact value**

Add an overload that validates and persists the exact paths:

```java
public synchronized PreparedArtifacts prepare(
    String epoch,
    String queueId,
    String attemptId,
    String domain,
    String actionId,
    Instant requestedAt,
    CrawlerQueueV2Artifacts artifacts
)
```

Requirements:

- `progressPath` and `logPath` must equal the canonical files under this attempt directory.
- A non-null `reportPath` must resolve to `report.json` inside the same attempt directory.
- `outputPath` remains null before execution.
- The immutable manifest must persist exactly the same four artifact fields as the Redis attempt.
- The existing six-argument helper may delegate with canonical progress/log and null report/output for compatibility tests only.

- [ ] **Step 5: Run GREEN**

Run:

```bash
cd back
mvn -Dtest=CrawlerQueueV2ApplicationServiceTest,CrawlerAttemptArtifactStoreTest,CrawlerMonitorActionRegistryTest test
```

Expected: all selected tests pass and backend commands can receive a non-null attempt-scoped report path.

---

### Task 3: Prove All 12 Registry Commands Render Before Claim

**Files:**
- Modify: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistryTest.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionDefinition.java` only if validation needs a named method

- [ ] **Step 1: Add a 12-action launch-contract matrix**

For every `CrawlerMonitorActionRegistry.defaults().all()` entry, render with:

```java
String reportPath = action.backendRefresh()
    ? "reports/crawler-monitor/v2/2026-07-14/attempt-test/report.json"
    : null;
String progressPath = "reports/crawler-monitor/v2/2026-07-14/attempt-test/progress.json";
List<String> command = action.renderCommand(reportPath, progressPath, action.defaultResumeMode());
```

Assert:

```java
assertFalse(command.isEmpty());
assertTrue(command.stream().noneMatch(token -> token.contains("<reportPath>")));
assertTrue(command.stream().noneMatch(token -> token.contains("<progressPath>")));
assertTrue(command.stream().noneMatch(token -> token.startsWith("--progress-path=")
    && !token.equals("--progress-path=" + progressPath)));
if (action.backendRefresh()) {
    assertTrue(command.contains("--output=" + reportPath));
}
```

Also assert the registry still contains exactly these domains:

```text
items, npcs, projectiles, buffs, armor_sets, recipes, biomes, bosses,
town_npc_maintenance, shimmer, npc_loot, boss_loot
```

- [ ] **Step 2: Run RED/GREEN**

Run before and after the Task 2 implementation:

```bash
cd back
mvn -Dtest=CrawlerMonitorActionRegistryTest test
```

Expected final result: 12/12 actions render without placeholders; no crawler is launched.

---

### Task 4: Converge Every Post-Claim Start Failure Immediately

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ReasonCode.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptSupervisor.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Reconciler.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptSupervisorTest.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ReconcilerTest.java`

- [ ] **Step 1: Add a dedicated visible reason**

Add:

```java
ATTEMPT_START_FAILED(
    "任务取得执行权后未能启动进程。",
    "查看 attempt 身份与启动配置；修复后重新排队。"
),
```

Do not reuse `STATE_STORE_UNAVAILABLE`; a command/manifest/launcher failure is not a Redis outage.

- [ ] **Step 2: Write failure-path tests**

Cover these failures separately:

1. command rendering rejects a missing required artifact;
2. exact manifest validation fails;
3. launcher throws before returning a process;
4. post-CAS resume/watcher registration fails and cleanup is confirmed;
5. cleanup cannot be confirmed.

For confirmed no-process/cleaned-process cases assert:

```java
assertEquals(CrawlerQueueV2Status.FAILED, terminal.status());
assertEquals(CrawlerQueueV2ReasonCode.ATTEMPT_START_FAILED, terminal.reasonCode());
assertTrue(terminal.completedAt() != null);
assertNull(terminal.deadlineAt());
    assertTrue(mutations.stream().anyMatch(command ->
        command.targetStatus() == CrawlerQueueV2Status.FAILED
            && command.releaseOwnership()
    ));
```

For unconfirmed cleanup retain `PROCESS_TERMINATION_UNCONFIRMED` and the isolation deadline; never release the domain early.

- [ ] **Step 3: Run RED**

```bash
cd back
mvn -Dtest=CrawlerAttemptSupervisorTest,CrawlerQueueV2ReconcilerTest test
```

Expected: render/manifest failures remain `starting`, and reconciler only increments a health counter.

- [ ] **Step 4: Add a typed supervisor start outcome**

Use a result that distinguishes terminalized failures from unsafe failures:

```java
public record StartResult(
    CrawlerQueueV2Attempt attempt,
    boolean started,
    boolean terminalized
) {}
```

`start()` must return:

- `started=true` only after PID/start identity, watcher registration, and resume succeed;
- `terminalized=true` when no process escaped or cleanup was confirmed and the attempt was changed to `failed/ATTEMPT_START_FAILED`;
- throw only when durable state mutation is unavailable or process cleanup/ownership is unconfirmed.

The terminal mutation must include a bounded sanitized worker message such as `command render failed: reportPath required`; never include secrets or environment dumps.

- [ ] **Step 5: Make reconciler count the real outcome**

Replace blind `supervisor.start(claimed); started++;` with:

```java
CrawlerAttemptSupervisor.StartResult outcome = supervisor.start(claimed);
if (outcome.started() || outcome.terminalized()) {
    counts.converged++;
}
if (outcome.started()) {
    started++;
}
```

The reconciler health round may report a failure while the attempt carries the durable specific reason. A later healthy round must not erase the attempt reason.

- [ ] **Step 6: Run GREEN**

```bash
cd back
mvn -Dtest=CrawlerAttemptSupervisorTest,CrawlerQueueV2ReconcilerTest,CrawlerAttemptStateMachineTest test
```

Expected: all confirmed start failures terminalize in one reconcile round and no longer wait for heartbeat timeout.

---

### Task 5: Fix Short-Process Exit And Zombie Recognition

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/ProcessBuilderCrawlerAttemptLauncher.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/ProcessBuilderCrawlerAttemptLauncherTest.java`

- [ ] **Step 1: Add a real Linux short-process regression**

Launch and resume a process that exits immediately:

```java
CrawlerAttemptProcessLauncher.ManagedProcess process = launchAndResume(
    new CrawlerAttemptProcessLauncher.LaunchSpec(
        List.of("sh", "-c", "printf done"),
        tempDir,
        Map.of(),
        tempDir.resolve("short.log")
    )
);

assertTrue(process.handle().onExit().get(2, TimeUnit.SECONDS) != null);
assertTrue(launcher.awaitExit(process, Duration.ofSeconds(2)));
assertEquals(CrawlerAttemptProcessLauncher.LookupCode.NOT_FOUND,
    launcher.findExact(new ProcessIdentity(process.pid(), process.startedAt())).code());
assertTrue(process.exitCodeAvailable());
assertEquals(0, process.exitValue());
```

Add a companion test where the root exits but a descendant remains active; `awaitExit` must remain false until the descendant exits.

- [ ] **Step 2: Run RED repeatedly**

```bash
cd back
for run in 1 2 3 4 5; do
  mvn -Dtest=ProcessBuilderCrawlerAttemptLauncherTest test || exit 1
done
```

Expected before the fix: the immediate-exit case reproduces the exited/zombie group-member mismatch without touching crawler data.

- [ ] **Step 3: Separate active members from exited evidence**

Keep `/proc` inspection fail-closed, but use active members for liveness:

```java
private List<ProcStat> activeMembers(GroupInspection group) {
    return group.members().stream().filter(member -> !member.isExited()).toList();
}
```

Apply the rule consistently:

- `awaitExit`: true only when inspection is available and active members are empty;
- `findExact`: return `NOT_FOUND` when root/descendants contain no active member;
- `isAlive`: true only with at least one active member;
- a root zombie plus active descendant remains `FOUND`;
- inspection errors remain `INSPECTION_UNAVAILABLE`, never `NOT_FOUND`.

- [ ] **Step 4: Run GREEN repeatedly**

```bash
cd back
for run in 1 2 3 4 5; do
  mvn -Dtest=ProcessBuilderCrawlerAttemptLauncherTest test || exit 1
done
```

Expected: five clean runs, immediate exit resolves, descendant ownership remains protected.

---

### Task 6: Merge Matching Terminal Progress During Exit Convergence

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptSupervisor.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptProgressPayload.java` only if a named terminal validator is extracted
- Modify: `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptSupervisorTest.java`

- [ ] **Step 1: Write terminal merge tests**

Cover:

```text
exit 0 + exact completed payload -> completed with payload progress/artifacts
exit nonzero + exact failed payload -> failed with PROCESS_EXIT_NONZERO and payload details
exit 0 + stale epoch/fence/attempt payload -> completed from exit, stale payload ignored
exit 0 + malformed payload -> completed from exit, malformed payload ignored and evidence event appended
process still active + completed file -> no terminal transition and no domain release
```

The successful assertion must include:

```java
assertEquals(CrawlerQueueV2Status.COMPLETED, terminal.status());
assertEquals(2L, terminal.progressSequence());
assertEquals("write", terminal.phase());
assertEquals(1L, terminal.current());
assertEquals(1L, terminal.total());
assertTrue(terminal.artifacts().outputPath().endsWith(
    "data/terraPedia/raw/wiki/module__armorsetbonuses.latest.json"
));
```

- [ ] **Step 2: Run RED**

```bash
cd back
mvn -Dtest=CrawlerAttemptSupervisorTest test
```

Expected: current exit mutation completes/fails but discards final progress fields and paths.

- [ ] **Step 3: Merge evidence only inside confirmed exit handling**

In `handleProcessExit()`:

1. confirm the exact process group has exited;
2. obtain the original exit code when available;
3. read `progress.json` once;
4. require complete V2 identity equality and a sequence greater than Redis;
5. accept `completed` only with exit code 0;
6. accept `failed` details with non-zero exit;
7. ignore conflicting/stale evidence and preserve the exit-derived terminal status;
8. mutate terminal status and progress/artifact fields in one fenced repository command;
9. write the matching terminal manifest.

Do not change `ingestProgress()` to release domains from a terminal file while a process is live. It remains the running-heartbeat path.

- [ ] **Step 4: Run GREEN**

```bash
cd back
mvn -Dtest=CrawlerAttemptSupervisorTest,ProcessBuilderCrawlerAttemptLauncherTest test
```

Expected: final progress survives short-task completion while process ownership remains authoritative.

---

### Task 7: Add Offline End-To-End Runtime Contract Tests

**Files:**
- Modify: `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ReconcilerTest.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptSupervisorTest.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistryTest.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/AdminCrawlerMonitorControllerTest.java`

- [ ] **Step 1: Add the backend-refresh fixture path**

Use a temporary fake backend-refresh command that:

- receives non-null `--output=<attempt>/report.json`;
- writes wrapper-owned running progress;
- writes a child terminal snapshot under the attempt directory;
- exits 0;
- never uses network, Redis, or a database.

Assert queued → starting → running → completed, non-empty log, report path, and released domain.

- [ ] **Step 2: Add the short direct fixture path**

Use a temporary direct command that atomically writes exact V2 running then completed payloads and exits in under one second. Assert it completes without waiting for the five-second reconcile interval and without `START_HEARTBEAT_MISSING` or `HEARTBEAT_TIMEOUT`.

- [ ] **Step 3: Add the launch-failure fixture path**

Use an invalid rendered command or injected launcher exception. Assert the overview contains:

```text
status=failed
reasonCode=ATTEMPT_START_FAILED
allowedActions includes retry and cleanup only when it is the latest current-epoch terminal attempt
log availability is missing/empty truthfully, never presented as a running log
```

- [ ] **Step 4: Run the backend closure gate**

```bash
cd back
mvn -Dtest=CrawlerMonitorActionRegistryTest,CrawlerQueueV2ApplicationServiceTest,CrawlerAttemptArtifactStoreTest,CrawlerAttemptStateMachineTest,CrawlerAttemptSupervisorTest,ProcessBuilderCrawlerAttemptLauncherTest,CrawlerQueueV2ReconcilerTest,AdminCrawlerMonitorControllerTest test
mvn test-compile
```

Expected: zero failures/skips in the focused selection and successful test compilation.

---

### Task 8: Verify Admin Error Projection Without Adding Fake Data

**Files:**
- Modify only if tests fail: `data-query-app/utils/crawlerMonitorTriageWorkbench.mjs`
- Modify only if tests fail: `data-query-app/pages/operations/crawler-monitor.vue`
- Test: `data-query-app/tests/crawler-monitor-triage-workbench.test.mjs`
- Test: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] **Step 1: Add API-shaped fixtures for the two repaired outcomes**

Test these rows:

```js
{
  domain: 'npcs', status: 'failed', reasonCode: 'ATTEMPT_START_FAILED',
  messageZh: '任务取得执行权后未能启动进程。',
  allowedActions: ['retry', 'cleanup'], log: { availability: 'missing' }
}
```

```js
{
  domain: 'armor_sets', status: 'completed', phase: 'write',
  current: 1, total: 1, allowedActions: ['cleanup'],
  log: { availability: 'available', previewable: true }
}
```

Assert NPC shows the real start failure and `重新排队`, while armor shows `1 / 1`, `write`, available log, and no heartbeat-expired attention card.

- [ ] **Step 2: Run RED/GREEN**

```bash
cd data-query-app
node --test \
  tests/crawler-monitor-triage-workbench.test.mjs \
  tests/crawler-monitor-page-contract.test.mjs \
  tests/crawler-monitor-unified-status.test.mjs \
  pages/operations/crawler-monitor.v2-state.test.mjs
pnpm run check
```

Expected: tests pass without introducing fixture rows into production code.

---

### Task 9: Static And Full Regression Gates

**Files:**
- Modify: `docs/devlog/entries/2026-07-14-crawler-monitor-registered-idle-domains.md`
- Modify: `docs/devlog/current.md`

- [ ] **Step 1: Run focused crawler progress tests**

```bash
node --test \
  scripts/data/workflow/backend-refresh-runtime-state.test.mjs \
  scripts/data/workflow/backend-refresh-manifest-finalize.test.mjs \
  scripts/data/fetch/fetch-wiki-armorsetbonuses.test.mjs \
  scripts/data/fetch/fetch-wiki-town-npc-maintenance.test.mjs \
  scripts/data/fetch/fetch-wiki-bosses.test.mjs \
  scripts/data/fetch/fetch-wiki-buffs.test.mjs
```

These are isolated tests only. Do not run the crawler scripts themselves.

- [ ] **Step 2: Run broader project checks**

```bash
cd back && mvn test
cd ../data-query-app && pnpm run check && pnpm run test
cd .. && git diff --check
```

If a broad failure reproduces on the untouched baseline, record it separately; do not weaken the focused closure gate.

- [ ] **Step 3: Inspect scope and protected evidence**

```bash
git status --short
git diff --stat
git diff -- \
  data/generated/wiki-bosses.latest.json \
  data/generated/wiki-town-npc-maintenance.latest.json \
  data/standardized/armor_sets.standardized.json \
  data/generated/resume
```

Expected: implementation did not modify or delete user-generated evidence. Existing user changes remain preserved and unstaged by this repair.

- [ ] **Step 4: Record validation honestly**

Keep the devlog `active` until runtime smoke passes. Record exact test counts, any baseline-only failures, and the fact that no crawler/Redis/database mutation occurred during implementation.

---

### Task 10: Restart And Read-Only Runtime Preflight

**Files:**
- No source edits expected.

- [ ] **Step 1: Confirm no crawler writer is active**

```bash
ps -eo pid,ppid,stat,args | rg \
  'fetch-wiki|run-backend-data-refresh|run-wiki-sync|crawler-queue-v2-fixture' || true
```

Expected: no active crawler process before restart.

- [ ] **Step 2: Restart through canonical scripts**

```bash
bash ./scripts/dev/stop-local-stack.sh
bash ./scripts/dev/start-local-stack.sh
```

- [ ] **Step 3: Verify service health**

```bash
curl -fsS http://localhost:18192/api/actuator/health
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:13005/operations/crawler-monitor
curl -fsS -o /dev/null http://localhost:15178/
```

Expected: backend `UP`, admin login redirect/response available, public frontend 200.

- [ ] **Step 4: Verify current state without mutation**

Read the authenticated overview and confirm:

- there are no non-terminal attempts with dead/missing PIDs left from the implementation run;
- reconciler health is not stale;
- historical broken NPC/armor attempts remain history and are not rewritten;
- no new queue or attempt exists yet.

---

### Task 11: Operator-Authorized Real Acceptance

**Mutation boundary:** This task creates real crawler work. Do not execute it until the user explicitly authorizes runtime acceptance after reviewing Tasks 1–10 results.

- [ ] **Step 1: Accept armor sets first**

From the authenticated admin UI, create one new `armor_sets` attempt. Do not retry an older attempt if a newer terminal attempt exists.

Acceptance within the normal short-run window:

```text
queued/starting -> running or directly completed -> completed
Redis progressSequence > 0
progress.json status=completed, current=1, total=1
attempt log is available and non-empty
covered domain is released
no HEARTBEAT_TIMEOUT
```

- [ ] **Step 2: Accept NPC second**

Create one new `npcs` attempt only after armor is terminal.

Acceptance immediately after start:

```text
non-null attempt reportPath
PID and processStartedAt present
run.log exists and becomes non-empty
first running heartbeat accepted
progressSequence increases
no ATTEMPT_START_FAILED and no silent starting state
```

Because `wiki-npcs-refresh` is a backend-refresh apply action and may write project data/database state, the operator must separately confirm whether to let it finish or cancel after the start/heartbeat contract is proven.

- [ ] **Step 3: Compare API, evidence, and UI**

For each acceptance attempt, compare:

```text
Redis/API attempt identity and lifecycle
attempt-manifest identity and terminal status
progress identity, sequence, phase, current, total
run.log availability
admin card/detail/history/artifact projection
```

Any disagreement returns the devlog to `active`; do not reset the epoch or patch Redis.

- [ ] **Step 4: Decide on the remaining 10 domains**

The offline 12-action matrix is mandatory. A live 12-domain matrix is optional and requires a separate authorization because backend actions can write databases and direct actions fetch external wiki data.

---

### Task 12: Closeout

**Files:**
- Modify: `docs/devlog/entries/2026-07-14-crawler-monitor-registered-idle-domains.md`
- Modify: `docs/devlog/current.md`

- [ ] **Step 1: Re-audit the original symptom**

Closure requires both:

- NPC has real launch/log/heartbeat evidence or an immediate specific start failure.
- Armor sets reaches Redis/API/UI `completed` from a real short execution without heartbeat timeout.

- [ ] **Step 2: Record residual risk**

Record whether the remaining 10 domains were validated offline only or also run live, and identify any DB/network mutation intentionally deferred.

- [ ] **Step 3: Mark ready only after runtime smoke**

Set the devlog to `ready-for-commit` only when Tasks 1–10 and the authorized NPC/armor smoke pass. Do not mark ready based only on unit tests.

- [ ] **Step 4: Optional focused commit**

Do not commit unless the user explicitly requests it. If authorized, stage exact repair paths only, inspect `git diff --cached --stat`, and use:

```text
fix(crawler): converge v2 launch and short attempts
```

## Failed-Smoke Repair Rule

If runtime smoke finds a new gap:

1. preserve the failed attempt and its evidence;
2. classify the mismatch at registry → artifact → claim → process → progress → exit → API → UI;
3. add a failing isolated regression at that boundary;
4. patch this plan if the contract changes;
5. rerun the affected focused gate and dependent gates;
6. restart and retry only the affected domain with explicit authorization.

Never use fake production rows, Redis edits, epoch reset, or evidence deletion to make the smoke pass.
