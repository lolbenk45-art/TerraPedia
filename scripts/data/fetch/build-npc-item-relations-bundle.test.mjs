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
