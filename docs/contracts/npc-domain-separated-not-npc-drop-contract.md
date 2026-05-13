# NPC Domain Separated Not NPC Drop Contract

Contract version: `1`

Review date: 2026-05-12

## Purpose

This contract defines active NPC rows whose reviewed wiki evidence is real but belongs outside ordinary NPC `npc_drop` materialization.

These rows are not `expected_zero_loot`: some have positive wiki loot rows, but that loot belongs to a boss segment, boss component, health pickup, item, projectile, or another non-ordinary NPC-drop domain.

Rows in this contract must not be written to `item_npc_loot_relations`, `projection_npcs.loot_items_json`, or local `npc_loot_entries` as ordinary `npc_drop` rows.

## Allowed Reasons

| Reason | Meaning |
| --- | --- |
| `boss_reward_domain_separated` | Boss rewards are intentionally modeled in the boss reward/local boss compatibility path, not as ordinary NPC `npc_drop` rows. |
| `boss_segment_reward_domain_separated` | Exact wiki evidence is for a boss segment reward model, not ordinary NPC `npc_drop`. |
| `boss_component_health_pickup_domain_separated` | Exact wiki evidence is for a boss component or health-pickup context, not ordinary NPC `npc_drop`. |
| `boss_clone_or_helper_domain_separated` | Exact wiki evidence is for a boss clone, helper, core, or support entity whose rewards belong to the main boss row, not ordinary NPC `npc_drop`. |
| `item_projectile_entity_domain_separated` | Reviewed evidence resolves to an item/projectile/entity page that is not an ordinary NPC drop source page. |

## Row Format

| npcInternalName | npcType | reason | evidenceSource | reviewedBy | reviewedAt |
| --- | --- | --- | --- | --- | --- |
| EyeofCthulhu | boss | boss_reward_domain_separated | docs/audits/2026-05-11_npc-boss-reward-domain-expected-zero-review.md | codex | 2026-05-11 |
| KingSlime | boss | boss_reward_domain_separated | docs/audits/2026-05-11_npc-boss-reward-domain-expected-zero-review.md | codex | 2026-05-11 |
| QueenBee | boss | boss_reward_domain_separated | docs/audits/2026-05-11_npc-boss-reward-domain-expected-zero-review.md | codex | 2026-05-11 |
| SkeletronPrime | boss | boss_reward_domain_separated | docs/audits/2026-05-12_npc-r19-direct-page-review.md | codex | 2026-05-12 |
| Golem | boss | boss_reward_domain_separated | docs/audits/2026-05-12_npc-r19-direct-page-review.md | codex | 2026-05-12 |
| Plantera | boss | boss_reward_domain_separated | docs/audits/2026-05-12_npc-r19-direct-page-review.md | codex | 2026-05-12 |
| BrainofCthulhu | boss | boss_reward_domain_separated | docs/audits/2026-05-12_npc-r19-direct-page-review.md | codex | 2026-05-12 |
| DukeFishron | boss | boss_reward_domain_separated | docs/audits/2026-05-12_npc-r19-direct-page-review.md | codex | 2026-05-12 |
| MoonLordHead | boss | boss_reward_domain_separated | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| HallowBoss | boss | boss_reward_domain_separated | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| QueenSlimeBoss | boss | boss_reward_domain_separated | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| TorchGod | boss | boss_reward_domain_separated | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| Deerclops | boss | boss_reward_domain_separated | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| Retinazer | boss | boss_reward_domain_separated | docs/audits/2026-05-12_npc-r25-explicit-page-review.md | codex | 2026-05-12 |
| Spazmatism | boss | boss_reward_domain_separated | docs/audits/2026-05-12_npc-r25-explicit-page-review.md | codex | 2026-05-12 |
| LunarTowerVortex | boss | boss_reward_domain_separated | docs/audits/2026-05-12_npc-r25-explicit-page-review.md | codex | 2026-05-12 |
| LunarTowerStardust | boss | boss_reward_domain_separated | docs/audits/2026-05-12_npc-r25-explicit-page-review.md | codex | 2026-05-12 |
| LunarTowerNebula | boss | boss_reward_domain_separated | docs/audits/2026-05-12_npc-r25-explicit-page-review.md | codex | 2026-05-12 |
| LunarTowerSolar | boss | boss_reward_domain_separated | docs/audits/2026-05-12_npc-r25-explicit-page-review.md | codex | 2026-05-12 |
| SkeletronHead | boss | boss_reward_domain_separated | docs/audits/2026-05-12_npc-r33-boss-component-domain-review.md | codex | 2026-05-12 |
| TheDestroyer | boss | boss_reward_domain_separated | docs/audits/2026-05-12_npc-r33-boss-component-domain-review.md | codex | 2026-05-12 |
| WallofFlesh | boss | boss_reward_domain_separated | docs/audits/2026-05-12_npc-r33-boss-component-domain-review.md | codex | 2026-05-12 |
| CultistBoss | boss | boss_reward_domain_separated | docs/audits/2026-05-12_npc-r33-boss-component-domain-review.md | codex | 2026-05-12 |
| MartianSaucer | boss | boss_reward_domain_separated | docs/audits/2026-05-12_npc-r33-boss-component-domain-review.md | codex | 2026-05-12 |
| EaterofWorldsBody | boss_segment | boss_segment_reward_domain_separated | docs/audits/2026-05-12_npc-r46-domain-separated-not-npc-drop-review.md | codex | 2026-05-12 |
| EaterofWorldsTail | boss_segment | boss_segment_reward_domain_separated | docs/audits/2026-05-12_npc-r46-domain-separated-not-npc-drop-review.md | codex | 2026-05-12 |
| TheHungryII | boss_component | boss_component_health_pickup_domain_separated | docs/audits/2026-05-12_npc-r46-domain-separated-not-npc-drop-review.md | codex | 2026-05-12 |
| GolemFistLeft | item_projectile_entity | item_projectile_entity_domain_separated | docs/audits/2026-05-12_npc-r46-domain-separated-not-npc-drop-review.md | codex | 2026-05-12 |
| GolemFistRight | item_projectile_entity | item_projectile_entity_domain_separated | docs/audits/2026-05-12_npc-r46-domain-separated-not-npc-drop-review.md | codex | 2026-05-12 |
| WallofFleshEye | boss_component | boss_component_health_pickup_domain_separated | docs/audits/2026-05-12_npc-r49-component-domain-separated-review.md | codex | 2026-05-12 |
| TheHungry | boss_component | boss_component_health_pickup_domain_separated | docs/audits/2026-05-12_npc-r49-component-domain-separated-review.md | codex | 2026-05-12 |
| LeechBody | boss_component | boss_component_health_pickup_domain_separated | docs/audits/2026-05-12_npc-r49-component-domain-separated-review.md | codex | 2026-05-12 |
| LeechTail | boss_component | boss_component_health_pickup_domain_separated | docs/audits/2026-05-12_npc-r49-component-domain-separated-review.md | codex | 2026-05-12 |
| TheDestroyerBody | boss_segment | boss_segment_reward_domain_separated | docs/audits/2026-05-12_npc-r49-component-domain-separated-review.md | codex | 2026-05-12 |
| TheDestroyerTail | boss_segment | boss_segment_reward_domain_separated | docs/audits/2026-05-12_npc-r49-component-domain-separated-review.md | codex | 2026-05-12 |
| PumpkingBlade | boss_component | boss_component_health_pickup_domain_separated | docs/audits/2026-05-12_npc-r49-component-domain-separated-review.md | codex | 2026-05-12 |
| CultistBossClone | boss_helper | boss_clone_or_helper_domain_separated | docs/audits/2026-05-12_npc-r50-boss-helper-domain-separated-review.md | codex | 2026-05-12 |
| MartianSaucerCore | boss_helper | boss_clone_or_helper_domain_separated | docs/audits/2026-05-12_npc-r50-boss-helper-domain-separated-review.md | codex | 2026-05-12 |

## Rules

- Do not add a row unless reviewed evidence proves the row is outside ordinary NPC `npc_drop`.
- Do not use this contract for broad boss, segment, component, Zombie, Skeleton, or same-page fanout.
- Do not use this contract for zero-row-only no-loot conclusions.
- Ordinary NPC drop rows for these NPCs are pollution and must block release.
