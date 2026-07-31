import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { buildItemImageLineageBundle } from './generate-item-image-lineage-bundle.mjs';

test('lineage rows carry the source original URL and the managed cached URL', () => {
  const bundle = buildItemImageLineageBundle(lineageInput());

  assert.equal(bundle.datasetType, 'item_image_sources_raw');
  assert.equal(bundle.entity, 'item_image_lineage_bundle');
  assert.deepEqual(bundle.counters, {
    total: 2,
    wikiSourced: 1,
    originalUrlNotRecorded: 1,
    deferredSecondaryRows: 1
  });

  const promoted = bundle.itemImages.find((row) => row.itemInternalName === 'CopperCoin');
  assert.equal(promoted.originalUrl, 'https://terraria.wiki.gg/images/Copper_Coin.png');
  assert.equal(promoted.originalUrlStatus, 'wiki_verified');
  assert.equal(promoted.cachedUrl, 'http://localhost:19100/terrapedia-images/items/coppercoin.png');
  assert.equal(promoted.role, 'icon');
  assert.equal(promoted.provider, 'terraria.wiki.gg');
  assert.equal(promoted.isPrimary, true);
  assert.equal(promoted.sortOrder, 0);

  // An item whose standardized image was already managed has no recorded wiki
  // original. Writing the managed URL into both columns is the exact defect this
  // lane replaces, so the original stays null and is labelled.
  const existing = bundle.itemImages.find((row) => row.itemInternalName === 'Torch');
  assert.equal(existing.originalUrl, null);
  assert.equal(existing.originalUrlStatus, 'not_recorded');
  assert.equal(existing.cachedUrl, 'http://localhost:19100/terrapedia-images/items/torch.png');

  assert.deepEqual(bundle.deferredSecondaryRows, [{
    itemId: 71,
    itemInternalName: 'CopperCoin',
    itemName: 'Copper Coin',
    sourceFileTitle: 'Copper Coin.gif',
    originalUrl: 'https://terraria.wiki.gg/images/Copper_Coin.gif',
    sortOrder: 1,
    reason: 'no_managed_image'
  }]);

  assert.equal(bundle.descriptor.promotionResult.sha256, sha256('promotion-result'));
  assert.equal(bundle.descriptor.imageSyncResult.sha256, sha256('image-sync-result'));
  assert.equal(bundle.descriptor.promotionBundle.generationId, 'a'.repeat(64));
});

test('a managed URL stored as an origin-free path is accepted', () => {
  // Image sync stores the path the backend returns, not the probe origin, so
  // 5,800 of the 6,131 real managed URLs have no host at all. A cached-URL gate
  // that only understands absolute URLs rejects the entire lane.
  const input = lineageInput();
  const sync = JSON.parse(input.imageSyncResultBytes);
  for (const entry of sync.managedImages) {
    entry.managedUrl = new URL(entry.managedUrl).pathname;
  }
  input.imageSyncResultBytes = JSON.stringify(sync);

  const bundle = buildItemImageLineageBundle(input);

  assert.equal(bundle.counters.total, 2);
  assert.equal(
    bundle.itemImages.find((row) => row.itemInternalName === 'CopperCoin').cachedUrl,
    '/terrapedia-images/items/coppercoin.png'
  );
});

test('a managed path presented as a source original is rejected', () => {
  const input = lineageInput();
  const promotion = JSON.parse(input.promotionBundleBytes);
  promotion.rows.find((row) => row.itemInternalName === 'CopperCoin').source.originalUrl =
    '/terrapedia-images/items/coppercoin.png';
  input.promotionBundleBytes = JSON.stringify(promotion);

  assert.throws(() => buildItemImageLineageBundle(input), /source original URL is managed/i);
});

test('a path outside managed storage is rejected as a cached URL', () => {
  const input = lineageInput();
  const sync = JSON.parse(input.imageSyncResultBytes);
  sync.managedImages.find((entry) => entry.key === 'CopperCoin').managedUrl =
    '/uploads/items/coppercoin.png';
  input.imageSyncResultBytes = JSON.stringify(sync);

  assert.throws(() => buildItemImageLineageBundle(input), /cached URL is not managed/i);
});

test('a missing managed row is rejected', () => {
  const input = lineageInput();
  const sync = JSON.parse(input.imageSyncResultBytes);
  sync.managedImages = sync.managedImages.filter((entry) => entry.key !== 'Torch');
  input.imageSyncResultBytes = JSON.stringify(sync);
  input.imageSyncResultSha256 = sha256('image-sync-result');

  assert.throws(() => buildItemImageLineageBundle(input), /missing managed image for Torch/i);
});

test('a managed URL presented as a source original is rejected', () => {
  const input = lineageInput();
  const promotion = JSON.parse(input.promotionBundleBytes);
  promotion.rows.find((row) => row.itemInternalName === 'CopperCoin').source.originalUrl =
    'http://localhost:19100/terrapedia-images/items/coppercoin.png';
  input.promotionBundleBytes = JSON.stringify(promotion);

  assert.throws(() => buildItemImageLineageBundle(input), /source original URL is managed/i);
});

test('a cached URL outside managed storage is rejected', () => {
  const input = lineageInput();
  const sync = JSON.parse(input.imageSyncResultBytes);
  sync.managedImages.find((entry) => entry.key === 'CopperCoin').managedUrl =
    'https://terraria.wiki.gg/images/Copper_Coin.png';
  input.imageSyncResultBytes = JSON.stringify(sync);

  assert.throws(() => buildItemImageLineageBundle(input), /cached URL is not managed/i);
});

test('a broad relation bundle dataset type is rejected for this lane', () => {
  assert.throws(
    () => buildItemImageLineageBundle({ ...lineageInput(), datasetType: 'item_relations_bundle_raw' }),
    /dataset type must be item_image_sources_raw/i
  );
});

test('an incomplete promotion bundle is rejected', () => {
  const input = lineageInput();
  const promotion = JSON.parse(input.promotionBundleBytes);
  promotion.counters.ambiguous = 1;
  input.promotionBundleBytes = JSON.stringify(promotion);

  assert.throws(() => buildItemImageLineageBundle(input), /promotion bundle counters must be closed/i);
});

test('a failed image sync result is rejected', () => {
  const input = lineageInput();
  const sync = JSON.parse(input.imageSyncResultBytes);
  sync.status = 'failed';
  input.imageSyncResultBytes = JSON.stringify(sync);

  assert.throws(() => buildItemImageLineageBundle(input), /completed image sync result is required/i);
});

function lineageInput() {
  const promotionBundle = {
    schemaVersion: 1,
    entity: 'item_image_source_promotion_bundle',
    generationId: 'a'.repeat(64),
    counters: { total: 2, existing: 1, promoted: 1, unresolved: 0, ambiguous: 0, duplicate: 0, conflict: 0 },
    rows: [
      {
        itemId: 8,
        itemInternalName: 'Torch',
        itemName: 'Torch',
        status: 'existing',
        source: {
          authority: 'standardized_existing',
          fileTitle: 'Torch.png',
          originalUrl: '/terrapedia-images/items/2026/07/29/torch.png',
          width: 16,
          height: 16,
          contentType: 'image/png'
        }
      },
      {
        itemId: 71,
        itemInternalName: 'CopperCoin',
        itemName: 'Copper Coin',
        status: 'promoted',
        source: {
          authority: 'raw_wiki_evidence',
          evidenceKind: 'mediawiki_exact_file',
          fileTitle: 'Copper Coin.png',
          sourcePage: 'Coins',
          sourceRevisionTimestamp: '2026-07-29T12:18:22Z',
          originalUrl: 'https://terraria.wiki.gg/images/Copper_Coin.png',
          width: 12,
          height: 12,
          contentType: 'image/png'
        },
        secondarySources: [{
          authority: 'raw_wiki_evidence',
          fileTitle: 'Copper Coin.gif',
          originalUrl: 'https://terraria.wiki.gg/images/Copper_Coin.gif',
          contentType: 'image/gif',
          sortOrder: 1
        }]
      }
    ]
  };
  return {
    promotionBundleBytes: JSON.stringify(promotionBundle),
    promotionResultBytes: JSON.stringify({
      resultKind: 'canonical_item_image_source_promotion_result',
      status: 'COMPLETED',
      bundle: { sha256: sha256('promotion-bundle-file') },
      after: { sha256: sha256('standardized-after') }
    }),
    promotionResultSha256: sha256('promotion-result'),
    imageSyncResultBytes: JSON.stringify({
      status: 'completed',
      apply: true,
      managedUrlPrefixes: ['http://localhost:19100/terrapedia-images/'],
      managedImages: [
        {
          key: 'Torch',
          originalUrl: null,
          managedUrl: 'http://localhost:19100/terrapedia-images/items/torch.png'
        },
        {
          key: 'CopperCoin',
          originalUrl: 'https://terraria.wiki.gg/images/Copper_Coin.png',
          managedUrl: 'http://localhost:19100/terrapedia-images/items/coppercoin.png'
        }
      ]
    }),
    imageSyncResultSha256: sha256('image-sync-result'),
    generatedAt: '2026-08-01T00:00:00.000Z'
  };
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
