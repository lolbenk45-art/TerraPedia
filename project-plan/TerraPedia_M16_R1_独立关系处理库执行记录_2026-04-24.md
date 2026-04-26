# TerraPedia M16-R1 独立关系处理库执行记录
日期：2026-04-24

## 目标

以 `terria_v1_maint` 为唯一上游事实入口，新建 `terria_v1_relation` 保存处理后的 item 关系结果与审计结果，不写 `terria_v1_local`，不参考 `terria_v1_local` 参与生成，也不回写 `terria_v1_maint`。

## 本轮实现范围

- `relation schema`
- `trace / identity utilities`
- `category relation processor`
- `recipe relation processor`
- `item source / npc candidate processor`
- `secondary relation processor`
- `relation report writer`
- `sync-maint-to-relation` 主 CLI
- dry-run 与 apply 执行

## 关键输出

### 新增脚本

- `scripts/data/relation/base-entity-processor.mjs`
- `scripts/data/relation/base-entity-processor.test.mjs`
- `scripts/data/relation/relation-schema.mjs`
- `scripts/data/relation/relation-schema.test.mjs`
- `scripts/data/relation/relation-trace.mjs`
- `scripts/data/relation/relation-trace.test.mjs`
- `scripts/data/relation/category-relation-processor.mjs`
- `scripts/data/relation/category-relation-processor.test.mjs`
- `scripts/data/relation/recipe-relation-processor.mjs`
- `scripts/data/relation/recipe-relation-processor.test.mjs`
- `scripts/data/relation/item-source-relation-processor.mjs`
- `scripts/data/relation/item-source-relation-processor.test.mjs`
- `scripts/data/relation/secondary-relation-processor.mjs`
- `scripts/data/relation/secondary-relation-processor.test.mjs`
- `scripts/data/relation/relation-report.mjs`
- `scripts/data/relation/relation-report.test.mjs`
- `scripts/data/relation/sync-maint-to-relation.mjs`
- `scripts/data/relation/sync-maint-to-relation.test.mjs`

### 报告

- `reports/relation/relation-audit-2026-04-24.json`
- `reports/relation/relation-audit-2026-04-24.md`
- `reports/relation/relation-conflicts-2026-04-24.json`
- `reports/relation/relation-unresolved-2026-04-24.json`

## 已执行验证

### 模块测试

执行：

```powershell
node --test scripts/data/relation/*.test.mjs
```

结果：

- `28` 个测试全部通过

### 语法检查

执行：

```powershell
Get-ChildItem scripts/data/relation -Filter *.mjs | ForEach-Object { node --check $_.FullName }
```

结果：

- 全部通过，无语法错误

### dry-run

执行：

```powershell
node scripts/data/relation/sync-maint-to-relation.mjs --apply=false --maint-database=terria_v1_maint --local-database=terria_v1_local --relation-database=terria_v1_relation --scopes=category,recipe,npc,buff,biome,projectile
```

结果：

- 成功读取 `maint/local`
- 成功输出 relation 报告
- `Relation writes: 0`

### apply

执行：

```powershell
node scripts/data/relation/sync-maint-to-relation.mjs --apply=true --create-database=true --maint-database=terria_v1_maint --local-database=terria_v1_local --relation-database=terria_v1_relation --scopes=category,recipe,npc,buff,biome,projectile
```

结果：

- 成功写入 `terria_v1_relation`
- 成功写入 `relation_runs / relation_run_reports`

## 当前独立处理库计数

基于 `terria_v1_relation` 当前查询：

- `relation_items = 6146`
- `relation_npcs = 762`
- `relation_projectiles = 1111`
- `relation_runs = 1`
- `relation_run_reports = 4`
- `category_nodes = 2175`
- `item_category_assignments = 1758`
- `item_recipe_heads = 7399`
- `item_recipe_ingredients = 12345`
- `item_recipe_stations = 10146`
- `item_source_facts = 3187`
- `item_source_details = 3187`
- `item_npc_shop_candidates = 126`
- `item_npc_loot_candidates = 166`
- `item_buff_relations = 245`
- `item_biome_relations = 364`
- `item_projectile_audits = 721`

## 读写边界

- 未写 `terria_v1_local`
- 未参考 `terria_v1_local` 参与当前这版关系生成
- 未改 `terria_v1_maint` 数据内容
- 仅写入 `terria_v1_relation`

## 风险与残余问题

- 当前 schema / report / processing 已跑通，但仍缺少“真实 MySQL DDL 烟测”以外的更高强度集成约束验证
- `projectile` 仍是 audit-only，没有升格为正式 item-projectile 事实关系
- `unresolved` 报告量较大，后续需要按关系域继续消化
- `relation_run_reports` 当前可重复追加，后续可考虑唯一性约束或清理策略

## 结论

本轮已经完成从 `maint` 到独立关系处理库 `terria_v1_relation` 的第一版落地，形成了：

- 基础实体快照层
- 可重复 dry-run
- 可重复 apply
- 可审计报告
- 与 `local / maint` 隔离的关系处理承接层
