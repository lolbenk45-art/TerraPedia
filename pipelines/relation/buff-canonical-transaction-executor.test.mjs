import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  applyBuffCanonicalMutation,
  applyBuffMaintMutation,
  executeBuffCanonicalTransaction,
} from './buff-canonical-transaction-executor.mjs';
import { buildBuffLandingInsertPlan } from '../landing/buff-bounded-landing-mutation.mjs';

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
    executionManifestHash: HASH,
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
    packet: { runId: 'run-1', fenceToken: 'fence-1', serverUuid: 'server-1', actor: 'codex', executionManifestHash: HASH },
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

test('Buff canonical transaction persists recovery phases around commit', async () => {
  const calls = [];
  await executeBuffCanonicalTransaction({
    envelope: envelope(),
    packet: { runId: 'run-1', fenceToken: 'fence-1', serverUuid: 'server-1', actor: 'codex', executionManifestHash: HASH },
    connection: connection(calls),
    journal: {
      prepared: async () => calls.push('journal:prepared'),
      rolledBack: async () => calls.push('journal:rolled-back'),
      commitUnknown: async () => calls.push('journal:commit-unknown'),
      committed: async () => calls.push('journal:committed'),
    },
    lockRuntime: async () => calls.push('runtime'), readLockedRows: async () => calls.push('locked'),
    consumeDispatchPermit: async () => calls.push('permit'), applyUpstream: async () => calls.push('upstream'),
    applyMutation: async () => calls.push('apply'), verifyAfter: async () => calls.push('verify'),
  });
  assert.deepEqual(calls, ['begin', 'runtime', 'locked', 'journal:prepared', 'permit', 'upstream', 'apply', 'verify', 'commit', 'journal:committed']);
});

test('Buff transaction rejects a missing or drifted manifest pin before BEGIN and permit consumption', async () => {
  for (const manifestHash of [undefined, `sha256:${'c'.repeat(64)}`]) {
    const calls = [];
    const input = envelope();
    input.executionManifestHash = manifestHash;
    await assert.rejects(executeBuffCanonicalTransaction({
      envelope: input,
      packet: { runId: 'run-1', fenceToken: 'fence-1', serverUuid: 'server-1', actor: 'codex', executionManifestHash: HASH },
      connection: connection(calls),
      lockRuntime: async () => calls.push('runtime'), readLockedRows: async () => calls.push('locked'),
      consumeDispatchPermit: async () => calls.push('permit'), applyUpstream: async () => {},
      applyMutation: async () => {}, verifyAfter: async () => {},
    }), /manifest/i);
    assert.deepEqual(calls, []);
  }
});

test('Buff canonical transaction rolls back when locked rederivation drifts before permit consumption', async () => {
  const calls = [];
  await assert.rejects(executeBuffCanonicalTransaction({
    envelope: envelope(),
    packet: { runId: 'run-1', fenceToken: 'fence-1', serverUuid: 'server-1', actor: 'codex', executionManifestHash: HASH },
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

test('Buff relation writer normalizes ISO source timestamps for MySQL DATETIME', async () => {
  const input = envelope();
  const before = input.mutation.changes.relation_buffs.updates[0].before;
  const after = input.mutation.changes.relation_buffs.updates[0].after;
  after.source_revision_timestamp = '2026-09-23T01:02:03Z';
  after.tooltip_zh = '灼热';
  input.mutation.changes.relation_buffs.updates[0].changedColumns = ['source_revision_timestamp', 'tooltip_zh'];
  const calls = [];
  await applyBuffCanonicalMutation({
    envelope: input,
    connection: { async execute(sql, params) { calls.push({ sql, params }); return [{ affectedRows: 1 }]; } },
  });
  assert.equal(calls[0].params[0], '2026-09-23 01:02:03');
});

test('Buff transaction waits for asynchronous permit consumption before mutation', async () => {
  const calls = [];
  await executeBuffCanonicalTransaction({
    envelope: envelope(),
    packet: { runId: 'run-1', fenceToken: 'fence-1', serverUuid: 'server-1', actor: 'codex', executionManifestHash: HASH },
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
    packet: { runId: 'run-1', fenceToken: 'fence-1', serverUuid: 'server-1', actor: 'codex', executionManifestHash: HASH },
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
    packet: { runId: 'run-1', fenceToken: 'fence-1', serverUuid: 'server-1', actor: 'codex', executionManifestHash: HASH },
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

test('Buff maint writer normalizes ISO timestamps for MySQL DATETIME columns', async () => {
  const input = envelope();
  input.upstream.maint.inserts = [{
    source_id: 25, internal_name: 'Frostburn', english_name: 'Frostburn', name_zh: '霜火',
    source_provider: 'terraria.wiki.gg', source_page: 'Frostburn', source_revision_timestamp: '2026-09-23T01:02:03Z',
    landing_source_id: 32, landing_source_key: 'buffs.test', landing_source_page: 'Template:GetBuffInfo', landing_content_hash: 'b'.repeat(64),
    landing_fetched_at: '2026-09-23T01:00:00Z', landing_parsed_at: '2026-09-23T01:00:01Z', module_generated_at: null, terraria_version: null,
    major_value: 1, combat_value: 2, defense_value: null, use_time: null, stack_size: null, width: null, height: null,
    flags_json: '{}', raw_json: '{}', status: 1, deleted: 0,
  }];
  const calls = [];
  await applyBuffMaintMutation({ envelope: input, connection: { async execute(sql, params) { calls.push({ sql, params }); return [{ affectedRows: 1 }]; } } });
  assert.deepEqual(calls[0].params.slice(6, 13), [
    '2026-09-23 01:02:03', 32, 'buffs.test', 'Template:GetBuffInfo', 'b'.repeat(64),
    '2026-09-23 01:00:00', '2026-09-23 01:00:01',
  ]);
});

test('Buff maint writer rejects an out-of-scope upstream table before SQL', async () => {
  const input = envelope(); input.upstream.maint.table = 'terria_v1_local.source_dataset_landings';
  await assert.rejects(applyBuffMaintMutation({ envelope: input, connection: { async execute() { throw new Error('must not execute'); } } }), /upstream maint plan|maint mutation database/);
});

test('deferred landing is admitted after validation and runs upstream before relation mutation', async () => {
  const calls = [];
  const input = envelope();
  const payloadJson = JSON.stringify({ sourcePageTitle: 'Template:GetBuffInfo', sourceRevisionTimestamp: '2026-09-23T01:02:03Z', totalBuffs: 1, buffs: [{ id: 24, internalName: 'OnFire', sourceEvidence: { revisionId: 12345, canonicalPageTitle: 'On Fire!', revisionTimestamp: '2026-09-23T01:02:03Z', parseStatus: 'parsed' } }] });
  input.upstream.landing = buildBuffLandingInsertPlan({
    landingRow: {
      id: null, dataset_type: 'buffs_raw', provider: 'terraria.wiki.gg', source_kind: 'buff-page-immunity-evidence',
      source_key: 'canonical.buff-page-immunity.deferred-test', source_locator: 'source.json', source_page: 'Template:GetBuffInfo',
      source_revision_timestamp: '2026-09-23T01:02:03Z', content_hash: createHash('sha256').update(payloadJson).digest('hex'),
      payload_json: payloadJson,
      fetched_at: '2026-09-23 01:00:00', parsed_at: '2026-09-23 01:00:00', parse_status: 'ok', artifact_role: 'source_evidence',
      producer_id: 'test', producer_version: '1', producer_run_key: 'deferred-test', is_current: 1,
    },
    sourceEvidenceHash: HASH,
    runId: 'deferred-test',
  });
  const record = async () => calls.push('callback');
  await executeBuffCanonicalTransaction({
    envelope: input,
    packet: { runId: 'run-1', fenceToken: 'fence-1', serverUuid: 'server-1', actor: 'codex', executionManifestHash: HASH },
    connection: connection(calls), lockRuntime: record, readLockedRows: record,
    consumeDispatchPermit: record, applyUpstream: async () => { calls.push('upstream'); },
    applyMutation: async () => calls.push('mutation'), verifyAfter: async () => calls.push('verify'),
  });
  assert.deepEqual(calls, ['begin', 'callback', 'callback', 'callback', 'upstream', 'mutation', 'verify', 'commit']);
});

test('deferred landing rejects an invalid plan before BEGIN', async () => {
  const calls = [];
  const input = envelope();
  input.upstream.landing = { schemaVersion: 'buff-landing-mutation/v1' };
  const record = async () => calls.push('callback');
  await assert.rejects(executeBuffCanonicalTransaction({
    envelope: input,
    packet: { runId: 'run-1', fenceToken: 'fence-1', serverUuid: 'server-1', actor: 'codex', executionManifestHash: HASH },
    connection: connection(calls), lockRuntime: record, readLockedRows: record,
    consumeDispatchPermit: record, applyUpstream: record, applyMutation: record, verifyAfter: record,
  }), /landing mutation|invalid|source key|deferred.*lineage/i);
  assert.deepEqual(calls, []);
});
