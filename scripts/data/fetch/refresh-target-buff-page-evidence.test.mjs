import test from 'node:test';
import assert from 'node:assert/strict';

import { applyBuffPageEvidenceToStandardizedPayload } from './refresh-target-buff-page-evidence.mjs';

test('applyBuffPageEvidenceToStandardizedPayload patches one buff with page evidence and item ids', () => {
  const standardizedPayload = {
    schemaVersion: '1.0.0',
    entity: 'buffs',
    generatedAt: '2026-05-14T00:00:00.000Z',
    records: [
      {
        id: 39,
        internalName: 'CursedInferno',
        englishName: 'Cursed Inferno',
        sourceItemCount: 0,
        sourceItems: [],
        immuneNpcCount: 5,
        immuneNpcSample: []
      },
      {
        id: 40,
        internalName: 'OtherBuff',
        sourceItemCount: 0,
        sourceItems: []
      }
    ]
  };
  const evidence = {
    sourceItems: [
      { internalName: 'CursedArrow', name: 'Cursed Arrow' },
      { internalName: 'FlaskOfCursedFlames', name: 'Flask of Cursed Flames' }
    ],
    inflictingNpcs: [
      { internalName: 'Clinger', name: 'Clinger' }
    ],
    immuneNpcs: [
      { internalName: 'AncientVision', name: 'Ancient Vision' },
      { internalName: 'MartianSaucer', name: 'Martian Saucer' }
    ],
    immuneNpcCount: 2,
    immuneNpcSample: [
      { internalName: 'AncientVision', name: 'Ancient Vision' }
    ],
    immuneNpcSource: 'buff-page-immunities',
    immuneNpcSampleSemantics: 'first 1 entries from the rendered buff page immunities list; immuneNpcCount is the full rendered list size',
    sourceEvidence: {
      provider: 'terraria.wiki.gg',
      pageTitle: 'Cursed Inferno'
    }
  };

  const actual = applyBuffPageEvidenceToStandardizedPayload({
    standardizedPayload,
    evidence,
    itemRecords: [
      { id: 545, internalName: 'CursedArrow' },
      { id: 1353, internalName: 'FlaskofCursedFlames' }
    ],
    buffId: 39,
    generatedAt: '2026-05-15T00:00:00.000Z'
  });

  const cursed = actual.records.find((record) => record.id === 39);
  assert.equal(actual.generatedAt, '2026-05-15T00:00:00.000Z');
  assert.equal(cursed.sourceItemCount, 2);
  assert.deepEqual(cursed.sourceItems.map((entry) => [entry.internalName, entry.itemId]), [
    ['CursedArrow', 545],
    ['FlaskofCursedFlames', 1353]
  ]);
  assert.deepEqual(cursed.inflictingNpcs.map((entry) => entry.internalName), ['Clinger']);
  assert.equal(cursed.immuneNpcCount, 2);
  assert.deepEqual(cursed.immuneNpcs.map((entry) => entry.internalName), ['AncientVision', 'MartianSaucer']);
  assert.equal(cursed.sourceEvidence.pageTitle, 'Cursed Inferno');
  assert.deepEqual(actual.records.find((record) => record.id === 40), standardizedPayload.records[1]);
});
