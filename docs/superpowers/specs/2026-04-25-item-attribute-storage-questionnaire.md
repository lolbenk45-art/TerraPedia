# Item 属性存储方案问卷
日期：2026-04-25

目标：围绕 `relation` 替代 `local` 的过程中，明确 `品质 / 基础价值 / sell / NPC 商店价格 / 掉落概率 / tooltip / description` 等字段应该落在实体表、关系表、维表还是仅保留原始值。

原则：

- 不能胡编乱造
- 所有正式字段都要有可追溯来源
- 实体固有属性不要误塞进关系表
- 关系依赖型属性不要误塞进实体表
- 展示语义和原始事实尽量分层

---

## 1. 当前已核实事实

### 1.1 品质 / 稀有度

- 爬下来的 `maint_items.raw_json` 中明确存在 `rare`
- 已核查：
  - `maint_items.total = 6146`
  - `raw_json` 含 `rare` 的 item = `2893`
- 示例：
  - `GoldWatch -> "rare": 1`
  - `LifeCrystal -> "rare": 2`
  - `DemonBow -> "rare": 1`
- 当前 `projection_items.rarity_id = 0` 行非空
- 当前系统已有独立维表：
  - `terria_v1_local.item_rarity`
  - 字段：`id / code / display_name_zh / display_name_en / sort_order`
- 当前系统已有“品质管理”页面和后端接口：
  - `data-query-app/pages/item-rarities.vue`
  - `back/.../AdminItemRarityController.java`

结论：

- “品质原始值”已经有来源
- “品质展示语义”当前是独立字典体系
- `relation` 还没把这两层打通

### 1.2 基础价值 / buy

- 爬下来的 `maint_items.raw_json` 中明确存在 `value`
- 已核查：
  - `raw_json` 含 `value` 的 item = `5267`
- 示例：
  - `IronPickaxe -> "value": 2000`
  - `GoldWatch -> "value": 10000`
  - `LifeCrystal -> "value": 75000`
- 当前 `projection_items.buy` 已从 `raw_json.value` 投影
- 当前 `projection_items.buy` 非空 = `5267`

结论：

- “基础价值”已经有明确来源
- 它更像 item 固有属性，不像关系属性

### 1.3 sell

- 当前 `projection_items.sell` 非空 = `0`
- 当前 relation 体系中还没有已确认、可审计的 `sell` 来源链
- 目前没有证据表明爬下来的 `maint_items.raw_json` 里已经有独立 `sell`

结论：

- 现阶段不能把 `sell` 当作已确认事实字段正式落库
- 如果要有 `sell`，需要明确它是：
  - 上游事实字段
  - 还是派生规则计算值

### 1.4 NPC 商店价格

- 当前 relation 中已有：
  - `item_npc_shop_relations.price_text`
- 当前 local 中已有：
  - `npc_shop_entries.price_text`
- 这是“某个 NPC 在某些条件下卖某个 item 的价格”

结论：

- 这不是 item 固有属性
- 它天然属于关系表，不应该塞回 item 基础表

### 1.5 掉落概率 / 数量

- 当前 relation 中已有：
  - `item_npc_loot_relations.quantity_min`
  - `item_npc_loot_relations.quantity_max`
  - `item_npc_loot_relations.quantity_text`
  - `item_npc_loot_relations.chance_value`
  - `item_npc_loot_relations.chance_text`

结论：

- 这是 `item + npc + 条件` 共同决定的关系属性
- 不适合放到 item 基础表

### 1.6 tooltip / description

- 当前 `local.items` 已有：
  - `description / description_zh`
  - `tooltip / tooltip_zh`
- 当前 `projection_items` 里这几项基本还是空
- 这类字段如果是“item 本身固定文案”，适合进 item
- 如果是“来源说明 / 条件说明 / 商店说明 / 掉落说明”，不适合进 item，应放关系明细

结论：

- 文本字段必须区分“实体固有文案”和“关系说明文案”

---

## 2. 本轮需要你拍板的问题

你可以直接在文档最后按 `Q1: A` 这种格式统一回答。

### A. 品质 / 稀有度建模

| 编号 | 问题 | 选项 | 推荐 | 你的答案 |
| --- | --- | --- | --- | --- |
| Q1 | `rare` 原始值应该怎么保存？ | `A` 保存在 `relation_items` 中，作为 item 固有原始事实；`B` 不单独存，只在投影层算 `rarity_id`；`C` 只保留在 `raw_json` 不显式落列 | `A` |  |
| Q2 | 品质展示语义是否继续采用独立维表？ | `A` 是，继续保留/迁移 `item_rarity` 这类维表；`B` 否，直接把品质中文/英文/排序冗余写入每条 item；`C` 先不做维表，后续再补 | `A` |  |
| Q3 | `projection_items/items.rarity_id` 的最终来源应该是什么？ | `A` 由 `relation_items.rare_raw` 映射到 `item_rarity.id`；`B` 手工维护，不强依赖爬下来的 `rare`；`C` 两套都允许，冲突时人工处理 | `A` |  |
| Q4 | 如果某些 item 没有 `rare`，是否允许 `rarity_id` 留空？ | `A` 允许留空，并进 report；`B` 不允许，必须补默认品质；`C` 给默认“普通”品质 | `A` |  |

### B. 基础价值 / buy / sell

| 编号 | 问题 | 选项 | 推荐 | 你的答案 |
| --- | --- | --- | --- | --- |
| Q5 | `value` 基础价值应该落在哪？ | `A` 落 `relation_items`，投影到 `projection_items.buy`；`B` 只放 `projection_items.buy`；`C` 单独拆成 item 价格副表 | `A` |  |
| Q6 | `sell` 在没有明确上游事实前怎么处理？ | `A` 正式结果先留空，不推断；`B` 允许按规则派生并标记 derived；`C` 直接沿用 local 的旧值过渡 | `A` |  |
| Q7 | 如果后续确认 `sell` 只能通过规则计算，是否接受“事实层不存、投影层计算”？ | `A` 接受；`B` 不接受，必须落正式列；`C` 事实层和投影层都存一份 | `A` |  |

### C. NPC 商店价格

| 编号 | 问题 | 选项 | 推荐 | 你的答案 |
| --- | --- | --- | --- | --- |
| Q8 | NPC 商店价格是否明确只放关系表，不回填 item？ | `A` 是，只保留在 `item_npc_shop_relations`；`B` 除关系表外，还回填 item 的一个“常见商店价”；`C` 只回填 item，不保留关系价 | `A` |  |
| Q9 | `price_text` 是否需要继续保留文本原貌？ | `A` 保留原始文本，同时后续可补结构化；`B` 不保留文本，只保留解析后的数值；`C` 只保留原文，不做结构化 | `A` |  |

### D. 掉落概率 / 数量

| 编号 | 问题 | 选项 | 推荐 | 你的答案 |
| --- | --- | --- | --- | --- |
| Q10 | 掉落概率和数量是否明确只放关系表？ | `A` 是，只放 `item_npc_loot_relations`；`B` 同时回填 item 聚合字段；`C` 只做 item 级聚合，不保留明细关系 | `A` |  |
| Q11 | 后续是否允许增加“聚合视图字段”，例如 item 总掉落来源数，但不影响明细关系事实？ | `A` 允许，只能放 projection 或汇总表；`B` 不允许；`C` 仅对少数页面需要时加 | `A` |  |

### E. tooltip / description

| 编号 | 问题 | 选项 | 推荐 | 你的答案 |
| --- | --- | --- | --- | --- |
| Q12 | `tooltip / description` 如果是 item 固有文案，是否进入 item 实体/投影层？ | `A` 是；`B` 否，只保留在外部页面或 JSON；`C` 只进 projection，不进 relation item | `A` |  |
| Q13 | 来源说明、条件说明、商店说明、掉落说明是否禁止混进 item 固有文案？ | `A` 禁止，必须进关系明细；`B` 允许混合；`C` 视字段缺口临时混放 | `A` |  |
| Q14 | 中文 tooltip/description 在没有可证来源时怎么处理？ | `A` 留空并进 report；`B` 允许用 local 过渡；`C` 人工维护少量高频项 | `A` |  |

### F. relation 替代 local 时的总口径

| 编号 | 问题 | 选项 | 推荐 | 你的答案 |
| --- | --- | --- | --- | --- |
| Q15 | 这批字段的总体落层策略是否采用“三分法”？ | `A` 实体固有属性进 item；关系依赖属性进 relation 表；展示语义进维表；`B` 尽量都进 item；`C` 尽量都拆成独立表 | `A` |  |
| Q16 | 是否同意 relation 事实层保留“原始值/原始文本”，projection 再做 local-compatible 映射？ | `A` 同意；`B` 不同意，直接只维护 projection；`C` 按字段逐个决定 | `A` |  |

---

## 3. 建议默认答案

如果你想直接统一拍板，我建议默认采用：

```text
Q1: A
Q2: A
Q3: A
Q4: A
Q5: A
Q6: A
Q7: A
Q8: A
Q9: A
Q10: A
Q11: A
Q12: A
Q13: A
Q14: A
Q15: A
Q16: A
```

这套答案对应的核心口径是：

- `rare/value` 作为 item 固有事实进入实体层
- `rarity` 展示语义由独立维表维护
- `sell` 没证据先不正式落库
- NPC 商店价格、掉落概率、掉落数量都严格留在关系表
- item 固有 tooltip/description 才能进入 item，关系说明文案不得混放

---

## 4. 回答模板

```text
Q1: A
Q2: A
Q3: A
Q4: A
Q5: A
Q6: A
Q7: A
Q8: A
Q9: A
Q10: A
Q11: A
Q12: A
Q13: A
Q14: A
Q15: A
Q16: A
```

如果你还想补充额外约束，也可以直接加：

```text
额外要求1:
额外要求2:
不能接受的做法:
允许的过渡方案:
```
