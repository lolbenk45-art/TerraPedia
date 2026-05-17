# Buff 解析准确性修复说明 - 2026-05-15

## 一句话结论

这次没有继续扩展 buff 页面，也没有改数据库。

本次只修了 buff 数据解析链路里最影响准确性的三个点：

1. 能识别 wiki 页面里的 `From item`。
2. 能识别 wiki 页面里的 `From NPCs`。
3. 不再把 `20`、`10`、`Expert Mode`、版本说明这类内容当成物品或 NPC。

同时 audit gate 也收紧了：如果 wiki 页面明明有 `From item` / `From NPCs` 这类来源章节，系统不能再因为结果是 `section_missing` 就当作解析成功。

## 这次实际解决的问题

| 问题 | 之前的表现 | 现在的表现 |
| --- | --- | --- |
| `From item` 不识别 | `Potion Sickness` 页面有来源物品，但系统解析成 0 个 | 现在能解析出 12 个来源物品 |
| `From NPCs` 不识别 | `Shadowflame` 页面有 NPC 来源，但系统解析成 0 个 | 现在能解析出 `Clothier` |
| 数字混进 NPC | `Chilled` 把 `20 / 10 / 20` 当成 NPC | 现在只保留 6 个真实 NPC |
| audit gate 误放行 | `section_missing` 可以冒充解析成功 | 有来源章节证据时，空结果不会再直接放行 |

## 5 个样本现在的结果

| 样本 | 来源物品 | 来源 NPC | 免疫 NPC | 当前判断 |
| --- | ---: | ---: | ---: | --- |
| Cursed Inferno | 7 | 3 | 26 | 正常 |
| Potion Sickness | 12 | 0 | 0 | 正常，来源来自 `From item` |
| Chilled | 2 | 6 | 0 | 正常，数字已经过滤 |
| Hellfire | 17 | 0 | 59 | 正常，但来源物品身份仍建议后续复核 |
| Shadowflame | 4 | 1 | 30 | 正常，`From NPCs` 已识别 |

## 你能直接对照看的明细

### Potion Sickness

之前的问题：

- wiki 页面有 `From item`。
- 系统不认识这个章节。
- 所以 `sourceItems=0`，但还标记 `parseStatus=parsed`。

现在的结果：

- 来源物品数量：12
- 解析状态：`parsed`
- 来源章节：`From item`

解析到的来源物品：

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

### Chilled

之前的问题：

- wiki 表格里有难度时间：`20`、`10`、`20`。
- 这些数字链接指向 `Expert Mode`。
- 系统把这些数字错当成来源 NPC。

现在的结果：

- 来源物品/环境：2
- 来源 NPC：6
- 解析状态：`parsed`

现在保留的来源 NPC：

- Ice Slime
- Spiked Ice Slime
- Ice Bat
- Ice Golem
- Icy Merman
- Ice Queen

现在保留的环境来源：

- Water
- Shimmer

### Shadowflame

之前的问题：

- wiki 页面有 `From NPCs`。
- 系统只认 `From enemy`，不认 `From NPCs`。
- 所以 NPC 来源被漏掉，但页面仍被当作解析成功。

现在的结果：

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

## 改了哪些文件

| 文件 | 作用 |
| --- | --- |
| `scripts/data/fetch/buff-immunity-page-parser.mjs` | 修 parser：新增章节别名，过滤非实体链接 |
| `scripts/data/fetch/buff-immunity-page-parser.test.mjs` | 新增 parser 回归测试 |
| `scripts/data/audit/audit-buff-domain-coverage-baseline.mjs` | 修 audit gate：收紧 `section_missing` 放行条件 |
| `scripts/data/audit/audit-buff-domain-coverage-baseline.test.mjs` | 新增 audit gate 回归测试 |

## 已跑过的验证

| 命令 | 结果 |
| --- | --- |
| `node --test scripts/data/fetch/buff-immunity-page-parser.test.mjs scripts/data/audit/audit-buff-domain-coverage-baseline.test.mjs` | 28 个测试通过 |
| `node --test scripts/data/fetch/refresh-target-buff-page-evidence.test.mjs scripts/data/fetch/refresh-buff-page-evidence-batch.test.mjs` | 9 个测试通过 |
| `node --test scripts/data/fetch/fetch-wiki-buffs.test.mjs` | 5 个测试通过 |
| `git diff --check` | 通过 |

## 现在还没有做的事

这次没有做这些：

- 没有重新跑全量 buff 刷新。
- 没有写入 `data/standardized/buffs.standardized.json`。
- 没有写数据库。
- 没有改前端页面。
- 没有扩大 buff 页面功能。

## 剩余风险

| 风险 | 说明 | 建议 |
| --- | --- | --- |
| 只验证了 5 个代表样本 | 这 5 个能覆盖本次已知问题，但不能代表全部 buff 页面形态 | 下一步用小批量 dry-run 看更多 buff |
| Hellfire 来源物品仍有身份复核价值 | 现在能解析，但其中一些来源是不是应该算物品、环境、召唤物或机关，后续要做身份对齐 | 后续做 item identity 审核 |
| audit gate 会暴露更多旧问题 | `section_missing` 不再随便放行后，旧数据里可能出现更多缺失项 | 这是好事，说明错误不会再被藏起来 |

## 下一步建议

P0：

- 用当前 parser 对更多 buff 做只读 dry-run。
- 不写数据，只看哪些页面还有 `parse_incomplete` 或明显错项。

P1：

- 对 Hellfire 这类复杂来源做身份复核。
- 把来源拆得更准：玩家物品、环境、NPC、机关、召唤物。

P2：

- 确认 dry-run 结果稳定后，再决定是否刷新 `data/standardized/buffs.standardized.json`。

