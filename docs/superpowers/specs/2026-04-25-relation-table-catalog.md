# Relation Table Catalog

generated_at: 2026-04-25T07:19:45.787Z

This catalog explains the purpose and status of each relation-side table so later tasks can reuse the right layer.
这份目录用于说明 relation 侧每张表保存的内容、当前状态，以及后续任务应该复用哪一层。

## relation_runs

- status: kept
- status_zh: 保留
- layer: system
- layer_zh: 系统层
- rows: 2
- source: sync-maint-to-relation runtime metadata
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: id, run_key
- purpose: Relation sync run ledger with scope and summary metadata.
- purpose_zh: relation 同步运行台账，记录范围、状态和汇总信息。
- notes: System table, not a gameplay fact source.
- notes_zh: 系统表，不承载游戏事实数据。

## relation_run_reports

- status: kept
- status_zh: 保留
- layer: system
- layer_zh: 系统层
- rows: 60
- source: writeRelationReports output metadata
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: id, run_key, report_kind
- purpose: Generated report index for each relation sync run.
- purpose_zh: 记录每次 relation 同步生成的审计报告索引。
- notes: System table, child of relation_runs.
- notes_zh: 系统表，是 relation_runs 的子表。

## relation_items

- status: kept
- status_zh: 保留
- layer: entity
- layer_zh: 实体层
- rows: 6146
- source: maint_items
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: record_key, source_id, internal_name
- purpose: Canonical item base entity table.
- purpose_zh: 规范化后的 item 基础实体主表。
- notes: Primary item identity layer for relation and projection; now also carries source-backed rare/value/sell raw facts.
- notes_zh: 是 relation 与 projection 的 item 身份主层，并保留 rare/value/sell 的原始事实。

## relation_npcs

- status: kept
- status_zh: 保留
- layer: entity
- layer_zh: 实体层
- rows: 762
- source: maint_npcs
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: record_key, source_id, internal_name
- purpose: Canonical NPC base entity table.
- purpose_zh: 规范化后的 NPC 基础实体主表。
- notes: Primary NPC identity layer for loot, shop, boss, and series relations.
- notes_zh: 是掉落、商店、boss、系列关系的 NPC 身份主层。

## relation_projectiles

- status: kept
- status_zh: 保留
- layer: entity
- layer_zh: 实体层
- rows: 1111
- source: maint_projectiles
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: record_key, source_id, internal_name
- purpose: Canonical projectile base entity table.
- purpose_zh: 规范化后的 projectile 基础实体主表。
- notes: Primary projectile identity layer.
- notes_zh: 是 projectile 相关关系和 projection 的基础身份层。

## relation_buffs

- status: kept
- status_zh: 保留
- layer: entity
- layer_zh: 实体层
- rows: 388
- source: maint_buffs
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: record_key, source_id, internal_name
- purpose: Canonical buff base entity table with tooltip and source-item summaries.
- purpose_zh: 规范化后的 buff 基础实体主表，并保留 tooltip 与来源物品摘要。
- notes: Current replacement readiness is best in this domain.
- notes_zh: 当前替代 local 的 readiness 在 buff 域最完整。

## relation_bosses

- status: kept
- status_zh: 保留
- layer: entity
- layer_zh: 实体层
- rows: 33
- source: maint_bosses + relation_npcs + item_npc_loot_relations
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: record_key, boss_title_en, npc_internal_name
- purpose: Boss domain table mapped onto NPC identities and progression order.
- purpose_zh: boss 领域实体表，把 boss 页面信息映射到 NPC 身份和流程顺序。
- notes: Boss identity layer above raw NPC rows.
- notes_zh: 位于原始 NPC 行之上的 boss 实体层。

## relation_item_rarities

- status: kept
- status_zh: 保留
- layer: taxonomy
- layer_zh: 分类层
- rows: 16
- source: TerraPedia support-domain rarity dictionary snapshot
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: id, record_key, code
- purpose: Item rarity support dimension with display names and sort order.
- purpose_zh: item 品质展示语义维表，承接 rarity 代码、名称与排序。
- notes: Support-domain dictionary for projection_items.rarity_id. This is not the raw source fact; item rare raw values stay on relation_items.
- notes_zh: 这是 support domain 维表，不替代 item 上的 rare 原始事实。

## relation_item_images

- status: kept
- status_zh: 保留
- layer: asset
- layer_zh: 资源层
- rows: 4001
- source: maint_item_images
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: record_key, item_internal_name, cached_url
- purpose: Item image asset table with original and cached URLs.
- purpose_zh: item 图片资源表，保存原始 URL、缓存 URL 和主图标记。
- notes: Item image coverage is still below legacy local.
- notes_zh: item 图片覆盖率仍低于 legacy local。

## relation_npc_images

- status: kept
- status_zh: 保留
- layer: asset
- layer_zh: 资源层
- rows: 758
- source: maint_npc_images
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: record_key, npc_internal_name, cached_url
- purpose: NPC image asset table with source file title and cache URL.
- purpose_zh: NPC 图片资源表，保存源文件标题与缓存 URL。
- notes: Near-complete coverage against relation_npcs.
- notes_zh: 相对 relation_npcs 已接近全覆盖。

## relation_projectile_images

- status: kept
- status_zh: 保留
- layer: asset
- layer_zh: 资源层
- rows: 1110
- source: maint_projectiles image fields
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: record_key, projectile_internal_name, cached_url
- purpose: Projectile image asset table.
- purpose_zh: projectile 图片资源表。
- notes: Used by projection_projectiles.
- notes_zh: 供 projection_projectiles 使用。

## relation_buff_images

- status: kept
- status_zh: 保留
- layer: asset
- layer_zh: 资源层
- rows: 388
- source: maint_buffs image fields
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: record_key, buff_internal_name, cached_url
- purpose: Buff image asset table.
- purpose_zh: buff 图片资源表。
- notes: Coverage matches relation_buffs.
- notes_zh: 覆盖率与 relation_buffs 对齐。

## category_nodes

- status: kept
- status_zh: 保留
- layer: taxonomy
- layer_zh: 分类层
- rows: 2175
- source: maint_categories + maint_item_categories
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: record_key, node_key
- purpose: Normalized category hierarchy nodes.
- purpose_zh: 标准化后的分类层级节点表。
- notes: Shared taxonomy layer.
- notes_zh: 是共用的分类树主层。

## item_category_assignments

- status: kept
- status_zh: 保留
- layer: relation
- layer_zh: 关系层
- rows: 1758
- source: maint_item_categories
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: record_key, item_internal_name, node_key
- purpose: Item-to-category assignment bridge.
- purpose_zh: item 到分类节点的归属桥表。
- notes: Many-to-many bridge into category_nodes.
- notes_zh: 是 item 与 category_nodes 的多对多桥接层。

## item_recipe_heads

- status: kept
- status_zh: 保留
- layer: fact
- layer_zh: 事实层
- rows: 7399
- source: maint_item_recipes + maint_item_page_recipes + maint_recipe_page_recipes
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: record_key, recipe_key
- purpose: Canonical recipe head rows, one per recipe instance.
- purpose_zh: 规范化配方头表，每条配方实例一行。
- notes: Recipe root table.
- notes_zh: 是配方域的根表。

## item_recipe_ingredients

- status: kept
- status_zh: 保留
- layer: relation
- layer_zh: 关系层
- rows: 12345
- source: item_recipe_heads derivation
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: record_key, recipe_key, ingredient_record_key
- purpose: Recipe ingredient rows, including grouped placeholders.
- purpose_zh: 配方材料表，保留显式材料与分组占位材料。
- notes: Keeps canonical grouped representation.
- notes_zh: 保留了规范化的 grouped recipe 表达。

## item_recipe_stations

- status: kept
- status_zh: 保留
- layer: relation
- layer_zh: 关系层
- rows: 10146
- source: item_recipe_heads derivation
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: record_key, recipe_key, station_record_key
- purpose: Recipe crafting-station requirement rows.
- purpose_zh: 配方制作站需求表。
- notes: Supports multi-station recipes.
- notes_zh: 支持一条配方对应多个制作站。

## item_recipe_group_expansions

- status: kept
- status_zh: 保留
- layer: expansion
- layer_zh: 展开层
- rows: 3103
- source: item_recipe_ingredients + data/generated/recipe-material-reference.json
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: record_key, recipe_key, ingredient_record_key, member_internal_name
- purpose: Expanded material-group members for recipe placeholders.
- purpose_zh: 配方材料组展开表，把占位组成员展开成可查询行。
- notes: Compatibility expansion layer; not the canonical recipe source.
- notes_zh: 这是兼容层，不是最原始的 canonical recipe source。

## item_source_facts

- status: kept
- status_zh: 保留
- layer: fact
- layer_zh: 事实层
- rows: 3187
- source: maint_item_sources
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: record_key, item_internal_name, source_type
- purpose: Canonical item source facts parsed from maint source rows.
- purpose_zh: 从 maint_item_sources 解析出的 item 来源事实主表。
- notes: Parent fact table for shop and loot relations.
- notes_zh: 是商店和掉落正式关系表的父事实层。

## item_source_details

- status: kept
- status_zh: 保留
- layer: detail
- layer_zh: 明细层
- rows: 3187
- source: maint_item_sources
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: record_key, source_fact_key
- purpose: Supporting detail rows for item source facts.
- purpose_zh: item 来源事实的补充明细表。
- notes: Not a duplicate even when row count matches item_source_facts.
- notes_zh: 即使与 item_source_facts 行数一致，也不是重复表。

## item_npc_shop_relations

- status: kept
- status_zh: 保留
- layer: fact
- layer_zh: 事实层
- rows: 293
- source: maint_item_sources -> item_source_facts
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: record_key, source_fact_key, item_internal_name, npc_internal_name
- purpose: Formal NPC shop facts with structured condition fields.
- purpose_zh: NPC 售卖关系正式表，带结构化条件字段。
- notes: Canonical NPC shop table.
- notes_zh: 这是唯一保留的 canonical NPC shop 表。

## item_npc_loot_relations

- status: kept
- status_zh: 保留
- layer: fact
- layer_zh: 事实层
- rows: 744
- source: maint_item_sources -> item_source_facts
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: record_key, source_fact_key, item_internal_name, npc_internal_name
- purpose: Formal NPC loot/drop facts with structured condition fields.
- purpose_zh: NPC 掉落关系正式表，带结构化条件字段。
- notes: Canonical NPC loot table.
- notes_zh: 这是唯一保留的 canonical NPC loot 表。

## item_buff_relations

- status: kept
- status_zh: 保留
- layer: relation
- layer_zh: 关系层
- rows: 245
- source: maint_buffs + maint_items
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: record_key, item_internal_name, buff_internal_name
- purpose: Item-to-buff application bridge.
- purpose_zh: item 与 buff 的施加关系桥表。
- notes: Secondary effect relation layer.
- notes_zh: 属于次级效果关系层。

## item_biome_relations

- status: kept
- status_zh: 保留
- layer: relation
- layer_zh: 关系层
- rows: 364
- source: maint_item_biomes
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: record_key, item_internal_name, biome_key
- purpose: Item-to-biome relation rows.
- purpose_zh: item 与 biome 的关系表。
- notes: Secondary domain relation layer.
- notes_zh: 属于次级领域关系层。

## item_projectile_audits

- status: kept
- status_zh: 保留
- layer: audit
- layer_zh: 审计层
- rows: 721
- source: maint_items + maint_projectiles + maint_item_images
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: record_key, item_internal_name, projectile_internal_name
- purpose: Crosswalk rows linking items to projectile evidence and extraction status.
- purpose_zh: item 与 projectile 证据交叉审计表，记录抽取状态。
- notes: Audit helper, not a canonical gameplay relation.
- notes_zh: 是审计辅助表，不是正式游戏事实关系。

## boss_item_reward_relations

- status: kept
- status_zh: 保留
- layer: relation
- layer_zh: 关系层
- rows: 64
- source: relation_bosses + item_npc_loot_relations
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: record_key, boss_record_key, item_internal_name
- purpose: Boss-to-item reward bridge.
- purpose_zh: boss 到奖励 item 的桥表。
- notes: Derived boss reward layer.
- notes_zh: 属于派生出来的 boss 奖励层。

## boss_effect_relations

- status: kept
- status_zh: 保留
- layer: relation
- layer_zh: 关系层
- rows: 11
- source: maint_bosses
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: record_key, boss_record_key, effect_type, target_type
- purpose: Structured boss domain effects such as progression or world-state impacts.
- purpose_zh: boss 相关结构化效果表，如流程推进或世界状态影响。
- notes: Curated structured effects from boss notes.
- notes_zh: 来自 boss 备注的结构化整理结果。

## npc_series_nodes

- status: kept
- status_zh: 保留
- layer: taxonomy
- layer_zh: 分类层
- rows: 87
- source: relation_npcs + npc domain processors
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: record_key, series_key
- purpose: NPC series or family nodes.
- purpose_zh: NPC 系列或家族节点表。
- notes: Series taxonomy root.
- notes_zh: 是系列分类树的根层。

## npc_series_memberships

- status: kept
- status_zh: 保留
- layer: relation
- layer_zh: 关系层
- rows: 323
- source: npc_series_nodes + relation_npcs
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: record_key, series_key, npc_internal_name
- purpose: NPC-to-series membership bridge.
- purpose_zh: NPC 到系列节点的成员关系桥表。
- notes: Many-to-many bridge.
- notes_zh: 是多对多桥接层。

## npc_series_item_relations

- status: kept
- status_zh: 保留
- layer: relation
- layer_zh: 关系层
- rows: 145
- source: npc_series_nodes + npc_series_memberships + NPC item relations
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: record_key, series_key, item_internal_name, relation_type
- purpose: Series-level aggregated item relations across NPC groups.
- purpose_zh: 按 NPC 系列聚合后的 item 关系表。
- notes: Derived convenience layer above per-NPC facts.
- notes_zh: 位于单个 NPC 正式关系之上的派生便利层。

## projection_items

- status: kept
- status_zh: 保留
- layer: projection
- layer_zh: 投影视图层
- rows: 6146
- source: relation_items + relation_item_images
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: id, internal_name, relation_record_key
- purpose: Local-compatible item projection derived from relation.
- purpose_zh: 由 relation 派生出的 local 兼容 item 投影视图表。
- notes: Derived compatibility table, not a raw fact layer.
- notes_zh: 是兼容层，不是原始事实层。

## projection_npcs

- status: kept
- status_zh: 保留
- layer: projection
- layer_zh: 投影视图层
- rows: 762
- source: relation_npcs + relation_npc_images
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: id, internal_name, relation_record_key
- purpose: Local-compatible NPC projection derived from relation.
- purpose_zh: 由 relation 派生出的 local 兼容 NPC 投影视图表。
- notes: Derived compatibility table; replacement still blocked by coverage gaps.
- notes_zh: 是兼容层，但当前仍受字段覆盖缺口阻塞。

## projection_projectiles

- status: kept
- status_zh: 保留
- layer: projection
- layer_zh: 投影视图层
- rows: 1111
- source: relation_projectiles + relation_projectile_images
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: id, internal_name, relation_record_key
- purpose: Local-compatible projectile projection derived from relation.
- purpose_zh: 由 relation 派生出的 local 兼容 projectile 投影视图表。
- notes: Derived compatibility table; replacement still blocked by field gaps.
- notes_zh: 是兼容层，但当前仍受字段覆盖缺口阻塞。

## projection_buffs

- status: kept
- status_zh: 保留
- layer: projection
- layer_zh: 投影视图层
- rows: 388
- source: relation_buffs + relation_buff_images
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: id, internal_name, relation_record_key
- purpose: Local-compatible buff projection derived from relation.
- purpose_zh: 由 relation 派生出的 local 兼容 buff 投影视图表。
- notes: Derived compatibility table; current readiness report marks this domain switchable.
- notes_zh: 是兼容层，当前 readiness 报告认为这一域已可切换。

## item_npc_shop_candidates

- status: removed
- status_zh: 已移除
- layer: deprecated
- layer_zh: 废弃层
- rows: 0
- source: maint_item_sources
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: record_key, source_fact_key, item_internal_name, npc_internal_name
- purpose: Legacy candidate mirror of NPC shop relations.
- purpose_zh: 旧版 NPC 售卖候选镜像表。
- notes: Removed because it duplicated the formal shop relation with lower-signal semantics.
- notes_zh: 因与正式 shop relation 重复且语义更弱，已移除。

## item_npc_loot_candidates

- status: removed
- status_zh: 已移除
- layer: deprecated
- layer_zh: 废弃层
- rows: 0
- source: maint_item_sources
- source_zh: 来源链保留原始英文表名，避免数据链歧义。
- primary_keys: record_key, source_fact_key, item_internal_name, npc_internal_name
- purpose: Legacy candidate mirror of NPC loot relations.
- purpose_zh: 旧版 NPC 掉落候选镜像表。
- notes: Removed because it duplicated the formal loot relation with lower-signal semantics.
- notes_zh: 因与正式 loot relation 重复且语义更弱，已移除。
