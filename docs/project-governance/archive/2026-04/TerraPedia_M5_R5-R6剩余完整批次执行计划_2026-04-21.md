# TerraPedia M5 R5-R6 剩余完整批次执行计划

日期：2026-04-21  
执行分支：`feature/npc-domain-m1-m2`

---

## 1. 目标

把 `M5` 剩余工作整理成一个可连续执行的完整批次，减少“做到一个小点就回头询问”的节奏。

本计划覆盖：

1. `M5-R5` 剩余 unresolved unmatched item 收口
2. `M5-R4` 的默认决策路径
3. `M5-R6` 的最终验收收口准备

---

## 2. 当前真实状态

基于当前最新 `data/generated/wiki-town-npc-import.latest.json`：

- `unmatchedShopItemCount = 23`
- `ignoredLegacyShopItemCount = 29`

当前未解决的 unmatched item 只剩 4 类：

1. `任何晶塔` × 20
2. `堆石器` × 1
3. `逻辑门` × 1
4. `传送带` × 1

这意味着：

- `seasonal / event legacy-only items` 已基本完成剥离
- `clothier vanity variant-exclusive items` 已完成剥离
- `R5` 现在只剩三个单点名称问题 + 一个高频泛化占位问题

---

## 3. 与里程碑的对齐结论

### 3.1 没有里程碑级跑偏

当前执行路径仍然符合原始 `M5` 计划：

- 已完成 `R1-R3`
- 当前仍处于 `R5`
- 尚未提前切到 `R4` 或 `R6`

### 3.2 存在的只是 `R5` 内部顺序优化

`R5` 原始顺序是：

1. seasonal / event items
2. structurable but unmatched
3. generic biome requirement
4. hardmode unmatched
5. other

实际执行顺序调整为：

1. 先做最安全的名称归一
2. 再做已核实名称重命名 alias
3. 再做 legacy-only exclusion
4. 再处理剩余 unresolved singleton
5. 最后处理 `任何晶塔`

这个偏差属于同一里程碑内的风险排序调整，不属于战略跑偏。

---

## 4. 默认执行原则

从这份计划开始，以下默认不再单独询问：

- 写测试
- 跑 importer 单测
- 跑 parser 单测
- 跑 importer `--apply=false`
- 跑 importer `--apply=true`
- 更新 `wiki-town-npc-import.latest.json`
- 写计划文档
- 提交当前切片

只有出现以下情况才中断汇报：

- 单点 unresolved item 无法稳定映射到唯一 canonical item
- `任何晶塔` 需要引入新的公共契约或新的数据表达
- 当前切片将影响现有 public/admin/front 契约
- 发现 source wording 与当前分类口径明显冲突

---

## 5. 剩余完整批次编排

### B1：R5-S1 单点 unresolved item 收口

目标：先处理 3 个单点 unresolved item。

范围：

- `堆石器`
- `逻辑门`
- `传送带`

默认执行顺序：

1. 先做 source / item 表双向核对
2. 先找现代 canonical item 是否存在一一映射
3. 若存在稳定映射：走 alias / rename 归一
4. 若不存在稳定映射：归类为 `legacy_only_shop_item` 或 `non_item_placeholder`

默认约束：

- 不允许把 `逻辑门` 强行映射到任意一个 `Logic Gate Lamp`
- 不允许把 `传送带` 强行映射到单一方向的 `Conveyor Belt`
- 不允许没有证据就把 `堆石器` 硬映射到任意近似名称

完成标准：

- 这 3 个单点项全部从 unresolved unmatched 里移除

### B2：R5-S2 `任何晶塔` 专项决策与收口

目标：处理剩余 20 条 `任何晶塔`。

当前判断：

- 它不是单一 item 名称
- 它也不等于 `Universal Pylon`
- 它本质上是“当前出售的晶塔种类占位表达”

默认决策：

- **不映射到具体 item**
- **不映射到 `Universal Pylon`**
- **不在 R5 内新增 schema**

默认执行口径：

将其归类为：

- `generic_choice_placeholder`

含义：

- 该 source 已表达业务信息
- 但当前 `item identity` 模型不能安全压成单一 item
- 该项从 unresolved unmatched 中剥离
- 在 `M5-R6` 中记录为“设计接受的 deferred placeholder”

完成标准：

- `任何晶塔` 不再占据 unresolved unmatched 计数
- 同时不会被伪装成具体 item

### B3：R5-S3 批次收口

目标：正式结束 `M5-R5`。

需要产出：

- `R5` 结束时的最终统计
- unresolved unmatched 是否归零
- 哪些转入 `ignoredLegacy`
- 哪些转入 `generic_choice_placeholder`
- 哪些仍必须保留 unresolved

默认完成条件：

- 若 unresolved unmatched 只剩 `generic_choice_placeholder`，则视为 `R5` 可结束
- 不要求把 placeholder 强行做成 item

### B4：R4 默认决策落地

目标：不给高尔夫分数阈值单独开新契约。

默认决策：

- `SCORE_OR_PROGRESS` 不进入本轮 schema/DTO 扩展
- 明确延期
- 在 `M5-R6` 中记为“显式延期项”

理由：

- 当前 M5 主目标是 Town NPC public consumption 收口
- 若现在引入数值阈值契约，会把问题扩成通用条件引擎
- 成本与收益不对称

### B5：R6 最终验收批次

目标：形成一个可切出结论的正式收口文档。

必须输出：

1. 当前 `M5` 已完成的结构化范围
2. `R5` 最终 unmatched / ignored / deferred 分类
3. `R4` 延期项说明
4. public/API/DB 样本验收
5. 里程碑计划与实际执行偏差说明

---

## 6. 本轮剩余批次默认提交节奏

默认按以下提交切片推进：

1. `B1` 一个提交或两个提交
   - 视 `堆石器 / 逻辑门 / 传送带` 是否属于同一分类
2. `B2` 一个提交
   - `任何晶塔` placeholder 分类
3. `B3 + B4` 可合并一个提交
   - 统计收口 + 延期记录
4. `B5` 一个提交
   - 最终验收文档

---

## 7. 默认验证矩阵

### 对 `B1/B2/B3`

- `node --test scripts/data/import/import-wiki-town-npcs-to-db.test.mjs`
- `node --test scripts/data/lib/town-npc-shop-conditions.test.mjs`
- importer `--apply=false`
- importer `--apply=true`
- 报告字段核对

### 对 `B5`

在上述基础上追加：

- DB 样本核验
- API 样本核验
- 页面 smoke 样本核验

---

## 8. 之后的沟通规则

后续我按以下节奏回报，不再逐小项中断：

### 正常推进中

- 当前批次做什么
- 当前批次是否完成
- 下一批是什么

### 一个批次完成后

- commit id
- 统计变化
- 风险与剩余项

### 只有真正阻塞时

- 阻塞原因
- 为什么默认决策无法继续
- 需要你拍板的点

---

## 9. 立即执行顺序

从现在开始默认这样推进：

1. `B1：堆石器 / 逻辑门 / 传送带`
2. `B2：任何晶塔`
3. `B3：R5 统计收口`
4. `B4：R4 延期记录`
5. `B5：R6 最终验收`

---

## 10. 结论

后续不再按“小项询问”推进，而按“完整批次执行”推进。

默认策略已经固定：

- 单点 unresolved 先收
- 泛化 placeholder 单独分类
- 数值阈值延期
- 最后统一验收

除非出现新的契约级阻塞，否则我会直接按这份批次计划执行到底。
