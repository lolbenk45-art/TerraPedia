# TerraPedia M5 R5 收口与 R4 延期记录

日期：2026-04-21  
执行分支：`feature/npc-domain-m1-m2`

---

## 1. 结论

`M5-R5: unmatched item reconciliation` 已完成收口。

基于当前最新 `data/generated/wiki-town-npc-import.latest.json`：

- `unmatchedShopItemCount = 0`
- `ignoredLegacyShopItemCount = 29`
- `genericChoiceShopItemCount = 23`

这意味着：

1. 已不存在“未分类 unresolved unmatched item”
2. 原始 source item 已全部进入明确分类
3. `M5-R5` 不再需要继续做 item identity 的追加修补

---

## 2. R5 最终分类

### 2.1 现代 canonical item

已完成直接匹配、限定名归一、rename alias 归一的 source item：

- 常规直接匹配 item
- `公主裙（服装商）` 等限定名归一
- `闪耀翅膀 -> Cenx's Wings`

这部分已经正常入库为 `npc_shop_entries`。

### 2.2 `ignoredLegacyShopItems`

定义：

- source 中存在
- 但属于旧平台 / 旧版本 / 旧变体独占项
- 当前主数据模型下不应该伪装成现代 canonical item

最终数量：

- `29`

代表项：

- `情人节戒指`
- `Wiesnbräu啤酒`
- `火鸡羽毛`
- `心箭`
- `节日大礼帽`
- `罗马焰火筒`
- `505顶饰`
- `George` / `多乐` / `粉白美` / `希炼` / `旦多尔` 等服装商变体时装

处理原则：

- 保留 source 信息
- 不进入 unresolved unmatched
- 不映射到错误的现代 item

### 2.3 `genericChoiceShopItems`

定义：

- source 表达的是“泛化可选项”或“组名占位”
- 无法安全压缩成单一 item identity

最终数量：

- `23`

组成：

- `任何晶塔` × 20
- `堆石器` × 1
- `逻辑门` × 1
- `传送带` × 1

处理原则：

- 不映射到单一 canonical item
- 不映射到 `Universal Pylon`
- 不把 `逻辑门` 强行指向任意一个 logic gate
- 不把 `传送带` 强行指向任意一个方向的 conveyor
- 归类为 `generic_choice_placeholder`

这部分属于“设计接受的 placeholder”，不是 unresolved 问题。

---

## 3. 为什么 R5 现在可以结束

`R5` 的目标不是把所有 source wording 都压成单一 item，而是把 item identity 问题收口到可解释状态。

当前已经达到这个标准：

1. 真正可映射的 item 已映射
2. 旧平台遗留项已剥离
3. 泛化占位项已剥离
4. 不再存在“还不知道该怎么处理”的 unmatched item

因此 `R5` 可以正式结束。

---

## 4. R4 默认延期决策

`R4: SCORE_OR_PROGRESS` 本轮不进入 schema / DTO / parser / public contract 扩展。

默认延期项：

- 高尔夫分数 `>500`
- 高尔夫分数 `>1000`
- 高尔夫分数 `>2000`
- 高尔夫分数 + 其它条件混合表达

延期原因：

1. 这类条件不是 `ITEM / NPC / WORLD_CONTEXT / BIOME / GAME_PERIOD`
2. 若本轮扩展，会把 `M5` 从 Town NPC public consumption 收口扩成通用数值条件引擎
3. 当前收益不足以覆盖新增 schema / DTO / front 解释成本

因此本轮明确采用：

- **延期，不实现**
- 在 `R6` 最终验收中记为“显式延期项”

---

## 5. 当前 M5 剩余工作

`M5` 剩余只包括两部分：

1. `R4` 延期说明纳入最终验收口径
2. `R6` 总体验收与最终收口

换句话说：

- item identity 已收口
- 结构化条件主线已收口
- 剩余工作已从“实现”切换到“验收与归档”

---

## 6. R6 验收时必须引用的事实

最终验收时，应引用以下当前事实：

- `unmatchedShopItemCount = 0`
- `ignoredLegacyShopItemCount = 29`
- `genericChoiceShopItemCount = 23`
- `insertedShopEntryCount = 576`
- `insertedShopConditionCount = 298`
- `replacedShopNpcCount = 23`
- `skippedShopReplaceCount = 16`

---

## 7. 最终结论

本轮 `M5-R5` 已正式完成，且没有通过“伪匹配 item”来制造表面收口。

当前状态是：

- **可映射的，已映射**
- **旧平台遗留的，已剥离**
- **泛化占位的，已单列**
- **数值阈值类，明确延期**

后续应直接进入 `M5-R6` 总体验收。
