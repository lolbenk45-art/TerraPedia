# Approved Public Detail Pages Implementation Plan

> **SUPERSEDED:** Do not execute. Replaced by `2026-07-29-public-pages-fidelity-rebuild.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the approved item, NPC, and article high-fidelity directions into the live Nuxt routes without changing public API contracts or data ownership.

**Architecture:** Keep the existing page-level data loading and SEO contracts. Extract only deterministic presentation models into typed helpers, then layer the approved archive layouts over the live models using a page-domain stylesheet that consumes the established three-theme tokens. Item and NPC remain data-rich entity archives with a sticky facts rail; `/articles` becomes a featured story fold followed by a dense, live-data archive.

**Tech Stack:** Nuxt 4, Vue 3 Composition API, TypeScript, native Node test runner, CSS semantic tokens.

---

## Scope and boundaries

- Routes: `front-nuxt/pages/items/[id].vue`, `front-nuxt/pages/npcs/[id].vue`, and `front-nuxt/pages/articles/index.vue`.
- Design sources: `.superpowers/brainstorm/339185-1785149609/content/item-complete-page-terra-blade-approved-v2.html`, `.superpowers/brainstorm/339185-1785149609/content/npc-complete-page-merchant-v1.html`, and `.superpowers/brainstorm/3542442-1785229764/content/articles-story-led-v22.html`.
- Preserve live API contracts. Do not treat the current traveling-merchant list as a complete Wiki pool, fix recipe quantities, repair images, or change relation-fetch failure behavior.
- Use only `dark`, `morning-paper`, and `warm-slate` semantic token flow. Do not add colors or theme keys in Vue templates.

### Task 1: Define deterministic presentation helpers

**Files:**
- Create: `front-nuxt/utils/detailPagePresentation.ts`
- Create: `front-nuxt/tests/unit/detailPagePresentation.test.mjs`

- [ ] **Step 1: Write failing unit cases for pure derivations**

```js
test('classifies town merchant, traveler, and combat NPC modules', () => {
  assert.deepEqual(resolveNpcArchiveModules({ isTownNpc: true, shopCount: 3 }), ['residence', 'shop'])
  assert.deepEqual(resolveNpcArchiveModules({ name: '旅商', shopCount: 3 }), ['arrival', 'shop'])
  assert.deepEqual(resolveNpcArchiveModules({ lootCount: 1 }), ['loot'])
})

test('splits a live article list into one feature and archive rows', () => {
  const { featured, archive } = splitFeaturedArticleList([{ id: 1 }, { id: 2 }])
  assert.equal(featured.id, 1)
  assert.deepEqual(archive.map(({ id }) => id), [2])
})
```

- [ ] **Step 2: Verify the new test fails**

Run: `cd front-nuxt && node --test tests/unit/detailPagePresentation.test.mjs`

Expected: failure because `detailPagePresentation.ts` does not exist.

- [ ] **Step 3: Add the minimal typed helper exports**

```ts
export const splitFeaturedArticleList = <T>(articles: T[]) => ({
  featured: articles[0] ?? null,
  archive: articles.slice(1),
})

export const resolveNpcArchiveModules = (input: { isTownNpc?: boolean, name?: string, shopCount?: number, lootCount?: number }) => {
  const modules: string[] = []
  if (input.isTownNpc) modules.push('residence')
  if (/旅商|traveling merchant/i.test(input.name || '')) modules.push('arrival')
  if (input.lootCount) modules.push('loot')
  if (input.shopCount) modules.push('shop')
  return modules
}
```

- [ ] **Step 4: Verify helper cases pass**

Run: `cd front-nuxt && node --test tests/unit/detailPagePresentation.test.mjs`

Expected: PASS with zero failures.

### Task 2: Add token-driven archive presentation layer

**Files:**
- Create: `front-nuxt/assets/css/domains/detail-pages-redesign.css`
- Modify: `front-nuxt/assets/css/domains/index.css`

- [ ] **Step 1: Add structural contract assertions before style implementation**

Extend `front-nuxt/scripts/check-detail-layout-contract.mjs` with exact markers for `.tp-archive-hero`, `.tp-archive-rail`, and `.article-library-shell`.

- [ ] **Step 2: Run the contract and verify it fails**

Run: `cd front-nuxt && pnpm run check:detail-layout`

Expected: failure naming the three missing redesign markers.

- [ ] **Step 3: Implement semantic CSS and load it from the domain index**

Use `var(--tp-color-*)`, `var(--text-*)`, `var(--index-*)`, and existing shared controls. Implement desktop sticky rails, dense archive modules, 44px action targets, and mobile single-column collapse without raw page palette values.

- [ ] **Step 4: Re-run the layout contract**

Run: `cd front-nuxt && pnpm run check:detail-layout`

Expected: PASS.

### Task 3: Integrate item archive presentation

**Files:**
- Modify: `front-nuxt/pages/items/[id].vue`

- [ ] **Step 1: Add a failing item presentation marker to the layout contract**

Assert `item-archive-page`, `item-archive-hero`, and `item-archive-rail` in `front-nuxt/scripts/check-detail-layout-contract.mjs`.

- [ ] **Step 2: Verify contract failure**

Run: `cd front-nuxt && pnpm run check:detail-layout`

Expected: failure naming the missing item archive markers.

- [ ] **Step 3: Recompose the existing live fields**

Keep current loading, error, favorite, recipe, sources, and coverage behavior. Present primary item image, identity, status chips, core stats and price in the approved two-column hero, keep recipe/tree and source modules in the content column, and place current coverage/facts in the sticky rail.

- [ ] **Step 4: Verify item layout contract**

Run: `cd front-nuxt && pnpm run check:detail-layout`

Expected: PASS.

### Task 4: Integrate capability-driven NPC archive presentation

**Files:**
- Modify: `front-nuxt/pages/npcs/[id].vue`
- Modify: `front-nuxt/tests/unit/detailPagePresentation.test.mjs`

- [ ] **Step 1: Add a failing capability-model assertion**

```js
assert.deepEqual(resolveNpcArchiveModules({ name: '旅商', shopCount: 35 }), ['arrival', 'shop'])
```

- [ ] **Step 2: Verify it fails before template integration**

Run: `cd front-nuxt && node --test tests/unit/detailPagePresentation.test.mjs`

Expected: failure until the helper recognizes the travel-merchant condition.

- [ ] **Step 3: Recompose the live NPC aggregate**

Keep current `loot,shop,buffs` aggregate request and all item paths. Use the approved portrait-and-facts hero and sticky rail. Render residence only for town NPCs, arrival context only for traveling merchants, shop only when entries exist, and omit unavailable modules. Label current traveling-merchant entries as the available live shop data rather than a complete Wiki pool.

- [ ] **Step 4: Run helper and layout checks**

Run: `cd front-nuxt && node --test tests/unit/detailPagePresentation.test.mjs && pnpm run check:detail-layout`

Expected: both PASS.

### Task 5: Integrate featured article fold and dense archive

**Files:**
- Modify: `front-nuxt/pages/articles/index.vue`
- Modify: `front-nuxt/scripts/check-public-pages.mjs`

- [ ] **Step 1: Add failing static page-contract markers**

Require `article-featured-story`, `article-library-shell`, and `article-archive-row` in `check-public-pages.mjs`.

- [ ] **Step 2: Verify it fails**

Run: `cd front-nuxt && pnpm run check:public-pages`

Expected: failure naming the missing approved article markers.

- [ ] **Step 3: Use live pagination data for the approved hierarchy**

Use `splitFeaturedArticleList(articles)` to present the first returned published article as the feature and remaining results as compact archive rows. Retain loading/error/empty/retry/pagination behavior and real metadata. Do not invent themes or static articles; topic controls are non-filtering archive descriptors until an API facet contract exists.

- [ ] **Step 4: Verify the public page contract**

Run: `cd front-nuxt && pnpm run check:public-pages`

Expected: PASS.

### Task 6: Validate the integrated routes

**Files:**
- Modify: `docs/devlog/entries/2026-07-27-detail-pages-redesign-hifi.md`
- Modify: `docs/devlog/current.md`

- [ ] **Step 1: Run targeted validation**

Run: `cd front-nuxt && node --test tests/unit/detailPagePresentation.test.mjs && pnpm run check:detail-layout && pnpm run check:public-pages && pnpm run check:visual-system`

Expected: zero failures.

- [ ] **Step 2: Run the full maintained public frontend gate**

Run: `cd front-nuxt && pnpm run check`

Expected: exit code 0.

- [ ] **Step 3: Inspect all three routes in a running stack**

At `1440px` and `390px`, verify one item, town NPC, traveling NPC, and `/articles` have no horizontal overflow, broken images, console/request errors, unreadable text, or sub-44px interactive controls.

- [ ] **Step 4: Record only durable handoff state**

Update the active detail-page devlog with validation evidence, explicit excluded data defects, and any runtime limitation. Keep `current.md` concise and do not alter unrelated reports or existing design artifacts.
