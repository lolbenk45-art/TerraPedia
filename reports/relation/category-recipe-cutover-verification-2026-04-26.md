# Category / Recipe Cutover Verification

Date: `2026-04-26`

## Applied Data Changes

- Recipe local rebuild:
  - command: `node scripts/data/relation/sync-relation-recipes-to-local.mjs --apply --date-tag=2026-04-26 --backup-suffix=20260426111000`
  - result:
    - `recipes`: `7393`
    - `recipe_ingredients`: `12335`
    - `recipe_stations`: `10137`
    - `recipe_context_requirements`: `0`
  - unresolved relation recipes not imported: `6`
  - report: `reports/relation/recipe-local-sync-2026-04-26.json`

- Category local rebuild:
  - command: `node scripts/data/sync/sync-item-categories-from-wiki-pages.mjs --apply=true --report=reports/relation/category-local-sync-2026-04-26.json`
  - result:
    - `category`: `137`
    - `item_category_rel`: `13095`
    - items with `category_id`: `6131`
    - items without `category_id`: `15`
    - primary category relations: `6145`
    - secondary category relations: `6950`
  - report: `reports/relation/category-local-sync-2026-04-26.json`

## Script Verification

- Passed:
  - `node --test scripts/data/relation/sync-relation-recipes-to-local.test.mjs scripts/data/sync/sync-item-categories-from-wiki-pages.test.mjs`
- Dry-run evidence:
  - recipe dry-run resolved `7393 / 7399`, unresolved `6`
  - category dry-run classified `6131 / 6131` wiki-matched active items

## Backend Verification

- Passed:
  - `CategoryControllerTest`
  - `CategoryManagementServiceImplTest`
  - `ItemRecipeControllerTest`
  - `RecipeTreeServiceImplTest`
  - `PublicItemAggregateControllerTest`
  - `SupportDomainServiceImplTest`
- Blocked by existing backend baseline mismatch:
  - `RecipeServiceImplTest.shouldKeepAllVariantsWithinPreferredProviderCohort`
  - failure: expected `2` recipes, actual `1`
  - scope assessment: unrelated to this turn's Node/data-script changes because no Java production code was changed; this test exercises existing `RecipeServiceImpl` provider-dedup semantics

## Runtime Verification

- Listening ports:
  - backend `18088`
  - front `5174`
  - admin `3001`
  - redis `6379`
- HTTP checks:
  - `GET http://127.0.0.1:18088/api/categories/items` -> `200`
  - `GET http://127.0.0.1:18088/api/items/1/recipes` -> `200`
  - `GET http://127.0.0.1:5174` -> `200`
  - `GET http://127.0.0.1:3001` -> `200`

## Notes

- Recipe sync needed one bugfix during apply: relation `source_revision_timestamp` sometimes arrived as a JS date string and is now normalized before writing MySQL `datetime`.
- Category sync remains app-taxonomy-based; raw wiki taxonomy was not exposed to backend category APIs.
