import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyBuffPageEvidenceToStandardizedPayload,
  runRefreshTargetBuffPageEvidence
} from './refresh-target-buff-page-evidence.mjs';

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

test('uses monitor-visible buff progress path by default', async () => {
  const writes = [];

  await runRefreshTargetBuffPageEvidence(
    {
      input: '/tmp/buffs.standardized.json',
      items: '/tmp/items.standardized.json',
      output: '/tmp/buffs.out.json',
      'buff-id': 20
    },
    buildRefreshDependencies(writes)
  );

  assert.ok(
    writes.some((entry) => entry.filePath.replaceAll('\\', '/').endsWith('data/generated/fetch-wiki-buffs-progress.latest.json'))
  );
  assert.ok(
    !writes.some((entry) => entry.filePath.replaceAll('\\', '/').endsWith('data/generated/buff-evidence-refresh-progress.latest.json'))
  );
});

test('writes monitor progress payload with action id heartbeat and stage metadata', async () => {
  const writes = [];

  await runRefreshTargetBuffPageEvidence(
    {
      input: '/tmp/buffs.standardized.json',
      items: '/tmp/items.standardized.json',
      output: '/tmp/buffs.out.json',
      'buff-id': 20
    },
    buildRefreshDependencies(writes)
  );

  const payload = writes
    .filter((entry) => entry.filePath.replaceAll('\\', '/').endsWith('data/generated/fetch-wiki-buffs-progress.latest.json'))
    .at(-1)?.payload;

  assert.equal(payload.actionId, 'buff-page-immunity-refresh');
  assert.equal(payload.status, 'completed');
  assert.equal(payload.current, payload.total);
  assert.equal(payload.childStatusPath.endsWith('fetch-wiki-buffs-progress.latest.json'), true);
  assert.equal(payload.queue, 'buff source refresh');
  assert.equal(payload.dataStage, 'wiki buff pages -> immunity evidence');
  assert.equal(payload.nextStep, 'standardize buffs, rebuild npc bridge, then backfill npc_buff_relations');
  assert.ok(payload.generatedAt);
  assert.ok(payload.lastHeartbeatAt);
});

test('honors explicit progress path for targeted buff evidence refresh', async () => {
  const writes = [];

  await runRefreshTargetBuffPageEvidence(
    {
      input: '/tmp/buffs.standardized.json',
      items: '/tmp/items.standardized.json',
      output: '/tmp/buffs.out.json',
      'buff-id': 20,
      'progress-path': '/tmp/custom-buff-progress.json'
    },
    buildRefreshDependencies(writes)
  );

  const progressWrites = writes.filter((entry) => entry.payload?.actionId === 'buff-page-immunity-refresh');
  assert.equal(progressWrites.at(-1).filePath, '/tmp/custom-buff-progress.json');
  assert.equal(progressWrites.at(-1).payload.childStatusPath, '/tmp/custom-buff-progress.json');
});

function buildRefreshDependencies(writes) {
  const readJson = (filePath) => {
    if (String(filePath).endsWith('items.standardized.json')) {
      return { records: [{ id: 545, internalName: 'Gel' }] };
    }
    return {
      records: [
        {
          id: 20,
          internalName: 'Poisoned',
          englishName: 'Poisoned',
          localized: { en: { page: 'Poisoned' } },
          sourceItems: [],
          inflictingNpcs: []
        }
      ]
    };
  };

  return {
    readJson,
    writeJson: (filePath, payload) => writes.push({ filePath, payload }),
    fetchPagePayload: async () => ({
      pageTitle: 'Poisoned',
      revisionTimestamp: '2026-05-15T00:00:00Z',
      sections: [{ line: 'Immune NPCs', anchor: 'Immune_NPCs' }],
      html: '<h2><span class="mw-headline" id="Immune_NPCs">Immune NPCs</span></h2><ul><li><a href="/wiki/Blue_Slime" title="Blue Slime">Blue Slime</a></li></ul>',
      wikitext: ''
    })
  };
}
