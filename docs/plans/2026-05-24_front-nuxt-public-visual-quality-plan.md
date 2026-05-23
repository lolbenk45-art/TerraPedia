# Front Nuxt Public Visual Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the `front-nuxt` public surface to a consistent, inspectable visual quality bar across every active route, with automated checks catching overflow, broken images, overlap, low-touch targets, and placeholder-looking layouts before merge.

**Architecture:** Expand the visual gate first, then repair pages by route family. Shared shell, image, pagination, skeleton, and CSS rules must carry most of the consistency work; individual pages should only own their domain-specific layout. Runtime evidence must come from the real Nuxt app in Chromium at mobile, tablet, and desktop sizes.

**Tech Stack:** Nuxt 4/Vue 3 under `front-nuxt`, Tailwind/CSS files under `front-nuxt/assets/css`, shared components under `front-nuxt/components`, public API composables under `front-nuxt/composables`, Chromium-based checks in `front-nuxt/scripts/check-visual-regression.mjs`, typecheck via `pnpm run check`.

---

## Current Baseline

Existing strong points:

- `front-nuxt/scripts/check-public-pages.mjs` already verifies route files, public data-layer files, SEO markers, forbidden internal copy, and several placeholder regressions.
- `front-nuxt/scripts/check-visual-regression.mjs` already runs Chromium checks for mobile overflow, broken images, blocked image sources, H1 count, menu focusability, touch targets, item catalog interactions, item detail images, error page, and a few entity image routes.
- `front-nuxt/assets/css/app.css` imports the current public CSS layers: loading skeletons, hifi preview, mobile typography, catalog image fixes, discovery page fixes, and light theme contrast fixes.

Known gap:

- The current visual gate is deep for `/items`, but broad coverage is incomplete. It does not yet fully hold every active public page to the same visual bar.

## Route Coverage Contract

Every route below must be included in the final visual matrix. Dynamic detail fixtures should be derived from live public API data when possible, with stable fallback fixture paths only for pages that intentionally support static fallback rendering.

| Page family | Required routes |
| --- | --- |
| Shared shell | `/`, `/__missing-terrapedia-page` |
| Search/discovery | `/search`, `/search-tool`, `/articles`, `/articles/public-preview`, `/categories`, `/categories/weapons`, `/about` |
| Item/catalog | `/items`, `/items/1`, `/crafting`, `/crafting?itemId=675&maxDepth=3` |
| Entity indexes | `/npcs`, `/bosses`, `/buffs`, `/biomes`, `/armor-sets`, `/projectiles` |
| Entity details | `/npcs/guide`, `/bosses/eye-of-cthulhu`, `/buffs/ironskin`, one API-derived `/biomes/:id` |
| Account preview | `/user`, `/user/login`, `/user/register`, `/user/articles`, `/user/articles/new`, `/user/favorites`, `/user/settings` |

Viewport contract:

- Mobile: `390x900`.
- Tablet: `768x1024`.
- Desktop: `1440x1000`.
- Wide desktop spot check: `1728x1050` for dense catalog/tool pages.

## Visual Acceptance Bar

These are blockers for this plan:

- No horizontal page overflow or visible element overflow at required viewports.
- No incoherent text/image overlap, including sprite frames overlapping labels, indexes, buttons, pills, or page controls.
- No broken images, no raw `terraria.wiki.gg` images, no `localhost:9000` image references, no local filesystem asset leaks when `CHECK_LOCAL_ASSET_LEAKS=1`.
- Exactly one visible `h1` per page.
- Interactive controls in shared nav, page commands, filters, pagination, and account preview pages must be at least `44x44px`.
- All meaningful icon-only controls must have accessible names.
- Cards cannot nest inside decorative cards. Repeated cards are allowed; page sections should remain full-width or unframed layouts.
- Images must reserve stable dimensions and use contained rendering so sprites do not resize or spill over their frames.
- Empty, loading, error, and fallback states must look intentional and use the same shell density as loaded states.
- Public-facing copy must not expose backend/API/internal/source-chain jargon.
- Light theme must remain readable; dark theme must not lose contrast or rely on one-note color variants.

These are warnings, not blockers:

- Page-specific data incompleteness already classified by Domain Acceptance.
- Preview-only account or article surfaces, as long as the visible state is truthful and visually finished.
- A-grade release readiness remains blocked until the Domain A-grade plan clears or explicitly classifies the remaining blockers.

## Out Of Scope

- Data crawling, `item-pages-refresh`, import, backfill, DB writes, production mutation.
- Weakening existing `check:public-pages` or `check:visual` assertions to pass.
- Replacing the product visual direction with a new marketing landing page.
- Adding unrelated user-account functionality behind preview routes.
- Remote push.

## Task 0: Branch And Baseline

**Files:**
- Read: `front-nuxt/pages/**`
- Read: `front-nuxt/components/**`
- Read: `front-nuxt/assets/css/**`
- Create: `docs/audits/2026-05-24_front-nuxt-visual-quality-baseline.md`

- [ ] **Step 1: Create implementation branch**

Run from the local `main` worktree:

```bash
git status --short --branch -uall
git switch -c fix/front-nuxt-public-visual-quality-2026-05-24
```

Expected: clean non-`main` branch.

- [ ] **Step 2: Start or reuse the local app stack**

Use the existing TerraPedia local stack if it is already running with `front-nuxt` on `http://127.0.0.1:5176`. If not, start only the services required for public API and `front-nuxt`; do not run crawler, import, backfill, or DB writes.

- [ ] **Step 3: Record baseline checks**

Run:

```bash
cd front-nuxt
pnpm run check:public-pages
pnpm run check
TERRAPEDIA_FRONT_NUXT_URL=http://127.0.0.1:5176 CHECK_LOCAL_ASSET_LEAKS=1 pnpm run check:visual
```

Expected:

- Record pass/fail and exact failing assertions.
- Do not claim visual quality until Chromium route checks pass against the running app.

- [ ] **Step 4: Commit baseline audit**

Create `docs/audits/2026-05-24_front-nuxt-visual-quality-baseline.md`, then run:

```bash
git add docs/audits/2026-05-24_front-nuxt-visual-quality-baseline.md
git diff --cached --stat
git diff --cached --name-status
git commit -m "docs: record front nuxt visual baseline"
```

## Task 1: Expand Visual Gate Coverage

**Files:**
- Modify: `front-nuxt/scripts/check-visual-regression.mjs`
- Modify only if needed: `front-nuxt/scripts/check-public-pages.mjs`
- Create: `docs/audits/2026-05-24_front-nuxt-visual-gate-coverage.md`

- [ ] **Step 1: Add route matrix data**

Extend `check-visual-regression.mjs` with explicit route groups from the Route Coverage Contract. Keep the existing deep `/items` assertions.

The checker must evaluate all required routes at `390x900`, at least representative shell routes at `768x1024`, and dense/tool routes at `1440x1000` plus `1728x1050`.

- [ ] **Step 2: Add generic per-route assertions**

For every route in the matrix, assert:

- no horizontal document/body overflow,
- no visible element overflow for shared containers,
- no clipped search/forms/control bars,
- exactly one `h1`,
- no broken image,
- no blocked image host,
- no local filesystem asset leak when enabled,
- no closed menu focus leak,
- no shared touch target below `44px`.

- [ ] **Step 3: Add dynamic fixture resolution**

Before checking detail routes, resolve stable fixtures from public API where possible:

- first biome tile for `/biomes/:id`,
- existing hardcoded safe fixtures for `/items/1`, `/npcs/guide`, `/bosses/eye-of-cthulhu`, and `/buffs/ironskin`,
- fallback to the index page only when the detail route intentionally has no data and the script records that as a warning.

- [ ] **Step 4: Add page-family assertions**

Add family-specific assertions:

- crafting tree: no `.recipe-tree-node` image/text overlap, no branch row overflow, root target visible above fold for `itemId=675`.
- entity indexes: search input visible, page controls present when paginated, card image slots contained, empty state visible on no results.
- entity details: hero image contained, relation cards use managed image URLs, long stat/evidence text wraps.
- account preview pages: truthful unavailable state, no fake logged-in controls, no overflowing action rows.
- articles/categories/search: no static fixture terms already forbidden by `check:public-pages`, route nodes and suggestion rows remain readable on mobile.

- [ ] **Step 5: Run the expanded gate**

Run:

```bash
cd front-nuxt
TERRAPEDIA_FRONT_NUXT_URL=http://127.0.0.1:5176 CHECK_LOCAL_ASSET_LEAKS=1 pnpm run check:visual
```

Expected: failing assertions are allowed at this task if they describe real visual defects. Record them in the audit doc.

- [ ] **Step 6: Commit gate expansion**

Run:

```bash
git add front-nuxt/scripts/check-visual-regression.mjs front-nuxt/scripts/check-public-pages.mjs docs/audits/2026-05-24_front-nuxt-visual-gate-coverage.md
git diff --cached --stat
git diff --cached --name-status
git commit -m "test(front): expand public visual route coverage"
```

Omit `check-public-pages.mjs` from `git add` if it was not changed.

## Task 2: Shared Shell And Design System Repair

**Files:**
- Modify: `front-nuxt/components/TerraNav.vue`
- Modify: `front-nuxt/components/TerraFooter.vue`
- Modify: `front-nuxt/components/TerraBreadcrumb.vue`
- Modify: `front-nuxt/components/common/PreviewImage.vue`
- Modify: `front-nuxt/components/common/PaginationDock.vue`
- Modify: `front-nuxt/assets/css/hifi-preview.css`
- Modify: `front-nuxt/assets/css/mobile-typography-fixes.css`
- Modify: `front-nuxt/assets/css/light-theme-contrast-fixes.css`

- [ ] **Step 1: Repair shared layout primitives**

Make nav, footer, breadcrumbs, buttons, image frames, and pagination conform to the Visual Acceptance Bar before page-specific work.

- [ ] **Step 2: Normalize image and text behavior**

Ensure shared image slots reserve dimensions, use `object-fit: contain`, expose meaningful `alt` text, and never let fallback markers cover a valid image.

Ensure long Chinese and English labels wrap or clamp intentionally without overlapping adjacent controls.

- [ ] **Step 3: Validate shared routes**

Run:

```bash
cd front-nuxt
pnpm run check:public-pages
pnpm run check
TERRAPEDIA_FRONT_NUXT_URL=http://127.0.0.1:5176 CHECK_LOCAL_ASSET_LEAKS=1 pnpm run check:visual
```

Expected: shared-shell failures clear before page-family commits.

- [ ] **Step 4: Commit shared repair**

Stage only exact changed files from the Files list above, then commit:

```bash
git diff --cached --stat
git diff --cached --name-status
git commit -m "fix(front): stabilize public shell visual system"
```

## Task 3: Catalog And Entity Index Pages

**Files:**
- Modify: `front-nuxt/pages/items/index.vue`
- Modify: `front-nuxt/pages/npcs/index.vue`
- Modify: `front-nuxt/pages/bosses/index.vue`
- Modify: `front-nuxt/pages/buffs/index.vue`
- Modify: `front-nuxt/pages/biomes/index.vue`
- Modify: `front-nuxt/pages/armor-sets/index.vue`
- Modify: `front-nuxt/pages/projectiles/index.vue`
- Modify: `front-nuxt/pages/categories/index.vue`
- Modify related composables only if page state or API query normalization is wrong.

- [ ] **Step 1: Align list-page command bars**

Every index page must show a clear page head, search/filter command row, loading state, loaded state, empty state, and pagination or result count without layout jumps.

- [ ] **Step 2: Prevent filter-before-pagination regressions**

For API-backed pages, search and category filters must be sent to the backend before pagination. The UI must not render sparse pages because local filtering happened after a paginated response.

- [ ] **Step 3: Repair card grids**

Cards must reserve stable image and text regions. Long names, subtitles, tags, counts, and action buttons must not overlap at `390px`, `768px`, `1440px`, or `1728px`.

- [ ] **Step 4: Validate index pages**

Run:

```bash
cd front-nuxt
pnpm run check:public-pages
pnpm run check
TERRAPEDIA_FRONT_NUXT_URL=http://127.0.0.1:5176 CHECK_LOCAL_ASSET_LEAKS=1 pnpm run check:visual
```

Expected: all index route assertions pass.

- [ ] **Step 5: Commit index repair**

Stage only exact changed files from the Files list above, then commit:

```bash
git diff --cached --stat
git diff --cached --name-status
git commit -m "fix(front): polish public index pages"
```

## Task 4: Detail And Tool Pages

**Files:**
- Modify: `front-nuxt/pages/items/[id].vue`
- Modify: `front-nuxt/pages/crafting/index.vue`
- Modify: `front-nuxt/components/crafting/RecipeTreeNode.vue`
- Modify: `front-nuxt/pages/npcs/[id].vue`
- Modify: `front-nuxt/pages/bosses/[id].vue`
- Modify: `front-nuxt/pages/buffs/[id].vue`
- Modify: `front-nuxt/pages/biomes/[id].vue`
- Modify: `front-nuxt/pages/categories/[id].vue`

- [ ] **Step 1: Repair item detail**

Item detail must show a contained hero image, readable stats/evidence panels, relation rows with contained icons, and no fallback glyph for valid item images.

- [ ] **Step 2: Repair crafting**

The default `/crafting` route must show a useful default item. `/crafting?itemId=675&maxDepth=3` must show the target item, alternative recipe groups without ambiguity, stations, and ingredient branches without image overlap or duplicated equivalent ingredients.

- [ ] **Step 3: Repair entity details**

NPC, Boss, Buff, Biome, and Category details must share a stable detail shell: hero, facts, relation grids, empty states, and link actions. Image slots and long relation text must remain separated at all required viewports.

- [ ] **Step 4: Validate detail/tool pages**

Run:

```bash
cd front-nuxt
pnpm run check:public-pages
pnpm run check
TERRAPEDIA_FRONT_NUXT_URL=http://127.0.0.1:5176 CHECK_LOCAL_ASSET_LEAKS=1 pnpm run check:visual
```

Expected: all detail and crafting assertions pass.

- [ ] **Step 5: Commit detail/tool repair**

Stage only exact changed files from the Files list above, then commit:

```bash
git diff --cached --stat
git diff --cached --name-status
git commit -m "fix(front): polish public detail and crafting pages"
```

## Task 5: Discovery, Account Preview, And Error Pages

**Files:**
- Modify: `front-nuxt/pages/index.vue`
- Modify: `front-nuxt/components/home/HomeBossProgression.vue`
- Modify: `front-nuxt/components/home/HomeCodexBand.vue`
- Modify: `front-nuxt/components/home/HomeExplorationMap.vue`
- Modify: `front-nuxt/components/home/HomeFeaturedRoute.vue`
- Modify: `front-nuxt/components/home/HomeHero.vue`
- Modify: `front-nuxt/pages/search.vue`
- Modify: `front-nuxt/pages/search-tool.vue`
- Modify: `front-nuxt/pages/articles/index.vue`
- Modify: `front-nuxt/pages/articles/[slug].vue`
- Modify: `front-nuxt/pages/about.vue`
- Modify: `front-nuxt/pages/user/index.vue`
- Modify: `front-nuxt/pages/user/login.vue`
- Modify: `front-nuxt/pages/user/register.vue`
- Modify: `front-nuxt/pages/user/articles/index.vue`
- Modify: `front-nuxt/pages/user/articles/new.vue`
- Modify: `front-nuxt/pages/user/favorites.vue`
- Modify: `front-nuxt/pages/user/settings.vue`
- Modify: `front-nuxt/error.vue`

- [ ] **Step 1: Repair discovery pages**

Home, search, search tool, articles, category discovery, and about pages must feel like usable app surfaces, not marketing or placeholder pages. They must keep the current visual language and route links must point to real public surfaces.

- [ ] **Step 2: Repair account preview pages**

Account pages may remain preview/unavailable, but they must be visually finished, truthful, and free of fake operational controls.

- [ ] **Step 3: Repair error page**

The error page must include shared nav/footer, one `h1`, visible `404`, and useful links without Nuxt default wording.

- [ ] **Step 4: Validate discovery/account/error pages**

Run:

```bash
cd front-nuxt
pnpm run check:public-pages
pnpm run check
TERRAPEDIA_FRONT_NUXT_URL=http://127.0.0.1:5176 CHECK_LOCAL_ASSET_LEAKS=1 pnpm run check:visual
```

Expected: all discovery, account preview, and error assertions pass.

- [ ] **Step 5: Commit discovery repair**

Stage only exact changed files from the Files list above, then commit:

```bash
git diff --cached --stat
git diff --cached --name-status
git commit -m "fix(front): polish discovery and preview pages"
```

## Task 6: Final Evidence And Merge Readiness

**Files:**
- Create: `docs/audits/2026-05-24_front-nuxt-public-visual-quality-closeout.md`
- Update if needed: `docs/project-management/current-status.md`
- Update if needed: `docs/project-management/risk-register.md`

- [ ] **Step 1: Run final checks**

Run:

```bash
cd front-nuxt
pnpm run check:public-pages
pnpm run check
TERRAPEDIA_FRONT_NUXT_URL=http://127.0.0.1:5176 CHECK_LOCAL_ASSET_LEAKS=1 pnpm run check:visual
```

Expected:

- route contract passes,
- typecheck exits `0`,
- Chromium visual gate exits `0`,
- any Node deprecation warning is recorded but not treated as a visual failure.

- [ ] **Step 2: Write closeout**

Create `docs/audits/2026-05-24_front-nuxt-public-visual-quality-closeout.md` with:

- branch name and commit list,
- route matrix covered,
- viewport matrix covered,
- command outputs and exit codes,
- defects fixed by page family,
- residual preview-only boundaries,
- statement that Domain A-grade release readiness is still governed by the Domain blocker plan.

- [ ] **Step 3: Commit closeout**

Run:

```bash
git add docs/audits/2026-05-24_front-nuxt-public-visual-quality-closeout.md docs/project-management/current-status.md docs/project-management/risk-register.md
git diff --cached --stat
git diff --cached --name-status
git commit -m "docs: close front nuxt visual quality pass"
```

Omit management docs that were not changed.

- [ ] **Step 4: Merge locally only when clean**

After all commits and final checks pass:

```bash
git status --short --branch -uall
```

Expected: clean task branch. Merge to local `main` only after the user asks to merge or after the accepted branch-finish path is chosen. Do not push unless explicitly requested.

## Execution Order

1. Task 0 baseline.
2. Task 1 visual gate expansion.
3. Task 2 shared shell and design system repair.
4. Task 3 catalog and entity index pages.
5. Task 4 detail and tool pages.
6. Task 5 discovery, account preview, and error pages.
7. Task 6 final evidence and merge readiness.

## Success Criteria

Minimum success:

- `pnpm run check:public-pages` exits `0`.
- `pnpm run check` exits `0`.
- `CHECK_LOCAL_ASSET_LEAKS=1 pnpm run check:visual` exits `0` against the running local `front-nuxt` app.
- All route families in the Route Coverage Contract are checked.
- No known visual defect remains unclassified.

Full success:

- Public pages are consistent enough that new visual defects are caught by the gate before merge.
- User-facing pages can be reviewed at `http://127.0.0.1:5176` without seeing broken images, overlap, sparse pagination, placeholder copy, or unfinished visual states.
- The branch can be merged into local `main` with a clean worktree and a durable closeout audit.
