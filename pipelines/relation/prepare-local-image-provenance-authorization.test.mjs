import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildBuffImageProjectionPreview,
  buildImagePatchInputContract,
  buildItemImageProvenancePreview,
  readCurrentAutomationPolicyRows,
  reconcileFrozenItemProvenanceEvidence,
} from './prepare-local-image-provenance-authorization.mjs';
import {
  BUFF_IMAGE_PROJECTION_OPERATION_ID,
  BUFF_IMAGE_PROJECTION_WRITE_TARGETS,
} from './buff-image-projection-patch.mjs';
import {
  ITEM_IMAGE_PROVENANCE_OPERATION_ID,
  ITEM_IMAGE_PROVENANCE_WRITE_TARGETS,
} from './item-image-provenance-patch.mjs';

const HASH = (char) => `sha256:${char.repeat(64)}`;

function itemScopeRow(name) {
  const url = `https://terraria.wiki.gg/images/${name}.png`;
  const before = { sourcePage: null, sourceRevisionTimestamp: null, originalUrl: null, cachedUrl: `/cache/${name}.png`, landingSourceId: 1, landingSourceKey: 'canonical.item_image_sources', landingContentHash: 'a'.repeat(64) };
  const after = { sourcePage: name, sourceRevisionTimestamp: '2026-08-19T00:00:00Z', originalUrl: url, cachedUrl: before.cachedUrl };
  return {
    itemInternalName: name,
    sourceFileTitle: `${name}.png`,
    sourceProvider: 'terraria.wiki.gg',
    rawEvidence: {
      sourceFile: `${name.toLowerCase()}.latest.json`,
      rawFileSha256: HASH('a'),
      pageId: 42,
      sourcePage: name,
      sourceRevisionTimestamp: '2026-08-19T00:00:00Z',
      originalUrl: url,
    },
    maint: { id: 1, recordKey: 'm', before, after },
    relation: { id: 2, recordKey: 'r', sourceMaintId: 1, before, after },
    local: { itemId: 3, imageId: 4, before, after },
  };
}

function scope() {
  return { schemaVersion: '1.0.0', scopeHash: HASH('s'), scope: { item: { rows: [itemScopeRow('A')], rowCount: 1 }, buff: { rows: [{ internalName: 'BuffA', relation: { id: 1, sourceFileTitle: 'Buff.png', sourceProvider: 'terraria.wiki.gg', cachedUrl: '/buff.png', originalUrl: 'https://wiki/Buff.png' }, projection: { id: 1, beforeImage: null, afterImage: '/buff.png' } }], rowCount: 1 } } };
}

test('operation preview enriches Item rows with exact raw evidence and binds evidence hash', () => {
  const result = buildItemImageProvenancePreview({
    scopePreview: scope(),
    provenanceReport: {
      records: [{ item: { internalName: 'A' }, deterministicUrlVerdict: 'recoverable_from_local_exact_evidence', rawEvidence: { sourceFile: 'a.latest.json', absolutePath: '/tmp/a.latest.json', rawFileSha256: HASH('a'), pageId: 42, sourcePage: 'A', sourceRevisionTimestamp: '2026-08-19T00:00:00Z', originalUrl: 'https://terraria.wiki.gg/images/A.png' } }],
    },
    provenanceReportPath: 'evidence.json',
    provenanceReportSha256: HASH('e'),
    expectedCount: 1,
  });
  assert.equal(result.operationId, ITEM_IMAGE_PROVENANCE_OPERATION_ID);
  assert.equal(result.scope.item.rows[0].rawEvidence.absolutePath, '/tmp/a.latest.json');
  assert.equal(result.evidence.sha256, HASH('e'));
});

test('operation preview normalizes raw provenance report fields before binding Item evidence', () => {
  const result = buildItemImageProvenancePreview({
    scopePreview: scope(),
    provenanceReport: {
      records: [{
        item: { internalName: 'A' },
        deterministicUrlVerdict: 'recoverable_from_local_exact_evidence',
        rawEvidence: {
          sourceFile: 'a.latest.json',
          absolutePath: '/tmp/a.latest.json',
          rawFileSha256: HASH('a'),
          pageId: 42,
          pageTitle: 'A',
          revisionTimestamp: '2026-08-19T00:00:00Z',
          candidates: [{ url: 'https://terraria.wiki.gg/images/A.png' }],
        },
      }],
    },
    provenanceReportPath: 'evidence.json',
    provenanceReportSha256: HASH('e'),
    expectedCount: 1,
  });

  assert.deepEqual(result.scope.item.rows[0].rawEvidence, {
    sourceFile: 'a.latest.json',
    absolutePath: '/tmp/a.latest.json',
    rawFileSha256: HASH('a'),
    pageId: 42,
    pageTitle: 'A',
    revisionTimestamp: '2026-08-19T00:00:00Z',
    sourcePage: 'A',
    sourceRevisionTimestamp: '2026-08-19T00:00:00Z',
    originalUrl: 'https://terraria.wiki.gg/images/A.png',
  });
});

test('frozen Item scope is reconciled against every consumed provenance value before authorization generation', () => {
  const sourceScope = scope();
  sourceScope.scope.item.rows[0].rawEvidence = {
    sourceFile: 'a.latest.json',
    rawFileSha256: HASH('a'),
    pageId: 42,
    sourcePage: 'A',
    sourceRevisionTimestamp: '2026-08-19T00:00:00Z',
    originalUrl: 'https://terraria.wiki.gg/images/A.png',
  };
  const provenanceReport = {
    records: [{
      item: { internalName: 'A' },
      deterministicUrlVerdict: 'recoverable_from_local_exact_evidence',
      rawEvidence: {
        sourceFile: 'a.latest.json',
        absolutePath: '/tmp/a.latest.json',
        rawFileSha256: HASH('a'),
        pageId: 42,
        pageTitle: 'A',
        revisionTimestamp: '2026-08-19T00:00:00Z',
        candidates: [{ url: 'https://terraria.wiki.gg/images/A.png' }],
      },
    }],
  };

  const exact = reconcileFrozenItemProvenanceEvidence({
    scopePreview: sourceScope,
    provenanceReport,
    expectedCount: 1,
  });
  assert.equal(exact.verdict, 'pass');
  assert.equal(exact.consumedIdentityCount, 1);
  assert.equal(exact.missingIdentities.length, 0);
  assert.equal(exact.nonExactVerdicts.length, 0);
  assert.equal(exact.fieldMismatches.length, 0);

  sourceScope.scope.item.rows[0].rawEvidence.originalUrl = 'https://terraria.wiki.gg/images/B.png';
  const drifted = reconcileFrozenItemProvenanceEvidence({
    scopePreview: sourceScope,
    provenanceReport,
    expectedCount: 1,
  });
  assert.equal(drifted.verdict, 'blocked');
  assert.deepEqual(drifted.fieldMismatches, [{
    itemInternalName: 'A',
    field: 'originalUrl',
    frozen: 'https://terraria.wiki.gg/images/B.png',
    current: 'https://terraria.wiki.gg/images/A.png',
  }]);
});

test('operation preview quarantines any residual Item and Buff scope drift', () => {
  const value = scope();
  value.scope.item.rows[0].itemInternalName = 'FallenStar';
  assert.throws(() => buildItemImageProvenancePreview({
    scopePreview: value,
    provenanceReport: { records: [] },
    provenanceReportPath: 'evidence.json',
    provenanceReportSha256: HASH('e'),
    expectedCount: 1,
  }), /quarantine|FallenStar/i);
  const buff = buildBuffImageProjectionPreview({ scopePreview: scope(), evidencePath: 'scope.json', evidenceSha256: HASH('d'), expectedCount: 1 });
  assert.equal(buff.operationId, BUFF_IMAGE_PROJECTION_OPERATION_ID);
  assert.equal(buff.scope.buff.rowCount, 1);
});

test('input contract binds the preview hash and exact write ownership', () => {
  const item = buildImagePatchInputContract({ operationId: ITEM_IMAGE_PROVENANCE_OPERATION_ID, preview: { scopeHash: HASH('i'), evidence: { sha256: HASH('e') } }, previewSha256: HASH('p'), expectedCounts: { maint: 1, relation: 1, local: 1 }, writeTargets: ITEM_IMAGE_PROVENANCE_WRITE_TARGETS });
  assert.equal(item.previewSha256, HASH('p'));
  assert.deepEqual(item.writeTargets, ITEM_IMAGE_PROVENANCE_WRITE_TARGETS);
  const buff = buildImagePatchInputContract({ operationId: BUFF_IMAGE_PROJECTION_OPERATION_ID, preview: { scopeHash: HASH('b'), evidence: { sha256: HASH('e') } }, previewSha256: HASH('p'), expectedCounts: { projection: 1 }, writeTargets: BUFF_IMAGE_PROJECTION_WRITE_TARGETS });
  assert.deepEqual(buff.writeTargets, BUFF_IMAGE_PROJECTION_WRITE_TARGETS);
});

test('authorization preparation binds canonical current automation policy rows', async () => {
  const result = await readCurrentAutomationPolicyRows({
    query: async (sql) => {
      assert.match(sql, /crawler_automation_policy/i);
      return [[
        { domainId: 'buffs', policyVersion: 1, policyHash: HASH('b') },
        { domainId: 'items', policyVersion: 2, policyHash: HASH('a') },
      ]];
    },
  });

  assert.deepEqual(result, [
    { domainId: 'buffs', policyVersion: 1, policyHash: HASH('b') },
    { domainId: 'items', policyVersion: 2, policyHash: HASH('a') },
  ]);
});
