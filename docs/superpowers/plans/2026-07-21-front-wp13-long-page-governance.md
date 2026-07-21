# Front WP-13 Long-Page Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce long-page mobile document height via biome group pagination, biome-detail disclosures, mobile crafting-tree collapse, and mobile footer collapse — without redesigning desktop layouts.

**Architecture:** Content-cost biome pagination packs complete parent groups (and stable continuation segments for oversized groups) into pages under a fixed item budget derived from a measured mobile baseline (25350px / 47 tiles ≈ 540px/tile → budget **16 items/page** targets ~9000px). `?page=N` is added to `useCatalogRouteSync` for biomes only. Biome detail wraps non-empty source groups in `<details>` (first open). Crafting `RecipeCraftingGraph` keeps the flat `routeEntries` model but gates `level > 1` behind an expandable control on mobile only. `TerraFooter` collapses `.footer-main` columns on mobile with an accessible toggle.

**Measured baseline (stack front 15177, mobile 390×844, 2026-07-21):**

```json
{ "scrollHeight": 25350, "tiles": 47, "featureCards": 3, "listCards": 44 }
```

Groups (parent): 小型群系 12, 宝藏房 10, 地表和地下 9, 微型群系 7, 困难模式 4, 洞穴 3, 太空 1, 地狱 1.

**Tech Stack:** Vue 3 / Nuxt 4, `useCatalogRouteSync`, Node contracts, Playwright-core CDP optional for height contract.

**No-write boundary:** No push/merge/main, no crawler/DB, no 13012/5181. Backend read-only (18091). Candidate port `15188` if needed.

**Scope split (4 commits):**

1. Biome index group pack + `?page=` + height contract  
2. Biome detail `<details>` for source groups  
3. Crafting graph mobile depth collapse  
4. Footer mobile collapse  

---

### Task 0: Plan checkpoint + baseline

- [ ] Record measured height in plan/devlog; `pnpm run check` green; commit plan+devlog opening.

### Task 1: Biome pack algorithm + pagination (largest)

**Create** `front-nuxt/utils/biomeGroupPagination.ts`:

```ts
export type BiomeGroupSegment = {
  key: string
  title: string
  continuationLabel?: string
  items: T[]
  cost: number
}

export type BiomePage<T> = {
  page: number
  segments: BiomeGroupSegment<T>[]
  cost: number
}

/** cost = item count; pack whole groups; split group when cost > budget */
export function packBiomePages<T>(
  groups: { key: string; title: string; items: T[] }[],
  budget: number,
): BiomePage<T>[]
```

Rules:
- Walk groups in stable order (existing parent-group order from data).
- If `group.items.length <= remaining`, place whole group on current page.
- If `group.items.length > budget`, split into chunks of `budget` with continuation labels `（续）` / `continuation of {title}, part k`.
- If group fits budget but not remaining, start new page.
- Empty groups skipped.

**PAGE_BUDGET = 16** (justified by 25350/47 ≈ 540px/tile; 16×540 ≈ 8640 < 9000).

**Modify** `pages/biomes/index.vue`:
- Build `biomeGroupedList` from `biomeDisplayItems` by `parentGroupLabel`.
- `const biomePage = ref(1)` synced via `useCatalogRouteSync` serialize/hydrate `page` using existing `parsePositiveInteger` / omit when 1.
- On `q` or `group` change, reset page to 1 (watch).
- Clamp page to `[1, pageCount]` when data/filter changes.
- Render page segments as sections with `h2` title + optional continuation note; tiles inside.
- Add simple pager UI (prev/next + “第 N / M 页”) below board; links update page state (not full reload).
- Featured strip only on page 1 of default browse.

**Contracts:**
- Source contract in `check-public-pages.mjs` or small `check-biome-pagination-contract.mjs`: page pack pure function unit tests (budget edge cases); biomes index serializes `page`; no pagination when filtered empty.
- Runtime optional: `check-biome-mobile-height-contract.mjs` asserts `/biomes` mobile scrollHeight < 9000 when candidate available — if flaky env, document measured after + source unit tests as primary gate.

RED: unit tests for packer fail (file missing). GREEN: implement packer + page wiring.

### Task 2: Biome detail disclosures

**Modify** `pages/biomes/[id].vue`:
- For `biomeSourceGroups` (and any multi-entry drop groups if structured similarly), render each non-empty group as `<details class="biome-source-group">` with `<summary>` = title + count.
- First non-empty group has `open` attribute; rest closed.
- Follow NPC/boss remainder-details styling classes where possible (`detail-group-remainder` or biome-specific).

Contract: source markers `details` + `summary` present for source groups path when groups exist.

### Task 3: Crafting mobile depth collapse

**Modify** `components/crafting/RecipeCraftingGraph.vue`:
- Keep `routeEntries` flat list.
- Add `expandedDeep = ref(false)`.
- `visibleEntries` = all on desktop (`min-width: 721px` match via `matchMedia` or CSS-only hide with progressive enhancement).
  Preferred a11y approach: always render all entries in DOM; on mobile CSS hide `.recipe-route[data-level]` where level>1 until `data-deep-expanded` on section; button toggles attribute and `aria-expanded`.
- Control: “展开更深层配方” / “收起更深层” only visible max-width 720px; keyboard focusable.

Contract: component contains deep-expand control markers; desktop CSS does not force-hide.

### Task 4: Footer mobile collapse

**Modify** `components/TerraFooter.vue`:
- Add `footerExpanded = ref(false)` — default collapsed mobile, expanded desktop via CSS or matchMedia init.
- Toggle button in footer brand or bottom: `aria-expanded`, `aria-controls="footer-main-panels"`.
- Wrap columns+contact (not brand proof) in `#footer-main-panels` collapsible region.
- CSS `@media (max-width: 720px)`: when `data-expanded="false"`, hide panels; desktop always show.

Contract: TerraFooter has toggle + aria-expanded; mobile rule exists in public-layout or component style.

### Task 5: Closeout

- Full `pnpm run check`.
- Devlog close; current.md → WP-14 next.
- Commits: plan, biome pagination, biome details, crafting collapse, footer collapse, docs-close (can squash related as listed in architecture).

## Self-review

- Biome pagination from scratch with content-cost ✔  
- Baseline height recorded 25350 ✔  
- Budget 16 justified ✔  
- page query + filter reset ✔  
- Biome detail details first-open ✔  
- Crafting structural collapse not style-only ✔  
- Footer mobile collapse accessible ✔  
- No push/merge ✔  
