import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../relation/armor-shroomite-source-test-fixture.mjs';
import {
  buildArmorItemEffectSourceProposal as build,
  validateArmorItemEffectSourceProposal as validate,
  executeArmorItemEffectSourceTransaction as execute,
} from './armor-item-effect-source-transaction.mjs';

const tables = {
  currentLocalLandings: ['terria_v1_local', 'source_dataset_landings'],
  currentMaintLandings: ['terria_v1_maint', 'source_dataset_landings'],
  currentMaintRows: ['terria_v1_maint', 'maint_armor_attribute_rows'],
};
const input = () => ({ source: fixture(), parsedAt: '2026-09-30T00:00:00Z',
  currentLocalLandings: [], currentMaintLandings: [], currentMaintRows: [] });

function setup(options = {}) {
  const proposal = build({ input: input(), serverUuid: 'uuid-1' });
  const rows = Object.fromEntries(Object.keys(tables).map(key => [key, []]));
  const nextIds = { currentLocalLandings: 800, currentMaintLandings: 900, currentMaintRows: 1000 };
  const events = [];
  let committing = false;
  let reads = 0;
  const connection = {
    async query(sql, params = []) {
      events.push({ sql, params });
      if (sql.startsWith('SET ')) return [[]];
      if (sql.includes('@@server_uuid')) return [[{ serverUuid: options.wrongServer ? 'other' : 'uuid-1', maxAllowedPacket: options.smallPacket ? 1000 : 67108864 }]];
      if (sql.includes('information_schema.TABLES')) return [Object.values(tables).map(([databaseName, tableName]) => ({
        databaseName, tableName, engine: options.wrongEngine ? 'MyISAM' : 'InnoDB',
      }))];
      const key = Object.keys(tables).find(key => sql.includes(tables[key].map(part => `\`${part}\``).join('.')));
      assert.ok(key, `unexpected query ${sql}`);
      assert.match(sql, /WHERE/);
      assert.ok(params.includes(proposal.candidate.maintLandingRow.source_key));
      reads++;
      const result = structuredClone(rows[key]);
      if (options.drift && reads === 1) result.push({ ...proposal.candidate.localLandingRow, id: 6, payload_json: '{}' });
      if (options.providerAlias && reads === 1) result.push({ ...proposal.candidate.localLandingRow, id: 6, provider: 'TERRARIA.WIKI.GG' });
      if (options.collationAlias && reads === 1) result.push({ ...proposal.candidate.localLandingRow, id: 6, source_key: proposal.candidate.localLandingRow.source_key.toUpperCase() });
      if (options.badReadback && rows[key].length && key === 'currentMaintRows') result[0].raw_json = '{}';
      if (options.postCommitDrift && committing && key === 'currentMaintRows') result.pop();
      return [result];
    },
    async execute(sql, values) {
      events.push('dml');
      assert.match(sql, /^INSERT INTO /);
      if (options.failInsert) throw new Error('insert failed');
      const key = Object.keys(tables).find(key => sql.includes(tables[key].map(part => `\`${part}\``).join('.')));
      assert.ok(key, 'only the three owned tables may be inserted');
      const columnText = sql.match(/\(([^)]+)\) VALUES/)[1];
      const columns = [...columnText.matchAll(/`([a-z_]+)`/g)].map(match => match[1]);
      assert.ok(!columns.includes('id'));
      const row = Object.fromEntries(columns.map((column, i) => [column, values[i] instanceof Date ? values[i].toISOString() : values[i]]));
      row.id = nextIds[key]++;
      rows[key].push(row);
      return [{ affectedRows: options.badReceipt ? 0 : 1, insertId: options.wrongInsertId ? row.id + 5 : row.id }];
    },
    async beginTransaction() { events.push('begin'); },
    async commit() { events.push('commit'); committing = true; if (options.commitLost) throw Object.freeze(new Error('commit uncertain')); },
    async rollback() { events.push('rollback'); if (options.rollbackLost) throw new Error('rollback uncertain'); },
  };
  const args = { connection, proposal,
    assertRuntimeFence: async () => { events.push('fence'); if (options.badFence) throw new Error('fence invalid'); },
    consumePermit: async () => { events.push('permit-start'); await Promise.resolve(); if (options.badPermit) throw new Error('permit rejected'); events.push('permit-done'); },
    persistPrepared: async value => { events.push('prepared'); assert.equal(value.proposalSha256, proposal.proposalSha256); if (options.badPrepared) throw new Error('prepared unavailable'); },
    persistOutcome: async value => { events.push(value.status); if (options.badOutcome) throw new Error('outcome unavailable'); },
  };
  return { args, events, rows, proposal };
}

test('source transaction derives exact five inserts, separate landing IDs and post-commit readback', async () => {
  const f = setup(); const result = await execute(f.args);
  assert.equal(result.status, 'COMMITTED');
  assert.equal(result.affectedRows, 5);
  assert.equal(result.acceptance, 'source-persistence-only');
  assert.equal(f.events.filter(event => event === 'permit-done').length, 1);
  assert.ok(f.events.indexOf('prepared') < f.events.indexOf('permit-start'));
  assert.ok(f.events.indexOf('permit-done') < f.events.indexOf('dml'));
  assert.ok(f.events.indexOf('commit') < f.events.indexOf('COMMITTED'));
  assert.ok(f.rows.currentMaintRows.every(row => row.landing_source_id === 900));
  assert.equal(result.bindings.localLandingId, 800);
  assert.equal(result.bindings.maintLandingId, 900);
  assert.deepEqual(result.bindings.maintIds, [1000, 1001, 1002]);
  const locks = f.events.filter(event => event?.sql?.includes('FOR UPDATE'));
  assert.ok(locks.length >= 3);
  assert.ok(locks.every(event => event.sql.includes('COLLATE utf8mb4_0900_ai_ci')));
});

test('exact persisted source rows replay without inserts or replacement IDs', async () => {
  const f = setup(); await execute(f.args);
  f.events.length = 0;
  f.args.proposal = build({ input: { ...input(), ...structuredClone(f.rows) }, serverUuid: 'uuid-1' });
  // The callback records evidence for the immutable proposal captured by setup.
  f.args.persistPrepared = async () => { f.events.push('prepared'); };
  const replay = await execute(f.args);
  assert.equal(replay.affectedRows, 0);
  assert.deepEqual(replay.bindings.maintIds, [1000, 1001, 1002]);
  assert.ok(!f.events.includes('dml'));
});

for (const flag of ['wrongServer', 'wrongEngine', 'smallPacket', 'drift', 'collationAlias', 'providerAlias', 'badFence', 'badPrepared']) {
  test(`${flag} blocks before permit and business DML`, async () => {
    const f = setup({ [flag]: true });
    await assert.rejects(execute(f.args));
    assert.ok(!f.events.includes('permit-start'));
    assert.ok(!f.events.includes('dml'));
    assert.ok(f.events.includes('rollback'));
  });
}

for (const flag of ['failInsert', 'badReceipt', 'wrongInsertId', 'badReadback']) {
  test(`${flag} rolls back and preserves terminal evidence`, async () => {
    const f = setup({ [flag]: true });
    await assert.rejects(execute(f.args), error => {
      assert.equal(error.transactionCommitted, false);
      assert.equal(error.dispatchPermitConsumed, true);
      return true;
    });
    assert.ok(f.events.includes('ROLLBACK_CONFIRMED'));
    assert.ok(!f.events.includes('commit'));
  });
}

test('asynchronous permit rejection prevents writes and records uncertain consumption', async () => {
  const f = setup({ badPermit: true });
  await assert.rejects(execute(f.args), error => {
    assert.equal(error.dispatchPermitConsumed, null);
    return /permit rejected/.test(error.message);
  });
  assert.ok(!f.events.includes('dml'));
  assert.ok(f.events.includes('ROLLBACK_CONFIRMED'));
});

test('rollback acknowledgement loss requires reconciliation', async () => {
  const f = setup({ failInsert: true, rollbackLost: true });
  await assert.rejects(execute(f.args), error => {
    assert.equal(error.requiresReadbackReconciliation, true);
    assert.match(error.suppressedErrors[0].message, /rollback uncertain/);
    return true;
  });
  assert.ok(f.events.includes('ROLLBACK_UNKNOWN'));
});

for (const flag of ['commitLost', 'postCommitDrift', 'badOutcome']) {
  test(`${flag} never triggers a blind rollback after commit begins`, async () => {
    const f = setup({ [flag]: true });
    await assert.rejects(execute(f.args), error => {
      assert.equal(error.requiresReadbackReconciliation, true);
      assert.equal(error.transactionCommitted, flag === 'commitLost' ? null : true);
      return true;
    });
    assert.ok(!f.events.includes('rollback'));
  });
}

test('proposal source and candidate mutation is rejected before BEGIN', async () => {
  const f = setup(); f.args.proposal.candidate.maintRows[0].defense_value = 12;
  assert.throws(() => validate(f.args.proposal), /drift/);
  await assert.rejects(execute(f.args), /drift/);
  assert.deepEqual(f.events, []);
});

test('mandatory authorization and durable journal adapters cannot be omitted', async () => {
  const f = setup(); delete f.args.persistPrepared;
  await assert.rejects(execute(f.args), /adapter/);
  assert.deepEqual(f.events, []);
});

test('landing reads constrain the existing provider/source-key index before fetching payloads or locking', async () => {
  const f = setup();
  await execute(f.args);
  const reads = f.events.filter(event => event?.sql?.includes('source_dataset_landings') && event.sql.startsWith('SELECT *'));
  assert.ok(reads.length > 0);
  for (const { sql, params } of reads) {
    assert.match(sql, /WHERE `provider` = \? COLLATE utf8mb4_0900_ai_ci AND `source_key` = \?/);
    assert.equal(params[0], 'terraria.wiki.gg');
  }
});

for (const state of ['local-only', 'landings-only', 'one-maint-row']) {
  test(`partial persisted state (${state}) inserts only missing source rows`, async () => {
    const f = setup(); await execute(f.args);
    if (state === 'local-only') f.rows.currentMaintLandings.length = 0;
    f.rows.currentMaintRows.length = state === 'one-maint-row' ? 1 : 0;
    f.args.proposal = build({ input: { ...input(), ...structuredClone(f.rows) }, serverUuid: 'uuid-1' });
    f.args.persistPrepared = async () => {};
    f.events.length = 0;
    const result = await execute(f.args);
    assert.equal(result.affectedRows, state === 'local-only' ? 4 : state === 'landings-only' ? 3 : 2);
    assert.equal(result.bindings.localLandingId, 800);
    assert.equal(result.bindings.maintLandingId, state === 'local-only' ? 901 : 900);
    if (state === 'one-maint-row') assert.equal(result.bindings.maintIds[0], 1000);
  });
}
