# Relation 替换 Local 涉及表汇总

**日期：** 2026-04-26

**用途：** 统一列出这次 `relation 替换 local` 任务中真正涉及的表，明确哪些是直接替换目标、哪些是 relation 投影层、哪些是 relation 事实支撑层、哪些是 maint 上游事实表、哪些只是系统/审计辅助表。

---

## 一、直接替换目标表

这 4 张是当前 `replacement-readiness-audit` 明确纳入对比的 `local` 业务表，也是“relation 替换 local”最直接的目标。

### `terria_v1_local.items`

- 对应替换目标：`terria_v1_relation.projection_items`
- 当前状态：
  - 字段层面已无 blocker
  - 行集合仍有 `3 missing + 10 extra`

### `terria_v1_local.npcs`

- 对应替换目标：`terria_v1_relation.projection_npcs`
- 当前状态：已 switchable

### `terria_v1_local.projectiles`

- 对应替换目标：`terria_v1_relation.projection_projectiles`
- 当前状态：已 switchable

### `terria_v1_local.buffs`

- 对应替换目标：`terria_v1_relation.projection_buffs`
- 当前状态：已 switchable

---

## 二、relation 直接替换层（Projection 层）

这 4 张是 local-compatible 输出层。真正“替换 local”时，最直接会切到它们。

### `terria_v1_relation.projection_items`

- 角色：`local.items` 的兼容投影表
- 主要来源：
  - `relation_items`
  - `relation_item_images`
  - `relation_item_rarities`
  - relation 同步末端 reconcile
  - 当前还带窄范围 `local.items.image` fallback

### `terria_v1_relation.projection_npcs`

- 角色：`local.npcs` 的兼容投影表
- 主要来源：
  - `relation_npcs`
  - `relation_npc_images`

### `terria_v1_relation.projection_projectiles`

- 角色：`local.projectiles` 的兼容投影表
- 主要来源：
  - `relation_projectiles`
  - `relation_projectile_images`

### `terria_v1_relation.projection_buffs`

- 角色：`local.buffs` 的兼容投影表
- 主要来源：
  - `relation_buffs`
  - `relation_buff_images`

---

## 三、relation 事实与关系支撑层

这部分不是直接替换 `local` 给业务读的表，但它们决定了 projection 是否可信、是否稳定、是否可审计。

### 1. relation 实体主表

- `terria_v1_relation.relation_items`
- `terria_v1_relation.relation_npcs`
- `terria_v1_relation.relation_projectiles`
- `terria_v1_relation.relation_buffs`
- `terria_v1_relation.relation_bosses`

用途：

- 承载规范化后的实体基础事实
- 为 projection 提供稳定主键、基础字段、trace 来源

### 2. relation 图片与字典支撑表

- `terria_v1_relation.relation_item_images`
- `terria_v1_relation.relation_npc_images`
- `terria_v1_relation.relation_projectile_images`
- `terria_v1_relation.relation_buff_images`
- `terria_v1_relation.relation_item_rarities`

用途：

- 为 projection 补图片、rarity 等支撑维度

### 3. item 核心关系表

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

- 承载 item 的正式关系层
- 决定 relation 是否不只是“字段兼容”，而是真正可替代 `local` 的可维护数据域

### 4. boss / series 派生关系表

- `terria_v1_relation.boss_item_reward_relations`
- `terria_v1_relation.boss_effect_relations`
- `terria_v1_relation.npc_series_nodes`
- `terria_v1_relation.npc_series_memberships`
- `terria_v1_relation.npc_series_item_relations`

用途：

- 承载 boss / NPC 系列域的派生关系
- 不是所有 local 替换路径当前都直接依赖，但属于 relation 作为长期业务域的一部分

---

## 四、maint 上游事实表

这些表不是替换目标，但它们是当前 relation 的事实来源。只要还坚持“maint 是唯一正式上游”，这些表就都属于本次替换任务的上游范围。

### 1. maint 实体主表

- `terria_v1_maint.maint_items`
- `terria_v1_maint.maint_npcs`
- `terria_v1_maint.maint_projectiles`
- `terria_v1_maint.maint_buffs`
- `terria_v1_maint.maint_bosses`

### 2. maint 图片与页面表

- `terria_v1_maint.maint_item_images`
- `terria_v1_maint.maint_npc_images`
- `terria_v1_maint.maint_item_pages`

### 3. maint item 关系来源表

- `terria_v1_maint.maint_item_page_recipes`
- `terria_v1_maint.maint_recipe_page_recipes`
- `terria_v1_maint.maint_item_recipes`
- `terria_v1_maint.maint_item_sources`
- `terria_v1_maint.maint_item_biomes`

### 4. maint item override 表

- `terria_v1_maint.maint_item_rarity_overrides`
- `terria_v1_maint.maint_item_numeric_overrides`
- `terria_v1_maint.maint_item_text_overrides`

用途：

- 这些表是当前 item cutover 收口中补出来的 maint-backed 覆盖链
- 它们已经成为 relation 构建的一部分

---

## 五、系统 / 同步 / 审计辅助表

这些表不属于最终业务替换目标，但属于这次替换工程中不可忽略的辅助层。

### relation 系统表

- `terria_v1_relation.relation_runs`
- `terria_v1_relation.relation_run_reports`

用途：

- 记录 relation 同步运行元数据和报告索引

### readiness / audit 逻辑直接关联的表

- `terria_v1_local.items`
- `terria_v1_local.npcs`
- `terria_v1_local.projectiles`
- `terria_v1_local.buffs`
- `terria_v1_relation.projection_items`
- `terria_v1_relation.projection_npcs`
- `terria_v1_relation.projection_projectiles`
- `terria_v1_relation.projection_buffs`

用途：

- 当前 readiness 只直接比较这 8 张表

---

## 六、哪些表“现在一定在替换范围内”

如果只看当前这一轮真正绕不开的表，最小闭环是下面这组：

### 直接替换对比

- `local.items`
- `local.npcs`
- `local.projectiles`
- `local.buffs`
- `relation.projection_items`
- `relation.projection_npcs`
- `relation.projection_projectiles`
- `relation.projection_buffs`

### relation 主支撑

- `relation.relation_items`
- `relation.relation_npcs`
- `relation.relation_projectiles`
- `relation.relation_buffs`
- `relation.relation_item_images`
- `relation.relation_npc_images`
- `relation.relation_projectile_images`
- `relation.relation_buff_images`
- `relation.relation_item_rarities`

### maint 上游主支撑

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

## 七、哪些表“可能属于后续扩展范围，但不一定进入本轮切换”

如果这次替换只定义为“先替换业务读层”，那下面这些表虽然重要，但不一定都进入当前里程碑主线：

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

这些更偏向：

- 关系域完备性
- 中长期业务能力迁移
- 不是所有阶段都需要和 `local` 主表一一对齐

---

## 八、当前建议的表范围口径

如果后面要生成“relation 替换 local”的正式里程碑，建议先按下面的表范围口径：

### 第一层：必须进入当前替换里程碑

- `local.{items,npcs,projectiles,buffs}`
- `relation.projection_{items,npcs,projectiles,buffs}`
- `relation.relation_{items,npcs,projectiles,buffs}`
- `relation_{item,npc,projectile,buff}_images`
- `maint.{maint_items,maint_npcs,maint_projectiles,maint_buffs,maint_item_images,maint_npc_images,maint_item_pages}`
- `maint_item_{rarity,numeric,text}_overrides`

### 第二层：作为 relation 长期业务域支撑，按需要纳入里程碑

- 配方关系表
- NPC shop/loot 关系表
- boss / series 派生关系表

### 第三层：当前只作为系统辅助

- `relation_runs`
- `relation_run_reports`

---

## 九、结论

如果只回答“这次 relation 替换 local 涉及哪些表”，最核心的一句话是：

> **直接替换层是 `local.{items,npcs,projectiles,buffs}` 与 `relation.projection_{items,npcs,projectiles,buffs}` 的对位替换；真正支撑这次替换的数据表，则向下再覆盖 relation 实体层、relation 图片/字典层，以及 maint 的实体/图片/页面/override 上游表。**
