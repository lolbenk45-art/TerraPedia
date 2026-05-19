import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildArmorSetManagedImageIndex,
  applyManagedArmorSetImageUrls,
  listManagedArmorSetUrls
} from './armor-set-managed-image-index.mjs';

test('buildArmorSetManagedImageIndex matches MinIO object names by source file title', () => {
  const index = buildArmorSetManagedImageIndex({
    managedUrls: [
      'http://localhost:9000/terrapedia-images/items/wiki/armor-sets/00/hash-wood-armor.png',
      'http://localhost:9000/terrapedia-images/items/wiki/armor-sets/00/hash-wood-armor-female-png.png'
    ]
  });

  const payload = {
    armorSetImages: [
      {
        pageTitle: 'Wood armor',
        imageRole: 'male',
        sourceFileTitle: 'Wood armor.png',
        originalUrl: 'https://terraria.wiki.gg/images/Wood_armor.png',
        cachedUrl: null
      },
      {
        pageTitle: 'Wood armor',
        imageRole: 'female',
        sourceFileTitle: 'Wood armor female.png',
        originalUrl: 'https://terraria.wiki.gg/images/Wood_armor_female.png',
        cachedUrl: null
      }
    ]
  };

  const result = applyManagedArmorSetImageUrls(payload, index);

  assert.equal(result.updated, 2);
  assert.equal(payload.armorSetImages[0].cachedUrl, 'http://localhost:9000/terrapedia-images/items/wiki/armor-sets/00/hash-wood-armor.png');
  assert.equal(payload.armorSetImages[1].cachedUrl, 'http://localhost:9000/terrapedia-images/items/wiki/armor-sets/00/hash-wood-armor-female-png.png');
});

test('applyManagedArmorSetImageUrls leaves unmatched rows unchanged and reports them', () => {
  const index = buildArmorSetManagedImageIndex({ managedUrls: [] });
  const payload = {
    armorSetImages: [
      {
        pageTitle: 'Missing armor',
        imageRole: 'male',
        sourceFileTitle: 'Missing armor.png',
        originalUrl: 'https://terraria.wiki.gg/images/Missing_armor.png',
        cachedUrl: null
      }
    ]
  };

  const result = applyManagedArmorSetImageUrls(payload, index);

  assert.equal(result.updated, 0);
  assert.equal(result.unmatched.length, 1);
  assert.equal(payload.armorSetImages[0].cachedUrl, null);
});

test('listManagedArmorSetUrls maps MinIO object metadata directories to public object URLs', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-armor-set-minio-'));
  fs.mkdirSync(path.join(tempDir, '44', '44df02faf2317cb8d9ee4e8656d2f1a29e8d1f4c-wood-armor.png'), { recursive: true });
  fs.writeFileSync(path.join(tempDir, '44', '44df02faf2317cb8d9ee4e8656d2f1a29e8d1f4c-wood-armor.png', 'xl.meta'), '');

  const urls = listManagedArmorSetUrls(tempDir);

  assert.deepEqual(urls, [
    'http://localhost:9000/terrapedia-images/items/wiki/armor-sets/44/44df02faf2317cb8d9ee4e8656d2f1a29e8d1f4c-wood-armor.png'
  ]);
});
