# Relation 替换 Local 涉及表清单

**日期：** 2026-04-26

**用途：** 汇总这次“`relation` 替换 `local`”实际涉及的数据库表，明确哪些是直接替换对象，哪些是 `relation` 兼容层，哪些是 `relation` 支撑层，哪些是 `maint` 上游来源表，哪些是运行/审计辅助表。

---

## 1. 直接替换对象

这 4 张 `local` 表是当前 readiness 直接对比、最终要被替换的目标表。

### `terria_v1_local.items`

- 替换目标：`terria_v1_relation.projection_items`
- 当前状态：
  - 字段阻塞已清零
  - 仍有 `3 missing + 10 extra` 的行集合差异

### `terria_v1_local.npcs`

- 替换目标：`terria_v1_relation.projection_npcs`
- 当前状态：已 switchable

### `terria_v1_local.projectiles`

- 替换目标：`terria_v1_relation.projection_projectiles`
- 当前状态：已 switchable

### `terria_v1_local.buffs`

- 替换目标：`terria_v1_relation.projection_buffs`
- 当前状态：已 switchable

---

## 2. relation 直接兼容层

这 4 张是 local-compatible 投影层。真正切换读路径时，最直接会切到它们。

### `terria_v1_relation.projection_items`

- 角色：`local.items` 兼容层
- 直接来源：
  - `relation_items`
  - `relation_item_images`
  - `relation_item_rarities`
  - relation reconcile
- 当前特殊点：
  - 仍包含窄范围 `local.items.image` fallback

### `terria_v1_relation.projection_npcs`

- 角色：`local.npcs` 兼容层
- 直接来源：
  - `relation_npcs`
  - `relation_npc_images`

### `terria_v1_relation.projection_projectiles`

- 角色：`local.projectiles` 兼容层
- 直接来源：
  - `relation_projectiles`
  - `relation_projectile_images`

### `terria_v1_relation.projection_buffs`

- 角色：`local.buffs` 兼容层
- 直接来源：
  - `relation_buffs`
  - `relation_buff_images`

---

## 3. relation 实体与支撑层

这些表不是最终对外直接替换 `local` 的读口，但它们决定 `projection_*` 是否可信、可追溯、可维护。

### 3.1 实体主表

- `terria_v1_relation.relation_items`
- `terria_v1_relation.relation_npcs`
- `terria_v1_relation.relation_projectiles`
- `terria_v1_relation.relation_buffs`
- `terria_v1_relation.relation_bosses`

用途：

- 承载规范化后的实体基础事实
- 是 projection 的主事实来源

### 3.2 图片与字典支撑表

- `terria_v1_relation.relation_item_images`
- `terria_v1_relation.relation_npc_images`
- `terria_v1_relation.relation_projectile_images`
- `terria_v1_relation.relation_buff_images`
- `terria_v1_relation.relation_item_rarities`

用途：

- 支撑图片、rarity、投影补全

### 3.3 item 关系域表

- `terria_v1_relation.item_recipe_heads`
- `terria_v1_relation.item_recipe_ingredients`
- `terria_v1_relation.item_recipe_stations`
- `terria_v1_relation.item_recipe_group_expansions`
- `terria_v1_relation.item_source_facts`
- `terria_v1_relation.item_source_details`
- `terria_v1_relation.item_npc_shop_relations`
- `terria_v1_relation.item_npc_loot_relations`
- `terria_v1_relation.item_buff_relations`
- `terria_v1_relation.item_biome_relations`
- `terria_v1_relation.item_projectile_audits`

用途：

- 支撑 item 的关系域能力
- 决定 relation 是否只是“字段兼容”，还是完整业务数据域

### 3.4 boss / series 扩展关系表

- `terria_v1_relation.boss_item_reward_relations`
- `terria_v1_relation.boss_effect_relations`
- `terria_v1_relation.npc_series_nodes`
- `terria_v1_relation.npc_series_memberships`
- `terria_v1_relation.npc_series_item_relations`

用途：

- 这些更偏扩展业务域
- 不一定全部进入当前最小替换闭环，但属于长期替换范围

---

## 4. maint 上游来源表

这些表不是替换对象，但只要还坚持“`maint` 是正式上游事实源”，它们就是本次替换链上的上游输入。

### 4.1 maint 实体主表

- `terria_v1_maint.maint_items`
- `terria_v1_maint.maint_npcs`
- `terria_v1_maint.maint_projectiles`
- `terria_v1_maint.maint_buffs`
- `terria_v1_maint.maint_bosses`

### 4.2 maint 页面与图片表

- `terria_v1_maint.maint_item_images`
- `terria_v1_maint.maint_npc_images`
- `terria_v1_maint.maint_item_pages`

### 4.3 maint item 关系来源表

- `terria_v1_maint.maint_item_page_recipes`
- `terria_v1_maint.maint_recipe_page_recipes`
- `terria_v1_maint.maint_item_recipes`
- `terria_v1_maint.maint_item_sources`
- `terria_v1_maint.maint_item_biomes`

### 4.4 maint item override 表

- `terria_v1_maint.maint_item_rarity_overrides`
- `terria_v1_maint.maint_item_numeric_overrides`
- `terria_v1_maint.maint_item_text_overrides`

用途：

- 这些是本轮 item cutover 收口中新增或明确纳入的 maint-backed 覆盖链
- 已经成为 relation 构建过程的一部分

---

## 5. 运行与审计辅助表

这些表不属于最终替换目标，但属于这次替换工程中不可忽略的系统层。

### relation 运行元数据

- `terria_v1_relation.relation_runs`
- `terria_v1_relation.relation_run_reports`

用途：

- 记录 relation 同步运行和报告索引

### readiness 直接比较口径

当前 readiness 直接比较的是：

- `terria_v1_local.items`
- `terria_v1_local.npcs`
- `terria_v1_local.projectiles`
- `terria_v1_local.buffs`
- `terria_v1_relation.projection_items`
- `terria_v1_relation.projection_npcs`
- `terria_v1_relation.projection_projectiles`
- `terria_v1_relation.projection_buffs`

---

## 6. 最小闭环表范围

如果只看“当前最小可执行的 relation 替换 local 闭环”，最小范围是下面这些表：

### 6.1 直接替换对位

- `local.items`
- `local.npcs`
- `local.projectiles`
- `local.buffs`
- `relation.projection_items`
- `relation.projection_npcs`
- `relation.projection_projectiles`
- `relation.projection_buffs`

### 6.2 relation 主支撑

- `relation.relation_items`
- `relation.relation_npcs`
- `relation.relation_projectiles`
- `relation.relation_buffs`
- `relation.relation_item_images`
- `relation.relation_npc_images`
- `relation.relation_projectile_images`
- `relation.relation_buff_images`
- `relation.relation_item_rarities`

### 6.3 maint 主支撑

- `maint.maint_items`
- `maint.maint_npcs`
- `maint.maint_projectiles`
- `maint.maint_buffs`
- `maint.maint_item_images`
- `maint.maint_npc_images`
- `maint.maint_item_pages`
- `maint.maint_item_rarity_overrides`
- `maint.maint_item_numeric_overrides`
- `maint.maint_item_text_overrides`

---

## 7. 扩展但未必纳入当前最小切换的表

如果这次替换先只定义为“业务读层替换”，下面这些表虽然重要，但不一定都进入当前最小里程碑主线：

- `item_recipe_heads`
- `item_recipe_ingredients`
- `item_recipe_stations`
- `item_recipe_group_expansions`
- `item_source_facts`
- `item_source_details`
- `item_npc_shop_relations`
- `item_npc_loot_relations`
- `item_buff_relations`
- `item_biome_relations`
- `relation_bosses`
- `boss_item_reward_relations`
- `boss_effect_relations`
- `npc_series_nodes`
- `npc_series_memberships`
- `npc_series_item_relations`

这些更偏：

- 关系域完备性
- 长期业务能力迁移
- 不一定等同于“当前切换 local 主表”

---

## 8. 一句话总结

如果只用一句话概括：

> **这次 relation 替换 local，最直接替的是 `local.{items,npcs,projectiles,buffs}` 到 `relation.projection_{items,npcs,projectiles,buffs}`，而真正支撑这次替换的底层表，则包括 relation 的实体/图片/字典支撑层，以及 maint 的实体、页面、图片和 item override 上游表。**
