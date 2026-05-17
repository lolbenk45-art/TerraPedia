import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildNpcFlagBackfillPlan,
  resolveOptions,
  runNpcFlagBackfill
} from './backfill-npc-flags-from-standardized.mjs';

test('buildNpcFlagBackfillPlan repairs town NPC flags from standardized extras', () => {
  const plan = buildNpcFlagBackfillPlan({
    standardizedPayload: {
      records: [
        {
          id: 17,
          internalName: 'Merchant',
          flags: { boss: false, friendly: true },
          extras: { townNPC: true }
        },
        {
          id: 369,
          internalName: 'BoundWizard',
          flags: { friendly: true },
          extras: {}
        }
      ]
    },
    npcRows: [
      { id: 17, game_id: 17, internal_name: 'Merchant', is_boss: 0, is_friendly: 1, is_town_npc: 0 },
      { id: 369, game_id: 369, internal_name: 'BoundWizard', is_boss: 0, is_friendly: 0, is_town_npc: 1 }
    ]
  });

  assert.equal(plan.checked, 2);
  assert.equal(plan.candidateUpdated, 2);
  assert.deepEqual(plan.updates, [
    {
      id: 17,
      gameId: 17,
      internalName: 'Merchant',
      before: { isBoss: 0, isFriendly: 1, isTownNpc: 0 },
      after: { isBoss: 0, isFriendly: 1, isTownNpc: 1 }
    },
    {
      id: 369,
      gameId: 369,
      internalName: 'BoundWizard',
      before: { isBoss: 0, isFriendly: 0, isTownNpc: 1 },
      after: { isBoss: 0, isFriendly: 1, isTownNpc: 0 }
    }
  ]);
});

test('runNpcFlagBackfill writes no updates in dry-run mode', async () => {
  const calls = [];
  const fakeConnection = {
    query: async (sql) => {
      calls.push(['query', sql]);
      if (sql.includes('SELECT id, game_id')) {
        return [[{ id: 17, game_id: 17, internal_name: 'Merchant', is_boss: 0, is_friendly: 1, is_town_npc: 0 }]];
      }
      return [[]];
    },
    beginTransaction: async () => calls.push(['beginTransaction']),
    execute: async (...args) => {
      calls.push(['execute', ...args]);
      return [{ affectedRows: 1 }];
    },
    commit: async () => calls.push(['commit']),
    rollback: async () => calls.push(['rollback']),
    end: async () => calls.push(['end'])
  };
  const reports = [];

  const report = await runNpcFlagBackfill({
    apply: false,
    dataPath: '/tmp/npcs.standardized.json',
    reportPath: '/tmp/report.json',
    db: { database: 'terria_v1_local' },
    allowNonPrimaryDb: false
  }, {
    mysqlModule: { createConnection: async () => fakeConnection },
    readJson: () => ({
      records: [{ id: 17, internalName: 'Merchant', flags: { friendly: true }, extras: { townNPC: true } }]
    }),
    writeReport: (filePath, payload) => reports.push({ filePath, payload })
  });

  assert.equal(report.apply, false);
  assert.equal(report.candidateUpdated, 1);
  assert.equal(report.appliedUpdated, 0);
  assert.equal(calls.some(([name]) => name === 'execute'), false);
  assert.equal(calls.some(([name]) => name === 'beginTransaction'), false);
  assert.equal(reports.length, 1);
});

test('runNpcFlagBackfill applies flag updates only when apply=true', async () => {
  const calls = [];
  const fakeConnection = {
    query: async (sql) => {
      calls.push(['query', sql]);
      if (sql.includes('SELECT id, game_id')) {
        return [[{ id: 17, game_id: 17, internal_name: 'Merchant', is_boss: 0, is_friendly: 1, is_town_npc: 0 }]];
      }
      return [[]];
    },
    beginTransaction: async () => calls.push(['beginTransaction']),
    execute: async (...args) => {
      calls.push(['execute', ...args]);
      return [{ affectedRows: 1 }];
    },
    commit: async () => calls.push(['commit']),
    rollback: async () => calls.push(['rollback']),
    end: async () => calls.push(['end'])
  };

  const report = await runNpcFlagBackfill({
    apply: true,
    dataPath: '/tmp/npcs.standardized.json',
    reportPath: '/tmp/report.json',
    db: { database: 'terria_v1_local' },
    allowNonPrimaryDb: false
  }, {
    mysqlModule: { createConnection: async () => fakeConnection },
    readJson: () => ({
      records: [{ id: 17, internalName: 'Merchant', flags: { friendly: true }, extras: { townNPC: true } }]
    }),
    writeReport: () => {}
  });

  assert.equal(report.appliedUpdated, 1);
  assert.equal(calls.some(([name]) => name === 'beginTransaction'), true);
  assert.equal(calls.some(([name]) => name === 'commit'), true);
  assert.deepEqual(
    calls.find(([name]) => name === 'execute').slice(1),
    [
      `UPDATE npcs
          SET is_boss = ?,
              is_friendly = ?,
              is_town_npc = ?,
              updated_at = NOW()
        WHERE id = ?`,
      [0, 1, 1, 17]
    ]
  );
});

test('resolveOptions defaults to dry-run and standardized NPC input', () => {
  const options = resolveOptions({}, {
    env: {},
    now: new Date('2026-05-17T00:00:00Z')
  });

  assert.equal(options.apply, false);
  assert.equal(options.db.database, 'terria_v1_local');
  assert.match(options.dataPath, /data\/standardized\/npcs\.standardized\.json$/);
  assert.match(options.reportPath, /reports\/data\/npc-flags-backfill-2026-05-17\.json$/);
});
