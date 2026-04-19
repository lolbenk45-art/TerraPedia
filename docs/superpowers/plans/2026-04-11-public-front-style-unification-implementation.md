# Public Front Style Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved `Tiered System` public-front redesign so the public `front` pages inherit the homepage visual language while keeping inner pages content-first.

**Architecture:** The implementation adds a shared public-page shell layer in `front/src/assets/main.css`, then refactors public pages into two template families: `Atlas Workbench` for entity/search pages and `Editorial Ledger` for reading/project pages. Existing API flows stay intact; the work focuses on page structure, shared classes, and page-specific layout polish backed by Vitest shell tests.

**Tech Stack:** Vue 3, TypeScript, Vue Router, Vitest, Vue Test Utils, global CSS tokens in `front/src/assets/main.css`

**Execution note:** The current repository has unrelated in-flight changes in the main workspace. Implement in the current workspace with strict file scope, but defer the per-task `git commit` steps unless the user asks for an isolated cleanup/commit pass after verification.

---

## File Map

### Shared Style Layer

- Modify: `front/src/assets/main.css`
  - Add shared public-shell classes for workbench/editorial pages
  - Add common hero, summary strip, breadcrumb, section frame, pager, media fallback, and editorial body styles

### Workbench Pages

- Modify: `front/src/views/HomeView.vue`
  - Refactor item list page into `Atlas Workbench`
- Modify: `front/src/views/ItemDetailView.vue`
  - Refactor item detail page into standard entity-detail workbench layout
- Modify: `front/src/views/NpcListView.vue`
  - Align existing NPC directory page to the same workbench language
- Modify: `front/src/views/NpcDetailView.vue`
  - Align existing NPC detail page to the same entity-detail shell

### Editorial Pages

- Modify: `front/src/views/ArticleListView.vue`
  - Refactor article index into `Editorial Ledger` list page
- Modify: `front/src/views/ArticleDetailView.vue`
  - Refactor article detail into a restrained editorial reading layout
- Modify: `front/src/views/AboutView.vue`
  - Expand project baseline page into an editorial project dossier

### Tests

- Create: `front/src/tests/public-front-style-shell.spec.ts`
  - Verify shared workbench/editorial shell behavior and key classes
- Modify: `front/src/tests/npc-public-shell.spec.ts`
  - Keep current NPC shell assertions compatible with the unified shell

---

### Task 1: Add shared public shell primitives

**Files:**
- Modify: `front/src/assets/main.css`
- Test: `front/src/tests/public-front-style-shell.spec.ts`

- [ ] **Step 1: Write the failing shared-shell test**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import HomeView from '@/views/HomeView.vue'
import ArticleListView from '@/views/ArticleListView.vue'

const mocks = vi.hoisted(() => ({
  fetchItems: vi.fn(),
  fetchCategories: vi.fn(),
  fetchArticles: vi.fn(),
}))

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api')
  return { ...actual, fetchItems: mocks.fetchItems, fetchCategories: mocks.fetchCategories }
})

vi.mock('@/api/articles', () => ({
  fetchArticles: mocks.fetchArticles,
}))

describe('public front style shell', () => {
  beforeEach(() => {
    mocks.fetchItems.mockResolvedValue({ success: true, data: [], pagination: { total: 0, page: 1, limit: 24, totalPages: 1 } })
    mocks.fetchCategories.mockResolvedValue({ success: true, data: [] })
    mocks.fetchArticles.mockResolvedValue({ items: [], pagination: { total: 0, page: 1, limit: 10, totalPages: 1 } })
  })

  it('renders the item list inside the workbench shell', async () => {
    const wrapper = mount(HomeView, { global: { stubs: ['RouterLink', 'ItemCard', 'VirtualItemGrid', 'CategoryTreeItem', 'MobileCategoryTree', 'ItemSearchInput', 'ErrorState'] } })
    await flushPromises()
    expect(wrapper.find('.public-workbench').exists()).toBe(true)
    expect(wrapper.find('.public-page-hero').exists()).toBe(true)
  })

  it('renders the article list inside the editorial shell', async () => {
    const wrapper = mount(ArticleListView, { global: { stubs: ['RouterLink'] } })
    await flushPromises()
    expect(wrapper.find('.public-editorial').exists()).toBe(true)
    expect(wrapper.find('.public-editorial-hero').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir front test:unit -- public-front-style-shell.spec.ts`

Expected: FAIL because `.public-workbench` and `.public-editorial` classes do not exist yet.

- [ ] **Step 3: Add shared style primitives in `main.css`**

```css
.public-workbench,
.public-editorial {
  position: relative;
  display: grid;
  gap: 1.25rem;
  padding-bottom: 2rem;
}

.public-page-hero,
.public-editorial-hero,
.public-summary-strip,
.public-section-frame {
  border: 1px solid color-mix(in srgb, var(--border-color) 88%, transparent);
  box-shadow: var(--shadow);
}

.public-workbench .public-page-hero {
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--accent-gold) 10%, transparent), transparent 28%),
    linear-gradient(180deg, color-mix(in srgb, white 52%, var(--surface-panel)), var(--surface-panel));
}

.public-editorial .public-editorial-hero {
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--accent-primary) 8%, transparent), transparent 24%),
    linear-gradient(180deg, color-mix(in srgb, white 46%, var(--surface-panel)), var(--surface-panel));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir front test:unit -- public-front-style-shell.spec.ts`

Expected: PASS with 2 passing tests.

- [ ] **Step 5: Commit**

```bash
git add front/src/assets/main.css front/src/tests/public-front-style-shell.spec.ts
git commit -m "feat: add public front shell primitives"
```

### Task 2: Refactor the item workbench pages

**Files:**
- Modify: `front/src/views/HomeView.vue`
- Modify: `front/src/views/ItemDetailView.vue`
- Test: `front/src/tests/public-front-style-shell.spec.ts`

- [ ] **Step 1: Write the failing item workbench tests**

```ts
it('renders the item list as an atlas workbench with summary strip and rail', async () => {
  const wrapper = mount(HomeView, { global: { stubs: ['RouterLink', 'ItemCard', 'VirtualItemGrid', 'CategoryTreeItem', 'MobileCategoryTree', 'ItemSearchInput', 'ErrorState'] } })
  await flushPromises()
  expect(wrapper.find('.item-workbench__summary').exists()).toBe(true)
  expect(wrapper.find('.item-workbench__rail').exists()).toBe(true)
  expect(wrapper.find('.item-workbench__results').exists()).toBe(true)
})

it('renders the item detail as a two-column entity detail shell', async () => {
  const wrapper = mount(ItemDetailView, { global: { stubs: ['RouterLink', 'RecipeFlowChart', 'RecipeTreeBranch'] } })
  await flushPromises()
  expect(wrapper.find('.entity-detail-shell').exists()).toBe(true)
  expect(wrapper.find('.entity-detail-shell__sidebar').exists()).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir front test:unit -- public-front-style-shell.spec.ts`

Expected: FAIL because the item page classes do not exist yet.

- [ ] **Step 3: Refactor `HomeView.vue` to the workbench layout**

```vue
<template>
  <div class="public-workbench item-workbench page-wrap">
    <section class="public-page-hero item-workbench__hero">
      <div class="public-page-hero__copy">
        <span class="section-eyebrow">Atlas Workbench</span>
        <h1 class="section-title">Item Index</h1>
        <p class="section-copy">Search, filter, and traverse the public Terraria item index.</p>
      </div>
      <div class="public-page-hero__meta item-workbench__summary">
        <!-- total items, selected category, sort mode, current page -->
      </div>
    </section>

    <section class="public-summary-strip item-workbench__controls">
      <!-- search, sort, refresh, active filter chips -->
    </section>

    <div class="item-workbench__layout">
      <aside class="public-section-frame item-workbench__rail">
        <!-- existing category tree -->
      </aside>
      <section class="item-workbench__results">
        <!-- existing result summary, grid, pagination -->
      </section>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Refactor `ItemDetailView.vue` to the entity-detail shell**

```vue
<template>
  <div class="public-workbench entity-detail-shell page-wrap">
    <div class="public-breadcrumbs">
      <!-- breadcrumb + back button -->
    </div>

    <section class="public-page-hero entity-detail-shell__hero">
      <!-- existing item media + title + summary + hero stats -->
    </section>

    <section class="entity-detail-shell__content">
      <div class="entity-detail-shell__main">
        <!-- description / detail info / recipes -->
      </div>
      <aside class="entity-detail-shell__sidebar">
        <!-- category path / aggregate metadata -->
      </aside>
    </section>
  </div>
</template>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --dir front test:unit -- public-front-style-shell.spec.ts`

Expected: PASS with item workbench assertions green.

- [ ] **Step 6: Commit**

```bash
git add front/src/views/HomeView.vue front/src/views/ItemDetailView.vue front/src/tests/public-front-style-shell.spec.ts front/src/assets/main.css
git commit -m "feat: restyle public item workbench pages"
```

### Task 3: Align the NPC workbench pages to the shared shell

**Files:**
- Modify: `front/src/views/NpcListView.vue`
- Modify: `front/src/views/NpcDetailView.vue`
- Modify: `front/src/tests/npc-public-shell.spec.ts`
- Test: `front/src/tests/public-front-style-shell.spec.ts`

- [ ] **Step 1: Write the failing NPC shell assertions**

```ts
it('keeps the npc list inside the shared workbench shell', async () => {
  const wrapper = mount(NpcListView, { global: { stubs: { RouterLink: RouterLinkStub } } })
  await flushPromises()
  expect(wrapper.find('.public-workbench').exists()).toBe(true)
  expect(wrapper.find('.npc-workbench__summary').exists()).toBe(true)
})

it('keeps the npc detail inside the shared entity detail shell', async () => {
  const wrapper = mount(NpcDetailView, { global: { stubs: { RouterLink: RouterLinkStub } } })
  await flushPromises()
  expect(wrapper.find('.entity-detail-shell').exists()).toBe(true)
  expect(wrapper.find('.npc-detail-shell__modules').exists()).toBe(true)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --dir front test:unit -- npc-public-shell.spec.ts public-front-style-shell.spec.ts`

Expected: FAIL because the new shared shell classes are not on the NPC pages yet.

- [ ] **Step 3: Refactor the NPC list page to share the item workbench frame**

```vue
<template>
  <div class="public-workbench npc-workbench page-wrap">
    <section class="public-page-hero npc-workbench__hero">
      <!-- title + summary -->
    </section>
    <section class="public-summary-strip npc-workbench__summary">
      <!-- current slice meta -->
    </section>
    <section class="public-section-frame npc-workbench__controls">
      <!-- search + town toggle -->
    </section>
    <section class="npc-workbench__grid">
      <!-- existing npc directory cards -->
    </section>
  </div>
</template>
```

- [ ] **Step 4: Refactor the NPC detail page to share the entity-detail frame**

```vue
<template>
  <div class="public-workbench entity-detail-shell npc-detail-shell page-wrap">
    <div class="public-breadcrumbs">
      <!-- breadcrumb + back -->
    </div>
    <section class="public-page-hero entity-detail-shell__hero">
      <!-- portrait + identity -->
    </section>
    <section class="npc-detail-shell__modules">
      <!-- loot / shop / buffs -->
    </section>
  </div>
</template>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --dir front test:unit -- npc-public-shell.spec.ts public-front-style-shell.spec.ts`

Expected: PASS with the existing NPC behavior and the new shared-shell assertions both green.

- [ ] **Step 6: Commit**

```bash
git add front/src/views/NpcListView.vue front/src/views/NpcDetailView.vue front/src/tests/npc-public-shell.spec.ts front/src/tests/public-front-style-shell.spec.ts front/src/assets/main.css
git commit -m "feat: align public npc pages with shared workbench shell"
```

### Task 4: Refactor the editorial pages

**Files:**
- Modify: `front/src/views/ArticleListView.vue`
- Modify: `front/src/views/ArticleDetailView.vue`
- Modify: `front/src/views/AboutView.vue`
- Test: `front/src/tests/public-front-style-shell.spec.ts`

- [ ] **Step 1: Write the failing editorial tests**

```ts
it('renders the article detail inside the editorial reading shell', async () => {
  const wrapper = mount(ArticleDetailView, { global: { stubs: ['RouterLink'] } })
  await flushPromises()
  expect(wrapper.find('.public-editorial').exists()).toBe(true)
  expect(wrapper.find('.article-ledger__body').exists()).toBe(true)
})

it('renders the about page as an editorial dossier', async () => {
  const wrapper = mount(AboutView)
  await flushPromises()
  expect(wrapper.find('.public-editorial').exists()).toBe(true)
  expect(wrapper.find('.about-dossier__grid').exists()).toBe(true)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --dir front test:unit -- public-front-style-shell.spec.ts`

Expected: FAIL because the article detail and about shell classes do not exist yet.

- [ ] **Step 3: Refactor the article list page**

```vue
<template>
  <div class="public-editorial article-ledger page-wrap">
    <section class="public-editorial-hero article-ledger__hero">
      <!-- copy + search panel -->
    </section>
    <section class="article-ledger__grid">
      <!-- existing article cards -->
    </section>
    <section class="public-pager-shell">
      <!-- existing pager -->
    </section>
  </div>
</template>
```

- [ ] **Step 4: Refactor the article detail and about pages**

```vue
<template>
  <div class="public-editorial article-ledger article-ledger--detail page-wrap page-wrap--narrow">
    <div class="public-breadcrumbs">
      <!-- back -->
    </div>
    <article class="public-section-frame article-ledger__body">
      <!-- cover + title + meta + summary + rendered markdown -->
    </article>
  </div>
</template>
```

```vue
<template>
  <div class="public-editorial about-dossier page-wrap page-wrap--narrow">
    <section class="public-editorial-hero about-dossier__hero">
      <!-- project baseline intro -->
    </section>
    <section class="about-dossier__grid">
      <!-- scope / stack / snapshot / roadmap -->
    </section>
  </div>
</template>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --dir front test:unit -- public-front-style-shell.spec.ts`

Expected: PASS with the editorial shell assertions green.

- [ ] **Step 6: Commit**

```bash
git add front/src/views/ArticleListView.vue front/src/views/ArticleDetailView.vue front/src/views/AboutView.vue front/src/tests/public-front-style-shell.spec.ts front/src/assets/main.css
git commit -m "feat: restyle public editorial pages"
```

### Task 5: Final verification

**Files:**
- Modify: none
- Test: `front/src/tests/public-front-style-shell.spec.ts`
- Test: `front/src/tests/npc-public-shell.spec.ts`

- [ ] **Step 1: Run focused shell tests**

Run: `pnpm --dir front test:unit -- public-front-style-shell.spec.ts npc-public-shell.spec.ts`

Expected: PASS with 0 failures.

- [ ] **Step 2: Run the full front type check**

Run: `pnpm --dir front check`

Expected: exit 0, no TypeScript errors.

- [ ] **Step 3: Run the front build**

Run: `pnpm --dir front build`

Expected: exit 0, Vite production build succeeds.

- [ ] **Step 4: Review visual requirements against the spec**

Checklist:

- [ ] Workbench pages share the same shell
- [ ] Editorial pages share the same shell
- [ ] Navbar/Footer still inherit homepage family
- [ ] Item and NPC detail pages now look like the same product family
- [ ] Article detail is a calmer reading page
- [ ] About is more than two cards plus stats

- [ ] **Step 5: Commit**

```bash
git add front/src/assets/main.css front/src/views/HomeView.vue front/src/views/ItemDetailView.vue front/src/views/NpcListView.vue front/src/views/NpcDetailView.vue front/src/views/ArticleListView.vue front/src/views/ArticleDetailView.vue front/src/views/AboutView.vue front/src/tests/public-front-style-shell.spec.ts front/src/tests/npc-public-shell.spec.ts
git commit -m "feat: unify public front page styles"
```
