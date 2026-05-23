# Front Nuxt Public Visual Quality Closeout

Date: 2026-05-24
Branch: `fix/front-nuxt-public-visual-quality-2026-05-24`
Runtime URL: `http://127.0.0.1:5178`

## Scope Closed

- Expanded `front-nuxt/scripts/check-visual-regression.mjs` into a public route visual readiness gate with structured failures, warnings, per-route screenshots, dynamic detail fixtures, non-public smoke routes, and pass-run JSON evidence.
- Tightened shared image containment, fallback labeling, navigation wrapping, pagination touch targets, and relation row wrapping.
- Repaired crafting default target and recipe tree presentation so `/crafting?itemId=675&maxDepth=3` shows the top recipe target in the first mobile viewport.
- Fixed search page conditional rendering, entity detail relation rows, and entity index image containment for armor/projectile/boss routes.

## Review Feedback Resolved

- Gate no longer uses stale slug detail fixtures in the audit wording; detail routes are API-derived.
- Non-public preview smoke coverage includes `/search-tool`, `/home-hero-options`, and user-facing preview routes.
- Entity index checks wait for cards or intentional empty states before asserting.
- Entity pagination checks no longer count summary text as controls and do not force pagination on the non-paginated biome index.
- `PreviewImage` avoids expensive full-image alpha scans and normalizes `data-source-image` to the renderable preview URL.
- Runtime visual reports are ignored evidence under `reports/front-nuxt/visual-quality/` and are not committed.

## Validation

Fresh commands run from this branch:

```bash
git diff --check
node --check front-nuxt/scripts/check-visual-regression.mjs
pnpm --filter terrapedia-front-nuxt exec vue-tsc --noEmit --pretty false
cd front-nuxt && pnpm run check:public-pages
cd front-nuxt && pnpm run check
cd front-nuxt && TERRAPEDIA_FRONT_NUXT_URL=http://127.0.0.1:5178 CHECK_LOCAL_ASSET_LEAKS=1 pnpm run check:visual
```

Results:

- `check:public-pages`: passed for 24 Nuxt routes.
- `check`: exit 0.
- `check:visual`: exit 0 with `failureCount=0`, `warningCount=0`, `screenshotCount=0` in the ignored local JSON report.

## Remaining Notes

- No crawler, import, backfill, or database writes were run.
- `reports/front-nuxt/visual-quality/` contains local runtime evidence only and should remain untracked.
- The active local stack at `http://127.0.0.1:5178` was reused for validation.
