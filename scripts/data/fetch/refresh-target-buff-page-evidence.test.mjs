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

test('applyBuffPageEvidenceToStandardizedPayload preserves existing valid facts when parser is incomplete', () => {
  const standardizedPayload = {
    records: [
      {
        id: 20,
        internalName: 'Poisoned',
        sourceItemCount: 1,
        sourceItems: [{ internalName: 'PoisonedKnife', name: 'Poisoned Knife' }],
        inflictingNpcs: [{ internalName: 'Hornet', name: 'Hornet' }],
        immuneNpcCount: 1,
        immuneNpcs: [{ internalName: 'BlueSlime', name: 'Blue Slime' }],
        immuneNpcSample: [{ internalName: 'BlueSlime', name: 'Blue Slime' }],
        sourceEvidence: { parseStatus: 'parsed', pageTitle: 'Poisoned' }
      }
    ]
  };

  const actual = applyBuffPageEvidenceToStandardizedPayload({
    standardizedPayload,
    evidence: {
      sourceItems: [],
      inflictingNpcs: [],
      immuneNpcs: [],
      immuneNpcCount: 0,
      immuneNpcSample: [],
      sourceEvidence: {
        pageTitle: 'Poisoned',
        parseStatus: 'parse_incomplete',
        unresolvedFacts: [
          { group: 'sourceItems', status: 'no_rows' },
          { group: 'immuneNpcs', status: 'section_missing' }
        ]
      }
    },
    buffId: 20
  });

  const poisoned = actual.records[0];
  assert.deepEqual(poisoned.sourceItems.map((entry) => entry.internalName), ['PoisonedKnife']);
  assert.deepEqual(poisoned.inflictingNpcs.map((entry) => entry.internalName), ['Hornet']);
  assert.deepEqual(poisoned.immuneNpcs.map((entry) => entry.internalName), ['BlueSlime']);
  assert.equal(poisoned.sourceEvidence.parseStatus, 'parse_incomplete');
});

test('applyBuffPageEvidenceToStandardizedPayload does not solidify unknown empty fact groups from incomplete parser output', () => {
  const standardizedPayload = {
    records: [
      {
        id: 323,
        internalName: 'OnFire3',
        sourceItemCount: 0,
        sourceItems: [],
        inflictingNpcs: [],
        immuneNpcCount: 47,
        immuneNpcs: [],
        immuneNpcSample: [{ internalName: 'MeteorHead', name: 'Meteor Head' }]
      }
    ]
  };

  const actual = applyBuffPageEvidenceToStandardizedPayload({
    standardizedPayload,
    evidence: {
      sourceItems: [],
      inflictingNpcs: [],
      immuneNpcs: [],
      immuneNpcCount: 0,
      immuneNpcSample: [],
      sourceEvidence: {
        pageTitle: 'Hellfire',
        parseStatus: 'parse_incomplete',
        unresolvedFacts: [
          { group: 'sourceItems', status: 'no_rows' },
          { group: 'immuneNpcs', status: 'no_rows' }
        ]
      }
    },
    buffId: 323
  });

  const hellfire = actual.records[0];
  assert.deepEqual(hellfire.sourceItems, []);
  assert.deepEqual(hellfire.inflictingNpcs, []);
  assert.deepEqual(hellfire.immuneNpcs, []);
  assert.deepEqual(hellfire.immuneNpcSample, [{ internalName: 'MeteorHead', name: 'Meteor Head' }]);
  assert.equal(hellfire.immuneNpcCount, 47);
  assert.equal(hellfire.sourceEvidence.parseStatus, 'parse_incomplete');
});

test('runRefreshTargetBuffPageEvidence passes full payload provenance into parser output', async () => {
  const writes = new Map();
  const summary = await runRefreshTargetBuffPageEvidence(
    {
      input: '/tmp/buffs.standardized.json',
      items: '/tmp/items.standardized.json',
      output: '/tmp/buffs.out.json',
      'buff-id': '20'
    },
    {
      readJson: (filePath) => {
        if (filePath.endsWith('items.standardized.json')) {
          return { records: [{ id: 1, internalName: 'PoisonedKnife' }] };
        }
        return {
          records: [
            {
              id: 20,
              internalName: 'Poisoned',
              englishName: 'Poisoned',
              localized: { en: { page: 'Poisoned' } }
            }
          ]
        };
      },
      writeJson: (filePath, payload) => writes.set(filePath, payload),
      fetchPagePayload: async () => ({
        pageTitle: 'Poisoned',
        canonicalPageTitle: 'Poisoned',
        revisionId: 5678,
        revisionTimestamp: '2026-05-15T00:00:00Z',
        sections: [
          { line: 'From player', anchor: 'From_player' },
          { line: 'Immune NPCs', anchor: 'Immune_NPCs' }
        ],
        html: `
          <h2><span class="mw-headline" id="From_player">From player</span></h2>
          <table><tr><td><a href="/wiki/Poisoned_Knife" title="Poisoned Knife">Poisoned Knife</a></td></tr></table>
          <h2><span class="mw-headline" id="Immune_NPCs">Immune NPCs</span></h2>
          <ul><li><a href="/wiki/Blue_Slime" title="Blue Slime">Blue Slime</a></li></ul>
        `,
        wikitext: 'wiki text'
      })
    }
  );

  assert.equal(summary.sourceItemCount, 1);
  const patched = writes.get('/tmp/buffs.out.json');
  assert.equal(patched.records[0].sourceEvidence.revisionId, 5678);
  assert.equal(patched.records[0].sourceEvidence.revisionTimestamp, '2026-05-15T00:00:00Z');
});
