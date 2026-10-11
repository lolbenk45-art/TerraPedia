import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBuffSecondaryIdentityLineage } from './buff-secondary-identity-lineage.mjs';

const payload = {
  buffs: [
    {
      id: 395,
      internalName: 'PotentAcid',
      sourceItems: [
        { name: 'Flask of Venom', internalName: 'FlaskOfVenom', source: 'buff-page-causes' },
      ],
      immuneNpcs: [
        { name: 'Dungeon Guardian', internalName: 'DungeonGuardian', source: 'buff-page-immunities' },
      ],
    },
    {
      id: 399,
      internalName: 'BlueLightning',
      sourceItems: [
        { name: 'Lightning Strike', internalName: 'LightningStrike', source: 'buff-page-causes' },
        { name: 'Arc Surge', internalName: 'ArcSurge', source: 'buff-page-causes' },
      ],
      immuneNpcs: [
        { name: 'Wraith', internalName: 'Wraith', npcId: 82, source: 'npcinfo-module-expanded' },
      ],
    },
  ],
};

const iteminfoAssertions = [
  { buffId: 389, itemId: 6148, internalName: 'PalworldMinionTrustyCattiva', name: 'Trusty Cattiva' },
  { buffId: 395, itemId: 1340, internalName: 'FlaskofVenom', name: 'Flask of Venom' },
  { buffId: 399, itemId: 6155, internalName: 'LightningStrike', name: 'Lightning Strike' },
  { buffId: 400, itemId: 6173, internalName: 'ArcSurge', name: 'Arc Surge' },
];

test('resolves page-only item facts through complete Iteminfo identity but keeps missing maint rows blocked', () => {
  const result = buildBuffSecondaryIdentityLineage({
    payload: { buffs: [payload.buffs[1]] },
    iteminfoAssertions,
    maintItemRows: [],
    maintNpcRows: [],
  });

  assert.deepEqual(result.sourceItems.map(row => ({
    internalName: row.sourceInternalName,
    sourceId: row.stableSourceId,
    classification: row.classification,
  })), [
    { internalName: 'LightningStrike', sourceId: 6155, classification: 'stable-source-id-maint-missing' },
    { internalName: 'ArcSurge', sourceId: 6173, classification: 'stable-source-id-maint-missing' },
  ]);
  assert.equal(result.summary.sourceItems.stableSourceIdCount, 2);
  assert.equal(result.summary.sourceItems.missingMaintCount, 2);
  assert.equal(result.executable, false);
});

test('binds a source-id match despite internal-name casing drift and records the drift', () => {
  const result = buildBuffSecondaryIdentityLineage({
    payload: { buffs: [payload.buffs[0]] },
    iteminfoAssertions,
    maintItemRows: [{ source_id: 1340, internal_name: 'FlaskofVenom', english_name: 'Flask of Venom' }],
    maintNpcRows: [],
  });

  const row = result.sourceItems[0];
  assert.equal(row.stableSourceId, 1340);
  assert.equal(row.maintSourceId, 1340);
  assert.equal(row.classification, 'resolved-maint-source-id-with-source-name-drift');
  assert.equal(row.promotable, false);
  assert.ok(result.blockedBy.includes('source item identity drift requires owner review'));
});

test('does not promote a local compatibility row into a canonical item source identity', () => {
  const result = buildBuffSecondaryIdentityLineage({
    payload: { buffs: [{ id: 389, internalName: 'PalworldMinionTrustyCattiva', sourceItems: [
      { name: 'Trusty Cattiva', internalName: 'PalworldMinionTrustyCattiva' },
    ], immuneNpcs: [] }] },
    iteminfoAssertions: [],
    maintItemRows: [],
    localItemRows: [{ id: 8429, internal_name: 'PalworldMinionTrustyCattiva', name: 'Trusty Cattiva' }],
    maintNpcRows: [],
  });

  const row = result.sourceItems[0];
  assert.equal(row.stableSourceId, null);
  assert.equal(row.localRowId, 8429);
  assert.equal(row.classification, 'unresolved-source-identity');
  assert.equal(row.promotable, false);
  assert.ok(result.blockedBy.includes('source item identity remains unresolved'));
});

test('keeps display-only NPC facts blocked even when an exact maint name is unique', () => {
  const result = buildBuffSecondaryIdentityLineage({
    payload: { buffs: [payload.buffs[0]] },
    iteminfoAssertions: [],
    maintItemRows: [],
    maintNpcRows: [{ source_id: 68, internal_name: 'DungeonGuardian', english_name: 'Dungeon Guardian' }],
  });

  const row = result.immuneNpcs[0];
  assert.equal(row.stableSourceId, null);
  assert.equal(row.maintSourceId, 68);
  assert.equal(row.classification, 'display-only-npc-source-id-missing');
  assert.equal(row.promotable, false);
  assert.equal(result.summary.immuneNpcs.sourceIdMissingCount, 1);
});
