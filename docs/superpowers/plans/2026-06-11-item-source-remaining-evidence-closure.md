# Item Source Remaining Evidence Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining item acquisition source gap after source-row quality repair by classifying every active-source-lacking item into a concrete, auditable lane without writing DB rows in this plan.

**Architecture:** Keep runtime source rows, derived display projection, and evidence-gap classification separate. The plan regenerates the current read-only baseline and coverage reports, captures current local DB quality counters, and produces a read-only closure report with complete row lists by lane. Any future DB-writing lane must be a separate reviewed patch to this MD or a separate plan.

**Tech Stack:** Node.js ESM audit scripts under `scripts/data/audit`, existing local MySQL schema `terria_v1_local`, existing relation apply scripts under `scripts/data/relation`, JSON reports under `data/reports`, and Node test runner.

---

## Current State

Source row quality has already been repaired in local DB:

- Active `item_acquisition_sources`: `6932`
- `npc` / `boss` rows with missing `source_ref_id`: `0`
- `source_ref_type = 'unknown'`: `0`
- active `source_page LIKE 'http%'`: `0`
- non-`biome_wikitext` empty runtime source name rows: `0`
- `npc_group` rows: `155`
- `boss_group` rows: `1`
- `biome_wikitext` rows with empty `source_ref_name`: `30`, intentionally preserved as bottom-table evidence.

Latest reusable reports:

- `data/reports/item-source-full-baseline-2026-06-11-post-candidate-apply.json`
  - `itemsWithoutActiveSources = 3730`
  - `recipeChainCovered = 2603`
  - `biomeEvidenceOnly = 15`
  - `npcRelationChainGap = 2`
  - `unclassifiedNoSourceEvidence = 1110`
- `data/reports/item-source-gap-coverage-plan-2026-06-11-post-ref-closure-v2.json`
  - `familyPolicyCandidate = 451`
  - `biomeEvidenceProjection = 12`
  - `npcRefResolutionGap = 1`, suspected stale report wording because DB missing refs are already `0`.
  - `unclassifiedRequiresNewLane = 832`
- `data/reports/item-source-unclassified-no-evidence-breakdown-2026-06-11.json`
  - row-quality counters are already `0`.
  - category buckets include furniture, materials, consumables, armor vanity parts, uncategorized/internal items, tools, weapons, storage furniture, and mount.

## Closure Definition

This task is complete when all of the following are true:

- A new read-only report lists every current active-source-lacking item exactly once.
- The report denominator equals the freshly regenerated baseline `summary.itemsWithoutActiveSources`, currently expected near `3730`.
- `rows.length`, unique `itemId` count, and lane-count sum all equal that denominator.
- The report has `unclassifiedOpen = 0`.
- The report separates these lanes:
  - `local_source_already_present`
  - `recipe_or_shimmer_chain_covered`
  - `biome_evidence_projection`
  - `npc_relation_chain_gap`
  - `family_policy_candidate`
  - `needs_external_source_evidence`
  - `explicit_no_source_exemption_candidate`
  - `runtime_or_developer_internal`
  - `manual_review_required`
- `manual_review_required` is not a silent success lane: every row must include `itemId`, `internalName`, `name`, `closureReason`, `classificationRule`, `sourceEvidenceStatus`, `sourceReportPaths`, and `failedRules`.
- Any row still lacking active local source has a concrete reason and evidence-status fields, not just `activeSourceCount = 0`.
- Complete `rowsByLane` and `categoryBreakdownByLane` are present so the user can inspect every item in every class.
- The stale `npcRefResolutionGap = 1` path is resolved into either a real named item needing repair or a report freshness warning.
- The stale warning, when present, includes the old coverage rows such as `CenxsWings / Cenx's Wings`, old lane, old blocked reason, input report path, old count, current DB missing-ref count, and timestamp.
- Baseline `npcRelationChainGap`, coverage `npcRefResolutionGap`, baseline `biomeEvidenceOnly`, coverage `biomeEvidenceProjection`, and preserved empty `biome_wikitext` name counts are reconciled in report warnings/metadata.
- Source-row quality counters remain zero for missing NPC/Boss refs, unknown refs, wiki URL source pages, and non-biome empty runtime names.
- `sourceRowQuality.emptyBiomeWikitextNameRowsPreserved` is recorded and not counted as a runtime defect.
- Focused tests and `git diff --check` pass.

## Hard Boundaries

- Do not run crawler, fetch, import, backfill, pipeline, sync, materialize, Flyway, or production refresh commands.
- Do not write production DB.
- This specific plan is read-only. It may read local DB and write JSON/MD/test/script files, but it must not mutate DB rows.
- Do not hand-edit SQL data or batch modify category/source fields.
- Do not run `--apply=true` until a lane has a dry-run report with `validationErrors = 0`.
- All DB writes, if any, must target only `terria_v1_local`.
- Every DB-writing lane must produce backup JSON and rollback SQL.
- No hard deletes. Rollback and removal use soft delete or identity-preserving update.
- Do not fabricate acquisition rows for the `1110` no-evidence items. If local evidence is absent, classify them as external evidence needed or exemption/manual review candidates.
- Do not treat `biome_wikitext` empty `source_ref_name` rows as defective runtime names; preserve them and expose them through derived projection/reporting.
- No DB-writing lane may execute until this MD is patched with dry-run output path, `validationErrors = 0`, exact target rows, local DB DSN/database proof, backup JSON path, rollback SQL path, soft-delete rollback semantics, and reviewer approval. That future lane still does not authorize crawler, fetch, import, backfill, sync, pipeline, materialize, or Flyway execution.

## Multi-Agent Ownership

- Agent A, data safety reviewer: owns plan review for read-only boundaries, local DB guards, future rollback requirements, and forbidden command scanning.
- Agent B, evidence classifier reviewer: owns lane definitions for the `1110` no-evidence rows and `451` family candidates; verifies no lane implies fake data import.
- Agent C, audit/report reviewer: owns stale `npcRefResolutionGap` and biome projection wording; verifies the final report can prove the user's complaint without relying on old reports.
- Agent D, final acceptance reviewer: owns final command list, status interpretation, and proof that every unresolved row is named and classified.

Parallel allowed:

- Read-only review of this MD.
- Read-only inspection of reports.
- Unit test writing for pure helpers.
- Final report inspection.

Parallel forbidden:

- Parallel writes to `item_acquisition_sources`.
- Running apply scripts while another agent is creating a plan for the same table.
- Service restarts while data quality checks are running.

## Files

- Create: `scripts/data/audit/build-item-source-remaining-closure-report.mjs`
- Create: `scripts/data/audit/build-item-source-remaining-closure-report.test.mjs`
- Create: `data/reports/item-source-full-baseline-2026-06-11-current.json`
- Create: `data/reports/item-source-gap-coverage-plan-2026-06-11-current.json`
- Create: `data/reports/item-source-row-quality-2026-06-11-current.json`
- Create: `data/reports/item-source-remaining-closure-2026-06-11-current.json`
- Modify: `docs/superpowers/plans/2026-06-11-item-source-remaining-evidence-closure.md`

## Task 0: Preflight And Plan Review

- [x] Run branch and workspace checks and preserve dirty-worktree inventory.

```bash
git status --short --branch
git branch --show-current
git diff --name-only
git diff --cached --name-only
```

Expected:

- Current branch is not `main` or `master`.
- Existing dirty files are preserved.

- [x] Run source-row quality read-only query and save current JSON.

```bash
node scripts/data/audit/build-item-source-remaining-closure-report.mjs \
  --write-source-quality-only data/reports/item-source-row-quality-2026-06-11-current.json
```

Expected:

- All four quality counters are `0`.
- `emptyBiomeWikitextNameRowsPreserved` is recorded separately.
- The report records resolved host, port, and database, with database fixed to `terria_v1_local`.
- This command only uses `SELECT`.

- [x] Dispatch the four plan reviewers and patch this MD for any critical or important defect before implementation.

Expected:

- Agent A/B/C/D return no blocking defects after repairs.

## Task 1: Write Failing Tests For Remaining Closure Report

- [x] Add `scripts/data/audit/build-item-source-remaining-closure-report.test.mjs` with these tests:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildItemSourceRemainingClosureReport,
  parseBuildItemSourceRemainingClosureReportArgs
} from './build-item-source-remaining-closure-report.mjs';

function baselineRow(overrides = {}) {
  return {
    itemId: 1,
    internalName: 'StoneBlock',
    name: 'Stone Block',
    activeSourceCount: 0,
    primaryBucket: 'unclassified_no_source_evidence',
    hasRecipe: false,
    hasBiomeEvidence: false,
    hasNpcLootOrShop: false,
    evidence: [],
    ...overrides
  };
}

test('parseBuildItemSourceRemainingClosureReportArgs rejects mutation flags', () => {
  assert.throws(
    () => parseBuildItemSourceRemainingClosureReportArgs(['--apply=true']),
    /read-only remaining closure report refuses mutation flag/
  );
});

test('buildItemSourceRemainingClosureReport assigns every row exactly one closure lane', () => {
  const report = buildItemSourceRemainingClosureReport({
    generatedAt: '2026-06-11T00:00:00.000Z',
    baselineReport: {
      rows: [
        baselineRow({ itemId: 1, internalName: 'HasLocal', activeSourceCount: 1, primaryBucket: 'local_source_already_present' }),
        baselineRow({ itemId: 2, internalName: 'RecipeOnly', primaryBucket: 'recipe_chain_covered', hasRecipe: true }),
        baselineRow({ itemId: 3, internalName: 'BiomeOnly', primaryBucket: 'biome_evidence_only', hasBiomeEvidence: true }),
        baselineRow({ itemId: 4, internalName: 'NpcGap', primaryBucket: 'npc_relation_chain_gap', hasNpcLootOrShop: true }),
        baselineRow({ itemId: 5, internalName: 'BannerOne', name: 'Blue Slime Banner' }),
        baselineRow({ itemId: 6, internalName: 'FirstFractal', name: 'First Fractal' }),
        baselineRow({ itemId: 7, internalName: 'FallenStar', name: 'Fallen Star' }),
        baselineRow({ itemId: 8, internalName: 'NeedsManual', name: 'Needs Manual' })
      ]
    },
    coveragePlan: {
      rows: [
        { itemId: 5, lane: 'family_policy_candidate', blockedReason: 'family_page_candidate' }
      ]
    },
    sourceRowQuality: {
      missingNpcBossRefRows: 0,
      unknownSourceRefRows: 0,
      wikiUrlSourcePageRows: 0,
      emptyRuntimeSourceNameRows: 0,
      emptyBiomeWikitextNameRowsPreserved: 30
    }
  });

  assert.deepEqual(report.rows.map((row) => row.closureLane), [
    'local_source_already_present',
    'recipe_or_shimmer_chain_covered',
    'biome_evidence_projection',
    'npc_relation_chain_gap',
    'family_policy_candidate',
    'runtime_or_developer_internal',
    'needs_external_source_evidence',
    'manual_review_required'
  ]);
  assert.equal(report.summary.totalRows, 8);
  assert.equal(report.summary.denominator, 8);
  assert.equal(report.summary.unclassifiedOpen, 0);
  assert.equal(report.summary.laneCountSum, 8);
  assert.equal(report.rowsByLane.needs_external_source_evidence[0].sourceEvidenceStatus, 'absent_local_evidence');
  assert.deepEqual(report.summary.zeroCountLanes.explicit_no_source_exemption_candidate, 0);
});

test('buildItemSourceRemainingClosureReport reports stale npc ref gap when DB quality is zero', () => {
  const report = buildItemSourceRemainingClosureReport({
    baselineReport: { rows: [] },
    coveragePlan: {
      inputPath: 'data/reports/item-source-gap-coverage-plan-2026-06-11-post-ref-closure-v2.json',
      summary: { npcRefResolutionGap: 1 },
      rows: [
        { itemId: 3381, internalName: 'CenxsWings', name: "Cenx's Wings", lane: 'npc_ref_resolution_gap', blockedReason: 'npc_loot_or_shop_not_projected_to_item_sources', evidence: [] }
      ]
    },
    sourceRowQuality: {
      missingNpcBossRefRows: 0,
      unknownSourceRefRows: 0,
      wikiUrlSourcePageRows: 0,
      emptyRuntimeSourceNameRows: 0,
      emptyBiomeWikitextNameRowsPreserved: 30
    }
  });

  assert.equal(report.summary.staleNpcRefGapWarning, true);
  assert.match(report.warnings[0], /npcRefResolutionGap=1/);
  assert.equal(report.staleNpcRefGapRows[0].internalName, 'CenxsWings');
});

test('buildItemSourceRemainingClosureReport rejects duplicate baseline item ids', () => {
  assert.throws(
    () => buildItemSourceRemainingClosureReport({
      baselineReport: { rows: [baselineRow({ itemId: 1 }), baselineRow({ itemId: 1, internalName: 'Duplicate' })] },
      coveragePlan: { rows: [] },
      sourceRowQuality: {}
    }),
    /duplicate baseline itemId/
  );
});
```

- [x] Run the test and confirm it fails because the module does not exist yet.

```bash
node --test scripts/data/audit/build-item-source-remaining-closure-report.test.mjs
```

Expected:

- Fails with module-not-found for `build-item-source-remaining-closure-report.mjs`.

## Task 2: Implement Read-Only Remaining Closure Report

- [x] Create `scripts/data/audit/build-item-source-remaining-closure-report.mjs`.

Required CLI:

```bash
node scripts/data/audit/audit-items-without-active-sources.mjs \
  --output data/reports/item-source-full-baseline-2026-06-11-current.json

node scripts/data/audit/build-item-source-gap-coverage-plan.mjs \
  --baseline data/reports/item-source-full-baseline-2026-06-11-current.json \
  --candidate-plan data/reports/item-source-candidate-import-plan.post-ref-closure.json \
  --output data/reports/item-source-gap-coverage-plan-2026-06-11-current.json

node scripts/data/audit/build-item-source-remaining-closure-report.mjs \
  --write-source-quality-only data/reports/item-source-row-quality-2026-06-11-current.json

node scripts/data/audit/build-item-source-remaining-closure-report.mjs \
  --baseline data/reports/item-source-full-baseline-2026-06-11-current.json \
  --coverage-plan data/reports/item-source-gap-coverage-plan-2026-06-11-current.json \
  --source-quality-report data/reports/item-source-row-quality-2026-06-11-current.json \
  --output data/reports/item-source-remaining-closure-2026-06-11-current.json
```

Required behavior:

- Reject mutation flags: `apply`, `write-db`, `sync`, `import`, `materialize`, `backfill`, `refresh`, `pipeline`, `crawler`, `fetch`, `flyway`, `delete`, `truncate`, `drop`, `alter`.
- Only connect to DB in `--write-source-quality-only` mode, and only for `SELECT` against `terria_v1_local`.
- In closure-report mode, consume report JSON files only.
- Emit every active-source-lacking baseline row exactly once; local-source-present rows are counted in input metadata, not closure rows.
- Validate denominator equals `baseline.summary.itemsWithoutActiveSources`.
- Validate unique `itemId` count equals denominator.
- Validate lane counts sum to denominator.
- Validate all coverage-plan rows either match a baseline row or are listed in `unmatchedCoverageRows`.
- Use coverage plan lanes for `family_policy_candidate`.
- Use baseline evidence for local, recipe, biome, and NPC relation lanes.
- Classify no-evidence rows with deterministic rules:
  - `runtime_or_developer_internal`: internal names or names matching known developer, inactive, boss bag internal, projectile/effect/icon/test placeholders.
  - `explicit_no_source_exemption_candidate`: rows that match deterministic non-obtainable/internal exemption candidates; this lane is expected to be low or zero and must be separately counted.
  - `needs_external_source_evidence`: obtainable-looking rows with `sourceEvidenceStatus = 'absent_local_evidence'`; this means local artifacts do not contain source evidence and an external crawler/fetch/manual evidence lane is needed later.
  - `manual_review_required`: rows with no evidence that do not match a deterministic rule, with `failedRules` proving it did not match runtime/internal, exemption, family, biome, NPC, recipe, or external-source rules.
- Produce `summary.unclassifiedOpen = 0`; `manualReviewRequired` is valid only when every manual row has complete fields and full `rowsByLane` details.
- Produce `summary.staleNpcRefGapWarning = true` when old coverage says `npcRefResolutionGap > 0` but current source quality says missing NPC/Boss ref rows are `0`.
- Include complete `rowsByLane`, `categoryBreakdownByLane`, and `sampleRowsByLane` for quick inspection.
- Reconcile baseline `npcRelationChainGap` vs coverage `npcRefResolutionGap`, and baseline `biomeEvidenceOnly` vs coverage `biomeEvidenceProjection`.
- Record `sourceRowQuality.emptyBiomeWikitextNameRowsPreserved` as expected preserved evidence, not a defect.

- [x] Run tests and fix until green.

```bash
node --test scripts/data/audit/build-item-source-remaining-closure-report.test.mjs
```

Expected:

- Test file passes.

## Task 3: Generate Current Closure Report

- [x] Regenerate current baseline and coverage reports from current local state.

```bash
node scripts/data/audit/audit-items-without-active-sources.mjs \
  --output data/reports/item-source-full-baseline-2026-06-11-current.json

node scripts/data/audit/build-item-source-gap-coverage-plan.mjs \
  --baseline data/reports/item-source-full-baseline-2026-06-11-current.json \
  --candidate-plan data/reports/item-source-candidate-import-plan.post-ref-closure.json \
  --output data/reports/item-source-gap-coverage-plan-2026-06-11-current.json
```

Expected:

- Commands are read-only.
- Generated baseline and coverage both have `rows.length = 6159` before closure filtering.

- [x] Generate current DB quality snapshot.

```bash
node scripts/data/audit/build-item-source-remaining-closure-report.mjs \
  --write-source-quality-only data/reports/item-source-row-quality-2026-06-11-current.json
```

Expected:

- Missing NPC/Boss refs, unknown refs, wiki URL source pages, and non-biome empty runtime names are all `0`.
- Empty biome wikitext names are recorded as preserved.

- [x] Generate the closure report from current artifacts.

```bash
node scripts/data/audit/build-item-source-remaining-closure-report.mjs \
  --baseline data/reports/item-source-full-baseline-2026-06-11-current.json \
  --coverage-plan data/reports/item-source-gap-coverage-plan-2026-06-11-current.json \
  --source-quality-report data/reports/item-source-row-quality-2026-06-11-current.json \
  --output data/reports/item-source-remaining-closure-2026-06-11-current.json
```

Expected:

- `summary.unclassifiedOpen = 0`.
- `summary.denominator = summary.totalRows = summary.uniqueItemIds = summary.laneCountSum`.
- `summary.needsExternalSourceEvidence` is the explicit bucket for rows that cannot be safely imported without crawler/fetch/import permission.
- `summary.manualReviewRequired` is fully enumerated under `rowsByLane.manual_review_required`.
- If `summary.staleNpcRefGapWarning = true`, the warning explains that the old coverage report is stale relative to current DB quality counters.

## Task 4: Acceptance Validation

- [x] Run focused tests.

```bash
node --test \
  scripts/data/audit/audit-items-without-active-sources.test.mjs \
  scripts/data/audit/build-item-source-gap-coverage-plan.test.mjs \
  scripts/data/audit/build-item-source-remaining-closure-report.test.mjs
```

Expected:

- All tests pass.

- [x] Run current read-only source-row quality snapshot again.

```bash
node scripts/data/audit/build-item-source-remaining-closure-report.mjs \
  --write-source-quality-only data/reports/item-source-row-quality-2026-06-11-current.verify.json
```

Expected:

- Missing NPC/Boss refs, unknown refs, wiki URL pages, and non-biome empty runtime names are all `0`.

- [x] Run report assertion.

```bash
node -e "const fs=require('fs'); const r=JSON.parse(fs.readFileSync('data/reports/item-source-remaining-closure-2026-06-11-current.json','utf8')); const s=r.summary; if (s.unclassifiedOpen !== 0) throw new Error('unclassifiedOpen must be 0'); if (s.totalRows !== s.denominator || s.uniqueItemIds !== s.denominator || s.laneCountSum !== s.denominator) throw new Error('denominator mismatch'); for (const row of r.rows) { if (!row.closureLane || !row.closureReason || !row.classificationRule || !row.sourceEvidenceStatus || !Array.isArray(row.sourceReportPaths)) throw new Error('row missing closure fields: '+row.itemId); } console.log(JSON.stringify({reportPath:'data/reports/item-source-remaining-closure-2026-06-11-current.json',generatedAt:r.generatedAt,totalRows:s.totalRows,unclassifiedOpen:s.unclassifiedOpen,laneCounts:s.laneCounts,staleNpcRefGapWarning:s.staleNpcRefGapWarning},null,2));"
```

Expected:

- Prints summary and exits `0`.

- [x] Run diff hygiene.

```bash
git diff --check
git status --short --branch
git diff --name-only
git diff --cached --name-only
```

Expected:

- `git diff --check` exits `0`.
- No unrelated files are reverted or staged.

## If Gaps Remain

- If the report finds a real local-evidence source-row candidate, append a new reviewed lane to this MD before writing DB.
- If the report shows only `needs_external_source_evidence`, the local repair is closed and the next separate task is an explicitly approved crawler/fetch/import refresh lane.
- If source-row quality counters regress, stop and repair the regression before generating final status.
