# Front Home Search-First A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the public home page into a search-first, four-core-entry, stage-separated landing experience without adding backend data dependencies.

**Architecture:** Keep `pages/index.vue` as the thin page shell and keep `useHomeData()` as the single home payload source. Change home contracts first, then update the home data payload, home components, and home CSS so the runtime order is title/lede -> search -> four primary entries -> stage navigation -> secondary entries. Existing `/statistics/overview` remains the only dynamic home API source.

**Tech Stack:** Nuxt 4, Vue 3 SFCs, CSS in `hifi-preview.css` / `light-theme-contrast-fixes.css` / `mobile-typography-fixes.css`, Node contract scripts, Chromium visual checks.

---

## Scope

### In Scope

- `front-nuxt/scripts/check-home-j1-index.mjs`
- `front-nuxt/scripts/check-public-pages.mjs`
- `front-nuxt/composables/useHomeData.ts`
- `front-nuxt/components/home/HomeHero.vue`
- `front-nuxt/components/home/HomeExplorationMap.vue`
- `front-nuxt/components/home/HomeFeaturedRoute.vue`
- `front-nuxt/components/home/HomeBossProgression.vue`
- `front-nuxt/components/home/HomeCodexBand.vue`
- `front-nuxt/assets/css/hifi-preview.css`
- `front-nuxt/assets/css/light-theme-contrast-fixes.css`
- `front-nuxt/assets/css/mobile-typography-fixes.css`

### Out Of Scope

- No new backend endpoint.
- No new database query, crawler, import, cache refresh, or data backfill.
- No conversion of static featured route, Boss loot images, NPC count, Buff count, article count, or route count into live dynamic data.
- No global navigation rewrite.
- No item/Boss/NPC/article list filtering work.
- Do not mix this work with the existing uncommitted nav active/unread styling changes unless the user explicitly asks to combine commits.

## User-Visible Closure Definition

The home page is complete when the user can open `/` and immediately understand:

- The first action is search.
- The next choice is one of four core channels: `物品`, `Boss`, `NPC`, `攻略`.
- Stage/progression browsing is a separate lower-priority path, not mixed with content-type navigation.
- Secondary links still exist, but no longer visually compete with search and the four core entries.
- The Boss strip has an obvious action to enter `/bosses`.
- On mobile, the first screen is not consumed by atlas/status/decoration before the search path appears.

## Hard Acceptance Rules

- DOM order in `HomeHero.vue`: `.hero-j1-lede` before `.hero-j1-search`; `.hero-j1-search` before `.hero-j1-grid`; `.hero-j1-grid` before stage navigation; stage navigation before `.hero-j1-paths`.
- `.hero-status-line` and `.hero-left` must not appear before `.hero-j1-search` in the template.
- `primaryEntries` renders exactly four `.hero-j1-cell` anchors.
- `secondaryLinks` keeps these six routes in the home audit text: `/categories`, `/crafting`, `/biomes`, `/buffs`, `/armor-sets`, `/projectiles`.
- Secondary links must be visually lower weight than `.hero-j1-cell` and must come after search and primary entries.
- `HomeBossProgression.vue` renders a visible anchor with class `boss-route-cta` and `href="/bosses"`.
- `useHomeData.ts` must contain exactly one home dynamic API target: `/statistics/overview`.
- No new `usePublicApiFetch(` call may be added to `useHomeData.ts`.
- Mobile home hero must not rely on a fixed `atlas-index` width and must keep atlas outside the primary mobile first-screen flow.

## Task 0: Pre-Flight Hygiene

**Files:**
- Read-only: repository state

- [ ] **Step 1: Record current git state**

Run:

```bash
git status --short -uall
```

Expected: existing nav styling/doc changes may be present. Do not revert them. Do not stage them as part of this home task unless explicitly instructed.

- [ ] **Step 2: Confirm existing home contracts before changing them**

Run:

```bash
cd front-nuxt
node scripts/check-home-j1-index.mjs
pnpm run check:public-pages
```

Expected: both pass before starting, or fail only because of unrelated existing local edits. If they fail, capture the exact failure lines and repair the plan before touching home implementation files.

## Task 1: Write Contract Red Tests For Search-First Home

**Files:**
- Modify: `front-nuxt/scripts/check-home-j1-index.mjs`
- Modify: `front-nuxt/scripts/check-public-pages.mjs`

- [ ] **Step 1: Add DOM-order assertions to `check-home-j1-index.mjs`**

Add helper logic near the existing `heroPanelIndex` / `indexPanelIndex` checks:

```js
const assertOrder = (content, earlier, later, message) => {
  const earlierIndex = content.indexOf(earlier)
  const laterIndex = content.indexOf(later)

  if (earlierIndex === -1 || laterIndex === -1 || earlierIndex > laterIndex) {
    failures.push(`${pagePath}: ${message}`)
  }
}

assertOrder(homeHero, 'class="hero-j1-lede"', 'class="hero-j1-search"', 'home search must appear directly after title and lede content')
assertOrder(homeHero, 'class="hero-j1-search"', 'class="hero-j1-grid"', 'home search must come before the four primary entry cards')
assertOrder(homeHero, 'class="hero-j1-grid"', 'class="tag-row hero-stage-chips"', 'primary entries must come before stage navigation')
assertOrder(homeHero, 'class="tag-row hero-stage-chips"', 'class="hero-j1-paths"', 'stage navigation must come before secondary shortcuts')

if (homeHero.indexOf('class="hero-status-line"') !== -1 && homeHero.indexOf('class="hero-status-line"') < homeHero.indexOf('class="hero-j1-search"')) {
  failures.push(`${pagePath}: status signals must not appear before the primary search control`)
}

if (homeHero.indexOf('class="hero-left"') !== -1 && homeHero.indexOf('class="hero-left"') < homeHero.indexOf('class="hero-j1-search"')) {
  failures.push(`${pagePath}: atlas index must not precede the primary search control`)
}
```

- [ ] **Step 2: Add primary/secondary count and route assertions**

In `check-home-j1-index.mjs`, add:

```js
const primaryEntryCount = homeData.match(/\{\s*label:\s*'[^']+',\s*href:\s*'\/(?:items|bosses|npcs|articles)'/g)?.length ?? 0
if (primaryEntryCount !== 4) {
  failures.push(`${homeDataPath}: home primary entries must contain exactly four core channels`)
}

const secondaryRouteCount = ['/categories', '/crafting', '/biomes', '/buffs', '/armor-sets', '/projectiles']
  .filter((route) => homeAuditContent.includes(route))
  .length
if (secondaryRouteCount !== 6) {
  failures.push(`${pagePath}: home secondary shortcuts must keep all six low-priority resource routes`)
}
```

- [ ] **Step 3: Add backend-boundary assertion**

In `check-home-j1-index.mjs`, add:

```js
const publicFetchTargets = [...homeData.matchAll(/usePublicApiFetch<[^>]+>\('([^']+)'\)/g)].map((match) => match[1])
if (publicFetchTargets.length !== 1 || publicFetchTargets[0] !== '/statistics/overview') {
  failures.push(`${homeDataPath}: home A plan must keep /statistics/overview as the only dynamic home API source`)
}
```

- [ ] **Step 4: Add Boss CTA assertion**

In `check-home-j1-index.mjs`, read `components/home/HomeBossProgression.vue` and add:

```js
const bossProgressionPath = 'components/home/HomeBossProgression.vue'
const bossProgression = readFileSync(file(bossProgressionPath), 'utf8')

if (!bossProgression.includes('class="boss-route-cta"') || !bossProgression.includes(':href="route.href"')) {
  failures.push(`${bossProgressionPath}: home Boss strip must render an auditable CTA bound to route.href`)
}

if (!homeData.includes("href: '/bosses'")) {
  failures.push(`${homeDataPath}: bossRoute must expose href: '/bosses' for the home Boss CTA`)
}
```

- [ ] **Step 5: Replace old public-page constraints that block A**

In `check-public-pages.mjs`, update the home CSS checks so they no longer require the old `min-height: 720px` home hero lockup. Replace that check with markers for the new search-first contract:

```js
for (const marker of [
  '.hero-j1-search',
  '.hero-j1-grid',
  '.hero-stage-chips',
  '.hero-j1-paths',
  '.boss-route-cta',
  '.home-atlas-secondary',
]) {
  if (!content.includes(marker)) {
    violations.push(`${path}: home A search-first visual system must include ${marker}`)
  }
}

if (content.includes('.hero { min-height: 720px;')) {
  violations.push(`${path}: home A search-first layout must not keep the old fixed 720px hero lockup`)
}
```

Use the exact local structure of the existing check block; do not duplicate `const content` scopes.

- [ ] **Step 6: Verify red**

Run:

```bash
cd front-nuxt
node scripts/check-home-j1-index.mjs
pnpm run check:public-pages
```

Expected: fail because current `HomeHero.vue` still puts status/primary/stage before search and `HomeBossProgression.vue` has no `boss-route-cta`.

## Task 2: Update `useHomeData.ts` Payload Boundaries

**Files:**
- Modify: `front-nuxt/composables/useHomeData.ts`

- [ ] **Step 1: Keep the dynamic source unchanged**

Do not add any new `usePublicApiFetch` call. Keep:

```ts
const response = await usePublicApiFetch<HomeStats>('/statistics/overview')
```

- [ ] **Step 2: Keep four primary entries and reduce count-like claims where static**

Keep `primaryEntries` as exactly:

```ts
const primaryEntries = computed(() => [
  { label: '物品', href: '/items', icon: 'icon-items', desc: '查装备、材料、掉落', count: itemTotalLabel.value, hex: '255,215,101' },
  { label: 'Boss', href: '/bosses', icon: 'icon-boss', desc: '看前置、阶段、战利品', count: '路线', hex: '224,126,85' },
  { label: 'NPC', href: '/npcs', icon: 'icon-npc', desc: '找城镇角色和敌怪', count: '图鉴', hex: '126,178,120' },
  { label: '攻略', href: '/articles', icon: 'icon-article', desc: '按阶段和机制阅读', count: '专题', hex: '217,185,91' },
])
```

- [ ] **Step 3: Keep `progressionStages` name unless all contracts are updated**

In the returned `hero` object, keep the prop key as `progressionStages` to minimize template and contract churn:

```ts
progressionStages: [
  { label: '新手开荒', href: '/articles?stage=early', tone: 'moss' },
  { label: 'Boss 前置', href: '/articles?stage=boss-prep', tone: 'gold' },
  { label: '困难模式', href: '/articles?stage=hardmode', tone: 'paper' },
  { label: '月后整理', href: '/articles?stage=post-moon', tone: 'paper' },
],
```

- [ ] **Step 4: Keep six secondary links but lower their semantic copy**

Use copy that clearly reads as secondary utility links:

```ts
secondaryLinks: [
  { label: '分类', href: '/categories', icon: 'icon-category', desc: '类型索引' },
  { label: '制作', href: '/crafting', icon: 'icon-crafting', desc: '合成链路' },
  { label: '生态', href: '/biomes', icon: 'icon-biome', desc: '群落资源' },
  { label: 'Buff', href: '/buffs', icon: 'icon-buff', desc: '状态效果' },
  { label: '套装', href: '/armor-sets', icon: 'icon-armor', desc: '防具路线' },
  { label: '射弹', href: '/projectiles', icon: 'icon-projectile', desc: '弹道行为' },
],
```

- [ ] **Step 5: Add `href` to Boss route**

Change `bossRoute` to include:

```ts
bossRoute: {
  href: '/bosses',
  title: 'Boss 推进路线',
  desc: '从战前准备、触发条件到关键掉落，按阶段进入 Boss 资料。',
  // existing stages and lootImages remain
}
```

- [ ] **Step 6: Adjust lower-section copy to reduce duplication**

Update `explorationNodes` so it only expresses stages/progression. Keep existing image paths and routes, but remove category-like labels such as `物品图鉴` or `资料手札` from the exploration map. Recommended node titles:

```ts
title: '开荒入口'
title: '装备成型'
title: '困难模式'
title: '生态探索'
title: '专题路线'
```

## Task 3: Reorder `HomeHero.vue`

**Files:**
- Modify: `front-nuxt/components/home/HomeHero.vue`

- [ ] **Step 1: Move search directly after lede**

In the template, put the `<form class="hero-j1-search">...</form>` immediately after:

```vue
<p class="hero-j1-lede">
  {{ lede }}
</p>
```

The `hero-status-line`, primary grid, stage chips, and secondary paths must come after the search form.

- [ ] **Step 2: Keep the existing search behavior**

Do not change:

```ts
const submitHomeSearch = () => {
  const keyword = homeSearchQuery.value.trim()

  if (!keyword) {
    return navigateTo('/search')
  }

  return navigateTo(`/search?keyword=${encodeURIComponent(keyword)}`)
}
```

- [ ] **Step 3: Keep four primary entry anchors rendered by the existing v-for**

Keep:

```vue
<nav class="hero-j1-grid" aria-label="核心资料入口">
  <a
    v-for="entry in primaryEntries"
    :key="entry.href"
    class="hero-j1-cell"
    :href="entry.href"
    :style="`--entry-accent: ${entry.hex}`"
  >
```

- [ ] **Step 4: Change stage block copy to explicit progress browsing**

Keep the class contract, but make the label clearer:

```vue
<nav class="tag-row hero-stage-chips" aria-label="按游戏进度找下一步">
```

- [ ] **Step 5: Move status signals after secondary links or below the hero panel**

Keep `.hero-status-line`, but place it after `.hero-j1-paths`. It should no longer appear before search.

- [ ] **Step 6: Mark atlas as secondary**

Add a class to the atlas aside:

```vue
<aside class="hero-left home-atlas-secondary" aria-label="公共资料索引概览">
```

This class is used by CSS and contract checks to lower atlas priority.

## Task 4: Add Boss CTA And Clarify Lower Modules

**Files:**
- Modify: `front-nuxt/components/home/HomeBossProgression.vue`
- Modify: `front-nuxt/components/home/HomeExplorationMap.vue`
- Modify: `front-nuxt/components/home/HomeFeaturedRoute.vue`
- Modify: `front-nuxt/components/home/HomeCodexBand.vue`

- [ ] **Step 1: Add `href` to Boss route type**

In `HomeBossProgression.vue`, change the route prop type:

```ts
route: {
  href: string
  title: string
  desc: string
  stages: Array<{
    index: string
    label: string
  }>
  lootImages: string[]
}
```

- [ ] **Step 2: Add visible Boss CTA**

Inside `.boss-copy`, after `.boss-route`, add:

```vue
<a class="boss-route-cta" :href="route.href">查看 Boss 路线</a>
```

- [ ] **Step 3: Clarify exploration map heading**

In `HomeExplorationMap.vue`, use:

```vue
<span class="eyebrow">进度路径</span>
<h2 id="exploration-map-title">
  不知道下一步时，按阶段浏览
</h2>
<p>从开荒、装备成型、困难模式到专题路线，把资料入口按游玩进度排好。</p>
```

- [ ] **Step 4: Keep featured route as recommendation only**

In `HomeFeaturedRoute.vue`, keep `featured-route-cta` and adjust heading copy only if needed:

```vue
<span class="eyebrow">推荐路线</span>
<h2>一条可直接进入的装备推进路线</h2>
```

- [ ] **Step 5: Keep Codex actions but reduce repeated stage language**

In `HomeCodexBand.vue`, keep `.codex-actions a`. Change `eyebrow` to:

```vue
<span class="eyebrow">攻略专题</span>
```

Do not remove `codex-actions`, because existing public-page contracts expect article action links.

## Task 5: CSS Search-First Layout

**Files:**
- Modify: `front-nuxt/assets/css/hifi-preview.css`
- Modify: `front-nuxt/assets/css/light-theme-contrast-fixes.css`
- Modify: `front-nuxt/assets/css/mobile-typography-fixes.css`

- [ ] **Step 1: Raise search priority**

In `.hero-j1-search`, increase visual priority without making it a heavy block:

```css
.hero-j1-search {
  min-height: 60px;
  border-color: rgba(240, 207, 116, 0.2);
  background:
    linear-gradient(90deg, rgba(217, 185, 91, 0.075), transparent 64%),
    var(--index-grid-x),
    var(--index-grid-y),
    rgba(3, 9, 5, 0.56);
}
```

Preserve focus styles and `min-height >= 44px` for the submit button.

- [ ] **Step 2: Keep primary entries stronger than secondary links**

Keep `.hero-j1-cell` larger than `.hero-j1-path-link`. Secondary links should stay under 44px min height only if touch targets remain at least 44px through padding/line box. Prefer:

```css
.hero-j1-path-link {
  min-height: 40px;
  opacity: 0.88;
}
```

If this causes touch target issues in visual checks, use `min-height: 44px`.

- [ ] **Step 3: Lower atlas weight on desktop**

For `.home-atlas-secondary .atlas-index`, reduce shadow and visual dominance:

```css
.home-atlas-secondary .atlas-index {
  box-shadow:
    0 20px 52px rgba(0, 0, 0, 0.28),
    inset 0 1px 0 rgba(255,255,255,0.05);
}
```

Do not restore fixed width. Keep `width: min(560px, 100%)`.

- [ ] **Step 4: Move atlas out of mobile first-screen flow**

In the `@media (max-width: 720px)` home section, add:

```css
.home-atlas-secondary {
  display: none;
}
```

This is acceptable because the primary home paths remain search, four core entries, stage chips, and secondary links.

- [ ] **Step 5: Replace old fixed hero lockup**

Update `.hero` and mobile `.hero` rules so the page no longer depends on the old fixed `min-height: 720px` lockup. Recommended direction:

```css
.hero {
  min-height: auto;
  padding: 30px 42px 56px;
}

.hero-grid {
  min-height: min(620px, calc(100dvh - 96px));
}
```

On mobile:

```css
.hero {
  padding: 34px 18px 42px;
}

.hero-grid {
  gap: 18px;
}
```

Adjust exact values only after runtime screenshots.

- [ ] **Step 6: Update light theme search and atlas rules**

In `light-theme-contrast-fixes.css`, ensure `.hero-j1-search`, `.hero-j1-cell`, `.hero-j1-path-link`, and `.home-atlas-secondary .atlas-index` have distinct light-theme surfaces. The search surface should be more prominent than secondary links but less heavy than primary action buttons.

## Task 6: Runtime Home Smoke Script Or Manual CDP Check

**Files:**
- Prefer modify/create only if the repo already has a suitable script pattern:
  - Optional create: `front-nuxt/scripts/check-home-search-first-runtime.mjs`

- [ ] **Step 1: If adding a script, use existing CDP style**

Follow the pattern in `front-nuxt/scripts/check-visual-regression.mjs`. The runtime check should navigate to `/` and assert:

```js
const metrics = [...document.querySelectorAll('.hero-j1-search, .hero-j1-cell, .hero-j1-path-link, .hero-left, .boss-route-cta')]
  .map((element) => {
    const rect = element.getBoundingClientRect()
    return {
      selector: element.className,
      text: element.textContent?.trim(),
      top: rect.top,
      height: rect.height,
      visible: rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight,
    }
  })
```

Assert at `390x844`, `768x1024`, `1440x1000`:

- `.hero-j1-search` exists and is visible.
- `.hero-j1-search` top is less than `window.innerHeight * 0.45`.
- There are exactly four `.hero-j1-cell` anchors.
- `.boss-route-cta` exists and links to `/bosses`.
- At `390x844`, `.home-atlas-secondary` is not visible.
- `document.documentElement.scrollWidth <= document.documentElement.clientWidth`.

- [ ] **Step 2: Verify search interaction**

In the same runtime script or a one-off CDP check:

```js
const input = document.querySelector('#home-hero-search')
input.value = '  泰拉刃  '
input.dispatchEvent(new Event('input', { bubbles: true }))
document.querySelector('.hero-j1-search').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
```

Expected navigation target:

```text
/search?keyword=%E6%B3%B0%E6%8B%89%E5%88%83
```

Also verify empty query submits to `/search`.

## Task 7: Verification

**Files:**
- Read-only verification

- [ ] **Step 1: Run focused home contracts**

Run:

```bash
cd front-nuxt
node scripts/check-home-j1-index.mjs
pnpm run check:public-pages
```

Expected: both pass.

- [ ] **Step 2: Run visual and layout contracts**

Run:

```bash
cd front-nuxt
pnpm run check:visual-system
pnpm run check:front-layout-layering
```

Expected: both pass.

- [ ] **Step 3: Run typecheck**

Run:

```bash
cd front-nuxt
pnpm exec nuxt typecheck
```

Expected: exit 0. Existing Node `DEP0205` warning may appear and is not a failure.

- [ ] **Step 4: Run visual regression**

Run with the existing local Nuxt server or start it if needed:

```bash
cd front-nuxt
pnpm run check:visual
```

Required screenshot matrix for manual review if failures or ambiguity remain:

- Route: `/`
- Themes: `dark`, `morning-paper`, `warm-slate`
- Viewports: `390x844`, `768x1024`, `1440x1000`, `1728x1050`
- States: initial page, search focused, Chinese query typed before submit

- [ ] **Step 5: Run diff hygiene**

Run:

```bash
git diff --check
git status --short -uall
```

Expected: no whitespace errors. Status should contain only home A implementation files plus any pre-existing unrelated nav files.

## Multi-Agent Execution Split

Use subagents only if implementing this plan in a follow-up turn and the user explicitly asks for multi-agent execution.

- Agent 1, contracts owner:
  - `front-nuxt/scripts/check-home-j1-index.mjs`
  - `front-nuxt/scripts/check-public-pages.mjs`
- Agent 2, data/template owner:
  - `front-nuxt/composables/useHomeData.ts`
  - `front-nuxt/components/home/HomeHero.vue`
  - `front-nuxt/components/home/HomeBossProgression.vue`
- Agent 3, lower modules/CSS owner:
  - `front-nuxt/components/home/HomeExplorationMap.vue`
  - `front-nuxt/components/home/HomeFeaturedRoute.vue`
  - `front-nuxt/components/home/HomeCodexBand.vue`
  - `front-nuxt/assets/css/hifi-preview.css`
  - `front-nuxt/assets/css/light-theme-contrast-fixes.css`
  - `front-nuxt/assets/css/mobile-typography-fixes.css`

No two agents may edit the same file. If a contract change forces a CSS selector rename, pause and reconcile before continuing.

## Residual Risks

- Existing uncommitted nav styling changes are outside this plan. Keep them out of the home A commit unless the user explicitly combines scopes.
- `check:visual` may require a running Nuxt dev server and Chromium availability. If it cannot run, capture the exact blocker and perform a CDP-focused home check before claiming completion.
- This plan intentionally does not solve dynamic home data. If the user asks for true NPC/Boss/Buff/article counts or dynamic featured routes, start a separate data/API plan.
