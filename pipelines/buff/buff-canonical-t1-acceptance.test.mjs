import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  assertBuffFullCaptureResources,
  assertBuffT1SourceReplayResources,
  buildBuffT1InputDescriptor,
  buildBuffT1LandingRows,
  runBuffCanonicalT1Acceptance,
  seedBuffFixtureItems,
  seedBuffFixtureNpcs,
  seedBuffFixtureMaintItems,
  seedBuffFixtureMaintNpcs,
} from './buff-canonical-t1-acceptance.mjs';
import { buildCurrentBuffSourceReplay } from '../fetch/buff-current-source-replay.mjs';

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

function sourceReplayInput() {
  const page = ({ id, internalName, englishName, pageTitle, pageId, revisionId, itemName, itemInternalName, itemId }) => ({
    pageTitle,
    pageId,
    revisionId,
    revisionTimestamp: '2026-10-11T00:00:00Z',
    wikitext: `== From player ==\n${itemName}`,
    html: `<h2>From player</h2><a title="${itemName}">${itemName}</a>`,
    sections: [{ anchor: 'From_player', line: 'From player' }],
    record: {
      id, internalName, englishName, type: 'debuff',
      sourceItems: [{ name: itemName, pageTitle: itemName, internalName: itemInternalName, itemId }],
      inflictingNpcs: [], immuneNpcs: [], immuneNpcCount: 0, immuneNpcSample: [],
      sourceEvidence: {
        provider: 'terraria.wiki.gg', pageTitle, canonicalPageTitle: pageTitle, parseStatus: 'parsed',
        factGroups: {
          sourceItems: { status: 'parsed', count: 1, sections: ['From player'] },
          inflictingNpcs: { status: 'parsed', count: 0, sections: [] },
          immuneNpcs: { status: 'parsed', count: 0, sections: ['Immune NPCs'] },
        },
        unresolvedFacts: [],
      },
    },
  });
  return buildCurrentBuffSourceReplay({
    generatedAt: '2026-10-11T00:00:00Z',
    buffCatalogModule: {
      pageTitle: 'Template:GetBuffInfo', pageId: 55467, revisionId: 1020000, revisionTimestamp: '2026-10-11T00:00:00Z',
      moduleContent: '|__buff:count|2<!--\n|__buff:iname:153|ShadowFlame<!--\n|__buff:ename:153|Shadowflame<!--\n|__buff:type:153|debuff<!--\n|__buff:iname:70|Venom<!--\n|__buff:ename:70|Acid Venom<!--\n|__buff:type:70|debuff<!--',
    },
    itemInfoModule: { pageTitle: 'Module:Iteminfo/data', pageId: 18020, revisionId: 1020003, revisionTimestamp: '2026-10-11T00:00:00Z', moduleContent: 'return { ["data"] = [=====[{"274":{"name":"Dark Lance","internalName":"DarkLance"},"1342":{"name":"Venom Bullet","internalName":"VenomBullet"}}]=====] }' },
    pages: [
      page({ id: 153, internalName: 'ShadowFlame', englishName: 'Shadowflame', pageTitle: 'Shadowflame', pageId: 9767, revisionId: 1020001, itemName: 'Dark Lance', itemInternalName: 'DarkLance', itemId: 274 }),
      page({ id: 70, internalName: 'Venom', englishName: 'Acid Venom', pageTitle: 'Acid Venom', pageId: 8675, revisionId: 1020002, itemName: 'Venom Bullet', itemInternalName: 'VenomBullet', itemId: 1342 }),
    ],
  });
}

test('current Wiki source landing retains real revision provenance and never claims fixture identity', () => {
  const sourceReplay = sourceReplayInput();
  const [row] = buildBuffT1LandingRows({ sourceReplay });
  assert.equal(row.provider, 'terraria.wiki.gg');
  assert.equal(row.source_kind, 'revision_bound_wiki_pages');
  assert.equal(row.source_key, 'buff-current-source-replay:153,70');
  assert.match(row.source_page, /Shadowflame/);
  assert.equal(row.content_hash, createHash('sha256').update(row.payload_json).digest('hex'));
  assert.equal(JSON.parse(row.payload_json).sourceCapture.snapshotSha256, sourceReplay.snapshotSha256);
  assert.doesNotMatch(`${row.provider} ${row.source_kind} ${row.source_locator} ${row.source_page}`, /fixture|offline/i);
  assert.equal(JSON.parse(row.payload_json).records.length, 2);
});

test('T1 acceptance input descriptor identifies the current Wiki replay instead of the offline fixture', () => {
  const sourceReplay = sourceReplayInput();
  assert.deepEqual(buildBuffT1InputDescriptor({ sourceReplay }), {
    type: 'current_wiki_source_replay',
    snapshotSha256: sourceReplay.snapshotSha256,
    selectedBuffs: [
      { id: 153, internalName: 'ShadowFlame' },
      { id: 70, internalName: 'Venom' },
    ],
  });
  assert.deepEqual(buildBuffT1InputDescriptor({ inputPath: 'pipelines/buff/fixtures/custom.json' }), {
    type: 'offline_fixture',
    path: 'pipelines/buff/fixtures/custom.json',
  });
});

test('source replay accepts only the isolated T1 databases and Redis DB18', () => {
  const databases = {
    local: 'terria_v1_automation_acceptance_abc_0123456789abcdef_local',
    maint: 'terria_v1_automation_acceptance_abc_0123456789abcdef_maint',
    relation: 'terria_v1_automation_acceptance_abc_0123456789abcdef_relation',
  };
  assert.doesNotThrow(() => assertBuffT1SourceReplayResources({ profile: 't1', databases, redisLogicalDb: 18 }));
  assert.throws(() => assertBuffT1SourceReplayResources({ profile: 't1', databases: { ...databases, local: 'terria_v1_local' }, redisLogicalDb: 18 }), /isolated|formal/i);
  for (const redisLogicalDb of [13, 14, 15, 16, 17]) {
    assert.throws(() => assertBuffT1SourceReplayResources({ profile: 't1', databases, redisLogicalDb }), /DB18|Redis/i);
  }
});

test('full capture mode accepts exactly 400 records and binds Redis DB22', () => {
  const records = Array.from({ length: 400 }, (_, index) => ({
    id: index + 1,
    internalName: `Buff${index + 1}`,
    sourceItems: [{ itemId: index + 1, internalName: `Item${index + 1}` }],
    inflictingNpcs: [],
    immuneNpcs: [],
    sourceEvidence: { parseStatus: 'parsed', provider: 'terraria.wiki.gg' },
  }));
  const databases = {
    local: 'terria_v1_automation_acceptance_abc_0123456789abcdef_local',
    maint: 'terria_v1_automation_acceptance_abc_0123456789abcdef_maint',
    relation: 'terria_v1_automation_acceptance_abc_0123456789abcdef_relation',
  };
  assert.doesNotThrow(() => assertBuffFullCaptureResources({ profile: 't1', databases, redisLogicalDb: 22 }));
  assert.throws(() => assertBuffFullCaptureResources({ profile: 't1', databases, redisLogicalDb: 18 }), /DB22|Redis/i);
  const rows = buildBuffT1LandingRows({ recordsOverride: records, sourceMetadata: { sourceRevisionTimestamp: '2026-08-22T05:46:54Z' } });
  assert.equal(JSON.parse(rows[0].payload_json).records.length, 400);
  assert.equal(rows[0].source_kind, 'full_wiki_capture');
});
