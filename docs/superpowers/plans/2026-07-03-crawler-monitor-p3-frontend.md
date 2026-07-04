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
  - 这些 `row.nextActionLabel/diagnosisTitle/rankReason` 来自 `crawlerMonitorDomainTable.mjs` 的合成（旧中文 fallback），**不是**后端 `state.nextAction`。
- **P2 已接**：`domainRowStatus(row)`（:2348）经 `resolveDomainState` 读后端 `state.status`。但 nextAction/blocker/evidence 未接。
- **`domainRowState(row)`（:2340）** 已返回 `{status, nextAction, blocker, blockerLabel, evidence, source}`——backend 分支来自后端 state，fallback 分支来自 unifiedStatus。**P3 让 nextAction/blocker/evidence 也走它。**
- **`statusLabel(status)`（:2778）**：现成 status→中文映射。**没有** nextAction token→中文映射（需新建）。
- **后端 nextAction token 集**（来自 `CrawlerDomainStateReducer.nextAction`）：`resume / observe_or_terminate / cancel_queued / inspect_blocker / terminate_and_recrawl / recrawl / none / inspect`。
- **进度过载点**：`crawlerMonitorExecutionOverview.mjs` 的 `timingLabel` 一行塞 5 个时间戳；域表格行有 queueSummary/ownerLabel/PID/rankReason 重复说明。P3 折叠非关键信息到详情区。
- **消费方**：`crawlerMonitorUnifiedStatus.mjs` 被 `crawlerMonitorDomainTable.mjs`、`crawlerMonitorExecutionOverview.mjs`、`crawler-monitor.state.mjs`、`crawler-monitor.vue:682` 用。**P3 不删它**，只让域表格显示改用后端 state。
- **测试**：`crawler-monitor-page-contract.test.mjs`（含 P2 的 resolveDomainState 测试）、`crawler-monitor-domain-table.test.mjs`、`crawler-monitor-execution-overview.test.mjs`、`crawler-monitor-unified-status.test.mjs`。P3 不删模块 → 这些测试都保留。

---

## File Structure

- Create: `data-query-app/pages/operations/crawler-monitor.labels.mjs`
  - 后端 nextAction token → 中文标签映射（纯函数，可独测）。
- Modify: `data-query-app/pages/operations/crawler-monitor.state.mjs`
  - `resolveDomainState` 已返回 nextAction/blocker/blockerLabel/evidence；确保 backend 分支带 nextActionLabel（经映射），fallback 分支字段语义一致。
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
  - 域表格/详情卡「下一步、阻塞、证据」改用后端 state 优先；进度过载信息折叠。
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`
  - 断言 token→中文映射、resolveDomainState 字段契约、域行/详情优先渲染后端 state、折叠字段分层。

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

## Task 2: state.mjs 输出完整后端 state 显示契约

**Files:**
- Modify: `data-query-app/pages/operations/crawler-monitor.state.mjs`
- Test: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] **Step 1: 写失败测试** — 追加：

```js
test('resolveDomainState backend 分支带完整显示字段', () => {
  const domain = {
    domain: 'bosses',
    state: {
      status: 'blocked',
      nextAction: 'inspect_blocker',
      blocker: 'bosses',
      blockerLabel: '域 bosses',
      evidence: 'data/generated/wiki-bosses-progress.latest.json',
    },
  }
  const s = resolveDomainState(domain)
  assert.equal(s.status, 'blocked')
  assert.equal(s.nextAction, 'inspect_blocker')                 // 原始 token 保留
  assert.equal(s.nextActionLabel, '查看占用者')                 // 中文映射
  assert.equal(s.blocker, 'bosses')
  assert.equal(s.blockerLabel, '域 bosses')
  assert.equal(s.evidence, 'data/generated/wiki-bosses-progress.latest.json')
  assert.equal(s.source, 'backend')
})

test('resolveDomainState fallback 分支保持旧调解器显示字段', () => {
  const s = resolveDomainState(
    { domain: 'bosses', status: 'running' },
    { progressRow: null, queueItem: null }
  )
  assert.ok(s.status, '回落应产出 status')
  assert.ok(Object.prototype.hasOwnProperty.call(s, 'nextActionLabel'), '回落应保留 nextActionLabel 字段')
  assert.ok(Object.prototype.hasOwnProperty.call(s, 'blockerLabel'), '回落应保留 blockerLabel 字段')
  assert.ok(Object.prototype.hasOwnProperty.call(s, 'evidence'), '回落应保留 evidence 字段')
  assert.equal(s.source, 'fallback')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs 2>&1 | tail -6`
Expected: FAIL（`s.nextActionLabel` 为 undefined，fallback 字段不完整）

- [ ] **Step 3: 改 state.mjs** — import 映射，backend 分支加 `nextActionLabel`：

在 `crawler-monitor.state.mjs` 顶部加：
```js
import { nextActionLabel } from './crawler-monitor.labels.mjs'
```
把 backend 分支的 return（`source: 'backend'` 那个对象）加一个字段：
```js
      nextActionLabel: nextActionLabel(domain.state.nextAction),
```
fallback 分支也加完整字段（fallback 的 nextActionLabel 本就是中文，直接用）：
```js
      nextActionLabel: unified.nextActionLabel || null,
      blockerLabel: unified.conflictLabel || null,
```

保持已有字段不降级：`nextAction` 保留原始后端 token；`blocker/blockerLabel/evidence` 保留后端原值。fallback 分支没有后端 evidence 时继续用 `unified.reason || null`，只作为缺 state 时的兼容说明。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs 2>&1 | tail -6`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /home/lolben/TerraPedia
git add data-query-app/pages/operations/crawler-monitor.state.mjs \
        data-query-app/tests/crawler-monitor-page-contract.test.mjs
git commit -m "feat(crawler-monitor): 双读 state 输出完整显示契约"
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
  return state.blockerLabel || state.blocker || row?.blockerLabel || row?.blockerIdentity || ''
}

function domainRowEvidencePath(row: any) {
  const state = domainRowState(row)
  return state.evidence
    || row?.queueItem?.reportPath
    || row?.progressRow?.reportPath
    || row?.queueItem?.progressPath
    || row?.progressRow?.progressPath
    || ''
}
```

- [ ] **Step 2: 模板接线** — 只改显示层，不改派发/终止按钮判定：
  - 把 `:100` 的下一步渲染从 `{{ row.nextActionLabel || row.rankReason }}` 改为 `{{ domainRowNextActionLabel(row) }}`。
  - 删除同一单元格里的重复 `{{ row.rankReason }}` 小字；rankReason 迁到右侧详情卡作为补充说明。
  - 在右侧 `current-card` 的「建议动作」值改用 `domainRowNextActionLabel(selectedDomainTableRow)`，避免选中正式域后又回到前端旧规则。
  - 在右侧 `current-card` 增加或替换「阻塞/占用」值为 `domainRowBlockerLabel(selectedDomainTableRow) || selectedDomainTableRow.queueSummary`。
  - `openReportPreview(selectedWikiReportPath || selectedWikiProgressPath)` 改为优先 `domainRowEvidencePath(selectedDomainTableRow)`，再回落旧路径：`openReportPreview(domainRowEvidencePath(selectedDomainTableRow) || selectedWikiReportPath || selectedWikiProgressPath)`。
  - 操作按钮（继续、终止、取消、启动重爬、强制回收）仍使用现有 `can*DomainTableRow`/`handleSelectedWikiDomainPrimaryAction` 控制逻辑；P3 只收敛展示口径。

- [ ] **Step 3: 写行为测试锁定优先级** — 在 page-contract 测试追加（源码接线测试只锁模板，主逻辑测试已在 Task 1/2）：

```js
import { readFileSync } from 'node:fs'
test('域表格和详情卡优先渲染后端权威 domain.state', () => {
  const vue = readFileSync(new URL('../pages/operations/crawler-monitor.vue', import.meta.url), 'utf8')
  assert.match(vue, /domainRowNextActionLabel\(row\)/, '模板应调用 domainRowNextActionLabel')
  assert.match(vue, /function domainRowNextActionLabel/, '应定义 domainRowNextActionLabel helper')
  assert.match(vue, /function domainRowBlockerLabel/, '应定义 domainRowBlockerLabel helper')
  assert.match(vue, /function domainRowEvidencePath/, '应定义 domainRowEvidencePath helper')
  assert.match(vue, /domainRowNextActionLabel\(selectedDomainTableRow\)/, '详情卡建议动作应走后端 state')
  assert.match(vue, /domainRowBlockerLabel\(selectedDomainTableRow\)/, '详情卡阻塞信息应走后端 state')
  assert.match(vue, /domainRowEvidencePath\(selectedDomainTableRow\)/, '查看证据应优先走后端 state.evidence')
  assert.doesNotMatch(vue, /\{\{\s*row\.nextActionLabel\s*\|\|\s*row\.rankReason\s*\}\}/, '域行下一步不应回到旧合成字段优先')
})
```

> 注：这条是源码匹配测试，用于锁定接线不回退；主逻辑测试在 Task 1/2 的纯函数上。若执行者愿意进一步降低源码匹配脆弱性，可把 `domainRowNextActionLabel/domainRowBlockerLabel/domainRowEvidencePath` 抽到 `crawler-monitor.labels.mjs` 或单独 display 模块再做纯函数单测，但 P3 不强制抽模块。

- [ ] **Step 4: 跑测试 + check**

Run: `cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs && pnpm run check`
Expected: 测试 PASS；check EXIT=0

- [ ] **Step 5: Commit**

```bash
cd /home/lolben/TerraPedia
git add data-query-app/pages/operations/crawler-monitor.vue \
        data-query-app/tests/crawler-monitor-page-contract.test.mjs
git commit -m "feat(crawler-monitor): 域表格消费后端权威 state"
```

---

## Task 4: 进度信息折叠（治「看不出当前任务」）

**Files:**
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
- Test: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] **Step 1: 锁定字段分层（先写进计划/注释，不靠执行者临场判断）**

常显字段：

| 区域 | 常显 |
| --- | --- |
| overview 域表格 | 域、状态 pill、进度、下一步、操作 |
| queue 卡 | 任务名、状态、进度数字/进度条、建议动作 |
| progress 卡 | 任务名、状态、进度数字/进度条、建议动作、必要控制按钮 |

详情/折叠字段：

| 区域 | 详情/折叠 |
| --- | --- |
| overview 右侧详情卡 | queueSummary、ownerLabel、PID、heartbeat、rankReason、证据文件 |
| queue 卡详情 | 状态来源、队列标识、阻塞、时间、PID、工程 message |
| progress 卡详情 | 状态来源、队列状态、影响域、心跳、速度、ETA、运行时长、路径/日志 |

- [ ] **Step 2: 先写源码 contract** — 在 `crawler-monitor-page-contract.test.mjs` 追加或调整：

```js
test('crawler monitor overview folds row noise into selected-domain details', () => {
  const overviewTable = page.slice(
    page.indexOf('<table class="monitor-table">'),
    page.indexOf('<aside v-if="selectedDomainTableRow" class="current-card">')
  )
  const selectedDomainCard = page.slice(
    page.indexOf('<aside v-if="selectedDomainTableRow" class="current-card">'),
    page.indexOf('</aside>', page.indexOf('<aside v-if="selectedDomainTableRow" class="current-card">'))
  )

  assert.doesNotMatch(overviewTable, /row\.ownerLabel/, '域表格行内不应常显 ownerLabel')
  assert.doesNotMatch(overviewTable, /row\.pid/, '域表格行内不应常显 PID')
  assert.doesNotMatch(overviewTable, /\{\{\s*row\.rankReason\s*\}\}/, '域表格下一步不应重复显示 rankReason')
  assert.match(selectedDomainCard, /selectedDomainTableRow\.queueSummary/)
  assert.match(selectedDomainCard, /selectedDomainHeartbeatMessage/)
  assert.match(selectedDomainCard, /selectedDomainTableVisibleEvidenceFiles/)
  assert.match(selectedDomainCard, /showQueueItemLogs/)
})

test('crawler monitor queue and progress details are behind explicit detail blocks', () => {
  const queuePanel = page.slice(
    page.indexOf('monitor-panel-stage--queue'),
    page.indexOf('monitor-panel-stage--progress')
  )
  const progressPanel = page.slice(
    page.indexOf('monitor-panel-stage--progress'),
    page.indexOf('monitor-panel-stage--reports')
  )

  assert.match(queuePanel, /class="queue-card-details"/)
  assert.match(queuePanel, /executionOverviewStatusSource\(row\)/)
  assert.match(queuePanel, /executionOverviewQueueIdentity\(row\)/)
  assert.match(queuePanel, /executionOverviewBlocker\(row\)/)
  assert.match(queuePanel, /executionOverviewTiming\(row\)/)

  assert.match(progressPanel, /class="progress-card-details"/)
  assert.match(progressPanel, /progressRowStatusSource\(row\)/)
  assert.match(progressPanel, /progressRowQueueStateLabel\(row\)/)
  assert.match(progressPanel, /progressRowCoveredDomainLabels\(row\)/)
  assert.match(progressPanel, /rowSpeedLabel\(row\)/)
  assert.match(progressPanel, /rowEtaLabel\(row\)/)
})
```

- [ ] **Step 3: 最小实现**
  - overview 域表格不新增 `expandedRow`：复用已有 `selectedDomainTableRow` 右侧 `current-card` 承接次要信息。
  - 域表格移除常显 `row.ownerLabel`、`row.pid`、重复 `row.rankReason`；右侧详情卡保留这些信息或等价说明。
  - queue 卡把 `queue-insight-grid` 包进稳定详情容器：`<details class="queue-card-details">` 或同等稳定 class。主卡常显任务名、状态、进度、建议动作。
  - progress 卡把 `progress-insight-grid`、`kv-grid`、路径/日志列表包进稳定详情容器：`<details class="progress-card-details">` 或同等稳定 class。主卡常显任务名、状态、进度、建议动作和必要控制按钮。
  - 不改后端、不改 data mapper、不重写 `buildExecutionOverviewRows` / `buildDomainTableRows`。

> 执行者注意：本任务不能用 `DONE_WITH_CONCERNS` 作为验收完成。如果折叠改动超过当前页面可控范围，应停止并修计划/拆出单独 UI 任务，而不是提交半折叠版本。

- [ ] **Step 4: 跑 check + contract**

Run: `cd data-query-app && pnpm run check && node --test tests/crawler-monitor-page-contract.test.mjs 2>&1 | tail -6`
Expected: check EXIT=0；测试 PASS

- [ ] **Step 5: 人工验收**
  - 1366px 桌面：overview 域表格一行扫过去只看到“域、状态、进度、下一步、操作”，没有 PID、长时间串、路径、队列身份。
  - 选中任一域：右侧详情卡能看到队列占用、心跳、阻塞/占用、证据文件；日志默认折叠。
  - queue/progress：每张卡首屏先显示当前任务、状态、进度、下一步；工程排查字段需要展开详情才出现。
  - 390px 移动宽度：表格仍可横向滚动，按钮文字不溢出，详情展开后不遮挡主操作。

- [ ] **Step 6: Commit**

```bash
cd /home/lolben/TerraPedia
git add data-query-app/pages/operations/crawler-monitor.vue \
        data-query-app/tests/crawler-monitor-page-contract.test.mjs
git commit -m "feat(crawler-monitor): 域行折叠次要进度信息, 突出状态与下一步"
```

---

## P3 最终验证与 staged 范围检查

- [ ] `cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs tests/crawler-monitor-domain-table.test.mjs tests/crawler-monitor-execution-overview.test.mjs tests/crawler-monitor-unified-status.test.mjs` — 全绿（unifiedStatus 未删，其测试应仍通过）。
- [ ] `cd data-query-app && pnpm run check` — EXIT=0。
- [ ] `git status --short` 核对：只触及本计划 File Structure 列出的文件。
- [ ] 人工验收：域表格每行显示后端权威状态 + 中文下一步动作；详情卡优先展示后端 blocker/blockerLabel/evidence；进度次要信息折叠、当前任务一眼可见；被回收域显示"已取消/启动重爬"，stalled/failed/timed_out 显示"终止并清理后重爬"。
- [ ] 回归检查：执行者用一个带 `state: { status, nextAction, blockerLabel, evidence }` 的 overview 响应样本确认前端显示优先级；缺 `state` 时仍回落旧 unifiedStatus，不出现空白下一步。

---

## 后续（不在本计划内 / 可选）

- **vue 物理拆分**：6911 行 `crawler-monitor.vue` 按区块（域表/执行总览/证据抽屉）抽成子组件——风险高、非本目标必需，若要做另立计划。
- **彻底删 unifiedStatus**：需先把 domainTable/executionOverview 的计算内核也迁到后端或重写，收益边际、风险高，暂不做。
