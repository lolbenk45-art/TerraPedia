# Devlog: npc-t1-isolated-acceptance-refresh

## Status

`closed`

## Context

- User goal: rerun the smallest current-schema isolated ingestion acceptance before considering another formal apply, excluding item-scale operations.
- Branch: `design/crawler-auto-ingestion-readiness`
- Worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-auto-ingestion-readiness`
- Base: `fc09e505`
- Operation: `canonical-npc-t1-acceptance`

## Direction / Decisions

- Used the governed NPC T1 path with a fresh current-code manifest, current formal-server fingerprint, new request, ADMIN packet, and one-time dispatch permit.
- Formal `terria_v1_local`, `terria_v1_maint`, and `terria_v1_relation` remained read-only. All writes were limited to run-key-isolated temporary databases and Redis DB 14.
- Items, crawler execution, formal apply, scheduler activation, service lifecycle, push, and merge remained out of scope.

## Validation

- Authorized run `npc-t1-20260807-01` / `npc_c17caf46f16a50e2` completed with `status=passed` and `cleanupPassed=true`.
- Current formal snapshot covered 129 ownership-managed tables with per-table schema hashes and at most two scrubbed sample rows; snapshot verification passed.
- The NPC acceptance verified 13 required tables. Three-database probes were rollback `0/0/0`, commit `1/1/1`, and restore `0/0/0`.
- Independent post-run readback found zero isolated databases, zero temporary accounts, zero active transactions, and zero Redis DB 14 keys.
- The current NPC baseline differs from the prior evidence at `local.npc_loot_entries`: `1880` now versus `1890` previously. This did not fail schema, snapshot, or transaction verification.

## Result

- Completed: current-schema NPC T1 isolated acceptance and cleanup verification.
- Not completed: formal database apply or scheduler enablement.

## Residual Risks

- The ten-row `local.npc_loot_entries` baseline decrease requires explanation before using this evidence to authorize a future formal NPC apply.
- Passing isolated acceptance proves schema and bounded transaction compatibility; it does not grant blanket authorization for formal writes or other domains.

## Follow-up

- Before formal NPC apply, audit the `npc_loot_entries` delta and generate a separate current-hash formal apply request.

## Commits

- `commit SHA pending in final response`.
