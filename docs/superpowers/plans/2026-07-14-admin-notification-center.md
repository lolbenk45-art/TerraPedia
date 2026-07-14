# 后台管理员全局通知中心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `data-query-app` 后台新增一个跨页面常驻的通知中心(顶部铃铛 + 下拉面板),把"文章审核需要处理"和"爬虫监控需要处理"两类信号统一暴露给管理员，不用管理员主动打开对应页面才能发现问题。

**Architecture:** 统一 `NotificationEvent` 模型 + 两个独立的纯函数数据源模块(`articleReviewSource.mjs`、`crawlerMonitorSource.mjs`，diff 逻辑纯函数可单测)+ 一个纯函数状态归并模块(`notificationCenterState.mjs`)+ 一个 Pinia store(`stores/notifications.ts`，只做定时调度/持久化/toast 触发的薄封装)+ 一个铃铛 UI 组件(`NotificationBell.vue`)。爬虫域名的告警分类直接复用 `crawlerMonitorDomainTable.mjs` + `crawlerMonitorTriageWorkbench.mjs` 已验证的规则，不重新定义分类标准。

**Tech Stack:** Nuxt 4 / Vue 3 `<script setup>` / Pinia (Composition API store) / `@pinia-plugin-persistedstate/nuxt` / `node:test` + `tsx`（现有测试基建，不引入新的测试框架）。

**规格来源:** `docs/superpowers/specs/2026-07-14-admin-notification-center-design.md`（已用户确认）。

**本计划相对设计文档的两处必要调整**(设计文档写作时未获得代码级细节，实现前核实后修正，均已回填进设计文档没有改动，此处只在计划里说明避免执行者困惑):

1. 设计文档 3.2 节说爬虫侧"复用 `crawlerMonitorTriageWorkbench.mjs` 导出的 triage 分类函数"，实际上 `buildTriageWorkbench` 需要先由 `buildDomainTableRows`（`crawlerMonitorDomainTable.mjs`）把 `domains`/`progressRows`/`dispatchQueue` 三路原始数据合并成 `domainRows`才能得到 `triageStatus`。本计划的 `crawlerMonitorSource.mjs` 完整复现这条链路（三个函数都是已导出的纯函数，不需要新写分类逻辑）。
2. 设计文档 3.3 节"persist key 按管理员 id 隔离，动态 key 函数或登录时清空，留到实现阶段验证插件 API"——核实后发现 `stores/auth.ts` 的 `AuthUser` 类型根本没有 `id` 字段（只有 `username`/`displayName`/`role`），且不确定 `@pinia-plugin-persistedstate/nuxt` 是否支持函数式动态 key。本计划改用更简单可靠的方案：persist key 用插件默认值（不传，等于 store id），但在持久化字段里多存一个 `ownerUsername`，store 初始化时对比当前登录用户名，不一致就清空历史事件——不依赖任何未经验证的插件高级特性。

---

## Task 1: 安装持久化插件、注册 Nuxt 模块

**Files:**
- Modify: `data-query-app/package.json`
- Modify: `data-query-app/nuxt.config.ts:16`

- [ ] **Step 1: 安装依赖**

Run: `cd data-query-app && pnpm add @pinia-plugin-persistedstate/nuxt`

Expected: `package.json` 的 `dependencies` 里新增一行 `"@pinia-plugin-persistedstate/nuxt": "^x.y.z"`，`pnpm-lock.yaml`（如果仓库有）随之更新。

- [ ] **Step 2: 注册 Nuxt 模块**

`data-query-app/nuxt.config.ts` 当前第 16 行：

```ts
  modules: ['@pinia/nuxt', '@nuxtjs/tailwindcss'],
```

改为（新模块必须排在 `@pinia/nuxt` 之后）：

```ts
  modules: ['@pinia/nuxt', '@pinia-plugin-persistedstate/nuxt', '@nuxtjs/tailwindcss'],
```

- [ ] **Step 3: 验证类型检查通过**

Run: `cd data-query-app && pnpm run check`
Expected: 无新增类型错误（`nuxt typecheck` 通过；如果失败，先解决报错再继续后续任务，本任务不引入任何业务代码，失败大概率是模块注册或安装问题）。

- [ ] **Step 4: Commit**

```bash
cd /home/lolben/TerraPedia
git add data-query-app/package.json data-query-app/pnpm-lock.yaml data-query-app/nuxt.config.ts
git commit -m "chore(admin): add pinia persistedstate plugin for notification center"
```

(如果仓库里没有 `pnpm-lock.yaml` 这个文件路径，用 `git add -A -- data-query-app/package.json data-query-app/nuxt.config.ts` 加上实际生成/修改的 lockfile 路径。)

---

## Task 2: 通知事件类型定义

**Files:**
- Create: `data-query-app/types/notifications.ts`

- [ ] **Step 1: 写类型文件**

```ts
export type NotificationLevel = 'info' | 'warning' | 'danger'

export interface NotificationEvent {
  id: string
  source: string
  level: NotificationLevel
  title: string
  detail?: string
  link: string
  createdAt: number
}

export interface NotificationSourceDiffResult<TState> {
  events: NotificationEvent[]
  nextState: TState
}

export interface NotificationSource<TState = unknown> {
  key: string
  intervalMs: number
  fetch: () => Promise<unknown>
  diff: (prevState: TState, rawData: unknown) => NotificationSourceDiffResult<TState>
}
```

- [ ] **Step 2: 验证类型检查通过**

Run: `cd data-query-app && pnpm run check`
Expected: 通过（这是一个纯类型文件，暂无其他文件引用它，不应报错）。

- [ ] **Step 3: Commit**

```bash
cd /home/lolben/TerraPedia
git add data-query-app/types/notifications.ts
git commit -m "feat(admin): add NotificationEvent/NotificationSource types"
```

---

## Task 3: 纯函数状态归并模块 `notificationCenterState.mjs`

**Files:**
- Create: `data-query-app/notifications/notificationCenterState.mjs`
- Test: `data-query-app/tests/notification-center-state.test.mjs`

这是通知中心的核心逻辑：事件合并去重、已读状态、相对时间展示、跨用户重置判断。全部是无副作用纯函数，不依赖 Vue/Pinia/网络，直接用 `node:test` 测试。

- [ ] **Step 1: 写失败的测试**

创建 `data-query-app/tests/notification-center-state.test.mjs`：

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  mergeNotificationEvents,
  computeUnreadCount,
  markEventRead,
  markAllRead,
  relativeTimeLabel,
  shouldResetForUser,
  MAX_EVENTS,
} from '../notifications/notificationCenterState.mjs'

test('mergeNotificationEvents dedupes by id and keeps the incoming (fresher) copy', () => {
  const existing = [
    { id: 'a', createdAt: 1000, title: 'old title' },
    { id: 'b', createdAt: 2000, title: 'b' },
  ]
  const incoming = [{ id: 'a', createdAt: 3000, title: 'new title' }]

  const result = mergeNotificationEvents(existing, incoming)

  assert.equal(result.length, 2)
  const merged = result.find((event) => event.id === 'a')
  assert.equal(merged.title, 'new title')
  assert.equal(merged.createdAt, 3000)
})

test('mergeNotificationEvents sorts by createdAt descending', () => {
  const existing = [{ id: 'a', createdAt: 1000 }]
  const incoming = [{ id: 'b', createdAt: 5000 }, { id: 'c', createdAt: 3000 }]

  const result = mergeNotificationEvents(existing, incoming)

  assert.deepEqual(result.map((event) => event.id), ['b', 'c', 'a'])
})

test('mergeNotificationEvents caps the list at maxEvents', () => {
  const existing = Array.from({ length: 5 }, (_, i) => ({ id: `e${i}`, createdAt: i }))
  const incoming = []

  const result = mergeNotificationEvents(existing, incoming, 3)

  assert.equal(result.length, 3)
  assert.deepEqual(result.map((event) => event.id), ['e4', 'e3', 'e2'])
})

test('MAX_EVENTS default is a sane positive number', () => {
  assert.equal(MAX_EVENTS, 100)
})

test('computeUnreadCount only counts events whose id is not in readIds', () => {
  const events = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  assert.equal(computeUnreadCount(events, ['a']), 2)
  assert.equal(computeUnreadCount(events, ['a', 'b', 'c']), 0)
  assert.equal(computeUnreadCount(events, []), 3)
})

test('markEventRead appends without duplicating', () => {
  assert.deepEqual(markEventRead([], 'a'), ['a'])
  assert.deepEqual(markEventRead(['a'], 'a'), ['a'])
  assert.deepEqual(markEventRead(['a'], 'b'), ['a', 'b'])
})

test('markAllRead returns every current event id', () => {
  const events = [{ id: 'a' }, { id: 'b' }]
  assert.deepEqual(markAllRead(events), ['a', 'b'])
})

test('relativeTimeLabel formats minutes/hours/days in Chinese', () => {
  const now = 1_000_000_000
  assert.equal(relativeTimeLabel(now - 10_000, now), '刚刚')
  assert.equal(relativeTimeLabel(now - 5 * 60_000, now), '5 分钟前')
  assert.equal(relativeTimeLabel(now - 3 * 3_600_000, now), '3 小时前')
  assert.equal(relativeTimeLabel(now - 2 * 86_400_000, now), '2 天前')
})

test('shouldResetForUser is true only when a different known user previously owned the data', () => {
  assert.equal(shouldResetForUser('', 'alice'), false)
  assert.equal(shouldResetForUser('alice', 'alice'), false)
  assert.equal(shouldResetForUser('alice', 'bob'), true)
  assert.equal(shouldResetForUser(undefined, 'bob'), false)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd data-query-app && node --import tsx --test tests/notification-center-state.test.mjs`
Expected: FAIL，报错类似 `Cannot find module '../notifications/notificationCenterState.mjs'`。

- [ ] **Step 3: 写最小实现**

创建 `data-query-app/notifications/notificationCenterState.mjs`：

```js
export const MAX_EVENTS = 100

export function mergeNotificationEvents(existingEvents, incomingEvents, maxEvents = MAX_EVENTS) {
  const byId = new Map(existingEvents.map((event) => [event.id, event]))
  for (const event of incomingEvents) {
    byId.set(event.id, event)
  }
  return Array.from(byId.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, maxEvents)
}

export function computeUnreadCount(events, readIds) {
  const read = new Set(readIds)
  return events.filter((event) => !read.has(event.id)).length
}

export function markEventRead(readIds, eventId) {
  if (readIds.includes(eventId)) return readIds
  return [...readIds, eventId]
}

export function markAllRead(events) {
  return events.map((event) => event.id)
}

export function relativeTimeLabel(createdAt, now) {
  const diffMs = Math.max(0, now - createdAt)
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  return `${days} 天前`
}

export function shouldResetForUser(storedOwnerUsername, currentUsername) {
  return Boolean(storedOwnerUsername) && storedOwnerUsername !== currentUsername
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd data-query-app && node --import tsx --test tests/notification-center-state.test.mjs`
Expected: PASS，9 个测试全绿。

- [ ] **Step 5: Commit**

```bash
cd /home/lolben/TerraPedia
git add data-query-app/notifications/notificationCenterState.mjs data-query-app/tests/notification-center-state.test.mjs
git commit -m "feat(admin): add pure notification center state reducers"
```

---

## Task 4: 文章审核数据源 `articleReviewSource.mjs`

**Files:**
- Create: `data-query-app/notifications/articleReviewSource.mjs`
- Test: `data-query-app/tests/article-review-notification-source.test.mjs`

数据源模块拆成两半：`diffArticleReviewEvents`（纯函数，喂"上次已知的 pending 文章 id 列表 + 本次拉到的文章数组"，吐出事件数组 + 新的 id 列表，直接单测）和 `articleReviewSource`（真正调用 `~/composables/useApi` 的 `fetch`，只能在 Nuxt 运行时里跑，不单测，只测 `diff`）。

- [ ] **Step 1: 写失败的测试**

创建 `data-query-app/tests/article-review-notification-source.test.mjs`：

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import { diffArticleReviewEvents } from '../notifications/articleReviewSource.mjs'

test('a brand-new pending article produces a submitted-for-review event', () => {
  const articles = [
    { id: 12, title: '关于史莱姆的一切', authorDisplayName: '小明' },
  ]

  const { events, nextState } = diffArticleReviewEvents([], articles)

  assert.equal(events.length, 1)
  assert.equal(events[0].id, 'article:12:pending_review')
  assert.equal(events[0].source, 'article-review')
  assert.equal(events[0].level, 'warning')
  assert.match(events[0].title, /关于史莱姆的一切/)
  assert.match(events[0].detail, /小明/)
  assert.equal(events[0].link, '/articles?reviewId=12')
  assert.equal(typeof events[0].createdAt, 'number')
  assert.deepEqual(nextState, [12])
})

test('an article already known to be pending does not produce a duplicate event', () => {
  const articles = [{ id: 12, title: '关于史莱姆的一切' }]

  const { events, nextState } = diffArticleReviewEvents([12], articles)

  assert.equal(events.length, 0)
  assert.deepEqual(nextState, [12])
})

test('an article that left the pending list is simply dropped from nextState, no event', () => {
  const { events, nextState } = diffArticleReviewEvents([12, 34], [{ id: 12, title: 'x' }])

  assert.equal(events.length, 0)
  assert.deepEqual(nextState, [12])
})

test('articles missing a usable numeric id are skipped without throwing', () => {
  const articles = [{ id: null, title: 'broken' }, { title: 'no id field' }]

  const { events, nextState } = diffArticleReviewEvents([], articles)

  assert.equal(events.length, 0)
  assert.deepEqual(nextState, [])
})

test('an article without an author falls back to an empty detail', () => {
  const { events } = diffArticleReviewEvents([], [{ id: 1, title: '无作者文章' }])

  assert.equal(events[0].detail, '')
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd data-query-app && node --import tsx --test tests/article-review-notification-source.test.mjs`
Expected: FAIL，`Cannot find module '../notifications/articleReviewSource.mjs'`。

- [ ] **Step 3: 写最小实现**

创建 `data-query-app/notifications/articleReviewSource.mjs`：

```js
import { get } from '~/composables/useApi'

function extractArticleList(response) {
  const raw = response?.data?.records
    ?? response?.data?.list
    ?? response?.data
    ?? response?.records
    ?? response?.list
    ?? response
    ?? []
  return Array.isArray(raw) ? raw : []
}

export function diffArticleReviewEvents(prevPendingIds, articles) {
  const prevIds = new Set(prevPendingIds)
  const nextState = []
  const events = []

  for (const article of articles) {
    const id = Number(article?.id)
    if (!Number.isFinite(id)) continue

    nextState.push(id)

    if (!prevIds.has(id)) {
      events.push({
        id: `article:${id}:pending_review`,
        source: 'article-review',
        level: 'warning',
        title: `《${article?.title || '未命名文章'}》提交审核`,
        detail: article?.authorDisplayName ? `作者：${article.authorDisplayName}` : '',
        link: `/articles?reviewId=${id}`,
        createdAt: Date.now(),
      })
    }
  }

  return { events, nextState }
}

export const articleReviewSource = {
  key: 'article-review',
  intervalMs: 30000,
  async fetch() {
    const response = await get('/admin/articles', {
      status: 'PENDING_REVIEW',
      page: 1,
      limit: 50,
    })
    return extractArticleList(response)
  },
  diff: diffArticleReviewEvents,
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd data-query-app && node --import tsx --test tests/article-review-notification-source.test.mjs`
Expected: PASS，5 个测试全绿。

> `articleReviewSource.fetch` 里 `import { get } from '~/composables/useApi'` 用了 Nuxt 的 `~` 别名和 `useCookie`/`useRuntimeConfig`（`useApi.ts` 内部用到），只能在 Nuxt 运行时里跑，`node --test` 直接跑这个文件会因为找不到 `~` 别名或 `useCookie` 报错——这是预期的，所以测试文件只导入 `diffArticleReviewEvents`，完全不碰 `articleReviewSource`/`get`。

- [ ] **Step 5: Commit**

```bash
cd /home/lolben/TerraPedia
git add data-query-app/notifications/articleReviewSource.mjs data-query-app/tests/article-review-notification-source.test.mjs
git commit -m "feat(admin): add article review notification source"
```

---

## Task 5: 爬虫监控数据源 `crawlerMonitorSource.mjs`

**Files:**
- Create: `data-query-app/notifications/crawlerMonitorSource.mjs`
- Test: `data-query-app/tests/crawler-monitor-notification-source.test.mjs`

复用 `crawlerMonitorProgressRows.mjs` / `crawlerMonitorDomainTable.mjs` / `crawlerMonitorTriageWorkbench.mjs` 三个已导出的纯函数，把原始 `/admin/crawler-monitor/overview` 响应变成带 `triageStatus` 的域列表，再对每个域的 `triageStatus` 做跃迁 diff。

- [ ] **Step 1: 写失败的测试**

创建 `data-query-app/tests/crawler-monitor-notification-source.test.mjs`：

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import { diffCrawlerMonitorEvents } from '../notifications/crawlerMonitorSource.mjs'

function overviewWithDomain(domain) {
  return {
    wikiMonitor: {
      domains: [domain],
      dispatchQueue: [],
    },
    registeredTasks: [],
    latestRun: { actions: [] },
  }
}

test('a domain entering stalled state for the first time produces a danger event', () => {
  const overview = overviewWithDomain({
    domain: 'shimmer',
    label: 'Shimmer',
    state: { status: 'stalled' },
  })

  const { events, nextState } = diffCrawlerMonitorEvents({}, overview)

  assert.equal(events.length, 1)
  assert.equal(events[0].id, 'crawler:shimmer:stalled')
  assert.equal(events[0].source, 'crawler-monitor')
  assert.equal(events[0].level, 'danger')
  assert.match(events[0].title, /Shimmer/)
  assert.equal(events[0].link, '/operations/crawler-monitor?domain=shimmer')
  assert.equal(nextState.shimmer, 'stalled')
})

test('a domain staying in the same attention state does not re-fire', () => {
  const overview = overviewWithDomain({
    domain: 'shimmer',
    label: 'Shimmer',
    state: { status: 'stalled' },
  })

  const { events } = diffCrawlerMonitorEvents({ shimmer: 'stalled' }, overview)

  assert.equal(events.length, 0)
})

test('a domain recovering from stalled to healthy produces no event but updates nextState', () => {
  const overview = overviewWithDomain({
    domain: 'shimmer',
    label: 'Shimmer',
    state: { status: 'completed' },
  })

  const { events, nextState } = diffCrawlerMonitorEvents({ shimmer: 'stalled' }, overview)

  assert.equal(events.length, 0)
  assert.equal(nextState.shimmer, 'healthy')
})

test('a healthy domain with no prior record produces no event', () => {
  const overview = overviewWithDomain({
    domain: 'items',
    label: 'Items',
    state: { status: 'completed' },
  })

  const { events } = diffCrawlerMonitorEvents({}, overview)

  assert.equal(events.length, 0)
})

test('a domain missing backend state entirely is classified as an attention event', () => {
  const overview = overviewWithDomain({ domain: 'npcs', label: 'NPCs' })

  const { events, nextState } = diffCrawlerMonitorEvents({}, overview)

  assert.equal(events.length, 1)
  assert.equal(events[0].level, 'danger')
  assert.equal(nextState.npcs, 'unknown')
})

test('an empty or malformed overview response does not throw', () => {
  assert.doesNotThrow(() => diffCrawlerMonitorEvents({}, null))
  assert.doesNotThrow(() => diffCrawlerMonitorEvents({}, {}))
  const { events, nextState } = diffCrawlerMonitorEvents({}, {})
  assert.deepEqual(events, [])
  assert.deepEqual(nextState, {})
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd data-query-app && node --import tsx --test tests/crawler-monitor-notification-source.test.mjs`
Expected: FAIL，`Cannot find module '../notifications/crawlerMonitorSource.mjs'`。

- [ ] **Step 3: 写最小实现**

创建 `data-query-app/notifications/crawlerMonitorSource.mjs`：

```js
import { get } from '~/composables/useApi'
import { progressRowsFromOverview } from '~/utils/crawlerMonitorProgressRows.mjs'
import { buildDomainTableRows } from '~/utils/crawlerMonitorDomainTable.mjs'
import { buildTriageWorkbench } from '~/utils/crawlerMonitorTriageWorkbench.mjs'

const ATTENTION_TRIAGE_STATUSES = new Set([
  'blocked',
  'failed',
  'error',
  'timed_out',
  'timeout',
  'stalled',
  'state_missing',
  'unknown',
])

export function diffCrawlerMonitorEvents(prevDomainStatus, overview) {
  const domains = Array.isArray(overview?.wikiMonitor?.domains) ? overview.wikiMonitor.domains : []
  const dispatchQueue = Array.isArray(overview?.wikiMonitor?.dispatchQueue) ? overview.wikiMonitor.dispatchQueue : []
  const progressRows = progressRowsFromOverview(overview || {})
  const domainRows = buildDomainTableRows({ domains, progressRows, dispatchQueue })
  const workbench = buildTriageWorkbench({ domainRows })

  const nextState = {}
  const events = []

  for (const row of workbench.allRows || []) {
    const key = row.domain
    if (!key) continue

    nextState[key] = row.triageStatus
    const prevStatus = prevDomainStatus?.[key]

    if (row.triageStatus !== prevStatus && ATTENTION_TRIAGE_STATUSES.has(row.triageStatus)) {
      events.push({
        id: `crawler:${key}:${row.triageStatus}`,
        source: 'crawler-monitor',
        level: 'danger',
        title: `${row.label || key} · ${row.diagnosisTitle || row.triageStatus}`,
        detail: row.reason || '',
        link: `/operations/crawler-monitor?domain=${encodeURIComponent(key)}`,
        createdAt: Date.now(),
      })
    }
  }

  return { events, nextState }
}

export const crawlerMonitorSource = {
  key: 'crawler-monitor',
  intervalMs: 20000,
  async fetch() {
    const response = await get('/admin/crawler-monitor/overview')
    return (response?.data ?? response) || null
  },
  diff: diffCrawlerMonitorEvents,
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd data-query-app && node --import tsx --test tests/crawler-monitor-notification-source.test.mjs`
Expected: PASS，6 个测试全绿。

如果 "a domain missing backend state entirely" 那条测试失败在 `nextState.npcs` 不等于 `'unknown'`：说明 `buildDomainTableRows` 对无 `state` 字段的域计算出的 `risk` 值和本计划调研时确认的不一致（本计划调研时读的是当前仓库 `utils/crawlerMonitorDomainTable.mjs` 里 `riskFromStatus`/`backendStateStatus` 的实现，如果这次实现之间该文件被改过，行为会变）。这种情况下**以 `buildDomainTableRows` 实际跑出来的真实值为准**改测试断言，不要反过来改 `crawlerMonitorSource.mjs` 去凑一个错误的期望值。

- [ ] **Step 5: Commit**

```bash
cd /home/lolben/TerraPedia
git add data-query-app/notifications/crawlerMonitorSource.mjs data-query-app/tests/crawler-monitor-notification-source.test.mjs
git commit -m "feat(admin): add crawler monitor notification source"
```

---

## Task 6: Pinia store `stores/notifications.ts`

**Files:**
- Create: `data-query-app/stores/notifications.ts`
- Test: `data-query-app/tests/notifications-store-behavior.test.mjs`

Store 是"薄封装"：不自己算合并/去重/已读逻辑（那些在 Task 3 的纯函数里），只做：维护 `sources` 数组、`setInterval` 调度、错误处理（401/403 停轮询、其他错误只 `console.warn`）、danger/warning 事件到达时调 `showToast`、以及 `persist` 持久化配置。

测试沿用仓库里 `tests/articles-comment-count-refresh-behavior.test.mjs` 已经验证过的手法：用 `typescript` 把 store 源码转译成 CommonJS，在 `vm` 沙箱里跑，`require` 钩子里注入假的 `pinia`/`useApi`/`useToast`/`useAuthStore`/两个 source。这样测的是 store 真实跑起来的行为（调度、合并、持久化字段、toast 触发），不是对 `.ts` 源码做字符串匹配。

- [ ] **Step 1: 写失败的测试**

创建 `data-query-app/tests/notifications-store-behavior.test.mjs`：

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const repoRoot = path.resolve(import.meta.dirname, '..')

function makeFakeRef(initialValue) {
  return { value: initialValue }
}

function loadNotificationsStore({ articleSource, crawlerSource, username = 'alice' }) {
  const source = fs.readFileSync(path.join(repoRoot, 'stores/notifications.ts'), 'utf8')
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText

  const toastMessages = []
  const refs = []
  const timers = []
  const module = { exports: {} }

  const sandbox = {
    module,
    exports: module.exports,
    console,
    setInterval: (fn, ms) => {
      const handle = { fn, ms }
      timers.push(handle)
      return handle
    },
    clearInterval: (handle) => {
      const index = timers.indexOf(handle)
      if (index >= 0) timers.splice(index, 1)
    },
    ref: (value) => {
      const r = makeFakeRef(value)
      refs.push(r)
      return r
    },
    computed: (getter) => ({ get value() { return getter() } }),
    require: (id) => {
      if (id === 'pinia') {
        return { defineStore: (_id, setup) => () => setup() }
      }
      if (id === '~/composables/useToast') {
        return { showToast: (message, type) => toastMessages.push({ message, type }) }
      }
      if (id === '~/stores/auth') {
        return { useAuthStore: () => ({ user: { value: { username } } }) }
      }
      if (id === '~/notifications/articleReviewSource.mjs') {
        return { articleReviewSource: articleSource }
      }
      if (id === '~/notifications/crawlerMonitorSource.mjs') {
        return { crawlerMonitorSource: crawlerSource }
      }
      if (id === '~/notifications/notificationCenterState.mjs') {
        return require('../notifications/notificationCenterState.mjs')
      }
      throw new Error(`Unexpected module ${id}`)
    },
  }

  vm.runInNewContext(code, sandbox, { filename: 'stores/notifications.ts' })
  return {
    useNotificationsStore: module.exports.useNotificationsStore,
    toastMessages,
    timers,
  }
}

test('startPolling fetches every source once immediately and merges their events', async () => {
  const articleSource = {
    key: 'article-review',
    intervalMs: 30000,
    fetch: async () => ['raw-articles'],
    diff: (prev, raw) => ({
      events: [{ id: 'article:1:pending_review', source: 'article-review', level: 'warning', title: 'x', link: '/articles', createdAt: 1 }],
      nextState: [1],
    }),
  }
  const crawlerSource = {
    key: 'crawler-monitor',
    intervalMs: 20000,
    fetch: async () => ({}),
    diff: (prev, raw) => ({ events: [], nextState: {} }),
  }

  const { useNotificationsStore } = loadNotificationsStore({ articleSource, crawlerSource })
  const store = useNotificationsStore()
  store.startPolling()
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(store.events.value.length, 1)
  assert.equal(store.events.value[0].id, 'article:1:pending_review')
})

test('a danger-level event triggers exactly one toast', async () => {
  const dangerEvent = { id: 'crawler:x:blocked', source: 'crawler-monitor', level: 'danger', title: '域被阻塞', link: '/x', createdAt: 1 }
  const articleSource = { key: 'article-review', intervalMs: 30000, fetch: async () => [], diff: () => ({ events: [], nextState: [] }) }
  const crawlerSource = { key: 'crawler-monitor', intervalMs: 20000, fetch: async () => ({}), diff: () => ({ events: [dangerEvent], nextState: {} }) }

  const { useNotificationsStore, toastMessages } = loadNotificationsStore({ articleSource, crawlerSource })
  const store = useNotificationsStore()
  store.startPolling()
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(toastMessages.length, 1)
  assert.match(toastMessages[0].message, /域被阻塞/)
})

test('one source failing to fetch does not stop the other source from polling', async () => {
  const articleSource = { key: 'article-review', intervalMs: 30000, fetch: async () => { throw new Error('boom') }, diff: () => ({ events: [], nextState: [] }) }
  const okEvent = { id: 'crawler:y:failed', source: 'crawler-monitor', level: 'danger', title: 'y 失败', link: '/y', createdAt: 1 }
  const crawlerSource = { key: 'crawler-monitor', intervalMs: 20000, fetch: async () => ({}), diff: () => ({ events: [okEvent], nextState: {} }) }

  const { useNotificationsStore } = loadNotificationsStore({ articleSource, crawlerSource })
  const store = useNotificationsStore()
  store.startPolling()
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(store.events.value.length, 1)
  assert.equal(store.events.value[0].id, 'crawler:y:failed')
})

test('markRead and markAllEventsRead update readIds via the pure reducers', async () => {
  const event = { id: 'a', source: 'article-review', level: 'warning', title: 'x', link: '/x', createdAt: 1 }
  const articleSource = { key: 'article-review', intervalMs: 30000, fetch: async () => [], diff: () => ({ events: [event], nextState: [] }) }
  const crawlerSource = { key: 'crawler-monitor', intervalMs: 20000, fetch: async () => ({}), diff: () => ({ events: [], nextState: {} }) }

  const { useNotificationsStore } = loadNotificationsStore({ articleSource, crawlerSource })
  const store = useNotificationsStore()
  store.startPolling()
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(store.unreadCount.value, 1)
  store.markRead('a')
  assert.equal(store.unreadCount.value, 0)

  store.events.value = [event, { id: 'b', source: 'article-review', level: 'warning', title: 'y', link: '/y', createdAt: 2 }]
  store.markAllEventsRead()
  assert.equal(store.unreadCount.value, 0)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd data-query-app && node --import tsx --test tests/notifications-store-behavior.test.mjs`
Expected: FAIL，`Cannot find module 'stores/notifications.ts'`（文件不存在）。

- [ ] **Step 3: 写最小实现**

创建 `data-query-app/stores/notifications.ts`：

```ts
import { defineStore } from 'pinia'
import { showToast } from '~/composables/useToast'
import { useAuthStore } from '~/stores/auth'
import { articleReviewSource } from '~/notifications/articleReviewSource.mjs'
import { crawlerMonitorSource } from '~/notifications/crawlerMonitorSource.mjs'
import {
  mergeNotificationEvents,
  computeUnreadCount,
  markEventRead,
  markAllRead,
  shouldResetForUser,
} from '~/notifications/notificationCenterState.mjs'
import type { NotificationEvent, NotificationSource } from '~/types/notifications'

const sources: NotificationSource[] = [articleReviewSource as any, crawlerMonitorSource as any]

const initialSourceState = (key: string) => (key === 'article-review' ? [] : {})

export const useNotificationsStore = defineStore('notifications', () => {
  const events = ref<NotificationEvent[]>([])
  const readIds = ref<string[]>([])
  const ownerUsername = ref('')
  const sourceStates = ref<Record<string, any>>({})
  const halted = ref(false)
  const timers: Record<string, ReturnType<typeof setInterval> | null> = {}

  const unreadCount = computed(() => computeUnreadCount(events.value, readIds.value))

  const resetForNewUser = () => {
    const authStore = useAuthStore()
    const currentUsername = authStore.user?.username || ''
    if (shouldResetForUser(ownerUsername.value, currentUsername)) {
      events.value = []
      readIds.value = []
      sourceStates.value = {}
    }
    ownerUsername.value = currentUsername
  }

  const pollSource = async (source: NotificationSource) => {
    if (halted.value) return
    try {
      const raw = await source.fetch()
      const prevState = sourceStates.value[source.key] ?? initialSourceState(source.key)
      const { events: newEvents, nextState } = source.diff(prevState, raw)
      sourceStates.value = { ...sourceStates.value, [source.key]: nextState }

      if (newEvents.length) {
        events.value = mergeNotificationEvents(events.value, newEvents)
        const toastworthy = newEvents.find((event) => event.level === 'danger')
          || newEvents.find((event) => event.level === 'warning')
        if (toastworthy) {
          showToast(toastworthy.title, 'warning')
        }
      }
    } catch (error: any) {
      const statusCode = Number(error?.statusCode ?? error?.response?.status ?? 0)
      if (statusCode === 401 || statusCode === 403) {
        halted.value = true
        stopPolling()
        return
      }
      console.warn(`[Notifications] ${source.key} poll failed:`, error?.message)
    }
  }

  const startTimers = () => {
    for (const source of sources) {
      if (timers[source.key]) continue
      timers[source.key] = setInterval(() => pollSource(source), source.intervalMs)
    }
  }

  const stopPolling = () => {
    for (const key of Object.keys(timers)) {
      const handle = timers[key]
      if (handle) clearInterval(handle)
      timers[key] = null
    }
  }

  const handleVisibilityChange = () => {
    if (typeof document === 'undefined') return
    if (document.hidden) {
      stopPolling()
      return
    }
    if (halted.value) return
    for (const source of sources) {
      pollSource(source)
    }
    startTimers()
  }

  const startPolling = () => {
    resetForNewUser()
    if (halted.value) return
    for (const source of sources) {
      pollSource(source)
    }
    startTimers()
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }
  }

  const markRead = (eventId: string) => {
    readIds.value = markEventRead(readIds.value, eventId)
  }

  const markAllEventsRead = () => {
    readIds.value = markAllRead(events.value)
  }

  const stopPollingAndUnbind = () => {
    stopPolling()
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }

  return {
    events,
    readIds,
    ownerUsername,
    unreadCount,
    startPolling,
    stopPolling: stopPollingAndUnbind,
    markRead,
    markAllEventsRead,
  }
}, {
  persist: {
    pick: ['events', 'readIds', 'ownerUsername'],
  },
} as any)
```

> `defineStore` 第三个参数（`{ persist: ... }`）末尾 `as any` 是因为 `persist` 选项由 `@pinia-plugin-persistedstate/nuxt` 通过模块增强（module augmentation）注入到 Pinia 的类型定义里，如果 Task 1 装的插件版本增强类型生效，`pnpm run check` 会顺利通过，这时把 `as any` 去掉更干净；如果类型检查在这里报错说 `persist` 不是合法选项，说明类型增强没生效，先保留 `as any` 不阻塞功能，再单独排查插件类型集成问题（不要为了让类型检查通过就删掉 `persist` 配置本身）。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd data-query-app && node --import tsx --test tests/notifications-store-behavior.test.mjs`
Expected: PASS，4 个测试全绿。

- [ ] **Step 5: 运行类型检查**

Run: `cd data-query-app && pnpm run check`
Expected: 通过。如果 `persist` 选项报类型错误，参照上面 Step 3 后的说明处理，不要删掉持久化配置。

- [ ] **Step 6: Commit**

```bash
cd /home/lolben/TerraPedia
git add data-query-app/stores/notifications.ts data-query-app/tests/notifications-store-behavior.test.mjs
git commit -m "feat(admin): add notifications pinia store"
```

---

## Task 7: 铃铛 UI 组件 `NotificationBell.vue`

**Files:**
- Create: `data-query-app/components/NotificationBell.vue`

视觉语言完全对齐 `layouts/default.vue` 里已有的 `header__user-wrap` / `header__dropdown` 下拉菜单实现（复用同一套 `dropdown-fade` Transition 名字，点击外部关闭走同一种 `pointerdown` 监听模式）。这个任务不写自动化测试——仓库里没有装 `@vue/test-utils` 或任何组件挂载测试工具（`package.json` devDependencies 只有 `happy-dom`/`tsx`/`typescript`/`vue-tsc`），装一个新的组件测试框架是本次任务范围之外的重构。会在 Task 9 里用 `pnpm run check`（类型检查）+ 手动过一遍浏览器交互来验证这个组件，而不是假装写一个"挂载测试"其实只是对源码做正则匹配。

- [ ] **Step 1: 写组件**

创建 `data-query-app/components/NotificationBell.vue`：

```vue
<template>
  <div ref="panelRef" class="notif-wrap">
    <button
      type="button"
      class="notif-trigger"
      aria-haspopup="menu"
      :aria-expanded="open"
      aria-label="通知"
      @click="open = !open"
    >
      <Bell :size="18" />
      <span v-if="unreadCount > 0" class="notif-badge">{{ badgeLabel }}</span>
    </button>

    <Transition name="dropdown-fade">
      <div v-if="open" class="notif-panel" role="menu">
        <div class="notif-panel__head">
          <strong>通知</strong>
        </div>

        <div v-if="!events.length" class="notif-panel__empty">暂无通知</div>

        <ul v-else class="notif-panel__list">
          <li
            v-for="event in events"
            :key="event.id"
            class="notif-item"
            :class="[`notif-item--${event.level}`, { 'notif-item--unread': !isRead(event.id) }]"
          >
            <NuxtLink :to="event.link" class="notif-item__link" @click="handleEventClick(event.id)">
              <strong class="notif-item__title">{{ event.title }}</strong>
              <span v-if="event.detail" class="notif-item__detail">{{ event.detail }}</span>
              <small class="notif-item__time">{{ relativeTimeLabel(event.createdAt, now) }}</small>
            </NuxtLink>
          </li>
        </ul>

        <div v-if="events.length" class="notif-panel__foot">
          <button type="button" class="notif-panel__mark-all" @click="handleMarkAllRead">
            全部标记已读
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { Bell } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { relativeTimeLabel } from '~/notifications/notificationCenterState.mjs'
import { useNotificationsStore } from '~/stores/notifications'

const store = useNotificationsStore()
const { events, unreadCount, readIds } = storeToRefs(store)

const open = ref(false)
const panelRef = ref<HTMLElement | null>(null)
const now = ref(Date.now())

const badgeLabel = computed(() => (unreadCount.value > 99 ? '99+' : String(unreadCount.value)))

function isRead(eventId: string) {
  return readIds.value.includes(eventId)
}

function handleEventClick(eventId: string) {
  store.markRead(eventId)
  open.value = false
}

function handleMarkAllRead() {
  store.markAllEventsRead()
}

function handlePointerDown(pointerEvent: PointerEvent) {
  const target = pointerEvent.target as Node | null
  if (!target || !panelRef.value?.contains(target)) {
    open.value = false
  }
}

let clockTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  document.addEventListener('pointerdown', handlePointerDown)
  clockTimer = setInterval(() => {
    now.value = Date.now()
  }, 60000)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', handlePointerDown)
  if (clockTimer) clearInterval(clockTimer)
})
</script>

<style scoped>
.notif-wrap {
  position: relative;
}

.notif-trigger {
  position: relative;
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--color-border) 92%, transparent);
  background: color-mix(in srgb, var(--color-surface-1) 96%, transparent);
  color: var(--color-text);
  cursor: pointer;
  transition:
    transform var(--transition-fast) var(--ease-standard),
    border-color var(--transition-fast) var(--ease-standard),
    box-shadow var(--transition-fast) var(--ease-standard);
}

.notif-trigger:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--color-primary) 18%, var(--color-border));
  box-shadow: var(--shadow-surface-1);
}

.notif-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.68rem;
  line-height: 1;
  font-weight: 600;
  background: var(--color-danger);
  color: #fff;
}

.notif-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: min(360px, calc(100vw - 32px));
  max-height: 420px;
  overflow-y: auto;
  padding: 6px;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--color-border) 92%, transparent);
  background: color-mix(in srgb, var(--color-surface-1) 96%, transparent);
  box-shadow: var(--shadow-floating);
  backdrop-filter: blur(12px);
  z-index: var(--z-dropdown, 40);
}

.notif-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
}

.notif-panel__foot {
  display: flex;
  justify-content: flex-end;
  padding: 6px 10px 4px;
  border-top: 1px solid color-mix(in srgb, var(--color-border) 92%, transparent);
}

.notif-panel__mark-all {
  border: 0;
  background: transparent;
  color: var(--color-primary);
  font-size: 0.78rem;
  cursor: pointer;
}

.notif-panel__empty {
  padding: 24px 12px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.notif-panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 2px;
}

.notif-item__link {
  display: grid;
  gap: 2px;
  padding: 10px 10px;
  border-radius: 12px;
  border-left: 3px solid transparent;
  text-decoration: none;
  color: var(--color-text);
  transition: background-color var(--transition-fast) var(--ease-standard);
}

.notif-item__link:hover {
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-bg-secondary));
}

.notif-item--danger .notif-item__link {
  border-left-color: var(--color-danger);
}

.notif-item--warning .notif-item__link {
  border-left-color: var(--color-warning);
}

.notif-item--info .notif-item__link {
  border-left-color: var(--color-primary);
}

.notif-item--unread .notif-item__title {
  font-weight: 700;
}

.notif-item__title {
  font-size: 0.86rem;
  line-height: 1.3;
}

.notif-item__detail {
  font-size: 0.78rem;
  color: var(--color-text-secondary);
}

.notif-item__time {
  font-size: 0.72rem;
  color: var(--color-text-muted);
}
</style>
```

- [ ] **Step 2: 运行类型检查**

Run: `cd data-query-app && pnpm run check`
Expected: 通过。这一步大概率会先失败，因为 `useNotificationsStore` 还没有被任何页面挂载触发轮询——**这没关系**，类型检查只关心类型对不对，不关心运行时有没有被调用。如果报错是"找不到模块"，检查 Task 2/3/4/5/6 是否都已按前序步骤创建完毕。

- [ ] **Step 3: Commit**

```bash
cd /home/lolben/TerraPedia
git add data-query-app/components/NotificationBell.vue
git commit -m "feat(admin): add NotificationBell dropdown component"
```

---

## Task 8: 接入 `layouts/default.vue`

**Files:**
- Modify: `data-query-app/layouts/default.vue`

把铃铛放进 `header__actions`（`ThemeSwitcher` 和用户头像之间），并在布局挂载时启动轮询、卸载时停止。

- [ ] **Step 1: 模板里插入铃铛**

`data-query-app/layouts/default.vue` 当前的 `header__actions` 区块：

```html
        <div class="header__actions">
          <ThemeSwitcher />

          <div ref="userMenuRef" class="header__user-wrap">
```

改为：

```html
        <div class="header__actions">
          <ThemeSwitcher />

          <NotificationBell />

          <div ref="userMenuRef" class="header__user-wrap">
```

（`NotificationBell` 组件放在 `data-query-app/components/`，`nuxt.config.ts` 里 `components: [{ path: '~/components', pathPrefix: false }]` 已经开启全局自动注册，模板里不需要额外 import。）

- [ ] **Step 2: script 里启动/停止轮询**

`data-query-app/layouts/default.vue` 的 `<script setup>` 里找到已有的 `onMounted`/生命周期钩子区域（紧挨着 `handleDocumentPointerDown`/`handleWindowKeydown` 那些函数定义之后，文件里搜索 `document.addEventListener('pointerdown'` 或已有的 `onMounted`/`onBeforeUnmount` 调用所在位置）。在合适的位置新增：

```ts
const notificationsStore = useNotificationsStore()

onMounted(() => {
  notificationsStore.startPolling()
})

onBeforeUnmount(() => {
  notificationsStore.stopPolling()
})
```

如果文件里已经存在 `onMounted(() => { ... })` 调用（大概率有，处理 `document.addEventListener('pointerdown', ...)` 等逻辑），把 `notificationsStore.startPolling()` 追加进那个已有的 `onMounted` 回调体内，而不是新增第二个 `onMounted` 调用；`onBeforeUnmount` 同理，如果已有就追加进去。

`useNotificationsStore` 从 `~/stores/notifications` 自动导入（`nuxt.config.ts` 的 `imports: { dirs: ['composables', 'stores'] }` 已覆盖 `stores/` 目录，不需要手写 import 语句）。

- [ ] **Step 3: 运行类型检查**

Run: `cd data-query-app && pnpm run check`
Expected: 通过。

- [ ] **Step 4: 手动验证(需要本地跑通后端 + 前端)**

Run: `cd data-query-app && pnpm run dev`

打开浏览器访问后台任意页面，确认：
1. 头部 `ThemeSwitcher` 和用户头像之间出现铃铛图标
2. 点击铃铛能展开/收起下拉面板，点击面板外部会收起
3. 打开浏览器 Network 面板，确认页面加载后大约每 30 秒有一次 `GET /admin/articles?status=PENDING_REVIEW...` 请求、大约每 20 秒有一次 `GET /admin/crawler-monitor/overview` 请求
4. 如果后端当前有待审核文章或爬虫域告警，铃铛上出现未读数徽章，面板里能看到对应条目，点击能跳转到 `/articles` 或 `/operations/crawler-monitor`
5. 刷新页面，之前标记已读的通知徽章不应该重新出现（验证持久化生效）
6. 切换到浏览器的其它标签页（让当前页面变成后台标签，触发 `document.hidden = true`），观察 Network 面板确认两个轮询请求停止发出；切回该标签页，应该立刻看到一次新的轮询请求，并且定时轮询恢复

Expected: 以上 6 点都符合预期。如果后端本地没有待审核文章/爬虫告警数据，至少验证铃铛能正常渲染、面板能展开收起、Network 面板里两个轮询请求按预期节奏发出、切换标签页确实暂停/恢复。

- [ ] **Step 5: Commit**

```bash
cd /home/lolben/TerraPedia
git add data-query-app/layouts/default.vue
git commit -m "feat(admin): mount NotificationBell and start polling in default layout"
```

---

## Task 9: 爬虫监控页支持 `?domain=` 深链接

**Files:**
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`

通知面板里点击一条爬虫告警会跳转到 `/operations/crawler-monitor?domain=<域名>`，但目前该页面不读取这个查询参数——不加这一步，链接跳过去只是落在页面顶部，管理员还得自己在一堆域里找。这个页面已经有 `selectWikiDomain(domain)` 函数（`crawler-monitor.vue:1145` 附近）能根据一个 `CrawlerMonitorWikiDomain` 对象选中对应行，只需要在 `onMounted` 里读 URL 参数、找到匹配的域、调用它、并打开详情抽屉。

- [ ] **Step 1: 在 onMounted 里读取查询参数并打开详情抽屉**

`data-query-app/pages/operations/crawler-monitor.vue` 里的 `onMounted` 钩子当前是（本计划撰写时确认的实际内容）：

```ts
onMounted(async () => {
  const hashPanel = import.meta.client ? normalizeMonitorPanelKey(window.location.hash) : null
  if (hashPanel) {
    activeMonitorPanel.value = hashPanel
  }
  if (!overview.value) {
    await refreshOverview()
    overview.value = initialOverview.value
    if (overview.value) {
      lastOverviewRefreshAt.value = new Date().toISOString()
    }
  }
  syncAutoRefresh()
  if (import.meta.client) {
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }
})
```

改为（在 `syncAutoRefresh()` 之后、`if (import.meta.client) { document.addEventListener(...) }` 之前插入深链接处理）：

```ts
onMounted(async () => {
  const hashPanel = import.meta.client ? normalizeMonitorPanelKey(window.location.hash) : null
  if (hashPanel) {
    activeMonitorPanel.value = hashPanel
  }
  if (!overview.value) {
    await refreshOverview()
    overview.value = initialOverview.value
    if (overview.value) {
      lastOverviewRefreshAt.value = new Date().toISOString()
    }
  }
  syncAutoRefresh()

  if (import.meta.client) {
    const requestedDomainKey = new URLSearchParams(window.location.search).get('domain')
    if (requestedDomainKey) {
      const matchedDomain = wikiDomainRows.value.find((domain) => domain.domain === requestedDomainKey)
      if (matchedDomain) {
        selectWikiDomain(matchedDomain)
        domainDetailDrawerOpen.value = true
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }
})
```

- [ ] **Step 2: 运行类型检查**

Run: `cd data-query-app && pnpm run check`
Expected: 通过（`wikiDomainRows`、`selectWikiDomain`、`domainDetailDrawerOpen` 都是该文件里已有的响应式变量/函数，直接可用）。

- [ ] **Step 3: 手动验证**

Run: `cd data-query-app && pnpm run dev`（如果 Task 8 的 dev server 还开着可以复用）

浏览器直接访问 `http://localhost:3001/operations/crawler-monitor?domain=<某个真实存在的域名，比如 items>`，确认：
1. 页面加载后自动打开该域的详情抽屉，不需要手动点击
2. 换一个不存在的域名（比如 `?domain=does-not-exist`）访问，页面正常加载，不打开任何抽屉，不报错

Expected: 两点都符合预期。

- [ ] **Step 4: Commit**

```bash
cd /home/lolben/TerraPedia
git add data-query-app/pages/operations/crawler-monitor.vue
git commit -m "feat(crawler-monitor): support ?domain= deep link from notification center"
```

---

## Task 10: 全量验证

**Files:** 无新增/修改，纯验证步骤。

- [ ] **Step 1: 跑完整单测套件**

Run: `cd data-query-app && pnpm run test:unit`
Expected: 全部测试通过，包括 Task 3/4/5/6 新增的 4 个测试文件，以及仓库里已有的其它测试文件（确认没有破坏现有行为，尤其是 `crawler-monitor-*.test.mjs` 系列，因为 Task 5 依赖的三个 `.mjs` 模块没有被修改，只是被新代码引用，理论上不会受影响，但仍要跑一遍确认）。

- [ ] **Step 2: 跑类型检查**

Run: `cd data-query-app && pnpm run check`
Expected: 通过。

- [ ] **Step 3: 跑生产构建**

Run: `cd data-query-app && pnpm run build`
Expected: 构建成功，无报错（这一步会捕获类型检查漏掉的运行时/打包期问题，比如 `@pinia-plugin-persistedstate/nuxt` 模块注册顺序错误）。

- [ ] **Step 4: 按 Task 8/9 的手动验证清单再走一遍完整流程**

如果 Task 8/9 的手动验证是分开做的，这一步串起来做一次完整的端到端检查：从登录后台开始 → 铃铛可见 → 有通知时点击跳转 → 对应页面深链接生效 → 标记已读 → 刷新页面已读状态保留 → 退出登录换另一个管理员账号登录 → 确认通知列表按 `ownerUsername` 重置（这一条验证 Task 6 里 `shouldResetForUser` 的实际效果，需要至少两个不同的管理员账号才能测，如果本地环境只有一个账号，跳过这一条并在完成时向用户说明未覆盖）。

Expected: 全流程符合设计文档第 3/6 节描述的行为。

- [ ] **Step 5: 最终确认没有遗漏的未提交改动**

Run: `cd /home/lolben/TerraPedia && git status`
Expected: 只剩下已经在前序任务里逐个 commit 过的改动，没有游离的未提交文件。如果有遗漏（比如 `pnpm-lock.yaml` 在某次 `pnpm add`/`pnpm install` 后又变了），补一个 commit。

---

## 已知范围边界（不在本计划内，设计文档第 6/7 节已写明）

- 不做后端聚合接口，已读状态不跨设备/浏览器同步
- 不做评论审核等其他通知来源（Task 5 之后的 `sources` 数组已经是可扩展结构，后续加新来源只需要新增一个符合 `NotificationSource` 接口的 `.mjs` 模块并 push 进 `stores/notifications.ts` 的 `sources` 数组）
- 不迁移 `ThemeSwitcher.vue`/`useArticleEditor.ts`/`layouts/default.vue` 侧边栏折叠状态/`crawler-monitor-test.vue` 里现有的直接 `localStorage` 用法
- 不给 `NotificationBell.vue` 写组件挂载测试（仓库未安装 `@vue/test-utils`，装新测试框架超出本次范围）
