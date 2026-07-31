# Article Discovery And Archive Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan is serialized in the current worktree; do not dispatch subagents because the route, components, projection, stylesheet, and contracts share write targets.

**Goal:** Preserve the approved production `/articles` discovery stage, move its search into the masthead, show only post-fold records 7–12 as latest submissions, and add a dedicated searchable, paginated `/articles/archive` with twelve compact four-column record cards.

**Architecture:** `/articles` becomes a fixed first-page editorial projection over the existing public Article API, while an inline route middleware redirects legacy filtered/page-N discovery URLs before page data loads. `/articles/archive` owns keyword/page state and the same `limit=12` API request; a route-local `ArticleArchiveCardGrid` owns its search, stable loading/error/empty states, whole-card links, and Article-local image error fallback. The existing three-theme Article ground and approved featured stage remain authoritative, and all shared Article files are changed serially under exact contract ratchets.

**Tech Stack:** Nuxt 4, Vue 3 `<script setup>`, TypeScript, existing `usePublicApiFetch`/`UserArticle` DTOs, token-driven CSS, Node test runner, static contract scripts, and Playwright via the tracked `audit-shoot.mjs` harness.

---

## Goal, authority, and closure lock

The user-visible complaint being closed is that search and “浏览全部” currently overload `/articles`, remove the editorial fold, and still do not provide a visually distinct complete archive. Closure is measurable:

- bare `/articles` keeps one `article-approved-stage` lead, five `article-reading-stack` entries, current live mast statistics, up to six latest rows from positions 7–12, and the existing four-entry current-page popular rail;
- mast search is visible without scrolling and navigates to `/articles/archive?keyword=<trimmed>`;
- `/articles/archive` renders up to twelve real records with search and pagination in a four/three/two/one-column compact-card layout at the approved breakpoints;
- `/articles?keyword=...` and `/articles?page=N` (`N > 1`) redirect before discovery data fetch, preserve the supported combined query, replace history, and return SSR HTTP 302;
- three themes at `1440x1000` and `390x844` have no failed requests/images, console errors, horizontal overflow, unreadable text, missing focus indication, or sub-44px primary controls;
- `/articles/archive` resolves the static route rather than `pages/articles/[slug].vue`.

Authority order for this plan:

1. `AGENTS.md` and `docs/design/terrapedia-public-ui-design-system-v1.md`;
2. `docs/superpowers/specs/2026-07-30-article-discovery-archive-split-design.md`;
3. production `/articles` code and semantic tokens;
4. pinned archive option A only: `.superpowers/brainstorm/735713-1785419150/content/article-archive-cards-v3.html`, SHA-256 `fbe2833b8a2701cfb81d24c7772a453854e6c91a727debc5eac4a3ebc1b54edd`, `10860` bytes.

The read-only source chain remains:

```text
published Article rows
  -> backend GET /articles
  -> Nuxt proxy GET /api/articles?page=<N>&limit=12&keyword=<optional>
  -> ApiResponse<UserArticle[]> + Pagination
  -> buildArticleArchive and existing truthful presentation adapters
  -> ArticleFeatureMeta / ArticleArchiveRail / ArticleArchiveCardGrid
  -> /articles discovery and /articles/archive complete archive
```

No backend, database, crawler, moderation, publishing, ordering, tag/topic aggregation, or global-popularity change is authorized.

## Current-worktree decision and ownership

This plan deliberately uses `/home/lolben/TerraPedia` on `ux/detail-pages-redesign`. A new worktree would lose or duplicate the already reviewed, uncommitted Article implementation. The approved specification baseline is `bf213fcd`; implementation starts from a descendant containing only the separately committed plan and any plan-only repair commits after that baseline. No product file changes in those commits, and the pinned visual reference matches its approved hash and size.

Create:

- `front-nuxt/pages/articles/archive.vue` — static archive route, API/query/pagination/SEO owner.
- `front-nuxt/components/article/ArticleArchiveCardGrid.vue` — archive search/status/state/card owner with local image failure fallback.

Modify:

- `front-nuxt/utils/articleArchive.ts` — deterministic `featured`, `readingList`, `discoveryLatest`, and `archive` projection.
- `front-nuxt/tests/unit/articleArchive.test.mjs` — projection and reading-duration behavior.
- `front-nuxt/pages/articles/index.vue` — pre-fetch compatibility bridge, fixed first-page discovery fetch, mast search navigation, latest binding, no paginator.
- `front-nuxt/components/article/ArticleFeatureMeta.vue` — mast search props/emits/form and archive navigation.
- `front-nuxt/components/article/ArticleArchiveRail.vue` — latest rows plus existing popular/topic rail only; no search or pagination status.
- `front-nuxt/assets/css/domains/detail-pages-redesign.css` — mast search, archive ground, compact cards, states, and approved recomposition.
- `front-nuxt/scripts/check-public-pages.mjs` — static route/screen registration and public Article behavior destinations.
- `front-nuxt/scripts/check-user-module-contract.mjs` — move exact pagination ownership from discovery to archive and register the new presentation component.
- `front-nuxt/scripts/check-front-layout-layering-contract.mjs` — explicit archive route/component reads and exact layout/theme selectors.
- `front-nuxt/scripts/check-loading-skeleton-contract.mjs` — twelve archive-card loading slots without touching armor failures.
- `front-nuxt/scripts/check-preview-image-fallback-contract.mjs` — Article-local image error/fallback/contained-art contract.
- `front-nuxt/scripts/audit-shoot.mjs` — validation-only optional `AUDIT_THEME`; unset defaults remain byte-for-behavior compatible with the R2 audit.
- `docs/devlog/entries/2026-07-29-approved-public-pages-production.md` and `docs/devlog/current.md` — concise state/evidence/handoff updates only.

Read only:

- `front-nuxt/types/public-api.ts`, `front-nuxt/composables/usePublicApi.ts`, `front-nuxt/composables/usePreviewImage.ts`, `front-nuxt/components/common/PaginationDock.vue`, `front-nuxt/stores/theme.ts`.
- `front-nuxt/assets/css/tokens.css` and `front-nuxt/assets/css/hifi-preview.css`.
- `docs/superpowers/specs/2026-07-30-article-discovery-archive-split-design.md` and the pinned local visual reference.

User-owned and untouched:

- `docs/design/terrapedia-item-detail-hifi-v1.html`;
- `docs/design/terrapedia-npc-detail-hifi-v1.html`;
- `docs/devlog/entries/2026-07-27-detail-pages-redesign-hifi.md`;
- untracked closed `docs/devlog/entries/2026-07-29-articles-hifi.md`;
- all `reports/**`;
- Item/NPC routes, API/DB/crawler/data files, and historical design HTML.

## Contract ratchet and stop rules

- Modify a contract before its production destination. Record each expected failure text and classify it as `missing implementation` or `migration`.
- A red outside the current task whitelist stops implementation. Re-open this plan, repair the affected ownership/validation step, re-run the affected plan-auditor gates, then continue the same goal.
- Assertion call-site proxy counts may not decrease from the Task 0 baseline: public pages `352`, user module `56`, layout layering `39`, loading skeleton `21`, preview fallback `13`. Marker arrays may grow without changing these proxy counts; every moved marker must be listed one-for-one in the devlog.
- Do not widen a regex, introduce optional-class wildcards, delete an unrelated assertion, or make a static marker substitute for browser navigation proof.
- `pnpm run check:loading-skeleton` is accepted only relative to the eight known `pages/armor-sets/[id].vue` failures. No Article failure is allowed, and armor is not repaired here.
- CSS media queries use only the frozen `1180`, `900`, and `640` maximum widths. `390x844` is a probe viewport, not a media breakpoint.
- No implementation commit is created before renewed user visual acceptance. The plan document itself is committed separately; implementation rollback evidence is stored under ignored `front-nuxt/tmp/rollback/`.

Semantic assertion ledger (minimum, recorded again with actual before/after counts in the devlog):

| Contract | One-for-one migrations | Minimum additions | Permitted removals |
| --- | --- | --- | --- |
| `check-public-pages.mjs` | old combined Article search destination -> exact mast destination | Rail-search absence, fixed discovery fetch, compatibility bridge, static archive route/screen/SEO/busy/card/state/query checks | none |
| `check-user-module-contract.mjs` | three paginator markers index -> archive | archive route data/state contract plus archive-card presentation markers | none |
| `check-front-layout-layering-contract.mjs` | two content-search CSS assertions -> mast-search CSS | archive ground, grid, 3 breakpoint, image, typography, focus, and theme destinations | none |
| `check-loading-skeleton-contract.mjs` | none | archive page binding plus twelve-slot component/skeleton markers | none |
| `check-preview-image-fallback-contract.mjs` | none | local failure state, `@error`, live/fallback branches, stable well, and contained image rule | none |

Changing a marker's file/selector is a migration only when the reader-facing behavior and assertion specificity remain equal or stronger. A deleted old marker is allowed only in the same edit that adds its exact destination, so the ledger never has an unresolved removal.

## Baseline fingerprints at plan creation

The following hashes prevent silent inheritance or overwrite of the current uncommitted Article foundation:

| File | SHA-256 |
| --- | --- |
| `assets/css/domains/detail-pages-redesign.css` | `9a2ae2660c08fbea7a7b97303b462c6ea534bea45c3ebe60f91bce5d4835801b` |
| `components/article/ArticleArchiveRail.vue` | `aca5a69a41d03ee1fc9ec0720a51b36a2f7464b2dac90c65b2da2ca5e1853584` |
| `components/article/ArticleFeatureMeta.vue` | `b508b1ee692ed3d2af621dbe20136a2491aa7445bfb78ac3ae31a941948b228c` |
| `pages/articles/index.vue` | `bd7cac989bff4c8f67e9e6b531d66de66d951b927175197a5dc99b5561ea877f` |
| `scripts/check-front-layout-layering-contract.mjs` | `d04b8db3dac13e70e78a863aaf834dfb66b1da727ff597bf222ebbfc288b0b77` |
| `scripts/check-public-pages.mjs` | `ed5bdfd95c8a1f1f523b7333b722d68de4f378e557c69be1508abd50ad8b3706` |
| `tests/unit/articleArchive.test.mjs` | `1a6b9d0c62881eee37545554a07adff654e95d0f4bc28ec70d832abd7debbd44` |
| `utils/articleArchive.ts` | `96b53b8bfa29f651dd64e7eaa43244f6fe55e6e22abbb57531c1690a090be592` |
| `scripts/check-user-module-contract.mjs` | `a219d028e334402ea75f9fd0644315adf4ba34a6f4a2295d2a4bfb9c154eddb1` |
| `scripts/check-loading-skeleton-contract.mjs` | `d7f22baa70fbecdca61b52bf7d582f0205c2fe349d31896454c78868c724ad63` |
| `scripts/check-preview-image-fallback-contract.mjs` | `65ec34039c4059103d323dc77fb4eae613822807431def6e70dbdb2af3e6cf37` |
| `scripts/audit-shoot.mjs` | `bf14535a8c9a128c47e619fccb43387ab01375af45cd643d116dc7a4598a06e3` |

The standard local stack was not running when this plan was written: ports `15177`, `18191`, and `13004` had no listeners and there were no Nuxt/Java project processes. Task 0 must restore it; old runtime evidence cannot be relabelled as the new baseline.

### Task 0: Freeze the dirty baseline, rollback anchor, and live environment

**Files:**

- Create ignored: `front-nuxt/tmp/rollback/article-discovery-archive-split.patch`
- Modify: `docs/devlog/entries/2026-07-29-approved-public-pages-production.md`
- Read only: all owned and user-owned paths listed above

- [ ] **Step 1: Reconfirm branch, HEAD, dirty ownership, reference pin, and fingerprints**

Run from the repository root:

```bash
git status --short --branch
git branch --show-current
git rev-parse HEAD
sha256sum .superpowers/brainstorm/735713-1785419150/content/article-archive-cards-v3.html
stat -c '%s %y %n' .superpowers/brainstorm/735713-1785419150/content/article-archive-cards-v3.html
sha256sum \
  front-nuxt/assets/css/domains/detail-pages-redesign.css \
  front-nuxt/components/article/ArticleArchiveRail.vue \
  front-nuxt/components/article/ArticleFeatureMeta.vue \
  front-nuxt/pages/articles/index.vue \
  front-nuxt/scripts/check-front-layout-layering-contract.mjs \
  front-nuxt/scripts/check-public-pages.mjs \
  front-nuxt/tests/unit/articleArchive.test.mjs \
  front-nuxt/utils/articleArchive.ts \
  front-nuxt/scripts/check-user-module-contract.mjs \
  front-nuxt/scripts/check-loading-skeleton-contract.mjs \
  front-nuxt/scripts/check-preview-image-fallback-contract.mjs \
  front-nuxt/scripts/audit-shoot.mjs
```

Expected: branch `ux/detail-pages-redesign`; `git merge-base --is-ancestor bf213fcd HEAD` succeeds; `git diff --name-only bf213fcd..HEAD` contains only this plan document; reference hash and size match the authority block. If any owned-file hash differs from the table before this plan's implementation begins, stop and classify the new writer/change before continuing. User-owned dirty files may differ but must not be staged or edited.

- [ ] **Step 2: Save a non-destructive rollback patch with explicit paths**

Run:

```bash
mkdir -p front-nuxt/tmp/rollback
git diff --binary --output=front-nuxt/tmp/rollback/article-discovery-archive-split.patch HEAD -- \
  front-nuxt/assets/css/domains/detail-pages-redesign.css \
  front-nuxt/components/article/ArticleArchiveRail.vue \
  front-nuxt/components/article/ArticleFeatureMeta.vue \
  front-nuxt/pages/articles/index.vue \
  front-nuxt/scripts/check-front-layout-layering-contract.mjs \
  front-nuxt/scripts/check-public-pages.mjs \
  front-nuxt/tests/unit/articleArchive.test.mjs \
  front-nuxt/utils/articleArchive.ts
sha256sum front-nuxt/tmp/rollback/article-discovery-archive-split.patch
```

Expected: a non-empty ignored patch. Do not create a stash, reset, checkout, cleanup, or second worktree.

- [ ] **Step 3: Record the exact contract proxy counts and current diff boundary**

Run:

```bash
for file in \
  front-nuxt/scripts/check-public-pages.mjs \
  front-nuxt/scripts/check-user-module-contract.mjs \
  front-nuxt/scripts/check-front-layout-layering-contract.mjs \
  front-nuxt/scripts/check-loading-skeleton-contract.mjs \
  front-nuxt/scripts/check-preview-image-fallback-contract.mjs
do
  printf '%s ' "$file"
  rg -o 'violations\.push|failures\.push|requireIncludes\(|requireRegex\(|assertIncludes\(|assertContains\(|assertMarkers\(' "$file" | wc -l
done
git diff --numstat HEAD -- \
  front-nuxt/assets/css/domains/detail-pages-redesign.css \
  front-nuxt/components/article/ArticleArchiveRail.vue \
  front-nuxt/components/article/ArticleFeatureMeta.vue \
  front-nuxt/pages/articles/index.vue \
  front-nuxt/scripts/check-front-layout-layering-contract.mjs \
  front-nuxt/scripts/check-public-pages.mjs \
  front-nuxt/tests/unit/articleArchive.test.mjs \
  front-nuxt/utils/articleArchive.ts
```

Expected proxy counts: `352 / 56 / 39 / 21 / 13` in the listed order. Record the rollback-patch hash, owned-path hashes, and counts in the active devlog using `apply_patch`; do not paste a full diff or command transcript.

- [ ] **Step 4: Run focused static baseline gates**

Run:

```bash
cd front-nuxt
node --test tests/unit/articleArchive.test.mjs
pnpm run check:public-pages
pnpm run check:user-module
pnpm run check:front-layout-layering
pnpm run check:preview-images
pnpm run check:visual-blocked-source
pnpm run check
pnpm run check:loading-skeleton
```

Expected: Article tests `7/7`; public pages, user module, layout, preview, visual-blocked, and full `check` exit `0`. Loading skeleton exits `1` with exactly eight `pages/armor-sets/[id].vue` findings and zero Article finding. Any different red stops Task 0.

- [ ] **Step 5: Restore the tracked local stack and verify the live data boundary**

From the repository root run:

```bash
bash ./scripts/dev/start-local-stack.sh
curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost:15177/articles
curl -fsS 'http://localhost:15177/api/articles?page=1&limit=12' | node -e "let source=''; process.stdin.on('data', chunk => source += chunk).on('end', () => { const body = JSON.parse(source); const result = { rows: Array.isArray(body.data) ? body.data.length : -1, total: body.pagination?.total, page: body.pagination?.page, limit: body.pagination?.limit, totalPages: body.pagination?.totalPages }; console.log(JSON.stringify(result)); if (result.rows !== 12 || result.limit !== 12) process.exit(1) })"
```

Expected: `/articles` HTTP `200`; API reports `12` rows, total `24`, page `1`, limit `12`, totalPages `2`. No data refresh is run. If the tracked start script allocates a different front port, use the port printed by that script consistently and record it in the devlog before continuing.

### Task 1: Add the non-duplicating discovery projection with TDD

**Files:**

- Modify: `front-nuxt/tests/unit/articleArchive.test.mjs`
- Modify: `front-nuxt/utils/articleArchive.ts`
- Modify: `docs/devlog/entries/2026-07-29-approved-public-pages-production.md`

- [ ] **Step 1: Replace obsolete complete-archive expectations with discoveryLatest behavior**

Use these exact behavioral tests while retaining the two reading-duration tests:

```js
test('projects twelve rows into a six-entry fold and positions seven through twelve', () => {
  const result = buildArticleArchive(articles(12))

  assert.deepEqual(result.featured, { id: 1 })
  assert.deepEqual(result.readingList.map((article) => article.id), [2, 3, 4, 5, 6])
  assert.deepEqual(result.discoveryLatest.map((article) => article.id), [7, 8, 9, 10, 11, 12])
  assert.deepEqual(result.archive.map((article) => article.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
})

test('uses only positions seven and eight as latest rows for eight records', () => {
  const result = buildArticleArchive(articles(8))
  assert.deepEqual(result.discoveryLatest.map((article) => article.id), [7, 8])
})

test('renders no latest rows when exactly six records fill the fold', () => {
  const result = buildArticleArchive(articles(6))
  assert.deepEqual(result.discoveryLatest, [])
})

test('degrades fewer than six records to archive-only discovery exactly once', () => {
  const result = buildArticleArchive(articles(5))

  assert.equal(result.featured, null)
  assert.deepEqual(result.readingList, [])
  assert.deepEqual(result.discoveryLatest.map((article) => article.id), [1, 2, 3, 4, 5])
  assert.deepEqual(result.archive.map((article) => article.id), [1, 2, 3, 4, 5])
})

test('preserves every real API-page record for the dedicated archive', () => {
  assert.deepEqual(buildArticleArchive(articles(12)).archive, articles(12))
})
```

Remove the keyword-filtered fold test: keyword state no longer enters discovery projection because middleware redirects before discovery setup.

- [ ] **Step 2: Run the focused test and confirm only the new projection is red**

Run:

```bash
cd front-nuxt
node --test tests/unit/articleArchive.test.mjs
```

Expected whitelist: the four tests reading `result.discoveryLatest` fail because that property is missing; both reading-duration tests and the archive-preservation assertion remain green. A reading-time failure or changed `archive` order stops the task.

- [ ] **Step 3: Implement the minimal deterministic projection**

Replace the options/keyword branch with:

```ts
const FEATURE_FOLD_MINIMUM = 6
const READING_LIST_SIZE = 5
const DISCOVERY_LATEST_SIZE = 6
const ARTICLE_READING_CHARACTERS_PER_MINUTE = 300

export const buildArticleArchive = <T>(articles: readonly T[]) => {
  const entries = Array.isArray(articles) ? [...articles] : []

  if (entries.length < FEATURE_FOLD_MINIMUM) {
    return {
      featured: null,
      readingList: [] as T[],
      discoveryLatest: entries,
      archive: entries,
    }
  }

  return {
    featured: entries[0] ?? null,
    readingList: entries.slice(1, READING_LIST_SIZE + 1),
    discoveryLatest: entries.slice(
      READING_LIST_SIZE + 1,
      READING_LIST_SIZE + 1 + DISCOVERY_LATEST_SIZE,
    ),
    archive: entries,
  }
}
```

Retain `visibleArticleCopyLength` and `estimateArticleReadingMinutes` unchanged.

- [ ] **Step 4: Prove green and save the slice rollback patch**

Run:

```bash
node --test tests/unit/articleArchive.test.mjs
git diff --check -- utils/articleArchive.ts tests/unit/articleArchive.test.mjs
git diff --binary --output=tmp/rollback/article-projection-green.patch HEAD -- utils/articleArchive.ts tests/unit/articleArchive.test.mjs
```

Expected: `7/7` pass. Record the exact red/green result in the active devlog. Do not commit.

### Task 2: Move search into the mast and redirect legacy discovery queries before fetch

**Files:**

- Modify: `front-nuxt/scripts/check-public-pages.mjs`
- Modify: `front-nuxt/pages/articles/index.vue`
- Modify: `front-nuxt/components/article/ArticleFeatureMeta.vue`
- Modify: `docs/devlog/entries/2026-07-29-approved-public-pages-production.md`

- [ ] **Step 1: Add exact public contract destinations before production code**

Add assertions that require:

```js
// pages/articles/index.vue
'middleware: (to) => {'
"path: '/articles/archive'"
'redirectCode: 302'
'replace: true'
'const hasPageQuery = rawPage !== undefined && rawPage !== null'
'...(hasPageQuery ? { page: String(legacyPage) } : {})'
"const articleDataKey = 'public-articles:discovery:1:12'"
'page: 1'
'limit: articleLimit'
'const articleSearchQuery = ref(\'\')'
"path: '/articles/archive'"
'v-model:search-keyword="articleSearchQuery"'
'@search="submitArticleSearch"'

// components/article/ArticleFeatureMeta.vue
'searchKeyword: string'
"'update:searchKeyword': [value: string]"
'search: []'
'class="article-mast-search"'
'for="article-archive-search-input"'
'id="article-archive-search-input"'
'@submit.prevent="emit(\'search\')"'
'to="/articles/archive"'
```

Replace the existing combined `articlePresentationContent` search assertion with destination-specific checks: the mast form/ID/submission markers must be read from `ArticleFeatureMeta.vue`. The explicit absence of the form in `ArticleArchiveRail.vue` is owned by Task 3 together with removing that markup. Add an exact index-order assertion that the `definePageMeta` middleware block ends before the first `useAsyncData`, plus explicit forbiddens for an index API query bound to `currentPage.value` or `keyword.value` within the fetch block only. Do not use a regex that permits optional query ownership.

- [ ] **Step 2: Run the contract and record the expected red whitelist**

Run:

```bash
cd front-nuxt
pnpm run check:public-pages
```

Expected red messages only:

- `pages/articles/index.vue: discovery compatibility bridge must redirect legacy keyword/page queries before data fetch` (`missing implementation`);
- `pages/articles/index.vue: discovery API request must stay fixed to unfiltered page one at limit twelve` (`migration`);
- `pages/articles/index.vue: mast search must navigate to the dedicated archive and reset page state` (`migration`);
- `components/article/ArticleFeatureMeta.vue: approved mast must own the labelled archive search and complete-archive destination` (`missing implementation`).

- [ ] **Step 3: Implement inline pre-fetch middleware and fixed discovery fetch**

Use this page metadata before imports/setup data:

```ts
definePageMeta({
  publicScreenClass: 'article-screen article-index-approved-screen',
  middleware: (to) => {
    const rawKeyword = Array.isArray(to.query.keyword) ? to.query.keyword[0] : to.query.keyword
    const rawPage = Array.isArray(to.query.page) ? to.query.page[0] : to.query.page
    const legacyKeyword = String(rawKeyword ?? '').trim()
    const hasPageQuery = rawPage !== undefined && rawPage !== null && String(rawPage).trim() !== ''
    const pageCandidate = Number(rawPage ?? 1)
    const legacyPage = Number.isFinite(pageCandidate) && pageCandidate > 0 ? Math.floor(pageCandidate) : 1

    if (!legacyKeyword && legacyPage <= 1) return

    return navigateTo({
      path: '/articles/archive',
      query: {
        ...(legacyKeyword ? { keyword: legacyKeyword } : {}),
        ...(hasPageQuery ? { page: String(legacyPage) } : {}),
      },
    }, { redirectCode: 302, replace: true })
  },
})
```

Make discovery data fixed:

```ts
const router = useRouter()
const articleSearchQuery = ref('')
const articleLimit = 12
const articleDataKey = 'public-articles:discovery:1:12'

const { data: articleResponse, pending: articlePending, error: articleFetchError, refresh } = await useAsyncData(
  articleDataKey,
  () => usePublicApiFetch<UserArticle[]>('/articles', {
    query: { page: 1, limit: articleLimit },
  }),
)
```

The pagination fallback uses `page: 1`; remove discovery `route`, `currentPage`, `keyword`, page watchers, `pageHref`, and `goToPage`.

- [ ] **Step 4: Add mast props/emits/form and archive navigation**

Add to `ArticleFeatureMeta.vue`:

```ts
searchKeyword: string
```

```ts
const emit = defineEmits<{
  search: []
  'update:searchKeyword': [value: string]
}>()

const updateSearchKeyword = (event: Event) => {
  emit('update:searchKeyword', (event.target as HTMLInputElement).value)
}
```

Inside the first mast column, immediately after `.article-mast-lead`, add:

```vue
<form class="article-mast-search" role="search" aria-label="搜索公开文章" @submit.prevent="emit('search')">
  <label class="visually-hidden" for="article-archive-search-input">搜索公开文章</label>
  <input
    id="article-archive-search-input"
    :value="searchKeyword"
    type="search"
    name="keyword"
    autocomplete="off"
    placeholder="搜索标题或正文"
    @input="updateSearchKeyword"
  />
  <button type="submit">搜索</button>
</form>
```

Replace the anchor action with:

```vue
<NuxtLink class="article-mast-all" to="/articles/archive">浏览全部 →</NuxtLink>
```

In the parent use:

```ts
const submitArticleSearch = async () => {
  const nextKeyword = articleSearchQuery.value.trim()
  await router.push({
    path: '/articles/archive',
    query: nextKeyword ? { keyword: nextKeyword } : {},
  })
}
```

```vue
<ArticleFeatureMeta
  v-model:search-keyword="articleSearchQuery"
  @search="submitArticleSearch"
  ...
/>
```

- [ ] **Step 5: Prove the public contract is green without fetching filtered discovery data**

Run:

```bash
pnpm run check:public-pages
pnpm exec nuxt typecheck
```

Expected: both exit `0`. Runtime navigation is deliberately deferred until the complete archive route exists. Save `tmp/rollback/article-mast-search-green.patch` with `git diff --binary --output` over the three owned files; do not commit.

### Task 3: Make discovery latest-only and migrate pagination ownership

**Files:**

- Modify: `front-nuxt/scripts/check-public-pages.mjs`
- Modify: `front-nuxt/scripts/check-user-module-contract.mjs`
- Modify: `front-nuxt/pages/articles/index.vue`
- Modify: `front-nuxt/components/article/ArticleArchiveRail.vue`
- Modify: `docs/devlog/entries/2026-07-29-approved-public-pages-production.md`

- [ ] **Step 1: Add exact latest-only and pagination-migration contract assertions**

Public-page destinations must require:

```js
'const discoveryLatestArticles = computed(() => articlePresentation.value.discoveryLatest)'
':archive-entries="discoveryLatestArticles"'
'<h2>最新投稿</h2>'
'展示 {{ archiveEntries.length }} 篇'
'to="/articles/archive"'
'当前没有可展示的后续投稿。'
```

They must forbid in `ArticleArchiveRail.vue`:

```js
'完整收录当前公开文章'
'article-archive-search-input'
'currentPage: number'
'totalArticles: number'
"const emit = defineEmits"
```

They must forbid `CommonPaginationDock` and `@page-change="goToPage"` in `pages/articles/index.vue`.

In `check-user-module-contract.mjs`, move these three exact required markers from the index contract to a new `pages/articles/archive.vue` contract without broadening them:

```js
'CommonPaginationDock'
'@page-change="goToPage"'
'jump-id="article-archive-page-jump"'
```

Add `components/article/ArticleArchiveCardGrid.vue` to `articleIndexPresentationContracts` only in Task 4; at this step its absence is not yet asserted.

- [ ] **Step 2: Run both contracts and whitelist only the ownership migration reds**

Run:

```bash
pnpm run check:public-pages
pnpm run check:user-module
```

Expected public red: latest binding missing, false-complete copy/search ownership still present, complete-archive link missing, and paginator still on discovery. Expected user-module red: the three moved pagination markers are missing from the not-yet-created archive page, classified `missing implementation`. No Article fetch/image/title/summary marker may fail.

- [ ] **Step 3: Bind discoveryLatest and remove search/pagination from discovery**

In `pages/articles/index.vue` use:

```ts
const articlePresentation = computed(() => buildArticleArchive(articles.value))
const featuredArticle = computed(() => articlePresentation.value.featured)
const foldArticles = computed(() => articlePresentation.value.readingList)
const discoveryLatestArticles = computed(() => articlePresentation.value.discoveryLatest)
```

Pass `:archive-entries="discoveryLatestArticles"`. Remove keyword/current-page/total props, `v-model:keyword`, `@search`, and the complete `CommonPaginationDock` block from discovery.

In `ArticleArchiveRail.vue`, remove the search/current-page/total props, emit declaration, update handler, search form, and page labels. Keep the current wide rows, positive-only engagement data, four-entry popular rail with `56x48` covers, and topic `资料整理中` compact state. Use this truthful header/action:

```vue
<div class="article-library-heading">
  <div>
    <span class="eyebrow">latest · after the featured fold</span>
    <h2>最新投稿</h2>
    <p>精选首屏之后的公开文章，继续按当前发布顺序浏览。</p>
  </div>
  <div class="article-library-actions">
    <span class="article-library-page">展示 {{ archiveEntries.length }} 篇</span>
    <NuxtLink class="article-library-all" to="/articles/archive">查看完整文章库 →</NuxtLink>
  </div>
</div>
```

Use this status bar:

```vue
<div class="article-archive-tools" aria-label="最新投稿状态">
  <div><strong>本页最新投稿</strong><span>展示 {{ archiveEntries.length }} 篇</span></div>
  <p>精选首屏与最新列表不重复</p>
</div>
```

Replace the old keyword-specific row empty copy with the truthful discovery degradation:

```vue
<p v-if="!archiveEntries.length" class="article-archive-empty">当前没有可展示的后续投稿。</p>
```

This covers exactly-six and zero-record pages without implying that a search ran on discovery.

- [ ] **Step 4: Run projection, public contract, and typecheck**

Run:

```bash
node --test tests/unit/articleArchive.test.mjs
pnpm run check:public-pages
pnpm exec nuxt typecheck
```

Expected: projection `7/7`; public contract and typecheck green. `check:user-module` remains red only for the three not-yet-created archive pagination destinations. Record that intentional carried red in the devlog and continue immediately to Task 4; do not run or claim full `pnpm run check` green between these coupled migration halves.

### Task 4: Create the static archive route and compact card component

**Files:**

- Create: `front-nuxt/pages/articles/archive.vue`
- Create: `front-nuxt/components/article/ArticleArchiveCardGrid.vue`
- Modify: `front-nuxt/assets/css/domains/detail-pages-redesign.css` (only the minimal stable image well required by the preview contract; full layout follows in Task 5)
- Modify: `front-nuxt/scripts/check-public-pages.mjs`
- Modify: `front-nuxt/scripts/check-user-module-contract.mjs`
- Modify: `front-nuxt/scripts/check-loading-skeleton-contract.mjs`
- Modify: `front-nuxt/scripts/check-preview-image-fallback-contract.mjs`
- Modify: `docs/devlog/entries/2026-07-29-approved-public-pages-production.md`

- [ ] **Step 1: Register the new static route and exact state/image destinations in contracts**

In `check-public-pages.mjs`, add `pages/articles/archive.vue` to `requiredRoutes`, `publicPageFiles`, `requiredSeoRoutes`, and `publicShellClasses` with:

```js
['pages/articles/archive.vue', 'article-screen article-archive-approved-screen']
```

Also add `pages/articles/archive.vue` to the exclusion list in the fallback `publicShellClasses` map; otherwise its later generic `entity-screen` entry would overwrite the explicit archive screen class.

Add its busy marker:

```js
'<main class="tp-public-page-shell article-layout article-archive-page tp-page-shell" :aria-busy="articleLoading">'
```

Require archive API query/page state, distinct input ID, trimmed search/reset, clear behavior, retry, pagination, card links, positive-only engagement, and exact absence of the featured/popular/topic regions.

In `check-user-module-contract.mjs`, complete the archive page contract:

```js
{
  path: 'pages/articles/archive.vue',
  required: [
    'usePublicApiFetch<UserArticle[]>',
    "'/articles'",
    'articlePagination',
    'articleError',
    'articleLoading',
    'CommonPaginationDock',
    '@page-change="goToPage"',
    'jump-id="article-archive-page-jump"',
  ],
  forbidden: ['article-approved-stage', 'article-reading-stack', 'article-popular-list'],
}
```

Add a presentation contract for `ArticleArchiveCardGrid.vue` requiring the article link/title, live image, local fallback, lazy loading, and metadata, without requiring a summary that the approved compact card does not show.

In `check-loading-skeleton-contract.mjs` require:

```js
assertMarkers('pages/articles/archive.vue', [
  ':loading="articleLoading"',
  ':error-message="articleError"',
  '<ArticleArchiveCardGrid',
])

assertMarkers('components/article/ArticleArchiveCardGrid.vue', [
  'const archiveLoadingSlotCount = 12',
  'v-for="slot in archiveLoadingSlotCount"',
  'article-archive-card article-archive-card--loading',
  '<CommonTpSkeleton type="icon"',
  '<CommonTpSkeleton type="line"',
])
```

In `check-preview-image-fallback-contract.mjs`, read the card component and domain CSS explicitly and require:

```js
'failedCoverKeys'
'@error="markCoverFailed(article)"'
'v-if="hasLiveCover(article)"'
'{{ coverFallback(article) }}'
'class="article-archive-card__cover"'
```

plus exact `.article-archive-card__cover img { object-fit: contain; }` CSS. Do not add the component to the `CommonPreviewImage` loop because this approved Article-local two-character fallback is intentional.

- [ ] **Step 2: Run the four static owners and record the missing-file red whitelist**

Run:

```bash
pnpm run check:public-pages
pnpm run check:user-module
pnpm run check:loading-skeleton
pnpm run check:preview-images
```

Expected: public/user-module report only the new static route/component destinations; preview reports only the new Article-local image destinations; loading reports those new Article destinations plus the existing eight armor findings. Any Item/NPC/other page red stops the task.

- [ ] **Step 3: Create `ArticleArchiveCardGrid.vue` with this exact interface and state model**

Use:

```vue
<script setup lang="ts">
import type { UserArticle } from '~/types/public-api'

type ArticleEntry = UserArticle & { slug: string }

const props = defineProps<{
  entries: ArticleEntry[]
  loading: boolean
  errorMessage: string
  keyword: string
  searchKeyword: string
  currentPage: number
  totalPages: number
  totalArticles: number
  pageSize: number
  coverUrl: (article: ArticleEntry) => string
  coverFallback: (article: ArticleEntry) => string
  authorLabel: (article: ArticleEntry) => string
  publishedLabel: (article: ArticleEntry) => string
  viewCount: (article: ArticleEntry) => number
  likeCount: (article: ArticleEntry) => number
  commentCount: (article: ArticleEntry) => number
  favoriteCount: (article: ArticleEntry) => number
  readingMinutes: (article: ArticleEntry) => number
}>()

const emit = defineEmits<{
  search: []
  retry: []
  clear: []
  'update:searchKeyword': [value: string]
}>()

const archiveLoadingSlotCount = 12
const failedCoverKeys = ref(new Set<string>())
const updateSearchKeyword = (event: Event) => emit('update:searchKeyword', (event.target as HTMLInputElement).value)
const coverKey = (article: ArticleEntry) => `${article.id}:${props.coverUrl(article)}`
const hasLiveCover = (article: ArticleEntry) => Boolean(props.coverUrl(article)) && !failedCoverKeys.value.has(coverKey(article))
const markCoverFailed = (article: ArticleEntry) => {
  failedCoverKeys.value = new Set([...failedCoverKeys.value, coverKey(article)])
}
const rangeStart = computed(() => props.entries.length ? (props.currentPage - 1) * props.pageSize + 1 : 0)
const rangeEnd = computed(() => props.entries.length ? rangeStart.value + props.entries.length - 1 : 0)
</script>

<template>
  <section class="article-archive-page-shell" aria-labelledby="article-archive-page-title">
    <header class="article-archive-page-toolbar">
      <div>
        <strong>公开文章</strong>
        <span>共 {{ totalArticles }} 篇 · 第 {{ currentPage }} / {{ totalPages }} 页 · 每页 {{ pageSize }} 篇</span>
      </div>
      <form class="article-archive-page-search" role="search" aria-label="搜索文章资料库" @submit.prevent="emit('search')">
        <label class="visually-hidden" for="article-archive-page-search-input">搜索文章资料库</label>
        <input id="article-archive-page-search-input" :value="searchKeyword" type="search" name="keyword" autocomplete="off" placeholder="搜索标题或正文" @input="updateSearchKeyword" />
        <button type="submit">搜索</button>
        <button v-if="keyword" class="article-archive-page-clear" type="button" @click="emit('clear')">清除</button>
      </form>
    </header>

    <div v-if="loading" class="article-archive-card-grid" aria-live="polite" aria-label="文章资料库加载中">
      <article v-for="slot in archiveLoadingSlotCount" :key="`archive-loading-${slot}`" class="article-archive-card article-archive-card--loading">
        <span class="article-archive-card__cover"><CommonTpSkeleton type="icon" /></span>
        <span class="article-archive-card__copy"><CommonTpSkeleton type="line" /><CommonTpSkeleton type="line" short /></span>
        <span class="article-archive-card__meta"><CommonTpSkeleton type="pill" /><CommonTpSkeleton type="pill" /></span>
      </article>
    </div>

    <div v-else-if="errorMessage" class="support-panel user-form-status user-form-error" role="alert">
      <span>{{ errorMessage }}</span><button class="secondary-button" type="button" @click="emit('retry')">重试</button>
    </div>

    <div v-else-if="!entries.length" class="article-archive-page-empty">
      <p>{{ keyword ? `没有找到与“${keyword}”匹配的公开文章。` : '当前没有可展示的公开文章。' }}</p>
      <button v-if="keyword" class="secondary-button" type="button" @click="emit('clear')">清除搜索</button>
      <NuxtLink v-else class="secondary-button" to="/articles">返回精选文章</NuxtLink>
    </div>

    <div v-else class="article-archive-card-grid" aria-live="polite">
      <NuxtLink v-for="article in entries" :key="article.id" class="article-archive-card" :to="`/articles/${article.slug}`">
        <span class="article-archive-card__cover">
          <img v-if="hasLiveCover(article)" :src="coverUrl(article)" :alt="article.title" loading="lazy" @error="markCoverFailed(article)" />
          <span v-else class="public-article-cover-fallback" aria-hidden="true"><b>{{ coverFallback(article) }}</b><em>TerraPedia</em></span>
        </span>
        <span class="article-archive-card__copy">
          <span class="public-article-kicker"><span>公开手札</span><span>{{ publishedLabel(article) }}</span></span>
          <strong>{{ article.title }}</strong>
        </span>
        <span class="article-archive-card__meta">
          <b>{{ authorLabel(article) }}</b><span>约 {{ readingMinutes(article) }} 分钟</span><span>{{ viewCount(article) }} 浏览</span>
          <span v-if="likeCount(article) > 0">{{ likeCount(article) }} 点赞</span>
          <span v-if="commentCount(article) > 0">{{ commentCount(article) }} 评论</span>
          <span v-if="favoriteCount(article) > 0">{{ favoriteCount(article) }} 收藏</span>
          <span class="article-archive-card__action">阅读 →</span>
        </span>
      </NuxtLink>
    </div>

    <p v-if="!loading && !errorMessage && entries.length" class="article-archive-page-range">当前显示 {{ rangeStart }}–{{ rangeEnd }}，共 {{ totalArticles }} 篇</p>
  </section>
</template>
```

Add only this minimal preview-safety destination before running the Task 4 green gates:

```css
.article-archive-card__cover {
  display: grid;
  place-items: center;
  overflow: hidden;
}

.article-archive-card__cover img,
.article-archive-card__cover .public-article-cover-fallback {
  width: 100%;
  height: 100%;
}

.article-archive-card__cover img {
  object-fit: contain;
}
```

Task 5 extends these same exact selectors with dimensions, border, background, and responsive tracks; it must not duplicate a second image rule.

- [ ] **Step 4: Create `pages/articles/archive.vue` as the query/API owner**

The page script must use the existing adapters without inventing fields:

```ts
definePageMeta({ publicScreenClass: 'article-screen article-archive-approved-screen' })

import type { ApiResponse, Pagination, UserArticle } from '~/types/public-api'
import { resolvePreviewImageUrl } from '~/composables/usePreviewImage'
import { usePublicApiFetch } from '~/composables/usePublicApi'
import { estimateArticleReadingMinutes } from '~/utils/articleArchive'

const route = useRoute()
const router = useRouter()
const firstQueryValue = (value: unknown) => Array.isArray(value) ? value[0] : value
const currentPage = computed(() => {
  const value = Number(firstQueryValue(route.query.page) ?? 1)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1
})
const keyword = computed(() => String(firstQueryValue(route.query.keyword) ?? '').trim())
const articleSearchQuery = ref(keyword.value)
const articleLimit = 12
const articleDataKey = computed(() => `public-articles:archive:${currentPage.value}:${keyword.value}`)

const { data: articleResponse, pending: articlePending, error: articleFetchError, refresh } = await useAsyncData(
  articleDataKey,
  () => usePublicApiFetch<UserArticle[]>('/articles', {
    query: { page: currentPage.value, limit: articleLimit, keyword: keyword.value || undefined },
  }),
  { watch: [currentPage, keyword] },
)

const articles = computed(() => {
  const data = (articleResponse.value as ApiResponse<UserArticle[]> | null)?.data
  return Array.isArray(data) ? data.filter((article): article is UserArticle & { slug: string } => Boolean(article.slug)) : []
})
const articlePagination = computed<Pagination>(() => (articleResponse.value as ApiResponse<UserArticle[]> | null)?.pagination ?? {
  total: articles.value.length, page: currentPage.value, limit: articleLimit, totalPages: 1,
})
const articleLoading = computed(() => articlePending.value)
const articleError = computed(() => articleFetchError.value ? '文章资料库加载失败。' : '')
const totalPages = computed(() => Math.max(1, Number(articlePagination.value.totalPages ?? 1)))

const articleCoverUrl = (article: UserArticle) => resolvePreviewImageUrl(article.coverImage || '')
const articleCoverFallback = (article: UserArticle) => String(article.title || article.slug || 'TP').trim().slice(0, 2).toUpperCase()
const articleAuthorLabel = (article: UserArticle) => article.authorDisplayName || 'TerraPedia 用户'
const articleViewCount = (article: UserArticle) => Math.max(0, Number(article.viewCount ?? 0))
const articleLikeCount = (article: UserArticle) => Math.max(0, Number(article.likeCount ?? 0))
const articleCommentCount = (article: UserArticle) => Math.max(0, Number(article.commentCount ?? 0))
const articleFavoriteCount = (article: UserArticle) => Math.max(0, Number(article.favoriteCount ?? 0))
const articleReadingMinutes = (article: UserArticle) => estimateArticleReadingMinutes(article.contentHtml || article.summary || article.title)
const articlePublishedLabel = (article: UserArticle) => {
  const raw = article.publishedAt || article.updatedAt || article.createdAt
  if (!raw) return '发布时间未记录'
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

const archivePageHref = (page: number, nextKeyword = keyword.value) => ({
  path: '/articles/archive',
  query: { ...(nextKeyword ? { keyword: nextKeyword } : {}), ...(page > 1 ? { page: String(page) } : {}) },
})
const goToPage = async (page: number) => {
  if (page < 1 || page > totalPages.value) return
  await router.push(archivePageHref(page))
}
const submitArticleSearch = async () => {
  await router.push(archivePageHref(1, articleSearchQuery.value.trim()))
}
const clearArticleSearch = async () => {
  articleSearchQuery.value = ''
  await router.push('/articles/archive')
}
const retryLoad = async () => await refresh()

watch(keyword, (value) => { articleSearchQuery.value = value })

if (import.meta.server && !articleFetchError.value && currentPage.value > totalPages.value) {
  await navigateTo(archivePageHref(totalPages.value), { redirectCode: 302, replace: true })
}
if (import.meta.client) {
  watch([currentPage, totalPages, articleLoading, articleFetchError], async () => {
    if (!articleLoading.value && !articleFetchError.value && currentPage.value > totalPages.value) {
      await router.replace(archivePageHref(totalPages.value))
    }
  }, { immediate: true })
}

useSeoMeta({ title: 'TerraPedia · 文章资料库', description: '搜索并分页浏览 TerraPedia 已发布的公开文章。' })
```

Use this route template:

```vue
<main class="tp-public-page-shell article-layout article-archive-page tp-page-shell" :aria-busy="articleLoading">
  <header class="article-archive-page-heading">
    <div><TerraBreadcrumb /><span class="eyebrow">archive · published articles</span><h1 id="article-archive-page-title">文章资料库</h1><p>搜索并连续浏览全部已发布文章。</p></div>
    <NuxtLink class="article-archive-back" to="/articles">返回精选文章</NuxtLink>
  </header>
  <ArticleArchiveCardGrid
    v-model:search-keyword="articleSearchQuery"
    :entries="articles"
    :loading="articleLoading"
    :error-message="articleError"
    :keyword="keyword"
    :current-page="currentPage"
    :total-pages="totalPages"
    :total-articles="Number(articlePagination.total ?? articles.length)"
    :page-size="articleLimit"
    :cover-url="articleCoverUrl"
    :cover-fallback="articleCoverFallback"
    :author-label="articleAuthorLabel"
    :published-label="articlePublishedLabel"
    :view-count="articleViewCount"
    :like-count="articleLikeCount"
    :comment-count="articleCommentCount"
    :favorite-count="articleFavoriteCount"
    :reading-minutes="articleReadingMinutes"
    @search="submitArticleSearch"
    @clear="clearArticleSearch"
    @retry="retryLoad"
  />
  <CommonPaginationDock v-if="!articleLoading && !articleError && totalPages > 1" :current-page="currentPage" :total-pages="totalPages" :disabled="articleLoading" aria-label="文章资料库分页" jump-id="article-archive-page-jump" show-boundary-controls @page-change="goToPage" />
</main>
```

- [ ] **Step 5: Run the behavior contracts before visual CSS**

Run:

```bash
pnpm run check:public-pages
pnpm run check:user-module
pnpm run check:preview-images
pnpm run check:loading-skeleton
pnpm exec nuxt typecheck
```

Expected: public/user/preview/typecheck green. Loading has only the eight baseline armor findings and no Article finding. Save a rollback patch over the new route/component and five contracts; do not commit.

### Task 5: Apply exact token-driven mast/archive geometry with layout contract first

**Files:**

- Modify: `front-nuxt/scripts/check-front-layout-layering-contract.mjs`
- Modify: `front-nuxt/assets/css/domains/detail-pages-redesign.css`
- Modify: `docs/devlog/entries/2026-07-29-approved-public-pages-production.md`

- [ ] **Step 1: Add exact layout/theme assertions before CSS**

Read `pages/articles/archive.vue`, `components/article/ArticleFeatureMeta.vue`, and `components/article/ArticleArchiveCardGrid.vue` explicitly. Migrate the two existing Article content-search layout assertions from `.article-approved-content .article-archive-search` to `.article-approved-mast .article-mast-search` one-for-one before adding archive assertions. Add exact assertions for:

- mast search `minmax(220px, 420px) / auto`, 44px controls, and mobile `minmax(0, 1fr) / auto`;
- archive dark ground using existing Article grid/radial/page tokens and fixed attachment;
- light archive ground flattened to `var(--tp-color-page)`;
- four columns and `10px` gap above `1180px`;
- three columns inside the exact `max-width: 1180px` block;
- two columns inside the exact `max-width: 900px` block;
- one horizontal column inside the exact `max-width: 640px` block;
- desktop `74x74` and mobile `88x72` contained cover wells;
- metadata `12px` minimum, two-line title clamp, radius `var(--tp-radius-card)`, 44px target, and 3px focus ring;
- no archive sidebar, opaque local palette, raw hex, or `390px` media query.

- [ ] **Step 2: Run layout contract and whitelist exact missing CSS destinations**

Run:

```bash
pnpm run check:front-layout-layering
```

Expected: only the ten destination groups listed in Step 1 are red, all classified `missing implementation`. Existing featured-stage, wide-row, `320px` popular rail, and mobile discovery assertions remain green.

- [ ] **Step 3: Move search CSS from the discovery content shell into the mast**

Replace the existing `.article-approved-mast > div:first-child { gap: 10px; }` block with the display/grid version below, then remove the now-unused `.article-approved-content .article-archive-search` desktop/mobile rules and add:

```css
.article-approved-mast > div:first-child {
  display: grid;
  gap: 10px;
}

.article-approved-mast .article-mast-search {
  display: grid;
  grid-template-columns: minmax(220px, 420px) auto;
  gap: var(--tp-space-2);
  width: min(100%, 520px);
}

.article-approved-mast .article-mast-search :is(input, button) {
  min-height: var(--tp-touch-target);
  border: 1px solid var(--tp-color-border-strong);
  border-radius: var(--tp-radius-control);
}

.article-approved-mast .article-mast-search input {
  min-width: 0;
  background: var(--tp-color-surface-soft);
  padding: 0 var(--tp-space-3);
  color: var(--tp-color-text);
}

.article-approved-mast .article-mast-search button {
  background: var(--button-primary-bg);
  box-shadow: var(--button-primary-shadow);
  padding: 0 var(--tp-space-4);
  color: var(--button-primary-fg);
  font-weight: var(--tp-font-weight-heavy);
}

.article-approved-mast .article-mast-search :is(input, button):focus-visible {
  outline: 3px solid var(--button-focus-ring);
  outline-offset: 2px;
}
```

Inside the existing `max-width: 640px` block add:

```css
.article-approved-mast .article-mast-search {
  grid-template-columns: minmax(0, 1fr) auto;
  width: 100%;
}
```

- [ ] **Step 4: Add the archive screen, toolbar, cards, and state styles**

Edit the minimal preview block from Task 4 in place; do not paste a second `.article-archive-card__cover img` rule. Append the following declarations to that existing selector set within the approved Article domain block:

```css
.article-archive-approved-screen {
  --article-archive-card-bg: color-mix(in srgb, var(--tp-color-surface) 72%, transparent);
  --article-archive-card-hover: color-mix(in srgb, var(--tp-color-positive) 8%, var(--tp-color-surface));
}

[data-theme="dark"] .article-archive-approved-screen {
  background:
    var(--index-grid-x),
    var(--index-grid-y),
    radial-gradient(760px 380px at 74% 8%, color-mix(in srgb, var(--tp-color-positive) 11%, transparent), transparent 70%),
    linear-gradient(var(--tp-color-page), var(--tp-color-page));
  background-size: 40px 40px, 40px 40px, auto, auto;
  background-attachment: fixed;
}

.article-archive-page {
  grid-template-columns: minmax(0, 1fr);
  gap: var(--tp-space-5);
  align-items: start;
  padding: 12px 0 48px;
}

.article-archive-page-heading {
  display: flex;
  gap: var(--tp-space-6);
  align-items: end;
  justify-content: space-between;
  border-bottom: 1px solid var(--tp-color-border-strong);
  padding-bottom: var(--tp-space-4);
}

.article-archive-page-heading h1,
.article-archive-page-heading p { margin: 0; }
.article-archive-page-heading h1 { margin-top: var(--tp-space-1); font-size: 30px; }
.article-archive-page-heading p { margin-top: var(--tp-space-2); color: var(--tp-color-text-muted); font-size: 13px; }

.article-archive-back {
  display: inline-flex;
  min-height: var(--tp-touch-target);
  align-items: center;
  color: var(--tp-color-link);
  font-weight: var(--tp-font-weight-heavy);
  text-decoration: none;
}

.article-archive-page-shell { display: grid; gap: var(--tp-space-4); min-width: 0; }
.article-archive-page-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 480px);
  gap: var(--tp-space-4);
  align-items: end;
}
.article-archive-page-toolbar > div { display: grid; gap: var(--tp-space-1); }
.article-archive-page-toolbar span { color: var(--tp-color-text-muted); font-size: 12px; }

.article-archive-page-search { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: var(--tp-space-2); }
.article-archive-page-search :is(input, button) { min-height: var(--tp-touch-target); border: 1px solid var(--tp-color-border-strong); border-radius: var(--tp-radius-control); }
.article-archive-page-search input { min-width: 0; background: var(--tp-color-surface-soft); padding: 0 var(--tp-space-3); color: var(--tp-color-text); }
.article-archive-page-search button { background: var(--button-primary-bg); padding: 0 var(--tp-space-4); color: var(--button-primary-fg); font-weight: var(--tp-font-weight-heavy); }
.article-archive-page-search .article-archive-page-clear { background: var(--button-secondary-bg); color: var(--button-secondary-fg); }

.article-archive-card-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; min-width: 0; }
.article-archive-card {
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr);
  grid-template-rows: auto auto;
  gap: 8px 10px;
  min-width: 0;
  min-height: 138px;
  border: 1px solid var(--tp-color-border);
  border-radius: var(--tp-radius-card);
  background: var(--article-archive-card-bg);
  padding: 10px;
  color: inherit;
  text-decoration: none;
  transition: background var(--tp-motion-fast) var(--tp-motion-ease), border-color var(--tp-motion-fast) var(--tp-motion-ease);
}
.article-archive-card:hover { border-color: var(--tp-color-border-strong); background: var(--article-archive-card-hover); }
.article-archive-card__cover { display: grid; grid-row: 1 / 3; width: 74px; height: 74px; place-items: center; overflow: hidden; border: 1px solid var(--tp-color-border); background: var(--tp-color-surface-soft); }
.article-archive-card__cover img,
.article-archive-card__cover .public-article-cover-fallback { width: 100%; height: 100%; }
.article-archive-card__cover img { object-fit: contain; }
.article-archive-card__copy { display: grid; align-content: start; gap: var(--tp-space-2); min-width: 0; }
.article-archive-card__copy > strong { display: -webkit-box; overflow: hidden; color: var(--tp-color-text-strong); font-size: 14px; line-height: 1.4; overflow-wrap: anywhere; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.article-archive-card__meta { display: flex; grid-column: 1 / -1; flex-wrap: wrap; gap: 5px 9px; align-items: center; border-top: 1px solid var(--tp-color-border); padding-top: 8px; color: var(--tp-color-text-muted); font-size: 12px; }
.article-archive-card__meta b { color: var(--tp-color-text); }
.article-archive-card__action { margin-left: auto; color: var(--tp-color-link); font-weight: var(--tp-font-weight-heavy); }
.article-archive-card--loading { pointer-events: none; }
.article-archive-card--loading .article-archive-card__copy { gap: var(--tp-space-2); }
.article-archive-page-empty { display: grid; min-height: 180px; place-items: center; gap: var(--tp-space-3); border-block: 1px solid var(--tp-color-border); color: var(--tp-color-text-muted); text-align: center; }
.article-archive-page-range { margin: 0; border-top: 1px solid var(--tp-color-border); padding-top: var(--tp-space-3); color: var(--tp-color-text-muted); font-size: 12px; }
.article-archive-approved-screen :where(a, button, input):focus-visible { outline: 3px solid var(--button-focus-ring); outline-offset: 2px; }

:where([data-theme="morning-paper"], [data-theme="warm-slate"]) .article-archive-approved-screen {
  --article-archive-card-bg: var(--tp-color-surface);
  --article-archive-card-hover: var(--tp-color-surface-raised);
  background: var(--tp-color-page);
}

@media (max-width: 1180px) { .article-archive-card-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 900px) {
  .article-archive-page-toolbar { grid-template-columns: minmax(0, 1fr); }
  .article-archive-card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .article-archive-page-heading { align-items: flex-start; flex-direction: column; }
  .article-archive-page-search { grid-template-columns: minmax(0, 1fr) auto; }
  .article-archive-page-search .article-archive-page-clear { grid-column: 1 / -1; }
  .article-archive-card-grid { grid-template-columns: minmax(0, 1fr); }
  .article-archive-card { grid-template-columns: 88px minmax(0, 1fr); min-height: 126px; }
  .article-archive-card__cover { grid-row: 1 / 3; width: 88px; height: 72px; }
  .article-archive-card__meta { grid-column: 2; }
}
@media (prefers-reduced-motion: reduce) { .article-archive-card { transition: none; } }
```

No raw hex value is added. Keep the existing discovery stage, row, popular-rail, and light-theme declarations unless an exact selector migration above replaces dead search CSS.

- [ ] **Step 5: Run the layout, breakpoint, preview, and type gates**

Run:

```bash
pnpm run check:front-layout-layering
pnpm run check:breakpoints
pnpm run check:preview-images
pnpm exec nuxt typecheck
git diff --check
```

Expected: all exit `0`; proxy layout count is at least `39`; no `max-width: 390px`, no failed contained-image assertion, and no raw component palette. Record the red/green count and selector destinations in the devlog.

### Task 6: Make the existing screenshot harness theme-selectable without changing defaults

**Files:**

- Modify: `front-nuxt/scripts/audit-shoot.mjs`
- Modify: `docs/devlog/entries/2026-07-29-approved-public-pages-production.md`

- [ ] **Step 1: Add validated optional theme input and cookie setup**

Add near the existing env parsing:

```js
const AUDIT_THEME = String(process.env.AUDIT_THEME || '').trim()
const ALLOWED_THEMES = new Set(['dark', 'morning-paper', 'warm-slate'])
if (AUDIT_THEME && !ALLOWED_THEMES.has(AUDIT_THEME)) {
  throw new Error('AUDIT_THEME must be dark, morning-paper, or warm-slate')
}
```

Immediately after each `browser.newContext` call and before `newPage()` add:

```js
if (AUDIT_THEME) {
  await ctx.addCookies([{ name: 'terrapedia-theme', value: AUDIT_THEME, url: BASE }])
}
```

After the existing height/overflow reads, use this exact result construction:

```js
const appliedTheme = await page.evaluate(() => document.documentElement.dataset.theme || '')
const result = { name, vp: vpName, theme: AUDIT_THEME || 'default', appliedTheme, status, height, hasHScroll }
```

If `AUDIT_THEME` is set, assert `appliedTheme === AUDIT_THEME` before pushing the result. Do not change `DEFAULT_ROUTES`, `DEFAULT_VIEWPORTS`, default output, executable-path resolution, console handling, or request-failure handling.

- [ ] **Step 2: Verify validation and unchanged unset behavior**

Run:

```bash
AUDIT_THEME=invalid AUDIT_ROUTES='[]' AUDIT_VIEWPORTS='[]' node scripts/audit-shoot.mjs
AUDIT_ROUTES='[]' AUDIT_VIEWPORTS='[]' node scripts/audit-shoot.mjs
```

Expected: invalid theme fails with the exact validation message; unset theme exits `0` and prints an empty JSON result without launching route probes. This validation-only edit does not alter production UI behavior.

### Task 7: Run full static gates and real route acceptance

**Files:**

- Create ignored evidence: `front-nuxt/tmp/shots/2026-07-31-article-archive-split/**`
- Modify: `docs/devlog/entries/2026-07-29-approved-public-pages-production.md`
- Modify: `docs/devlog/current.md`

- [ ] **Step 1: Run every static owner and full frontend gate**

Run:

```bash
cd front-nuxt
node --test tests/unit/articleArchive.test.mjs
pnpm run check:public-pages
pnpm run check:user-module
pnpm run check:front-layout-layering
pnpm run check:preview-images
pnpm run check:breakpoints
pnpm run check:visual-blocked-source
pnpm run check
pnpm run check:loading-skeleton
git diff --check
```

Expected: unit `7/7`; all gates except loading-skeleton exit `0`; loading-skeleton has exactly the eight baseline armor findings and no Article finding. Re-run the proxy-count command; none of `352 / 56 / 39 / 21 / 13` may decrease.

- [ ] **Step 2: Verify direct HTTP routing and SSR redirects**

Run against the Task 0 front port:

```bash
curl -fsS -o /dev/null -w 'discovery %{http_code} %{url_effective}\n' http://localhost:15177/articles
curl -fsS -o /dev/null -w 'archive %{http_code} %{url_effective}\n' http://localhost:15177/articles/archive
curl -sS -o /dev/null -D - 'http://localhost:15177/articles?keyword=真永夜' | sed -n '1,12p'
curl -sS -o /dev/null -D - 'http://localhost:15177/articles?page=2&keyword=真永夜' | sed -n '1,12p'
```

Expected: both canonical routes `200`; legacy URLs return HTTP `302` with archive `Location` preserving `keyword` and `page=2`. Pair this runtime evidence with the public contract's exact source-order assertion (`definePageMeta` middleware block occurs before the first `useAsyncData`) and fixed discovery request assertion; together they prove the bridge completes before discovery data setup rather than merely hiding filtered DOM. There must be no `/articles/slug/archive` response path.

- [ ] **Step 3: Capture the three-theme by two-viewport matrix**

Run once per theme:

```bash
for theme in dark morning-paper warm-slate
do
  AUDIT_BASE=http://localhost:15177 \
  AUDIT_THEME="$theme" \
  AUDIT_OUT="tmp/shots/2026-07-31-article-archive-split/$theme" \
  AUDIT_ROUTES='[["articles-discovery","/articles"],["articles-archive","/articles/archive"]]' \
  AUDIT_VIEWPORTS='[["desktop",{"width":1440,"height":1000}],["mobile",{"width":390,"height":844}]]' \
  node scripts/audit-shoot.mjs
done
sha256sum tmp/shots/2026-07-31-article-archive-split/*/*.png
```

Expected: 12 route/theme/viewport probes are HTTP `200`, report the requested live theme, have no `errors` array, and `hasHScroll: false`. The archive desktop contains 12 cards when live data permits; discovery contains 1 feature, 5 reading entries, and 6 latest rows.

- [ ] **Step 4: Prove navigation behavior and static-route ownership in Chromium**

Use `apply_patch` to create the ignored `front-nuxt/tmp/article-archive-flow-check.mjs` with this executable probe, then run it from `front-nuxt`:

```js
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const base = process.env.AUDIT_BASE || 'http://localhost:15177'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM || `${process.env.HOME}/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`
const browser = await chromium.launch({ executablePath })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
await context.addCookies([{ name: 'terrapedia-theme', value: 'dark', url: base }])
const page = await context.newPage()
const errors = []
page.on('console', (message) => { if (message.type() === 'error') errors.push(`console:${message.text()}`) })
page.on('requestfailed', (request) => errors.push(`requestfailed:${request.url()}`))

const hrefs = (selector) => page.locator(selector).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')).filter(Boolean))
const assertNoOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false)

await page.goto(`${base}/articles`, { waitUntil: 'networkidle' })
assert.equal(await page.locator('.article-featured-story').count(), 1)
assert.equal(await page.locator('.article-reading-stack .article-fold-row').count(), 5)
assert.equal(await page.locator('.article-archive-row').count(), 6)
const foldHrefs = await hrefs('.article-approved-stage .article-featured-story a[href^="/articles/"]')
const latestHrefs = await hrefs('.article-archive-row a[href^="/articles/"]')
assert.equal(foldHrefs.some((href) => latestHrefs.includes(href)), false)
await assertNoOverflow()

await page.locator('#article-archive-search-input').fill('  真永夜  ')
await Promise.all([
  page.waitForURL('**/articles/archive?keyword=*'),
  page.locator('.article-mast-search button[type="submit"]').click(),
])
assert.match(page.url(), /\/articles\/archive\?keyword=%E7%9C%9F%E6%B0%B8%E5%A4%9C$/)
assert.equal(await page.locator('.article-featured-story').count(), 0)
await page.goBack({ waitUntil: 'networkidle' })
assert.equal(new URL(page.url()).pathname, '/articles')
assert.equal(await page.locator('.article-featured-story').count(), 1)

await page.goto(`${base}/articles/archive`, { waitUntil: 'networkidle' })
assert.equal(await page.locator('.article-archive-card').count(), 12)
assert.equal(await page.locator('#article-archive-page-search-input').count(), 1)
await page.locator('#article-archive-page-search-input').fill('真永夜')
await Promise.all([
  page.waitForURL('**/articles/archive?keyword=*'),
  page.locator('.article-archive-page-search button[type="submit"]').click(),
])
assert.match(page.url(), /\/articles\/archive\?keyword=/)
await Promise.all([
  page.waitForURL('**/articles/archive'),
  page.locator('.article-archive-page-clear').click(),
])
assert.equal(new URL(page.url()).search, '')

await page.locator('.article-archive-card').first().waitFor()
const nextPage = page.locator('.catalog-dock-icon-button[aria-label="下一页"]')
if (await nextPage.isEnabled()) {
  await Promise.all([page.waitForURL('**/articles/archive?page=2'), nextPage.click()])
  assert.equal(new URL(page.url()).searchParams.get('page'), '2')
  await page.goBack({ waitUntil: 'networkidle' })
  assert.equal(new URL(page.url()).searchParams.get('page'), null)
}

for (const legacyPath of ['/articles?keyword=%E7%9C%9F%E6%B0%B8%E5%A4%9C', '/articles?page=2']) {
  const response = await page.goto(`${base}${legacyPath}`, { waitUntil: 'domcontentloaded' })
  assert.equal(response?.status(), 200)
  assert.equal(new URL(page.url()).pathname, '/articles/archive')
}

await page.goto(`${base}/articles/archive`, { waitUntil: 'networkidle' })
assert.equal(await page.locator('.article-detail-layout').count(), 0)
assert.equal(await page.locator('.article-archive-card-grid').count(), 1)
assert.equal(errors.length, 0, errors.join('\n'))
for (const image of await page.locator('img').all()) {
  await image.scrollIntoViewIfNeeded()
  assert.equal(await image.evaluate((node) => node.complete && node.naturalWidth > 0), true)
}
for (const selector of ['#article-archive-page-search-input', '.article-archive-card', '.catalog-dock-icon-button']) {
  const target = page.locator(selector).first()
  if (await target.count()) {
    await target.focus()
    const style = await target.evaluate((node) => ({ height: node.getBoundingClientRect().height, outline: getComputedStyle(node).outlineStyle, width: getComputedStyle(node).outlineWidth }))
    assert.ok(style.height >= 44, `${selector} target is ${style.height}px`)
    assert.equal(style.outline, 'solid')
    assert.equal(style.width, '3px')
  }
}
await assertNoOverflow()
console.log(JSON.stringify({ url: page.url(), errors, archiveCards: await page.locator('.article-archive-card').count() }))
await context.close()
await browser.close()
```

```bash
AUDIT_BASE=http://localhost:15177 node tmp/article-archive-flow-check.mjs
```

The probe records request URLs and final URLs through Playwright's page events and verifies these exact scenarios:

1. `/articles`: collect feature/reading/latest article hrefs; assert counts `1 / 5 / 6` and no href intersection between fold and latest.
2. Fill `#article-archive-search-input` with surrounding spaces around `真永夜`, submit, and assert final URL `/articles/archive?keyword=%E7%9C%9F%E6%B0%B8%E5%A4%9C`; browser back restores `/articles` with the feature still present.
3. On archive, fill `#article-archive-page-search-input`, submit, assert page resets to one; use clear and assert bare `/articles/archive`.
4. Use `CommonPaginationDock` to reach page 2 and browser back to page 1.
5. Direct `/articles?keyword=真永夜` and `/articles?page=2` must make only the equivalent archive list request; neither may issue a page-one discovery list request first.
6. Direct `/articles/archive` must not request `/api/articles/slug/archive` and must render `.article-archive-card-grid`, not an article-detail shell.
7. Scroll every lazy image into view and assert `complete && naturalWidth > 0` for rendered images; intentional fallback wells are not counted as broken images.
8. Focus mast/archive search, archive cards, clear/retry where present, and pagination controls; assert a visible `3px` outline and at least `44px` target height.

If any scenario fails, save the failing screenshot/request list, return to the owning task, add a focused red contract/test, implement the smallest correction, then repeat Tasks 7.1–7.4. Do not weaken the acceptance script or hide request errors. The ignored probe is deleted after its hash and result are recorded, just like the obsolete `.shot.mjs` disposition.

- [ ] **Step 5: Run server-dependent cross-route probes against the live stack**

Run:

```bash
pnpm run check:light-theme
pnpm run check:typography-spacing
pnpm run check:crafting-wiki-structure
```

Expected: compare to the Task 0 same-server baseline. No new `/articles` or `/articles/archive` finding is permitted. Preserve the known unrelated homepage/historical-route, `/search ready`, and `/crafting` findings; do not repair them in this task.

- [ ] **Step 6: Perform the design-system review checklist**

Record explicit pass/fail for:

- Article archetype remains editorial discovery plus dense archive;
- data and real covers remain the visual subject;
- ground/band/surface/object depth is distinguishable in dark without becoming a black card wall;
- both light themes are flat, low saturation, and readable;
- no nested cards, new palette, fake art, fake aggregation, oversized hero, or sparse long archive;
- card title/date/author/read time/view signals remain legible at desktop and mobile;
- whole-card links have no nested links and keyboard order matches visual order;
- all image wells reserve dimensions and use contained art;
- controls are labelled, focus-visible, and at least 44px.

The generic UI helper's optional search database is not an authority. Repository tokens, the approved specification, and runtime evidence decide this review.

### Task 8: Scope review, devlog handoff, and user visual acceptance

**Files:**

- Modify: `docs/devlog/entries/2026-07-29-approved-public-pages-production.md`
- Modify: `docs/devlog/current.md`
- Read only: all git status paths

- [ ] **Step 1: Record concise result/evidence/risk state**

Update the active entry with: final route responsibilities; contract before/after proxy counts; exact red whitelist disposition; unit/static/runtime results; screenshot directory and SHA-256 list; live port; any unrelated baseline reds; and residual risks. Use “See git for code-level diff details.” rather than pasting diffs.

Keep status `active` while awaiting user visual acceptance. `docs/devlog/current.md` must point the next agent to `/articles` and `/articles/archive` and retain the correct branch/worktree/dependency/contract handoff fields.

- [ ] **Step 2: Prove no scope leakage**

Run:

```bash
git status --short
git diff --name-only HEAD
git diff --check
```

Relative to Task 0, new/changed paths may be only the ownership list in this plan. The pre-existing two design HTML files, closed old devlogs, and every `reports/**` file must be unchanged and unstaged. Do not use `git add .`.

- [ ] **Step 3: Hand the user the live validation links**

Provide:

```text
http://localhost:15177/articles
http://localhost:15177/articles/archive
http://localhost:15177/articles/archive?keyword=真永夜
http://localhost:15177/articles/archive?page=2
```

If the stack selected a different port in Task 0, substitute that recorded port. Keep implementation uncommitted until the user accepts the visual result.

### Task 9: Commit only after explicit visual acceptance

**Files:** all implementation-owned paths and active devlog/current-state files only

- [ ] **Step 1: Load commit and verification guards, then re-run final evidence**

Required sub-skills: `verification-before-completion`, `git-hygiene-guard`, `terrapedia-devlog-guard`, and `terrapedia-task-commit`. Re-run Task 7.1, `git status --short`, and inspect the full diff.

- [ ] **Step 2: Close or mark the devlog ready according to actual commit timing**

Only after all review findings are resolved, update result, validation, residual risk, and follow-up. Use the repository pending-SHA closeout rule exactly; if commit fails, reopen the entry before any other work.

- [ ] **Step 3: Stage explicit paths and create one focused implementation commit**

Stage only:

```bash
git add \
  front-nuxt/pages/articles/archive.vue \
  front-nuxt/pages/articles/index.vue \
  front-nuxt/components/article/ArticleArchiveCardGrid.vue \
  front-nuxt/components/article/ArticleFeatureMeta.vue \
  front-nuxt/components/article/ArticleArchiveRail.vue \
  front-nuxt/utils/articleArchive.ts \
  front-nuxt/tests/unit/articleArchive.test.mjs \
  front-nuxt/assets/css/domains/detail-pages-redesign.css \
  front-nuxt/scripts/check-public-pages.mjs \
  front-nuxt/scripts/check-user-module-contract.mjs \
  front-nuxt/scripts/check-front-layout-layering-contract.mjs \
  front-nuxt/scripts/check-loading-skeleton-contract.mjs \
  front-nuxt/scripts/check-preview-image-fallback-contract.mjs \
  front-nuxt/scripts/audit-shoot.mjs \
  docs/devlog/entries/2026-07-29-approved-public-pages-production.md \
  docs/devlog/current.md
git diff --cached --stat
git diff --cached --name-status
git commit -m "feat(front): split article discovery and archive"
```

Do not stage the already separately committed plan, unrelated design HTML, old entries, or reports. Leave the branch/worktree open. Do not push, merge, tag, stash, or clean without a new explicit user request.

## Execution-continuity decision tree

```text
expected red only
  -> implement smallest owned destination
  -> focused green
  -> continue same task

unexpected static red
  -> stop production edits
  -> identify exact owner and whether it is a migration or real regression
  -> patch this plan and re-audit affected gates
  -> add focused red assertion/test
  -> resume same user goal

runtime failure with green static contracts
  -> save request/console/geometry evidence
  -> reproduce one route/theme/viewport
  -> add a focused executable tripwire
  -> repair the source, never the symptom or acceptance probe

required backend/data/crawler/source-policy change
  -> stop implementation
  -> keep current work recoverable and devlog active
  -> request explicit user authority; do not fabricate the missing signal
```

`docs/project-governance/00_CURRENT_SPEC.md` is unchanged because this task does not alter maintained app boundaries, source-of-truth order, default commands, database ownership, or documentation placement.
