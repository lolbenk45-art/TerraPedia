import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ITEM_GROUP_READINESS_SCHEMA_VERSION,
  buildItemGroupReadinessReport,
  writeItemGroupReadinessReport,
  validateItemGroupReadinessReport,
} from './item-group-readiness.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;
const COMPATIBILITY_HASH = `sha256:${'b'.repeat(64)}`;

function validEvidence() {
  return {
    writesDatabase: false,
    databaseRole: 't2-readonly',
    cutoverIdentity: { state: 'T2_CUTOVER_VERIFIED', operationId: 'item-group-canonical-cutover' },
    counts: {
      landing: { sourceCount: 4, groupCount: 64 },
      maint: { groupCount: 35, memberCount: 163, aliasCount: 72, exclusionCount: 2 },
      relation: { groupCount: 35, memberCount: 163, aliasCount: 72, unresolvedCount: 0, ambiguousCount: 0, rejectedCount: 2 },
      local: { groupCount: 34, memberCount: 161, aliasCount: 70 },
    },
    hashes: {
      landing: HASH,
      maint: HASH,
      relation: HASH,
      local: HASH,
      compatibility: COMPATIBILITY_HASH,
    },
    shadows: {
      adminItemGroups: { parity: true, snapshotHash: HASH },
      adminRecipeGroups: { parity: true, snapshotHash: HASH },
      recipeTree: { parity: true, snapshotHash: HASH },
    },
    consumerContract: { directJsonReaders: 0, fallbackEnabled: false },
    api: { snapshotHash: HASH },
    exports: [
      { artifact: 'recipe-material-reference.json', fresh: true, snapshotHash: COMPATIBILITY_HASH },
      { artifact: 'recipe-group-overrides.json', fresh: true, snapshotHash: COMPATIBILITY_HASH },
      { artifact: 'item-group-overrides.json', fresh: true, snapshotHash: COMPATIBILITY_HASH },
    ],
  };
}

test('canonical item-group readiness emits the exact v1 pass contract', () => {
  const report = buildItemGroupReadinessReport({ evidence: validEvidence(), generatedAt: '2026-07-27T14:00:00.000Z' });
  assert.equal(ITEM_GROUP_READINESS_SCHEMA_VERSION, 1);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.reportKind, 'canonical_item_group_readiness');
  assert.equal(report.summary.status, 'pass');
  assert.equal(report.summary.blockingCount, 0);
  assert.equal(report.writesDatabase, false);
  assert.equal(report.databaseRole, 't2-readonly');
  assert.equal(report.hashes.local, HASH);
  assert.equal(validateItemGroupReadinessReport(report).valid, true);
});

test('canonical readiness blocks every unsafe or inconsistent evidence class', () => {
  const mutations = [
    ['wrong count', (value) => { value.counts.local.groupCount = 33; }],
    ['unresolved member', (value) => { value.counts.relation.unresolvedCount = 1; }],
    ['ambiguous member', (value) => { value.counts.relation.ambiguousCount = 1; }],
    ['shadow mismatch', (value) => { value.shadows.recipeTree.parity = false; }],
    ['direct JSON reader', (value) => { value.consumerContract.directJsonReaders = 1; }],
    ['fallback enabled', (value) => { value.consumerContract.fallbackEnabled = true; }],
    ['API hash mismatch', (value) => { value.api.snapshotHash = `sha256:${'b'.repeat(64)}`; }],
    ['stale export', (value) => { value.exports[0].fresh = false; }],
    ['duplicate export', (value) => { value.exports.push({ ...value.exports[0] }); }],
    ['wrong T2 role', (value) => { value.databaseRole = 't1'; }],
    ['unverified cutover', (value) => { value.cutoverIdentity.state = 'CODE_READY'; }],
    ['database writer', (value) => { value.writesDatabase = true; }],
    ['invalid hash', (value) => { value.hashes.maint = 'unknown'; }],
    ['missing compatibility hash', (value) => { delete value.hashes.compatibility; }],
    ['runtime hash substituted for compatibility hash', (value) => {
      value.exports[0].snapshotHash = value.hashes.local;
    }],
  ];
  for (const [name, mutate] of mutations) {
    const evidence = validEvidence();
    mutate(evidence);
    const report = buildItemGroupReadinessReport({ evidence });
    assert.equal(report.summary.status, 'blocked', name);
    assert.ok(report.summary.blockingCount > 0, name);
    assert.equal(validateItemGroupReadinessReport(report).valid, false, name);
  }
});

test('canonical readiness requires a valid generatedAt timestamp', () => {
  const report = buildItemGroupReadinessReport({ evidence: validEvidence() });
  delete report.generatedAt;
  assert.equal(validateItemGroupReadinessReport(report).valid, false);

  report.generatedAt = 'not-a-timestamp';
  assert.equal(validateItemGroupReadinessReport(report).valid, false);
});

test('readiness generator consumes only a passing read-only compatibility publication and writes atomically', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'item-group-readiness-'));
  try {
    const inputPath = path.join(repoRoot, 'reports/canonical-migration/item-group-compatibility-export.json');
    fs.mkdirSync(path.dirname(inputPath), { recursive: true });
    const exportRunKey = 'ig-export-test';
    const compatibilitySnapshotHash = COMPATIBILITY_HASH;
    const exports = [
      'recipe-material-reference.json',
      'recipe-group-overrides.json',
      'item-group-overrides.json',
    ].map((artifact) => {
      const relativePath = `data/generated/${artifact}`;
      const raw = `${JSON.stringify({
        artifactRole: 'compat_export',
        exportRunKey,
        canonicalSnapshotHash: compatibilitySnapshotHash,
        artifact,
      })}\n`;
      const resolved = path.join(repoRoot, relativePath);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, raw);
      return {
        artifact,
        path: relativePath,
        exportRunKey,
        snapshotHash: compatibilitySnapshotHash,
        contentHash: crypto.createHash('sha256').update(raw).digest('hex'),
      };
    });
    fs.writeFileSync(inputPath, `${JSON.stringify({
      schemaVersion: 1,
      reportKind: 'canonical_item_group_compatibility_export',
      writesDatabase: false,
      summary: { status: 'pass' },
      exportRunKey,
      compatibilitySnapshotHash,
      exports,
      readinessEvidence: validEvidence(),
    })}\n`);
    const report = await writeItemGroupReadinessReport({
      repoRoot,
      generatedAt: '2026-07-29T04:10:00.000Z',
    });
    assert.equal(report.summary.status, 'pass');
    assert.equal(report.hashes.local, HASH);
    assert.equal(report.hashes.compatibility, COMPATIBILITY_HASH);
    const outputPath = path.join(repoRoot, 'reports/canonical-migration/canonical-item-group-readiness.json');
    assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf8')).summary.status, 'pass');
    assert.equal(fs.existsSync(`${outputPath}.tmp`), false);

    fs.writeFileSync(path.join(repoRoot, exports[0].path), '{}\n');
    await assert.rejects(
      () => writeItemGroupReadinessReport({ repoRoot }),
      /compatibility export.*hash mismatch/i,
    );

    const publication = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    publication.writesDatabase = true;
    fs.writeFileSync(inputPath, JSON.stringify(publication));
    await assert.rejects(() => writeItemGroupReadinessReport({ repoRoot }), /read-only compatibility publication/i);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});
