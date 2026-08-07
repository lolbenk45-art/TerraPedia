# Crawler V2 Scheduler Lifecycle

## Status

`active`

## Context

- User goal: continue the remaining plan with V2 scheduler daemon, lease, and
  restart recovery, leaving formal activation as an ADMIN-controlled final
  action.
- Branch: `design/crawler-auto-ingestion-readiness`.
- Worktree:
  `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-auto-ingestion-readiness`.
- Related prior entry:
  `docs/devlog/entries/2026-08-06-crawler-v2-automation-controls.md`.

## Direction / Decisions

- Use the existing Spring V2 scheduler/reconciler/recovery ownership.
- First run an isolated scheduled lifecycle T1, including lease renewal and
  backend restart recovery.
- Then add a new V2-specific formal activation operation and proposal.
- Reject an external daemon because it duplicates the Spring scheduler.
- Do not reuse the Biome L2 scheduler decision for V2 changed-only automation.

## Scope

- Backend/fixture: isolated scheduler lifecycle acceptance and focused repairs
  only if T1 exposes a real contract gap.
- Automation: T1 operation plus V2 formal activation manifest/request/proposal.
- Data: fixture-only Redis/artifact state; no formal database or Wiki writes.
- Out of scope: consuming the formal activation permit, enabling production
  automation, a real Wiki crawler, V1 live routing, push, merge, and cleanup of
  user data.

## Current State

- V2 scheduled sweep, reconciliation/watchdog, atomic lease renewal, and
  ApplicationReady recovery already exist.
- V2 automation is effectively disabled because no automation config exists;
  the last observed sweep detected five changed eligible sources and dispatched
  none.
- Existing fixture smoke validates V2 cutover/control/reset boundaries but does
  not prove scheduled enable, repeated lease renewal, or backend restart
  recovery as one live lifecycle.
- Design:
  `docs/superpowers/specs/2026-08-08-crawler-v2-scheduler-lifecycle-design.md`.
- Implementation plan:
  `docs/superpowers/plans/2026-08-08-crawler-v2-scheduler-lifecycle-implementation.md`.
- Plan audit: execution-ready; Task 3 is intentionally gap-driven and permits
  only the single Spring owner class exposed by the isolated runtime evidence.

## Validation

- Read-only chain audit completed; no crawler, scheduler, Redis mutation, or
  database write executed.
- Plan consistency scan and `git diff --check` pending plan commit.

## Residual Risks

- Formal activation can create real crawler work and remains a separate owner
  checkpoint after isolated acceptance.
- Town NPC generated data and `data/generated/resume/` are unrelated user
  artifacts and must remain untouched and unstaged.

## Follow-up

- Commit the audited plan, then execute Tasks 1-6 under fresh isolated ADMIN
  authorization; formal activation remains proposal-only.

## Commits

- Pending.
