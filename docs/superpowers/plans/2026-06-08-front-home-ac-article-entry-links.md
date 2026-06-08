# AC Home Article Entry Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AC homepage progress path, recommended route, and codex blocks enter real published article pages instead of empty keyword searches or static display rows.

**Superseded content note:** This plan originally mapped the homepage to existing published articles. The follow-up requirement changed the target: homepage entries must use newly written homepage-specific articles, not previously written content. The active content plan is `docs/superpowers/plans/2026-06-08-front-home-ac-original-articles.md`.

**Architecture:** Keep the current AC homepage layout and the single `/statistics/overview` homepage data fetch. The homepage data remains static for editorial links, but every highlighted article entry points to a verified published `/articles/<slug>` route. Components render row-level anchors where the data object provides `href`.

**Tech Stack:** Nuxt 4, Vue 3 `<script setup>`, existing TerraPedia public article routes, existing Node static contract script.

---

## Source And Constraints

- Homepage data source stays in `front-nuxt/composables/useHomeData.ts`.
- Runtime article detail route is `front-nuxt/pages/articles/[slug].vue`, public URL `/articles/<slug>`.
- No database writes in this task.
- No B homepage layout work.
- No new article publishing in this task because the existing published article set covers these homepage entry points.
- Avoid `guide-true-nights-edge-demo` as a homepage recommendation because its summary marks it as a demo.
- Avoid `wechat-writer-opt-20260324161901` because its title and summary are garbled.
- Avoid empty keyword destinations for the highlighted lower homepage blocks.

## Verified Published Article Slugs

- `starter-life-crystal-guide-npc-flow-2026-06-07`
- `pre-hardmode-armor-choice-by-role-2026-06-07`
- `hardmode-ore-tier-mining-route-2026-06-07`
- `queen-bee-jungle-boss-resource-loop-2026-06-07`
- `goblin-army-tinkerer-unlock-2026-06-07`
- `boots-upgrade-route-frostspark-2026-06-07`
- `fishing-resource-loop-potion-bobber-2026-06-07`
- `early-boss-prep-slime-cthulhu-2026-06-07`
- `meteorite-resource-planning-2026-06-07`
- `underworld-lava-preparation-checklist-2026-06-07`

## Article Mapping

Progress path:
- `开荒入口` -> `/articles/starter-life-crystal-guide-npc-flow-2026-06-07`
- `装备成型` -> `/articles/pre-hardmode-armor-choice-by-role-2026-06-07`
- `困难模式` -> `/articles/hardmode-ore-tier-mining-route-2026-06-07`
- `生态探索` -> `/articles/queen-bee-jungle-boss-resource-loop-2026-06-07`
- `专题路线` -> `/articles/goblin-army-tinkerer-unlock-2026-06-07`

Recommended route:
- Main card -> `/articles/pre-hardmode-armor-choice-by-role-2026-06-07`
- Row 1 -> `/articles/hardmode-ore-tier-mining-route-2026-06-07`
- Row 2 -> `/articles/early-boss-prep-slime-cthulhu-2026-06-07`
- Row 3 -> `/articles/underworld-lava-preparation-checklist-2026-06-07`

Codex:
- Action chips and route rows use real article URLs.
- Notes use real article URLs for route, resource loop, and event explanation.

## Files

- Modify: `front-nuxt/composables/useHomeData.ts`
- Modify: `front-nuxt/components/home/HomeFeaturedRoute.vue`
- Modify: `front-nuxt/components/home/HomeCodexBand.vue`
- Modify: `front-nuxt/assets/css/hifi-preview.css`
- Modify: `front-nuxt/scripts/check-home-j1-index.mjs`

## Task 1: Static Contract First

- [x] **Step 1: Add homepage article slug assertions**

In `front-nuxt/scripts/check-home-j1-index.mjs`, assert that `useHomeData.ts` contains every required homepage article slug listed above.

- [x] **Step 2: Add component anchor assertions**

In the same script, assert:
- `HomeFeaturedRoute.vue` accepts `href?: string` on `route.list`.
- `HomeFeaturedRoute.vue` renders row anchors with `:href="item.href"`.
- `HomeCodexBand.vue` accepts `href: string` on `codex.routes` and `codex.notes`.
- `HomeCodexBand.vue` renders route and note anchors.

- [x] **Step 3: Verify RED**

Run:

```bash
pnpm --dir front-nuxt exec node scripts/check-home-j1-index.mjs
```

Expected before implementation: FAIL because row anchors and required direct slug links are missing.

Actual: failed on missing required article slugs, unsupported lower-home keyword markers, missing featured route row anchors, and missing codex anchors.

## Task 2: Data Mapping

- [x] **Step 1: Replace lower homepage highlighted links**

Update `front-nuxt/composables/useHomeData.ts` so progress nodes, recommended route, recommended rows, codex actions, codex routes, and codex notes point to the verified article slugs.

- [x] **Step 2: Align text with destination articles**

Replace stale text such as “月亮领主近战推进路线” where no published article exists. Use article-backed text like 防具选择、困难模式开矿、Boss 前置、地狱探索、事件入口、资源循环.

## Task 3: Component Link Support

- [x] **Step 1: Update `HomeFeaturedRoute.vue` props**

Add `href?: string` to `route.list[]`.

- [x] **Step 2: Render linked route rows**

Render each route list row as `<a>` when `item.href` exists, preserving class `route-list-row`.

- [x] **Step 3: Update `HomeCodexBand.vue` props**

Add `href: string` to `codex.routes[]` and `codex.notes[]`.

- [x] **Step 4: Render codex rows and notes as anchors**

Render route rows and notes as `<a>` elements with their existing classes and content.

## Task 4: Link Styling

- [x] **Step 1: Preserve AC visual layout**

Add only anchor behavior CSS:
- `text-decoration: none`
- `color: inherit`
- `cursor: pointer`
- `:focus-visible` outline

- [x] **Step 2: Keep light-theme contrast**

Update selectors that currently assume `div` or `span` only if the anchor change breaks light theme text color.

Actual: `hifi-preview.css` keeps anchor rows visually inherited, and `light-theme-contrast-fixes.css` explicitly covers `.codex-route-list a` so the light themes do not pick up global link styling.

## Task 5: Validation

- [x] **Step 1: Contract check**

Run:

```bash
pnpm --dir front-nuxt exec node scripts/check-home-j1-index.mjs
```

- [x] **Step 2: Frontend checks**

Run:

```bash
pnpm --dir front-nuxt run check
pnpm --dir front-nuxt run check:home-visual-lightweight
```

- [x] **Step 3: Article slug smoke test**

Run each mapped article route through the backend public API:

```bash
node - <<'NODE'
const slugs = [
  'starter-life-crystal-guide-npc-flow-2026-06-07',
  'pre-hardmode-armor-choice-by-role-2026-06-07',
  'hardmode-ore-tier-mining-route-2026-06-07',
  'queen-bee-jungle-boss-resource-loop-2026-06-07',
  'goblin-army-tinkerer-unlock-2026-06-07',
  'boots-upgrade-route-frostspark-2026-06-07',
  'fishing-resource-loop-potion-bobber-2026-06-07',
  'early-boss-prep-slime-cthulhu-2026-06-07',
  'meteorite-resource-planning-2026-06-07',
  'underworld-lava-preparation-checklist-2026-06-07',
]

for (const slug of slugs) {
  const response = await fetch(`http://localhost:18088/api/articles/slug/${encodeURIComponent(slug)}`)
  if (!response.ok) {
    throw new Error(`${slug} returned HTTP ${response.status}`)
  }
  const payload = await response.json()
  if (!payload?.success || payload?.data?.status !== 'PUBLISHED') {
    throw new Error(`${slug} is not a published article response`)
  }
}

console.log(`Verified ${slugs.length} published article slugs.`)
NODE
```

- [x] **Step 4: Diff hygiene**

Run:

```bash
git diff --check
git status --short
```

## Multi-Agent Review Notes

- Article mapping review: use existing published article slugs first; do not write DB for this task.
- Component review: the row-level UI must become real anchors, not only a CTA link on the parent card.
- Validation review: keep `/statistics/overview` as the only dynamic homepage API fetch and enforce slugs in the contract script.

## Actual Validation

- `pnpm --dir front-nuxt exec node scripts/check-home-j1-index.mjs` passed.
- `pnpm --dir front-nuxt run check` passed with the existing Node `DEP0205` warning during Nuxt typecheck.
- `pnpm --dir front-nuxt run check:home-visual-lightweight` passed for 4 themes x 4 viewports.
- Article slug smoke test verified 10 published article slugs.
- `git diff --check` passed.
