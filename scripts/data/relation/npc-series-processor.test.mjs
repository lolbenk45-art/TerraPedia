import test from 'node:test';
import assert from 'node:assert/strict';

import { buildNpcSeriesRelations } from './npc-series-processor.mjs';

test('buildNpcSeriesRelations groups duplicate english-name variants and aggregates item relations', () => {
  const actual = buildNpcSeriesRelations({
    relationNpcRows: [
      {
        recordKey: 'npc-1',
        sourceId: 1,
        internalName: 'BigHornetStingy',
        englishName: 'Hornet',
        sourceMaintRecordKey: 'a'.repeat(64)
      },
      {
        recordKey: 'npc-2',
        sourceId: 2,
        internalName: 'LittleHornetStingy',
        englishName: 'Hornet',
        sourceMaintRecordKey: 'b'.repeat(64)
      },
      {
        recordKey: 'npc-3',
        sourceId: 3,
        internalName: 'Merchant',
        englishName: 'Merchant',
        sourceMaintRecordKey: 'c'.repeat(64)
      }
    ],
    itemNpcShopRelations: [],
    itemNpcLootRelations: [
      {
        recordKey: 'loot-1',
        sourceFactKey: 'sf-1',
        itemInternalName: 'Bezoar',
        npcInternalName: 'BigHornetStingy',
        chanceText: '1%',
        quantityText: null,
        conditionSourceText: null
      },
      {
        recordKey: 'loot-2',
        sourceFactKey: 'sf-2',
        itemInternalName: 'Bezoar',
        npcInternalName: 'LittleHornetStingy',
        chanceText: '1%',
        quantityText: null,
        conditionSourceText: null
      }
    ]
  });

  assert.equal(actual.npcSeriesNodes.length, 1);
  assert.equal(actual.npcSeriesMemberships.length, 2);
  assert.equal(actual.npcSeriesItemRelations.length, 1);

  const series = actual.npcSeriesNodes[0];
  assert.equal(series.seriesNameEn, 'Hornet');
  assert.equal(series.memberCount, 2);

  const itemRelation = actual.npcSeriesItemRelations[0];
  assert.equal(itemRelation.seriesNameEn, 'Hornet');
  assert.equal(itemRelation.itemInternalName, 'Bezoar');
  assert.equal(itemRelation.relationType, 'loot');
  assert.equal(itemRelation.npcMemberCount, 2);
});
