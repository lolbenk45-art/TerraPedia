# NPC R19 Direct Page Review

Review date: 2026-05-12

## Decision

The R19 direct-page batch split into three reviewed outcomes:

- 19 rows are expected-zero for ordinary NPC item loot. Each row has a direct wiki NPC page, crawler audit `pass`, bridge match, and normalized `loot: []`.
- 5 boss rows have crawler loot rows, but those rows belong to the boss reward domain and must not materialize as ordinary NPC `npc_drop` rows.
- `CorruptPenguin` has 3 ordinary NPC loot rows and must be materialized through the NPC item relation bundle and the normal landing to maint to relation to local chain.

This review does not approve group pages, generic item-source buckets, boss treasure bags as NPC loot, or any uncrawled NPC.

## Evidence

- Crawler output root: `data/generated/tmp-npc-source-page-present-unextracted-r19`
- Batch summary: `data/generated/tmp-npc-source-page-present-unextracted-r19/report/npc/batch-summary.latest.json`
- Bridge output root: `data/generated/tmp-npc-source-page-present-unextracted-r19-bridge`
- Bridge summary: `data/generated/tmp-npc-source-page-present-unextracted-r19-bridge/report/npc-bridge-summary.latest.json`

Batch summary:

- `total`: 25
- `pass`: 25
- `warn`: 0
- `fail`: 0

Bridge summary:

- `crawlerNpcTotal`: 25
- `matched`: 25
- `unmatchedCrawler`: 0
- `conflictSamples`: 0

## Expected-Zero Rows

| npcInternalName | sourcePage | normalizedFile | lootRows | reason |
| --- | --- | --- | ---: | --- |
| ServantofCthulhu | Servant of Cthulhu | data/generated/tmp-npc-source-page-present-unextracted-r19/normalized-light/npc/servant-of-cthulhu.latest.json | 0 | enemy_no_direct_item_loot |
| BurningSphere | Burning Sphere | data/generated/tmp-npc-source-page-present-unextracted-r19/normalized-light/npc/burning-sphere.latest.json | 0 | projectile_or_effect_not_killable |
| WaterSphere | Water Sphere | data/generated/tmp-npc-source-page-present-unextracted-r19/normalized-light/npc/water-sphere.latest.json | 0 | projectile_or_effect_not_killable |
| SpikeBall | Spike Ball | data/generated/tmp-npc-source-page-present-unextracted-r19/normalized-light/npc/spike-ball.latest.json | 0 | projectile_or_effect_not_killable |
| BlazingWheel | Blazing Wheel | data/generated/tmp-npc-source-page-present-unextracted-r19/normalized-light/npc/blazing-wheel.latest.json | 0 | projectile_or_effect_not_killable |
| Parrot | Parrot | data/generated/tmp-npc-source-page-present-unextracted-r19/normalized-light/npc/parrot.latest.json | 0 | critter_no_loot |
| AnomuraFungus | Anomura Fungus | data/generated/tmp-npc-source-page-present-unextracted-r19/normalized-light/npc/anomura-fungus.latest.json | 0 | enemy_no_direct_item_loot |
| MushiLadybug | Mushi Ladybug | data/generated/tmp-npc-source-page-present-unextracted-r19/normalized-light/npc/mushi-ladybug.latest.json | 0 | enemy_no_direct_item_loot |
| FungiBulb | Fungi Bulb | data/generated/tmp-npc-source-page-present-unextracted-r19/normalized-light/npc/fungi-bulb.latest.json | 0 | projectile_or_effect_not_killable |
| GiantFungiBulb | Giant Fungi Bulb | data/generated/tmp-npc-source-page-present-unextracted-r19/normalized-light/npc/giant-fungi-bulb.latest.json | 0 | projectile_or_effect_not_killable |
| Mouse | Mouse | data/generated/tmp-npc-source-page-present-unextracted-r19/normalized-light/npc/mouse.latest.json | 0 | critter_no_loot |
| Firefly | Firefly | data/generated/tmp-npc-source-page-present-unextracted-r19/normalized-light/npc/firefly.latest.json | 0 | critter_no_loot |
| Worm | Worm | data/generated/tmp-npc-source-page-present-unextracted-r19/normalized-light/npc/worm.latest.json | 0 | critter_no_loot |
| LightningBug | Lightning Bug | data/generated/tmp-npc-source-page-present-unextracted-r19/normalized-light/npc/lightning-bug.latest.json | 0 | critter_no_loot |
| Snail | Snail | data/generated/tmp-npc-source-page-present-unextracted-r19/normalized-light/npc/snail.latest.json | 0 | critter_no_loot |
| GlowingSnail | Glowing Snail | data/generated/tmp-npc-source-page-present-unextracted-r19/normalized-light/npc/glowing-snail.latest.json | 0 | critter_no_loot |
| Frog | Frog | data/generated/tmp-npc-source-page-present-unextracted-r19/normalized-light/npc/frog.latest.json | 0 | critter_no_loot |
| DetonatingBubble | Detonating Bubble | data/generated/tmp-npc-source-page-present-unextracted-r19/normalized-light/npc/detonating-bubble.latest.json | 0 | projectile_or_effect_not_killable |
| Grasshopper | Grasshopper | data/generated/tmp-npc-source-page-present-unextracted-r19/normalized-light/npc/grasshopper.latest.json | 0 | critter_no_loot |

## Boss Reward Domain Rows

| npcInternalName | sourcePage | normalizedFile | crawlerLootRows | reason |
| --- | --- | --- | ---: | --- |
| SkeletronPrime | Skeletron Prime | data/generated/tmp-npc-source-page-present-unextracted-r19/normalized-light/npc/skeletron-prime.latest.json | 13 | boss_reward_domain_separated |
| Golem | Golem | data/generated/tmp-npc-source-page-present-unextracted-r19/normalized-light/npc/golem.latest.json | 25 | boss_reward_domain_separated |
| Plantera | Plantera | data/generated/tmp-npc-source-page-present-unextracted-r19/normalized-light/npc/plantera.latest.json | 41 | boss_reward_domain_separated |
| BrainofCthulhu | Brain of Cthulhu | data/generated/tmp-npc-source-page-present-unextracted-r19/normalized-light/npc/brain-of-cthulhu.latest.json | 14 | boss_reward_domain_separated |
| DukeFishron | Duke Fishron | data/generated/tmp-npc-source-page-present-unextracted-r19/normalized-light/npc/duke-fishron.latest.json | 23 | boss_reward_domain_separated |

The NPC item relations bundle builder excludes boss loot rows from ordinary NPC item relations, so these rows must be closed by expected-zero domain separation rather than relation materialization.

## Positive NPC Loot Row

| npcInternalName | sourcePage | normalizedFile | crawlerLootRows | action |
| --- | --- | --- | ---: | --- |
| CorruptPenguin | Corrupt Penguin | data/generated/tmp-npc-source-page-present-unextracted-r19/normalized-light/npc/corrupt-penguin.latest.json | 3 | materialize ordinary NPC loot through the NPC item relation bundle |

Corrupt Penguin crawler loot rows:

- `Pedguin's Hood`, `0.67%`, quantity `1`
- `Pedguin's Jacket`, `0.67%`, quantity `1`
- `Pedguin's Trousers`, `0.67%`, quantity `1`

## Boundary

Do not use this review to approve unreviewed direct pages, source-page-missing rows, group pages, generic buckets, or ambiguous Mimic rows.

Do not promote boss crawler loot rows into ordinary NPC loot. Boss rewards remain separated from `npc_drop` rows.
