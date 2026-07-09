# TerraPedia Town NPC Rich Source 修复进展

日期：2026-04-19  
执行分支：`feature/npc-domain-m1-m2`

---

## 本轮完成内容

本轮继续执行里程碑任务，已经把 `Town NPC rich source` 从“规则修正”推进到“真实页面跑通”。

完成项：

1. `Cat` / `Dog` alias title 映射
   - `Cat -> Town Cat`
   - `Dog -> Town Dog`
2. `Town Slimes` 聚合页支持
   - 覆盖目标构建不再把 `8` 个 Town Slime 当成 `8` 个独立单页
   - 统一归并到 `Town Slimes` group page
3. `Town Slimes` group member 结构化
   - 从 `Types` 表中提取 `8` 个成员
   - 写入 `groupMembers`
4. bridge 扩展
   - 一个 `town-slimes.latest.json` 可以在 bridge 阶段展开为多个标准化 NPC enrich
5. coverage 已抓取识别修正
   - 不再只靠文件名判断
   - 支持 alias page 和 groupMembers 对应的 entityId 识别
6. `p0_town` 页面实际批抓完成
   - 已把 Town NPC 子集真正跑进本地 crawler 产物

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

### 2. 第一轮真实页面抓取验证

执行：

```powershell
node data/wiki-crawler/src/cli.mjs batch --domain=npc --page-titles="Town Cat|Town Dog|Town Slimes" --write-files
```

结果：

- `Town Cat` 抓取成功
- `Town Dog` 抓取成功
- `Town Slimes` 抓取成功
- `3/3 pass`

### 3. 批量 Town NPC 页面抓取验证

继续执行：

```powershell
node data/wiki-crawler/src/cli.mjs batch --domain=npc --targets-file=data/wiki-crawler/report/npc/coverage-audit.latest.json --target-priority=p0_town --write-files
```

结果：

- 剩余 `29` 个 `p0_town` 目标全部执行完成
- `29/29 pass`

### 4. 真实 coverage audit

执行：

```powershell
node data/wiki-crawler/src/cli.mjs coverage-audit --domain=npc --source-standardized-dir=data/standardized --crawler-output-root=data/wiki-crawler
```

`p0_town` 摘要：

- `townTargets = 32`
- `townResolved = 32`
- `townMissing = 0`
- `townAlreadyCrawled = 32`
- `townEligibleBatch = 0`

结论：

- 原先那 `10` 个 page-title 缺口已经不再是 `missing`
- `p0_town` 当前已经达到 `32/32 resolved`
- `p0_town` 当前已经达到 `32/32 alreadyCrawled`
- Town NPC 子集在 crawler 覆盖层面已经闭环

### 5. 真实 bridge 验证

执行：

```powershell
node data/wiki-crawler/src/cli.mjs bridge --domain=npc --source-standardized-dir=data/standardized --crawler-output-root=data/wiki-crawler --output-root=data/generated/wiki-crawler-npc-bridge
```

bridge 摘要：

- `crawlerNpcTotal = 39`
- `matched = 39`
- `unmatchedCrawler = 0`
- `unenrichedStandardized = 723`

结论：

- Town NPC 子集已经能够进入标准化 NPC enrich 链路
- 当前已验证进入 bridge 的 Town NPC enrich 数量为 `39`

---

## 当前剩余问题

这轮完成的是 `Town NPC rich source / bridge` 子集闭环，不等于整个 NPC 域已经完成。

当前仍需处理：

1. `Town Cat` / `Town Dog` 的 lead summary 目前仍会带入 breed table 噪音，后续需要单独优化 lead 提取规则
2. 当前验证完成的是 Town NPC 子集 rich source / bridge 闭环，还没有进入后端消费适配
3. 生成产物目前只保留在本地验证目录，没有进入 git 提升

---

## 下一步建议

下一步直接进入 `M2-C4` 准备阶段：

1. 产出 Town NPC 子集 bridge 验收文档
2. 冻结 Town NPC backend 可消费字段
3. 再进入后端适配
