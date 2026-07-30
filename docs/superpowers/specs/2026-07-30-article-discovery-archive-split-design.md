# Article Discovery And Archive Split Design

Date: 2026-07-30
Status: approved for implementation planning
Branch: `ux/detail-pages-redesign`

## Goal

Keep the existing production `/articles` presentation as the editorial discovery page, move article search into its masthead, reduce its lower latest-article list to six entries, and add a dedicated `/articles/archive` route using the approved compact card archive.

Success means:

- `/articles` keeps the current `article-approved-stage` featured lead, five-entry reading stack, live mast statistics, six-entry latest list, and current-page popular rail.
- Search is visible in `article-mast article-approved-mast` without scrolling.
- Searching never removes the featured fold; it navigates to `/articles/archive?keyword=...`.
- `/articles/archive` renders up to twelve real articles per page as four-column compact record cards on wide desktop, with no popular/topic sidebar.
- Existing article destinations, API data, pagination semantics, safe image fallback, three themes, and responsive behavior remain valid.

## Non-Goals

- Do not redesign the production navigation, breadcrumb, footer, article-detail route, or approved featured stage.
- Do not add or change backend endpoints, database fields, crawler output, article ordering, moderation, or publishing behavior.
- Do not invent tags, topic counts, global popularity, author totals, summaries, covers, or engagement values.
- Do not modify unrelated detail pages, historical design HTML, existing user-owned devlog entries outside the active Article chain, or `reports/**`.
- Do not import the visual companion's standalone palette into production.

## Route Responsibilities

### `/articles`

`/articles` is the editorial discovery route. It always loads the first twelve published records with the current public API ordering and uses the existing presentation model:

- one featured article;
- five entries in `article-reading-stack`;
- up to six entries in the lower `article-archive-layout` latest list;
- four current-page popular entries derived from the same twelve-record response.

The route does not render article search results or own a paginator after this split. Its lower section remains the current production wide-row layout and popular rail; only the number of latest rows changes from twelve to six.

### `/articles/archive`

`/articles/archive` is the complete searchable archive. It owns:

- `keyword` query state;
- `page` query state;
- the existing `limit=12` public API request;
- result count and page status;
- compact record-card rendering;
- empty, error, loading, retry, and pagination states.

It does not render the featured fold, reading stack, popular rail, or topic placeholder.

### Query Compatibility

Existing shared links must remain useful:

- `/articles?keyword=<value>` redirects to `/articles/archive?keyword=<value>`.
- `/articles?page=N` redirects to `/articles/archive?page=N` when `N > 1`.
- If both parameters exist, both are preserved.
- Bare `/articles` remains the discovery page.
- Search submission trims the keyword and resets the archive to page one.
- Clearing archive search stays on `/articles/archive` without a `keyword` query.

The redirect is a route compatibility bridge, not a second data request. `/articles` must not briefly render filtered discovery content before navigation.

## Search Placement And Behavior

The existing labelled search control moves out of `ArticleArchiveRail.vue` and into `ArticleFeatureMeta.vue`, inside `article-mast article-approved-mast`.

Desktop placement:

- Keep the current title, description, statistics, and “浏览全部” action.
- Place the search form below the mast lead copy, constrained to a readable width rather than stretching across the page.
- Keep the existing `article-archive-search-input` identifier for label and contract continuity.
- Input and submit button remain at least 44px high with the established focus ring.

Mobile placement:

- Stack title/description, search, statistics, and actions in document order.
- The input receives the flexible track and the submit button remains fully visible.
- No control may require horizontal scrolling or fall below a 44px target.

Submitting the mast search navigates directly to `/articles/archive?keyword=<trimmed value>`. “浏览全部” navigates to `/articles/archive` rather than anchoring to the lower discovery content.

The archive route retains its own equally visible search form at the top of the archive shell so a user can refine or clear a query without returning to discovery.

## Discovery Content

The existing production components and visual hierarchy remain authoritative:

- `ArticleFeatureMeta.vue` continues to own the mast and approved featured stage.
- `ArticleArchiveRail.vue` continues to own the six latest wide rows and four-entry current-page popular rail.
- The lower section heading changes only if needed to make “最新投稿” and the complete archive destination unambiguous.
- Existing `104x84` desktop and `88x72` mobile latest-row covers remain contained.
- Existing `320px` popular rail and `56x48` contained covers remain unchanged.
- The popular label remains truthful to current-page data and must not imply a global ranking.

The parent route derives a six-entry discovery projection from the same real first-page response. It must not make a second request, fabricate filler rows, or change API page size.

If fewer than six eligible articles exist, render only the available entries. If none exist, use the existing compact empty state rather than preserving blank row height.

## Archive Presentation

The archive uses the approved compact record-card option from the visual companion, adapted to the production Article theme and shell.

### Wide Desktop

- Full-width unframed archive shell with no sidebar.
- Four equal card columns and twelve cards per page, normally producing three rows.
- `10px` inter-card gap unless an existing spacing token resolves to the same approved density.
- Card radius no greater than the repository card baseline.
- No page-section card surrounding the grid and no card nested inside another card.

Each card contains:

- a stable `74x74` cover well;
- `object-fit: contain` for the existing mixed sprite, item, NPC, and article-cover sources;
- the existing safe two-character fallback when no cover resolves;
- article identity and published date;
- a title clamped to two lines;
- author, approximate reading duration, view count, and positive-only engagement metadata;
- a clear article destination with a visible hover and focus state.

The whole card may be one article link. It must not contain nested author or action links.

### Intermediate Widths

- Use only repository-approved breakpoint values.
- Collapse from four columns to three, then two, when the available card copy would otherwise become unreadable.
- Do not reduce body or metadata text below the public design-system floors to preserve a column count.

### Mobile

- One-column horizontal cards.
- Stable `88x72` contained cover well.
- Cover on the leading edge; title and metadata in the flexible content track.
- Minimum 44px interactive target and visible focus treatment.
- No horizontal document overflow, clipped long title, or layout shift during image loading.

## Theme And Background Ownership

Both routes use the established Article page ground and the three runtime themes:

- `dark` / Forest Archive;
- `morning-paper` / Linen Paper;
- `warm-slate` / Mist Workbench.

The shared theme tokens own the true page background. The Article screen may retain its existing transparent grid and localized light treatment, but the archive route must reuse that treatment rather than define a separate opaque palette.

All new production styles consume the existing semantic token flow in `tokens.css`, `hifi-preview.css`, and `detail-pages-redesign.css`. No new theme key, raw component palette, decorative blob, oversized empty hero, or marketing-style card wall is allowed.

## Data And State Boundaries

The existing `UserArticle` DTO is sufficient. The implementation may display only values already used by the production page:

- `title`, `slug`, `summary`, and `coverImage`;
- `publishedAt`, `updatedAt`, or `createdAt` through the existing published-label fallback;
- safe author display name;
- view, like, comment, and favorite counts;
- approximate reading time from `estimateArticleReadingMinutes`.

Rules:

- Engagement counts are normalized to non-negative values.
- Likes, comments, and favorites render only when greater than zero.
- Reading duration remains explicitly approximate.
- Current-page sorting must not be labelled as global popularity.
- Missing cover, author, date, or summary uses the existing truthful fallback.
- No topic grid is rendered on the archive route without a real facet source.

## Component Boundaries

Expected ownership:

- `pages/articles/index.vue`: first-page discovery data, query compatibility redirect, six-entry projection, and navigation to archive.
- `pages/articles/archive.vue`: archive query, API request, pagination, SEO, and route-level loading/error state.
- `components/article/ArticleFeatureMeta.vue`: existing mast/stage plus the moved mast search form.
- `components/article/ArticleArchiveRail.vue`: six latest rows and current-page popular rail; no search form.
- `components/article/ArticleArchiveCardGrid.vue`: archive status, search, card grid, empty state, and card links.
- `utils/articleArchive.ts`: deterministic discovery/archive projection only where a pure helper removes duplication.
- `assets/css/domains/detail-pages-redesign.css`: token-driven Article discovery and archive presentation.

Do not create a shared abstraction that couples the wide discovery rows to compact archive cards. They consume the same DTO but represent different route responsibilities and visual morphologies.

## Loading, Error, And Empty States

### Discovery

- Preserve the current loading skeleton and retry behavior.
- The six-row projection must not change the API error boundary.
- If the initial twelve-record response is empty, retain the existing compact public empty state.

### Archive

- Reserve card geometry during loading to prevent layout shift.
- Show a route-local retry action when the API request fails.
- A keyword with no matches shows a concise empty result and an operable clear-search action.
- Page numbers outside the server result are clamped or normalized using the existing pagination policy; do not display a blank page with a valid earlier page available.
- Image failure falls back within the same reserved cover well.

## SEO And Navigation

- `/articles` keeps its current discovery title and description.
- `/articles/archive` receives a distinct archive title and description.
- Keyword and page state remain deep-linkable.
- Article links preserve the current `/articles/<slug>` destination.
- Browser back returns from archive results to the discovery page or prior query without replacing history unexpectedly.
- The discovery “浏览全部” and lower complete-archive action both target `/articles/archive`.

## Contracts And Validation

Contracts must migrate before implementation and remain a ratchet: move exact ownership markers to their new files, do not broaden regexes or remove unrelated assertions.

Required contract updates include:

- `check-public-pages.mjs`: mast search destination, discovery six-entry projection, archive route/card destination, truthful metadata, article links, empty/error behavior, and query compatibility.
- `check-front-layout-layering-contract.mjs`: mast search geometry, retained production stage and discovery rail geometry, full-width archive grid, desktop/mobile card cover dimensions, theme token usage, and responsive composition.
- `check-loading-skeleton-contract.mjs`: new archive route loading ownership without changing the known armor-set baseline.
- `check-preview-image-fallback-contract.mjs`: archive card image and fallback destination.
- `check-breakpoint-whitelist-contract.mjs`: unchanged whitelist; new component CSS is automatically scanned.

Pure tests cover:

- twelve API records produce one feature, five reading entries, and six discovery rows;
- fewer records degrade without fabricated entries;
- archive preserves all twelve real page records;
- keyword submission trims input and resets page one;
- legacy `/articles` query parameters map to the archive route without loss;
- positive-only engagement and reading-time behavior remain unchanged.

Per-slice static validation:

```bash
cd front-nuxt
node --test tests/unit/articleArchive.test.mjs
pnpm run check
pnpm run check:visual-blocked-source
pnpm run check:loading-skeleton
```

`check:loading-skeleton` acceptance is relative to the recorded eight `pages/armor-sets/[id].vue` baseline findings. This task must add no Article finding and must not repair the unrelated armor page.

Runtime acceptance uses the standard local stack and checks both `/articles` and `/articles/archive` under all three themes at `1440x1000` and `390x844`:

- HTTP 200;
- correct route theme;
- one featured article, five reading entries, and at most six discovery rows;
- twelve archive cards when data permits;
- search round trip and clear-search behavior;
- pagination and direct deep links;
- no console errors, failed requests, HTTP resource errors, failed images, or horizontal overflow;
- readable text, visible focus, and 44px controls.

The server-dependent `check:light-theme`, `check:typography-spacing`, and `check:crafting-wiki-structure` probes run after the local stack is confirmed live. Existing unrelated baseline failures are recorded rather than repaired in this task.

## Implementation Sequence

1. Record the current Article contract counts and runtime baseline.
2. Add exact red contract/test expectations for query compatibility, mast search, six discovery rows, and the archive route.
3. Move search into the mast and route submissions to `/articles/archive`.
4. Reduce discovery rows to six and move pagination responsibility to the archive route.
5. Add `/articles/archive` and the compact card-grid component using live data.
6. Apply token-driven archive styles and responsive rules.
7. Run focused and full static gates.
8. Run the three-theme desktop/mobile browser matrix and compare against the approved production `/articles` plus the archive-card visual reference.
9. Keep Article implementation uncommitted until user visual acceptance, then create one focused Article commit without staging unrelated design, devlog, or report paths.

## Current-Spec Impact

This feature does not change maintained application boundaries, source-of-truth order, default commands, database ownership, or documentation placement. `docs/project-governance/00_CURRENT_SPEC.md` does not require an update.
