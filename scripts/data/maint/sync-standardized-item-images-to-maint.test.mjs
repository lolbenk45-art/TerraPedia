import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMaintItemImageRows } from './sync-standardized-item-images-to-maint.mjs';

test('buildMaintItemImageRows creates maint_item_images rows only for missing item images', () => {
  const rows = buildMaintItemImageRows({
    standardizedItems: [
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
      {
        id: 3,
        internalName: 'NoImageItem',
        name: 'No Image Item',
      },
    ],
    existingMaintImages: [
      { item_internal_name: 'IronPickaxe' },
    ],
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].itemInternalName, 'Torch');
  assert.equal(rows[0].itemName, 'Torch');
  assert.equal(rows[0].sourceFileTitle, 'Torch.png');
  assert.equal(rows[0].originalUrl, 'https://terraria.wiki.gg/images/Torch.png');
  assert.equal(rows[0].cachedUrl, 'https://terraria.wiki.gg/images/Torch.png');
  assert.equal(rows[0].width, 16);
  assert.equal(rows[0].height, 24);
  assert.equal(rows[0].contentType, 'image/png');
  assert.equal(rows[0].isPrimary, 1);
  assert.equal(rows[0].sortOrder, 0);
  assert.equal(rows[0].sourceProvider, 'standardized');
  assert.equal(rows[0].sourcePage, 'items.standardized.json');
  assert.equal(rows[0].landingSourceId, 0);
  assert.equal(rows[0].landingSourceKey, 'standardized.items');
  assert.match(rows[0].recordKey, /^[a-f0-9]{64}$/);
});
