import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

const evidenceModule = await import('./item-image-origin-normalization-evidence.mjs').catch(() => ({}));

test('builds read-only Item image evidence bound to the completed origin normalization', () => {
  assert.equal(typeof evidenceModule.buildItemImageOriginNormalizationEvidence, 'function');
  const fixture = buildFixture();
  const evidence = evidenceModule.buildItemImageOriginNormalizationEvidence(fixture);

  assert.equal(evidence.evidenceKind, 'canonical_item_image_origin_normalization_evidence');
  assert.equal(evidence.readOnly, true);
  assert.equal(evidence.databaseWrites, false);
  assert.equal(evidence.externalRequests, false);
  assert.equal(evidence.targetRowCount, 2);
  assert.equal(evidence.projectionRowCount, 3);
  assert.deepEqual(evidence.quarantineIdentities, ['LegacyOnly']);
  assert.match(evidence.evidenceSha256, /^sha256:[a-f0-9]{64}$/);
});

test('rejects stale result, current row, key set, and quarantine evidence', () => {
  assert.equal(typeof evidenceModule.buildItemImageOriginNormalizationEvidence, 'function');
  const fixture = buildFixture();
  for (const [label, change, pattern] of [
    ['result after hash', { result: { ...fixture.result, afterRowsSha256: shaJson([]) } }, /after.*hash|result/i],
    ['relation value', { relationRows: fixture.relationRows.map((row, index) => index === 0 ? { ...row, cachedUrl: '/terrapedia-images/items/drift.png' } : row) }, /relation.*hash|mismatch/i],
    ['projection value', { projectionRows: fixture.projectionRows.map((row, index) => index === 0 ? { ...row, image: '/terrapedia-images/items/drift.png' } : row) }, /projection.*hash|mismatch/i],
    ['quarantine', { proposal: { ...fixture.proposal, quarantine: ['OtherLegacy'] } }, /quarantine|identity|proposal.*binding/i],
  ]) {
    assert.throws(
      () => evidenceModule.buildItemImageOriginNormalizationEvidence({ ...fixture, ...change }),
      pattern,
      label,
    );
  }
});

function buildFixture() {
  const relationRows = [
    { recordKey: 'image-dirt', internalName: 'DirtBlock', cachedUrl: '/terrapedia-images/items/dirt.png' },
    { recordKey: 'image-wood', internalName: 'Wood', cachedUrl: '/terrapedia-images/items/wood.png' },
  ];
  const projectionRows = [
    { id: 1, relationRecordKey: 'item-dirt', internalName: 'DirtBlock', image: '/terrapedia-images/items/dirt.png' },
    { id: 3, relationRecordKey: 'legacy-only', internalName: 'LegacyOnly', image: null },
    { id: 2, relationRecordKey: 'item-wood', internalName: 'Wood', image: '/terrapedia-images/items/wood.png' },
  ];
  const normalizedRelation = relationRows
    .map((row) => ({ identity: row.internalName, image: row.cachedUrl }))
    .sort(compareIdentity);
  const normalizedProjection = projectionRows
    .map((row) => ({ identity: row.internalName, image: row.image }))
    .sort(compareIdentity);
  const proposal = {
    operationId: 'canonical-item-image-origin-normalization',
    scopeSha256: 'sha256:' + 'a'.repeat(64),
    source: { relationRowCount: 2, projectionRowCount: 3 },
    expectedCounts: { relation: 2, projection: 3, quarantine: 1 },
    target: {
      table: 'terria_v1_relation.projection_items',
      valueColumn: 'image',
      writeTargets: [
        'relation.relation_item_images.cached_url',
        'relation.projection_items.image',
      ],
    },
    after: {
      relationRowsSha256: shaJson(normalizedRelation),
      projectionRowsSha256: shaJson(normalizedProjection),
    },
    quarantine: ['LegacyOnly'],
  };
  const proposalBytes = Buffer.from(`${JSON.stringify(proposal, null, 2)}\n`);
  const input = {
    operationId: proposal.operationId,
    proposalSha256: shaBytes(proposalBytes),
    scopeSha256: proposal.scopeSha256,
    afterRowsSha256: proposal.after.projectionRowsSha256,
    expectedAffectedRowCount: 2,
  };
  const result = {
    operationId: proposal.operationId,
    status: 'COMPLETED',
    transactionCommitted: true,
    affectedRows: 2,
    scopeSha256: proposal.scopeSha256,
    afterRowsSha256: proposal.after.projectionRowsSha256,
  };
  return {
    generatedAt: '2026-08-24T10:00:00.000Z',
    serverUuid: '11111111-2222-3333-8444-555555555555',
    resultPath: 'reports/authorization/canonical/item-origin.result.json',
    resultBytes: Buffer.from(`${JSON.stringify(result, null, 2)}\n`),
    result,
    inputPath: 'reports/authorization/canonical/item-origin.input.json',
    inputBytes: Buffer.from(`${JSON.stringify(input, null, 2)}\n`),
    input,
    proposalPath: 'reports/runtime/item-origin.proposal.json',
    proposalBytes,
    proposal,
    relationRows,
    projectionRows,
    managedUrlPrefixes: ['http://localhost:9000/terrapedia-images/items/'],
  };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function shaJson(value) {
  return shaBytes(Buffer.from(JSON.stringify(stableValue(value))));
}

function shaBytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function compareIdentity(left, right) {
  return left.identity.localeCompare(right.identity, 'en');
}
