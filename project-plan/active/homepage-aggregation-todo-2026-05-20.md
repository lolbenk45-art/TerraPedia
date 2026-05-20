# Homepage Aggregation TODO

Status: deferred
Created: 2026-05-20
Branch: `feat/homepage-rework-2026-05-20`

This note records the homepage aggregation/data gaps intentionally left out of the current homepage rework. The current branch keeps the homepage usable with frontend fallback data and only consumes the existing `/statistics/overview` endpoint for basic counts.

## Deferred Scope

- [ ] Add a public homepage aggregation endpoint, proposed as `/api/public/home/featured` or equivalent routed form.
- [ ] Define the homepage DTO contract before implementation:
  - `primaryEntries`
  - `progressionStages`
  - `explorationNodes`
  - `featuredRoute`
  - `recentUpdates`
  - `trendingArticles`
  - `stats`
- [ ] Build a real `recentUpdates` source for mixed homepage activity, covering at minimum items and published articles, and later Boss/NPC when those public aggregation surfaces are stable.
- [ ] Add a trustworthy `stats.lastUpdated` source instead of the current homepage fallback copy.
- [ ] Decide whether `trendingArticles` should be real popularity data or be replaced with a non-popularity section such as recently published articles.
- [ ] If real popularity is needed, add article/item view tracking first; current article DTOs do not expose `views` or `viewCount`.
- [ ] Add backend support for article stage/type filters before relying on homepage links like `/articles?stage=early` or `/articles?type=guide`.
- [ ] Move curated homepage blocks out of `front-nuxt/composables/useHomeData.ts` once the backend contract has a real source of truth.
- [ ] Keep frontend fallback data so the homepage does not blank when the aggregation endpoint fails.

## Current Known Dynamic Data

- Existing usable endpoint: `/statistics/overview`
- Current fields available there: `totalItems`, `totalCategories`, root category counts, category item counts
- Not available there: `lastUpdated`, recent content, featured route, trending/view metrics

## Suggested Next Slice

Start with a low-risk PR that returns:

- `stats.totalItems`
- `stats.totalCategories`
- `stats.lastUpdated`
- `recentUpdates` from existing `updatedAt` / `publishedAt` fields
- curated fallback-compatible `featuredRoute`

Leave `trendingArticles.views` out until a real tracking model exists.
