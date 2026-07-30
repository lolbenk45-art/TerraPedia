import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { buildItemImageSourcePromotionArtifacts } from './generate-item-image-source-promotion.mjs';

test('buildItemImageSourcePromotionArtifacts closes a valid miniature identity set', () => {
  const input = promotionInput();

  const artifacts = buildItemImageSourcePromotionArtifacts(input);

  assert.deepEqual(artifacts.review.counters, {
    total: 2,
    existing: 1,
    promoted: 1,
    unresolved: 0,
    ambiguous: 0,
    duplicate: 0,
    conflict: 0
  });
  assert.ok(artifacts.bundle);
  assert.match(artifacts.bundle.generationId, /^[a-f0-9]{64}$/);
  assert.match(artifacts.bundle.bundlePayloadSha256, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(artifacts.bundle.rows.map((row) => row.itemId), [3, 20]);
  assert.equal(artifacts.bundle.rows[0].source.authority, 'standardized_existing');
  assert.equal(artifacts.bundle.rows[1].source.authority, 'raw_wiki_evidence');
});

test('buildItemImageSourcePromotionArtifacts rejects duplicate standardized identities', () => {
  const input = promotionInput();
  const payload = JSON.parse(String(input.standardizedBytes));
  payload.records.push({ ...payload.records[1], id: 21 });
  input.standardizedBytes = JSON.stringify(payload);

  assert.throws(
    () => buildItemImageSourcePromotionArtifacts(input),
    /duplicate standardized item identity/i
  );
});

test('buildItemImageSourcePromotionArtifacts rejects changed standardized bytes', () => {
  const input = promotionInput();
  const payload = JSON.parse(String(input.standardizedBytes));
  payload.records[0].name = 'Changed Torch';
  input.standardizedBytes = JSON.stringify(payload);

  assert.throws(
    () => buildItemImageSourcePromotionArtifacts(input),
    /standardized SHA-256 mismatch/i
  );
});

test('buildItemImageSourcePromotionArtifacts rejects changed raw evidence bytes', () => {
  const input = promotionInput();
  input.rawEvidenceBytesByFile.set('wrench.latest.json', '{"changed":true}');

  assert.throws(
    () => buildItemImageSourcePromotionArtifacts(input),
    /raw evidence SHA-256 mismatch/i
  );
});

test('buildItemImageSourcePromotionArtifacts keeps ambiguous evidence review-only', () => {
  const input = promotionInput({ classification: 'ambiguous' });

  const artifacts = buildItemImageSourcePromotionArtifacts(input);

  assert.equal(artifacts.review.counters.ambiguous, 1);
  assert.equal(artifacts.review.counters.unresolved, 0);
  assert.equal(artifacts.bundle, null);
});

test('buildItemImageSourcePromotionArtifacts keeps a missing source review-only', () => {
  const input = promotionInput({ includeRecord: false });

  const artifacts = buildItemImageSourcePromotionArtifacts(input);

  assert.equal(artifacts.review.counters.unresolved, 1);
  assert.equal(artifacts.bundle, null);
});

test('buildItemImageSourcePromotionArtifacts keeps duplicate candidates review-only', () => {
  const input = promotionInput({ duplicateCandidate: true });

  const artifacts = buildItemImageSourcePromotionArtifacts(input);

  assert.equal(artifacts.review.counters.duplicate, 1);
  assert.equal(artifacts.bundle, null);
});

function promotionInput({
  classification = 'raw_verified',
  includeRecord = true,
  duplicateCandidate = false
} = {}) {
  const standardizedPayload = {
    schemaVersion: '1.0.0',
    records: [
      {
        id: 3,
        internalName: 'Torch',
        name: 'Torch',
        imageFileTitle: 'Torch.png',
        imageUrl: 'https://terraria.wiki.gg/images/Torch.png',
        imageWidth: 16,
        imageHeight: 16,
        imageContentType: 'image/png'
      },
      {
        id: 20,
        internalName: 'Wrench',
        name: 'Red Wrench',
        imageFileTitle: null,
        imageUrl: null,
        imageWidth: null,
        imageHeight: null,
        imageContentType: null
      }
    ]
  };
  const standardizedBytes = JSON.stringify(standardizedPayload);
  const itemPagesBytes = JSON.stringify({
    schemaVersion: '1.0.0',
    records: [{ itemInternalName: 'Wrench', sourceFile: 'wrench.latest.json' }]
  });
  const rawBytes = JSON.stringify({
    itemInternalName: 'Wrench',
    pageTitle: 'Wrenches',
    pageId: 88,
    revisionTimestamp: '2026-07-30T00:00:00.000Z'
  });
  const source = {
    authority: 'raw_wiki_evidence',
    evidenceKind: 'table_row',
    blockOrdinal: 1,
    anchorTitle: 'Red Wrench',
    rawSourceFile: 'wrench.latest.json',
    rawFileSha256: sha256(rawBytes),
    pageId: 88,
    sourcePage: 'Wrenches',
    sourceRevisionTimestamp: '2026-07-30T00:00:00.000Z',
    fileTitle: 'Red Wrench.png',
    originalUrl: 'https://terraria.wiki.gg/images/Red_Wrench.png',
    width: 16,
    height: 16,
    contentType: 'image/png'
  };
  const record = {
    itemId: 20,
    itemInternalName: 'Wrench',
    itemName: 'Red Wrench',
    classification,
    source: classification === 'raw_verified' ? source : null,
    comparison: {
      local: { status: 'missing' },
      lineage: { status: 'missing' }
    }
  };
  const records = includeRecord ? [record] : [];
  if (duplicateCandidate) records.push(structuredClone(record));
  const candidateReport = {
    schemaVersion: '2.0.0',
    entity: 'item_image_source_candidates',
    generatedAt: '2026-07-30T01:00:00.000Z',
    inputs: {
      items: { path: 'data/standardized/items.standardized.json', sha256: sha256(standardizedBytes) },
      itemPages: { path: 'data/standardized/item_pages.standardized.json', sha256: sha256(itemPagesBytes) },
      identitySetSha256: identitySetSha256(standardizedPayload.records),
      rawFiles: [{ path: 'wrench.latest.json', sha256: sha256(rawBytes) }]
    },
    records,
    candidates: records.filter((entry) => entry.classification === 'raw_verified')
  };

  return {
    standardizedBytes,
    itemPagesBytes,
    candidateReportBytes: JSON.stringify(candidateReport),
    verificationReportBytes: null,
    rawEvidenceBytesByFile: new Map([['wrench.latest.json', rawBytes]]),
    producerCodeSha256: sha256('producer-code')
  };
}

function identitySetSha256(records) {
  return sha256Canonical(records.map((record) => ({
    itemId: record.id,
    itemInternalName: record.internalName,
    itemName: record.name
  })).sort((left, right) => Number(left.itemId) - Number(right.itemId)));
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function sha256Canonical(value) {
  return sha256(canonicalJson(value));
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  )).join(',')}}`;
}
