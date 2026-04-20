# TerraPedia M5 Town NPC 公开消费全面收口计划

日期：2026-04-21  
执行分支：`feature/npc-domain-m1-m2`

---

## 1. 本轮目标

把 `M5: Town NPC Public Consumption` 从“按条件类型逐步补洞”切换为“按完整收口路线连续执行”。

本计划解决两个问题：

1. 明确后续剩余工作该按什么顺序做。
2. 明确哪些验证动作属于默认执行，不再为每个单元测试、每次 typecheck、每次本地栈重启逐项征询。

---

## 2. 默认执行规则

从这份计划开始，以下动作默认视为**标准执行动作**，我会直接做，不再单独询问：

- `node --test`
- `vitest`
- `mvn -Dtest=... test`
- `pnpm run check`
- `pnpm run build`
- Town NPC importer `--apply=false`
- Town NPC importer `--apply=true`
- 本地栈 `stop/start`
- 本地 API 校验
- 本地页面 smoke 校验
- 计划文档更新与计划提交

只有出现以下真正阻塞时，我才会停下来汇总给你：

- 需要扩展新的公共契约，而当前契约选择存在明显歧义
- 需要做超出本地主库 `terria_v1_local` 的写入
- 现有 source wording 无法稳定映射到唯一 canonical 语义
- 当前切片会和既有里程碑边界冲突，导致“先做基础域再动后端”的既定规则失效

这意味着：

- 我不会再按“每个测试是否继续跑”来打断
- 我会按“切片完成时汇总一次”来回报
- 我只会在“语义建模/边界决策/异常阻塞”时统一提问

---

## 3. 当前基线

### 3.1 已完成的 M5 子切片

当前已经连续收下这些提交：

- `46a3dce feat: structure town npc public shop conditions`
- `c427b65 feat: structure town npc world shop conditions`
- `408bb22 feat: map town npc seasonal shop events`
- `dff2935 feat: surface town npc hardmode shop conditions`
- `4c55eee feat: surface town npc item shop conditions`
- `6b5296e feat: map active party shop phrases`
- `1f9793b feat: map lantern night and eclipse shop events`

目前已落地的结构化条件能力：

- `BIOME`
- `WORLD_CONTEXT`
  - `NIGHT`
  - `BLOOD_MOON`
  - `WINDY_DAY`
  - `PARTY`
  - `LANTERN_NIGHT`
  - `SOLAR_ECLIPSE`
  - `HALLOWEEN`
  - `CHRISTMAS`
  - `VALENTINES_DAY`
  - `THANKSGIVING`
  - `OKTOBERFEST`
  - 既有月相 code
- `GAME_PERIOD`
  - `hardmode`
- `ITEM`
  - possession / inventory-gated shop items

### 3.2 当前“已入库但仍未结构化”的剩余分布

基于本地库 `terria_v1_local` 当前 `npc_shop_entries + npc_shop_conditions` 统计：

- `totalNoConditionEntries = 379`

其中真正需要继续收口的，不是全部 379 条，而是以下有结构化价值的条件族：

- `BOSS_OR_EVENT_DEFEAT = 25`
- `SCORE_OR_PROGRESS = 19`
- `MOON_PHASE_RANGE = 16`
- `NPC_PRESENCE = 4`
- `TIME_OF_DAY = 3`
- `BIOME_OR_CONTEXT = 2`

其中大块 `ALWAYS_ON_OR_FREE_TEXT = 310` 不应强行结构化，默认保留 raw notes。

### 3.3 当前“源数据仍未匹配成入店项”的剩余分布

基于最新 `wiki-town-npc-import.latest.json`：

- `unmatchedShopItemCount = 54`

主要分布：

- `GENERIC_BIOME_REQUIREMENT = 20`
- `STRUCTURABLE_BUT_UNMATCHED = 16`
- `SEASONAL_OR_EVENT_ITEMS = 13`
- `HARDMODE_UNMATCHED = 1`
- `OTHER = 4`

这说明后续已经不是单一路径问题，而是两条并行尾项：

1. 已入库 shop entry 的结构化条件收口
2. 仍未匹配到 item identity 的 source item 收口

---

## 4. 总体策略

后续不再按“看到一个条件就补一个条件”的顺序推进，而按以下总规则执行：

### 规则 A：先收还能复用现有契约的条件族

优先补那些还能复用当前公共契约的条件：

- `WORLD_CONTEXT`
- `GAME_PERIOD`
- `ITEM`
- `BIOME`

这类切片风险最低，因为：

- importer 已支持
- public/admin DTO 已支持
- front label fallback 已支持

### 规则 B：需要新 refType 的条件族统一归到“契约扩展批次”

以下条件族不再零散处理，而统一进入一次“公共契约扩展”批次：

- `NPC_PRESENCE`
- `BOSS_OR_EVENT_DEFEAT`

原因：

- 它们都不是 `WORLD_CONTEXT / ITEM / GAME_PERIOD / BIOME`
- 继续把它们塞进 raw notes 会导致 M5 尾项长期不收口
- 但如果一次只扩一条，会造成反复改后端 DTO / SQL / front normalizer

因此应一次性规划并收掉

### 规则 C：数值阈值类先单列，不混进实体条件批次

`SCORE_OR_PROGRESS` 不是简单的 entity ref：

- 高尔夫分数 `>500 / >1000 / >2000`
- 这类条件本质上是“数值阈值条件”

它们与：

- `ITEM`
- `NPC`
- `WORLD_CONTEXT`

都不是同一种契约。

因此本计划把它单独列成**最后的可选扩展批次**，不与当前主收口批次混做。

### 规则 D：未匹配 item 的问题独立于条件问题处理

`unmatchedShopItems` 的本质不是“条件没结构化”，而是：

- `source item identity` 还没与本地 `items` 对齐

所以它不能夹杂在条件 parser 里继续滚大；应在 M5 后半段单独按 item identity 批次做。

---

## 5. 里程碑拆分

下面把剩余工作拆成连续执行的 6 个批次。

### M5-R1：现有契约尾项收口

目标：把仍能用既有契约表达的尾项尽量清空。

包含：

- `TIME_OF_DAY`
  - `DAY`
  - `NIGHT` 尾项归并
- `BIOME_OR_CONTEXT`
  - 发光蘑菇
  - 冰雪生物群系
- `MOON_PHASE_RANGE`
  - “月相 1–4”
  - “以下月相期间”

执行原则：

- 不新增 refType
- 优先用既有 world context / biome
- 只在确实缺 code 时新增 required world contexts

完成标准：

- 这 3 个条件族不再出现在 `noConditionEntries` 主分布里

### M5-R2：NPC presence 契约扩展

目标：把“某 NPC 在场时”从 raw notes 变成结构化关系。

包含：

- `Tax Collector 在场`
- `Pirate 在场`
- 后续同型 `X 在场`

建议建模：

- 新增 `refType = NPC`
- `ref_id` 直接指向 `npcs.id`

为什么这样做：

- 语义稳定
- 不需要为每个 NPC presence 发明一个 world context code
- 与现有 `npc_shop_conditions(ref_type, ref_id)` 结构兼容

完成标准：

- `NPC_PRESENCE` 从剩余分布中清空
- public/admin/front 都能显示关联 NPC 名称

### M5-R3：Boss / event defeat 契约扩展

目标：把“打败某 Boss / 某事件后”变成结构化条件。

先拆成两个子层：

1. `NPC defeat`
   - `Skeletron`
   - `Wall of Flesh`
   - `Lunatic Cultist`
   - `Clown`
   - `Snow Legion` 中可映射为 entity 的部分

2. `event completion`
   - `Martian Madness` 这类不适合做 `NPC`

推荐顺序：

- 先收 `NPC defeat`
- 再评估 `event completion` 是否用 `WORLD_CONTEXT` 还是单独 contract

原因：

- `NPC defeat` 能继续复用 `refType = NPC`
- `event completion` 语义不同，可能适合 `WORLD_CONTEXT`

完成标准：

- `BOSS_OR_EVENT_DEFEAT` 大头收掉
- 至少 NPC-based defeat 完整结构化

### M5-R4：数值阈值条件评估与决策

目标：决定 `SCORE_OR_PROGRESS` 是进入 M5，还是明确推迟到后续阶段。

包含：

- 高尔夫分数阈值
- 其它非 entity / non-binary progress 条件

本批次不是默认立即实现，而是先判定：

1. 是否值得扩展新契约
2. 是否会把 M5 从“Town NPC 公开消费收口”扩成“通用条件引擎”

默认策略：

- 如果只剩高尔夫分数这一类，且会引入新 schema/DTO 复杂度
- 则把它明确记录为 M5 可接受尾项，延期到后续条件引擎里程碑

### M5-R5：unmatched item reconciliation

目标：解决 `unmatchedShopItemCount = 54`。

拆分顺序：

1. `SEASONAL_OR_EVENT_ITEMS`
2. `STRUCTURABLE_BUT_UNMATCHED`
3. `GENERIC_BIOME_REQUIREMENT`
4. `HARDMODE_UNMATCHED`
5. `OTHER`

说明：

- 这一批不是条件 parser 工作
- 它是 item identity / naming alignment / source normalization 工作
- 不和前面条件契约扩展混在同一提交里

### M5-R6：总体验收与收口

目标：给 M5 一个正式“可切出”的结论。

必须输出：

- 剩余未结构化条件的最终分类
- 剩余 unmatched item 的最终分类
- 哪些属于“设计接受的 raw notes”
- 哪些属于“明确延期项”
- public 页面样本验收
- API 样本验收
- 计划与实际偏差说明

---

## 6. 建议执行顺序

后续默认按以下顺序推进：

1. `M5-R1`
2. `M5-R2`
3. `M5-R3`
4. `M5-R5`
5. `M5-R4`
6. `M5-R6`

解释：

- `R1` 先吃掉低风险尾项
- `R2/R3` 一次性做 contract expansion，避免反复改 public/admin/front
- `R5` 再处理未匹配 item
- `R4` 放后面，避免高尔夫分数一类把整个 M5 节奏拖慢
- `R6` 最后统一验收

---

## 7. 每批默认验证矩阵

今后每个切片默认按以下矩阵执行，不再逐项征询：

### 仅 parser / importer 切片

- `node --test scripts/data/lib/town-npc-shop-conditions.test.mjs`
- `node --test scripts/data/import/import-wiki-town-npcs-to-db.test.mjs`
- importer `--apply=false`
- importer `--apply=true`
- DB spot-check
- API sample-check
- page smoke-check

### 涉及 public/admin contract 的切片

在上面基础上追加：

- `pnpm exec vitest run src/tests/npc-domain-contract.spec.ts src/tests/npc-detail-entry.spec.ts src/tests/npc-public-shell.spec.ts`
- `mvn "-Dtest=AdminNpcControllerTest" test`
- `pnpm run check` in `front`
- `pnpm run build` in `front`
- `pnpm run check` in `data-query-app`

### 涉及本地运行态代码的切片

如果改动影响正在运行的 backend/front：

- 直接 `stop/start-local-stack`
- 再做 API/page 验收

---

## 8. 我后续的回报方式

从这份计划开始，我默认按以下方式回报，不再以单测为粒度打断：

### 正常执行中

只回报：

- 当前切片在做什么
- 当前切片是否已落库 / 已通过验证
- 下一个切片是什么

### 一个切片完成后

统一回报：

- commit id
- 本轮结构化了什么
- 哪些样本已验证
- 剩余分布怎么变化

### 只有阻塞时

一次性汇总：

- 阻塞点
- 为什么不能继续默认推进
- 需要你拍板的选项

---

## 9. 当前立即执行建议

基于当前剩余分布，最合理的连续执行入口是：

1. `M5-R1`
   - 先收 `TIME_OF_DAY`
   - 再收 `BIOME_OR_CONTEXT`
   - 再收 `MOON_PHASE_RANGE`
2. 然后直接进入 `M5-R2: NPC_PRESENCE`

原因：

- 这三组仍然属于“低风险、可连续推进”的 existing-contract 尾项
- 能在不扩 refType 的前提下继续压缩剩余条件尾项
- 收完它们，再做 `NPC` 契约扩展更清楚

---

## 10. 结论

后续不再按“一个条件族一个问题”临时推进，而是按这份总计划连续执行。

默认节奏改为：

- **切片级执行**
- **切片级验证**
- **切片级汇总**

而不是：

- **单测级询问**
- **命令级确认**

这份计划的作用就是把后续 M5 剩余工作统一排程，减少打断，并把“哪些该继续补、哪些该扩契约、哪些该延期”一次性定清楚。
