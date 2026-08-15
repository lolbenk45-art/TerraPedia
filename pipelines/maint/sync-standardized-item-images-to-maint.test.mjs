import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMaintItemImageRows } from './sync-standardized-item-images-to-maint.mjs';

const landingRecord = {
  id: 4711,
  sourceKey: 'item-image-lineage',
  sourcePage: 'item-image-lineage-bundle',
  contentHash: 'c'.repeat(64),
  fetchedAt: '2026-08-01T00:00:00.000Z',
  parsedAt: '2026-08-01T00:00:00.000Z',
};

const managedResult = {
  status: 'completed',
  managedImages: [
    { key: 'Torch', managedUrl: 'http://localhost:19100/terrapedia-images/items/torch.png' },
    { key: 'IronPickaxe', managedUrl: 'http://localhost:19100/terrapedia-images/items/ironpickaxe.png' },
  ],
};

test('buildMaintItemImageRows builds rows only for missing item images', () => {
  const rows = buildMaintItemImageRows({
    standardizedItems: standardizedItems(),
    existingMaintImages: [{ item_internal_name: 'IronPickaxe' }],
    landingRecord,
    managedResult,
  });

  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.itemInternalName, 'Torch');
  assert.equal(row.sourceFileTitle, 'Torch.png');
  assert.equal(row.originalUrl, 'https://terraria.wiki.gg/images/Torch.png');
  // The cached URL comes from the managed result, never from the standardized
  // image URL, so the two columns can never repeat one value.
  assert.equal(row.cachedUrl, 'http://localhost:19100/terrapedia-images/items/torch.png');
  assert.notEqual(row.originalUrl, row.cachedUrl);
  assert.equal(row.landingSourceId, 4711);
  assert.equal(row.landingSourceKey, 'item-image-lineage');
  assert.equal(row.landingContentHash, 'c'.repeat(64));
  assert.equal(row.isPrimary, 1);
  assert.equal(row.sortOrder, 0);
  assert.match(row.recordKey, /^[a-f0-9]{64}$/);
});

test('buildMaintItemImageRows refuses a fabricated landing lineage', () => {
  assert.throws(
    () => buildMaintItemImageRows({
      standardizedItems: standardizedItems(),
      existingMaintImages: [],
      landingRecord: { ...landingRecord, id: 0 },
      managedResult,
    }),
    /landing id/i
  );
});

test('buildMaintItemImageRows requires a supplied landing record and managed result', () => {
  assert.throws(
    () => buildMaintItemImageRows({ standardizedItems: standardizedItems(), existingMaintImages: [] }),
    /landing record is required/i
  );
  assert.throws(
    () => buildMaintItemImageRows({
      standardizedItems: standardizedItems(),
      existingMaintImages: [],
      landingRecord,
    }),
    /managed image result is required/i
  );
});

test('buildMaintItemImageRows refuses an item with no managed image', () => {
  assert.throws(
    () => buildMaintItemImageRows({
      standardizedItems: standardizedItems(),
      existingMaintImages: [{ item_internal_name: 'IronPickaxe' }],
      landingRecord,
      managedResult: { status: 'completed', managedImages: [] },
    }),
    /missing managed image for Torch/i
  );
});

function standardizedItems() {
  return [
    {
      id: 1,
      internalName: 'Torch',
      name: 'Torch',
      imageFileTitle: 'Torch.png',
      imageUrl: 'https://terraria.wiki.gg/images/Torch.png',
      imageWidth: 16,
      imageHeight: 24,
      imageContentType: 'image/png',
    },
    {
      id: 2,
      internalName: 'IronPickaxe',
      name: 'Iron Pickaxe',
      imageFileTitle: 'Iron Pickaxe.png',
      imageUrl: 'https://terraria.wiki.gg/images/Iron_Pickaxe.png',
      imageWidth: 32,
      imageHeight: 32,
      imageContentType: 'image/png',
    },
    { id: 3, internalName: 'NoImageItem', name: 'No Image Item' },
  ];
}
