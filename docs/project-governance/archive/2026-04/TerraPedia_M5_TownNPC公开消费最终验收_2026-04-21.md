# TerraPedia M5 Town NPC 公开消费最终验收

日期：2026-04-21  
执行分支：`feature/npc-domain-m1-m2`

---

## 1. 验收结论

`M5: Town NPC Public Consumption` 已达到可收口状态。

当前状态：

- Town NPC 公开商店条目已完成结构化导入
- 可结构化条件已进入 `npc_shop_conditions`
- 旧平台 / 旧版本 source item 已单独剥离
- 泛化选择项已单独剥离
- 未分类 unmatched item 已归零
- 高尔夫分数阈值类已明确延期

---

## 2. 最新数据统计

基于 `data/generated/wiki-town-npc-import.latest.json`：

- `database = terria_v1_local`
- `matchedNpcCount = 39`
- `unmatchedNpcCount = 0`
- `replacedShopNpcCount = 23`
- `skippedShopReplaceCount = 16`
- `insertedShopEntryCount = 576`
- `insertedShopConditionCount = 298`
- `unmatchedShopItemCount = 0`
- `ignoredLegacyShopItemCount = 29`
- `genericChoiceShopItemCount = 23`
- `createdWorldContextCount = 0`

---

## 3. 已完成范围

### 3.1 结构化条件

已落地并经过样本验证的条件类型：

- `BIOME`
- `WORLD_CONTEXT`
- `GAME_PERIOD`
- `ITEM`
- `NPC`

其中 `NPC` 已覆盖：

- NPC presence
- Boss / entity defeat
- 安全双 Boss AND defeat

### 3.2 event / progression context

已落地并可公开显示的 progression / event context 包括：

- `MARTIAN_MADNESS_COMPLETED`
- `PIRATE_INVASION_COMPLETED`
- `SNOW_LEGION_COMPLETED`
- `ANY_MECH_BOSS_DEFEATED`
- `ALL_MECH_BOSSES_DEFEATED`

### 3.3 item identity 收口

已完成：

- 直接 item 匹配
- 限定名归一
- 已核实 rename alias
- legacy-only exclusion
- generic-choice placeholder classification

---

## 4. R5 最终分类

### 4.1 matched items

可映射到现代 canonical item 的 source item 已入库。

代表样本：

- `公主裙（服装商） -> PrincessDressNew`
- `闪耀翅膀 -> Cenx's Wings`

### 4.2 ignored legacy items

`ignoredLegacyShopItemCount = 29`

含义：

- source item 存在
- 但属于旧平台 / 旧版本 / 旧变体独占
- 不应伪装成现代 item

代表样本：

- `情人节戒指`
- `Wiesnbräu啤酒`
- `火鸡羽毛`
- `心箭`
- `节日大礼帽`
- `罗马焰火筒`
- `505顶饰`
- 服装商旧变体时装

### 4.3 generic choice placeholders

`genericChoiceShopItemCount = 23`

含义：

- source 表达的是组名、泛称或选择项
- 不能安全压成单一 item

组成：

- `任何晶塔` × 20
- `堆石器` × 1
- `逻辑门` × 1
- `传送带` × 1

明确不做：

- 不把 `任何晶塔` 映射为 `Universal Pylon`
- 不把 `堆石器` 映射为任一 Rubblemaker 尺寸
- 不把 `逻辑门` 映射为任一 logic gate
- 不把 `传送带` 映射为任一 conveyor belt 方向

---

## 5. R4 延期项

`SCORE_OR_PROGRESS` 明确延期。

延期范围：

- 高尔夫分数 `>500`
- 高尔夫分数 `>1000`
- 高尔夫分数 `>2000`
- 高尔夫分数与其它条件混合表达

延期原因：

- 它不是现有 `ITEM / NPC / WORLD_CONTEXT / BIOME / GAME_PERIOD` 契约
- 需要数值阈值条件模型
- 本轮若实现会把 M5 扩展成通用条件引擎

最终口径：

- 本轮不新增 schema
- 本轮不新增 DTO
- 本轮不新增前端条件解释组件
- 后续条件引擎里程碑再处理

---

## 6. 样本验收

### 6.1 API 样本

`Royal Romance`：

- Endpoint: `GET /api/public/npcs/729/aggregate?include=shop`
- Item: `RoyalRomance`
- Conditions:
  - `NPC:KingSlime`
  - `NPC:QueenSlimeBoss`

`Cenx's Wings`：

- Endpoint: `GET /api/public/npcs/86/aggregate?include=shop`
- Item: `CenxsWings`
- Conditions:
  - `GAME_PERIOD:hardmode`
  - `WORLD_CONTEXT:BLOOD_MOON`

### 6.2 DB 样本

已核实以下被剥离项没有错误进入 `npc_shop_entries`：

- Merchant legacy seasonal rows: `0`
- Clothier legacy vanity rows: `0`
- Merchant `Universal Pylon` false mapping rows: `0`
- Steampunker generic `逻辑门 / 传送带` false mapping rows: `0`

### 6.3 页面 smoke

以下页面均返回 HTTP `200`：

- `http://localhost:5174/npcs/729`
- `http://localhost:5174/npcs/86`
- `http://localhost:5174/npcs/83`
- `http://localhost:5174/npcs/120`

---

## 7. 验证命令

已执行：

```powershell
node --test scripts/data/import/import-wiki-town-npcs-to-db.test.mjs
```

结果：

- `7/7 pass`

已执行：

```powershell
node --test scripts/data/lib/town-npc-shop-conditions.test.mjs
```

结果：

- `23/23 pass`

已执行：

```powershell
node scripts/data/import/import-wiki-town-npcs-to-db.mjs --apply=false
node scripts/data/import/import-wiki-town-npcs-to-db.mjs --apply=true
```

结果：

- dry-run 与 apply 均成功
- 最新报告写入完成

---

## 8. 与原计划偏差

### 8.1 没有战略跑偏

当前执行仍符合原始顺序：

1. `R1`
2. `R2`
3. `R3`
4. `R5`
5. `R4`
6. `R6`

### 8.2 R5 内部有顺序优化

原计划按 unmatched 分类顺序执行。

实际为了降低风险，改为：

1. 限定名归一
2. 已核实 rename alias
3. legacy-only exclusion
4. generic-choice placeholder classification

这是 `R5` 内部风险排序优化，不影响里程碑边界。

---

## 9. 残余风险

### 9.1 已接受风险

`genericChoiceShopItems` 不进入公开 item 列表。

原因：

- 这些 source entry 不是单一 item
- 强行映射会造成错误数据

### 9.2 已延期风险

`SCORE_OR_PROGRESS` 仍保留 raw notes。

原因：

- 当前没有数值阈值条件契约
- 延期到后续条件引擎更合理

### 9.3 非本轮目标

本轮不处理：

- 通用条件引擎
- 数值阈值 schema
- 多选 item group 展开模型
- pylon 动态选择建模

---

## 10. 最终结论

`M5` 可以收口。

当前结论：

- Town NPC 公开商店主数据已经入库
- 可结构化条件已完成主线收口
- item identity 已完成分类收口
- 不可安全单一化的 source 已明确为 placeholder
- 数值阈值类已明确延期

建议后续进入下一个里程碑，不再继续在 `M5` 内扩张通用条件模型。
