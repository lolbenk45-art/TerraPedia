# B1 Step 0: Source Contract Registry and Bridge Retirement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the untracked NPC bridge registration, make `npcs_raw` landing fail loudly instead of silently vanishing, and replace the path-only B1 matcher with a four-mode source contract registry so the repository quality gate has a legitimate passing path.

**Architecture:** A new read-only Node module `canonical-source-contract-registry.mjs` parses a new contract table in `docs/audits/canonical-migration-boundary.md` and validates each registered input against its declared mode (`b1`, `b1_migrating`, `canonical`, `retired`). `domain-readiness-audit.mjs` delegates the `b1ExemptionCompliance` panel to it. Separately, `source-dataset-locator.mjs` stops treating a missing file as "skip this dataset" for `npcs_raw` and points at the tracked standardized NPC file.

**Tech Stack:** Node 20 ESM, `node:test` + `node:assert/strict`, no new dependencies. The only database access in this plan is the Task 2 pre-check, which is read-only and already executed. The local stack listens on **port 13306**; credentials are in the gitignored `scripts/dev/config/local-stack.config.json` in the primary checkout.

**Source spec:** `docs/superpowers/specs/2026-07-26-b1-canonical-source-migration-design.md` (Step 0 section, plus B1 Closure Criteria for the mode definitions).

**Scope boundary:** This plan is Step 0 only. The group canonical chain (design steps 1-13) is a separate plan. The canonical NPC crawler-fact chain is deferred per decision D2 and is not in either plan.

---

## Two deviations from the spec, resolve before starting

Both are small and both need a yes/no before Task 3.

**Deviation 1: the three group rows also move to `b1_migrating` in this step.** The spec's Step 0 text only says to retire the bridge row and register the standardized file. But the three group inputs are expired `b1` rows today, so leaving them alone means the gate stays red after Step 0 and shipping Step 0 separately buys nothing. This plan moves all four remaining inputs to their honest mode in Step 0. If that is wrong, Step 0 becomes a no-op for the gate and Task 9 will fail.

**Deviation 2: `support.town_npc_maintenance` ends with two references, not one.** The spec says retiring one row and registering the real one "keeps the panel at one reference". This plan keeps the retired bridge contract in that domain's matcher as well, so the absence scan actually executes on every domain audit rather than living in a registry-wide check nothing calls. Reference count for that domain goes 1 to 2.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `scripts/data/audit/npc-buff-relation-precheck.mjs` (create) | Read-only assertion that NPC-Buff relations are materialized; injectable query function so tests need no database |
| `scripts/data/audit/npc-buff-relation-precheck.test.mjs` (create) | Behavior tests via injected query results |
| `scripts/data/audit/canonical-source-contract-registry.mjs` (create) | Parse the contract table; validate each contract by mode; build the panel report |
| `scripts/data/audit/canonical-source-contract-registry.test.mjs` (create) | Mode-by-mode validation behavior |
| `scripts/data/audit/build-npc-bridge-retirement-report.mjs` (create) | Positive absence scan producing the `retired` evidence report |
| `scripts/data/audit/build-npc-bridge-retirement-report.test.mjs` (create) | Scan behavior against fixture trees |
| `docs/audits/canonical-migration-boundary.md` (modify) | Add the `## 来源合同登记` table; annotate the old exemption table as superseded |
| `scripts/data/audit/domain-readiness-audit.mjs` (modify: 455-465, 494-500) | Delegate `b1ExemptionCompliance` to the registry |
| `scripts/data/audit/b1-exemption-compliance.mjs` (delete) | Superseded by the registry |
| `scripts/data/audit/b1-exemption-compliance.test.mjs` (delete) | Superseded |
| `scripts/data/landing/source-dataset-locator.mjs` (modify: 141-147, 168-186) | Required-descriptor path with loud failure; repoint `npcs_raw` |
| `scripts/data/landing/source-dataset-locator.test.mjs` (modify: 39-45, 140, 157-160) | Update fixture and assertions; add missing-source test |
| `scripts/data/backfill/backfill-npc-buff-relations-from-wiki-crawler.mjs` (modify: 124-128) | Remove the `??` bridge default from `resolveOptions` |
| `scripts/dev/quality-gate.sh` (modify: 55-74) | Swap the deleted test file for the three new ones |

---

## Task 1: NPC-Buff relation pre-check

The spec makes this a gate before the locator change: pointing `npcs_raw` at the base standardized file drops `wikiCrawler.buffInflictions` from the landed payload, which is only safe if the relations derived from it already exist in the database.

**This task's rules were corrected after measuring the live database on 2026-07-26.** An earlier draft compared total relation rows to total local rows and blocked on inequality. That is wrong and would have blocked Step 0 on healthy data:

| Measured | Value |
| --- | ---: |
| `terria_v1_relation.npc_buff_relations` total | 1265 |
| of which `relation_type = 'immune'` | 1141 |
| of which `relation_type = 'inflicts'` | 124 |
| `terria_v1_local.npc_buff_relations` total, all `inflicts` | 112 |
| relation `inflicts` rows with no local counterpart | 31 |
| local rows with no relation counterpart, all tagged `[auto:wiki-crawler-npc-infobox]` | 20 |

Two things follow. First, `local` deliberately projects only `inflicts`, so comparing totals is meaningless. Second, `local` has two independent writers: the relation projection, and the crawler backfill writing straight into local. The 20 backfill rows are the materialized `buffInflictions` evidence, which is exactly what this pre-check exists to confirm.

So the pre-check asserts the one thing D2 actually depends on — that the enrichment is materialized — and *reports* the projection divergence as a warning rather than blocking on it. The divergence is a real pre-existing issue, but it is not caused by and not fixed by Step 0, so it must not gate this work.

The module takes injected query functions so tests never touch a database. That matches this repo's testing preference: behavior tests with injectable IO, not real connections.

**Files:**
- Create: `scripts/data/audit/npc-buff-relation-precheck.mjs`
- Test: `scripts/data/audit/npc-buff-relation-precheck.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `scripts/data/audit/npc-buff-relation-precheck.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildNpcBuffRelationPrecheck } from './npc-buff-relation-precheck.mjs';

function stub(value) {
  return async () => [{ total: value }];
}

// Mirrors the live database as measured on 2026-07-26.
const MEASURED = {
  queryRelationInflictsCount: stub(124),
  queryLocalCount: stub(112),
  queryRelationWithoutLocalCount: stub(31),
  queryLocalWithoutRelationCount: stub(20),
};

test('precheck passes on the measured live shape, treating projection drift as a warning', async () => {
  const report = await buildNpcBuffRelationPrecheck({
    generatedAt: '2026-07-26T00:00:00Z',
    ...MEASURED,
  });

  assert.equal(report.status, 'warning');
  assert.equal(report.requiresDatabase, true);
  assert.equal(report.writesDatabase, false);
  assert.equal(report.enrichmentMaterialized, true);
  assert.deepEqual(report.blockingReasons, []);
  assert.equal(report.warningReasons.length, 2);
  assert.match(report.warningReasons[0], /31 relation inflicts row\(s\) have no local counterpart/);
  assert.match(report.warningReasons[1], /20 local row\(s\) have no relation counterpart/);
});

test('precheck passes cleanly when the projection is in sync', async () => {
  const report = await buildNpcBuffRelationPrecheck({
    generatedAt: '2026-07-26T00:00:00Z',
    queryRelationInflictsCount: stub(124),
    queryLocalCount: stub(124),
    queryRelationWithoutLocalCount: stub(0),
    queryLocalWithoutRelationCount: stub(0),
  });

  assert.equal(report.status, 'pass');
  assert.deepEqual(report.warningReasons, []);
});

test('precheck blocks when local holds no enrichment at all', async () => {
  const report = await buildNpcBuffRelationPrecheck({
    generatedAt: '2026-07-26T00:00:00Z',
    ...MEASURED,
    queryLocalCount: stub(0),
  });

  assert.equal(report.status, 'blocked');
  assert.equal(report.enrichmentMaterialized, false);
  assert.match(report.blockingReasons[0], /local\.npc_buff_relations is empty/i);
});

test('precheck blocks when relation holds no inflicts rows at all', async () => {
  const report = await buildNpcBuffRelationPrecheck({
    generatedAt: '2026-07-26T00:00:00Z',
    ...MEASURED,
    queryRelationInflictsCount: stub(0),
  });

  assert.equal(report.status, 'blocked');
  assert.match(report.blockingReasons[0], /no active inflicts rows/i);
});

test('precheck does not compare totals, so immune rows cannot cause a false block', async () => {
  // The live relation table holds 1141 immune rows that local intentionally never projects.
  // Only the inflicts count is passed in, so there is no total-vs-total comparison to get wrong.
  const report = await buildNpcBuffRelationPrecheck({
    generatedAt: '2026-07-26T00:00:00Z',
    ...MEASURED,
  });

  assert.equal(report.relationInflictsCount, 124);
  assert.equal(report.localCount, 112);
  assert.equal(report.blockingReasons.length, 0);
});

test('precheck fails closed on a non-finite count rather than treating it as zero', async () => {
  const report = await buildNpcBuffRelationPrecheck({
    generatedAt: '2026-07-26T00:00:00Z',
    ...MEASURED,
    queryLocalCount: stub(null),
  });

  assert.equal(report.status, 'blocked');
  assert.match(report.blockingReasons[0], /non-finite/i);
});

test('precheck fails closed when a query throws instead of reporting pass', async () => {
  const report = await buildNpcBuffRelationPrecheck({
    generatedAt: '2026-07-26T00:00:00Z',
    ...MEASURED,
    queryLocalCount: async () => {
      throw new Error('ECONNREFUSED 127.0.0.1:13306');
    },
  });

  assert.equal(report.status, 'blocked');
  assert.match(report.blockingReasons[0], /ECONNREFUSED/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/data/audit/npc-buff-relation-precheck.test.mjs`

Expected: FAIL — `Cannot find module './npc-buff-relation-precheck.mjs'`

- [ ] **Step 3: Write minimal implementation**

Create `scripts/data/audit/npc-buff-relation-precheck.mjs`:

```js
#!/usr/bin/env node

// local.npc_buff_relations projects only relation_type='inflicts'. The relation table also holds
// 'immune' rows that local never projects, so a total-vs-total comparison is meaningless here.
export const RELATION_INFLICTS_SQL = `
  SELECT COUNT(*) AS total FROM terria_v1_relation.npc_buff_relations
  WHERE deleted = 0 AND status = 1 AND relation_type = 'inflicts'`;

export const LOCAL_SQL = `
  SELECT COUNT(*) AS total FROM terria_v1_local.npc_buff_relations WHERE deleted = 0`;

async function readCount(query, label, blockingReasons) {
  try {
    const rows = await query();
    const numeric = Number(Array.isArray(rows) ? rows[0]?.total : undefined);
    if (!Number.isFinite(numeric)) {
      blockingReasons.push(`${label} returned a non-finite count; failing closed.`);
      return null;
    }
    return numeric;
  } catch (error) {
    blockingReasons.push(`${label} query failed: ${error.message}`);
    return null;
  }
}

export async function buildNpcBuffRelationPrecheck({
  generatedAt = new Date().toISOString(),
  queryRelationInflictsCount,
  queryLocalCount,
  queryRelationWithoutLocalCount,
  queryLocalWithoutRelationCount,
} = {}) {
  const blockingReasons = [];
  const warningReasons = [];

  const relationInflictsCount = await readCount(queryRelationInflictsCount, 'relation.npc_buff_relations (inflicts)', blockingReasons);
  const localCount = await readCount(queryLocalCount, 'local.npc_buff_relations', blockingReasons);
  const relationWithoutLocal = await readCount(queryRelationWithoutLocalCount, 'relation-without-local', blockingReasons);
  const localWithoutRelation = await readCount(queryLocalWithoutRelationCount, 'local-without-relation', blockingReasons);

  if (relationInflictsCount === 0) {
    blockingReasons.push('relation.npc_buff_relations has no active inflicts rows; the crawler buff enrichment is not materialized.');
  }
  if (localCount === 0) {
    blockingReasons.push('local.npc_buff_relations is empty; the crawler buff enrichment is not materialized.');
  }

  // Projection drift is a real pre-existing issue but it is neither caused nor fixed by this step,
  // so it is reported and never allowed to gate the locator change.
  if (relationWithoutLocal > 0) {
    warningReasons.push(
      `${relationWithoutLocal} relation inflicts row(s) have no local counterpart; the relation-to-local projection is incomplete.`,
    );
  }
  if (localWithoutRelation > 0) {
    warningReasons.push(
      `${localWithoutRelation} local row(s) have no relation counterpart; local has a second writer outside the relation projection.`,
    );
  }

  const enrichmentMaterialized = localCount !== null && localCount > 0;

  return {
    generatedAt,
    checkId: 'npcBuffRelationPrecheck',
    status: blockingReasons.length > 0 ? 'blocked' : warningReasons.length > 0 ? 'warning' : 'pass',
    requiresDatabase: true,
    writesDatabase: false,
    enrichmentMaterialized,
    relationInflictsCount,
    localCount,
    relationWithoutLocal,
    localWithoutRelation,
    blockingReasons,
    warningReasons,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/data/audit/npc-buff-relation-precheck.test.mjs`

Expected: PASS, 7/7

- [ ] **Step 5: Commit**

```bash
git add scripts/data/audit/npc-buff-relation-precheck.mjs scripts/data/audit/npc-buff-relation-precheck.test.mjs
git commit -m "feat(audit): add read-only NPC-Buff relation precheck"
```

---

## Task 2: Confirm the pre-check against the real databases

Already executed on 2026-07-26; the numbers below are the recorded result. Re-run it only if the local stack data has changed since. It is read-only.

**Files:** none modified.

- [ ] **Step 1: Confirm the local stack is reachable**

The stack listens on **13306**, not the MySQL default. Connection parameters live in `scripts/dev/config/local-stack.config.json` (`database.host`, `.port`, `.username`, `.password`), which is gitignored and present only in the primary checkout at `/home/lolben/TerraPedia`.

Run: `timeout 3 bash -c 'exec 3<>/dev/tcp/127.0.0.1/13306' && echo reachable || echo unreachable`

Expected: `reachable`.

- [ ] **Step 2: Read the counts**

Run from `/home/lolben/TerraPedia`:

```bash
PW=$(node -e "console.log(require('./scripts/dev/config/local-stack.config.json').database.password)")
mysql --host=127.0.0.1 --port=13306 --user=root --password="$PW" --batch --skip-column-names -e "
SELECT 'relation-inflicts', COUNT(*) FROM terria_v1_relation.npc_buff_relations
  WHERE deleted=0 AND status=1 AND relation_type='inflicts'
UNION ALL SELECT 'relation-immune', COUNT(*) FROM terria_v1_relation.npc_buff_relations
  WHERE deleted=0 AND status=1 AND relation_type='immune'
UNION ALL SELECT 'local', COUNT(*) FROM terria_v1_local.npc_buff_relations WHERE deleted=0;"
```

Recorded result on 2026-07-26:

```
relation-inflicts	124
relation-immune	1141
local	112
```

- [ ] **Step 3: Confirm the gate condition**

The gate is `local > 0`, which is the only thing D2 depends on: the enrichment must already be materialized so that dropping `wikiCrawler.buffInflictions` from the landed payload loses nothing live.

Recorded result: **112 > 0, gate satisfied, D2 confirmed.** The 20 local rows with no relation counterpart are all tagged `[auto:wiki-crawler-npc-infobox]` in their `notes` column, which is the crawler backfill's own marker; those rows are the materialized `buffInflictions` evidence.

**STOP CONDITION:** if `local` is zero, the enrichment is live-critical and decision D2 must be revisited with the user before any further task in this plan. Do not work around it by keeping the bridge path.

- [ ] **Step 4: Record the two pre-existing issues found while measuring**

Neither blocks this plan; both need their own follow-up and must not be lost:

1. **Projection gap.** 31 relation `inflicts` rows have no local counterpart, concentrated in `BrainofCthulhu` and `Creeper` (9 each) plus `BloodMummy`, `DarkMummy`, `Mummy`, `Slimer`, `Creeper`, and others. Their NPC and buff both resolve in local, so this is not an identity failure.
2. **Second local writer.** 20 local rows have no relation counterpart and are written directly by `backfill-npc-buff-relations-from-wiki-crawler.mjs`, bypassing maint and relation. That is an unregistered local writer of the exact kind `tableOwnershipMatrix` exists to catalogue.

Append both to `docs/devlog/entries/2026-07-23-crawler-auto-ingestion-readiness-design.md` under a Follow-up bullet.

- [ ] **Step 5: Commit**

```bash
git add docs/devlog/entries/2026-07-23-crawler-auto-ingestion-readiness-design.md
git commit -m "docs(devlog): record NPC-Buff precheck evidence and two pre-existing gaps"
```

---

## Task 3: Contract registry module

Four modes. The registry parses a new table in the boundary document and validates each row against the rules its mode declares.

**Files:**
- Create: `scripts/data/audit/canonical-source-contract-registry.mjs`
- Test: `scripts/data/audit/canonical-source-contract-registry.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `scripts/data/audit/canonical-source-contract-registry.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildSourceContractComplianceReport } from './canonical-source-contract-registry.mjs';

const DESIGN = 'docs/superpowers/specs/2026-07-26-b1-canonical-source-migration-design.md';

function createTempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-contract-'));
  fs.mkdirSync(path.join(root, 'docs', 'audits'), { recursive: true });
  fs.mkdirSync(path.join(root, path.dirname(DESIGN)), { recursive: true });
  fs.writeFileSync(path.join(root, DESIGN), '# design\n', 'utf8');
  return root;
}

function writeBoundaryDoc(repoRoot, rows) {
  const body = [
    '# Canonical Migration Boundary',
    '',
    '## 来源合同登记',
    '',
    '| 输入 | mode | 证据 | deadline |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
    '## Apply 前准入',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(repoRoot, 'docs', 'audits', 'canonical-migration-boundary.md'), body, 'utf8');
}

function writeReport(repoRoot, relativePath, payload) {
  const full = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(payload, null, 2), 'utf8');
}

test('b1 mode passes before its deadline and blocks after it', () => {
  const repoRoot = createTempRepo();
  writeBoundaryDoc(repoRoot, [
    '| `data/generated/recipe-material-reference.json` | `b1` | recipe material group | 2026-08-31 |',
  ]);

  const ok = buildSourceContractComplianceReport({
    repoRoot,
    domainId: 'support.recipe',
    generatedAt: '2026-07-26T00:00:00Z',
    inputs: ['data/generated/recipe-material-reference.json'],
  });
  assert.equal(ok.status, 'pass');
  assert.equal(ok.panelId, 'b1ExemptionCompliance');
  assert.equal(ok.requiresDatabase, false);
  assert.equal(ok.writesDatabase, false);

  const expired = buildSourceContractComplianceReport({
    repoRoot,
    domainId: 'support.recipe',
    generatedAt: '2026-09-30T00:00:00Z',
    inputs: ['data/generated/recipe-material-reference.json'],
  });
  assert.equal(expired.status, 'blocked');
  assert.match(expired.blockingReasons[0], /expired on 2026-08-31/);
});

test('b1_migrating requires design reference, declared state, and a bounded deadline', () => {
  const repoRoot = createTempRepo();
  writeBoundaryDoc(repoRoot, [
    `| \`data/generated/recipe-material-reference.json\` | \`b1_migrating\` | \`DESIGN_APPROVED\`; design: \`${DESIGN}\` | 2026-10-31 |`,
  ]);

  const report = buildSourceContractComplianceReport({
    repoRoot,
    domainId: 'support.recipe',
    generatedAt: '2026-07-26T00:00:00Z',
    inputs: ['data/generated/recipe-material-reference.json'],
  });
  assert.equal(report.status, 'pass');
  assert.equal(report.checks[0].mode, 'b1_migrating');
  assert.equal(report.checks[0].declaredState, 'DESIGN_APPROVED');
});

test('b1_migrating blocks a missing design reference', () => {
  const repoRoot = createTempRepo();
  writeBoundaryDoc(repoRoot, [
    '| `data/generated/recipe-material-reference.json` | `b1_migrating` | `DESIGN_APPROVED` | 2026-10-31 |',
  ]);

  const report = buildSourceContractComplianceReport({
    repoRoot,
    domainId: 'support.recipe',
    generatedAt: '2026-07-26T00:00:00Z',
    inputs: ['data/generated/recipe-material-reference.json'],
  });
  assert.equal(report.status, 'blocked');
  assert.match(report.blockingReasons[0], /design reference/i);
});

test('b1_migrating blocks a design reference that does not exist on disk', () => {
  const repoRoot = createTempRepo();
  writeBoundaryDoc(repoRoot, [
    '| `data/generated/recipe-material-reference.json` | `b1_migrating` | `DESIGN_APPROVED`; design: `docs/superpowers/specs/nope.md` | 2026-10-31 |',
  ]);

  const report = buildSourceContractComplianceReport({
    repoRoot,
    domainId: 'support.recipe',
    generatedAt: '2026-07-26T00:00:00Z',
    inputs: ['data/generated/recipe-material-reference.json'],
  });
  assert.equal(report.status, 'blocked');
  assert.match(report.blockingReasons[0], /design reference .* not found/i);
});

test('b1_migrating blocks an unrecognized declared state', () => {
  const repoRoot = createTempRepo();
  writeBoundaryDoc(repoRoot, [
    `| \`data/generated/recipe-material-reference.json\` | \`b1_migrating\` | \`ALMOST_DONE\`; design: \`${DESIGN}\` | 2026-10-31 |`,
  ]);

  const report = buildSourceContractComplianceReport({
    repoRoot,
    domainId: 'support.recipe',
    generatedAt: '2026-07-26T00:00:00Z',
    inputs: ['data/generated/recipe-material-reference.json'],
  });
  assert.equal(report.status, 'blocked');
  assert.match(report.blockingReasons[0], /declared state/i);
});

test('b1_migrating blocks a deadline beyond the bounded window', () => {
  const repoRoot = createTempRepo();
  writeBoundaryDoc(repoRoot, [
    `| \`data/generated/recipe-material-reference.json\` | \`b1_migrating\` | \`DESIGN_APPROVED\`; design: \`${DESIGN}\` | 2028-01-01 |`,
  ]);

  const report = buildSourceContractComplianceReport({
    repoRoot,
    domainId: 'support.recipe',
    generatedAt: '2026-07-26T00:00:00Z',
    inputs: ['data/generated/recipe-material-reference.json'],
  });
  assert.equal(report.status, 'blocked');
  assert.match(report.blockingReasons[0], /bounded window/i);
});

test('retired requires a passing absence report', () => {
  const repoRoot = createTempRepo();
  const reportPath = 'reports/canonical-migration/npc-bridge-retirement.json';
  writeBoundaryDoc(repoRoot, [
    `| \`data/generated/wiki-crawler-npc-bridge/standardized/npcs.standardized.json\` | \`retired\` | report: \`${reportPath}\` | — |`,
  ]);
  writeReport(repoRoot, reportPath, {
    status: 'pass',
    writesDatabase: false,
    referenceCount: 0,
    references: [],
  });

  const report = buildSourceContractComplianceReport({
    repoRoot,
    domainId: 'support.town_npc_maintenance',
    generatedAt: '2026-07-26T00:00:00Z',
    inputs: ['data/generated/wiki-crawler-npc-bridge/standardized/npcs.standardized.json'],
  });
  assert.equal(report.status, 'pass');
  assert.equal(report.checks[0].mode, 'retired');
});

test('retired blocks when the absence report still finds references', () => {
  const repoRoot = createTempRepo();
  const reportPath = 'reports/canonical-migration/npc-bridge-retirement.json';
  writeBoundaryDoc(repoRoot, [
    `| \`data/generated/wiki-crawler-npc-bridge/standardized/npcs.standardized.json\` | \`retired\` | report: \`${reportPath}\` | — |`,
  ]);
  writeReport(repoRoot, reportPath, {
    status: 'blocked',
    writesDatabase: false,
    referenceCount: 1,
    references: ['scripts/data/landing/source-dataset-locator.mjs:170'],
  });

  const report = buildSourceContractComplianceReport({
    repoRoot,
    domainId: 'support.town_npc_maintenance',
    generatedAt: '2026-07-26T00:00:00Z',
    inputs: ['data/generated/wiki-crawler-npc-bridge/standardized/npcs.standardized.json'],
  });
  assert.equal(report.status, 'blocked');
  assert.match(report.blockingReasons[0], /still referenced/i);
});

test('retired blocks when the absence report is missing', () => {
  const repoRoot = createTempRepo();
  writeBoundaryDoc(repoRoot, [
    '| `data/generated/wiki-crawler-npc-bridge/standardized/npcs.standardized.json` | `retired` | report: `reports/canonical-migration/npc-bridge-retirement.json` | — |',
  ]);

  const report = buildSourceContractComplianceReport({
    repoRoot,
    domainId: 'support.town_npc_maintenance',
    generatedAt: '2026-07-26T00:00:00Z',
    inputs: ['data/generated/wiki-crawler-npc-bridge/standardized/npcs.standardized.json'],
  });
  assert.equal(report.status, 'blocked');
  assert.match(report.blockingReasons[0], /report .* not found/i);
});

test('an unknown mode blocks rather than defaulting to pass', () => {
  const repoRoot = createTempRepo();
  writeBoundaryDoc(repoRoot, [
    '| `data/generated/recipe-material-reference.json` | `probably_fine` | whatever | 2026-10-31 |',
  ]);

  const report = buildSourceContractComplianceReport({
    repoRoot,
    domainId: 'support.recipe',
    generatedAt: '2026-07-26T00:00:00Z',
    inputs: ['data/generated/recipe-material-reference.json'],
  });
  assert.equal(report.status, 'blocked');
  assert.match(report.blockingReasons[0], /unknown mode/i);
});

test('a registered input missing from the table blocks', () => {
  const repoRoot = createTempRepo();
  writeBoundaryDoc(repoRoot, []);

  const report = buildSourceContractComplianceReport({
    repoRoot,
    domainId: 'support.recipe',
    generatedAt: '2026-07-26T00:00:00Z',
    inputs: ['data/generated/recipe-material-reference.json'],
  });
  assert.equal(report.status, 'blocked');
  assert.match(report.blockingReasons[0], /missing from/i);
});

test('an expected contract count of zero blocks instead of passing vacuously', () => {
  const repoRoot = createTempRepo();
  writeBoundaryDoc(repoRoot, [
    '| `data/generated/recipe-material-reference.json` | `b1` | recipe material group | 2026-08-31 |',
  ]);

  const report = buildSourceContractComplianceReport({
    repoRoot,
    domainId: 'support.recipe',
    generatedAt: '2026-07-26T00:00:00Z',
    inputs: [],
  });
  assert.equal(report.status, 'blocked');
  assert.match(report.blockingReasons[0], /zero expected contracts/i);
});

test('the default matcher resolves a domain to its registered contracts without an explicit inputs list', () => {
  const repoRoot = createTempRepo();
  writeBoundaryDoc(repoRoot, [
    '| `data/generated/recipe-material-reference.json` | `b1` | x | 2026-08-31 |',
    '| `data/generated/recipe-group-overrides.json` | `b1` | x | 2026-08-31 |',
    '| `data/generated/item-group-overrides.json` | `b1` | x | 2026-08-31 |',
  ]);

  const report = buildSourceContractComplianceReport({
    repoRoot,
    domainId: 'support.item_group',
    generatedAt: '2026-07-26T00:00:00Z',
  });
  assert.equal(report.summary.trackedContractCount, 3);
  assert.equal(report.status, 'pass');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/data/audit/canonical-source-contract-registry.test.mjs`

Expected: FAIL — `Cannot find module './canonical-source-contract-registry.mjs'`

- [ ] **Step 3: Write minimal implementation**

Create `scripts/data/audit/canonical-source-contract-registry.mjs`:

```js
#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_BOUNDARY_PATH = 'docs/audits/canonical-migration-boundary.md';
const SECTION_START = '## 来源合同登记';
const SECTION_END = '## Apply 前准入';
const WARNING_WINDOW_DAYS = 7;
const MIGRATING_WINDOW_DAYS = 180;
const CANONICAL_REPORT_MAX_AGE_HOURS = 24;

export const CONTRACT_MODES = ['b1', 'b1_migrating', 'canonical', 'retired'];
export const DECLARED_STATES = ['DESIGN_APPROVED', 'CODE_READY', 'T1_VERIFIED', 'T2_CUTOVER_VERIFIED'];

export const DOMAIN_INPUT_MATCHERS = {
  'support.recipe': [
    'data/generated/recipe-material-reference.json',
    'data/generated/recipe-group-overrides.json',
  ],
  'support.shimmer': [
    'data/generated/item-group-overrides.json',
  ],
  'support.item_group': [
    'data/generated/item-group-overrides.json',
    'data/generated/recipe-group-overrides.json',
    'data/generated/recipe-material-reference.json',
  ],
  'support.town_npc_maintenance': [
    'data/generated/wiki-crawler-npc-bridge/standardized/npcs.standardized.json',
    'data/standardized/npcs.standardized.json',
  ],
};

export function readSourceContracts(fullBoundaryPath) {
  const source = fs.readFileSync(fullBoundaryPath, 'utf8');
  const section = extractSection(source, SECTION_START, SECTION_END);
  const contracts = new Map();

  for (const line of section.split(/\r?\n/)) {
    if (!line.trim().startsWith('| `')) {
      continue;
    }
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 4) {
      continue;
    }
    const input = stripCodeTicks(cells[0]);
    contracts.set(input, {
      input,
      mode: stripCodeTicks(cells[1]),
      evidence: cells[2],
      deadline: normalizeDeadline(cells[3]),
      declaredState: extractDeclaredState(cells[2]),
      designReference: extractLabelled(cells[2], 'design'),
      reportPath: extractLabelled(cells[2], 'report'),
      rawLine: line.trim(),
    });
  }

  return contracts;
}

export function buildSourceContractComplianceReport({
  repoRoot = process.cwd(),
  domainId,
  generatedAt = new Date().toISOString(),
  boundaryPath = DEFAULT_BOUNDARY_PATH,
  inputs = null,
} = {}) {
  if (!domainId) {
    throw new Error('source contract compliance requires domainId.');
  }

  const root = path.resolve(repoRoot);
  const now = parseDate(generatedAt) ?? new Date();
  const contracts = readSourceContracts(path.resolve(root, boundaryPath));
  const trackedInputs = inputs ?? DOMAIN_INPUT_MATCHERS[domainId] ?? [];
  const checks = trackedInputs.map((input) => buildCheck(root, input, contracts.get(input), now));

  const blockingReasons = checks.filter((c) => c.status === 'blocked').map((c) => c.reason);
  const warningReasons = checks.filter((c) => c.status === 'warning').map((c) => c.reason);

  if (trackedInputs.length === 0) {
    blockingReasons.push(`${domainId} has zero expected contracts; a vacuous pass is not accepted.`);
  }

  return {
    generatedAt,
    domainId,
    panelId: 'b1ExemptionCompliance',
    status: blockingReasons.length > 0 ? 'blocked' : warningReasons.length > 0 ? 'warning' : 'pass',
    requiresDatabase: false,
    writesDatabase: false,
    sourcePath: normalizePath(boundaryPath),
    summary: {
      trackedContractCount: checks.length,
      passedCount: checks.filter((c) => c.status === 'pass').length,
      warningCount: warningReasons.length,
      blockedCount: checks.filter((c) => c.status === 'blocked').length,
      modes: checks.reduce((acc, c) => {
        if (c.mode) {
          acc[c.mode] = (acc[c.mode] ?? 0) + 1;
        }
        return acc;
      }, {}),
    },
    blockingReasons,
    warningReasons,
    notes: [],
    checks,
  };
}

function buildCheck(root, input, contract, now) {
  const base = { input, mode: contract?.mode ?? null };

  if (!contract) {
    return { ...base, status: 'blocked', reason: `Source contract ${input} is missing from ${SECTION_START} registration.` };
  }
  if (!CONTRACT_MODES.includes(contract.mode)) {
    return { ...base, status: 'blocked', reason: `Source contract ${input} declares unknown mode "${contract.mode}".` };
  }

  if (contract.mode === 'b1') {
    return checkDeadline(base, contract, now, 'b1');
  }
  if (contract.mode === 'b1_migrating') {
    return checkMigrating(root, base, contract, now);
  }
  if (contract.mode === 'retired') {
    return checkRetired(root, base, contract);
  }
  return checkCanonical(root, base, contract, now);
}

function checkDeadline(base, contract, now, label) {
  if (!contract.deadline) {
    return { ...base, status: 'blocked', deadline: null, reason: `Source contract ${contract.input} in mode ${label} is missing a deadline.` };
  }
  const deadlineDate = parseDate(contract.deadline);
  if (!deadlineDate) {
    return { ...base, status: 'blocked', deadline: contract.deadline, reason: `Source contract ${contract.input} has an unparseable deadline "${contract.deadline}".` };
  }
  const daysRemaining = Math.ceil((deadlineDate.getTime() - now.getTime()) / 86_400_000);
  if (daysRemaining < 0) {
    return { ...base, status: 'blocked', deadline: contract.deadline, daysRemaining, reason: `Source contract ${contract.input} expired on ${contract.deadline}.` };
  }
  if (daysRemaining <= WARNING_WINDOW_DAYS) {
    return { ...base, status: 'warning', deadline: contract.deadline, daysRemaining, reason: `Source contract ${contract.input} expires within ${WARNING_WINDOW_DAYS} days on ${contract.deadline}.` };
  }
  return { ...base, status: 'pass', deadline: contract.deadline, daysRemaining, reason: null };
}

function checkMigrating(root, base, contract, now) {
  if (!contract.designReference) {
    return { ...base, status: 'blocked', reason: `Source contract ${contract.input} in mode b1_migrating is missing a design reference.` };
  }
  if (!fs.existsSync(path.resolve(root, contract.designReference))) {
    return { ...base, status: 'blocked', reason: `Source contract ${contract.input} design reference ${contract.designReference} was not found on disk.` };
  }
  if (!DECLARED_STATES.includes(contract.declaredState)) {
    return { ...base, status: 'blocked', reason: `Source contract ${contract.input} has an unrecognized declared state "${contract.declaredState ?? ''}".` };
  }

  const deadlineCheck = checkDeadline(base, contract, now, 'b1_migrating');
  if (deadlineCheck.status === 'blocked') {
    return { ...deadlineCheck, declaredState: contract.declaredState, designReference: contract.designReference };
  }
  if (deadlineCheck.daysRemaining > MIGRATING_WINDOW_DAYS) {
    return {
      ...base,
      status: 'blocked',
      deadline: contract.deadline,
      daysRemaining: deadlineCheck.daysRemaining,
      declaredState: contract.declaredState,
      designReference: contract.designReference,
      reason: `Source contract ${contract.input} deadline ${contract.deadline} is outside the ${MIGRATING_WINDOW_DAYS}-day bounded window for b1_migrating.`,
    };
  }
  return { ...deadlineCheck, declaredState: contract.declaredState, designReference: contract.designReference };
}

function checkRetired(root, base, contract) {
  if (!contract.reportPath) {
    return { ...base, status: 'blocked', reason: `Source contract ${contract.input} in mode retired is missing a report reference.` };
  }
  const full = path.resolve(root, contract.reportPath);
  if (!fs.existsSync(full)) {
    return { ...base, status: 'blocked', reportPath: contract.reportPath, reason: `Source contract ${contract.input} retirement report ${contract.reportPath} was not found on disk.` };
  }
  const payload = readJsonSafe(full);
  if (!payload) {
    return { ...base, status: 'blocked', reportPath: contract.reportPath, reason: `Source contract ${contract.input} retirement report ${contract.reportPath} is malformed.` };
  }
  if (payload.writesDatabase !== false) {
    return { ...base, status: 'blocked', reportPath: contract.reportPath, reason: `Source contract ${contract.input} retirement report must declare writesDatabase: false.` };
  }
  const referenceCount = Number(payload.referenceCount);
  if (!Number.isFinite(referenceCount)) {
    return { ...base, status: 'blocked', reportPath: contract.reportPath, reason: `Source contract ${contract.input} retirement report has a non-finite referenceCount; failing closed.` };
  }
  if (payload.status !== 'pass' || referenceCount !== 0) {
    return { ...base, status: 'blocked', reportPath: contract.reportPath, referenceCount, reason: `Source contract ${contract.input} is still referenced in ${referenceCount} place(s); retirement is not satisfied.` };
  }
  return { ...base, status: 'pass', reportPath: contract.reportPath, referenceCount: 0, reason: null };
}

function checkCanonical(root, base, contract, now) {
  if (!contract.reportPath) {
    return { ...base, status: 'blocked', reason: `Source contract ${contract.input} in mode canonical is missing a readiness report reference.` };
  }
  const full = path.resolve(root, contract.reportPath);
  if (!fs.existsSync(full)) {
    return { ...base, status: 'blocked', reportPath: contract.reportPath, reason: `Source contract ${contract.input} readiness report ${contract.reportPath} was not found on disk.` };
  }
  const payload = readJsonSafe(full);
  if (!payload) {
    return { ...base, status: 'blocked', reportPath: contract.reportPath, reason: `Source contract ${contract.input} readiness report ${contract.reportPath} is malformed.` };
  }
  if (payload.status !== 'pass') {
    return { ...base, status: 'blocked', reportPath: contract.reportPath, reason: `Source contract ${contract.input} readiness report is not passing.` };
  }
  if (payload.writesDatabase !== false || payload.requiresDatabase !== true) {
    return { ...base, status: 'blocked', reportPath: contract.reportPath, reason: `Source contract ${contract.input} readiness report must declare requiresDatabase: true and writesDatabase: false.` };
  }
  const generated = parseDate(payload.generatedAt);
  if (!generated) {
    return { ...base, status: 'blocked', reportPath: contract.reportPath, reason: `Source contract ${contract.input} readiness report has an unparseable generatedAt.` };
  }
  const ageHours = (now.getTime() - generated.getTime()) / 3_600_000;
  if (ageHours > CANONICAL_REPORT_MAX_AGE_HOURS) {
    return { ...base, status: 'blocked', reportPath: contract.reportPath, reason: `Source contract ${contract.input} readiness report is ${Math.round(ageHours)}h old, older than the ${CANONICAL_REPORT_MAX_AGE_HOURS}h limit.` };
  }
  return { ...base, status: 'pass', reportPath: contract.reportPath, reason: null };
}

function extractSection(source, startMarker, endMarker) {
  const startIndex = source.indexOf(startMarker);
  if (startIndex < 0) {
    throw new Error(`Missing section: ${startMarker}`);
  }
  const endIndex = source.indexOf(endMarker, startIndex);
  return endIndex >= 0 ? source.slice(startIndex, endIndex) : source.slice(startIndex);
}

function extractDeclaredState(text) {
  const match = String(text ?? '').match(/`([A-Z0-9_]+)`/);
  return match?.[1] ?? null;
}

function extractLabelled(text, label) {
  const match = String(text ?? '').match(new RegExp(`${label}\\s*[:：]\\s*\`([^\`]+)\``, 'i'));
  return match?.[1] ?? null;
}

function normalizeDeadline(cell) {
  const match = String(cell ?? '').match(/(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

function stripCodeTicks(value) {
  return String(value ?? '').replace(/^`|`$/g, '').trim();
}

function parseDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizePath(value) {
  return String(value ?? '').replace(/\\/g, '/');
}

function readJsonSafe(fullPath) {
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/data/audit/canonical-source-contract-registry.test.mjs`

Expected: PASS, 13/13

- [ ] **Step 5: Commit**

```bash
git add scripts/data/audit/canonical-source-contract-registry.mjs scripts/data/audit/canonical-source-contract-registry.test.mjs
git commit -m "feat(audit): add four-mode canonical source contract registry"
```

---

## Task 4: Bridge retirement report generator

The `retired` mode needs positive evidence: a scan proving nothing references the path.

**Files:**
- Create: `scripts/data/audit/build-npc-bridge-retirement-report.mjs`
- Test: `scripts/data/audit/build-npc-bridge-retirement-report.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `scripts/data/audit/build-npc-bridge-retirement-report.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildNpcBridgeRetirementReport } from './build-npc-bridge-retirement-report.mjs';

function createRepo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-retire-'));
  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(root, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
  }
  return root;
}

const BRIDGE = 'data/generated/wiki-crawler-npc-bridge/standardized/npcs.standardized.json';

test('report passes when no scanned file references the bridge path', () => {
  const repoRoot = createRepo({
    'scripts/data/landing/source-dataset-locator.mjs': "const p = 'data/standardized/npcs.standardized.json';\n",
    'docs/audits/canonical-migration-boundary.md': `mentions ${BRIDGE} in prose, which is allowed\n`,
  });

  const report = buildNpcBridgeRetirementReport({ repoRoot, generatedAt: '2026-07-26T00:00:00Z' });

  assert.equal(report.status, 'pass');
  assert.equal(report.referenceCount, 0);
  assert.equal(report.writesDatabase, false);
  assert.equal(report.requiresDatabase, false);
  assert.deepEqual(report.references, []);
});

test('report blocks and names the file when code still references the bridge path', () => {
  const repoRoot = createRepo({
    'scripts/data/landing/source-dataset-locator.mjs': `const p = '${BRIDGE}';\n`,
  });

  const report = buildNpcBridgeRetirementReport({ repoRoot, generatedAt: '2026-07-26T00:00:00Z' });

  assert.equal(report.status, 'blocked');
  assert.equal(report.referenceCount, 1);
  assert.equal(report.references[0].file, 'scripts/data/landing/source-dataset-locator.mjs');
  assert.equal(report.references[0].line, 1);
});

test('documentation and explicit retirement tests are allowed references', () => {
  const repoRoot = createRepo({
    'docs/superpowers/specs/design.md': `the retired path is ${BRIDGE}\n`,
    'scripts/data/audit/build-npc-bridge-retirement-report.test.mjs': `const BRIDGE = '${BRIDGE}';\n`,
  });

  const report = buildNpcBridgeRetirementReport({ repoRoot, generatedAt: '2026-07-26T00:00:00Z' });

  assert.equal(report.status, 'pass');
  assert.equal(report.referenceCount, 0);
  assert.equal(report.allowedReferenceCount, 2);
});

test('report blocks when the scan finds zero scannable files, rather than passing vacuously', () => {
  const repoRoot = createRepo({});

  const report = buildNpcBridgeRetirementReport({ repoRoot, generatedAt: '2026-07-26T00:00:00Z' });

  assert.equal(report.status, 'blocked');
  assert.match(report.blockingReasons[0], /zero scannable files/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/data/audit/build-npc-bridge-retirement-report.test.mjs`

Expected: FAIL — `Cannot find module './build-npc-bridge-retirement-report.mjs'`

- [ ] **Step 3: Write minimal implementation**

Create `scripts/data/audit/build-npc-bridge-retirement-report.mjs`:

```js
#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const BRIDGE_PATH = 'data/generated/wiki-crawler-npc-bridge/standardized/npcs.standardized.json';
const SCAN_EXTENSIONS = new Set(['.mjs', '.js', '.ts', '.vue', '.java', '.sh', '.md', '.json']);
const SKIP_DIRECTORIES = new Set(['node_modules', '.git', 'target', 'dist', '.nuxt', '.output']);

function isAllowedReference(relativePath) {
  if (relativePath.startsWith('docs/')) {
    return true;
  }
  if (relativePath.endsWith('build-npc-bridge-retirement-report.mjs')) {
    return true;
  }
  if (relativePath.endsWith('build-npc-bridge-retirement-report.test.mjs')) {
    return true;
  }
  return false;
}

function* walk(root, current = root) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.gitignore') {
      continue;
    }
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) {
        continue;
      }
      yield* walk(root, full);
      continue;
    }
    if (SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      yield full;
    }
  }
}

export function buildNpcBridgeRetirementReport({
  repoRoot = process.cwd(),
  generatedAt = new Date().toISOString(),
} = {}) {
  const root = path.resolve(repoRoot);
  const references = [];
  let scannedFileCount = 0;
  let allowedReferenceCount = 0;

  for (const full of walk(root)) {
    scannedFileCount += 1;
    const relative = path.relative(root, full).split(path.sep).join('/');
    const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
    lines.forEach((text, index) => {
      if (!text.includes(BRIDGE_PATH)) {
        return;
      }
      if (isAllowedReference(relative)) {
        allowedReferenceCount += 1;
        return;
      }
      references.push({ file: relative, line: index + 1, text: text.trim() });
    });
  }

  const blockingReasons = [];
  if (scannedFileCount === 0) {
    blockingReasons.push('Retirement scan found zero scannable files; failing closed rather than reporting a vacuous pass.');
  }
  for (const reference of references) {
    blockingReasons.push(`${BRIDGE_PATH} is still referenced at ${reference.file}:${reference.line}.`);
  }

  return {
    generatedAt,
    reportId: 'npcBridgeRetirement',
    retiredPath: BRIDGE_PATH,
    status: blockingReasons.length > 0 ? 'blocked' : 'pass',
    requiresDatabase: false,
    writesDatabase: false,
    scannedFileCount,
    allowedReferenceCount,
    referenceCount: references.length,
    references,
    blockingReasons,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = buildNpcBridgeRetirementReport({ repoRoot: process.cwd() });
  const outputPath = path.join(process.cwd(), 'reports', 'canonical-migration', 'npc-bridge-retirement.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${report.status}: ${report.referenceCount} reference(s) across ${report.scannedFileCount} files\n`);
  process.exitCode = report.status === 'pass' ? 0 : 1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/data/audit/build-npc-bridge-retirement-report.test.mjs`

Expected: PASS, 4/4

- [ ] **Step 5: Commit**

```bash
git add scripts/data/audit/build-npc-bridge-retirement-report.mjs scripts/data/audit/build-npc-bridge-retirement-report.test.mjs
git commit -m "feat(audit): add NPC bridge retirement absence scan"
```

---

## Task 5: Locator requires an explicit descriptor and points at the tracked file

`pushFileDescriptor` currently returns silently when the file is absent (`source-dataset-locator.mjs:141-147`), which is why a clean clone lands no `npcs_raw` at all with no signal.

**Files:**
- Modify: `scripts/data/landing/source-dataset-locator.mjs:141-147, 168-186`
- Test: `scripts/data/landing/source-dataset-locator.test.mjs:39-45, 140, 157-160`

- [ ] **Step 1: Write the failing test**

In `scripts/data/landing/source-dataset-locator.test.mjs`, change the fixture write at lines 39-45 from the bridge path to the tracked path:

```js
  await writeJson(path.join(repoRoot, 'data', 'standardized', 'npcs.standardized.json'), {
    entity: 'npcs',
```

Replace the `npcEntry` assertions (lines 157-160) with:

```js
  const npcEntry = actual.find((entry) => entry.datasetType === 'npcs_raw');
  assert.equal(npcEntry.provider, 'terrapedia.standardized');
  assert.equal(npcEntry.sourceKind, 'standardized_dataset');
  assert.equal(npcEntry.sourceKey, 'standardized.npcs');
  assert.equal(npcEntry.sourceLocator, 'repo://data/standardized/npcs.standardized.json');
```

Append a new test at the end of the file:

```js
test('listSourceDatasetLandingInputs fails loudly when a required dataset input is absent', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'terrapedia-landing-missing-'));
  const repoRoot = path.join(tempRoot, 'repo');
  const sharedDataRoot = path.join(tempRoot, 'shared');
  await fs.mkdir(repoRoot, { recursive: true });
  await fs.mkdir(sharedDataRoot, { recursive: true });

  await assert.rejects(
    () => listSourceDatasetLandingInputs({ repoRoot, sharedDataRoot, datasets: ['npcs_raw'] }),
    /npcs_raw requires an accepted landing source/,
  );
});

test('listSourceDatasetLandingInputs still skips optional datasets that are absent', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'terrapedia-landing-optional-'));
  const repoRoot = path.join(tempRoot, 'repo');
  const sharedDataRoot = path.join(tempRoot, 'shared');
  await fs.mkdir(repoRoot, { recursive: true });
  await fs.mkdir(sharedDataRoot, { recursive: true });

  const actual = await listSourceDatasetLandingInputs({ repoRoot, sharedDataRoot, datasets: ['projectiles_raw'] });
  assert.deepEqual(actual, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/data/landing/source-dataset-locator.test.mjs`

Expected: FAIL — the repointed fixture makes `datasetCounts.npcs_raw` undefined, and the missing-source test finds no rejection.

- [ ] **Step 3: Write minimal implementation**

In `scripts/data/landing/source-dataset-locator.mjs`, replace `pushFileDescriptor` (lines 141-147) with a version that accepts a `required` flag:

```js
  const pushFileDescriptor = async (datasetType, filePath, builder, { required = false } = {}) => {
    if (!shouldInclude(datasetType)) {
      return;
    }
    if (!(await exists(filePath))) {
      if (required) {
        throw new Error(
          `${datasetType} requires an accepted landing source, but ${filePath} does not exist. `
          + 'Provide an explicit descriptor for this dataset instead of relying on a default path.',
        );
      }
      return;
    }
    const payload = await readJson(filePath);
    entries.push(builder(filePath, payload));
  };
```

Replace the `npcs_raw` block (lines 168-186) with:

```js
  await pushFileDescriptor(
    'npcs_raw',
    path.join(repoRoot, 'data', 'standardized', 'npcs.standardized.json'),
    (filePath, payload) => buildFileDescriptor({
      datasetType: 'npcs_raw',
      filePath,
      payload,
      provider: 'terrapedia.standardized',
      sourceKind: 'standardized_dataset',
      sourceKey: 'standardized.npcs',
      sourcePage: 'npcs.standardized',
      sourceRevisionTimestamp: null,
      fetchedAt: payload.generatedAt,
      parsedAt: payload.generatedAt,
      parseStatus: 'ok',
      repoRoot,
      sharedDataRoot,
    }),
    { required: true },
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/data/landing/source-dataset-locator.test.mjs`

Expected: PASS, all tests including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add scripts/data/landing/source-dataset-locator.mjs scripts/data/landing/source-dataset-locator.test.mjs
git commit -m "fix(landing): require an explicit npcs_raw source and fail loudly when absent"
```

---

## Task 6: Remove the bridge fallback from the buff backfill

`backfill-npc-buff-relations-from-wiki-crawler.mjs:127` uses the bridge path as a `??` default, so the script silently reads a file that does not exist on a clean clone.

The default lives inside `resolveOptions`, which is exported and therefore directly testable without running the backfill.

**Files:**
- Modify: `scripts/data/backfill/backfill-npc-buff-relations-from-wiki-crawler.mjs:124-128`
- Test: `scripts/data/backfill/npc-buff-relations-from-wiki-crawler.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `scripts/data/backfill/npc-buff-relations-from-wiki-crawler.test.mjs`:

```js
test('resolveOptions requires an explicit data path instead of defaulting to the retired bridge', () => {
  assert.throws(
    () => resolveOptions({}),
    /requires --data-path/,
  );
});

test('resolveOptions accepts an explicit data path', () => {
  const resolved = resolveOptions({ 'data-path': '/tmp/npcs.standardized.json' });
  assert.equal(resolved.dataPath, '/tmp/npcs.standardized.json');
});
```

If `resolveOptions` is not already imported at the top of that file, add it to the existing import from `./backfill-npc-buff-relations-from-wiki-crawler.mjs`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/data/backfill/npc-buff-relations-from-wiki-crawler.test.mjs`

Expected: FAIL — `resolveOptions({})` returns the bridge path instead of throwing.

- [ ] **Step 3: Replace the default with a required option**

In `scripts/data/backfill/backfill-npc-buff-relations-from-wiki-crawler.mjs`, replace lines 124-128:

```js
  const dataPath = path.resolve(
    args['data-path']
      ?? args.dataPath
      ?? path.join(repoRoot, 'data', 'generated', 'wiki-crawler-npc-bridge', 'standardized', 'npcs.standardized.json')
  );
```

with:

```js
  const requestedDataPath = args['data-path'] ?? args.dataPath ?? null;
  if (!requestedDataPath) {
    throw new Error(
      'backfill-npc-buff-relations requires --data-path=<path>. '
      + 'The former wiki-crawler-npc-bridge default is retired because that artifact is gitignored '
      + 'and absent from every clean clone; pass an accepted crawler normalized payload explicitly.',
    );
  }
  const dataPath = path.resolve(requestedDataPath);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/data/backfill/npc-buff-relations-from-wiki-crawler.test.mjs`

Expected: PASS, including the two new tests.

- [ ] **Step 5: Verify no bridge reference remains in the script**

Run: `grep -c "wiki-crawler-npc-bridge" scripts/data/backfill/backfill-npc-buff-relations-from-wiki-crawler.mjs`

Expected: `0`

- [ ] **Step 6: Commit**

```bash
git add scripts/data/backfill/backfill-npc-buff-relations-from-wiki-crawler.mjs scripts/data/backfill/npc-buff-relations-from-wiki-crawler.test.mjs
git commit -m "fix(backfill): require an explicit data path instead of the retired bridge default"
```

---

## Task 7: Boundary document contract table

**Files:**
- Modify: `docs/audits/canonical-migration-boundary.md`

- [ ] **Step 1: Generate the retirement report so the `retired` row has evidence**

Run: `node scripts/data/audit/build-npc-bridge-retirement-report.mjs`

Expected: `pass: 0 reference(s) across N files`, and `reports/canonical-migration/npc-bridge-retirement.json` created.

If it reports references, fix them before continuing. Tasks 5 and 6 should have removed the only two code references.

- [ ] **Step 2: Add the contract table above the existing `## Apply 前准入` section**

Insert this section immediately before `## Apply 前准入`:

```markdown
## 来源合同登记

每个输入身份永久保留一行，mode 决定校验规则。行只改 mode，不删除：删掉的行和满足的行对后来的读者无法区分。

- `b1`：校验登记与 deadline。
- `b1_migrating`：校验已批准设计引用、声明状态、限期内的重新登记 deadline。永不满足 `B1_CLOSED`。
- `canonical`：校验具名 readiness 报告与其 T2 割接身份。
- `retired`：校验正向缺席报告，证明该路径已无任何引用。

| 输入 | mode | 证据 | deadline |
| --- | --- | --- | --- |
| `data/generated/recipe-material-reference.json` | `b1_migrating` | `DESIGN_APPROVED`; design: `docs/superpowers/specs/2026-07-26-b1-canonical-source-migration-design.md` | 2026-10-31 |
| `data/generated/recipe-group-overrides.json` | `b1_migrating` | `DESIGN_APPROVED`; design: `docs/superpowers/specs/2026-07-26-b1-canonical-source-migration-design.md` | 2026-10-31 |
| `data/generated/item-group-overrides.json` | `b1_migrating` | `DESIGN_APPROVED`; design: `docs/superpowers/specs/2026-07-26-b1-canonical-source-migration-design.md` | 2026-10-31 |
| `data/generated/wiki-crawler-npc-bridge/standardized/npcs.standardized.json` | `retired` | report: `reports/canonical-migration/npc-bridge-retirement.json` | — |
| `data/standardized/npcs.standardized.json` | `b1_migrating` | `DESIGN_APPROVED`; design: `docs/superpowers/specs/2026-07-26-b1-canonical-source-migration-design.md` | 2026-10-31 |
```

- [ ] **Step 3: Mark the old exemption table as superseded**

Under the `## 过渡豁免登记` heading, insert this line directly beneath the heading and leave the table itself in place as history:

```markdown
> 已由 `## 来源合同登记` 取代。本表保留为历史记录，不再被任何检查读取。bridge 路径一行的处置见来源合同登记中的 `retired` 行。
```

- [ ] **Step 4: Verify the registry parses the new table**

Run:

```bash
node -e "
const {readSourceContracts}=await import('./scripts/data/audit/canonical-source-contract-registry.mjs');
const c=readSourceContracts('docs/audits/canonical-migration-boundary.md');
console.log('contracts:',c.size);
for(const [k,v] of c) console.log(' ',v.mode.padEnd(14),k);
" --input-type=module
```

Expected: `contracts: 5`, with one `retired` and four `b1_migrating`.

- [ ] **Step 5: Commit**

```bash
git add docs/audits/canonical-migration-boundary.md reports/canonical-migration/npc-bridge-retirement.json
git commit -m "docs(audits): add source contract registration and retire the bridge row"
```

---

## Task 8: Delegate the panel to the registry and delete the path matcher

**Files:**
- Modify: `scripts/data/audit/domain-readiness-audit.mjs:455-465`
- Delete: `scripts/data/audit/b1-exemption-compliance.mjs`, `scripts/data/audit/b1-exemption-compliance.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `scripts/data/audit/canonical-source-contract-registry.test.mjs`:

```js
test('domain readiness delegates the b1ExemptionCompliance panel to the contract registry', async () => {
  const { buildDomainReadinessReport } = await import('./domain-readiness-audit.mjs');
  const repoRoot = createTempRepo();
  writeBoundaryDoc(repoRoot, [
    `| \`data/generated/item-group-overrides.json\` | \`b1_migrating\` | \`DESIGN_APPROVED\`; design: \`${DESIGN}\` | 2026-10-31 |`,
  ]);

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'support.shimmer',
    panel: 'b1ExemptionCompliance',
    generatedAt: '2026-07-26T00:00:00Z',
  });

  assert.equal(report.panelId, 'b1ExemptionCompliance');
  assert.equal(report.status, 'pass');
  assert.equal(report.summary.trackedContractCount, 1);
  assert.equal(report.reportPath, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/data/audit/canonical-source-contract-registry.test.mjs`

Expected: FAIL — the panel still returns `summary.trackedExemptionCount` from the old matcher, so `trackedContractCount` is undefined.

- [ ] **Step 3: Swap the import and the call**

In `scripts/data/audit/domain-readiness-audit.mjs`, replace the `b1-exemption-compliance.mjs` import with:

```js
import { buildSourceContractComplianceReport } from './canonical-source-contract-registry.mjs';
```

Replace the panel branch at lines 455-465 with:

```js
  if (normalizedPanel === 'b1ExemptionCompliance') {
    return {
      ...buildSourceContractComplianceReport({
        repoRoot,
        domainId,
        generatedAt,
      }),
      reportPath: reportPath ?? null,
    };
  }
```

Leave `resolveDomainReportPath` (line 494 onwards) unchanged: the panel id and its report filename stay the same so the acceptance manifest, freshness audit, and admin view need no changes.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/data/audit/canonical-source-contract-registry.test.mjs scripts/data/audit/domain-readiness-audit.test.mjs`

Expected: PASS both files.

- [ ] **Step 5: Delete the superseded matcher**

```bash
git rm scripts/data/audit/b1-exemption-compliance.mjs scripts/data/audit/b1-exemption-compliance.test.mjs
```

- [ ] **Step 6: Confirm nothing still imports it**

Run: `grep -rn "b1-exemption-compliance" --include=*.mjs --include=*.sh --include=*.java --include=*.vue . | grep -v node_modules`

Expected: no results. If `scripts/dev/quality-gate.sh` still lists the deleted test, Task 9 fixes it; anything else must be updated now.

- [ ] **Step 7: Commit**

```bash
git add -A scripts/data/audit
git commit -m "refactor(audit): replace the B1 path matcher with the contract registry"
```

---

## Task 9: Wire the quality gate and run it end to end

**Files:**
- Modify: `scripts/dev/quality-gate.sh:55-74`

- [ ] **Step 1: Replace the deleted test in the gate's Node list**

In `scripts/dev/quality-gate.sh`, remove any `scripts/data/audit/b1-exemption-compliance.test.mjs` entry and add these three in its place, preserving the existing backslash continuation style:

```sh
  scripts/data/audit/canonical-source-contract-registry.test.mjs \
  scripts/data/audit/build-npc-bridge-retirement-report.test.mjs \
  scripts/data/audit/npc-buff-relation-precheck.test.mjs \
```

- [ ] **Step 2: Run the three new suites plus the panel suite**

Run:

```bash
node --test \
  scripts/data/audit/canonical-source-contract-registry.test.mjs \
  scripts/data/audit/build-npc-bridge-retirement-report.test.mjs \
  scripts/data/audit/npc-buff-relation-precheck.test.mjs \
  scripts/data/audit/domain-readiness-audit.test.mjs \
  scripts/data/landing/source-dataset-locator.test.mjs
```

Expected: PASS, all files.

- [ ] **Step 3: Confirm all four panels now pass**

Run:

```bash
for d in support.recipe support.shimmer support.item_group support.town_npc_maintenance; do
  node -e "
  const {buildSourceContractComplianceReport}=await import('./scripts/data/audit/canonical-source-contract-registry.mjs');
  const r=buildSourceContractComplianceReport({repoRoot:process.cwd(),domainId:'$d'});
  console.log('$d', r.status, JSON.stringify(r.summary.modes), r.blockingReasons.join('; '));
  " --input-type=module
done
```

Expected: four lines, all `pass`. `support.town_npc_maintenance` shows one `retired` and one `b1_migrating`.

- [ ] **Step 4: Run the full quality gate**

Run: `bash ./scripts/dev/quality-gate.sh`

Expected: exit 0. This is the outcome Step 0 exists to produce. If it still stops on a B1 panel, the contract table in Task 7 does not match `DOMAIN_INPUT_MATCHERS`; reconcile them rather than relaxing a check.

- [ ] **Step 5: Update the devlog**

Append to `docs/devlog/entries/2026-07-23-crawler-auto-ingestion-readiness-design.md` a Validation bullet recording: the four panel statuses, the retirement report's scanned-file and reference counts, the NPC-Buff pre-check counts from Task 2, and the full-gate result.

- [ ] **Step 6: Commit**

```bash
git add scripts/dev/quality-gate.sh docs/devlog/entries/2026-07-23-crawler-auto-ingestion-readiness-design.md
git commit -m "chore(gate): wire the source contract registry into the quality gate"
```

---

## Done Criteria

- [ ] `bash ./scripts/dev/quality-gate.sh` exits 0
- [ ] All four `b1ExemptionCompliance` panels report `pass`
- [ ] `grep -rn "wiki-crawler-npc-bridge" --include=*.mjs --include=*.java --include=*.vue . | grep -v node_modules` returns only the retirement report generator and its test
- [ ] `node --test scripts/data/landing/source-dataset-locator.test.mjs` proves a missing `npcs_raw` source throws instead of silently omitting the dataset
- [ ] The NPC-Buff pre-check evidence from Task 2 is recorded in the devlog with real counts (relation-inflicts 124, relation-immune 1141, local 112), along with the two pre-existing gaps it exposed
- [ ] `git diff --check` is clean

## Explicitly Not In This Plan

- The group canonical chain: landing, maint, relation, local, exporters, the admin writer, and the `item-group-canonical-*` capability pair. Separate plan.
- The canonical NPC crawler-fact chain. Deferred per D2; blocked on a separately authorized crawler run.
- Any database write. Task 2 is the only database access and it is read-only.
