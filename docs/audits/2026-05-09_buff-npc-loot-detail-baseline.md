# Buff / NPC Detail Baseline Audit

Date: 2026-05-09
Branch: `plan/buff-npc-loot-detail-closeout`
Baseline commit from `main`: `c3b947d`
Worktree state at capture: dirty, plan doc only

## Runtime

- Admin: `http://localhost:3001`
- Front: `http://localhost:5174`
- Back: `http://localhost:18088`
- Local DB: `terria_v1_local`
- Relation DB: `terria_v1_relation`

## Buff Immune Sample Baseline

- Buff rows with non-empty `immune_npc_sample_json`: `388`
- Effective raw immune sample entries: `242`
- Current exact `internalName/game_id` resolutions: `133`
- Alias-resolvable entries from local NPC display names: `109`
- Still-unresolved entries after local alias matching: `0`
- Buffs affected by alias-only resolution: `24`

Representative alias-only rows:

- `Poisoned`: `AncientVision` -> `AncientCultistSquidhead`
- `Poisoned`: `PirateSCurse` -> `PirateGhost`
- `Poisoned`: `PhantasmDragon` -> multi-match among `CultistDragonHead/Body*/Tail`
- `OnFire`: `CorruptMimic` -> `BigMimicCorruption`
- `OnFire`: `HallowedMimic` -> `BigMimicHallow`
- `OnFire`: `CrimsonMimic` -> `BigMimicCrimson`

Current defect classification:

- The Buff detail regression is an API enrichment defect.
- Frontend consumes `immuneNpcSamples` directly when present and falls back to raw JSON only if the field is absent.
- Current backend can return unresolved placeholder card rows because `loadImmuneNpcSamples` preserves raw entries even when no local NPC row is found.

## Mimic Loot Baseline

Local DB state:

| NPC | local id | game_id | loot_items_json | npc_loot_entries | item_acquisition by local id | item_acquisition by game id |
| --- | --- | --- | --- | --- | --- | --- |
| `Mimic` | `85` | `85` | `7` | `7` | `7` | `7` |
| `PresentMimic` | `341` | `341` | `0` | `0` | `0` | `0` |
| `BigMimicCorruption` | `473` | `473` | `0` | `0` | `0` | `0` |
| `BigMimicCrimson` | `474` | `474` | `0` | `0` | `0` | `0` |
| `BigMimicHallow` | `475` | `475` | `0` | `0` | `0` | `0` |
| `BigMimicJungle` | `476` | `476` | `0` | `0` | `0` | `0` |
| `IceMimic` | `629` | `629` | `9` | `9` | `9` | `9` |
| `WaterBoltMimic` | `694` | `694` | `1` | `1` | `1` | `1` |

Relation DB totals:

- `item_source_facts`: `3975`
- `item_npc_loot_relations`: `674`
- `projection_npcs`: `762`

Relation / projection coverage for target Mimics:

- `item_npc_loot_relations` contains only `Mimic`, `IceMimic`, `WaterBoltMimic`
- `projection_npcs.loot_items_json` is zero for `PresentMimic`, `BigMimicCorruption`, `BigMimicCrimson`, `BigMimicHallow`, `BigMimicJungle`

Current defect classification:

- The Mimic detail regression is a missing-data-chain defect, not a pure rendering defect.
- Admin NPC detail page consumes `lootEntries`, `inheritedLootEntries`, and `derivedLootEntries` from `/admin/npcs/{id}`.
- Admin relation endpoints and public aggregate endpoints use the same local compatibility data families and are affected by the same absence.

## Image Notes

- `npc_loot_entries` item image gap: `0`
- `item_acquisition_sources` NPC drop item image gap: `0`
- `npc_buff_relations` Buff image gap: `0`
- `buff_source_items` item image gap: `0`
- Residual base-image gaps remain upstream, but they do not explain the two target regressions.

## Execution Guardrails

- Use current DB counts above as the implementation baseline, not the stale values from earlier discussion.
- Do not treat runtime wiki/crawler output as an acceptable fallback for either chain.
- Re-check current counts before any DB apply step; if they drift materially, refresh this audit first.
