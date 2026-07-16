# Devlog: V2 Main Merge Integration

## Status

`closed`

## Context

- Goal: locally merge `fix/crawler-queue-v2-runtime` into `main` without
  regressing current main crawler-monitor notifications.
- Branch: `main`
- Worktree:
  `/home/lolben/.config/superpowers/worktrees/TerraPedia/article-engagement-sorting-merge`
- Related entries:
  `2026-07-14-crawler-monitor-registered-idle-domains.md` and
  `2026-07-16-crawler-monitor-operation-semantics.md`.

## Result

- Resolved the monitor initialization conflict by retaining both the main
  auto-refresh and V2 transport startup calls.
- Merge validation exposed one notification regression: the legacy
  `wikiMonitor` domain-table fallback treated a missing authoritative state as
  healthy idle. The fallback was removed from the legacy model; V2 idle domains
  continue to use the separate V2 `domainStates` projection.

## Validation

- RED: the merged full admin gate failed only
  `crawler-monitor-notification-source.test.mjs`, where a missing backend
  state produced zero attention events.
- GREEN: notification source, legacy domain-table, and monitor-page tests pass
  72/72 after the repair.
- Merged full admin gate passes 345/345 plus Nuxt typecheck and production
  build.
- Fresh merged focused V2 backend selection passes 538/538 with zero failures,
  errors, or skips; `mvn test-compile` also reports `BUILD SUCCESS`.

## Review Coordination

- Coordinator: Codex. Owns merge resolution, devlog, staging, and commit.
- Read-only merge reviewer: completed. Scope was the initialization conflict
  and the legacy-domain-state fallback repair only. No edits, staging, crawler,
  Redis, or database action were permitted. The reviewer verified that V2 idle
  domains still use `domainStates` while legacy missing state produces an
  attention notification.

## Review Findings

- Reviewer: read-only merge reviewer (2026-07-17).
- Disposition: approved with no material finding. The V2 transport clears
  legacy polling after both initialization calls, legacy missing state is again
  `state_missing`/`unknown`, and V2 rows bypass the legacy table. The reviewer
  noted no dedicated assertion for the exact two-call initialization order;
  the merged focused 72/72 and full admin 345/345 gates cover the behavior.

## Residual Risks

- Real force-crawl, database apply, live Redis expiry races, and adversarial
  HTTP preview-path acceptance remain explicit manual/runtime concerns.

## Follow-up

- None for the local merge. Do not run real mutation actions without explicit
  operator authorization.

## Commits

- Merge commit SHA pending in final response.
