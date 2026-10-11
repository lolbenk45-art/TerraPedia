import assert from 'node:assert/strict';
import test from 'node:test';

import * as executor from './buff-item-maint-insert-executor.mjs';
import { sourceFixture, proposalInput } from './buff-item-maint-insert.fixture.mjs';
import { buildBuffItemMaintInsertProposal, hashBuffItemMaintValue,
  BUFF_ITEM_MAINT_OWNERSHIP_KEYS, BUFF_ITEM_MAINT_INSERT_OPERATION_ID } from './buff-item-maint-insert-contract.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const hash = `sha256:${'a'.repeat(64)}`;
const dates = { created_at: '2026-10-06 00:00:00', updated_at: '2026-10-06 00:00:00' };

async function harness() {
  const source = sourceFixture();
  const preliminary = await buildBuffItemMaintInsertProposal(proposalInput({ source }));
  const maint = { ...preliminary.maintInserts[0], id: 9, source_id: 1, internal_name: 'CopperPickaxe', landing_source_id: 11, ...dates };
  const landing = { ...preliminary.landing, id: 11, source_key: 'wiki.module.iteminfo', ...dates };
  const proposal = await buildBuffItemMaintInsertProposal(proposalInput({ source, maintRows: [maint], landingRows: [landing] }));
  const before = clone(proposal.before);
  const rows = clone(before);
  const events = [];
  const authorization = {
    operationId: BUFF_ITEM_MAINT_INSERT_OPERATION_ID, authorizationStatus: 'AUTHORIZED',
    packetHash: hash, executionManifestHash: hash, decisionIdentity: 'test-decision', actor: 'admin',
    authorizedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(),
    technical: { executionManifestHash: hash },
    executionManifest: { operationId: BUFF_ITEM_MAINT_INSERT_OPERATION_ID,
      executionClass: 'formal_buff_item_maint_insert', databaseWrites: true, networkAccess: false,
      ownershipKeys: [...BUFF_ITEM_MAINT_OWNERSHIP_KEYS],
      buffItemMaintInsert: { runId: proposal.runId, contractHash: proposal.contractHash,
        sourceIds: proposal.maintInserts.map(row => row.source_id) } },
  };
  authorization.executionManifestHash = hashBuffItemMaintValue(authorization.executionManifest);
  authorization.technical.executionManifestHash = authorization.executionManifestHash;
  const state = { maintId: 1000, landingId: 100, receiptAffectedRows: 1, badReceipt: false };
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); rows.maintRows = clone(before.maintRows); rows.landingRows = clone(before.landingRows); },
    async execute(sql, values) {
      const columns = [...sql.matchAll(/`([a-z0-9_]+)`/g)].map(match => match[1]);
      if (/^SELECT/.test(sql)) {
        events.push('landing-readback');
        return [clone(rows.landingRows.filter(row => row.id === values[0]))];
      }
      assert.match(sql, /^INSERT INTO `terria_v1_(local|maint)`\.`(source_dataset_landings|maint_items)`/);
      const isLanding = sql.includes('source_dataset_landings');
      const id = isLanding ? state.landingId : state.maintId++;
      const row = { ...Object.fromEntries(columns.slice(2).map((column, index) => [column, values[index]])), id, ...dates };
      rows[isLanding ? 'landingRows' : 'maintRows'].push(row);
      events.push(isLanding ? 'landing-insert' : `maint-insert-${row.source_id}`);
      return [{ affectedRows: state.receiptAffectedRows, insertId: state.badReceipt ? 0 : id }];
    },
  };
  const journal = Object.fromEntries(['prepared', 'materialized', 'rolledBack', 'commitUnknown', 'committed', 'rollbackUnknown']
    .map(name => [name, async evidence => { events.push(name); state[name] = clone(evidence); }]));
  const args = { connection, proposal, authorization, readSource: async () => source,
    lockRuntime: async () => { events.push('lock-runtime'); },
    readLockedRows: async () => { events.push('read-locked'); return clone(rows); },
    consumeDispatchPermit: async () => { events.push('permit'); },
    retainOwnershipFences: async () => { events.push('retain-fences'); },
    releaseOwnershipFences: async () => { events.push('release-fences'); },
    readAfterRows: async () => { events.push('read-after'); return clone(rows); }, journal };
  return { args, events, state, rows, before };
}

test('inserts one landing and six maint rows with real lineage and preserves the complete baseline', async () => {
  assert.equal(typeof executor.executeBuffItemMaintInsertTransaction, 'function', 'six-Item transaction core is missing');
  const h = await harness();
  const result = await executor.executeBuffItemMaintInsertTransaction(h.args);
  assert.equal(result.status, 'committed');
  assert.equal(result.landingId, 100);
  assert.equal(result.maintReceipts.length, 6);
  assert.deepEqual(h.rows.maintRows.slice(0, 1), h.before.maintRows);
  assert.deepEqual(h.rows.landingRows.slice(0, 1), h.before.landingRows);
  assert.ok(h.rows.maintRows.slice(1).every(row => row.landing_source_id === 100 && row.id !== row.source_id));
  assert.ok(h.events.indexOf('read-locked') < h.events.indexOf('permit'));
  assert.ok(h.events.indexOf('prepared') < h.events.indexOf('permit'));
  assert.ok(h.events.indexOf('landing-readback') < h.events.indexOf('maint-insert-6148'));
  assert.ok(h.events.indexOf('materialized') < h.events.indexOf('commit'));
  assert.deepEqual(h.state.materialized.maintReceipts, result.maintReceipts);
});

test('rejects boolean authorization, wrong operation, or unpinned manifest before BEGIN', async () => {
  assert.equal(typeof executor.executeBuffItemMaintInsertTransaction, 'function');
  for (const mutate of [h => { h.args.authorization = true; },
    h => { h.args.authorization.operationId = 'wrong-operation'; },
    h => { h.args.authorization.executionManifest.ownershipKeys.push('local.items'); },
    h => { h.args.authorization.technical.executionManifestHash = hash; }]) {
    const h = await harness(); mutate(h);
    await assert.rejects(executor.executeBuffItemMaintInsertTransaction(h.args), /authorization|operation|manifest/i);
    assert.deepEqual(h.events, []);
  }
});

test('requires every journal phase before BEGIN', async () => {
  assert.equal(typeof executor.executeBuffItemMaintInsertTransaction, 'function');
  const h = await harness(); delete h.args.journal.materialized;
  await assert.rejects(executor.executeBuffItemMaintInsertTransaction(h.args), /journal/i);
  assert.deepEqual(h.events, []);
});

test('fails closed on a concurrent maint identity appearing after proposal creation', async () => {
  assert.equal(typeof executor.executeBuffItemMaintInsertTransaction, 'function');
  const h = await harness();
  h.rows.maintRows.push({ ...h.rows.maintRows[0], id: 12, source_id: 6148, internal_name: 'PalworldMinionTrustyCattiva' });
  await assert.rejects(executor.executeBuffItemMaintInsertTransaction(h.args), /baseline|conflict|rederivation/i);
  assert.ok(h.events.includes('rollback'));
  assert.ok(!h.events.includes('permit'));
  assert.ok(!h.events.includes('landing-insert'));
});

test('revalidates source bytes after runtime and baseline locks before consuming the permit', async () => {
  assert.equal(typeof executor.executeBuffItemMaintInsertTransaction, 'function');
  const h = await harness(); let reads = 0;
  h.args.readSource = async () => ++reads === 1 ? sourceFixture() : sourceFixture(data => { data[6148].damage++; });
  await assert.rejects(executor.executeBuffItemMaintInsertTransaction(h.args), /source|rederivation/i);
  assert.ok(!h.events.includes('permit'));
  assert.ok(h.events.includes('rollback'));
});

test('rolls back when an insert receipt lacks exactly one real generated identity', async () => {
  assert.equal(typeof executor.executeBuffItemMaintInsertTransaction, 'function');
  for (const mutate of [h => { h.state.badReceipt = true; }, h => { h.state.receiptAffectedRows = 2; }]) {
    const h = await harness(); mutate(h);
    await assert.rejects(executor.executeBuffItemMaintInsertTransaction(h.args), /receipt/i);
    assert.deepEqual(h.rows, h.before);
    assert.ok(h.events.includes('rolledBack'));
    assert.ok(!h.events.includes('commit'));
  }
});

test('releases retained fences only after a confirmed rollback and terminal journal', async () => {
  const h = await harness(); h.state.badReceipt = true;
  h.args.retainOwnershipFences = async () => { h.events.push('retain-fences'); };
  h.args.releaseOwnershipFences = async () => { h.events.push('release-fences'); };
  await assert.rejects(executor.executeBuffItemMaintInsertTransaction(h.args), /receipt/i);
  assert.ok(h.events.indexOf('rolledBack') < h.events.indexOf('release-fences'));
});

test('rejects altered landing payload readback before any maint insert', async () => {
  assert.equal(typeof executor.executeBuffItemMaintInsertTransaction, 'function');
  const h = await harness(); const execute = h.args.connection.execute;
  h.args.connection.execute = async (sql, values) => {
    const result = await execute(sql, values);
    if (/^SELECT/.test(sql)) result[0][0].payload_json = '{}';
    return result;
  };
  await assert.rejects(executor.executeBuffItemMaintInsertTransaction(h.args), /landing.*readback/i);
  assert.ok(!h.events.includes('maint-insert-6148'));
});

test('rejects duplicate or colliding maint primary-key receipts', async () => {
  assert.equal(typeof executor.executeBuffItemMaintInsertTransaction, 'function');
  for (const id of [9, 1000]) {
    const h = await harness();
    if (id === 9) h.state.maintId = 9;
    else {
      const execute = h.args.connection.execute;
      h.args.connection.execute = async (sql, values) => {
        const out = await execute(sql, values);
        if (sql.startsWith('INSERT') && sql.includes('maint_items')) out[0].insertId = id;
        return out;
      };
    }
    await assert.rejects(executor.executeBuffItemMaintInsertTransaction(h.args), /receipt/i);
    assert.ok(h.events.includes('rollback'));
  }
});

test('rejects lost baseline rows, extra writes, and changed maint values in the after-set', async () => {
  assert.equal(typeof executor.executeBuffItemMaintInsertTransaction, 'function');
  for (const mutate of [rows => rows.maintRows.shift(),
    rows => { rows.maintRows[0].english_name = 'changed'; },
    rows => { rows.maintRows[1].combat_value++; },
    rows => rows.landingRows.push({ ...rows.landingRows[0], id: 999 }),
  ]) {
    const h = await harness(); const read = h.args.readAfterRows;
    h.args.readAfterRows = async () => { const rows = await read(); mutate(rows); return rows; };
    await assert.rejects(executor.executeBuffItemMaintInsertTransaction(h.args), /after-set|readback/i);
    assert.ok(!h.events.includes('commit'));
    assert.deepEqual(h.rows, h.before);
  }
});

test('records uncertain COMMIT with allocated IDs and never claims rollback or retries', async () => {
  assert.equal(typeof executor.executeBuffItemMaintInsertTransaction, 'function');
  const h = await harness();
  h.args.connection.commit = async () => { h.events.push('commit'); throw new Error('connection lost during COMMIT'); };
  await assert.rejects(executor.executeBuffItemMaintInsertTransaction(h.args), error => error.transactionOutcome === 'unknown');
  assert.ok(h.events.includes('commitUnknown'));
  assert.ok(!h.events.includes('rollback'));
  assert.equal(h.state.commitUnknown.maintReceipts.length, 6);
  assert.ok(!h.events.includes('committed'));
});

test('reports rollback uncertainty and preserves prepared recovery evidence', async () => {
  assert.equal(typeof executor.executeBuffItemMaintInsertTransaction, 'function');
  const h = await harness(); h.state.badReceipt = true;
  h.args.connection.rollback = async () => { h.events.push('rollback'); throw new Error('rollback connection lost'); };
  await assert.rejects(executor.executeBuffItemMaintInsertTransaction(h.args), error => error.transactionOutcome === 'unknown');
  assert.ok(h.events.includes('rollbackUnknown'));
  assert.ok(!h.events.includes('rolledBack'));
});

test('retains committed outcome when terminal journal publication fails', async () => {
  assert.equal(typeof executor.executeBuffItemMaintInsertTransaction, 'function');
  const h = await harness(); h.args.journal.committed = async () => { throw new Error('disk unavailable'); };
  await assert.rejects(executor.executeBuffItemMaintInsertTransaction(h.args), error => error.transactionOutcome === 'committed');
  assert.ok(!h.events.includes('rollback'));
  assert.ok(!h.events.includes('commitUnknown'));
});

test('callbacks cannot mutate the authorized proposal after locked rederivation', async () => {
  const h = await harness();
  h.args.consumeDispatchPermit = async ({ proposal }) => { proposal.maintInserts[0].combat_value = 999; };
  await assert.rejects(executor.executeBuffItemMaintInsertTransaction(h.args), /read only|readonly|extensible/i);
  assert.ok(!h.events.includes('landing-insert'));
  assert.deepEqual(h.rows, h.before);
});

test('a packet expiring while waiting for database locks stops before permit or INSERT', async t => {
  const current = Date.now();
  t.mock.timers.enable({ apis: ['Date'], now: current });
  const h = await harness();
  h.args.lockRuntime = async () => { h.events.push('lock-runtime'); t.mock.timers.setTime(current + 3600001); };
  await assert.rejects(executor.executeBuffItemMaintInsertTransaction(h.args), /expired|validity/i);
  assert.ok(h.events.includes('rollback'));
  assert.ok(!h.events.includes('permit'));
  assert.ok(!h.events.includes('landing-insert'));
});

test('packet expiry before COMMIT rolls back the materialized inserts', async t => {
  const current = Date.now();
  t.mock.timers.enable({ apis: ['Date'], now: current });
  const h = await harness(); const read = h.args.readAfterRows;
  h.args.readAfterRows = async () => { t.mock.timers.setTime(current + 3600001); return read(); };
  await assert.rejects(executor.executeBuffItemMaintInsertTransaction(h.args), /expired|validity/i);
  assert.deepEqual(h.rows, h.before);
  assert.ok(!h.events.includes('commit'));
});

test('packet expiry immediately after permit consumption stops before the first INSERT', async t => {
  const current = Date.now();
  t.mock.timers.enable({ apis: ['Date'], now: current });
  const h = await harness();
  h.args.consumeDispatchPermit = async () => {
    h.events.push('permit');
    t.mock.timers.setTime(current + 3600001);
  };
  await assert.rejects(executor.executeBuffItemMaintInsertTransaction(h.args), /expired|validity/i);
  assert.ok(h.events.includes('rollback'));
  assert.ok(!h.events.includes('landing-insert'));
});
