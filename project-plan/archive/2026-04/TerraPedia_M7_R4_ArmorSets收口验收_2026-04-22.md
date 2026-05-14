# TerraPedia M7-R4 Armor Sets 收口验收

日期：2026-04-22  
执行分支：`feature/npc-domain-m1-m2`

---

## 1. 验收结论

`M7-R4: Armor Sets` 已达到可收口状态。

当前结论：

- `Armor Sets` 的主事实口径已经可解释
- definition map 生成脚本已适配当前 schema，可再次运行
- 管理端列表 / 详情页可稳定消费
- `63` vs `88` 的差异已明确归因，不再视为未解释问题

---

## 2. 主事实口径

### 2.1 standardized 口径

`data/standardized/armor_sets.standardized.json`

当前含义：

- `63` 条记录对应的是 `armor set bonus group`
- 一条记录可能包含多个 `set variant`
- 典型例子：
  - `ArmorSetBonus.Wood`
  - `ArmorSetBonus.Hallowed`
  - `ArmorSetBonus.Mining`

这层不是管理端实例表，而是“bonus group 定义层”。

### 2.2 DB 口径

`armor_sets`

当前含义：

- `88` 条记录对应的是管理端可维护的 `instance-level armor set`
- 每条记录通常只对应一个当前实例组合
- 当前实例通过：
  - `source_key`
  - `unique_item_ids_json`
  - `sets_json`

来表达

这意味着：

- `63` 和 `88` 不应被当成同一层级直接比较
- 它们分别代表：
  - bonus group
  - instance row

---

## 3. 最新基线

### 3.1 standardized

基于 `data/standardized/armor_sets.standardized.json`：

- `standardizedCount = 63`
- `expandedGroups = 17`
- `totalVariantSum = 167`

说明：

- 这 63 条里有不少 group 会展开成多个变体
- 因此 DB 88 条实例并不构成异常

### 3.2 数据库

基于 `terria_v1_local`：

- `armor_sets = 88`
- `distinct_source_key = 88`
- `missing_source_key = 0`

说明：

- 当前 DB 不是重复脏数据堆积
- 而是 88 条唯一实例记录

### 3.3 definition map

重新执行：

```powershell
node scripts/data/generate/generate-armor-set-definition-map.mjs
```

结果：

- `total = 88`
- `mapped = 71`
- `placeholder = 17`

这说明：

- 当前绝大多数实例已可映射回 standardized definition
- 剩余 `17` 条属于 placeholder / 非标准 bonus group 实例

---

## 4. 关键修复

本轮修复了 `generate-armor-set-definition-map.mjs` 的 schema 漂移问题。

旧脚本仍依赖不存在的旧列：

- `name`
- `internal_code`
- `armor_head_id`
- `armor_body_id`
- `armor_legs_id`

当前真实 schema 使用：

- `source_key`
- `text_key`
- `unique_item_ids_json`
- `sets_json`

修复后：

- 生成器已恢复可跑
- `armor-set-definition-map.json` 已可重建
- 管理端 detail 可继续依赖该 map 进行映射

---

## 5. 样本验收

### 5.1 已映射实例

`id = 236`

- `sourceKey = 挖矿盔甲`
- `textKey = ArmorSetBonus.Mining`
- `definitionMappingStatus = mapped_manual`
- `currentItemIdsJson = [88,410,411]`

`id = 237`

- `sourceKey = 木盔甲`
- `textKey = ArmorSetBonus.Wood`
- `definitionMappingStatus = mapped`
- `currentItemIdsJson = [727,728,729]`

`id = 274`

- `sourceKey = 钯金盔甲`
- `textKey = ArmorSetBonus.Palladium`
- `definitionMappingStatus = mapped`
- `currentItemIdsJson = [1205,1208,1209]`

### 5.2 Placeholder 实例

`id = 244`

- `sourceKey = 雨具盔甲`
- `definitionMappingStatus = placeholder`
- `currentItemIdsJson = [1135,1136]`

说明：

- 这类实例没有稳定 bonus group 对应项
- 但实例本身仍可被管理端消费

---

## 6. 设计接受项

### 6.1 Placeholder 记录

本轮设计接受：

- `17` 条 placeholder 记录保留
- 它们不视为 unresolved
- 主要包括：
  - bonus-less 或单件实例
  - 当前 standardized 无稳定 group 对应的实例

### 6.2 armor_set_items 历史残留

当前：

- `armor_set_items = 149`
- 但全部指向旧 `armor_set_id`
- 对当前 `armor_sets` 主表均为 orphan

本轮设计接受：

- 不在 `M7-R4` 中直接清理这批历史残留
- 当前 `Armor Sets` 主事实源以：
  - `armor_sets.unique_item_ids_json`
  - `armor_sets.sets_json`
  - `armor-set-definition-map.json`

为准

---

## 7. 验证命令

已执行：

```powershell
node --test scripts/data/generate/armor-set-definition-source.test.mjs
```

结果：

- `2/2 pass`

已执行：

```powershell
node scripts/data/generate/generate-armor-set-definition-map.mjs
```

结果：

- `total = 88`
- `mapped = 71`
- `placeholder = 17`

已执行：

```powershell
node scripts/dev/verify/verify-module-api-smoke.mjs --apiBase=http://127.0.0.1:18088/api
```

结果：

- `admin.armorSets.list = 200`
- `admin.armorSets.detail = 200`

已执行：

```text
http://localhost:3001/entities/armor-sets
```

结果：

- HTTP `200`

---

## 8. 当前结论

`Armor Sets` 可以收口。

它当前已经满足：

- definition source 可解释
- DB 接入可解释
- 管理端消费可验证
- 差异和残留项已明确归因
