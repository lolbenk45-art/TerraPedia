# TerraPedia M15-R1 maint 维护层导入执行记录
日期：2026-04-23  
对应阶段：`M15-R1`

---

## 1. 本批目标

按当前用户要求，不把 landing 数据直接写入现有业务表 `items / npcs / projectiles / buffs`，而是新增一层可持续维护的 `maint_*` 维护层表：

- `maint_items`
- `maint_npcs`
- `maint_projectiles`
- `maint_buffs`

这层目标是：

- 当前爬下来的数据先稳定进库
- 后续调度可以重复执行
- 不强行适配后端现有业务表结构
- 给后续 landing-to-domain 正式接入留下缓冲层

---

## 2. 本批新增内容

新增脚本：

- `scripts/data/maint/maint-schema.mjs`
- `scripts/data/maint/maint-schema.test.mjs`
- `scripts/data/maint/sync-landing-to-maint.mjs`
- `scripts/data/maint/sync-landing-to-maint.test.mjs`

新增能力：

- 从 `source_dataset_landings` current 读取 `items_raw / npcs_raw / projectiles_raw / buffs_raw`
- 展开成实体维护行
- 建立 `maint_*` 四张维护层表
- 支持 dry-run / apply
- 支持重复执行幂等更新

---

## 3. maint 层表设计

四张表都统一保留：

- `source_id`
- `internal_name`
- `english_name`
- `name_zh`
- `source_provider`
- `source_page`
- `source_revision_timestamp`
- `landing_source_id`
- `landing_source_key`
- `landing_source_page`
- `landing_content_hash`
- `landing_fetched_at`
- `landing_parsed_at`
- `module_generated_at`
- `terraria_version`
- `major_value`
- `combat_value`
- `defense_value`
- `use_time`
- `stack_size`
- `width`
- `height`
- `flags_json`
- `raw_json`
- `status`
- `deleted`

这套字段刻意偏“维护层”而不是“业务层”：

- 保留来源与落地层引用
- 保留完整原始实体 `raw_json`
- 只抽出少量高频检索字段

---

## 4. 实际执行

已执行：

```powershell
node --test scripts/data/maint/maint-schema.test.mjs scripts/data/maint/sync-landing-to-maint.test.mjs
node --check scripts/data/maint/maint-schema.mjs
node --check scripts/data/maint/sync-landing-to-maint.mjs
node scripts/data/maint/sync-landing-to-maint.mjs --apply=false
node scripts/data/maint/sync-landing-to-maint.mjs --apply=true
node scripts/data/maint/sync-landing-to-maint.mjs --apply=true
```

---

## 5. dry-run 结果

本轮 landing 展开后的维护层目标量：

- `maint_items`: `6146`
- `maint_npcs`: `762`
- `maint_projectiles`: `1111`
- `maint_buffs`: `388`

总计：

- `8407`

---

## 6. apply 结果

首次 apply：

- `inserted: 8407`
- `updated: 0`

第二次 apply：

- `inserted: 0`
- `updated: 8407`

这说明当前 maint 同步链已满足“可重复执行”的基本要求。

---

## 7. 库内核验

实际表存在：

- `maint_items`
- `maint_npcs`
- `maint_projectiles`
- `maint_buffs`

实际行数：

- `maint_items`: `6146`
- `maint_npcs`: `762`
- `maint_projectiles`: `1111`
- `maint_buffs`: `388`

抽样核验：

- `maint_items` 已带 `landing_source_key / landing_content_hash / module_generated_at / terraria_version`
- `maint_npcs` 已带 `flags_json`
- `maint_projectiles` 已带 `flags_json`
- `maint_buffs` 已带 `name_zh` 与 `flags_json`

---

## 8. 本批结论

当前已经满足用户这条要求的更准确版本：

- 现在爬下来的核心数据已经进入数据库
- 但不是直接污染现有业务表
- 而是进入一层可以持续维护、可重复同步、保留原始来源的 `maint_*` 维护层

下一步如继续推进，应在 maint 层之上再决定：

1. 哪些字段正式映射到后端业务表
2. 哪些继续只保留在 maint / landing 层
3. 是否把这条 maint 同步链接入后端刷新编排主线
