import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const {
  executeArmorCanonicalTransaction,
  buildArmorLandingCollationLockQuery,
  validateArmorLandingCollationLockRows,
} = await import('./armor-canonical-transaction-executor.mjs');
const { createArmorCanonicalRecoveryJournalAdapter } = await import('./armor-canonical-recovery-journal-adapter.mjs');
const { createArmorCanonicalRecoveryJournalStore } = await import('./armor-canonical-recovery-journal-store.mjs');

const HASH = value => `sha256:${value.repeat(64)}`;

function fakeConnection({ failOn, rows = {}, serverUuid = 'server-1' } = {}) {
  const calls = [];
  let nextId = 700;
  let lastInsertId = 0;
  const connection = {
    calls,
    async beginTransaction() { calls.push({ op: 'begin' }); },
    async commit() { calls.push({ op: 'commit' }); if (failOn === 'commit') throw new Error('commit lost'); },
    async rollback() { calls.push({ op: 'rollback' }); },
    async query(sql, params = []) {
      calls.push({ op: 'query', sql, params });
      if (failOn && sql.includes(failOn) && /^(INSERT|UPDATE)/.test(sql)) throw new Error(`query failed: ${failOn}`);
      if (sql.includes('@@server_uuid')) return [[{ serverUuid, serverPort: 3306, databaseName: 'terria_v1_local' }]];
      if (sql.includes('crawler_automation_owner')) return [[{ username: 'owner', status: 'ACTIVE' }]];
      if (sql.includes('crawler_automation_write_fence')) return [[{ latest_run_id: 'run-1', fence_token: 'fence-1', active: 1 }]];
      if (sql.includes('COLLATE utf8mb4_0900_ai_ci')) return [[]];
      if (sql.startsWith('INSERT INTO')) { lastInsertId = nextId++; return [{ affectedRows: 1, insertId: lastInsertId }]; }
      if (sql.startsWith('UPDATE')) return [{ affectedRows: 1 }];
      if (sql.startsWith('SELECT *')) return [[rows[params.at(-1)] ?? { id: sql.includes('WHERE `id`') ? params.at(-1) : (lastInsertId || params.at(-1)), created_at: '2026-09-25 00:00:00', updated_at: '2026-09-25 00:00:00' }]];
      return [[]];
    },
  };
  return connection;
}

function intentFixture() {
  const landingPlan = {
    databaseRole: 'local', table: 'source_dataset_landings',
    logicalKey: 'armor_sets_raw|terraria.wiki.gg|wiki.module.armorsetbonuses|Module:ArmorSetBonuses',
    nonGeneratedFields: {
      dataset_type: 'armor_sets_raw', provider: 'terraria.wiki.gg', source_kind: 'module',
      source_key: 'wiki.module.armorsetbonuses', source_page: 'Module:ArmorSetBonuses',
      content_hash: 'a'.repeat(64), payload_json: '{}', is_current: 1,
    }, generatedColumns: ['created_at', 'current_slot', 'id', 'updated_at'], references: [],
  };
  const maintPlan = {
    databaseRole: 'maint', table: 'maint_armor_sets', logicalKey: 'b'.repeat(64),
    nonGeneratedFields: {
      record_key: 'b'.repeat(64), text_key: 'ArmorSetBonus.Test', source_provider: 'terraria.wiki.gg',
      source_page: 'Module:ArmorSetBonuses', landing_source_key: 'wiki.module.armorsetbonuses',
      landing_source_page: 'Module:ArmorSetBonuses', landing_content_hash: 'a'.repeat(64),
      raw_json: '{}', status: 1, deleted: 0,
    }, generatedColumns: ['created_at', 'id', 'updated_at'],
    references: [{ column: 'landing_source_id', target: 'local.source_dataset_landings|armor_sets_raw|terraria.wiki.gg|wiki.module.armorsetbonuses|Module:ArmorSetBonuses' }],
  };
  const intent = {
    intentSha256: HASH('a'), writeTimestamp: '2026-09-25T00:00:00Z',
    insertPlans: [landingPlan, maintPlan],
    demotions: [],
  };
  return { landingMaintIntent: intent, relationIntent: null };
}

test('builds a native collation-equivalence range lock for every Armor landing identity', () => {
  const query = buildArmorLandingCollationLockQuery({
    dataset_type: 'armor_sets_raw', provider: 'terraria.wiki.gg',
    source_key: 'wiki.module.armorsetbonuses', source_page: 'Module:ArmorSetBonuses',
  });
  assert.match(query.sql, /COLLATE utf8mb4_0900_ai_ci/);
  assert.match(query.sql, /FOR UPDATE/);
  assert.match(query.sql, /ORDER BY `id`/);
  assert.deepEqual(query.params, ['armor_sets_raw', 'terraria.wiki.gg', 'wiki.module.armorsetbonuses', 'Module:ArmorSetBonuses']);
});

test('fails closed when MySQL collation-equivalent bytes differ from the incoming tuple', () => {
  const incoming = { dataset_type: 'armor_sets_raw', provider: 'terraria.wiki.gg', source_key: 'Wiki.Module.ArmorSetBonuses', source_page: 'Module:ArmorSetBonuses' };
  assert.throws(() => validateArmorLandingCollationLockRows({
    incoming,
    rows: [{ ...incoming, source_key: 'wiki.module.armorsetbonuses', id: 99 }],
  }), /collation|byte|equivalent/i);
  assert.doesNotThrow(() => validateArmorLandingCollationLockRows({ incoming, rows: [] }));
});

test('Armor executor locks runtime ownership and rederives before the first write', async () => {
  const connection = fakeConnection();
  const order = [];
  const fixture = intentFixture();
  const result = await executeArmorCanonicalTransaction({
    connection,
    packet: { runId: 'run-1', decisionIdentity: 'decision-1', packetHash: HASH('b'), actor: 'owner', serverUuid: 'server-1', fenceToken: 'fence-1' },
    expected: fixture,
    deriveLocked: async () => { order.push('derive'); return fixture; },
    journal: { prepared: async () => order.push('prepared'), materialized: async () => order.push('materialized'), rolledBack: async () => {}, commitUnknown: async () => {}, committed: async () => order.push('committed') },
    validateContracts: false,
    allowPartial: true,
  });
  assert.equal(result.status, 'committed');
  assert.deepEqual(order, ['derive', 'prepared', 'materialized', 'committed']);
  const firstWrite = connection.calls.findIndex(call => call.op === 'query' && /^(INSERT|UPDATE)/.test(call.sql));
  const deriveQuery = connection.calls.findIndex(call => call.op === 'query' && call.sql.includes('crawler_automation_write_fence'));
  assert.ok(deriveQuery >= 0 && deriveQuery < firstWrite);
});

test('Armor executor takes the native collation/gap lock before locked rederivation', async () => {
  const connection = fakeConnection();
  const fixture = intentFixture();
  fixture.landingMaintIntent.snapshots = { landingTransition: { inserts: [{
    dataset_type: 'armor_sets_raw', provider: 'terraria.wiki.gg',
    source_key: 'wiki.module.armorsetbonuses', source_page: 'Module:ArmorSetBonuses',
  }] } };
  await executeArmorCanonicalTransaction({
    connection,
    packet: { runId: 'run-1', decisionIdentity: 'decision-1', packetHash: HASH('b'), actor: 'owner', serverUuid: 'server-1', fenceToken: 'fence-1' },
    expected: fixture,
    deriveLocked: async () => fixture,
    journal: { prepared: async () => {}, materialized: async () => {}, rolledBack: async () => {}, commitUnknown: async () => {}, committed: async () => {} },
    validateContracts: false,
    allowPartial: true,
  });
  const lockIndex = connection.calls.findIndex(call => call.op === 'query' && call.sql.includes('COLLATE utf8mb4_0900_ai_ci'));
  const deriveIndex = connection.calls.findIndex(call => call.op === 'query' && call.sql.includes('crawler_automation_write_fence'));
  assert.ok(lockIndex >= 0);
  assert.ok(deriveIndex < lockIndex);
});

test('Armor executor rolls back and never commits after a bounded write failure', async () => {
  const connection = fakeConnection({ failOn: 'maint_armor_sets' });
  const fixture = intentFixture();
  let rolledBack = 0;
  await assert.rejects(() => executeArmorCanonicalTransaction({
    connection,
    packet: { runId: 'run-1', decisionIdentity: 'decision-1', packetHash: HASH('b'), actor: 'owner', serverUuid: 'server-1', fenceToken: 'fence-1' },
    expected: fixture,
    deriveLocked: async () => fixture,
    journal: { prepared: async () => {}, materialized: async () => {}, rolledBack: async () => { rolledBack += 1; }, commitUnknown: async () => {}, committed: async () => {} },
    validateContracts: false,
    allowPartial: true,
  }), /query failed: maint_armor_sets/);
  assert.equal(connection.calls.some(call => call.op === 'commit'), false);
  assert.equal(connection.calls.at(-1).op, 'rollback');
  assert.equal(rolledBack, 1);
});

test('Armor executor fails closed when locked rederivation drifts from the packet intent', async () => {
  const connection = fakeConnection();
  const fixture = intentFixture();
  const drifted = { ...fixture, landingMaintIntent: { ...fixture.landingMaintIntent, intentSha256: HASH('c') } };
  await assert.rejects(() => executeArmorCanonicalTransaction({
    connection,
    packet: { runId: 'run-1', decisionIdentity: 'decision-1', packetHash: HASH('b'), actor: 'owner', serverUuid: 'server-1', fenceToken: 'fence-1' },
    expected: fixture,
    deriveLocked: async () => drifted,
    journal: { prepared: async () => {}, materialized: async () => {}, rolledBack: async () => {}, commitUnknown: async () => {}, committed: async () => {} },
    validateContracts: false,
    allowPartial: true,
  }), /rederivation drifted/);
  assert.equal(connection.calls.some(call => call.op === 'commit'), false);
});

test('Armor executor marks a commit exception as unknown and never rolls back blindly', async () => {
  const connection = fakeConnection({ failOn: 'commit' });
  const fixture = intentFixture();
  let unknown = 0;
  await assert.rejects(() => executeArmorCanonicalTransaction({
    connection,
    packet: { runId: 'run-1', decisionIdentity: 'decision-1', packetHash: HASH('b'), actor: 'owner', serverUuid: 'server-1', fenceToken: 'fence-1' },
    expected: fixture,
    deriveLocked: async () => fixture,
    journal: { prepared: async () => {}, materialized: async () => {}, rolledBack: async () => {}, commitUnknown: async () => { unknown += 1; }, committed: async () => {} },
    validateContracts: false,
    allowPartial: true,
  }), /commit lost/);
  assert.equal(unknown, 1);
  assert.equal(connection.calls.filter(call => call.op === 'rollback').length, 0);
});

test('Armor executor materializes a projection primary key from its exact relation receipt', async () => {
  const connection = fakeConnection();
  const base = intentFixture();
  const relationIntent = {
    intentSha256: HASH('d'),
    writeTimestamp: base.landingMaintIntent.writeTimestamp,
    insertPlans: [
      { databaseRole: 'relation', table: 'relation_armor_sets', logicalKey: 'r'.repeat(64),
        nonGeneratedFields: { record_key: 'r'.repeat(64), text_key: 'ArmorSetBonus.Test', status: 1, deleted: 0 },
        generatedColumns: ['created_at', 'id', 'updated_at'], references: [] },
      { databaseRole: 'relation', table: 'projection_armor_sets', logicalKey: 'ArmorSetBonus.Test',
        nonGeneratedFields: { relation_record_key: 'r'.repeat(64), text_key: 'ArmorSetBonus.Test', status: 1, deleted: 0 },
        generatedColumns: ['created_at', 'updated_at'],
        references: [{ column: 'id', target: 'relation.relation_armor_sets|' + 'r'.repeat(64) }] },
    ],
  };
  await executeArmorCanonicalTransaction({
    connection,
    packet: { runId: 'run-1', decisionIdentity: 'decision-1', packetHash: HASH('b'), actor: 'owner', serverUuid: 'server-1', fenceToken: 'fence-1' },
    expected: { ...base, relationIntent },
    deriveLocked: async () => ({ ...base, relationIntent }),
    journal: { prepared: async () => {}, materialized: async () => {}, rolledBack: async () => {}, commitUnknown: async () => {}, committed: async () => {} },
    validateContracts: false,
    allowPartial: true,
  });
  const projectionInsert = connection.calls.find(call => call.op === 'query' && call.sql.includes('projection_armor_sets') && call.sql.startsWith('INSERT'));
  assert.ok(projectionInsert);
  assert.deepEqual(projectionInsert.params, ["r".repeat(64), "ArmorSetBonus.Test", 1, 0, 702, "2026-09-25 08:00:00", "2026-09-25 08:00:00"]);
});

test('Armor executor persists PREPARED before DML and commits through the filesystem journal adapter', async () => {
  const serverUuid = '11111111-1111-1111-1111-111111111111';
  const connection = fakeConnection({ serverUuid });
  const base = intentFixture();
  const relationIntent = {
    intentSha256: HASH('d'),
    writeTimestamp: base.landingMaintIntent.writeTimestamp,
    insertPlans: [
      { databaseRole: 'relation', table: 'relation_armor_sets', logicalKey: 'r'.repeat(64),
        nonGeneratedFields: { record_key: 'r'.repeat(64), text_key: 'ArmorSetBonus.Test', status: 1, deleted: 0 },
        generatedColumns: ['created_at', 'id', 'updated_at'], references: [] },
      { databaseRole: 'relation', table: 'projection_armor_sets', logicalKey: 'ArmorSetBonus.Test',
        nonGeneratedFields: { relation_record_key: 'r'.repeat(64), text_key: 'ArmorSetBonus.Test', status: 1, deleted: 0 },
        generatedColumns: ['created_at', 'updated_at'],
        references: [{ column: 'id', target: 'relation.relation_armor_sets|' + 'r'.repeat(64) }] },
    ],
  };
  const expected = { ...base, relationIntent, recoveryIntent: { intentSha256: HASH('e') } };
  const recoveryExpected = {
    landingMaintIntent: { operationId: 'canonical-armor-ingestion', intentSha256: base.landingMaintIntent.intentSha256, writeTimestamp: base.landingMaintIntent.writeTimestamp },
    relationIntent: { operationId: 'canonical-armor-ingestion', intentSha256: relationIntent.intentSha256, writeTimestamp: relationIntent.writeTimestamp },
    recoveryIntent: { operationId: 'canonical-armor-ingestion', intentSha256: HASH('e'), writeTimestamp: base.landingMaintIntent.writeTimestamp },
  };
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-armor-executor-'));
  const store = createArmorCanonicalRecoveryJournalStore({ repoRoot, relativePath: 'reports/journal.json' });
  const journal = createArmorCanonicalRecoveryJournalAdapter({
    store,
    packet: { runId: 'run-1', decisionIdentity: 'decision-1', packetHash: HASH('b'), serverUuid },
    expected: recoveryExpected,
    materialize: async ({ verifiedIdMap }) => ({
      intentSha256: HASH('e'),
      concreteAfterSha256: HASH('f'),
      verifiedIdMap,
    }),
    clock: () => '2026-09-25T00:00:01Z',
  });
  const packet = { runId: 'run-1', decisionIdentity: 'decision-1', packetHash: HASH('b'), actor: 'owner', serverUuid, fenceToken: 'fence-1' };
  const result = await executeArmorCanonicalTransaction({
    connection, packet, expected,
    deriveLocked: async () => expected,
    journal,
    validateContracts: false,
    allowPartial: true,
  });
  assert.equal(result.status, 'committed');
  const persisted = await store.read();
  assert.equal(persisted.state, 'COMMITTED');
  assert.equal(persisted.materializationStatus, 'VERIFIED');
  assert.equal(persisted.history.map(entry => entry.state).join('>'), 'PREPARED>COMMITTED');
  assert.deepEqual(persisted.verifiedIdMap, {
    [`local.source_dataset_landings|armor_sets_raw|terraria.wiki.gg|wiki.module.armorsetbonuses|Module:ArmorSetBonuses`]: 700,
    [`maint.maint_armor_sets|${'b'.repeat(64)}`]: 701,
    [`relation.relation_armor_sets|${'r'.repeat(64)}`]: 702,
    'relation.projection_armor_sets|ArmorSetBonus.Test': 702,
  });
});

test('Armor full-chain mode rejects partial intent or an uncommittable fence before BEGIN', async () => {
  const connection = fakeConnection();
  const fixture = intentFixture();
  await assert.rejects(() => executeArmorCanonicalTransaction({
    connection,
    packet: { runId: 'run-1', decisionIdentity: 'decision-1', packetHash: HASH('b'), actor: 'owner', serverUuid: 'server-1', fenceToken: 'fence-1' },
    expected: fixture,
    deriveLocked: async () => fixture,
    journal: { prepared: async () => {}, materialized: async () => {}, rolledBack: async () => {}, commitUnknown: async () => {}, committed: async () => {} },
    validateContracts: false,
  }), /relation intent is required/);
  assert.equal(connection.calls.some(call => call.op === 'begin'), false);
});
