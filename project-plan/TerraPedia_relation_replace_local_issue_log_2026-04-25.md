# TerraPedia Relation Replace Local Issue Log

日期：2026-04-25

用途：

- 长任务执行期间统一记录问题、阻塞、待拍板项、上游缺陷
- 按用户要求，执行过程中不再反复询问
- 任何需要反馈给用户的事项先写入这里

规则：

- 不写无证据推断
- 每条问题尽量带证据
- 能继续执行的不阻塞
- 真正阻塞里程碑推进的问题单独标记 `BLOCKER`

---

## Open Items

### [INFO] 2026-04-26 04:42 - item stack_size gap confirmed as upstream coverage gap, not maint normalization loss

- Domain: item-attribute-modeling
- Status: open
- Impact: `stack_size` remains a blocker for `projection_items`, but further work should focus on upstream source expansion rather than another maint zero-normalization pass.
- Evidence:
  - `reports/relation/item-cutover-baseline-2026-04-26.json`
  - `reports/relation/item-cutover-zero-safe-postapply-2026-04-26.json`
  - `stackSize.rawPresent = 13 / 6146`
  - `stackSize.normalizedPresent = 13 / 6146`
  - zero-safe item maint resync changed `damage.rawOnlyCount 124 -> 0`
  - zero-safe item maint resync changed `useTime.rawOnlyCount 27 -> 0`
- Decision needed: none
- Temporary handling: keep `stack_size` in the item blocker list; audit upstream item-module payload shape and alternate item-page or standardized sources before changing maint normalization again.

### [INFO] 2026-04-25 21:00 - M1 实体总量已对齐但中文字段缺口仍大

- Domain: entity-foundation
- Status: open
- Impact: relation 还不能承接 local-compatible projection 的中文字段需求
- Evidence:
  - `reports/relation/entity-coverage-baseline-2026-04-25.json`
  - `items.nameZh gap = 6134`
  - `npcs.nameZh gap = 757`
  - `npcs.subNameZh gap = 206`
  - `projectiles.nameZh gap = 1006`
- Decision needed: none
- Temporary handling: 继续按里程碑在 M1 后半段优先处理中文来源链与字段补齐策略

### [INFO] 2026-04-25 21:00 - relation item 主图覆盖低于 local

- Domain: entity-foundation
- Status: open
- Impact: item projection 层如果现在切换，会有大量主图缺口
- Evidence:
  - `reports/relation/entity-coverage-baseline-2026-04-25.json`
  - `local.items.image = 6131`
  - `relation item image coverage = 2119`
  - `gap = 4012`
- Decision needed: none
- Temporary handling: 后续单列 item 主图策略与缺图审计，不以当前 `relation_item_images` 直接视为替代完成

### [INFO] 2026-04-25 23:10 - M2 recipe group expansion 已落地，但条件结构化仍受上游文本稀疏限制

- Domain: core-item-relations
- Status: open
- Impact: recipe 的替代材料枚举已经可查，但 NPC shop/loot 的结构化条件推进会慢于正式关系表落地
- Evidence:
  - `item_recipe_group_expansions = 3103`
  - `MechanicalEye -> Any Iron Bar -> IronBar / LeadBar`
  - `maint_item_sources.raw_json LIKE '%conditions%' = 298`
  - 当前 `item_npc_shop_relations` 与 `item_npc_loot_relations` 的已解析正式样例里，conditions 基本为空
- Decision needed: none
- Temporary handling: 先保留正式 shop/loot relation 与原始 trace，条件结构化继续只基于明确出现的 `raw_json.conditions` 文本推进，不做猜测

---

### [INFO] 2026-04-25 23:55 - M2 formal shop relation 去重并修正条件解析口径

- Domain: core-item-relations
- Status: open
- Impact: `item_npc_shop_relations` 已从 495 行去重到 293 行，同一 `item+npc` 的 plain row / note row 不再同时留在 formal relation
- Evidence:
  - `item_npc_shop_relations = 293`
  - `item_npc_shop_candidates = 293`
  - `shop duplicate_keys = 0`
  - `Acorn -> Dryad` 不再把 item 描述里的 `crimson` 误视为售卖条件
  - `AmmoBox -> ArmsDealer` 解析出 `hardmode`
  - `ArtisanLoaf -> SkeletonMerchant` 解析出 `new_moon / waning_crescent / waxing_crescent`
  - `ClusterRocketII -> Cyborg` 解析出 `blood_moon / solar_eclipse / martian_madness_completed`
- Decision needed: none
- Temporary handling: `shop` 端 `biome_code` 暂不作为独立售卖条件信号，只接受文本明确提及或后续上游结构化字段

### [INFO] 2026-04-25 23:55 - M2 loot 条件口径收严为 source-backed

- Domain: core-item-relations
- Status: open
- Impact: `loot` 端不再把纯 `33.3%` 这类掉率文本误视为条件源，仅当 chance text 含有明确条件词时才尝试结构化
- Evidence:
  - `item_npc_loot_relations = 744`
  - `condition_parse_status=no_condition_text -> 480`
  - `condition_parse_status=unparsed -> 154`
  - `condition_parse_status=source_fields_only -> 110`
  - `AntlionMandible -> Antlion` 现在为 `source_fields_only + desert`，不再把 `33.3%` 写入 `condition_source_text`
- Decision needed: none
- Temporary handling: 继续把 `loot` 条件结构化定义为“只接受明确条件文本或上游结构字段”，暂不从 drop chance text 推断环境条件

### [INFO] 2026-04-26 00:05 - M3 boss/npc series relation 已落地但仍有保守缺口

- Domain: boss-npc-series
- Status: open
- Impact: `relation_bosses / boss_item_reward_relations / boss_effect_relations / npc_series_*` 已完成首版建模，可支撑 boss 奖励、boss 特殊效果、NPC 同名变体聚合查询
- Evidence:
  - `relation_bosses = 33`
  - `boss_item_reward_relations = 64`
  - `boss_effect_relations = 11`
  - `npc_series_nodes = 87`
  - `npc_series_memberships = 323`
  - `npc_series_item_relations = 145`
  - `boss npc_match_status: resolved=31, unresolved=2`
  - unresolved boss sample: `The Twins`, `Mechdusa`
- Decision needed: none
- Temporary handling: boss 与 npc 的映射目前只接受英文名精确匹配或自然多段体同名聚合，不对 `The Twins -> Retinazer/Spazmatism`、`Mechdusa` 这类组合 boss 做推断映射

### [INFO] 2026-04-26 00:05 - maint/relation 跨库字符集不一致会阻塞 SQL 直接 join

- Domain: boss-npc-series
- Status: open
- Impact: `maint_bosses.title_en` 与 `relation_npcs.english_name` 在 MySQL 层直接 join 会触发 collation error，当前 M3 映射改在 Node 侧完成
- Evidence:
  - error: `Illegal mix of collations (utf8mb4_unicode_ci,IMPLICIT) and (utf8mb4_0900_ai_ci,IMPLICIT)`
  - 受影响场景: `maint_bosses` directly join `relation_npcs`
- Decision needed: none
- Temporary handling: 在 projection/audit 之前继续使用脚本侧映射；如后续需要数据库内视图/SQL 对比，再单独处理 collation 对齐

### [INFO] 2026-04-26 00:05 - boss reward 覆盖受 upstream item source 稀疏度限制

- Domain: boss-npc-series
- Status: open
- Impact: 某些 boss 已匹配到 npc，但 formal reward 仍为 0，说明当前 `maint_item_sources -> item_npc_loot_relations` 并未完整覆盖其掉落
- Evidence:
  - sample zero-reward bosses: `Brain of Cthulhu`, `Deerclops`, `Duke Fishron`, `Eye of Cthulhu`, `Golem`, `King Slime`
  - 当前 `boss_item_reward_relations` 更适合作为“已证实奖励集”，不是完整 boss 掉落总表
- Decision needed: none
- Temporary handling: 保持 `boss_item_reward_relations` 只写已证实奖励，不补猜测掉落；缺口交给后续 replacement readiness audit 明示

### [INFO] 2026-04-26 00:12 - M4 projection layer 已落地到 relation

- Domain: projection-layer
- Status: open
- Impact: `projection_items / projection_npcs / projection_projectiles / projection_buffs` 已 materialize 到 `terria_v1_relation`，可以作为 local-compatible 查询层的首版替代口径
- Evidence:
  - `projection_items = 6146`
  - `projection_npcs = 762`
  - `projection_projectiles = 1111`
  - `projection_buffs = 388`
  - sample: `projection_items.IronPickaxe` 已带 `slug/image/damage/knockback/buy`
  - sample: `projection_npcs.BigHornetStingy` 已带 `game_id/source_id/is_boss/is_friendly/is_town_npc/net_id/npc_type/ai_style`
- Decision needed: none
- Temporary handling: projection 目前采取“local 字段优先 + relation 可证字段填充 + 无证据字段留空”的保守策略

### [INFO] 2026-04-26 00:12 - M5 replacement readiness audit 已完成

- Domain: replacement-readiness
- Status: open
- Impact: 当前只 `buffs` 达到可切换，`items / npcs / projectiles` 仍 blocked
- Evidence:
  - report: `reports/relation/replacement-readiness-2026-04-25.json`
  - report: `reports/relation/replacement-readiness-2026-04-25.md`
  - `switchableDomains = buffs`
  - `blockedDomains = items, npcs, projectiles`
  - `items` 阻塞主因: `name_zh / image / damage / defense / knockback / sell / stack_size`
  - `npcs` 阻塞主因: `name_zh / sub_name_zh`
  - `projectiles` 阻塞主因: `name_zh / friendly / hostile / tile_collide`
- Decision needed: none
- Temporary handling: 若要真正 cutover，下一轮优先补中文链路、item 主图覆盖、以及 projectile flag 的 raw-json 取值口径

## Template

```text
### [LEVEL] YYYY-MM-DD HH:mm - 标题

- Domain:
- Status:
- Impact:
- Evidence:
- Decision needed:
- Temporary handling:
```
### [INFO] 2026-04-25 10:31 - relation duplicate candidate tables removed and catalog added

- Domain: relation-hygiene
- Status: closed
- Impact: `item_npc_shop_candidates` and `item_npc_loot_candidates` no longer remain in `terria_v1_relation`; downstream reuse should target the formal `item_npc_*_relations` tables and the new table catalog doc.
- Evidence:
  - `information_schema.tables` query on `terria_v1_relation` returns no rows for `item_npc_shop_candidates` or `item_npc_loot_candidates`
  - relation sync now runs `DROP TABLE IF EXISTS terria_v1_relation.item_npc_shop_candidates`
  - relation sync now runs `DROP TABLE IF EXISTS terria_v1_relation.item_npc_loot_candidates`
  - catalog doc: `docs/superpowers/specs/2026-04-25-relation-table-catalog.md`
- Decision needed: none
- Temporary handling: future relation reuse should treat `item_npc_shop_relations` and `item_npc_loot_relations` as the only canonical NPC commerce and loot tables; `projection_*` remains a derived compatibility layer rather than a fact source.
### [INFO] 2026-04-25 14:29 - item attribute storage decisions landed in relation

- Domain: item-attribute-modeling
- Status: closed
- Impact: `relation_items` now carries source-backed `rare_raw` and `value_raw`; `relation_item_rarities` is materialized as a support-domain dictionary; `projection_items.rarity_id` now maps from relation-side rarity facts rather than staying empty.
- Evidence:
  - `relation_item_rarities = 16`
  - `relation_items.rare_raw IS NOT NULL = 2893`
  - `relation_items.value_raw IS NOT NULL = 5267`
  - `projection_items.rarity_id IS NOT NULL = 2893`
  - `projection_items.buy IS NOT NULL = 5267`
  - `projection_items.sell IS NOT NULL = 0`
- Decision needed: none
- Temporary handling: rarity display semantics are treated as a support-domain dictionary, while raw rarity facts remain on `relation_items`.

### [INFO] 2026-04-25 14:29 - item tooltip/description/sell still blocked by missing upstream facts

- Domain: item-attribute-modeling
- Status: open
- Impact: `projection_items` still cannot replace `local.items` on these fields because source-backed item-level facts are missing or intentionally withheld.
- Evidence:
  - `maint_items.raw_json LIKE '%tooltip%' = 0`
  - `maint_items.raw_json LIKE '%description%' = 0`
  - `maint_items.raw_json LIKE '%localized%' = 0`
  - readiness report: `items.blocking fields` still includes `sell`, `tooltip_zh`, and multiple other fields
  - readiness report: `rarity_id(gap=3242)` because only source-backed `rare` rows were projected
- Decision needed: none
- Temporary handling: keep `sell` null until a formal source or approved derived rule exists; keep item tooltip/description fields empty until source-backed item-level text is available; unresolved gaps remain in readiness reports instead of being guessed.
