# Crawler Monitor Source Progress Evidence - 2026-05-24

## Goal

Make `/operations/crawler-monitor` show Boss / Armor sets / Shimmer / Town NPC source snapshot progress in the first viewport during source fetches.

## Baseline

- Branch: fix/crawler-monitor-source-live-progress-2026-05-24
- Backend overview endpoint: http://localhost:18088/api/admin/crawler-monitor/overview
- Frontend URL: http://localhost:3001/operations/crawler-monitor
- Backend `repoRoot`: `/home/lolben/.config/superpowers/worktrees/TerraPedia/main-admin-npc-zh-merge-2026-05-22`
- Observation: the default `:8080` plan probe was not the active local stack port. The current stack uses backend `:18088`, admin `:3001`, front `:5174`, redis `:6380`.

## Source Snapshot Tasks

| Task | Status | Kind | Progress Path | Heartbeat | Progress | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| domain-source-bosses | running | live | `data/generated/domain-source-bosses-progress.latest.json` | `2026-05-24T01:50:43Z` | `7/14`, 50% | Runtime smoke fixture only; confirms visible live progress lane. |
| domain-source-armor-sets | completed | completed | `data/generated/domain-source-armor-sets-progress.latest.json` | `2026-05-24T01:50:43Z` | `38/38`, 100% | Runtime smoke fixture only. |
| domain-source-shimmer | stalled | stalled | `data/generated/domain-source-shimmer-progress.latest.json` | `2026-05-24T01:20:43Z` | `1/3`, 33.33% | Stale reason: `running progress heartbeat is older than 10 minutes`. |
| domain-source-town-npc-maintenance | missing | missing | `data/generated/domain-source-town-npc-maintenance-progress.latest.json` | -- | -- | No temp progress file was created, to verify missing-state diagnostics. |

## Before Screenshot

- Path: not captured
- Result: Baseline symptom was the user-observed page prioritizing recent external reports instead of source snapshot progress while source data was being fetched.

## After Screenshot

- Path: `docs/evidence/assets/crawler-monitor-source-progress-after-2026-05-24.png`
- Result: Headless Chromium captured the first viewport with the `源快照实时进度` panel above the operations grid. The headless environment lacks CJK fonts, so Chinese glyphs render as square boxes in the screenshot, but DOM text verification below read the full Chinese strings and source progress values.

## Runtime Page Smoke

- Browser: headless Chromium through DevTools Protocol.
- URL after auth cookie injection: `http://localhost:3001/operations/crawler-monitor`.
- Source snapshot rows rendered: 4.
- DOM text observed:
  - `源快照实时进度`
  - `Domain source: Bosses`, `running`, `7/14`, `data/generated/domain-source-bosses-progress.latest.json`
  - `Domain source: Shimmer`, `stalled`, `1/3`, stale heartbeat reason
  - `Domain source: Town NPC maintenance`, `missing`
  - `Domain source: Armor sets`, `completed`, `38/38`
  - `repoRoot`: `/home/lolben/.config/superpowers/worktrees/TerraPedia/main-admin-npc-zh-merge-2026-05-22`

## Validation Commands

```bash
cd back && mvn "-Dtest=CrawlerMonitorServiceImplTest,AdminCrawlerMonitorControllerTest" test
cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs
cd data-query-app && pnpm run check
```

- Backend focused tests: passed, 40 tests, 0 failures.
- Frontend contract test: passed, 14 tests, 0 failures.
- Admin typecheck: passed.

## Final Runtime Check

- Local stack: running with backend `:18088`, admin `:3001`, front `:5174`, redis `:6380`.
- Source snapshot band visible in first viewport: yes.
- Running/stalled source task visible without scrolling: yes; Boss running and Shimmer stalled are visible in the first viewport.
- `repoRoot` visible: yes.
- `progressPath` visible: yes.

## Cleanup Boundary

- The runtime smoke used temporary ignored files under `data/generated/domain-source-*-progress.latest.json`.
- These progress files were deleted before final validation/commit.
