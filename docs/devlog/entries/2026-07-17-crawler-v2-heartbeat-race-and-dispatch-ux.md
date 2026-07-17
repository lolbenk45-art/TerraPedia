# 2026-07-17 Crawler V2 heartbeat-loss root cause + dispatch UX overhaul

## Incident: buffs 心跳丢失 (attempt-b6bbce35)

Root cause chain, all evidenced from the Redis event stream (db 8) and /proc:

1. User paused buffs at 09:37:34 → `pause_requested` → `paused` (SIGSTOP
   delivered, process group frozen in state T).
2. **760ms later** the supervisor ingested the progress file written *before*
   the SIGSTOP landed (heartbeat 09:37:30.950). `canonicalProgressStatus`
   accepted any `running` heartbeat while PAUSED → flipped the attempt back to
   `running` (stateVersion 40) — but the process stayed frozen.
3. No further heartbeats → `stalled / HEARTBEAT_TIMEOUT` (09:39:01) →
   `timed_out` (09:41:02). The UI showed 心跳丢失 on a task the user had
   deliberately paused.
4. Second defect: the reconciler's terminal transition only mutated the
   ledger; the frozen process group survived as a zombie holding the wiki
   request gate (observed: pid 129735 state `T`, wchan `do_signal_stop`).

## Fixes (TDD, both in crawlerv2)

- **Stale-heartbeat guard**: `CrawlerAttemptSupervisor.progressAcceptsHeartbeat`
  — PAUSED only accepts heartbeats with `lastHeartbeatAt > enteredAt` (the
  pause instant). Pre-pause files are INVALID_PAYLOAD; post-resume heartbeats
  still converge PAUSED→RUNNING. Applied to the initial gate and both
  CAS-conflict retry paths; `progressStatusAcceptsHeartbeat` removed.
- **Orphan reap on terminal convergence**:
  `CrawlerAttemptSupervisor.reapOverdueProcess` — resolves the exact process
  (pid + startInstant), **CONT before TERM** (pending-signal trap), graceful →
  forced escalation, quarantines covered domains when termination is
  unconfirmed. Called by `CrawlerQueueV2Reconciler.reconcileAttempt` before
  every terminal overdue mutation. Non-terminal overdue (RUNNING→STALLED)
  never reaps — STALLED is a recovery window.
- Tests: supervisor 87/87, reconciler 37/37, whole crawlerv2 package green.

## Dispatch/monitor UX (user acceptance feedback)

All view-model logic in `crawlerMonitorTriageWorkbench.mjs` with behavior
tests (357/357); templates/CSS in append-only overlay layers.

- **启动窗口反馈**: `expand` phase (~90s, current=0, progressLabel null) used
  to look like a dead dispatch. Now: `expand` has a Chinese label,
  `buildV2AttemptDisplayModel` emits `isStartupWindow` + `startupLabel`
  ("启动准备中 · 已进行 X秒", ticking with the 3s poll), progress bars switch
  to an indeterminate sweep. Only for active statuses
  (queued/starting/running/retry_wait) — idle/paused/terminal never show it.
- **终止全程可见**: domain tiles, operation rows, and table rows now render
  `secondaryActions` (compact buttons), so cancel is clickable during
  starting/running instead of only in the drawer. Backend already allowed
  cancel in every non-terminal state; this was a pure frontend rendering gap.
- **状态配色区分** (variables.css tokens only): starting = info + pulse;
  paused → warning (needs a human decision); queued/retry_wait → neutral
  gray; cancelled → gray with inset border (distinct from unknown); failed
  family unchanged (danger).
- **失败不再一闪而过**: `v2DomainDisplayStatus` elevates the latest terminal
  failed/timed_out/interrupted result to the domain's display status while it
  is idle, with note "上次爬取失败，尚未重试成功" — visible until a new live
  attempt or a completed/cancelled result. `useToast` now keeps `error`
  toasts until manually closed (X button added to AppToast), warning 6s,
  success 3s.

## Validation

- Live browser run: dispatched 从断点继续爬取 on buffs; startup label ticked
  4s→19s, cancel visible during the run, and when the attempt genuinely
  failed (wiki fetch timeout, exit 1) the tile persisted 执行失败 with the
  elevation note. Screenshots in `reports/runtime/triage-layout/ux-*.png`.
- Restart-safety: V2 routing retained (epoch unchanged) after backend restart.

## Residual

- **WSL2 start-instant drift**: the reconciler's reap correctly refused to
  kill the frozen town-npc process because /proc-derived startInstant had
  drifted ~67s from the recorded identity (WSL2 btime drift after
  suspend/clock sync) → START_TIME_MISMATCH → fail-closed. Both zombies were
  killed manually by verified pgid. If this recurs, the identity check needs
  a drift-tolerant comparison (bounded delta), not exact equality.
- The failed buffs retry was a real network timeout (wiki unreachable), not a
  regression; resume ledger is intact for the next 从断点继续爬取.
