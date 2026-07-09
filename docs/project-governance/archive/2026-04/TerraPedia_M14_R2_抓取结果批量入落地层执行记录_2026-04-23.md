# TerraPedia M14-R2 抓取结果批量入落地层执行记录
日期：2026-04-23  
对应里程碑：`M14-R2`

---

## 1. 本批目标

把当前已抓到的核心 crawled dataset 批量导入 `source_dataset_landings`，并确保 dry-run / apply 都可执行。

---

## 2. 本批新增内容

新增脚本：

- `scripts/data/landing/source-dataset-locator.mjs`
- `scripts/data/landing/source-dataset-locator.test.mjs`

扩展脚本：

- `scripts/data/landing/import-source-dataset-landings.mjs`
- `scripts/data/landing/import-source-dataset-landings.test.mjs`

新增能力：

- 扫描共享数据根 `G:\ClaudeCode\data\terraPedia`
- 扫描仓库内 `data/generated`
- 支持 `--datasets=` 定向筛选
- 支持单文件 dataset 与目录型 dataset 的统一发现
- 支持 bundle 型 payload 拆解成逻辑 entry
- 支持超大 payload 自动分 chunk 后写入 landing 表

---

## 3. 当前已接入数据集

已接入 `dataset_type`：

- `items_raw`
- `npcs_raw`
- `projectiles_raw`
- `armor_sets_raw`
- `buffs_raw`
- `bosses_raw`
- `biomes_raw`
- `categories_raw`
- `item_pages_raw`
- `shimmer_raw`
- `recipes_raw`
- `item_relations_bundle_raw`

当前 locator 实际识别并展开后的 current 目标量：

- `armor_sets_raw`: `1`
- `biomes_raw`: `7`
- `bosses_raw`: `33`
- `buffs_raw`: `1`
- `categories_raw`: `6`
- `item_pages_raw`: `6131`
- `item_relations_bundle_raw`: `290`
- `items_raw`: `1`
- `npcs_raw`: `1`
- `projectiles_raw`: `1`
- `recipes_raw`: `41`
- `shimmer_raw`: `1`

总计：

- `6514`

---

## 4. 实际执行

已执行：

```powershell
node --test scripts/data/landing/source-dataset-locator.test.mjs scripts/data/landing/import-source-dataset-landings.test.mjs scripts/data/landing/source-dataset-landing-schema.test.mjs
node --check scripts/data/landing/source-dataset-locator.mjs
node --check scripts/data/landing/import-source-dataset-landings.mjs
node scripts/data/landing/import-source-dataset-landings.mjs --apply=false
node scripts/data/landing/import-source-dataset-landings.mjs --apply=true --datasets=item_relations_bundle_raw,items_raw,npcs_raw,projectiles_raw,recipes_raw,shimmer_raw
```

说明：

- 首次全量 apply 时，前半批次已成功写入
- 在 `item_relations_bundle_raw` 处触发 MySQL 连接中断
- 根因定位为单条 payload 约 `429,705,004` 字节，超出当前 `max_allowed_packet=67,108,864`
- 之后改为脚本层自动 chunk 落地，不再依赖数据库增大包限制
- 修复后重新 dry-run，再对剩余 6 个 dataset 定向 apply，补齐全部缺口

---

## 5. 超大 payload 处理策略

当前已落地策略：

- 对超大 payload 优先按顶层最大数组字段拆 chunk
- chunk row 继承原始 `dataset_type / provider / source_locator`
- `source_key` 追加 `:chunk:0001` 之类的后缀
- `source_page` 追加 `#<arrayKey>/<index>` 后缀
- chunk 信息写入 payload 内部 `landingChunk`

本轮实际触发 chunk 的数据集：

- `item_relations_bundle_raw`

chunk 后行数：

- `290`

---

## 6. 最终核验

数据库 current 计数：

- 目标 `expected`: `6514`
- 实际 `actual`: `6514`
- 缺失 `missingCount`: `0`

数据库 current 分布：

- `armor_sets_raw`: `1`
- `biomes_raw`: `7`
- `bosses_raw`: `33`
- `buffs_raw`: `1`
- `categories_raw`: `6`
- `item_pages_raw`: `6131`
- `item_relations_bundle_raw`: `290`
- `items_raw`: `1`
- `npcs_raw`: `1`
- `projectiles_raw`: `1`
- `recipes_raw`: `41`
- `shimmer_raw`: `1`

---

## 7. 本批结论

`M14-R2` 已完成。

当前结果不是“只建了表”，而是：

- 统一落地层已真实进库
- 当前 crawler 输出已形成可查询的 landing current 数据
- 超大 bundle 已可稳定落地
- 后续可直接进入 `M14-R3` 做 `landing / local / r2` 审计对比
