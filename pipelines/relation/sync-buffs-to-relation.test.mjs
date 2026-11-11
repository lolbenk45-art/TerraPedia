import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parseBuffPageEvidence } from '../fetch/buff-immunity-page-parser.mjs';
import { buildBuffPartialFactPlan } from './buff-source-applicability.mjs';

import {
  buildBuffRelationSyncPayload,
  buildBuffIncrementalMutationPlan,
  normalizeBuffPageEvidence,
  mergeNpcCrawlerFactsIntoMaintBuffRows,
  parseArgs,
  runBuffRelationSync,
} from './sync-buffs-to-relation.mjs';

test('mergeNpcCrawlerFactsIntoMaintBuffRows reconstructs MATCHED NPC buff evidence', () => {
  const rows = mergeNpcCrawlerFactsIntoMaintBuffRows({
    maintBuffRows: [{
      source_id: 156,
      internal_name: 'Stoned',
      english_name: 'Stoned',
      raw_json: JSON.stringify({ inflictingNpcs: [] }),
    }],
    maintNpcCrawlerFactRows: [{
      record_key: 'a'.repeat(64),
      npc_source_id: 477,
      npc_internal_name: 'Medusa',
      npc_name: 'Medusa',
      match_status: 'MATCHED',
      buff_inflictions_json: JSON.stringify([{ buffName: 'Stoned', durationText: '1 second' }]),
      landing_source_key: 'wiki.npc.crawler.fact:medusa',
    }],
  });

  const raw = JSON.parse(rows[0].raw_json);
  assert.equal(raw.inflictingNpcs.length, 1);
  assert.equal(raw.inflictingNpcs[0].internalName, 'Medusa');
  assert.equal(raw.inflictingNpcs[0].crawlerFactRecordKey, 'a'.repeat(64));
  assert.equal(raw.inflictingNpcs[0].durationText, '1 second');
});

test('parseArgs defaults to dry-run buff relation sync', () => {
  const actual = parseArgs([
    '--apply=true',
    '--maint-database=terria_v1_local',
    '--relation-database=terria_v1_relation',
  ]);

  assert.equal(actual.apply, true);
  assert.equal(actual.maintDatabase, 'terria_v1_local');
  assert.equal(actual.relationDatabase, 'terria_v1_relation');
  assert.equal(actual.localDatabase, 'terria_v1_local');
});

test('buildBuffRelationSyncPayload builds buff entities, secondary relations, and projection rows', () => {
  const payload = buildBuffRelationSyncPayload({
    maintBuffRows: [
      {
        id: 11,
        source_id: 337,
        internal_name: 'ShadowFlame',
        english_name: 'Shadowflame',
        major_value: 1,
        combat_value: 0,
        raw_json: JSON.stringify({
          type: 'debuff',
          sourceItemCount: 1,
          immuneNpcCount: 0,
          sourceItems: [{ itemId: 1, internalName: 'ShadowFlameKnife' }],
          inflictingNpcs: [{ npcId: 54, internalName: 'Clothier', name: 'Clothier' }],
          sourceEvidence: { parseStatus: 'parsed' },
        }),
        landing_source_key: 'generated.buffs.standardized',
      },
    ],
    maintItemRows: [
      { source_id: 1, internal_name: 'ShadowFlameKnife', english_name: 'Shadowflame Knife' },
    ],
    maintNpcRows: [
      { source_id: 54, internal_name: 'Clothier', english_name: 'Clothier' },
    ],
    relationBuffImageRows: [],
  });

  assert.equal(payload.relationBuffs.length, 1);
  assert.equal(payload.projectionBuffs.length, 1);
  assert.equal(payload.itemBuffRelations.length, 1);
  assert.equal(payload.npcBuffRelations.length, 1);
  assert.equal(payload.projectionBuffs[0].internalName, 'ShadowFlame');
  assert.equal(JSON.parse(payload.projectionBuffs[0].inflictingNpcsJson)[0].internalName, 'Clothier');
  assert.equal(payload.itemBuffRelations[0].itemInternalName, 'ShadowFlameKnife');
  assert.equal(payload.npcBuffRelations[0].npcInternalName, 'Clothier');
});

test('buildBuffRelationSyncPayload normalizes reviewed buff npc aliases in projection json', () => {
  const payload = buildBuffRelationSyncPayload({
    maintBuffRows: [
      {
        id: 24,
        source_id: 24,
        internal_name: 'OnFire',
        english_name: 'On Fire!',
        raw_json: JSON.stringify({
          sourceItems: [],
          inflictingNpcs: [
            { internalName: 'Diabolist', name: 'Diabolist' },
            { internalName: 'LunaticCultist', name: 'Lunatic Cultist' },
            { internalName: 'ExpertMode', name: '20', pageTitle: 'Expert Mode' }
          ],
          sourceEvidence: { parseStatus: 'parsed' },
        }),
      },
      {
        id: 33,
        source_id: 33,
        internal_name: 'Weak',
        english_name: 'Weak',
        raw_json: JSON.stringify({
          sourceItems: [],
          inflictingNpcs: [{ internalName: 'Scarecrow', name: 'Scarecrow' }],
          sourceEvidence: { parseStatus: 'parsed' },
        }),
      },
    ],
    maintNpcRows: [
      { source_id: 285, internal_name: 'DiabolistRed', english_name: 'Diabolist' },
      { source_id: 286, internal_name: 'DiabolistWhite', english_name: 'Diabolist' },
      { source_id: 439, internal_name: 'CultistBoss', english_name: 'Lunatic Cultist' },
      { source_id: 440, internal_name: 'CultistBossClone', english_name: 'Lunatic Cultist' },
      { source_id: 305, internal_name: 'Scarecrow1', english_name: 'Scarecrow' },
      { source_id: 306, internal_name: 'Scarecrow2', english_name: 'Scarecrow' },
      { source_id: 307, internal_name: 'Scarecrow3', english_name: 'Scarecrow' },
      { source_id: 308, internal_name: 'Scarecrow4', english_name: 'Scarecrow' },
      { source_id: 309, internal_name: 'Scarecrow5', english_name: 'Scarecrow' },
      { source_id: 310, internal_name: 'Scarecrow6', english_name: 'Scarecrow' },
      { source_id: 311, internal_name: 'Scarecrow7', english_name: 'Scarecrow' },
      { source_id: 312, internal_name: 'Scarecrow8', english_name: 'Scarecrow' },
      { source_id: 313, internal_name: 'Scarecrow9', english_name: 'Scarecrow' },
      { source_id: 314, internal_name: 'Scarecrow10', english_name: 'Scarecrow' },
    ],
    relationBuffImageRows: [],
  });

  const onFire = payload.projectionBuffs.find((row) => row.internalName === 'OnFire');
  const weak = payload.projectionBuffs.find((row) => row.internalName === 'Weak');
  assert.deepEqual(
    JSON.parse(onFire.inflictingNpcsJson).map((row) => row.internalName),
    ['DiabolistRed', 'CultistBoss']
  );
  assert.deepEqual(
    JSON.parse(weak.inflictingNpcsJson).map((row) => row.internalName).sort((left, right) => {
      const leftIndex = Number(left.replace('Scarecrow', ''));
      const rightIndex = Number(right.replace('Scarecrow', ''));
      return leftIndex - rightIndex;
    }),
    [
      'Scarecrow1',
      'Scarecrow2',
      'Scarecrow3',
      'Scarecrow4',
      'Scarecrow5',
      'Scarecrow6',
      'Scarecrow7',
      'Scarecrow8',
      'Scarecrow9',
      'Scarecrow10',
    ]
  );
  assert.equal(payload.npcBuffRelations.length, 12);
});

test('buildBuffRelationSyncPayload does not project unresolved inflicting npc facts', () => {
  const payload = buildBuffRelationSyncPayload({
    maintBuffRows: [
      {
        id: 48,
        source_id: 48,
        internal_name: 'Honey',
        english_name: 'Honey',
        raw_json: JSON.stringify({
          sourceItems: [],
          inflictingNpcs: [
            { internalName: 'HoneySlime', name: 'Honey Slime', sourceSection: 'From enemy' },
          ],
          sourceEvidence: { parseStatus: 'parsed' },
        }),
      },
    ],
    maintItemRows: [],
    maintNpcRows: [],
    relationBuffImageRows: [],
  });

  assert.equal(payload.npcBuffRelations.length, 0);
  assert.equal(payload.issues.length, 1);
  assert.deepEqual(JSON.parse(payload.projectionBuffs[0].inflictingNpcsJson), []);
});

test('buildBuffRelationSyncPayload normalizes source item projection from resolved item relations', () => {
  const payload = buildBuffRelationSyncPayload({
    maintBuffRows: [
      {
        id: 21,
        source_id: 21,
        internal_name: 'PotionSickness',
        english_name: 'Potion Sickness',
        raw_json: JSON.stringify({
          sourceItemCount: 2,
          sourceItems: [
            {
              itemId: 5,
              internalName: 'Mushroom',
              name: 'Mushroom',
              sourceSection: 'From item',
            },
            {
              itemId: null,
              internalName: 'JungleJuice',
              name: 'Jungle Juice',
              sourceSection: 'From item',
            },
          ],
          inflictingNpcs: [],
        }),
      },
      {
        id: 46,
        source_id: 46,
        internal_name: 'Chilled',
        english_name: 'Chilled',
        raw_json: JSON.stringify({
          sourceItemCount: 2,
          sourceItems: [
            { internalName: 'Water', name: 'Water', sourceKind: 'environment', sourceSection: 'From environment' },
            { internalName: 'Shimmer', name: 'Shimmer', sourceKind: 'environment', sourceSection: 'From environment' },
          ],
          inflictingNpcs: [],
        }),
      },
    ],
    maintItemRows: [
      { source_id: 5, internal_name: 'Mushroom', english_name: 'Mushroom' },
      { source_id: 5496, internal_name: 'LifeFruitHealingPotion', english_name: 'Jungle Juice' },
    ],
    maintNpcRows: [],
    relationBuffImageRows: [],
  });

  const potionSickness = payload.projectionBuffs.find((row) => row.internalName === 'PotionSickness');
  const chilled = payload.projectionBuffs.find((row) => row.internalName === 'Chilled');
  const sourceItems = JSON.parse(potionSickness.sourceItemsJson);

  assert.deepEqual(sourceItems.map((row) => row.internalName).sort(), ['LifeFruitHealingPotion', 'Mushroom']);
  const jungleJuice = sourceItems.find((row) => row.internalName === 'LifeFruitHealingPotion');
  assert.equal(jungleJuice.sourceId, 5496);
  assert.equal(jungleJuice.name, 'Jungle Juice');
  assert.deepEqual(JSON.parse(chilled.sourceItemsJson), []);
  assert.equal(chilled.sourceItemCount, 0);
});

test('runBuffRelationSync dry-run does not mutate relation tables', async () => {
  const relationQueries = [];
  const result = await runBuffRelationSync(
    {
      apply: false,
      maintDatabase: 'terria_v1_local',
      relationDatabase: 'terria_v1_relation',
      localDatabase: 'terria_v1_local',
    },
    {
      queryMaint: async (sql) => {
        if (sql.includes('maint_buffs')) {
          return [
            {
              id: 11,
              source_id: 337,
              internal_name: 'ShadowFlame',
              english_name: 'Shadowflame',
              raw_json: JSON.stringify({ sourceItems: [], inflictingNpcs: [] }),
            },
          ];
        }
        return [];
      },
      queryRelation: async (sql) => {
        relationQueries.push(sql);
        return [];
      },
      executeRelation: async () => {
        throw new Error('dry-run should not execute relation writes');
      },
      writeReport: async () => {},
    },
  );

  assert.equal(result.apply, false);
  assert.equal(result.rows.relationBuffs, 1);
  assert.equal(result.writes.total, 0);
  assert.equal(result.candidateStatus, 'inventory-only');
  assert.equal(result.executable, false);
  assert.ok(relationQueries.some((sql) => sql.includes('relation_buff_images')));
});

test('runBuffRelationSync reads MATCHED crawler facts before building NPC buff relations', async () => {
  const maintQueries = [];
  const result = await runBuffRelationSync({ apply: false }, {
    config: { database: {} },
    queryMaint: async (sql) => {
      maintQueries.push(sql);
      if (sql.includes('maint_npc_crawler_facts')) return [{
        record_key: 'a'.repeat(64),
        npc_source_id: 477,
        npc_internal_name: 'Medusa',
        npc_name: 'Medusa',
        match_status: 'MATCHED',
        buff_inflictions_json: JSON.stringify([{ buffName: 'Stoned' }]),
      }];
      if (sql.includes('maint_buffs')) return [{
        source_id: 156,
        internal_name: 'Stoned',
        english_name: 'Stoned',
        raw_json: JSON.stringify({ inflictingNpcs: [] }),
      }];
      if (sql.includes('maint_npcs')) return [{ source_id: 477, internal_name: 'Medusa', english_name: 'Medusa' }];
      return [];
    },
    queryRelation: async () => [],
    writeReport: async () => 'reports/relation/test.json',
  });

  assert.ok(maintQueries.some((sql) => sql.includes('maint_npc_crawler_facts')));
  assert.equal(result.rows.npcBuffRelations, 1);
});

for (const options of [
  { apply: true },
  { apply: true, prepareSchema: true },
  { prepareSchema: true },
  { apply: true, registeredExecutor: true, hasFreshPacket: true, operation: 'canonical-buff-image-projection-apply' },
]) {
  test(`general Buff sync rejects unregistered writes before any dependency: ${JSON.stringify(options)}`, async () => {
    let reads = 0;
    const dependencies = new Proxy({}, { get() { reads += 1; throw new Error('dependency accessed'); } });
    await assert.rejects(runBuffRelationSync(options, dependencies), /registered-executor-required/);
    assert.equal(reads, 0);
  });
}

const BUFF_TABLES = ['relation_buffs', 'item_buff_relations', 'npc_buff_relations', 'relation_buff_images', 'projection_buffs'];
const IMAGE_PREFIX = 'https://media.example.test/terrapedia-images/buffs/';

function candidateFixture({ extraImages = [], rawFields = {} } = {}) {
  const evidence = parseBuffPageEvidence({
    wikitext: '== Immune NPCs ==\n{{immunities|24}}',
    buffId: 24,
    buffName: 'On Fire!',
    pageTitle: 'On Fire!',
    revisionId: 12345,
    revisionTimestamp: '2026-09-23T01:02:03Z',
    html: '<h2><span class="mw-headline" id="Immune_NPCs">Immune NPCs</span></h2><div class="itemlist"><ul><li><span class="i"><a href="/wiki/Fire_Imp" title="Fire Imp"><img src="/images/Fire_Imp.png" /></a><span><span><a href="/wiki/Fire_Imp" title="Fire Imp">Fire Imp</a></span></span></span></li></ul></div><h2><span class="mw-headline" id="Notes">Notes</span></h2>',
  });
  assert.equal(evidence.sourceEvidence.factGroups.immuneNpcs.status, 'parsed');
  const record = { id: 24, internalName: 'OnFire', englishName: 'On Fire!', ...evidence, ...rawFields };
  const source = { records: [record] };
  const landingRow = {
    id: 31,
    dataset_type: 'buffs_raw',
    provider: 'terraria.wiki.gg',
    source_key: 'generated.buffs.standardized',
    source_page: 'Module:Buffinfo/data',
    source_revision_timestamp: '2026-09-22T00:00:00Z',
    content_hash: createHash('sha256').update(JSON.stringify(source)).digest('hex'),
    payload_json: JSON.stringify(source),
    parse_status: 'ok',
    is_current: 1,
  };
  const maintBuffRows = [{
    id: 11, record_key: 'a'.repeat(64), source_id: 24, internal_name: 'OnFire',
    english_name: record.name ?? record.englishName, name_zh: record.localized?.zh?.name,
    raw_json: JSON.stringify(record), landing_source_id: 31, landing_source_key: landingRow.source_key,
    landing_content_hash: landingRow.content_hash, source_provider: landingRow.provider,
    source_page: landingRow.source_page, source_revision_timestamp: landingRow.source_revision_timestamp,
  }];
  const image = {
    record_key: 'b'.repeat(64), buff_internal_name: 'OnFire', role: 'icon',
    original_url: 'https://terraria.wiki.gg/images/On_Fire.png',
    cached_url: `${IMAGE_PREFIX}OnFire.png`, is_primary: 1, status: 1, deleted: 0,
  };
  return {
    payload: buildBuffRelationSyncPayload({ maintBuffRows, relationBuffImageRows: [image, ...extraImages], managedImageUrlPrefixes: [IMAGE_PREFIX] }),
    currentRows: { ...Object.fromEntries(BUFF_TABLES.map((table) => [table, []])), relation_buff_images: [image, ...extraImages] },
    landingRows: [landingRow],
    pageEvidenceByInternalName: new Map([['OnFire', evidence]]),
    managedImageUrlPrefixes: [IMAGE_PREFIX],
  };
}

function addBoundSourceItem(input) {
  const item = { itemId: 101, internalName: 'MagicItem' };
  const relation = input.payload.relationBuffs[0];
  const raw = JSON.parse(relation.rawJson);
  raw.sourceItemCount = 1;
  raw.sourceItems = [item];
  relation.rawJson = JSON.stringify(raw);
  relation.sourceItemCount = 1;
  relation.sourceItemsJson = JSON.stringify(raw.sourceItems);
  const landing = input.landingRows[0];
  const landingPayload = JSON.parse(landing.payload_json);
  landingPayload.records[0].sourceItemCount = 1;
  landingPayload.records[0].sourceItems = [item];
  landing.payload_json = JSON.stringify(landingPayload);
  landing.content_hash = createHash('sha256').update(JSON.stringify(landingPayload)).digest('hex');
  relation.landingContentHash = landing.content_hash;
  return relation;
}

function addBoundInflictingNpc(input) {
  const npc = { npcId: 202, internalName: 'BoundNpc', name: 'Bound NPC' };
  const relation = input.payload.relationBuffs[0];
  const raw = JSON.parse(relation.rawJson);
  raw.inflictingNpcs = [npc];
  relation.rawJson = JSON.stringify(raw);
  relation.inflictingNpcsJson = JSON.stringify(raw.inflictingNpcs);
  const landing = input.landingRows[0];
  const landingPayload = JSON.parse(landing.payload_json);
  landingPayload.records[0].inflictingNpcs = [npc];
  landing.payload_json = JSON.stringify(landingPayload);
  landing.content_hash = createHash('sha256').update(JSON.stringify(landingPayload)).digest('hex');
  relation.landingContentHash = landing.content_hash;
  return relation;
}

function partialCandidateFixture() {
  const input = candidateFixture();
  const baselineRelation = structuredClone(input.payload.relationBuffs[0]);
  const baselineProjection = structuredClone(input.payload.projectionBuffs[0]);
  const baselineImmune = JSON.parse(baselineRelation.immuneNpcsJson);
  const baselineSample = JSON.parse(baselineRelation.immuneNpcSampleJson);
  const item = { itemId: 101, internalName: 'MagicItem' };
  const partialRecord = {
    id: 24,
    internalName: 'OnFire',
    englishName: 'On Fire!',
    sourceItemCount: 1,
    sourceItems: [item],
    inflictingNpcs: [],
    sourceEvidence: {
      ...JSON.parse(baselineRelation.rawJson).sourceEvidence,
      factGroups: {
        sourceItems: { status: 'parsed', count: 1, sections: ['From item'] },
        inflictingNpcs: { status: 'section_missing', count: 0, sections: [] },
        immuneNpcs: { status: 'section_missing', count: 0, sections: [] },
      },
      unresolvedFacts: [],
    },
  };
  const landing = structuredClone(input.landingRows[0]);
  const landingPayload = { records: [partialRecord] };
  landing.payload_json = JSON.stringify(landingPayload);
  landing.content_hash = createHash('sha256').update(JSON.stringify(landingPayload)).digest('hex');
  const maintRow = {
    ...input.payload.relationBuffs[0],
    rawJson: JSON.stringify(partialRecord),
    sourceItemCount: 1,
    sourceItemsJson: JSON.stringify(partialRecord.sourceItems),
    inflictingNpcsJson: JSON.stringify(partialRecord.inflictingNpcs),
    immuneNpcsJson: null,
    immuneNpcCount: null,
    immuneNpcSampleJson: null,
    landingSourceId: landing.id,
    landingSourceKey: landing.source_key,
    landingContentHash: landing.content_hash,
    sourceProvider: landing.provider,
    sourcePage: landing.source_page,
    sourceRevisionTimestamp: landing.source_revision_timestamp,
  };
  const partialPayload = {
    ...input.payload,
    relationBuffs: [maintRow],
    projectionBuffs: [{ ...input.payload.projectionBuffs[0], immuneNpcsJson: null, immuneNpcCount: null, immuneNpcSampleJson: null }],
    npcBuffRelations: [],
  };
  const baseline = {
    ...input.currentRows,
    relation_buffs: [{ ...baselineRelation, rawJson: JSON.stringify(JSON.parse(baselineRelation.rawJson)) }],
    projection_buffs: [baselineProjection],
    npc_buff_relations: [{
      recordKey: 'd'.repeat(64),
      buffSourceId: 24,
      buffInternalName: 'OnFire',
      npcSourceId: 900,
      npcInternalName: 'UnknownNpc',
      relationType: 'immune',
      sourceMaintTable: 'maint_npcs',
      sourceMaintRecordKey: 'e'.repeat(64),
      landingSourceId: landing.id,
      landingSourceKey: landing.source_key,
      landingContentHash: landing.content_hash,
      sourceProvider: landing.provider,
      sourcePage: landing.source_page,
      sourceRevisionTimestamp: landing.source_revision_timestamp,
      status: 1,
      deleted: 0,
    }],
  };
  const plan = buildBuffPartialFactPlan({
    record: partialRecord,
    baseline: {
      inflictingNpcs: [],
      immuneNpcs: baselineImmune,
      immuneNpcCount: baselineRelation.immuneNpcCount,
      immuneNpcSample: baselineSample,
    },
  });
  return {
    ...input,
    payload: partialPayload,
    currentRows: baseline,
    landingRows: [landing],
    pageEvidenceByInternalName: new Map(),
    partialFactPlansByInternalName: new Map([['OnFire', plan]]),
  };
}

test('Buff partial candidate preserves unknown immunity and omitted secondary rows while recording disposition', () => {
  const input = partialCandidateFixture();
  const plan = buildBuffIncrementalMutationPlan(input);
  const relation = plan.expectedRows.relation_buffs[0];
  const projection = plan.expectedRows.projection_buffs[0];
  assert.deepEqual(JSON.parse(relation.raw_json).sourceItems, [{ itemId: 101, internalName: 'MagicItem' }]);
  assert.deepEqual(JSON.parse(relation.immune_npcs_json), JSON.parse(input.currentRows.relation_buffs[0].immuneNpcsJson));
  assert.equal(relation.immune_npc_count, input.currentRows.relation_buffs[0].immuneNpcCount);
  assert.deepEqual(JSON.parse(relation.immune_npc_sample_json), input.partialFactPlansByInternalName.get('OnFire').baseline.immuneNpcSample);
  assert.deepEqual(JSON.parse(projection.immune_npcs_json), JSON.parse(relation.immune_npcs_json));
  assert.equal(plan.changes.npc_buff_relations.preserved.length, 1);
  assert.equal(JSON.parse(relation.source_evidence_json).partialFactDisposition.status, 'partial');
});

test('Buff partial candidate rejects source or baseline drift', () => {
  const input = partialCandidateFixture();
  input.partialFactPlansByInternalName.get('OnFire').source.revisionId += 1;
  assert.throws(() => buildBuffIncrementalMutationPlan(input), /partial.*revision|source.*binding|drift/i);
  const missing = partialCandidateFixture();
  missing.currentRows.relation_buffs[0].immune_npcs_json = null;
  assert.throws(() => buildBuffIncrementalMutationPlan(missing), /baseline|immune/i);
});

test('Buff partial candidate preserves the inflicting baseline and adds revision-bound positive facts', () => {
  const input = partialCandidateFixture();
  const baselineNpc = { npcId: 900, internalName: 'BaselineNpc', name: 'Baseline NPC' };
  const positiveNpc = {
    npcId: 113,
    internalName: 'WallofFlesh',
    name: 'Wall of Flesh',
    relationType: 'inflicts',
    buffId: 24,
    buffInternalName: 'OnFire',
    sourcePage: 'Wall of Flesh',
    sourcePageId: 10220,
    sourceRevisionId: 1032375,
    sourceRevisionTimestamp: '2026-09-30T00:00:00Z',
  };
  const positiveFact = {
    relationType: 'inflicts',
    npcSourceId: positiveNpc.npcId,
    npcInternalName: positiveNpc.internalName,
    npcName: positiveNpc.name,
    buffId: 24,
    buffInternalName: 'OnFire',
    buffName: 'On Fire!',
    durationText: 'permanent',
    sourcePage: 'Wall of Flesh',
    sourcePageId: 10220,
    sourceRevisionId: 1032375,
    sourceRevisionTimestamp: '2026-09-30T00:00:00Z',
  };

  const baselineRelation = input.currentRows.relation_buffs[0];
  const baselineRaw = JSON.parse(baselineRelation.rawJson);
  baselineRaw.inflictingNpcs = [baselineNpc, positiveNpc];
  baselineRelation.rawJson = JSON.stringify(baselineRaw);
  baselineRelation.inflictingNpcsJson = JSON.stringify([baselineNpc, positiveNpc]);
  input.currentRows.npc_buff_relations.push({
    recordKey: 'f'.repeat(64),
    buffSourceId: 24,
    buffInternalName: 'OnFire',
    npcSourceId: baselineNpc.npcId,
    npcInternalName: baselineNpc.internalName,
    npcName: baselineNpc.name,
    relationType: 'inflicts',
    sourceMaintTable: 'maint_buffs',
    sourceMaintRecordKey: baselineRelation.recordKey,
    landingSourceId: baselineRelation.landingSourceId,
    landingSourceKey: baselineRelation.landingSourceKey,
    landingContentHash: baselineRelation.landingContentHash,
    sourceProvider: baselineRelation.sourceProvider,
    sourcePage: baselineRelation.sourcePage,
    sourceRevisionTimestamp: baselineRelation.sourceRevisionTimestamp,
    status: 1,
    deleted: 0,
  });

  const partialRelation = input.payload.relationBuffs[0];
  const partialRecord = JSON.parse(partialRelation.rawJson);
  partialRecord.inflictingNpcs = [positiveNpc];
  partialRecord.sourceEvidence.inflictingNpcPositiveEvidence = {
    status: 'positive-infliction-facts-only',
    facts: [positiveFact],
    source: {
      provider: 'terraria.wiki.gg', pageTitle: 'Wall of Flesh', pageId: 10220,
      revisionId: 1032375, revisionTimestamp: '2026-09-30T00:00:00Z',
    },
  };
  partialRelation.rawJson = JSON.stringify(partialRecord);
  partialRelation.inflictingNpcsJson = JSON.stringify([positiveNpc]);
  input.payload.projectionBuffs[0].inflictingNpcsJson = JSON.stringify([positiveNpc]);

  const landing = input.landingRows[0];
  const landingPayload = { records: [partialRecord] };
  landing.payload_json = JSON.stringify(landingPayload);
  landing.content_hash = createHash('sha256').update(JSON.stringify(landingPayload)).digest('hex');
  partialRelation.landingContentHash = landing.content_hash;

  const plan = buildBuffPartialFactPlan({
    record: partialRecord,
    baseline: {
      sourceItems: [],
      inflictingNpcs: [baselineNpc, positiveNpc],
      immuneNpcs: JSON.parse(baselineRelation.immuneNpcsJson),
      immuneNpcCount: baselineRelation.immuneNpcCount,
      immuneNpcSample: JSON.parse(baselineRelation.immuneNpcSampleJson),
    },
  });
  input.partialFactPlansByInternalName = new Map([['OnFire', plan]]);
  input.payload.npcBuffRelations = [{
    recordKey: 'c'.repeat(64),
    buffSourceId: 24,
    buffInternalName: 'OnFire',
    npcSourceId: positiveNpc.npcId,
    npcInternalName: positiveNpc.internalName,
    npcName: positiveNpc.name,
    relationType: 'inflicts',
    sourceMaintTable: 'maint_buffs',
    sourceMaintRecordKey: partialRelation.recordKey,
    landingSourceId: partialRelation.landingSourceId,
    landingSourceKey: partialRelation.landingSourceKey,
    landingContentHash: partialRelation.landingContentHash,
    sourceProvider: partialRelation.sourceProvider,
    sourcePage: partialRelation.sourcePage,
    sourceRevisionTimestamp: partialRelation.sourceRevisionTimestamp,
  }];

  const candidate = buildBuffIncrementalMutationPlan(input);
  const expectedRelation = candidate.expectedRows.relation_buffs[0];
  const expectedProjection = candidate.expectedRows.projection_buffs[0];
  const merged = JSON.parse(expectedRelation.inflicting_npcs_json);

  assert.deepEqual(merged.map((row) => row.internalName), ['BaselineNpc', 'WallofFlesh']);
  assert.deepEqual(JSON.parse(expectedProjection.inflicting_npcs_json).map((row) => row.internalName), [
    'BaselineNpc', 'WallofFlesh',
  ]);
  assert.equal(candidate.executable, false);
  assert.equal(candidate.changes.npc_buff_relations.inserts.length, 1);
  assert.equal(candidate.changes.npc_buff_relations.preserved.length, 2);
});

test('Buff partial candidate rejects conflicting stable NPC identities', () => {
  const input = partialCandidateFixture();
  const baselineNpc = { npcId: 900, internalName: 'BaselineNpc', name: 'Baseline NPC' };
  const positiveNpc = {
    npcId: 900,
    internalName: 'RenamedNpc',
    name: 'Renamed NPC',
    relationType: 'inflicts',
    buffId: 24,
    buffInternalName: 'OnFire',
    sourcePage: 'Wall of Flesh',
    sourcePageId: 10220,
    sourceRevisionId: 1032375,
    sourceRevisionTimestamp: '2026-09-30T00:00:00Z',
  };
  const positiveFact = {
    relationType: 'inflicts',
    npcSourceId: positiveNpc.npcId,
    npcInternalName: positiveNpc.internalName,
    npcName: positiveNpc.name,
    buffId: 24,
    buffInternalName: 'OnFire',
    buffName: 'On Fire!',
    sourcePage: 'Wall of Flesh',
    sourcePageId: 10220,
    sourceRevisionId: 1032375,
    sourceRevisionTimestamp: '2026-09-30T00:00:00Z',
  };
  const baselineRelation = input.currentRows.relation_buffs[0];
  const baselineRaw = JSON.parse(baselineRelation.rawJson);
  baselineRaw.inflictingNpcs = [baselineNpc];
  baselineRelation.rawJson = JSON.stringify(baselineRaw);
  baselineRelation.inflictingNpcsJson = JSON.stringify([baselineNpc]);
  const partialRelation = input.payload.relationBuffs[0];
  const partialRecord = JSON.parse(partialRelation.rawJson);
  partialRecord.inflictingNpcs = [positiveNpc];
  partialRecord.sourceEvidence.inflictingNpcPositiveEvidence = {
    status: 'positive-infliction-facts-only',
    facts: [positiveFact],
    source: {
      provider: 'terraria.wiki.gg', pageTitle: 'Wall of Flesh', pageId: 10220,
      revisionId: 1032375, revisionTimestamp: '2026-09-30T00:00:00Z',
    },
  };
  partialRelation.rawJson = JSON.stringify(partialRecord);
  partialRelation.inflictingNpcsJson = JSON.stringify([positiveNpc]);
  const landing = input.landingRows[0];
  const landingPayload = { records: [partialRecord] };
  landing.payload_json = JSON.stringify(landingPayload);
  landing.content_hash = createHash('sha256').update(landing.payload_json).digest('hex');
  partialRelation.landingContentHash = landing.content_hash;
  const plan = buildBuffPartialFactPlan({
    record: partialRecord,
    baseline: {
      sourceItems: [], inflictingNpcs: [baselineNpc],
      immuneNpcs: JSON.parse(baselineRelation.immuneNpcsJson),
      immuneNpcCount: baselineRelation.immuneNpcCount,
      immuneNpcSample: JSON.parse(baselineRelation.immuneNpcSampleJson),
    },
  });
  input.partialFactPlansByInternalName = new Map([['OnFire', plan]]);
  input.payload.npcBuffRelations = [];
  assert.throws(() => buildBuffIncrementalMutationPlan(input), /conflicting.*identity|identity.*conflict/i);
});

test('Buff partial candidate rejects additive NPC facts without reverse relation rows', () => {
  const input = partialCandidateFixture();
  const positiveNpc = {
    npcId: 113,
    internalName: 'WallofFlesh',
    name: 'Wall of Flesh',
    relationType: 'inflicts',
    buffId: 24,
    buffInternalName: 'OnFire',
    sourcePage: 'Wall of Flesh',
    sourcePageId: 10220,
    sourceRevisionId: 1032375,
    sourceRevisionTimestamp: '2026-09-30T00:00:00Z',
  };
  const partialRelation = input.payload.relationBuffs[0];
  const partialRecord = JSON.parse(partialRelation.rawJson);
  partialRecord.inflictingNpcs = [positiveNpc];
  partialRecord.sourceEvidence.inflictingNpcPositiveEvidence = {
    status: 'positive-infliction-facts-only',
    facts: [{
      relationType: 'inflicts', npcSourceId: 113, npcInternalName: 'WallofFlesh', npcName: 'Wall of Flesh',
      buffId: 24, buffInternalName: 'OnFire', sourcePage: 'Wall of Flesh', sourcePageId: 10220,
      sourceRevisionId: 1032375, sourceRevisionTimestamp: '2026-09-30T00:00:00Z',
    }],
    source: {
      provider: 'terraria.wiki.gg', pageTitle: 'Wall of Flesh', pageId: 10220,
      revisionId: 1032375, revisionTimestamp: '2026-09-30T00:00:00Z',
    },
  };
  partialRelation.rawJson = JSON.stringify(partialRecord);
  partialRelation.inflictingNpcsJson = JSON.stringify([positiveNpc]);
  const landing = input.landingRows[0];
  const landingPayload = { records: [partialRecord] };
  landing.payload_json = JSON.stringify(landingPayload);
  landing.content_hash = createHash('sha256').update(landing.payload_json).digest('hex');
  partialRelation.landingContentHash = landing.content_hash;
  const baselineRelation = input.currentRows.relation_buffs[0];
  const plan = buildBuffPartialFactPlan({
    record: partialRecord,
    baseline: {
      sourceItems: [], inflictingNpcs: [],
      immuneNpcs: JSON.parse(baselineRelation.immuneNpcsJson),
      immuneNpcCount: baselineRelation.immuneNpcCount,
      immuneNpcSample: JSON.parse(baselineRelation.immuneNpcSampleJson),
    },
  });
  input.partialFactPlansByInternalName = new Map([['OnFire', plan]]);
  input.payload.npcBuffRelations = [];
  assert.throws(() => buildBuffIncrementalMutationPlan(input), /additive.*relation|reverse.*coverage/i);
});

test('normalizes the real page producer revision identity without top-level fallback', () => {
  const evidence = candidateFixture().pageEvidenceByInternalName.get('OnFire');
  const result = normalizeBuffPageEvidence({ evidence });
  assert.equal(result.revisionId, 12345);
  assert.equal(result.revisionTimestamp, '2026-09-23T01:02:03Z');
});

test('normalizer rejects explicitly unresolved target binding despite parsed metadata', () => {
  for (const status of ['unverified', 'mismatch', 'ambiguous']) {
    const evidence = candidateFixture().pageEvidenceByInternalName.get('OnFire');
    evidence.sourceEvidence.immunityTargetBinding = { status, targets: [] };
    assert.throws(() => normalizeBuffPageEvidence({ evidence }), /target binding/);
  }
});

test('normalizer accepts a target-mismatched page when a complete alternate binds the immunity group', () => {
  const evidence = candidateFixture().pageEvidenceByInternalName.get('OnFire');
  evidence.sourceEvidence.parseStatus = 'parse_incomplete';
  evidence.sourceEvidence.factGroups.immuneNpcs = { status: 'target_mismatch', count: 0, sections: ['Immune NPCs'] };
  evidence.sourceEvidence.unresolvedFacts = [{ group: 'immuneNpcs', status: 'target_mismatch', sections: ['Immune NPCs'] }];
  evidence.sourceEvidence.immuneNpcPositiveEvidence = {
    immuneNpcPositiveEvidence: {
      status: 'complete-npc-scope',
      assertions: [{ npcId: 1, npcInternalName: 'BlueSlime', npcName: 'Blue Slime' }],
    },
  };
  evidence.immuneNpcs = [{ npcId: 1, internalName: 'BlueSlime', name: 'Blue Slime', pageTitle: 'Blue Slime' }];
  evidence.immuneNpcCount = 1;
  evidence.immuneNpcSample = [...evidence.immuneNpcs];
  const result = normalizeBuffPageEvidence({ evidence });
  assert.equal(result.hasImmuneSection, false);
  assert.deepEqual(result.immuneNpcs.map(row => row.internalName), ['BlueSlime']);
});

test('unverified binding without an immunity section remains a missing-section failure', () => {
  const evidence = candidateFixture().pageEvidenceByInternalName.get('OnFire');
  evidence.sourceEvidence.factGroups.immuneNpcs = { status: 'section_missing', sections: [] };
  evidence.sourceEvidence.parseStatus = 'parse_incomplete';
  evidence.sourceEvidence.unresolvedFacts = [{ group: 'immuneNpcs', status: 'section_missing', sections: [] }];
  evidence.sourceEvidence.immunityTargetBinding = { status: 'unverified', targets: [] };
  assert.throws(() => normalizeBuffPageEvidence({ evidence }), /incomplete/);
});

test('Buff payload maps database image columns before projecting the cached image', () => {
  assert.equal(candidateFixture().payload.projectionBuffs[0].image, `${IMAGE_PREFIX}OnFire.png`);
});

test('Buff payload excludes inactive images from publication and candidate preserves them unchanged', () => {
  const inactive = {
    record_key: 'c'.repeat(64), buff_internal_name: 'OnFire', role: 'icon',
    cached_url: 'https://unmanaged.example.test/old.png', is_primary: 1, status: 0, deleted: 0,
  };
  const input = candidateFixture({ extraImages: [inactive] });
  assert.equal(input.payload.relationBuffImages.length, 1);
  assert.equal(input.payload.projectionBuffs[0].image, `${IMAGE_PREFIX}OnFire.png`);
  const plan = buildBuffIncrementalMutationPlan(input);
  assert.deepEqual(plan.changes.relation_buff_images.preserved, [inactive]);
  assert.equal(plan.changes.relation_buff_images.updates.length, 0);
});

test('Buff candidate computes inserts, preserves unmatched rows, and becomes a semantic no-op', () => {
  const input = candidateFixture();
  const unmatched = { record_key: 'c'.repeat(64), source_id: 33, internal_name: 'Weak', raw_json: '{"untouched":true}' };
  input.currentRows.relation_buffs.push(unmatched);
  const first = buildBuffIncrementalMutationPlan(input);
  assert.equal(first.changes.relation_buffs.inserts.length, 1);
  assert.equal(first.changes.projection_buffs.inserts.length, 1);
  assert.equal(first.changes.relation_buff_images.inserts.length, 0);
  assert.equal(first.changes.relation_buff_images.updates.length, 0);
  assert.deepEqual(first.changes.relation_buffs.preserved, [unmatched]);
  assert.deepEqual(first.deletes, []);
  assert.equal(first.executable, false);
  const second = buildBuffIncrementalMutationPlan({ ...input, currentRows: first.expectedRows });
  assert.equal(second.summary.inserts, 0);
  assert.equal(second.summary.updates, 0);
  assert.equal(second.summary.unchanged, 3);
});

test('Buff candidate emits only changed columns and preserves generated timestamps', () => {
  const input = candidateFixture();
  const baseline = buildBuffIncrementalMutationPlan(input).expectedRows;
  baseline.relation_buffs[0].tooltip_en = 'stale';
  baseline.relation_buffs[0].id = 412;
  baseline.relation_buffs[0].created_at = '2026-01-01T00:00:00Z';
  baseline.relation_buffs[0].updated_at = '2026-09-01T00:00:00Z';
  baseline.projection_buffs[0].immune_npcs_json = JSON.stringify(JSON.parse(baseline.projection_buffs[0].immune_npcs_json), null, 2);
  const result = buildBuffIncrementalMutationPlan({ ...input, currentRows: baseline });
  assert.deepEqual(result.changes.relation_buffs.updates[0].changedColumns, ['tooltip_en']);
  assert.equal(result.expectedRows.relation_buffs[0].id, 412);
  assert.equal(result.expectedRows.relation_buffs[0].created_at, '2026-01-01T00:00:00Z');
  assert.equal(result.changes.projection_buffs.updates.length, 0);
});

test('Buff candidate rejects secondary relations whose facts, owner trace, or relation type are not page-bound', () => {
  const input = candidateFixture();
  const relation = addBoundSourceItem(input);
  const row = {
    record_key: 'd'.repeat(64), item_source_id: 101, item_internal_name: 'MagicItem',
    buff_source_id: relation.sourceId, buff_internal_name: relation.internalName,
    relation_type: 'buff_source_item', source_maint_table: 'maint_buffs', source_maint_record_key: 'a'.repeat(64),
    landing_source_id: 31, landing_source_key: input.landingRows[0].source_key,
    landing_content_hash: input.landingRows[0].content_hash, source_provider: input.landingRows[0].provider,
    source_page: input.landingRows[0].source_page, source_revision_timestamp: input.landingRows[0].source_revision_timestamp,
    status: 1, deleted: 0,
  };
  input.payload.itemBuffRelations.push(row);
  assert.doesNotThrow(() => buildBuffIncrementalMutationPlan(input));
  row.item_internal_name = 'OtherItem';
  assert.throws(() => buildBuffIncrementalMutationPlan(input), /secondary.*identity|page-bound|source item/i);
  row.item_internal_name = 'MagicItem';
  row.source_maint_table = 'maint_items';
  assert.throws(() => buildBuffIncrementalMutationPlan(input), /owner trace|secondary/i);
});

test('Buff candidate rejects arbitrary secondary relation types and sort-order rekeying', () => {
  const input = candidateFixture();
  const relation = addBoundSourceItem(input);
  const row = {
    record_key: 'd'.repeat(64), item_source_id: 101, item_internal_name: 'MagicItem',
    buff_source_id: relation.sourceId, buff_internal_name: relation.internalName,
    relation_type: 'forged', source_maint_table: 'maint_buffs', source_maint_record_key: 'a'.repeat(64),
    landing_source_id: 31, landing_source_key: input.landingRows[0].source_key,
    landing_content_hash: input.landingRows[0].content_hash, source_provider: input.landingRows[0].provider,
    source_page: input.landingRows[0].source_page, source_revision_timestamp: input.landingRows[0].source_revision_timestamp,
    status: 1, deleted: 0,
  };
  input.payload.itemBuffRelations.push(row);
  assert.throws(() => buildBuffIncrementalMutationPlan(input), /relation type|secondary/i);
  row.relation_type = 'buff_source_item';
  input.currentRows.item_buff_relations.push({ ...row, record_key: 'e'.repeat(64) });
  assert.throws(() => buildBuffIncrementalMutationPlan(input), /remapped|identity|sort/i);
});

test('Buff candidate requires page buff identity, binds derived fields, and fingerprints managed prefixes', () => {
  const input = candidateFixture();
  input.pageEvidenceByInternalName.get('OnFire').buffId = undefined;
  assert.throws(() => buildBuffIncrementalMutationPlan(input), /buff identity|page evidence/i);
  const valid = candidateFixture();
  valid.payload.relationBuffs[0].sourceItemCount = 99;
  assert.throws(() => buildBuffIncrementalMutationPlan(valid), /source item|derived|landing/i);
  const bound = buildBuffIncrementalMutationPlan(candidateFixture());
  assert.match(bound.managedImageUrlPrefixesSha256, /^sha256:[a-f0-9]{64}$/);
});

test('Buff candidate binds standardized id-only page evidence to the relation identity', () => {
  const input = candidateFixture();
  const evidence = input.pageEvidenceByInternalName.get('OnFire');
  evidence.buffId = undefined;
  evidence.id = 24;
  assert.doesNotThrow(() => buildBuffIncrementalMutationPlan(input));

  const drifted = candidateFixture();
  const driftedEvidence = drifted.pageEvidenceByInternalName.get('OnFire');
  driftedEvidence.buffId = undefined;
  driftedEvidence.id = 25;
  assert.throws(() => buildBuffIncrementalMutationPlan(drifted), /identity/);
});

for (const field of ['englishName', 'nameZh', 'buffType', 'tooltipEn', 'tooltipZh']) {
  test(`Buff candidate rejects unbound relation ${field}, including absent source values`, () => {
    const input = candidateFixture();
    input.payload.relationBuffs[0][field] = 'Forged';
    assert.throws(() => buildBuffIncrementalMutationPlan(input), /derived field/);
  });
  test(`Buff candidate rejects projection ${field} drift from relation`, () => {
    const input = candidateFixture();
    input.payload.projectionBuffs[0][field] = 'Forged';
    assert.throws(() => buildBuffIncrementalMutationPlan(input), /projection field/);
  });
}

test('Buff candidate rejects conflicting page ID aliases', () => {
  const input = candidateFixture();
  input.pageEvidenceByInternalName.get('OnFire').id = 25;
  assert.throws(() => buildBuffIncrementalMutationPlan(input), /identity/);
});

test('Buff candidate accepts scalar fields normalized by the real maint and relation builders', () => {
  const input = candidateFixture({ rawFields: {
    name: ' On Fire! ', type: ' debuff ',
    localized: { en: { tooltip: ' Taking damage ' }, zh: { name: ' 着火了！ ', tooltip: ' 持续受伤 ' } },
  } });
  const plan = buildBuffIncrementalMutationPlan(input);
  assert.equal(plan.expectedRows.relation_buffs[0].name_zh, '着火了！');
  assert.equal(plan.expectedRows.projection_buffs[0].tooltip_en, 'Taking damage');
});

test('Buff candidate output does not depend on current row order and accepts managed paths', () => {
  const input = candidateFixture();
  const imagePath = '/terrapedia-images/buffs/OnFire.png';
  input.payload.relationBuffImages[0].cachedUrl = imagePath;
  input.currentRows.relation_buff_images[0].cached_url = imagePath;
  input.payload.projectionBuffs[0].image = imagePath;
  input.currentRows.relation_buffs = [
    { record_key: 'd'.repeat(64), source_id: 47, internal_name: 'Frozen' },
    { record_key: 'c'.repeat(64), source_id: 33, internal_name: 'Weak' },
  ];
  const before = structuredClone(input);
  const first = buildBuffIncrementalMutationPlan(input);
  assert.deepEqual(input, before);
  const second = buildBuffIncrementalMutationPlan({ ...input, currentRows: {
    ...input.currentRows, relation_buffs: [...input.currentRows.relation_buffs].reverse(),
  } });
  assert.deepEqual(first, second);
});

const rejectionCases = [
  ['missing baseline table', (input) => { delete input.currentRows.npc_buff_relations; }, /snapshot/],
  ['unrelated current table', (input) => { input.currentRows.relation_items = []; }, /table/],
  ['unrelated payload table', (input) => { input.payload.relationItems = []; }, /table/],
  ['missing payload table', (input) => { delete input.payload.npcBuffRelations; }, /table/],
  ['missing evidence', (input) => { input.pageEvidenceByInternalName.clear(); }, /evidence/],
  ['empty evidence fallback', (input) => { input.pageEvidenceByInternalName.set('OnFire', { immuneNpcSource: 'buff-page-immunities' }); }, /evidence/],
  ['missing real revision', (input) => { delete input.pageEvidenceByInternalName.get('OnFire').sourceEvidence.revisionId; }, /revision/],
  ['wrong revision', (input) => { input.pageEvidenceByInternalName.get('OnFire').sourceEvidence.revisionId += 1; }, /binding/],
  ['wrong canonical page', (input) => { input.pageEvidenceByInternalName.get('OnFire').sourceEvidence.canonicalPageTitle = 'Poisoned'; }, /binding/],
  ['missing revision timestamp', (input) => { delete input.pageEvidenceByInternalName.get('OnFire').sourceEvidence.revisionTimestamp; }, /revision/],
  ['wrong source revision timestamp', (input) => { input.payload.relationBuffs[0].sourceRevisionTimestamp = '2020-01-01T00:00:00Z'; }, /binding/],
  ['wrong buff id', (input) => { input.pageEvidenceByInternalName.get('OnFire').buffId = 20; }, /identity/],
  ['invalid immunity JSON', (input) => { input.pageEvidenceByInternalName.get('OnFire').immuneNpcs = '{'; }, /immun/],
  ['invalid sample JSON', (input) => { input.pageEvidenceByInternalName.get('OnFire').immuneNpcSample = '{'; }, /sample/i],
  ['count larger than list', (input) => { input.pageEvidenceByInternalName.get('OnFire').immuneNpcCount = 2; }, /count/],
  ['negative count', (input) => { input.pageEvidenceByInternalName.get('OnFire').immuneNpcCount = -1; }, /count/],
  ['string count', (input) => { input.pageEvidenceByInternalName.get('OnFire').immuneNpcCount = '1'; }, /count/],
  ['fact-group count mismatch', (input) => { input.pageEvidenceByInternalName.get('OnFire').sourceEvidence.factGroups.immuneNpcs.count = 2; }, /count/],
  ['sample from another buff', (input) => { input.pageEvidenceByInternalName.get('OnFire').immuneNpcSample = [{ pageTitle: 'Other' }]; }, /sample/],
  ['section missing despite fallback', (input) => { input.pageEvidenceByInternalName.get('OnFire').sourceEvidence.factGroups.immuneNpcs.status = 'section_missing'; }, /immun/],
  ['unresolved parse errors', (input) => { input.pageEvidenceByInternalName.get('OnFire').sourceEvidence.unresolvedFacts.push({ group: 'immuneNpcs', status: 'no_rows' }); }, /incomplete/],
  ['unresolved payload facts', (input) => { input.payload.issues.push({ reason: 'buff_source_item_unresolved' }); }, /unresolved/],
  ['missing landing source', (input) => { input.landingRows = []; }, /landing/],
  ['wrong landing hash', (input) => { input.landingRows[0].content_hash = 'f'.repeat(64); }, /hash/],
  ['wrong relation hash', (input) => { input.payload.relationBuffs[0].landingContentHash = 'f'.repeat(64); }, /binding/],
  ['wrong raw record', (input) => { input.payload.relationBuffs[0].rawJson = '{}'; }, /binding/],
  ['invalid raw JSON', (input) => { input.payload.relationBuffs[0].rawJson = '{'; }, /JSON/],
  ['duplicate buff key', (input) => { input.payload.relationBuffs.push({ ...input.payload.relationBuffs[0] }); }, /duplicate/],
  ['duplicate baseline key', (input) => { input.currentRows.relation_buff_images.push({ ...input.currentRows.relation_buff_images[0] }); }, /duplicate/],
  ['remapped relation key', (input) => { input.currentRows.relation_buffs = [{ ...input.payload.relationBuffs[0], recordKey: 'e'.repeat(64) }]; }, /remapped/],
  ['remapped projection relation', (input) => { input.payload.projectionBuffs[0].relationRecordKey = 'e'.repeat(64); }, /identity/],
  ['remapped baseline projection lineage', (input) => { input.currentRows.projection_buffs = [{ ...input.payload.projectionBuffs[0], relationRecordKey: 'e'.repeat(64) }]; }, /remapped/],
  ['unexpected candidate column', (input) => { input.payload.relationBuffs[0].unownedColumn = 'value'; }, /column/],
  ['modified relation source facts', (input) => { input.payload.relationBuffs[0].sourceItemsJson = '[{"internalName":"Fake"}]'; }, /binding/],
  ['remapped item relation key', (input) => {
    const relation = addBoundSourceItem(input);
    const row = {
      recordKey: 'e'.repeat(64), buffSourceId: relation.sourceId, buffInternalName: relation.internalName,
      itemSourceId: 101, itemInternalName: 'MagicItem', relationType: 'buff_source_item',
      sourceMaintTable: 'maint_buffs', sourceMaintRecordKey: 'a'.repeat(64),
      landingSourceId: 31, landingSourceKey: input.landingRows[0].source_key,
      landingContentHash: input.landingRows[0].content_hash, sourceProvider: input.landingRows[0].provider,
      sourcePage: input.landingRows[0].source_page, sourceRevisionTimestamp: input.landingRows[0].source_revision_timestamp,
      status: 1, deleted: 0,
    };
    input.payload.itemBuffRelations = [row];
    input.currentRows.item_buff_relations = [{ ...row, itemInternalName: 'OtherItem', itemSourceId: 102 }];
  }, /remapped/],
  ['remapped NPC relation key', (input) => {
    const relation = addBoundInflictingNpc(input);
    const row = {
      recordKey: 'e'.repeat(64), buffSourceId: relation.sourceId, buffInternalName: relation.internalName,
      npcSourceId: 202, npcInternalName: 'BoundNpc', relationType: 'inflicts',
      sourceMaintTable: 'maint_buffs', sourceMaintRecordKey: 'a'.repeat(64),
      landingSourceId: 31, landingSourceKey: input.landingRows[0].source_key,
      landingContentHash: input.landingRows[0].content_hash, sourceProvider: input.landingRows[0].provider,
      sourcePage: input.landingRows[0].source_page, sourceRevisionTimestamp: input.landingRows[0].source_revision_timestamp,
      status: 1, deleted: 0,
    };
    input.payload.npcBuffRelations = [row];
    input.currentRows.npc_buff_relations = [{ ...row, relationType: 'immune' }];
  }, /remapped/],
  ['missing projection coverage', (input) => { input.payload.projectionBuffs = []; }, /coverage/],
  ['unrelated image row', (input) => { input.payload.relationBuffImages[0].buffInternalName = 'Weak'; }, /identity/],
  ['unrelated npc relation', (input) => { input.payload.npcBuffRelations.push({ recordKey: 'e'.repeat(64), buffInternalName: 'Weak', buffSourceId: 33 }); }, /identity/],
  ['empty prefixes', (input) => { input.managedImageUrlPrefixes = ['']; }, /prefix/],
  ['missing prefixes', (input) => { input.managedImageUrlPrefixes = []; }, /prefix/],
  ['URL credentials trick', (input) => { input.payload.projectionBuffs[0].image = `${IMAGE_PREFIX.replace('https://', 'https://user@')}OnFire.png`; }, /image/],
  ['URL path traversal', (input) => { input.payload.projectionBuffs[0].image = `${IMAGE_PREFIX}../items/Other.png`; }, /image/],
  ['URL encoded path traversal', (input) => { input.payload.projectionBuffs[0].image = `${IMAGE_PREFIX}%2e%2e%2fitems/Other.png`; }, /image/],
  ['root-relative encoded path traversal', (input) => { input.payload.projectionBuffs[0].image = '/terrapedia-images/buffs/%2e%2e/items/Other.png'; }, /image/],
  ['root-relative control normalization', (input) => {
    const image = '/terrapedia-images/buffs/.\n./items/Other.png';
    input.payload.relationBuffImages[0].cachedUrl = image;
    input.currentRows.relation_buff_images[0].cached_url = image;
    input.payload.projectionBuffs[0].image = image;
  }, /image/],
  ['root-relative nested escape', (input) => {
    const image = '/terrapedia-images/buffs/%252e%252e%252fitems/Other.png';
    input.payload.relationBuffImages[0].cachedUrl = image;
    input.currentRows.relation_buff_images[0].cached_url = image;
    input.payload.projectionBuffs[0].image = image;
  }, /image/],
  ['URL query trick', (input) => { input.payload.projectionBuffs[0].image += '?elsewhere=1'; }, /image/],
  ['projection-only managed image', (input) => { input.payload.projectionBuffs[0].image = `${IMAGE_PREFIX}Other.png`; }, /image/],
  ['unmanaged cached row', (input) => { input.payload.relationBuffImages[0].cachedUrl = 'https://terraria.wiki.gg/images/On_Fire.png'; }, /image/],
  ['unverified inserted image', (input) => { input.currentRows.relation_buff_images = []; }, /image/],
  ['omitted current managed image', (input) => { input.payload.relationBuffImages = []; input.payload.projectionBuffs[0].image = null; }, /image.*coverage/],
];

for (const [name, mutate, pattern] of rejectionCases) {
  test(`Buff candidate rejects ${name}`, () => {
    const input = candidateFixture();
    mutate(input);
    assert.throws(() => buildBuffIncrementalMutationPlan(input), pattern);
  });
}
