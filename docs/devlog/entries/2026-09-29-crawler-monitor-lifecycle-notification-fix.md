# Devlog: crawler-monitor lifecycle and persisted alert notifications

## Status

`closed`

## Context

- User goal: leave the primary worktree in a usable checkpoint state before continuing domain-by-domain automation work.
- Branch: `feat/supplementary-domains-readiness`
- Worktree: `/home/lolben/TerraPedia`
- Base: `6b410507`
- Related docs: `docs/project-governance/00_CURRENT_SPEC.md`, `docs/project-governance/00_WORKFLOW.md`
- Related prior entries: `docs/devlog/entries/2026-08-27-eight-domain-l2-execution-continuation.md`

## Direction / Decisions

- Keep standard-dispatch locks when process-tree cleanup fails, including startup, stale-admission, queue, and overview reconciliation paths.
- Do not hold the cleanup monitor while reading a lock file that may block; perform the read first, then serialize the final retention check and deletion.
- Surface persisted OPEN crawler-monitor alerts in the admin notification source and deduplicate them across browser restarts by `dedupeKey`.
- Keep generated runtime and historical evidence files out of this focused code commit; preserve them locally for later classification.

## Scope

- Frontend: persisted crawler-monitor alert notification projection and focused regression.
- Backend: standard dispatch cleanup-failure lock retention and lifecycle race handling with focused regressions.
- Data: no database, Redis, scheduler, crawler, or business-table writes.
- Docs/process: this entry records the checkpoint and validation.
- Out of scope: domain ingestion execution, scheduler activation, DDL, direct SQL/Redis repair, and cleanup or deletion of preserved evidence.

## Validation

- Commands run:
  - `cd services/catalog-api && mvn -q -Dtest=CrawlerMonitorServiceImplTest test`
  - `cd apps/admin-console && pnpm exec tsx --test tests/crawler-monitor-notification-source.test.mjs`
  - `git diff --check`
- Results: backend `213/213` passed; notification source `7/7` passed; diff check passed.
- Not run: full repository quality gate and full admin test suite; the full admin suite includes the focused test and is broader than this checkpoint.

## Result

- Completed: lifecycle race fix, persisted alert projection, and regression coverage. See git for code-level diff details.
- Not completed: domain-by-domain automation continuation remains open in the isolated Armor, Buff, Shimmer, and scheduler worktrees.

## Residual Risks

- The root worktree contains 280 preserved untracked generated reports/runtime artifacts from prior automation work. They are inventoried and locally excluded from status; no files were deleted or overwritten.
- The modified canonical item-group readiness timestamp was a generated report change unrelated to this checkpoint and was restored to the committed version.

## Follow-up

- Continue the recorded Buff/Armor/Scheduler handoff from their isolated worktrees after this checkpoint commit.

## Commits

- Pending / `commit SHA pending in final response`.

## Status Contract

Keep one top-level `## Status` section. The first non-empty line after it must be one code-spanned value: `active`, `blocked`, `ready-for-commit`, or `closed`.
