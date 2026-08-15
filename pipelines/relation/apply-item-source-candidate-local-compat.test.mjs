import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildLocalCompatRows,
  parseApplyItemSourceCandidateLocalCompatArgs,
  runItemSourceCandidateLocalCompatApply
} from './apply-item-source-candidate-local-compat.mjs';

function samplePlan() {
  return {
    generatedAt: '2026-06-10T00:00:00.000Z',
    readOnly: true,
    mode: 'candidate_import_plan',
    summary: { eligibleCandidates: 1, plannedSourceRows: 2 },
    eligibleCandidates: [{
      itemInternalName: 'MagicMirror',
      itemName: 'Magic Mirror',
      itemResolution: { status: 'resolved', id: 50, internalName: 'MagicMirror', name: 'Magic Mirror' },
      pageTitle: 'Magic Mirrors',
      classification: 'high_confidence',
      plannedSources: [
        {
          sourceType: 'container',
          sourceRefType: 'container',
          sourceRefName: 'Gold Chest',
          quantityText: '1',
          chanceText: '1/6 (16.67%)',
          conditions: null,
          notes: null,
          sourcePage: 'Magic Mirrors',
          sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
          sortOrder: 0,
          resolvedRef: { status: 'resolved', id: 306, internalName: 'GoldChest', name: 'Gold Chest' }
        },
        {
          sourceType: 'worldgen',
          sourceRefType: 'world',
          sourceRefName: 'Magic Mirrors worldgen',
          quantityText: null,
          chanceText: null,
          conditions: 'found in Chests',
          notes: null,
          sourcePage: 'Magic Mirrors',
          sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
          sortOrder: 1,
          resolvedRef: null
        }
      ]
    }]
  };
}

function createMockMysql({ duplicateIds = [] } = {}) {
  const calls = [];
  const insertedIds = [];
  let nextInsertId = 9000;
  const connection = {
    calls,
    async beginTransaction() { calls.push(['beginTransaction']); },
    async commit() { calls.push(['commit']); },
    async rollback() { calls.push(['rollback']); },
    async end() { calls.push(['end']); },
    async execute(sql, params = []) {
      calls.push(['execute', sql, params]);
      if (/FROM `?items`?/i.test(sql)) return [[{ id: params[0], internal_name: 'MagicMirror', name: 'Magic Mirror' }]];
      if (/FROM `?npcs`?/i.test(sql)) return [[{ id: params[0] }]];
  if (/FROM `?item_acquisition_sources`?/i.test(sql) && /^SELECT id/i.test(sql.trim())) {
        return [duplicateIds.length ? duplicateIds.map((id) => ({ id })) : []];
      }
      if (/FROM `?item_acquisition_sources`?/i.test(sql) && /WHERE `id` IN/i.test(sql)) return [[]];
      if (/INSERT INTO `?item_acquisition_sources`?/i.test(sql)) {
        const insertId = nextInsertId++;
        insertedIds.push(insertId);
        return [{ insertId, affectedRows: 1 }];
      }
      if (/SELECT \*/i.test(sql)) return [[]];
      if (/COUNT\(\*\)/i.test(sql)) return [[{ total: 0 }]];
      return [[]];
    },
    async query(sql, params = []) {
      calls.push(['query', sql, params]);
      return this.execute(sql, params);
    }
  };
  return {
    insertedIds,
    module: { createConnection: async () => connection },
    connection
  };
}

function createIdentityAwareMockMysql(itemsById = {}) {
  const calls = [];
  const connection = {
    calls,
    async beginTransaction() { calls.push(['beginTransaction']); },
    async commit() { calls.push(['commit']); },
    async rollback() { calls.push(['rollback']); },
    async end() { calls.push(['end']); },
    async execute(sql, params = []) {
      calls.push(['execute', sql, params]);
      if (/FROM `?items`?/i.test(sql)) {
        const row = itemsById[Number(params[0])];
        return [row ? [row] : []];
      }
      if (/FROM `?item_acquisition_sources`?/i.test(sql) && /^SELECT id/i.test(sql.trim())) return [[]];
      if (/SELECT \*/i.test(sql)) return [[]];
      return [[]];
    },
    async query(sql, params = []) {
      calls.push(['query', sql, params]);
      return this.execute(sql, params);
    }
  };
  return {
    module: { createConnection: async () => connection },
    connection
  };
}

test('parseApplyItemSourceCandidateLocalCompatArgs requires confirmation for apply', () => {
  assert.throws(
    () => parseApplyItemSourceCandidateLocalCompatArgs(['--apply=true']),
    /requires --confirm-local-compat=true/
  );
  const parsed = parseApplyItemSourceCandidateLocalCompatArgs(['--apply=true', '--confirm-local-compat=true', '--sample=MagicMirror']);
  assert.equal(parsed.apply, true);
  assert.equal(parsed.sample, 'MagicMirror');
});

test('runItemSourceCandidateLocalCompatApply retires only exact matched local compat rows', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'item-source-local-compat-retire-'));
  const inputPath = path.join(tempDir, 'retire.json');
  const outputPath = path.join(tempDir, 'report.json');
  fs.writeFileSync(inputPath, JSON.stringify({
    mode: 'item_source_local_compat_retire_plan',
    rows: [
      {
        id: 198875,
        itemId: 5049,
        expectedItemInternalName: 'HeartArrow',
        expectedItemName: 'Heart Arrow',
        sourceType: 'craft',
        sourceRefType: 'item',
        sourceRefName: 'Silk',
        conditions: 'Crafted at Loom',
        sourcePage: 'Wandering set',
        reason: 'stale candidate item id wrote RoninShirt source to HeartArrow'
      }
    ]
  }));
  const calls = [];
  const connection = {
    calls,
    async beginTransaction() { calls.push(['beginTransaction']); },
    async commit() { calls.push(['commit']); },
    async rollback() { calls.push(['rollback']); },
    async end() { calls.push(['end']); },
    async execute(sql, params = []) {
      calls.push(['execute', sql, params]);
      if (/FROM\s+`?item_acquisition_sources`?\s+s\s+JOIN\s+`?items`?\s+i/is.test(sql)) {
        return [[{
          id: 198875,
          item_id: 5049,
          internal_name: 'HeartArrow',
          name: 'Heart Arrow',
          source_type: 'craft',
          source_ref_type: 'item',
          source_ref_name: 'Silk',
          conditions: 'Crafted at Loom',
          source_page: 'Wandering set',
          status: 1,
          deleted: 0
        }]];
      }
      if (/UPDATE `?item_acquisition_sources`?/i.test(sql)) return [{ affectedRows: params.length }];
      return [[]];
    },
    async query(sql, params = []) {
      calls.push(['query', sql, params]);
      return this.execute(sql, params);
    }
  };
  const mysql = { createConnection: async () => connection };

  const report = await runItemSourceCandidateLocalCompatApply(
    {
      inputPath,
      outputPath,
      backupDir: path.join(tempDir, 'backup'),
      apply: true,
      confirmLocalCompat: true,
      allowBulk: true,
      database: 'terria_v1_local'
    },
    {
      now: new Date('2026-06-13T00:00:00.000Z'),
      mysqlModule: mysql,
      config: { database: { host: '127.0.0.1', port: 13306, username: 'root', password: 'root' } }
    }
  );

  assert.equal(report.mode, 'item_source_local_compat_retire_plan');
  assert.deepEqual(report.summary, {
    selectedRows: 1,
    validationErrors: 0,
    toRetire: 1,
    retired: 1
  });
  assert.match(report.rollbackSql, /status` = 1/);
  assert.ok(connection.calls.some((call) => call[0] === 'execute' && /UPDATE `?item_acquisition_sources`?/i.test(call[1])));
});

test('buildLocalCompatRows maps candidate plan rows to local compat rows', () => {
  const result = buildLocalCompatRows(samplePlan(), { sample: 'MagicMirror' });
  assert.equal(result.rows.length, 2);
  assert.equal(result.blocked.length, 0);
  assert.deepEqual(
    result.rows.map((row) => [row.itemId, row.sourceType, row.sourceRefType, row.sourceRefId, row.sourceRefName, row.quantityMin, row.quantityMax]),
    [
      [50, 'container', 'container', 306, 'Gold Chest', 1, 1],
      [50, 'worldgen', 'world', null, 'Magic Mirrors worldgen', null, null]
    ]
  );
});

test('buildLocalCompatRows maps boss refs as npc-backed boss source rows', () => {
  const plan = samplePlan();
  plan.eligibleCandidates = [{
    itemInternalName: 'BeeHat',
    itemName: 'Bee Hat',
    itemResolution: { status: 'resolved', id: 2108, internalName: 'BeeHat', name: 'Bee Hat' },
    pageTitle: 'Bee set',
    classification: 'high_confidence',
    plannedSources: [{
      sourceType: 'drop',
      sourceRefType: 'boss',
      sourceRefName: 'Queen Bee',
      quantityText: '1',
      chanceText: '11.11%',
      conditions: null,
      notes: null,
      sourcePage: 'Bee set',
      sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
      sortOrder: 0,
      resolvedRef: { status: 'resolved_boss_ref', id: 222, internalName: 'QueenBee', name: 'Queen Bee' }
    }]
  }];

  const result = buildLocalCompatRows(plan, { sample: 'BeeHat' });

  assert.equal(result.blocked.length, 0);
  assert.equal(result.rows.length, 1);
  assert.deepEqual(
    result.rows.map((row) => [row.itemId, row.sourceType, row.sourceRefType, row.sourceRefId, row.sourceRefName]),
    [[2108, 'drop', 'boss', 222, 'Queen Bee']]
  );
});

test('buildLocalCompatRows blocks unsupported source types before database validation', () => {
  const plan = samplePlan();
  plan.eligibleCandidates[0].plannedSources = [{
    sourceType: 'unsafe_refresh',
    sourceRefType: 'world',
    sourceRefName: 'Unsafe world source',
    quantityText: null,
    chanceText: null,
    conditions: null,
    notes: null,
    sourcePage: 'Unsafe',
    sourceRevisionTimestamp: '2026-06-10T00:00:00Z',
    sortOrder: 0,
    resolvedRef: null
  }];

  const result = buildLocalCompatRows(plan, { sample: 'MagicMirror' });

  assert.equal(result.rows.length, 0);
  assert.deepEqual(result.blocked.map((entry) => entry.reason), ['unsupported_source_type']);
});

test('buildLocalCompatRows preserves reviewed fishing and capture world sources', () => {
  const plan = samplePlan();
  plan.eligibleCandidates = [{
    itemInternalName: 'ZephyrFish',
    itemName: 'Zephyr Fish',
    itemResolution: { status: 'resolved', id: 2420, internalName: 'ZephyrFish', name: 'Zephyr Fish' },
    pageTitle: 'Zephyr Fish',
    classification: 'high_confidence',
    plannedSources: [
      {
        sourceType: 'fishing',
        sourceRefType: 'world',
        sourceRefName: 'Fishing',
        quantityText: null,
        chanceText: '2/3125 (0.06%)',
        conditions: 'rarely caught from fishing in any body of water',
        notes: null,
        sourcePage: 'Zephyr Fish',
        sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
        sortOrder: 0,
        resolvedRef: null
      },
      {
        sourceType: 'capture',
        sourceRefType: 'world',
        sourceRefName: 'Bug Net capture',
        quantityText: null,
        chanceText: null,
        conditions: 'caught with a Bug Net',
        notes: null,
        sourcePage: 'Butterflies',
        sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
        sortOrder: 1,
        resolvedRef: null
      }
    ]
  }];

  const result = buildLocalCompatRows(plan, { sample: 'ZephyrFish' });

  assert.equal(result.blocked.length, 0);
  assert.deepEqual(
    result.rows.map((row) => [row.sourceType, row.sourceRefType, row.sourceRefId, row.sourceRefName]),
    [
      ['fishing', 'world', null, 'Fishing'],
      ['capture', 'world', null, 'Bug Net capture']
    ]
  );
});

test('buildLocalCompatRows preserves reviewed text-only group and unknown refs', () => {
  const plan = samplePlan();
  plan.eligibleCandidates = [{
    itemInternalName: 'EtherianMana',
    itemName: 'Etherian Mana',
    itemResolution: { status: 'resolved', id: 3822, internalName: 'EtherianMana', name: 'Etherian Mana' },
    pageTitle: 'Etherian Mana',
    classification: 'high_confidence',
    plannedSources: [
      {
        sourceType: 'drop',
        sourceRefType: 'npc_group',
        sourceRefName: "Old One's Army enemies",
        quantityText: null,
        chanceText: null,
        conditions: "dropped by all of the event's enemies",
        notes: null,
        sourcePage: 'Etherian Mana',
        sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
        sortOrder: 0,
        resolvedRef: null
      },
      {
        sourceType: 'drop',
        sourceRefType: 'boss_group',
        sourceRefName: "Skeletron's Red Hat variant",
        quantityText: null,
        chanceText: null,
        conditions: "dropped by Skeletron's Red Hat variant",
        notes: null,
        sourcePage: 'Wings',
        sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
        sortOrder: 1,
        resolvedRef: null
      },
      {
        sourceType: 'unknown',
        sourceRefType: 'unknown',
        sourceRefName: 'review-only transformation',
        quantityText: null,
        chanceText: null,
        conditions: 'raw-backed source exists but has no stable entity ref',
        notes: null,
        sourcePage: 'Void Bag',
        sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
        sortOrder: 2,
        resolvedRef: null
      }
    ]
  }];

  const result = buildLocalCompatRows(plan, { sample: 'EtherianMana' });

  assert.equal(result.blocked.length, 0);
  assert.deepEqual(
    result.rows.map((row) => [row.sourceType, row.sourceRefType, row.sourceRefId, row.sourceRefName]),
    [
      ['drop', 'npc_group', null, "Old One's Army enemies"],
      ['drop', 'boss_group', null, "Skeletron's Red Hat variant"],
      ['unknown', 'unknown', null, 'review-only transformation']
    ]
  );
});

test('buildLocalCompatRows preserves reviewed event and transformation source rows', () => {
  const plan = samplePlan();
  plan.eligibleCandidates = [{
    itemInternalName: 'GardenGnome',
    itemName: 'Garden Gnome',
    itemResolution: { status: 'resolved', id: 4609, internalName: 'GardenGnome', name: 'Garden Gnome' },
    pageTitle: 'Garden Gnome',
    classification: 'high_confidence',
    plannedSources: [
      {
        sourceType: 'transformation',
        sourceRefType: 'npc',
        sourceRefName: 'Gnome',
        quantityText: null,
        chanceText: null,
        conditions: 'formed when a Gnome touches sunlight',
        notes: 'Sunlight transformation',
        sourcePage: 'Garden Gnome',
        sourceRevisionTimestamp: '2026-05-01T00:00:00Z',
        sortOrder: 0,
        resolvedRef: { status: 'resolved', id: 624, internalName: 'Gnome', name: 'Gnome' }
      },
      {
        sourceType: 'event',
        sourceRefType: 'world',
        sourceRefName: 'The Torch God event',
        quantityText: null,
        chanceText: null,
        conditions: 'obtained by surviving The Torch God event',
        notes: null,
        sourcePage: "Torch God's Favor",
        sourceRevisionTimestamp: '2026-05-01T00:00:00Z',
        sortOrder: 1,
        resolvedRef: null
      }
    ]
  }];

  const result = buildLocalCompatRows(plan, { sample: 'GardenGnome' });

  assert.equal(result.blocked.length, 0);
  assert.deepEqual(
    result.rows.map((row) => [row.sourceType, row.sourceRefType, row.sourceRefId, row.sourceRefName]),
    [
      ['transformation', 'npc', 624, 'Gnome'],
      ['event', 'world', null, 'The Torch God event']
    ]
  );
});

test('runItemSourceCandidateLocalCompatApply dry-run validates and does not insert', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'item-source-local-dry-'));
  const inputPath = path.join(root, 'plan.json');
  fs.writeFileSync(inputPath, JSON.stringify(samplePlan()));
  const mysql = createMockMysql();

  const report = await runItemSourceCandidateLocalCompatApply({
    inputPath,
    apply: false,
    sample: 'MagicMirror',
    backupDir: path.join(root, 'backup')
  }, {
    mysqlModule: mysql.module,
    now: new Date('2026-06-10T00:00:00.000Z')
  });

  assert.equal(report.apply, false);
  assert.equal(report.summary.plannedRows, 2);
  assert.equal(report.summary.toInsert, 2);
  assert.equal(mysql.insertedIds.length, 0);
});

test('runItemSourceCandidateLocalCompatApply blocks stale item identity mismatches', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'item-source-local-compat-'));
  const inputPath = path.join(tempDir, 'plan.json');
  const outputPath = path.join(tempDir, 'report.json');
  const plan = samplePlan();
  plan.eligibleCandidates[0].itemInternalName = 'RoninShirt';
  plan.eligibleCandidates[0].itemName = 'Wandering Yukata';
  plan.eligibleCandidates[0].itemResolution = {
    status: 'resolved',
    id: 5049,
    internalName: 'RoninShirt',
    name: 'Wandering Yukata'
  };
  fs.writeFileSync(inputPath, JSON.stringify(plan));
  const mysql = createIdentityAwareMockMysql({
    5049: { id: 5049, internal_name: 'HeartArrow', name: 'Heart Arrow' },
    306: { id: 306, internal_name: 'GoldChest', name: 'Gold Chest' }
  });

  const report = await runItemSourceCandidateLocalCompatApply(
    {
      inputPath,
      outputPath,
      backupDir: path.join(tempDir, 'backup'),
      apply: false,
      allowBulk: true,
      database: 'terria_v1_local'
    },
    {
      now: new Date('2026-06-13T00:00:00.000Z'),
      mysqlModule: mysql.module,
      config: { database: { host: '127.0.0.1', port: 13306, username: 'root', password: 'root' } }
    }
  );

  assert.equal(report.summary.validationErrors, 2);
  assert.equal(report.summary.toInsert, 0);
  assert.deepEqual(
    report.validationErrors.map((error) => error.reason),
    ['item_identity_mismatch', 'item_identity_mismatch']
  );
});

test('runItemSourceCandidateLocalCompatApply inserts missing rows and reports rollback ids', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'item-source-local-apply-'));
  const inputPath = path.join(root, 'plan.json');
  fs.writeFileSync(inputPath, JSON.stringify(samplePlan()));
  const mysql = createMockMysql();

  const report = await runItemSourceCandidateLocalCompatApply({
    inputPath,
    apply: true,
    confirmLocalCompat: true,
    sample: 'MagicMirror',
    backupDir: path.join(root, 'backup')
  }, {
    mysqlModule: mysql.module,
    now: new Date('2026-06-10T00:00:00.000Z')
  });

  assert.equal(report.apply, true);
  assert.equal(report.summary.inserted, 2);
  assert.deepEqual(report.insertedIds, [9000, 9001]);
  assert.match(report.rollbackSql, /UPDATE `item_acquisition_sources` SET `status` = 0, `deleted` = 1 WHERE `id` IN \(9000, 9001\);/);
  assert.ok(fs.existsSync(report.backupPath));
});
