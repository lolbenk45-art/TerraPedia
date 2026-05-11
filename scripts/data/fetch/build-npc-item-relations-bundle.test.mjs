import test from 'node:test';
import assert from 'node:assert/strict';

import { buildNpcItemRelationsBundle } from './build-npc-item-relations-bundle.mjs';

test('buildNpcItemRelationsBundle emits variant-specific loot rows with exact source metadata', () => {
  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-05-09T00:00:00.000Z',
    standardizedPayload: {
      records: [
        {
          id: 473,
          internalName: 'BigMimicCorruption',
          name: 'Corrupt Mimic',
          wikiCrawler: {
            pageTitle: 'Corrupt Mimic',
            loot: [
              {
                itemName: 'Dart Rifle',
                chanceText: '20%',
                quantityText: '1',
              },
            ],
          },
        },
      ],
    },
  });

  assert.equal(bundle.records.length, 1);
  assert.equal(bundle.records[0].relationType, 'loot');
  assert.equal(bundle.records[0].npcInternalName, 'BigMimicCorruption');
  assert.equal(bundle.records[0].sourceRefInternalName, 'BigMimicCorruption');
  assert.equal(bundle.records[0].sourceRefResolution, 'exact_internal_name');
  assert.equal(bundle.records[0].sourceSection, 'drops');
  assert.equal(bundle.records[0].raw.sourceRefInternalName, 'BigMimicCorruption');
  assert.equal(bundle.records[0].raw.sourceRefResolution, 'exact_internal_name');
});

test('buildNpcItemRelationsBundle preserves bridge-provided exact Mimic variant metadata', () => {
  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-05-09T00:00:00.000Z',
    standardizedPayload: {
      records: [
        {
          id: 473,
          internalName: 'BigMimicCrimson',
          name: 'Crimson Mimic',
          wikiCrawler: {
            pageTitle: 'Mimics',
            sourceMetadata: {
              apiUrl: 'https://terraria.wiki.gg/api.php'
            },
            loot: [
              {
                itemName: 'Life Drain',
                chanceText: '20%',
                quantityText: '1',
                sourceRefInternalName: 'BigMimicCrimson',
                sourceRefResolution: 'exact_internal_name',
                sourceSection: 'drops',
                sourceInfobox: { autoId: '473', image: 'Crimson Mimic.gif', name: 'Crimson Mimic' },
                raw: {
                  itemName: 'Life Drain',
                  sourceInfobox: { autoId: '473', image: 'Crimson Mimic.gif', name: 'Crimson Mimic' }
                }
              }
            ],
          },
        },
      ],
    },
  });

  assert.equal(bundle.records.length, 1);
  assert.equal(bundle.records[0].npcInternalName, 'BigMimicCrimson');
  assert.equal(bundle.records[0].sourceRefInternalName, 'BigMimicCrimson');
  assert.equal(bundle.records[0].sourceRefResolution, 'exact_internal_name');
  assert.equal(bundle.records[0].sourceUrl, 'https://terraria.wiki.gg/wiki/Mimics');
  assert.equal(bundle.records[0].raw.sourceRefInternalName, 'BigMimicCrimson');
  assert.equal(bundle.records[0].raw.sourceRefResolution, 'exact_internal_name');
  assert.deepEqual(bundle.records[0].raw.sourceInfobox, { autoId: '473', image: 'Crimson Mimic.gif', name: 'Crimson Mimic' });
});

test('buildNpcItemRelationsBundle gives duplicate forward loot rows distinct record keys', () => {
  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-05-11T00:00:00.000Z',
    standardizedPayload: {
      records: [
        {
          id: 253,
          internalName: 'Reaper',
          name: 'Reaper',
          wikiCrawler: {
            pageTitle: 'Reaper',
            loot: [
              {
                itemName: 'Death Sickle',
                chanceText: '2.5%',
                quantityText: '1',
                sourceRowIndex: 0
              },
              {
                itemName: 'Death Sickle',
                chanceText: '2.5%',
                quantityText: '1',
                sourceRowIndex: 1
              }
            ]
          }
        }
      ]
    }
  });

  assert.equal(bundle.records.length, 2);
  assert.deepEqual(bundle.records.map((record) => record.sourceRowIndex), [0, 1]);
  assert.notEqual(bundle.records[0].recordKey, bundle.records[1].recordKey);
});

test('buildNpcItemRelationsBundle does not fan out generic Mimics loot to variants', () => {
  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-05-09T00:00:00.000Z',
    standardizedPayload: {
      records: [
        {
          id: 85,
          internalName: 'Mimic',
          name: 'Mimics',
          wikiCrawler: {
            pageTitle: 'Mimics',
            loot: [
              {
                itemName: 'Titan Glove',
                chanceText: '14.29%',
              },
            ],
          },
        },
        {
          id: 473,
          internalName: 'BigMimicCorruption',
          name: 'Corrupt Mimic',
          wikiCrawler: {},
        },
      ],
    },
  });

  assert.equal(bundle.records.length, 1);
  assert.equal(bundle.records[0].npcInternalName, 'Mimic');
  assert.equal(bundle.records.some((record) => record.npcInternalName === 'BigMimicCorruption'), false);
});
