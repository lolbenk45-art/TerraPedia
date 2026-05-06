# Project Root Migration Checklist

## Goal

Track scripts that still derive repository paths from `__dirname` so P0.1 can converge on `scripts/data/lib/project-root.mjs`.

## Completed In This Round

- `scripts/data/lib/wiki-item-utils.mjs`
- `scripts/data/lib/wiki-request-gate.mjs`
- `scripts/data/landing/source-dataset-locator.mjs`
- `scripts/data/landing/import-source-dataset-landings.mjs`
- `scripts/data/landing/audit-source-dataset-landings.mjs`
- `scripts/data/fetch/build-npc-item-relations-bundle.mjs`
- `scripts/data/fetch/fetch-wiki-item-pages.mjs`
- `scripts/data/fetch/fetch-wiki-item-pages.test.mjs`
- `scripts/data/fetch/run-item-page-crawl-batches.mjs`
- `scripts/data/fetch/start-detached-item-page-crawl.mjs`
- `scripts/data/fetch/fetch-wiki-armor-sets.mjs`
- `scripts/data/fetch/fetch-wiki-bosses.mjs`
- `scripts/data/fetch/fetch-wiki-zh-recipe-pages.mjs`
- `scripts/data/generate/generate-item-group-overrides.mjs`
- `scripts/data/generate/generate-recipe-material-reference.mjs`
- `scripts/data/audit/audit-any-item-group-sources.mjs`
- `scripts/data/audit/audit-armor-set-source-coverage.mjs`
- `scripts/data/audit/audit-recipe-provider-suppression-by-item.mjs`
- `scripts/data/audit/audit-wiki-zh-recipe-source-coverage.mjs`
- `scripts/data/audit/image-asset-readiness-audit.mjs`
- `scripts/data/audit/query-current-recipes-from-wiki-zh-pages.mjs`
- `scripts/data/audit/reconcile-live-recipe-coverage.mjs`
- `scripts/data/audit/validate-independent-entity-item-links.mjs`
- `scripts/data/backfill/backfill-missing-standardized-items.mjs`
- `scripts/data/backfill/backfill-npc-buff-relations-from-wiki-crawler.mjs`
- `scripts/data/monitor/check-source-updates.mjs`
- `scripts/data/maint/category-item-structured-parser.mjs`
- `scripts/data/maint/core-field-source-matrix.mjs`
- `scripts/data/maint/item-field-coverage-audit.mjs`
- `scripts/data/maint/page-recipe-structured-parser.mjs`
- `scripts/data/maint/sync-landing-to-maint.mjs`
- `scripts/data/maint/sync-standardized-item-images-to-maint.mjs`
- `scripts/data/maint/sync-standardized-npc-images-to-maint.mjs`
- `scripts/data/workflow/data-maintenance-chain-audit.mjs`
- `scripts/data/workflow/run-wiki-sync.mjs`
- `scripts/data/workflow/run-wiki-sync.test.mjs`
- `scripts/data/workflow/seed-wiki-source-manifest.mjs`
- `scripts/data/pipeline/run-biome-sync-pipeline.mjs`
- `scripts/data/pipeline/run-boss-loot-sync-pipeline.mjs`
- `scripts/data/pipeline/run-boss-sync-pipeline.mjs`
- `scripts/data/pipeline/run-independent-entity-sync-pipeline.mjs`
- `scripts/data/pipeline/run-item-detail-sync-pipeline.mjs`
- `scripts/data/pipeline/run-recipe-reference-sync-pipeline.mjs`
- `scripts/data/pipeline/run-shimmer-sync-pipeline.mjs`
- `scripts/data/pipeline/run-support-sync-pipeline.mjs`
- `scripts/data/pipeline/run-town-npc-sync-pipeline.mjs`
- `scripts/data/pipeline/run-wiki-shimmer-extraction-pipeline.mjs`
- `scripts/data/pipeline/run-wiki-zh-recipe-sync-pipeline.mjs`
- `scripts/data/relation/entity-coverage-baseline.mjs`
- `scripts/data/relation/local-core-compat-smoke-check.mjs`
- `scripts/data/relation/relation-health-report.mjs`
- `scripts/data/relation/relation-table-catalog.mjs`
- `scripts/data/relation/replacement-readiness-audit.mjs`
- `scripts/data/relation/sync-crafting-station-images-to-local.mjs`
- `scripts/data/relation/sync-maint-to-relation.mjs`
- `scripts/data/relation/sync-missing-item-title-images-to-local.mjs`
- `scripts/data/relation/sync-projection-to-local-core-tables.mjs`
- `scripts/data/relation/sync-relation-item-images-to-local.mjs`
- `scripts/data/relation/sync-relation-recipes-to-local.mjs`
- `scripts/data/relation/sync-relation-to-local-compat-tables.mjs`
- `scripts/data/import/import-boss-loot-to-db.mjs`
- `scripts/data/import/import-buffs-to-db.mjs`
- `scripts/data/import/import-independent-entities-to-db.mjs`
- `scripts/data/import/import-normal-npc-loot-to-db.mjs`
- `scripts/data/import/import-standardized-to-db.mjs`
- `scripts/data/import/import-wiki-bosses-to-db.mjs`
- `scripts/data/import/import-wiki-shimmer-to-db.mjs`
- `scripts/data/import/import-wiki-town-npcs-to-db.mjs`
- `scripts/data/import/import-wiki-zh-recipes-to-db.mjs`
- `scripts/data/import/import-wiki-zh-recipes-to-db.test.mjs`
- `scripts/data/sync/consolidate-recipe-provider-priority.mjs`
- `scripts/data/transform/split-standardized-view.mjs`
- `scripts/data/transform/standardize-existing-data.mjs`
- `scripts/dev/verify/probe-back-start.js`
- `scripts/dev/verify/probe-dqa-link.js`
- `scripts/dev/verify/probe-dqa-start.js`
- `scripts/dev/verify/probe-front-link.js`
- `scripts/dev/verify/probe-front-start.js`
- `scripts/dev/verify-local-stack.ps1`

## Remaining Script Entrypoints
- None currently tracked. Future passes should focus on any remaining `process.cwd()`-anchored scripts that still need worktree-specific review, but they are outside this `__dirname` migration checklist.

## Notes

- The current helper favors `WORKTREE_ROOT` or `TERRAPEDIA_PROJECT_ROOT` when explicitly set.
- Without those env vars, it resolves from the current working directory first, then falls back to `git rev-parse --show-toplevel`.
- Scripts that write database rows still need separate P1 safety gates; this checklist only tracks path resolution.
