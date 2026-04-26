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

### [INFO] 2026-04-26 16:09 - local core tables have now been materially replaced with relation/projection data after fresh backup

- Domain: runtime-cutover
- Status: open
- Impact: `terria_v1_local.items/npcs/projectiles/buffs` remain `BASE TABLE`, but their old data snapshot has been replaced in-place from `terria_v1_relation` compat views, so the local runtime now reads three-layer-sourced core data without changing the backend datasource.
- Evidence:
  - backup report: `reports/relation/local-cutover-backup-20260426_160000.json`
  - materialization report: `reports/relation/local-core-materialization-2026-04-26.json`
  - smoke check: `reports/relation/local-compat-smoke-check-2026-04-26.json`
  - readiness report: `reports/relation/replacement-readiness-2026-04-26.json`
  - `local.items 6134 -> 6146`
  - `local.items.description_zh = 6`
  - `local.items.tooltip_zh = 6`
  - `local.items.image = 6131`
  - `switchableDomains = items, npcs, projectiles, buffs`
- Decision needed: none
- Temporary handling: treat `items_backup_20260426_160000 / npcs_backup_20260426_160000 / projectiles_backup_20260426_160000 / buffs_backup_20260426_160000` as the immediate rollback anchors; future core refreshes should continue through `maint -> relation -> projection -> local materialization`, not direct local edits.

### [INFO] 2026-04-26 16:09 - legacy script surface still contains direct local-core writers

- Domain: write-path-hardening
- Status: open
- Impact: source-of-truth replacement is complete for the current runtime snapshot, but multiple legacy import/backfill/sync scripts still contain direct DML against `items/npcs/projectiles/buffs`, so ad-hoc reruns can reintroduce drift if not retired or guarded.
- Evidence:
  - `rg -n "INSERT INTO|UPDATE|DELETE FROM" scripts/data/import scripts/data/sync scripts/data/backfill`
  - examples:
    - `scripts/data/import/import-standardized-to-db.mjs`
    - `scripts/data/import/import-independent-entities-to-db.mjs`
    - `scripts/data/import/import-buffs-to-db.mjs`
    - `scripts/data/import/import-wiki-town-npcs-to-db.mjs`
    - `scripts/data/sync/sync-standardized-entities-to-db.mjs`
    - `scripts/data/backfill/backfill-missing-item-images.mjs`
- Decision needed: none
- Temporary handling: current runtime data is already replaced, but these scripts should be treated as legacy/manual tools and not used as routine refresh paths until an explicit write-path hardening pass is completed.

### [INFO] 2026-04-26 15:39 - runtime state differs from the earlier cutover assumption: local core tables are still base tables

- Domain: runtime-cutover
- Status: open
- Impact: the repository has relation-side compatibility views ready, but the actual runtime still reads `terria_v1_local` base tables by default; local replacement is therefore a planned migration step, not the current production reality.
- Evidence:
  - `information_schema.tables`
  - `terria_v1_local.items/npcs/projectiles/buffs = BASE TABLE`
  - `terria_v1_relation.items/npcs/projectiles/buffs = VIEW`
  - `SHOW CREATE TABLE terria_v1_local.items`
  - `SHOW CREATE TABLE terria_v1_relation.items`
- Decision needed: none
- Temporary handling: treat current work as “build and verify three-layer source truth first, then migrate runtime consumers later”; do not assume local core tables are already relation-backed during audits or execution planning.

### [INFO] 2026-04-26 15:08 - refreshed M1 baseline narrows active field gaps to item image plus item text sources

- Domain: source-governance
- Status: open
- Impact: fresh M1 baselines show the current three-layer migration is materially better than the 2026-04-25 snapshot; the main remaining source gaps are now concentrated in item images and item description / tooltip sourcing, not projectile flags or npc sub names.
- Evidence:
  - `reports/relation/entity-coverage-baseline-2026-04-26.json`
  - `reports/relation/item-cutover-baseline-2026-04-26.json`
  - `reports/relation/core-field-source-matrix-2026-04-26.json`
  - `items.image gap = 3868`
  - `items.nameZh gap = 3`
  - `items.descriptionZh gap = 6`
  - `items.tooltipZh relation gap = 6`
  - `npcs.subNameZh gap = 0` after fixing `scripts/data/relation/entity-coverage-baseline.mjs`
  - `projectiles.nameZh gap = 0`
  - `stackSize.normalizedPresent = 6131 / 6146`
  - `tooltip raw present = 0 / 6146`
  - `description raw present = 0 / 6146`
- Decision needed: none
- Temporary handling: treat `items.image` as the primary M2 blocker, treat `items.tooltip_zh` as an explicit local bridge rather than a missing field, and treat English `tooltip/description` plus `description_zh` as true upstream modeling gaps until new maint-backed sources exist.

### [INFO] 2026-04-26 14:40 - M1 source matrix confirms two live local bridges remain in the core item pipeline

- Domain: source-governance
- Status: open
- Impact: the three-layer source chain is now explicit, but `items.tooltip_zh` and `items.image` still depend on legacy-local bridge logic, so `local` cannot fully retire yet.
- Evidence:
  - `reports/relation/core-field-source-matrix-2026-04-26.json`
  - `scripts/data/maint/sync-local-item-tooltip-zh-to-maint.mjs`
  - `scripts/data/relation/sync-maint-to-relation.mjs::reconcileProjectionItemImageFromLocal`
  - `localBridgeFieldCount = 2`
  - bridge fields: `items.tooltip_zh`, `items.image`
- Decision needed: none
- Temporary handling: keep both bridges explicit in reports and code comments, forbid adding new `local -> maint` or `local -> projection` shortcuts outside the current recorded bridge list, and prioritize removing `reconcileProjectionItemImageFromLocal` in M2 after image-source coverage is raised.

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

### [INFO] 2026-04-26 11:52 - item row-set parity exceptions accepted for current cutover

- Domain: replacement-readiness
- Status: open
- Impact: the remaining 13 item row-set mismatches are now recorded as accepted exceptions for the current `relation -> local` replacement track and should not block field-complete cutover work.
- Evidence:
  - latest readiness report: `reports/relation/replacement-readiness-2026-04-26.json`
  - `items.blockingFields = []`
  - `missingInProjection = 3`
    - `ZH_RECIPE_BLUE_JELLYFISH_BAIT`
    - `ZH_RECIPE_GREEN_JELLYFISH_BAIT`
    - `ZH_RECIPE_PINK_JELLYFISH_BAIT`
  - `extraInProjection = 10`
    - `Fake_newchest1`
    - `Fake_newchest2`
    - `OgreMask`
    - `GoblinMask`
    - `GoblinBomberCap`
    - `EtherianJavelin`
    - `KoboldDynamiteBackpack`
    - `BoringBow`
    - `BossBagOgre`
    - `BossBagDarkMage`
- Decision needed: none for the current milestone track
- Temporary handling:
  - treat the 3 missing rows as accepted local-only legacy exceptions
  - treat the 10 extra rows as accepted weak-source projection exceptions
  - do not let these 13 rows block current cutover planning or field-completeness acceptance

### [INFO] 2026-04-26 13:12 - item row-set exception count corrected after full compat-table audit

- Domain: replacement-readiness
- Status: open
- Impact: the earlier `extraInProjection = 10` reading came from the readiness report sample limit, not the full set; the actual effective-cutover exception list for `items` is `3 missing + 15 extra`.
- Evidence:
  - `reports/relation/item-row-set-audit-2026-04-26.json`
  - `strictStatus = blocked`
  - `effectiveStatus = switchable_with_exceptions`
  - `missingCount = 3`
  - `extraCount = 15`
  - additional extra rows beyond the previous sampled 10:
    - `ColorOnlyDye`
    - `FirstFractal`
    - `FoxparksTagEffect`
    - `ManaCloakStar`
    - `SleepingIcon`
- Decision needed: none for the current execution track
- Temporary handling:
  - replace the earlier shorthand “13 exceptions” with the audited full set “18 exceptions”
  - continue treating these rows as accepted exceptions for effective cutover only

### [INFO] 2026-04-26 13:12 - current item image parity still depends heavily on local fallback

- Domain: replacement-readiness
- Status: open
- Impact: current `items` compatibility is operationally usable, but the majority of image parity still depends on `local.items.image` rather than `maint_item_images`.
- Evidence:
  - `reports/relation/item-image-fallback-audit-2026-04-26.json`
  - `maintBackedImageCount = 2263`
  - `localFallbackOnlyImageCount = 3868`
  - `stillMissingImageCount = 15`
- Decision needed: none for the current execution track
- Temporary handling:
  - allow current local image fallback to remain in place for effective cutover
  - keep maint-only image parity as a later cleanup goal rather than a current blocker
