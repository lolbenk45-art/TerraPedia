# Article Reference Entry And Hover Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make article content references easy to insert without blocking the editor, and make saved article references show data on hover while navigating only on click.

**Architecture:** Keep the existing `tp-content-ref` saved HTML contract for item/NPC references. Move the editor picker trigger out of the editable stage into a visible insert bar above the content surface, then add runtime-only hover preview state on the article detail page. Leave Boss and recipe tree as extension points, not separate external buttons in this fix.

**Tech Stack:** Nuxt 4 frontend, Vue `<script setup>`, existing public content reference API, DOM sanitizer/enhancement helpers, Chromium-based runtime check scripts.

---

## Completion Record

- Implemented on branch `fix/article-reference-entry-hover-2026-06-06`.
- Multi-agent plan review completed before implementation; review feedback was incorporated into this plan.
- Multi-agent acceptance review completed after implementation; no Critical or Important issues remained.
- Verification command used: `cd front-nuxt && pnpm run check`.

---

## Task Restatement

用户当前问题：

- 资料引用按钮在编辑器正文右下角，会遮挡文章内容。
- 引用插入后，文章正文里需要显示图片或文字，并且可以在正文中跟随文字排版。
- 鼠标滑过引用时显示资料信息。
- 只有点击引用时才跳转到对应详情页。
- Boss、配方树需要考虑后续接入方式。

## Success Criteria

- 编辑器里不再有覆盖正文内容的右下角资料引用浮层按钮。
- 资料引用入口仍明显，使用铁镐图片和文字标签，位于编辑器工具栏下方、正文输入区上方。
- 打开资料引用面板不会覆盖正文输入区域的主要内容；小屏时也限制在可视区域内。
- 资料引用面板采用 insert bar 内的 inline 展开方式，参与正常布局并把正文输入区下推，不使用 bottom/right 覆盖正文的旧定位。
- 正文中的 item/NPC 引用默认仍显示图片，用户选择文字模式时显示文字。
- 引用 hover/focus 显示结构化资料浮层：图片、名称、类型、分类或摘要、点击提示。
- hover/focus 不触发跳转；click、Enter、Space 才跳转。
- 保存 HTML 仍只存安全的 `span.tp-content-ref` 属性，不写入事件处理器或浮层 HTML。
- 保存/展示 sanitizer 不保留 hover runtime 字段，例如 `onmouseenter`、`onfocus`、`data-tp-href`、`data-tp-resolved`、`aria-describedby`、`.article-reference-preview`。
- 现有运行态检查脚本更新并通过。

## Out Of Scope

- 不新增后端 API 字段。
- 不新增 Boss 或配方树正式引用类型。
- 不改变文章保存格式中的核心 `data-tp-ref-type="item|npc"` 合约。
- 不重做富文本编辑器整体架构。

## Future Extension Decision

- Boss：后续作为资料引用选择器里的新类型 tab 接入，优先复用 `ContentReference` 搜索、解析、hover、跳转链路。前提是前台已有稳定 Boss 详情页和 resolve API 返回。Boss 正式接入时需要同步扩展 `ContentReferenceSearchQuery`、`ContentReferenceResolveInput`、`NormalizedContentReference.type`、sanitizer allowlist、详情路径和测试 fixture；Boss 详情目标应是 `/bosses/:id`，现有 NPC 类型仍跳 `/npcs/:id`。
- 配方树：后续不要作为普通 inline atom 的同级按钮直接堆在工具栏外层。它更适合做资料引用选择器里的“结构块/嵌入”模式，保存为一个可识别的 block-level recipe-tree embed，使用独立 sanitizer allowlist，不复用 `span.tp-content-ref`，展示占位块并在文章正文中渲染交互树。
- 当前仍保持一个统一外部入口：`资料引用`。避免多个插入按钮抢占编辑空间。

## Files

- Modify: `front-nuxt/components/user/UserArticleRichEditor.vue`
  - Move reference picker template outside `.user-rich-editor__stage`.
  - Add visible insert bar trigger with iron pickaxe image and text.
  - Re-anchor popover to insert bar.
  - Remove editor surface padding reserved for the old bottom overlay.
  - Keep selection preservation and default search behavior.

- Modify: `front-nuxt/pages/articles/[slug].vue`
  - Add article reference preview reactive state.
  - Add hover/focus/move/leave handlers while enhancing sanitized reference nodes.
  - Render a Vue-controlled tooltip outside `v-html`.
  - Keep click and keyboard navigation as the only navigation triggers.
  - Add tooltip styling.

- Modify: `front-nuxt/scripts/check-user-article-editor-runtime.mjs`
  - Replace old assertions for right-bottom floating action button.
  - Assert new insert bar is outside the editable stage and trigger remains prominent.
  - Keep assertions for default search, selection preservation, iron pickaxe image, drag, sizing, style, undo/redo.

- Modify: `front-nuxt/scripts/check-article-content-references.mjs`
  - Assert hover/focus handlers update preview state.
  - Assert mouseenter/focus do not navigate.
  - Assert click/Enter/Space still navigate.
  - Assert preview data includes label, type, detail path, image/category/summary where available.

## Implementation Steps

### Task 1: Move Editor Reference Entry

- [ ] **Step 1: Update template structure**

In `front-nuxt/components/user/UserArticleRichEditor.vue`, move the reference menu block out of `.user-rich-editor__stage` and place it between toolbar and stage:

```vue
<div class="user-rich-editor__insert-bar" aria-label="插入内容">
  <div class="user-rich-editor__reference-menu">
    <button
      type="button"
      class="user-rich-editor__reference-fab"
      title="插入资料引用"
      aria-label="插入资料引用"
      :aria-expanded="referenceMenuOpen"
      :disabled="disabled"
      @mousedown.prevent="saveSelection"
      @click="openReferenceMenu"
    >
      <img
        v-if="!pickaxeImageFailed"
        :src="IRON_PICKAXE_REFERENCE_IMAGE"
        alt=""
        loading="lazy"
        decoding="async"
        aria-hidden="true"
        @error="pickaxeImageFailed = true"
      >
      <span class="user-rich-editor__reference-icon-fallback" v-else aria-hidden="true">镐</span>
      <span class="user-rich-editor__reference-fab-label">资料引用</span>
    </button>
    <div v-if="referenceMenuOpen" class="user-rich-editor__reference-popover" role="dialog" aria-label="资料引用">
      <!-- Keep the existing tabs, display mode, search input, results, and close button. -->
    </div>
  </div>
</div>

<div class="user-rich-editor__stage">
  <div ref="editorRef" class="user-rich-editor__surface" ... />
</div>
```

- [ ] **Step 2: Update editor styles**

Use a stable insert bar and remove overlay spacing:

```css
.user-rich-editor__insert-bar {
  display: grid;
  justify-items: end;
  gap: 10px;
  padding: 10px 12px;
  border-right: 1px solid color-mix(in srgb, var(--index-line) 42%, transparent);
  border-left: 1px solid color-mix(in srgb, var(--index-line) 42%, transparent);
  background: color-mix(in srgb, var(--index-surface) 82%, transparent);
}

.user-rich-editor__reference-menu {
  position: relative;
  z-index: 20;
  display: grid;
  justify-items: end;
  width: 100%;
}

.user-rich-editor__reference-fab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 132px;
  min-height: 44px;
  gap: 8px;
  padding: 7px 12px;
  border: 2px solid color-mix(in srgb, var(--accent-gold) 82%, #fff);
  border-radius: 8px;
}

.user-rich-editor__reference-fab img {
  width: 28px;
  height: 28px;
}

.user-rich-editor__surface {
  padding: 22px;
}

.user-rich-editor__reference-popover {
  position: static;
  z-index: 1;
  width: min(420px, 100%);
  max-height: min(58dvh, 460px);
  overflow: auto;
  margin-top: 10px;
}
```

- [ ] **Step 3: Preserve behavior**

Keep these existing behaviors unchanged:

```ts
const openReferenceMenu = () => {
  if (props.disabled) return
  saveSelection()
  referenceMenuOpen.value = true
  colorMenuOpen.value = false
  linkMenuOpen.value = false
  if (!referenceSearchLoading.value && !referenceSearchResults.value.length) void runReferenceSearch()
}
```

- [ ] **Step 4: Run focused editor check**

Run:

```bash
cd front-nuxt
node scripts/check-user-article-editor-runtime.mjs
```

Expected before script update: FAIL only on old right-bottom FAB assertions.

- [ ] **Step 5: Add non-overlap layout proof**

In `front-nuxt/scripts/check-user-article-editor-runtime.mjs`, add a minimal browser fixture that renders:

```html
<div class="user-rich-editor__insert-bar">
  <div class="user-rich-editor__reference-menu">
    <button class="user-rich-editor__reference-fab"><span class="user-rich-editor__reference-fab-label">资料引用</span></button>
    <div class="user-rich-editor__reference-popover"></div>
  </div>
</div>
<div class="user-rich-editor__stage">
  <div class="user-rich-editor__surface"></div>
</div>
```

and assert:

```js
const insertBarRect = document.querySelector('.user-rich-editor__insert-bar').getBoundingClientRect();
const surfaceRect = document.querySelector('.user-rich-editor__surface').getBoundingClientRect();
const popoverRect = document.querySelector('.user-rich-editor__reference-popover').getBoundingClientRect();
assert(insertBarRect.bottom <= surfaceRect.top, 'insert bar must sit above the editor surface');
assert(popoverRect.bottom <= surfaceRect.top, 'open reference panel must not overlap the editor surface');
```

### Task 2: Add Article Hover Preview

- [ ] **Step 1: Add preview state**

In `front-nuxt/pages/articles/[slug].vue`, add:

```ts
const articleReferencePreview = ref<{
  key: string
  label: string
  type: 'item' | 'npc'
  typeLabel: string
  id: string
  imageUrl: string
  categoryName: string
  summary: string
  detailPath: string
  available: boolean
  x: number
  y: number
  placement: 'top' | 'bottom'
} | null>(null)
```

- [ ] **Step 2: Add helpers**

Add helpers near `enhanceArticleReferenceNodes`:

```ts
const ARTICLE_REFERENCE_PREVIEW_ID = 'article-reference-preview'
const ARTICLE_REFERENCE_PREVIEW_WIDTH = 280
const ARTICLE_REFERENCE_PREVIEW_HEIGHT = 128
const ARTICLE_REFERENCE_PREVIEW_MARGIN = 12

const formatArticleReferenceTypeLabel = (type: 'item' | 'npc' | '') => {
  if (type === 'item') return '物品'
  if (type === 'npc') return 'NPC'
  return '资料'
}

const computeArticleReferencePreviewPosition = (node: HTMLElement, event?: MouseEvent | FocusEvent) => {
  const rect = node.getBoundingClientRect()
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || ARTICLE_REFERENCE_PREVIEW_WIDTH
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || ARTICLE_REFERENCE_PREVIEW_HEIGHT
  const preferredX = event instanceof MouseEvent ? event.clientX : rect.left + rect.width / 2
  const x = Math.min(
    Math.max(preferredX, ARTICLE_REFERENCE_PREVIEW_MARGIN + ARTICLE_REFERENCE_PREVIEW_WIDTH / 2),
    Math.max(ARTICLE_REFERENCE_PREVIEW_MARGIN + ARTICLE_REFERENCE_PREVIEW_WIDTH / 2, viewportWidth - ARTICLE_REFERENCE_PREVIEW_MARGIN - ARTICLE_REFERENCE_PREVIEW_WIDTH / 2),
  )
  const hasTopSpace = rect.top >= ARTICLE_REFERENCE_PREVIEW_HEIGHT + ARTICLE_REFERENCE_PREVIEW_MARGIN * 2
  const y = hasTopSpace
    ? Math.max(ARTICLE_REFERENCE_PREVIEW_MARGIN, rect.top)
    : Math.min(viewportHeight - ARTICLE_REFERENCE_PREVIEW_MARGIN, rect.bottom)
  return { x, y, placement: hasTopSpace ? 'top' as const : 'bottom' as const }
}

const showArticleReferencePreview = (node: HTMLElement, event?: MouseEvent | FocusEvent) => {
  const key = contentReferenceKey(node.dataset.tpRefType, node.dataset.tpRefId)
  const reference = key ? articleReferences.value[key] : null
  const type = node.dataset.tpRefType === 'npc' ? 'npc' : node.dataset.tpRefType === 'item' ? 'item' : ''
  const id = String(node.dataset.tpRefId || '').trim()
  if (!key || !type || !id) return
  const rect = node.getBoundingClientRect()
  const position = computeArticleReferencePreviewPosition(node, event)
  const label = articleReferenceLabels.value[key] || reference?.label || String(node.dataset.tpRefLabel || node.textContent || '').trim()
  articleReferencePreview.value = {
    key,
    label: label || `${formatArticleReferenceTypeLabel(type)} #${id}`,
    type,
    typeLabel: formatArticleReferenceTypeLabel(type),
    id,
    imageUrl: reference?.imageUrl || sanitizeArticleUrl(String(node.dataset.tpRefImage || ''), 'src'),
    categoryName: reference?.categoryName || '',
    summary: reference?.summary || '',
    detailPath: reference?.detailPath || node.dataset.tpHref || (type === 'item' ? `/items/${id}` : `/npcs/${id}`),
    available: reference?.available !== false,
    ...position,
  }
  node.setAttribute('aria-describedby', ARTICLE_REFERENCE_PREVIEW_ID)
}

const moveArticleReferencePreview = (event: MouseEvent) => {
  if (!articleReferencePreview.value) return
  const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  if (!target) return
  const position = computeArticleReferencePreviewPosition(target, event)
  articleReferencePreview.value = {
    ...articleReferencePreview.value,
    ...position,
  }
}

const hideArticleReferencePreview = (node?: HTMLElement, key?: string) => {
  node?.removeAttribute('aria-describedby')
  if (!key || articleReferencePreview.value?.key === key) {
    articleReferencePreview.value = null
  }
}
```

- [ ] **Step 3: Attach runtime-only handlers**

Inside `enhanceArticleReferenceNodes`, after navigation handlers:

```ts
node.onmouseenter = (event: MouseEvent) => showArticleReferencePreview(node, event)
node.onmousemove = moveArticleReferencePreview
node.onmouseleave = () => hideArticleReferencePreview(node, key || undefined)
node.onfocus = (event: FocusEvent) => showArticleReferencePreview(node, event)
node.onblur = () => hideArticleReferencePreview(node, key || undefined)
```

Do not put any of these handlers into saved article HTML.

- [ ] **Step 4: Render tooltip outside article HTML**

Near article content:

```vue
<div ref="articleContentRef" class="article-content-text" v-html="sanitizedArticleHtml"></div>
<div
  v-if="articleReferencePreview"
  :id="ARTICLE_REFERENCE_PREVIEW_ID"
  class="article-reference-preview"
  :class="`article-reference-preview--${articleReferencePreview.placement}`"
  :style="{ left: `${articleReferencePreview.x}px`, top: `${articleReferencePreview.y}px` }"
  role="tooltip"
>
  <span class="article-reference-preview__thumb">
    <img v-if="articleReferencePreview.imageUrl" :src="articleReferencePreview.imageUrl" :alt="articleReferencePreview.label" loading="lazy" decoding="async">
    <span v-else>图</span>
  </span>
  <span class="article-reference-preview__body">
    <strong>{{ articleReferencePreview.label }}</strong>
    <small>{{ articleReferencePreview.typeLabel }} · {{ articleReferencePreview.categoryName || articleReferencePreview.summary || `ID ${articleReferencePreview.id}` }}</small>
    <em>{{ articleReferencePreview.available ? '点击打开详情' : '资料暂不可用' }}</em>
  </span>
</div>
```

- [ ] **Step 5: Style tooltip**

```css
.article-reference-preview {
  position: fixed;
  z-index: 80;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  width: min(280px, calc(100vw - 24px));
  gap: 10px;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--accent-gold) 42%, var(--index-line));
  border-radius: 8px;
  background: color-mix(in srgb, var(--panel) 96%, #111);
  box-shadow: 0 16px 34px rgba(0,0,0,.36);
  pointer-events: none;
}

.article-reference-preview--top {
  transform: translate(-50%, calc(-100% - 12px));
}

.article-reference-preview--bottom {
  transform: translate(-50%, 12px);
}
```

- [ ] **Step 6: Clear preview on article reload**

In `loadArticleReferences`, set:

```ts
articleReferencePreview.value = null
```

before collecting refs.

### Task 3: Update Runtime Checks

- [ ] **Step 1: Update editor runtime static assertions**

In `front-nuxt/scripts/check-user-article-editor-runtime.mjs`, replace old FAB assertions with:

```js
if (!editorComponentSource.includes('user-rich-editor__insert-bar')) throw new Error('reference picker must live in a visible insert bar above the editor surface')
if (!editorComponentSource.includes('user-rich-editor__reference-fab-label')) throw new Error('reference picker trigger must include a visible text label')
if (!/<div class="user-rich-editor__insert-bar"[\s\S]*<div class="user-rich-editor__reference-menu">[\s\S]*<div class="user-rich-editor__stage">[\s\S]*ref="editorRef"[\s\S]*class="user-rich-editor__surface"/.test(editorComponentSource)) throw new Error('reference picker must be outside and above the contenteditable editor stage')
if (/\.user-rich-editor__reference-menu \{[\s\S]*position: absolute;[\s\S]*bottom:/.test(editorComponentSource)) throw new Error('reference picker must not be positioned as a bottom overlay on the editor surface')
if (/\.user-rich-editor__reference-popover \{[\s\S]*position: absolute;/.test(editorComponentSource)) throw new Error('reference picker panel must be inline, not an overlay over the editor surface')
```

- [ ] **Step 2: Update article reference check harness**

In `front-nuxt/scripts/check-article-content-references.mjs`, extract these helpers in addition to `enhanceArticleReferenceNodes`:

```ts
formatArticleReferenceTypeLabel
computeArticleReferencePreviewPosition
showArticleReferencePreview
moveArticleReferencePreview
hideArticleReferencePreview
enhanceArticleReferenceNodes
```

Then assert:

```js
const beforeHoverNavigationCount = navigations.length;
ref.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientX: 120, clientY: 80 }));
assert(navigations.length === beforeHoverNavigationCount, 'hover must not navigate');
assert(articleReferencePreview.value?.label === '泰拉刃', 'hover preview should include reference label');
assert(articleReferencePreview.value?.typeLabel === '物品', 'hover preview should include type label');
assert(articleReferencePreview.value?.detailPath === '/items/77', 'hover preview should include detail path');
assert(ref.getAttribute('aria-describedby') === 'article-reference-preview', 'hover preview should connect aria-describedby');
ref.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 1, clientY: 10 }));
assert(articleReferencePreview.value.x >= 140, 'preview x should clamp away from the left viewport edge');
ref.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
assert(articleReferencePreview.value === null, 'mouseleave should hide hover preview');
assert(!ref.hasAttribute('aria-describedby'), 'mouseleave should clear aria-describedby');
ref.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
assert(navigations.length === beforeHoverNavigationCount, 'focus must not navigate');
assert(articleReferencePreview.value?.label === '泰拉刃', 'focus should show preview');
ref.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
assert(navigations.length === beforeHoverNavigationCount, 'non-activation key must not navigate');
ref.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
assert(articleReferencePreview.value === null, 'blur should hide preview');
```

Also assert sanitizer strips runtime-only fields:

```js
const runtimePolluted = sanitize('<p><span class="tp-content-ref" data-tp-ref-type="item" data-tp-ref-id="77" data-tp-ref-label="泰拉刃" data-tp-href="/items/77" data-tp-resolved="ready" aria-describedby="article-reference-preview" onmouseenter="alert(1)">泰拉刃</span><span class="article-reference-preview">bad</span></p>');
assert(!runtimePolluted.includes('data-tp-href'), 'sanitizer must strip runtime href data');
assert(!runtimePolluted.includes('data-tp-resolved'), 'sanitizer must strip runtime resolved data');
assert(!runtimePolluted.includes('aria-describedby'), 'sanitizer must strip runtime aria-describedby');
assert(!runtimePolluted.includes('onmouseenter'), 'sanitizer must strip hover event handlers');
assert(!runtimePolluted.includes('article-reference-preview'), 'sanitizer must strip runtime preview markup');
```

- [ ] **Step 3: Run focused checks**

Run:

```bash
cd front-nuxt
node scripts/check-user-article-editor-runtime.mjs
node scripts/check-article-content-references.mjs
```

Expected: both PASS.

### Task 4: Full Validation

- [ ] **Step 1: Run frontend quality gate**

Run:

```bash
cd front-nuxt
pnpm run check
```

Expected: PASS.

- [ ] **Step 2: Manual browser verification after service restart**

After merge to main and restart:

```bash
bash ./scripts/dev/stop-local-stack.sh
bash ./scripts/dev/start-local-stack.sh
```

Expected local URLs:

- Front: `http://localhost:5174/`
- Admin: `http://localhost:3001/`
- Back: `http://localhost:18088/`

Manual checks:

- Open article editor.
- Confirm `资料引用` appears above正文输入区, visible with iron pickaxe image and label.
- Insert item reference in image mode; reference appears inline and can be dragged with text.
- Insert item/NPC reference in text mode; reference appears inline as text.
- Save article and open article detail page.
- Hover item/NPC reference: preview appears, no navigation happens.
- Click item reference: navigates to `/items/:id`.
- Click NPC reference: navigates to `/npcs/:id`.
- Tab focus on a reference shows the preview; blur hides it.
- Enter and Space navigate; ArrowRight or other non-activation keys do not navigate.
- Hover references near the viewport left edge, right edge, and first visible line; tooltip remains on screen.

## Multi-Agent Review Gates

- Before execution:
  - Send this plan to at least 3 agents.
  - Ask them to check requirement coverage, UX risk, saved HTML safety, hover navigation semantics, and test sufficiency.
  - Apply any Critical or Important feedback before implementation.

- After execution:
  - Send implementation diff to at least 3 agents.
  - Ask them to verify the diff against this plan and current user requirements.
  - Fix any Critical or Important feedback before final commit/merge.

## Commit And Merge Plan

- Commit on `fix/article-reference-entry-hover-2026-06-06` after validation.
- Merge into `main` only from the clean main worktree.
- Do not touch `/home/lolben/TerraPedia`.
- After merge, restart the local stack from the main worktree and report the URLs.
