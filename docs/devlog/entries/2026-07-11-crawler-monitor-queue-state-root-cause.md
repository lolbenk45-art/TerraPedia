# Devlog: Crawler Monitor Queue And State Root Cause

## Status

`active`

## Context

- User goal: Continue crawler-monitor optimization on an isolated branch, first
  explain why repeated queue/status fixes have not held, then design a durable
  repair.
- Branch: `fix/crawler-monitor-queue-state`
- Worktree:
  `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-monitor-queue-state`
- Base: `origin/main@99cd26d`.
- Related docs:
  - `docs/superpowers/specs/2026-07-11-crawler-monitor-queue-v2-hard-cutover-design.md`
  - `docs/superpowers/specs/2026-07-03-crawler-monitor-state-source-of-truth-design.md`
  - `docs/superpowers/plans/2026-07-02-crawler-monitor-state-reconcile.md`
  - `docs/superpowers/plans/2026-07-07-crawler-stuck-task-recovery-hardening.md`
  - `docs/superpowers/plans/2026-07-07-crawler-stuck-task-recovery-c2-c4-c5.md`
- Related prior entries: none; the relevant crawler work predates the current
  devlog entry convention.

## Direction / Decisions

- Chosen approach: Treat the repeated failures as an end-to-end state-chain
  problem. Trace queue persistence, runtime/lock evidence, backend domain-state
  reduction, DTO output, and frontend consumption before proposing another
  fix.
- Reasoning: The history contains repeated repairs across the same state model,
  while all current focused tests pass. A new local condition patch would not
  explain the production/runtime mismatch.
- Confirmed root-cause hypothesis: the crawler monitor still has several
  independently writable state copies without a shared generation/fencing
  token. Queue Redis, the JSON queue mirror, latest-dispatch JSON, progress
  files, file locks, and process/runtime evidence can therefore describe
  different runs, while backend and frontend reducers only reconcile the
  disagreement after it exists.
- User confirmation: all four visible failures are recurring in current use:
  cancel/reclaim still appears running, old work returns after restart, the
  queue fails to advance or remains occupied, and page sections disagree.
  These are one acceptance scope and must not be split into independent UI or
  queue patches.
- User success criteria: operators must continuously see current state, receive
  an explicit error when health or ownership becomes invalid, and have every
  non-terminal state converge within a bounded time instead of remaining stuck.
- Primary acceptance scenario clarified by the user: legacy and current queue
  records conflict, block queue advancement, and make the displayed progress
  impossible to diagnose. The approved design must prevent legacy records from
  participating in live scheduling, dedupe, ownership, or current-progress
  selection.
- The user expanded the same acceptance scope to queue logs: logs must identify
  the exact run, expose whether they are current, stale, missing, empty, or
  expired, and use clear operator-facing failure wording instead of making an
  old path look like current evidence.
- User-approved direction: implement a V2 hard cutover. V1 remains readable as
  history but never participates in V2 live scheduling, dedupe, ownership,
  current progress, control actions, or recovery. Do not implement V1/V2 live
  dual writes or a fallback from V2 to V1.
- Written design decision: every live attempt is identified by queueId,
  attemptId, fenceToken, stateVersion, and stateStoreEpoch; overview is pure
  read, reconciliation is a background responsibility, and every non-terminal
  state has a deadline and explicit reasonCode.
- The July 3 design's Redis per-domain TTL lease was not implemented. Current
  `domain.state` receives the queue start-claim expiry, which is cleared by
  `markRunning`; an active queue item then bypasses missing lease evidence.
- Do not implement another symptom-specific condition before the user approves
  a state-ownership design and one failing restart/cancel acceptance scenario.
- Rejected options:
  - Editing UI status priority before verifying the backend state chain.
  - Clearing Redis, queue mirrors, locks, progress files, or database state as
    part of diagnosis.
  - Running crawler or refresh actions during the analysis phase.

## Scope

- Frontend: Read-only inspection of crawler-monitor page state, domain table,
  triage workbench, log viewer, and their focused tests.
- Backend: Read-only inspection of monitor overview, queue repository, runtime
  reconciliation, domain-state reducer, lock lifecycle, log preview/retention,
  and focused tests.
- Data: Read-only inspection of current queue mirror, latest dispatch, and
  referenced progress evidence. No database or crawler writes.
- Docs/process: Record confirmed facts, validation, risks, and the eventual
  approved design. The written V2 design is now present and awaits user review.
- Out of scope: Crawler execution, data refresh/import/backfill, service restart,
  database mutation, and business-code implementation before design approval.

## Validation

- Commands run:
  - Backend focused queue/state/service tests.
  - Admin crawler-monitor state/domain/triage/control/page contract tests.
  - Read-only Git history, blame, runtime artifact, process, and port checks.
  - Written-design placeholder, code-fence, JSON-example, reference, structured
    devlog-status, pending-SHA, and diff checks.
- Results:
  - Backend: 201 tests passed.
  - Admin: 73 tests passed.
  - The local stack is not running; current live API reproduction is therefore
    not yet available.
  - No `crawler:lease` implementation exists outside the July 3 design; dispatch
    admission still uses `CREATE_NEW` JSON locks with a 120-minute stale window.
  - The retained queue mirror has 176 terminal items and no active item:
    88 completed, 44 cancelled, 40 failed, and 4 timed out.
  - Of 93 readable referenced progress files, 41 disagree with their queue
    status. Two retained records have a cancelled queue item but a progress file
    still marked `running` (Biomes and a Wiki core/NPC run).
  - Git history confirms that `937f29b` added automatic restoration of a
    `running` mirror item plus dispatch/dedupe mappings when Redis queue IDs are
    empty. The restoration path does not first prove mirror freshness or live
    process ownership.
  - Existing tests intentionally cover the components in isolation, including
    "running queue without lease stays running" and restoring a running item
    from the mirror. No test spans Redis reset/restart, mirror classification,
    process evidence, progress identity, overview output, and frontend
    consumption as one contract.
  - The retained queue mirror has 154 distinct log paths. Only 21 referenced
    files still exist; 133 are missing, 6 of the 21 are empty, and only 15 have
    content. None of those 15 contain their queueId, and only 6 contain their
    dispatchId.
  - Queue and log retention contracts disagree: the queue retains at least the
    latest 100 terminal records plus records within 7 days, while dispatch-log
    pruning keeps only the newest 20 candidates plus the newly created log.
    Normal cancel also deletes log/progress/report/output evidence, while force
    reclaim preserves it.
  - Of 176 historical queue rows, only 24 domain/action keys exist; 22 keys have
    multiple attempts and 11 contain mixed terminal results. The production
    history helper intentionally merges by domain/action rather than queueId or
    dispatchId. Against retained evidence, town NPC 28 attempts become 2 rows,
    and its formal-action row shows an older cancelled attempt even though the
    latest formal attempt completed.
  - The domain table labels a log path previewable from its suffix alone, but
    the detail log viewer requires explicit found/readable/size metadata that
    the queue DTO does not provide. An integrated domain-table-to-detail build
    therefore yields no log files even for a retained readable log; current
    tests only cover manually enriched fixtures.
  - Log content is a one-time snapshot. Overview polling runs every 3 seconds
    only while a progress row is active (otherwise 10 seconds, backing off to
    60 seconds), and an open log is not reloaded while its path stays the same.
  - Queue messages are free text with no reasonCode. In the retained mirror,
    143 of 176 messages contain no Chinese text, including generic strings such
    as `failed with exit code 1` and `dispatch timed out after 90 minutes`.
  - Written design self-review passed: no placeholders were found, all 24 code
    fences are balanced, all 4 JSON examples parse, referenced local files
    exist, and `git diff --check` passes.
  - Structured devlog scan now reports only this active entry and no closed
    entry with pending SHA. Historical commit facts were repaired to
    `3c642b2` and `99cd26d` without changing their task decisions.
- Not run:
  - Crawler execution, local-stack startup, database checks, full quality gate,
    or browser acceptance.

## Result

- Completed:
  - Created the isolated branch/worktree from current `origin/main`.
  - Confirmed prior crawler feature branches are ancestors of `main`.
  - Established the minimum queue/status source chain and baseline tests.
  - Completed the offline root-cause verdict: repeated fixes repaired individual
    liveness, cancellation, lock, reducer, or UI conflicts while preserving the
    multi-writer state architecture that recreates those conflicts after
    restart, Redis loss, partial cancellation, polling reconciliation, or
    cross-run progress matching.
  - Confirmed that overview reads mutate state through runtime reconciliation,
    and queue reads can repopulate Redis from the JSON mirror.
  - Confirmed parallel public status models remain: legacy `domain.status`,
    newer `domain.state.status`, and frontend queue/progress reconstruction.
  - Completed the log-chain audit: log naming is usually dispatch-specific,
    but attempt selection, history merging, availability, freshness, refresh,
    retention, and operator wording are not bound to an authoritative run.
  - Recorded the user-approved V2 hard-cutover direction in a formal written
    design covering namespace isolation, attempt identity, fencing, bounded
    state convergence, cancellation, recovery, logs, SSE, cutover, and
    acceptance tests.
  - Completed the written-spec self-review for placeholders, internal
    consistency, scope, ambiguity, example syntax, and devlog commit hygiene.
- Not completed:
  - User review of the written design, implementation plan, business-code
    implementation, fresh live reproduction, integrated restart/cancel
    acceptance test, full validation, or implementation commit.

## Residual Risks

- The latest retained runtime evidence is from 2026-07-08 and is stale for a
  claim about current live behavior.
- Existing evidence proves historical/log-contract defects, but the stopped
  stack means live log tailing and a current cancellation race have not been
  reproduced in this branch.
- The exact user-visible failure that occurs most frequently now still needs to
  be reproduced freshly, but the user confirmed that all four known variants
  occur. The repair must pass a combined cancel/restart/queue/UI contract rather
  than selecting only one symptom.
- The Playwright workflow task is active in a separate worktree; this task must
  avoid its frontend dependency files and serialize any later shared devlog
  integration.
- The written design includes configurable default deadlines that still need
  user review before they become an implementation contract.

## Follow-up

- Owner: Codex. Ask the user to review
  `docs/superpowers/specs/2026-07-11-crawler-monitor-queue-v2-hard-cutover-design.md`.
  If approved, invoke `writing-plans`; if changes are requested, repair and
  re-review the written design before planning. Do not implement business code
  before this gate clears.

## Commits

- Pending.
