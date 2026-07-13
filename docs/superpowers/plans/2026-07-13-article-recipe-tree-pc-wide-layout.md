# 文章合成树 PC 宽画布 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 PC 文章详情中，让内嵌合成树使用文章主体面板内容宽度，从而在全节点同屏时保持可读的物品和制作站预览。

**Architecture:** `pages/articles/[slug].vue` 在创建树前读取文章主体面板的内侧宽度，并由纯函数在 PC 断点选择该宽度、在移动端保留正文列宽。树容器以局部 data 属性和 CSS 变量脱离正文 `76ch` 限制；现有树布局、比例计算和交互保持不变。

**Tech Stack:** Nuxt 4、Vue 3、TypeScript、原生 DOM、Node Chromium 契约检查。

---

### Task 1: 锁定 PC 宽画布选择规则（RED）

**Files:**
- Modify: `front-nuxt/scripts/check-article-content-references.mjs:208-324, 730-780`
- Test: `front-nuxt/scripts/check-article-content-references.mjs`

- [x] **Step 1: 加入 helper 源码契约和运行态断言**

在现有 `resolveArticleRecipeTreeAvailableWidth` 源码断言之后加入：

```js
if (!articlePageSource.includes('resolveArticleRecipeTreeFrameWidth')) {
  throw new Error('article recipe tree must resolve a PC-wide frame from its body panel')
}
if (!articlePageSource.includes('data-article-recipe-tree-wide')) {
  throw new Error('article recipe tree must expose a scoped wide-frame marker')
}
```

把 `resolveArticleRecipeTreeFrameWidth` 放进 `recipeTreeHelpers`，并在现有宽度断言后加入：

```js
assert(resolveArticleRecipeTreeFrameWidth(663, 937, 1440) === 937, 'PC article tree must use its article-body content width instead of the narrower prose measure')
assert(resolveArticleRecipeTreeFrameWidth(663, 937, 768) === 663, 'mobile article tree must retain the prose-width frame')
```

- [x] **Step 2: 运行契约确认失败**

Run: `cd front-nuxt && pnpm run check:article-content-references`

Expected: FAIL，提示缺少 `resolveArticleRecipeTreeFrameWidth` 或 PC 宽画布断言。

### Task 2: 以主体面板宽度创建 PC 树画布（GREEN）

**Files:**
- Modify: `front-nuxt/pages/articles/[slug].vue:775-790, 1254-1282, 2920-2940`
- Test: `front-nuxt/scripts/check-article-content-references.mjs`

- [x] **Step 1: 定义纯宽度选择 helper**

在 `ARTICLE_RECIPE_GRAPH_VIEWPORT_GUTTER` 后加入：

```ts
const ARTICLE_RECIPE_TREE_WIDE_BREAKPOINT = 960

const resolveArticleRecipeTreeFrameWidth = (contentWidth: number, bodyPanelContentWidth: number, viewportWidth: number) => {
  const safeContentWidth = Math.max(1, contentWidth)
  const safeBodyPanelWidth = Math.max(1, bodyPanelContentWidth)
  return viewportWidth >= ARTICLE_RECIPE_TREE_WIDE_BREAKPOINT
    ? Math.max(safeContentWidth, safeBodyPanelWidth)
    : safeContentWidth
}
```

- [x] **Step 2: 读取主体面板内侧宽度并设置树容器**

在 `appendArticleRecipeTreeGraph` 中，保留当前容器 padding 读取，并在计算 `scale` 前替换宽度流程为：

```ts
const contentWidth = resolveArticleRecipeTreeAvailableWidth(
  container.clientWidth || 720,
  Number.parseFloat(containerStyle.paddingLeft) || 0,
  Number.parseFloat(containerStyle.paddingRight) || 0,
)
const bodyPanel = container.closest<HTMLElement>('.article-body-panel')
const bodyPanelStyle = bodyPanel ? getComputedStyle(bodyPanel) : null
const bodyPanelContentWidth = bodyPanel && bodyPanelStyle
  ? resolveArticleRecipeTreeAvailableWidth(
      bodyPanel.clientWidth,
      Number.parseFloat(bodyPanelStyle.paddingLeft) || 0,
      Number.parseFloat(bodyPanelStyle.paddingRight) || 0,
    )
  : contentWidth
const availableWidth = resolveArticleRecipeTreeFrameWidth(contentWidth, bodyPanelContentWidth, window.innerWidth)
const containerOuterWidth = availableWidth
  + (Number.parseFloat(containerStyle.paddingLeft) || 0)
  + (Number.parseFloat(containerStyle.paddingRight) || 0)

if (availableWidth > contentWidth) {
  container.dataset.articleRecipeTreeWide = 'true'
  container.style.setProperty('--article-recipe-tree-wide-width', `${containerOuterWidth}px`)
} else {
  delete container.dataset.articleRecipeTreeWide
  container.style.removeProperty('--article-recipe-tree-wide-width')
}
```

继续用 `availableWidth` 调用 `resolveArticleRecipeTreeBaseScale`。

- [x] **Step 3: 添加 scoped CSS，不触碰正文阅读宽度或侧栏**

紧接 `.tp-recipe-tree` 规则后加入：

```css
@media (min-width: 960px) {
  .article-content-text :deep(.tp-recipe-tree[data-article-recipe-tree-wide="true"]) {
    width: var(--article-recipe-tree-wide-width);
    max-width: none;
  }
}
```

不要修改 `.article-content-text` 的 `max-width: 76ch`，也不要修改 `.article-detail-grid` 或 `.article-route-panel`。

- [x] **Step 4: 运行契约确认通过**

Run: `cd front-nuxt && pnpm run check:article-content-references`

Expected: `article content reference checks passed`。

### Task 3: 验证类型和真实 PC 布局

**Files:**
- Modify: `docs/devlog/entries/2026-07-12-article-embedded-recipe-tree-light.md`
- Modify: `docs/devlog/current.md`

- [x] **Step 1: 运行静态验证**

Run:

```bash
cd front-nuxt && pnpm exec vue-tsc --noEmit
git diff --check
```

Expected: 两个命令均退出 `0`。

- [x] **Step 2: 运行真实页面 Chromium 审核**

在本地后端可用时，以 1440×1000 打开 `/articles/fw` 并记录：树容器宽度、graph scale、图框尺寸、节点边界、站点图框、侧栏边界和文档 `scrollWidth`。必须满足：树与侧栏不相交、节点全部在树图框内、站点图框大于 `18.54px`、文档不横向溢出。

- [x] **Step 3: 记录结果**

在 devlog 记录采用主体面板而非正文列宽的理由、RED/GREEN 证据、实际页面几何、残余风险和验收端口。用户未要求提交时保持未提交状态。
