# Crawler Monitor V2 Cutover And Reclaim State Design

## Goal

Make Redis queue V2 the only live crawler-monitor authority and ensure an
administrator force reclaim supersedes stale V1 terminal history in the domain
state shown by the admin frontend.

## Decisions

- V2 is activated only through the authenticated cutover endpoint. The V1
  dispatch queue is snapshotted as immutable history and is never copied into
  V2 or deleted.
- A current `force_reclaimed` dispatch result represents released ownership.
  It must project as `ready` with next action `recrawl`, even when a prior V1
  queue item remains `timed_out` or `failed`.
- V1 auto-dispatch settings and sweeps are not a V2 automation feature. The
  V2 monitor UI must not offer those controls. V2-native scheduling remains a
  separate task.
- No crawler, database import, or data refresh is part of this change.

## Validation

- Backend reducer and overview tests prove a force reclaim wins over stale
  terminal V1 history.
- Admin page contract tests prove V1 auto-dispatch controls are unavailable in
  V2 mode and the non-V2 warning remains visible.
- Controlled runtime cutover verifies two stable V2 overview reads with no
  live mutation and `queueContractVersion = 2`.
