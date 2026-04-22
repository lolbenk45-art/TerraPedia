# TerraPedia M14-R1 统一落地表建模执行记录
日期：2026-04-23  
对应里程碑：`M14-R1`

---

## 1. 本批目标

完成 `source_dataset_landings` 的统一落地表建模、脚本骨架和最小可执行入口，为后续 `M14-R2` 批量导入做基础。

---

## 2. 本批新增内容

新增脚本：

- `scripts/data/landing/source-dataset-landing-schema.mjs`
- `scripts/data/landing/source-dataset-landing-schema.test.mjs`
- `scripts/data/landing/import-source-dataset-landings.mjs`
- `scripts/data/landing/import-source-dataset-landings.test.mjs`

新增能力：

- 统一落地表 `source_dataset_landings` DDL 生成
- `dataset_type` 枚举与 `parse_status` 枚举
- dry-run / apply 两种执行模式
- 写入前主库保护，默认只允许写 `terria_v1_local`
- 本地日期标签格式化，避免 UTC 日期回退

---

## 3. 落地表结构

已落地字段：

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

已落地索引：

- `uk_source_dataset_landings_current`
- `idx_source_dataset_landings_dataset_current`
- `idx_source_dataset_landings_provider_source_key`
- `idx_source_dataset_landings_source_page`
- `idx_source_dataset_landings_fetched_at`

---

## 4. 实际执行

已执行：

```powershell
node --test scripts/data/landing/source-dataset-landing-schema.test.mjs scripts/data/landing/import-source-dataset-landings.test.mjs
node --check scripts/data/landing/source-dataset-landing-schema.mjs
node --check scripts/data/landing/import-source-dataset-landings.mjs
node scripts/data/landing/import-source-dataset-landings.mjs --apply=false
node scripts/data/landing/import-source-dataset-landings.mjs --apply=true
```

实际结果：

- `source_dataset_landings` 已在 `terria_v1_local` 建表成功
- 表结构核对通过
- dry-run 报表可输出
- apply 模式可在开发库执行

---

## 5. 验证结果

测试结果：

- `source-dataset-landing-schema.test.mjs` 通过
- `import-source-dataset-landings.test.mjs` 通过

数据库结果：

- `SHOW TABLES LIKE 'source_dataset_landings'` 命中
- `SHOW COLUMNS FROM source_dataset_landings` 返回 17 个字段

---

## 6. 本批结论

`M14-R1` 已完成。

当前统一落地层已经具备：

- 明确表结构
- 可重复建表
- dry-run / apply 执行入口
- 后续 `M14-R2` 可直接扩展为真实批量导入
