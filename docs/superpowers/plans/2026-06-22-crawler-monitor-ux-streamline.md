# 爬虫监控 UX 精简 + 修日志 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复调度日志无法打开的 bug，并在首屏添加健康总览条 + 折叠次要信息块，使监控页一眼可判断系统状态。

**Architecture:** 分四个独立任务：B1 后端加 `.log` 白名单 → B2+B3 前端日志路径变可点 → A 新增 healthSignals computed + health-strip UI → C 折叠次要 section。每个任务独立提交，可单独 revert。

**Tech Stack:** Java 21 / Spring Boot 3（后端），Vue 3 + TypeScript（前端），Node.js test runner（前端测试），JUnit 5 + @TempDir（后端测试）。

---

## 任务 B1：后端加 `.log` 可预览支持

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerReportArchiver.java` — `isReportLikeFile` + `reportContentType`
- Test: `back/src/test/java/com/terraria/skills/service/impl/CrawlerReportArchiverTest.java`

- [ ] **B1-1：写失败测试**

在 `CrawlerReportArchiverTest.java` 末尾新增两个测试（在最后一个 `@Test` 方法后面）：

```java
@Test
void shouldPreviewCrawlerMonitorLogFile() throws Exception {
    Path repoRoot = Files.createDirectories(tempDir.resolve("TerraPedia-dev"));
    Path logDir = Files.createDirectories(repoRoot.resolve("reports/crawler-monitor"));
    Path logPath = logDir.resolve("wiki-monitor-dispatch-abc123.log");
    Files.writeString(logPath, "2026-06-22T10:00:00Z [INFO] Starting crawl\n2026-06-22T10:00:01Z [INFO] Done\n",
        StandardOpenOption.CREATE);

    CrawlerReportArchiver archiver = new CrawlerReportArchiver(new ObjectMapper());

    CrawlerMonitorReportDetailDTO detail = archiver.getReportDetail(repoRoot, "reports/crawler-monitor/wiki-monitor-dispatch-abc123.log");

    assertTrue(detail.isFound());
    assertTrue(detail.isReadable());
    assertEquals("text", detail.getContentType());
    assertTrue(detail.getContent().contains("[INFO] Starting crawl"));
}

@Test
void shouldRejectLogFilesOutsideCrawlerMonitorDir() throws Exception {
    Path repoRoot = Files.createDirectories(tempDir.resolve("TerraPedia-dev"));
    Path logDir = Files.createDirectories(repoRoot.resolve("reports/other"));
    Path logPath = logDir.resolve("something.log");
    Files.writeString(logPath, "secret content", StandardOpenOption.CREATE);

    CrawlerReportArchiver archiver = new CrawlerReportArchiver(new ObjectMapper());

    CrawlerMonitorReportDetailDTO detail = archiver.getReportDetail(repoRoot, "reports/other/something.log");

    assertFalse(detail.isFound());
    assertFalse(detail.isReadable());
}
```

- [ ] **B1-2：确认测试失败**

```bash
cd /home/lolben/TerraPedia/back && mvn test -Dtest=CrawlerReportArchiverTest -q 2>&1 | tail -20
```

预期：`shouldPreviewCrawlerMonitorLogFile` 和 `shouldRejectLogFilesOutsideCrawlerMonitorDir` 均 FAIL（isReadable false / isFound false）。

- [ ] **B1-3：修改 `isReportLikeFile`**

文件：`CrawlerReportArchiver.java`，找到 `isReportLikeFile` 方法（328-334 行附近），改为：

```java
private boolean isReportLikeFile(Path path) {
    String fileName = path.getFileName().toString().toLowerCase(Locale.ROOT);
    if (fileName.endsWith(".log")) {
        // Only allow .log files inside reports/crawler-monitor/
        String displayPath = path.toAbsolutePath().normalize().toString().replace('\\', '/');
        return displayPath.contains("/reports/crawler-monitor/");
    }
    return fileName.endsWith(".json")
        || fileName.endsWith(".md")
        || fileName.endsWith(".xml")
        || fileName.endsWith(".txt");
}
```

- [ ] **B1-4：修改 `reportContentType`**

同文件，找到 `reportContentType` 方法（411 行附近），在 `return "text"` 的默认分支前加一条（`.log` 已经走 `text`，所以只需确认默认分支覆盖它）。实际上默认分支已经返回 `"text"`，所以无需改动——但要验证 `.log` 路径走到默认分支。确认方法：运行测试，看 `getContentType()` 是否为 `"text"`。

- [ ] **B1-5：确认测试通过**

```bash
cd /home/lolben/TerraPedia/back && mvn test -Dtest=CrawlerReportArchiverTest -q 2>&1 | tail -10
```

预期：全部 PASS，无 FAIL。

- [ ] **B1-6：跑全套后端测试**

```bash
cd /home/lolben/TerraPedia/back && mvn test -q 2>&1 | tail -20
```

预期：BUILD SUCCESS，无 FAIL。

- [ ] **B1-7：提交**

```bash
git add back/src/main/java/com/terraria/skills/service/impl/CrawlerReportArchiver.java \
        back/src/test/java/com/terraria/skills/service/impl/CrawlerReportArchiverTest.java
git commit -m "fix(crawler-monitor): allow .log preview inside reports/crawler-monitor"
```

---

## 任务 B2+B3：前端日志路径可点击

**Files:**
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
  - `isPreviewableReportPath`（2734 行）：加 `.log` for `reports/crawler-monitor/`
  - 队列项路径渲染（199-203 行）：`<code>` → 可点按钮
- Test: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] **B2-1：写失败契约测试**

在 `crawler-monitor-page-contract.test.mjs` 末尾（`ℹ tests 66` 之前的最后一个 `test(...)` 后面）新增：

```javascript
test('crawler monitor queue item log paths are rendered as clickable buttons calling openReportPreview', () => {
  // The queue path entries must use a button/clickable element, not bare <code>
  // Pattern: dispatch-queue-row__paths area must wire up openReportPreview for log paths
  assert.match(page, /openReportPreview\(entry\.path\)/)
  assert.match(page, /dispatch-queue-row__paths/)
})

test('crawler monitor isPreviewableReportPath accepts .log files under reports/crawler-monitor/', () => {
  // The function must recognise .log as previewable when path starts with reports/crawler-monitor/
  assert.match(page, /reports\/crawler-monitor\/.*\.log|\.log.*reports\/crawler-monitor/)
  assert.match(page, /isPreviewableReportPath/)
})
```

- [ ] **B2-2：确认测试失败**

```bash
node --test data-query-app/tests/crawler-monitor-page-contract.test.mjs 2>&1 | tail -20
```

预期：新增的两个测试 FAIL。

- [ ] **B2-3：修改 `isPreviewableReportPath`（2734 行附近）**

找到 `function isPreviewableReportPath`，改为：

```typescript
function isPreviewableReportPath(path?: string | null) {
  const normalized = String(path || '').replace(/\\/g, '/').toLowerCase()
  if (!normalized) return false
  if (normalized.includes('*') || normalized.includes('?')) return false
  if (normalized.startsWith('reports/crawler-monitor/') && normalized.endsWith('.log')) return true
  const allowedRoot = normalized.startsWith('reports/') || normalized.startsWith('back/target/surefire-reports/')
  const allowedSuffix = ['.json', '.md', '.xml', '.txt'].some((suffix) => normalized.endsWith(suffix))
  return allowedRoot && allowedSuffix
}
```

- [ ] **B2-4：修改队列项路径渲染（199-203 行附近）**

找到模板中 `dispatch-queue-row__paths` 区块，现在长这样：
```html
<div v-if="queueItemPathEntries(item).length" class="dispatch-queue-row__paths">
  <code v-for="entry in queueItemPathEntries(item)" :key="`${item.queueId || item.dispatchId}-${entry.label}`">
    {{ entry.label }}：{{ entry.path }}
  </code>
</div>
```

改为（把 `<code>` 换成可点 button）：
```html
<div v-if="queueItemPathEntries(item).length" class="dispatch-queue-row__paths">
  <button
    v-for="entry in queueItemPathEntries(item)"
    :key="`${item.queueId || item.dispatchId}-${entry.label}`"
    type="button"
    class="inline-report-button inline-report-button--compact"
    :disabled="!isPreviewableReportPath(entry.path) && !isPreviewableProgressPath(entry.path)"
    @click="openReportPreview(entry.path)"
  >{{ entry.label }}：{{ entry.path }}</button>
</div>
```

- [ ] **B2-5：确认测试通过**

```bash
node --test data-query-app/tests/crawler-monitor-page-contract.test.mjs 2>&1 | tail -15
```

预期：66+2 = 68 tests pass, 0 fail。

- [ ] **B2-6：提交**

```bash
git add data-query-app/pages/operations/crawler-monitor.vue \
        data-query-app/tests/crawler-monitor-page-contract.test.mjs
git commit -m "fix(crawler-monitor): make queue log paths clickable and previewable"
```

---

## 任务 A：首屏健康总览条

**Files:**
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
  - 脚本区：新增 `healthSignals` computed（在 `runtimeStateCards` 下方）
  - 模板区：在 `focused-summary` 之前新增 `health-strip` section
  - `<style>` 区末尾：新增 `health-strip` 样式
- Test: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] **A-1：写失败契约测试**

在测试文件末尾新增：

```javascript
test('crawler monitor shows a health strip with daemon, scheduler, lock, refresh staleness, heartbeat and task alerts', () => {
  assert.match(page, /healthSignals/)
  assert.match(page, /health-strip/)
  assert.match(page, /守护|调度|锁/)
})
```

- [ ] **A-2：确认测试失败**

```bash
node --test data-query-app/tests/crawler-monitor-page-contract.test.mjs 2>&1 | tail -10
```

预期：新增测试 FAIL。

- [ ] **A-3：脚本区新增 `healthSignals` computed**

在 `const runtimeStateCards = computed(...)` 这一段（1284 行附近）之后，新增：

```typescript
const healthSignals = computed(() => {
  const signals: Array<{key: string, label: string, tone: string, detail: string}> = []
  for (const card of runtimeStateCards.value) {
    signals.push({
      key: card.key,
      label: card.label,
      tone: statusTone(card.status),
      detail: card.detail,
    })
  }
  if (refreshStale.value) {
    signals.push({
      key: 'refresh',
      label: '刷新停滞',
      tone: 'warning',
      detail: overview.value?.refreshStaleReason || '最近无 refresh 活动',
    })
  }
  const heartbeatCount = staleHeartbeatRows.value.length
  if (heartbeatCount > 0) {
    signals.push({
      key: 'heartbeat',
      label: `心跳告警 ${heartbeatCount}`,
      tone: 'danger',
      detail: '有任务心跳超时',
    })
  }
  return signals
})
```

- [ ] **A-4：模板区新增 `health-strip`**

在模板中找到 `<section class="focused-summary">` 这一行，在它**正上方**插入：

```html
<div v-if="healthSignals.length" class="health-strip">
  <span
    v-for="sig in healthSignals"
    :key="sig.key"
    class="health-signal"
    :class="sig.tone"
    :title="sig.detail"
  >{{ sig.label }}</span>
</div>
```

- [ ] **A-5：`<style>` 区末尾新增样式**

在 `<style scoped>` 末尾（文件最末）新增：

```css
.health-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 0 2px;
}

.health-signal {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: default;
  white-space: nowrap;
}

.health-signal.success { background: var(--color-success-bg, #d1fae5); color: var(--color-success, #065f46); }
.health-signal.warning { background: var(--color-warning-bg, #fef3c7); color: var(--color-warning, #92400e); }
.health-signal.danger  { background: var(--color-danger-bg,  #fee2e2); color: var(--color-danger,  #991b1b); }
.health-signal.info    { background: var(--color-info-bg,    #dbeafe); color: var(--color-info,    #1e40af); }
.health-signal.muted   { background: var(--color-muted-bg,   #f3f4f6); color: var(--color-muted,   #6b7280); }
```

- [ ] **A-6：确认测试通过**

```bash
node --test data-query-app/tests/crawler-monitor-page-contract.test.mjs 2>&1 | tail -10
```

预期：全部 PASS（之前测试不回归）。

- [ ] **A-7：提交**

```bash
git add data-query-app/pages/operations/crawler-monitor.vue \
        data-query-app/tests/crawler-monitor-page-contract.test.mjs
git commit -m "feat(crawler-monitor): add health strip for at-a-glance system status"
```

---

## 任务 C：折叠次要信息块

**Files:**
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
  - 模板：`monitor-observability` 内次要块用 `<details>` 包裹；`monitor-layout`（任务进度明细）用 `<details>` 包裹
  - `<style>` 区：新增折叠区样式（若无）
- Test: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`（确保已有测试不回归，无需新增）

> 注意：`<details>/<summary>` 是原生 HTML，不需要 Vue 状态。关闭时浏览器自动折叠。

- [ ] **C-1：折叠「运行文件」「运行历史」「报告」「图片指标」「自动派发设置」**

在 `monitor-observability` section（228 行附近）的 `observability-grid` div 里，找到以下五个 `<article>` 块，分别用 `<details class="obs-collapsible">` 包裹，`<summary>` 复用原来的 `observability-block__head`：

1. **自动派发设置**（`<article class="auto-dispatch-card">`，273 行附近）：

```html
<details class="obs-collapsible">
  <summary class="observability-block__head">
    <strong>自动派发设置</strong>
    <span>{{ autoDispatchForm.enabled ? '已开启' : '已关闭' }}</span>
  </summary>
  <!-- 把原来 article 里的 auto-dispatch-controls 和 state-list 内容原样放这里 -->
</details>
```

2. **运行文件**（`<article class="observability-block">` 内有「运行文件」字样，238 行附近）：

```html
<details class="obs-collapsible">
  <summary class="observability-block__head">
    <strong>运行文件</strong>
    <span>{{ runtimeStateCards.length }} 项</span>
  </summary>
  <!-- state-list 内容 -->
</details>
```

3. **运行历史**（327 行附近）：

```html
<details class="obs-collapsible">
  <summary class="observability-block__head">
    <strong>运行历史</strong>
    <span>{{ historyRows.length }} 条</span>
  </summary>
  <!-- state-list 内容 -->
</details>
```

4. **报告**（337 行附近）：

```html
<details class="obs-collapsible">
  <summary class="observability-block__head">
    <strong>报告</strong>
    <span>{{ recentReportRows.length }} 个</span>
  </summary>
  <!-- state-list 内容 -->
</details>
```

5. **图片指标**（352 行附近）：

```html
<details class="obs-collapsible">
  <summary class="observability-block__head">
    <strong>图片指标</strong>
    <span>{{ imageNormalizationRows.length }} 项</span>
  </summary>
  <!-- compact-metrics 内容 -->
</details>
```

保留**不折叠**（默认可见）的两块：**派发状态** 和 **心跳告警**（有告警时视觉上本来就显眼，不需要折叠）。

- [ ] **C-2：折叠「任务进度明细」**

找到 `<section class="monitor-layout">` 下的 `<section class="section-card monitor-panel">`（958 行附近，含「任务进度明细」`h2`），整个外层 section 用 `<details>` 包裹：

```html
<section class="monitor-layout">
  <div class="monitor-main">
    <details class="obs-collapsible monitor-detail-collapsible">
      <summary class="section-head">
        <div>
          <h2 class="section-card__title">任务进度明细</h2>
          <p class="section-card__subtitle">汇总可操作的进度行、心跳、速度和运行文件；已完成与仅报告行不再挤占上方阶段进度。</p>
        </div>
      </summary>
      <!-- table-scroll + monitor-table 原样保留 -->
    </details>
  </div>
</section>
```

- [ ] **C-3：新增 `<details>` 折叠样式**

在 `<style scoped>` 末尾（A 任务样式之后）追加：

```css
.obs-collapsible {
  border: none;
  background: none;
}

.obs-collapsible > summary {
  cursor: pointer;
  list-style: none;
  user-select: none;
}

.obs-collapsible > summary::-webkit-details-marker {
  display: none;
}

.obs-collapsible > summary::before {
  content: '▶ ';
  font-size: 0.7em;
  opacity: 0.5;
}

.obs-collapsible[open] > summary::before {
  content: '▼ ';
}

.monitor-detail-collapsible > summary {
  padding: 0;
}
```

- [ ] **C-4：跑前端测试确认无回归**

```bash
node --test data-query-app/tests/crawler-monitor-page-contract.test.mjs 2>&1 | tail -10
```

预期：全部 PASS，无新 FAIL。

- [ ] **C-5：提交**

```bash
git add data-query-app/pages/operations/crawler-monitor.vue
git commit -m "feat(crawler-monitor): collapse secondary observability blocks to reduce clutter"
```

---

## 最终验收

- [ ] 打开 `http://127.0.0.1:13001/operations/crawler-monitor`，首屏（不滚动）能同时看到：健康总览条 + 摘要卡 + 阶段进度 + 派发队列。
- [ ] 队列里有 `logPath` 的项，「日志」显示为可点按钮；点击后预览抽屉显示内容。
- [ ] 「运行文件」「运行历史」「报告」「图片指标」「自动派发设置」「任务进度明细」默认折叠，点标题展开后内容与改动前一致。
- [ ] 前端契约测试全部通过（68+ pass, 0 fail）：`node --test data-query-app/tests/crawler-monitor-page-contract.test.mjs`
- [ ] 后端测试全部通过：`cd /home/lolben/TerraPedia/back && mvn test -q`
