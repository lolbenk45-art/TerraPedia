# Traceable Post-Crawl Import Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import the completed item page crawl into the TerraPedia data chain without fabricated data, preserving source provenance from raw crawler output through landing, maint, relation, projection, local compatibility, and validation reports.

**Architecture:** The run is a serial data-write workflow. Parallel agents may inspect scripts, reports, and SELECT-only database state, but only the coordinator runs apply commands. Every write step must be preceded by dry-run or baseline checks and followed by a generated report or SELECT-only validation.

**Tech Stack:** Node.js scripts, mysql2/promise via `data-query-app/package.json`, MySQL databases `terria_v1_local`, `terria_v1_maint`, `terria_v1_relation`, existing TerraPedia relation health and readiness reports.

---

## Non-Negotiable Data Rules

- Use crawler/raw/standardized payloads only; do not invent missing item, NPC, projectile, shop, loot, or source facts.
- Keep source fields intact: provider, source key/page, revision timestamp, fetched/parsed timestamps, content hash, landing source id/key/page/hash, trace fields, and report paths.
- Treat unresolved relation rows as unresolved reports/audits, not as guessed facts.
- Do not run crawlers during this import chain.
- Do not run two DB apply scripts in parallel.
- Stop apply work if another crawler/import/relation writer is active.

## Task 1: Preflight and Baseline

**Files:**
- Read: `data/generated/wiki-sync-progress.latest.json`
- Read: `G:/ClaudeCode/data/terraPedia/standardized/_manifest.standardized.json`
- Read: `scripts/dev/config/local-stack.config.json`
- Output: command output only

- [ ] **Step 1: Confirm clean writer state**

Run:

```powershell
git status --short
Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | Where-Object { $_.CommandLine -match 'import-source-dataset|sync-landing|sync-maint|sync-projection|sync-relation|relation-health|replacement-readiness|crawl|fetch-wiki|run-wiki-sync|run-backend-data-refresh|item-page' } | Select-Object ProcessId, CommandLine | Format-List
```

Expected: no active writer process. Dirty generated reports may exist only if produced by this run.

- [ ] **Step 2: Confirm crawl completion and standardized manifest**

Run:

```powershell
Get-Content data/generated/wiki-sync-progress.latest.json | ConvertFrom-Json | ConvertTo-Json -Depth 8
Get-Content G:/ClaudeCode/data/terraPedia/standardized/_manifest.standardized.json -Raw
```

Expected: item page crawl `status=completed`, `overallCurrent=6131`, `overallTotal=6131`, manifest includes `items=6131`, `item_pages=6133`, `npcs=762`, `projectiles=1111`.

- [ ] **Step 3: Capture DB baseline with SELECT-only checks**

Run a SELECT-only node/mysql2 check for landing, maint, relation, projection, and local compatibility counts before writes.

Expected: current counts are recorded so each apply step can be compared.

## Task 2: Refresh File-Derived Standardized Outputs

**Files:**
- Generated external output: `G:/ClaudeCode/data/terraPedia/standardized/*`
- Generated external output: `G:/ClaudeCode/data/terraPedia/standardized-view/*`

- [ ] **Step 1: Rebuild standardized data from current raw sources**

Run:

```powershell
node scripts/data/transform/standardize-existing-data.mjs
```

Expected: exit 0; manifest still reflects the completed crawl and no warnings requiring fabricated data.

- [ ] **Step 2: Rebuild split standardized view**

Run:

```powershell
node scripts/data/transform/split-standardized-view.mjs
```

Expected: exit 0; split output is generated from standardized payloads only.

## Task 3: Landing Import

**Files:**
- Output: `reports/source-dataset-landings-item-pages-local-dry-run-2026-04-30.json`
- Output: `reports/source-dataset-landings-item-pages-local-apply-2026-04-30.json`
- Output: `reports/source-dataset-landings-item-pages-maint-dry-run-2026-04-30.json`
- Output: `reports/source-dataset-landings-item-pages-maint-apply-2026-04-30.json`

- [ ] **Step 1: Dry-run local landing import**

Run:

```powershell
node scripts/data/landing/import-source-dataset-landings.mjs --apply=false --database=terria_v1_local --datasets=item_pages_raw --output=reports/source-dataset-landings-item-pages-local-dry-run-2026-04-30.json
```

Expected: located item page rows match standardized/raw item page corpus; no DB writes.

- [ ] **Step 2: Apply local landing import**

Run:

```powershell
node scripts/data/landing/import-source-dataset-landings.mjs --apply=true --database=terria_v1_local --datasets=item_pages_raw --output=reports/source-dataset-landings-item-pages-local-apply-2026-04-30.json
```

Expected: source rows are inserted, updated, replaced, or unchanged based on content hash; payloads retain raw source metadata.

- [ ] **Step 3: Dry-run maint landing import**

Run:

```powershell
node scripts/data/landing/import-source-dataset-landings.mjs --apply=false --database=terria_v1_maint --datasets=item_pages_raw --output=reports/source-dataset-landings-item-pages-maint-dry-run-2026-04-30.json
```

Expected: same located source corpus; no DB writes.

- [ ] **Step 4: Block on landing source metadata completeness**

Run SELECT-only checks against `source_dataset_landings.item_pages_raw` after each apply:

```sql
SELECT COUNT(*) AS current_rows,
       COUNT(DISTINCT source_key) AS distinct_source_keys,
       SUM(content_hash IS NULL OR content_hash = '') AS missing_hash,
       SUM(fetched_at IS NULL) AS missing_fetched_at,
       SUM(JSON_VALID(payload_json) = 0) AS invalid_payload_json,
       SUM(JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.itemInternalName')) IS NULL
           OR JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.itemInternalName')) = '') AS missing_item_internal_name,
       SUM(JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.pageTitle')) IS NULL
           OR JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.pageTitle')) = '') AS missing_page_title
FROM source_dataset_landings
WHERE dataset_type = 'item_pages_raw'
  AND is_current = 1;
```

Expected: `current_rows = distinct_source_keys`; missing hash/fetched/page/title/internal-name and invalid JSON counts are all 0. `source_revision_timestamp` may be null only if the raw crawler payload does not carry a revision timestamp; that gap must remain visible in the report and must not be filled synthetically.

- [ ] **Step 5: Apply maint landing import**

Run:

```powershell
node scripts/data/landing/import-source-dataset-landings.mjs --apply=true --database=terria_v1_maint --allow-non-primary-db=true --datasets=item_pages_raw --output=reports/source-dataset-landings-item-pages-maint-apply-2026-04-30.json
```

Expected: maint landing table receives the same source-backed payloads. `--allow-non-primary-db=true` is intentional because maint sync reads landing rows from the same DB connection.

## Task 4: Maint Sync

**Files:**
- Output: `reports/maint-sync-item-pages-dry-run-2026-04-30.json`
- Output: `reports/maint-sync-item-pages-apply-2026-04-30.json`

- [ ] **Step 1: Dry-run item page maint sync**

Run:

```powershell
node scripts/data/maint/sync-landing-to-maint.mjs --apply=false --database=terria_v1_maint --scopes=item_pages --output=reports/maint-sync-item-pages-dry-run-2026-04-30.json
```

Expected: planned rows derive from `source_dataset_landings.item_pages_raw`; no writes.

- [ ] **Step 2: Apply item page maint sync**

Run:

```powershell
node scripts/data/maint/sync-landing-to-maint.mjs --apply=true --database=terria_v1_maint --scopes=item_pages --output=reports/maint-sync-item-pages-apply-2026-04-30.json
```

Expected: `maint_item_pages` rows update from landing source rows, preserving landing source id/key/page/hash fields.

- [ ] **Step 3: Block on maint item page source metadata completeness**

Run SELECT-only checks against `maint_item_pages`:

```sql
SELECT COUNT(*) AS maint_item_pages,
       SUM(item_internal_name IS NULL OR item_internal_name = '') AS missing_item_internal_name,
       SUM(page_title IS NULL OR page_title = '') AS missing_page_title,
       SUM(landing_source_id IS NULL) AS missing_landing_source_id,
       SUM(landing_source_key IS NULL OR landing_source_key = '') AS missing_landing_source_key,
       SUM(landing_content_hash IS NULL OR landing_content_hash = '') AS missing_landing_content_hash,
       SUM(raw_json IS NULL OR JSON_VALID(raw_json) = 0) AS invalid_raw_json
FROM maint_item_pages;
```

Expected: all missing/invalid counts are 0. Null `source_revision_timestamp` is a documented source limitation, not something to synthesize.

## Task 5: Relation, Projection, and Local Compatibility Refresh

**Files:**
- Output: `reports/relation/relation-audit-2026-04-30.*`
- Output: `reports/relation/projection-to-local-core-sync-2026-04-30.json`
- Output: `reports/relation/relation-to-local-compat-sync-2026-04-30.json`

- [ ] **Step 1: Dry-run maint-to-relation sync**

Run:

```powershell
node scripts/data/relation/sync-maint-to-relation.mjs --apply=false --maint-database=terria_v1_maint --relation-database=terria_v1_relation --scopes=category,recipe,npc,buff,biome,projectile --allow-local-item-image-fallback=false --wiki-armor-sets-input=
```

Expected: reports are generated without local DB fallback or generated armor-set override; `bridgeBreakdown.localItemImageFallbackEnabled=false` and `localItemImageFallbackRows=0`; unresolved entries remain reports/audits rather than invented facts.

- [ ] **Step 2: Apply maint-to-relation sync**

Run:

```powershell
node scripts/data/relation/sync-maint-to-relation.mjs --apply=true --create-database=true --maint-database=terria_v1_maint --relation-database=terria_v1_relation --scopes=category,recipe,npc,buff,biome,projectile --allow-local-item-image-fallback=false --wiki-armor-sets-input=
```

Expected: relation tables are refreshed from maint sources and generated source-backed references only, including traceable item/NPC/projectile relation rows and audit exports.

- [ ] **Step 3: Dry-run projection-to-local core sync**

Run:

```powershell
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=false --local-database=terria_v1_local --relation-database=terria_v1_relation --domains=items,npcs,projectiles
```

Expected: only shared compatible columns are planned; projection source JSON columns remain queryable.

- [ ] **Step 4: Apply projection-to-local core sync**

Run:

```powershell
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=true --local-database=terria_v1_local --relation-database=terria_v1_relation --domains=items,npcs,projectiles
```

Expected: local core `items`, `npcs`, and `projectiles` are refreshed from relation projections with backup safeguards from the script.

- [ ] **Step 5: Dry-run local compatibility sync**

Run:

```powershell
node scripts/data/relation/sync-relation-to-local-compat-tables.mjs --apply=false --local-database=terria_v1_local --relation-database=terria_v1_relation
```

Expected: planned counts cover `item_acquisition_sources`, `npc_loot_entries`, `npc_shop_entries`, and `npc_shop_conditions`.

- [ ] **Step 6: Apply local compatibility sync**

Run:

```powershell
node scripts/data/relation/sync-relation-to-local-compat-tables.mjs --apply=true --local-database=terria_v1_local --relation-database=terria_v1_relation
```

Expected: legacy compatibility tables are replaced from resolved relation facts only. Full provenance for loot/shop compatibility rows remains in the relation tables and reports; do not treat local compatibility rows as the provenance source of truth unless a later schema task adds source fields.

## Task 6: Validation and Acceptance

**Files:**
- Output: `reports/relation/relation-health-2026-04-30.json`
- Output: `reports/relation/relation-health-2026-04-30.md`
- Output: `reports/relation/replacement-readiness-2026-04-30.json`
- Output: `reports/relation/replacement-readiness-2026-04-30.md`

- [ ] **Step 1: Run relation health report**

Run:

```powershell
node scripts/data/relation/relation-health-report.mjs --maint-database=terria_v1_maint --relation-database=terria_v1_relation --local-database=terria_v1_local
```

Expected: blocking checks are 0. Warnings are allowed only if they are unresolved/audit rows already exported by relation reports.

- [ ] **Step 2: Run replacement readiness audit**

Run:

```powershell
node scripts/data/relation/replacement-readiness-audit.mjs --local-database=terria_v1_local --relation-database=terria_v1_relation
```

Expected: items/npcs/projectiles remain switchable or the report explains a source-backed blocker.

- [ ] **Step 3: Run focused relation tests**

Run:

```powershell
node --test scripts/data/relation/secondary-relation-processor.test.mjs scripts/data/relation/projection-sync.test.mjs scripts/data/relation/relation-health-report.test.mjs scripts/data/relation/sync-projection-to-local-core-tables.test.mjs scripts/data/relation/sync-relation-to-local-compat-tables.test.mjs
```

Expected: all tests pass.

- [ ] **Step 4: Final SELECT-only validation**

Run SELECT-only checks for:

- `source_dataset_landings.item_pages_raw` current count and latest update time in local and maint.
- `maint_item_pages` count and non-empty landing hash coverage.
- `item_projectile_relations`, `npc_projectile_relations`, and projection JSON non-empty counts.
- `item_acquisition_sources`, `npc_loot_entries`, `npc_shop_entries`, `npc_shop_conditions` counts.

Expected: counts remain source-backed and non-empty where the relation health report expects non-zero data.

## Completion Criteria

- All apply commands complete with exit 0.
- Every apply step writes a report path.
- Relation health has 0 blocking checks.
- Any warning is explicitly documented as unresolved/audit work, not a crawler gap.
- No invented values are inserted to satisfy counts.
- Worktree changes are limited to the plan and generated reports unless separately approved.
