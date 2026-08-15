import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLocalArmorItemImageRows,
  parseArgs
} from './upsert-armor-item-image-evidence-to-local.mjs';

test('parseArgs parses armor item local upsert options', () => {
  assert.deepEqual(parseArgs([
    '--apply=true',
    '--evidence=reports/armor.json',
    '--local-database=terria_v1_local_custom',
    '--output=reports/out.json'
  ]), {
    apply: true,
    evidencePath: 'reports/armor.json',
    localDatabase: 'terria_v1_local_custom',
    output: 'reports/out.json'
  });
});

test('buildLocalArmorItemImageRows maps cached evidence to local item image rows', () => {
  const result = buildLocalArmorItemImageRows({
    localItems: [
      { id: 89, internal_name: 'CopperHelmet' }
    ],
    evidenceCandidates: [
      {
        internalName: 'CopperHelmet',
        name: 'Copper Helmet',
        pageTitle: 'Copper armor',
        imageFileTitle: 'Copper Helmet.png',
        sourceUrl: 'https://terraria.wiki.gg/images/Copper_Helmet.png?abc',
        cachedUrl: 'http://localhost:9000/terrapedia-images/items/2026/06/04/copper.png',
        width: 20,
        height: 20,
        contentType: 'image/png'
      },
      {
        internalName: 'MissingHelmet',
        name: 'Missing Helmet',
        imageFileTitle: 'Missing Helmet.png',
        sourceUrl: 'https://terraria.wiki.gg/images/Missing_Helmet.png?abc',
        cachedUrl: 'http://localhost:9000/terrapedia-images/items/2026/06/04/missing.png'
      },
      {
        internalName: 'CopperHelmet',
        name: 'Copper Helmet',
        imageFileTitle: 'Copper Helmet.png',
        sourceUrl: 'https://terraria.wiki.gg/images/Copper_Helmet.png?abc'
      }
    ]
  });

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].itemId, 89);
  assert.equal(result.rows[0].internalName, 'CopperHelmet');
  assert.equal(result.rows[0].role, 'icon');
  assert.equal(result.rows[0].provider, 'wiki_gg');
  assert.equal(result.rows[0].sourceFileTitle, 'Copper Helmet.png');
  assert.equal(result.rows[0].sourcePage, 'Copper armor');
  assert.equal(result.rows[0].originalUrl, 'https://terraria.wiki.gg/images/Copper_Helmet.png?abc');
  assert.equal(result.rows[0].cachedUrl, 'http://localhost:9000/terrapedia-images/items/2026/06/04/copper.png');
  assert.equal(result.rows[0].width, 20);
  assert.equal(result.rows[0].height, 20);
  assert.equal(result.rows[0].contentType, 'image/png');
  assert.equal(result.skipped.length, 2);
  assert.deepEqual(result.skipped.map((entry) => entry.reason).sort(), ['missing_local_item', 'missing_required_image_field']);
});
