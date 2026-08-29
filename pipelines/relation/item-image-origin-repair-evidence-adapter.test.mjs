import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  buildItemImageOriginRepairEvidence,
} from './item-image-origin-repair-evidence-adapter.mjs';

const PREFIXES = ['http://localhost:19000/terrapedia-images/items/'];

test('origin-repair evidence binds the exact identity, relation-key, and projection-before sets', () => {
  const resultBytes = Buffer.from(JSON.stringify({
    generatedAt: '2026-08-21T18:56:26.133Z',
    operationId: 'canonical-item-image-origin-repair',
    scopeHash: 'sha256:' + 'a'.repeat(64),
    relationBefore: 331,
    projectionBefore: 331,
    excluded: ['FallenStar', 'SeveredHandBanner'],
    databaseWrites: true,
    externalRequests: false,
    status: 'COMPLETED',
    relationUpdated: 331,
    projectionUpdated: 331,
  }));
  const evidence = buildItemImageOriginRepairEvidence({
    originRepairResultPath: 'reports/runtime/item-image-origin-repair.result.json',
    originRepairResultBytes: resultBytes,
    keys: ['DirtBlock', 'Wood'],
    relationRows: [
      { recordKey: 'r-dirt', internalName: 'DirtBlock', cachedUrl: '/terrapedia-images/items/dirt.png', beforeHash: 'sha256:' + 'b'.repeat(64) },
      { recordKey: 'r-wood', internalName: 'Wood', cachedUrl: '/terrapedia-images/items/wood.png', beforeHash: 'sha256:' + 'c'.repeat(64) },
    ],
    projectionBeforeRows: [
      { id: 1, relationRecordKey: 'r-dirt', internalName: 'DirtBlock', image: '/terrapedia-images/items/dirt.png', beforeHash: 'sha256:' + 'd'.repeat(64) },
      { id: 2, relationRecordKey: 'r-wood', internalName: 'Wood', image: '/terrapedia-images/items/wood.png', beforeHash: 'sha256:' + 'e'.repeat(64) },
    ],
    managedUrlPrefixes: PREFIXES,
    quarantineIdentities: ['FallenStar', 'SeveredHandBanner'],
    expectedRelationBeforeHashes: { DirtBlock: 'sha256:' + 'b'.repeat(64), Wood: 'sha256:' + 'c'.repeat(64) },
    expectedRelationRecordKeys: { DirtBlock: 'r-dirt', Wood: 'r-wood' },
    expectedProjectionBeforeHashes: { DirtBlock: 'sha256:' + 'd'.repeat(64), Wood: 'sha256:' + 'e'.repeat(64) },
    expectedProjectionRelationRecordKeys: { DirtBlock: 'r-dirt', Wood: 'r-wood' },
  });

  assert.equal(evidence.kind, 'origin-repair-bound');
  assert.equal(evidence.originRepairResultPath, 'reports/runtime/item-image-origin-repair.result.json');
  assert.equal(evidence.originRepairResultSha256, sha(resultBytes));
  assert.deepEqual(evidence.keys, ['DirtBlock', 'Wood']);
  assert.equal(evidence.targetRowCount, 2);
  assert.equal(evidence.externalRequests, false);
  assert.equal(evidence.freshnessUpdates, false);
});

test('origin-repair evidence rejects identity, relation key, before-hash, quarantine, and URL drift', () => {
  const base = fixture();
  for (const [name, change, pattern] of [
    ['identity', { keys: ['DirtBlock', 'StoneBlock'] }, /identity|key set/i],
    ['relation key', { relationRows: base.relationRows.map((row, i) => i === 0 ? { ...row, recordKey: 'changed' } : row) }, /record key|relation/i],
    ['before hash', { projectionBeforeRows: base.projectionBeforeRows.map((row, i) => i === 0 ? { ...row, beforeHash: 'sha256:' + 'f'.repeat(64) } : row) }, /before.*hash|projection/i],
    ['quarantine omission', { quarantineIdentities: ['FallenStar'] }, /quarantine|excluded/i],
    ['unmanaged URL', { relationRows: base.relationRows.map((row, i) => i === 0 ? { ...row, cachedUrl: 'https://evil.example/items/dirt.png' } : row) }, /managed|prefix/i],
  ]) {
    assert.throws(() => buildItemImageOriginRepairEvidence({ ...base, ...change }), pattern, name);
  }
});

function fixture() {
  const originRepairResultBytes = Buffer.from(JSON.stringify({
    generatedAt: '2026-08-21T18:56:26.133Z',
    operationId: 'canonical-item-image-origin-repair',
    scopeHash: 'sha256:' + 'a'.repeat(64),
    relationBefore: 331,
    projectionBefore: 331,
    excluded: ['FallenStar', 'SeveredHandBanner'],
    databaseWrites: true,
    externalRequests: false,
    status: 'COMPLETED',
    relationUpdated: 331,
    projectionUpdated: 331,
  }));
  return {
    originRepairResultPath: 'reports/runtime/item-image-origin-repair.result.json',
    originRepairResultBytes,
    keys: ['DirtBlock', 'Wood'],
    relationRows: [
      { recordKey: 'r-dirt', internalName: 'DirtBlock', cachedUrl: '/terrapedia-images/items/dirt.png', beforeHash: 'sha256:' + 'b'.repeat(64) },
      { recordKey: 'r-wood', internalName: 'Wood', cachedUrl: '/terrapedia-images/items/wood.png', beforeHash: 'sha256:' + 'c'.repeat(64) },
    ],
    projectionBeforeRows: [
      { id: 1, relationRecordKey: 'r-dirt', internalName: 'DirtBlock', image: '/terrapedia-images/items/dirt.png', beforeHash: 'sha256:' + 'd'.repeat(64) },
      { id: 2, relationRecordKey: 'r-wood', internalName: 'Wood', image: '/terrapedia-images/items/wood.png', beforeHash: 'sha256:' + 'e'.repeat(64) },
    ],
    managedUrlPrefixes: PREFIXES,
    quarantineIdentities: ['FallenStar', 'SeveredHandBanner'],
    expectedRelationBeforeHashes: { DirtBlock: 'sha256:' + 'b'.repeat(64), Wood: 'sha256:' + 'c'.repeat(64) },
    expectedRelationRecordKeys: { DirtBlock: 'r-dirt', Wood: 'r-wood' },
    expectedProjectionBeforeHashes: { DirtBlock: 'sha256:' + 'd'.repeat(64), Wood: 'sha256:' + 'e'.repeat(64) },
    expectedProjectionRelationRecordKeys: { DirtBlock: 'r-dirt', Wood: 'r-wood' },
  };
}

function sha(bytes) {
  return 'sha256:' + createHash('sha256').update(bytes).digest('hex');
}
