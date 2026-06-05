# Crawler Backfill Closeout Execution Notes

Generated on 2026-06-04 after the reviewed closeout plan.

## Scope

- No item page crawl was started.
- No broad crawler was started.
- No DB apply was run in this execution pass.
- Existing generated reports from `/home/lolben/TerraPedia/reports` were reused as evidence.

## Monitor And Writers

- Standalone monitor: `http://127.0.0.1:3099/`.
- Monitor state:
  - `item-raw-pages-parse`: `completed 6131/6131`.
  - `buff-evidence-refresh`: `completed 48/48`.
- Active writer scan found no crawler writer using the audited output/progress paths.

## Armor Images

- `maint_armor_set_images`: `175`.
- Image roles:
  - `demo`: `13`
  - `female`: `34`
  - `male`: `33`
  - `part`: `95`
- Armor item evidence:
  - `armorItemCount`: `671`
  - `candidateCount`: `578`
  - `unresolvedCount`: `0`
  - `cachedUrlCandidates`: `578`
- Managed image sync dry-run:
  - `alreadyManaged`: `578`
  - `changed`: `0`
  - `missingSource`: `0`
- Maint dry-run:
  - `insertedCandidateCount`: `0`
- Local DB verification:
  - `existingBySourceFile`: `578`
  - `matchingItemImage`: `578`
  - `matchingItemMainImage`: `578`
- Public API smoke on `http://127.0.0.1:18091/api/public/armor-sets`:
  - HTTP `200`
  - first page rows: `20`
  - rows with set images: `20`
  - rows with related item images: `20`
  - detail smoke: HTTP `200`, set image count `2`, related item image count `1`
- Conclusion: armor set images and single armor item images are already covered. No armor crawl is needed.

## Town NPC Living Preferences

- Source report:
  - `recordCount`: `39`
  - `scrapedCount`: `39`
  - `livingPreferenceCount`: `191`
  - `errorCount`: `0`
- Latest generated source:
  - records: `39`
  - records with living preferences: `25`
  - living preferences: `191`
- Local DB:
  - `local_town_npcs`: `39`
  - `town_pref`: `25`
  - `non_town_pref`: `0`
- Town NPCs without living preferences in source: `OldMan`, `TravellingMerchant`, `TownCat`, `TownDog`, `TownBunny`, `Princess`, and the town slimes.
- Conclusion: do not crawl all `762` NPCs. The remaining count is explained by source scope, not a crawler gap.

## Projectiles

- Standardized projectiles: `1111`.
- Residuals:
  - no image: `1` (`None`)
  - no zh name: `105`
- Residual classification:
  - `placeholder_none`: `1`
  - `missing_from_projectile_language_pack`: `102`
  - `language_pack_entry_has_no_zh`: `2`
  - `actionableApplyWithoutManualTranslation`: `0`
- Conclusion: this is not a broad crawler gap. The residuals need manual mapping or policy decisions, not more wiki crawling.

## Buffs

- Standardized buffs: `388`.
- Missing `tooltip_zh`: `48`.
- Buff evidence refresh report:
  - `fetched`: `48`
  - `redirected`: `26`
  - `fetch_failed`: `0`
  - `not_modified`: `48`
  - `patched`: `0`
- Conclusion: this is not a fetch failure. Re-crawling the same pages should not change these 48 records unless the parser/mapping policy changes.

## Tests

- Armor tests: `18/18` passed.
- Projectile, buff, and town NPC tests: `36/36` passed after setting `NODE_PATH=/home/lolben/TerraPedia/data-query-app/node_modules` for this clean worktree.

## Remaining Follow-Up

- If frontend validation is needed, use the already running stack:
  - backend: `18091`
  - front: `5181`
  - admin: `3004`
  - monitor: `3099`
- Do not start a new crawler until the lane has a monitor-registered progress path and a failed or missing source-evidence reason.
