# Buff Parser 人工审核报告 - 2026-05-15

## 人工审核结论

用户已确认：

```text
PotionSickness：通过
ManaSickness：通过
ShadowFlame：通过
```

本轮不是审核 388 条全量数据。  
实际人工通过并写回本地标准化数据的只有 3 条。

写回范围：

- `data/standardized/buffs.standardized.json`
- 只更新 `PotionSickness`、`ManaSickness`、`ShadowFlame`
- 未写数据库
- 未跑 crawler
- 未联网抓取，使用本地缓存页面证据

## 必须人工审核的数据

| # | Buff | 原问题 | 写回结果 | 动作 | 你的审核结论 |
| ---: | --- | --- | --- | --- | --- |
| 1 | Potion Sickness / `PotionSickness` | `sourceItems=0`，但 wiki 有 `From item` | 已写入 12 个来源物品 | 已接受新增 | 已通过 |
| 2 | Mana Sickness / `ManaSickness` | `sourceItems=0`，但 wiki 有 `From item` | 已写入 6 个来源物品 | 已接受新增 | 已通过 |
| 3 | Shadowflame / `ShadowFlame` | `inflictingNpcs=0`，但 wiki 有 `From NPCs` | 已写入 `Clothier` | 已接受新增 | 已通过 |

## 字段级变更对比

| Buff | 字段 | 写回前标准化值 | 已写回值 | 数量变化 | 结论 |
| --- | --- | --- | --- | ---: | --- |
| Potion Sickness | `sourceItems` | 空 | Mushroom, Eggnog, Bottled Water, Restoration Potion, Bottled Honey, Honeyfin, Lesser Healing Potion, Healing Potion, Greater Healing Potion, Jungle Juice, Super Healing Potion, Strange Brew | 0 -> 12 | 已写入 |
| Potion Sickness | `inflictingNpcs` | 空 | 空 | 0 -> 0 | 不变 |
| Potion Sickness | `immuneNpcCount` | 0 | 0 | 0 -> 0 | 不变 |
| Mana Sickness | `sourceItems` | 空 | Lesser Mana Potion, Mana Potion, Lesser Restoration Potion, Greater Mana Potion, Super Mana Potion, Restoration Potion | 0 -> 6 | 已写入 |
| Mana Sickness | `inflictingNpcs` | 空 | 空 | 0 -> 0 | 不变 |
| Mana Sickness | `immuneNpcCount` | 0 | 0 | 0 -> 0 | 不变 |
| Shadowflame | `sourceItems` | Dark Lance, Shadowflame Knife, Shadowflame Bow, Shadowflame Hex Doll | Dark Lance, Shadowflame Knife, Shadowflame Bow, Shadowflame Hex Doll | 4 -> 4 | 不变 |
| Shadowflame | `inflictingNpcs` | 空 | Clothier | 0 -> 1 | 已写入 |
| Shadowflame | `immuneNpcCount` | 30 | 30 | 30 -> 30 | 不变 |

## 逐条审核

### 1. Potion Sickness

审核重点：

- 确认下面这些物品是否都应该作为 `Potion Sickness` 的来源物品写入。
- 它们来自 wiki 页面 `From item` 章节。
- 新 parser 状态：`parsed`

建议结论：

- 已通过，已写回本地标准化数据。

已写入 `sourceItems`：

- Mushroom
- Eggnog
- Bottled Water
- Restoration Potion
- Bottled Honey
- Honeyfin
- Lesser Healing Potion
- Healing Potion
- Greater Healing Potion
- Jungle Juice
- Super Healing Potion
- Strange Brew

不涉及变更：

- `inflictingNpcs` 仍为空。
- `immuneNpcCount` 仍为 0。

### 2. Mana Sickness

审核重点：

- 确认下面这些物品是否都应该作为 `Mana Sickness` 的来源物品写入。
- 它们来自 wiki 页面 `From item` 章节。
- 新 parser 状态：`parsed`

建议结论：

- 已通过，已写回本地标准化数据。

已写入 `sourceItems`：

- Lesser Mana Potion
- Mana Potion
- Lesser Restoration Potion
- Greater Mana Potion
- Super Mana Potion
- Restoration Potion

不涉及变更：

- `inflictingNpcs` 仍为空。
- `immuneNpcCount` 仍为 0。

### 3. Shadowflame

审核重点：

- 确认 `Clothier` 是否应该作为 `Shadowflame` 的来源 NPC 写入。
- 它来自 wiki 页面 `From NPCs` 章节。
- 新 parser 状态：`parsed`

建议结论：

- 已通过，已写回本地标准化数据。

原因：

- 这条会影响 buff 与 NPC 的关系展示。
- `Clothier` 是 NPC 名称，语义上要确认页面表达的是“该 NPC 会施加 Shadowflame”。
- `sourceItems` 和 `immuneNpcCount` 没有变化。

已写入 `inflictingNpcs`：

- Clothier

不涉及变更：

- `sourceItems` 仍是 Dark Lance、Shadowflame Knife、Shadowflame Bow、Shadowflame Hex Doll。
- `immuneNpcCount` 仍为 30。

## 建议人工抽查队列

下面这些不是本轮必须写入的数据，也不是已确认错误。  
它们只是后续建议抽查的边界样本。

| # | 页面 | parser 数量 | 为什么建议抽查 |
| ---: | --- | --- | --- |
| 1 | Confused | source=9, inflicting=7, immune=220 | 有 `From debuff`、`Vulnerable NPCs` 边界章节 |
| 2 | Roller Skates | source=0, inflicting=0, immune=0 | 有 `From Traveling Merchant` / `From Skeleton Merchant`，属于商人来源链 |
| 3 | Brain of Confusion | source=0, inflicting=0, immune=0 | 主章节是 `Inflicting Confused on enemies`，不是标准 `Causes` |
| 4 | Poisoned | source=11, inflicting=13, immune=159 | `Queen Bee` 在来源 NPC 中重复，可能是不同攻击行，也可能需要合并策略 |
| 5 | Hellfire | source=17, inflicting=0, immune=59 | `Flameburst Tower` 在来源物品中重复，可能是不同等级/形态 |
| 6 | Cursed | source=0, inflicting=9, immune=0 | 有 `From debuff` 非标准原因章节 |
| 7 | Darkness | source=0, inflicting=12, immune=0 | 有 `From debuff` 非标准原因章节 |
| 8 | Silenced | source=0, inflicting=7, immune=0 | 有 `From debuff` 非标准原因章节 |
| 9 | Slow | source=0, inflicting=9, immune=0 | 有 `From debuff` 非标准原因章节 |
| 10 | Suffocation | source=6, inflicting=0, immune=0 | 有 `Self-induced` 非标准来源章节 |
| 11 | Warmth Potion | source=0, inflicting=0, immune=0 | 有 `Affected entities`，更像适用对象，不是来源 |
| 12 | Lucky (buff) | source=0, inflicting=0, immune=0 | 有 `Causes`，但没有标准 From 子章节 |

## 本轮不要混在一起做的事

不要把下面这些和 3 条必审数据混在同一个数据更新里：

- 不要直接刷新 388 条全量 buff。
- 不要把 `From Traveling Merchant` / `From Skeleton Merchant` 当成 buff 施加来源写进去。
- 不要把 `From debuff`、`Self-induced`、`Affected entities` 临时塞进现有 parser 规则。
- 不要把重复项直接删掉，先确认是否代表不同攻击、不同形态或不同来源行。

## 建议你怎么审核

本轮人工审核已经完成。

后续如果继续做数据刷新，建议不要直接全量刷新；先针对新的 audit 缺口或人工确认清单做小范围验证。

## 写回后验证

写回后本地 audit 分类：

| 分类 | 数量 |
| --- | ---: |
| complete | 388 |
| 非 complete | 0 |

三条写回结果：

| Buff | 写回后结果 |
| --- | --- |
| PotionSickness | `sourceItemCount=12`，`sourceSections=["From item"]` |
| ManaSickness | `sourceItemCount=6`，`sourceSections=["From item"]` |
| ShadowFlame | `inflictingNpcs=["Clothier"]`，`sourceSections=["From player","From NPCs","Immune NPCs"]` |
