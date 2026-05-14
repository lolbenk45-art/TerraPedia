# TerraPedia M6 Boss 聚合域验收

日期：2026-04-22  
执行分支：`feature/npc-domain-m1-m2`

---

## 1. 验收结论

`M6: Boss 聚合域闭环` 已达到可收口状态。

当前结论：

- Boss source import 已可 dry-run 且 strict 通过
- Boss loot import 已可 dry-run 且不再存在 unresolved boss / unresolved item
- 管理端 Boss 列表与详情页可稳定消费聚合结果
- Boss 主图已完成本地化落库
- 组合 Boss `Mechdusa` 已从“未解释失败”转为“reference-only 设计接受项”

---

## 2. 最新基线

### 2.1 Boss source import

基于 `reports/wiki-bosses-import-2026-04-22-strict.json`：

- `totalBosses = 33`
- `mappedBosses = 33`
- `unmappedBosses = 0`
- `unresolvedBosses = 0`
- `strictMode = true`

说明：

- Boss group source 已全部可解释
- `Mechdusa` 不再落入 unresolved

### 2.2 Boss loot import

基于 `reports/boss-loot-import-2026-04-22.json`：

- `totalBossRecords = 33`
- `importedBosses = 32`
- `skippedBosses = 1`
- `insertedLootRows = 346`
- `unresolvedBosses = 0`
- `unresolvedItems = 0`

唯一跳过项：

- `Mechdusa`
  - `reason = reference_only_composite_boss_without_npc_owner`

### 2.3 数据库现状

基于 `terria_v1_local` 只读统计：

- `boss_groups = 33`
- `boss_groups_with_image = 33`
- `boss_npcs = 52`
- `grouped_boss_npcs = 51`
- `ungrouped_boss_npcs = 1`
- `boss_loot_rows = 346`
- `boss_loot_owners = 32`

唯一未归组 `is_boss = 1` NPC：

- `TorchGod / 火把神`

---

## 3. 已完成范围

### 3.1 Boss group / member 聚合

已收口：

- Boss group 基础档案
- 单体 Boss 成员映射
- 多部件 Boss 成员映射
- 组合 Boss reference member 展示
- 事件型 Boss 分类与详情消费

### 3.2 Boss loot 聚合

已收口：

- `direct_boss` 掉落导入
- `treasure_bag` 掉落导入
- item identity 对齐
- dry-run / report 复跑
- Boss loot 导入迁移路径修复

### 3.3 管理端消费面

已验证：

- `GET /api/admin/bosses`
- `GET /api/admin/bosses/:id`
- `http://localhost:3001/entities/bosses`

管理端当前可稳定展示：

- 主图
- Boss 类型
- 召唤方式
- 成员归组
- reference members
- 掉落统计

---

## 4. 样本验收

### 4.1 单体 Boss

`KING_SLIME`

- `memberSourceMode = assigned`
- `memberCount = 1`
- `lootEntries = 11`
- `directLootCount = 6`
- `treasureBagLootCount = 5`
- 主图已切到本地 MinIO

### 4.2 多部件 Boss

`EATER_OF_WORLDS`

- `memberSourceMode = assigned`
- `memberCount = 3`
- `lootEntries = 11`
- `directLootCount = 7`
- `treasureBagLootCount = 4`
- 主图已切到本地 MinIO

### 4.3 组合 Boss

`MECHDUSA`

- `memberSourceMode = reference`
- `memberCount = 8`
- `referenceMembers = 8`
- `lootEntries = 0`
- `referenceBossCodes = [THE_TWINS, THE_DESTROYER, SKELETRON_PRIME]`
- 主图已切到本地 MinIO

说明：

- 当前 schema 只支持 `npc_loot_entries(npc_id)`
- `Mechdusa` 在本轮被视为 reference-only composite Boss
- 因无独立 owner NPC，不把 `Waffle's Iron` 强行挂到三王任一 NPC 上

### 4.4 事件型 Boss

`BETSY`

- `memberSourceMode = assigned`
- `memberCount = 1`
- `lootEntries = 9`
- `directLootCount = 5`
- `treasureBagLootCount = 4`
- 主图已切到本地 MinIO

---

## 5. 设计接受项

### 5.1 Mechdusa

本轮设计接受：

- `Mechdusa` 在 source import 中按 reference-only composite Boss 处理
- 在 loot import 中按 `reference_only_composite_boss_without_npc_owner` 分类跳过
- 不把其直接掉落错误挂到三王任一主 NPC

这意味着：

- 它不再是 unresolved
- 但也不在当前 `npc_loot_entries` schema 内被伪造落库

### 5.2 TorchGod

本轮设计接受：

- `TorchGod / 火把神` 保留在 `NPC Core` 的 `is_boss = 1` source flag 中
- 但不进入 `boss_groups`
- 不算 `M6 Boss 聚合域` 的归组对象

这意味着：

- `boss_groups` 的边界与 wiki `Bosses` 页面保持一致
- `TorchGod` 作为边界样本被显式排除，而不是被静默混入 Boss 聚合域

---

## 6. 验证命令

已执行：

```powershell
node --test scripts/data/import/boss-loot-owner.test.mjs scripts/data/import/boss-loot-schema-path.test.mjs scripts/data/import/boss-reference-source.test.mjs scripts/data/import/boss-import-strict-mode.test.mjs scripts/data/generate/generate-boss-loot-bundle.test.mjs
```

结果：

- `11/11 pass`

已执行：

```powershell
node scripts/data/import/import-wiki-bosses-to-db.mjs --dry-run=true --strict=true --report-json=reports/wiki-bosses-import-2026-04-22-strict.json
```

结果：

- strict dry-run 成功
- `unresolvedBosses = 0`

已执行：

```powershell
node scripts/data/import/import-boss-loot-to-db.mjs --dry-run=true --regenerate-bundle=false --bundle=G:\ClaudeCode\data\terraPedia\normalized\boss-loot.bundle.json --report-json=reports/boss-loot-import-2026-04-22.json
```

结果：

- `importedBosses = 32`
- `skippedBosses = 1`
- `unresolvedBosses = 0`
- `unresolvedItems = 0`

已执行：

```powershell
mvn "-Dtest=AdminBossControllerTest" test
```

结果：

- `4/4 pass`

---

## 7. 最终判断

`M6` 可以收口。

本轮 Boss 聚合域已经满足：

- 可维护
- 可查询
- 可验证
- 可复跑

同时，剩余边界项也已经不再是“未解释问题”，而是：

- `Mechdusa`：reference-only composite Boss，当前 schema 下设计接受跳过
- `TorchGod`：边界排除项，不进入 `boss_groups`

建议后续进入下一里程碑，不再在 `M6` 内继续扩新的 Boss 公开消费模型或新的 loot schema。
