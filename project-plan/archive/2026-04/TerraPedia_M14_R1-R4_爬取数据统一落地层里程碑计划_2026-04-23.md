# TerraPedia M14-R1-R4 爬取数据统一落地层里程碑计划

> 执行方式：按本计划连续推进，不再逐项确认。里程碑完成一批提交一批。

**Goal:** 建一层统一的“爬取数据落地层”，把当前已经抓到的多域原始/半标准化数据先稳定落库，再决定后续如何映射到业务表。

**Architecture:** 不直接替代现有 `items / recipes / categories / shimmer_*` 等业务表，也不直接覆盖现有导入链。新增一张统一落地表作为 crawl landing layer，专门承接 `payload_json + source metadata + parse status + current version`，现有业务导入链继续保留。`entity_source_snapshots` 继续承担“已映射到实体后的来源快照”，新表承担“实体映射前的统一接收层”。

**Tech Stack:** MySQL、Node.js 数据脚本、现有 `scripts/data/fetch` / `scripts/data/workflow` / `scripts/data/import`、`project-plan/` 里程碑文档。

---

## 1. 目标边界

本轮目标不是：

- 直接替换现有业务表
- 直接让所有抓取数据自动覆盖 `terria_v1_local`
- 直接把 `r2` 整库并到 `local`

本轮目标是：

1. 把当前已抓下来的多域数据统一落入数据库
2. 保留来源、版本、抓取时间、解析状态
3. 给后续差异比对、回放、二次标准化提供稳定基座

---

## 2. 当前数据现状

当前已存在、且适合进入统一落地层的数据类型：

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

对应现有抓取/生成来源主要来自：

- `scripts/data/fetch/fetch-wiki-iteminfo.mjs`
- `scripts/data/fetch/fetch-wiki-npcinfo.mjs`
- `scripts/data/fetch/fetch-wiki-projectileinfo.mjs`
- `scripts/data/fetch/fetch-wiki-armorsetbonuses.mjs`
- `scripts/data/fetch/fetch-wiki-buffs.mjs`
- `scripts/data/fetch/fetch-wiki-bosses.mjs`
- `scripts/data/fetch/fetch-wiki-biomes.mjs`
- `scripts/data/fetch/fetch-wiki-item-categories.mjs`
- `scripts/data/fetch/fetch-wiki-item-pages.mjs`
- `scripts/data/fetch/fetch-wiki-shimmer-page.mjs`
- `scripts/data/fetch/fetch-wiki-zh-recipe-pages.mjs`
- `scripts/data/fetch/build-item-relations-bundle.mjs`

---

## 3. 设计决策

### 3.1 为什么不直接复用 `entity_source_snapshots`

`entity_source_snapshots` 适合：

- 已经能映射到 `entity_type + entity_id` 的快照
- 已经进入业务实体体系后的溯源层

但当前很多抓取结果在落地时还没有稳定 `entity_id`，例如：

- `item_pages_raw`
- `categories_raw`
- `recipes_raw`
- `item_relations_bundle_raw`
- 原始 `module` / `template` payload

所以本轮更合理的是：

- 保留 `entity_source_snapshots`
- 新增一张统一落地表，承接“映射前”的抓取结果

### 3.2 推荐新表

推荐表名：

- `source_dataset_landings`

推荐字段：

- `id`
- `dataset_type`
- `provider`
- `source_kind`
- `source_key`
- `source_locator`
- `source_page`
- `source_revision_timestamp`
- `content_hash`
- `payload_json`
- `fetched_at`
- `parsed_at`
- `parse_status`
- `is_current`
- `notes`
- `created_at`
- `updated_at`

推荐唯一约束方向：

- `dataset_type + provider + source_key + source_page + is_current`

推荐索引方向：

- `idx_dataset_type_current`
- `idx_provider_source_key`
- `idx_source_page`
- `idx_fetched_at`

---

## 4. 里程碑总览

| 里程碑 | 名称 | 核心目标 |
| --- | --- | --- |
| `M14-R1` | 统一落地表建模 | 新增 `source_dataset_landings`，明确接收字段与脚本口径 |
| `M14-R2` | 现有抓取结果批量入落地层 | 把当前已抓到的核心原始数据按类型导入新表 |
| `M14-R3` | 落地层核验与差异分析 | 对 `local / r2 / landing` 的重叠度、缺口和来源分布做审计 |
| `M14-R4` | 业务映射接续计划 | 给哪些数据继续入业务表、哪些保留落地层，做正式接续计划 |

---

## 5. M14-R1：统一落地表建模

**目标**

先把结构定对，避免后面批量导入时重复返工。

**范围**

- 新增 DB 表结构草案
- 新增对应的导入脚本骨架
- 明确 `dataset_type` 枚举

**目标文件**

- 新增：`project-plan/TerraPedia_M14_R1_统一落地表建模执行记录_2026-04-23.md`
- 新增：`scripts/data/landing/source-dataset-landing-schema.mjs`
- 新增：`scripts/data/landing/source-dataset-landing-schema.test.mjs`
- 新增：`scripts/data/landing/import-source-dataset-landings.mjs`
- 新增：`scripts/data/landing/import-source-dataset-landings.test.mjs`

**完成标准**

- 能明确给出落地表字段定义
- 能从脚本中生成或校验表结构
- 导入脚本支持 dry-run / apply

**最小验证**

- `node --test scripts/data/landing/source-dataset-landing-schema.test.mjs scripts/data/landing/import-source-dataset-landings.test.mjs`
- `node --check scripts/data/landing/source-dataset-landing-schema.mjs`
- `node --check scripts/data/landing/import-source-dataset-landings.mjs`

**提交边界**

- 单独提交 `feat: add source dataset landing schema`

---

## 6. M14-R2：现有抓取结果批量入落地层

**目标**

把当前已抓到的数据先统一落进新表，不争论业务映射细节。

**优先导入批次**

第一批：

- `items_raw`
- `npcs_raw`
- `projectiles_raw`
- `buffs_raw`
- `armor_sets_raw`

第二批：

- `bosses_raw`
- `biomes_raw`
- `categories_raw`
- `item_pages_raw`

第三批：

- `shimmer_raw`
- `recipes_raw`
- `item_relations_bundle_raw`

**目标文件**

- 新增：`scripts/data/landing/source-dataset-locator.mjs`
- 新增：`scripts/data/landing/source-dataset-locator.test.mjs`
- 修改：`scripts/data/landing/import-source-dataset-landings.mjs`
- 新增：`project-plan/TerraPedia_M14_R2_抓取结果批量入落地层执行记录_2026-04-23.md`

**完成标准**

- 能扫描现有 `latest.json / parsed.latest.json / generated/*.latest.json`
- 按 `dataset_type` 入落地表
- 支持 `--datasets=` 筛选
- 支持 `--apply=false` 演练

**最小验证**

- `node --test scripts/data/landing/source-dataset-locator.test.mjs`
- `node --check scripts/data/landing/source-dataset-locator.mjs`
- `node scripts/data/landing/import-source-dataset-landings.mjs --apply=false`

**提交边界**

- 单独提交 `feat: import crawled datasets into landing table`

---

## 7. M14-R3：落地层核验与差异分析

**目标**

让新落地层不是“只是存了 JSON”，而是能说明它和现有业务库、`r2` 库之间的关系。

**目标文件**

- 新增：`scripts/data/landing/audit-source-dataset-landings.mjs`
- 新增：`scripts/data/landing/audit-source-dataset-landings.test.mjs`
- 新增：`project-plan/TerraPedia_M14_R3_落地层核验与差异分析_2026-04-23.md`

**输出内容**

- 每种 `dataset_type` 的行数
- 每种 `provider` 的分布
- 与 `local` 业务表的可映射数量
- 与 `r2` 的重合/缺失数量

**最小验证**

- `node --test scripts/data/landing/audit-source-dataset-landings.test.mjs`
- `node --check scripts/data/landing/audit-source-dataset-landings.mjs`
- `node scripts/data/landing/audit-source-dataset-landings.mjs`

**提交边界**

- 单独提交 `feat: add landing dataset audit reports`

---

## 8. M14-R4：业务映射接续计划

**目标**

在落地层稳定后，再决定哪些数据继续入业务表，哪些长期只保留在落地层。

**映射判断原则**

可优先继续入业务表：

- `items_raw`
- `bosses_raw`
- `biomes_raw`
- `projectiles_raw`
- `buffs_raw`
- `armor_sets_raw`
- `shimmer_raw`

需经过规则层或二次标准化再入业务表：

- `categories_raw`
- `item_pages_raw`
- `recipes_raw`
- `item_relations_bundle_raw`

**目标文件**

- 新增：`project-plan/TerraPedia_M14_R4_业务映射接续计划_2026-04-23.md`
- 修改：`project-plan/TerraPedia_M11_R5_后端时效主线最终验收收口_2026-04-22.md`

**完成标准**

- 给出每种 `dataset_type` 的后续去向
- 明确哪些进入业务表
- 明确哪些只保留落地层

**提交边界**

- 单独提交 `docs: define landing-to-domain mapping`

---

## 9. 默认执行顺序

1. `M14-R1`
2. `M14-R2`
3. `M14-R3`
4. `M14-R4`

默认从 `M14-R1` 开始执行。
