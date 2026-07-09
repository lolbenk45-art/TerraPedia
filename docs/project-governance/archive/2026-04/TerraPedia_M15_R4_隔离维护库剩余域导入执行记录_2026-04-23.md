# TerraPedia M15-R4 隔离维护库剩余域导入执行记录
日期：2026-04-23  
对应阶段：`M15-R4`

---

## 1. 本批目标

把隔离维护库 `terria_v1_maint` 中仍未展开为 `maint_*` 的剩余 5 个域补齐：

- `bosses_raw`
- `biomes_raw`
- `armor_sets_raw`
- `categories_raw`
- `shimmer_raw`

---

## 2. 本批新增内容

新增维护表：

- `maint_bosses`
- `maint_biomes`
- `maint_armor_sets`
- `maint_categories`
- `maint_shimmer_pages`

扩展脚本：

- `scripts/data/maint/maint-schema.mjs`
- `scripts/data/maint/sync-landing-to-maint.mjs`
- 对应测试文件

---

## 3. 本批实现要点

### 3.1 结构设计

这 5 个域继续沿用隔离维护层原则：

- 结构化高频字段单独拆列
- `landing_*` 元数据保留
- `raw_json` 保留原始记录
- `record_key` 作为幂等键

### 3.2 范围控制

本批补了 scope 过滤，确保在只同步剩余 5 个域时，不会误把其他 bundle 域带入。

### 3.3 幂等策略

继续使用：

- `record_key` 去重
- `INSERT/UPDATE` 幂等同步

---

## 4. 实际执行

已执行：

```powershell
node --test scripts/data/maint/maint-schema.test.mjs scripts/data/maint/sync-landing-to-maint.test.mjs
node --check scripts/data/maint/maint-schema.mjs
node --check scripts/data/maint/sync-landing-to-maint.mjs
node scripts/data/maint/sync-landing-to-maint.mjs --apply=false --database=terria_v1_maint --scopes=bosses,biomes,armor_sets,categories,shimmer
node scripts/data/maint/sync-landing-to-maint.mjs --apply=true --database=terria_v1_maint --scopes=bosses,biomes,armor_sets,categories,shimmer
node scripts/data/maint/sync-landing-to-maint.mjs --apply=true --database=terria_v1_maint --scopes=bosses,biomes,armor_sets,categories,shimmer
```

---

## 5. dry-run 结果

剩余 5 个域实际目标量：

- `maint_bosses`: `33`
- `maint_biomes`: `7`
- `maint_armor_sets`: `63`
- `maint_categories`: `6`
- `maint_shimmer_pages`: `1`

总计：

- `110`

---

## 6. apply 结果

首次 apply：

- `inserted: 110`
- `updated: 0`

第二次 apply：

- `inserted: 0`
- `updated: 110`

这说明剩余域也已经满足可重复同步的基本要求。

---

## 7. 库内核验

当前 `terria_v1_maint` 这 5 张表的实际行数：

- `maint_bosses`: `33`
- `maint_biomes`: `7`
- `maint_armor_sets`: `63`
- `maint_categories`: `6`
- `maint_shimmer_pages`: `1`

抽样核验：

- `maint_bosses`: `Betsy / EVENT`
- `maint_biomes`: `desert / Desert`
- `maint_armor_sets`: `ArmorSetBonus.Wood / 7`
- `maint_categories`: `Consumables / Template:Master Template Consumables`
- `maint_shimmer_pages`: `微光 / wiki_shimmer_page`

---

## 8. 当前隔离维护库完整覆盖范围

截至当前，`terria_v1_maint` 已覆盖：

### 落地层

- `source_dataset_landings`

### 核心实体层

- `maint_items`
- `maint_npcs`
- `maint_projectiles`
- `maint_buffs`

### 页面图片配方层

- `maint_item_pages`
- `maint_item_images`
- `maint_recipe_pages`
- `maint_item_recipes`

### 关系快照层

- `maint_item_sources`
- `maint_item_biomes`
- `maint_source_snapshots`

### 剩余领域层

- `maint_bosses`
- `maint_biomes`
- `maint_armor_sets`
- `maint_categories`
- `maint_shimmer_pages`

---

## 9. 本批结论

在当前已抓取并已规划的数据域范围内，`terria_v1_maint` 已经完成从 landing 到 maint 的完整隔离维护链。

也就是说：

- 当前爬下来的数据已进入独立维护库
- 不和 `local` 业务库混写
- 大部分域已展开成可持续维护的 `maint_*` 表
- 同步链支持重复执行幂等更新
