# Front Nuxt Visual Gate Coverage Audit

Date: 2026-05-24
Branch: `fix/front-nuxt-public-visual-quality-2026-05-24`
Task: Task 1, expand visual gate coverage

## Scope

Updated `front-nuxt/scripts/check-visual-regression.mjs` as the public visual readiness gate. `front-nuxt/scripts/check-public-pages.mjs` was not changed.

The gate now keeps the existing deep `/items` assertions and adds a public route matrix with shared per-route assertions, family-specific assertions, non-public preview smoke checks, structured JSON failure output, and screenshot capture for routes with blocking visual failures.

## Public Route Matrix

Mobile `390x900` is applied to every required public route:

- `/`
- `/__missing-terrapedia-page`
- `/search`
- `/articles`
- `/categories`
- `/categories/weapons`
- `/about`
- `/items`
- `/items/1`
- `/crafting`
- `/crafting?itemId=675&maxDepth=3`
- `/npcs`
- `/bosses`
- `/buffs`
- `/biomes`
- `/armor-sets`
- `/projectiles`
The checker also adds API-derived detail fixtures for NPC, Boss, Buff, and Biome detail pages when the running Nuxt app can resolve a first list row.

Additional viewport coverage:

- Tablet `768x1024`: `/`, `/__missing-terrapedia-page`
- Desktop `1440x1000`: `/items`, `/crafting`, `/crafting?itemId=675&maxDepth=3`, `/armor-sets`, `/projectiles`
- Wide desktop `1728x1050`: `/items`, `/crafting`, `/crafting?itemId=675&maxDepth=3`

Dynamic fixture resolution:

- The checker attempts `/api/npcs?page=1&limit=1`, `/api/public/bosses?page=1&limit=1`, and `/api/public/buffs?page=1&limit=1` through the running Nuxt app and adds the first API-derived detail route for each domain when available.
- The checker attempts `/api/public/biomes` and `/api/biomes` through the running Nuxt app and adds the first API-derived `/biomes/:id` detail route when available.
- If no biome fixture can be resolved, the checker records a warning in the structured report and continues with `/biomes`.

## Assertions

Generic assertions now run per matrix route:

- No document or body horizontal overflow.
- No visible shared container overflow.
- No clipped shared search/form/control containers.
- Exactly one visible `h1`.
- No broken images.
- No blocked image hosts such as `terraria.wiki.gg` or `localhost:9000`.
- No local filesystem asset leaks when `CHECK_LOCAL_ASSET_LEAKS=1`.
- No closed nav/account menu focus leaks.
- Shared nav, page command, filter, pagination, and small-button touch targets are at least `44x44`.

Family assertions added:

- Crafting: recipe tree image/text overlap, branch row overflow, and root target visibility above the fold for `itemId=675`.
- Entity indexes: search input presence where expected, cards or intentional empty state, paginated controls when dense, and contained card image slots.
- Entity details: hero/relation image containment and long stat/evidence text wrapping.
- Search/articles/categories: mobile readability for route nodes and suggestion rows plus fixture/debug wording detection.
- Non-public preview smoke: `/search-tool`, `/home-hero-options`, `/user`, `/user/login`, `/user/register`, `/user/articles`, `/user/articles/new`, `/user/favorites`, and `/user/settings` are checked separately as warnings, not public readiness blockers.

## Failure Tracking

Blocking failures write:

- `reports/front-nuxt/visual-quality/failures-2026-05-24.json`
- `reports/front-nuxt/visual-quality/screenshots/<run-id>/*.png`

Each JSON entry includes severity, message, inferred route, family, assertion, viewport when available, and supporting details. Screenshots are captured only when a route adds blocking failures or when a generic evaluation cannot return a serializable value. The report is written on pass as well, so stale failure JSON is replaced by the current run status.

The checker also guards Chrome DevTools Protocol commands with a timeout and records browser/evaluation failures into the same JSON report instead of crashing on missing `Runtime.evaluate.result.value`. Runtime report and screenshot files under `reports/front-nuxt/visual-quality/` are local evidence and are not committed.

## Validation Notes

Runtime URL used for Task 1 validation:

```bash
TERRAPEDIA_FRONT_NUXT_URL=http://127.0.0.1:5178 CHECK_LOCAL_ASSET_LEAKS=1 pnpm run check:visual
```

Latest validation evidence:

- `git diff --check`: exit 0
- `node --check front-nuxt/scripts/check-visual-regression.mjs`: exit 0
- `pnpm --filter terrapedia-front-nuxt exec vue-tsc --noEmit --pretty false`: exit 0
- `TERRAPEDIA_FRONT_NUXT_URL=http://127.0.0.1:5178 CHECK_LOCAL_ASSET_LEAKS=1 pnpm run check:visual`: exit 0

Latest local JSON evidence was written to `reports/front-nuxt/visual-quality/failures-2026-05-24.json` with `runId=2026-05-23T18-11-42-615Z`, `failureCount=0`, `warningCount=0`, and `screenshotCount=0`. This report is intentionally ignored and not part of the commit.
