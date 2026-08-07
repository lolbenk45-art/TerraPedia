import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runBossCanonicalT1Acceptance, seedBossFixtureDependencies } from './boss-canonical-t1-acceptance.mjs';

test('boss T1 dependency seed copies only fixture identities from formal local to isolated local', async () => {
  const calls = [];
  const result = await seedBossFixtureDependencies({
    connection: {
      async query(sql, params) {
        calls.push({ sql, params });
        if (/COUNT\(\*\)/.test(sql)) return [[{ count: params.length }]];
        return [{ affectedRows: params.length }];
      },
    },
    targetDatabase: 'terria_v1_automation_acceptance_npc_0123456789abcdef_local',
    npcInternalNames: ['KingSlime', 'EyeofCthulhu'],
    itemInternalNames: ['LesserHealingPotion', 'CorruptSeeds'],
  });

  assert.deepEqual(result, { npcRows: 2, itemRows: 2 });
  assert.equal(calls.length, 4);
  assert.match(calls[0].sql, /INSERT IGNORE INTO `terria_v1_automation_acceptance_npc_0123456789abcdef_local`\.`npcs`/);
  assert.match(calls[0].sql, /SELECT \* FROM `terria_v1_local`\.`npcs`/);
  assert.doesNotMatch(calls[0].sql, /(?:UPDATE|DELETE|INSERT INTO) `terria_v1_local`/);
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
    fs.writeFileSync(path.join(repoRoot, fixture), '{"records":[]}\n');
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
      mysql: { host: '127.0.0.1', port: 13306, username: 'runner', password: 'secret' },
      spawnSyncImpl(_command, args) {
        invocations.push(args);
        const reportArg = args.find((arg) => arg.startsWith('--report-json='));
        if (reportArg) fs.writeFileSync(reportArg.slice('--report-json='.length), '{"status":"passed"}\n');
        return { status: 0, stdout: 'Apply: true\n', stderr: '' };
      },
      async runSyncImpl(options, dependencies) {
        invocations.push(['runSync', options, dependencies.config]);
        return { apply: true, results: { relationBosses: [{ recordKey: 'boss:test' }] } };
      },
      async seedDependenciesImpl() {
        return { npcRows: 2, itemRows: 2 };
      },
      async createConnectionImpl() {
        return { async end() {} };
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
