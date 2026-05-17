# Buff Parser 多 Agent 继续审计 - 2026-05-15

## 一句话结论

parser 补丁本身可以继续往下走。

多 agent 和主线程只读审计后的判断是：

- 388 个缓存 buff 页面里，没有再发现本轮定义的高风险解析错误。
- 新 audit gate 收紧后，当前标准化数据只暴露 3 条旧问题。
- 这 3 条旧问题用新 parser 读取缓存时都能解析出来。
- 所以下一步重点不是继续扩页面，而是做小范围、可回滚的数据刷新验证。

## 多 Agent 分工

| Agent | 看什么 | 结论 |
| --- | --- | --- |
| A | 388 个 buff 页面缓存的解析风险 | 没有命中高风险样本 |
| B | 当前 `data/standardized/buffs.standardized.json` 在新 gate 下会暴露什么 | 388 条里 3 条非 complete |
| C | 当前 parser/audit 补丁代码风险 | 没有阻塞风险，测试覆盖足够支撑本轮合入 |

## 388 个缓存页面扫描结果

扫描对象：

- `data/generated/buff-page-evidence-cache/*.json`

总数：

- 388 个页面缓存

高风险命中：

| 风险规则 | 命中数量 |
| --- | ---: |
| `parseStatus !== parsed` | 0 |
| `sourceItems` / `inflictingNpcs` 出现纯数字、难度、版本说明 | 0 |
| 有 `From item` 但 `sourceItems=0` | 0 |
| 有 `From NPCs` 但 `inflictingNpcs=0` | 0 |
| 有 `From enemy` 但 `inflictingNpcs=0` | 0 |
| 有 `From player/item/environment` 但 `sourceItems=0` | 0 |

直观解释：

这说明本次修的三个主要问题没有在缓存样本里继续复发：

- `From item` 已能解析。
- `From NPCs` 已能解析。
- `20 / 10 / Expert Mode / 版本说明` 没再混进结构化事实。

## 当前标准化数据暴露的问题

扫描对象：

- `data/standardized/buffs.standardized.json`

总数：

- 388 条 buff 标准化记录

新 audit gate 分类：

| 分类 | 数量 |
| --- | ---: |
| complete | 385 |
| missing_source_items | 2 |
| missing_inflicting_npcs | 1 |
| missing_full_immune_npcs | 0 |
| missing_source_evidence | 0 |
| parse_required | 0 |
| manual_review_required | 0 |

暴露出来的 3 条旧问题：

| Buff | 当前标准化数据问题 | 新 parser 读取缓存后的结果 |
| --- | --- | --- |
| Potion Sickness | wiki 有 `From item`，标准化里 `sourceItems=0` | 能解析出 12 个来源物品 |
| Mana Sickness | wiki 有 `From item`，标准化里 `sourceItems=0` | 能解析出 6 个来源物品 |
| Shadowflame | wiki 有 `From NPCs`，标准化里 `inflictingNpcs=0` | 能解析出 `Clothier` |

## 3 条旧问题的解析明细

### Potion Sickness

新 parser 从缓存解析结果：

- 来源物品：12
- 来源 NPC：0
- 免疫 NPC：0
- 解析状态：`parsed`

来源物品：

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

### Mana Sickness

新 parser 从缓存解析结果：

- 来源物品：6
- 来源 NPC：0
- 免疫 NPC：0
- 解析状态：`parsed`

来源物品：

- Lesser Mana Potion
- Mana Potion
- Lesser Restoration Potion
- Greater Mana Potion
- Super Mana Potion
- Restoration Potion

### Shadowflame

新 parser 从缓存解析结果：

- 来源物品：4
- 来源 NPC：1
- 免疫 NPC：30
- 解析状态：`parsed`

来源 NPC：

- Clothier

来源物品：

- Dark Lance
- Shadowflame Knife
- Shadowflame Bow
- Shadowflame Hex Doll

## 重要边界

这次审计没有做这些：

- 没有跑 crawler。
- 没有写数据库。
- 没有改 `data/standardized/buffs.standardized.json`。
- 没有把缓存解析结果应用到标准化数据。
- 没有扩大 buff 页面功能。

## 还有哪些不该混在这次做

缓存里还有一些章节，比如：

- `From debuff`
- `From Traveling Merchant`
- `From Skeleton Merchant`
- `Self-induced`

多 agent 判断：

- `From debuff` 当前没有表现出本轮高风险漏解析。
- `From Traveling Merchant` / `From Skeleton Merchant` 更像商人来源链，不应该混进 buff 施加来源规则。
- 这些可以后续单独建链审计，不建议在本轮 parser 修复里顺手扩大。

## 下一步建议

P0：

先做一个小范围数据刷新验证，只针对这 3 条：

- `PotionSickness`
- `ManaSickness`
- `ShadowFlame`

建议流程：

1. 先 dry-run 或输出到临时路径，确认只会改变这 3 条。
2. 人工看 diff。
3. 再决定是否写回 `data/standardized/buffs.standardized.json`。

P1：

如果 3 条刷新稳定，再扩大到包含 `From item` / `From NPCs` 的相关 buff，而不是直接全量。

P2：

另起一条审计任务处理商人来源、`From debuff`、`Self-induced` 这类非标准原因章节。

## 当前判断

当前不建议继续写 UI。

当前建议继续做数据准确性闭环：

1. parser 补丁保留。
2. audit gate 补丁保留。
3. 小范围刷新验证 3 条旧标准化数据。
4. 人工审核 diff 后再决定是否提交数据更新。

