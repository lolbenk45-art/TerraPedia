import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBuffT1LandingRows,
  runBuffCanonicalT1Acceptance,
  seedBuffFixtureItems,
  seedBuffFixtureNpcs,
  seedBuffFixtureMaintItems,
  seedBuffFixtureMaintNpcs,
} from './buff-canonical-t1-acceptance.mjs';

test('T1 fixture freezes the two exact buff records and evidence ordering', async () => {
  const rows = buildBuffT1LandingRows();
  assert.equal(rows.length, 1);
  assert.ok(rows.every((row) => row.dataset_type === 'buffs_raw'));

  const records = JSON.parse(rows[0].payload_json).records;
  assert.deepEqual(records.map((record) => [record.id, record.internalName, record.englishName]), [
    [153, 'ShadowFlame', 'Shadowflame'],
    [70, 'Venom', 'Acid Venom'],
  ]);
  assert.deepEqual(records.map((record) => record.sourceItems.map((item) => item.internalName)), [
    ['DarkLance', 'ShadowFlameKnife', 'ShadowFlameBow', 'ShadowFlameHexDoll'],
    ['VenomBullet', 'VenomArrow', 'VenomStaff', 'SpiderStaff', 'QueenSpiderStaff', 'FlaskofVenom', 'PygmyStaff'],
  ]);
  assert.deepEqual(records.map((record) => record.inflictingNpcs.map((npc) => npc.internalName)), [
    ['Clothier'],
    ['BlackRecluse', 'JungleCreeper', 'SandPoacher'],
  ]);
  assert.deepEqual(records.map((record) => record.immuneNpcs.length), [30, 26]);
  assert.ok(records.every((record) => record.sourceEvidence?.parseStatus === 'parsed'));
  assert.ok(records.every((record) => record.sourceEvidence?.provider === 'terraria.wiki.gg'));
});

test('T1 seed helpers and acceptance freeze relation counts without live writes', async () => {
  const records = JSON.parse(buildBuffT1LandingRows()[0].payload_json).records;
  assert.equal(seedBuffFixtureItems(records).length, 11);
  assert.equal(seedBuffFixtureNpcs(records).length, 4);
  assert.deepEqual(seedBuffFixtureNpcs(records), ['Clothier', 'BlackRecluse', 'JungleCreeper', 'DesertScorpionWalk']);
  assert.equal(typeof seedBuffFixtureMaintItems, 'function');
  assert.equal(typeof seedBuffFixtureMaintNpcs, 'function');
});

test('T1 executor rejects isolated-name violations', async () => {
  await assert.rejects(
    () => runBuffCanonicalT1Acceptance({ profile: 't1', databases: { local: 'terria_v1_local', maint: 'terria_v1_maint', relation: 'terria_v1_relation' } }),
    /buff.*isolated/i,
  );
});
