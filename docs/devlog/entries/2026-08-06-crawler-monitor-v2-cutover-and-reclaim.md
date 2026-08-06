# Devlog: crawler-monitor-v2-cutover-and-reclaim

## Status

`active`

## Context

- User goal: remove V1 from live crawler monitoring, use V2, and repair stale force-reclaim display.
- Branch: `design/crawler-auto-ingestion-readiness`
- Worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-auto-ingestion-readiness`
- Related docs: `docs/runbooks/crawler-monitor-queue-v2-cutover.md` and `docs/superpowers/plans/2026-08-06-crawler-monitor-v2-cutover-and-reclaim.md`.

## Direction / Decisions

- V1 queue evidence is immutable history; V2 is activated only by the governed cutover endpoint.
- A force reclaim is current released ownership and must supersede stale V1 timeout history in domain state.
- V1 auto dispatch is unavailable in V2; V2-native scheduling is out of scope.

## Scope

- Frontend: hide V1 auto-dispatch controls in V2 mode.
- Backend: repair force-reclaim domain-state precedence.
- Runtime: perform controlled V2 cutover after exact-process and state checks.
- Out of scope: real crawler runs, DB/data writes, V2-native scheduler.

## Validation

- Pending focused backend and admin-page tests plus two read-only V2 overview checks.

## Residual Risks

- Cutover is blocked if durable V2 state, Redis epoch, or exact V1 process evidence is inconsistent.

## Follow-up

- none

## Commits

- Pending.
