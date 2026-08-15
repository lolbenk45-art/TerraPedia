import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildItemSourceRefIdResolutionPlan,
  parseItemSourceRefIdResolutionArgs,
  runItemSourceRefIdResolution
} from './plan-item-source-ref-id-resolution.mjs';

function source(overrides = {}) {
  return {
    id: 1,
    item_id: 18,
    source_type: 'drop',
    source_ref_type: 'npc',
    source_ref_id: null,
    source_ref_name: 'Spore Bat',
    status: 1,
    deleted: 0,
    ...overrides
  };
}

function npc(overrides = {}) {
  return {
    id: 100,
    name: 'Spore Bat',
    internal_name: 'SporeBat',
    is_boss: 0,
    boss_group_id: null,
    is_town_npc: 0,
    status: 1,
    deleted: 0,
    ...overrides
  };
}

function createMockMysql({ sources, npcs }) {
  const calls = [];
  const connection = {
    calls,
    async beginTransaction() { calls.push(['beginTransaction']); },
    async commit() { calls.push(['commit']); },
    async rollback() { calls.push(['rollback']); },
    async end() { calls.push(['end']); },
    async execute(sql, params = []) {
      calls.push(['execute', sql, params]);
      if (/SELECT \* FROM `?item_acquisition_sources`? WHERE `?id`? IN/i.test(sql)) return [sources.filter((row) => params.includes(row.id))];
      if (/FROM `?item_acquisition_sources`?/i.test(sql)) return [sources];
      if (/FROM `?npcs`?/i.test(sql)) return [npcs];
      if (/UPDATE `?item_acquisition_sources`?/i.test(sql)) return [{ affectedRows: params.length / 2 }];
      return [[]];
    }
  };
  return {
    module: { createConnection: async () => connection },
    connection
  };
}

test('parseItemSourceRefIdResolutionArgs requires confirmation and bulk guard for apply', () => {
  assert.throws(
    () => parseItemSourceRefIdResolutionArgs(['--apply=true']),
    /requires --confirm-local-compat=true/
  );
  assert.throws(
    () => parseItemSourceRefIdResolutionArgs(['--apply=true', '--confirm-local-compat=true']),
    /requires --allow-bulk=true/
  );
});

test('buildItemSourceRefIdResolutionPlan resolves unique NPC and boss names to npcs.id', () => {
  const plan = buildItemSourceRefIdResolutionPlan({
    sourceRows: [
      source({ id: 1, source_ref_type: 'npc', source_ref_name: 'Spore Bat' }),
      source({ id: 2, source_ref_type: 'boss', source_ref_name: 'Queen Bee' }),
      source({ id: 3, source_ref_type: 'npc', source_ref_name: 'Merchant for', source_type: 'shop' }),
      source({ id: 4, source_ref_type: 'npc', source_ref_name: 'Party Girl during a Party for', source_type: 'shop' }),
      source({ id: 5, source_ref_type: 'npc', source_ref_name: 'Travelling Merchant', source_type: 'shop' }),
      source({ id: 6, source_ref_type: 'boss', source_ref_name: 'Skeletron', source_type: 'drop' }),
      source({ id: 7, source_ref_type: 'npc', source_ref_name: 'Golfer', source_type: 'shop' }),
      source({ id: 8, source_ref_type: 'npc', source_ref_name: 'Clothier after the Frost Legion has been defeated', source_type: 'shop' }),
      source({ id: 9, source_ref_type: 'npc', source_ref_name: 'Ogre', source_type: 'drop' }),
      source({ id: 10, source_ref_type: 'npc', source_ref_name: 'Digger', source_type: 'drop' })
    ],
    npcRows: [
      npc({ id: 100, name: 'Spore Bat', is_boss: 0 }),
      npc({ id: 200, name: 'Queen Bee', is_boss: 1 }),
      npc({ id: 300, name: 'Merchant', is_boss: 0, is_town_npc: 1 }),
      npc({ id: 400, name: 'Party Girl', is_boss: 0, is_town_npc: 1 }),
      npc({ id: 500, name: 'Traveling Merchant', is_boss: 0, is_town_npc: 1 }),
      npc({ id: 600, name: 'Skeletron', internal_name: 'SkeletronHead', is_boss: 1, boss_group_id: 40 }),
      npc({ id: 601, name: 'Skeletron', internal_name: 'SkeletronHand', is_boss: 0, boss_group_id: 40 }),
      npc({ id: 700, name: 'Golfer', internal_name: 'Golfer', is_town_npc: 1 }),
      npc({ id: 701, name: 'Golfer', internal_name: 'GolferRescue', is_town_npc: 0 }),
      npc({ id: 800, name: 'Clothier', internal_name: 'Clothier', is_town_npc: 1 }),
      npc({ id: 900, name: 'Ogre', internal_name: 'DD2OgreT2', boss_group_id: 53 }),
      npc({ id: 901, name: 'Ogre', internal_name: 'DD2OgreT3', boss_group_id: 53 }),
      npc({ id: 1000, name: 'Digger', internal_name: 'DiggerHead' }),
      npc({ id: 1001, name: 'Digger', internal_name: 'DiggerBody' }),
      npc({ id: 1002, name: 'Digger', internal_name: 'DiggerTail' })
    ]
  });

  assert.deepEqual(plan.updates.map((row) => [row.id, row.newSourceRefId]), [[1, 100], [2, 200], [3, 300], [4, 400], [5, 500], [6, 600], [7, 700], [8, 800], [9, 900], [10, 1000]]);
  assert.equal(plan.updates[2].matchName, 'Merchant');
  assert.equal(plan.updates[3].matchName, 'Party Girl');
  assert.equal(plan.updates[4].matchName, 'Traveling Merchant');
  assert.equal(plan.summary.rowsToUpdate, 10);
  assert.equal(plan.summary.validationErrors, 0);
});

test('buildItemSourceRefIdResolutionPlan blocks ambiguous variants, containers, and existing negative ids', () => {
  const plan = buildItemSourceRefIdResolutionPlan({
    sourceRows: [
      source({ id: 1, source_ref_name: 'Zombie' }),
      source({ id: 2, source_ref_name: 'Gold Chest' }),
      source({ id: 3, source_ref_name: 'Spore Bat', source_ref_id: -55 })
    ],
    npcRows: [
      npc({ id: 10, name: 'Zombie', internal_name: 'Zombie' }),
      npc({ id: 11, name: 'Zombie', internal_name: 'BigZombie' }),
      npc({ id: 100, name: 'Spore Bat', internal_name: 'SporeBat' })
    ]
  });

  assert.equal(plan.summary.rowsToUpdate, 0);
  assert.deepEqual(plan.blocked.map((row) => row.reason), [
    'ambiguous_npc_name',
    'container_like_source_name',
    'existing_ref_id_not_null'
  ]);
});

test('runItemSourceRefIdResolution dry-run does not update', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ref-id-dry-'));
  const mysql = createMockMysql({
    sources: [source({ id: 1, source_ref_name: 'Spore Bat' })],
    npcs: [npc({ id: 100, name: 'Spore Bat' })]
  });

  const report = await runItemSourceRefIdResolution({
    outputPath: path.join(root, 'report.json'),
    backupDir: path.join(root, 'backup'),
    apply: false
  }, {
    mysqlModule: mysql.module,
    now: new Date('2026-06-11T00:00:00.000Z')
  });

  assert.equal(report.apply, false);
  assert.equal(report.summary.rowsToUpdate, 1);
  assert.equal(report.summary.updatedRows, 0);
  assert.equal(mysql.connection.calls.some((call) => String(call[1]).startsWith('UPDATE')), false);
});

test('runItemSourceRefIdResolution apply updates source_ref_id only', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ref-id-apply-'));
  const mysql = createMockMysql({
    sources: [source({ id: 1, source_ref_name: 'Spore Bat' })],
    npcs: [npc({ id: 100, name: 'Spore Bat' })]
  });

  const report = await runItemSourceRefIdResolution({
    backupDir: path.join(root, 'backup'),
    apply: true,
    confirmLocalCompat: true,
    allowBulk: true
  }, {
    mysqlModule: mysql.module,
    now: new Date('2026-06-11T00:00:00.000Z')
  });

  assert.equal(report.summary.updatedRows, 1);
  assert.match(report.rollbackSql, /`source_ref_id` = CASE `id` WHEN 1 THEN NULL END/);
});
