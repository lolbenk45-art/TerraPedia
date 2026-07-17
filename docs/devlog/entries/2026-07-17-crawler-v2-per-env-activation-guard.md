# 2026-07-17 Crawler V2 per-environment activation guard

## Goal

After the V2 merge (`518d9a0`), a stuck-domain incident recurred on this
worktree because the environment was silently routing to the retired V1 engine:
the durable V2 marker (`reports/crawler-monitor/v2/cutover-state.json`) is
gitignored, so merging V2 code does not activate V2. The page gave no signal
about which engine was live. This entry closes that trap without deleting V1.

## Root cause of the incident (evidence)

- buffs dispatch (pid 8835) was paused (SIGSTOP), then the backend restart sent
  SIGTERM which stayed pending on the stopped process; the later resume
  (SIGCONT) delivered it and the process died within 30ms.
- V1 `HandleBackedProcess.exitValue()` unconditionally returns 0, so the V1
  watchdog recorded `completed with exit code 0` while the progress file was
  frozen at running 147/388.
- `CrawlerDomainStateReducer` prefers queue `completed` over the stale-progress
  contradiction, so the board showed the domain as healthy/ready.

## What changed

- V2 activated on this worktree per the runbook: cutoverId
  `crawler-v2-20260717T034735Z`, epoch `epoch-300d32d7-…`, switch removed after
  verification, routing stays V2 across restarts.
- buffs re-dispatched with `resumeMode: "auto"`; script-level resume ledger
  continued from 147/388 (`resumeOutcome: "resumed"`).
- New engine-mode banner: `crawlerEngineModeNotice(overview)` in
  `data-query-app/pages/operations/crawler-monitor.v2-state.mjs` renders a
  warning section on the crawler-monitor page whenever a loaded overview is not
  V2 (missing `queueContractVersion === 2`), pointing to the runbook and the
  one-shot script. Behavior tests in
  `data-query-app/tests/crawler-monitor-engine-mode-notice.test.mjs`.
- New one-shot activation script `scripts/dev/crawler-v2-cutover.sh`:
  preflight → restart backend with the temporary cutover switch → authenticated
  cutover → marker + two stable overview reads → restart without the switch →
  verify routing stays V2. Idempotent when the marker is already V2.
- CrawlerTriageBoard layout fixes (fixed 196px action column, button text
  ellipsis) via append-only override layer; contract locks untouched.

## Validation

- Admin unit tests 350/350 (`pnpm run test:unit`), typecheck exit 0.
- Banner exercised in a real browser: absent on this V2 environment; present
  with correct copy when the overview response is intercepted to drop
  `queueContractVersion` (screenshot
  `reports/runtime/triage-layout/engine-banner-v1.png`).
- Cutover script run on this already-cutover environment: idempotent no-op exit 0.
- buffs V2 attempt progressed past 190/388 with live heartbeats.

## V1 deletion decision (deferred, scoped)

User asked whether V1 can be deleted now. Decision: not yet; revisit after V2
has survived several full crawl cycles (pause/cancel/restart included). An
Explore-agent audit produced the boundary map; keep with this entry:

- Backend V1-only: ~3.4–3.7k lines in `CrawlerMonitorServiceImpl` (file locks,
  mirror queue, watchdog threads, reconcile sweeps, `HandleBackedProcess`),
  plus `WikiMonitorDispatchQueueRepository` (1,063) + `WikiMonitorQueueItem` +
  executor. crawlerv2 has zero imports of these classes.
- Legacy history is safe: `CrawlerLegacyHistoryAdapter` reads only the
  immutable cutover manifest, not V1 code.
- Blocking dependency: the cutover API requires the V1 mirror/latest files to
  exist (`CrawlerLegacySnapshotReader` `readRequired` →
  `CrawlerQueueV2CutoverService` rejects on sourceErrors). Deleting V1 live
  logic means un-cutover environments can never cut over — the cutover flow
  must first accept a V2-from-scratch initialization (fail-closed default was
  chosen over auto-init).
- 6/8 local worktrees (including `~/TerraPedia` main) still route V1.
- Rollback API is already permanently forbidden on both V2 environments
  (first-mutation recorded); delete it together with V1.
- Tests locking V1: ~134 backend cases in `CrawlerMonitorServiceImplTest`,
  13 in `WikiMonitorDispatchQueueRepositoryTest`, ~60–70 admin cases.

## Residual risks

- Other worktrees remain on V1 until they run the script; the banner only
  appears once they merge this change.
- If multiple worktrees share the same Redis, a V1 worktree may enter
  MAINTENANCE (Redis meta:engine=V2) rather than usable V1 — the banner copy
  covers "not V2" generically.
- V1 defects (fake exit 0, reducer contradiction swallow) remain in the code
  until V1 deletion; they are unreachable under V2 routing.
