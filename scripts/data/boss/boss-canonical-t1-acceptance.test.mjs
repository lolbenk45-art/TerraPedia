import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildBossT1LandingRows,
  runBossCanonicalT1Acceptance,
  seedBossFixtureDependencies,
  seedBossFixtureMaintDependencies
} from './boss-canonical-t1-acceptance.mjs';

test('boss T1 landing rows preserve two boss records for the real maint mapper', () => {
  const rows = buildBossT1LandingRows({
    bossFixture: JSON.parse(fs.readFileSync('scripts/data/boss/fixtures/boss-t1.sample.json', 'utf8')),
    lootFixture: JSON.parse(fs.readFileSync('scripts/data/boss/fixtures/boss-loot-t1.sample.json', 'utf8')),
  });
  assert.equal(rows.filter((row) => row.dataset_type === 'bosses_raw').length, 2);
  assert.equal(rows.filter((row) => row.dataset_type === 'item_relations_bundle_raw').length, 0);
  assert.ok(rows.every((row) => /^boss-t1:/.test(row.source_key)));
});

test('boss T1 dependency seed copies only fixture identities from formal local to isolated local', async () => {
  const calls = [];
  const result = await seedBossFixtureDependencies({
    sourceConnection: {
      async query(sql, params) {
        calls.push({ sql, params });
        return [[...params.map((internalName, index) => ({ id: index + 1, internal_name: internalName, name: internalName }))]];
      },
    },
    targetConnection: {
      async query(sql, params) {
        calls.push({ sql, params });
        if (/COUNT\(\*\)/.test(sql)) return [[{ count: params.length }]];
        return [{ affectedRows: 1 }];
      },
    },
    targetDatabase: 'terria_v1_automation_acceptance_npc_0123456789abcdef_local',
    npcInternalNames: ['KingSlime', 'EyeofCthulhu'],
    itemInternalNames: ['LesserHealingPotion', 'CorruptSeeds'],
  });

  assert.deepEqual(result, { npcRows: 2, itemRows: 2 });
  assert.equal(calls.length, 8);
  assert.match(calls[0].sql, /SELECT \* FROM `terria_v1_local`\.`npcs`/);
  assert.match(calls[1].sql, /INSERT INTO `terria_v1_automation_acceptance_npc_0123456789abcdef_local`\.`npcs`/);
  assert.doesNotMatch(calls[0].sql, /(?:UPDATE|DELETE|INSERT)/);
});

test('boss T1 maint dependency seed copies only fixture identities into isolated maint', async () => {
  const calls = [];
  const result = await seedBossFixtureMaintDependencies({
    sourceConnection: {
      async query(sql, params) {
        calls.push({ sql, params });
        return [[...params.map((internalName, index) => ({ id: index + 1, internal_name: internalName }))]];
      },
    },
    targetConnection: {
      async query(sql, params) {
        calls.push({ sql, params });
        if (/COUNT\(\*\)/.test(sql)) return [[{ count: params.length }]];
        return [{ affectedRows: 1 }];
      },
    },
    targetDatabase: 'terria_v1_automation_acceptance_npc_0123456789abcdef_maint',
    npcInternalNames: ['KingSlime', 'EyeofCthulhu'],
    itemInternalNames: ['LesserHealingPotion', 'CorruptSeeds'],
  });

  assert.deepEqual(result, { npcRows: 2, itemRows: 2 });
  assert.match(calls[0].sql, /SELECT \* FROM `terria_v1_maint`\.`maint_npcs`/);
  assert.match(calls[1].sql, /INSERT INTO `terria_v1_automation_acceptance_npc_0123456789abcdef_maint`\.`maint_npcs`/);
  assert.doesNotMatch(calls[0].sql, /(?:UPDATE|DELETE|INSERT)/);
});

test('boss T1 rejects formal and non-local database targets', async () => {
  for (const database of ['terria_v1_local', 'terria_v1_maint', 'unrelated_local']) {
    await assert.rejects(() => runBossCanonicalT1Acceptance({
      profile: 't1', repoRoot: process.cwd(), databases: { local: database }, mysql: {},
    }), /isolated local database/, database);
  }
});

test('boss T1 runs boss, loot, and consolidation stages offline', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-boss-t1-test-'));
  const bossFixture = 'scripts/data/boss/fixtures/boss-t1.sample.json';
  const lootFixture = 'scripts/data/boss/fixtures/boss-loot-t1.sample.json';
  for (const fixture of [bossFixture, lootFixture]) {
    fs.mkdirSync(path.join(repoRoot, path.dirname(fixture)), { recursive: true });
    fs.copyFileSync(path.join(process.cwd(), fixture), path.join(repoRoot, fixture));
  }
  const invocations = [];

  try {
    const result = await runBossCanonicalT1Acceptance({
      profile: 't1', runId: 'boss-t1-test', repoRoot,
      databases: {
        local: 'terria_v1_automation_acceptance_npc_0123456789abcdef_local',
        maint: 'terria_v1_automation_acceptance_npc_0123456789abcdef_maint',
        relation: 'terria_v1_automation_acceptance_npc_0123456789abcdef_relation',
      },
      mysql: {
        host: '127.0.0.1', port: 13306,
        username: 'runner', password: 'secret',
        readonlyUsername: 'reader', readonlyPassword: 'read-secret',
      },
      spawnSyncImpl(_command, args) {
        invocations.push(args);
        const reportArg = args.find((arg) => arg.startsWith('--report-json='));
        if (reportArg) fs.writeFileSync(reportArg.slice('--report-json='.length), '{"status":"passed"}\n');
        return { status: 0, stdout: 'Apply: true\n', stderr: '' };
      },
      async runSyncImpl(options, dependencies) {
        invocations.push(['runSync', options, dependencies.config]);
        return {
          apply: true,
          results: {
            relationBosses: [
              { recordKey: 'boss:1', npcMatchStatus: 'resolved' },
              { recordKey: 'boss:2', npcMatchStatus: 'resolved' }
            ],
            bossItemRewardRelations: [{ recordKey: 'loot:1' }, { recordKey: 'loot:2' }]
          }
        };
      },
      async runMaintSyncImpl() {
        return { writes: { inserted: 2, updated: 0 } };
      },
      async seedDependenciesImpl() {
        return { npcRows: 2, itemRows: 2 };
      },
      async seedMaintDependenciesImpl() {
        return { npcRows: 2, itemRows: 2 };
      },
      async createConnectionImpl() {
        return { async query() { return [[{ count: 2 }]]; }, async end() {} };
      },
    });

    assert.equal(invocations.length, 3);
    assert.ok(invocations[0].includes('--offline=true'));
    assert.ok(invocations[0].includes('--allow-non-primary-db=true'));
    assert.ok(invocations[1].includes('--regenerate-bundle=false'));
    assert.equal(invocations[2][1].apply, true);
    assert.equal(invocations[2][1].maintDatabase, result.databases.maint);
    assert.equal(invocations[2][1].relationDatabase, result.databases.relation);
    assert.equal(invocations[2][2].database.username, 'runner');
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('boss T1 rejects snapshot counts that do not prove exact fixture consolidation', async () => {
  await assert.rejects(() => runBossCanonicalT1Acceptance({
    profile: 't1', runId: 'boss-t1-count-gate', repoRoot: process.cwd(),
    databases: {
      local: 'terria_v1_automation_acceptance_npc_0123456789abcdef_local',
      maint: 'terria_v1_automation_acceptance_npc_0123456789abcdef_maint',
      relation: 'terria_v1_automation_acceptance_npc_0123456789abcdef_relation',
    },
    mysql: { host: '127.0.0.1', port: 13306, username: 'runner', password: 'secret' },
    spawnSyncImpl(_command, args) {
      const reportArg = args.find((arg) => arg.startsWith('--report-json='));
      if (reportArg) fs.writeFileSync(reportArg.slice('--report-json='.length), '{}\n');
      return { status: 0, stdout: '', stderr: '' };
    },
    runMaintSyncImpl: async () => ({ writes: { inserted: 2, updated: 0 } }),
    runSyncImpl: async () => ({
      apply: true,
      results: { relationBosses: Array.from({ length: 25 }), bossItemRewardRelations: [] }
    }),
    seedDependenciesImpl: async () => ({ npcRows: 2, itemRows: 2 }),
    seedMaintDependenciesImpl: async () => ({ npcRows: 2, itemRows: 2 }),
    createConnectionImpl: async () => ({ async query() { return [[]]; }, async end() {} }),
  }), /fixture consolidation/i);
});
