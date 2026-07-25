import assert from 'node:assert/strict';
import test from 'node:test';
import {
  determineCommitProtocol,
  executeSameServerTransaction,
  executeStagedProtocol,
  requireCompensationSnapshot
} from './three-database-commit-protocol.mjs';

const SAME_SERVER_MANIFEST = {
  schemaVersion: 1,
  runId: 'run-001',
  serverIdentity: { host: 'db-host', port: 3306, serverUuid: 'uuid-1' },
  databases: {
    maint:    { host: 'db-host', port: 3306, serverUuid: 'uuid-1' },
    relation: { host: 'db-host', port: 3306, serverUuid: 'uuid-1' },
    local:    { host: 'db-host', port: 3306, serverUuid: 'uuid-1' }
  }
};

const CROSS_SERVER_MANIFEST = {
  schemaVersion: 1,
  runId: 'run-001',
  serverIdentity: { host: 'db-host-a', port: 3306, serverUuid: 'uuid-a' },
  databases: {
    maint:    { host: 'db-host-a', port: 3306, serverUuid: 'uuid-a' },
    relation: { host: 'db-host-b', port: 3306, serverUuid: 'uuid-b' },
    local:    { host: 'db-host-c', port: 3306, serverUuid: 'uuid-c' }
  }
};

const BASE_APPLY_ARGS = {
  runId: 'run-001',
  bundleHash: 'sha256:' + 'a'.repeat(64),
  policySetHash: 'sha256:' + 'b'.repeat(64),
  decisionHash: 'sha256:' + 'c'.repeat(64),
  approvalId: null,
  mode: 'AUTO_APPLY_L2',
  beforeGenerations: { maint: 0, relation: 0, local: 0 },
  preCommitVerifyWork: async () => ({ relationIntegrity: true }),
  postCommitVerifyWork: async () => ({ relationIntegrity: true, apiSamples: true, cacheVisible: true })
};

// ── determineCommitProtocol ───────────────────────────────────────────────────

test('determineCommitProtocol classifies same-server manifest', () => {
  const result = determineCommitProtocol(SAME_SERVER_MANIFEST);
  assert.strictEqual(result.protocol, 'same_server_single_transaction');
  assert.strictEqual(result.canUseSingleTransaction, true);
  assert.strictEqual(result.requiresStaging, false);
});

test('determineCommitProtocol classifies cross-server manifest', () => {
  const result = determineCommitProtocol(CROSS_SERVER_MANIFEST);
  assert.strictEqual(result.protocol, 'cross_server_staged');
  assert.strictEqual(result.canUseSingleTransaction, false);
  assert.strictEqual(result.requiresStaging, true);
  assert.deepStrictEqual(result.stageOrder, ['maint', 'relation', 'local']);
});

test('determineCommitProtocol rejects missing manifest fields', () => {
  assert.throws(() => determineCommitProtocol({}), /manifest\.schemaVersion is required/);
  assert.throws(
    () => determineCommitProtocol({ schemaVersion: 1, runId: 'r', serverIdentity: {} }),
    /manifest\.databases is required/
  );
});

// ── executeSameServerTransaction ──────────────────────────────────────────────

function makeSameServerConnections(queryHook) {
  const shared = {
    query: async (sql, params) => {
      if (queryHook) return queryHook(sql, params);
      if (sql === 'START TRANSACTION' || sql === 'COMMIT' || sql === 'ROLLBACK') return [{}];
      if (sql.includes('INSERT INTO')) return [{ affectedRows: 1 }];
      if (sql.includes('UPDATE')) return [{ affectedRows: 1 }];
      return [[]];
    }
  };
  return { maint: shared, relation: shared, local: shared };
}

test('executeSameServerTransaction rejects separate physical connections', async () => {
  const one = makeSameServerConnections().local;
  await assert.rejects(() => executeSameServerTransaction({
    ...BASE_APPLY_ARGS,
    connections: { maint: one, relation: { ...one }, local: one },
    applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
  }), /same-server protocol requires one shared transaction connection/);
});

test('executeSameServerTransaction commits and returns applied generations', async () => {
  const connections = makeSameServerConnections();
  const result = await executeSameServerTransaction({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async ({ beforeGenerations }) => ({
      maint: beforeGenerations.maint + 1,
      relation: beforeGenerations.relation + 1,
      local: beforeGenerations.local + 1
    })
  });

  assert.strictEqual(result.protocol, 'same_server_single_transaction');
  assert.strictEqual(result.status, 'committed');
  assert.deepStrictEqual(result.appliedGenerations, { maint: 1, relation: 1, local: 1 });
});

test('executeSameServerTransaction rolls back on applyWork failure', async () => {
  let rolledBack = false;
  const connections = makeSameServerConnections((sql) => {
    if (sql === 'ROLLBACK') { rolledBack = true; return [{}]; }
    if (sql === 'START TRANSACTION' || sql === 'COMMIT') return [{}];
    if (sql.includes('INSERT INTO')) return [{ affectedRows: 1 }];
    return [{ affectedRows: 1 }];
  });

  await assert.rejects(
    () => executeSameServerTransaction({
      ...BASE_APPLY_ARGS,
      connections,
      applyWork: async () => { throw new Error('apply failed mid-write'); }
    }),
    /apply failed mid-write/
  );

  assert.strictEqual(rolledBack, true);
});

test('executeSameServerTransaction records post-commit verification failure', async () => {
  const statuses = [];
  let rolledBack = false;
  const connections = makeSameServerConnections((sql) => {
    if (sql.includes('UPDATE crawler_automation_apply')) statuses.push(sql);
    if (sql === 'ROLLBACK') rolledBack = true;
    return [{ affectedRows: 1 }];
  });
  await assert.rejects(() => executeSameServerTransaction({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
    postCommitVerifyWork: async () => ({ apiSamples: false, cacheVisible: true }),
  }), /post-commit verification failed/);
  assert.ok(statuses.some((sql) => sql.includes("POST_VERIFY_FAILED")));
  assert.equal(rolledBack, false);
});

test('executeSameServerTransaction rejects missing connections', async () => {
  await assert.rejects(
    () => executeSameServerTransaction({
      ...BASE_APPLY_ARGS,
      connections: { maint: {}, relation: {} },  // missing local
      applyWork: async () => ({})
    }),
    /all three database connections are required/
  );
});

test('executeSameServerTransaction rejects applyWork that returns null', async () => {
  const connections = makeSameServerConnections();

  await assert.rejects(
    () => executeSameServerTransaction({
      ...BASE_APPLY_ARGS,
      connections,
      applyWork: async () => null
    }),
    /applyWork must return appliedGenerations object/
  );
});

test('executeSameServerTransaction rejects missing applyWork', async () => {
  const connections = makeSameServerConnections();

  await assert.rejects(
    () => executeSameServerTransaction({ ...BASE_APPLY_ARGS, connections }),
    /applyWork callback is required/
  );
});

// ── executeStagedProtocol ─────────────────────────────────────────────────────

function makeCrossServerConnections(queryHook) {
  let applyRecordStatus = 'STARTED';
  const makeConn = (role) => ({
    query: async (sql, params) => {
      if (queryHook) {
        const override = queryHook(sql, params, role, applyRecordStatus);
        if (override !== undefined) {
          if (sql.includes('UPDATE') && sql.includes('status')) {
            // track status changes for SELECT queries
            const match = params?.[0];
            if (match) applyRecordStatus = match;
          }
          return override;
        }
      }
      if (sql.includes('INSERT INTO')) return [{ affectedRows: 1 }];
      if (sql.includes('UPDATE')) {
        if (params?.[0]) applyRecordStatus = params[0];
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('SELECT status')) {
        return [[{ status: applyRecordStatus, committed_generation_json: '{}' }]];
      }
      return [[]];
    }
  });
  return { maint: makeConn('maint'), relation: makeConn('relation'), local: makeConn('local') };
}

test('executeStagedProtocol commits all three stages in order', async () => {
  const connections = makeCrossServerConnections();
  const stagesExecuted = [];

  const result = await executeStagedProtocol({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async ({ stage }) => {
      stagesExecuted.push(stage);
      return { [stage]: 1 };
    }
  });

  assert.strictEqual(result.protocol, 'cross_server_staged');
  assert.strictEqual(result.status, 'committed');
  assert.deepStrictEqual(stagesExecuted, ['maint', 'relation', 'local']);
});

test('executeStagedProtocol marks partial commit as compensation required', async () => {
  let failStatus = null;
  const connections = makeCrossServerConnections((sql, params) => {
    if (sql.includes('UPDATE') && sql.includes("status = 'COMPENSATION_REQUIRED'")) {
      failStatus = 'COMPENSATION_REQUIRED';
      return [{ affectedRows: 1 }];
    }
    return undefined;
  });

  await assert.rejects(
    () => executeStagedProtocol({
      ...BASE_APPLY_ARGS,
      connections,
      applyWork: async ({ stage }) => {
        if (stage === 'relation') throw new Error('relation server unreachable');
        return { [stage]: 1 };
      }
    }),
    /relation server unreachable/
  );

  assert.strictEqual(failStatus, 'COMPENSATION_REQUIRED');
});

test('executeStagedProtocol rejects missing connections', async () => {
  await assert.rejects(
    () => executeStagedProtocol({
      ...BASE_APPLY_ARGS,
      connections: { maint: {}, local: {} },
      applyWork: async () => ({})
    }),
    /all three database connections are required/
  );
});

// ── requireCompensationSnapshot ───────────────────────────────────────────────

test('requireCompensationSnapshot is false for same-server protocol', () => {
  assert.strictEqual(
    requireCompensationSnapshot({ status: 'FAILED', commit_protocol: 'same_server_single_transaction' }),
    false
  );
});

test('requireCompensationSnapshot is true after same-server post-commit verification failure', () => {
  assert.strictEqual(requireCompensationSnapshot({ status: 'POST_VERIFY_FAILED', commit_protocol: 'same_server_single_transaction' }), true);
});

test('requireCompensationSnapshot is true for partially committed staged protocol', () => {
  assert.strictEqual(
    requireCompensationSnapshot({ status: 'MAINT_COMMITTED', commit_protocol: 'cross_server_staged' }),
    true
  );
  assert.strictEqual(
    requireCompensationSnapshot({ status: 'RELATION_COMMITTED', commit_protocol: 'cross_server_staged' }),
    true
  );
});

test('requireCompensationSnapshot is true for compensation-required staged protocol', () => {
  assert.strictEqual(requireCompensationSnapshot({ status: 'COMPENSATION_REQUIRED', commit_protocol: 'cross_server_staged' }), true);
});

test('requireCompensationSnapshot is false for non-partial staged failure', () => {
  assert.strictEqual(
    requireCompensationSnapshot({ status: 'STARTED', commit_protocol: 'cross_server_staged' }),
    false
  );
  assert.strictEqual(
    requireCompensationSnapshot({ status: 'COMMITTED', commit_protocol: 'cross_server_staged' }),
    false
  );
});

test('requireCompensationSnapshot rejects missing apply record', () => {
  assert.throws(() => requireCompensationSnapshot(null), /apply record is required/);
  assert.throws(() => requireCompensationSnapshot({}), /apply record is required/);
});
