import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  buildReconstructedItemImageSourceVerificationReport
} from './rebuild-item-image-source-verification-report.mjs';

test('reconstructs superseded verification records and merges the later round', () => {
  const report = buildReconstructedItemImageSourceVerificationReport({
    promotionReviewBytes: JSON.stringify(promotionReview()),
    roundReportBytes: JSON.stringify(roundReport()),
    generatedAt: '2026-08-01T00:00:00.000Z'
  });

  assert.equal(report.schemaVersion, '1.0.0');
  assert.equal(report.entity, 'item_image_source_verification');
  assert.deepEqual(report.summary, {
    total: 2,
    verified: 2,
    ambiguous: 0,
    unresolved: 0,
    failed: 0,
    requestCount: 1
  });
  assert.deepEqual(report.records.map((record) => record.itemInternalName), ['Wrench', 'CopperCoin']);

  const reconstructed = report.records.find((record) => record.itemInternalName === 'Wrench');
  assert.equal(reconstructed.classification, 'verified');
  assert.equal(reconstructed.source.fileTitle, 'Red Wrench.png');
  assert.equal(reconstructed.responseSha256, reconstructed.source.verificationResponseSha256);
  assert.deepEqual(reconstructed.comparison, { local: { status: 'missing' }, lineage: { status: 'missing' } });

  const carried = report.records.find((record) => record.itemInternalName === 'CopperCoin');
  assert.deepEqual(carried.secondarySources.map((source) => source.fileTitle), ['Copper Coin.gif']);

  assert.deepEqual(report.inputs.rawFiles, [
    { path: 'coppercoin.latest.json', sha256: sha256('coin-raw') },
    { path: 'wrench.latest.json', sha256: sha256('wrench-raw') }
  ]);
  assert.equal(report.reconstruction.method, 'promotion_review_evidence_replay');
  assert.equal(report.reconstruction.reconstructedRecordCount, 1);
  assert.equal(report.reconstruction.roundRecordCount, 1);
});

test('ignores promotion review rows that never came from a verification round', () => {
  const review = promotionReview();
  review.rows.push({
    itemId: 40,
    itemInternalName: 'Torch',
    itemName: 'Torch',
    status: 'promoted',
    // Candidate-derived evidence carries no verification response hash.
    source: { ...wrenchSource(), evidenceKind: 'table_row', verificationResponseSha256: undefined },
    comparison: null
  });

  const report = buildReconstructedItemImageSourceVerificationReport({
    promotionReviewBytes: JSON.stringify(review),
    roundReportBytes: JSON.stringify(roundReport()),
    generatedAt: '2026-08-01T00:00:00.000Z'
  });

  assert.deepEqual(report.records.map((record) => record.itemInternalName), ['Wrench', 'CopperCoin']);
});

test('refuses to reconstruct an identity the later round already re-verified', () => {
  const review = promotionReview();
  review.rows.push({
    itemId: 71,
    itemInternalName: 'CopperCoin',
    itemName: 'Copper Coin',
    status: 'promoted',
    source: { ...wrenchSource(), fileTitle: 'Copper Coin.gif' },
    comparison: null
  });

  assert.throws(
    () => buildReconstructedItemImageSourceVerificationReport({
      promotionReviewBytes: JSON.stringify(review),
      roundReportBytes: JSON.stringify(roundReport()),
      generatedAt: '2026-08-01T00:00:00.000Z'
    }),
    /duplicate reconstructed identity CopperCoin/i
  );
});

test('refuses conflicting raw evidence hashes for one raw file', () => {
  const review = promotionReview();
  review.rows.push({
    itemId: 41,
    itemInternalName: 'BlueWrench',
    itemName: 'Blue Wrench',
    status: 'promoted',
    source: { ...wrenchSource(), rawFileSha256: sha256('other-bytes') },
    comparison: null
  });

  assert.throws(
    () => buildReconstructedItemImageSourceVerificationReport({
      promotionReviewBytes: JSON.stringify(review),
      roundReportBytes: JSON.stringify(roundReport()),
      generatedAt: '2026-08-01T00:00:00.000Z'
    }),
    /conflicting raw evidence descriptor for wrench\.latest\.json/i
  );
});

function promotionReview() {
  return {
    schemaVersion: 1,
    entity: 'item_image_source_promotion_review',
    generatedAt: '2026-07-31T20:00:00.000Z',
    descriptor: {
      candidateReport: { sha256: sha256('candidate-report') },
      verificationReport: { sha256: sha256('lost-round-report') }
    },
    counters: { total: 2, existing: 0, promoted: 1, unresolved: 0, ambiguous: 1, duplicate: 0, conflict: 0 },
    rows: [
      {
        itemId: 20,
        itemInternalName: 'Wrench',
        itemName: 'Red Wrench',
        status: 'promoted',
        source: wrenchSource(),
        comparison: { local: { status: 'missing' }, lineage: { status: 'missing' } }
      },
      {
        itemId: 71,
        itemInternalName: 'CopperCoin',
        itemName: 'Copper Coin',
        status: 'ambiguous',
        source: null,
        comparison: null
      }
    ]
  };
}

function wrenchSource() {
  return {
    authority: 'raw_wiki_evidence',
    evidenceKind: 'mediawiki_exact_file',
    blockOrdinal: 1,
    anchorTitle: 'Red Wrench',
    rawSourceFile: 'wrench.latest.json',
    rawFileSha256: sha256('wrench-raw'),
    pageId: 88,
    requestedPageTitle: 'Red Wrench',
    sourcePage: 'Wrenches',
    sourceRevisionTimestamp: '2026-07-30T00:00:00.000Z',
    frozenSourceRevisionTimestamp: '2026-07-29T00:00:00.000Z',
    revisionDrifted: true,
    fileTitle: 'Red Wrench.png',
    originalUrl: 'https://terraria.wiki.gg/images/Red_Wrench.png',
    width: 16,
    height: 16,
    contentType: 'image/png',
    verificationResponseSha256: sha256('wrench-response')
  };
}

function roundReport() {
  const source = {
    ...wrenchSource(),
    anchorTitle: 'Copper Coin',
    rawSourceFile: 'coppercoin.latest.json',
    rawFileSha256: sha256('coin-raw'),
    fileTitle: 'Copper Coin.png',
    originalUrl: 'https://terraria.wiki.gg/images/Copper_Coin.png',
    verificationResponseSha256: sha256('coin-response')
  };
  return {
    schemaVersion: '1.0.0',
    entity: 'item_image_source_verification',
    generatedAt: '2026-08-01T00:00:00.000Z',
    inputs: {
      verificationInput: { path: 'reports/authorization/canonical/round-04.input.json', sha256: sha256('round-04-input') },
      candidateReport: { path: 'reports/audit/candidates.json', sha256: sha256('candidate-report') },
      rawFiles: [{ path: 'coppercoin.latest.json', sha256: sha256('coin-raw') }]
    },
    constraints: { batchSize: 8, maxRequests: 1 },
    summary: { total: 1, verified: 1, ambiguous: 0, unresolved: 0, failed: 0, requestCount: 1 },
    records: [{
      itemId: 71,
      itemInternalName: 'CopperCoin',
      itemName: 'Copper Coin',
      classification: 'verified',
      source,
      secondarySources: [{
        ...source,
        fileTitle: 'Copper Coin.gif',
        originalUrl: 'https://terraria.wiki.gg/images/Copper_Coin.gif',
        contentType: 'image/gif',
        sortOrder: 1
      }],
      comparison: null,
      responseSha256: sha256('coin-response')
    }]
  };
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
