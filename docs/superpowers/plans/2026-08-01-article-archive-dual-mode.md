# 文章资料库双模式（卡片 / 列表）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/articles/archive` 从单一四列紧凑卡改造成「共用头部 + 卡片/列表双正文」，卡片为默认视图，视图偏好用 cookie 记忆，SSR 首屏直出正确视图。

**Architecture:** 页面 `pages/articles/archive.vue` 保留全部 URL 拥有的取数/搜索/分页逻辑不动，只重排头部并接入 cookie 视图状态；新增 `ArticleArchiveBoard.vue` 承载共用工具条（搜索 + 视图分段控件）与错误/空态，按 `viewMode` 分派到 `ArticleArchiveCardGrid.vue`（改造为设计稿 B：三列 ×150px 顶封面带）或新增的 `ArticleArchiveList.vue`（设计稿 C：62px 索引行）；封面的精灵图/照片分流抽成 `ArticleArchiveCover.vue` + 纯函数 `classifyCoverMode`，两种正文共用。

**Tech Stack:** Nuxt 3 + Vue 3 `<script setup>` + TypeScript、Pinia 之外的 `useCookie`、`node --test` 单测、仓库自有的逐字断言合同脚本（`scripts/check-*.mjs`）。

**分支与工作区:** 主工作区 `/home/lolben/TerraPedia`，分支 `ux/detail-pages-redesign`（`/articles/archive` 拆分已落在 `2211b01a`）。本计划在该分支上继续。

---

## 已定决策（执行时不要再问）

| 项 | 决定 | 理由 |
|---|---|---|
| 视图记忆存哪里 | **cookie** `terrapedia-archive-view`，与 `terrapedia-theme` 同机制（`useCookie` + `sameSite: 'lax'`，默认 `card`） | SSR 首屏就是正确视图，没有水合闪烁；不污染既有 `keyword`/`page` 深链 |
| 排序控件 | **本轮不做**，并加一条负向断言锁死 | 后端 `/articles` 只收 `page/limit/size/keyword`，没有 `sort`，画出来就是假控件，违反本仓库「No topic/sort control is rendered without behavior」的既有规矩 |
| 卡片页脚的互动数 | 卡片只留 作者 / 日期 / 浏览；点赞、评论、收藏移到列表视图的「互动」列 | 与设计稿 B/C 一致；「仅在计数为正时渲染」的合同意图随之迁移到列表组件 |
| 作者头像 | 用装饰性渐变圆点（`aria-hidden`），不拉真实头像 | 与设计稿一致，且不新增一条图片失败降级路径 |
| 后端 | **零改动** | 本轮不引入 sort，取数契约完全不变 |

## 设计稿

`.superpowers/brainstorm/article-archive-improve-2026-08-01/content/article-archive-compare.html`，方案 `data-plan="n"`（双模式）、`data-sort="off"`。

## 文件结构

| 文件 | 职责 |
|---|---|
| `front-nuxt/utils/articleCoverMode.ts`（新建） | 纯函数：按原生尺寸判定封面是游戏精灵图还是照片 |
| `front-nuxt/utils/articleArchive.ts`（改） | 追加视图模式的 cookie 名与归一化函数 |
| `front-nuxt/composables/useArchiveViewMode.ts`（新建） | cookie 支撑的视图状态，仿 `stores/theme.ts` |
| `front-nuxt/components/article/ArticleArchiveCover.vue`（新建） | 单张封面：精灵/照片分流 + 失败降级铭牌 |
| `front-nuxt/components/article/ArticleArchiveBoard.vue`（新建） | 共用工具条（搜索 + 视图分段控件）、错误态、空态、按视图分派 |
| `front-nuxt/components/article/ArticleArchiveCardGrid.vue`（改） | 只剩卡片正文与卡片骨架屏（设计稿 B 几何） |
| `front-nuxt/components/article/ArticleArchiveList.vue`（新建） | 列表正文与列表骨架屏（设计稿 C 几何） |
| `front-nuxt/pages/articles/archive.vue`（改） | 头部合并计数与返回链接；接入视图 cookie；取数/搜索/分页逻辑一行不动 |
| `front-nuxt/assets/css/domains/detail-pages-redesign.css`（改） | archive 段落的头部/工具条/卡片/列表/断点全部重排 |
| `front-nuxt/scripts/check-front-layout-layering-contract.mjs`（改） | 断言改指新结构 + 新增「无排序控件」负向断言 |
| `front-nuxt/scripts/check-public-pages.mjs`（改） | 搜索/恢复断言迁到 Board，互动断言迁到 List，新增 cookie 视图断言 |
| `front-nuxt/scripts/check-loading-skeleton-contract.mjs`（改） | 页面标记改指 Board，新增列表骨架断言 |
| `front-nuxt/scripts/check-preview-image-fallback-contract.mjs`（改） | 降级断言改指 `ArticleArchiveCover.vue` |
| `front-nuxt/tests/unit/articleCoverMode.test.mjs`（新建） | 封面分流的单测 |
| `front-nuxt/tests/unit/articleArchive.test.mjs`（改） | 追加视图归一化单测 |

## 红/绿顺序（重要）

Task 1 单测绿。**Task 2 会把 4 个合同脚本整体判红**，这是有意为之的目标断言，红是预期结果。Task 3–8 期间树是红的，**不要**在这段中途跑 `pnpm run check` 求绿，只跑各任务指定的单测。Task 9 才要求全绿。

---

### Task 1: 纯函数与单测（封面分流 + 视图归一化）

**Files:**
- Create: `front-nuxt/utils/articleCoverMode.ts`
- Create: `front-nuxt/tests/unit/articleCoverMode.test.mjs`
- Modify: `front-nuxt/utils/articleArchive.ts`（在文件末尾追加）
- Modify: `front-nuxt/tests/unit/articleArchive.test.mjs`（在文件末尾追加）

- [ ] **Step 1: 写失败的封面分流测试**

创建 `front-nuxt/tests/unit/articleCoverMode.test.mjs`：

```javascript
import assert from 'node:assert/strict'
import test from 'node:test'

import { COVER_SPRITE_MAX_EDGE, classifyCoverMode } from '../../utils/articleCoverMode.ts'

test('treats small game sprites as pixel art rather than photos', () => {
  assert.equal(classifyCoverMode(16, 16), 'sprite')
  assert.equal(classifyCoverMode(36, 36), 'sprite')
  assert.equal(classifyCoverMode(46, 54), 'sprite')
  assert.equal(classifyCoverMode(165, 140), 'sprite')
})

test('treats real screenshots and photographs as croppable photos', () => {
  assert.equal(classifyCoverMode(1280, 720), 'photo')
  assert.equal(classifyCoverMode(400, 300), 'photo')
  assert.equal(classifyCoverMode(300, 900), 'photo')
})

test('splits exactly at the 400px native edge threshold', () => {
  assert.equal(COVER_SPRITE_MAX_EDGE, 400)
  assert.equal(classifyCoverMode(399, 399), 'sprite')
  assert.equal(classifyCoverMode(400, 10), 'photo')
})

test('degrades unmeasurable covers to the non-cropping sprite mode', () => {
  assert.equal(classifyCoverMode(0, 0), 'sprite')
  assert.equal(classifyCoverMode(undefined, undefined), 'sprite')
  assert.equal(classifyCoverMode(Number.NaN, 120), 'sprite')
  assert.equal(classifyCoverMode(-40, -40), 'sprite')
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /home/lolben/TerraPedia/front-nuxt && node --test tests/unit/articleCoverMode.test.mjs
```

Expected: FAIL，报 `Cannot find module '../../utils/articleCoverMode.ts'`。

- [ ] **Step 3: 写最小实现**

创建 `front-nuxt/utils/articleCoverMode.ts`：

```typescript
export type ArticleCoverMode = 'sprite' | 'photo'

// 游戏精灵图原生边长普遍在 16–200px；400px 以上才可能是真照片或截图。
// 小图一律 contain + pixelated，绝不平滑插值放大成马赛克。
export const COVER_SPRITE_MAX_EDGE = 400

export const classifyCoverMode = (naturalWidth: unknown, naturalHeight: unknown): ArticleCoverMode => {
  const width = Number(naturalWidth)
  const height = Number(naturalHeight)

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 'sprite'
  }

  return Math.max(width, height) < COVER_SPRITE_MAX_EDGE ? 'sprite' : 'photo'
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd /home/lolben/TerraPedia/front-nuxt && node --test tests/unit/articleCoverMode.test.mjs
```

Expected: PASS，4 个用例全过。

- [ ] **Step 5: 写失败的视图归一化测试**

在 `front-nuxt/tests/unit/articleArchive.test.mjs` **末尾追加**：

```javascript
test('normalizes the archive view preference to card unless list is explicitly stored', () => {
  const { ARCHIVE_VIEW_COOKIE, normalizeArchiveViewMode } = articleArchive

  assert.equal(ARCHIVE_VIEW_COOKIE, 'terrapedia-archive-view')
  assert.equal(normalizeArchiveViewMode('list'), 'list')
  assert.equal(normalizeArchiveViewMode('card'), 'card')
  assert.equal(normalizeArchiveViewMode(''), 'card')
  assert.equal(normalizeArchiveViewMode(undefined), 'card')
  assert.equal(normalizeArchiveViewMode('grid'), 'card')
  assert.equal(normalizeArchiveViewMode({ view: 'list' }), 'card')
})
```

- [ ] **Step 6: 跑测试确认失败**

```bash
cd /home/lolben/TerraPedia/front-nuxt && node --test tests/unit/articleArchive.test.mjs
```

Expected: FAIL，报 `normalizeArchiveViewMode is not a function`。

- [ ] **Step 7: 写最小实现**

在 `front-nuxt/utils/articleArchive.ts` **末尾追加**：

```typescript
export type ArchiveViewMode = 'card' | 'list'

// 与 terrapedia-theme 同机制：cookie 存视图偏好，SSR 首屏直出正确正文，无水合闪烁。
export const ARCHIVE_VIEW_COOKIE = 'terrapedia-archive-view'

export const normalizeArchiveViewMode = (value: unknown): ArchiveViewMode => (
  value === 'list' ? 'list' : 'card'
)
```

- [ ] **Step 8: 跑测试确认通过**

```bash
cd /home/lolben/TerraPedia/front-nuxt && node --test tests/unit/articleArchive.test.mjs tests/unit/articleCoverMode.test.mjs
```

Expected: PASS。

- [ ] **Step 9: 提交**

```bash
cd /home/lolben/TerraPedia && git add front-nuxt/utils/articleCoverMode.ts front-nuxt/utils/articleArchive.ts front-nuxt/tests/unit/articleCoverMode.test.mjs front-nuxt/tests/unit/articleArchive.test.mjs && git commit -m "feat(article): add archive cover classification and view preference primitives"
```

---

### Task 2: 先把合同断言改到目标结构（预期整体判红）

这一步只改断言，不动实现。跑完必然红——**红本身就是本任务的验收结果**。

**Files:**
- Modify: `front-nuxt/scripts/check-front-layout-layering-contract.mjs`
- Modify: `front-nuxt/scripts/check-public-pages.mjs`
- Modify: `front-nuxt/scripts/check-loading-skeleton-contract.mjs`
- Modify: `front-nuxt/scripts/check-preview-image-fallback-contract.mjs`

- [ ] **Step 1: 分层合同——注册两个新组件源**

`scripts/check-front-layout-layering-contract.mjs` 中，找到这一行：

```javascript
const articleArchiveCardGrid = read('components/article/ArticleArchiveCardGrid.vue')
```

在它下面追加两行：

```javascript
const articleArchiveBoard = read('components/article/ArticleArchiveBoard.vue')
const articleArchiveList = read('components/article/ArticleArchiveList.vue')
```

- [ ] **Step 2: 分层合同——页面与组件标记改指新结构**

同一文件，把这一整块：

```javascript
for (const marker of [
  '<main class="tp-public-page-shell article-layout article-archive-page tp-page-shell" :aria-busy="articleLoading">',
  'class="article-archive-page-heading"',
  '<ArticleArchiveCardGrid',
]) {
  requireIncludes('pages/articles/archive.vue', articleArchivePage, marker, `article archive route must expose ${marker}`)
}
```

替换为：

```javascript
for (const marker of [
  '<main class="tp-public-page-shell article-layout article-archive-page tp-page-shell" :aria-busy="articleLoading">',
  'class="article-archive-page-heading"',
  'class="article-archive-page-count"',
  '<ArticleArchiveBoard',
  ':view-mode="viewMode"',
  '@update:view-mode="setViewMode"',
]) {
  requireIncludes('pages/articles/archive.vue', articleArchivePage, marker, `article archive route must expose ${marker}`)
}
```

再把这一整块：

```javascript
for (const marker of [
  'class="article-archive-page-toolbar"',
  'class="article-archive-page-search"',
  'class="article-archive-card-grid"',
  'class="article-archive-card"',
  'class="article-archive-card__cover"',
]) {
  requireIncludes('components/article/ArticleArchiveCardGrid.vue', articleArchiveCardGrid, marker, `article archive card grid must expose ${marker}`)
}
```

替换为：

```javascript
for (const marker of [
  'class="article-archive-page-toolbar"',
  'class="article-archive-page-search"',
  'class="article-archive-view-switch"',
  'role="group"',
  ':aria-pressed="viewMode === option.value"',
]) {
  requireIncludes('components/article/ArticleArchiveBoard.vue', articleArchiveBoard, marker, `article archive board must expose ${marker}`)
}

for (const marker of [
  'class="article-archive-card-grid"',
  'class="article-archive-card"',
  'class="article-archive-card__cover"',
  'class="article-archive-card__tag"',
  'class="article-archive-card__summary"',
]) {
  requireIncludes('components/article/ArticleArchiveCardGrid.vue', articleArchiveCardGrid, marker, `article archive card grid must expose ${marker}`)
}

for (const marker of [
  'class="article-archive-list"',
  'class="article-archive-list__head"',
  'class="article-archive-list-row"',
  'class="article-archive-list-row__cover"',
  'class="article-archive-list-row__mobile-meta"',
]) {
  requireIncludes('components/article/ArticleArchiveList.vue', articleArchiveList, marker, `article archive list must expose ${marker}`)
}
```

- [ ] **Step 3: 分层合同——卡片色板令牌追加 plate**

同一文件，把这条断言：

```javascript
requireRegex(
  'assets/css/domains/detail-pages-redesign.css',
  detailPageRedesignCss,
  /\.article-archive-approved-screen\s*\{[^}]*--article-archive-card-bg:\s*color-mix\(in srgb,\s*var\(--tp-color-surface\)[^;]*;[^}]*--article-archive-card-hover:\s*color-mix\(in srgb,\s*var\(--tp-color-positive\)[^;]*;/m,
  'article archive card colors must derive from the shared theme surface and positive tokens',
)
```

替换为：

```javascript
requireRegex(
  'assets/css/domains/detail-pages-redesign.css',
  detailPageRedesignCss,
  /\.article-archive-approved-screen\s*\{[^}]*--article-archive-card-bg:\s*color-mix\(in srgb,\s*var\(--tp-color-surface\)[^;]*;[^}]*--article-archive-card-hover:\s*color-mix\(in srgb,\s*var\(--tp-color-positive\)[^;]*;[^}]*--article-archive-plate:\s*color-mix\(in srgb,\s*var\(--tp-color-positive\)[^;]*;/m,
  'article archive card, hover, and plate colors must derive from the shared theme surface and positive tokens',
)
```

- [ ] **Step 4: 分层合同——三档栅格几何改到设计稿 B**

同一文件，把桌面栅格断言：

```javascript
requireRegex(
  'assets/css/domains/detail-pages-redesign.css',
  detailPageRedesignCss,
  /\.article-archive-card-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);[^}]*gap:\s*10px;/m,
  'article archive desktop grid must use four compact columns with a 10px gap',
)
```

替换为：

```javascript
requireRegex(
  'assets/css/domains/detail-pages-redesign.css',
  detailPageRedesignCss,
  /\.article-archive-card-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);[^}]*gap:\s*var\(--tp-space-4\);/m,
  'article archive desktop card grid must use three information cards with the shared space-4 gutter',
)
```

把 1180 断言：

```javascript
requireRegex(
  'assets/css/domains/detail-pages-redesign.css',
  articleArchive1180Css,
  /\.article-archive-card-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/m,
  'article archive grid must recompose to three columns at the frozen 1180px breakpoint',
)
```

替换为：

```javascript
requireRegex(
  'assets/css/domains/detail-pages-redesign.css',
  articleArchive1180Css,
  /\.article-archive-card-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);[\s\S]*?\.article-archive-list-row__engagement\s*\{[^}]*display:\s*none;/m,
  'article archive must drop to two cards and shed the engagement column at the frozen 1180px breakpoint',
)
```

把 900 断言：

```javascript
requireRegex(
  'assets/css/domains/detail-pages-redesign.css',
  articleArchive900Css,
  /\.article-archive-page-toolbar\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);[\s\S]*?\.article-archive-card-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/m,
  'article archive toolbar and grid must recompose to one toolbar track and two cards at 900px',
)
```

替换为：

```javascript
requireRegex(
  'assets/css/domains/detail-pages-redesign.css',
  articleArchive900Css,
  /\.article-archive-page-toolbar\s*\{[^}]*align-items:\s*stretch;[\s\S]*?\.article-archive-view-switch\s*\{[^}]*margin-left:\s*0;/m,
  'article archive toolbar must stack its search and view switch without floating the switch at 900px',
)
```

把 640 断言：

```javascript
requireRegex(
  'assets/css/domains/detail-pages-redesign.css',
  articleArchive640Css,
  /\.article-archive-card-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);[\s\S]*?\.article-archive-card\s*\{[^}]*grid-template-columns:\s*88px minmax\(0,\s*1fr\);[\s\S]*?\.article-archive-card__meta\s*\{[^}]*grid-column:\s*2;/m,
  'article archive mobile grid must become one horizontal card column without a sidebar',
)
```

替换为：

```javascript
requireRegex(
  'assets/css/domains/detail-pages-redesign.css',
  articleArchive640Css,
  /\.article-archive-card-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);[\s\S]*?\.article-archive-list__head\s*\{[^}]*display:\s*none;[\s\S]*?\.article-archive-list-row\s*\{[^}]*grid-template-columns:\s*44px minmax\(0,\s*1fr\);[\s\S]*?\.article-archive-list-row__mobile-meta\s*\{[^}]*display:\s*flex;/m,
  'article archive mobile must stack one card column and fold list columns into an inline meta line',
)
```

- [ ] **Step 5: 分层合同——封面井几何改到双正文**

同一文件，把这三行加它们的 `if`：

```javascript
const articleArchiveCoverDesktopPattern = /\.article-archive-card__cover\s*\{[^}]*width:\s*74px;[^}]*height:\s*74px;[\s\S]*?\.article-archive-card__cover img\s*\{[^}]*object-fit:\s*contain;/m
const articleArchiveCoverMobilePattern = /\.article-archive-card__cover\s*\{[^}]*width:\s*88px;[^}]*height:\s*72px;/m
if (!articleArchiveCoverDesktopPattern.test(detailPageRedesignCss) || !articleArchiveCoverMobilePattern.test(articleArchive640Css)) {
  violations.push('assets/css/domains/detail-pages-redesign.css: article archive covers must use 74x74 desktop and 88x72 mobile contained image wells')
}
```

替换为：

```javascript
const articleArchiveCardBandPattern = /\.article-archive-card\s*\{[^}]*grid-template-rows:\s*150px auto auto;[\s\S]*?\.article-archive-card__cover img\s*\{[^}]*object-fit:\s*contain;/m
const articleArchiveListWellPattern = /\.article-archive-list-row__cover\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;[\s\S]*?\.article-archive-list-row__cover img\s*\{[^}]*object-fit:\s*contain;/m
if (!articleArchiveCardBandPattern.test(detailPageRedesignCss) || !articleArchiveListWellPattern.test(detailPageRedesignCss)) {
  violations.push('assets/css/domains/detail-pages-redesign.css: article archive must use a 150px card cover band and a 44px list well, both contained by default')
}

// 封面按原生尺寸分流：小于 400px 的游戏精灵图 pixelated 不平滑放大，真照片才 cover 裁切。
const articleArchiveCoverModePattern = /\.article-archive-cover-art\.is-photo\s*\{[^}]*object-fit:\s*cover;[\s\S]*?\.article-archive-cover-art\.is-sprite\s*\{[^}]*image-rendering:\s*pixelated;/m
if (!articleArchiveCoverModePattern.test(detailPageRedesignCss)) {
  violations.push('assets/css/domains/detail-pages-redesign.css: article archive covers must crop photographs and pixel-preserve game sprites')
}
```

- [ ] **Step 6: 分层合同——卡片可读性与角标断言**

同一文件，把可读性断言：

```javascript
requireRegex(
  'assets/css/domains/detail-pages-redesign.css',
  detailPageRedesignCss,
  /\.article-archive-card\s*\{[^}]*min-height:\s*138px;[^}]*border-radius:\s*var\(--tp-radius-card\);[\s\S]*?\.article-archive-card__copy > strong\s*\{[^}]*font-size:\s*14px;[^}]*-webkit-line-clamp:\s*2;[\s\S]*?\.article-archive-card__meta\s*\{[^}]*font-size:\s*12px;[\s\S]*?\.article-archive-approved-screen :where\(a, button, input\):focus-visible\s*\{[^}]*outline:\s*3px solid var\(--button-focus-ring\);/m,
  'article archive cards must keep readable metadata, two-line titles, shared radius, touch size, and visible focus',
)
```

替换为：

```javascript
requireRegex(
  'assets/css/domains/detail-pages-redesign.css',
  detailPageRedesignCss,
  /\.article-archive-card\s*\{[^}]*border-radius:\s*var\(--tp-radius-card\);[\s\S]*?\.article-archive-card__copy > strong\s*\{[^}]*font-size:\s*16px;[^}]*-webkit-line-clamp:\s*2;[\s\S]*?\.article-archive-card__summary\s*\{[^}]*font-size:\s*13px;[^}]*-webkit-line-clamp:\s*2;[\s\S]*?\.article-archive-card__meta\s*\{[^}]*font-size:\s*12px;[\s\S]*?\.article-archive-approved-screen :where\(a, button, input\):focus-visible\s*\{[^}]*outline:\s*3px solid var\(--button-focus-ring\);/m,
  'article archive cards must keep readable metadata, two-line titles and summaries, shared radius, and visible focus',
)
```

再把 kicker 断言：

```javascript
requireRegex(
  'assets/css/domains/detail-pages-redesign.css',
  detailPageRedesignCss,
  /\.article-archive-card \.public-article-kicker\s*\{[^}]*display:\s*flex;[^}]*gap:\s*var\(--tp-space-2\);[^}]*font-size:\s*var\(--tp-font-size-caption\);[\s\S]*?\.article-archive-card \.public-article-kicker span \+ span\s*\{[^}]*color:\s*var\(--tp-color-text-muted\);[\s\S]*?\.article-archive-card \.public-article-kicker span \+ span::before\s*\{[^}]*content:\s*"·";/m,
  'article archive card kicker must own a separated token-scaled eyebrow that keeps its date readable rather than inheriting the discovery page scoped styles',
)
```

替换为（重复 12 次的 kicker 文本行按设计稿收成封面带角标，但仍必须在本域文件里自带样式，不得依赖 `pages/articles/index.vue` 的 scoped 块）：

```javascript
requireRegex(
  'assets/css/domains/detail-pages-redesign.css',
  detailPageRedesignCss,
  /\.article-archive-card__tag\s*\{[^}]*position:\s*absolute;[^}]*color:\s*var\(--tp-color-accent\);[^}]*font-size:\s*10px;/m,
  'article archive card tag must own its token-scaled cover badge here rather than inheriting the discovery page scoped styles',
)
```

- [ ] **Step 7: 分层合同——列表降级铭牌 + 无侧栏范围扩大 + 新增无排序负向断言**

同一文件，在现有 fallback 断言（`'article archive fallback covers must scale their monogram and wordmark to the compact well'`）**之后**追加：

```javascript
requireRegex(
  'assets/css/domains/detail-pages-redesign.css',
  detailPageRedesignCss,
  /\.article-archive-list-row__cover \.public-article-cover-fallback\s*\{[^}]*display:\s*grid;[^}]*place-items:\s*center;[\s\S]*?\.article-archive-list-row__cover \.public-article-cover-fallback b\s*\{[^}]*font-size:\s*13px;[\s\S]*?\.article-archive-list-row__cover \.public-article-cover-fallback em\s*\{[^}]*display:\s*none;/m,
  'article archive list fallback covers must shrink to the 44px well and drop the wordmark',
)
```

把无侧栏检查：

```javascript
for (const source of [articleArchivePage, articleArchiveCardGrid]) {
```

替换为：

```javascript
for (const source of [articleArchivePage, articleArchiveBoard, articleArchiveCardGrid, articleArchiveList]) {
```

并在该循环之后追加「无假排序控件」负向断言：

```javascript
// 后端 /articles 只收 page/limit/size/keyword，没有 sort 参数。
// 在后端补上白名单排序字段之前，任何排序控件都是假控件，禁止渲染。
for (const [label, source] of [
  ['pages/articles/archive.vue', articleArchivePage],
  ['components/article/ArticleArchiveBoard.vue', articleArchiveBoard],
  ['components/article/ArticleArchiveCardGrid.vue', articleArchiveCardGrid],
  ['components/article/ArticleArchiveList.vue', articleArchiveList],
]) {
  for (const sortMarker of ['排序', 'sortBy', 'sortOrder', 'orderBy', 'article-archive-sort']) {
    if (source.includes(sortMarker)) {
      violations.push(`${label}: archive must not render a sort control while the articles API exposes no sort parameter (${sortMarker})`)
    }
  }
}
```

- [ ] **Step 8: 公共页面合同——搜索/恢复断言迁到 Board，互动断言迁到 List**

`scripts/check-public-pages.mjs`，找到 `if (path === 'pages/articles/archive.vue') {` 段落。把开头这块：

```javascript
    const archiveCardComponentPath = 'components/article/ArticleArchiveCardGrid.vue'
    const archiveCardComponent = existsSync(file(archiveCardComponentPath))
      ? readFileSync(file(archiveCardComponentPath), 'utf8')
      : ''
```

替换为：

```javascript
    const archiveCardComponentPath = 'components/article/ArticleArchiveCardGrid.vue'
    const archiveCardComponent = existsSync(file(archiveCardComponentPath))
      ? readFileSync(file(archiveCardComponentPath), 'utf8')
      : ''
    const archiveBoardComponentPath = 'components/article/ArticleArchiveBoard.vue'
    const archiveBoardComponent = existsSync(file(archiveBoardComponentPath))
      ? readFileSync(file(archiveBoardComponentPath), 'utf8')
      : ''
    const archiveListComponentPath = 'components/article/ArticleArchiveList.vue'
    const archiveListComponent = existsSync(file(archiveListComponentPath))
      ? readFileSync(file(archiveListComponentPath), 'utf8')
      : ''
```

把阅读时长负向断言：

```javascript
    if (archiveCardComponent.includes('readingMinutes') || content.includes('estimateArticleReadingMinutes')) {
```

替换为：

```javascript
    if ([archiveCardComponent, archiveBoardComponent, archiveListComponent].some((source) => source.includes('readingMinutes'))
      || content.includes('estimateArticleReadingMinutes')) {
```

把这块搜索/恢复断言：

```javascript
    if ([
      'id="article-archive-page-search-input"',
      '@submit.prevent="emit(\'search\')"',
      'class="article-archive-page-clear"',
      '@click="emit(\'clear\')"',
      '@click="emit(\'retry\')"',
      'role="alert"',
      ':to="`/articles/${article.slug}`"',
      'v-if="likeCount(article) > 0"',
      'v-if="commentCount(article) > 0"',
      'v-if="favoriteCount(article) > 0"',
    ].some((marker) => !archiveCardComponent.includes(marker))) {
      violations.push(`${archiveCardComponentPath}: archive cards must keep labelled search/recovery, whole-card links, and positive-only live engagement`)
    }
```

替换为：

```javascript
    if ([
      'id="article-archive-page-search-input"',
      '@submit.prevent="emit(\'search\')"',
      'class="article-archive-page-clear"',
      '@click="emit(\'clear\')"',
      '@click="emit(\'retry\')"',
      'role="alert"',
    ].some((marker) => !archiveBoardComponent.includes(marker))) {
      violations.push(`${archiveBoardComponentPath}: archive board must keep labelled search, clear, and error recovery for both views`)
    }

    if (!archiveCardComponent.includes(':to="`/articles/${article.slug}`"')) {
      violations.push(`${archiveCardComponentPath}: archive cards must remain whole-card links`)
    }

    if ([
      ':to="`/articles/${article.slug}`"',
      'v-if="likeCount(article) > 0"',
      'v-if="commentCount(article) > 0"',
      'v-if="favoriteCount(article) > 0"',
    ].some((marker) => !archiveListComponent.includes(marker))) {
      violations.push(`${archiveListComponentPath}: archive list rows must be whole-row links carrying positive-only live engagement`)
    }

    // 视图偏好必须由 cookie 拥有，SSR 首屏直出正确正文，不允许回落 localStorage 造成水合闪烁。
    if ([
      'const { viewMode, setViewMode } = useArchiveViewMode()',
      ':view-mode="viewMode"',
      '@update:view-mode="setViewMode"',
    ].some((marker) => !content.includes(marker))) {
      violations.push(`${path}: archive view preference must be cookie-owned page state shared by both views`)
    }

    if (content.includes('localStorage') || archiveBoardComponent.includes('localStorage')) {
      violations.push(`${path}: archive view preference must not fall back to localStorage`)
    }
```

把去重负向断言：

```javascript
    if ([
      'article-approved-stage',
      'article-reading-stack',
      'article-popular-list',
      'article-topic-empty',
    ].some((marker) => content.includes(marker) || archiveCardComponent.includes(marker))) {
```

替换为：

```javascript
    if ([
      'article-approved-stage',
      'article-reading-stack',
      'article-popular-list',
      'article-topic-empty',
    ].some((marker) => [content, archiveBoardComponent, archiveCardComponent, archiveListComponent].some((source) => source.includes(marker)))) {
```

- [ ] **Step 9: 骨架屏合同——页面标记改指 Board，新增列表骨架**

`scripts/check-loading-skeleton-contract.mjs`，把：

```javascript
assertMarkers('pages/articles/archive.vue', [
  ':loading="articleLoading"',
  ':error-message="articleError"',
  '<ArticleArchiveCardGrid',
])
```

替换为：

```javascript
assertMarkers('pages/articles/archive.vue', [
  ':loading="articleLoading"',
  ':error-message="articleError"',
  '<ArticleArchiveBoard',
])
```

并在紧随其后的 `assertMarkers('components/article/ArticleArchiveCardGrid.vue', [...])` **之后**追加：

```javascript
assertMarkers('components/article/ArticleArchiveList.vue', [
  'const listLoadingSlotCount = 12',
  'v-for="slot in listLoadingSlotCount"',
  'article-archive-list-row article-archive-list-row--loading',
  '<CommonTpSkeleton type="icon"',
  '<CommonTpSkeleton type="line"',
])
```

- [ ] **Step 10: 封面降级合同——改指抽出的封面组件**

`scripts/check-preview-image-fallback-contract.mjs`，把：

```javascript
{
  const cardPath = 'components/article/ArticleArchiveCardGrid.vue'
  const cardContent = read(cardPath)
  assertContains(cardPath, cardContent, [
    'failedCoverKeys',
    '@error="markCoverFailed(article)"',
    'v-if="hasLiveCover(article)"',
    '{{ coverFallback(article) }}',
    'class="article-archive-card__cover"',
  ])

  const cssPath = 'assets/css/domains/detail-pages-redesign.css'
  const cssContent = read(cssPath)
  assertContains(cssPath, cssContent, [
    '.article-archive-card__cover img {',
    'object-fit: contain;',
  ])
}
```

替换为：

```javascript
{
  const coverPath = 'components/article/ArticleArchiveCover.vue'
  const coverContent = read(coverPath)
  assertContains(coverPath, coverContent, [
    'const coverFailed = ref(false)',
    '@error="markCoverFailed"',
    '@load="measureCover"',
    'v-if="hasLiveCover"',
    '{{ fallbackText }}',
  ])

  const cardPath = 'components/article/ArticleArchiveCardGrid.vue'
  const cardContent = read(cardPath)
  assertContains(cardPath, cardContent, [
    'class="article-archive-card__cover"',
    '<ArticleArchiveCover',
    ':fallback-text="coverFallback(article)"',
  ])

  const listPath = 'components/article/ArticleArchiveList.vue'
  const listContent = read(listPath)
  assertContains(listPath, listContent, [
    'class="article-archive-list-row__cover"',
    '<ArticleArchiveCover',
    ':fallback-text="coverFallback(article)"',
  ])

  const cssPath = 'assets/css/domains/detail-pages-redesign.css'
  const cssContent = read(cssPath)
  assertContains(cssPath, cssContent, [
    '.article-archive-card__cover img {',
    '.article-archive-list-row__cover img {',
    'object-fit: contain;',
  ])
}
```

- [ ] **Step 11: 跑四个合同，确认红，并核对红的就是这些**

```bash
cd /home/lolben/TerraPedia/front-nuxt && for s in front-layout-layering public-pages loading-skeleton preview-images; do echo "===== $s ====="; pnpm run "check:$s"; done 2>&1 | tail -60
```

Expected: 四个脚本全部 FAIL。预期红的原因只应是「文件不存在 / 标记缺失 / CSS 正则不匹配」这三类，且全部指向 archive 相关条目：
- `ArticleArchiveBoard.vue`、`ArticleArchiveList.vue`、`ArticleArchiveCover.vue` 尚未创建
- `pages/articles/archive.vue` 缺 `<ArticleArchiveBoard`、`:view-mode`、`article-archive-page-count`
- `detail-pages-redesign.css` 缺三列栅格、150px 封面带、44px 列表井、`--article-archive-plate`、`is-photo/is-sprite`、`__tag`、列表铭牌与三档断点新规则

**若出现任何与 archive 无关的失败条目，停下来报告，不要继续。**

- [ ] **Step 12: 提交（明确标记为红）**

```bash
cd /home/lolben/TerraPedia && git add front-nuxt/scripts/check-front-layout-layering-contract.mjs front-nuxt/scripts/check-public-pages.mjs front-nuxt/scripts/check-loading-skeleton-contract.mjs front-nuxt/scripts/check-preview-image-fallback-contract.mjs && git commit -m "test(article): retarget archive contracts to the dual-mode structure

Contracts intentionally fail until the dual-mode implementation lands."
```

---

### Task 3: 视图偏好 composable

**Files:**
- Create: `front-nuxt/composables/useArchiveViewMode.ts`

- [ ] **Step 1: 写实现**

创建 `front-nuxt/composables/useArchiveViewMode.ts`：

```typescript
import { ARCHIVE_VIEW_COOKIE, normalizeArchiveViewMode, type ArchiveViewMode } from '~/utils/articleArchive'

// 与 stores/theme.ts 的 terrapedia-theme 同机制：cookie 在服务端就能读到，
// SSR 首屏直出正确正文，避免先渲染卡片再跳列表的水合闪烁。
export const useArchiveViewMode = () => {
  const storedView = useCookie<ArchiveViewMode>(ARCHIVE_VIEW_COOKIE, {
    default: () => 'card',
    sameSite: 'lax',
  })

  const viewMode = computed<ArchiveViewMode>(() => normalizeArchiveViewMode(storedView.value))

  const setViewMode = (nextView: ArchiveViewMode) => {
    const normalizedView = normalizeArchiveViewMode(nextView)

    if (normalizedView === viewMode.value) {
      return
    }

    storedView.value = normalizedView
  }

  return { viewMode, setViewMode }
}
```

- [ ] **Step 2: 提交**

```bash
cd /home/lolben/TerraPedia && git add front-nuxt/composables/useArchiveViewMode.ts && git commit -m "feat(article): add cookie-backed archive view preference composable"
```

---

### Task 4: 封面组件（精灵/照片分流 + 失败降级）

**Files:**
- Create: `front-nuxt/components/article/ArticleArchiveCover.vue`

- [ ] **Step 1: 写实现**

创建 `front-nuxt/components/article/ArticleArchiveCover.vue`：

```vue
<script setup lang="ts">
import { classifyCoverMode, type ArticleCoverMode } from '~/utils/articleCoverMode'

const props = defineProps<{
  src: string
  alt: string
  fallbackText: string
}>()

const coverFailed = ref(false)
// 服务端量不到原生尺寸，先按 sprite（contain）渲染：永不裁切，是最安全的首帧。
const coverMode = ref<ArticleCoverMode>('sprite')

const hasLiveCover = computed(() => Boolean(props.src) && !coverFailed.value)

const markCoverFailed = () => {
  coverFailed.value = true
}

const measureCover = (event: Event) => {
  const image = event.target as HTMLImageElement | null
  coverMode.value = classifyCoverMode(image?.naturalWidth, image?.naturalHeight)
}

watch(() => props.src, () => {
  coverFailed.value = false
  coverMode.value = 'sprite'
})
</script>

<template>
  <img
    v-if="hasLiveCover"
    class="article-archive-cover-art"
    :class="coverMode === 'photo' ? 'is-photo' : 'is-sprite'"
    :src="src"
    :alt="alt"
    loading="lazy"
    @load="measureCover"
    @error="markCoverFailed"
  />
  <span v-else class="public-article-cover-fallback" aria-hidden="true">
    <b>{{ fallbackText }}</b>
    <em>TerraPedia</em>
  </span>
</template>
```

- [ ] **Step 2: 提交**

```bash
cd /home/lolben/TerraPedia && git add front-nuxt/components/article/ArticleArchiveCover.vue && git commit -m "feat(article): add archive cover with sprite and photo routing"
```

---

### Task 5: 卡片正文改造（设计稿 B）

**Files:**
- Modify: `front-nuxt/components/article/ArticleArchiveCardGrid.vue`（整文件替换）

- [ ] **Step 1: 整文件替换**

把 `front-nuxt/components/article/ArticleArchiveCardGrid.vue` 全文替换为：

```vue
<script setup lang="ts">
import type { UserArticle } from '~/types/public-api'

type ArticleEntry = UserArticle & { slug: string }

defineProps<{
  entries: ArticleEntry[]
  loading: boolean
  coverUrl: (article: ArticleEntry) => string
  coverFallback: (article: ArticleEntry) => string
  cardSummary: (article: ArticleEntry) => string
  authorLabel: (article: ArticleEntry) => string
  publishedLabel: (article: ArticleEntry) => string
  viewCount: (article: ArticleEntry) => number
}>()

const archiveLoadingSlotCount = 12
</script>

<template>
  <div v-if="loading" class="article-archive-card-grid" aria-live="polite" aria-label="文章资料库加载中">
    <article
      v-for="slot in archiveLoadingSlotCount"
      :key="`archive-loading-${slot}`"
      class="article-archive-card article-archive-card--loading"
    >
      <span class="article-archive-card__cover"><CommonTpSkeleton type="icon" /></span>
      <span class="article-archive-card__copy"><CommonTpSkeleton type="line" /><CommonTpSkeleton type="line" short /></span>
      <span class="article-archive-card__meta"><CommonTpSkeleton type="pill" /><CommonTpSkeleton type="pill" /></span>
    </article>
  </div>

  <div v-else class="article-archive-card-grid" aria-live="polite">
    <NuxtLink
      v-for="article in entries"
      :key="article.id"
      class="article-archive-card"
      :to="`/articles/${article.slug}`"
    >
      <span class="article-archive-card__cover">
        <ArticleArchiveCover
          :src="coverUrl(article)"
          :alt="article.title"
          :fallback-text="coverFallback(article)"
        />
        <span class="article-archive-card__tag">公开手札</span>
      </span>
      <span class="article-archive-card__copy">
        <strong>{{ article.title }}</strong>
        <p class="article-archive-card__summary">{{ cardSummary(article) }}</p>
      </span>
      <span class="article-archive-card__meta">
        <span class="article-archive-card__author">
          <span class="article-archive-card__avatar" aria-hidden="true"></span>
          <b>{{ authorLabel(article) }}</b>
        </span>
        <span class="article-archive-card__stats">
          <span>{{ publishedLabel(article) }}</span>
          <span><b>{{ viewCount(article) }}</b> 浏览</span>
        </span>
      </span>
    </NuxtLink>
  </div>
</template>
```

- [ ] **Step 2: 提交**

```bash
cd /home/lolben/TerraPedia && git add front-nuxt/components/article/ArticleArchiveCardGrid.vue && git commit -m "feat(article): rebuild archive cards as information cards with cover bands"
```

---

### Task 6: 列表正文（设计稿 C）

**Files:**
- Create: `front-nuxt/components/article/ArticleArchiveList.vue`

- [ ] **Step 1: 写实现**

创建 `front-nuxt/components/article/ArticleArchiveList.vue`：

```vue
<script setup lang="ts">
import type { UserArticle } from '~/types/public-api'

type ArticleEntry = UserArticle & { slug: string }

const props = defineProps<{
  entries: ArticleEntry[]
  loading: boolean
  coverUrl: (article: ArticleEntry) => string
  coverFallback: (article: ArticleEntry) => string
  rowSummary: (article: ArticleEntry) => string
  authorLabel: (article: ArticleEntry) => string
  publishedLabel: (article: ArticleEntry) => string
  viewCount: (article: ArticleEntry) => number
  likeCount: (article: ArticleEntry) => number
  commentCount: (article: ArticleEntry) => number
  favoriteCount: (article: ArticleEntry) => number
}>()

const listLoadingSlotCount = 12

const engagementLabel = (article: ArticleEntry) => {
  const parts: string[] = []

  if (props.likeCount(article) > 0) {
    parts.push(`${props.likeCount(article)} 赞`)
  }

  if (props.commentCount(article) > 0) {
    parts.push(`${props.commentCount(article)} 评论`)
  }

  if (props.favoriteCount(article) > 0) {
    parts.push(`${props.favoriteCount(article)} 收藏`)
  }

  return parts.join(' · ')
}
</script>

<template>
  <div class="article-archive-list" aria-live="polite">
    <div class="article-archive-list__head" aria-hidden="true">
      <span></span>
      <span>文章</span>
      <span>作者</span>
      <span class="is-end">发布</span>
      <span class="is-end">浏览</span>
      <span class="is-end is-engagement">互动</span>
    </div>

    <template v-if="loading">
      <div
        v-for="slot in listLoadingSlotCount"
        :key="`archive-list-loading-${slot}`"
        class="article-archive-list-row article-archive-list-row--loading"
      >
        <span class="article-archive-list-row__cover"><CommonTpSkeleton type="icon" /></span>
        <span class="article-archive-list-row__copy"><CommonTpSkeleton type="line" /><CommonTpSkeleton type="line" short /></span>
        <span class="article-archive-list-row__author"><CommonTpSkeleton type="pill" /></span>
      </div>
    </template>

    <template v-else>
      <NuxtLink
        v-for="article in entries"
        :key="article.id"
        class="article-archive-list-row"
        :to="`/articles/${article.slug}`"
      >
        <span class="article-archive-list-row__cover">
          <ArticleArchiveCover
            :src="coverUrl(article)"
            :alt="article.title"
            :fallback-text="coverFallback(article)"
          />
        </span>
        <span class="article-archive-list-row__copy">
          <strong>{{ article.title }}</strong>
          <p v-if="rowSummary(article)" class="article-archive-list-row__summary">{{ rowSummary(article) }}</p>
        </span>
        <span class="article-archive-list-row__author">{{ authorLabel(article) }}</span>
        <span class="article-archive-list-row__date">{{ publishedLabel(article) }}</span>
        <span class="article-archive-list-row__views">{{ viewCount(article) }}</span>
        <span class="article-archive-list-row__engagement">
          <span v-if="likeCount(article) > 0">{{ likeCount(article) }} 赞</span>
          <span v-if="commentCount(article) > 0">{{ commentCount(article) }} 评论</span>
          <span v-if="favoriteCount(article) > 0">{{ favoriteCount(article) }} 收藏</span>
        </span>
        <span class="article-archive-list-row__mobile-meta">
          <b>{{ authorLabel(article) }}</b>
          <span>{{ publishedLabel(article) }}</span>
          <span>{{ viewCount(article) }} 浏览</span>
          <span v-if="engagementLabel(article)">{{ engagementLabel(article) }}</span>
        </span>
      </NuxtLink>
    </template>
  </div>
</template>
```

> 桌面列与 `__mobile-meta` 互为 `display: none`，同一时刻只有一组进入无障碍树，不会给读屏重复播报。

- [ ] **Step 2: 提交**

```bash
cd /home/lolben/TerraPedia && git add front-nuxt/components/article/ArticleArchiveList.vue && git commit -m "feat(article): add archive index list view"
```

---

### Task 7: 共用外壳 Board（工具条 + 视图控件 + 状态）

**Files:**
- Create: `front-nuxt/components/article/ArticleArchiveBoard.vue`

- [ ] **Step 1: 写实现**

创建 `front-nuxt/components/article/ArticleArchiveBoard.vue`：

```vue
<script setup lang="ts">
import type { UserArticle } from '~/types/public-api'
import type { ArchiveViewMode } from '~/utils/articleArchive'

type ArticleEntry = UserArticle & { slug: string }

defineProps<{
  entries: ArticleEntry[]
  loading: boolean
  errorMessage: string
  keyword: string
  searchKeyword: string
  viewMode: ArchiveViewMode
  coverUrl: (article: ArticleEntry) => string
  coverFallback: (article: ArticleEntry) => string
  cardSummary: (article: ArticleEntry) => string
  rowSummary: (article: ArticleEntry) => string
  authorLabel: (article: ArticleEntry) => string
  publishedLabel: (article: ArticleEntry) => string
  viewCount: (article: ArticleEntry) => number
  likeCount: (article: ArticleEntry) => number
  commentCount: (article: ArticleEntry) => number
  favoriteCount: (article: ArticleEntry) => number
}>()

const emit = defineEmits<{
  search: []
  retry: []
  clear: []
  'update:searchKeyword': [value: string]
  'update:viewMode': [value: ArchiveViewMode]
}>()

const viewOptions: { value: ArchiveViewMode, label: string, icon: string }[] = [
  { value: 'card', label: '卡片', icon: 'article-archive-view-icon--card' },
  { value: 'list', label: '列表', icon: 'article-archive-view-icon--list' },
]

const updateSearchKeyword = (event: Event) => {
  emit('update:searchKeyword', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <section class="article-archive-page-shell" aria-labelledby="article-archive-page-title">
    <div class="article-archive-page-toolbar">
      <form
        class="article-archive-page-search"
        role="search"
        aria-label="搜索文章资料库"
        @submit.prevent="emit('search')"
      >
        <label class="visually-hidden" for="article-archive-page-search-input">搜索文章资料库</label>
        <input
          id="article-archive-page-search-input"
          :value="searchKeyword"
          type="search"
          name="keyword"
          autocomplete="off"
          placeholder="搜索标题或正文"
          @input="updateSearchKeyword"
        />
        <button type="submit">搜索</button>
        <button v-if="keyword" class="article-archive-page-clear" type="button" @click="emit('clear')">清除</button>
      </form>

      <div class="article-archive-view-switch" role="group" aria-label="文章资料库视图模式">
        <button
          v-for="option in viewOptions"
          :key="option.value"
          type="button"
          :aria-pressed="viewMode === option.value"
          @click="emit('update:viewMode', option.value)"
        >
          <i class="article-archive-view-icon" :class="option.icon" aria-hidden="true"></i>{{ option.label }}
        </button>
      </div>
    </div>

    <div v-if="!loading && errorMessage" class="support-panel user-form-status user-form-error" role="alert">
      <span>{{ errorMessage }}</span>
      <button class="secondary-button" type="button" @click="emit('retry')">重试</button>
    </div>

    <div v-else-if="!loading && !entries.length" class="article-archive-page-empty">
      <p>{{ keyword ? `没有找到与“${keyword}”匹配的公开文章。` : '当前没有可展示的公开文章。' }}</p>
      <button v-if="keyword" class="secondary-button" type="button" @click="emit('clear')">清除搜索</button>
      <NuxtLink v-else class="secondary-button" to="/articles">返回精选文章</NuxtLink>
    </div>

    <ArticleArchiveCardGrid
      v-else-if="viewMode === 'card'"
      :entries="entries"
      :loading="loading"
      :cover-url="coverUrl"
      :cover-fallback="coverFallback"
      :card-summary="cardSummary"
      :author-label="authorLabel"
      :published-label="publishedLabel"
      :view-count="viewCount"
    />

    <ArticleArchiveList
      v-else
      :entries="entries"
      :loading="loading"
      :cover-url="coverUrl"
      :cover-fallback="coverFallback"
      :row-summary="rowSummary"
      :author-label="authorLabel"
      :published-label="publishedLabel"
      :view-count="viewCount"
      :like-count="likeCount"
      :comment-count="commentCount"
      :favorite-count="favoriteCount"
    />
  </section>
</template>
```

> 分支顺序保留原有优先级：加载中优先渲染正文骨架，其次错误，其次空态。

- [ ] **Step 2: 提交**

```bash
cd /home/lolben/TerraPedia && git add front-nuxt/components/article/ArticleArchiveBoard.vue && git commit -m "feat(article): add shared archive board with view switch"
```

---

### Task 8: 页面头部重排与视图接线

**Files:**
- Modify: `front-nuxt/pages/articles/archive.vue`

- [ ] **Step 1: 追加摘要与计数派生**

在 `front-nuxt/pages/articles/archive.vue` 中，找到这一行：

```typescript
const articlePublishedLabel = (article: UserArticle) => {
```

在它**上方**插入：

```typescript
const articleRowSummary = (article: UserArticle) => String(article.summary || '').trim()
const articleCardSummary = (article: UserArticle) => articleRowSummary(article) || '这篇文章还没有摘要。'
const totalArticles = computed(() => Math.max(0, Number(articlePagination.value.total ?? articles.value.length)))
const rangeStart = computed(() => articles.value.length ? (currentPage.value - 1) * articleLimit + 1 : 0)
const rangeEnd = computed(() => articles.value.length ? rangeStart.value + articles.value.length - 1 : 0)
const { viewMode, setViewMode } = useArchiveViewMode()
```

- [ ] **Step 2: 替换整个 `<template>`**

把 `front-nuxt/pages/articles/archive.vue` 的 `<template>` 块（从 `<template>` 到 `</template>`）整体替换为：

```vue
<template>
  <main class="tp-public-page-shell article-layout article-archive-page tp-page-shell" :aria-busy="articleLoading">
    <header class="article-archive-page-heading">
      <TerraBreadcrumb />
      <div class="article-archive-page-titles">
        <h1 id="article-archive-page-title">文章资料库</h1>
        <span v-if="!articleError" class="article-archive-page-count">
          共 <b>{{ totalArticles }}</b> 篇<template v-if="articles.length"> · 当前 <b>{{ rangeStart }}–{{ rangeEnd }}</b> · 第 <b>{{ currentPage }}/{{ totalPages }}</b> 页</template>
        </span>
        <NuxtLink class="article-archive-back" to="/articles">返回精选文章 →</NuxtLink>
      </div>
    </header>

    <ArticleArchiveBoard
      v-model:search-keyword="articleSearchQuery"
      :entries="articles"
      :loading="articleLoading"
      :error-message="articleError"
      :keyword="keyword"
      :view-mode="viewMode"
      :cover-url="articleCoverUrl"
      :cover-fallback="articleCoverFallback"
      :card-summary="articleCardSummary"
      :row-summary="articleRowSummary"
      :author-label="articleAuthorLabel"
      :published-label="articlePublishedLabel"
      :view-count="articleViewCount"
      :like-count="articleLikeCount"
      :comment-count="articleCommentCount"
      :favorite-count="articleFavoriteCount"
      @search="submitArticleSearch"
      @clear="clearArticleSearch"
      @retry="retryLoad"
      @update:view-mode="setViewMode"
    />

    <CommonPaginationDock
      v-if="!articleLoading && !articleError && totalPages > 1"
      :current-page="currentPage"
      :total-pages="totalPages"
      :disabled="articleLoading"
      aria-label="文章资料库分页"
      jump-id="article-archive-page-jump"
      show-boundary-controls
      @page-change="goToPage"
    />
  </main>
</template>
```

> 计数从工具条搬到标题行，页脚的 `article-archive-page-range` 一并删除——原先「篇数在三处重复」是设计稿点名的缺陷之一，现在只剩标题行与分页条各一处。

- [ ] **Step 3: 类型检查这一页**

```bash
cd /home/lolben/TerraPedia/front-nuxt && npx nuxt typecheck 2>&1 | grep -E "articles/archive|ArticleArchive" || echo "no archive type errors"
```

Expected: `no archive type errors`。

- [ ] **Step 4: 提交**

```bash
cd /home/lolben/TerraPedia && git add front-nuxt/pages/articles/archive.vue && git commit -m "feat(article): rebuild archive masthead and wire the cookie view preference"
```

---

### Task 9: CSS 重排

**Files:**
- Modify: `front-nuxt/assets/css/domains/detail-pages-redesign.css`

- [ ] **Step 1: 令牌块追加 plate**

把：

```css
.article-archive-approved-screen {
  --article-archive-card-bg: color-mix(in srgb, var(--tp-color-surface) 72%, transparent);
  --article-archive-card-hover: color-mix(in srgb, var(--tp-color-positive) 8%, var(--tp-color-surface));
}
```

替换为：

```css
.article-archive-approved-screen {
  --article-archive-card-bg: color-mix(in srgb, var(--tp-color-surface) 72%, transparent);
  --article-archive-card-hover: color-mix(in srgb, var(--tp-color-positive) 8%, var(--tp-color-surface));
  --article-archive-plate: color-mix(in srgb, var(--tp-color-positive) 8%, var(--tp-color-page));
}
```

并把浅色覆盖块：

```css
:where([data-theme="morning-paper"], [data-theme="warm-slate"]) .article-archive-approved-screen {
  --article-archive-card-bg: var(--tp-color-surface);
  --article-archive-card-hover: var(--tp-color-surface-raised);
  background: var(--tp-color-page);
}
```

替换为：

```css
:where([data-theme="morning-paper"], [data-theme="warm-slate"]) .article-archive-approved-screen {
  --article-archive-card-bg: var(--tp-color-surface);
  --article-archive-card-hover: var(--tp-color-surface-raised);
  --article-archive-plate: var(--tp-color-surface-raised);
  background: var(--tp-color-page);
}
```

- [ ] **Step 2: 头部改成 mast**

把：

```css
.article-archive-page-heading {
  display: flex;
  gap: var(--tp-space-6);
  align-items: end;
  justify-content: space-between;
  border-bottom: 1px solid var(--tp-color-border-strong);
  padding-bottom: var(--tp-space-4);
}

.article-archive-page-heading h1,
.article-archive-page-heading p {
  margin: 0;
}

.article-archive-page-heading h1 {
  margin-top: var(--tp-space-1);
  font-size: 30px;
}

.article-archive-page-heading p {
  margin-top: var(--tp-space-2);
  color: var(--tp-color-text-muted);
  font-size: 13px;
}

.article-archive-back {
  display: inline-flex;
  min-height: var(--tp-touch-target);
  align-items: center;
  color: var(--tp-color-link);
  font-weight: var(--tp-font-weight-heavy);
  text-decoration: none;
}
```

替换为：

```css
.article-archive-page-heading {
  display: grid;
  gap: var(--tp-space-3);
  border-bottom: 1px solid var(--tp-color-border-strong);
  padding-bottom: var(--tp-space-4);
}

.article-archive-page-titles {
  display: flex;
  flex-wrap: wrap;
  gap: var(--tp-space-4);
  align-items: baseline;
}

.article-archive-page-heading h1 {
  margin: 0;
  font-size: 28px;
  white-space: nowrap;
}

.article-archive-page-count {
  color: var(--tp-color-text-muted);
  font-size: 12px;
  font-weight: var(--tp-font-weight-strong);
}

.article-archive-page-count b {
  color: var(--tp-color-text-strong);
  font-variant-numeric: tabular-nums;
}

.article-archive-back {
  display: inline-flex;
  min-height: var(--tp-touch-target);
  margin-left: auto;
  align-items: center;
  color: var(--tp-color-link);
  font-weight: var(--tp-font-weight-heavy);
  text-decoration: none;
}
```

- [ ] **Step 3: 工具条改成 flex 并加视图控件**

把：

```css
.article-archive-page-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 480px);
  gap: var(--tp-space-4);
  align-items: end;
}

.article-archive-page-toolbar > div {
  display: grid;
  gap: var(--tp-space-1);
}

.article-archive-page-toolbar span {
  color: var(--tp-color-text-muted);
  font-size: 12px;
}

.article-archive-page-search {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: var(--tp-space-2);
}
```

替换为：

```css
.article-archive-page-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--tp-space-3);
  align-items: center;
}

.article-archive-page-search {
  display: grid;
  flex: 1 1 300px;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: var(--tp-space-2);
  min-width: 0;
  max-width: 440px;
}
```

- [ ] **Step 4: 在 `.article-archive-page-search .article-archive-page-clear { ... }` 规则之后插入视图控件样式**

在这条规则之后：

```css
.article-archive-page-search .article-archive-page-clear {
  background: var(--button-secondary-bg);
  color: var(--button-secondary-fg);
}
```

插入：

```css
.article-archive-view-switch {
  display: inline-flex;
  margin-left: auto;
  gap: 3px;
  border: 1px solid var(--tp-color-border-strong);
  border-radius: var(--tp-radius-control);
  background: var(--article-archive-plate);
  padding: 3px;
}

.article-archive-view-switch button {
  display: inline-flex;
  min-height: var(--tp-touch-target);
  gap: 7px;
  align-items: center;
  border: 0;
  border-radius: var(--tp-radius-control);
  background: transparent;
  padding: 0 var(--tp-space-4);
  color: var(--tp-color-text-muted);
  font: inherit;
  font-size: 13px;
  font-weight: var(--tp-font-weight-strong);
  cursor: pointer;
}

.article-archive-view-switch button[aria-pressed="true"] {
  background: var(--article-archive-card-bg);
  box-shadow: 0 1px 0 color-mix(in srgb, var(--tp-color-accent) 22%, transparent);
  color: var(--tp-color-text-strong);
}

.article-archive-view-icon {
  display: grid;
  width: 14px;
  height: 14px;
  opacity: .9;
}

.article-archive-view-icon--card::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 1px;
  background: currentColor;
  box-shadow: 8px 0 0 currentColor, 0 8px 0 currentColor, 8px 8px 0 currentColor;
}

.article-archive-view-icon--list::before {
  content: "";
  align-self: start;
  height: 2px;
  border-radius: 1px;
  background: currentColor;
  box-shadow: 0 5px 0 currentColor, 0 10px 0 currentColor;
}
```

- [ ] **Step 5: 卡片正文整段替换**

把从 `.article-archive-card-grid {` 开始、到 `.article-archive-page-range { ... }` 结束的**整段**（含中间所有 `.article-archive-card*`、`.article-archive-page-empty`、`.article-archive-page-range` 规则）替换为：

```css
.article-archive-card-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--tp-space-4);
  min-width: 0;
}

.article-archive-card {
  display: grid;
  grid-template-rows: 150px auto auto;
  overflow: hidden;
  min-width: 0;
  border: 1px solid var(--tp-color-border);
  border-radius: var(--tp-radius-card);
  background: var(--article-archive-card-bg);
  color: inherit;
  text-decoration: none;
  transition: transform var(--tp-motion-fast) var(--tp-motion-ease), border-color var(--tp-motion-fast) var(--tp-motion-ease);
}

.article-archive-card:hover {
  transform: translateY(-2px);
  border-color: var(--tp-color-border-strong);
}

.article-archive-card__cover {
  position: relative;
  display: grid;
  overflow: hidden;
  place-items: center;
  border-bottom: 1px solid var(--tp-color-border);
  background: var(--article-archive-plate);
}

.article-archive-card__cover img {
  object-fit: contain;
}

.article-archive-cover-art.is-photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.article-archive-cover-art.is-sprite {
  width: auto;
  height: auto;
  image-rendering: pixelated;
}

.article-archive-card__cover .article-archive-cover-art.is-sprite {
  max-width: 120px;
  max-height: 120px;
}

.article-archive-card__tag {
  position: absolute;
  top: 10px;
  left: 10px;
  border: 1px solid var(--tp-color-border);
  border-radius: var(--tp-radius-control);
  background: color-mix(in srgb, var(--tp-color-page) 72%, transparent);
  padding: 4px var(--tp-space-2);
  color: var(--tp-color-accent);
  font-size: 10px;
  font-weight: var(--tp-font-weight-heavy);
  letter-spacing: .06em;
}

.article-archive-card__cover .public-article-cover-fallback {
  display: grid;
  gap: 2px;
  place-items: center;
  width: 100%;
  height: 100%;
  text-align: center;
}

.article-archive-card__cover .public-article-cover-fallback b {
  color: var(--tp-color-text-strong);
  font-size: 22px;
  line-height: 1;
}

.article-archive-card__cover .public-article-cover-fallback em {
  color: var(--tp-color-text-muted);
  font-size: 8px;
  font-style: normal;
  font-weight: var(--tp-font-weight-strong);
  line-height: 1;
  text-transform: uppercase;
}

.article-archive-card__copy {
  display: grid;
  align-content: start;
  gap: var(--tp-space-2);
  min-width: 0;
  padding: 14px 14px 12px;
}

.article-archive-card__copy > strong {
  display: -webkit-box;
  overflow: hidden;
  color: var(--tp-color-text-strong);
  font-size: 16px;
  line-height: 1.4;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.article-archive-card__summary {
  display: -webkit-box;
  overflow: hidden;
  margin: 0;
  min-height: 41px;
  color: var(--tp-color-text-muted);
  font-size: 13px;
  line-height: 1.6;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.article-archive-card__meta {
  display: flex;
  gap: var(--tp-space-3);
  align-items: center;
  border-top: 1px solid var(--tp-color-border);
  padding: 10px 14px;
  color: var(--tp-color-text-muted);
  font-size: 12px;
}

.article-archive-card__author {
  display: flex;
  gap: var(--tp-space-2);
  align-items: center;
  min-width: 0;
}

.article-archive-card__avatar {
  flex: none;
  width: 24px;
  height: 24px;
  border: 1px solid var(--tp-color-border);
  border-radius: 50%;
  background: linear-gradient(135deg, color-mix(in srgb, var(--tp-color-positive) 44%, transparent), color-mix(in srgb, var(--tp-color-accent) 30%, transparent));
}

.article-archive-card__author b {
  overflow: hidden;
  color: var(--tp-color-text);
  font-weight: var(--tp-font-weight-strong);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.article-archive-card__stats {
  display: flex;
  margin-left: auto;
  gap: var(--tp-space-3);
  white-space: nowrap;
}

.article-archive-card__stats b {
  color: var(--tp-color-text);
  font-weight: var(--tp-font-weight-strong);
}

.article-archive-card--loading {
  pointer-events: none;
}

.article-archive-card--loading .article-archive-card__copy {
  gap: var(--tp-space-2);
}

.article-archive-list {
  display: grid;
  overflow: hidden;
  min-width: 0;
  border: 1px solid var(--tp-color-border);
  border-radius: var(--tp-radius-card);
  background: var(--article-archive-card-bg);
}

.article-archive-list__head,
.article-archive-list-row {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 110px 92px 68px 92px;
  gap: var(--tp-space-4);
  align-items: center;
  padding: 0 14px;
}

.article-archive-list__head {
  height: 38px;
  border-bottom: 1px solid var(--tp-color-border);
  background: var(--article-archive-plate);
  color: var(--tp-color-text-muted);
  font-size: 11px;
  font-weight: var(--tp-font-weight-heavy);
  letter-spacing: .05em;
  text-transform: uppercase;
}

.article-archive-list__head .is-end {
  text-align: right;
}

.article-archive-list-row {
  min-height: 62px;
  border-bottom: 1px solid var(--tp-color-border);
  padding-top: 9px;
  padding-bottom: 9px;
  color: inherit;
  text-decoration: none;
  transition: background var(--tp-motion-fast) var(--tp-motion-ease);
}

.article-archive-list-row:last-child {
  border-bottom: 0;
}

.article-archive-list-row:hover {
  background: var(--article-archive-card-hover);
}

.article-archive-list-row--loading {
  pointer-events: none;
}

.article-archive-list-row__cover {
  display: grid;
  overflow: hidden;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 1px solid var(--tp-color-border);
  border-radius: var(--tp-radius-control);
  background: var(--article-archive-plate);
}

.article-archive-list-row__cover img {
  object-fit: contain;
}

.article-archive-list-row__cover .article-archive-cover-art.is-sprite {
  max-width: 36px;
  max-height: 36px;
}

.article-archive-list-row__cover .public-article-cover-fallback {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  text-align: center;
}

.article-archive-list-row__cover .public-article-cover-fallback b {
  color: var(--tp-color-text-strong);
  font-size: 13px;
  line-height: 1;
}

.article-archive-list-row__cover .public-article-cover-fallback em {
  display: none;
}

.article-archive-list-row__copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.article-archive-list-row__copy > strong {
  overflow: hidden;
  color: var(--tp-color-text-strong);
  font-size: 14px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.article-archive-list-row__summary {
  overflow: hidden;
  margin: 0;
  color: var(--tp-color-text-muted);
  font-size: 12px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.article-archive-list-row__author {
  overflow: hidden;
  color: var(--tp-color-text-muted);
  font-size: 12px;
  font-weight: var(--tp-font-weight-strong);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.article-archive-list-row__date {
  color: var(--tp-color-text-muted);
  font-size: 12px;
  text-align: right;
}

.article-archive-list-row__views {
  color: var(--tp-color-text);
  font-size: 12px;
  font-weight: var(--tp-font-weight-strong);
  text-align: right;
}

.article-archive-list-row__engagement {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: flex-end;
  color: var(--tp-color-text-muted);
  font-size: 12px;
  text-align: right;
}

.article-archive-list-row__mobile-meta {
  display: none;
}

.article-archive-page-empty {
  display: grid;
  min-height: 180px;
  place-items: center;
  gap: var(--tp-space-3);
  border-block: 1px solid var(--tp-color-border);
  color: var(--tp-color-text-muted);
  text-align: center;
}
```

- [ ] **Step 6: 三档断点整段替换**

把文件尾部这三块（1180 / 900 / 640，即 archive 段落的最后三个 `@media`）：

```css
@media (max-width: 1180px) {
  .article-archive-card-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .article-archive-page-toolbar {
    grid-template-columns: minmax(0, 1fr);
  }

  .article-archive-card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .article-approved-mast .article-mast-search {
    grid-template-columns: minmax(0, 1fr) auto;
    width: 100%;
  }

  .article-archive-page-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .article-archive-page-search {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .article-archive-page-search .article-archive-page-clear {
    grid-column: 1 / -1;
  }

  .article-archive-card-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .article-archive-card {
    grid-template-columns: 88px minmax(0, 1fr);
    min-height: 126px;
  }

  .article-archive-card__cover {
    grid-row: 1 / 3;
    width: 88px;
    height: 72px;
  }

  .article-archive-card__meta {
    grid-column: 2;
  }
}
```

替换为：

```css
@media (max-width: 1180px) {
  .article-archive-card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .article-archive-list__head,
  .article-archive-list-row {
    grid-template-columns: 44px minmax(0, 1fr) 100px 88px 64px;
  }

  .article-archive-list__head .is-engagement,
  .article-archive-list-row__engagement {
    display: none;
  }
}

@media (max-width: 900px) {
  .article-archive-page-toolbar {
    align-items: stretch;
  }

  .article-archive-view-switch {
    margin-left: 0;
  }

  .article-archive-list__head,
  .article-archive-list-row {
    grid-template-columns: 44px minmax(0, 1fr) 88px 64px;
  }

  .article-archive-list__head .is-author,
  .article-archive-list-row__author {
    display: none;
  }
}

@media (max-width: 640px) {
  .article-approved-mast .article-mast-search {
    grid-template-columns: minmax(0, 1fr) auto;
    width: 100%;
  }

  .article-archive-page-titles {
    align-items: flex-start;
    flex-direction: column;
    gap: var(--tp-space-2);
  }

  .article-archive-back {
    margin-left: 0;
  }

  .article-archive-page-search {
    grid-template-columns: minmax(0, 1fr) auto;
    max-width: none;
  }

  .article-archive-page-search .article-archive-page-clear {
    grid-column: 1 / -1;
  }

  .article-archive-card-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .article-archive-card {
    grid-template-rows: 180px auto auto;
  }

  .article-archive-list__head {
    display: none;
  }

  .article-archive-list-row {
    grid-template-columns: 44px minmax(0, 1fr);
    grid-template-areas: "cover copy" ". meta";
    gap: 4px var(--tp-space-3);
    padding-top: 11px;
    padding-bottom: 11px;
  }

  .article-archive-list-row__cover {
    grid-area: cover;
  }

  .article-archive-list-row__copy {
    grid-area: copy;
  }

  .article-archive-list-row__date,
  .article-archive-list-row__views {
    display: none;
  }

  .article-archive-list-row__mobile-meta {
    display: flex;
    grid-area: meta;
    flex-wrap: wrap;
    gap: var(--tp-space-2);
    color: var(--tp-color-text-muted);
    font-size: 12px;
  }
}
```

> 900px 档隐藏作者列时，`.article-archive-list__head .is-author` 需要在模板里有对应 class——回到 `ArticleArchiveList.vue`，把表头的 `<span>作者</span>` 改成 `<span class="is-author">作者</span>`。

- [ ] **Step 7: 补上表头的 is-author class**

`front-nuxt/components/article/ArticleArchiveList.vue`，把：

```vue
      <span>作者</span>
```

替换为：

```vue
      <span class="is-author">作者</span>
```

- [ ] **Step 8: 减弱动效块补上新元素**

把：

```css
@media (prefers-reduced-motion: reduce) {
  .article-index-approved-screen :where(a, button) {
    transition: none;
  }

  .article-archive-card {
    transition: none;
  }
}
```

替换为：

```css
@media (prefers-reduced-motion: reduce) {
  .article-index-approved-screen :where(a, button) {
    transition: none;
  }

  .article-archive-card {
    transform: none;
    transition: none;
  }

  .article-archive-card:hover {
    transform: none;
  }

  .article-archive-list-row {
    transition: none;
  }
}
```

- [ ] **Step 9: 提交**

```bash
cd /home/lolben/TerraPedia && git add front-nuxt/assets/css/domains/detail-pages-redesign.css front-nuxt/components/article/ArticleArchiveList.vue && git commit -m "feat(article): restyle archive for dual card and list views"
```

---

### Task 10: 全量验证与收口

**Files:**
- Create: `docs/devlog/entries/2026-08-01-article-archive-dual-mode.md`

- [ ] **Step 1: 跑四个改过的合同，要求全绿**

```bash
cd /home/lolben/TerraPedia/front-nuxt && for s in front-layout-layering public-pages loading-skeleton preview-images; do echo "===== $s ====="; pnpm run "check:$s" || echo "FAILED: $s"; done
```

Expected: 四行 `... contract passed.` / `... passed.`，无 `FAILED:`。

- [ ] **Step 2: 跑单测**

```bash
cd /home/lolben/TerraPedia/front-nuxt && pnpm run test:unit
```

Expected: 全部通过，`fail 0`。

- [ ] **Step 3: 跑全量 check（含 typecheck）**

```bash
cd /home/lolben/TerraPedia/front-nuxt && pnpm run check
```

Expected: 全绿。若 `check:breakpoints`、`check:css-ratchet`、`check:visual-system` 报红，逐条读错误信息修正，**不要**通过放宽断言来消红。

- [ ] **Step 4: 构建**

```bash
cd /home/lolben/TerraPedia/front-nuxt && pnpm run build
```

Expected: 构建成功。

- [ ] **Step 5: 真机核验双视图与 cookie 记忆**

起本地栈后（本仓库 `local-stack.config.json` 约定的方式），用 Playwright 脚本抓四张图：桌面卡片、桌面列表、移动卡片、移动列表，并验证 cookie 记忆。

创建临时脚本 `front-nuxt/tmp/archive-dual-mode-verify.mjs`：

```javascript
import { chromium } from 'playwright'

const base = process.env.BASE ?? 'http://localhost:15177'
const browser = await chromium.launch()

for (const [view, vp] of [['card', 'd'], ['list', 'd'], ['card', 'm'], ['list', 'm']]) {
  const context = await browser.newContext({
    viewport: vp === 'm' ? { width: 390, height: 900 } : { width: 1440, height: 1200 },
  })
  await context.addCookies([
    { name: 'terrapedia-theme', value: 'dark', url: base },
    { name: 'terrapedia-archive-view', value: view, url: base },
  ])
  const page = await context.newPage()
  await page.goto(`${base}/articles/archive`, { waitUntil: 'networkidle' })

  const pressed = await page.locator('.article-archive-view-switch button[aria-pressed="true"]').innerText()
  const cards = await page.locator('.article-archive-card').count()
  const rows = await page.locator('.article-archive-list-row').count()
  console.log(`${view}/${vp}: pressed=${pressed.trim()} cards=${cards} rows=${rows}`)

  await page.screenshot({ path: `tmp/archive-dual-${view}-${vp}.png`, fullPage: true })
  await context.close()
}

await browser.close()
```

```bash
cd /home/lolben/TerraPedia/front-nuxt && node tmp/archive-dual-mode-verify.mjs
```

Expected 输出：

```
card/d: pressed=卡片 cards=12 rows=0
list/d: pressed=列表 cards=0 rows=12
card/m: pressed=卡片 cards=12 rows=0
list/m: pressed=列表 cards=0 rows=12
```

关键点：`list` 的首屏 SSR 就是 rows=12、cards=0 —— 证明没有「先闪卡片再跳列表」。

- [ ] **Step 6: 人工看四张截图**

用 Read 工具逐张看 `front-nuxt/tmp/archive-dual-card-d.png`、`archive-dual-list-d.png`、`archive-dual-card-m.png`、`archive-dual-list-m.png`，逐项核对：
- 卡片：三列、150px 顶封面带、角标只出现在封面上、摘要两行、页脚左作者右日期+浏览
- 小尺寸精灵图（钛金矿 16×16、熔岩镐 36×36）在封面带里是**锐利像素**不是模糊马赛克；1280×720 的截图是 `cover` 裁切铺满
- 列表：62px 行、44px 缩略、标题单行省略、右侧四列右对齐
- 移动：卡片单列、列表折成两行且 meta 一行内排完，不出现横向滚动条
- 三主题（dark / morning-paper / warm-slate）卡面与页面底色不打架

- [ ] **Step 7: 清理临时脚本与截图**

```bash
cd /home/lolben/TerraPedia/front-nuxt && rm -f tmp/archive-dual-mode-verify.mjs tmp/archive-dual-*.png
```

- [ ] **Step 8: 写 devlog**

创建 `docs/devlog/entries/2026-08-01-article-archive-dual-mode.md`：

```markdown
# 2026-08-01 · 文章资料库双模式

## 做了什么

`/articles/archive` 从单一四列紧凑卡改成「共用头部 + 卡片/列表双正文」：

- 卡片视图（默认）：三列信息卡，150px 顶封面带、两行摘要、页脚分作者与数据两组。
- 列表视图：62px 索引行，44px 缩略 + 标题 + 单行摘要 + 作者/发布/浏览/互动右对齐列。
- 视图偏好存 cookie `terrapedia-archive-view`，与 `terrapedia-theme` 同机制，SSR 首屏直出正确正文，无水合闪烁。
- 封面按原生尺寸分流：最长边 < 400px 的游戏精灵图 `pixelated` 不平滑放大，≥ 400px 的照片/截图走 `cover` 裁切。此前 12 张封面里 8 张被插值拉成马赛克。
- 去掉在 12 张卡上重复 12 次的「公开手札」文本行，收成封面带角标；篇数从三处重复收到标题行一处。

## 明确没做

**排序控件没有做。** 后端 `/articles` 只收 `page/limit/size/keyword`，没有 `sort` 参数，现在画出来就是假控件。已在 `check-front-layout-layering-contract.mjs` 加负向断言锁死：archive 的页面与三个组件出现「排序」`sortBy` `sortOrder` `orderBy` 任一标记即判红。要做排序需单独授权一份后端改动（Controller + Service + Mapper 加白名单排序字段）。

## 坑

- `public-article-cover-fallback` 的基础样式藏在 `pages/articles/index.vue` 的 scoped 块里，archive 复用同名 class 必须在 `detail-pages-redesign.css` 里自带一份，否则静态合同全绿但页面静默失样。列表视图的 44px 井需要单独一条，不能和卡片那条合并成逗号选择器——分层合同的正则要求 `.article-archive-card__cover .public-article-cover-fallback` 后面直接跟 `{`。
- 精灵/照片分流依赖 `img.naturalWidth`，服务端量不到，首帧一律按 `sprite`（`contain`）渲染再在 `@load` 里升级。默认取 `contain` 是因为它永不裁切，猜错也不会切掉画面。
- 分层合同用 `lastIndexOf('@media (max-width: 900px)')` 切 archive 的断点片段，1180/900/640 三块必须按序保留，删掉中间任何一块都会让切片落空、断言静默变成空字符串匹配。

## 验证

`pnpm run check` 全绿、`pnpm run test:unit` 全绿、`pnpm run build` 成功；1440 与 390 两个视口 × 卡片/列表四张截图人工核验，列表视图 SSR 首屏 `rows=12 cards=0`。
```

- [ ] **Step 9: 提交**

```bash
cd /home/lolben/TerraPedia && git add docs/devlog/entries/2026-08-01-article-archive-dual-mode.md && git commit -m "docs(article): record archive dual-mode delivery"
```

---

## 自查

**规格覆盖**：设计稿 `data-plan="n"` 的每一块都有落点——共用 mast（Task 8）、搜索 + 视图分段控件（Task 7）、卡片正文 B（Task 5 + Task 9）、列表正文 C（Task 6 + Task 9）、封面分流（Task 1 + Task 4 + Task 9）、cookie 记忆（Task 1 + Task 3 + Task 8）、无排序控件（Task 2 负向断言 + Task 10 devlog）。设计稿里带 `data-sort="on"` 的 `.pn-sort` 一块**有意不实现**。

**类型一致性**：`cardSummary` / `rowSummary` 两个 prop 名在 Task 5/6/7/8 全文一致；`viewMode` / `setViewMode` / `update:viewMode` 在 Task 2 断言、Task 3 composable、Task 7 组件、Task 8 页面四处一致；`classifyCoverMode` / `COVER_SPRITE_MAX_EDGE` / `ArticleCoverMode` 在 Task 1 与 Task 4 一致；`normalizeArchiveViewMode` / `ARCHIVE_VIEW_COOKIE` / `ArchiveViewMode` 在 Task 1、3、7 一致。

**未被本计划改动的东西**：`useAsyncData` key、`/articles` 查询参数、`articleLimit = 12`、302 越界重定向、`article-discovery-archive-compat` 中间件、`CommonPaginationDock` 接线——全部原样保留，对应合同断言不动。
