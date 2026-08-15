import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  buildMaintArmorItemImageRows,
  parseArgs
} from './sync-armor-item-image-evidence-to-maint.mjs';

test('parseArgs parses armor item image evidence maint sync options', () => {
  assert.deepEqual(parseArgs([
    '--apply=true',
    '--evidence=reports/armor.json',
    '--maint-database=terria_v1_maint_custom',
    '--output=reports/out.json'
  ]), {
    apply: true,
    evidencePath: 'reports/armor.json',
    maintDatabase: 'terria_v1_maint_custom',
    output: 'reports/out.json'
  });
});

test('parseArgs keeps safe defaults for armor item image evidence maint sync', () => {
  const actual = parseArgs([]);

  assert.equal(actual.apply, false);
  assert.match(actual.evidencePath, /reports[\\/]armor-item-image-evidence-\d{4}-\d{2}-\d{2}\.json$/);
  assert.equal(actual.maintDatabase, 'terria_v1_maint');
  assert.match(actual.output, /reports[\\/]relation[\\/]armor-item-image-evidence-maint-sync-\d{4}-\d{2}-\d{2}\.json$/);
});

test('buildMaintArmorItemImageRows converts cached evidence into maint_item_images rows', () => {
  const rows = buildMaintArmorItemImageRows({
    evidenceCandidates: [
      {
        id: 89,
        internalName: 'CopperHelmet',
        name: 'Copper Helmet',
        role: 'head',
        pageTitle: 'Copper armor',
        imageFileTitle: 'Copper Helmet.png',
        sourceUrl: 'https://terraria.wiki.gg/images/Copper_Helmet.png?abc123',
        cachedUrl: 'http://localhost:9000/terrapedia-images/items/2026/06/04/copper.png',
        width: 20,
        height: 20,
        contentType: 'image/png'
      },
      {
        internalName: 'IronHelmet',
        name: 'Iron Helmet',
        imageFileTitle: 'Iron Helmet.png',
        sourceUrl: 'https://terraria.wiki.gg/images/Iron_Helmet.png?abc123'
      },
      {
        internalName: 'ExistingHelmet',
        name: 'Existing Helmet',
        imageFileTitle: 'Existing Helmet.png',
        sourceUrl: 'https://terraria.wiki.gg/images/Existing_Helmet.png?abc123',
        cachedUrl: 'http://localhost:9000/terrapedia-images/items/2026/06/04/existing.png'
      }
    ],
    existingMaintImages: [
      { item_internal_name: 'ExistingHelmet' }
    ]
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].itemInternalName, 'CopperHelmet');
  assert.equal(rows[0].itemName, 'Copper Helmet');
  assert.equal(rows[0].role, 'icon');
  assert.equal(rows[0].sourceProvider, 'terraria.wiki.gg');
  assert.equal(rows[0].sourceFileTitle, 'Copper Helmet.png');
  assert.equal(rows[0].sourcePage, 'Copper armor');
  assert.equal(rows[0].originalUrl, 'https://terraria.wiki.gg/images/Copper_Helmet.png?abc123');
  assert.equal(rows[0].cachedUrl, 'http://localhost:9000/terrapedia-images/items/2026/06/04/copper.png');
  assert.equal(rows[0].width, 20);
  assert.equal(rows[0].height, 20);
  assert.equal(rows[0].contentType, 'image/png');
  assert.equal(rows[0].isPrimary, 1);
  assert.equal(rows[0].landingSourceKey, 'armor-item-image-evidence');
  assert.match(rows[0].recordKey, /^[a-f0-9]{64}$/);
  assert.doesNotThrow(() => JSON.parse(rows[0].rawJson));
});
