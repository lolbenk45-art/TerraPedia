import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyBuffCanonicalMutation,
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
    mutation: {
      changes: {
        relation_buffs: { inserts: [], updates: [{ before, after, changedColumns: ['tooltip_zh'] }], unchanged: [], preserved: [] },
        item_buff_relations: { inserts: [], updates: [], unchanged: [], preserved: [] },
        npc_buff_relations: { inserts: [], updates: [], unchanged: [], preserved: [] },
        relation_buff_images: { inserts: [], updates: [], unchanged: [], preserved: [] },
        projection_buffs: { inserts: [], updates: [], unchanged: [], preserved: [] },
      },
      expectedRows: { relation_buffs: [after], item_buff_relations: [], npc_buff_relations: [], relation_buff_images: [], projection_buffs: [] },
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
    applyMutation: async () => calls.push('apply'),
    verifyAfter: async () => calls.push('verify'),
    consumeDispatchPermit: () => calls.push('consume'),
  });
  assert.deepEqual(calls, ['begin', 'runtime', 'locked', 'consume', 'apply', 'verify', 'commit']);
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
