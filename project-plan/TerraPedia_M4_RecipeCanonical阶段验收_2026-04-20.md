# TerraPedia M4 Recipe Canonical 阶段验收

日期：2026-04-20  
执行分支：`feature/npc-domain-m1-m2`

---

## 当前结论

`M4：配方与关系域闭环` 已经完成了 recipe canonical 的大部分收口，尤其是：

1. `wiki_zh` 导入摘要、provider 优先级、gap-only 与 overlap 审计面已经稳定。
2. recipe tree / editor / 管理端已经能区分 `crafting_station / environment / condition` 等关系类型。
3. 环境类关系已经从“误写进 condition lane”的方向纠偏，边界改为保留在 `recipe_stations`，并使用 `crafting_stations.station_type` 区分。
4. `Water Candle` 这类同时包含环境关系与替代站点关系的配方，运行态已经能正确表达。
5. 中文配方导入概览页已经补齐 `environmentRelationRows / alternativeStationRows` 两个关键指标，并冻结了前端类型契约。

但是，`M4` 还**不能正式标记为完成**。当前阻塞点是：

- `recipe_context_requirements` 在本地真实数据库 `terria_v1_local` 中当前为 `0` 行。
- 管理端导入概览页当前运行态显示：
  - `conditionRowCount = 0`
  - `referencedConditionCount = 0`

这意味着 recipe condition lane 虽然已经完成了接口与展示面的准备，但**真实数据尚未进入闭环**。因此本文件的结论是：

- `M4 已完成 canonical / station / environment / audit 主体收口`
- `M4 未完成 recipe condition 数据闭环`
- **暂不切入 `M5`**

---

## 本轮已完成范围

### 1. recipe canonical 审计面

已完成提交：

- `2a68a61 feat: surface recipe import canonical audit signals`
- `5a9a02a fix: align recipe import provider result metrics`
- `cdc7f5e feat: constrain recipe source providers`
- `24860eb test: freeze recipe controller response contracts`

完成内容：

- 管理端 `wiki_zh` 导入概览页已经能展示：
  - DB 配方数
  - active recipe / active result
  - gap-only active result
  - suppressed overlap
  - placeholder / unresolved 等审计指标
- recipe controller 返回契约已经有后端测试冻结，避免后续关系字段回退。

### 2. 关系边界收口

已完成提交：

- `1f1fff3 feat: expose recipe tree condition relations`
- `cb847fa feat: classify recipe environments in wiki zh import`
- `cabd5d6 fix: preserve alternative environment recipe relations`
- `885ecc8 feat: surface recipe environment labels in editor`

完成内容：

- recipe tree 已经显式透传 `stationType`
- frontend tree / editor / stations 页面已消费该类型
- 环境类关系保留在 `recipe_stations`
- `Water / Honey / Lava / Ecto Mist` 不再被错误塞进 `recipe_context_requirements`
- 替代站点语义通过 `isAlternative` 保留

### 3. 导入摘要补齐

已完成提交：

- `bec16b0 feat: audit recipe condition coverage in import overview`
- `bcc785e feat: surface recipe import relation report metrics`

完成内容：

- 管理端导入概览页已展示：
  - `conditionRowCount`
  - `referencedConditionCount`
  - `environmentRelationRows`
  - `alternativeStationRows`
- `data-query-app/types/recipeImport.ts` 已从宽泛 `Record<string, any>` 收口出 `RecipeImportLatestReport`
- 前端 typecheck fixture 已冻结新字段契约

---

## Fresh 验证证据

### 1. 前端类型检查

执行：

```powershell
cd data-query-app
pnpm run check
```

结果：

- PASS

### 2. 管理端生产构建

执行：

```powershell
cd data-query-app
pnpm run build
```

结果：

- PASS
- 仍有既有 Nuxt sourcemap / Node deprecation warning
- warning 非本轮改动引入，不阻塞构建

### 3. recipe tree 真实接口验证

执行：

```powershell
Invoke-RestMethod 'http://localhost:18088/api/items/148/recipe-tree?maxDepth=3'
```

结果：

- 目标物：`Water Candle (itemId = 148)`
- 根配方站点返回：
  - `Crystal Ball`：`stationType = "crafting_station"`
  - `Water`：`stationType = "environment"`
  - `Sink`：`isAlternative = true`

这说明：

- environment lane 与 station lane 的边界当前在运行态成立
- alternative relation 语义当前在运行态成立

### 4. 管理端页面运行态验证

页面：

- `http://localhost:3001/recipes/wiki-zh-import`

运行态可见：

- `环境关系行 = 153`
- `替代制作站行 = 626`

对应最近报告文件：

- `reports/wiki-zh-recipe-import-2026-04-19.json`

报告中的关键值：

- `insertedRecipes = 3571`
- `insertedIngredientRows = 5965`
- `insertedStationRows = 4337`
- `environmentRelationRows = 153`
- `alternativeStationRows = 626`
- `groupIngredientRows = 336`
- `unresolvedItemRowsAfterImport = 0`
- `unresolvedStationRowsAfterImport = 0`
- `importedResultItemCountInDb = 3179`

---

## 当前阻塞点

### 1. condition lane 没有真实数据

2026-04-20 在本地库 `terria_v1_local` 直接核实：

```sql
SELECT COUNT(*) FROM recipe_context_requirements;
```

结果：

- `0`

同时核实：

```sql
SELECT COUNT(*)
FROM recipe_context_requirements rc
JOIN recipes r ON r.id = rc.recipe_id
WHERE COALESCE(r.source_provider, '') = 'wiki_zh'
  AND r.deleted = 0
  AND r.status = 1;
```

结果：

- `0`

这与之前 M4 过程中用于冻结概览页契约的测试样本值 `128 / 12` 不一致。当前可以确认：

- 问题不是概览页统计公式错误
- 问题是**真实库里根本没有 recipe condition 数据**

### 2. 因此 M4 完成判定尚不成立

按照 `M4` 原计划：

- 需要讲清 `recipe / station / group / condition` 的关系边界
- 需要让后台、脚本、管理端对同一 recipe 关系的解释一致

当前 `station / environment / provider / audit` 已基本一致；但 `condition` 还没有真实数据落库，不能算“闭环完成”。

---

## M4 完成度判断

| 子项 | 当前状态 | 结论 |
| --- | --- | --- |
| recipe canonical 来源口径 | 已稳定 | 满足 |
| provider / gap-only / overlap 审计 | 已稳定 | 满足 |
| station / environment / alternative 关系边界 | 已稳定 | 满足 |
| tree / editor / 管理端关系消费 | 已稳定 | 满足 |
| recipe condition 真实数据闭环 | 未完成 | 不满足 |

结论：

- `M4` 当前完成度可视为 **大部分完成**
- 但还**不满足正式收口条件**

---

## 下一步执行焦点

下一刀应固定为：`M4-C5：recipe condition lane 收口`

建议顺序：

1. 核实当前 `wiki_zh` recipe source 中哪些条件信息还停留在源数据或中间产物中，尚未写入 `recipe_context_requirements`
2. 明确 condition 映射口径：
   - `world_context`
   - `biome`
   - `requirement_role`
3. 为 import/backfill 补一条真实写库链路
4. 补后端最小回归测试与导入摘要审计验证
5. 重新跑一次导入 apply / 页面验收 / tree 样例验收
6. 只有当 `conditionRowCount / referencedConditionCount` 在真实库中恢复为非 0 且解释一致，才允许把 `M4` 标记为完成

---

## 是否切换到 M5

当前判断：

- **不切换**

原因：

- `M4` 仍缺最后一条 condition 数据链路闭环
- 现在切到 `M5` 会把 recipe relation domain 的最后一块未收口内容继续带入后续阶段

建议：

- 继续留在 `M4`
- 直接执行 `M4-C5：recipe condition lane 收口`
