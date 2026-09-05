import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildBossImportProjection,
  reconcileBossNameZh,
  reconcileBossNotes,
  reconcileBossMembers,
  runBossImport,
  shouldCreateBossImageUploader,
} from './import-wiki-bosses-to-db.mjs';

test('boss importer resolves mysql2 through the repository module loader', () => {
  const source = fs.readFileSync(new URL('./import-wiki-bosses-to-db.mjs', import.meta.url), 'utf8');
  assert.match(source, /import \{ loadMysqlModule \} from '\.\.\/lib\/mysql-module\.mjs'/);
  assert.match(source, /const mysql = loadMysqlModule\(\)/);
  assert.doesNotMatch(source, /createRequire|require\('mysql2\/promise'\)/);
});

test('boss image helpers receive managed URL prefixes explicitly', () => {
  const source = fs.readFileSync(new URL('./import-wiki-bosses-to-db.mjs', import.meta.url), 'utf8');
  assert.match(source, /async function localizeBossImage\(\s*record,\s*uploader,\s*summary,\s*managedUrlPrefixes,?\s*\)/);
  assert.match(source, /async function reconcileBossMemberImages\(\s*members,\s*generatedNpcMap,\s*uploader,\s*summary,\s*managedUrlPrefixes,?\s*\)/);
  assert.match(source, /function resolveBossImageUrl\(\s*record,\s*members,\s*managedUrlPrefixes,?\s*\)/);
  assert.match(source, /await localizeBossImage\(\s*record,\s*uploader,\s*summary,\s*managedUrlPrefixes,?\s*\)/);
  assert.match(source, /await reconcileBossMemberImages\(\s*memberMapping\.members,\s*generatedNpcMap,\s*uploader,\s*summary,\s*managedUrlPrefixes,?\s*\)/);
  assert.match(source, /const imageUrl = resolveBossImageUrl\(\s*\{[^}]*\},\s*memberMapping\.members,\s*managedUrlPrefixes,?\s*\)/);
});

test('offline boss import cannot create a backend image uploader', () => {
  assert.equal(shouldCreateBossImageUploader({ dryRun: false, offline: true }), false);
  assert.equal(shouldCreateBossImageUploader({ dryRun: true, offline: false }), false);
  assert.equal(shouldCreateBossImageUploader({ dryRun: false, offline: false }), true);

  const source = fs.readFileSync(new URL('./import-wiki-bosses-to-db.mjs', import.meta.url), 'utf8');
  assert.match(source, /requiredPassword:\s*!dryRun\s*&&\s*!offline/);
  assert.match(source, /offline,\s*\n\s*strictMode/);
});

test('runBossImport leaves a caller-owned offline transaction open', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boss-import-caller-'));
  const inputPath = path.join(tempDir, 'bosses.json');
  const reportPath = path.join(tempDir, 'report.json');
  fs.writeFileSync(inputPath, JSON.stringify({ records: [{
    titleEn: 'King Slime',
    titleZh: '史莱姆王',
    groupType: 'boss',
    progressionOrder: 1,
    sourceUrl: 'https://terraria.wiki.gg/wiki/King_Slime',
    revisionTimestamp: '2026-08-14T00:00:00.000Z',
  }] }));
  const lifecycle = [];
  const connection = {
    config: { database: 'terria_v1_local' },
    async beginTransaction() { lifecycle.push('begin'); },
    async commit() { lifecycle.push('commit'); },
    async rollback() { lifecycle.push('rollback'); },
    async end() { lifecycle.push('end'); },
    async query(sql) {
      if (/SELECT id, game_id, internal_name/i.test(sql)) {
        return [[{
          id: 10,
          game_id: 50,
          internal_name: 'KingSlime',
          name: 'King Slime',
          name_zh: '史莱姆王',
          is_boss: 1,
          raw_json: '{}',
        }]];
      }
      return [[]];
    },
    async execute(sql) {
      if (/SELECT id, image_url FROM boss_groups/i.test(sql)) {
        return [[{ id: 7, image_url: null }]];
      }
      if (/SELECT id, boss_group_id, boss_role\s+FROM npcs/i.test(sql)) {
        return [[{ id: 10, boss_group_id: 7, boss_role: 'primary' }]];
      }
      return [{ affectedRows: 1 }];
    },
  };

  const result = await runBossImport({
    input: inputPath,
    'report-json': reportPath,
    offline: 'true',
    strict: 'false',
    database: 'terria_v1_local',
  }, {
    connection,
    transactionOwner: 'caller',
    generatedNpcMap: null,
  });

  assert.equal(result.totalBosses, 1);
  assert.deepEqual(lifecycle, []);
  assert.equal(fs.existsSync(reportPath), true);
});

test('runBossImport can suppress report publication for a caller-owned automatic apply', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boss-import-no-report-'));
  const inputPath = path.join(tempDir, 'bosses.json');
  const reportPath = path.join(tempDir, 'historical-report.json');
  fs.writeFileSync(inputPath, JSON.stringify({ records: [{
    titleEn: 'King Slime',
    titleZh: '史莱姆王',
    groupType: 'boss',
    progressionOrder: 1,
    sourceUrl: 'https://terraria.wiki.gg/wiki/King_Slime',
    revisionTimestamp: '2026-08-14T00:00:00.000Z',
  }] }));
  const connection = {
    config: { database: 'terria_v1_local' },
    async query(sql) {
      if (/SELECT id, game_id, internal_name/i.test(sql)) {
        return [[{
          id: 10,
          game_id: 50,
          internal_name: 'KingSlime',
          name: 'King Slime',
          name_zh: '史莱姆王',
          is_boss: 1,
          raw_json: '{}',
        }]];
      }
      return [[]];
    },
    async execute(sql) {
      if (/SELECT id, image_url FROM boss_groups/i.test(sql)) {
        return [[{ id: 7, image_url: null }]];
      }
      if (/SELECT id, boss_group_id, boss_role\s+FROM npcs/i.test(sql)) {
        return [[{ id: 10, boss_group_id: 7, boss_role: 'primary' }]];
      }
      return [{ affectedRows: 1 }];
    },
  };

  const result = await runBossImport({
    input: inputPath,
    'report-json': reportPath,
    'write-report': 'false',
    offline: 'true',
    strict: 'false',
    database: 'terria_v1_local',
  }, {
    connection,
    transactionOwner: 'caller',
    generatedNpcMap: null,
  });

  assert.equal(result.totalBosses, 1);
  assert.equal(result.reportPath, null);
  assert.equal(fs.existsSync(reportPath), false);
});

test('reconcileBossMembers skips unchanged existing boss member assignments', async () => {
  const conn = createFakeConnection({
    existingMembers: [
      { id: 10, boss_group_id: 7, boss_role: 'primary' },
      { id: 11, boss_group_id: 7, boss_role: 'part' },
    ],
  });
  const stats = { totalMemberAssignments: 0, skippedMemberAssignments: 0, updatedMemberAssignments: 0, clearedMemberAssignments: 0 };

  await reconcileBossMembers(conn, 7, [
    { id: 10, role: 'primary' },
    { id: 11, role: 'part' },
  ], stats);

  assert.equal(stats.totalMemberAssignments, 2);
  assert.equal(stats.skippedMemberAssignments, 2);
  assert.equal(stats.updatedMemberAssignments, 0);
  assert.equal(stats.clearedMemberAssignments, 0);
  assert.equal(conn.calls.some((call) => /\bSET boss_group_id = NULL\b/i.test(call.sql)), false);
  assert.equal(conn.calls.some((call) => /\bSET is_boss = 1\b/i.test(call.sql)), false);
});

test('reconcileBossMembers clears removed members and updates changed roles', async () => {
  const conn = createFakeConnection({
    existingMembers: [
      { id: 10, boss_group_id: 7, boss_role: 'part' },
      { id: 12, boss_group_id: 7, boss_role: 'part' },
    ],
  });
  const stats = { totalMemberAssignments: 0, skippedMemberAssignments: 0, updatedMemberAssignments: 0, clearedMemberAssignments: 0 };

  await reconcileBossMembers(conn, 7, [
    { id: 10, role: 'primary' },
    { id: 11, role: 'part' },
  ], stats);

  assert.equal(stats.totalMemberAssignments, 2);
  assert.equal(stats.skippedMemberAssignments, 0);
  assert.equal(stats.updatedMemberAssignments, 2);
  assert.equal(stats.clearedMemberAssignments, 1);
  assert.equal(conn.calls.filter((call) => /\bSET boss_group_id = NULL\b/i.test(call.sql)).length, 1);
  assert.equal(conn.calls.filter((call) => /\bSET is_boss = 1\b/i.test(call.sql)).length, 2);
});

test('reconcileBossNameZh keeps the stored Chinese name when the source carries none', () => {
  assert.equal(reconcileBossNameZh({ titleZh: null }, '日耀柱'), '日耀柱');
  assert.equal(reconcileBossNameZh({ titleZh: '   ' }, '日耀柱'), '日耀柱');
});

test('buildBossImportProjection mirrors explicit members, clears stale assignments, and preserves reference-only groups', () => {
  const managedBossImage = 'http://localhost:9000/terrapedia-images/bosses/king-slime.gif';
  const records = [
    {
      status: 'ok',
      titleEn: 'King Slime',
      titleZh: null,
      groupType: 'PRE_HARDMODE',
      progressionOrder: 1,
      imageUrl: 'https://terraria.wiki.gg/images/King_Slime.gif',
      notes: 'King Slime is a boss.',
      notesZh: null,
      sourceUrl: 'https://terraria.wiki.gg/wiki/King_Slime',
      revisionTimestamp: '2026-08-11T22:35:00Z',
    },
    {
      status: 'ok',
      titleEn: 'Mechdusa',
      titleZh: '机械美杜莎',
      groupType: 'SPECIAL_SEED',
      progressionOrder: 33,
      imageUrl: managedBossImage,
      notes: 'Mechdusa is a composite boss.',
      notesZh: '机械美杜莎是组合 Boss。',
      sourceUrl: 'https://terraria.wiki.gg/wiki/Mechdusa',
      revisionTimestamp: '2026-08-11T22:37:17Z',
    },
  ];
  const currentBossGroups = [
    {
      id: 7,
      code: 'KING_SLIME',
      name_en: 'King Slime',
      name_zh: '史莱姆王',
      boss_type: 'PRE_HARDMODE',
      image_url: managedBossImage,
      progression_order: 1,
      notes: '史莱姆王旧中文说明。',
      source_page: 'old',
      source_revision_timestamp: '2026-01-01 00:00:00',
      status: 1,
      deleted: 0,
    },
    {
      id: 33,
      code: 'MECHDUSA',
      name_en: 'Mechdusa',
      name_zh: '机械美杜莎',
      boss_type: 'SPECIAL_SEED',
      image_url: managedBossImage,
      progression_order: 33,
      notes: '机械美杜莎旧说明。',
      source_page: 'old',
      source_revision_timestamp: '2026-01-01 00:00:00',
      status: 1,
      deleted: 0,
    },
  ];
  const currentNpcs = [
    { id: 50, is_boss: 1, boss_group_id: 7, boss_role: 'primary', status: 1, deleted: 0 },
    { id: 51, is_boss: 1, boss_group_id: 7, boss_role: 'part', status: 1, deleted: 0 },
    { id: 52, is_boss: 1, boss_group_id: 33, boss_role: 'primary', status: 1, deleted: 0 },
  ];
  const npcRows = [
    { id: 50, game_id: 50, internal_name: 'KingSlime', name: 'King Slime', name_zh: '史莱姆王', is_boss: 1, raw_json: '{}' },
  ];

  const projection = buildBossImportProjection({ records, currentBossGroups, currentNpcs, npcRows });

  assert.deepEqual(projection.groups.map((row) => ({ code: row.code, name_zh: row.name_zh, notes: row.notes })), [
    { code: 'KING_SLIME', name_zh: '史莱姆王', notes: '史莱姆王旧中文说明。' },
    { code: 'MECHDUSA', name_zh: '机械美杜莎', notes: '机械美杜莎是组合 Boss。' },
  ]);
  assert.deepEqual(projection.members.map((row) => ({ id: row.id, boss_group_id: row.boss_group_id, boss_role: row.boss_role })), [
    { id: 50, boss_group_id: 7, boss_role: 'primary' },
    { id: 51, boss_group_id: null, boss_role: null },
    { id: 52, boss_group_id: null, boss_role: null },
  ]);
  assert.equal(projection.mappingByCode.MECHDUSA.sourceMode, 'reference');
});

test('buildBossImportProjection rejects unresolved members and unmanaged images for new groups', () => {
  assert.throws(() => buildBossImportProjection({
    records: [{ status: 'ok', titleEn: 'Skeletron', groupType: 'PRE_HARDMODE' }],
    currentBossGroups: [{ id: 1, code: 'SKELETRON', image_url: null }],
    currentNpcs: [],
    npcRows: [],
  }), /member|managed image|projection/i);

  assert.throws(() => buildBossImportProjection({
    records: [{ status: 'ok', titleEn: 'King Slime', imageUrl: 'https://terraria.wiki.gg/images/King_Slime.gif' }],
    currentBossGroups: [],
    currentNpcs: [],
    npcRows: [{ id: 50, game_id: 50, internal_name: 'KingSlime', name: 'King Slime', is_boss: 1, raw_json: '{}' }],
  }), /parent|managed image|existing/i);
});

test('buildBossImportProjection covers the complete 33-record Boss source snapshot', () => {
  const source = JSON.parse(fs.readFileSync(new URL('../../data/generated/wiki-bosses.latest.json', import.meta.url), 'utf8'));
  const npcSource = JSON.parse(fs.readFileSync(new URL('../../data/standardized/npcs.standardized.json', import.meta.url), 'utf8'));
  const npcRows = npcSource.records.map((record, index) => ({
    id: index + 1,
    game_id: record.id,
    internal_name: record.internalName,
    name: record.name,
    name_zh: null,
    is_boss: record.flags?.boss ? 1 : 0,
    raw_json: JSON.stringify(record),
  }));
  const currentBossGroups = source.records.map((record, index) => ({
    id: index + 1,
    code: String(record.titleEn).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
    name_zh: record.titleZh,
    image_url: 'http://localhost:9000/terrapedia-images/bosses/snapshot.gif',
    notes: record.notesZh ?? record.notes,
  }));
  const currentNpcs = npcRows.map((row) => ({ ...row, boss_group_id: null, boss_role: null, status: 1, deleted: 0 }));

  const projection = buildBossImportProjection({
    records: source.records,
    currentBossGroups,
    currentNpcs,
    npcRows,
  });

  assert.equal(source.records.length, 33);
  assert.equal(projection.groups.length, 33);
  assert.equal(Object.keys(projection.mappingByCode).length, 33);
  assert.equal(projection.members.length, 51);
  assert.equal(projection.mappingByCode.MECHDUSA.sourceMode, 'reference');
  assert.equal(Object.values(projection.mappingByCode).some((mapping) => mapping.unresolved.length > 0), false);
});

test('reconcileBossNameZh takes the source name when it has one', () => {
  assert.equal(reconcileBossNameZh({ titleZh: '史莱姆王' }, null), '史莱姆王');
  assert.equal(reconcileBossNameZh({ titleZh: '史莱姆王' }, '旧名'), '史莱姆王');
  assert.equal(reconcileBossNameZh({ titleZh: null }, null), null);
});

test('reconcileBossNotes prefers the Chinese intro the source carries', () => {
  assert.equal(
    reconcileBossNotes({ notes: 'King Slime is a boss.', notesZh: '史莱姆王是个 Boss。' }, null),
    '史莱姆王是个 Boss。'
  );
});

test('reconcileBossNotes keeps Chinese already in the row when the source has none', () => {
  assert.equal(
    reconcileBossNotes({ notes: 'King Slime is a boss.', notesZh: null }, '史莱姆王是个 Boss。'),
    '史莱姆王是个 Boss。'
  );
});

test('reconcileBossNotes falls back to English for rows that have no Chinese yet', () => {
  assert.equal(
    reconcileBossNotes({ notes: 'King Slime is a boss.', notesZh: null }, null),
    'King Slime is a boss.'
  );
  assert.equal(
    reconcileBossNotes({ notes: 'King Slime is a boss.', notesZh: null }, 'King Slime is an old boss.'),
    'King Slime is a boss.'
  );
});

test('reconcileBossNotes keeps the existing text when the source carries nothing', () => {
  assert.equal(reconcileBossNotes({ notes: null, notesZh: null }, '史莱姆王是个 Boss。'), '史莱姆王是个 Boss。');
  assert.equal(reconcileBossNotes({ notes: null, notesZh: null }, null), null);
});

function createFakeConnection({ existingMembers = [] } = {}) {
  const calls = [];
  return {
    calls,
    async execute(sql, params = []) {
      calls.push({ sql, params });
      if (/FROM\s+npcs\b/i.test(sql)) {
        return [existingMembers];
      }
      return [{ affectedRows: 1 }];
    },
  };
}
