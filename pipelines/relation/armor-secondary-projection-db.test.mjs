import test from 'node:test';
import assert from 'node:assert/strict';
import { ARMOR_SECONDARY_SOURCE_TABLES, ARMOR_SECONDARY_PROJECTION_TABLES,
  buildArmorSecondaryProjectionProposal } from './armor-secondary-projection.mjs';
import { readArmorSecondarySnapshot, executeArmorSecondaryProjectionTransaction } from './armor-secondary-projection-db.mjs';
import { fixture } from './armor-secondary-projection.fixture.mjs';

test('secondary snapshot confines all reads and locks complete target ranges only in transaction mode', async () => {
  for (const forUpdate of [false, true]) {
    const queries = [];
    const snapshot = await readArmorSecondarySnapshot({ connection: { async query(sql) {
      queries.push(sql);
      return [[{ id: queries.length }]];
    } }, forUpdate });
    assert.deepEqual(Object.keys(snapshot.sourceRows), Object.keys(ARMOR_SECONDARY_SOURCE_TABLES));
    assert.deepEqual(Object.keys(snapshot.beforeRows), ARMOR_SECONDARY_PROJECTION_TABLES);
    assert.equal(queries.length, 10);
    assert.ok(queries.every(sql => /^SELECT /.test(sql)));
    assert.ok(queries.slice(0, 8).every(sql => sql.endsWith(forUpdate ? 'FOR SHARE' : 'ORDER BY id')));
    assert.ok(queries.slice(8).every(sql => sql.endsWith(forUpdate ? 'FOR UPDATE' : 'ORDER BY id')));
    assert.match(queries[5], /WHERE id IN \(SELECT DISTINCT landing_source_id FROM terria_v1_maint.maint_armor_attribute_rows\)/);
    assert.match(queries[3], /^SELECT id, internal_name, status, deleted FROM terria_v1_local.items/);
  }
});

test('secondary snapshot rejects malformed query results rather than silently producing an empty baseline', async () => {
  await assert.rejects(readArmorSecondarySnapshot({ connection: { async query() { return [{}]; } } }), /rows/);
});

async function transactionFixture({ commitError, mutateSnapshot, failInsert = false, failOutcome = false,
  rollbackError, existing = false, staleRelationKey = false, receiptRows = 1, postCommitDrift = false } = {}) {
  const input = await fixture();
  if (existing) {
    input.beforeRows = (await buildArmorSecondaryProjectionProposal(input)).afterRows;
    if (existing === 'stale') input.beforeRows.projection_item_armor_attributes[0].defense_value = 999;
    if (staleRelationKey) {
      const current = input.sourceRows.relation_armor_attribute_rows[0];
      input.sourceRows.relation_armor_attribute_rows.push({
        ...current, id: 735, record_key: 'retired-relation-key', status: 0, deleted: 1,
      });
      input.beforeRows.projection_item_armor_attributes[0].relation_record_key = 'retired-relation-key';
    }
  }
  const proposal = await buildArmorSecondaryProjectionProposal(input);
  const events = [];
  let rows = structuredClone(input.beforeRows);
  const connection = {
    async query(sql) {
      events.push(sql);
      if (sql.startsWith('SET ')) return [];
      if (sql.includes('@@server_uuid')) return [[{ serverUuid: input.serverUuid }]];
      const target = ARMOR_SECONDARY_PROJECTION_TABLES.find(table => sql.includes(`terria_v1_relation.${table}`));
      if (target) return [structuredClone(rows[target])];
      const entry = Object.entries(ARMOR_SECONDARY_SOURCE_TABLES).find(([, table]) => sql.startsWith(`SELECT * FROM ${table} `)
        || sql.includes(`FROM ${table} ORDER BY`));
      assert.ok(entry, `unexpected SQL ${sql}`);
      const result = structuredClone(input.sourceRows[entry[0]]);
      if (mutateSnapshot) mutateSnapshot(entry[0], result);
      return [result];
    },
    async beginTransaction() { events.push('begin'); },
    async execute(sql, values) {
      events.push('dml');
      if (failInsert) throw new Error('insert failed');
      const table = ARMOR_SECONDARY_PROJECTION_TABLES.find(name => sql.includes(name));
      assert.ok(table);
      const columns = [...sql.matchAll(/`([a-z_]+)`/g)].map(match => match[1]).filter(name => name !== table && name !== 'terria_v1_relation');
      const row = Object.fromEntries(columns.map((column, i) => [column, values[i] instanceof Date ? values[i].toISOString() : values[i]]));
      if (sql.startsWith('INSERT INTO')) rows[table].push(row);
      else {
        assert.match(sql, /^UPDATE .* WHERE `id` = \?$/);
        const index = rows[table].findIndex(current => current.id === row.id);
        assert.ok(index >= 0);
        rows[table][index] = row;
      }
      return [{ affectedRows: receiptRows }];
    },
    async commit() {
      events.push('commit');
      if (commitError) throw commitError;
      if (postCommitDrift) rows.projection_item_armor_attributes[0].defense_value = 999;
    },
    async rollback() { events.push('rollback'); if (rollbackError) throw rollbackError; rows = structuredClone(input.beforeRows); },
  };
  const args = { connection, proposal,
    assertRuntimeFence: async () => { events.push('fence'); },
    consumePermit: async () => { events.push('permit'); },
    persistPrepared: async evidence => { events.push('prepared'); assert.equal(evidence.proposalSha256, proposal.proposalSha256); },
    persistOutcome: async evidence => { events.push(evidence.status); if (failOutcome) throw new Error('outcome unavailable'); },
  };
  return { args, events, proposal, rows: () => rows };
}

test('secondary transaction rederives under locks, persists preparation before DML and reads back after commit', async () => {
  const f = await transactionFixture();
  const result = await executeArmorSecondaryProjectionTransaction(f.args);
  assert.equal(result.status, 'COMMITTED');
  assert.equal(result.affectedRows, 2);
  assert.ok(f.events.indexOf('prepared') < f.events.indexOf('dml'));
  assert.ok(f.events.indexOf('permit') < f.events.indexOf('dml'));
  assert.ok(f.events.indexOf('commit') < f.events.indexOf('COMMITTED'));
  assert.equal(f.events.filter(event => event === 'permit').length, 1);
  assert.ok(f.events.filter(event => typeof event === 'string' && event.includes('FOR UPDATE')).length >= 2);
  assert.deepEqual(f.rows(), f.proposal.afterRows);
});

test('secondary snapshot drift blocks before permit or DML and confirms rollback', async () => {
  const f = await transactionFixture({ mutateSnapshot: (table, rows) => {
    if (table === 'local_items') rows[0].internal_name = 'Foreign';
  } });
  await assert.rejects(executeArmorSecondaryProjectionTransaction(f.args), /ID-name/);
  assert.ok(f.events.includes('rollback'));
  assert.ok(!f.events.includes('dml'));
  assert.ok(!f.events.includes('permit'));
});

test('secondary DML failure rolls back and records terminal rollback evidence', async () => {
  const f = await transactionFixture({ failInsert: true });
  await assert.rejects(executeArmorSecondaryProjectionTransaction(f.args), error => {
    assert.equal(error.transactionCommitted, false);
    assert.equal(error.requiresReadbackReconciliation, false);
    return /insert failed/.test(error.message);
  });
  assert.ok(f.events.includes('ROLLBACK_CONFIRMED'));
  assert.ok(!f.events.includes('commit'));
});

test('secondary commit acknowledgement loss never rolls back blindly or masks the original error', async () => {
  const f = await transactionFixture({ commitError: Object.freeze(new Error('commit uncertain')), failOutcome: true });
  await assert.rejects(executeArmorSecondaryProjectionTransaction(f.args), error => {
    assert.match(error.message, /commit uncertain/);
    assert.equal(error.transactionCommitted, null);
    assert.equal(error.requiresReadbackReconciliation, true);
    assert.equal(error.suppressedErrors[0].message, 'outcome unavailable');
    return true;
  });
  assert.ok(!f.events.includes('rollback'));
  assert.ok(f.events.includes('COMMIT_UNKNOWN'));
});

test('secondary rollback failure retains the DML cause and requires readback reconciliation', async () => {
  const f = await transactionFixture({ failInsert: true, rollbackError: new Error('rollback failed') });
  await assert.rejects(executeArmorSecondaryProjectionTransaction(f.args), error => {
    assert.match(error.message, /insert failed/);
    assert.equal(error.requiresReadbackReconciliation, true);
    assert.equal(error.suppressedErrors[0].message, 'rollback failed');
    return true;
  });
});

test('secondary cannot execute without every authorization and durable-evidence adapter', async () => {
  for (const key of ['assertRuntimeFence', 'consumePermit', 'persistPrepared', 'persistOutcome']) {
    const f = await transactionFixture(); delete f.args[key];
    await assert.rejects(executeArmorSecondaryProjectionTransaction(f.args), /requires/);
    assert.deepEqual(f.events, []);
  }
});

test('secondary updates preserve identities and matching no-op consumes a permit without DML', async () => {
  for (const existing of [true, 'stale']) {
    const f = await transactionFixture({ existing });
    const result = await executeArmorSecondaryProjectionTransaction(f.args);
    assert.equal(result.affectedRows, existing === 'stale' ? 1 : 0);
    assert.equal(f.events.filter(event => event === 'permit').length, 1);
    assert.equal(f.events.filter(event => event === 'dml').length, result.affectedRows);
    assert.deepEqual(f.rows(), f.proposal.afterRows);
    if (existing === true) assert.equal(result.acceptance, 'mechanism-no-op-only');
  }
});

test('secondary updates use stable projection ids when replacing retired relation keys', async () => {
  const f = await transactionFixture({ existing: true, staleRelationKey: true });
  const result = await executeArmorSecondaryProjectionTransaction(f.args);
  assert.equal(result.status, 'COMMITTED');
  assert.equal(result.affectedRows, 2);
  assert.deepEqual(f.rows(), f.proposal.afterRows);
});

test('secondary rejects unexpected row receipts before committing', async () => {
  for (const receiptRows of [0, 2]) {
    const f = await transactionFixture({ receiptRows });
    await assert.rejects(executeArmorSecondaryProjectionTransaction(f.args), /receipt/);
    assert.ok(f.events.includes('ROLLBACK_CONFIRMED'));
    assert.ok(!f.events.includes('commit'));
  }
});

test('secondary post-commit mismatch records reconciliation required without rollback', async () => {
  const f = await transactionFixture({ postCommitDrift: true });
  await assert.rejects(executeArmorSecondaryProjectionTransaction(f.args), error => {
    assert.equal(error.transactionCommitted, true);
    assert.equal(error.requiresReadbackReconciliation, true);
    return /readback mismatch/.test(error.message);
  });
  assert.ok(f.events.includes('COMMITTED_READBACK_REQUIRED'));
  assert.ok(!f.events.includes('rollback'));
});
