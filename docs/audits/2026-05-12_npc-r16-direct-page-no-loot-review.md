# NPC R16 Direct Page No-Loot Review

Review date: 2026-05-12

## Decision

The R16 direct-page rows below are expected-zero for ordinary NPC item loot. Each row has a direct wiki NPC page, crawler audit `pass`, bridge match, and normalized `loot: []`.

This review applies only to direct item loot materialized into the NPC loot domain. Projectile/combat backfill candidates are outside this closure.

## Evidence

Crawler output roots:

- `data/generated/tmp-npc-source-page-present-unextracted-r16`
- `data/generated/tmp-npc-source-page-present-unextracted-r16b`

Bridge output roots:

- `data/generated/tmp-npc-source-page-present-unextracted-r16-bridge`
- `data/generated/tmp-npc-source-page-present-unextracted-r16b-bridge`

The R16/R16b batches also produced positive loot rows for other NPCs. Those positive rows were handled through the NPC item relations bundle and are not part of this no-loot approval.

## Reviewed Rows

| npcInternalName | sourcePage | normalizedFile | lootRows | reason |
| --- | --- | --- | ---: | --- |
| CorruptGoldfish | Corrupt Goldfish | data/generated/tmp-npc-source-page-present-unextracted-r16/normalized-light/npc/corrupt-goldfish.latest.json | 0 | enemy_no_direct_item_loot |
| LavaSlime | Lava Slime | data/generated/tmp-npc-source-page-present-unextracted-r16/normalized-light/npc/lava-slime.latest.json | 0 | enemy_no_direct_item_loot |
| Vulture | Vulture | data/generated/tmp-npc-source-page-present-unextracted-r16/normalized-light/npc/vulture.latest.json | 0 | enemy_no_direct_item_loot |
| PossessedArmor | Possessed Armor | data/generated/tmp-npc-source-page-present-unextracted-r16b/normalized-light/npc/possessed-armor.latest.json | 0 | enemy_no_direct_item_loot |
| Arapaima | Arapaima | data/generated/tmp-npc-source-page-present-unextracted-r16b/normalized-light/npc/arapaima.latest.json | 0 | enemy_no_direct_item_loot |
| HoppinJack | Hoppin' Jack | data/generated/tmp-npc-source-page-present-unextracted-r16b/normalized-light/npc/hoppin-jack.latest.json | 0 | enemy_no_direct_item_loot |
| Ghost | Ghost | data/generated/tmp-npc-source-page-present-unextracted-r16b/normalized-light/npc/ghost.latest.json | 0 | enemy_no_direct_item_loot |
| Yeti | Yeti | data/generated/tmp-npc-source-page-present-unextracted-r16b/normalized-light/npc/yeti.latest.json | 0 | enemy_no_direct_item_loot |
| ElfCopter | Elf Copter | data/generated/tmp-npc-source-page-present-unextracted-r16b/normalized-light/npc/elf-copter.latest.json | 0 | enemy_no_direct_item_loot |
| ElfArcher | Elf Archer | data/generated/tmp-npc-source-page-present-unextracted-r16b/normalized-light/npc/elf-archer.latest.json | 0 | enemy_no_direct_item_loot |
| Krampus | Krampus | data/generated/tmp-npc-source-page-present-unextracted-r16b/normalized-light/npc/krampus.latest.json | 0 | enemy_no_direct_item_loot |
| Flocko | Flocko | data/generated/tmp-npc-source-page-present-unextracted-r16b/normalized-light/npc/flocko.latest.json | 0 | enemy_no_direct_item_loot |

## Boundary

Do not use these rows to approve unreviewed NPCs, group pages, generic item-source buckets, boss rewards, or backfill candidates for non-item domains.
