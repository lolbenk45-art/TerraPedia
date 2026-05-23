# Domain A-Grade Source Snapshot Evidence - 2026-05-23

## Commands
- `node scripts/data/workflow/domain-acceptance-report-manifest.mjs | rg -n "bosses|armor_sets|support.shimmer|support.town_npc_maintenance|sourceReadiness|writesDatabase"`: exit `0`.
- `rg -n "progress-path|TERRAPEDIA_CRAWLER_PROGRESS_PATH|lastHeartbeatAt|childStatusPath|actionId" scripts/data/fetch/fetch-wiki-bosses.mjs scripts/data/fetch/fetch-wiki-armor-sets.mjs scripts/data/fetch/fetch-wiki-shimmer-page.mjs scripts/data/fetch/fetch-wiki-town-npc-maintenance.py`: exit `1`, no progress-contract fields found.
- `python3 --version`: exit `0`, Python `3.12.3`.
- `python3 - <<'PY' ... from bs4 import BeautifulSoup, Tag ... PY`: exit `0`, printed `ModuleNotFoundError: No module named 'bs4'`.

## Source Snapshot Presence
- Missing: `data/generated/wiki-bosses.latest.json`.
- Missing: `data/generated/wiki-armor-sets.latest.json`.
- Missing: `data/generated/shimmer/wiki-shimmer-manifest.latest.json`.
- Missing: `data/generated/wiki-town-npc-maintenance.latest.json`.

## Progress Contract Decision
No Group B network fetch was run in this plan.

The four direct fetch lanes are bounded source snapshot fetches, but the checked scripts do not expose the required monitor-visible progress contract fields:

- `scripts/data/fetch/fetch-wiki-bosses.mjs`
- `scripts/data/fetch/fetch-wiki-armor-sets.mjs`
- `scripts/data/fetch/fetch-wiki-shimmer-page.mjs`
- `scripts/data/fetch/fetch-wiki-town-npc-maintenance.py`

Per the TerraPedia crawler progress contract, a crawler/fetch task must have a stable `actionId`, progress path, `lastHeartbeatAt`, and completion/failure status before execution. The plan also requires progress before any network fetch. This task therefore classifies Group B as blocked by a required progress-contract repair branch.

## Town NPC Python Environment
The Town NPC maintenance fetch has an additional local dependency blocker:

```text
ModuleNotFoundError: No module named 'bs4'
```

Even after adding progress output, the Town NPC fetch lane needs a Python dependency/environment repair before it can run in this worktree.

## Gate Status
The four Group B panels remain open:

- `bosses/sourceReadiness`: missing `data/generated/wiki-bosses.latest.json`.
- `armor_sets/sourceReadiness`: missing `data/generated/wiki-armor-sets.latest.json`.
- `support.shimmer/sourceReadiness`: missing `data/generated/shimmer/wiki-shimmer-manifest.latest.json`.
- `support.town_npc_maintenance/sourceReadiness`: missing `data/generated/wiki-town-npc-maintenance.latest.json`.

No `.gitignore` allowlist was added for these source snapshots because no durable source snapshot was produced in this run.

## Required Follow-Up
- Add progress-contract support and tests for the direct source snapshot fetch lanes or route them through a monitor-visible backend-refresh/wiki-sync action.
- Fix the Town NPC Python dependency environment so `bs4` is importable.
- After those repairs, run one bounded source snapshot lane at a time, make the gate-consumed evidence durable, regenerate domain reports, and rerun the A-grade gate.
