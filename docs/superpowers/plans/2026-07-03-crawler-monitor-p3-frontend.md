# 爬虫监控 P3：前端消费权威 state + 进度折叠 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让管理员一眼看清每个域「什么状态、该点什么」——域表格权威消费后端 `domain.state`（status + nextAction + blocker + evidence），把机器 token 渲染成中文；进度信息过载折叠，突出当前状态与下一步动作。

**Architecture:** P2 已让后端每域输出权威 `domain.state`。P3 让前端 nextAction/blocker/evidence 也改用后端权威值（此前只接了 status），新增 token→中文映射表。**收敛范围（关键决策）**：不强删 `crawlerMonitorUnifiedStatus.mjs`——它是 `domainTable`/`executionOverview` 的计算引擎，强删等于重写两个 800 行工具 + 6911 行 vue 十余处消费点，风险过高、收益边际。改为让它降为执行总览的内部引擎，域表格显示层改用后端 state。fallback 双读保留（后端偶发缺 state 时仍可用），但**优先级明确为后端权威**。

**Tech Stack:** Nuxt/Vue 3（node --test，行为测试优先；离线注入优先）。

**Scope 边界（本计划仅 P3）：** 只动前端显示层。不改后端、不改派发链路、不重写 domainTable/executionOverview 的计算内核（只改它们的显示消费）。不做 vue 物理拆分（6911 行拆分风险高、非本目标必需；如需拆分另立计划）。

---

## 现状锚点（实现者必读，来自代码实读）

- **域表格行渲染**（`crawler-monitor.vue`）：
  - `:82` status pill：`statusTone(row.risk || domainRowStatus(row))` + `{{ row.diagnosisTitle }}`
  - `:100` 下一步：`{{ row.nextActionLabel || row.rankReason }}`；`:101` 小字 `{{ row.rankReason }}`
  - 这些 `row.nextActionLabel/diagnosisTitle/rankReason` 来自 `domainTable.mjs` 的合成（旧中文 fallback），**不是**后端 `state.nextAction`。
- **P2 已接**：`domainRowStatus(row)`（:2348）经 `resolveDomainState` 读后端 `state.status`。但 nextAction/blocker/evidence 未接。
- **`domainRowState(row)`（:2340）** 已返回 `{status, nextAction, blocker, blockerLabel, evidence, source}`——backend 分支来自后端 state，fallback 分支来自 unifiedStatus。**P3 让 nextAction/blocker/evidence 也走它。**
- **`statusLabel(status)`（:2778）**：现成 status→中文映射。**没有** nextAction token→中文映射（需新建）。
- **后端 nextAction token 集**（来自 `CrawlerDomainStateReducer.nextAction`）：`resume / observe_or_terminate / cancel_queued / inspect_blocker / terminate_and_recrawl / recrawl / none / inspect`。
- **进度过载点**：`crawlerMonitorExecutionOverview.mjs` 的 `timingLabel` 一行塞 5 个时间戳；域表格行有 queueSummary/ownerLabel/evidenceSummary/blockerLabel 多列。P3 折叠非关键信息到详情区。
- **消费方**：`crawlerMonitorUnifiedStatus.mjs` 被 `domainTable.mjs`、`executionOverview.mjs`、`state.mjs`、`vue:682` 用。**P3 不删它**，只让域表格显示改用后端 state。
- **测试**：`crawler-monitor-page-contract.test.mjs`（含 P2 的 resolveDomainState 测试）、`crawler-monitor-domain-table.test.mjs`、`crawler-monitor-execution-overview.test.mjs`、`crawler-monitor-unified-status.test.mjs`。P3 不删模块 → 这些测试都保留。

---

## File Structure

- Create: `data-query-app/pages/operations/crawler-monitor.labels.mjs`
  - 后端 nextAction token → 中文标签映射（纯函数，可独测）。
- Modify: `data-query-app/pages/operations/crawler-monitor.state.mjs`
  - `resolveDomainState` 已返回 nextAction/blocker/evidence；确保 backend 分支带 nextActionLabel（经映射）。
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
  - 域表格「下一步」改用后端 state.nextAction（经中文映射），blocker/evidence 同理；进度过载信息折叠。
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`
  - 断言 token→中文映射、域行优先渲染后端 nextAction。

---

## Task 1: nextAction token→中文映射（纯函数 + 单测）

**Files:**
- Create: `data-query-app/pages/operations/crawler-monitor.labels.mjs`
- Test: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] **Step 1: 写失败测试** — 在 `crawler-monitor-page-contract.test.mjs` 追加：

```js
import { nextActionLabel } from '../pages/operations/crawler-monitor.labels.mjs'

test('nextActionLabel 映射后端 token 为中文', () => {
  assert.equal(nextActionLabel('recrawl'), '启动重爬')
  assert.equal(nextActionLabel('terminate_and_recrawl'), '终止并清理后重爬')
  assert.equal(nextActionLabel('observe_or_terminate'), '观察或终止')
  assert.equal(nextActionLabel('cancel_queued'), '取消排队')
  assert.equal(nextActionLabel('inspect_blocker'), '查看占用者')
  assert.equal(nextActionLabel('resume'), '继续任务')
  assert.equal(nextActionLabel('none'), '暂无异常')
  assert.equal(nextActionLabel('inspect'), '查看证据')
})

test('nextActionLabel 未知 token 回落原值', () => {
  assert.equal(nextActionLabel('something_new'), 'something_new')
  assert.equal(nextActionLabel(null), '查看证据')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs 2>&1 | tail -6`
Expected: FAIL（找不到 `crawler-monitor.labels.mjs`）

- [ ] **Step 3: 新建映射模块** — `data-query-app/pages/operations/crawler-monitor.labels.mjs`：

```js
const NEXT_ACTION_LABELS = {
  resume: '继续任务',
  observe_or_terminate: '观察或终止',
  cancel_queued: '取消排队',
  inspect_blocker: '查看占用者',
  terminate_and_recrawl: '终止并清理后重爬',
  recrawl: '启动重爬',
  none: '暂无异常',
  inspect: '查看证据',
}

/**
 * 后端 CrawlerDomainStateReducer 的 nextAction 机器 token → 中文标签。
 * 未知 token 回落原值；null/空回落"查看证据"。
 */
export function nextActionLabel(token) {
  if (!token) return '查看证据'
  return NEXT_ACTION_LABELS[token] || token
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs 2>&1 | tail -6`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /home/lolben/TerraPedia
git add data-query-app/pages/operations/crawler-monitor.labels.mjs \
        data-query-app/tests/crawler-monitor-page-contract.test.mjs
git commit -m "feat(crawler-monitor): 新增 nextAction token→中文映射"
```

---

## Task 2: state.mjs backend 分支带中文 nextActionLabel

**Files:**
- Modify: `data-query-app/pages/operations/crawler-monitor.state.mjs`
- Test: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] **Step 1: 写失败测试** — 追加：

```js
test('resolveDomainState backend 分支带中文 nextActionLabel', () => {
  const domain = { domain: 'bosses', state: { status: 'stalled', nextAction: 'terminate_and_recrawl' } }
  const s = resolveDomainState(domain)
  assert.equal(s.nextAction, 'terminate_and_recrawl')      // 原始 token 保留
  assert.equal(s.nextActionLabel, '终止并清理后重爬')       // 中文映射
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs 2>&1 | tail -6`
Expected: FAIL（`s.nextActionLabel` 为 undefined）

- [ ] **Step 3: 改 state.mjs** — import 映射，backend 分支加 `nextActionLabel`：

在 `crawler-monitor.state.mjs` 顶部加：
```js
import { nextActionLabel } from './crawler-monitor.labels.mjs'
```
把 backend 分支的 return（`source: 'backend'` 那个对象）加一个字段：
```js
      nextActionLabel: nextActionLabel(domain.state.nextAction),
```
fallback 分支也加（fallback 的 nextActionLabel 本就是中文，直接用）：
```js
      nextActionLabel: unified.nextActionLabel || null,
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs 2>&1 | tail -6`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /home/lolben/TerraPedia
git add data-query-app/pages/operations/crawler-monitor.state.mjs \
        data-query-app/tests/crawler-monitor-page-contract.test.mjs
git commit -m "feat(crawler-monitor): 双读 state 输出中文 nextActionLabel"
```

---

## Task 3: 域表格「下一步/占用/证据」改用后端权威 state

**Files:**
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
- Test: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] **Step 1: 加 vue helper** — 在 `crawler-monitor.vue` 的 `domainRowStatusLabel`（约 :2352）附近加：

```js
function domainRowNextActionLabel(row: any) {
  const state = domainRowState(row)
  return state.nextActionLabel || row?.nextActionLabel || row?.rankReason || '查看证据'
}

function domainRowBlockerLabel(row: any) {
  const state = domainRowState(row)
  return state.blockerLabel || state.blocker || row?.blockerLabel || ''
}
```

- [ ] **Step 2: 模板接线** — 把 `:100` 的下一步渲染从 `{{ row.nextActionLabel || row.rankReason }}` 改为 `{{ domainRowNextActionLabel(row) }}`。（`:101` 小字 rankReason 保留作为补充说明，不动。）若 :82 的 `row.diagnosisTitle` 也想统一，可改为 `domainRowStatusLabel(row)`——但保持最小改动，本步只改下一步这一处，diagnosisTitle 留待验证后再定。

- [ ] **Step 3: 写行为测试锁定优先级** — 在 page-contract 测试追加（断言 vue 源码里下一步渲染调用了 domainRowNextActionLabel，属接线验证）：

```js
import { readFileSync } from 'node:fs'
test('域表格下一步渲染改用后端权威 nextAction', () => {
  const vue = readFileSync(new URL('../pages/operations/crawler-monitor.vue', import.meta.url), 'utf8')
  assert.match(vue, /domainRowNextActionLabel\(row\)/, '模板应调用 domainRowNextActionLabel')
  assert.match(vue, /function domainRowNextActionLabel/, '应定义 domainRowNextActionLabel helper')
})
```

> 注：这条是源码匹配测试，用于锁定接线不回退；主逻辑测试在 Task 1/2 的纯函数上（符合"行为测试优先"——纯函数是主，接线是辅）。

- [ ] **Step 4: 跑测试 + check**

Run: `cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs && pnpm run check`
Expected: 测试 PASS；check EXIT=0

- [ ] **Step 5: Commit**

```bash
cd /home/lolben/TerraPedia
git add data-query-app/pages/operations/crawler-monitor.vue \
        data-query-app/tests/crawler-monitor-page-contract.test.mjs
git commit -m "feat(crawler-monitor): 域表格下一步改用后端权威 nextAction"
```

---

## Task 4: 进度信息折叠（治「看不出当前任务」）

**Files:**
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`

- [ ] **Step 1: 定位进度过载区** — 读 `crawler-monitor.vue` 找执行总览/域表格里展示多时间戳、queueSummary、ownerLabel、evidenceSummary 的模板段（配合 `executionOverviewRows` / `timingLabel`）。确认哪些是"次要信息"（PID、多个时间戳、证据文件列表）可折叠，哪些是"关键信息"（状态、当前进度百分比/计数、下一步动作）需常显。

- [ ] **Step 2: 折叠实现** — 用现有的详情抽屉/展开机制（页面已有 `selectedDomainTableRow` 详情逻辑），把次要信息移入详情展开区，行内默认只显示：状态 pill + 当前进度（current/total 或 percent）+ 下一步动作。**最小改动**：如果页面已有 `<details>` 或折叠组件复用之；没有则用 `v-if="expandedRow === row.id"` 加一个「详情」切换。不新增依赖。

> 实现者注意：此步偏 UI 布局，需在真实页面确认视觉。若折叠机制改动面超过 ~40 行或触及复杂模板结构，**标 DONE_WITH_CONCERNS 并说明**，把大改留作单独 UI 任务，本步只做"次要信息加 `v-if` 折叠"这一最小版本。

- [ ] **Step 3: 跑 check**

Run: `cd data-query-app && pnpm run check && node --test tests/crawler-monitor-page-contract.test.mjs 2>&1 | tail -6`
Expected: check EXIT=0；测试 PASS

- [ ] **Step 4: Commit**

```bash
cd /home/lolben/TerraPedia
git add data-query-app/pages/operations/crawler-monitor.vue
git commit -m "feat(crawler-monitor): 域行折叠次要进度信息, 突出状态与下一步"
```

---

## P3 最终验证与 staged 范围检查

- [ ] `cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs tests/crawler-monitor-domain-table.test.mjs tests/crawler-monitor-execution-overview.test.mjs tests/crawler-monitor-unified-status.test.mjs` — 全绿（unifiedStatus 未删，其测试应仍通过）。
- [ ] `cd data-query-app && pnpm run check` — EXIT=0。
- [ ] `git status --short` 核对：只触及本计划 File Structure 列出的文件。
- [ ] 人工验收：域表格每行显示后端权威状态 + 中文下一步动作；进度次要信息折叠、当前任务一眼可见；被回收域显示"已取消/终止并清理后重爬"。

---

## 后续（不在本计划内 / 可选）

- **vue 物理拆分**：6911 行 `crawler-monitor.vue` 按区块（域表/执行总览/证据抽屉）抽成子组件——风险高、非本目标必需，若要做另立计划。
- **彻底删 unifiedStatus**：需先把 domainTable/executionOverview 的计算内核也迁到后端或重写，收益边际、风险高，暂不做。
