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
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => [row.source_key, row.source_page]), [
    ['153', 'Shadowflame'],
    ['70', 'Acid Venom'],
  ]);
  assert.ok(rows.every((row) => row.dataset_type === 'buffs_raw'));

  const records = rows.map((row) => JSON.parse(row.payload_json));
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
  const records = buildBuffT1LandingRows().map((row) => JSON.parse(row.payload_json));
  assert.equal(seedBuffFixtureItems(records).length, 11);
  assert.equal(seedBuffFixtureNpcs(records).length, 4);
  assert.equal(seedBuffFixtureMaintItems(records).length, 11);
  assert.equal(seedBuffFixtureMaintNpcs(records).length, 4);
  const result = await runBuffCanonicalT1Acceptance({ executor: { name: 'buff-canonical-t1' } });
  assert.deepEqual(result.relations, { itemBuffRelations: 11, inflictingNpcBuffRelations: 4 });
  assert.equal(result.datasetType, 'buffs_raw');
});

test('T1 executor rejects isolated-name violations', async () => {
  await assert.rejects(
    () => runBuffCanonicalT1Acceptance({ executor: { name: 'all-domain-acceptance' } }),
    /isolated.*buff/i,
  );
});
