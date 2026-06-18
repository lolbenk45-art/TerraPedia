# Wiki Monitor Dashboard Design

Date: 2026-06-14

## Goal

Build a crawler monitor dashboard that watches wiki data freshness, summarizes upstream changes by domain, creates approval-gated refresh tasks, and lets an admin start whitelisted domain refreshes from the page.

## Decisions

- Use the hybrid model: one global dashboard and dispatch surface, with per-domain monitor rules and per-domain refresh actions.
- Start with semi-automatic execution. The system may detect changes and create pending tasks automatically, but the first version only runs a task after an admin clicks an execute button.
- Preserve auto-dispatch readiness with explicit fields: `dispatchMode`, `requiresApproval`, `autoEligible`, `cooldownMinutes`, `maxConcurrent`, `failureCircuitBreaker`, `lastAutoRunAt`, and `pauseReason`.
- Keep execution safe. The backend must not run arbitrary commands from the browser. It can only run predefined action IDs mapped to known scripts and known progress paths.
- Keep every crawler task monitor-visible before it can be executed. Each runnable action must have stable `actionId`, progress path, heartbeat, final status, and tests for payload shape.

## Domains

The first dashboard covers these minimum-closure domains:

- `items`
- `npcs`
- `projectiles`
- `buffs`
- `armor_sets`
- `recipes`
- `biomes`
- `bosses`
- `town_npc_maintenance`
- `shimmer`

Each domain starts with a minimum closed loop:

1. A wiki source rule tells the monitor what to check.
2. A freshness state says unchanged, changed, missing, error, or unknown.
3. A summary row explains the source, impact, and recommendation.
4. A pending approval task is created when a refresh is needed.
5. The admin can click execute for a whitelisted action.
6. Runtime progress returns through existing crawler monitor progress rows.

## Source Rules

The initial source checks are intentionally small:

| Domain | Minimum source rule | First refresh action | Execution path |
| --- | --- | --- | --- |
| items | `Module:Iteminfo/data` | `wiki-core-refresh` | `node scripts/data/workflow/run-backend-data-refresh.mjs --mode=apply --steps=wiki-core-refresh --output=<reportPath>` |
| npcs | `Module:Npcinfo/data` | `wiki-core-refresh` | `node scripts/data/workflow/run-backend-data-refresh.mjs --mode=apply --steps=wiki-core-refresh --output=<reportPath>` |
| projectiles | `Module:Projectileinfo/data` | `wiki-core-refresh` | `node scripts/data/workflow/run-backend-data-refresh.mjs --mode=apply --steps=wiki-core-refresh --output=<reportPath>` |
| buffs | `Template:GetBuffInfo` | `buff-page-immunity-refresh` | `node scripts/data/fetch/fetch-wiki-buffs.mjs --progress-path=data/generated/fetch-wiki-buffs-progress.latest.json` |
| armor_sets | `Module:ArmorSetBonuses` | `domain-source-armor-sets` | `node scripts/data/fetch/fetch-wiki-armor-sets.mjs --progress-path=data/generated/domain-source-armor-sets-progress.latest.json` |
| recipes | zh recipe source/check report | `recipe-reference-sync` | `node scripts/data/workflow/run-backend-data-refresh.mjs --mode=apply --steps=recipe-reference-sync --output=<reportPath>` |
| biomes | `Forest` wiki page revision as biome anchor | `biome-sync` | `node scripts/data/workflow/run-backend-data-refresh.mjs --mode=apply --steps=biome-sync --output=<reportPath>` |
| bosses | boss source snapshot pages | `domain-source-bosses` | `node scripts/data/fetch/fetch-wiki-bosses.mjs --progress-path=data/generated/domain-source-bosses-progress.latest.json` |
| town_npc_maintenance | town NPC maintenance source page | `domain-source-town-npc-maintenance` | `python scripts/data/fetch/fetch-wiki-town-npc-maintenance.py --progress-path=data/generated/domain-source-town-npc-maintenance-progress.latest.json` |
| shimmer | shimmer source page | `domain-source-shimmer` | `node scripts/data/fetch/fetch-wiki-shimmer-page.mjs --progress-path=data/generated/domain-source-shimmer-progress.latest.json` |

The rule set should be data-driven so later domains or stronger checks can be added without redesigning the dashboard.

## Backend Shape

Extend `GET /admin/crawler-monitor/overview` with a `wikiMonitor` section:

```json
{
  "wikiMonitor": {
    "generatedAt": "2026-06-14T00:00:00Z",
    "dispatchMode": "manual",
    "summary": {
      "domainCount": 10,
      "changedCount": 1,
      "pendingApprovalCount": 1,
      "runningCount": 0,
      "failedCount": 0
    },
    "domains": [],
    "pendingDispatches": []
  }
}
```

Add a POST endpoint:

```text
POST /admin/crawler-monitor/dispatch
```

Request:

```json
{
  "domain": "items",
  "actionId": "wiki-core-refresh"
}
```

The service validates the domain/action pair against a server-side whitelist, atomically acquires a dispatch lock before process start, checks cooldown state, writes a dispatch record, then starts the refresh in a detached process. The whitelist stores the executable and argument array; the browser never sends command text. Backend-refresh progress paths are computed from the run report path as `<reportPath>.runtime/<actionId>.child-status.json`. The response returns `accepted`, `dispatchId`, `actionId`, `reportPath`, and `progressPath`.

## Files And State

Use these monitor-visible files:

- `data/generated/source-update-monitor.latest.json` for upstream change state.
- `reports/crawler-monitor/wiki-monitor-dispatch.latest.json` for pending/running dispatch summary.
- `reports/crawler-monitor/wiki-monitor-dispatch.lock.json` for atomic dispatch lock ownership.
- Existing action progress paths such as `data/generated/wiki-sync-progress.latest.json` and `data/generated/domain-source-*-progress.latest.json`.
- Backend refresh runtime child status paths for `backend-refresh` actions.

Dispatch records are operational state, not source data. They should be small JSON files and safe to regenerate.

## Frontend Shape

The existing `/operations/crawler-monitor` page gets a new first-class dashboard band:

- Global wiki monitor summary.
- Domain grid for the ten domains.
- Pending approval list with execute buttons.
- Active/running tasks still use the existing progress rows.
- Buttons are disabled when a domain is unchanged, blocked, already running, in cooldown, or has no whitelisted action.

The page must show text states, not only colors.

## Safety

- No arbitrary command execution.
- No DB writes from change detection.
- No crawler starts unless the action has a progress contract.
- No dispatch starts unless the service owns the atomic dispatch lock.
- Dispatch state is reconciled from canonical progress files so stale `running` dispatch JSON is not trusted after backend restart.
- No long crawl is started by tests.
- First version defaults to `dispatchMode: manual`.
- Auto mode is represented in data shape but disabled.

## Validation

- Backend tests cover overview payload, stale/missing upstream state, whitelisted dispatch, blocked unknown action, and dispatch lock/cooldown.
- Node tests cover domain rule mapping and action progress path metadata.
- Frontend contract tests cover domain rows, pending approval buttons, disabled states, and POST call wiring.
- Existing crawler monitor tests must still pass.
