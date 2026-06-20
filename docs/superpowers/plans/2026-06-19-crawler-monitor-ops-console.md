# Crawler Monitor Ops Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the admin crawler monitor into a Chinese-first operations console where selecting a Wiki domain immediately shows status, next action, cooldown reason, heartbeat time, progress evidence, domain details, and a guarded destructive cancel flow.

**Architecture:** Keep the backend crawler API and execution contract unchanged. Add deterministic front-end display helpers, wire them into `data-query-app/pages/operations/crawler-monitor.vue`, and update source-based contract tests so the UI cannot regress to raw technical labels or direct destructive cancel. All runtime validation is read-only and must not click execute, pause, resume, or confirm cancel.

**Tech Stack:** Nuxt 4, Vue 3 `<script setup>`, TypeScript, existing `useApi`, Node `node:test` source-contract tests, existing crawler monitor API.

---

## User Complaints To Close

- Selecting a domain currently does not explain what the operator can do next.
- The `30 分钟` cooldown looks arbitrary; the page must say it protects Wiki and avoids repeated fetches.
- Heartbeat copy lacks concrete time and elapsed age.
- Cancel must mean `终止并清理文件`, not a bare `取消`, and must include a second confirmation layer to prevent accidental deletion.
- Domain details are too sparse and too English-heavy.
- Chinese should dominate the page except for technical identifiers such as `domain`, `actionId`, `progressPath`, `reportPath`, `lockPath`, and `sourceKey`.

## Source Chain And Manual Operation Boundary

Authoritative read source:

```text
GET /api/admin/crawler-monitor/overview
  -> data-query-app/types/crawlerMonitor.ts
  -> data-query-app/utils/crawlerMonitorProgressRows.mjs
  -> data-query-app/pages/operations/crawler-monitor.vue
  -> data-query-app/tests/crawler-monitor-page-contract.test.mjs
```

Existing mutating endpoints are manual-only boundaries:

```text
POST /api/admin/crawler-monitor/dispatch
POST /api/admin/crawler-monitor/dispatch/control
```

Implementation may preserve existing button wiring, but smoke validation must not trigger these actions. During browser/manual smoke, do not click:

- `开始刷新`
- `重试失败任务`
- `继续任务`
- `暂停`
- `确认终止并清理`

It is allowed to click `终止并清理文件` only far enough to open the confirmation panel; do not click the final confirmation button.

## Scope Lock

### In Scope

- `data-query-app/pages/operations/crawler-monitor.vue`
- `data-query-app/tests/crawler-monitor-page-contract.test.mjs`
- Create `data-query-app/utils/crawlerMonitorDisplay.mjs`
- Chinese-first labels and helper text for selected-domain workbench, domain detail, cooldown, heartbeat, and cancel confirmation.
- Read-only API and UI smoke against the running local stack.

### Out Of Scope

- No crawler execution, wiki fetch, pause, resume, cancel confirmation, backend refresh, import, backfill, or database write.
- No backend behavior change unless this plan is repaired first.
- No public front-end page changes.
- No unrelated admin shell/navigation redesign.

## Acceptance Criteria

- Selecting any domain updates one obvious selected-domain workbench with Chinese heading, current status, next recommended action, progress summary, heartbeat summary, cooldown explanation, and risk/warning copy.
- Primary action labels are Chinese and action-oriented: `开始刷新`, `重试失败任务`, `继续任务`, `暂停任务`, or `等待冷却`.
- Cooldown block is visible in the selected workbench when `cooldownMinutes` exists. It includes duration, last auto-run time when available, next allowed/remaining time when calculable, and the explanation `保护 Wiki，避免短时间重复请求`.
- Heartbeat block shows state `正常`, `过期`, or `暂无运行心跳`; it uses the page's existing `formatDate` for local display and shows elapsed age when `progressHeartbeatAgeMs` exists.
- Cancel is never a direct `controlWikiMonitorTask(..., 'cancel')` click from visible buttons. The first click opens a confirmation panel titled `终止并清理文件`; only `confirmWikiDomainCancel` may call `controlWikiMonitorTask(domain, 'cancel')`.
- Cancel confirmation explains that partial downloaded files, progress files, reports, and lock files may be removed. It lists all known cleanup paths from the selected progress row, matching pending dispatch, and latest dispatch result.
- Domain detail cards use Chinese field labels. Technical raw values remain visible only as values or code identifiers, not as primary headings.
- Existing monitor guarantees remain visible: stable `actionId`, progress path, report/progress preview buttons, heartbeat, and progress numbers.

## Agent Split

### Review Agents Before Execution

Run three read-only reviewers on this MD before implementation:

- UX reviewer: confirms the plan closes the user's workflow pain and Chinese-first requirement.
- Crawler safety reviewer: confirms mutating endpoints and destructive operations remain manual-only.
- Testability reviewer: confirms tests are specific enough to fail before implementation and prove the UI uses the new helpers.

Implementation starts only after all three reviewers return `APPROVE` or all blocking/important defects are repaired and re-reviewed.

### Implementation Ownership

Parallel writes to the same file are not allowed.

- Worker A may create only `data-query-app/utils/crawlerMonitorDisplay.mjs`.
- The controller or one worker owns all edits to `data-query-app/pages/operations/crawler-monitor.vue` and `data-query-app/tests/crawler-monitor-page-contract.test.mjs`.
- Review agents are read-only and may inspect all files.

## Task 1: Display Helper And Helper Tests

**Files:**

- Create: `data-query-app/utils/crawlerMonitorDisplay.mjs`
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] **Step 1: Add failing helper tests**

Append these tests near the other crawler monitor contract tests:

```js
test('crawler monitor display helpers provide Chinese operator labels', async () => {
  const helper = await import('../utils/crawlerMonitorDisplay.mjs')

  assert.equal(helper.wikiDomainChineseName({ domain: 'items', label: 'Items' }), '物品')
  assert.equal(helper.wikiDomainChineseName({ domain: 'projectiles', label: 'Projectiles' }), '射弹')
  assert.equal(helper.wikiDomainChineseName({ domain: 'armor_sets', label: 'Armor sets' }), '盔甲套装')
  assert.equal(helper.wikiDomainChineseName({ domain: 'unknown_domain', label: 'Unknown domain' }), 'unknown_domain')

  assert.equal(helper.crawlerStatusChineseLabel('running'), '运行中')
  assert.equal(helper.crawlerStatusChineseLabel('queued'), '队列中')
  assert.equal(helper.crawlerStatusChineseLabel('stalled'), '心跳过期')
  assert.equal(helper.crawlerStatusChineseLabel('failed'), '失败')
  assert.equal(helper.crawlerStatusChineseLabel(''), '未知')
})

test('crawler monitor display helpers explain cooldown edge cases', async () => {
  const helper = await import('../utils/crawlerMonitorDisplay.mjs')

  assert.match(
    helper.wikiCooldownExplanation({
      cooldownMinutes: 30,
      lastAutoRunAt: '2026-06-19T08:00:00Z',
    }, new Date('2026-06-19T08:10:00Z')),
    /Wiki 保护冷却：30 分钟。上次自动执行：2026-06-19T08:00:00Z，约 20 分钟后可再次自动执行。保护 Wiki，避免短时间重复请求。/
  )

  assert.match(
    helper.wikiCooldownExplanation({
      cooldownMinutes: 30,
    }, new Date('2026-06-19T08:10:00Z')),
    /没有上次自动执行时间/
  )

  assert.match(
    helper.wikiCooldownExplanation({
      cooldownMinutes: 30,
      lastAutoRunAt: '2026-06-19T08:00:00Z',
    }, new Date('2026-06-19T08:40:00Z')),
    /冷却已结束/
  )

  assert.match(
    helper.wikiCooldownExplanation({
      cooldownMinutes: 30,
      lastAutoRunAt: 'not-a-date',
    }, new Date('2026-06-19T08:10:00Z')),
    /上次自动执行：not-a-date/
  )
})

test('crawler monitor display helpers summarize heartbeat states', async () => {
  const helper = await import('../utils/crawlerMonitorDisplay.mjs')

  assert.deepEqual(
    helper.wikiHeartbeatSummary({
      progressHeartbeatAt: '2026-06-19T08:05:00Z',
      progressHeartbeatAgeMs: 125000,
      status: 'running',
    }),
    {
      state: '正常',
      time: '2026-06-19T08:05:00Z',
      age: '约 2 分钟前',
      message: '最后心跳：2026-06-19T08:05:00Z（约 2 分钟前）',
    }
  )

  assert.equal(
    helper.wikiHeartbeatSummary({ progressStale: true, progressHeartbeatAt: '2026-06-19T08:05:00Z' }).state,
    '过期'
  )
  assert.equal(
    helper.wikiHeartbeatSummary({ progressStale: true, progressHeartbeatAt: '2026-06-19T08:05:00Z' }).message,
    '最后心跳：2026-06-19T08:05:00Z'
  )
  assert.equal(
    helper.wikiHeartbeatSummary({ progressHeartbeatAt: '2026-06-19T08:05:00Z', progressHeartbeatAgeMs: 'bad-age' }).age,
    ''
  )
  assert.equal(helper.wikiHeartbeatSummary(null).message, '暂无运行心跳')
})
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
cd data-query-app
node --test tests/crawler-monitor-page-contract.test.mjs
```

Expected: fails because `utils/crawlerMonitorDisplay.mjs` does not exist.

- [ ] **Step 3: Create the helper**

Create `data-query-app/utils/crawlerMonitorDisplay.mjs`:

```js
const DOMAIN_NAME_MAP = {
  items: '物品',
  npcs: 'NPC',
  projectiles: '射弹',
  buffs: 'Buff',
  armor_sets: '盔甲套装',
  recipes: '配方',
  biomes: '群系',
  bosses: 'Boss',
  shimmer: '微光',
  town_npcs: '城镇 NPC',
}

const STATUS_LABEL_MAP = {
  running: '运行中',
  queued: '队列中',
  pending: '等待确认',
  paused: '已暂停',
  stalled: '心跳过期',
  failed: '失败',
  error: '错误',
  blocked: '已阻断',
  completed: '已完成',
  cancelled: '已取消',
  missing: '缺失',
  ready: '可执行',
  unknown: '未知',
}

export function wikiDomainChineseName(domain) {
  const key = String(domain?.domain || '').trim()
  const label = String(domain?.label || '').trim()
  return DOMAIN_NAME_MAP[key] || key || label || '未知域'
}

export function crawlerStatusChineseLabel(status) {
  const normalized = String(status || '').toLowerCase()
  return STATUS_LABEL_MAP[normalized] || normalized || '未知'
}

export function formatDurationFromMs(ms) {
  const value = Number(ms)
  if (!Number.isFinite(value) || value < 0) return ''
  const minutes = Math.max(1, Math.round(value / 60000))
  if (minutes < 60) return `约 ${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `约 ${hours} 小时 ${rest} 分钟前` : `约 ${hours} 小时前`
}

export function wikiCooldownExplanation(domain, now = new Date()) {
  const minutes = Number(domain?.cooldownMinutes || 0)
  if (!minutes) return ''

  const suffix = '保护 Wiki，避免短时间重复请求。'
  const lastAutoRunAt = String(domain?.lastAutoRunAt || '').trim()
  if (!lastAutoRunAt) {
    return `Wiki 保护冷却：${minutes} 分钟。当前没有上次自动执行时间。${suffix}`
  }

  const lastMs = Date.parse(lastAutoRunAt)
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(String(now))
  if (!Number.isFinite(lastMs) || !Number.isFinite(nowMs)) {
    return `Wiki 保护冷却：${minutes} 分钟。上次自动执行：${lastAutoRunAt}。${suffix}`
  }

  const nextMs = lastMs + minutes * 60000
  const remainingMs = nextMs - nowMs
  if (remainingMs > 0) {
    const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000))
    return `Wiki 保护冷却：${minutes} 分钟。上次自动执行：${lastAutoRunAt}，约 ${remainingMinutes} 分钟后可再次自动执行。${suffix}`
  }

  return `Wiki 保护冷却：${minutes} 分钟。上次自动执行：${lastAutoRunAt}，冷却已结束。${suffix}`
}

export function wikiHeartbeatSummary(row) {
  if (!row) {
    return {
      state: '暂无运行心跳',
      time: '',
      age: '',
      message: '暂无运行心跳',
    }
  }

  const time = row.progressHeartbeatAt || row.action?.lastHeartbeatAt || row.updatedAt || ''
  const age = formatDurationFromMs(row.progressHeartbeatAgeMs)
  const status = String(row.status || row.action?.status || '').toLowerCase()
  const stale = Boolean(row.progressStale) || status === 'stalled'
  const state = stale ? '过期' : time ? '正常' : '暂无运行心跳'
  const message = time ? `最后心跳：${time}${age ? `（${age}）` : ''}` : '暂无运行心跳'

  return {
    state,
    time,
    age,
    message,
  }
}
```

- [ ] **Step 4: Run helper tests again**

Run:

```bash
cd data-query-app
node --test tests/crawler-monitor-page-contract.test.mjs
```

Expected: the helper tests pass and no existing contract assertion is broken.

## Task 2: Selected-Domain Workbench And Domain Details

**Files:**

- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] **Step 1: Add source contract tests for the selected workbench**

Add tests that slice the selected workbench/detail template and prove computed display values are used there:

```js
test('crawler monitor selected domain workbench is Chinese-first and uses display computed values', () => {
  assert.match(page, /selectedDomainDisplayName/)
  assert.match(page, /selectedDomainOperatorSummary/)
  assert.match(page, /selectedDomainNextActionLabel/)
  assert.match(page, /selectedDomainCooldownExplanation/)
  assert.match(page, /selectedDomainHeartbeatMessage/)
  assert.match(page, /selectedDomainHeartbeatState/)

  const workbench = page.slice(
    page.indexOf('class="panel recovery-workbench wiki-workbench"'),
    page.indexOf('class="panel recovery-domain-panel"')
  )

  for (const copy of ['当前选中域', '下一步建议', '为什么不能执行', 'Wiki 保护冷却', '最后心跳', '心跳状态', '运行文件']) {
    assert.match(workbench, new RegExp(copy))
  }

  assert.match(workbench, /{{ selectedDomainDisplayName }}/)
  assert.match(workbench, /{{ selectedDomainOperatorSummary }}/)
  assert.match(workbench, /{{ selectedDomainNextActionLabel }}/)
  assert.match(workbench, /{{ selectedDomainCooldownExplanation }}/)
  assert.match(workbench, /{{ selectedDomainHeartbeatMessage }}/)
  assert.match(workbench, /{{ selectedDomainHeartbeatState }}/)
})

test('crawler monitor domain detail uses Chinese field labels around technical identifiers', () => {
  const detail = page.slice(
    page.indexOf('class="panel recovery-detail"'),
    page.indexOf('class="wiki-domain-download-window"')
  )

  for (const copy of ['域详情', '数据来源键', '定位规则', '上次检查', '白名单动作 ID', '进度文件', '报告文件', '技术标识']) {
    assert.match(detail, new RegExp(copy))
  }

  assert.match(detail, /{{ selectedDomainDisplayName }} 域详情/)
  assert.doesNotMatch(detail, /{{ selectedWikiDomain\.label \|\| selectedWikiDomain\.domain \|\| '未知域' }} 详情/)

  for (const rawHeading of ['>sourceKey<', '>locator<', '>lastCheckedAt<', '>recommendedActionId<', '>progressPath<']) {
    assert.doesNotMatch(detail, new RegExp(rawHeading))
  }
})
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
cd data-query-app
node --test tests/crawler-monitor-page-contract.test.mjs
```

Expected: fails because the current selected workbench still uses raw labels and direct helper calls.

- [ ] **Step 3: Import display helpers**

In `data-query-app/pages/operations/crawler-monitor.vue`, add:

```ts
import {
  crawlerStatusChineseLabel,
  wikiCooldownExplanation,
  wikiDomainChineseName,
  wikiHeartbeatSummary,
} from '~/utils/crawlerMonitorDisplay.mjs'
```

- [ ] **Step 4: Add computed display values**

Add near the existing selected-domain computed block:

```ts
const selectedDomainDisplayName = computed(() => selectedWikiDomain.value ? wikiDomainChineseName(selectedWikiDomain.value) : '暂无可选域')
const selectedDomainStatusLabel = computed(() => selectedWikiDomain.value ? crawlerStatusChineseLabel(wikiDomainFlowStatus(selectedWikiDomain.value)) : '未知')
const selectedDomainCooldownExplanation = computed(() => selectedWikiDomain.value ? wikiCooldownExplanation(selectedWikiDomain.value) : '')
const selectedDomainHeartbeatRaw = computed(() => wikiHeartbeatSummary(selectedWikiProgressRow.value))
const selectedDomainHeartbeatMessage = computed(() => {
  const summary = selectedDomainHeartbeatRaw.value
  if (!summary.time) return summary.message
  const localTime = formatDate(summary.time)
  return summary.age ? `最后心跳：${localTime}（${summary.age}）` : `最后心跳：${localTime}`
})
const selectedDomainHeartbeatState = computed(() => selectedDomainHeartbeatRaw.value.state)
const selectedDomainNextActionLabel = computed(() => {
  const domain = selectedWikiDomain.value
  if (!domain) return '暂无可操作域'
  if (canRetryWikiDomain(domain)) return '重试失败任务'
  if (canResumeWikiDomain(domain)) return '继续任务'
  if (canPauseWikiDomain(domain)) return '暂停任务'
  if (canExecuteWikiDomain(domain)) return '开始刷新'
  if (domain.cooldownMinutes) return '等待冷却'
  return '暂不可执行'
})
const selectedDomainOperatorSummary = computed(() => {
  const domain = selectedWikiDomain.value
  if (!domain) return '请选择一个域查看可执行动作。'
  const reason = selectedWikiActionDisabledReason.value
  if (reason) return `${selectedDomainDisplayName.value} 当前${selectedDomainStatusLabel.value}，${reason}。${selectedDomainHeartbeatMessage.value}。`
  return `${selectedDomainDisplayName.value} 当前${selectedDomainStatusLabel.value}，可以执行：${selectedDomainNextActionLabel.value}。${selectedDomainHeartbeatMessage.value}。`
})
```

- [ ] **Step 5: Update selected workbench template**

Replace technical-first labels in the selected workbench with Chinese-first copy. The workbench must include these bindings:

```vue
<span class="ops-card__label">当前选中域</span>
<h2>{{ selectedDomainDisplayName }} · {{ selectedDomainStatusLabel }}</h2>
<p>{{ selectedDomainOperatorSummary }}</p>
```

Use visible metric labels:

```vue
<span><small>状态</small><strong>{{ selectedDomainStatusLabel }}</strong></span>
<span><small>下一步建议</small><strong>{{ selectedDomainNextActionLabel }}</strong></span>
<span><small>最后心跳</small><strong>{{ selectedDomainHeartbeatMessage }}</strong></span>
<span><small>心跳状态</small><strong>{{ selectedDomainHeartbeatState }}</strong></span>
```

Add a visible cooldown block in the selected workbench:

```vue
<div v-if="selectedDomainCooldownExplanation" class="wiki-workbench__cooldown">
  <span>Wiki 保护冷却</span>
  <p>{{ selectedDomainCooldownExplanation }}</p>
</div>
```

Add a disabled reason block:

```vue
<div v-if="selectedWikiActionDisabledReason" class="wiki-workbench__warning">
  <span>为什么不能执行</span>
  <p>{{ selectedWikiActionDisabledReason }}</p>
</div>
```

- [ ] **Step 6: Update domain detail template**

Keep raw values, but use Chinese labels:

```vue
<h2>{{ selectedDomainDisplayName }} 域详情</h2>
<span>数据来源键</span>
<span>定位规则</span>
<span>上次检查</span>
<span>白名单动作 ID</span>
<span>进度文件</span>
<span>报告文件</span>
<span>技术标识</span>
```

- [ ] **Step 7: Run page contract and type checks**

Run:

```bash
cd data-query-app
node --test tests/crawler-monitor-page-contract.test.mjs
pnpm run check
```

Expected: both commands pass.

## Task 3: Guarded Destructive Cancel

**Files:**

- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] **Step 1: Replace old cancel assertions and add safety tests**

The existing test `crawler monitor domain locator is a floating download-style window, not a sidebar action panel` currently asserts direct cancel in the floating window. Replace that assertion with `openCancelConfirm(domain)`.

Add this test:

```js
test('crawler monitor cancel is guarded as destructive cleanup', () => {
  assert.match(page, /cancelConfirmDomainKey/)
  assert.match(page, /openCancelConfirm/)
  assert.match(page, /confirmWikiDomainCancel/)
  assert.match(page, /cancelCleanupPaths/)
  assert.match(page, /matchingPendingDispatch/)
  assert.match(page, /终止并清理文件/)
  assert.match(page, /会停止当前任务，并可能删除已经下载的临时文件/)
  assert.match(page, /确认终止并清理/)

  assert.doesNotMatch(page, /@click="controlWikiMonitorTask\(selectedWikiDomain, 'cancel'\)"/)
  assert.doesNotMatch(page, /@click\.stop="controlWikiMonitorTask\(domain, 'cancel'\)"/)

  const cancelCallMatches = [...page.matchAll(/controlWikiMonitorTask\([^)]*, 'cancel'\)/g)]
  assert.equal(cancelCallMatches.length, 1)

  const confirmStart = page.indexOf('async function confirmWikiDomainCancel')
  const confirmEnd = page.indexOf('\\n}', confirmStart)
  assert.ok(confirmStart >= 0)
  assert.ok(confirmEnd > confirmStart)
  const onlyCancelCallIndex = cancelCallMatches[0].index
  assert.ok(onlyCancelCallIndex > confirmStart && onlyCancelCallIndex < confirmEnd)
})
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
cd data-query-app
node --test tests/crawler-monitor-page-contract.test.mjs
```

Expected: fails because visible cancel buttons currently call `controlWikiMonitorTask(..., 'cancel')` directly and no confirmation state exists.

- [ ] **Step 3: Add cancel confirmation state and path collection**

In `crawler-monitor.vue` script, add:

```ts
const cancelConfirmDomainKey = ref('')

const cancelConfirmDomain = computed(() => {
  if (!cancelConfirmDomainKey.value) return null
  return visibleWikiDomainRows.value.find((domain) => wikiDomainKey(domain) === cancelConfirmDomainKey.value) || null
})

const matchingPendingDispatch = computed(() => {
  const domain = cancelConfirmDomain.value
  if (!domain) return null
  const key = wikiDomainKey(domain)
  return pendingWikiDispatches.value.find((dispatch) => {
    if (dispatch.domain && dispatch.domain === domain.domain) return true
    if (dispatch.actionId && dispatch.actionId === domain.recommendedActionId) return true
    if (dispatch.progressPath && dispatch.progressPath === (wikiDomainProgressRow(domain) ? rowSourcePath(wikiDomainProgressRow(domain)) : domain.progressPath)) return true
    return wikiDomainKey({ domain: dispatch.domain || '', label: dispatch.domain || '' }) === key
  }) || null
})

const cancelCleanupPaths = computed(() => {
  const domain = cancelConfirmDomain.value
  if (!domain) return []
  const row = wikiDomainProgressRow(domain)
  const pending = matchingPendingDispatch.value
  const latest = latestDispatchBelongsToSelected.value ? latestDispatchResult.value : null
  const values = [
    row ? rowSourcePath(row) : domain.progressPath,
    row?.reportPath,
    pending?.progressPath,
    pending?.reportPath,
    pending?.lockPath,
    latest?.progressPath,
    latest?.reportPath,
    latest?.lockPath,
  ]
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
})

function openCancelConfirm(domain: CrawlerMonitorWikiDomain | null | undefined) {
  if (!domain || !canCancelWikiDomain(domain)) return
  selectWikiDomain(domain)
  cancelConfirmDomainKey.value = wikiDomainKey(domain)
}

function closeCancelConfirm() {
  cancelConfirmDomainKey.value = ''
}

async function confirmWikiDomainCancel() {
  const domain = cancelConfirmDomain.value
  if (!domain) return
  await controlWikiMonitorTask(domain, 'cancel')
  closeCancelConfirm()
}
```

If TypeScript cannot narrow the path filter, replace the return line with:

```ts
return Array.from(new Set(values.filter((value) => Boolean(value)))) as string[]
```

- [ ] **Step 4: Replace visible direct cancel handlers**

Replace selected workbench cancel:

```vue
@click="openCancelConfirm(selectedWikiDomain)"
```

Replace floating domain-window cancel:

```vue
@click.stop="openCancelConfirm(domain)"
```

Use the visible label:

```vue
<span>{{ canCancelWikiDomain(selectedWikiDomain) ? (wikiControlLoading === selectedWikiDomain.domain ? '处理中' : '终止并清理文件') : '终止不可用' }}</span>
```

- [ ] **Step 5: Add confirmation panel**

Add before the report preview modal:

```vue
<section v-if="cancelConfirmDomain" class="cancel-confirm-panel" role="dialog" aria-modal="true" aria-label="终止并清理文件确认">
  <div class="cancel-confirm-panel__body">
    <span class="ops-card__label">危险操作确认</span>
    <h2>终止并清理文件：{{ wikiDomainChineseName(cancelConfirmDomain) }}</h2>
    <p>会停止当前任务，并可能删除已经下载的临时文件、进度文件、报告文件或锁文件。确认前请核对下面的路径。</p>
    <ul v-if="cancelCleanupPaths.length">
      <li v-for="path in cancelCleanupPaths" :key="path"><code>{{ path }}</code></li>
    </ul>
    <p v-else>当前没有返回具体清理路径，但取消仍可能清理该任务的运行产物。</p>
    <div class="cancel-confirm-panel__actions">
      <button type="button" class="inline-report-button" @click="closeCancelConfirm">暂不取消</button>
      <button
        type="button"
        class="inline-report-button inline-report-button--danger"
        :disabled="wikiControlLoading === cancelConfirmDomain.domain"
        @click="confirmWikiDomainCancel"
      >
        确认终止并清理
      </button>
    </div>
  </div>
</section>
```

- [ ] **Step 6: Add scoped CSS**

Add in the existing scoped style:

```css
.cancel-confirm-panel {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.48);
}

.cancel-confirm-panel__body {
  width: min(620px, 100%);
  display: grid;
  gap: 16px;
  padding: 22px;
  border-radius: 8px;
  background: var(--color-bg);
  border: 1px solid color-mix(in srgb, var(--color-danger) 34%, transparent);
  box-shadow: var(--shadow-xl);
}

.cancel-confirm-panel__body ul {
  display: grid;
  gap: 8px;
  margin: 0;
  padding-left: 18px;
}

.cancel-confirm-panel__body code {
  overflow-wrap: anywhere;
}

.cancel-confirm-panel__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}
```

- [ ] **Step 7: Run tests**

Run:

```bash
cd data-query-app
node --test tests/crawler-monitor-page-contract.test.mjs
pnpm run check
```

Expected: both commands pass.

## Task 4: Read-Only Runtime Smoke And Final Validation

**Files:**

- No new production files unless earlier tasks require plan repair.

- [ ] **Step 1: Verify local stack health**

Run:

```bash
bash scripts/dev/verify-local-stack.sh
```

Expected: `verify-local-stack: all requested checks passed.`

- [ ] **Step 2: Authenticated API smoke with crawler-read-only boundary**

This step uses `POST /api/auth/login` only to obtain an admin JWT. The auth endpoint may record login/rate-limit/audit state; it is not a crawler, wiki, import, backfill, or database-content mutation. The crawler monitor smoke itself must remain `GET /api/admin/crawler-monitor/overview` only.

Run:

```bash
TOKEN=$(curl -s -X POST http://localhost:18088/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin"}' | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s);process.stdout.write(j.data.token)})")
curl -s http://localhost:18088/api/admin/crawler-monitor/overview -H "Authorization: Bearer $TOKEN" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s); const d=j.data||j; console.log(JSON.stringify({domains:d.wikiMonitor?.domains?.length, pendingDispatches:d.wikiMonitor?.pendingDispatches?.length, registeredTasks:d.registeredTasks?.length, latestRunFound:d.latestRun?.found}, null, 2))})"
```

Expected: prints counts only. This must not start, pause, resume, cancel, refresh, import, or backfill any task.

- [ ] **Step 3: Manual/browser smoke without mutating actions**

Open `http://localhost:3001/operations/crawler-monitor` and verify:

- selected domain heading is Chinese-first;
- selecting a domain changes the workbench immediately;
- cooldown reason is visible and explains Wiki protection;
- heartbeat shows a concrete formatted time or `暂无运行心跳`;
- domain detail labels are Chinese-first;
- clicking `终止并清理文件` opens confirmation;
- the final button `确认终止并清理` is visible but is not clicked;
- execute, pause, resume, retry, and final cancel confirmation are not clicked.

- [ ] **Step 4: Final repository validation**

Run:

```bash
cd data-query-app
node --test tests/crawler-monitor-page-contract.test.mjs
pnpm run check
cd ..
bash scripts/dev/verify-local-stack.sh
git status --short
git diff --check
```

Expected: tests/checks pass, local stack is healthy, and diff has no whitespace errors.

## Plan Repair Rules

If implementation discovers that backend overview data cannot support an acceptance criterion:

1. Stop the implementation task.
2. Record the missing field and the blocked UI requirement in this MD.
3. Re-run plan audit and reviewer cross-check before backend changes.
4. If backend changes become necessary, add backend tests for `AdminCrawlerMonitorController` or `CrawlerMonitorServiceImpl`.
5. Keep crawler execution and destructive controls manual-only.

If contract tests pass but manual smoke still shows the original UX complaint:

1. Treat it as an important plan defect.
2. Add a targeted contract assertion that would have caught the issue.
3. Fix the UI.
4. Re-run `node --test tests/crawler-monitor-page-contract.test.mjs`, `pnpm run check`, and the read-only smoke.

## Commit Scope

After validation passes, create one focused commit:

```bash
git add data-query-app/pages/operations/crawler-monitor.vue data-query-app/tests/crawler-monitor-page-contract.test.mjs data-query-app/utils/crawlerMonitorDisplay.mjs docs/superpowers/plans/2026-06-19-crawler-monitor-ops-console.md
git commit -m "feat(admin): clarify crawler monitor operations"
```

Do not push unless explicitly requested.
