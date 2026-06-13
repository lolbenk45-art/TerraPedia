# 物品来源 family 全量处理准备报告

生成时间：2026-06-13T02:55:27.262Z

## 总览

- 剩余 family_policy_pending rows：266
- 剩余 family 数：11
- 是否全部分配处理计划：是

## 全局门禁

- 来源链：raw/wiki evidence -> family parser -> focused candidate plan -> local compat dry-run -> guarded local apply -> refreshed reports
- 写入门槛：blockedRows=0, validationErrors=0, toInsert>0 before apply; re-run dry-run to toInsert=0 after apply.
- 报告门槛：Refresh evidence/work/treatment/final status reports after each batch.
- 禁止动作：不能整页放行；不能跑 crawler/fetch/import/backfill/sync/pipeline；不能手写 SQL 改库。

## Family 处理表

| phase | family | rows | readiness | parser strategy | unmet conditions |
| ---: | --- | ---: | --- | --- | --- |
| 1 | Dragonflies | 6 | parser_ready_after_capture_contract | Capture/critter family parser: map each dragonfly item to capture source only after the source model is confirmed. | Confirm whether capture should be ordinary item source or dedicated critter projection.；Resolve dragonfly item identity to critter/capture evidence without NPC loot pollution. |
| 2 | Vases | 4 | parser_ready_after_worldgen_contract | Worldgen/container-style parser with item-specific page evidence; do not classify decorative vases by name only. | Extract item-specific vase evidence from raw page rows or narrative sections.；Separate worldgen/container evidence from decorative/craft evidence. |
| 2 | Moss | 4 | parser_ready_after_worldgen_contract | Worldgen/mining parser for moss variants with explicit biome/location wording. | Identify whether each moss item source is mining, worldgen, shimmer, or projection-only.；Avoid converting biome/location-only evidence into fake drop/shop rows. |
| 2 | Altars | 4 | parser_ready_after_mixed_worldgen_boss_contract | Mixed altar parser: split worldgen/mining, boss/event, and uncollectible evidence by item. | Determine whether each altar is obtainable as an item or only world fixture.；Split boss/event references from worldgen references. |
| 2 | Banners | 1 | parser_ready_after_enemy_identity_contract | Banner item to NPC identity parser, using explicit alias mapping when display names collide. | Resolve the remaining banner to one stable NPC identity.；Confirm it is not an explicit unobtainable enemy banner exemption. |
| 2 | Planter Boxes | 1 | parser_ready_after_shop_contract | Shop family parser with item-specific vendor and condition checks. | Resolve the exact vendor and condition for the remaining planter box.；Confirm existing shop relation is absent before writing ordinary source. |
| 2 | Shimmer Tools | 1 | parser_ready_after_mechanism_contract | Mechanism/shimmer parser: only write ordinary source when source item transform is explicit. | Confirm whether evidence is actual Shimmer acquisition or mechanism/projection-only.；Resolve source item identity if Shimmer transform is importable. |
| 2 | Unsafe Walls | 1 | parser_ready_after_worldgen_contract | Unsafe wall parser: keep natural wall/worldgen evidence distinct from safe wall crafting. | Prove the unsafe wall is obtainable as placed/generated wall evidence.；Do not infer from safe wall recipes. |
| 3 | Paintings | 97 | requires_item_matrix_parser | Large mixed matrix parser: match each painting item to a table row or section-specific evidence. | Build item-level matrix extraction for painting rows.；Split worldgen, shop, event, and special-source painting evidence.；Detect painting names that are only decorative identities without source row evidence. |
| 3 | Music Boxes | 95 | requires_item_matrix_parser | Large mixed matrix parser: split recording, shimmer, drop/event, and shop evidence per music box. | Split recording/shimmer/event/drop/shop evidence by individual music box.；Decide whether recording-only evidence should be ordinary source or dedicated music-box projection.；Resolve any event/boss source refs without text-only false positives. |
| 3 | Statues | 52 | requires_item_matrix_parser | Large mixed matrix parser: separate worldgen statues, functional statue mechanics, shop/drop, and unavailable variants. | Build item-level statue matrix matching.；Separate mechanism/function-only evidence from actual acquisition source.；Resolve statue-specific worldgen/shop/drop evidence. |

## 执行顺序

1. Phase 1：Dragonflies，先确认 capture/critter 是否走普通 source 或投影。
2. Phase 2：Vases/Moss/Altars/Banners/Planter Boxes/Shimmer Tools/Unsafe Walls，小类逐个 parser + dry-run。
3. Phase 3：Paintings/Music Boxes/Statues，大混合页必须 item-level matrix parser，不能整页放行。

