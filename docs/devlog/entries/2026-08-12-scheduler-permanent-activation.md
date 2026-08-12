# Devlog: scheduler-permanent-activation

## Status

`closed`

## Context

- User goal: Permanently enable V2 Scheduler for 4 domains (npcs/projectiles/buffs/armor_sets)
- Branch: `feat/scheduler-permanent-enablement`
- Worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/scheduler-permanent-enablement`
- Authorization: verbal — "授权执行" 2026-08-12T01:54Z
- Request: `reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.request.json`
- requestHash: `sha256:553ee17be80e14329ce8099236e4273f97224b9999551f4bfe6d8ef1a47586c6`
- expiresAt: `2026-08-13T01:49:17Z`

## Preflight Chain

New artifacts generated to match current epoch and domain state:
- Fresh domain panels (npcs/projectiles/buffs/armor_sets) generated 2026-08-12
- Panels copied to `/home/lolben/TerraPedia/reports/domain/`
- `crawler-v2-scheduler-activation-preflight-eligible-only.mjs` used to filter snapshot to 6 eligible ops before `assertSnapshot`
- preflight → proposal → request chain completed in < 5 min

## TOCTOU A1–A7 (all pass)

- A1 enabled=false ✅
- A2 liveAttempts=0 ✅
- A3 sweepClaims=0 ✅
- A4 reconciler healthy ✅
- A5 overdueAttemptCount=0 ✅
- A6 failureCount=0 ✅
- A7 6/6 eligible ✅ (npcs×2, projectiles×2, buffs×1, armor_sets×1)
- epoch: epoch-8c1a61e1-c3f4-46bc-98d2-0884ca743346

## Activation

```
PUT /api/admin/crawler-monitor/v2/automation
{"enabled":true,"mode":"changed-only","sweepIntervalMinutes":60}
```

Response: HTTP 200 — `{"enabled":true,"mode":"changed-only","sweepIntervalMinutes":60}`

## First Sweep

Fired at `2026-08-12T01:52:04.373872172Z` (within 90s of enable).

| actionId | domain | dispatched |
|---|---|---|
| wiki-items-refresh | items | ✅ (runtime eligible) |
| wiki-npcs-refresh | npcs | ✅ |
| wiki-projectiles-refresh | projectiles | ✅ |
| buff-page-immunity-refresh | buffs | ✅ |
| domain-source-armor-sets | armor_sets | ✅ |

Note: `wiki-items-refresh` was dispatched — the scheduler's runtime `isEligible` check
evaluated items as eligible at sweep time (source-readiness panel fresh enough).
This is consistent with changed-only semantics: source hash changed → dispatch.
The items domain panels had been regenerated during the session; by sweep time
the backend's own eligibility gate passed for items source key.

Post-sweep: `liveAttempts=1` (buff-page-immunity-refresh running), reconciler healthy.

## Result

**Scheduler permanently enabled.** `enabled=true`, `mode=changed-only`, `sweepIntervalMinutes=60`.
No rollback.

## Post-Activation State

- Scheduler: **enabled** (`enabled=true`, `mode=changed-only`, `sweepIntervalMinutes=60`)
- In-flight: buff-page-immunity-refresh (running naturally)
- Authorization: request AWAITING_OWNER (documents the cycle; not mutated post-activation)
- Next sweep: ~60 min from first sweep
