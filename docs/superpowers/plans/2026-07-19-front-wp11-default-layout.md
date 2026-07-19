# Front WP-11.2 Default Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the public Nuxt navigation and footer into one default layout while preserving the existing page root classes, live home item count, error recovery page, and rendered output.

**Architecture:** `app.vue` activates Nuxt layouts, `layouts/default.vue` owns the `.screen` root plus the single `TerraNav` and `TerraFooter`, and page metadata supplies the seven existing root-class variants. `usePublicLayoutState()` is the SSR-safe shared channel for footer data: WP-11.2 publishes only the home item total, and later WP-14 extends the same channel instead of creating another footer fetch path. Source contracts lock ownership and exact page coverage before the mechanical migration; the existing three-theme parity harness proves the affected home/catalog shell output remains byte-identical where possible, and focused DOM/runtime checks cover the custom error page and shell uniqueness.

**Tech Stack:** Nuxt 4, Vue 3 `<script setup>`, TypeScript, Nuxt `useState`, Node.js source contracts, CDP/Chromium visual parity, pnpm.

**Scope:** Create the default layout and shared layout-state composable; update `app.vue`, `useHomeData.ts`, `TerraFooter.vue`, all 34 shell-owning pages, `error.vue`, focused contracts, and WP-11.2 devlog records. Do not change navigation/auth behavior, footer content beyond replacing the stale fallback, theme selectors, catalog stylesheet ownership, responsive breakpoints, backend/data state, or later WP packages.

**No-write boundary:** No push, merge to `main`, crawler action, database write, migration, worktree cleanup, or use of port `13012`. The existing cumulative preview on `5181` is the visual baseline only; the WP-11.2 candidate runs on an isolated temporary port with backend `18088`.

---

### Task 0: Establish Dependencies and the Reproducible Baseline

**Files:**
- Modify: none
- Test: `front-nuxt/scripts/check-public-pages.mjs`
- Test: `front-nuxt/scripts/check-theme-token-visual-parity.mjs`
- Test: `front-nuxt/scripts/check-default-layout-runtime.mjs`

- [ ] **Step 1: Verify branch, base, and clean task scope**

Run:

```bash
git status --short --branch
git merge-base --is-ancestor 257bde19289934dccbdbd4911da7d77b7008a6e5 HEAD
git log --oneline 257bde19289934dccbdbd4911da7d77b7008a6e5..HEAD
```

Expected: branch `feat/front-p2-wp11-layout`, clean worktree, ancestor check exits `0`, and only the approved specification/plan checkpoint commits appear above `257bde19`.

- [ ] **Step 2: Install this worktree's frontend dependencies**

Run:

```bash
cd front-nuxt
pnpm install --frozen-lockfile
```

Expected: exit `0`; `node_modules` remains ignored and unstaged. Do not symlink another worktree's dependency directory because later package installs must not mutate a shared dependency target.

- [ ] **Step 3: Run the focused and full clean baselines**

Run:

```bash
cd front-nuxt
node scripts/check-public-pages.mjs
pnpm run check
```

Expected: public-page contract reports 25 required Nuxt routes and the full frontend check exits `0`. If the full check exposes an unrelated baseline failure, record the exact failing command and stop for plan repair instead of weakening a gate.

- [ ] **Step 4: Capture the immutable 5181 visual baseline**

Run:

```bash
cd front-nuxt
test ! -e test-results/wp11-default-layout-parity
THEME_TOKEN_PARITY_BASE=http://127.0.0.1:5181 \
THEME_TOKEN_PARITY_OUT=test-results/wp11-default-layout-parity \
THEME_TOKEN_PARITY_MODE=capture \
CHROMIUM_BIN="${CHROMIUM_BIN:-$HOME/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome}" \
node scripts/check-theme-token-visual-parity.mjs
```

Expected: the output path is absent before capture and the existing WP-11.1
preview produces 18 stable baseline records for `/`, `/items`, and
`/armor-sets` across three themes and two viewports. The generated directory
stays ignored. If the path already exists, choose a fresh task-specific output
path and use that exact path in every later command; do not delete evidence.
If `5181` is not the `257bde19` preview, stop and restore that explicit baseline
before capture.

- [ ] **Step 5: Record baseline evidence**

Append to `docs/devlog/entries/2026-07-19-front-wp11-default-layout.md`:

```markdown
- Baseline: `check-public-pages` passed for 25 required routes; full frontend gate exited 0.
- Visual baseline: 18 stable records captured from WP-11.1 at `http://127.0.0.1:5181` under `front-nuxt/test-results/wp11-default-layout-parity/`; generated artifacts remain ignored.
```

Do not commit yet; Task 1 commits the RED contract and baseline record together.

### Task 1: Lock Default-Layout Ownership (RED)

**Files:**
- Modify: `front-nuxt/scripts/check-public-pages.mjs`
- Create: `front-nuxt/scripts/check-default-layout-runtime.mjs`
- Modify: `docs/devlog/entries/2026-07-19-front-wp11-default-layout.md`
- Test: `front-nuxt/scripts/check-public-pages.mjs`

- [ ] **Step 1: Add the exact shell inventory beside `publicPageFiles`**

Add this contract data after `publicPageFiles`:

```js
const publicShellClasses = new Map([
  ['pages/index.vue', 'home-screen'],
  ['pages/search-tool.vue', 'home-screen search-tool-screen'],
  ['pages/articles/index.vue', 'article-screen'],
  ['pages/articles/[slug].vue', 'article-screen'],
  ['pages/items/index.vue', 'catalog-screen'],
  ['pages/items/[id].vue', 'detail-screen'],
  ['pages/crafting/index.vue', 'entity-screen crafting-screen'],
  ...[
    'pages/about.vue',
    'pages/armor-sets/index.vue',
    'pages/armor-sets/[id].vue',
    'pages/biomes/index.vue',
    'pages/biomes/[id].vue',
    'pages/bosses/index.vue',
    'pages/bosses/[id].vue',
    'pages/buffs/index.vue',
    'pages/buffs/[id].vue',
    'pages/categories/index.vue',
    'pages/categories/[id].vue',
    'pages/npcs/index.vue',
    'pages/npcs/[id].vue',
    'pages/projectiles/index.vue',
    'pages/search.vue',
    'pages/user/index.vue',
    'pages/user/login.vue',
    'pages/user/register.vue',
    'pages/user/forgot-password.vue',
    'pages/user/favorites.vue',
    'pages/user/notifications.vue',
    'pages/user/routes.vue',
    'pages/user/settings.vue',
    'pages/user/articles/index.vue',
    'pages/user/articles/new.vue',
    'pages/user/articles/[id].vue',
    'pages/users/[id].vue',
  ].map((path) => [path, 'entity-screen']),
])
```

Add `'layouts/default.vue'` and `'composables/usePublicLayoutState.ts'` to `scanFiles`. Before reading `scanFiles`, require both files to exist using the same missing-file failure pattern already used for `TerraNav.vue` and `TerraFooter.vue`.

- [ ] **Step 2: Replace page-local shell assertions with layout ownership assertions**

Remove the two assertions that require every `publicPageFiles` entry to contain `<TerraNav` and `<TerraFooter>`. Add:

```js
for (const [path, screenClass] of publicShellClasses) {
  const content = readFileSync(file(path), 'utf8')
  if (content.includes('<TerraNav') || content.includes('<TerraFooter')) {
    violations.push(`${path}: public shell navigation and footer belong only to layouts/default.vue`)
  }
  if (!content.includes(`publicScreenClass: '${screenClass}'`)) {
    violations.push(`${path}: page metadata must preserve public screen classes ${screenClass}`)
  }
  if (/<section\s+class="screen\b/.test(content)) {
    violations.push(`${path}: page must not retain the layout-owned screen root`)
  }
}
```

In the `layouts/default.vue` scan branch, require:

```js
for (const marker of [
  '<section :class="screenClasses">',
  '<TerraNav />',
  '<slot />',
  '<TerraFooter :item-total-label="itemTotalLabel" />',
  "route.meta.publicScreenClass",
  "'screen'",
  "'active'",
  'public-layout-footer-shell',
  'home-layout-footer-shell',
]) {
  if (!content.includes(marker)) {
    violations.push(`${path}: default public layout must own the exact shell marker ${marker}`)
  }
}
if ((content.match(/<TerraNav\b/g) || []).length !== 1 || (content.match(/<TerraFooter\b/g) || []).length !== 1) {
  violations.push(`${path}: default public layout must render exactly one TerraNav and one TerraFooter`)
}
```

Add exact busy-state ownership assertions:

```js
const pageBusyMarkers = new Map([
  ['pages/articles/index.vue', ['<main class="tp-public-page-shell article-layout discovery-articles-page article-route-shell tp-page-shell" :aria-busy="articleLoading">']],
  ['pages/articles/[slug].vue', [
    '<main v-if="articleLoading" class="article-detail-layout article-detail-loading" aria-live="polite" :aria-busy="articleLoading">',
    '<main v-else-if="notFoundState" class="article-detail-layout" :aria-busy="articleLoading">',
    '<main v-else-if="article" class="article-detail-layout" :aria-busy="articleLoading">',
  ]],
  ['pages/npcs/[id].vue', ['<main :class="[\'entity-detail-layout\', detailLayout.detailShellClass]" :aria-busy="loadingState">']],
  ['pages/users/[id].vue', [
    '<main v-if="loading" class="user-layout" :aria-busy="loading">',
    '<main v-else-if="notFound" class="user-layout" :aria-busy="loading">',
    '<main v-else-if="profile" class="user-layout" :aria-busy="loading">',
  ]],
])

for (const [path, markers] of pageBusyMarkers) {
  const content = readFileSync(file(path), 'utf8')
  for (const marker of markers) {
    if (!content.includes(marker)) {
      violations.push(`${path}: migrated page must preserve busy-state marker ${marker}`)
    }
  }
}

const itemDetailContent = readFileSync(file('pages/items/[id].vue'), 'utf8')
if ((itemDetailContent.match(/:aria-busy="detailLoadingState"/g) || []).length !== 3) {
  violations.push('pages/items/[id].vue: skeleton and both detail branches must preserve detailLoadingState')
}
```

- [ ] **Step 3: Lock the app, error, and SSR-safe footer channel**

Change the `app.vue` contract from direct `<NuxtPage` ownership to require:

```js
for (const marker of ['<NuxtLayout>', '<NuxtPage />', '</NuxtLayout>']) {
  if (!content.includes(marker)) {
    violations.push(`${path}: app shell must activate the default Nuxt layout via ${marker}`)
  }
}
```

Update the error-page marker list to require `NuxtLayout`, `name="default"`, and `public-screen-class="error-screen"`, while forbidding page-local `TerraNav` and `TerraFooter`.

Add the shared-state contract:

```js
if (path === 'composables/usePublicLayoutState.ts') {
  for (const marker of [
    "useState<string>('public-layout-item-total-label'",
    "'待同步'",
    'itemTotalLabel',
  ]) {
    if (!content.includes(marker)) {
      violations.push(`${path}: public layout state must expose SSR-safe item total marker ${marker}`)
    }
  }
}
```

Update the home contract to require `publicLayoutItemTotalLabel.value = itemTotalLabel.value` in `useHomeData.ts` instead of requiring a page-local footer prop. Update the footer contract to require the default `'待同步'` and forbid `'6,154'`; do not touch the separate `14,746` cleanup reserved for WP-14.

- [ ] **Step 4: Add the deterministic runtime harness**

Create `front-nuxt/scripts/check-default-layout-runtime.mjs` with
`@playwright/test`'s `chromium`. Use these fixed inputs:

```js
const mode = process.env.DEFAULT_LAYOUT_RUNTIME_MODE
const baseUrl = process.env.DEFAULT_LAYOUT_RUNTIME_BASE
const outputDir = resolve(process.env.DEFAULT_LAYOUT_RUNTIME_OUT || 'test-results/wp11-default-layout-runtime')
const routes = [
  '/', '/search', '/search-tool', '/crafting', '/categories', '/categories/weapons',
  '/biomes', '/biomes/1', '/articles/guide-true-nights-edge-demo', '/npcs', '/npcs/17',
  '/bosses', '/bosses/34', '/buffs', '/buffs/1', '/projectiles', '/armor-sets',
  '/armor-sets/109150045', '/user', '/user/login', '/user/register',
  '/user/articles', '/user/articles/new', '/user/favorites', '/user/settings',
  '/__missing-terrapedia-page',
]
const viewports = [
  { name: 'mobile', width: 390, height: 900 },
  { name: 'desktop', width: 1440, height: 1000 },
]
```

Validate `mode` as `capture` or `compare`, require an HTTP loopback base URL,
and launch only `PLAYWRIGHT_CHROMIUM`. Navigate each route with
`networkidle`, falling back to `domcontentloaded`, then evaluate:

```js
const rect = (selector) => {
  const value = document.querySelector(selector)?.getBoundingClientRect()
  return value ? {
    left: Math.round(value.left),
    top: Math.round(value.top),
    width: Math.round(value.width),
    height: Math.round(value.height),
  } : null
}

return {
  screenCount: document.querySelectorAll('.screen').length,
  navCount: document.querySelectorAll('.site-nav').length,
  footerCount: document.querySelectorAll('.camp-footer').length,
  hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  hasErrorScreen: Boolean(document.querySelector('.error-screen')),
  homeContentRect: rect('.home-lower-inner'),
  footerRect: rect('.camp-footer'),
}
```

`capture` writes `baseline.json` atomically. `compare` always writes
`candidate.json`, requires the same 52-key matrix, counts of one, no horizontal
overflow, and `.error-screen` on the missing route. For `/`, compare
`homeContentRect` and `footerRect.left/width/height` within 1px, plus the
vertical gap `footerRect.top - (homeContentRect.top + homeContentRect.height)`
within 1px. Use temporary sibling files plus `renameSync`; a failed run must
not replace prior evidence. Print the record total and exit `1` on mismatch.

- [ ] **Step 5: Capture the 52-record runtime baseline from 5181**

Run:

```bash
cd front-nuxt
test ! -e test-results/wp11-default-layout-runtime
DEFAULT_LAYOUT_RUNTIME_MODE=capture \
DEFAULT_LAYOUT_RUNTIME_BASE=http://127.0.0.1:5181 \
DEFAULT_LAYOUT_RUNTIME_OUT=test-results/wp11-default-layout-runtime \
PLAYWRIGHT_CHROMIUM="${PLAYWRIGHT_CHROMIUM:-$HOME/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome}" \
node scripts/check-default-layout-runtime.mjs
```

Expected: 25 required routes plus the custom missing route at mobile and
desktop viewports produce 52 records with one screen/nav/footer and baseline
home content/footer geometry. If the output exists, choose a new path and
carry it through every compare command; do not delete prior evidence.

- [ ] **Step 6: Run RED and verify the failure categories**

Run:

```bash
cd front-nuxt
node scripts/check-public-pages.mjs
node --check scripts/check-default-layout-runtime.mjs
```

Expected: the public-page command exits `1` because the layout/shared
composable do not exist, `app.vue` lacks `NuxtLayout`, and pages still own
their shells. The harness syntax check exits `0`. Neither may fail with an
unrelated parser, route, or asset error.

- [ ] **Step 7: Record and commit the intentional RED contract**

Append the failure categories and timestamp to the WP-11.2 devlog, then run:

```bash
git status --short
git add front-nuxt/scripts/check-public-pages.mjs front-nuxt/scripts/check-default-layout-runtime.mjs docs/devlog/entries/2026-07-19-front-wp11-default-layout.md
git diff --cached --stat
git diff --cached --check
git commit -m "test(front): lock default layout ownership"
```

Expected: one focused RED commit; no production Vue/TypeScript file or generated screenshot is staged.

### Task 2: Add the Layout and Shared Footer State (GREEN Foundation)

**Files:**
- Create: `front-nuxt/layouts/default.vue`
- Create: `front-nuxt/composables/usePublicLayoutState.ts`
- Modify: `front-nuxt/app.vue`
- Create: `front-nuxt/types/public-page-meta.d.ts`
- Modify: `front-nuxt/components/TerraFooter.vue`
- Modify: `front-nuxt/composables/useHomeData.ts`
- Modify: `front-nuxt/assets/css/hifi-preview.css`
- Test: `front-nuxt/scripts/check-public-pages.mjs`

- [ ] **Step 1: Create the SSR-safe shared layout state**

Create `front-nuxt/composables/usePublicLayoutState.ts`:

```ts
export const usePublicLayoutState = () => {
  const itemTotalLabel = useState<string>('public-layout-item-total-label', () => '待同步')

  return {
    itemTotalLabel,
  }
}
```

- [ ] **Step 2: Create the default layout with preserved screen classes**

Create `front-nuxt/layouts/default.vue`:

```vue
<script setup lang="ts">
const props = defineProps<{
  publicScreenClass?: string
}>()

const route = useRoute()
const { itemTotalLabel } = usePublicLayoutState()

const routeScreenClass = computed(() => String(
  props.publicScreenClass
  ?? route.meta.publicScreenClass
  ?? 'entity-screen',
).trim())

const screenClasses = computed(() => [
  'screen',
  ...routeScreenClass.value.split(/\s+/).filter(Boolean),
  'active',
])

const isHomeScreen = computed(() => routeScreenClass.value.split(/\s+/).includes('home-screen'))
</script>

<template>
  <section :class="screenClasses">
    <TerraNav />
    <slot />
    <div
      class="public-layout-footer-shell"
      :class="{ 'home-layout-footer-shell': isHomeScreen }"
    >
      <TerraFooter :item-total-label="itemTotalLabel" />
    </div>
  </section>
</template>
```

- [ ] **Step 3: Declare the public page metadata type**

Create `front-nuxt/types/public-page-meta.d.ts`:

```ts
declare module '#app' {
  interface PageMeta {
    publicScreenClass?: string
  }
}

export {}
```

Do not cast `route.meta` to `any`; the layout and every page use this one
typed contract.

- [ ] **Step 4: Activate layouts in `app.vue`**

Replace the template with:

```vue
<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
```

Keep the existing theme-store script unchanged.

- [ ] **Step 5: Publish the live home total into the shared channel**

Immediately after the existing `itemTotalLabel` computed in `useHomeData.ts`, add:

```ts
const { itemTotalLabel: publicLayoutItemTotalLabel } = usePublicLayoutState()

watch(
  itemTotalLabel,
  (value) => {
    publicLayoutItemTotalLabel.value = value
  },
  { immediate: true },
)
```

This runs during SSR and hydrates through Nuxt state; do not add a second `/statistics/overview` fetch in the layout.

- [ ] **Step 6: Remove the stale footer fallback**

Change only the prop default in `TerraFooter.vue`:

```ts
withDefaults(defineProps<{
  itemTotalLabel?: string
}>(), {
  itemTotalLabel: '待同步',
})
```

Keep the hard-coded link-node count unchanged for WP-14.

- [ ] **Step 7: Add the home footer geometry carrier**

Move the old footer gap and bottom padding from `.home-lower` to the new
layout carrier. Change the existing `.home-lower` padding and add:

```css
.public-layout-footer-shell {
  display: contents;
}

.home-lower {
  padding-bottom: 0;
}

.home-layout-footer-shell {
  display: block;
  overflow: hidden;
  background:
    var(--index-grid-x),
    var(--index-grid-y),
    var(--home-lower-bg);
  background-size: 40px 40px, 40px 40px, auto;
  padding: 64px 42px 92px;
}

.home-layout-footer-shell .camp-footer {
  margin-top: 0;
}
```

Do not change global `.camp-footer` geometry. The carrier preserves the old
64px pre-footer gap and 92px post-footer space after the Footer moves out of
`.home-lower`. Candidate evidence determines whether background positioning
needs one minimal layout-scoped adjustment after page migration.

- [ ] **Step 8: Run the focused contract to confirm only page/error migration remains red**

Run:

```bash
cd front-nuxt
node scripts/check-public-pages.mjs
```

Expected: exit `1` only for pages/error still owning shell markers or missing metadata. Fix any layout/composable/app/footer assertion error before continuing.

### Task 3: Migrate All Page Shells and the Error Path (GREEN)

**Files:**
- Modify: every file listed in `publicShellClasses` in Task 1
- Modify: `front-nuxt/error.vue`
- Test: `front-nuxt/scripts/check-public-pages.mjs`

- [ ] **Step 1: Add exact screen metadata to all 34 pages**

For pages without `definePageMeta`, add it at the top of `<script setup>`. For pages with authentication metadata, extend the existing object; never add a second `definePageMeta` call.

Use exactly these values from the Task 1 map:

```ts
definePageMeta({ publicScreenClass: 'home-screen' })
definePageMeta({ publicScreenClass: 'home-screen search-tool-screen' })
definePageMeta({ publicScreenClass: 'article-screen' })
definePageMeta({ publicScreenClass: 'catalog-screen' })
definePageMeta({ publicScreenClass: 'detail-screen' })
definePageMeta({ publicScreenClass: 'entity-screen crafting-screen' })
definePageMeta({ publicScreenClass: 'entity-screen' })
```

Authentication examples become:

```ts
definePageMeta({ requiresUserAuth: true, publicScreenClass: 'entity-screen' })
definePageMeta({ guestOnly: true, publicScreenClass: 'entity-screen' })
```

- [ ] **Step 2: Remove exactly one page-local shell from every page**

For each mapped file:

1. remove its single `<TerraNav />`;
2. remove its single `<TerraFooter ... />`;
3. remove only the outer `<section class="screen ... active" ...>` and its matching final `</section>`;
4. preserve all children in their original order.

Before and after each edit, use:

```bash
rg -n '<section class="screen|<TerraNav|<TerraFooter' <page-path>
```

Expected before: one root, one nav, one footer. Expected after: no match. If a file differs, stop and edit it individually rather than applying a broad regex.

- [ ] **Step 3: Preserve the five dynamic busy states**

Move each removed root `aria-busy` binding to these exact existing content
branches:

```text
pages/articles/index.vue
  -> <main class="tp-public-page-shell ..." :aria-busy="articleLoading">
pages/articles/[slug].vue
  -> each of the three mutually exclusive <main> branches gets :aria-busy="articleLoading"
pages/items/[id].vue
  -> DetailItemDetailSkeleton and both mutually exclusive detail <div> branches get :aria-busy="detailLoadingState"
pages/npcs/[id].vue
  -> <main :class="['entity-detail-layout', ...]" :aria-busy="loadingState">
pages/users/[id].vue
  -> each of the three mutually exclusive <main> branches gets :aria-busy="loading"
```

There are five dynamic roots in the fresh inventory. The source contract must be updated if this count changes before execution; do not silently drop a binding.

- [ ] **Step 4: Preserve the homepage content and let the layout own its footer**

After removing the home shell, `pages/index.vue` must contain only:

```vue
<template>
  <main class="home-main">
    <HomeHero v-bind="hero" />

    <section class="home-lower">
      <div class="home-lower-inner">
        <HomeExplorationMap :nodes="explorationNodes" />
        <HomeFeaturedRoute :route="featuredRoute" />
        <HomeBossProgression :route="bossRoute" />
        <HomeCodexBand :codex="codex" />
      </div>
    </section>
  </main>
</template>
```

The footer is not reintroduced into the page.

- [ ] **Step 5: Route the custom error page through the same layout**

Replace the error template outer shell with:

```vue
<template>
  <NuxtLayout name="default" public-screen-class="error-screen">
    <main class="error-layout">
      <section class="error-hero" aria-labelledby="error-page-title">
        <div class="error-status-card" aria-hidden="true">
          <span class="error-status-code">{{ statusCode }}</span>
          <span class="error-map-mark"></span>
        </div>

        <div class="error-copy">
          <span class="eyebrow">TERRAPEDIA ROUTE CHECK</span>
          <h1 id="error-page-title">{{ pageTitle }}</h1>
          <p>{{ pageCopy }}</p>
          <div class="error-actions">
            <button type="button" @click="goHome">返回首页</button>
            <a href="/search">搜索资料</a>
          </div>
        </div>
      </section>

      <section class="error-route-grid" aria-label="可继续浏览的入口">
        <a
          v-for="link in recoveryLinks"
          :key="link.href"
          class="error-route-card"
          :href="link.href"
        >
          <b>{{ link.label }}</b>
          <span>{{ link.desc }}</span>
        </a>
      </section>
    </main>
  </NuxtLayout>
</template>
```

Move the existing contents of `<main class="error-layout">` unchanged. Remove the error page's local `TerraNav`, `TerraFooter`, and outer `.screen`; do not change `clearError`, status handling, recovery copy, or links.

- [ ] **Step 6: Run GREEN focused contracts**

Run:

```bash
cd front-nuxt
node scripts/check-public-pages.mjs
node scripts/check-front-layout-layering-contract.mjs
node scripts/check-user-module-contract.mjs
```

Expected: all exit `0`. The first proves exact shell inventory and ownership; the latter two prove editor/account page structure was not lost during outer-root removal.

- [ ] **Step 7: Run typecheck and full frontend gate**

Run:

```bash
cd front-nuxt
pnpm exec nuxt typecheck
pnpm run check
```

Expected: both exit `0`, including the explicit
`types/public-page-meta.d.ts` augmentation. Do not cast `route.meta` to `any`.

### Task 4: Prove Runtime Shell and Visual Equivalence

**Files:**
- Modify: `front-nuxt/assets/css/hifi-preview.css` only if parity identifies a layout-owned geometry difference
- Modify: `docs/devlog/entries/2026-07-19-front-wp11-default-layout.md`
- Test: `front-nuxt/scripts/check-theme-token-visual-parity.mjs`
- Test: `front-nuxt/scripts/check-default-layout-runtime.mjs`
- Test: `front-nuxt/scripts/check-visual-regression.mjs`

- [ ] **Step 1: Start the candidate on an isolated explicit port**

Use port `15184` unless it is occupied; if occupied, choose another unused loopback port and record it.

Run:

```bash
cd front-nuxt
PORT=15184 NUXT_PUBLIC_API_BASE=http://127.0.0.1:18088/api pnpm exec nuxt dev --host 127.0.0.1 --port 15184
```

Expected: candidate `/` returns HTTP 200. Keep this foreground process in a managed terminal session and stop only this process after validation.

- [ ] **Step 2: Compare the existing 18-record baseline and classify only the unavoidable home boundary**

Run in another shell:

```bash
cd front-nuxt
THEME_TOKEN_PARITY_BASE=http://127.0.0.1:15184 \
THEME_TOKEN_PARITY_OUT=test-results/wp11-default-layout-parity \
THEME_TOKEN_PARITY_BASELINE=test-results/wp11-default-layout-parity/baseline.json \
THEME_TOKEN_PARITY_MODE=compare \
CHROMIUM_BIN="${CHROMIUM_BIN:-$HOME/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome}" \
node scripts/check-theme-token-visual-parity.mjs
```

Expected: `/items` and `/armor-sets` match all 12 non-home hashes exactly.
Because layout-only Footer ownership necessarily moves the Footer outside the
page-owned `.home-lower` DOM node, the six home hashes may differ only within
the old/new Footer boundary. `candidate.json` must contain all 18 records.
Run this manifest assertion after comparison (the compare command may exit `1`
only for the six home records):

```bash
node -e "const fs=require('fs');const b=JSON.parse(fs.readFileSync('test-results/wp11-default-layout-parity/baseline.json'));const c=JSON.parse(fs.readFileSync('test-results/wp11-default-layout-parity/candidate.json'));const bm=new Map(b.records.map(r=>[r.key,r.sha256]));const changed=c.records.filter(r=>bm.get(r.key)!==r.sha256).map(r=>r.key);const forbidden=changed.filter(k=>!k.includes('|/|'));if(forbidden.length||changed.length>6){console.error({changed,forbidden});process.exit(1)}console.log({allowedHomeChanges:changed})"
```

Then inspect `.home-lower`, `.home-layout-footer-shell`, and `.camp-footer`
computed rectangles. Require the Footer width, left edge, height, and distance
from the final `.home-lower-inner` content to match baseline within 1px at
390×900 and 1440×1000 for all three themes; require Nav/content DOM order and
zero horizontal overflow. Save before/candidate home screenshots and the
rectangle JSON under the ignored parity directory. If a measurement differs,
make the smallest layout-scoped carrier adjustment, rerun focused source
checks, and compare again. Do not permit a non-home hash difference.

- [ ] **Step 3: Verify all route shells, geometry, and the error route at runtime**

Run:

```bash
cd front-nuxt
DEFAULT_LAYOUT_RUNTIME_MODE=compare \
DEFAULT_LAYOUT_RUNTIME_BASE=http://127.0.0.1:15184 \
DEFAULT_LAYOUT_RUNTIME_OUT=test-results/wp11-default-layout-runtime \
PLAYWRIGHT_CHROMIUM="${PLAYWRIGHT_CHROMIUM:-$HOME/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome}" \
node scripts/check-default-layout-runtime.mjs

TERRAPEDIA_FRONT_NUXT_URL=http://127.0.0.1:15184 \
CHROMIUM_BIN="${CHROMIUM_BIN:-$HOME/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome}" \
node scripts/check-visual-regression.mjs
```

Expected: both exit `0`; the 52-record harness proves unique shells, custom
error rendering, no overflow, and home geometry within 1px, while the broader
visual gate covers existing representative content assertions. Generated
reports remain unstaged.

- [ ] **Step 4: Verify live and fallback footer state**

Against the candidate with backend `18088`, inspect `/` and require the first `.footer-proof b` to equal the live `itemTotalLabel` rendered by the home data. Then start a second candidate with an unreachable loopback API port and require the footer value to be `图鉴` or `待同步`, never `6,154`.

Use a CDP/Playwright evaluation or browser console expression equivalent to:

```js
document.querySelector('.footer-proof b')?.textContent?.trim()
```

Expected: live value matches the home statistics result; unavailable backend shows a truthful nonnumeric fallback and the page still renders one shell.

- [ ] **Step 5: Stop candidate processes and record evidence**

Stop only the WP-11.2 candidate process. Do not stop the inherited `5181`, backend `18088`, or unrelated worktree services. Record candidate port, focused/full gate results, 18-record parity, runtime shell/error result, and fallback evidence in the WP-11.2 entry.

### Task 5: Review, Close, and Commit WP-11.2

**Files:**
- Modify: `docs/devlog/entries/2026-07-19-front-wp11-default-layout.md`
- Modify: `docs/devlog/current.md`
- Test: all changed frontend and documentation paths

- [ ] **Step 1: Audit final scope against the specification**

Confirm:

```text
one default layout owns Nav/Footer
34 page files contain no inline shell
error.vue uses the default layout
seven original screen-class variants remain
five dynamic aria-busy bindings remain on content owners
home publishes one SSR-safe item total channel
footer has no stale 6,154 fallback
no WP-11.3+ work, backend, data, or service-lifecycle change entered the diff
```

If a gap is found, repair the plan and implementation, rerun affected focused checks, then repeat this audit.

- [ ] **Step 2: Run fresh final verification**

Run:

```bash
cd front-nuxt
node scripts/check-public-pages.mjs
node scripts/check-front-layout-layering-contract.mjs
node scripts/check-user-module-contract.mjs
pnpm run check
cd ..
git diff --check
git status --short
```

Expected: every command exits `0`; status contains only WP-11.2 code, contract, plan/devlog, and any explicitly reviewed CSS carrier adjustment. No generated artifact is tracked.

- [ ] **Step 3: Complete cross-review and devlog closeout**

Review the diff for specification coverage and code quality. Resolve every Critical or Important finding and rerun its focused evidence. Then set the WP-11.2 entry to `closed` with result, validation, residual risks, follow-up owner WP-11.3, and `commit SHA pending in final response`; remove WP-11.2 from `docs/devlog/current.md` Open Work and add it to Recently Closed.

- [ ] **Step 4: Stage explicit paths and commit**

Run:

```bash
git status --short
git add \
  front-nuxt/app.vue \
  front-nuxt/types/public-page-meta.d.ts \
  front-nuxt/layouts/default.vue \
  front-nuxt/composables/usePublicLayoutState.ts \
  front-nuxt/composables/useHomeData.ts \
  front-nuxt/components/TerraFooter.vue \
  front-nuxt/assets/css/hifi-preview.css \
  front-nuxt/scripts/check-public-pages.mjs \
  front-nuxt/scripts/check-default-layout-runtime.mjs \
  front-nuxt/pages \
  front-nuxt/error.vue \
  docs/devlog/current.md \
  docs/devlog/entries/2026-07-19-front-wp11-default-layout.md
git diff --cached --stat
git diff --cached --check
git commit -m "refactor(front): centralize public page layout"
```

Never use `git add .`.

- [ ] **Step 5: Report and preserve the branch for integration**

Run:

```bash
git status --short --branch
git rev-parse HEAD
git rev-list --left-right --count 257bde19289934dccbdbd4911da7d77b7008a6e5...HEAD
```

Expected: clean WP-11.2 worktree with local commits above `257bde19`. Report the final SHA and validation evidence. Do not push, merge to `main`, remove the worktree, or start WP-11.3 until the WP-11.2 result has been incorporated into the local integration chain under the coordinator's explicit serial step.
