# TerraPedia Town NPC Rich Source 修复进展

日期：2026-04-19  
执行分支：`feature/npc-domain-m1-m2`

---

## 本轮完成内容

本轮继续执行里程碑任务，完成了 `Town NPC rich source` 的第一轮源域修正，范围只覆盖 crawler：

1. `Cat` / `Dog` alias title 映射
   - `Cat -> Town Cat`
   - `Dog -> Town Dog`
2. `Town Slimes` 聚合页支持
   - 覆盖目标构建不再把 8 个 Town Slime 当成 8 个独立单页
   - 归并到 `Town Slimes` 一个 group page
3. `Town Slimes` group member 结构化
   - 从聚合页 `Types` 表中提取 8 个成员
   - 写入 `groupMembers`
4. bridge 扩展
   - 一个 `town-slimes.latest.json` 可以在 bridge 阶段展开为多个标准化 NPC enrich
5. coverage 已抓取识别修正
   - 不再只靠文件名判断
   - 支持 alias page 和 groupMembers 对应的 entityId 识别

---

## 代码变更点

本轮涉及的核心代码：

- `data/wiki-crawler/src/domains/npc-source-mapping.mjs`
- `data/wiki-crawler/src/domains/npc-domain.mjs`
- `data/wiki-crawler/src/coverage/build-npc-coverage-targets.mjs`
- `data/wiki-crawler/src/coverage/run-npc-coverage-audit.mjs`
- `data/wiki-crawler/src/bridge/run-npc-standardized-bridge.mjs`
- `data/wiki-crawler/src/bridge/build-npc-standardized-bridge.mjs`

对应测试已补：

- `data/wiki-crawler/tests/npc-coverage-targets.test.mjs`
- `data/wiki-crawler/tests/run-npc-coverage-audit.test.mjs`
- `data/wiki-crawler/tests/npc-domain.test.mjs`
- `data/wiki-crawler/tests/run-npc-standardized-bridge.test.mjs`

---

## 验证结果

### 1. 自动化测试

执行：

```powershell
node --test data/wiki-crawler/tests/*.test.mjs
```

结果：

- `55` tests
- `55` pass
- `0` fail

### 2. 真实页面抓取验证

执行：

```powershell
node data/wiki-crawler/src/cli.mjs batch --domain=npc --page-titles="Town Cat|Town Dog|Town Slimes" --write-files
```

结果：

- `Town Cat` 抓取成功
- `Town Dog` 抓取成功
- `Town Slimes` 抓取成功
- `3/3 pass`

### 3. 真实 coverage audit

执行：

```powershell
node data/wiki-crawler/src/cli.mjs coverage-audit --domain=npc --source-standardized-dir=data/standardized --crawler-output-root=data/wiki-crawler
```

`p0_town` 摘要：

- `townTargets = 32`
- `townResolved = 32`
- `townMissing = 0`
- `townAlreadyCrawled = 3`
- `townEligibleBatch = 29`

结论：

- 原先那 `10` 个 page-title 缺口已经不再是 `missing`
- 其中 `Town Cat`、`Town Dog`、`Town Slimes` 三个源页面已经可以被 crawler 正确识别和消费

### 4. 真实 bridge 验证

执行：

```powershell
node data/wiki-crawler/src/cli.mjs bridge --domain=npc --source-standardized-dir=data/standardized --crawler-output-root=data/wiki-crawler --output-root=data/generated/wiki-crawler-npc-bridge
```

bridge 摘要：

- `crawlerNpcTotal = 10`
- `matched = 10`
- `unmatchedCrawler = 0`

结论：

- `Town Cat`、`Town Dog`
- `Town Slimes` 拆出的 `8` 个成员

已经能够进入标准化 NPC enrich 链路。

---

## 当前剩余问题

这轮修掉的是“源域缺口”，不是“Town NPC 全量闭环”。

当前仍未完成：

1. 其余 `29` 个 `p0_town` 目标还没有实际重新抓取
2. 本轮 bridge 只验证了新增修正对象，不等于 Town NPC 全量 bridge 已提升
3. `Town Cat` / `Town Dog` 的 lead summary 目前仍会带入 breed table 噪音，后续需要单独优化 lead 提取规则

---

## 下一步建议

下一步直接进入 `M2-C3` 的实做阶段：

1. 先批量抓完剩余 `29` 个 `p0_town` 目标
2. 重跑 `bridge`
3. 产出 Town NPC 子集 bridge 验收文档
4. 再决定是否进入 `M2-C4` 的后端适配
