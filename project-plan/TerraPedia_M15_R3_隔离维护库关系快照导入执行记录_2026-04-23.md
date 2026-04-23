# TerraPedia M15-R3 隔离维护库关系快照导入执行记录
日期：2026-04-23  
对应阶段：`M15-R3`

---

## 1. 本批目标

继续在 `terria_v1_maint` 中补齐 `item-relations.bundle` 剩余的关系和快照域，不碰 `local`：

- `itemSources`
- `itemBiomes`
- `snapshots`

---

## 2. 本批新增内容

新增维护表：

- `maint_item_sources`
- `maint_item_biomes`
- `maint_source_snapshots`

扩展脚本：

- `scripts/data/maint/maint-schema.mjs`
- `scripts/data/maint/sync-landing-to-maint.mjs`
- 对应测试文件

---

## 3. 本批实现要点

### 3.1 去重策略

由于 `item_relations_bundle_raw` 在 landing 层中是按 chunk 落地，而每个 chunk 会重复携带：

- `itemImages`
- `recipes`
- `itemSources`
- `itemBiomes`

所以本批继续沿用 `record_key` 去重策略：

- 同一业务记录无论出现在多少 chunk 中，只保留一次
- 幂等键为 `sha256(JSON.stringify(record))`

### 3.2 流式处理

`item_pages_raw` 和 bundle 相关数据量较大，本批继续沿用流式读取 landing 行、逐行展开、逐行写入的方式，避免 Node 进程因一次性装载大对象导致 OOM。

### 3.3 scope 过滤

本批补了 scope 级过滤：

- 当只同步 `item_sources / item_biomes / source_snapshots` 时
- 不再误把 `item_images / item_recipes` 一起带入

---

## 4. 实际执行

已执行：

```powershell
node --test scripts/data/maint/maint-schema.test.mjs scripts/data/maint/sync-landing-to-maint.test.mjs
node --check scripts/data/maint/sync-landing-to-maint.mjs
node scripts/data/maint/sync-landing-to-maint.mjs --apply=false --database=terria_v1_maint --scopes=item_sources,item_biomes,source_snapshots
node scripts/data/maint/sync-landing-to-maint.mjs --apply=true --database=terria_v1_maint --scopes=item_sources,item_biomes,source_snapshots
node scripts/data/maint/sync-landing-to-maint.mjs --apply=true --database=terria_v1_maint --scopes=item_sources,item_biomes,source_snapshots
```

---

## 5. dry-run 结果

第三批唯一目标量：

- `maint_item_sources`: `3187`
- `maint_item_biomes`: `364`
- `maint_source_snapshots`: `6138`

总计：

- `9689`

---

## 6. apply 结果

首次 apply：

- `inserted: 9689`
- `updated: 0`

第二次 apply：

- `inserted: 0`
- `updated: 9689`

这说明第三批同样满足可重复同步的基本要求。

---

## 7. 库内核验

当前 `terria_v1_maint` 第三批实际行数：

- `maint_item_sources`: `3187`
- `maint_item_biomes`: `364`
- `maint_source_snapshots`: `6138`

抽样核验：

- `maint_item_sources`: `Acorn -> shop / Dryad`
- `maint_item_biomes`: `Acorn -> crimson / found_in`
- `maint_source_snapshots`: `AaronsBreastplate -> parsed`

---

## 8. 当前隔离维护库完整覆盖范围

截至当前，`terria_v1_maint` 已覆盖：

### 落地层

- `source_dataset_landings`

### 第一批核心实体维护层

- `maint_items`
- `maint_npcs`
- `maint_projectiles`
- `maint_buffs`

### 第二批页面图片配方维护层

- `maint_item_pages`
- `maint_item_images`
- `maint_recipe_pages`
- `maint_item_recipes`

### 第三批关系快照维护层

- `maint_item_sources`
- `maint_item_biomes`
- `maint_source_snapshots`

---

## 9. 本批结论

现在 `terria_v1_maint` 已经不是只存“部分爬取结果”，而是已经具备了一套隔离于 `local` 的完整维护链：

- landing 层
- 核心实体层
- 页面图片配方层
- 关系快照层

在当前已规划的数据域范围内，这个隔离维护库已经基本成型，可作为后续持续同步和再映射的主承接库。
