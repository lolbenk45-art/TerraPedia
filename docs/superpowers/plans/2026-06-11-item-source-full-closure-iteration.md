# Item Source Full Closure Iteration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every remaining `item_acquisition_sources` quality gap by repeatedly auditing, repairing, validating, and re-auditing until each item source issue is either fixed in local DB/API/UI or explicitly classified with evidence as a non-importable/exempt case.

**Architecture:** Keep raw evidence and compatibility rows separate from runtime projection. Every lane starts read-only, emits a machine-readable report, runs a dry-run with validation gates, applies only to local `terria_v1_local` after explicit guarded flags, then re-runs the same audit to prove the remaining count changed. Any newly discovered unresolved bucket feeds the next iteration instead of being hand-waved.

**Tech Stack:** Node.js ESM scripts under `scripts/data`, MySQL local schema `terria_v1_local`, existing TerraPedia relation/local compatibility scripts, Spring Boot item source APIs under `back`, Nuxt public UI under `front-nuxt`, admin UI under `data-query-app`.

---

## Current Baseline

Recorded on 2026-06-11 from read-only local DB checks:

- Active `item_acquisition_sources`: `7679`
- Soft-deleted source rows: `756`
- Non-`biome_wikitext` exact duplicate groups: `0`
- `biome_wikitext` same-label groups: `102`, extra rows `121`
- Active wiki URL `source_page` rows: `1244`
  - `drop/npc`: `711`
  - `shop/npc`: `533`
- Active rows with empty/unknown source ref name: `30`
- Active `npc` rows missing `source_ref_id`: `2621`
  - `drop/npc`: `2107`
  - `shop/npc`: `514`
- Active `boss` rows missing `source_ref_id`: `138`
- Active `item/container/crate/treasure_bag` rows missing `source_ref_id`: `0`
- Items with no active source rows: `3730`

Existing reports already closed:

- `data/reports/item-source-exact-duplicate-cleanup-lane-i-review-2026-06-11.md`
- `data/reports/item-source-legacy-duplicate-cleanup-lane-h-review-2026-06-11.md`
- `data/reports/item-source-torch-zombie-repair-lane-g-review-2026-06-11.md`

## Closure Definition

This work is complete only when a final acceptance report proves all of these are true:

- `nonBiomeExactDuplicateGroups = 0`
- `activeWikiUrlSourcePageRows = 0`
- `npcMissingSourceRefIdRows = 0`
- `bossMissingSourceRefIdRows = 0`
- `itemBackedMissingSourceRefIdRows = 0`
- `unknownOrEmptyRuntimeDisplayRows = 0`
- `itemsWithoutActiveSourcesUnclassified = 0`
- `biomeWikitextUnclassifiedRows = 0`
- Public item source API and admin biome source UI show structured source display names for every active source row.
- Any item that still has no `item_acquisition_sources` row is listed in an explicit exemption report with evidence, rule name, and review report path. `activeSourceCount = 0` alone is never an exemption.

## Hard Boundaries

- Do not run crawler, fetch, import, backfill, pipeline, sync, materialize, Flyway, or production refresh commands.
- Do not write production DB.
- Do not run any `--apply=true` command until that lane has a committed dry-run report with `validationErrors = 0`.
- All DB writes must target only `terria_v1_local`.
- Every DB-writing lane must produce before backup JSON and rollback SQL.
- No hard deletes. Use additive insert, identity-preserving update, or soft delete only.
- Do not modify `item_acquisition_sources.source_ref_type`, `source_ref_id`, `source_ref_name`, `source_type`, `item_id`, `quantity_text`, `chance_text`, or `conditions` in the wiki URL source-page normalization lane.
- Do not map Chest, Crate, Treasure Bag, Lock Box, Present, Goodie Bag, or similar item/container sources to NPC.
- Do not collapse `biome_wikitext` rows by display text alone; preserve `source_page`, `biome_id`, `conditions`, and `notes` semantics.

## Source Contract Decisions

- `source_ref_type='npc'`: `source_ref_id` binds to `npcs.id`.
- `source_ref_type='boss'`: keep `source_ref_type='boss'`, but `source_ref_id` also binds to `npcs.id` for the concrete boss NPC row. Do not bind boss rows to `boss_groups.id`.
- `source_ref_type IN ('item','container','crate','treasure_bag')`: `source_ref_id` binds to `items.id`.
- `source_ref_type='world'`: no `source_ref_id` is required; source name/page/notes/conditions remain textual evidence.
- `source_ref_type='biome_wikitext'`: bottom-table evidence rows are preserved. API/UI derive `sourceDisplayName`, `sourceGroupName`, `evidenceStatus`, `aggregationKey`, and `rawSourceRefNameMissing` without deleting evidence rows.

## Multi-Agent Ownership

- Agent A, baseline and coverage inventory: owns read-only inventory scripts and reports for all 3730 source-less items.
- Agent B, ref-id resolution: owns NPC/Boss source-ref resolver scripts, tests, dry-runs, local apply reports, and rollback.
- Agent C, runtime projection: owns backend DTO/API and admin/public UI projection for `biome_wikitext` and missing display names.
- Agent D, source-page and safety review: owns wiki URL `source_page` normalization scripts, reports, rollback, and final cross-lane acceptance.

Parallel allowed:

- Read-only SQL statistics.
- Script/test review.
- API/UI sample list design.
- Rollback SQL shape review.

Parallel forbidden:

- Any write to `item_acquisition_sources`.
- Source-page normalization apply and source-ref-id apply.
- Duplicate cleanup apply and candidate additive apply.
- Any service lifecycle restart while API smoke is being collected.

## Iteration Rule

After every lane:

1. Run the lane post-apply audit.
2. Run `scripts/data/audit/build-item-source-batch-acceptance-report.mjs`.
3. Compare the report to the previous baseline.
4. If a count is non-zero, classify it into an existing lane or create a new lane entry in this MD before continuing.
5. Do not claim closure until the final acceptance report has no unclassified rows.

---

## Task 0: Branch And Safety Preflight

**Files:**
- Read: `project-plan/00_协作开发标准流程.md`
- Read: `data/reports/item-source-exact-duplicate-cleanup-lane-i-review-2026-06-11.md`
- Read: `data/reports/item-source-legacy-duplicate-cleanup-lane-h-review-2026-06-11.md`
- Read: `data/reports/item-source-torch-zombie-repair-lane-g-review-2026-06-11.md`

- [ ] Run branch and worktree checks.

```bash
git status --short --branch
git branch -vv
git worktree list --porcelain
```

Expected:

- Current branch is not `main` or `master`.
- Dirty files are either this plan or lane-specific files.
- No unrelated worktree is writing `item_acquisition_sources`.

- [ ] Run local DB read-only baseline.

Use a one-off read-only query or Task 1 script after it exists. The report must include the baseline fields listed in `Current Baseline`.

Expected:

- Query uses only `SELECT`.
- Database is `terria_v1_local`.

---

## Task 1: Add Full Baseline Inventory Script

**Files:**
- Create: `scripts/data/audit/audit-items-without-active-sources.mjs`
- Create: `scripts/data/audit/audit-items-without-active-sources.test.mjs`
- Output: `data/reports/item-source-full-baseline-YYYY-MM-DD.json`

- [ ] Write tests for classification buckets.

Test cases must cover:

- item has active local source -> `hasLocalActiveSource=true`
- item has raw extracted source but no local row -> `raw_source_chain_gap`
- item has maint/relation evidence but no local active row -> `publication_chain_gap`
- item has recipe evidence -> `recipe_chain_covered`
- item has biome evidence -> `biome_evidence_only`
- item has NPC loot/shop evidence -> `npc_relation_chain_gap`
- no evidence anywhere -> `unclassified_no_source_evidence`

- [ ] Implement script with read-only guards.

Required CLI:

```bash
node scripts/data/audit/audit-items-without-active-sources.mjs \
  --output data/reports/item-source-full-baseline-2026-06-11.json
```

Required output fields per item:

```json
{
  "itemId": 1,
  "internalName": "IronPickaxe",
  "name": "Iron Pickaxe",
  "activeSourceCount": 0,
  "hasRawItemPageSource": false,
  "hasMaintSource": false,
  "hasRelationFact": false,
  "hasRecipe": true,
  "hasNpcLootOrShop": false,
  "hasBiomeEvidence": false,
  "primaryBucket": "recipe_chain_covered",
  "blockedReason": null,
  "evidence": []
}
```

Required summary:

```json
{
  "itemsWithoutActiveSources": 3730,
  "unclassifiedNoSourceEvidence": 0,
  "sourceChainBroken": 0,
  "recipeChainCovered": 0,
  "biomeEvidenceOnly": 0,
  "npcRelationChainGap": 0,
  "exemptedNoSourceRequired": 0
}
```

- [ ] Validate no mutation path.

Run:

```bash
node --test scripts/data/audit/audit-items-without-active-sources.test.mjs
rg -n "INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|--apply|crawler|fetch|import|backfill|pipeline|sync|materialize" scripts/data/audit/audit-items-without-active-sources.mjs
```

Expected:

- Tests pass.
- `rg` output has no DB-write or forbidden command path.

---

## Task 2: Add Iterative Coverage Plan Script

**Files:**
- Create: `scripts/data/audit/build-item-source-gap-coverage-plan.mjs`
- Create: `scripts/data/audit/build-item-source-gap-coverage-plan.test.mjs`
- Output: `data/reports/item-source-gap-coverage-plan-YYYY-MM-DD.json`

- [ ] Write tests proving one and only one primary lane is assigned per item.

Lane order:

1. `local_source_already_present`
2. `publication_chain_gap`
3. `high_confidence_candidate_import`
4. `family_policy_candidate`
5. `polluted_page_candidate`
6. `npc_ref_resolution_gap`
7. `recipe_or_shimmer_chain_covered`
8. `biome_evidence_projection`
9. `explicit_no_source_exemption`
10. `unclassified_requires_new_lane`

- [ ] Implement plan builder.

Required command:

```bash
node scripts/data/audit/build-item-source-gap-coverage-plan.mjs \
  --baseline data/reports/item-source-full-baseline-2026-06-11.json \
  --candidate-plan data/reports/item-source-candidate-import-plan.latest.json \
  --output data/reports/item-source-gap-coverage-plan-2026-06-11.json
```

Expected:

- Every item from the baseline appears once.
- No item with any raw/maint/relation/recipe/NPC/biome evidence is classified as `explicit_no_source_exemption`.
- `unclassified_requires_new_lane` count is explicit.

---

## Task 3: Normalize Wiki URL `source_page` Values

**Files:**
- Create: `scripts/data/relation/plan-item-source-page-normalization.mjs`
- Create: `scripts/data/relation/plan-item-source-page-normalization.test.mjs`
- Output: `data/reports/item-source-page-normalization-lane-j-dry-run.json`
- Output: `data/reports/item-source-page-normalization-lane-j-apply.json`
- Output: `data/reports/item-source-page-normalization-lane-j-post-apply.json`
- Backup: `data/backups/item-source-page-normalization/item-source-page-normalization-lane-j-apply.before.json`

- [ ] Write tests for URL normalization.

Cases:

- `https://terraria.wiki.gg/wiki/Tavernkeep` -> `Tavernkeep`
- `https://terraria.wiki.gg/wiki/Unconscious_Man` -> `Unconscious Man`
- `https://terraria.wiki.gg/wiki/Party_Girl` -> `Party Girl`
- `https://terraria.wiki.gg/wiki/Mimics` -> `Mimics`

- [ ] Write tests proving identity fields cannot change.

The dry-run report must include `identityDiffCount=0` for:

- `item_id`
- `source_type`
- `source_ref_type`
- `source_ref_id`
- `source_ref_name`
- `quantity_text`
- `chance_text`
- `conditions`

- [ ] Run dry-run.

```bash
node scripts/data/relation/plan-item-source-page-normalization.mjs \
  --batch-id item-source-page-normalization-lane-j-dry-run \
  --output data/reports/item-source-page-normalization-lane-j-dry-run.json
```

Expected:

- `apply=false`
- `rowsToUpdate=1244`
- `identityDiffCount=0`
- predicted non-biome duplicate groups remain `0`

- [ ] Apply only after dry-run is reviewed.

```bash
node scripts/data/relation/plan-item-source-page-normalization.mjs \
  --apply=true \
  --confirm-local-compat=true \
  --allow-bulk=true \
  --batch-id item-source-page-normalization-lane-j-apply \
  --output data/reports/item-source-page-normalization-lane-j-apply.json
```

Expected:

- Database printed as `terria_v1_local`.
- `updatedRows=1244`
- rollback SQL restores old `source_page` by explicit `id`.

- [ ] Run post-apply report.

```bash
node scripts/data/relation/plan-item-source-page-normalization.mjs \
  --batch-id item-source-page-normalization-lane-j-post-apply \
  --output data/reports/item-source-page-normalization-lane-j-post-apply.json
```

Expected:

- `rowsToUpdate=0`
- active wiki URL `source_page` rows `0`
- non-biome duplicate groups `0`

---

## Task 4: Resolve NPC/Boss `source_ref_id`

**Files:**
- Create: `scripts/data/relation/plan-item-source-ref-id-resolution.mjs`
- Create: `scripts/data/relation/plan-item-source-ref-id-resolution.test.mjs`
- Modify: `scripts/data/audit/build-item-source-candidate-import-plan.mjs`
- Modify: `scripts/data/audit/build-item-source-candidate-import-plan.test.mjs`
- Output: `data/reports/item-source-ref-id-resolution-lane-k-dry-run.json`
- Output: `data/reports/item-source-ref-id-resolution-lane-k-apply.json`
- Output: `data/reports/item-source-ref-id-resolution-lane-k-post-apply.json`
- Backup: `data/backups/item-source-ref-id-resolution/item-source-ref-id-resolution-lane-k-apply.before.json`

- [ ] Write resolver tests.

Required behavior:

- Exact NPC name with one active local NPC resolves to that `npcs.id`.
- `source_ref_type='boss'` resolves to active boss NPC row in `npcs`, not `boss_groups.id`.
- Ambiguous variants such as Slime/Mimic/Mummy families are blocked unless existing source evidence already names a concrete variant.
- Negative legacy NPC IDs are never coerced to positive IDs.
- Chest/Crate/Treasure Bag/Goodie Bag/Present/Lock Box are blocked from NPC resolution.

- [ ] Implement dry-run report.

Required command:

```bash
node scripts/data/relation/plan-item-source-ref-id-resolution.mjs \
  --output data/reports/item-source-ref-id-resolution-lane-k-dry-run.json
```

Required summary:

```json
{
  "apply": false,
  "npcRowsMissingRefId": 2621,
  "bossRowsMissingRefId": 138,
  "rowsToUpdate": 0,
  "blockedRows": 0,
  "ambiguousRows": 0,
  "validationErrors": 0
}
```

- [ ] Apply only exact safe rows.

```bash
node scripts/data/relation/plan-item-source-ref-id-resolution.mjs \
  --apply=true \
  --confirm-local-compat=true \
  --allow-bulk=true \
  --output data/reports/item-source-ref-id-resolution-lane-k-apply.json
```

Expected:

- Only `source_ref_id` updates are executed.
- `source_ref_type` remains unchanged.
- rollback SQL restores `source_ref_id` by explicit row id.

- [ ] Re-run post-apply.

```bash
node scripts/data/relation/plan-item-source-ref-id-resolution.mjs \
  --output data/reports/item-source-ref-id-resolution-lane-k-post-apply.json
```

Expected:

- `validationErrors=0`
- `npcRowsMissingRefId + bossRowsMissingRefId` decreases.
- If any missing rows remain, every row has `blockedReason`.
- Remaining blocked rows feed Task 9.

---

## Task 5: Make Biome Wikitext Runtime Display Structured

**Files:**
- Create: `scripts/data/audit/audit-biome-wikitext-source-display.mjs`
- Create: `scripts/data/audit/audit-biome-wikitext-source-display.test.mjs`
- Modify: `back/src/main/java/com/terraria/skills/dto/ItemSourceDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/dto/PublicItemSourceDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/dto/BiomeItemSourceDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/ItemSourceServiceImpl.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/PublicItemRelationController.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminBiomeController.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/ItemSourceServiceImplTest.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/PublicItemRelationControllerTest.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/AdminBiomeControllerTest.java`
- Modify: `front-nuxt/types/public-api.ts`
- Modify: `front-nuxt/pages/items/[id].vue`
- Modify: `data-query-app/pages/entities/[type].vue`

- [ ] Add read-only biome display audit.

Required command:

```bash
node scripts/data/audit/audit-biome-wikitext-source-display.mjs \
  --output data/reports/biome-wikitext-source-display-lane-l-baseline.json
```

Expected summary:

- `sameLabelGroups=102`
- `extraRows=121`
- `emptySourceRefNameRows=30`
- every row has action `aggregate_display`, `keep_as_evidence`, `promote_allowed`, or `manual_review`

- [ ] Add backend DTO fields as derived values.

Fields:

- `sourceDisplayName`
- `sourceGroupName`
- `evidenceStatus`
- `aggregationKey`
- `rawSourceRefNameMissing`

Required derivation:

- If `source_ref_name` is present, `sourceDisplayName = source_ref_name`.
- If `source_ref_name` is missing and `source_page` is present, derive `sourceDisplayName = source_page`.
- Include `source_page`, `conditions`, and `notes` in `aggregationKey`.
- Do not merge different `source_page`, `conditions`, or `notes`.

- [ ] Add public and admin tests.

Required cases:

- Dungeon row with null source ref name renders a stable display name from `source_page`.
- Corruption and Underground Corruption rows do not collapse into one row.
- Admin biome item source cards expose `rawSourceRefNameMissing=true` for null source names.

- [ ] Run backend tests.

```bash
cd back && mvn -Dtest=ItemSourceServiceImplTest,PublicItemRelationControllerTest,AdminBiomeControllerTest test
```

Expected:

- All selected tests pass.

---

## Task 6: Import Remaining High-Confidence Candidate Sources In Iterative Batches

**Files:**
- Modify: `scripts/data/audit/build-item-source-candidate-import-plan.mjs`
- Modify: `scripts/data/audit/build-item-source-candidate-import-plan.test.mjs`
- Reuse: `scripts/data/relation/apply-item-source-candidate-local-compat.mjs`
- Output: `data/reports/item-source-gap-delta-batches/batch-NN.json`
- Output: `data/reports/item-source-gap-delta-batch-NN-dry-run.json`
- Output: `data/reports/item-source-gap-delta-batch-NN-apply.json`

- [ ] Generate current candidate plan.

```bash
node scripts/data/audit/build-item-source-candidate-import-plan.mjs \
  --output data/reports/item-source-candidate-import-plan.after-ref-resolution.json
```

Expected:

- `readOnly=true`
- `blockedRows` are explained.
- no `sourceRefType='unknown'` in eligible rows.

- [ ] Split eligible candidates into capped batches.

Batch cap:

- Maximum `25` items or `100` planned source rows.
- No mixed family/polluted/high-confidence rules in a single batch.

- [ ] Dry-run one batch.

```bash
node scripts/data/relation/apply-item-source-candidate-local-compat.mjs \
  --input data/reports/item-source-gap-delta-batches/batch-01.json \
  --apply=false \
  --output data/reports/item-source-gap-delta-batch-01-dry-run.json
```

Expected:

- `validationErrors=0`
- `blockedRows=0`
- `toInsert` equals planned rows after duplicate skip.

- [ ] Apply one batch only after dry-run review.

```bash
node scripts/data/relation/apply-item-source-candidate-local-compat.mjs \
  --input data/reports/item-source-gap-delta-batches/batch-01.json \
  --apply=true \
  --confirm-local-compat=true \
  --output data/reports/item-source-gap-delta-batch-01-apply.json
```

Expected:

- local DB only
- before backup exists
- rollback IDs are present
- runtime item API smoke returns new sources

- [ ] Repeat batches until eligible high-confidence delta is `0`.

After each batch, run Task 8 acceptance report. If a batch reveals new blocked reasons, update Task 9.

---

## Task 7: Close Family, Polluted, Recipe, Shimmer, Item-Group, And Biome Buckets

**Files:**
- Modify: `scripts/data/audit/item-source-family-page-policy.mjs`
- Modify: `scripts/data/audit/item-source-family-page-policy.test.mjs`
- Modify: `data/config/item-source-family-page-policy.json`
- Modify: `scripts/data/audit/build-item-source-candidate-import-plan.mjs`
- Modify: `scripts/data/audit/build-item-source-candidate-import-plan.test.mjs`
- Reuse: `scripts/data/audit/audit-any-item-group-sources.mjs`
- Reuse: `scripts/data/audit/audit-wiki-zh-recipe-source-coverage.mjs`
- Reuse: `scripts/data/audit/reconcile-live-recipe-coverage.mjs`
- Reuse: `scripts/data/audit/biome-wikitext-policy-relation-plan.mjs`

- [ ] Family shared worldgen.

Only promote family page rows when:

- page is allowlisted in `data/config/item-source-family-page-policy.json`
- every planned row is `sourceType='worldgen'`
- every planned row is `sourceRefType='world'`

Expected:

- Paintings, Statues, Music Boxes, Torches, Ropes, and block-placing wands remain blocked unless item-specific evidence exists.

- [ ] Polluted pages.

Each polluted page family needs a named fixture and rule:

- Goodie Bag vanity sets
- Mummy set
- Torches
- Ropes
- Block-placing wands
- Boss treasure bag pages

Expected:

- Matrix rows without item-specific discriminator are blocked.
- Container-like rows never become NPC rows.

- [ ] Recipe/shimmer/item-group coverage.

Items covered by recipe/shimmer/item-group evidence are closed as `domain_chain_covered`, not as `no_source_required`.

Expected:

- Report contains evidence path and source table/script.
- These items are removed from `unclassified_requires_new_lane`.

- [ ] Biome/worldgen/mining.

Use `biome-wikitext-policy-relation-plan.mjs` as evidence-only first.

Expected:

- `dbWriteAction=none` unless a later lane explicitly authorizes an additive import.
- Rows with family/page-level evidence remain review candidates, not direct acquisition facts.

---

## Task 8: Add Batch Acceptance Report

**Files:**
- Create: `scripts/data/audit/build-item-source-batch-acceptance-report.mjs`
- Create: `scripts/data/audit/build-item-source-batch-acceptance-report.test.mjs`
- Output: `data/reports/item-source-final-acceptance-YYYY-MM-DD.json`

- [ ] Write tests for final gate failure.

The report must fail when any of these are non-zero:

- `activeWikiUrlSourcePageRows`
- `nonBiomeExactDuplicateGroups`
- `npcMissingSourceRefIdRows`
- `bossMissingSourceRefIdRows`
- `unknownOrEmptyRuntimeDisplayRows`
- `itemsWithoutActiveSourcesUnclassified`
- `biomeWikitextUnclassifiedRows`

- [ ] Implement acceptance report.

Required command:

```bash
node scripts/data/audit/build-item-source-batch-acceptance-report.mjs \
  --coverage-plan data/reports/item-source-gap-coverage-plan-2026-06-11.json \
  --output data/reports/item-source-final-acceptance-2026-06-11.json
```

Expected pass output:

```json
{
  "passed": true,
  "closure": {
    "activeWikiUrlSourcePageRows": 0,
    "nonBiomeExactDuplicateGroups": 0,
    "npcMissingSourceRefIdRows": 0,
    "bossMissingSourceRefIdRows": 0,
    "unknownOrEmptyRuntimeDisplayRows": 0,
    "itemsWithoutActiveSourcesUnclassified": 0,
    "biomeWikitextUnclassifiedRows": 0
  }
}
```

If `passed=false`, execution returns to Task 2 and a new lane is added before more apply commands run.

---

## Task 9: Repair Loop For Remaining Blocked Rows

**Files:**
- Modify this plan file with a new dated lane section before executing newly found work.
- Output: `data/reports/item-source-blocked-row-review-YYYY-MM-DD.md`

- [ ] For every blocked row group, write one of these decisions:

Allowed decisions:

- `fix_resolver`
- `add_policy_fixture`
- `keep_as_evidence_projection`
- `domain_chain_covered`
- `explicit_no_source_exemption`
- `needs_manual_domain_decision`

- [ ] Add a named test before fixing a blocked group.

Example required test names:

- `does not resolve shared Mimics page to one NPC`
- `keeps Treasure Bag item-backed source out of NPC resolver`
- `classifies recipe-only item as recipe_chain_covered`
- `keeps Dungeon null source name displayable from source_page`

- [ ] Re-run Task 8 after each repair.

Stop only when:

- `passed=true`, or
- a remaining row is marked `needs_manual_domain_decision` with evidence and exact user decision question.

---

## Runtime Smoke Matrix

After DB-writing lanes and after backend/API projection changes, test these samples:

- Magic Mirror: `/api/public/items/50/sources`
- Torch: `/api/public/items/8/sources`
- Ultrabright Torch: `/api/public/items/2274/sources`
- Jungle Torch: `/api/public/items/4388/sources`
- Eternia Crystal: `/api/public/items/3828/sources`
- Ancient Necro Helmet: `/api/public/items/959/sources`
- Mining Helmet: `/api/public/items/88/sources`
- Golden Key: `/api/public/items/327/sources`
- Ice Mirror: `/api/public/items/3199/sources`

Expected:

- API returns source rows from backend data only.
- No frontend fallback invents acquisition sources.
- No source card displays blank, `unknown`, or `来源 N`.
- Different biome/source pages remain distinguishable.

## Validation Commands

Run focused Node tests after script work:

```bash
node --test \
  scripts/data/audit/audit-items-without-active-sources.test.mjs \
  scripts/data/audit/build-item-source-gap-coverage-plan.test.mjs \
  scripts/data/audit/build-item-source-batch-acceptance-report.test.mjs \
  scripts/data/relation/plan-item-source-page-normalization.test.mjs \
  scripts/data/relation/plan-item-source-ref-id-resolution.test.mjs \
  scripts/data/audit/build-item-source-candidate-import-plan.test.mjs \
  scripts/data/relation/apply-item-source-candidate-local-compat.test.mjs
```

Run backend tests after DTO/API work:

```bash
cd back && mvn -Dtest=ItemSourceServiceImplTest,PublicItemRelationControllerTest,AdminBiomeControllerTest test
```

Run frontend/admin checks after UI work:

```bash
cd front-nuxt && pnpm run check
cd data-query-app && pnpm run check
```

Run final git checks before each commit:

```bash
git status --short
git diff --cached --stat
git diff --cached --check
```

## Commit Plan

Use focused commits:

1. `docs: plan item source full closure iteration`
2. `feat(data): audit item source closure coverage`
3. `fix(data): normalize item source page titles`
4. `fix(data): resolve item source npc refs`
5. `feat(api): expose structured biome item source display`
6. `fix(data): import remaining item source batches`
7. `chore(data): record item source final acceptance`

Do not push unless explicitly requested.
