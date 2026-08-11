import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const EXECUTOR_PATH = 'scripts/data/projectile/projectile-canonical-t1-acceptance.mjs';
const FIXTURE_PATH = 'scripts/data/projectile/fixtures/projectile-t1.sample.json';

test('projectile item-only T1 freezes two item relations and explicit NPC non-coverage', async () => {
  assert.ok(fs.existsSync(EXECUTOR_PATH), 'Projectile T1 executor must exist');
  assert.ok(fs.existsSync(FIXTURE_PATH), 'Projectile T1 fixture must exist');

  const {
    buildProjectileT1LandingRows,
    runProjectileCanonicalT1Acceptance,
    seedProjectileFixtureItems,
    seedProjectileFixtureMaintItems,
  } = await import('./projectile-canonical-t1-acceptance.mjs');
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

  assert.equal(typeof buildProjectileT1LandingRows, 'function');
  assert.equal(typeof runProjectileCanonicalT1Acceptance, 'function');
  assert.equal(typeof seedProjectileFixtureItems, 'function');
  assert.equal(typeof seedProjectileFixtureMaintItems, 'function');
  assert.equal(fixture.coverage?.npcProjectiles, 'not-covered');
  assert.deepEqual(
    fixture.records.map(({ internalName, itemInternalName }) => ({ internalName, itemInternalName })),
    [
      { internalName: 'WoodenArrowFriendly', itemInternalName: 'WoodenBow' },
      { internalName: 'FireArrow', itemInternalName: 'FlamingArrow' },
    ],
  );

  const landingRows = buildProjectileT1LandingRows({ fixture });
  assert.equal(landingRows.length, 1);
  assert.equal(landingRows[0].dataset_type, 'projectiles_raw');
  assert.equal(JSON.parse(landingRows[0].payload_json).projectiles.length, 2);
});

test('projectile T1 local item seed copies only fixture identities into isolated local', async () => {
  const { seedProjectileFixtureItems } = await import('./projectile-canonical-t1-acceptance.mjs');
  const calls = [];
  const result = await seedProjectileFixtureItems({
    sourceConnection: fakeSourceConnection(calls),
    targetConnection: fakeTargetConnection(calls),
    targetDatabase: 'terria_v1_automation_acceptance_prj_0123456789abcdef_local',
    itemInternalNames: ['WoodenBow', 'FlamingArrow'],
  });

  assert.deepEqual(result, { itemRows: 2 });
  assert.match(calls[0].sql, /SELECT \* FROM `terria_v1_local`\.`items`/);
  assert.match(calls[1].sql, /INSERT INTO `terria_v1_automation_acceptance_prj_0123456789abcdef_local`\.`items`/);
  assert.doesNotMatch(calls[0].sql, /(?:UPDATE|DELETE|INSERT)/);
});

test('projectile T1 maint item seed copies only fixture identities into isolated maint', async () => {
  const { seedProjectileFixtureMaintItems } = await import('./projectile-canonical-t1-acceptance.mjs');
  const calls = [];
  const result = await seedProjectileFixtureMaintItems({
    sourceConnection: fakeSourceConnection(calls),
    targetConnection: fakeTargetConnection(calls),
    targetDatabase: 'terria_v1_automation_acceptance_prj_0123456789abcdef_maint',
    itemInternalNames: ['WoodenBow', 'FlamingArrow'],
  });

  assert.deepEqual(result, { itemRows: 2 });
  assert.match(calls[0].sql, /SELECT \* FROM `terria_v1_maint`\.`maint_items`/);
  assert.match(calls[1].sql, /INSERT INTO `terria_v1_automation_acceptance_prj_0123456789abcdef_maint`\.`maint_items`/);
  assert.doesNotMatch(calls[0].sql, /(?:UPDATE|DELETE|INSERT)/);
});

test('projectile T1 rejects formal and non-derived database targets', async () => {
  const { runProjectileCanonicalT1Acceptance } = await import('./projectile-canonical-t1-acceptance.mjs');
  for (const database of ['terria_v1_local', 'terria_v1_maint', 'unrelated_local']) {
    await assert.rejects(() => runProjectileCanonicalT1Acceptance({
      profile: 't1', repoRoot: process.cwd(), databases: { local: database }, mysql: {},
    }), /isolated local database/, database);
  }
});

test('projectile T1 imports two projectiles and proves exact item-only relation closure', async () => {
  const { runProjectileCanonicalT1Acceptance } = await import('./projectile-canonical-t1-acceptance.mjs');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-projectile-t1-test-'));
  const fixturePath = 'scripts/data/projectile/fixtures/projectile-t1.sample.json';
  fs.mkdirSync(path.join(repoRoot, path.dirname(fixturePath)), { recursive: true });
  fs.copyFileSync(path.join(process.cwd(), fixturePath), path.join(repoRoot, fixturePath));
  const invocations = [];

  try {
    const result = await runProjectileCanonicalT1Acceptance({
      profile: 't1', runId: 'projectile-t1-test', repoRoot,
      databases: isolatedDatabases(),
      mysql: isolatedMysql(),
      createConnectionImpl: async (options) => ({
        options,
        async query(sql, params) {
          invocations.push(['query', options.database, sql, params]);
          return [[]];
        },
        async execute(sql, params) {
          invocations.push(['execute', options.database, sql, params]);
          return [{ affectedRows: 1 }];
        },
        async end() {},
      }),
      seedItemsImpl: async () => ({ itemRows: 2 }),
      seedMaintItemsImpl: async () => ({ itemRows: 2 }),
      importProjectilesImpl: async (_connection, records, stats) => {
        invocations.push(['importProjectiles', records]);
        Object.assign(stats, { input: 2, created: 2, updated: 0, skipped: 0, errors: [] });
      },
      runMaintSyncImpl: async (options, dependencies) => {
        invocations.push(['runMaintSync', options, dependencies]);
        return { writes: { inserted: 2, updated: 0, skipped: 0 } };
      },
      runSyncImpl: async (options, dependencies) => {
        invocations.push(['runSync', options, dependencies]);
        return { apply: true, results: exactRelationResults() };
      },
    });

    assert.equal(result.status, 'passed');
    assert.deepEqual(result.projectileImport, { input: 2, created: 2, updated: 0, skipped: 0, errors: [] });
    assert.equal(result.consolidation.relationProjectileCount, 2);
    assert.equal(result.consolidation.itemProjectileRelationCount, 2);
    assert.equal(result.consolidation.projectionProjectileCount, 2);
    assert.deepEqual(result.coverage.npcProjectiles, { status: 'not-covered', relationCount: 0 });

    const maintInvocation = invocations.find(([label]) => label === 'runMaintSync');
    assert.deepEqual(maintInvocation[1].scopes, ['projectiles']);
    assert.equal(maintInvocation[1].database, result.databases.maint);
    const relationInvocation = invocations.find(([label]) => label === 'runSync');
    assert.equal(relationInvocation[1].localDatabase, result.databases.local);
    assert.equal(relationInvocation[1].maintDatabase, result.databases.maint);
    assert.equal(relationInvocation[1].relationDatabase, result.databases.relation);
    assert.deepEqual(relationInvocation[1].scopes, ['projectile']);
    assert.equal(relationInvocation[2].config.database.username, 'runner');
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('projectile T1 fails closed on relation drift or accidental NPC coverage', async () => {
  const { runProjectileCanonicalT1Acceptance } = await import('./projectile-canonical-t1-acceptance.mjs');
  for (const results of [
    { ...exactRelationResults(), itemProjectileRelations: [] },
    { ...exactRelationResults(), itemProjectileAudits: [] },
    {
      ...exactRelationResults(),
      relationProjectiles: [{ internalName: 'WrongProjectileA' }, { internalName: 'WrongProjectileB' }],
    },
    {
      ...exactRelationResults(),
      projectionProjectiles: [{ internalName: 'WrongProjectileA' }, { internalName: 'WrongProjectileB' }],
    },
    {
      ...exactRelationResults(),
      itemProjectileRelations: [
        ...exactRelationResults().itemProjectileRelations,
        exactRelationResults().itemProjectileRelations[0],
      ],
    },
    {
      ...exactRelationResults(),
      itemProjectileAudits: [
        ...exactRelationResults().itemProjectileAudits,
        exactRelationResults().itemProjectileAudits[0],
      ],
    },
    { ...exactRelationResults(), npcProjectileRelations: [{ recordKey: 'npc-projectile:unexpected' }] },
  ]) {
    await assert.rejects(() => runProjectileCanonicalT1Acceptance({
      profile: 't1', runId: 'projectile-t1-count-gate', repoRoot: process.cwd(),
      databases: isolatedDatabases(), mysql: isolatedMysql(),
      createConnectionImpl: async () => ({ async query() { return [[]]; }, async end() {} }),
      seedItemsImpl: async () => ({ itemRows: 2 }),
      seedMaintItemsImpl: async () => ({ itemRows: 2 }),
      importProjectilesImpl: async (_connection, _records, stats) => {
        Object.assign(stats, { input: 2, created: 2, updated: 0, skipped: 0, errors: [] });
      },
      runMaintSyncImpl: async () => ({ writes: { inserted: 2, updated: 0 } }),
      runSyncImpl: async () => ({ apply: true, results }),
    }), /fixture consolidation/i);
  }
});

function isolatedDatabases() {
  return {
    local: 'terria_v1_automation_acceptance_prj_0123456789abcdef_local',
    maint: 'terria_v1_automation_acceptance_prj_0123456789abcdef_maint',
    relation: 'terria_v1_automation_acceptance_prj_0123456789abcdef_relation',
  };
}

function isolatedMysql() {
  return {
    host: '127.0.0.1', port: 13306,
    username: 'runner', password: 'secret',
    readonlyUsername: 'reader', readonlyPassword: 'read-secret',
  };
}

function exactRelationResults() {
  return {
    relationProjectiles: [
      { internalName: 'WoodenArrowFriendly' },
      { internalName: 'FireArrow' },
    ],
    projectionProjectiles: [
      { internalName: 'WoodenArrowFriendly' },
      { internalName: 'FireArrow' },
    ],
    itemProjectileRelations: [
      { itemInternalName: 'WoodenBow', projectileInternalName: 'WoodenArrowFriendly', reviewStatus: 'accepted' },
      { itemInternalName: 'FlamingArrow', projectileInternalName: 'FireArrow', reviewStatus: 'accepted' },
    ],
    itemProjectileAudits: [
      { itemInternalName: 'WoodenBow', projectileInternalName: 'WoodenArrowFriendly', auditStatus: 'promoted_to_relation' },
      { itemInternalName: 'FlamingArrow', projectileInternalName: 'FireArrow', auditStatus: 'promoted_to_relation' },
    ],
    npcProjectileRelations: [],
  };
}

function fakeSourceConnection(calls) {
  return {
    async query(sql, params) {
      calls.push({ sql, params });
      return [params.map((internalName, index) => ({ id: index + 1, internal_name: internalName }))];
    },
  };
}

function fakeTargetConnection(calls) {
  return {
    async query(sql, params) {
      calls.push({ sql, params });
      if (/COUNT\(\*\)/.test(sql)) return [[{ count: params.length }]];
      return [{ affectedRows: 1 }];
    },
  };
}
