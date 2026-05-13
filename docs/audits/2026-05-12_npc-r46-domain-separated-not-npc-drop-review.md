# NPC R46 Domain-Separated Not NPC Drop Review

Date: 2026-05-12

## Decision

This review introduces a terminal NPC-domain status for rows where reviewed wiki evidence is not missing, but the evidence is outside ordinary NPC `npc_drop` materialization.

This is not expected-zero. Positive wiki loot rows may exist, but they belong to boss segment, boss component, health-pickup, item, or projectile domains. The closure rule is: do not materialize these rows as ordinary NPC drops.

## Evidence

- Source-page crawler output: `data/generated/tmp-npc-r46-remaining-sourcepage-evidence`
- Source-page bridge output: `data/generated/tmp-npc-r46-remaining-sourcepage-evidence-bridge`
- Image-title probe output: `data/generated/tmp-npc-r46-image-title-probe`
- Bridge summary: `data/generated/_tmp-r46-image-title-probe-bridge-summary.json`
- Prior boundary: `docs/audits/2026-05-12_npc-r33-boss-component-domain-review.md`
- Prior boundary: `docs/audits/2026-05-12_npc-r44-reviewed-no-loot-source-pages-review.md`

The R46 source-page bridge enriched `EaterofWorldsBody`, `EaterofWorldsTail`, and `TheHungryII` with exact wikiCrawler rows. Those rows are positive evidence, but not ordinary NPC drops:

| npcInternalName | sourcePage | evidence | reason |
| --- | --- | --- | --- |
| EaterofWorldsBody | Eater of Worlds | Exact body infobox loot rows for Demonite Ore and Shadow Scale. | `boss_segment_reward_domain_separated` |
| EaterofWorldsTail | Eater of Worlds | Exact tail infobox loot rows for Demonite Ore and Shadow Scale. | `boss_segment_reward_domain_separated` |
| TheHungryII | Wall of Flesh | Exact Heart row in Wall of Flesh component/health-pickup context. | `boss_component_health_pickup_domain_separated` |
| GolemFistLeft | Golem Fist | R44/R46 evidence resolves to the Golem Fist item/projectile page, not an NPC drop page. | `item_projectile_entity_domain_separated` |
| GolemFistRight | Golem Fist | R44/R46 evidence resolves to the Golem Fist item/projectile page, not an NPC drop page. | `item_projectile_entity_domain_separated` |

## Held Rows

These remain source gaps or future review candidates, not domain-separated closure rows:

| npcInternalName | reason |
| --- | --- |
| Zombie and Skeleton held variants | No exact reviewed source rows or inheritance contract. Do not broad-fanout from group pages. |
| BeeSmall, JungleCreeperWall, NutcrackerSpinning, DD2WitherBeastT3, Sharkron2, OwlMimic | No exact reviewed row for this batch; zero rows alone are not no-loot evidence. |
| FungoFish | Still `source_page_present_unextracted`; Jellyfish page evidence does not fan out to FungoFish. |
| TheDestroyerBody, TheDestroyerTail, WallofFleshEye, TheHungry, LeechBody, LeechTail, PumpkingBlade, MartianSaucerCore, CultistBossClone | These may need a later per-row domain review, but R46 does not provide enough exact row evidence to close them in this batch. |

## Boundaries

- No fuzzy matching.
- No generic bucket fanout.
- No expected-zero classification for rows with positive boss/component evidence.
- No boss segment, component, item, projectile, or health-pickup promotion into ordinary `npc_drop`.
- No broad boss/page fanout beyond the explicit five rows in this review.
