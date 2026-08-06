# Devlog: crawler-v2-items-sample-operation

## Status

`closed`

## Context

- User goal: operate the bounded real-items mock from the admin crawler page
  and inspect its actual V2 attempt, progress, log, and output.
- Branch: `design/crawler-auto-ingestion-readiness`
- Worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-auto-ingestion-readiness`
- Base: `dbb5ef94`
- Related docs: `docs/superpowers/specs/2026-08-06-crawler-v2-items-sample-operation-design.md`
- Related prior entries: `docs/devlog/entries/2026-08-06-crawler-v2-automation-controls.md`

## Direction / Decisions

- Chosen approach: register the sample as a non-default `items` operation and
  reuse the existing V2 operation catalog and attempt workflow.
- Reasoning: this gives the operator the same observable state and artifacts as
  every other V2 task without creating a side-channel endpoint or UI.
- Rejected options: a system-drawer-only button and a separate test page.

## Scope

- Frontend: existing admin operation catalog contract only; no bespoke control.
- Backend: registry-owned admission and launch of the items sample action.
- Data: read-only bounded access to the tracked standardized items payload;
  attempt-scoped artifacts only.
- Docs/process: design, implementation plan, validation, and handoff evidence.
- Out of scope: real crawling, automation enablement, database writes, V1, and
  running the sample for the user.

## Validation

- Commands run: design/plan self-review, focused Maven monitor suite, items
  fixture contract, admin page contract, admin Nuxt typecheck, stack restart,
  authenticated read-only catalog probe, and independent code review.
- Results: backend focused selection `523` tests, `0` failures, `0` errors,
  `10` skipped; fixture `4/4`; admin page contract `56/56`; admin typecheck
  passed; stack preflight passed; live V2 catalog exposes `items/sample`,
  automation is disabled, and live queue count is `0`.
- Not run: the sample operation itself was intentionally not started; no real
  crawler or database write is part of this acceptance.

## Result

- Completed: visible registry operation, normal V2 admission/launch, exact
  output-preview allowlist, focused validation, and runtime restart.
- Not completed: user-triggered manual sample acceptance; the operation is
  intentionally left for the user's manual acceptance.

## Residual Risks

- The sample output needed an explicit V2 preview allowlist entry; fixed and
  covered by the monitor service contract test.
- Independent review found missing-input failures could bypass terminal
  progress; fixed by moving input reads inside the progress try/catch and adding
  a missing-input regression test. No unresolved high/medium findings remain.

## Follow-up

- Owner: User. Manually start the operation at `/operations/crawler-monitor`
  for acceptance; no automatic sample run is performed by this task.

## Optional: State Changes

### 2026-08-06 10:16

- Change: user approved the written specification and requested execution.
- Reason: the brainstorming written-spec gate is complete.
- Evidence: direct user response `执行把`.

## Commits

- Implementation commit: this focused closeout commit; final SHA is reported in
  the handoff response (`feat(crawler): expose items sample in V2 catalog`).

## Optional: Cross-Review

- Reviewer: independent crawler V2 sample-operation reviewer.
- Scope: registry metadata, explicit V2 start, legacy dispatch boundary,
  supervisor launch, progress contract, and output preview allowlist.
- Findings: missing standardized input could exit before terminal progress;
  legacy dispatch/sample boundary lacked a direct regression test.
- Disposition: fixed; added missing-input failed-progress coverage, moved input
  reads inside the progress try/catch, and added legacy-dispatch rejection
  coverage.
- Re-review required: no.
- Resolved by: Codex.
- Remaining risks: manual sample execution has intentionally not been run.
