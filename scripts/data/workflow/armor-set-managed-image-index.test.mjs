import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import {
  buildArmorSetManagedImageIndex,
  applyManagedArmorSetImageUrls,
  mergeWikiArmorSetSourceImages,
  parseArgs,
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

test('mergeWikiArmorSetSourceImages adds missing wear image rows from generated armor set source', () => {
  const payload = {
    armorSetImages: [
      {
        textKey: 'ArmorSetBonus.Solar',
        pageTitle: 'Solar armor',
        imageRole: 'female',
        sourceFileTitle: 'Solar_Flare_armor_female.png',
        originalUrl: 'https://terraria.wiki.gg/images/Solar_Flare_armor_female.png?58b2c1',
        cachedUrl: 'http://localhost:9000/terrapedia-images/items/wiki/armor-sets/38/hash-solar-flare-armor-female-png.png',
        sortOrder: 0,
        isPrimary: false
      }
    ]
  };
  const wikiArmorSets = [
    {
      pageTitle: 'Solar Flare armor',
      sourceRevisionTimestamp: '2026-04-04T07:46:03Z',
      images: [
        {
          fileTitle: 'Solar Flare armor.png',
          url: 'https://terraria.wiki.gg/images/Solar_Flare_armor.png?e503bc',
          width: 34,
          height: 46,
          role: 'male',
          contentType: 'image/png'
        },
        {
          fileTitle: 'Solar Flare armor female.png',
          url: 'https://terraria.wiki.gg/images/Solar_Flare_armor_female.png?58b2c1',
          width: 34,
          height: 46,
          role: 'female',
          contentType: 'image/png'
        }
      ]
    }
  ];
  const index = buildArmorSetManagedImageIndex({
    managedUrls: [
      'http://localhost:9000/terrapedia-images/items/wiki/armor-sets/38/hash-solar-flare-armor.png',
      'http://localhost:9000/terrapedia-images/items/wiki/armor-sets/38/hash-solar-flare-armor-female-png.png'
    ]
  });

  const result = mergeWikiArmorSetSourceImages(payload, wikiArmorSets, index);

  assert.equal(result.added, 1);
  assert.equal(result.existing, 1);
  assert.equal(payload.armorSetImages.length, 2);
  assert.deepEqual(
    payload.armorSetImages.map((row) => [row.pageTitle, row.imageRole, row.sourceFileTitle, row.cachedUrl]),
    [
      [
        'Solar armor',
        'female',
        'Solar_Flare_armor_female.png',
        'http://localhost:9000/terrapedia-images/items/wiki/armor-sets/38/hash-solar-flare-armor-female-png.png'
      ],
      [
        'Solar Flare armor',
        'male',
        'Solar_Flare_armor.png',
        'http://localhost:9000/terrapedia-images/items/wiki/armor-sets/38/hash-solar-flare-armor.png'
      ]
    ]
  );
});

test('parseArgs resolves default wiki armor set source from project root', () => {
  assert.equal(
    parseArgs([]).wikiArmorSetsInput,
    path.join(process.cwd(), 'data', 'generated', 'wiki-armor-sets.latest.json')
  );

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-armor-set-cwd-'));
  const moduleUrl = pathToFileURL(path.join(process.cwd(), 'scripts', 'data', 'workflow', 'armor-set-managed-image-index.mjs')).href;
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { parseArgs } from ${JSON.stringify(moduleUrl)}; console.log(parseArgs([]).wikiArmorSetsInput);`
    ],
    {
      cwd: tempDir,
      encoding: 'utf8'
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(
    result.stdout.trim(),
    path.join(process.cwd(), 'data', 'generated', 'wiki-armor-sets.latest.json')
  );
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
