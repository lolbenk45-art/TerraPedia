import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBuffRelationSyncPayload,
  parseArgs,
  runBuffRelationSync,
} from './sync-buffs-to-relation.mjs';

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
  assert.ok(relationQueries.some((sql) => sql.includes('relation_buff_images')));
});

test('runBuffRelationSync apply only clears and writes buff relation tables', async () => {
  const statements = [];
  const result = await runBuffRelationSync(
    {
      apply: true,
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
              raw_json: JSON.stringify({
                sourceItems: [{ itemId: 1, internalName: 'ShadowFlameKnife' }],
                inflictingNpcs: [{ npcId: 54, internalName: 'Clothier' }],
              }),
            },
          ];
        }
        if (sql.includes('maint_items')) {
          return [{ source_id: 1, internal_name: 'ShadowFlameKnife' }];
        }
        if (sql.includes('maint_npcs')) {
          return [{ source_id: 54, internal_name: 'Clothier' }];
        }
        return [];
      },
      queryRelation: async () => [],
      executeRelation: async (callback) => {
        await callback({
          async query(sql) {
            statements.push(sql);
            if (sql.includes('information_schema.columns')) {
              return [[
                { COLUMN_NAME: 'id' },
                { COLUMN_NAME: 'inflicting_npcs_json' },
                { COLUMN_NAME: 'source_evidence_json' },
              ]];
            }
            return [];
          },
          async execute(sql) {
            statements.push(sql);
          },
        });
      },
      writeReport: async () => {},
    },
  );

  assert.equal(result.apply, true);
  assert.equal(result.rows.relationBuffs, 1);
  assert.equal(result.rows.itemBuffRelations, 1);
  assert.equal(result.rows.npcBuffRelations, 1);
  assert.ok(statements.some((sql) => /DELETE FROM `relation_buffs`/.test(sql)));
  assert.ok(statements.some((sql) => /DELETE FROM `projection_buffs`/.test(sql)));
  assert.ok(statements.some((sql) => /DELETE FROM `item_buff_relations`/.test(sql)));
  assert.ok(statements.some((sql) => /DELETE FROM `npc_buff_relations`/.test(sql)));
  assert.ok(statements.some((sql) => /INSERT INTO `relation_buffs`/.test(sql)));
  assert.ok(statements.some((sql) => /INSERT INTO `projection_buffs`/.test(sql)));
  assert.ok(statements.every((sql) => !/relation_items|projection_items|relation_npcs|projection_npcs|relation_projectiles|projection_projectiles/.test(sql)));
});

test('runBuffRelationSync applies buff projection migrations before writing existing tables', async () => {
  const statements = [];
  await runBuffRelationSync(
    {
      apply: true,
      maintDatabase: 'terria_v1_local',
      relationDatabase: 'terria_v1_relation',
      localDatabase: 'terria_v1_local',
    },
    {
      queryMaint: async (sql) => {
        if (sql.includes('maint_buffs')) {
          return [];
        }
        return [];
      },
      queryRelation: async () => [],
      executeRelation: async (callback) => {
        await callback({
          async query(sql, params) {
            statements.push({ sql, params });
            if (sql.includes('information_schema.columns')) {
              return [[
                { COLUMN_NAME: 'id' },
                { COLUMN_NAME: 'source_items_json' },
                { COLUMN_NAME: 'immune_npc_sample_json' },
              ]];
            }
            return [];
          },
          async execute(sql) {
            statements.push({ sql });
          },
        });
      },
      writeReport: async () => {},
    },
  );

  assert.ok(statements.some((statement) => /ALTER TABLE `terria_v1_relation`\.`relation_buffs` ADD COLUMN `inflicting_npcs_json`/.test(statement.sql)));
  assert.ok(statements.some((statement) => /ALTER TABLE `terria_v1_relation`\.`relation_buffs` ADD COLUMN `source_evidence_json`/.test(statement.sql)));
  assert.ok(statements.some((statement) => /ALTER TABLE `terria_v1_relation`\.`projection_buffs` ADD COLUMN `inflicting_npcs_json`/.test(statement.sql)));
  assert.ok(statements.some((statement) => /ALTER TABLE `terria_v1_relation`\.`projection_buffs` ADD COLUMN `source_evidence_json`/.test(statement.sql)));
});
