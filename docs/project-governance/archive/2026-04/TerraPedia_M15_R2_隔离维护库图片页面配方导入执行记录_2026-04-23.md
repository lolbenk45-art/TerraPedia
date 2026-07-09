# TerraPedia M15-R2 隔离维护库图片页面配方导入执行记录
日期：2026-04-23  
对应阶段：`M15-R2`

---

## 1. 本批目标

在 `terria_v1_maint` 中继续扩展第二批维护层数据，不动 `local`，把下列信息接入隔离维护库：

- item pages
- item images
- recipe pages
- item recipes

---

## 2. 本批新增内容

在原有 `maint` 同步链基础上新增：

- `maint_item_pages`
- `maint_item_images`
- `maint_recipe_pages`
- `maint_item_recipes`

同时扩展：

- `scripts/data/maint/maint-schema.mjs`
- `scripts/data/maint/sync-landing-to-maint.mjs`
- 对应测试文件

---

## 3. 关键实现点

### 3.1 数据来源

来源全部来自隔离库 `terria_v1_maint.source_dataset_landings` current 数据：

- `item_pages_raw -> maint_item_pages`
- `recipes_raw -> maint_recipe_pages`
- `item_relations_bundle_raw -> maint_item_images + maint_item_recipes`

### 3.2 解决的问题

本批落地过程中解决了两个关键问题：

1. **大 payload 内存问题**
   - `item_pages_raw` 直接全量读入会触发 Node heap OOM
   - 现已改为按 landing 行流式读取、逐行展开、逐行写入

2. **bundle chunk 重复问题**
   - `item_relations_bundle_raw` 之前是按 chunk 落地
   - 每个 chunk 都重复携带 `itemImages / recipes`
   - 现已按 `record_key` 去重，只保留唯一图片记录和唯一配方记录

---

## 4. 实际执行

已执行：

```powershell
node --test scripts/data/maint/maint-schema.test.mjs scripts/data/maint/sync-landing-to-maint.test.mjs
node --check scripts/data/maint/sync-landing-to-maint.mjs
node scripts/data/maint/sync-landing-to-maint.mjs --apply=false --database=terria_v1_maint --scopes=item_pages,item_images,recipe_pages,item_recipes
node scripts/data/maint/sync-landing-to-maint.mjs --apply=true --database=terria_v1_maint --scopes=item_pages,item_images,recipe_pages,item_recipes
node scripts/data/maint/sync-landing-to-maint.mjs --apply=true --database=terria_v1_maint --scopes=item_pages,item_images,recipe_pages,item_recipes
```

---

## 5. dry-run 结果

第二批实际唯一目标量：

- `maint_item_pages`: `6131`
- `maint_item_images`: `4001`
- `maint_recipe_pages`: `41`
- `maint_item_recipes`: `3203`

总计：

- `13376`

---

## 6. apply 结果

首次 apply：

- `inserted: 13376`
- `updated: 0`

第二次 apply：

- `inserted: 0`
- `updated: 13376`

这说明第二批也已经满足可重复同步的基本要求。

---

## 7. 库内核验

当前 `terria_v1_maint` 实际行数：

- `source_dataset_landings`: `6514`
- `maint_items`: `6146`
- `maint_npcs`: `762`
- `maint_projectiles`: `1111`
- `maint_buffs`: `388`
- `maint_item_pages`: `6131`
- `maint_item_images`: `4001`
- `maint_recipe_pages`: `41`
- `maint_item_recipes`: `3203`

抽样核验：

- `maint_item_pages`: `AlphabetStatue0 <- wiki.page.item_detail:AlphabetStatue0`
- `maint_item_images`: `Abeemination <- generated.item_relations_bundle:chunk:0001`
- `maint_recipe_pages`: `配方 <- wiki.zh.page.recipe:配方`
- `maint_item_recipes`: `AccentSlab <- generated.item_relations_bundle:chunk:0001`

---

## 8. 当前隔离维护库覆盖范围

截至当前，`terria_v1_maint` 已具备：

### 落地层

- `source_dataset_landings`

### 第一批核心实体维护层

- `maint_items`
- `maint_npcs`
- `maint_projectiles`
- `maint_buffs`

### 第二批图片与详情维护层

- `maint_item_pages`
- `maint_item_images`
- `maint_recipe_pages`
- `maint_item_recipes`

---

## 9. 本批结论

你提出的“跟 local 隔离开”的要求，当前已经不只是建了新库，而是已经把两层维护链真正跑在了新库里：

- `landing` 隔离
- `maint` 隔离
- 第二批页面/图片/配方也已接入
- 重复执行可更新，不重复插入

下一步如果继续推进，建议补第三批：

- `maint_item_sources`
- `maint_item_biomes`
- `maint_source_snapshots`

这样 `item_relations.bundle` 里的剩余关系信息也能全部进入 `terria_v1_maint`。
