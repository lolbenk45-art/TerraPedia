# Domain A-Grade Source Progress Contract - 2026-05-24

## Scope

This is the Task 1 evidence checkpoint for `docs/plans/2026-05-24_domain-a-grade-remaining-blocker-repair-plan.md`.

It adds monitor-visible progress contracts for the four Domain source snapshot lanes before any live source fetch is allowed.

## Registered Tasks

| Task id | Canonical progress path | Output path |
| --- | --- | --- |
| `domain-source-bosses` | `data/generated/domain-source-bosses-progress.latest.json` | `data/generated/wiki-bosses.latest.json` |
| `domain-source-armor-sets` | `data/generated/domain-source-armor-sets-progress.latest.json` | `data/generated/wiki-armor-sets.latest.json` |
| `domain-source-shimmer` | `data/generated/domain-source-shimmer-progress.latest.json` | `data/generated/shimmer/wiki-shimmer-manifest.latest.json` |
| `domain-source-town-npc-maintenance` | `data/generated/domain-source-town-npc-maintenance-progress.latest.json` | `data/generated/wiki-town-npc-maintenance.latest.json` |

The Shimmer fetch script still writes the raw default snapshot `data/generated/wiki-shimmer.latest.json`; the monitor output path above is the gate-consumed manifest produced by the follow-up transform in Task 2.

## Script Progress Contract

All four lanes now support:

- default canonical progress paths;
- `--progress-path=<path>`;
- `TERRAPEDIA_CRAWLER_PROGRESS_PATH`;
- `running` progress before the first wiki request;
- heartbeat updates during fetch/parse loops;
- final `completed` or `failed` status;
- payload fields `actionId`, `status`, `generatedAt`, `lastHeartbeatAt`, `childStatusPath`, `phase`, `message`, `current`, `total`, `outputPath`, and `reportPath`;
- atomic temp-file-plus-rename progress writes.

When a custom or env progress path is used for an operator run, the scripts mirror the same progress state to the canonical monitor path. The tests isolate that mirror under `WORKTREE_ROOT` so test runs do not mutate real `data/generated/**`.

The Boss lane also adds `--max-records`; if discovered records exceed the cap, it fails before hydrating per-boss pages.

The Python Town NPC lane keeps existing `--limit` behavior and can be tested without network through `TERRAPEDIA_TOWN_NPC_MAINTENANCE_MOCK_HTML`.

## Commands Run

No live wiki fetch, item-page crawl, backend refresh apply, DB import, backfill, or DB write was run for this checkpoint.

```bash
node --test scripts/data/fetch/fetch-wiki-bosses-progress.test.mjs scripts/data/fetch/fetch-wiki-armor-sets-progress.test.mjs scripts/data/fetch/fetch-wiki-shimmer-page-progress.test.mjs
```

Result: exit `0`; `10` tests passed, `0` failed, `0` skipped.

```bash
uv run --with beautifulsoup4 node --test scripts/data/fetch/fetch-wiki-town-npc-maintenance-progress.test.mjs
```

Result: exit `0`; `4` tests passed, `0` failed, `0` skipped.

```bash
cd back && mvn "-Dtest=CrawlerMonitorServiceImplTest,AdminCrawlerMonitorControllerTest" test
```

Result: exit `0`; `40` tests run, `0` failures, `0` errors, `0` skipped.

```bash
cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs && pnpm run check
```

Result: exit `0`; page contract `10` tests passed, Nuxt typecheck passed.

## Cross-Review Follow-Up

Code quality review found that custom/env progress paths were not initially mirrored to canonical monitor paths, which could make registered tasks look missing while an operator run was active on a child path.

Fix applied:

- Node lanes mirror progress to canonical paths when a custom/env path is used outside plain test mode, with `WORKTREE_ROOT` isolation for tests.
- Python lane mirrors progress to the canonical path and uses pid/timestamp temp files for atomic writes.
- Tests now assert custom-path runs also write a canonical monitor progress file under a temp `WORKTREE_ROOT`.

The Shimmer monitor fallback path intentionally remains the gate-consumed manifest path. The raw fetch output remains `data/generated/wiki-shimmer.latest.json` for existing transform/import compatibility.

## Active Writer Check

```bash
ps -eo pid,ppid,stat,command | rg "run-backend-data-refresh|run-wiki-sync|fetch-wiki|item-page|crawler" || true
```

Result: no active crawler, wiki sync, backend refresh, item-page crawl, or fetch-wiki process beyond the check command itself.

## Safety Boundary

This checkpoint did not:

- run Boss, Armor Set, Shimmer, Town NPC, item-page, or other live crawler/fetch commands;
- write `terria_v1_local`, `terria_v1_maint`, or `terria_v1_relation`;
- run import, backfill, backend refresh apply, or production mutation scripts;
- generate or commit source snapshot evidence;
- push to any remote.

Next checkpoint is Task 2: operator-approved, one-at-a-time bounded source fetches after confirming monitor visibility and Python `bs4` availability.
