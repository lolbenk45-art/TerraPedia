# Item Source Existing Evidence Cross Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Explain and reduce the confusion behind "the data already exists in DB" by producing a read-only cross-audit that shows, for every remaining item-source gap, which database/report layer already has evidence and which exact projection into active `item_acquisition_sources` is missing.

**Architecture:** Add a read-only audit layer on top of the existing closure reports. The audit must not infer that an item is closed merely because the item exists in `items`; it must separately report existence in `items`, active source rows in `item_acquisition_sources`, recipe rows, NPC loot/shop rows, biome rows, maint/relation source rows, raw-page candidates, terminal closure rows, and candidate import rows. The output becomes the next planning source of truth for deciding whether a row should be projected, imported, exempted, or requires raw evidence.

**Tech Stack:** Node.js ESM scripts under `scripts/data/audit`, MySQL read-only checks against `terria_v1_local` plus optional `terria_v1_maint` and `terria_v1_relation`, generated reports under `data/reports`, existing JSON reports from the item-source closure chain.

---

## User Problem

The user observed that many of the listed items "already exist in the database". The current reports are correct only if the target means:

```text
active row exists in item_acquisition_sources
WHERE item_id = ? AND status = 1 AND deleted = 0
```

But the user's complaint is about a different question:

```text
Does the item or its evidence already exist somewhere else in DB?
```

This plan closes that gap by making the distinction explicit and machine-readable.

## Current Inputs

- Remaining closure report:
  - `data/reports/item-source-remaining-closure-2026-06-11-current.json`
- Coverage plan:
  - `data/reports/item-source-gap-coverage-plan-2026-06-11-current.json`
- Raw page candidate report:
  - `data/reports/item-source-raw-page-candidates-2026-06-11-current.json`
- Candidate import plan:
  - `data/reports/item-source-candidate-import-plan.post-ref-closure.json`
- Terminal exemption plan:
  - `data/reports/item-source-terminal-exemption-plan-2026-06-11.json`

## Hard Boundaries

- Do not run crawler, fetch, import, backfill, sync, pipeline, materialize, Flyway, or production refresh.
- Do not run `--apply=true`.
- Do not write any database.
- Do not write raw cache.
- Allowed writes:
  - this plan MD
  - new read-only audit script and tests
  - generated report JSON/MD under `data/reports`
- Do not modify existing source rows, item rows, raw pages, or generated candidate source content in this plan.
- Do not overwrite the existing uncommitted change in:
  - `data/reports/item-source-remaining-closure-2026-06-11-current.json`

## Output Contract

Create:

- `scripts/data/audit/audit-item-source-existing-evidence-layers.mjs`
- `scripts/data/audit/audit-item-source-existing-evidence-layers.test.mjs`
- `data/reports/item-source-existing-evidence-layers-2026-06-12.json`
- `data/reports/item-source-existing-evidence-layers-summary-zh-2026-06-12.md`

Each report row must include:

```json
{
  "itemId": 75,
  "internalName": "FallenStar",
  "name": "Fallen Star",
  "closureLane": "needs_external_source_evidence",
  "itemExists": true,
  "activeSourceCount": 0,
  "inactiveOrDeletedSourceCount": 0,
  "recipeCount": 0,
  "npcLootOrShopCount": 0,
  "biomeEvidenceCount": 0,
  "maintSourceCount": 0,
  "relationFactCount": 0,
  "rawCandidateSourceCount": 2,
  "candidateImportPlannedSourceRows": 0,
  "terminalClosureStatus": null,
  "evidenceLayer": "raw_candidate_not_projected",
  "projectionGap": "candidate_import_missing_or_not_applied",
  "nextAction": "review raw candidate sources and decide import/exemption lane"
}
```

Required `evidenceLayer` values:

- `active_source_present`: active `item_acquisition_sources` already exists; row should not be in remaining closure unless reports are stale.
- `item_only_no_source_evidence`: item exists, but no source evidence found in checked layers.
- `raw_candidate_not_projected`: raw candidate sources exist but no active source row.
- `candidate_import_not_applied`: candidate import plan has planned rows but no active source row.
- `recipe_or_shimmer_covered`: recipe/shimmer evidence exists and closure lane already treats it as covered.
- `npc_relation_not_projected`: NPC loot/shop evidence exists but no active item source projection.
- `biome_projection_pending`: biome evidence exists and needs projection/display handling, not normal item source import.
- `maint_or_relation_not_published`: maint or relation fact exists but is not published into local active source rows.
- `family_policy_pending`: candidate exists but family/shared page policy blocks direct import.
- `terminal_exempt_or_identity_review`: terminal closure says do not import as normal item acquisition source.
- `missing_required_raw_evidence`: exact raw evidence is missing and must be acquired before parsing.

Required summary fields:

```json
{
  "totalRows": 3730,
  "activeSourcePresentButStillInClosure": 0,
  "itemOnlyNoSourceEvidence": 0,
  "rawCandidateNotProjected": 0,
  "candidateImportNotApplied": 0,
  "recipeOrShimmerCovered": 0,
  "npcRelationNotProjected": 0,
  "biomeProjectionPending": 0,
  "maintOrRelationNotPublished": 0,
  "familyPolicyPending": 0,
  "terminalExemptOrIdentityReview": 0,
  "missingRequiredRawEvidence": 0,
  "layerCounts": {},
  "closureLaneCounts": {}
}
```

## Multi-Agent Review Split

- Agent A: DB/report chain reviewer. Owns read-only SQL shape, table coverage, and no-write guarantees.
- Agent B: Audit script contract reviewer. Owns row schema, layer classification precedence, and tests.
- Agent C: Report readability reviewer. Owns Chinese summary structure and whether it answers the user's "库里有" confusion.
- Agent D: Safety reviewer. Owns forbidden-command scan, dirty-worktree handling, and final validation.

Parallel allowed:

- Read-only review of existing scripts/reports.
- Independent review of proposed output fields.
- Test fixture review.

Parallel forbidden:

- Any DB write.
- Any generated report overwrite outside the explicit new files.
- Any crawler/fetch/import/backfill execution.

## Classification Precedence

Apply precedence in this exact order:

1. `active_source_present`
2. `terminal_exempt_or_identity_review`
3. `missing_required_raw_evidence`
4. `recipe_or_shimmer_covered`
5. `npc_relation_not_projected`
6. `biome_projection_pending`
7. `maint_or_relation_not_published`
8. `candidate_import_not_applied`
9. `raw_candidate_not_projected`
10. `family_policy_pending`
11. `item_only_no_source_evidence`

Reason: active source rows mean the report is stale; terminal and missing raw lanes must not be accidentally imported; recipe/NPC/biome/maint/relation are DB-backed evidence layers; candidate/raw/family are report-backed evidence layers; item-only is the final fallback.

## Task 1: Write Tests For Layer Classification

**Files:**

- Create: `scripts/data/audit/audit-item-source-existing-evidence-layers.test.mjs`

- [ ] Add a helper fixture with rows for these cases:
  - active source present even though closure row exists -> `active_source_present`
  - item exists only -> `item_only_no_source_evidence`
  - raw candidate source exists -> `raw_candidate_not_projected`
  - candidate import planned rows exist -> `candidate_import_not_applied`
  - recipe covered -> `recipe_or_shimmer_covered`
  - NPC loot/shop evidence -> `npc_relation_not_projected`
  - biome evidence -> `biome_projection_pending`
  - maint/relation source count -> `maint_or_relation_not_published`
  - family policy lane -> `family_policy_pending`
  - terminal exemption -> `terminal_exempt_or_identity_review`
  - missing raw evidence -> `missing_required_raw_evidence`

- [ ] Assert parser rejects mutation flags:

```js
for (const flag of ['apply', 'write-db', 'sync', 'import', 'backfill', 'crawler', 'fetch', 'pipeline', 'materialize', 'flyway', 'refresh']) {
  assert.throws(
    () => parseAuditItemSourceExistingEvidenceLayersArgs([`--${flag}=true`]),
    /read-only existing evidence audit refuses mutation flag/
  );
}
```

- [ ] Assert summary counts equal the number of rows in each `evidenceLayer`.

- [ ] Assert `active_source_present` row sets `projectionGap = "closure_report_stale_or_source_reintroduced"`.

- [ ] Assert terminal rows do not become raw/candidate/import rows even if raw candidates also exist.

Run:

```bash
node --test scripts/data/audit/audit-item-source-existing-evidence-layers.test.mjs
```

Expected before implementation: module not found or missing export failure.

## Task 2: Implement Read-Only Existing Evidence Audit

**Files:**

- Create: `scripts/data/audit/audit-item-source-existing-evidence-layers.mjs`

- [ ] Implement `parseAuditItemSourceExistingEvidenceLayersArgs(argv)`.

Required options:

```text
--closure-report
--coverage-plan
--raw-candidates
--candidate-plan
--terminal-plan
--output
--summary-output
--local-database
--maint-database
--relation-database
--host
--port
--user
--password
```

Defaults:

```text
closure-report=data/reports/item-source-remaining-closure-2026-06-11-current.json
coverage-plan=data/reports/item-source-gap-coverage-plan-2026-06-11-current.json
raw-candidates=data/reports/item-source-raw-page-candidates-2026-06-11-current.json
candidate-plan=data/reports/item-source-candidate-import-plan.post-ref-closure.json
terminal-plan=data/reports/item-source-terminal-exemption-plan-2026-06-11.json
local-database=terria_v1_local
maint-database=terria_v1_maint
relation-database=terria_v1_relation
```

- [ ] Implement pure function:

```js
export function buildItemSourceExistingEvidenceLayersReport({
  generatedAt,
  closureReport,
  coveragePlan,
  rawCandidateReport,
  candidatePlan,
  terminalPlan,
  dbEvidence
})
```

- [ ] Implement DB read function:

```js
export async function loadItemSourceExistingEvidenceDbFacts(connection, {
  localDatabase,
  maintDatabase,
  relationDatabase,
  itemIds
})
```

It must only run `SELECT` statements.

Read-only counts:

```sql
-- items existence
SELECT id FROM items WHERE id IN (...) AND status = 1 AND deleted = 0;

-- active item source rows
SELECT item_id, COUNT(*) FROM item_acquisition_sources
WHERE item_id IN (...) AND status = 1 AND deleted = 0 GROUP BY item_id;

-- inactive or deleted source rows
SELECT item_id, COUNT(*) FROM item_acquisition_sources
WHERE item_id IN (...) AND NOT (status = 1 AND deleted = 0) GROUP BY item_id;

-- recipes
SELECT result_item_id, COUNT(*) FROM recipes
WHERE result_item_id IN (...) AND status = 1 AND deleted = 0 GROUP BY result_item_id;

-- NPC loot/shop
SELECT item_id, COUNT(*) FROM npc_loot_entries
WHERE item_id IN (...) AND status = 1 AND deleted = 0 GROUP BY item_id;
SELECT item_id, COUNT(*) FROM npc_shop_entries
WHERE item_id IN (...) AND status = 1 AND deleted = 0 GROUP BY item_id;

-- biome
SELECT item_id, COUNT(*) FROM item_biomes
WHERE item_id IN (...) GROUP BY item_id;
SELECT item_id, COUNT(*) FROM item_acquisition_sources
WHERE item_id IN (...) AND source_ref_type = 'biome_wikitext' AND status = 1 AND deleted = 0 GROUP BY item_id;
```

Optional tables must degrade to warning entries if absent:

- `terria_v1_maint.maint_item_sources`
- `terria_v1_relation.item_source_facts`

- [ ] Implement report-backed indexes:
  - raw candidate source count from `rawCandidateReport.candidates`.
  - candidate planned source rows from `candidatePlan.eligibleCandidates`.
  - blocked family policy from `coveragePlan.rows`.
  - terminal status from `terminalPlan.rows`.

- [ ] Implement `resolveEvidenceLayer(row)` using the exact precedence above.

- [ ] Implement `renderChineseSummary(report)`.

The summary must include:

- top-level table of layer counts;
- explanation that `items` existence is not the same as active source rows;
- full list for layers with `count <= 30`;
- top 50 samples for larger layers;
- next action per layer.

## Task 3: Generate Reports Read-Only

**Files:**

- Create: `data/reports/item-source-existing-evidence-layers-2026-06-12.json`
- Create: `data/reports/item-source-existing-evidence-layers-summary-zh-2026-06-12.md`

Run:

```bash
node scripts/data/audit/audit-item-source-existing-evidence-layers.mjs \
  --output=data/reports/item-source-existing-evidence-layers-2026-06-12.json \
  --summary-output=data/reports/item-source-existing-evidence-layers-summary-zh-2026-06-12.md
```

Expected:

- Report has `readOnly: true`.
- `summary.totalRows === 3730`.
- `sum(summary.layerCounts) === 3730`.
- Any item with `activeSourceCount > 0` appears in `active_source_present`, not in a repair lane.
- The Chinese summary explicitly answers:
  - "物品在库里有" means `itemExists = true`.
  - "来源闭合" means active `item_acquisition_sources` exists.
  - "证据在别的表里有" means projection/import lane is needed.

## Task 4: Plan Audit And Safety Validation

**Files:**

- Read/validate:
  - `scripts/data/audit/audit-item-source-existing-evidence-layers.mjs`
  - `scripts/data/audit/audit-item-source-existing-evidence-layers.test.mjs`
  - generated JSON/MD reports

- [ ] Run tests:

```bash
node --test scripts/data/audit/audit-item-source-existing-evidence-layers.test.mjs scripts/data/audit/audit-items-without-active-sources.test.mjs scripts/data/audit/build-item-source-gap-coverage-plan.test.mjs scripts/data/audit/build-item-source-remaining-closure-report.test.mjs
```

- [ ] Run forbidden mutation scan:

```bash
rg -n "INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|--apply|crawler|fetch|import|backfill|pipeline|sync|materialize" scripts/data/audit/audit-item-source-existing-evidence-layers.mjs
```

Expected:

- No DB mutation SQL.
- Any string match from comments or mutation guard must be reviewed and documented.

- [ ] Run report invariant check:

```bash
node - <<'NODE'
const fs = require('fs');
const report = JSON.parse(fs.readFileSync('data/reports/item-source-existing-evidence-layers-2026-06-12.json', 'utf8'));
const layerSum = Object.values(report.summary.layerCounts).reduce((sum, count) => sum + count, 0);
console.log(JSON.stringify({ totalRows: report.summary.totalRows, layerSum, activeSourcePresentButStillInClosure: report.summary.activeSourcePresentButStillInClosure }, null, 2));
if (report.summary.totalRows !== 3730) process.exit(1);
if (layerSum !== report.summary.totalRows) process.exit(1);
NODE
```

- [ ] Run `git diff --check`.

## Task 5: Use Results To Choose Next Repair Lane

**Files:**

- Modify or create only if needed:
  - `data/reports/item-source-existing-evidence-layers-summary-zh-2026-06-12.md`

- [ ] Add a final section named `下一轮建议`.

It must choose the next lane based on actual generated counts:

- If `active_source_present > 0`: first repair stale reports.
- Else if `candidate_import_not_applied > 0`: prepare guarded dry-run/apply plan for existing candidate rows.
- Else if `raw_candidate_not_projected > 0`: build candidate import plan from raw candidates.
- Else if `maint_or_relation_not_published > 0`: build publication projection plan.
- Else if `family_policy_pending > 0`: build family policy parser plan.
- Else if `item_only_no_source_evidence > 0`: split no-evidence items by category/name pattern before fetching or importing.

This task does not execute the next repair. It only makes the next repair direction evidence-backed.

## Final Validation Checklist

- [ ] New audit script is read-only and rejects mutation flags.
- [ ] Generated JSON explains every remaining row in exactly one evidence layer.
- [ ] Chinese summary answers why "DB has item" does not equal "source closed".
- [ ] No DB writes happened.
- [ ] No crawler/fetch/import/backfill/sync/pipeline/Flyway ran.
- [ ] Existing uncommitted files not owned by this plan were not modified.
- [ ] `git status --short --branch -uall` shows only this plan's files plus pre-existing dirty files.

## Plan Auditor Review

## Verdict

- Status: execution-ready after protecting the pre-existing dirty JSON report.
- Main goal: produce a read-only, evidence-layer report explaining where "already in DB" data exists and why it is not counted as active item source closure.
- Closure definition: every remaining closure row receives exactly one evidence layer and a concrete next action; generated Chinese summary is readable without inspecting JSON.

## Blocking Plan Defects

- Critical: none after adding explicit dirty-file boundary.
- Important: no apply/import path may be added in this plan; repair lanes are deferred to the next branch.

## Plan Repairs

- Change: added `active_source_present` as highest precedence.
- Reason: if active source rows exist, the report is stale and must not trigger data repair.
- Validation added: invariant check for `activeSourcePresentButStillInClosure`.

## Execution-Ready Plan

- Scope: new read-only audit script, tests, JSON report, Chinese Markdown report.
- Agent split: DB/report chain, script contract, report readability, safety validation.
- Smoke test: sample rows must distinguish `itemExists=true` from `activeSourceCount>0`.
- Final validation: tests, mutation scan, report invariants, `git diff --check`.

## Residual Risk

- Risk: optional maint/relation databases may be unavailable locally.
- Follow-up trigger: if optional tables are missing, report warnings and continue with local DB + JSON report evidence; do not block the audit unless local `terria_v1_local` is unreadable.
