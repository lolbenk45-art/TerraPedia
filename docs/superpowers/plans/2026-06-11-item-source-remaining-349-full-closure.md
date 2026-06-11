# Item Source Remaining 349 Full Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the remaining 349 item source evidence gaps by converting every row into either extracted source candidates or an explicit hard-blocker lane with concrete evidence paths, without writing database rows in this execution.

**Architecture:** Extend the existing read-only raw page candidate audit instead of creating a second source of truth. Shared parsing helpers in `scripts/data/lib/wiki-page-utils.mjs` extract conservative source candidates from wiki page prose and recipe tables; `scripts/data/audit/audit-remaining-source-raw-page-candidates.mjs` classifies every remaining row and proves no silent unresolved rows remain.

**Tech Stack:** Node.js ESM scripts, Node test runner, local raw wiki item page JSON cache under `/home/lolben/data/terraPedia/raw/wiki/item-pages`, JSON reports under `data/reports`.

---

## Current Baseline

Input report:

- `data/reports/item-source-raw-page-candidates-2026-06-11-current.json`

Current summary:

- `totalRows`: 827
- `candidatesWithExtractedSources`: 478
- unresolved total: 349
- `rawPagesWithoutSources`: 336
- `missingRawPage`: 13

Current unresolved lanes:

- `family_page_recipe_table_unmatched`: 153
- `family_or_shared_page_no_source_extracted`: 79
- `exact_page_no_source_extracted`: 68
- `exact_page_recipe_table_unmatched`: 36
- `missing_raw_page`: 13

## Closure Definition

This plan is complete when:

- `summary.totalRows` remains `827`.
- `summary.candidatesWithExtractedSources + summary.hardBlockedRows = 827`.
- `summary.rawPagesWithoutSources = 0`.
- `summary.unresolvedLaneCounts` is absent or every count is `0`.
- `candidates.length + hardBlockedRows.length = 827` and this accepted-row set is a bijection with `rowsByLane.needs_external_source_evidence` from `data/reports/item-source-remaining-closure-2026-06-11-current.json`.
- No duplicate accepted keys, no missing closure input keys, and no extra accepted keys.
- `rawPagesWithoutSources`, `missingRawPages`, and `unresolvedLanes` are empty or absent in the final report.
- The 13 missing raw pages are listed in `hardBlockedRows` under `missing_raw_page` with item id, internal name, display name, category, and blocker reason.
- Every formerly unresolved row has one of:
  - `extractedSources.length > 0`
  - `hardBlockLane` with a concrete blocker reason and evidence path; for `missing_raw_page`, use `attemptedRawPath` because no raw page exists.
- No candidate uses `sourceRefType = 'npc'` for generic family text such as banners, trophies, decorative family pages, or recipe-table family rows unless a concrete NPC name is extracted from a row.
- Focused tests pass.
- `git diff --check` passes.

## Hard Boundaries

- Do not run crawler, fetch, import, backfill, sync, pipeline, materialize, Flyway, or production refresh commands.
- Do not run `--apply=true`.
- Do not write DB.
- Do not hand-edit SQL data.
- Do not batch-modify category/source DB fields.
- This execution may write only MD, JS test/script/helper files, and JSON reports.
- All extraction from raw pages is candidate evidence only; DB import remains a later reviewed step.
- Generated runtime outputs are limited to `data/reports/item-source-raw-page-candidates-2026-06-11-current.json`; no raw cache files, DB files, SQL migrations, import inputs, or managed source data may be created or modified.
- `missing_raw_page` hard blocks must include item id, internal name, display name, category, `attemptedRawPath`, `blockerReason = 'missing raw wiki page cache'`, and no synthesized `sourceRefName`.
- Every hard blocker lane must include row identity, `hardBlockLane`, `blockerReason`, and either `rawPath + pageTitle` for local-page blockers or `attemptedRawPath` for missing raw blockers.
- Hard blockers must not contain extracted candidate sources or synthesized `sourceRefName`.

## Files

- Modify: `scripts/data/lib/wiki-page-utils.mjs`
- Modify: `scripts/data/lib/wiki-page-utils.test.mjs`
- Modify: `scripts/data/audit/audit-remaining-source-raw-page-candidates.mjs`
- Modify: `scripts/data/audit/audit-remaining-source-raw-page-candidates.test.mjs`
- Create/update: `data/reports/item-source-raw-page-candidates-2026-06-11-current.json`
- Create: `docs/superpowers/plans/2026-06-11-item-source-remaining-349-full-closure.md`

## Multi-Agent Review Split

- Agent A, data safety reviewer:
  - Verify the plan and final commands remain DB/source-cache/workflow read-only, with report-only writes allowed.
  - Confirm missing raw pages are not fabricated into sources.
  - Confirm no DB-writing command or forbidden workflow is introduced.
- Agent B, recipe/family extraction reviewer:
  - Inspect representative raw pages for recipe-family lanes.
  - Verify recipe-derived candidates are conservative and do not mis-map `Item IDs` as a result.
  - Check pages such as `Lanterns`, `Doors`, `Chairs`, `Wings`, `Buckets`, `Pharaoh's set`.
- Agent C, prose coverage reviewer:
  - Inspect representative exact/shared pages without recipe candidates.
  - Verify prose extraction covers Angler rewards, critters, dyes, event drops, quest items, shimmer, and worldgen without overclaiming.
- Agent D, final acceptance reviewer:
  - Review the final JSON report.
  - Verify all 827 rows are accounted for and unresolved count is zero.
  - Verify examples for each final lane.

## Task 0: Preflight And Plan Audit

- [ ] Run branch and workspace check.

```bash
git branch --show-current
git status --short
git diff --name-only
git diff --cached --name-only
```

Expected:

- Branch is not `main`.
- Dirty worktree is acknowledged and not reverted.
- Existing `*-apply` reports/backups are treated as pre-existing unless this execution explicitly creates them; this plan must not create new apply reports/backups.

- [ ] Dispatch Agent A/B/C/D for read-only plan review.

Expected:

- No blocking data-safety defect.
- No blocking extraction-design defect.
- Any important plan repair is patched into this MD before implementation.

## Task 1: Add Hard-Block Accounting To Raw Page Candidate Report

**Files:**

- Modify: `scripts/data/audit/audit-remaining-source-raw-page-candidates.test.mjs`
- Modify: `scripts/data/audit/audit-remaining-source-raw-page-candidates.mjs`

- [ ] Write a failing test proving missing raw pages are counted as hard blockers, not unresolved rows.

Test shape:

```js
assert.equal(report.summary.hardBlockedRows, 1);
assert.equal(report.summary.rawPagesWithoutSources, 0);
assert.equal(report.hardBlockedRows[0].hardBlockLane, 'missing_raw_page');
assert.equal(report.hardBlockedRows[0].blockerReason, 'missing raw wiki page cache');
assert.ok(report.hardBlockedRows[0].attemptedRawPath.endsWith('missingraw.latest.json'));
assert.equal(report.hardBlockedRows[0].sourceRefName, undefined);
```

- [ ] Run the focused test and confirm it fails.

```bash
node --test scripts/data/audit/audit-remaining-source-raw-page-candidates.test.mjs
```

Expected:

- FAIL because `hardBlockedRows` does not exist yet.

- [ ] Implement `hardBlockedRows` and `hardBlockLaneCounts`.

Implementation requirements:

- Convert missing raw pages to `hardBlockedRows`.
- Preserve `missingRawPages` for backward compatibility if useful.
- Add `summary.hardBlockedRows`.
- Add `summary.hardBlockLaneCounts`.
- Define closure-oriented `summary.unresolvedTotal`.

- [ ] Run the focused test and confirm it passes.

## Task 2: Extract Exact Recipe Table Candidates

**Files:**

- Modify: `scripts/data/lib/wiki-page-utils.mjs`
- Modify: `scripts/data/lib/wiki-page-utils.test.mjs`
- Modify: `scripts/data/audit/audit-remaining-source-raw-page-candidates.mjs`
- Modify: `scripts/data/audit/audit-remaining-source-raw-page-candidates.test.mjs`

- [ ] Write failing tests for exact-page recipe tables.

Required fixtures:

- `High Test Fishing Line` style: exact page has recipe rows where result name equals item name.
- `Lesser Restoration Potion` style: exact legacy page has result name equal item name.

Expected source row:

```js
{
  sourceType: 'craft',
  sourceRefType: 'item',
  sourceRefName: '<ingredient name>',
  quantityText: '<result quantity or 1>',
  conditions: 'Crafted by hand' // or 'Crafted at <station>'
}
```

- [ ] Run tests and confirm RED.

```bash
node --test scripts/data/audit/audit-remaining-source-raw-page-candidates.test.mjs scripts/data/lib/wiki-page-utils.test.mjs
```

- [ ] Implement exact recipe extraction in the audit script using existing `parseRecipeTable`.

Rules:

- Only convert recipes where normalized `recipe.resultName` equals current item display name or normalized page title.
- Ignore rows where result name is `Item IDs`, version labels, or blank.
- For each ingredient, emit `sourceType = 'craft'`.
- Use `sourceRefType = 'item'` for normal ingredients and `world` for recipe groups.
- Preserve station text in `conditions`.

- [ ] Run focused tests and confirm GREEN.

## Task 3: Extract Family Recipe Table Candidates Conservatively

**Files:**

- Modify: `scripts/data/audit/audit-remaining-source-raw-page-candidates.mjs`
- Modify: `scripts/data/audit/audit-remaining-source-raw-page-candidates.test.mjs`

- [ ] Write failing tests for family recipe rows.

Required fixtures:

- Actual raw HTML-pattern fixtures for `Chain Lantern`, `Blue Dungeon Chair`, and `Dungeon Door`, where the result cell contains a visible item name plus an `Item IDs` metadata link.
- A polluted result parse where the current parser would choose `Item IDs`; the fixed parser must recover the visible item name from `data-sort-value`, image `alt/title`, or non-ID title spans.
- Actual current `Wings` unresolved rows such as `Red's Wings`, `D-Town's Wings`, and `Lazure's Barrier Platform`; these must either get a page-specific evidence parser or be hard-blocked with row/page evidence, not counted as exact recipe successes.
- Positive exact-result examples from current cache: `Water Bucket`, `Lava Bucket`, `Pharaoh's Mask`, and `Pharaoh's Robe`.

- [ ] Run focused test and confirm RED.

- [ ] Implement conservative family recipe matching.

Rules:

- Match only rows whose normalized result name equals the item name.
- Do not infer a result from page title plus material when no visible item result can be recovered.
- Ignore `Item IDs`, blank result names, and version-label results.
- Fix result-cell parsing in `scripts/data/lib/wiki-page-utils.mjs` when the visible item is present but a metadata `Item IDs` link is currently selected first.
- If no exact row exists, keep the row out of candidates unless a page-specific parser is added in Task 5.
- Mark successful family recipe rows as `reviewLane = 'family_recipe_exact_result_candidate'`.
- Every recipe candidate must include `matchedRecipeResultName`, `pageTitle`, `rawPath`, and row evidence.
- No recipe candidate may have `matchedRecipeResultName` equal to `Item IDs`, blank, or a version label.

- [ ] Run focused tests and confirm GREEN.

## Task 4a: Preserve Existing Narrative Rule Regressions

**Files:**

- Modify: `scripts/data/lib/wiki-page-utils.mjs`
- Modify: `scripts/data/lib/wiki-page-utils.test.mjs`

- [ ] Keep regression tests for already-working narrative rules.

Required sentence families:

- `Strange Plant`, `Birds`, `Defender Medal`, and `Dead Man's Chest` are already covered by current narrative extraction and should remain regression tests.
- Do not count these already-closed examples as proof that the current no-source lanes are solved.

- [ ] Run shared helper tests and confirm they still pass.

```bash
node --test scripts/data/lib/wiki-page-utils.test.mjs
```

## Task 4b: Close Actual Current Exact/Shared No-Source Lanes

**Files:**

- Modify: `scripts/data/lib/wiki-page-utils.mjs`
- Modify: `scripts/data/lib/wiki-page-utils.test.mjs`
- Modify: `scripts/data/audit/audit-remaining-source-raw-page-candidates.mjs`
- Modify: `scripts/data/audit/audit-remaining-source-raw-page-candidates.test.mjs`

- [ ] Write failing tests using rows that are actually in the current no-source lanes.

Required current-row fixtures:

- `exact_page_no_source_extracted`: dye pages, `Abigail's Flower`, `Joja Cola`, `Golden Bug Net`, `Torch God's Favor`.
- `family_or_shared_page_no_source_extracted`: `Angler/Quests`, `Jellyfish`, `Tombstones`, `Masks`, `Hooks`, `Fishing poles`.

Special cases:

- `Angler/Quests` uses row templates such as `{{:Angler/Quests/row|...}}`; parse it as a page-specific template/table source or route it to an explicit hard-block lane.
- `Jellyfish` is an enemy family page; do not use broad enemy spawn prose as item acquisition for bait items unless the sentence/table is scoped to bait/caught/collectible evidence.
- `Butterflies`, `Bottomless Buckets`, `Sponges`, `Biome Key Molds`, and `Gas Trap` are not prose-only gaps in the current report; handle them through recipe/table/page-specific parsing or hard-block lanes.

- [ ] Run focused tests and confirm RED.

```bash
node --test scripts/data/lib/wiki-page-utils.test.mjs scripts/data/audit/audit-remaining-source-raw-page-candidates.test.mjs
```

- [ ] Implement conservative prose extraction.

Rules:

- Use `sourceRefType = 'world'` for biome/world/event text.
- Use `sourceRefType = 'npc_group'` only for broad enemy-family text.
- Use `sourceRefType = 'npc'` only when a concrete NPC is named.
- Use `sourceType = 'unknown'` for capture/transformation mechanics not represented in the taxonomy.
- Preserve original sentence in `conditions`.

- [ ] Run shared helper tests and confirm GREEN.

- [ ] Regenerate the report and verify both current no-source lanes decreased or moved to explicit hard-block lanes.

```bash
node scripts/data/audit/audit-remaining-source-raw-page-candidates.mjs \
  --closure data/reports/item-source-remaining-closure-2026-06-11-current.json \
  --raw-dir /home/lolben/data/terraPedia/raw/wiki/item-pages \
  --output data/reports/item-source-raw-page-candidates-2026-06-11-current.json
```

Expected:

- `exact_page_no_source_extracted` and `family_or_shared_page_no_source_extracted` are lower than the baseline `68` and `79`, or rows are listed under explicit hard-block lanes.
- Remaining page titles, if any, are listed before Task 5.

## Task 5: Add Explicit Hard-Block Lanes For Unparseable Local Pages

**Files:**

- Modify: `scripts/data/audit/audit-remaining-source-raw-page-candidates.mjs`
- Modify: `scripts/data/audit/audit-remaining-source-raw-page-candidates.test.mjs`

- [ ] Write failing test for a family recipe table page that remains unparseable after exact row matching.

Expected:

- It is not counted in `rawPagesWithoutSources`.
- It is counted as `hardBlockLane = 'requires_family_table_parser'`.
- It includes `blockerReason`, `pageTitle`, and `rawPath`.

- [ ] Implement hard-block lanes:

Required lanes:

- `missing_raw_page`
- `requires_family_table_parser`
- `requires_page_specific_parser`
- `requires_source_taxonomy_extension`

Rules:

- Recipe ingredients whose `ingredientGroupType` is not a concrete item must not be emitted as `sourceRefType = 'world'`.
- If the current taxonomy cannot represent a recipe ingredient group safely, route that row to `requires_source_taxonomy_extension` or omit that ingredient while recording row evidence.
- Page-level hard blocks must include `pageTitle`, `rawPath`, and blocker reason.
- Named-page summary must show extracted and hard-blocked counts for `Lanterns`, `Doors`, `Chairs`, `Wings`, `Buckets`, and `Pharaoh's set`.

- [ ] Run focused tests and confirm GREEN.

## Task 6: Regenerate Report And Iterate To Zero Unresolved

**Files:**

- Update: `data/reports/item-source-raw-page-candidates-2026-06-11-current.json`

- [ ] Regenerate the report.

```bash
node scripts/data/audit/audit-remaining-source-raw-page-candidates.mjs \
  --closure data/reports/item-source-remaining-closure-2026-06-11-current.json \
  --raw-dir /home/lolben/data/terraPedia/raw/wiki/item-pages \
  --output data/reports/item-source-raw-page-candidates-2026-06-11-current.json
```

Expected:

- `summary.totalRows = 827`
- `summary.unresolvedTotal = 0`
- `summary.candidatesWithExtractedSources + summary.hardBlockedRows = 827`
- no `family_recipe_exact_result_candidate` has `matchedRecipeResultName` of `Item IDs`, blank, or version label.
- `pageResolutionSummary` includes extracted/hard-blocked counts for `Lanterns`, `Doors`, `Chairs`, `Wings`, `Buckets`, and `Pharaoh's set`.

- [ ] If unresolved remains nonzero, inspect the top page titles and add one focused test per newly discovered pattern.

Inspection command:

```bash
node - <<'NODE'
const fs=require('fs');
const r=JSON.parse(fs.readFileSync('data/reports/item-source-raw-page-candidates-2026-06-11-current.json','utf8'));
console.log(JSON.stringify(r.summary,null,2));
console.log((r.unresolvedLanes ?? []).map(x => ({lane:x.lane,count:x.count,samples:x.samples?.slice(0,8)})));
NODE
```

Expected:

- Continue the TDD loop until unresolved is zero.

## Task 7: Final Cross Review And Validation

- [ ] Dispatch Agent D for final report review.

Expected:

- Agent D confirms every row is in candidates or hard blockers.
- Agent D lists examples from each final lane.

- [ ] Run row-level bijection assertion.

```bash
node - <<'NODE'
const fs = require('fs');
const closure = JSON.parse(fs.readFileSync('data/reports/item-source-remaining-closure-2026-06-11-current.json', 'utf8'));
const report = JSON.parse(fs.readFileSync('data/reports/item-source-raw-page-candidates-2026-06-11-current.json', 'utf8'));
const closureRows = closure.rowsByLane.needs_external_source_evidence;
const key = (row) => `${row.itemId}:${row.internalName}`;
const inputKeys = new Set(closureRows.map(key));
const accepted = [...(report.candidates ?? []), ...(report.hardBlockedRows ?? [])];
const acceptedKeys = accepted.map(key);
const duplicateKeys = acceptedKeys.filter((value, index) => acceptedKeys.indexOf(value) !== index);
const acceptedKeySet = new Set(acceptedKeys);
const missingKeys = [...inputKeys].filter((value) => !acceptedKeySet.has(value));
const extraKeys = [...acceptedKeySet].filter((value) => !inputKeys.has(value));
const unresolvedCounts = Object.values(report.summary?.unresolvedLaneCounts ?? {}).filter((value) => Number(value) !== 0);
const badAcceptedRows = accepted.filter((row) => {
  const hasSources = Array.isArray(row.extractedSources) && row.extractedSources.length > 0;
  const hasHardBlock = Boolean(row.hardBlockLane);
  return hasSources === hasHardBlock;
});
const badHardBlocks = (report.hardBlockedRows ?? []).filter((row) => {
  if (!row.itemId || !row.internalName || !row.name || !row.categoryCode || !row.hardBlockLane || !row.blockerReason) return true;
  if (Array.isArray(row.extractedSources) && row.extractedSources.length > 0) return true;
  if (row.sourceRefName) return true;
  if (row.hardBlockLane === 'missing_raw_page') return !row.attemptedRawPath;
  return !row.rawPath || !row.pageTitle;
});
const failures = {
  closureRows: closureRows.length,
  acceptedRows: accepted.length,
  duplicateKeys,
  missingKeys,
  extraKeys,
  unresolvedTotal: report.summary?.unresolvedTotal,
  rawPagesWithoutSourcesSummary: report.summary?.rawPagesWithoutSources,
  rawPagesWithoutSourcesArray: (report.rawPagesWithoutSources ?? []).length,
  unresolvedLanesArray: (report.unresolvedLanes ?? []).length,
  unresolvedCounts,
  badAcceptedRows: badAcceptedRows.map(key),
  badHardBlocks: badHardBlocks.map(key)
};
if (
  closureRows.length !== 827
  || accepted.length !== 827
  || duplicateKeys.length
  || missingKeys.length
  || extraKeys.length
  || report.summary?.unresolvedTotal !== 0
  || report.summary?.rawPagesWithoutSources !== 0
  || (report.rawPagesWithoutSources ?? []).length !== 0
  || (report.unresolvedLanes ?? []).length !== 0
  || unresolvedCounts.length
  || badAcceptedRows.length
  || badHardBlocks.length
) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({
  closureRows: closureRows.length,
  candidates: (report.candidates ?? []).length,
  hardBlockedRows: (report.hardBlockedRows ?? []).length,
  unresolvedTotal: report.summary.unresolvedTotal
}, null, 2));
NODE
```

Expected:

- Prints accepted counts.
- Exit code `0`.

- [ ] Run focused tests.

```bash
node --test \
  scripts/data/lib/wiki-page-utils.test.mjs \
  scripts/data/audit/audit-remaining-source-raw-page-candidates.test.mjs \
  scripts/data/audit/build-item-source-remaining-closure-report.test.mjs \
  scripts/data/audit/audit-item-source-gap-candidates.test.mjs
```

Expected:

- All tests pass.

- [ ] Run whitespace check.

```bash
git diff --check
```

Expected:

- No output and exit code `0`.

- [ ] Run final changed-file scope check.

```bash
git status --short
git diff --name-only
git diff --cached --name-only
```

Expected:

- New/modified files from this execution are limited to the plan MD, `wiki-page-utils` helper/test, raw-page audit script/test, and `data/reports/item-source-raw-page-candidates-2026-06-11-current.json`.
- No new DB, SQL migration, raw cache, import input, backup, or `*-apply` file was created by this execution.

## Final Deliverable

Report back:

- Final resolved count.
- Candidate count.
- Hard blocker count by lane.
- Examples from candidate lanes and hard blocker lanes.
- Verification commands and pass/fail status.
- Explicit statement that no DB writes, crawler, fetch, import, backfill, sync, pipeline, materialize, Flyway, production refresh, or `--apply=true` were run.
