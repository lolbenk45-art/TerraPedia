# Devlog: crawler-v2-monitor-simplification

## Status

`closed`

## Context

- User goal: remove the unused legacy automation workbench from the crawler monitor and shorten the V2 operation catalog.
- Branch: `design/crawler-auto-ingestion-readiness`
- Worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-auto-ingestion-readiness`
- Related prior entries: `2026-08-06-crawler-v2-automation-controls.md`, `2026-08-06-crawler-v2-domain-freshness-card.md`

## Direction / Decisions

- Chosen approach: remove the legacy crawler-automation workbench and its page-load requests, then make the V2 global operation catalog a collapsed summary with an accessible explicit toggle.
- Follow-up direction: use the approved vertical system workspace, wrap long diagnostics, and render system-origin report previews above the system drawer.
- Reasoning: the V2 queue and reconciler are healthy, while the legacy overview request returns HTTP 500 from a stale MyBatis DTO mapping and creates misleading global error feedback.
- Rejected option: deleting backend crawler-automation policy and audit services in this UI task; they are outside the approved V2 monitor simplification and may still hold historical governance evidence.

## Scope

- Frontend: crawler monitor page, obsolete workbench-only components/helpers, and focused contracts.
- Backend: unchanged.
- Data: unchanged; no crawler or database write.
- Docs/process: this entry and `docs/devlog/current.md`.
- Out of scope: enabling V2 automation, changing destructive-operation confirmation, or executing ingestion.

## Validation

- `node --test tests/crawler-monitor-page-contract.test.mjs` -> 58/58 passed.
- `pnpm run test:unit` -> 412/412 passed.
- `pnpm run check` -> passed.
- Authenticated Chromium/CDP check at desktop and 375px mobile widths -> no legacy workbench DOM or requests; collapsed catalog expanded to 4 groups / 25 operations; no horizontal overflow; toggle height 44px.
- `git diff --check` -> passed.
- Not run: backend tests, because no backend files or contracts changed.
- Follow-up browser check: authenticated Chromium at desktop and 375px widths confirmed natural-height sections, no diagnostic card overflow, no horizontal overflow, five real report rows, and report preview visible above the system drawer (`z-index=2003`).
- Follow-up V2 fixture contracts pass `92/92`: the bounded standardized items sample, failed-progress paths, V2 smoke guards, and admin cancellation/retry/state contracts are green. The isolated Redis/API smoke remains a separate runtime gate because the current stack is not running the fixture-only profile.

## Result

- Completed: removed the legacy workbench from the V2 monitor page, removed its unused frontend components/state/contracts, added compact progressive disclosure for the V2 operation catalog, and implemented the approved vertical system drawer with visible report previews.
- Commit closeout: this focused change is being committed; existing user-owned data changes remain unstaged and untouched.

## Residual Risks

- Backend legacy policy endpoints remain available but are no longer loaded by the V2 monitor page.
- Report library still shows the backend-provided recent five reports; filtering/search remains out of scope.

## Follow-up

- Run the isolated fixture-stack smoke with a fixture-only namespace, Redis DB, and administrator token before any real scheduler or destructive apply authorization.

## Commits

- Commit SHA pending in final response.
