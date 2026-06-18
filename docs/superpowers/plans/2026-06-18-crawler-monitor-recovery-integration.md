# Crawler Monitor Recovery Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Goal

把 `reports/crawler-monitor/design-drafts-2026-06-18/v1-flow-map-focused-recovery.html` 的“选中域工作台 + 恢复动作 + 报告抽屉 + 派发反馈”接入真实后台页面 `data-query-app/pages/operations/crawler-monitor.vue`。

本轮只做页面接入和简单交互，不新增爬虫能力，不扩展真实自动化调度。已有后端接口可以调用：

- `GET /admin/crawler-monitor/overview`
- `GET /admin/crawler-monitor/report?path=...`
- `POST /admin/crawler-monitor/dispatch`
- `POST /admin/crawler-monitor/dispatch/control`

## Success Criteria

- 监控页首屏能清楚看到当前活动、整体进度、待处理、异常、心跳。
- Wiki 域与 registered task 统一进入一个“域工作台”：点击域后，主进度、恢复建议、详情、右侧全域状态同步切换。
- 每个域展示清楚：状态、进度、心跳、速度、预计剩余、progressPath、reportPath、recommendedActionId。
- 手动执行、重试、继续、暂停、打开报告、查看命令都在选中域上下文内出现；按钮不可用时必须给出原因。
- 调用真实派发接口后，页面显示后端返回的 `dispatchId / status / progressPath / reportPath / message`，并刷新 overview。
- 报告抽屉保留真实 `openReportPreview` 能力，且能从选中域详情、右侧域列表、派发反馈打开。
- 样式继续使用项目现有变量和后台风格：信息密度高、专业、清晰、有高级感；不使用静态稿的米色独立风格。
- 不再把低价值“占位链路”放在主屏；“数据主链路”类文案不能回归。
- 测试覆盖页面契约，至少证明工作台、恢复动作、派发反馈、报告入口、右侧域状态存在。

## Non-Goals

- 不新增真实爬虫脚本。
- 不修改数据库。
- 不改 `/operations/crawler-monitor-test` 的每域 10 条测试页。
- 不把手动模式改成全自动模式。
- 不新增新的后端 API；如前端类型缺字段，只补前端类型并核对现有后端 DTO。

## Current Entry Points

- Real page: `data-query-app/pages/operations/crawler-monitor.vue`
- Types: `data-query-app/types/crawlerMonitor.ts`
- Progress row utility: `data-query-app/utils/crawlerMonitorProgressRows.mjs`
- Page contract tests: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`
- Backend controller: `back/src/main/java/com/terraria/skills/controller/AdminCrawlerMonitorController.java`
- Backend service: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Dispatch DTOs:
  - `back/src/main/java/com/terraria/skills/dto/CrawlerMonitorDispatchRequestDTO.java`
  - `back/src/main/java/com/terraria/skills/dto/CrawlerMonitorDispatchResultDTO.java`

## Data Contract Notes

Use existing frontend data:

- `wikiMonitor.domains[]` gives domain metadata and `recommendedActionId`.
- `pendingDispatches[]` gives pending approval rows.
- `progressRowsFromOverview(overview)` gives live registered task rows and progress paths.
- `wikiDomainProgressRow(domain)` already maps domain to a progress row by path or domain key.
- `executeWikiMonitorTask(target)` already posts to `/admin/crawler-monitor/dispatch`.
- `controlWikiMonitorTask(domain, 'pause' | 'resume')` and `controlProgressTask(row, 'pause' | 'resume')` already post to `/admin/crawler-monitor/dispatch/control`.
- `openReportPreview(path)` already opens the real report drawer.

Add only frontend state for the latest dispatch result:

```ts
const selectedWikiDomainKey = ref('')
const latestDispatchResult = ref<CrawlerMonitorDispatchResult | null>(null)
const commandPreviewDomainKey = ref('')
```

`CrawlerMonitorDispatchResult` type must be added to `data-query-app/types/crawlerMonitor.ts` if missing. It should mirror the existing backend DTO:

```ts
export interface CrawlerMonitorDispatchResult {
  accepted?: boolean
  dispatchId?: string | null
  domain?: string | null
  actionId?: string | null
  status?: string | null
  progressPath?: string | null
  lockPath?: string | null
  reportPath?: string | null
  message?: string | null
}
```

## Implementation Tasks

### Task 1: Add Page State Model For Selected Domain Workbench

- [ ] Add `CrawlerMonitorDispatchResult` to `data-query-app/types/crawlerMonitor.ts`.
- [ ] Import it in `data-query-app/pages/operations/crawler-monitor.vue`.
- [ ] Add selected-domain and dispatch-feedback refs:

```ts
const selectedWikiDomainKey = ref('')
const latestDispatchResult = ref<CrawlerMonitorDispatchResult | null>(null)
const commandPreviewDomainKey = ref('')
```

- [ ] Add computed `selectedWikiDomain`.

Implementation shape:

```ts
const selectedWikiDomain = computed<CrawlerMonitorWikiDomain | null>(() => {
  const rows = visibleWikiDomainRows.value
  if (!rows.length) return null
  const selected = rows.find((domain) => wikiDomainKey(domain) === selectedWikiDomainKey.value)
  return selected || rows[0] || null
})
```

- [ ] Add helpers:

```ts
function wikiDomainKey(domain: CrawlerMonitorWikiDomain | null | undefined) {
  return String(domain?.domain || domain?.label || '').trim()
}

function selectWikiDomain(domain: CrawlerMonitorWikiDomain) {
  selectedWikiDomainKey.value = wikiDomainKey(domain)
}
```

- [ ] Add watch that keeps selection valid when overview refreshes:

```ts
watch(visibleWikiDomainRows, (rows) => {
  if (!rows.length) {
    selectedWikiDomainKey.value = ''
    return
  }
  if (!rows.some((domain) => wikiDomainKey(domain) === selectedWikiDomainKey.value)) {
    selectedWikiDomainKey.value = wikiDomainKey(rows[0])
  }
}, { immediate: true })
```

- [ ] Add helpers for selected domain:

```ts
const selectedWikiProgressRow = computed(() => selectedWikiDomain.value ? wikiDomainProgressRow(selectedWikiDomain.value) : null)
const selectedWikiRecoveryTitle = computed(() => selectedWikiDomain.value ? wikiDomainRecoveryTitle(selectedWikiDomain.value) : '暂无可选域')
const selectedWikiRecoveryCopy = computed(() => selectedWikiDomain.value ? wikiDomainRecoveryCopy(selectedWikiDomain.value) : '当前没有可展示的 Wiki 域。')
```

- [ ] Add `wikiDomainRecoveryTitle(domain)` and `wikiDomainRecoveryCopy(domain)` with concrete labels:
  - running: `继续观察运行`
  - stalled: `心跳过期，优先重试`
  - failed/error: `失败可重试`
  - paused: `继续执行`
  - pending/ready/changed: `手动执行刷新`
  - blocked: `已阻断，查看原因`
  - completed: `打开报告复核`
  - missing: `缺少进度，先执行刷新`

### Task 2: Capture Dispatch Result And Surface It In The Page

- [ ] Update `executeWikiMonitorTask(target)` to store the real response:

```ts
const response: any = await post('/admin/crawler-monitor/dispatch', {
  domain: domain.domain,
  actionId,
})
latestDispatchResult.value = (response?.data ?? response) || null
showToast(latestDispatchResult.value?.message || '已派发刷新任务', latestDispatchResult.value?.accepted === false ? 'warning' : 'success')
await loadOverview()
```

- [ ] Update `controlWikiMonitorTask` and `controlProgressTask` similarly:

```ts
const response: any = await post('/admin/crawler-monitor/dispatch/control', {...})
latestDispatchResult.value = (response?.data ?? response) || null
```

- [ ] Add helpers:

```ts
const latestDispatchBelongsToSelected = computed(() => {
  const selected = selectedWikiDomain.value
  const result = latestDispatchResult.value
  if (!selected || !result) return false
  if (selected.domain && result.domain) return selected.domain === result.domain
  const selectedProgressPath = selectedWikiProgressPath.value
  if (selectedProgressPath && result.progressPath) return selectedProgressPath === result.progressPath
  if (selected.recommendedActionId && result.actionId) return selected.recommendedActionId === result.actionId
  return false
})

function dispatchResultPath(kind: 'progress' | 'report' | 'lock') {
  const result = latestDispatchResult.value
  if (!result) return ''
  if (kind === 'progress') return result.progressPath || ''
  if (kind === 'report') return result.reportPath || ''
  return result.lockPath || ''
}
```

- [ ] Keep feedback visible after refresh. Do not clear `latestDispatchResult` inside `loadOverview`.
- [ ] Add selected-path helpers so report and progress paths are never mixed:

```ts
const selectedWikiProgressPath = computed(() => selectedWikiProgressRow.value
  ? rowSourcePath(selectedWikiProgressRow.value)
  : selectedWikiDomain.value?.progressPath || ''
)

const selectedWikiReportPath = computed(() => selectedWikiProgressRow.value?.reportPath || '')
```

- [ ] Dispatch feedback display rule:
  - If `latestDispatchBelongsToSelected` is true, show the feedback in the selected domain recovery panel.
  - If `latestDispatchResult` exists but does not belong to the selected domain, show a compact “上一条派发” card with `domain / actionId / status` and a “切到该域” button when the result has a matching domain.
  - If the result cannot be matched by `domain`, `progressPath`, or `actionId`, show it as global latest dispatch feedback and do not attach it to the selected domain.

### Task 3: Replace The Existing Wiki Manual Section With A Domain Workbench

Edit only the `wiki-action-primary` section in `data-query-app/pages/operations/crawler-monitor.vue`.

Required structure:

- Header: `Wiki 数据变化 / 手动执行`
- Summary metric strip using `wikiMonitorSummaryCards`.
- Collapsed state keeps small summary, but expanded state uses a workbench:
  - left: selected domain live progress
  - middle: recovery action panel
  - right: all domain status list
  - bottom: selected domain details and pending approvals

Template blocks to include:

```vue
<div v-if="wikiActionExpanded" class="wiki-workbench">
  <section class="wiki-live-panel">
    ...
  </section>
  <aside class="wiki-recovery-panel">
    ...
  </aside>
  <aside class="wiki-domain-sidebar">
    ...
  </aside>
</div>
```

The selected live panel must show:

- selected domain label and raw domain key
- `wikiDomainFlowLabel(selectedWikiDomain)`
- `rowProgressLabel(selectedWikiProgressRow)`
- progress bar using `rowProgress(selectedWikiProgressRow)`
- heartbeat using `wikiDomainHeartbeatLabel(selectedWikiDomain)`
- speed using `rowSpeedLabel(selectedWikiProgressRow)`
- ETA using `rowEtaLabel(selectedWikiProgressRow)`
- path using `rowSourcePath(selectedWikiProgressRow) || selectedWikiDomain.progressPath`

Recovery panel buttons:

- Execute/retry:
  - label from `wikiDomainPrimaryActionLabel(selectedWikiDomain)`
  - disabled by `!canExecuteWikiDomain(selectedWikiDomain) || wikiDispatchLoading === selectedWikiDomain.domain`
  - click `executeWikiMonitorTask(selectedWikiDomain)`
- Pause:
  - visible when `canPauseWikiDomain(selectedWikiDomain)`
  - click `controlWikiMonitorTask(selectedWikiDomain, 'pause')`
- Resume:
  - visible when `canResumeWikiDomain(selectedWikiDomain)`
  - click `controlWikiMonitorTask(selectedWikiDomain, 'resume')`
- Open report:
  - visible only when `selectedWikiReportPath` is previewable
  - click `openReportPreview(selectedWikiReportPath)`
- View progress file:
  - visible when `selectedWikiProgressPath` is previewable
  - click `openReportPreview(selectedWikiProgressPath)`
- View command:
  - toggles `commandPreviewDomainKey`
  - displays `selectedWikiDomain.recommendedActionId`, `selectedWikiDomain.domain`, `selectedWikiDomain.progressPath`, and pending dispatch `commandPreview` if available

Disabled-action rule:

- Execute/retry button stays visible even when disabled and shows `wikiDomainDisabledReason(selectedWikiDomain) || wikiDomainManualHint(selectedWikiDomain)` directly under the button group.
- Pause and resume can be hidden when unavailable, but the recovery panel must still show an operation-state line explaining the current available control: running can pause, paused can resume, otherwise no active process control.
- Disabled buttons must use a real `:title` value with the same reason text.

All domain status list:

- Render `visibleWikiDomainRows`.
- Click calls `selectWikiDomain(domain)`.
- Active state uses `wikiDomainKey(domain) === wikiDomainKey(selectedWikiDomain)`.
- Each row shows label, status pill, progress bar, heartbeat, primary action hint.
- Each row includes compact file actions:
  - `报告` uses `row.reportPath` only when previewable.
  - `进度` uses `rowSourcePath(row) || domain.progressPath` only when previewable.
  - Clicks on file action buttons must call `event.stopPropagation()` so they do not accidentally switch domain unless the implementation explicitly selects then opens.

Selected domain details:

- Show source key, locator, last checked, current value, previous value, recommended action, dispatch mode.
- Show `wikiDomainDisabledReason(selectedWikiDomain) || wikiDomainManualHint(selectedWikiDomain)`.
- Show report/progress buttons only when paths are previewable.
- Report and progress buttons must be visually distinct:
  - `打开报告` uses report path.
  - `查看进度文件` uses progress path.
  - Never label a progress JSON as report.

Pending approvals:

- Keep `pendingWikiDispatches` visible, but place them under workbench as compact rows.
- Clicking a pending row selects its domain first, then executes.
- Selecting a pending row alone must not auto-dispatch; dispatch only happens from an explicit user click on the row action button.

### Task 4: Upgrade Visual Style While Staying In Project Style

Use existing project variables:

- `--color-bg`
- `--color-bg-secondary`
- `--color-border`
- `--color-text`
- `--color-text-secondary`
- `--color-primary`
- semantic tone classes already present: `.success`, `.danger`, `.warning`, `.info`, `.muted`

Style requirements:

- The workbench should look like an admin operations console, not a marketing page.
- Use restrained depth: subtle border, soft background layering, no decorative blobs.
- Cards use `border-radius: 8px` or `10px`, not large pill/card-heavy decoration.
- Use compact metrics, tabular numbers, progress bars, and clear active state.
- The right domain sidebar must have a fixed max height and scroll without pushing the main page.
- No horizontal overflow at 1440, 1180, 980, 720 breakpoints.
- Responsive layout:
  - `>=1180px`: three-column workbench, live panel + recovery panel + right domain sidebar.
  - `980px-1179px`: two-column workbench, domain sidebar spans full width below live/recovery panels.
  - `<=720px`: single-column workbench; domain sidebar appears above details, detail grid becomes one column, long path/command/dispatchId uses `overflow-wrap:anywhere`.
- Empty values must render as muted operational states such as `无心跳`, `暂无报告`, `未生成进度` instead of filling the workbench with unexplained `--`.
- Path, command, dispatchId, progressPath and reportPath use monospace styling and `overflow-wrap:anywhere`.

Classes to add/update in `crawler-monitor.vue` scoped style:

- `.wiki-workbench`
- `.wiki-live-panel`
- `.wiki-live-panel__head`
- `.wiki-live-percent`
- `.wiki-live-metrics`
- `.wiki-recovery-panel`
- `.wiki-recovery-actions`
- `.wiki-dispatch-feedback`
- `.wiki-command-preview`
- `.wiki-domain-sidebar`
- `.wiki-domain-side-list`
- `.wiki-domain-side-row`
- `.wiki-domain-side-row--active`
- `.wiki-domain-detail-grid`
- `.wiki-detail-card`
- `.wiki-pending-compact`

Remove or stop using bulky old classes when replaced:

- Keep `.wiki-domain-card` only if still used below the workbench.
- Do not reintroduce `focus-progress-panel`, `operations-grid`, or `数据主链路`.

### Task 5: Update Contract Tests

Edit `data-query-app/tests/crawler-monitor-page-contract.test.mjs`.

Add or update tests to assert:

- Page contains `selectedWikiDomain`, `selectedWikiProgressRow`, `latestDispatchResult`.
- Page contains `wiki-workbench`, `wiki-recovery-panel`, `wiki-domain-sidebar`, `wiki-dispatch-feedback`, `wiki-command-preview`.
- Page contains `selectedWikiProgressPath`, `selectedWikiReportPath`, `latestDispatchBelongsToSelected`.
- Page contains side-list file actions for both `报告` and `进度`, and the click handlers stop propagation.
- Existing collapsed behavior remains:
  - `const wikiActionExpanded = ref(false)`
  - `wiki-action-primary--collapsed`
  - `展开执行`
- Dispatch result is stored:
  - `latestDispatchResult.value = (response?.data ?? response) || null`
- Dispatch feedback renders `dispatchId`, `status`, `progressPath`, `reportPath`, and `message`.
- `controlProgressTask` and `controlWikiMonitorTask` also assign `latestDispatchResult.value`.
- Report opening remains:
  - `openReportPreview`
  - `isPreviewableReportPath`
- Path split remains explicit:
  - `打开报告` uses `selectedWikiReportPath`
  - `查看进度文件` uses `selectedWikiProgressPath`
  - `selectedWikiDomain.progressPath` is not used as a report label
- Selected-domain linkage exists:
  - `selectWikiDomain`
  - `wikiDomainKey(domain) === wikiDomainKey(selectedWikiDomain)`
  - `selectedWikiRecoveryTitle`
  - `selectedWikiRecoveryCopy`
- The banned decorative concepts are absent:
  - `数据主链路`
  - `focus-progress-panel`
  - `operations-grid`

### Task 6: Run Verification

Run:

```bash
cd data-query-app
node --test tests/crawler-monitor-page-contract.test.mjs
```

Then run one frontend type check:

```bash
cd data-query-app
pnpm run check
```

Run backend contract regression because the page relies on existing dispatch/report DTO fields:

```bash
cd back
mvn "-Dtest=AdminCrawlerMonitorControllerTest,CrawlerMonitorServiceImplTest" test
```

If the app is already running on port `3001`, validate page accessibility:

```bash
curl -sS -o /tmp/crawler-monitor.html -w '%{http_code} %{size_download}\n' http://127.0.0.1:3001/operations/crawler-monitor
```

If port `3001` is not running, start the existing local stack only if needed:

```bash
bash ./scripts/dev/start-local-stack.sh
```

## Review Requirements

Before implementation, two independent reviews must inspect this plan:

1. UI/UX review:
   - Check whether the information hierarchy truly fixes “联动性差”.
   - Check if important operations are visible without clutter.
   - Check if style remains aligned with TerraPedia admin page style.

2. Data/API/progress-contract review:
   - Check whether the plan stays inside existing backend API.
- Check whether progress and heartbeat remain based on registered task paths.
- Check whether the plan violates manual-only dispatch or crawler progress contract.

Implementation should start only after the plan is updated for valid review findings.

## Final Acceptance

- User can open `/operations/crawler-monitor`.
- Expand `Wiki 数据变化 / 手动执行`.
- Click any domain in the right-side domain list.
- Main live panel, recovery panel, detail panel, and domain list active state all update together.
- Click execute/retry/continue/pause/resume where enabled.
- Page shows the dispatch result card from the backend response.
- Click report/progress buttons and the existing report drawer opens concrete file content or a real error state.
- Report buttons use report paths, progress buttons use progress paths; both go through the existing report preview drawer and show real file content or a real error state.
- No fake static values are introduced; all displayed state is derived from `overview`, progress rows, selected domain, or latest dispatch response.
