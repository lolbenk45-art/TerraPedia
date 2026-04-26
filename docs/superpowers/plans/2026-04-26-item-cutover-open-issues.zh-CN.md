# Item Cutover 剩余问题汇总

**日期：** 2026-04-26

**用途：** 在生成最终里程碑前，把当前剩余问题、风险和默认处理口径统一收敛成中文文档，避免后续执行阶段重复发散。

---

## 当前已确认状态

- `projection_npcs`、`projection_projectiles`、`projection_buffs` 已达到可替换状态。
- `projection_items` 已经没有字段层面的阻塞项。
- `projection_items.image` 当前已经通过“`maint` 优先 + `local.items.image` 临时兜底”补齐共享行。
- `projection_items` 之所以仍然是 `blocked`，原因不再是字段缺失，而是**行集合与 `local.items` 不完全一致**。
- 最新 readiness 结论：
  - `items.status = blocked`
  - `items.blockingFields = none`
  - `items.missingInProjection = 3`
  - `items.extraInProjection = 10`

---

## 剩余阻塞问题

### 1. 有 3 条 `local.items` 行没有 maint 来源链

具体行：

- `ZH_RECIPE_BLUE_JELLYFISH_BAIT`
- `ZH_RECIPE_GREEN_JELLYFISH_BAIT`
- `ZH_RECIPE_PINK_JELLYFISH_BAIT`

已确认事实：

- 在 `terria_v1_local.items` 中存在
- 在 `terria_v1_maint.maint_items` 中不存在
- 在 `terria_v1_maint.maint_item_page_recipes` 中不存在
- 在 `terria_v1_maint.maint_recipe_page_recipes` 中不存在
- 在 `data/standardized/items.standardized.json` 中不存在

含义：

- 这 3 条目前**不能从现有 maint / standardized 链重建出来**
- 它们本质上更像是 local 历史遗留兼容行，而不是当前正式来源链中的实体

当前默认口径：

- 在规划阶段先把它们视为**行集合例外项**
- 不在本轮重新发明上游来源，后续只在“是否纳入严格替换验收”上做决策

---

### 2. 有 10 条 `projection_items` 行来源过弱，不在 `local.items`

具体行：

- `Fake_newchest1`
- `Fake_newchest2`
- `OgreMask`
- `GoblinMask`
- `GoblinBomberCap`
- `EtherianJavelin`
- `KoboldDynamiteBackpack`
- `BoringBow`
- `BossBagOgre`
- `BossBagDarkMage`

已确认事实：

- 在 `terria_v1_maint.maint_items` 中存在
- 在 `terria_v1_relation.relation_items` 中存在
- 在 `terria_v1_relation.projection_items` 中存在
- 在 `terria_v1_local.items` 中不存在
- 在 `data/standardized/items.standardized.json` 中不存在
- 来源链都是：
  - `terraria.wiki.gg`
  - `Module:Iteminfo/data`
  - `wiki.module.iteminfo`
- 这批行的 `raw_json` 大多只有 `id + internalName`
- `english_name` 基本为空

含义：

- 这 10 条虽然“有 maint landing 来源”，但**来源强度不够**
- 更像是弱来源残留、候选实体或未被 local 接纳的行
- 它们不适合继续作为“严格替换 local.items”的正式投影输出

当前默认口径：

- 在规划阶段默认这 10 条应该被视为**projection 过滤候选**
- 除非后面补出更强的正式来源链，否则不建议保留在 strict cutover 的最终口径中

---

### 3. 当前图片对齐仍依赖临时 `local.image` 兜底

已确认事实：

- 当前共享行图片已经补齐
- 但其中一部分不是来自 `maint_item_images`
- 而是来自 `local.items.image` 的临时 fallback
- 后台 wiki page refresh 仍在继续，后续 `maint_item_images` 可能还会上涨

含义：

- 当前图片口径是“可用”的，但不是“最终纯 maint 架构”
- 如果后面 wiki 图片继续补齐，relation 重建后图片来源还会继续变化

当前默认口径：

- 现阶段保留 `local.image` fallback，不阻塞当前 cutover 推进
- 后续单独再做一次“maint-only image 覆盖率复盘”，而不是现在回退这条临时链

---

### 4. 需要区分两种验收模式

已确认事实：

- 如果把这 `3 missing + 10 extra` 排除掉，`projection_items` 已经满足字段替换要求
- 如果要求 `projection_items` 与 `local.items` 严格逐行完全一致，那么当前仍然不达标

含义：

- 后续里程碑不能再只写“是否能替换”
- 必须明确区分：
  - **有效替换（effective replacement）**
  - **严格替换（strict replacement）**

当前默认口径：

- 规划时两条线都保留
- 执行优先级上先收敛 strict cutover 的剩余 13 条行差异

---

## 这轮是否需要你回答不确定问题

结论：**本轮规划阶段不需要你逐条回答。**

处理原则如下：

- 能靠现有代码、数据库、报告确认的，我直接确认并写入文档
- 不能确认但不影响里程碑拆解的，我会写成“默认假设”
- 真正影响最终替换口径、但当前无法由事实自动判定的，我会写成“决策点”，先进入文档，不在规划阶段中断你

也就是说：

- **现在不需要你逐条拍板**
- 我会先把问题文档和里程碑生成出来
- 后面执行到对应里程碑时，再按默认口径推进

---

## 当前默认假设

为避免规划阶段停滞，当前采用以下默认假设：

1. `3 missing` 暂按 local 历史兼容行处理，不立刻扩展 maint 上游链。
2. `10 extra` 暂按 weak-source residue 处理，优先考虑从 projection 严格口径中过滤。
3. `local.image` fallback 当前允许继续存在，不阻塞 item cutover 推进。
4. 后续最终报告必须分别给出：
   - strict replacement 状态
   - effective replacement 状态
   - maint-only image 状态

---

## 下一步里程碑规划焦点

后续里程碑不再重开已经完成的字段补全工作，而只聚焦在下面 3 件事：

1. `3 missing + 10 extra` 的行集合收口
2. strict / effective 两种 cutover 验收模式显式化
3. `image` 临时 fallback 的后续退场路径
