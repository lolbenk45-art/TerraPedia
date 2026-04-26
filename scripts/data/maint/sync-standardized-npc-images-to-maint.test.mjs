import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMaintNpcImageRows, parseArgs } from './sync-standardized-npc-images-to-maint.mjs';

test('parseArgs parses standardized npc image sync options', () => {
  assert.deepEqual(parseArgs([
    '--apply=true',
    '--maint-database=terria_v1_maint',
    '--standardized-path=data/standardized/npcs.standardized.json'
  ]), {
    apply: true,
    maintDatabase: 'terria_v1_maint',
    standardizedPath: 'data/standardized/npcs.standardized.json'
  });
});

test('buildMaintNpcImageRows converts standardized npc image fields into maint npc image rows', () => {
  const rows = buildMaintNpcImageRows({
    standardizedRecords: [
      {
        id: -65,
        internalName: 'BigHornetStingy',
        name: 'Hornet',
        imageFileTitle: 'Stingy Hornet.gif',
        imageUrl: 'http://localhost:9000/terrapedia-images/items/2026/04/08/cbdfb9061d714cb2abc837dcc9e298b2.gif',
        imageWidth: 48,
        imageHeight: 38,
        imageContentType: 'image/gif'
      }
    ]
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].npcInternalName, 'BigHornetStingy');
  assert.equal(rows[0].npcName, 'Hornet');
  assert.equal(rows[0].sourceProvider, 'terraria.wiki.gg');
  assert.equal(rows[0].sourcePage, 'NPC_ID');
  assert.equal(rows[0].sourceFileTitle, 'Stingy Hornet.gif');
  assert.equal(rows[0].originalUrl, 'https://terraria.wiki.gg/images/Stingy%20Hornet.gif');
  assert.equal(rows[0].cachedUrl, 'http://localhost:9000/terrapedia-images/items/2026/04/08/cbdfb9061d714cb2abc837dcc9e298b2.gif');
  assert.equal(rows[0].contentType, 'image/gif');
  assert.equal(rows[0].isPrimary, true);
  assert.equal(rows[0].sortOrder, 0);
  assert.equal(rows[0].recordKey.length, 64);
});
