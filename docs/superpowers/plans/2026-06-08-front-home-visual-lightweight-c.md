# Front Home Visual Lightweight C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the A-version home page so every theme reads lighter and more layered, without reverting the search-first information architecture.

**Architecture:** Keep `pages/index.vue`, `useHomeData()`, and the A-version home DOM order stable. C is a CSS-first visual-density pass over the home hero, primary entries, stage chips, secondary shortcuts, atlas treatment, and lower home modules, backed by static contracts plus a required runtime checker that covers all target themes and viewports.

**Tech Stack:** Nuxt 4, Vue 3 SFCs, CSS in `front-nuxt/assets/css/hifi-preview.css`, `front-nuxt/assets/css/light-theme-contrast-fixes.css`, `front-nuxt/assets/css/mobile-typography-fixes.css`, Node contract scripts, Chromium CDP runtime checks, local dev stack at `http://localhost:5174/`.

---

## Problem Statement

The A-version home page fixed the hierarchy, but the user-visible complaint remains: some home entry surfaces, especially `物品` and light-theme highlighted states, still read as heavy filled color blocks. C must remove the pure-color-block feeling across all themes while keeping the search-first route and the existing information architecture.

## Scope

### In Scope

- CSS write scope:
  - `front-nuxt/assets/css/hifi-preview.css`
  - `front-nuxt/assets/css/light-theme-contrast-fixes.css`
  - `front-nuxt/assets/css/mobile-typography-fixes.css`
- Contract/runtime write scope:
  - `front-nuxt/scripts/check-home-j1-index.mjs`
  - `front-nuxt/scripts/check-home-visual-lightweight-runtime.mjs`
  - `front-nuxt/package.json`
- Component read-only by default:
  - `front-nuxt/components/home/HomeHero.vue`
  - `front-nuxt/components/home/HomeExplorationMap.vue`
  - `front-nuxt/components/home/HomeFeaturedRoute.vue`
  - `front-nuxt/components/home/HomeBossProgression.vue`
  - `front-nuxt/components/home/HomeCodexBand.vue`

Component files may be edited only if runtime screenshots prove that wording, CTA placement, or template class hooks are required. If that happens, update this plan note in the implementation handoff and keep the edit to the single component that owns the affected section.

### Out Of Scope

- No backend endpoint, DB query, crawler, import, cache refresh, or data backfill.
- No replacement of the A-version homepage information architecture.
- No new route filtering/search app behavior on `/`.
- No global navigation rewrite.
- No `check-public-pages` modernization. It remains a separate contract-modernization task.
- No changes to account, article management, crafting data flow, armor pages, or entity detail pages.
- No write to `front-nuxt/composables/useHomeData.ts`; only read it to confirm route/API invariants.

## Source Of Truth

- Runtime page: `/`
- Data source boundary: `front-nuxt/composables/useHomeData.ts`
- Only dynamic home API target: `/statistics/overview`
- Visual source: home CSS selectors in `hifi-preview.css`, light-theme overrides in `light-theme-contrast-fixes.css`, mobile overrides in `mobile-typography-fixes.css`
- Static A-version contract: `front-nuxt/scripts/check-home-j1-index.mjs`
- Runtime C acceptance contract: `front-nuxt/scripts/check-home-visual-lightweight-runtime.mjs`

## Non-Negotiable A-Version Invariants

C must preserve these:

- Search appears after `.hero-j1-lede` and before `.hero-j1-grid`.
- `.hero-j1-grid` renders exactly four primary entry anchors.
- Four primary routes stay `/items`, `/bosses`, `/npcs`, `/articles`.
- Six secondary routes stay `/categories`, `/crafting`, `/biomes`, `/buffs`, `/armor-sets`, `/projectiles`.
- Stage chips remain between the primary grid and secondary shortcuts.
- `.hero-status-line` remains after secondary shortcuts.
- `.home-atlas-secondary` remains outside mobile first-screen flow.
- `HomeBossProgression.vue` keeps `.boss-route-cta` bound to the boss route.
- Runtime `.boss-route-cta` resolves to `/bosses`.
- `useHomeData.ts` keeps `/statistics/overview` as the only dynamic home API source.

## Visual Acceptance Rules

### Theme Matrix

Validate `/` in all themes:

- `dark`
- `light`
- `morning-paper`
- `warm-slate`

### Viewport Matrix

Validate `/` at all viewports:

- `390x844`
- `768x1024`
- `1440x1000`
- `1728x1050`

### Required Visual Outcome

- Primary entry cards no longer read as solid filled color blocks.
- Entry color is expressed through light accents: border, icon glow, left edge, small count text, and low-opacity wash.
- Search remains the most obvious first action without becoming a heavy banner.
- Stage chips are visibly lower priority than primary entries while still meeting touch target requirements.
- Secondary links are utility links, not competing cards.
- Light themes use paper/panel surfaces with subtle tinting, not saturated gold or accent slabs.
- Dark theme remains adapted and readable; C must not flatten it into a washed-out interface.
- Mobile first screen shows title, lede, search, and the beginning of primary entries without atlas/status consuming first flow.
- No horizontal overflow at any viewport.
- Touch targets remain at least 44px for search submit, primary entries, stage chips, secondary links, and Boss CTA.

### Measurable Guardrails

- Dark `.hero-j1-cell` dominant accent wash alpha is `<= 0.10`; hover dominant accent alpha is `<= 0.14`.
- Light, `morning-paper`, and `warm-slate` `.hero-j1-cell` dominant accent wash alpha is `<= 0.08`; hover dominant accent alpha is `<= 0.10`.
- `.hero-j1-cell` does not use `background: var(--theme-active-bg)`, a single opaque theme color, or final cascade values equivalent to a solid accent fill.
- `light-theme-contrast-fixes.css` must not reintroduce stronger `.hero-j1-cell` alpha values after `hifi-preview.css` is lightened.
- `.hero-stage-chip`, `.hero-j1-path-link`, and `.hero-j1-search-btn` all compute to at least 44px height.
- `.hero-stage-chip` and `.hero-j1-path-link` have lower border/box-shadow weight than `.hero-j1-cell`.
- `.home-atlas-secondary .atlas-index` has lower shadow and contrast than the primary hero panel.

## Multi-Agent Review Summary

The plan was reviewed by three read-only agents before repair:

- UI review found the current light-theme cascade still uses heavy `.hero-j1-cell` alpha values in both `hifi-preview.css` and `light-theme-contrast-fixes.css`, and found `.hero-stage-chip` below the 44px touch target.
- Contract review found that `check:visual` cannot prove C acceptance because it does not cover the full 4-theme x 4-viewport matrix, and that computed `backgroundColor` alone cannot detect gradient-heavy fills.
- Implementation-boundary review found that runtime checks must verify the local dev server belongs to this worktree, `check:public-pages` should be kept as read-only diagnostics, and component files should be read-only unless screenshots prove a narrow need.

Repairs applied to this plan:

- `check-home-visual-lightweight-runtime.mjs` is mandatory, not optional.
- Runtime acceptance covers 16 theme/viewport combinations, computed style metrics, screenshots, first-screen mobile geometry, Boss CTA path, and touch target heights.
- Static CSS checks must inspect selector blocks and alpha thresholds, not brittle exact string matches.
- Components are read-only by default.
- `check:public-pages` and `check:visual` are diagnostic gates: C-caused failures block completion; known non-C failures must be documented instead of silently ignored.

## Task 0: Baseline, Stack Ownership, And Evidence Capture

**Files:**
- Read-only

- [ ] **Step 1: Confirm worktree state**

Run:

```bash
git status --short -uall
```

Expected: either clean, or only this plan file appears before implementation starts:

```text
?? docs/superpowers/plans/2026-06-08-front-home-visual-lightweight-c.md
```

- [ ] **Step 2: Confirm the local front server belongs to this worktree**

Run:

```bash
pwd
ps -eo pid,command | rg 'nuxt|vite|node' | rg 'front-nuxt|5174' || true
curl -I http://localhost:5174/ | head
```

Expected:

- `pwd` is `/home/lolben/TerraPedia`.
- `/` returns HTTP 200.
- The running front process either clearly points at `/home/lolben/TerraPedia/front-nuxt`, or ownership is unclear.

If ownership is unclear or the page is stale, restart the local stack before runtime validation:

```bash
./scripts/dev/start-local-stack.sh --reuse-existing
```

- [ ] **Step 3: Confirm A-version contracts before C**

Run:

```bash
cd front-nuxt
node scripts/check-home-j1-index.mjs
pnpm run check:front-layout-layering
pnpm run check
```

Expected: all pass. Existing Node `DEP0205` warning may appear and is not a failure when exit code is 0.

- [ ] **Step 4: Run known diagnostic gates before C**

Run:

```bash
cd front-nuxt
pnpm run check:public-pages
TERRAPEDIA_FRONT_NUXT_URL=http://localhost:5174 pnpm run check:visual
```

Expected: record pass/fail status as baseline. Existing non-C failures do not block starting C, but any later C-caused `/` failure or shared-CSS regression blocks completion.

- [ ] **Step 5: Capture current homepage baseline metrics**

After Task 1 creates the runtime checker, run it once before CSS edits if possible. If Task 1 is not implemented yet, use a one-off CDP read only for baseline and record these values in the final handoff:

```js
{
  theme,
  viewport,
  primaryCount,
  secondaryCount,
  firstPrimaryTop,
  searchTop,
  searchBottom,
  scrollWidth,
  clientWidth,
  primaryCard: {
    backgroundColor,
    backgroundImage,
    boxShadow,
    borderColor,
    borderLeftColor,
    maxAccentAlpha
  },
  search: {
    backgroundColor,
    backgroundImage,
    boxShadow,
    maxAccentAlpha
  },
  stageChipHeight,
  secondaryLinkHeight,
  bossCtaHref
}
```

## Task 1: Strengthen Static And Runtime Contracts

**Files:**
- Modify: `front-nuxt/scripts/check-home-j1-index.mjs`
- Create: `front-nuxt/scripts/check-home-visual-lightweight-runtime.mjs`
- Modify: `front-nuxt/package.json`

- [ ] **Step 1: Replace brittle static fill checks with selector-block checks**

In `check-home-j1-index.mjs`, add helper logic equivalent to:

```js
function extractRuleBlocks(css, selector) {
  const blocks = []
  let index = 0
  while ((index = css.indexOf(selector, index)) !== -1) {
    const brace = css.indexOf('{', index)
    if (brace === -1) break
    let depth = 0
    for (let cursor = brace; cursor < css.length; cursor += 1) {
      if (css[cursor] === '{') depth += 1
      if (css[cursor] === '}') depth -= 1
      if (depth === 0) {
        blocks.push(css.slice(index, cursor + 1))
        index = cursor + 1
        break
      }
    }
  }
  return blocks
}

function maxAccentAlpha(block) {
  const matches = [...block.matchAll(/rgba\(var\(--(?:entry-accent|theme-gold-rgb)\),\s*([0-9.]+)\)/g)]
  return matches.reduce((max, match) => Math.max(max, Number(match[1])), 0)
}
```

Then inspect `.hero-j1-cell`, `.hero-j1-cell:hover`, and the light-theme `.hero-j1-cell` override blocks across both `hifi-preview.css` and `light-theme-contrast-fixes.css`.

- [ ] **Step 2: Add alpha and forbidden-fill assertions**

The static checker must fail when:

```js
{
  darkBaseMaxAccentAlpha: > 0.10,
  darkHoverMaxAccentAlpha: > 0.14,
  lightBaseMaxAccentAlpha: > 0.08,
  lightHoverMaxAccentAlpha: > 0.10,
  forbiddenBackground: 'background: var(--theme-active-bg)',
  forbiddenOpaquePattern: /background:\s*(#[0-9a-f]{3,8}|rgb\()/
}
```

Do not require `.hero-j1-cell::before` or `.hero-j1-cell::after`. Pseudo-elements are allowed, but the contract checks the outcome: low-alpha layers, border/edge accents, no solid fills.

- [ ] **Step 3: Add route and DOM invariant checks**

Keep existing A-order checks and add static confirmation that:

```js
[
  '/items',
  '/bosses',
  '/npcs',
  '/articles',
  '/categories',
  '/crafting',
  '/biomes',
  '/buffs',
  '/armor-sets',
  '/projectiles'
]
```

remain present in the home data/template path, and `/statistics/overview` remains the only dynamic home API path in `useHomeData.ts`.

- [ ] **Step 4: Create the runtime checker**

Create `front-nuxt/scripts/check-home-visual-lightweight-runtime.mjs` using the local CDP/Chromium helper pattern already used by existing `front-nuxt/scripts/check-*.mjs` scripts. The checker must:

- Load `TERRAPEDIA_FRONT_NUXT_URL || 'http://localhost:5174'`.
- Visit `/`.
- Apply themes by setting the real project theme state. If no exported theme helper is available, use:

```js
document.documentElement.dataset.theme = theme
localStorage.setItem('terrapedia-theme', theme)
await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
```

- Run all 16 combinations from the theme and viewport matrices.
- Save JSON metrics and screenshots under `front-nuxt/test-results/home-visual-lightweight/`.

Runtime assertions:

```js
{
  statusCode: 200,
  primaryCount: 4,
  secondaryCount: 6,
  searchVisible: true,
  searchTopRatio: searchTop / innerHeight < 0.45,
  searchBottomMobile: viewportWidth > 390 || searchBottom < innerHeight * 0.72,
  firstPrimaryVisibleMobile: viewportWidth > 390 || firstPrimaryTop < innerHeight * 0.92,
  mobileAtlasHidden: viewportWidth > 720 || atlasVisible === false,
  statusAfterSecondary: true,
  noHorizontalOverflow: scrollWidth <= clientWidth,
  minPrimaryEntryHeight: 44,
  minStageChipHeight: 44,
  minSecondaryLinkHeight: 44,
  minSearchButtonHeight: 44,
  bossCtaVisible: true,
  bossCtaMinHeight: 44,
  bossCtaPathname: '/bosses',
  maxPrimaryAccentAlpha: theme === 'dark' ? <= 0.10 : <= 0.08
}
```

For each inspected element, record:

```js
{
  selector,
  rect,
  backgroundColor,
  backgroundImage,
  boxShadow,
  borderColor,
  borderLeftColor,
  color,
  maxAccentAlpha
}
```

Parse `rgba(...)`, `rgba(var(...), alpha)`, and simple `color-mix(... X%)` patterns conservatively. If parsing cannot determine alpha, record `unknownAlpha: true` and require screenshot review for that selector.

- [ ] **Step 5: Add a package script**

Modify `front-nuxt/package.json`:

```json
{
  "scripts": {
    "check:home-visual-lightweight": "node scripts/check-home-visual-lightweight-runtime.mjs"
  }
}
```

Keep existing scripts unchanged.

- [ ] **Step 6: Verify contracts catch the current issue**

Run:

```bash
cd front-nuxt
node scripts/check-home-j1-index.mjs
pnpm run check:home-visual-lightweight
```

Expected before CSS fixes: at least one C-specific guard should fail or record the current heavy light-theme alpha/stage-chip issue. If both pass before any CSS changes, inspect the screenshots and metrics; do not proceed until the checker demonstrably records the relevant surfaces and touch target heights.

## Task 2: Lighten Primary Entry Cards

**Files:**
- Modify: `front-nuxt/assets/css/hifi-preview.css`
- Modify: `front-nuxt/assets/css/light-theme-contrast-fixes.css`

- [ ] **Step 1: Preserve layout dimensions**

Do not change these foundations unless a screenshot proves they break:

```css
.hero-j1-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.hero-j1-cell {
  min-height: 92px;
}
```

- [ ] **Step 2: Replace heavy card fill with layered low-opacity dark surfaces**

Recommended dark direction:

```css
.hero-j1-cell {
  border-color: rgba(var(--entry-accent), 0.18);
  border-left-color: rgba(var(--entry-accent), 0.46);
  background:
    linear-gradient(90deg, rgba(var(--entry-accent), 0.075), transparent 58%),
    var(--index-grid-x),
    var(--index-grid-y),
    rgba(4, 10, 6, 0.42);
  box-shadow: inset 0 1px 0 rgba(244, 234, 208, 0.03);
}

.hero-j1-cell:hover,
.hero-j1-cell:focus-visible {
  border-color: rgba(var(--entry-accent), 0.3);
  background:
    linear-gradient(90deg, rgba(var(--entry-accent), 0.12), transparent 58%),
    var(--index-grid-x),
    var(--index-grid-y),
    rgba(5, 12, 7, 0.52);
}
```

Final values may differ after visual review, but must satisfy the alpha guardrails.

- [ ] **Step 3: Replace light-theme filled slabs in every cascade location**

Update both `hifi-preview.css` and `light-theme-contrast-fixes.css` so final computed light-theme entries follow this direction:

```css
:where([data-theme="light"], [data-theme="morning-paper"], [data-theme="warm-slate"]) .hero-j1-cell {
  border-color: rgba(var(--theme-border-rgb), 0.16);
  border-left-color: rgba(var(--entry-accent), 0.38);
  background:
    linear-gradient(90deg, rgba(var(--entry-accent), 0.06), transparent 58%),
    var(--index-grid-x),
    var(--index-grid-y),
    rgba(var(--theme-panel-rgb), 0.48);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.58),
    0 10px 24px rgba(var(--theme-border-rgb), 0.055);
}

:where([data-theme="light"], [data-theme="morning-paper"], [data-theme="warm-slate"]) .hero-j1-cell:hover,
:where([data-theme="light"], [data-theme="morning-paper"], [data-theme="warm-slate"]) .hero-j1-cell:focus-visible {
  background:
    linear-gradient(90deg, rgba(var(--entry-accent), 0.095), transparent 58%),
    var(--index-grid-x),
    var(--index-grid-y),
    rgba(var(--theme-panel-rgb), 0.62);
}
```

Do not leave later overrides with `rgba(var(--theme-gold-rgb), 0.13)`, `0.16`, `0.18`, or `0.22` on `.hero-j1-cell`.

- [ ] **Step 4: Add subtle detail without decorative blobs**

Use either pseudo-elements or existing child elements for edge/inner detail. If pseudo-elements are used:

```css
.hero-j1-cell {
  position: relative;
  overflow: hidden;
}

.hero-j1-cell > * {
  position: relative;
  z-index: 1;
}

.hero-j1-cell::after {
  content: "";
  position: absolute;
  left: 0;
  top: 14px;
  bottom: 14px;
  width: 1px;
  background: rgba(var(--entry-accent), 0.52);
  pointer-events: none;
}
```

Do not add gradient orbs, bokeh blobs, decorative large fills, or one-hue page-wide effects.

## Task 3: Tune Search, Stage Chips, And Secondary Links

**Files:**
- Modify: `front-nuxt/assets/css/hifi-preview.css`
- Modify: `front-nuxt/assets/css/light-theme-contrast-fixes.css`
- Modify: `front-nuxt/assets/css/mobile-typography-fixes.css`

- [ ] **Step 1: Keep search first without making it a banner**

Recommended direction:

```css
.hero-j1-search {
  background:
    linear-gradient(90deg, rgba(217, 185, 91, 0.055), transparent 60%),
    var(--index-grid-x),
    var(--index-grid-y),
    rgba(3, 9, 5, 0.5);
}
```

For light themes, use paper/panel tinting and keep submit button weight below the primary route cards:

```css
:where([data-theme="light"], [data-theme="morning-paper"], [data-theme="warm-slate"]) .hero-j1-search {
  background:
    linear-gradient(90deg, rgba(var(--theme-gold-rgb), 0.045), transparent 60%),
    var(--index-grid-x),
    var(--index-grid-y),
    rgba(var(--theme-panel-rgb), 0.72);
}
```

- [ ] **Step 2: Restore stage chip touch target while lowering visual priority**

Set:

```css
.hero-stage-chip {
  min-height: 44px;
  border-color: rgba(244, 234, 208, 0.1);
  background: rgba(244, 234, 208, 0.025);
  box-shadow: none;
}
```

For light themes:

```css
:where([data-theme="light"], [data-theme="morning-paper"], [data-theme="warm-slate"]) .hero-stage-chip {
  border-color: rgba(var(--theme-border-rgb), 0.16);
  background: rgba(var(--theme-panel-rgb), 0.42);
  box-shadow: none;
}
```

- [ ] **Step 3: Keep secondary links at utility weight**

Keep or restore:

```css
.hero-j1-path-link {
  min-height: 44px;
}
```

Lower surface contrast relative to `.hero-j1-cell` and `.hero-j1-search`. Secondary links may use outline, paper, or transparent surfaces, but must not become mini primary cards.

- [ ] **Step 4: Keep text hierarchy readable in light themes**

If `light-theme-contrast-fixes.css` makes all home secondary copy equal to main text, restore hierarchy using existing theme tokens:

```css
:where([data-theme="light"], [data-theme="morning-paper"], [data-theme="warm-slate"]) .hero-j1-cell-copy em,
:where([data-theme="light"], [data-theme="morning-paper"], [data-theme="warm-slate"]) .hero-j1-path-link span,
:where([data-theme="light"], [data-theme="morning-paper"], [data-theme="warm-slate"]) .hero-stage-chip {
  color: var(--text-muted);
}
```

Only apply this where contrast remains WCAG-readable in screenshots and computed colors.

## Task 4: Mobile First-Screen Density

**Files:**
- Modify: `front-nuxt/assets/css/hifi-preview.css`
- Modify: `front-nuxt/assets/css/mobile-typography-fixes.css`

- [ ] **Step 1: Preserve atlas hiding**

Keep:

```css
@media (max-width: 720px) {
  .home-atlas-secondary {
    display: none;
  }
}
```

- [ ] **Step 2: Tune mobile spacing without shrinking targets**

At `390x844`, the first screen must include title, lede, search, and the beginning of primary entries. Adjust spacing first:

```css
@media (max-width: 720px) {
  .hero {
    padding: 30px 18px 40px;
  }

  .hero-j1-panel {
    gap: 16px;
  }
}
```

Do not reduce `.hero-j1-search-btn`, `.hero-j1-cell`, `.hero-stage-chip`, `.hero-j1-path-link`, or `.boss-route-cta` below 44px.

- [ ] **Step 3: Prevent mobile search from reading as a heavy two-line block**

If the 390px screenshot shows the search submit button as a heavy full-width bar, keep the full-width layout but reduce fill weight:

```css
@media (max-width: 720px) {
  .hero-j1-search-btn {
    min-height: 44px;
    box-shadow: none;
  }
}
```

Use the runtime checker to confirm `searchBottom < innerHeight * 0.72`.

## Task 5: Lower Home Modules Visual Continuity

**Files:**
- Modify: `front-nuxt/assets/css/hifi-preview.css`
- Modify: `front-nuxt/assets/css/light-theme-contrast-fixes.css`
- Read-only unless proven necessary:
  - `front-nuxt/components/home/HomeExplorationMap.vue`
  - `front-nuxt/components/home/HomeFeaturedRoute.vue`
  - `front-nuxt/components/home/HomeBossProgression.vue`
  - `front-nuxt/components/home/HomeCodexBand.vue`

- [ ] **Step 1: Keep lower modules lower priority**

Reduce shadows or tinted backgrounds only where screenshots show lower modules competing with the top search and primary grid:

```css
.exploration-map
.featured-route
.boss-strip
.codex-scroll
.codex-note
```

Do not make lower modules stronger than `.hero-j1-cell`.

- [ ] **Step 2: Keep Boss CTA visible, tappable, and lightweight**

`.boss-route-cta` must stay visible, compute to at least 44px height, and resolve to `/bosses`. It should use outline/panel treatment, not a filled block.

## Task 6: Runtime And Screenshot Verification

**Files:**
- Read-only verification

- [ ] **Step 1: Run focused contracts**

Run:

```bash
cd front-nuxt
node scripts/check-home-j1-index.mjs
pnpm run check:home-visual-lightweight
pnpm run check:front-layout-layering
pnpm run check
```

Expected: all pass. Existing Node/Chromium warnings may appear and are not failures when exit code is 0.

- [ ] **Step 2: Inspect generated C evidence**

Confirm these files exist:

```bash
find front-nuxt/test-results/home-visual-lightweight -maxdepth 2 -type f | sort
```

Expected:

- One JSON metrics artifact for the 16 theme/viewport combinations.
- One screenshot per theme/viewport initial state.
- Focus or hover screenshots for search and one primary entry on desktop, if the checker supports state captures.

- [ ] **Step 3: Manual screenshot review**

Review screenshots for:

- No primary entry looks like a saturated solid rectangle.
- `物品` no longer dominates through a heavy gold block.
- Search remains visually discoverable.
- Secondary entries read as utility.
- Mobile first screen is not cluttered.
- Dark theme remains adapted rather than washed out.

- [ ] **Step 4: Run diagnostic public/visual gates**

Run:

```bash
cd front-nuxt
pnpm run check:public-pages
TERRAPEDIA_FRONT_NUXT_URL=http://localhost:5174 pnpm run check:visual
```

Expected:

- If both pass, record pass.
- If either fails, classify each failure as `pre-existing`, `non-home known debt`, or `C-caused`.
- Any `C-caused` failure blocks completion and must be fixed inside C scope.
- Do not edit `check-public-pages` as part of C.

## Task 7: Commit And Handoff

**Files:**
- Read-only git state

- [ ] **Step 1: Diff hygiene**

Run:

```bash
git diff --check
git status --short -uall
```

Expected: no whitespace errors. Status should contain only C-scope CSS/contract files plus any narrowly justified component file.

- [ ] **Step 2: Stage only C-scope files**

Run:

```bash
git add front-nuxt/assets/css/hifi-preview.css \
  front-nuxt/assets/css/light-theme-contrast-fixes.css \
  front-nuxt/assets/css/mobile-typography-fixes.css \
  front-nuxt/scripts/check-home-j1-index.mjs \
  front-nuxt/scripts/check-home-visual-lightweight-runtime.mjs \
  front-nuxt/package.json
```

If a component file was narrowly edited after screenshot proof, stage only that file as well:

```bash
git add front-nuxt/components/home/<component>.vue
```

- [ ] **Step 3: Commit**

Run:

```bash
git commit -m "fix(front): lighten home visual surfaces"
```

- [ ] **Step 4: Handoff**

Final handoff must include:

- Commit hash.
- Commands run and pass/fail status.
- `check:public-pages` and `check:visual` classification if either fails.
- Screenshot/metrics artifact directory.
- Any component file edited and the exact reason it was needed.

## Multi-Agent Execution Split

Use agents only if the user explicitly asks for multi-agent execution.

Execution order:

1. Agent 2, contract owner, writes `check-home-j1-index.mjs`, `check-home-visual-lightweight-runtime.mjs`, and `package.json`, then proves C guardrails can detect the current issue.
2. Agent 1, visual CSS owner, writes the three CSS files and does not edit contracts.
3. Agent 2 reruns static/runtime contracts and reports failures.
4. Agent 3, component owner, stays read-only unless screenshots prove one narrow component edit is necessary.
5. Main session runs final validation and commit.

Ownership:

- Agent 1:
  - `front-nuxt/assets/css/hifi-preview.css`
  - `front-nuxt/assets/css/light-theme-contrast-fixes.css`
  - `front-nuxt/assets/css/mobile-typography-fixes.css`
- Agent 2:
  - `front-nuxt/scripts/check-home-j1-index.mjs`
  - `front-nuxt/scripts/check-home-visual-lightweight-runtime.mjs`
  - `front-nuxt/package.json`
- Agent 3:
  - Read-only review of home components by default.
  - May edit exactly one component only after main-session approval of screenshot evidence.

No two agents may edit the same file. If CSS requires template class changes, pause and reconcile ownership before continuing.

## Plan Auditor Verdict

## Verdict
- Status: Execution-ready after the plan repairs above.
- Main goal: Remove heavy solid-color-block surfaces from the A-version homepage across all themes.
- Closure definition: Static contracts pass, `check:home-visual-lightweight` passes all 16 theme/viewport combinations, screenshots show `物品` and other primary entries as lightweight layered panels, and diagnostic gates show no C-caused public/visual regression.

## Blocking Plan Defects
- Critical: Repaired. Runtime checker is now mandatory and covers the full matrix.
- Important: Repaired. Static CSS guardrails now inspect selector blocks/alpha thresholds, component writes are constrained, and diagnostic gates are classified instead of ignored.

## Plan Repairs
- Change: Added stack ownership check before runtime validation.
- Reason: Prevent validating stale UI from another worktree.
- Validation added: HTTP 200 check plus process/worktree confirmation or stack restart.

- Change: Made `check-home-visual-lightweight-runtime.mjs` mandatory with a package script.
- Reason: Existing `check:visual` cannot prove the C homepage theme/viewport matrix.
- Validation added: `pnpm run check:home-visual-lightweight`.

- Change: Reframed `check:public-pages` and `check:visual` as diagnostic gates.
- Reason: C should not modernize old public-page contracts, but shared CSS regressions must still be caught.
- Validation added: classify failures as pre-existing/non-home/C-caused.

## Execution-Ready Plan
- Scope: CSS-first homepage visual lightening plus home-specific static/runtime contracts.
- Agent split: Contract owner first, CSS owner second, component owner read-only unless evidence requires a narrow edit.
- Smoke test: `node scripts/check-home-j1-index.mjs` and `pnpm run check:home-visual-lightweight`.
- Final validation: focused contracts, layout/check suite, diagnostic public/visual gates, screenshots and JSON metrics.

## Residual Risk
- Risk: CSS alpha parsing is approximate for complex gradients and `color-mix`.
- Follow-up trigger: If computed metrics are ambiguous but screenshots still show blocky surfaces, repair CSS and rerun the runtime checker.

- Risk: Lowering surface weight too far could make dark theme flat.
- Follow-up trigger: If dark screenshots lose hierarchy or focus affordance, raise borders/edge accents without increasing primary fill alpha above the guardrails.

## Known Non-C Context

- `check:public-pages` currently contains broad old V0.1 read-only expectations. Do not modernize it in C.
- `check:visual` may report known non-home issues. C acceptance only blocks on `/` regressions or shared-CSS regressions caused by C.
- Full public-page contract modernization should be planned separately.
