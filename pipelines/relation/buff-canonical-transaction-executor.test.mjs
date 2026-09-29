import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyBuffCanonicalMutation,
  applyBuffMaintMutation,
  executeBuffCanonicalTransaction,
} from './buff-canonical-transaction-executor.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;

function envelope() {
  const before = {
    record_key: 'b'.repeat(64),
    source_id: 24,
    internal_name: 'OnFire',
    status: 1,
    deleted: 0,
  };
  const after = { ...before, tooltip_zh: '灼热' };
  return {
    schemaVersion: 'buff-full-chain-execution/v1',
    executable: true,
    executionBlocker: null,
    candidateSha256: HASH,
    upstream: { maint: { schemaVersion: 'buff-maint-mutation-plan/v1', executable: false, executionBlocker: 'locked-upstream-executor-required', table: 'terria_v1_maint.maint_buffs', destructiveClear: false, inserts: [], updates: [], unchanged: [], preserved: [], deletes: [] } },
    mutation: {
      changes: {
        relation_buffs: { inserts: [], updates: [{ before, after, changedColumns: ['tooltip_zh'] }], unchanged: [], preserved: [] },
        item_buff_relations: { inserts: [], updates: [], unchanged: [], preserved: [] },
        npc_buff_relations: { inserts: [], updates: [], unchanged: [], preserved: [] },
        relation_buff_images: { inserts: [], updates: [], unchanged: [], preserved: [] },
        projection_buffs: { inserts: [], updates: [], unchanged: [], preserved: [] },
      },
      expectedRows: { relation_buffs: [after], item_buff_relations: [], npc_buff_relations: [], relation_buff_images: [], projection_buffs: [] },
      destructiveClear: false,
      deletes: [],
    },
  };
}

function connection(calls) {
  return {
    async beginTransaction() { calls.push('begin'); },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); },
  };
}

test('Buff canonical transaction applies bounded updates only after locked rederivation and permit consumption', async () => {
  const calls = [];
  const result = await executeBuffCanonicalTransaction({
    envelope: envelope(),
    packet: { runId: 'run-1', fenceToken: 'fence-1', serverUuid: 'server-1', actor: 'codex' },
    connection: connection(calls),
    lockRuntime: async () => calls.push('runtime'),
    readLockedRows: async () => {
      calls.push('locked');
      return { relation_buffs: [{ record_key: 'b'.repeat(64), source_id: 24, internal_name: 'OnFire', status: 1, deleted: 0 }] };
    },
    applyUpstream: async () => calls.push('upstream'),
    applyUpstream: async () => calls.push('upstream'),
    applyMutation: async () => calls.push('apply'),
    verifyAfter: async () => calls.push('verify'),
    consumeDispatchPermit: () => calls.push('consume'),
  });
  assert.deepEqual(calls, ['begin', 'runtime', 'locked', 'consume', 'upstream', 'apply', 'verify', 'commit']);
  assert.equal(result.status, 'completed');
});

test('Buff canonical transaction rolls back when locked rederivation drifts before permit consumption', async () => {
  const calls = [];
  await assert.rejects(executeBuffCanonicalTransaction({
    envelope: envelope(),
    packet: { runId: 'run-1', fenceToken: 'fence-1', serverUuid: 'server-1', actor: 'codex' },
    connection: connection(calls),
    lockRuntime: async () => calls.push('runtime'),
    readLockedRows: async () => {
      calls.push('locked');
      throw new Error('locked rederivation drift');
    },
    applyUpstream: async () => calls.push('upstream'),
    applyUpstream: async () => calls.push('upstream'),
    applyMutation: async () => calls.push('apply'),
    verifyAfter: async () => calls.push('verify'),
    consumeDispatchPermit: () => calls.push('consume'),
  }), /locked rederivation drift/);
  assert.deepEqual(calls, ['begin', 'runtime', 'locked', 'rollback']);
});

test('Buff mutation writer updates owned relation rows and never emits deletes', async () => {
  const calls = [];
  const result = await applyBuffCanonicalMutation({
    envelope: envelope(),
    connection: {
      async execute(sql, params) {
        calls.push({ sql, params });
        return [{ affectedRows: 1 }];
      },
    },
  });
  assert.equal(result.updates, 1);
  assert.equal(result.inserts, 0);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /UPDATE `terria_v1_relation`\.`relation_buffs`/);
  assert.doesNotMatch(calls[0].sql, /DELETE/i);
});

test('Buff transaction waits for asynchronous permit consumption before mutation', async () => {
  const calls = [];
  await executeBuffCanonicalTransaction({
    envelope: envelope(),
    packet: { runId: 'run-1', fenceToken: 'fence-1', serverUuid: 'server-1', actor: 'codex' },
    connection: connection(calls),
    lockRuntime: async () => {},
    readLockedRows: async () => {},
    consumeDispatchPermit: async () => { await new Promise(setImmediate); calls.push('consumed'); },
    applyUpstream: async () => calls.push('upstream'),
    applyUpstream: async () => calls.push('upstream'),
    applyMutation: async () => calls.push('apply'),
    verifyAfter: async () => {},
  });
  assert.deepEqual(calls, ['begin', 'consumed', 'upstream', 'apply', 'commit']);
});

test('Buff transaction passes upstream bound envelope to mutation and after-set callbacks', async () => {
  const calls = [];
  const boundEnvelope = { ...envelope(), marker: 'landing-13001-bound' };
  await executeBuffCanonicalTransaction({
    envelope: envelope(),
    packet: { runId: 'run-1', fenceToken: 'fence-1', serverUuid: 'server-1', actor: 'codex' },
    connection: connection(calls),
    lockRuntime: async () => {},
    readLockedRows: async () => {},
    consumeDispatchPermit: async () => {},
    applyUpstream: async () => ({ envelope: boundEnvelope }),
    applyMutation: async ({ envelope: received }) => calls.push(['apply', received.marker]),
    verifyAfter: async ({ envelope: received }) => calls.push(['verify', received.marker]),
  });
  assert.deepEqual(calls, ['begin', ['apply', 'landing-13001-bound'], ['verify', 'landing-13001-bound'], 'commit']);
});

for (const destructiveClear of [true, undefined]) {
  test(`Buff writer rejects destructiveClear=${destructiveClear} before SQL`, async () => {
    const input = envelope();
    input.mutation.destructiveClear = destructiveClear;
    const calls = [];
    await assert.rejects(applyBuffCanonicalMutation({
      envelope: input,
      connection: { async execute(sql) { calls.push(sql); return [{ affectedRows: 1 }]; } },
    }), /mutation.*invalid/);
    assert.deepEqual(calls, []);
  });
}

for (const [label, alter] of [
  ['foreign table', (input) => { input.mutation.changes.items = { inserts: [], updates: [] }; }],
  ['identity column', (input) => {
    const change = input.mutation.changes.relation_buffs.updates[0];
    change.after.record_key = 'foreign'; change.changedColumns.push('record_key');
  }],
  ['unowned column', (input) => {
    const change = input.mutation.changes.relation_buffs.updates[0];
    change.after.unowned_column = 'x'; change.changedColumns.push('unowned_column');
  }],
  ['omitted changed columns', (input) => { delete input.mutation.changes.relation_buffs.updates[0].changedColumns; }],
  ['omitted after value', (input) => { delete input.mutation.changes.relation_buffs.updates[0].after.tooltip_zh; }],
  ['unlisted change', (input) => { input.mutation.changes.relation_buffs.updates[0].after.status = 0; }],
]) {
  test(`Buff writer refuses ${label} before any SQL`, async () => {
    const input = envelope();
    alter(input);
    const calls = [];
    await assert.rejects(applyBuffCanonicalMutation({
      envelope: input,
      connection: { async execute(sql) { calls.push(sql); return [{ affectedRows: 1 }]; } },
    }), /scope|identity|column|change|value/i);
    assert.deepEqual(calls, []);
  });
}

test('Buff writer refuses a database outside its owned relation schema', async () => {
  const calls = [];
  await assert.rejects(applyBuffCanonicalMutation({
    envelope: envelope(), database: 'terria_v1_local',
    connection: { async execute(sql) { calls.push(sql); return [{ affectedRows: 1 }]; } },
  }), /database/);
  assert.deepEqual(calls, []);
});

test('Buff transaction rolls back when asynchronous permit consumption rejects', async () => {
  const calls = [];
  await assert.rejects(executeBuffCanonicalTransaction({
    envelope: envelope(),
    packet: { runId: 'run-1', fenceToken: 'fence-1', serverUuid: 'server-1', actor: 'codex' },
    connection: connection(calls),
    lockRuntime: async () => {}, readLockedRows: async () => {},
    consumeDispatchPermit: async () => { await new Promise(setImmediate); throw new Error('permit rejected'); },
    applyUpstream: async () => calls.push('upstream'),
    applyMutation: async () => calls.push('apply'), verifyAfter: async () => calls.push('verify'),
  }), /permit rejected/);
  assert.deepEqual(calls, ['begin', 'rollback']);
});


test('Buff maint writer inserts only the real maint_buffs columns', async () => {
  const input = envelope();
  input.upstream.maint.inserts = [{
    source_id: 24, internal_name: 'OnFire', english_name: 'On Fire!', name_zh: '着火',
    source_provider: 'terraria.wiki.gg', source_page: 'On Fire!', source_revision_timestamp: '2026-09-23 01:02:03',
    landing_source_id: 31, landing_source_key: 'buffs.test', landing_source_page: 'Template:GetBuffInfo', landing_content_hash: 'a'.repeat(64),
    landing_fetched_at: '2026-09-23 01:02:03', landing_parsed_at: '2026-09-23 01:02:03', module_generated_at: null, terraria_version: null,
    major_value: 1, combat_value: 2, defense_value: null, use_time: null, stack_size: null, width: null, height: null,
    flags_json: '{}', raw_json: '{}', status: 1, deleted: 0,
  }];
  const calls = [];
  const result = await applyBuffMaintMutation({ envelope: input, connection: { async execute(sql, params) { calls.push({ sql, params }); return [{ affectedRows: 1 }]; } } });
  assert.deepEqual(result, { inserts: 1, updates: 0 });
  assert.match(calls[0].sql, /INSERT INTO `terria_v1_maint`\.`maint_buffs`/);
  assert.doesNotMatch(calls[0].sql, /record_key|scope|table_name/);
});

test('Buff maint writer rejects an out-of-scope upstream table before SQL', async () => {
  const input = envelope(); input.upstream.maint.table = 'terria_v1_local.source_dataset_landings';
  await assert.rejects(applyBuffMaintMutation({ envelope: input, connection: { async execute() { throw new Error('must not execute'); } } }), /upstream maint plan|maint mutation database/);
});

// A valid packet cannot complete missing relation/projection ID materialization.
test('deferred landing fails before BEGIN and permit consumption even with executable=true', async () => {
  const calls = [];
  const input = envelope();
  input.upstream.landing = { schemaVersion: 'buff-landing-mutation/v1' };
  const record = async () => calls.push('callback');
  await assert.rejects(executeBuffCanonicalTransaction({
    envelope: input,
    packet: { runId: 'run-1', fenceToken: 'fence-1', serverUuid: 'server-1', actor: 'codex' },
    connection: connection(calls), lockRuntime: record, readLockedRows: record,
    consumeDispatchPermit: record, applyUpstream: record, applyMutation: record, verifyAfter: record,
  }), /deferred.*lineage/i);
  assert.deepEqual(calls, []);
});
