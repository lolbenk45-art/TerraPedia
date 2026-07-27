import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ITEM_GROUP_READINESS_SCHEMA_VERSION,
  buildItemGroupReadinessReport,
  validateItemGroupReadinessReport,
} from './item-group-readiness.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;

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
    hashes: { landing: HASH, maint: HASH, relation: HASH, local: HASH },
    shadows: {
      adminItemGroups: { parity: true, snapshotHash: HASH },
      adminRecipeGroups: { parity: true, snapshotHash: HASH },
      recipeTree: { parity: true, snapshotHash: HASH },
    },
    consumerContract: { directJsonReaders: 0, fallbackEnabled: false },
    api: { snapshotHash: HASH },
    exports: [
      { artifact: 'recipe-material-reference.json', fresh: true, snapshotHash: HASH },
      { artifact: 'recipe-group-overrides.json', fresh: true, snapshotHash: HASH },
      { artifact: 'item-group-overrides.json', fresh: true, snapshotHash: HASH },
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
