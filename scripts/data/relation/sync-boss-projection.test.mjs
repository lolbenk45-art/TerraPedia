import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseArgs,
  runBossProjectionSync
} from './sync-boss-projection.mjs';

test('parseArgs defaults to dry-run boss projection sync', () => {
  assert.deepEqual(parseArgs([]), {
    apply: false,
    localDatabase: 'terria_v1_local',
    relationDatabase: 'terria_v1_relation',
    dateTag: null
  });
});

test('runBossProjectionSync dry-run builds boss projection rows without writing', async () => {
  const statements = [];
  let reportPayload = null;

  const result = await runBossProjectionSync(
    {
      apply: false,
      relationDatabase: 'terria_v1_relation',
      dateTag: '2026-05-07'
    },
    {
      executeRelation: async (fn) => fn({
        query: async (sql) => {
          statements.push(sql);
          if (sql === 'START TRANSACTION') {
            return [[{ affectedRows: 0 }]];
          }
          if (sql === 'COMMIT') {
            return [[{ affectedRows: 0 }]];
          }
          if (sql === 'ROLLBACK') {
            return [[{ affectedRows: 0 }]];
          }
          if (sql === 'DELETE FROM `terria_v1_relation`.`projection_bosses`') {
            return [[{ affectedRows: 1 }]];
          }
          if (sql.includes('FROM `terria_v1_relation`.`relation_bosses`')) {
            return [[{
              recordKey: 'boss-record-key',
              progressionOrder: 1,
              orderWithinGroup: 1,
              groupType: 'PRE_HARDMODE',
              bossTitleEn: 'King Slime',
              bossTitleZh: '史莱姆王',
              pageTitleEn: 'King Slime',
              pageTitleZh: '史莱姆王',
              imageUrl: 'http://localhost:9000/terrapedia-images/bosses/king-slime.png',
              npcSourceId: 101,
              npcInternalName: 'KingSlime',
              npcMatchStatus: 'resolved',
              npcMatchCount: 1,
              npcMemberInternalNamesJson: JSON.stringify(['KingSlime']),
              notes: 'Defeating King Slime allows meteorites to land.',
              sourceProvider: 'wiki',
              sourcePage: 'King Slime',
              sourceRevisionTimestamp: '2026-05-07 12:00:00'
            }]];
          }
          if (sql.includes('FROM `terria_v1_relation`.`relation_npcs`')) {
            return [[{
              sourceId: 101,
              internalName: 'KingSlime',
              englishName: 'King Slime',
              rawJson: '{}'
            }]];
          }
          if (sql.includes('FROM `terria_v1_relation`.`relation_items`')) {
            return [[]];
          }
          if (sql.includes('FROM `terria_v1_relation`.`relation_npc_images`')) {
            return [[{
              npcInternalName: 'KingSlime',
              cachedUrl: 'http://localhost:9000/terrapedia-images/bosses/king-slime.png',
              isPrimary: 1,
              sortOrder: 0
            }]];
          }
          if (sql.includes('FROM `terria_v1_relation`.`relation_item_images`')) {
            return [[]];
          }
          if (sql.includes('FROM `terria_v1_relation`.`boss_item_reward_relations`')) {
            return [[]];
          }
          if (sql.includes('FROM `terria_v1_relation`.`boss_effect_relations`')) {
            return [[{
              bossRecordKey: 'boss-record-key',
              effectType: 'unlock_world_event',
              targetType: 'world_event',
              targetKey: 'meteorite_landings',
              targetName: 'Meteorite landings',
              evidenceText: 'allows meteorites to land'
            }]];
          }
          throw new Error(`Unexpected SQL: ${sql}`);
        },
        execute: async () => {
          throw new Error('dry-run should not write rows');
        }
      }),
      writeReport: async (payload) => {
        reportPayload = payload;
        return 'reports/relation/boss-projection-sync-2026-05-07.json';
      }
    }
  );

  assert.equal(result.report.apply, false);
  assert.equal(result.report.summary.sourceBossRows, 1);
  assert.equal(result.report.summary.projectionBossCount, 1);
  assert.equal(result.report.summary.writeCount, 0);
  assert.equal(result.report.projectionBosses[0].code, 'KING_SLIME');
  assert.equal(result.report.projectionBosses[0].memberCount, 1);
  assert.equal(result.report.projectionBosses[0].effectCount, 1);
  assert.equal(result.report.projectionBosses[0].imageUrl, 'http://localhost:9000/terrapedia-images/bosses/king-slime.png');
  assert.equal(reportPayload.summary.projectionBossCount, 1);
  assert.equal(result.reportPath, 'reports/relation/boss-projection-sync-2026-05-07.json');
  assert.ok(statements.every((sql) => !/^INSERT INTO `terria_v1_relation`\.`projection_bosses`/i.test(sql)));
});

test('runBossProjectionSync apply upserts projection_bosses rows only', async () => {
  const statements = [];
  let reportPayload = null;

  const result = await runBossProjectionSync(
    {
      apply: true,
      relationDatabase: 'terria_v1_relation',
      dateTag: '2026-05-07'
    },
    {
      executeRelation: async (fn) => fn({
        query: async (sql) => {
          statements.push(sql);
          if (sql === 'START TRANSACTION') {
            return [[{ affectedRows: 0 }]];
          }
          if (sql === 'DELETE FROM `terria_v1_relation`.`projection_bosses`') {
            return [[{ affectedRows: 1 }]];
          }
          if (sql === 'COMMIT' || sql === 'ROLLBACK') {
            return [[{ affectedRows: 0 }]];
          }
          if (sql.includes('FROM `terria_v1_relation`.`relation_bosses`')) {
            return [[{
              recordKey: 'boss-record-key',
              progressionOrder: 1,
              orderWithinGroup: 1,
              groupType: 'PRE_HARDMODE',
              bossTitleEn: 'King Slime',
              bossTitleZh: '史莱姆王',
              pageTitleEn: 'King Slime',
              pageTitleZh: '史莱姆王',
              imageUrl: 'http://localhost:9000/terrapedia-images/bosses/king-slime.png',
              npcSourceId: 101,
              npcInternalName: 'KingSlime',
              npcMatchStatus: 'resolved',
              npcMatchCount: 1,
              npcMemberInternalNamesJson: JSON.stringify(['KingSlime']),
              notes: 'Defeating King Slime allows meteorites to land.',
              sourceProvider: 'wiki',
              sourcePage: 'King Slime',
              sourceRevisionTimestamp: '2026-05-07 12:00:00'
            }]];
          }
          if (sql.includes('FROM `terria_v1_relation`.`relation_npcs`')) {
            return [[{
              sourceId: 101,
              internalName: 'KingSlime',
              englishName: 'King Slime',
              rawJson: '{}'
            }]];
          }
          if (sql.includes('FROM `terria_v1_relation`.`relation_items`')) {
            return [[]];
          }
          if (sql.includes('FROM `terria_v1_relation`.`relation_npc_images`')) {
            return [[{
              npcInternalName: 'KingSlime',
              cachedUrl: 'http://localhost:9000/terrapedia-images/bosses/king-slime.png',
              isPrimary: 1,
              sortOrder: 0
            }]];
          }
          if (sql.includes('FROM `terria_v1_relation`.`relation_item_images`')) {
            return [[]];
          }
          if (sql.includes('FROM `terria_v1_relation`.`boss_item_reward_relations`')) {
            return [[{
              bossRecordKey: 'boss-record-key',
              itemInternalName: 'SlimeGun',
              rewardSourceType: 'loot',
              npcMemberCount: 1,
              chanceTextsJson: JSON.stringify(['100%']),
              quantityTextsJson: JSON.stringify(['1'])
            }]];
          }
          if (sql.includes('FROM `terria_v1_relation`.`boss_effect_relations`')) {
            return [[{
              bossRecordKey: 'boss-record-key',
              effectType: 'unlock_world_event',
              targetType: 'world_event',
              targetKey: 'meteorite_landings',
              targetName: 'Meteorite landings',
              evidenceText: 'allows meteorites to land'
            }]];
          }
          throw new Error(`Unexpected SQL: ${sql}`);
        },
        execute: async (sql, params) => {
          statements.push(sql);
          statements.push(JSON.stringify(params));
          return [{ affectedRows: 1 }, []];
        }
      }),
      writeReport: async (payload) => {
        reportPayload = payload;
        return 'reports/relation/boss-projection-sync-2026-05-07.json';
      }
    }
  );

  const upsertSql = statements.find((sql) => typeof sql === 'string' && sql.startsWith('INSERT INTO `terria_v1_relation`.`projection_bosses`'));
  const paramsJson = statements.find((entry) => typeof entry === 'string' && entry.startsWith('['));

  assert.equal(result.report.apply, true);
  assert.equal(result.report.summary.writeCount, 1);
  assert.ok(statements.includes('START TRANSACTION'));
  assert.ok(statements.includes('DELETE FROM `terria_v1_relation`.`projection_bosses`'));
  assert.ok(statements.includes('COMMIT'));
  assert.match(upsertSql, /ON DUPLICATE KEY UPDATE/);
  assert.match(upsertSql, /`member_npcs_json`/);
  assert.match(upsertSql, /`loot_items_json`/);
  assert.match(upsertSql, /`effects_json`/);
  assert.match(paramsJson, /KING_SLIME/);
  assert.match(paramsJson, /meteorite_landings/);
  assert.equal(reportPayload.projectionBosses[0].code, 'KING_SLIME');
  assert.equal(reportPayload.projectionBosses[0].memberCount, 1);
  assert.equal(reportPayload.projectionBosses[0].lootItemCount, 1);
  assert.equal(reportPayload.projectionBosses[0].effectCount, 1);
  assert.ok(statements.every((sql) => typeof sql !== 'string' || !/^CREATE TABLE|^ALTER TABLE/i.test(sql)));
});
