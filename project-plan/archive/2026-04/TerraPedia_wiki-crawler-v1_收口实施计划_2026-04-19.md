# Wiki Crawler V1 Closure Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `feature/wiki-crawler-v1` 中可复用的 NPC wiki crawler 工具链并入应用主线，同时把仍属阶段性、局部覆盖的生成产物保留在数据产物分支，避免整分支合并覆盖当前应用主线的 NPC / Town NPC 工作。

**Architecture:** 把 `feature/wiki-crawler-v1` 视为“数据源子系统 + 产物分支”，不是直接 merge 目标。主线只吸收可复用源码、测试和必要设计文档；`audit`、`canonical`、`normalized-light`、`report`、`generated bridge` 这类阶段性输出按里程碑重跑、验收、再择优提升，不做整包并入。

**Tech Stack:** Git worktrees, PowerShell, Node.js built-in test runner, JSON datasets, project-plan Markdown

---

## Current Facts

### Branch Reality

- 日期基线：`2026-04-19`
- 应用主线工作分支：`feature/npc-domain-m1-m2` -> `98ecbfe`
- wiki crawler 工作分支：`feature/wiki-crawler-v1` -> `99cafd2`
- 两条分支 merge-base：`32f3a34`

### Why Full Merge Is Unsafe

直接把 `feature/wiki-crawler-v1` merge 到 `feature/npc-domain-m1-m2` 不成立，原因不是“有冲突”这么简单，而是分支职责已经分化：

- `git diff --stat feature/npc-domain-m1-m2..feature/wiki-crawler-v1`
  - `473 files changed, 351836 insertions(+), 30375 deletions(-)`
- 差异中包含大量对当前应用主线已存在能力的删除或回退：
  - `back` 下现有 NPC / Town NPC controller、DTO、service 会被删回旧状态
  - `data-query-app` 下 Town NPC 维护页会被删回旧状态
  - `front` 下 Public NPC 页面与测试会被删回旧状态
  - 根目录 `README.md`、`.gitignore` 也会被回退到旧版本

结论：**禁止整分支 merge。只允许按路径择优吸收。**

### Fresh Verification Evidence

`wiki-crawler-v1` 在 `2026-04-19` 已用最新工作树重新验证：

```powershell
node --test data/wiki-crawler/tests/*.test.mjs
```

验证结果：

- `50` tests
- `50` pass
- `0` fail

这说明当前 `data/wiki-crawler/src` 与 `data/wiki-crawler/tests` 作为独立工具链是可带入主线的。

### Coverage Reality

来自 `data/wiki-crawler/report/npc/coverage-audit.latest.json`：

- `totalTargets = 523`
- `resolvedTargets = 418`
- `missingTargets = 105`
- `alreadyCrawledTargets = 82`
- `eligibleBatchTargets = 336`

来自 `data/generated/wiki-crawler-npc-bridge/report/npc-bridge-summary.latest.json`：

- `crawlerNpcTotal = 82`
- `standardizedNpcTotal = 762`
- `matched = 116`
- `unenrichedStandardized = 646`

结论：

- 当前 rich source 仍是“局部工程样板”，不是“全 NPC 已完成”。
- 现阶段只能按 **Town NPC 子集闭环** 收口，不能把全量 bridge 产物当成主线标准源。

### Town NPC Subset Reality

从 `coverage-audit.latest.json` 过滤 `priority = p0_town` 后：

- `townTotal = 39`
- `townAlreadyCrawled = 29`
- `townMissing = 10`
- `townEligibleBatch = 0`

当前仍缺的 `p0_town` 目标：

- `Cat`
- `Clumsy Slime`
- `Cool Slime`
- `Diva Slime`
- `Dog`
- `Elder Slime`
- `Mystic Slime`
- `Nerdy Slime`
- `Squire Slime`
- `Surly Slime`

结论：**Town NPC 子集也还未完全闭环，但已经足够作为第一收口对象。**

---

## Promotion Matrix

| 路径范围 | 决策 | 优先级 | 原因 | 进入主线时点 |
| --- | --- | --- | --- | --- |
| `data/wiki-crawler/src/**` | 并入主线 | `P0` | 可复用源码，已通过 50/50 测试，是后续 coverage / bridge / batch 的执行入口 | 立即 |
| `data/wiki-crawler/tests/**` | 并入主线 | `P0` | 主线需要保留独立验证能力，避免导入后失去回归测试 | 立即 |
| `project-plan/specs/2026-04-10-npc-rich-closure-design.md` | 并入主线 | `P1` | 属于该子系统的设计依据，便于后续按设计继续执行 | 与源码同批或下一批 |
| `data/wiki-crawler/report/npc/*.latest.json` | 不直接并入 | `P1` | 属于可重跑报告，时效性强，当前数值只适合做基线，不适合作为长期版本事实 | M2-C2 之后按需重跑 |
| `data/wiki-crawler/audit/**` | 暂不并入 | `P1` | 阶段性 fanout 产物，覆盖仅 82 个目标，价值在审计，不是主线源 | M2-C3 后按子集择优 |
| `data/wiki-crawler/canonical/**` | 暂不并入 | `P1` | 仍是阶段性派生结果，不应先于闭环标准进入主线 | M2-C3 后按子集择优 |
| `data/wiki-crawler/normalized-light/**` | 暂不并入 | `P1` | 中间产物，适合 branch / 本地产物，不适合主线长期携带 | M2-C3 后按子集择优 |
| `data/generated/wiki-crawler-npc-bridge/**` | 暂不并入 | `P0` | 当前 bridge 仅 `116/762` 命中，不能覆盖主线 `data/standardized` 的完整标准化口径 | 仅 Town NPC 子集闭环后再提升 |
| `README.md`、`.gitignore`、`back/**`、`front/**`、`data-query-app/**`、`scripts/**` 中来自 wiki 分支的同名改动 | 禁止并入 | `P0` | 这些改动相对应用主线已经过时，直接带入会回退现有功能 | 永不从该分支直接拿 |
| `credentials.example.json` | 禁止并入 | `P2` | 主仓库已有 `scripts/dev/config/credentials.example.json`，根目录版本是旧位置 | 永不从该分支直接拿 |

---

## Closure Strategy

### 总原则

1. `feature/wiki-crawler-v1` 保留为 **产物分支 / 对照分支**，不是 merge 目标分支。
2. 主线先吸收 **工具链代码**，再补 **Town NPC 子集缺口**，再提升 **Town NPC bridge 子集产物**，最后才做 **后端适配**。
3. 所有 `.latest.json` 报告与 fanout 结果默认按“可重跑产物”处理，不把一次运行结果当成永久主线事实。

### 适配顺序

1. 先收工具链
2. 再收 Town NPC 缺口清单
3. 再收 Town NPC bridge 子集
4. 最后接后端 maintenance / public aggregate

---

## Milestones

### Milestone M2-C0: 收口边界冻结

**目标：** 固定 `wiki-crawler-v1` 的并入边界，终止“整分支 merge”这种错误收口方式。

**完成标准：**

- 已明确禁止整分支 merge
- 已明确主线只吸收 `src/tests/spec`
- 已明确 `report/audit/canonical/normalized-light/generated bridge` 属于阶段性产物

**状态：** 已完成，本文件即边界冻结结果。

### Milestone M2-C1: 工具链并入主线

**目标：** 把 wiki crawler 的可复用代码和测试带入应用主线，形成主仓库内可执行、可验证的 NPC rich source 工具链。

**Files:**

- Create/Modify: `data/wiki-crawler/src/**`
- Create/Modify: `data/wiki-crawler/tests/**`
- Create/Modify: `data/wiki-crawler/README.md`
- Optional: `project-plan/specs/2026-04-10-npc-rich-closure-design.md`

- [ ] **Step 1: 仅按路径从 `feature/wiki-crawler-v1` 提取源码与测试**

Run:

```powershell
git checkout feature/wiki-crawler-v1 -- data/wiki-crawler/src data/wiki-crawler/tests project-plan/specs/2026-04-10-npc-rich-closure-design.md
```

Expected:

- 只出现 `data/wiki-crawler/src/**`
- 只出现 `data/wiki-crawler/tests/**`
- 不应带入 `back` / `front` / `data-query-app` / `scripts` 的旧改动

- [ ] **Step 2: 为主线补一份 `data/wiki-crawler/README.md`**

Add:

```md
# Wiki Crawler

`data/wiki-crawler/src` 和 `data/wiki-crawler/tests` 是主线保留的 NPC wiki crawler 工具链。

以下目录默认视为可重跑产物，不直接作为长期主线事实提交：

- `data/wiki-crawler/report`
- `data/wiki-crawler/audit`
- `data/wiki-crawler/canonical`
- `data/wiki-crawler/normalized-light`
- `data/generated/wiki-crawler-npc-bridge`

如需提升产物，必须先满足对应里程碑验收标准。
```

- [ ] **Step 3: 在应用主线重新跑 crawler 自测**

Run:

```powershell
node --test data/wiki-crawler/tests/*.test.mjs
```

Expected:

- `50` pass
- `0` fail

- [ ] **Step 4: 检查 staged 范围**

Run:

```powershell
git status --short
git diff --cached --stat
```

Expected:

- staged 只覆盖 `data/wiki-crawler/**`、可选 spec、以及 `README`

- [ ] **Step 5: 提交工具链导入**

Run:

```powershell
git add data/wiki-crawler project-plan/specs/2026-04-10-npc-rich-closure-design.md
git commit -m "feat: import npc wiki crawler tooling"
```

### Milestone M2-C2: Town NPC 缺口冻结

**目标：** 把 Town NPC 子集的闭环缺口从“感觉还差一些”变成正式、可执行的缺口清单。

**Files:**

- Create: `project-plan/TerraPedia_TownNPC_rich-source缺口清单_2026-04-19.md`
- Reuse: `data/wiki-crawler/src/coverage/*.mjs`

- [ ] **Step 1: 在主线重跑 coverage audit**

Run:

```powershell
node data/wiki-crawler/src/cli.mjs coverage-audit --domain=npc --source-standardized-dir=data/standardized --crawler-output-root=data/wiki-crawler
```

Expected:

- 生成 `data/wiki-crawler/report/npc/coverage-targets.latest.json`
- 生成 `data/wiki-crawler/report/npc/coverage-audit.latest.json`

- [ ] **Step 2: 提取 `p0_town` 子集摘要**

Run:

```powershell
$p='data/wiki-crawler/report/npc/coverage-audit.latest.json'
$j=Get-Content $p -Raw | ConvertFrom-Json
$town=$j.targets | Where-Object { $_.priority -eq 'p0_town' }
[pscustomobject]@{
  townTotal=($town.Count)
  townAlreadyCrawled=(($town | Where-Object {$_.alreadyCrawled}).Count)
  townMissing=(($town | Where-Object {$_.missing}).Count)
} | Format-List
```

Expected:

- `townTotal = 39`
- `townAlreadyCrawled = 29`
- `townMissing = 10`

- [ ] **Step 3: 把缺口清单落到 `project-plan`**

Record:

- 缺口实体名单
- 每个缺口属于“页面不存在 / 页面命名不一致 / 页面不应单独抓取”中的哪一类
- 哪些缺口会阻断 Town NPC backend 适配

- [ ] **Step 4: 提交缺口冻结结果**

Run:

```powershell
git add project-plan/TerraPedia_TownNPC_rich-source缺口清单_2026-04-19.md
git commit -m "docs: freeze town npc rich source gaps"
```

### Milestone M2-C3: Town NPC Bridge 子集提升

**目标：** 不提升全量 bridge，只提升 Town NPC 子集可稳定解释的 bridge 结果。

**Files:**

- Reuse: `data/wiki-crawler/src/bridge/*.mjs`
- Output: `data/generated/wiki-crawler-npc-bridge/**`
- Create: `project-plan/TerraPedia_TownNPC_bridge提升验收_2026-04-19.md`

- [ ] **Step 1: 在主线重跑 bridge**

Run:

```powershell
node data/wiki-crawler/src/cli.mjs bridge --domain=npc --source-standardized-dir=data/standardized --crawler-output-root=data/wiki-crawler --output-root=data/generated/wiki-crawler-npc-bridge
```

Expected:

- 生成新的 `data/generated/wiki-crawler-npc-bridge/**`
- 生成新的 `npc-bridge-summary.latest.json`

- [ ] **Step 2: 只校验 Town NPC 子集，不拿全量命中率冒充闭环**

Check:

- Town NPC identity mapping 是否稳定
- 是否还存在 Town NPC 级别 `unresolved` 或多重冲突
- `behavior` / `move-in` / `shop` / `wiki assets` 字段是否可供后端消费

- [ ] **Step 3: 只有 Town NPC 子集满足验收时，才定义可提升产物**

Allowed promotion:

- 仅 Town NPC 子集摘要
- 仅 Town NPC 子集 bridge 验收文档
- 如确实需要，再生成子集化 JSON 快照

Not allowed:

- 直接提交当前整包 `data/generated/wiki-crawler-npc-bridge/standardized/*.json` 作为主线事实

- [ ] **Step 4: 提交 bridge 子集验收文档**

Run:

```powershell
git add project-plan/TerraPedia_TownNPC_bridge提升验收_2026-04-19.md
git commit -m "docs: record town npc bridge promotion gate"
```

### Milestone M2-C4: 后端适配

**目标：** 在 Town NPC rich source 子集稳定后，再开始适配后端，不反过来让后端适配一个还未冻结的源域。

**Files:**

- Modify: `back/src/main/java/com/terraria/skills/controller/AdminNpcController.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/PublicNpcAggregateController.java`
- Modify: `back/src/main/java/com/terraria/skills/service/PublicNpcService.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/PublicNpcServiceImpl.java`
- Modify: `back/src/main/java/com/terraria/skills/service/TownNpcMaintenanceDomainMapper.java`
- Modify: `data-query-app/pages/entities/town-npcs/**`
- Modify: `front/src/views/NpcListView.vue`
- Modify: `front/src/views/NpcDetailView.vue`

- [ ] **Step 1: 先接 Town NPC maintenance，不先接 public aggregate**

Reason:

- maintenance 链路更适合暴露字段缺口和 identity 问题
- public aggregate 适合在 maintenance 稳定后再消费

- [ ] **Step 2: 定义后端只消费已冻结字段**

Required fields:

- identity
- behavior notes
- move-in conditions
- shop source
- wiki assets
- image metadata

Not allowed:

- 让后端直接消费未冻结的整包 `wikiCrawler` 原始结构

- [ ] **Step 3: 先补 mapper / service / controller 的最小回归测试**

Run:

```powershell
cd back
mvn "-Dtest=TownNpcMaintenanceDomainMapperTest,PublicNpcAggregateControllerTest,NpcControllerTest" test
```

Expected:

- 相关 Town NPC / Public NPC 精确测试通过

- [ ] **Step 4: 再接管理端和公开消费面**

Run:

```powershell
cd data-query-app
pnpm run check
```

Expected:

- Town NPC 管理端类型检查通过

---

## Non-Goals

- 不追求一次把 `762` 个 NPC 全量 rich source 收口
- 不把 `feature/wiki-crawler-v1` 当成应用主线分支直接合并
- 不把当前 `data/generated/wiki-crawler-npc-bridge/standardized/*.json` 视为主线正式标准化数据
- 不在 Town NPC rich source 未冻结前开始大面积后端适配

---

## Risks

- Town NPC 缺口中的 `Cat`、`Dog`、各类 Slime 很可能不是“缺抓取”而是“页面命名 / 页面组织方式不同”，需要在 M2-C2 做正式分类
- 一旦把 `.latest.json` 产物直接并主线，后续每次重跑都会制造高噪音 diff
- 如果后端先适配未冻结字段，后续 source 口径一变就会产生二次返工

---

## Immediate Next Action

下一执行步不是后端适配，而是 **M2-C1: 工具链并入主线**。

只有当 `data/wiki-crawler/src` 和 `data/wiki-crawler/tests` 已经进入应用主线并重新验证通过，后面的 Town NPC 缺口冻结和 bridge 子集提升才有稳定执行面。
