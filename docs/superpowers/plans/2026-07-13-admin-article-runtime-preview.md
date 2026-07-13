# Admin Article Runtime Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin review and editor preview render safe images, non-navigating item/NPC/boss reference popovers, and interactive recipe-tree embeds without using a public article URL.

**Architecture:** First checkpoint the pre-existing user-editor hydration fix because the shared-runtime extraction must touch the same Vue file. A disposable alias spike then proves the two Nuxt apps can consume root shared source. Commit one extracts the public DOM graph renderer and CSS into `shared/article-runtime` while retaining a public compatibility adapter. Commit two adds one admin runtime-preview component, a local reference enhancement, and both admin hosts.

**Tech Stack:** Nuxt 4, Vue 3, TypeScript, Vite, Pinia, Node test runner, `tsx`, and `happy-dom`.

---

## File Map

- Create `shared/article-runtime/recipeHierarchyGraphRenderer.ts`: structural recipe graph types and DOM renderer.
- Create `shared/article-runtime/recipeHierarchyGraph.css`: graph and portal styles based on `--tp-graph-*` variables.
- Modify `front-nuxt/utils/recipeHierarchyGraphRenderer.ts`: public DTO compatibility adapter.
- Modify both `nuxt.config.ts` files: `#article-runtime` alias and shared CSS inclusion.
- Create `data-query-app/utils/articleRuntimePreview.ts`: validation, image policy, identity keys, and a three-slot fetch queue.
- Create `data-query-app/components/article/AdminArticleRuntimePreview.vue`: sanitized runtime HTML host.
- Create `data-query-app/tests/admin-article-runtime-preview.test.mjs`: TypeScript-loaded happy-dom behavioral contract.

### Task 0: Checkpoint the Existing User-Editor Hydration Fix

**Files:**
- Modify `docs/devlog/current.md`
- Create `docs/devlog/entries/2026-07-13-user-article-editor-hydration.md`
- Modify `front-nuxt/components/user/UserArticleRichEditor.vue`

- [ ] **Step 1: Record the isolated task**

Create a compact active entry documenting the two removed unconditional `loadEditorRecipeTreeEmbeds()` calls, their existing branch/worktree, and the required focused checks. Point `current.md` at the entry without changing the admin-preview entry's ownership.

- [ ] **Step 2: Run fresh focused validation**

```bash
cd front-nuxt && pnpm run check:user-article-editor && pnpm exec vue-tsc --noEmit
```

Expected: both exit `0`; the regression fix remains limited to ordinary model synchronization rather than recipe-tree insertion or first render.

- [ ] **Step 3: Close and commit the isolated checkpoint**

Update only the new hydration entry and `current.md` with the results, then run:

```bash
git add front-nuxt/components/user/UserArticleRichEditor.vue docs/devlog/entries/2026-07-13-user-article-editor-hydration.md docs/devlog/current.md
git diff --cached --stat
git commit -m "fix(article-editor): avoid redundant embed hydration"
```

Expected: `data-query-app/utils/articleEditor.ts`, the admin-preview docs, and all shared-runtime paths remain unstaged.

### Task 1: Disposable Alias Spike

**Files:**
- Create then remove `shared/article-runtime/import-spike.ts`
- Create then remove `front-nuxt/utils/articleRuntimeImportSpike.ts`
- Create then remove `data-query-app/utils/articleRuntimeImportSpike.ts`
- Modify then restore both `nuxt.config.ts` files

- [ ] **Step 1: Add temporary exports and imports**

```ts
// shared/article-runtime/import-spike.ts
export const articleRuntimeImportSpike = 'shared-source-resolved'

// each app's temporary utils/articleRuntimeImportSpike.ts
import { articleRuntimeImportSpike } from '#article-runtime/import-spike'
export const importSpike = articleRuntimeImportSpike
```

Add `articleRuntimeDir = fileURLToPath(new URL('../shared/article-runtime', import.meta.url))` and `alias: { '#article-runtime': articleRuntimeDir }` in each Nuxt config. Add it to `vite.server.fs.allow` only if development rejects the outside-root import.

- [ ] **Step 2: Verify the boundary**

Run:

```bash
cd front-nuxt && pnpm run check
cd ../data-query-app && pnpm run check
```

Expected: both exit `0` without an outside-root import error.

- [ ] **Step 3: Remove the spike**

Delete all three temporary files and restore temporary config changes. Record the result in the active devlog. If either check fails, stop before production code and return the local-admin-renderer alternative for a user decision.

### Task 2: RED — Shared Renderer Contract

**Files:**
- Modify `front-nuxt/scripts/check-article-content-references.mjs`
- Modify `front-nuxt/scripts/check-user-article-editor-runtime.mjs`

- [ ] **Step 1: Add failing assertions**

```js
assert(rendererSource.includes('tp-article-runtime-popover'), 'renderer must mark body portals directly')
assert(rendererSource.includes('popoverThemeClass'), 'renderer must accept a host portal theme')
assert(rendererSource.includes('holder.tabIndex = 0'), 'graph nodes must be focusable')
assert(rendererSource.includes("addEventListener('keydown'"), 'graph nodes must support keyboard popover controls')
```

Also require the public wrapper to import `#article-runtime/recipeHierarchyGraphRenderer`.

- [ ] **Step 2: Run RED**

```bash
cd front-nuxt && pnpm run check:article-content-references && pnpm run check:user-article-editor-runtime
```

Expected: fail because the shared module, portal class, and keydown handler do not exist.

### Task 3: GREEN — Shared Runtime and First Commit

**Files:**
- Create `shared/article-runtime/recipeHierarchyGraphRenderer.ts`
- Create `shared/article-runtime/recipeHierarchyGraph.css`
- Modify `front-nuxt/utils/recipeHierarchyGraphRenderer.ts`
- Modify both `nuxt.config.ts` files
- Modify `front-nuxt/pages/articles/[slug].vue`
- Modify `front-nuxt/components/user/UserArticleRichEditor.vue`
- Modify `front-nuxt/assets/css/domains/crafting.css`

- [ ] **Step 1: Define framework-neutral renderer input**

```ts
export type RecipeGraphNode = {
  itemId?: string | number | null
  id?: string | number | null
  displayName?: string | null
  itemNameZh?: string | null
  itemName?: string | null
  itemInternalName?: string | null
  itemImage?: string | null
  itemImageUrl?: string | null
  image?: string | null
  previewImage?: string | null
  quantityText?: string | null
  quantityMin?: string | number | null
  quantityMax?: string | number | null
  quantity?: string | number | null
  amount?: string | number | null
  count?: string | number | null
  resultQuantity?: string | number | null
  nodeType?: string | null
  children?: RecipeGraphNode[]
  stations?: RecipeGraphStation[]
  groupMembers?: RecipeGraphMember[]
  recipeOptions?: RecipeGraphNode[][]
}

export type RecipeHierarchyGraphRendererOptions = {
  roots: RecipeGraphNode[]
  maxDepth: number
  availableWidth: number
  resolveImageUrl: (value: string) => string
  popoverOwner: string
  popoverThemeClass: 'tp-article-runtime-popover--public' | 'tp-article-runtime-popover--admin'
}
```

- [ ] **Step 2: Move existing renderer behavior without geometry changes**

Move existing layout, SVG edge, preview, zoom, and pointer-pan logic into the shared renderer. Preserve current graph classes and dimensions. Replace hardcoded `crafting-screen` with:

```ts
holder.tabIndex = 0
holder.setAttribute('role', 'button')
popover.className = `recipe-hierarchy-popover tp-article-runtime-popover ${options.popoverThemeClass}`
holder.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); show() }
  if (event.key === 'Escape') { event.preventDefault(); hide(); holder.focus() }
})
```

- [ ] **Step 3: Add CSS, adapter, and public host parameters**

Scope graph descendants under `.tp-article-runtime` and portals under `.tp-article-runtime-popover`. Map public tokens on both `.tp-article-runtime--public` and `.tp-article-runtime-popover--public`:

```css
--tp-graph-surface: var(--tp-color-surface);
--tp-graph-border: var(--tp-color-border);
--tp-graph-text: var(--tp-color-text);
--tp-graph-accent: var(--tp-color-accent);
```

Make the public wrapper re-export the shared function with `PublicItemRecipeTreeNode` roots. Register the alias/CSS permanently and pass `popoverThemeClass: 'tp-article-runtime-popover--public'` from the article page and rich editor.

- [ ] **Step 4: Run GREEN and inspect public runtime**

```bash
cd front-nuxt && pnpm run check:article-content-references && pnpm run check:user-article-editor-runtime && pnpm run check
```

Expected: all pass. Inspect `http://localhost:15177/articles/fw` for no overflow, full station previews, SVG edges, pointer/wheel controls, and keyboard Enter/Escape popovers.

- [ ] **Step 5: Commit shared scope only**

```bash
git add shared/article-runtime front-nuxt/nuxt.config.ts data-query-app/nuxt.config.ts front-nuxt/utils/recipeHierarchyGraphRenderer.ts front-nuxt/pages/articles/[slug].vue front-nuxt/components/user/UserArticleRichEditor.vue front-nuxt/assets/css/domains/crafting.css front-nuxt/scripts/check-article-content-references.mjs front-nuxt/scripts/check-user-article-editor-runtime.mjs
git diff --cached --stat
git commit -m "refactor(article-runtime): share recipe graph renderer"
```

Expected: no admin preview component, sanitizer, or unrelated user-editor hydration patch is staged.

### Task 4: RED — Admin Runtime Preview and Test Harness

**Files:**
- Modify `data-query-app/package.json`
- Modify `data-query-app/pnpm-lock.yaml`
- Create `data-query-app/tests/admin-article-runtime-preview.test.mjs`
- Modify `data-query-app/tests/admin-articles-page-contract.test.mjs`

- [ ] **Step 1: Add runnable DOM test dependencies**

```bash
cd data-query-app && pnpm add -D happy-dom tsx
```

Set the unit script to:

```json
"test:unit": "node --import tsx --test tests/*.test.mjs"
```

- [ ] **Step 2: Write the failing DOM test**

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { Window } from 'happy-dom'
import { renderRecipeHierarchyGraph } from '../../shared/article-runtime/recipeHierarchyGraphRenderer.ts'

test('admin graph exposes a themed keyboard popover', () => {
  const window = new Window()
  globalThis.window = window
  globalThis.document = window.document
  globalThis.requestAnimationFrame = callback => callback()
  const graph = renderRecipeHierarchyGraph({
    roots: [{ itemId: 1, displayName: '测试物品', children: [] }],
    maxDepth: 3, availableWidth: 600, resolveImageUrl: value => value,
    popoverOwner: 'admin', popoverThemeClass: 'tp-article-runtime-popover--admin',
  })
  document.body.append(graph)
  const node = graph.querySelector('.recipe-overview-node')
  node.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  assert.equal(document.body.querySelector('.tp-article-runtime-popover--admin')?.classList.contains('is-visible'), true)
  node.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  assert.equal(document.body.querySelector('.tp-article-runtime-popover--admin')?.classList.contains('is-visible'), false)
})
```

Add source contracts requiring `AdminArticleRuntimePreview` in both hosts, a `v-show` editor preview, boss picker values, canonical recipe attributes, and no iframe/public article URL.

Add a queue test with a deferred loader: enqueue four distinct keys, resolve the first three, and assert the fourth loader starts only after one slot is released. Assert two enqueues for the same `itemId:maxDepth` key share one loader call.

- [ ] **Step 3: Run RED**

```bash
cd data-query-app && pnpm run test:unit
```

Expected: fail because the component, helper, host wiring, and boss picker are absent.

### Task 5: GREEN — Admin Component and Second Commit

**Files:**
- Create `data-query-app/utils/articleRuntimePreview.ts`
- Create `data-query-app/components/article/AdminArticleRuntimePreview.vue`
- Modify `data-query-app/utils/articleEditor.ts`
- Modify `data-query-app/composables/useArticleEditor.ts`
- Modify `data-query-app/components/article/ArticleEditorWorkspace.vue`
- Modify `data-query-app/components/article/ArticleReviewWorkspace.vue`

- [ ] **Step 1: Implement validation and queue helpers**

```ts
export const parseRecipeTreeDepth = (value: unknown): number | null => {
  const text = String(value ?? '').trim()
  const depth = Number(text)
  return /^\d+$/.test(text) && Number.isInteger(depth) && depth >= 1 && depth <= 5 ? depth : null
}
export const recipeTreeKey = (itemId: string, maxDepth: number) => `${itemId}:${maxDepth}`
export const MAX_RECIPE_TREE_REQUESTS = 3
```

Use a per-component queue to dedupe keys, start at most three fetches, and reject stale render results by sequence. Reuse `normalizeAdminArticleImageUrl` for preview and reference images.

- [ ] **Step 2: Implement the reusable host**

```ts
const props = withDefaults(defineProps<{
  html: string
  title?: string
  summary?: string
  coverImage?: string
  mode: 'review' | 'editor'
}>(), { title: '', summary: '', coverImage: '' })
```

Render `tp-article-runtime tp-article-runtime--admin`, sanitize `html`, and hydrate after `nextTick`. Batch-resolve valid item/NPC/boss references through `POST /public/content-references/resolve` into accessible non-navigating popovers. Validate recipe attributes, call `itemsStore.fetchItemRecipeTree`, adapt to the shared graph model, and use `popoverThemeClass: 'tp-article-runtime-popover--admin'`. Dispose observers, listeners, and body portals on unmount.

- [ ] **Step 3: Integrate both hosts**

In `articleEditor.ts`, canonicalize valid recipe-tree div attributes and retain boss references. In `useArticleEditor.ts` use:

```ts
type ContentReferenceType = 'item' | 'npc' | 'boss'
const SUPPORTED_REFERENCE_TYPES: ContentReferenceType[] = ['item', 'npc', 'boss']
const types = referenceSearchType.value === 'all' ? 'item,npc,boss' : referenceSearchType.value
```

Add a Boss picker button. Replace editor preview `v-if` with always-mounted `v-show="editor.sidePanel === 'preview'"` and render `AdminArticleRuntimePreview`. Replace review workspace local preview `v-html` with the same component. Map admin variables on both `.tp-article-runtime--admin` and `.tp-article-runtime-popover--admin`.

- [ ] **Step 4: Run GREEN**

```bash
cd data-query-app && pnpm run test:unit && pnpm run check && pnpm run build
cd ../front-nuxt && pnpm run check
```

Expected: all pass; the happy-dom test proves portal theming and keyboard behavior.

- [ ] **Step 5: Runtime acceptance and commit**

With an authorized session, inspect `http://localhost:15174/articles/<id>` using a cover, wide image, item/NPC/boss refs, and recipe tree. Verify image sizing, non-navigating popovers, version/recipe selection, keyboard Enter/Escape, zoom/pan, and preview survival after a reference-panel round trip. Record evidence, then run:

```bash
git add data-query-app/package.json data-query-app/pnpm-lock.yaml data-query-app/tests/admin-article-runtime-preview.test.mjs data-query-app/tests/admin-articles-page-contract.test.mjs data-query-app/utils/articleRuntimePreview.ts data-query-app/components/article/AdminArticleRuntimePreview.vue data-query-app/utils/articleEditor.ts data-query-app/composables/useArticleEditor.ts data-query-app/components/article/ArticleEditorWorkspace.vue data-query-app/components/article/ArticleReviewWorkspace.vue docs/devlog/entries/2026-07-13-admin-article-runtime-preview.md docs/devlog/current.md
git diff --cached --stat
git commit -m "feat(admin-articles): unify runtime preview"
```

Expected: `front-nuxt/components/user/UserArticleRichEditor.vue` remains unstaged.

## Plan Self-Review

- Goal lock: both admin paths receive the exact missing runtime behaviors; save/review/API writes remain out of scope.
- Source chain: sanitizer → component → content-reference resolve/item-tree API → shared graph/host UI; no database or backend mutation occurs.
- Failure continuity: alias failure stops before extraction; every RED check proves missing behavior; unavailable authenticated acceptance is recorded as a blocker, never as a pass.
- Evidence: RED/GREEN checks, both builds, public frontend check, public running-page check, and authenticated admin acceptance prove the real runtime path.
- Commit boundary: Task 0 checkpoints the pre-existing user-editor fix; Task 3 is shared/public only; Task 5 is admin only.
