# Biome Wikitext Unresolved Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a read-only, auditable report for the 42 biome wikitext unresolved records and a lossless user-decision handoff. This plan does not create aliases, does not run a second import, and does not write DB records.

**Architecture:** Keep the completed resolved ingest untouched. Add one read-only audit script that consumes an exact existing linkage dry-run JSON artifact, extracts only `missing` and `ambiguous` entries, emits a stable JSON contract for review, and groups every unresolved row for user confirmation. Alias config and second resolved-only import are a separate post-approval plan.

**Tech Stack:** Node.js ESM scripts, `node:test`, JSON reports, existing TerraPedia biome wikitext dry-run report.

---

## Current Facts

- Base branch: `main`
- Base commit: `7cddfb8`
- Working branch: `plan/biome-wikitext-unresolved-2026-06-02`
- Existing first-batch import is complete and must not be changed.
- External source report path for this local run: `/home/lolben/TerraPedia/reports/biome-wikitext-linkage-dry-run-2026-06-02.json`
- Source report SHA-256: `e61e22e7607d293579290bf96df40dbb80ca506ea4d469439bca168a05ae65b9`
- Source report `generatedAt`: `2026-06-02T03:51:10.835Z`
- Current unresolved totals:
  - item missing: 9
  - NPC missing: 19
  - NPC ambiguous: 14
  - total: 42

## Hard Boundaries

- Do not write database records in this plan.
- Do not run any command containing `--apply=true`.
- Do not create or modify `scripts/data/config/biome-wikitext-aliases.json`.
- Do not modify `scripts/data/audit/biome-wikitext-linkage-dry-run.mjs`.
- Do not change crawler behavior, fetch Wiki pages, or run crawler/fetch scripts.
- Do not decide aliases for ambiguous NPCs or generic item names.
- Stop after producing the report and user-decision handoff.

## Success Criteria

- The source report preflight proves the exact local artifact by path, SHA-256, `generatedAt`, and summary totals.
- A deterministic unresolved report script exists and is covered by focused tests.
- The generated unresolved report contains exactly 42 rows from the source report.
- The JSON contract is stable: `entity`, `generatedAt`, `sourceReportPath`, `sourceGeneratedAt`, `summary`, and `rows`.
- Every row has `index`, `rowKey`, `biomeCode`, `pageTitle`, `matchType`, `matchStatus`, `section`, `source`, `name`, `note`, `candidateMatches`, `reviewCategory`, and `needsUserDecision`.
- Every row has `matchStatus` equal to `missing` or `ambiguous`.
- Every ambiguous row has more than one `candidateMatches` entry.
- Every missing row has zero `candidateMatches` entries.
- Every unresolved row has `needsUserDecision: true`.
- The handoff summary covers all 42 row indexes exactly once, grouped by review category and name, with no final alias map asserted as fact.

## Files

- Create: `scripts/data/audit/biome-wikitext-unresolved-report.mjs`
- Create: `scripts/data/audit/biome-wikitext-unresolved-report.test.mjs`
- Output report, local/ignored: `reports/biome-wikitext-unresolved-2026-06-02.json`
- Modify only this plan while reviewing: `docs/superpowers/plans/2026-06-02-biome-wikitext-unresolved-audit-plan.md`

## Task 0: Pre-Execution Multi-Agent Review Gate

**Files:**
- Review only; no writes by reviewers.

- [x] **Step 1: Run first plan review round**

Reviewers found critical and important defects:

- multi-agent review gate was after implementation
- source report path was unstable
- plan goal mixed current unresolved report with future alias/import work
- output schema and read-only safety tests were underspecified
- closure did not require lossless handoff coverage

- [x] **Step 2: Repair the plan**

Patch this plan so review is before implementation, source artifact preflight is explicit, current closure excludes alias/import work, and validation proves report shape and read-only behavior.

- [ ] **Step 3: Re-run affected reviews before implementation**

Ask at least two read-only agents to re-review:

- Data/closure reviewer: checks no DB/crawler/fetch/apply path exists and every unresolved row remains non-writable.
- Implementation reviewer: checks tests, CLI contract, source artifact preflight, and report schema are executable without guessing.

- [ ] **Step 4: Stop on critical or important review defects**

If a reviewer finds critical or important defects:

1. Classify each defect.
2. Stop implementation.
3. Patch this plan.
4. Re-run the affected review.
5. Continue only when no critical or important defects remain.

## Task 1: Add Unresolved Report Tests

**Files:**
- Create: `scripts/data/audit/biome-wikitext-unresolved-report.test.mjs`

- [ ] **Step 1: Write failing tests for unresolved extraction and schema**

Create tests for exported functions from `scripts/data/audit/biome-wikitext-unresolved-report.mjs`:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildBiomeWikitextUnresolvedReport,
  classifyUnresolvedRow,
  parseArgs,
  validateUnresolvedReportContract,
  writeUnresolvedReport
} from './biome-wikitext-unresolved-report.mjs';

function sampleSourceReport() {
  return {
    entity: 'biome_wikitext_linkage_dry_run',
    generatedAt: '2026-06-02T03:51:10.835Z',
    summary: {
      item: { total: 2, resolved: 1, ambiguous: 0, missing: 1 },
      npc: { total: 3, resolved: 1, ambiguous: 1, missing: 1 }
    },
    results: [
      {
        biome: { code: 'forest', pageTitle: 'Forest' },
        wiki: { pageTitle: 'Forest' },
        entries: [
          { matchType: 'item', matchStatus: 'resolved', section: 'Unique Drops', source: 'From Slimes', name: 'Gel', note: null, matches: [{ entityType: 'item', id: 23, internalName: 'Gel', name: 'Gel', nameZh: '凝胶' }] },
          { matchType: 'item', matchStatus: 'missing', section: 'Unique Drops', source: 'From King Slime', name: 'Ninja armor', note: null, matches: [] },
          { matchType: 'npc', matchStatus: 'ambiguous', section: 'Characters', source: 'During the night', name: 'Zombie', note: null, matches: [{ entityType: 'npc', id: 3, internalName: 'Zombie', name: 'Zombie', nameZh: '僵尸' }, { entityType: 'npc', id: 430, internalName: 'BigZombie', name: 'Zombie', nameZh: '僵尸' }] },
          { matchType: 'npc', matchStatus: 'missing', section: 'Characters', source: 'Critters', name: 'Mallard Duck', note: null, matches: [] }
        ]
      }
    ]
  };
}

test('buildBiomeWikitextUnresolvedReport extracts only missing and ambiguous rows with stable schema', () => {
  const report = buildBiomeWikitextUnresolvedReport({
    sourceReport: sampleSourceReport(),
    sourceReportPath: '/tmp/source.json'
  });

  assert.equal(report.entity, 'biome_wikitext_unresolved_report');
  assert.match(report.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(report.sourceReportPath, '/tmp/source.json');
  assert.equal(report.sourceGeneratedAt, '2026-06-02T03:51:10.835Z');
  assert.deepEqual(report.summary, {
    total: 3,
    item: { missing: 1, ambiguous: 0 },
    npc: { missing: 1, ambiguous: 1 },
    byReviewCategory: {
      item_collection_or_set: 1,
      ambiguous_variant_group_needs_user_decision: 1,
      local_npc_missing_or_critter_gap: 1
    }
  });
  assert.deepEqual(report.rows.map((row) => row.index), [1, 2, 3]);
  assert.deepEqual(report.rows.map((row) => row.name), ['Ninja armor', 'Zombie', 'Mallard Duck']);
  assert.deepEqual(report.rows.map((row) => row.needsUserDecision), [true, true, true]);
  assert.equal(report.rows[0].rowKey, 'forest:item:missing:ninja_armor:1');
  assert.deepEqual(report.rows[1].candidateMatches, [
    { entityType: 'npc', id: 3, internalName: 'Zombie', name: 'Zombie', nameZh: '僵尸' },
    { entityType: 'npc', id: 430, internalName: 'BigZombie', name: 'Zombie', nameZh: '僵尸' }
  ]);
  assert.equal(validateUnresolvedReportContract(report).valid, true);
});

test('classifyUnresolvedRow returns review categories without deciding aliases', () => {
  assert.equal(classifyUnresolvedRow({ matchType: 'item', matchStatus: 'missing', name: 'Ninja armor' }), 'item_collection_or_set');
  assert.equal(classifyUnresolvedRow({ matchType: 'item', matchStatus: 'missing', name: 'Treasure Bag' }), 'generic_item_name_needs_context');
  assert.equal(classifyUnresolvedRow({ matchType: 'npc', matchStatus: 'missing', source: 'Critters', name: 'Mallard Duck' }), 'local_npc_missing_or_critter_gap');
  assert.equal(classifyUnresolvedRow({ matchType: 'npc', matchStatus: 'ambiguous', name: 'Zombie', matches: [{}, {}] }), 'ambiguous_variant_group_needs_user_decision');
});

test('validateUnresolvedReportContract rejects writable-looking or malformed rows', () => {
  const report = buildBiomeWikitextUnresolvedReport({ sourceReport: sampleSourceReport(), sourceReportPath: '/tmp/source.json' });
  const invalid = structuredClone(report);
  invalid.rows[1].matchStatus = 'resolved';

  const result = validateUnresolvedReportContract(invalid);

  assert.equal(result.valid, false);
  assert.match(result.issues.join('\n'), /unsupported matchStatus/);
});

test('validateUnresolvedReportContract rejects extra candidate match fields', () => {
  const report = buildBiomeWikitextUnresolvedReport({ sourceReport: sampleSourceReport(), sourceReportPath: '/tmp/source.json' });
  report.rows[1].candidateMatches[0].rawTemplate = '{{npc|Zombie}}';

  const result = validateUnresolvedReportContract(report);

  assert.equal(result.valid, false);
  assert.match(result.issues.join('\n'), /unexpected candidate match field/);
});

test('parseArgs requires report path and rejects unknown args', () => {
  assert.throws(() => parseArgs([]), /--report is required/);
  assert.throws(() => parseArgs(['--report=a.json', '--bad=true']), /Unknown option: --bad/);
  assert.deepEqual(parseArgs(['--report=a.json', '--output=b.json']), {
    report: 'a.json',
    output: 'b.json'
  });
});

test('writeUnresolvedReport writes JSON only to the requested output path', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biome-unresolved-report-'));
  const sourcePath = path.join(dir, 'source.json');
  const outputPath = path.join(dir, 'out.json');
  fs.writeFileSync(sourcePath, `${JSON.stringify(sampleSourceReport())}\n`, 'utf8');

  const result = writeUnresolvedReport({ reportPath: sourcePath, outputPath });
  const output = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

  assert.equal(result.outputPath, outputPath);
  assert.equal(output.summary.total, 3);
  assert.equal(output.rows.length, 3);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node --test scripts/data/audit/biome-wikitext-unresolved-report.test.mjs
```

Expected: FAIL because `biome-wikitext-unresolved-report.mjs` does not exist yet.

## Task 2: Add Read-Only Unresolved Report Script

**Files:**
- Create: `scripts/data/audit/biome-wikitext-unresolved-report.mjs`

- [ ] **Step 1: Implement exported functions and CLI**

Implement:

- `parseArgs(argv)`
- `buildBiomeWikitextUnresolvedReport({ sourceReport, sourceReportPath })`
- `classifyUnresolvedRow(row)`
- `validateUnresolvedReportContract(report)`
- `writeUnresolvedReport({ reportPath, outputPath })`

Contract:

- `--report=<path>` is required.
- `--output=<path>` defaults to `reports/biome-wikitext-unresolved-YYYY-MM-DD.json`.
- Unknown CLI args fail.
- The script reads only the JSON report path and writes only the output JSON path.
- It must not import or call `mysql`, `fetch`, `child_process`, crawler modules, importer modules, or SQL helpers.
- `candidateMatches` must be reduced to stable fields only: `entityType`, `id`, `internalName`, `name`, `nameZh`.
- `index` is 1-based and follows source report order.
- `rowKey` is deterministic: `<biomeCode>:<matchType>:<matchStatus>:<normalizedName>:<index>`.
- `needsUserDecision` is `true` for every unresolved row in this phase.

- [ ] **Step 2: Add read-only source safety test**

Extend `scripts/data/audit/biome-wikitext-unresolved-report.test.mjs` with a source scan:

```js
test('script source has no DB, crawler, fetch, child process, or apply path', () => {
  const source = fs.readFileSync(new URL('./biome-wikitext-unresolved-report.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /mysql|createConnection|execute\(|INSERT|UPDATE|DELETE|--apply|fetch\(|child_process|crawler|import-biome-wikitext-resolved-to-db/i);
});
```

- [ ] **Step 3: Run focused tests and verify GREEN**

Run:

```bash
node --test scripts/data/audit/biome-wikitext-unresolved-report.test.mjs
```

Expected: PASS.

## Task 3: Source Artifact Preflight

**Files:**
- No writes.

- [ ] **Step 1: Verify source report exists and SHA matches**

Run:

```bash
test -f /home/lolben/TerraPedia/reports/biome-wikitext-linkage-dry-run-2026-06-02.json
sha256sum /home/lolben/TerraPedia/reports/biome-wikitext-linkage-dry-run-2026-06-02.json
```

Expected SHA:

```text
e61e22e7607d293579290bf96df40dbb80ca506ea4d469439bca168a05ae65b9
```

- [ ] **Step 2: Verify source report metadata and totals**

Run:

```bash
node - <<'NODE'
const fs = require('fs');
const p = '/home/lolben/TerraPedia/reports/biome-wikitext-linkage-dry-run-2026-06-02.json';
const r = JSON.parse(fs.readFileSync(p, 'utf8'));
const expected = {
  generatedAt: '2026-06-02T03:51:10.835Z',
  totalEntries: 341,
  itemMissing: 9,
  npcMissing: 19,
  npcAmbiguous: 14
};
const actual = {
  generatedAt: r.generatedAt,
  totalEntries: r.summary?.totalEntries,
  itemMissing: r.summary?.item?.missing,
  npcMissing: r.summary?.npc?.missing,
  npcAmbiguous: r.summary?.npc?.ambiguous
};
console.log(JSON.stringify(actual, null, 2));
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error('source report preflight failed');
}
NODE
```

Expected: printed values match exactly and command exits 0.

## Task 4: Generate and Validate the 2026-06-02 Unresolved Report

**Files:**
- Output: `reports/biome-wikitext-unresolved-2026-06-02.json`

- [ ] **Step 1: Run the report generator**

Run:

```bash
node scripts/data/audit/biome-wikitext-unresolved-report.mjs \
  --report=/home/lolben/TerraPedia/reports/biome-wikitext-linkage-dry-run-2026-06-02.json \
  --output=reports/biome-wikitext-unresolved-2026-06-02.json
```

Expected summary:

```json
{
  "total": 42,
  "item": { "missing": 9, "ambiguous": 0 },
  "npc": { "missing": 19, "ambiguous": 14 }
}
```

- [ ] **Step 2: Verify report contract and counts**

Run:

```bash
node - <<'NODE'
const fs = require('fs');
const r = JSON.parse(fs.readFileSync('reports/biome-wikitext-unresolved-2026-06-02.json', 'utf8'));
const topLevelRequired = ['entity', 'generatedAt', 'sourceReportPath', 'sourceGeneratedAt', 'summary', 'rows'];
const required = ['index', 'rowKey', 'biomeCode', 'pageTitle', 'matchType', 'matchStatus', 'section', 'source', 'name', 'note', 'candidateMatches', 'reviewCategory', 'needsUserDecision'];
const allowedCandidateFields = new Set(['entityType', 'id', 'internalName', 'name', 'nameZh']);
const issues = [];
for (const field of topLevelRequired) {
  if (!Object.hasOwn(r, field)) issues.push(`top-level missing ${field}`);
}
if (r.entity !== 'biome_wikitext_unresolved_report') issues.push(`unexpected entity ${r.entity}`);
if (typeof r.generatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(r.generatedAt)) issues.push('generatedAt is not an ISO-like string');
if (typeof r.sourceReportPath !== 'string' || !r.sourceReportPath.includes('biome-wikitext-linkage-dry-run-2026-06-02.json')) issues.push(`unexpected sourceReportPath ${r.sourceReportPath}`);
if (r.sourceGeneratedAt !== '2026-06-02T03:51:10.835Z') issues.push(`unexpected sourceGeneratedAt ${r.sourceGeneratedAt}`);
if (r.summary?.total !== 42) issues.push(`expected 42 rows, got ${r.summary?.total}`);
if (r.rows?.length !== 42) issues.push(`expected rows length 42, got ${r.rows?.length}`);
const seen = new Set();
for (const row of r.rows ?? []) {
  for (const field of required) {
    if (!Object.hasOwn(row, field)) issues.push(`row ${row.index} missing ${field}`);
  }
  if (seen.has(row.index)) issues.push(`duplicate index ${row.index}`);
  seen.add(row.index);
  if (!['missing', 'ambiguous'].includes(row.matchStatus)) issues.push(`row ${row.index} unsupported matchStatus ${row.matchStatus}`);
  if (row.matchStatus === 'ambiguous' && row.candidateMatches.length <= 1) issues.push(`row ${row.index} ambiguous without multiple matches`);
  if (row.matchStatus === 'missing' && row.candidateMatches.length !== 0) issues.push(`row ${row.index} missing with candidate matches`);
  for (const [candidateIndex, candidate] of row.candidateMatches.entries()) {
    for (const field of Object.keys(candidate)) {
      if (!allowedCandidateFields.has(field)) issues.push(`row ${row.index} candidate ${candidateIndex + 1} unexpected field ${field}`);
    }
  }
  if (row.needsUserDecision !== true) issues.push(`row ${row.index} needsUserDecision is not true`);
}
for (let index = 1; index <= 42; index += 1) {
  if (!seen.has(index)) issues.push(`missing index ${index}`);
}
console.log(JSON.stringify(r.summary, null, 2));
if (issues.length) throw new Error(issues.join('\n'));
NODE
```

Expected: summary prints and command exits 0.

## Task 5: User Decision Handoff

**Files:**
- No code writes.

- [ ] **Step 1: Generate grouped handoff summary**

Run:

```bash
node - <<'NODE'
const fs = require('fs');
const r = JSON.parse(fs.readFileSync('reports/biome-wikitext-unresolved-2026-06-02.json', 'utf8'));
const groups = new Map();
const seen = new Set();
const duplicates = [];
for (const row of r.rows) {
  const key = `${row.reviewCategory} :: ${row.name}`;
  const group = groups.get(key) ?? [];
  group.push(row.index);
  groups.set(key, group);
  if (seen.has(row.index)) duplicates.push(row.index);
  seen.add(row.index);
}
let covered = 0;
for (const [key, indexes] of groups) {
  covered += indexes.length;
  console.log(`${key} => [${indexes.join(', ')}]`);
}
console.log(`covered=${covered}`);
if (covered !== 42) throw new Error(`handoff coverage failed: ${covered}`);
if (duplicates.length) throw new Error(`duplicate indexes: ${duplicates.join(', ')}`);
for (let index = 1; index <= 42; index += 1) {
  if (!seen.has(index)) throw new Error(`missing handoff index ${index}`);
}
NODE
```

Expected: every row index is covered exactly once and `covered=42`.

- [ ] **Step 2: Ask user for decisions**

Present the grouped unresolved rows to the user as questions. Do not assert a final alias map. Ask for confirmation on groups such as:

- generic NPC names with many variants: `Zombie`, `Demon Eye`
- critter variants: `Bunny`, `Duck`, `Goldfish`, `Penguin`, `Scorpion`
- segmented NPCs: `Bone Serpent`, `Wall of Flesh`
- generic or collection item names: armor sets, furniture groups, banners, treasure bags

## Deferred Post-Approval Work

The following work is explicitly outside this plan:

- create `scripts/data/config/biome-wikitext-aliases.json`
- modify `scripts/data/audit/biome-wikitext-linkage-dry-run.mjs`
- add alias resolution tests
- run a second resolved-only dry-run
- run any DB importer in `--apply=true` mode

After the user approves specific mappings, create a separate plan with tests proving:

- alias maps resolving to 0 local entities remain unresolved
- alias maps resolving to more than 1 local entity remain ambiguous
- only exactly-one-match aliases enter `resolvedOnly`
- unresolved rows never produce valid DB insert rows
- second import remains blocked until the user confirms dry-run summary

## Validation Commands

```bash
node --test scripts/data/audit/biome-wikitext-unresolved-report.test.mjs
node --test scripts/data/audit/biome-wikitext-linkage-dry-run.test.mjs scripts/data/import/import-biome-wikitext-resolved-to-db.test.mjs
```

No stack restart is required for this unresolved report phase.
