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
const { ARMOR_CANONICAL_POLICY_OWNER_SCOPES, buildArmorCanonicalFenceCommit } = await import('./armor-canonical-write-fence.mjs');
const { buildArmorCanonicalLocalProjectionCandidate } = await import('./armor-canonical-local-projection.mjs');

const HASH = value => `sha256:${value.repeat(64)}`;

function fakeConnection({ failOn, rows = {}, serverUuid = 'server-1', fenceBindings = [] } = {}) {
  const calls = [];
  const reservedFenceKeys = new Set();
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
      if (sql.startsWith('SELECT') && sql.includes('crawler_automation_write_fence') && fenceBindings.length > 0) {
        const key = `${params[1]}.${params[2]}|${params[3]}|${params[4]}`;
        const binding = fenceBindings.find(candidate => candidate.environmentId === params[0]
          && candidate.databaseRole === params[1] && candidate.table === params[2]
          && candidate.fieldGroup === params[3] && candidate.logicalPredicateHash === params[4]);
        return [[...(binding && reservedFenceKeys.has(key) ? [{
          environment_id: binding.environmentId,
          database_role: binding.databaseRole,
          physical_table: binding.table,
          field_group: binding.fieldGroup,
          logical_predicate_hash: binding.logicalPredicateHash,
          latest_run_id: binding.runId,
          fence_token: binding.fenceToken,
          before_generation: binding.beforeGeneration,
          committed_generation: null,
          commit_marker: null,
          active: 1,
        }] : [])]];
      }
      if (sql.startsWith('SELECT') && sql.includes('crawler_automation_write_fence')) return [[{ latest_run_id: 'run-1', fence_token: 'fence-1', active: 1 }]];
      if (sql.startsWith('SELECT') && sql.includes('crawler_automation_mutation_generation')) {
        const binding = fenceBindings.find(candidate => candidate.mutationGenerationScopeHash === params.at(-1));
        return [[{ generation: 0, last_writer_run_id: null, schema_hash: binding?.generationSchemaHash }]];
      }
      if (sql.startsWith('INSERT IGNORE') && sql.includes('crawler_automation_mutation_generation')) return [{ affectedRows: 0 }];
      if (sql.startsWith('INSERT INTO') && sql.includes('crawler_automation_write_fence')) {
        reservedFenceKeys.add(`${params[1]}.${params[2]}|${params[3]}|${params[4]}`);
        return [{ affectedRows: 1, insertId: nextId++ }];
      }
      if (sql.includes('COLLATE utf8mb4_0900_ai_ci')) return [[]];
      if (sql.startsWith('INSERT INTO')) {
        lastInsertId = nextId++;
        calls.at(-1).resultingInsertId = lastInsertId;
        return [{ affectedRows: 1, insertId: lastInsertId }];
      }
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

function localProjectionFixture({ itemId = 5049, missingParent = false } = {}) {
  return buildArmorCanonicalLocalProjectionCandidate({
    sourceArmorSets: [{
      textKey: 'ArmorSetBonus.Test', benefitExpression: 'Test benefit', primaryPart: 'head', setCount: 1,
      uniqueItemIds: [2, 3, 5049], sets: [[5049, 2, 3]],
    }],
    projectionArmorSets: [{
      text_key: 'ArmorSetBonus.Test', source_key: 'ArmorSetBonus.Test',
      male_images: '/managed/test.png', female_images: null, special_images: null,
    }],
    maintItems: [
      { source_id: 5049, internal_name: 'RoninShirt', english_name: 'Wandering Yukata', status: 1, deleted: 0 },
      { source_id: 2, internal_name: 'TestBody', english_name: 'Test Body', status: 1, deleted: 0 },
      { source_id: 3, internal_name: 'TestLegs', english_name: 'Test Legs', status: 1, deleted: 0 },
    ],
    localItems: [
      { id: itemId, internal_name: 'RoninShirt', name: 'Wandering Yukata', status: 1, deleted: 0 },
      { id: 2, internal_name: 'TestBody', name: 'Test Body', status: 1, deleted: 0 },
      { id: 3, internal_name: 'TestLegs', name: 'Test Legs', status: 1, deleted: 0 },
    ],
    currentArmorSets: missingParent ? [] : [{
      id: 700, source_key: 'ArmorSetBonus.Test', text_key: 'ArmorSetBonus.Test',
      benefit_expression: 'Test benefit', primary_part: 'head', set_count: 1, unique_item_count: 3,
      sets_json: '[[5049,2,3]]', unique_item_ids_json: '[2,3,5049]',
      male_images: null, female_images: null, special_images: null, status: 1, deleted: 0,
    }],
    currentArmorSetItems: missingParent ? [] : [
      { id: 10, armor_set_id: 700, set_variant_index: 0, part_index: 0, source_item_id: 5049, item_id: 5049, item_internal_name: 'RoninShirt', item_name: 'Wandering Yukata' },
      { id: 11, armor_set_id: 700, set_variant_index: 0, part_index: 1, source_item_id: 2, item_id: 2, item_internal_name: 'TestBody', item_name: 'Test Body' },
      { id: 12, armor_set_id: 700, set_variant_index: 0, part_index: 2, source_item_id: 3, item_id: 3, item_internal_name: 'TestLegs', item_name: 'Test Legs' },
    ],
  });
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

test('Armor full-chain local writes reject a legacy single-row fence before BEGIN', async () => {
  const connection = fakeConnection();
  const fixture = intentFixture();
  fixture.localProjection = localProjectionFixture({ itemId: 8423 });
  await assert.rejects(() => executeArmorCanonicalTransaction({
    connection,
    packet: { runId: 'run-1', decisionIdentity: 'decision-1', packetHash: HASH('b'), actor: 'owner', serverUuid: 'server-1', fenceToken: 'fence-1', fenceCommit: { generation: 1, marker: 'single-marker' } },
    expected: fixture,
    deriveLocked: async () => fixture,
    journal: { prepared: async () => {}, materialized: async () => {}, rolledBack: async () => {}, commitUnknown: async () => {}, committed: async () => {} },
    validateContracts: false,
    allowPartial: true,
  }), /complete owner-scope fence bindings/i);
  assert.equal(connection.calls.some(call => call.op === 'begin'), false);
});

test('Armor full-chain commits all exact policy scope fence generations in the same transaction', async () => {
  const fixture = intentFixture();
  fixture.localProjection = localProjectionFixture({ itemId: 8423 });
  const fenceCommit = buildArmorCanonicalFenceCommit({
    runId: 'run-1',
    expiresAt: '2030-10-27T10:00:00Z',
    generations: ARMOR_CANONICAL_POLICY_OWNER_SCOPES.map(scope => ({ ...scope, generation: 0 })),
    tokenFactory: (() => { let i = 0; return () => `fence:${String(++i).padStart(64, '0')}`; })(),
    markerFactory: (() => { let i = 0; return () => String(++i).padStart(64, '0'); })(),
  });
  const connection = fakeConnection({ fenceBindings: fenceCommit.bindings });
  const result = await executeArmorCanonicalTransaction({
    connection,
    packet: { runId: 'run-1', decisionIdentity: 'decision-1', packetHash: HASH('b'), actor: 'owner', serverUuid: 'server-1', fenceToken: fenceCommit.bindings[0].fenceToken, authorizationExpiresAt: fenceCommit.expiresAt, fenceCommit },
    expected: fixture,
    deriveLocked: async () => fixture,
    journal: { prepared: async () => {}, materialized: async () => {}, rolledBack: async () => {}, commitUnknown: async () => {}, committed: async () => {} },
    validateContracts: false,
    allowPartial: true,
    strictReadback: false,
  });
  assert.equal(result.status, 'committed');
  const fenceWrites = connection.calls.filter(call => call.op === 'query' && call.sql.startsWith('UPDATE') && call.sql.includes('crawler_automation_write_fence'));
  assert.equal(fenceWrites.length, 9);
  assert.ok(fenceWrites.every(call => call.params[0] === 1 && call.params[7]?.startsWith('fence:')));
  const generationWrites = connection.calls.filter(call => call.op === 'query' && call.sql.startsWith('UPDATE') && call.sql.includes('crawler_automation_mutation_generation'));
  assert.equal(generationWrites.length, 9);
});

test('Armor executor inserts a missing local parent before members and binds generated parent ID', async () => {
  const fixture = intentFixture();
  fixture.localProjection = localProjectionFixture({ itemId: 8423, missingParent: true });
  const fenceCommit = buildArmorCanonicalFenceCommit({
    runId: 'run-parent-insert',
    expiresAt: '2030-10-27T10:00:00Z',
    generations: ARMOR_CANONICAL_POLICY_OWNER_SCOPES.map(scope => ({ ...scope, generation: 0 })),
    tokenFactory: (() => { let i = 0; return () => `fence:${String(++i).padStart(64, '0')}`; })(),
    markerFactory: (() => { let i = 0; return () => String(++i).padStart(64, '0'); })(),
  });
  const connection = fakeConnection({ fenceBindings: fenceCommit.bindings });
  await executeArmorCanonicalTransaction({
    connection,
    packet: {
      runId: 'run-parent-insert', decisionIdentity: 'decision-parent-insert', packetHash: HASH('c'),
      actor: 'owner', serverUuid: 'server-1', fenceToken: fenceCommit.bindings[0].fenceToken,
      authorizationExpiresAt: fenceCommit.expiresAt, fenceCommit,
    },
    expected: fixture,
    deriveLocked: async () => fixture,
    journal: { prepared: async () => {}, materialized: async () => {}, rolledBack: async () => {}, commitUnknown: async () => {}, committed: async () => {} },
    validateContracts: false,
    allowPartial: true,
    strictReadback: false,
  });

  const parentInsert = connection.calls.find(call => call.op === 'query' && call.sql.startsWith('INSERT') && call.sql.includes('armor_sets'));
  const memberInserts = connection.calls.filter(call => call.op === 'query' && call.sql.startsWith('INSERT') && call.sql.includes('armor_set_items'));
  assert.ok(parentInsert);
  assert.equal(memberInserts.length, 3);
  assert.ok(connection.calls.indexOf(parentInsert) < connection.calls.indexOf(memberInserts[0]));
  const memberColumns = memberInserts[0].sql.match(/\(([^)]+)\) VALUES/)[1]
    .split(', ')
    .map(column => column.replaceAll('`', ''));
  const parentIdIndex = memberColumns.indexOf('armor_set_id');
  assert.ok(parentInsert.resultingInsertId > 0);
  assert.ok(memberInserts.every(call => call.params[parentIdIndex] === parentInsert.resultingInsertId));
});
