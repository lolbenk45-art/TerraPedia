# TerraPedia M4 Recipe Canonical 收口验收

日期：2026-04-20  
执行分支：`feature/npc-domain-m1-m2`

---

## 收口结论

`M4：配方与关系域闭环` 现在可以正式标记为完成。

最终判断依据不是“`recipe_context_requirements` 是否非 0”，而是：

1. 当前 `wiki_zh` recipe canonical 的来源、关系边界、导入审计和运行态解释已经一致。
2. 当前中文 wiki recipe source 中，条件型要求并没有作为独立 `condition page / condition field` 出现。
3. 当前 source 中的“看起来像条件”的要求，实际已经以 `environment` 关系形式落在 `recipe_stations`。
4. 因此 `recipe_context_requirements = 0` 对于当前 `wiki_zh` source 来说是**事实状态**，不是导入失败。

所以：

- `M4` 已完成
- 下一步可以切到 `M5`

---

## 与阶段验收结论的差异

前一份文档 [TerraPedia_M4_RecipeCanonical阶段验收_2026-04-20.md](G:/ClaudeCode/TerraPedia-dev/project-plan/TerraPedia_M4_RecipeCanonical阶段验收_2026-04-20.md) 曾把 `conditionRowCount = 0` 暂时判成阻塞项。

在补做 source audit 后，这个判断被修正为：

- **不是 condition 数据掉了**
- **而是当前 `wiki_zh` recipe source 本来就没有独立 condition lane**

---

## 修正依据

### 1. 当前 `wiki_zh` recipe pages 只覆盖站点/环境页

本地最新源文件：

- `data/generated/wiki-zh-recipe-pages.latest.json`

当前共 `41` 个 pageTitle，核心页包含：

- `配方/工作台`
- `配方/徒手`
- `配方/放置的瓶子`
- `配方/灵雾`
- `配方/蜂蜜`
- `配方/熔岩`
- `配方/水`

没有发现当前 source 中存在独立抓取到的：

- `配方/墓地`
- `配方/夜晚`
- `配方/雨天`
- `配方/腐化`
- `配方/猩红`
- `配方/神圣`

这说明当前 recipe page crawl 本身就是“站点/环境页集合”，而不是“站点页 + condition 页集合”。

### 2. 当前 parser 结构没有 condition 输入位

当前抓取输出的 table / row 结构只有：

- page 级：
  - `pageTitle`
  - `sections`
  - `recipeTables`
- table 级：
  - `caption`
  - `stations`
  - `stationRequirementMode`
  - `rows`
- row 级：
  - `resultName`
  - `resultQuantity`
  - `versionScope`
  - `ingredients`

没有任何现成字段承载：

- `worldContext`
- `biome`
- `conditionRef`
- `contextRequirements`

因此 import 层当前不写 `recipe_context_requirements` 是符合 source 事实的。

### 3. 官方中文 wiki 的“墓地类配方”实际写成环境关系

官方中文 wiki 条目 [破旧木标牌](https://terraria.wiki.gg/zh/wiki/%E7%A0%B4%E6%97%A7%E6%9C%A8%E6%A0%87%E7%89%8C) 的说明文会说：

- 该物品可在墓地附近制作

但其配方表写法是：

- `工作台 和 灵雾`

这和当前 M4 关系边界完全一致：

- `墓地` 的 recipe 语义在 source 中被折叠为 `灵雾`
- `灵雾` 属于 `environment`
- 不应进入 `recipe_context_requirements`

### 4. 官方中文 wiki 已有独立环境 recipe 页

当前官方中文 wiki 可直接命中的独立 recipe page 包括：

- [配方/灵雾](https://terraria.wiki.gg/zh/wiki/%E9%85%8D%E6%96%B9/%E7%81%B5%E9%9B%BE)

这进一步证明当前 source 的表达方式是：

- 用独立环境页表达 recipe requirement
- 而不是用独立 condition lane 表达

---

## M4 已完成内容

### 1. canonical 与 provider 审计

已完成提交：

- `2a68a61 feat: surface recipe import canonical audit signals`
- `5a9a02a fix: align recipe import provider result metrics`
- `cdc7f5e feat: constrain recipe source providers`
- `24860eb test: freeze recipe controller response contracts`

结果：

- 管理端已能稳定展示 provider 优先级、gap-only、suppressed overlap、placeholder、unresolved 等 canonical 审计面
- recipe controller 返回契约已冻结

### 2. recipe relation 边界

已完成提交：

- `1f1fff3 feat: expose recipe tree condition relations`
- `cb847fa feat: classify recipe environments in wiki zh import`
- `cabd5d6 fix: preserve alternative environment recipe relations`
- `885ecc8 feat: surface recipe environment labels in editor`

结果：

- `crafting_station / environment / condition` 的关系消费端已打通
- 当前 `wiki_zh` source 的环境类关系保留在 `recipe_stations`
- `isAlternative` 语义得到保留

### 3. 导入摘要与前端契约

已完成提交：

- `bec16b0 feat: audit recipe condition coverage in import overview`
- `bcc785e feat: surface recipe import relation report metrics`

结果：

- 导入概览页已展示：
  - `environmentRelationRows`
  - `alternativeStationRows`
  - `conditionRowCount`
  - `referencedConditionCount`
- 前端类型从宽泛 `any` 收口为显式 `RecipeImportLatestReport`

---

## Fresh 验证证据

### 1. 前端验证

执行：

```powershell
cd data-query-app
pnpm run check
pnpm run build
```

结果：

- PASS

### 2. tree 运行态验证

执行：

```powershell
Invoke-RestMethod 'http://localhost:18088/api/items/148/recipe-tree?maxDepth=3'
```

样例：

- `Water Candle (itemId = 148)`

返回站点关系：

- `Crystal Ball` -> `stationType = "crafting_station"`
- `Water` -> `stationType = "environment"`
- `Sink` -> `isAlternative = true`

说明：

- 当前 source 中 environment / alternative 解释在运行态成立

### 3. 管理端页面运行态验证

页面：

- `http://localhost:3001/recipes/wiki-zh-import`

当前可见：

- `环境关系行 = 153`
- `替代制作站行 = 626`
- `conditionRowCount = 0`
- `referencedConditionCount = 0`

结合 source audit 后，后两项现在解释为：

- 当前 source 无独立 condition 输入
- 0 为真实状态，不是异常状态

### 4. 最近导入报告

报告文件：

- `reports/wiki-zh-recipe-import-2026-04-19.json`

关键值：

- `insertedRecipes = 3571`
- `insertedIngredientRows = 5965`
- `insertedStationRows = 4337`
- `environmentRelationRows = 153`
- `alternativeStationRows = 626`
- `unresolvedItemRowsAfterImport = 0`
- `unresolvedStationRowsAfterImport = 0`
- `importedResultItemCountInDb = 3179`

---

## M4 完成判定

| 子项 | 当前状态 | 结论 |
| --- | --- | --- |
| recipe canonical 来源口径 | 已稳定 | 满足 |
| provider / gap-only / overlap 审计 | 已稳定 | 满足 |
| station / environment / alternative 边界 | 已稳定 | 满足 |
| tree / editor / 管理端关系消费 | 已稳定 | 满足 |
| 当前 source 对 condition lane 的真实解释 | 已明确 | 满足 |

最终结论：

- **`M4` 已完成**

---

## 下一步

下一步切入：

- `M5：NPC 公开消费闭环`

建议顺序：

1. 先锁公开 NPC aggregate 的真实入口和字段口径
2. 再检查 public list / detail 当前消费是否仍混用旧字段
3. 用 M3 已经稳定的 Town NPC maintenance 结果作为公开消费面的上游事实源
