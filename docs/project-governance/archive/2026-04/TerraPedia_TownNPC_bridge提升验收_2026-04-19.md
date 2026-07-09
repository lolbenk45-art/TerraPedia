# TerraPedia Town NPC Bridge 提升验收

日期：2026-04-19  
执行分支：`feature/npc-domain-m1-m2`

---

## 验收结论

`M2-C3` 的 Town NPC 子集 bridge 提升条件已经满足，可以进入后端适配准备。

本次验收结论为：

- Town NPC 子集 `coverage` 已闭环
- Town NPC 子集 `bridge` 已闭环
- 当前可以从“源域修正”切换到“后端消费字段冻结 + 适配”

---

## 验收证据

### 1. coverage 闭环

执行：

```powershell
node data/wiki-crawler/src/cli.mjs coverage-audit --domain=npc --source-standardized-dir=data/standardized --crawler-output-root=data/wiki-crawler
```

`p0_town` 结果：

- `townTargets = 32`
- `townResolved = 32`
- `townMissing = 0`
- `townAlreadyCrawled = 32`
- `townEligibleBatch = 0`

说明：

- 当前 Town NPC 子集不再存在 `page-title` 级别的 unresolved 缺口
- 当前 Town NPC 子集已经全部被 crawler 本地产物覆盖

### 2. bridge 闭环

执行：

```powershell
node data/wiki-crawler/src/cli.mjs bridge --domain=npc --source-standardized-dir=data/standardized --crawler-output-root=data/wiki-crawler --output-root=data/generated/wiki-crawler-npc-bridge
```

bridge 结果：

- `crawlerNpcTotal = 39`
- `matched = 39`
- `unmatchedCrawler = 0`
- `unenrichedStandardized = 723`

说明：

- 已进入 bridge 的 Town NPC crawler 记录全部完成标准化匹配
- 其中 `Town Cat` / `Town Dog` alias page 已可消费
- 其中 `Town Slimes` group page 已可拆成 `8` 个成员 enrich

---

## 本次提升范围

本次认为已提升的不是“全 NPC 域”，而是以下 Town NPC 子集能力：

1. `Town Cat`
2. `Town Dog`
3. `Town Slimes` -> `8` 个成员
4. 其余 `p0_town` 常规单页 Town NPC

总计：

- `32` 个 `p0_town` 覆盖目标
- `39` 个进入 bridge 的 crawler NPC enrich 记录

---

## 本次不提升的内容

以下内容本次仍不进入“已完成”口径：

1. 非 `p0_town` 的 NPC rich source
2. Boss rich source
3. Enemy shard 扩覆盖
4. 后端/管理端/Public NPC 适配
5. 生成产物进 git 正式提升

---

## 风险与备注

### 1. 仍有解析质量风险

`Town Cat` / `Town Dog` 当前 lead summary 会带入 breed table 噪音。

这不会阻断 bridge 命中，但会影响后续公开消费面的文案质量。

### 2. 仍需冻结消费字段

进入后端适配前，仍需要先明确 Town NPC backend 只消费哪些冻结字段：

- identity
- behavior / summary
- move-in conditions
- shop source
- image / wiki asset metadata

### 3. 生成产物仍是本地验证证据

当前 `data/wiki-crawler/**` 与 `data/generated/wiki-crawler-npc-bridge/**` 下的新产物只用于本地验收，不作为本次 git 提交内容。

---

## 下一步

下一步进入 `M2-C4`：

1. 冻结 Town NPC backend 消费字段
2. 让 `Town NPC Maintenance` 优先接入
3. 再推进 `Public NPC Aggregate`
