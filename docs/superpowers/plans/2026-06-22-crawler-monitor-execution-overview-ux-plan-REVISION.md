# 修订说明：Crawler Monitor 执行总览 UX 计划

> 本文是对 `2026-06-22-crawler-monitor-execution-overview-ux-plan.md`（下称「原计划」）的修订，**不重写**原 13 个任务，只列出：
> A. 必须修正的缺陷项（带具体改法）
> B. 因当前分支已变化需要同步的现状
> C. 新增章节——数据质量内容核查（原计划未覆盖）
>
> 状态：**待审查，未执行**。审查通过后再决定执行范围。

---

## 0. 背景：两个目标

用户确认「让管理人员更好检测数据」= **运行态监控** + **爬取内容核查**，两者都要。

- 原计划只覆盖**运行态监控**（谁在跑/排队/卡住），做得不错。
- **爬取内容核查**（爬下来的数据对不对）是缺口 → 本修订 C 章节补上。

---

## A. 原计划必须修正的缺陷

### A1.〔阻断〕Task 8 会弄炸现有测试 —— 兼容性声明是错的

**问题**：原计划 Task 8 Step 2 把 `items` 设为 `formalItems`，并声称"`items` aliases `formalItems` 保持兼容"。但 `formalItems` 用的是全新标签（来源指纹/入库指纹/正式心跳…），与现有测试期望的 `BASIC_DOMAIN_TEST_ITEMS` 标签**不相等**。

现有测试 `data-query-app/tests/base-domain-orchestration.test.mjs`：
```js
// line 148-149
assert.equal(row.items.length, 10)
assert.deepEqual(row.items.map((item) => item.label), BASIC_DOMAIN_TEST_ITEMS)
// line 162
const value = (label) => row.items.find((item) => item.label === label).value
```
这两条 + 依赖 `items` 旧标签的查找会全部失败 → Task 8、Task 13 全红。

**修正方案（二选一，推荐方案 1）**：

**方案 1（推荐）—— 保留 `items` 为原 10 项，formalItems/sampleItems 作为新增字段并行**

不要让 `items` 改指向 `formalItems`。`buildWikiDomainTestMatrixRow` 返回：
```js
return {
  id, label, status,
  items,          // 原有 10 项，标签 = BASIC_DOMAIN_TEST_ITEMS，保持不变
  formalItems,    // 新增：正式域通道（可与 items 内容重叠，但独立标签）
  sampleItems,    // 新增：样本测试通道
}
```
- 现有测试零改动通过。
- 页面矩阵渲染改用 `formalItems` + `sampleItems` 双通道（原 Task 8 Step 4 不变）。
- `items` 作为遗留字段保留给现有断言，不在 UI 用。后续可单独清理。

**方案 2 —— 改写旧测试**

如果团队接受废弃 `items` 旧语义，则在 Task 8 Step 1 里**同时修改** `base-domain-orchestration.test.mjs:148-162`，把对 `items` 的断言改为对 `formalItems`/`sampleItems` 的断言。风险：动了现有契约，需确认无其他 `items` 消费者（`grep -rn "\.items" data-query-app/pages data-query-app/utils` 先查）。

**决策点**：审查时请选方案 1 或 2。我倾向方案 1（零回归）。

### A2.〔重要〕页面契约测试用 source-slice 正则，违反你的测试偏好

**问题**：原 Task 4/5/6/7/10/11 大量用：
```js
const stageTemplate = page.slice(page.indexOf('class="..."'), page.indexOf('class="..."'))
assert.match(stageTemplate, /执行总览/)
assert.doesNotMatch(stageTemplate, /visibleProgressRowsByPriority/)
```
这是匹配 `.vue` 源码字符串，改个 class 名/调顺序就误红。你的记忆明确：crawler-monitor *"behavior tests over .vue source-matching"*。

**修正方案**：

- **视图模型层**（原 Task 1-3、新增 C 章节）的纯函数测试**保留**——它们是真行为测试，注入数据断言输出，符合偏好。
- **页面契约层**改为**最小化存在性检查**而非结构正则。只断言：
  - 关键函数被导入并挂到 computed（`buildExecutionOverviewRows`、`executionOverviewRows`）——这类符号存在性可接受，因为它锁定的是"数据源接对了"。
  - **删除** `page.slice + doesNotMatch(/visibleProgressRowsByPriority/)` 这种"顺序/不存在某字符串"的脆弱断言。
- 行为层面的"顶部不再淹没已完成样本行"由**视图模型单测**保证（`buildExecutionOverviewRows` 输入含 completed smoke → 输出不含），而不是靠扫描 .vue 文本。

**净效果**：Task 4/5/6/7/10/11 的 Step 1 契约测试瘦身，把验证责任移到 util 单测。

### A3.〔重要〕进度行点击"查看"可能选不中域

**问题**：`selectExecutionOverviewRow`（原 Task 4 Step 6）靠 `domainFromProgress` 的硬编码 id→domain 映射取 domain，只覆盖少数 id（town_npc_maintenance/bosses/armor_sets/shimmer/buffs）。其余进度行 domain 为空 → 点"查看"两个分支都落空，无反应。队列行有 `selectQueueItemDomain` 兜底，进度行没有。

**修正方案**：给进度行兜底——选不中域时，至少把对应进度行滚动到「任务进度明细」并高亮，或打开其 reportPath 预览。具体：
```ts
function selectExecutionOverviewRow(row: any) {
  if (row?.domain) {
    const domain = wikiDomainRows.value.find((c) => c.domain === row.domain)
    if (domain) { selectWikiDomain(domain); return }
  }
  if (row?.sourceQueueItem) { selectQueueItemDomain(row.sourceQueueItem); return }
  // 新增兜底：进度行无域映射时，预览其报告/进度文件
  const path = row?.reportPath || row?.progressPath
  if (path && isPreviewableReportPath(path)) { openReportPreview(path); return }
  showToast('该任务无可定位的域，可在任务进度明细中查看', 'info')
}
```

### A4.〔小〕去重映射不全的隐患

`domainFromProgress` 的硬编码映射未来加新域容易漏。建议加注释标注"新增 domain-source-* 任务时需同步此映射"，或改为从 `progressPayload.domain` / id 正则 `^domain-source-(.+)$` 通用解析。非阻断，实现时顺手。

---

## B. 当前分支现状（原计划写于旧 commit，需同步认知）

原计划基于 `f9d6604`，**不知道**本分支已合并的 6 个提交。审查/执行时须知：

1. **顶部已有 health-strip**（健康总览条：守护/调度/锁/刷新停滞/心跳告警）——位于摘要卡上方。原计划的"执行总览"应放在 health-strip + 摘要卡**之下**、替换现有 `stage-progress-panel` 内容，不要与 health-strip 重复。
2. **observability 次要块已折叠**（运行文件/历史/报告/图片指标/自动派发/任务进度明细 已是 `<details>`）。原计划 Task 5/6/7 再加 `<details>` 时注意别和现有折叠样式（`.obs-collapsible`）冲突——**复用 `.obs-collapsible`**，别新造 `.queue-detail-collapsible`/`.base-domain-validation-collapsible` 重复样式。
3. **`.log` 预览已修好**：`isPreviewableReportPath` 已支持 `reports/crawler-monitor/*.log`，队列日志路径已是可点按钮。原计划 Task 11 提到的"打开日志"已可用，无需重做。

**无硬冲突**：原计划动 stage-progress-panel 内容 + 队列面板，与已合并的 health-strip/observability 折叠在不同区域。但 class slice 假设（`stage-progress-panel`、`wiki-monitor-dispatch-queue`）仍成立，可跑。

---

## C.〔新增〕数据质量内容核查（原计划缺口）

**目标**：管理人员一眼看出"爬下来的数据对不对"，而非只看"爬虫在不在跑"。

**关键发现**：内容质量信号**已存在于后端 overview，无需后端改动**，只是散落且被折叠：

| 信号 | 来源字段 | 含义 |
| --- | --- | --- |
| NPC 图片错误前缀数 | `imageNormalization.npcWrongPrefixCount` | 爬到的 NPC 图命名/路径不规范 |
| 射弹图片错误前缀数 | `imageNormalization.projectileWrongPrefixCount` | 同上，射弹 |
| NPC 仅 Wiki 存在数 | `imageNormalization.npcWikiOnlyCount` | wiki 有、本地缺 → 漏爬 |
| 射弹仅 Wiki 存在数 | `imageNormalization.projectileWikiOnlyCount` | 同上 |
| 遗留豁免数 | `imageNormalization.legacyExemptionCount` | 已知豁免项 |
| 图片血缘报告 | `imageNormalization.latestImageLineageReport` | 可预览的核查报告路径 |
| 关系健康 | `registeredTasks` 中 `relation-health`（report-only，reportPath `reports/relation/*.json`） | 实体关系完整性 |
| 覆盖率 | `registeredTasks` 中 `npc-coverage-*` | 各域覆盖是否齐全 |

### Task C1：抽数据质量视图模型（纯函数 + 单测）

**Files:**
- Create: `data-query-app/utils/crawlerMonitorDataQuality.mjs`
- Create: `data-query-app/tests/crawler-monitor-data-quality.test.mjs`

- [ ] **Step 1: 写失败测试**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDataQualitySignals } from '../utils/crawlerMonitorDataQuality.mjs'

test('data quality signals flag wrong-prefix and wiki-only counts as attention', () => {
  const signals = buildDataQualitySignals({
    imageNormalization: {
      npcWrongPrefixCount: 3,
      projectileWrongPrefixCount: 0,
      npcWikiOnlyCount: 5,
      projectileWikiOnlyCount: 0,
      legacyExemptionCount: 12,
      latestImageLineageReport: 'reports/image/lineage-2026-06-22.json',
    },
    registeredTasks: [
      { id: 'relation-health', status: 'completed', progressKind: 'report-only', reportPath: 'reports/relation/relation-health.json' },
      { id: 'npc-coverage-boss', status: 'missing', progressKind: 'missing' },
    ],
  })

  // 有问题的指标（>0 且非豁免）标记 attention
  const npcPrefix = signals.find((s) => s.key === 'npcWrongPrefix')
  assert.equal(npcPrefix.value, 3)
  assert.equal(npcPrefix.tone, 'danger')

  const npcWikiOnly = signals.find((s) => s.key === 'npcWikiOnly')
  assert.equal(npcWikiOnly.tone, 'warning')

  // 0 值的指标标记 ok
  const projPrefix = signals.find((s) => s.key === 'projectileWrongPrefix')
  assert.equal(projPrefix.tone, 'success')

  // 豁免是中性信息，不告警
  const exemption = signals.find((s) => s.key === 'legacyExemption')
  assert.equal(exemption.tone, 'muted')

  // 覆盖率任务 missing → attention
  const coverage = signals.find((s) => s.key === 'npc-coverage-boss')
  assert.equal(coverage.tone, 'warning')

  // 关系健康 completed → ok，且带可预览报告
  const relation = signals.find((s) => s.key === 'relation-health')
  assert.equal(relation.tone, 'success')
  assert.equal(relation.reportPath, 'reports/relation/relation-health.json')
})

test('data quality summary counts attention signals', () => {
  const signals = buildDataQualitySignals({
    imageNormalization: { npcWrongPrefixCount: 2, projectileWrongPrefixCount: 1 },
    registeredTasks: [],
  })
  const attention = signals.filter((s) => s.tone === 'danger' || s.tone === 'warning')
  assert.equal(attention.length, 2)
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
node --test data-query-app/tests/crawler-monitor-data-quality.test.mjs
```
预期：模块不存在 → 失败。

- [ ] **Step 3: 实现 `buildDataQualitySignals`**

```js
const IMAGE_METRICS = [
  { key: 'npcWrongPrefix', field: 'npcWrongPrefixCount', label: 'NPC 图片错误前缀', kind: 'error' },
  { key: 'projectileWrongPrefix', field: 'projectileWrongPrefixCount', label: '射弹图片错误前缀', kind: 'error' },
  { key: 'npcWikiOnly', field: 'npcWikiOnlyCount', label: 'NPC 仅 Wiki 存在', kind: 'gap' },
  { key: 'projectileWikiOnly', field: 'projectileWikiOnlyCount', label: '射弹仅 Wiki 存在', kind: 'gap' },
  { key: 'legacyExemption', field: 'legacyExemptionCount', label: '遗留豁免', kind: 'neutral' },
]

export function buildDataQualitySignals(overview = {}) {
  const signals = []
  const image = overview?.imageNormalization || {}

  for (const metric of IMAGE_METRICS) {
    const value = Number(image[metric.field] ?? 0)
    let tone
    if (metric.kind === 'neutral') tone = 'muted'
    else if (value <= 0) tone = 'success'
    else if (metric.kind === 'error') tone = 'danger'   // 错误前缀=数据错了
    else tone = 'warning'                                 // 仅 wiki 存在=漏爬
    signals.push({
      key: metric.key,
      label: metric.label,
      value,
      tone,
      reportPath: image.latestImageLineageReport || '',
    })
  }

  const tasks = Array.isArray(overview?.registeredTasks) ? overview.registeredTasks : []
  for (const task of tasks) {
    const id = String(task?.id || '')
    if (id !== 'relation-health' && !id.startsWith('npc-coverage')) continue
    const status = String(task?.status || '').toLowerCase()
    const tone = (status === 'completed') ? 'success'
      : (status === 'missing' || status === 'failed' || status === 'error') ? 'warning'
      : 'muted'
    signals.push({
      key: id,
      label: id === 'relation-health' ? '关系健康' : `覆盖率：${id.replace('npc-coverage-', '')}`,
      value: status,
      tone,
      reportPath: task?.reportPath || '',
    })
  }

  return signals
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
node --test data-query-app/tests/crawler-monitor-data-quality.test.mjs
```
预期：2 pass。

**Acceptance Plan:**
- 错误前缀 >0 → danger（数据爬错了）。
- 仅 Wiki 存在 >0 → warning（漏爬）。
- 0 值 → success。豁免 → muted。
- 关系健康/覆盖率任务按状态映射，携带可预览报告路径。
- 纯函数，可离线注入测试，符合测试偏好。

### Task C2：数据质量面板（页面，置于执行总览之后）

**Files:**
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`（最小存在性断言）

- [ ] **Step 1: 导入 + computed**

```ts
import { buildDataQualitySignals } from '~/utils/crawlerMonitorDataQuality.mjs'
const dataQualitySignals = computed(() => buildDataQualitySignals(overview.value || {}))
const dataQualityAttentionCount = computed(() =>
  dataQualitySignals.value.filter((s) => s.tone === 'danger' || s.tone === 'warning').length)
```

- [ ] **Step 2: 面板模板（复用现有 `.obs-collapsible` 折叠样式，默认展开有问题时）**

放在执行总览之后、observability 之前。有 attention 时默认展开，全绿时折叠：

```vue
<section class="panel data-quality-panel" aria-label="data-quality">
  <details class="obs-collapsible" :open="dataQualityAttentionCount > 0">
    <summary class="panel-head">
      <div>
        <h2>数据质量核查</h2>
        <p>图片归一化异常、漏爬、关系健康与覆盖率；红=数据爬错，黄=漏爬或缺检查。</p>
      </div>
      <span class="status-pill" :class="dataQualityAttentionCount ? 'danger' : 'success'">
        {{ dataQualityAttentionCount ? `${dataQualityAttentionCount} 项待查` : '全部正常' }}
      </span>
    </summary>
    <div class="data-quality-grid">
      <button
        v-for="sig in dataQualitySignals"
        :key="sig.key"
        type="button"
        class="data-quality-cell"
        :class="sig.tone"
        :disabled="!sig.reportPath || !isPreviewableReportPath(sig.reportPath)"
        :title="sig.reportPath || '无核查报告'"
        @click="openReportPreview(sig.reportPath)"
      >
        <small>{{ sig.label }}</small>
        <strong>{{ sig.value }}</strong>
      </button>
    </div>
  </details>
</section>
```

- [ ] **Step 3: CSS**

```css
.data-quality-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.data-quality-cell {
  display: flex; flex-direction: column; gap: 2px;
  padding: 8px 10px; border-radius: 6px; text-align: left;
  border: 1px solid transparent; cursor: pointer;
}
.data-quality-cell:disabled { cursor: default; }
.data-quality-cell.success { background: var(--color-success-bg, #d1fae5); }
.data-quality-cell.warning { background: var(--color-warning-bg, #fef3c7); }
.data-quality-cell.danger  { background: var(--color-danger-bg,  #fee2e2); }
.data-quality-cell.muted   { background: var(--color-muted-bg,   #f3f4f6); }
```

- [ ] **Step 4: 最小契约断言（行为优先，不做结构 slice）**

```js
test('crawler monitor wires data quality signals from overview', () => {
  assert.match(page, /buildDataQualitySignals/)
  assert.match(page, /dataQualitySignals/)
  assert.match(page, /数据质量核查/)
})
```

- [ ] **Step 5: 跑测试**

```bash
node --test data-query-app/tests/crawler-monitor-data-quality.test.mjs data-query-app/tests/crawler-monitor-page-contract.test.mjs
```

**Acceptance Plan:**
- 管理人员打开页面，执行总览下方即见「数据质量核查」面板。
- 有异常（错误前缀/漏爬/缺覆盖）时默认展开、红黄高亮、显示待查数量。
- 点格子打开对应核查报告（图片血缘/关系健康），复用已修好的 `.log`/报告预览。
- 全绿时面板折叠，不占视觉。

### C 章节边界（明确不做）

- **不做**逐条比对 wiki 原文的实时核查（需后端新接口/爬取，超本次范围）。
- **不新增**后端字段——只消费 overview 已有信号。
- 若未来要更深的内容核查（字段级 diff、抽样人工复核），另起 spec。

---

## D. 建议的执行顺序（审查通过后）

按"减负价值 / 风险"排序，分三档：

1. **第一档（核心减负，低风险）**：原 Task 1-5 + 本修订 A2/A3 修正。合并执行总览、降级队列面板。这是运行态监控 80% 价值。
2. **第二档（内容核查，低风险、独立）**：本修订 Task C1+C2。纯新增、不碰执行总览，可与第一档并行或先做。**对"检测数据"目标价值最高且最快见效。**
3. **第三档（双通道矩阵，高复杂度）**：原 Task 6-9 + 本修订 A1 修正。正式/样本分离。价值真实但工作量大，建议前两档验证后再做。

---

## E. 审查需你拍板的决策点

1. **A1 选方案 1（保留 `items`，零回归）还是方案 2（改写旧测试）？** 我推荐方案 1。
2. **执行顺序**：是否接受"第一档 + 第二档先行，第三档延后"？
3. **C 章节深度**：当前 C 章节只做"已有信号的可视化聚合"。是否够？还是你要的内容核查需要更深（字段级 diff）——若是，需另立 spec + 后端支持。
