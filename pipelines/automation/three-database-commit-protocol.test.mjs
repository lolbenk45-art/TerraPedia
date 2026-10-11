import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { loadMysqlModule } from '../lib/mysql-module.mjs';

const SAME_SERVER_MANIFEST = {
  schemaVersion: 1,
  runId: 'run-001',
  serverIdentity: { host: 'db-host', port: 3306, serverUuid: 'uuid-1' },
  databases: {
    maint:    {
      role: 'maint', name: 'terria_v1_maint', host: 'db-host', port: 3306,
      serverUuid: 'uuid-1', supportsTransactions: true, allTablesInnoDB: true,
    },
    relation: {
      role: 'relation', name: 'terria_v1_relation', host: 'db-host', port: 3306,
      serverUuid: 'uuid-1', supportsTransactions: true, allTablesInnoDB: true,
    },
    local: {
      role: 'local', name: 'terria_v1_local', host: 'db-host', port: 3306,
      serverUuid: 'uuid-1', supportsTransactions: true, allTablesInnoDB: true,
    }
  }
};

const CROSS_SERVER_MANIFEST = {
  schemaVersion: 1,
  runId: 'run-001',
  serverIdentity: { host: 'db-host-a', port: 3306, serverUuid: 'uuid-a' },
  databases: {
    maint: {
      role: 'maint', name: 'terria_v1_maint', host: 'db-host-a', port: 3306,
      serverUuid: 'uuid-a', supportsTransactions: true, allTablesInnoDB: true,
    },
    relation: {
      role: 'relation', name: 'terria_v1_relation', host: 'db-host-b', port: 3306,
      serverUuid: 'uuid-b', supportsTransactions: true, allTablesInnoDB: true,
    },
    local: {
      role: 'local', name: 'terria_v1_local', host: 'db-host-c', port: 3306,
      serverUuid: 'uuid-c', supportsTransactions: true, allTablesInnoDB: true,
    }
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

const TEST_BORROWED_CONNECTION = Symbol('testBorrowedConnection');
const MYSQL = loadMysqlModule();
const TEST_PROTOCOL_POOL_CONNECTIONS = new Map();
const TEST_PROTOCOL_POOL_ACQUISITION_FAILURES = new Map();
let nextTestConnectionId = 1000;
let protocolPoolConstructionHook = null;
let protocolPoolConstructionCount = 0;
let protocolPoolConstructionOptions = [];
let protocolTransactionFailure = null;

function resetProtocolPoolConstructionObservation() {
  protocolPoolConstructionHook = null;
  protocolPoolConstructionCount = 0;
  protocolPoolConstructionOptions = [];
  protocolTransactionFailure = null;
}

function createTrustedTestPool(connection) {
  const raw = new EventEmitter();
  let corePool;
  Object.defineProperty(raw, 'threadId', {
    enumerable: true,
    get: () => connection.threadId,
    set: (value) => { connection.threadId = value; },
  });
  raw.query = (sql, params, callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = undefined;
    }
    Promise.resolve()
      .then(() => connection.query(sql, params))
      .then(([rows, fields]) => callback(null, rows, fields), callback);
  };
  for (const method of ['beginTransaction', 'commit', 'rollback']) {
    raw[method] = (callback) => {
      const failure = protocolTransactionFailure?.({ method, connection });
      if (failure !== undefined) throw failure;
      Promise.resolve()
        .then(() => connection[method]())
        .then(() => callback(null), callback);
    };
  }
  raw.release = () => connection.release?.();

  corePool = new EventEmitter();
  corePool.getConnection = (callback) => {
    raw._pool = corePool;
    callback(null, raw);
  };
  corePool.end = (callback) => callback?.(null);
  return new MYSQL.PromisePool(corePool, Promise);
}

function testPoolKey({ host, port, user, database }) {
  return JSON.stringify([host, port, user, database]);
}

function createProtocolOwnedTestPool(options) {
  protocolPoolConstructionCount += 1;
  protocolPoolConstructionOptions.push(Object.freeze({ ...options }));
  protocolPoolConstructionHook?.(options);
  const key = testPoolKey(options);
  const connection = TEST_PROTOCOL_POOL_CONNECTIONS.get(key);
  if (!connection) {
    throw new Error(`no test connection registered for ${options?.database ?? 'unknown database'}`);
  }
  const pool = createTrustedTestPool(connection);
  const acquisitionFailure = TEST_PROTOCOL_POOL_ACQUISITION_FAILURES.get(key);
  if (acquisitionFailure) {
    pool.getConnection = async () => { throw acquisitionFailure; };
  }
  return pool;
}

const originalMysqlCreatePool = MYSQL.createPool;
let protocolModule;
try {
  MYSQL.createPool = createProtocolOwnedTestPool;
  protocolModule = await import('./three-database-commit-protocol.mjs');
} finally {
  MYSQL.createPool = originalMysqlCreatePool;
}

const {
  determineCommitProtocol,
  executeSameServerTransaction: executeSameServerTransactionDirect,
  executeStagedProtocol: executeStagedProtocolDirect,
  requireCompensationSnapshot,
} = protocolModule;

function attachTestBorrowedConnectionIdentities(manifest, connections) {
  if (!connections || !manifest?.databases) return;
  const roles = ['maint', 'relation', 'local'];
  const sameServer = roles.every((role) => {
    const descriptor = manifest.databases[role];
    const local = manifest.databases.local;
    return descriptor?.serverUuid === local?.serverUuid && descriptor?.port === local?.port;
  });

  for (const role of roles) {
    const connection = connections[role];
    if (!connection || typeof connection.query !== 'function') continue;
    const identityRole = sameServer ? 'local' : role;
    const descriptor = manifest.databases[identityRole];
    if (!Number.isSafeInteger(connection.threadId) || connection.threadId < 1) {
      connection.threadId = nextTestConnectionId;
      nextTestConnectionId += 1;
    }
    if (typeof connection.release !== 'function') {
      connection.release = async () => {};
    }
    if (connection[TEST_BORROWED_CONNECTION]) continue;

    const query = connection.query.bind(connection);
    const identity = Object.freeze({
      serverUuid: descriptor.serverUuid,
      port: descriptor.port,
      databaseName: descriptor.name,
      connectionId: connection.threadId,
    });
    Object.defineProperty(connection, TEST_BORROWED_CONNECTION, { value: identity });
    connection.query = async (sql, params) => {
      if (typeof sql === 'string' && sql.includes('@@server_uuid') && sql.includes('CONNECTION_ID()')) {
        return [[identity]];
      }
      return query(sql, params);
    };
  }
}

function createCrossServerConnectionViews(connection) {
  const createView = () => {
    const view = {
      query: connection.query.bind(connection),
    };
    for (const method of ['beginTransaction', 'commit', 'rollback']) {
      if (typeof connection[method] === 'function') {
        view[method] = connection[method].bind(connection);
      }
    }
    return view;
  };
  return {
    maint: createView(),
    relation: createView(),
    local: createView(),
  };
}

function createTestConnectionConfig(manifest, connections) {
  const roles = ['maint', 'relation', 'local'];
  if (!roles.every((role) => connections?.[role] && typeof connections[role].query === 'function')) {
    return undefined;
  }
  const connectionConfig = Object.fromEntries(roles.map((role) => {
    const descriptor = manifest.databases[role];
    const options = {
      host: descriptor.host,
      port: descriptor.port,
      user: 'protocol-test-user',
      password: 'protocol-test-password',
      database: descriptor.name,
    };
    TEST_PROTOCOL_POOL_CONNECTIONS.set(testPoolKey(options), connections[role]);
    return [role, options];
  }));
  return connectionConfig;
}

// Ordinary behavior tests feed only canonical connection settings into the
// public executor. The module owns pool construction; this test factory is
// captured before the protocol module is imported and never becomes a public
// injection hook.
async function executeSameServerTransaction(args = {}) {
  const input = {
    manifest: SAME_SERVER_MANIFEST,
    ...args,
  };
  attachTestBorrowedConnectionIdentities(input.manifest, input.connections);
  if (input.connectionConfig === undefined && input.connections !== undefined) {
    input.connectionConfig = createTestConnectionConfig(input.manifest, input.connections);
    delete input.connections;
  }
  return executeSameServerTransactionDirect(input);
}

async function executeStagedProtocol(args = {}) {
  const input = {
    manifest: CROSS_SERVER_MANIFEST,
    ...args,
  };
  attachTestBorrowedConnectionIdentities(input.manifest, input.connections);
  if (input.connectionConfig === undefined && input.connections !== undefined) {
    input.connectionConfig = createTestConnectionConfig(input.manifest, input.connections);
    delete input.connections;
  }
  return executeStagedProtocolDirect(input);
}

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

test('determineCommitProtocol rejects malformed server descriptors and unsafe capabilities', () => {
  for (const mutate of [
    (manifest) => ({ ...manifest, serverIdentity: { ...manifest.serverIdentity, port: 0 } }),
    (manifest) => ({
      ...manifest,
      databases: { ...manifest.databases, local: { ...manifest.databases.local, serverUuid: '' } }
    }),
    (manifest) => ({
      ...manifest,
      databases: { ...manifest.databases, relation: { ...manifest.databases.relation, engine: 'MyISAM' } }
    }),
    (manifest) => ({
      ...manifest,
      databases: { ...manifest.databases, maint: { ...manifest.databases.maint, supportsTransactions: false } }
    }),
    (manifest) => ({
      ...manifest,
      serverIdentity: { ...manifest.serverIdentity, serverUuid: 'other-server' }
    }),
  ]) {
    assert.throws(() => determineCommitProtocol(mutate(SAME_SERVER_MANIFEST)), /manifest|InnoDB|transaction|descriptor/i);
  }
});

test('determineCommitProtocol rejects a database descriptor without explicit identity and transaction capability proof', () => {
  for (const field of ['role', 'name', 'supportsTransactions', 'allTablesInnoDB']) {
    const databases = Object.fromEntries(Object.entries(SAME_SERVER_MANIFEST.databases).map(([role, descriptor]) => [
      role,
      role === 'relation' ? Object.fromEntries(
        Object.entries(descriptor).filter(([key]) => key !== field)
      ) : descriptor,
    ]));
    assert.throws(
      () => determineCommitProtocol({ ...SAME_SERVER_MANIFEST, databases }),
      new RegExp(field),
      `missing ${field} must fail closed`
    );
  }
});

// ── executeSameServerTransaction ──────────────────────────────────────────────

function makeSameServerConnections(queryHook) {
  const state = {
    runId: null,
    bundleHash: null,
    policySetHash: null,
    decisionHash: null,
    approvalId: null,
    mode: null,
    commitProtocol: null,
    status: null,
    beforeGenerationJson: null,
    committedGenerationJson: null,
  };

  const readback = () => [[{
    runId: state.runId,
    bundleHash: state.bundleHash,
    policySetHash: state.policySetHash,
    decisionHash: state.decisionHash,
    approvalId: state.approvalId,
    mode: state.mode,
    commitProtocol: state.commitProtocol,
    status: state.status,
    committed_generation_json: state.committedGenerationJson,
    before_generation_json: state.beforeGenerationJson,
  }]];

  const applyStatusMutation = (sql, params, result) => {
    if (Number(result?.[0]?.affectedRows) !== 1) return;
    if (sql.includes('SET status = ?, committed_generation_json = ?')) {
      state.status = params?.[0];
      state.committedGenerationJson = params?.[1];
      return;
    }
    const status = sql.match(/SET\s+status\s*=\s*'([A-Z_]+)'/i)?.[1];
    if (status) state.status = status;
  };

  const shared = {
    query: async (sql, params) => {
      if (sql.includes('SELECT') && sql.includes('FROM crawler_automation_apply')) {
        const hooked = queryHook?.(sql, params);
        if (hooked instanceof Error) throw hooked;
        // A hook may provide a deliberate readback fixture. Generic mutation
        // results returned by older tests should not masquerade as SELECT
        // rows; the protocol must still exercise its strict readback checks.
        if (Array.isArray(hooked) && Array.isArray(hooked[0])) return hooked;
        return readback();
      }
      if (sql.includes('INSERT INTO crawler_automation_apply')) {
        const hooked = queryHook?.(sql, params);
        if (hooked !== undefined) {
          if (Number(hooked?.[0]?.affectedRows) === 1) {
            state.runId = params?.[0];
            state.bundleHash = params?.[1];
            state.policySetHash = params?.[2];
            state.decisionHash = params?.[3];
            state.approvalId = params?.[4];
            state.mode = params?.[5];
            state.commitProtocol = params?.[7];
            state.status = 'STARTED';
            state.beforeGenerationJson = params?.[6];
            state.committedGenerationJson = null;
          }
          return hooked;
        }
        state.runId = params?.[0];
        state.bundleHash = params?.[1];
        state.policySetHash = params?.[2];
        state.decisionHash = params?.[3];
        state.approvalId = params?.[4];
        state.mode = params?.[5];
        state.commitProtocol = params?.[7];
        state.status = 'STARTED';
        state.beforeGenerationJson = params?.[6];
        state.committedGenerationJson = null;
        return [{ affectedRows: 1 }];
      }
      if (queryHook) {
        const hooked = queryHook(sql, params);
        if (hooked !== undefined) {
          applyStatusMutation(sql, params, hooked);
          return hooked;
        }
      }
      if (sql === 'START TRANSACTION' || sql === 'COMMIT' || sql === 'ROLLBACK') return [{}];
      if (sql.includes('UPDATE')) {
        const result = [{ affectedRows: 1 }];
        applyStatusMutation(sql, params, result);
        return result;
      }
      return [[]];
    }
  };
  shared.beginTransaction = async () => shared.query('START TRANSACTION');
  shared.commit = async () => shared.query('COMMIT');
  shared.rollback = async () => shared.query('ROLLBACK');
  return { maint: shared, relation: shared, local: shared };
}

test('same-server automatic test acquisition uses the pinned local coordinator instead of caller connection aliases', async () => {
  const one = makeSameServerConnections().local;
  const result = await executeSameServerTransaction({
    ...BASE_APPLY_ARGS,
    connections: { maint: one, relation: { ...one }, local: one },
    applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
  });
  assert.equal(result.status, 'committed');
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

test('executeSameServerTransaction compensates a committed write after post-commit verification fails', async () => {
  const calls = [];
  const statusSql = [];
  const connections = makeSameServerConnections((sql) => {
    if (sql === 'COMMIT') calls.push('commit');
    if (sql.includes('UPDATE crawler_automation_apply')) statusSql.push(sql);
    if (sql.includes("status = 'POST_VERIFY_FAILED'")) calls.push('post-verify-failed');
    if (sql.includes("status = 'COMPENSATING'")) calls.push('compensating');
    if (sql.includes("status = 'COMPENSATED'")) calls.push('compensated');
    return [{ affectedRows: 1 }];
  });

  await assert.rejects(() => executeSameServerTransaction({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
    postCommitVerifyWork: async () => ({ apiSamples: false, cacheVisible: true }),
    compensateWork: async ({ reason }) => {
      calls.push(`compensate:${reason}`);
      return { status: 'compensated' };
    },
  }), /post-commit verification failed/);

  assert.deepEqual(calls.filter((entry) => entry !== 'commit'), [
    'post-verify-failed',
    'compensating',
    'compensate:post_commit_verification_failed',
    'compensated',
  ]);
  assert.ok(
    !statusSql.some((sql) => sql.includes("status = 'COMPENSATION_REQUIRED'")),
    'an acknowledged POST_VERIFY_FAILED must enter compensation directly'
  );
});

test('executeSameServerTransaction rejects a missing canonical connectionConfig', async () => {
  await assert.rejects(
    () => executeSameServerTransaction({
      ...BASE_APPLY_ARGS,
      connections: { maint: {}, relation: {} },  // missing local
      applyWork: async () => ({})
    }),
    /canonical connectionConfig is required/
  );
});

test('executeSameServerTransaction rejects a malformed canonical connectionConfig', async () => {
  const connection = { query: async () => [{}] };
  await assert.rejects(() => executeSameServerTransaction({
    ...BASE_APPLY_ARGS,
    connections: { maint: connection, relation: connection, local: { } },
    applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
  }), /canonical connectionConfig is required/);
});

test('executeSameServerTransaction rejects a query-only shared pool before any query or apply', async () => {
  const pool = makeSameServerConnections().local;
  delete pool.beginTransaction;
  delete pool.commit;
  delete pool.rollback;
  const connections = { maint: pool, relation: pool, local: pool };
  const queries = trackProtocolQueries(connections);
  let applyCalls = 0;

  await assert.rejects(() => executeSameServerTransaction({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async () => {
      applyCalls += 1;
      return { maint: 1, relation: 1, local: 1 };
    },
  }), /transaction capability|beginTransaction|dedicated|connection\[method\]/i);

  assert.deepStrictEqual(queries, []);
  assert.strictEqual(applyCalls, 0);
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

test('executeSameServerTransaction requires a pre-commit verifier before the first mutation', async () => {
  const events = [];
  const connections = makeSameServerConnections();
  await executeSameServerTransaction({
    ...BASE_APPLY_ARGS,
    connections,
    preCommitVerifyWork: async () => {
      events.push('pre-commit');
      return { relationIntegrity: true };
    },
    applyWork: async () => {
      events.push('apply');
      return { maint: 1, relation: 1, local: 1 };
    },
  });
  assert.deepStrictEqual(events, ['pre-commit', 'apply']);
});

test('same-server callbacks receive frozen generation snapshots', async () => {
  const connections = makeSameServerConnections();
  const snapshots = [];

  await executeSameServerTransaction({
    ...BASE_APPLY_ARGS,
    connections,
    preCommitVerifyWork: async ({ beforeGenerations, appliedGenerations }) => {
      snapshots.push({
        phase: 'pre-commit',
        beforeFrozen: Object.isFrozen(beforeGenerations),
        appliedFrozen: Object.isFrozen(appliedGenerations)
      });
      return { relationIntegrity: true };
    },
    applyWork: async ({ beforeGenerations }) => {
      snapshots.push({ phase: 'apply', beforeFrozen: Object.isFrozen(beforeGenerations) });
      return {
        maint: beforeGenerations.maint + 1,
        relation: beforeGenerations.relation + 1,
        local: beforeGenerations.local + 1,
      };
    },
  });

  assert.deepStrictEqual(snapshots, [
    { phase: 'pre-commit', beforeFrozen: true, appliedFrozen: true },
    { phase: 'apply', beforeFrozen: true },
  ]);
});

test('apply status transitions reject non-numeric affectedRows values', async () => {
  for (const value of ['1', true, new Number(1)]) {
    const connections = makeSameServerConnections((sql) => {
      if (sql.includes('INSERT INTO crawler_automation_apply')) return [{ affectedRows: value }];
      return undefined;
    });
    await assert.rejects(() => executeSameServerTransaction({
      ...BASE_APPLY_ARGS,
      connections,
      applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
    }), /affectedRows.*exactly one/i, `affectedRows=${String(value)} must fail closed`);
  }
});

// ── executeStagedProtocol ─────────────────────────────────────────────────────

function makeCrossServerConnections(queryHook, { withCoordinatorTransaction = true } = {}) {
  const state = {
    runId: null,
    bundleHash: null,
    policySetHash: null,
    decisionHash: null,
    approvalId: null,
    mode: null,
    commitProtocol: null,
    status: null,
    beforeGenerationJson: null,
    committedGenerationJson: null,
  };
  const calls = [];
  const readback = () => [[{
    runId: state.runId,
    bundleHash: state.bundleHash,
    policySetHash: state.policySetHash,
    decisionHash: state.decisionHash,
    approvalId: state.approvalId,
    mode: state.mode,
    commitProtocol: state.commitProtocol,
    status: state.status,
    committed_generation_json: state.committedGenerationJson,
    before_generation_json: state.beforeGenerationJson,
  }]];
  const applyStatusMutation = (sql, params, result) => {
    if (Number(result?.[0]?.affectedRows) !== 1) return;
    if (sql.includes('SET status = ?, committed_generation_json = ?')) {
      state.status = params?.[0];
      state.committedGenerationJson = params?.[1];
      return;
    }
    const status = sql.match(/SET\s+status\s*=\s*'([A-Z_]+)'/i)?.[1];
    if (status) state.status = status;
  };
  const makeConn = (role) => ({
    query: async (sql, params) => {
      calls.push({ sql, params, role });
      if (sql.includes('SELECT') && sql.includes('FROM crawler_automation_apply')) {
        queryHook?.(sql, params, role, state.status);
        return readback();
      }
      if (sql.includes('INSERT INTO crawler_automation_apply')) {
        const override = queryHook?.(sql, params, role, state.status);
        if (override !== undefined) {
          if (Number(override?.[0]?.affectedRows) === 1) {
            state.runId = params?.[0];
            state.bundleHash = params?.[1];
            state.policySetHash = params?.[2];
            state.decisionHash = params?.[3];
            state.approvalId = params?.[4];
            state.mode = params?.[5];
            state.commitProtocol = params?.[7];
            state.status = 'STARTED';
            state.beforeGenerationJson = params?.[6];
            state.committedGenerationJson = null;
          }
          return override;
        }
        state.runId = params?.[0];
        state.bundleHash = params?.[1];
        state.policySetHash = params?.[2];
        state.decisionHash = params?.[3];
        state.approvalId = params?.[4];
        state.mode = params?.[5];
        state.commitProtocol = params?.[7];
        state.status = 'STARTED';
        state.beforeGenerationJson = params?.[6];
        state.committedGenerationJson = null;
        return [{ affectedRows: 1 }];
      }
      if (queryHook) {
        const override = queryHook(sql, params, role, state.status);
        if (override !== undefined) {
          applyStatusMutation(sql, params, override);
          return override;
        }
      }
      if (sql.includes('UPDATE')) {
        const result = [{ affectedRows: 1 }];
        applyStatusMutation(sql, params, result);
        return result;
      }
      return [[]];
    }
  });
  const connections = {
    maint: makeConn('maint'),
    relation: makeConn('relation'),
    local: makeConn('local'),
    calls
  };
  if (withCoordinatorTransaction) {
    connections.local.beginTransaction = async () => {};
    connections.local.commit = async () => {};
    connections.local.rollback = async () => {};
  }
  return connections;
}

function trackProtocolQueries(connections) {
  const calls = [];
  const seen = new Set();
  for (const role of ['maint', 'relation', 'local']) {
    const connection = connections?.[role];
    if (!connection || seen.has(connection)) continue;
    seen.add(connection);
    const query = connection.query.bind(connection);
    connection.query = async (sql, params) => {
      calls.push({ role, sql, params });
      return query(sql, params);
    };
  }
  return calls;
}

const DIRECT_EXECUTOR_MANIFEST_REJECTIONS = [
  {
    label: 'same-server executor without a manifest',
    execute: executeSameServerTransactionDirect,
    makeConnections: () => makeSameServerConnections(),
    manifest: undefined,
    expectedError: /manifest is required/i,
    applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
  },
  {
    label: 'staged executor without a manifest',
    execute: executeStagedProtocolDirect,
    makeConnections: () => makeCrossServerConnections(),
    manifest: undefined,
    expectedError: /manifest is required/i,
    applyWork: async ({ stage }) => ({ [stage]: 1 }),
  },
  {
    label: 'same-server executor with unsafe InnoDB proof',
    execute: executeSameServerTransactionDirect,
    makeConnections: () => makeSameServerConnections(),
    manifest: {
      ...SAME_SERVER_MANIFEST,
      databases: {
        ...SAME_SERVER_MANIFEST.databases,
        local: { ...SAME_SERVER_MANIFEST.databases.local, allTablesInnoDB: false },
      },
    },
    expectedError: /allTablesInnoDB.*true|InnoDB|transaction/i,
    applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
  },
  {
    label: 'staged executor with unsafe transaction proof',
    execute: executeStagedProtocolDirect,
    makeConnections: () => makeCrossServerConnections(),
    manifest: {
      ...CROSS_SERVER_MANIFEST,
      databases: {
        ...CROSS_SERVER_MANIFEST.databases,
        relation: { ...CROSS_SERVER_MANIFEST.databases.relation, supportsTransactions: false },
      },
    },
    expectedError: /supportsTransactions.*true|transaction/i,
    applyWork: async ({ stage }) => ({ [stage]: 1 }),
  },
  {
    label: 'same-server executor with a cross-server manifest',
    execute: executeSameServerTransactionDirect,
    makeConnections: () => makeSameServerConnections(),
    manifest: CROSS_SERVER_MANIFEST,
    expectedError: /manifest protocol.*same_server_single_transaction/i,
    applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
  },
  {
    label: 'staged executor with a same-server manifest',
    execute: executeStagedProtocolDirect,
    makeConnections: () => makeCrossServerConnections(),
    manifest: SAME_SERVER_MANIFEST,
    expectedError: /manifest protocol.*cross_server_staged/i,
    applyWork: async ({ stage }) => ({ [stage]: 1 }),
  },
  {
    label: 'same-server executor with a manifest for another run',
    execute: executeSameServerTransactionDirect,
    makeConnections: () => makeSameServerConnections(),
    manifest: { ...SAME_SERVER_MANIFEST, runId: 'other-run' },
    expectedError: /manifest\.runId.*runId/i,
    applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
  },
  {
    label: 'staged executor with a manifest for another run',
    execute: executeStagedProtocolDirect,
    makeConnections: () => makeCrossServerConnections(),
    manifest: { ...CROSS_SERVER_MANIFEST, runId: 'other-run' },
    expectedError: /manifest\.runId.*runId/i,
    applyWork: async ({ stage }) => ({ [stage]: 1 }),
  },
];

for (const scenario of DIRECT_EXECUTOR_MANIFEST_REJECTIONS) {
  test(`direct apply executor rejects ${scenario.label} before query or apply`, async () => {
    const connections = scenario.makeConnections();
    const queries = trackProtocolQueries(connections);
    let applyCalls = 0;
    const args = {
      ...BASE_APPLY_ARGS,
      connections,
      applyWork: async (context) => {
        applyCalls += 1;
        return scenario.applyWork(context);
      },
    };
    if (scenario.manifest !== undefined) args.manifest = scenario.manifest;

    await assert.rejects(() => scenario.execute(args), scenario.expectedError);
    assert.deepStrictEqual(queries, [], `${scenario.label} must fail before an intent or transaction query`);
    assert.strictEqual(applyCalls, 0, `${scenario.label} must fail before applyWork`);
  });
}

test('direct executors reject an intent write that affects more than one apply record', async () => {
  const scenarios = [
    {
      label: 'same-server intent',
      execute: executeSameServerTransaction,
      makeConnections: () => makeSameServerConnections((sql) => (
        sql.includes('INSERT INTO crawler_automation_apply') ? [{ affectedRows: 2 }] : undefined
      )),
      applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
    },
    {
      label: 'staged intent',
      execute: executeStagedProtocol,
      makeConnections: () => makeCrossServerConnections((sql) => (
        sql.includes('INSERT INTO crawler_automation_apply') ? [{ affectedRows: 2 }] : undefined
      )),
      applyWork: async ({ stage }) => ({ [stage]: 1 }),
    },
  ];

  for (const scenario of scenarios) {
    const connections = scenario.makeConnections();
    const queries = trackProtocolQueries(connections);
    let applyCalls = 0;

    await assert.rejects(() => scenario.execute({
      ...BASE_APPLY_ARGS,
      connections,
      applyWork: async (context) => {
        applyCalls += 1;
        return scenario.applyWork(context);
      },
    }), /apply intent.*affectedRows.*exactly one/i, `${scenario.label} must reject affectedRows=2`);

    assert.strictEqual(applyCalls, 0, `${scenario.label} must not start applyWork after a duplicate intent write`);
    assert.equal(
      queries.some(({ sql }) => sql.includes('UPDATE crawler_automation_apply')),
      false,
      `${scenario.label} must not advance an apply status after a duplicate intent write`
    );
  }
});

test('same-server DB_COMMITTED and final status writes reject affectedRows above one', async () => {
  const scenarios = [
    {
      label: 'DB_COMMITTED marker',
      matches: (sql) => sql.includes('SET status = ?, committed_generation_json = ?'),
      expectedError: /DB_COMMITTED apply status.*affectedRows.*exactly one/i,
      expectRecoveryQuarantine: false,
    },
    {
      label: 'final COMMITTED status',
      matches: (sql) => sql.includes("status = 'COMMITTED'"),
      expectedError: /COMMITTED apply status.*affectedRows.*exactly one/i,
      expectRecoveryQuarantine: true,
    },
  ];

  for (const scenario of scenarios) {
    const statusWrites = [];
    let commits = 0;
    let applyCalls = 0;
    let compensationCalls = 0;
    const connections = makeSameServerConnections((sql, params) => {
      if (sql === 'COMMIT') commits += 1;
      if (sql.includes('UPDATE crawler_automation_apply')) statusWrites.push({ sql, params });
      if (scenario.matches(sql, params)) return [{ affectedRows: 2 }];
      return undefined;
    });

    await assert.rejects(() => executeSameServerTransaction({
      ...BASE_APPLY_ARGS,
      connections,
      applyWork: async () => {
        applyCalls += 1;
        return { maint: 1, relation: 1, local: 1 };
      },
      compensateWork: async () => {
        compensationCalls += 1;
        return { status: 'compensated' };
      },
    }), scenario.expectedError, `${scenario.label} must reject affectedRows=2`);

    assert.strictEqual(applyCalls, 1, `${scenario.label} must only reach its own status transition after applyWork`);
    if (scenario.label === 'DB_COMMITTED marker') {
      assert.strictEqual(commits, 0, 'a failed DB_COMMITTED marker must not commit business-table work');
    } else {
      assert.ok(commits >= 1, 'the committed business transaction remains separately observable from recovery metadata transactions');
    }
    assert.strictEqual(compensationCalls, 0, `${scenario.label} must not run compensation after an ambiguous status write`);
    assert.equal(
      statusWrites.some(({ sql }) => sql.includes("status = 'COMPENSATING'")),
      false,
      `${scenario.label} must not claim COMPENSATING from an unsafe status write`
    );
    if (scenario.expectRecoveryQuarantine) {
      assert.ok(
        statusWrites.some(({ sql }) => sql.includes("status = 'COMPENSATION_REQUIRED'")),
        'an acknowledged transaction with an unsafe final status must be quarantined'
      );
    } else {
      assert.equal(
        statusWrites.some(({ sql }) => sql.includes("status = 'COMMITTED'")),
        false,
        'a failed DB_COMMITTED marker must not advance to the final COMMITTED status'
      );
    }
  }
});

test('staged marker and final status writes reject affectedRows above one without downstream apply or compensation', async () => {
  const scenarios = [
    {
      label: 'MAINT stage marker',
      matches: (sql, params) => sql.includes('SET status = ?, committed_generation_json = ?')
        && params?.[0] === 'MAINT_COMMITTED',
      expectedError: /MAINT stage marker.*exactly one/i,
      expectedStages: ['maint'],
    },
    {
      label: 'final COMMITTED status',
      matches: (sql) => sql.includes("status = 'COMMITTED'"),
      expectedError: /COMMITTED apply status.*affectedRows.*exactly one/i,
      expectedStages: ['maint', 'relation', 'local'],
    },
  ];

  for (const scenario of scenarios) {
    const statusWrites = [];
    const stages = [];
    let compensationCalls = 0;
    const connections = makeCrossServerConnections((sql, params) => {
      if (sql.includes('UPDATE crawler_automation_apply')) statusWrites.push({ sql, params });
      if (scenario.matches(sql, params)) return [{ affectedRows: 2 }];
      return undefined;
    });

    await assert.rejects(() => executeStagedProtocol({
      ...BASE_APPLY_ARGS,
      connections,
      applyWork: async ({ stage }) => {
        stages.push(stage);
        return { [stage]: 1 };
      },
      compensateWork: async () => {
        compensationCalls += 1;
        return { status: 'compensated' };
      },
    }), scenario.expectedError, `${scenario.label} must reject affectedRows=2`);

    assert.deepStrictEqual(stages, scenario.expectedStages, `${scenario.label} must not run a downstream stage`);
    assert.strictEqual(compensationCalls, 0, `${scenario.label} must not run compensation without an exact status transition`);
    assert.ok(
      statusWrites.some(({ sql }) => sql.includes("status = 'COMPENSATION_REQUIRED'")),
      `${scenario.label} must quarantine the ambiguous state for a recovery observer`
    );
    assert.equal(
      statusWrites.some(({ sql }) => sql.includes("status = 'COMPENSATING'")),
      false,
      `${scenario.label} must not claim COMPENSATING after affectedRows=2`
    );
  }
});

test('recovery status transitions reject affectedRows above one before user compensation', async () => {
  const scenarios = [
    {
      label: 'staged COMPENSATION_REQUIRED',
      execute: executeStagedProtocol,
      makeConnections: (statusWrites) => makeCrossServerConnections((sql, params) => {
        if (sql.includes('UPDATE crawler_automation_apply')) statusWrites.push({ sql, params });
        if (sql.includes("status = 'COMPENSATION_REQUIRED'")) return [{ affectedRows: 2 }];
        return undefined;
      }),
      applyWork: async ({ stage }) => {
        if (stage === 'relation') throw new Error('relation apply outcome unknown');
        return { [stage]: 1 };
      },
      expectedError: /relation apply outcome unknown/,
      expectedStages: ['maint', 'relation'],
      forbiddenStatus: 'COMPENSATING',
    },
    {
      label: 'same-server COMPENSATING',
      execute: executeSameServerTransaction,
      makeConnections: (statusWrites) => makeSameServerConnections((sql, params) => {
        if (sql.includes('UPDATE crawler_automation_apply')) statusWrites.push({ sql, params });
        if (sql.includes("status = 'COMPENSATING'")) return [{ affectedRows: 2 }];
        return undefined;
      }),
      applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
      postCommitVerifyWork: async () => ({ apiSamples: false, cacheVisible: true }),
      expectedError: /post-commit verification failed/,
      expectedStages: ['apply'],
      forbiddenStatus: 'COMPENSATED',
    },
  ];

  for (const scenario of scenarios) {
    const statusWrites = [];
    const stages = [];
    let compensationCalls = 0;
    const caught = await captureThrown(() => scenario.execute({
      ...BASE_APPLY_ARGS,
      connections: scenario.makeConnections(statusWrites),
      postCommitVerifyWork: scenario.postCommitVerifyWork ?? BASE_APPLY_ARGS.postCommitVerifyWork,
      applyWork: async (context) => {
        stages.push(context.stage ?? 'apply');
        return scenario.applyWork(context);
      },
      compensateWork: async () => {
        compensationCalls += 1;
        return { status: 'compensated' };
      },
    }));

    assert.match(caught.message, scenario.expectedError, `${scenario.label} must preserve the originating failure`);
    assert.deepStrictEqual(stages, scenario.expectedStages, `${scenario.label} must stop before downstream work`);
    assert.strictEqual(compensationCalls, 0, `${scenario.label} must not invoke compensation after affectedRows=2`);
    assert.equal(caught.requiresReadbackReconciliation, true, `${scenario.label} must remain a reconciliation blocker`);
    assert.equal(
      statusWrites.some(({ sql }) => sql.includes(`status = '${scenario.forbiddenStatus}'`)),
      false,
      `${scenario.label} must not advance to ${scenario.forbiddenStatus}`
    );
  }
});

function makeFixedStatusConnections(status, { markerAffectedRows = 1 } = {}) {
  const calls = [];
  const state = {
    runId: null,
    bundleHash: null,
    policySetHash: null,
    decisionHash: null,
    approvalId: null,
    mode: null,
    commitProtocol: null,
    status: null,
    beforeGenerationJson: null,
    committedGenerationJson: null,
    selectCount: 0,
  };
  const connection = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('INSERT INTO crawler_automation_apply')) {
        state.runId = params?.[0];
        state.bundleHash = params?.[1];
        state.policySetHash = params?.[2];
        state.decisionHash = params?.[3];
        state.approvalId = params?.[4];
        state.mode = params?.[5];
        state.commitProtocol = params?.[7];
        state.status = 'STARTED';
        state.beforeGenerationJson = params?.[6];
        state.committedGenerationJson = null;
        state.selectCount = 0;
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('SELECT') && sql.includes('FROM crawler_automation_apply')) {
        state.selectCount += 1;
        const readStatus = state.selectCount === 1 ? 'STARTED' : status;
        return [[{
          runId: state.runId,
          bundleHash: state.bundleHash,
          policySetHash: state.policySetHash,
          decisionHash: state.decisionHash,
          approvalId: state.approvalId,
          mode: state.mode,
          commitProtocol: state.commitProtocol,
          status: readStatus,
          committed_generation_json: state.committedGenerationJson,
          before_generation_json: state.beforeGenerationJson,
        }]];
      }
      if (sql.includes('SET status = ?, committed_generation_json = ?')) {
        if (markerAffectedRows === 1) {
          state.status = params?.[0];
          state.committedGenerationJson = params?.[1];
        }
        return [{ affectedRows: markerAffectedRows }];
      }
      if (sql.includes('UPDATE')) {
        const result = [{ affectedRows: 1 }];
        const next = sql.match(/SET\s+status\s*=\s*'([A-Z_]+)'/i)?.[1];
        if (next) state.status = next;
        return result;
      }
      return [[]];
    },
  };
  connection.beginTransaction = async () => {};
  connection.commit = async () => {};
  connection.rollback = async () => {};
  return {
    connections: createCrossServerConnectionViews(connection),
    calls,
  };
}

function makeSequencedStatusConnections(statuses) {
  const calls = [];
  let selectIndex = 0;
  let lastWrite = 'none';
  const state = {
    runId: null,
    bundleHash: null,
    policySetHash: null,
    decisionHash: null,
    approvalId: null,
    mode: null,
    commitProtocol: null,
    status: null,
    beforeGenerationJson: null,
    committedGenerationJson: null,
  };
  const connection = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('INSERT INTO crawler_automation_apply')) {
        state.runId = params?.[0];
        state.bundleHash = params?.[1];
        state.policySetHash = params?.[2];
        state.decisionHash = params?.[3];
        state.approvalId = params?.[4];
        state.mode = params?.[5];
        state.commitProtocol = params?.[7];
        state.status = 'STARTED';
        state.beforeGenerationJson = params?.[6];
        state.committedGenerationJson = null;
        lastWrite = 'insert';
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('SELECT') && sql.includes('FROM crawler_automation_apply')) {
        let readStatus;
        if (lastWrite === 'insert' || lastWrite === 'marker' || lastWrite === 'status') {
          readStatus = state.status;
          lastWrite = 'read';
        } else {
          readStatus = statuses[Math.min(selectIndex, statuses.length - 1)];
          selectIndex += 1;
        }
        return [[{
          runId: state.runId,
          bundleHash: state.bundleHash,
          policySetHash: state.policySetHash,
          decisionHash: state.decisionHash,
          approvalId: state.approvalId,
          mode: state.mode,
          commitProtocol: state.commitProtocol,
          status: readStatus,
          committed_generation_json: state.committedGenerationJson,
          before_generation_json: state.beforeGenerationJson,
        }]];
      }
      if (sql.includes('SET status = ?, committed_generation_json = ?')) {
        state.status = params?.[0];
        state.committedGenerationJson = params?.[1];
        lastWrite = 'marker';
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('UPDATE')) {
        const result = [{ affectedRows: 1 }];
        const next = sql.match(/SET\s+status\s*=\s*'([A-Z_]+)'/i)?.[1];
        if (next) state.status = next;
        lastWrite = 'status';
        return result;
      }
      return [[]];
    },
  };
  connection.beginTransaction = async () => {};
  connection.commit = async () => {};
  connection.rollback = async () => {};
  return {
    connections: createCrossServerConnectionViews(connection),
    calls,
  };
}

async function captureThrown(work) {
  try {
    await work();
  } catch (error) {
    return error;
  }
  throw new Error('expected operation to reject');
}

test('executeStagedProtocol records intent before failed pre-commit verification and skips stages and compensation', async () => {
  const stagesExecuted = [];
  const events = [];
  let compensationCalls = 0;
  const connections = makeCrossServerConnections((sql) => {
    if (sql.includes('INSERT INTO crawler_automation_apply')) events.push('intent-recorded');
    if (sql.includes("status = 'FAILED'")) events.push('status-failed');
    return undefined;
  });

  await assert.rejects(() => executeStagedProtocol({
    ...BASE_APPLY_ARGS,
    connections,
    preCommitVerifyWork: async ({ appliedGenerations }) => {
      events.push('pre-commit-verification');
      assert.deepStrictEqual(appliedGenerations, {});
      return { relationIntegrity: false };
    },
    applyWork: async ({ stage }) => {
      stagesExecuted.push(stage);
      return { [stage]: 1 };
    },
    compensateWork: async () => {
      compensationCalls += 1;
      return { status: 'compensated' };
    }
  }), /pre-commit verification failed/);

  assert.deepStrictEqual(events, ['intent-recorded', 'pre-commit-verification', 'status-failed']);
  assert.deepStrictEqual(stagesExecuted, []);
  assert.strictEqual(compensationCalls, 0);
});

test('executeStagedProtocol commits all three stages in order', async () => {
  const connections = makeCrossServerConnections();
  const stagesExecuted = [];

  const result = await executeStagedProtocol({
    ...BASE_APPLY_ARGS,
    connections,
    preCommitVerifyWork: async ({ appliedGenerations }) => {
      stagesExecuted.push('pre-commit verification');
      assert.deepStrictEqual(appliedGenerations, {});
      return { relationIntegrity: true };
    },
    applyWork: async ({ stage }) => {
      stagesExecuted.push(stage);
      return { [stage]: 1 };
    }
  });

  assert.strictEqual(result.protocol, 'cross_server_staged');
  assert.strictEqual(result.status, 'committed');
  assert.deepStrictEqual(stagesExecuted, ['pre-commit verification', 'maint', 'relation', 'local']);
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

test('executeStagedProtocol quarantines a partial commit when a stage outcome is ambiguous', async () => {
  const calls = [];
  const connections = makeCrossServerConnections((sql) => {
    if (sql.includes("status = 'COMPENSATION_REQUIRED'")) calls.push('required');
    if (sql.includes("status = 'COMPENSATING'")) calls.push('compensating');
    if (sql.includes("status = 'COMPENSATED'")) calls.push('compensated');
    return undefined;
  });

  await assert.rejects(() => executeStagedProtocol({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async ({ stage }) => {
      if (stage === 'relation') throw new Error('relation server unreachable');
      return { [stage]: 1 };
    },
    compensateWork: async ({ committedStages }) => {
      calls.push(`compensate:${Object.keys(committedStages).join(',')}`);
      return { status: 'compensated' };
    },
  }), /relation server unreachable/);

  assert.deepEqual(calls, ['required']);
});

test('executeStagedProtocol compensates a fully committed apply after verified post-commit failure', async () => {
  const calls = [];
  const connections = makeCrossServerConnections((sql) => {
    if (sql.includes("status = 'COMPENSATION_REQUIRED'")) calls.push('required');
    if (sql.includes("status = 'COMPENSATING'")) calls.push('compensating');
    if (sql.includes("status = 'COMPENSATED'")) calls.push('compensated');
    return undefined;
  });

  await assert.rejects(() => executeStagedProtocol({
    ...BASE_APPLY_ARGS,
    connections,
    postCommitVerifyWork: async () => ({
      relationIntegrity: true,
      apiSamples: false,
      cacheVisible: true,
    }),
    applyWork: async ({ stage }) => ({ [stage]: 1 }),
    compensateWork: async ({ reason }) => {
      calls.push(`compensate:${reason}`);
      return { status: 'compensated' };
    },
  }), /post-commit verification failed/);

  assert.deepEqual(calls, [
    'required',
    'compensating',
    'compensate:partial_commit_or_post_commit_verification_failed',
    'compensated',
  ]);
});

test('executeStagedProtocol requires the exact status for each stage transition', async () => {
  const cases = [
    {
      statuses: ['STARTED', 'STARTED'],
      rejectedStage: 'relation',
      executedStages: ['maint'],
    },
    {
      statuses: ['STARTED', 'MAINT_COMMITTED', 'MAINT_COMMITTED'],
      rejectedStage: 'local',
      executedStages: ['maint', 'relation'],
    },
  ];

  for (const scenario of cases) {
    const { connections } = makeSequencedStatusConnections(scenario.statuses);
    const executedStages = [];
    await assert.rejects(() => executeStagedProtocol({
      ...BASE_APPLY_ARGS,
      connections,
      applyWork: async ({ stage }) => {
        executedStages.push(stage);
        return { [stage]: 1 };
      },
    }), new RegExp(`staged precondition failed for ${scenario.rejectedStage}`));
    assert.deepStrictEqual(executedStages, scenario.executedStages);
  }
});

test('executeStagedProtocol rejects recovery and terminal statuses before starting a stage', async () => {
  for (const status of ['COMPENSATING', 'COMPENSATION_FAILED', 'COMMITTED']) {
    const { connections } = makeFixedStatusConnections(status);
    let applyCalls = 0;
    await assert.rejects(() => executeStagedProtocol({
      ...BASE_APPLY_ARGS,
      connections,
      applyWork: async ({ stage }) => {
        applyCalls += 1;
        return { [stage]: 1 };
      },
    }), /staged precondition failed for maint/);
    assert.strictEqual(applyCalls, 0, `${status} must not run a stage`);
  }
});

test('executeStagedProtocol fails closed when a stage marker updates zero rows', async () => {
  const { connections } = makeFixedStatusConnections('STARTED', { markerAffectedRows: 0 });
  const executedStages = [];

  await assert.rejects(() => executeStagedProtocol({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async ({ stage }) => {
      executedStages.push(stage);
      return { [stage]: 1 };
    },
  }), /stage marker update did not affect exactly one apply record/);

  assert.deepStrictEqual(executedStages, ['maint']);
});

test('executeStagedProtocol rejects a missing canonical connectionConfig', async () => {
  await assert.rejects(
    () => executeStagedProtocol({
      ...BASE_APPLY_ARGS,
      connections: { maint: {}, local: {} },
      applyWork: async () => ({})
    }),
    /canonical connectionConfig is required/
  );
});

test('executeStagedProtocol rejects a malformed canonical connectionConfig', async () => {
  const connection = { query: async () => [[]] };
  await assert.rejects(() => executeStagedProtocol({
    ...BASE_APPLY_ARGS,
    connections: { maint: connection, relation: connection, local: {} },
    applyWork: async () => ({ maint: 1 }),
  }), /canonical connectionConfig is required/);
});

// ── requireCompensationSnapshot ───────────────────────────────────────────────

test('requireCompensationSnapshot is true for an unfinalized same-server protocol', () => {
  assert.strictEqual(
    requireCompensationSnapshot({ status: 'FAILED', commit_protocol: 'same_server_single_transaction' }),
    true
  );
});

test('requireCompensationSnapshot is true after same-server post-commit verification failure', () => {
  assert.strictEqual(requireCompensationSnapshot({ status: 'POST_VERIFY_FAILED', commit_protocol: 'same_server_single_transaction' }), true);
});

test('requireCompensationSnapshot is true for a same-server DB_COMMITTED marker', () => {
  assert.strictEqual(
    requireCompensationSnapshot({ status: 'DB_COMMITTED', commit_protocol: 'same_server_single_transaction' }),
    true
  );
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

test('requireCompensationSnapshot is true for a staged LOCAL_COMMITTED marker', () => {
  assert.strictEqual(
    requireCompensationSnapshot({ status: 'LOCAL_COMMITTED', commit_protocol: 'cross_server_staged' }),
    true
  );
});

test('requireCompensationSnapshot requires recovery while compensation is active or failed', () => {
  for (const protocol of ['same_server_single_transaction', 'cross_server_staged']) {
    for (const status of ['COMPENSATING', 'COMPENSATION_FAILED']) {
      assert.strictEqual(
        requireCompensationSnapshot({ status, commit_protocol: protocol }),
        true,
        `${protocol} ${status} must require a recovery snapshot`
      );
    }
  }
});

test('requireCompensationSnapshot fails closed for ambiguous staged failure states', () => {
  assert.strictEqual(
    requireCompensationSnapshot({ status: 'STARTED', commit_protocol: 'cross_server_staged' }),
    true
  );
  assert.strictEqual(
    requireCompensationSnapshot({ status: 'FAILED', commit_protocol: 'cross_server_staged' }),
    true
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

test('executeSameServerTransaction preserves a frozen post-commit error when compensation metadata cannot attach', async () => {
  const originalError = Object.freeze(new Error('frozen post-commit failure'));
  const statuses = [];
  const connections = makeSameServerConnections((sql) => {
    if (sql.includes('UPDATE crawler_automation_apply')) statuses.push(sql);
    return [{ affectedRows: 1 }];
  });

  const caught = await captureThrown(() => executeSameServerTransaction({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
    postCommitVerifyWork: async () => { throw originalError; },
    compensateWork: async () => ({ status: 'compensated' }),
  }));

  assert.notStrictEqual(caught, originalError);
  assert.strictEqual(caught.cause, originalError);
  assert.ok(statuses.some((sql) => sql.includes("status = 'COMPENSATED'")));
  assert.ok(!statuses.some((sql) => sql.includes("status = 'COMPENSATION_FAILED'")));
});

test('executeStagedProtocol preserves a frozen ambiguous-stage error while quarantining recovery', async () => {
  const originalError = Object.freeze(new Error('frozen staged failure'));
  const statuses = [];
  const connections = makeCrossServerConnections((sql) => {
    if (sql.includes('UPDATE crawler_automation_apply')) statuses.push(sql);
    return undefined;
  });

  const caught = await captureThrown(() => executeStagedProtocol({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async ({ stage }) => {
      if (stage === 'relation') throw originalError;
      return { [stage]: 1 };
    },
    compensateWork: async () => ({ status: 'compensated' }),
  }));

  assert.notStrictEqual(caught, originalError);
  assert.strictEqual(caught.cause, originalError);
  assert.ok(statuses.some((sql) => sql.includes("status = 'COMPENSATION_REQUIRED'")));
  assert.ok(!statuses.some((sql) => sql.includes("status = 'COMPENSATING'")));
  assert.ok(!statuses.some((sql) => sql.includes("status = 'COMPENSATED'")));
});

test('executeSameServerTransaction preserves a frozen error when suppressed compensation metadata cannot attach', async () => {
  const originalError = Object.freeze(new Error('frozen compensation failure'));
  const statuses = [];
  const connections = makeSameServerConnections((sql) => {
    if (sql.includes('UPDATE crawler_automation_apply')) statuses.push(sql);
    return [{ affectedRows: 1 }];
  });

  const caught = await captureThrown(() => executeSameServerTransaction({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
    postCommitVerifyWork: async () => { throw originalError; },
    compensateWork: async () => { throw new Error('compensation failed'); },
  }));

  assert.notStrictEqual(caught, originalError);
  assert.strictEqual(caught.cause, originalError);
  assert.ok(statuses.some((sql) => sql.includes("status = 'COMPENSATION_FAILED'")));
});

function makeAmbiguousStagedConnections({
  failStage,
  failureKind,
  initialStatus = 'STARTED',
  compensationReadbackError = false,
  recoveryStatusOverride = null,
} = {}) {
  const calls = [];
  const stageOrder = ['maint', 'relation', 'local'];
  let selectCount = 0;
  const state = {
    runId: null,
    bundleHash: null,
    policySetHash: null,
    decisionHash: null,
    approvalId: null,
    mode: null,
    commitProtocol: null,
    status: initialStatus,
    beforeGenerationJson: null,
    committedGenerationJson: null,
  };
  const connection = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('INSERT INTO crawler_automation_apply')) {
        state.runId = params?.[0];
        state.bundleHash = params?.[1];
        state.policySetHash = params?.[2];
        state.decisionHash = params?.[3];
        state.approvalId = params?.[4];
        state.mode = params?.[5];
        state.commitProtocol = params?.[7];
        state.status = 'STARTED';
        state.beforeGenerationJson = params?.[6];
        state.committedGenerationJson = null;
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('SELECT') && sql.includes('FROM crawler_automation_apply')) {
        selectCount += 1;
        const compensationSelect = 3 + (stageOrder.indexOf(failStage) * 2);
        if (compensationReadbackError && selectCount === compensationSelect) {
          throw new Error(`${failStage} compensation readback unavailable`);
        }
        const readStatus = recoveryStatusOverride && selectCount >= compensationSelect
          ? recoveryStatusOverride
          : state.status;
        return [[{
          runId: state.runId,
          bundleHash: state.bundleHash,
          policySetHash: state.policySetHash,
          decisionHash: state.decisionHash,
          approvalId: state.approvalId,
          mode: state.mode,
          commitProtocol: state.commitProtocol,
          status: readStatus,
          committed_generation_json: state.committedGenerationJson,
          before_generation_json: state.beforeGenerationJson,
        }]];
      }
      if (sql.includes('SET status = ?, committed_generation_json = ?')) {
        const markerStatus = params?.[0];
        if (markerStatus === `${failStage?.toUpperCase()}_COMMITTED`) {
          if (failureKind === 'marker-zero') return [{ affectedRows: 0 }];
          if (failureKind === 'marker-throw') throw new Error(`${failStage} marker outcome unknown`);
        }
        state.status = markerStatus;
        state.committedGenerationJson = params?.[1];
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('UPDATE')) {
        const result = [{ affectedRows: 1 }];
        const next = sql.match(/SET\s+status\s*=\s*'([A-Z_]+)'/i)?.[1];
        if (next) state.status = next;
        return result;
      }
      return [[]];
    },
  };

  connection.beginTransaction = async () => {};
  connection.commit = async () => {};
  connection.rollback = async () => {};
  return {
    connections: createCrossServerConnectionViews(connection),
    calls,
  };
}

test('executeStagedProtocol quarantines every apply or marker failure as an ambiguous recovery stage', async () => {
  for (const failStage of ['maint', 'relation', 'local']) {
    for (const failureKind of ['apply-throw', 'marker-zero', 'marker-throw']) {
      const { connections, calls } = makeAmbiguousStagedConnections({ failStage, failureKind });
      const executedStages = [];
      const compensationCalls = [];
      await assert.rejects(() => executeStagedProtocol({
        ...BASE_APPLY_ARGS,
        connections,
        applyWork: async ({ stage }) => {
          executedStages.push(stage);
          if (stage === failStage && failureKind === 'apply-throw') {
            throw new Error(`${stage} apply outcome unknown`);
          }
          return { [stage]: 1 };
        },
        compensateWork: async ({ committedStages, ambiguousStages }) => {
          compensationCalls.push({ committedStages, ambiguousStages });
          return { status: 'compensated' };
        },
      }), /outcome unknown|stage marker update/);

      const statusSql = calls
        .filter(({ sql }) => sql.includes('UPDATE crawler_automation_apply'))
        .map(({ sql }) => sql);
      assert.ok(
        statusSql.some((sql) => sql.includes("status = 'COMPENSATION_REQUIRED'")),
        `${failStage}/${failureKind} must persist recovery-required state`
      );
      assert.equal(compensationCalls.length, 0, `${failStage}/${failureKind} must not invoke compensation`);
      assert.ok(
        !statusSql.some((sql) => sql.includes("status = 'COMPENSATING'")),
        `${failStage}/${failureKind} must not claim COMPENSATING without an exact generation snapshot`
      );
      const nextStage = stageOrderAfter(failStage);
      if (nextStage) {
        assert.ok(!executedStages.includes(nextStage), `${failStage}/${failureKind} must stop downstream stages`);
      }
    }
  }
});

test('ambiguous staged outcomes are quarantined without automatic compensation', async () => {
  const { connections, calls } = makeAmbiguousStagedConnections({
    failStage: 'maint',
    failureKind: 'marker-throw',
  });
  let compensationCalls = 0;

  await assert.rejects(() => executeStagedProtocol({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async () => ({ maint: 1 }),
    compensateWork: async () => {
      compensationCalls += 1;
      return { status: 'compensated' };
    },
  }), /marker outcome unknown/);

  assert.equal(compensationCalls, 0);
  const statusSql = calls
    .filter(({ sql }) => sql.includes('UPDATE crawler_automation_apply'))
    .map(({ sql }) => sql);
  assert.ok(statusSql.some((sql) => sql.includes("status = 'COMPENSATION_REQUIRED'")));
  assert.ok(!statusSql.some((sql) => sql.includes("status = 'COMPENSATING'")));
});

test('ambiguous staged outcomes stay quarantined when recovery pre-read is unavailable', async () => {
  const { connections, calls } = makeAmbiguousStagedConnections({
    failStage: 'maint',
    failureKind: 'marker-throw',
    compensationReadbackError: true,
  });
  let compensationCalls = 0;

  await assert.rejects(() => executeStagedProtocol({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async () => ({ maint: 1 }),
    compensateWork: async () => {
      compensationCalls += 1;
      return { status: 'compensated' };
    },
  }), /marker outcome unknown/);

  assert.equal(compensationCalls, 0);
  const statusSql = calls
    .filter(({ sql }) => sql.includes('UPDATE crawler_automation_apply'))
    .map(({ sql }) => sql);
  assert.ok(!statusSql.some((sql) => sql.includes("status = 'COMPENSATING'")));
});

test('malformed staged preconditions remain recovery-required without clean failure or compensation', async () => {
  const calls = [];
  const state = {
    status: null,
    committedGenerationJson: 'not-json',
    beforeGenerationJson: null,
    runId: null,
    bundleHash: null,
  };
  let preconditionRead = false;
  const connection = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('INSERT INTO crawler_automation_apply')) {
        state.runId = params?.[0];
        state.bundleHash = params?.[1];
        state.beforeGenerationJson = params?.[6];
        state.status = 'STARTED';
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('SELECT') && sql.includes('FROM crawler_automation_apply')) {
        if (state.status === 'STARTED') preconditionRead = true;
        return [[{
          runId: state.runId,
          bundleHash: state.bundleHash,
          policySetHash: BASE_APPLY_ARGS.policySetHash,
          decisionHash: BASE_APPLY_ARGS.decisionHash,
          approvalId: BASE_APPLY_ARGS.approvalId,
          mode: BASE_APPLY_ARGS.mode,
          commitProtocol: 'cross_server_staged',
          status: state.status,
          committed_generation_json: state.committedGenerationJson,
          before_generation_json: state.beforeGenerationJson,
        }]];
      }
      if (sql.includes("status = 'COMPENSATION_REQUIRED'")) {
        state.status = 'COMPENSATION_REQUIRED';
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('UPDATE')) {
        state.status = sql.match(/SET\s+status\s*=\s*'([A-Z_]+)'/i)?.[1] ?? state.status;
        return [{ affectedRows: 1 }];
      }
      return [[]];
    },
  };
  connection.beginTransaction = async () => {};
  connection.commit = async () => {};
  connection.rollback = async () => {};

  let compensationCalls = 0;
  const caught = await captureThrown(() => executeStagedProtocol({
    ...BASE_APPLY_ARGS,
    connections: createCrossServerConnectionViews(connection),
    applyWork: async () => ({ maint: 1 }),
    compensateWork: async () => {
      compensationCalls += 1;
      return { status: 'compensated' };
    },
  }));

  assert.match(caught.message, /committed generation JSON is invalid/);
  assert.equal(preconditionRead, true);
  assert.equal(compensationCalls, 0);
  assert.equal(caught.requiresReadbackReconciliation, true);
  const statusSql = calls
    .filter(({ sql }) => sql.includes('UPDATE crawler_automation_apply'))
    .map(({ sql }) => sql);
  assert.ok(!statusSql.some((sql) => sql.includes("status = 'COMPENSATION_REQUIRED'")));
  assert.ok(!statusSql.some((sql) => sql.includes("status = 'FAILED'")));
  assert.ok(!statusSql.some((sql) => sql.includes("status = 'COMPENSATING'")));
});

test('staged recovery CAS uses the exact observed status after an interleaved stage marker', async () => {
  const calls = [];
  const state = {
    runId: null,
    bundleHash: null,
    policySetHash: null,
    decisionHash: null,
    approvalId: null,
    mode: null,
    commitProtocol: null,
    status: null,
    beforeGenerationJson: null,
    committedGenerationJson: null,
  };
  let selectCount = 0;
  const row = () => ({
    runId: state.runId,
    bundleHash: state.bundleHash,
    policySetHash: state.policySetHash,
    decisionHash: state.decisionHash,
    approvalId: state.approvalId,
    mode: state.mode,
    commitProtocol: state.commitProtocol,
    status: state.status,
    committed_generation_json: state.committedGenerationJson,
    before_generation_json: state.beforeGenerationJson,
  });
  const connection = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('INSERT INTO crawler_automation_apply')) {
        state.runId = params?.[0];
        state.bundleHash = params?.[1];
        state.policySetHash = params?.[2];
        state.decisionHash = params?.[3];
        state.approvalId = params?.[4];
        state.mode = params?.[5];
        state.commitProtocol = params?.[7];
        state.status = 'STARTED';
        state.beforeGenerationJson = params?.[6];
        state.committedGenerationJson = null;
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('SELECT') && sql.includes('FROM crawler_automation_apply')) {
        selectCount += 1;
        if (selectCount === 5) {
          // Return the status observed by the failing worker, then advance the
          // durable row as if a second worker committed the next stage.
          const observed = row();
          state.status = 'RELATION_COMMITTED';
          return [[observed]];
        }
        return [[row()]];
      }
      if (sql.includes('SET status = ?, committed_generation_json = ?')) {
        state.status = params?.[0];
        state.committedGenerationJson = params?.[1];
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("status = 'COMPENSATION_REQUIRED'")) {
        const broadCas = sql.includes('status IN');
        const casHit = broadCas && state.status === 'RELATION_COMMITTED';
        if (casHit) state.status = 'COMPENSATION_REQUIRED';
        return [{ affectedRows: casHit ? 1 : 0 }];
      }
      if (sql.includes("status = 'COMPENSATING'")) {
        const casHit = state.status === 'COMPENSATION_REQUIRED';
        if (casHit) state.status = 'COMPENSATING';
        return [{ affectedRows: casHit ? 1 : 0 }];
      }
      if (sql.includes('UPDATE')) return [{ affectedRows: 1 }];
      return [[]];
    },
  };
  connection.beginTransaction = async () => {};
  connection.commit = async () => {};
  connection.rollback = async () => {};

  let compensationCalls = 0;
  await assert.rejects(() => executeStagedProtocol({
    ...BASE_APPLY_ARGS,
    connections: createCrossServerConnectionViews(connection),
    applyWork: async ({ stage }) => {
      if (stage === 'relation') throw new Error('relation apply outcome unknown');
      return { [stage]: 1 };
    },
    compensateWork: async () => {
      compensationCalls += 1;
      return { status: 'compensated' };
    },
  }), /relation apply outcome unknown/);

  assert.equal(compensationCalls, 0);
  const recoverySql = calls.find(({ sql }) => sql.includes("status = 'COMPENSATION_REQUIRED'"));
  assert.ok(recoverySql, 'recovery status CAS must be attempted');
  assert.ok(!recoverySql.sql.includes('status IN'), 'recovery status CAS must use one observed status');
});

function stageOrderAfter(stage) {
  const order = ['maint', 'relation', 'local'];
  return order[order.indexOf(stage) + 1];
}

test('executeStagedProtocol validates every stage generation before writing its marker', async () => {
  const invalidValues = [
    undefined,
    null,
    '1',
    1.5,
    -1,
    0,
    Number.MAX_SAFE_INTEGER + 1,
  ];

  for (const invalidValue of invalidValues) {
    const connections = makeCrossServerConnections();
    const { calls } = connections;
    await assert.rejects(() => executeStagedProtocol({
      ...BASE_APPLY_ARGS,
      connections,
      applyWork: async ({ stage }) => ({ [stage]: invalidValue }),
    }), /stage generation/);
    assert.equal(
      callsInclude(calls, 'SET status = ?, committed_generation_json = ?'),
      false,
      `invalid generation ${String(invalidValue)} must not write a marker`
    );
  }
});

function callsInclude(calls, fragment) {
  return calls.some((entry) => {
    const sql = typeof entry === 'string' ? entry : entry.sql;
    return sql?.includes(fragment);
  });
}

test('executeSameServerTransaction does not roll back after an ambiguous COMMIT error', async () => {
  const calls = [];
  let commitAttempts = 0;
  const connections = makeSameServerConnections((sql) => {
    calls.push(sql);
    if (sql === 'COMMIT') {
      commitAttempts += 1;
      throw new Error('commit outcome unknown');
    }
    return [{ affectedRows: 1 }];
  });

  const compensationCalls = [];
  await assert.rejects(() => executeSameServerTransaction({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
    compensateWork: async ({ reason }) => {
      compensationCalls.push(reason);
      return { status: 'compensated' };
    },
  }), /commit outcome unknown/);

  assert.ok(commitAttempts >= 1, 'the initial COMMIT outcome must be observed before recovery metadata is attempted');
  assert.equal(calls.includes('ROLLBACK'), false, 'ambiguous COMMIT must not be blindly rolled back');
  assert.deepStrictEqual(compensationCalls, []);
});

test('requireCompensationSnapshot fails closed for unknown and ambiguous apply states', () => {
  const records = [
    { status: 'UNKNOWN', commit_protocol: 'cross_server_staged' },
    { status: 'STARTED', commit_protocol: 'cross_server_staged' },
    { status: 'FAILED', commit_protocol: 'cross_server_staged' },
    { status: 'UNKNOWN', commit_protocol: 'unknown_protocol' },
    { status: 'STARTED', commit_protocol: 'same_server_single_transaction' },
    { status: 'FAILED', commit_protocol: 'same_server_single_transaction' },
  ];
  for (const record of records) {
    assert.strictEqual(requireCompensationSnapshot(record), true, JSON.stringify(record));
  }
});

test('executeStagedProtocol uses a locked expected-status CAS for preconditions and markers', async () => {
  const connections = makeCrossServerConnections();
  const { calls } = connections;
  await executeStagedProtocol({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async ({ stage }) => ({ [stage]: 1 }),
  });

  const preconditionSql = calls
    .filter(({ sql }) => sql.includes('SELECT status'))
    .map(({ sql }) => sql);
  const markerEntries = calls.filter(({ sql }) => sql.includes('SET status = ?, committed_generation_json = ?'));
  const lockedPreconditions = preconditionSql.filter((sql) => sql.includes('FOR UPDATE'));
  assert.ok(lockedPreconditions.length >= 3);
  assert.ok(lockedPreconditions.every((sql) => sql.includes('FOR UPDATE')));
  assert.ok(markerEntries.length >= 3);
  assert.ok(markerEntries.every(({ sql }) => sql.includes('AND status = ?')));
});

test('executeStagedProtocol does not overwrite an interleaved recovery state after CAS loss', async () => {
  let stageMarkerSeen = false;
  let intentReadback = true;
  let beforeGenerationJson = null;
  const statuses = [];
  const connection = {
    query: async (sql, params) => {
      if (sql.includes('INSERT INTO crawler_automation_apply')) {
        beforeGenerationJson = params?.[6];
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('SELECT status') && sql.includes('FROM crawler_automation_apply')) {
        const status = intentReadback ? 'STARTED' : (stageMarkerSeen ? 'COMPENSATING' : 'STARTED');
        intentReadback = false;
        return [[{
          runId: BASE_APPLY_ARGS.runId,
          bundleHash: BASE_APPLY_ARGS.bundleHash,
          policySetHash: BASE_APPLY_ARGS.policySetHash,
          decisionHash: BASE_APPLY_ARGS.decisionHash,
          approvalId: BASE_APPLY_ARGS.approvalId,
          mode: BASE_APPLY_ARGS.mode,
          commitProtocol: 'cross_server_staged',
          status,
          committed_generation_json: status === 'STARTED' ? null : '{}',
          before_generation_json: beforeGenerationJson,
        }]];
      }
      if (sql.includes('SET status = ?, committed_generation_json = ?')) {
        stageMarkerSeen = true;
        return [{ affectedRows: 0 }];
      }
      if (sql.includes('UPDATE')) {
        statuses.push({ sql, params });
        return [{ affectedRows: 0 }];
      }
      return [[]];
    },
  };
  connection.beginTransaction = async () => {};
  connection.commit = async () => {};
  connection.rollback = async () => {};

  await assert.rejects(() => executeStagedProtocol({
    ...BASE_APPLY_ARGS,
    connections: createCrossServerConnectionViews(connection),
    applyWork: async () => ({ maint: 1 }),
  }), /stage marker|recovery/i);

  assert.ok(!statuses.some(({ sql }) => sql.includes("status = 'FAILED'")));
  assert.ok(!statuses.some(({ sql }) => sql.includes("status = 'COMPENSATION_REQUIRED'")));
});

test('executeStagedProtocol fails closed when the apply intent insert does not affect exactly one row', async () => {
  const connections = makeCrossServerConnections((sql) => {
    if (sql.includes('INSERT INTO crawler_automation_apply')) return [{ affectedRows: 0 }];
    return undefined;
  });
  let verifierCalled = false;

  await assert.rejects(() => executeStagedProtocol({
    ...BASE_APPLY_ARGS,
    connections,
    preCommitVerifyWork: async () => {
      verifierCalled = true;
      return { relationIntegrity: true };
    },
    applyWork: async () => ({ maint: 1 }),
  }), /apply intent.*exactly one/i);
  assert.equal(verifierCalled, false);
});

test('executeSameServerTransaction fails closed when DB_COMMITTED status persistence is not exact-one', async () => {
  const connections = makeSameServerConnections((sql, params) => {
    if (sql.includes('SET status = ?, committed_generation_json = ?') && params?.[0] === 'DB_COMMITTED') {
      return [{ affectedRows: 0 }];
    }
    return [{ affectedRows: 1 }];
  });

  await assert.rejects(() => executeSameServerTransaction({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
  }), /DB_COMMITTED.*exactly one/i);
});

test('executeSameServerTransaction fails closed when final COMMITTED status persistence is not exact-one', async () => {
  const connections = makeSameServerConnections((sql) => {
    if (sql.includes("status = 'COMMITTED'")) return [{ affectedRows: 0 }];
    return [{ affectedRows: 1 }];
  });

  await assert.rejects(() => executeSameServerTransaction({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
  }), /COMMITTED.*exactly one/i);
});

test('executeStagedProtocol fails closed when a committed stage marker readback mismatches', async () => {
  let selectCount = 0;
  let beforeGenerationJson = null;
  const connection = {
      query: async (sql, params) => {
      if (sql.includes('INSERT INTO crawler_automation_apply')) {
        beforeGenerationJson = params?.[6];
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('SELECT status') && sql.includes('FROM crawler_automation_apply')) {
        selectCount += 1;
        return [[{
          runId: BASE_APPLY_ARGS.runId,
          bundleHash: BASE_APPLY_ARGS.bundleHash,
          policySetHash: BASE_APPLY_ARGS.policySetHash,
          decisionHash: BASE_APPLY_ARGS.decisionHash,
          approvalId: BASE_APPLY_ARGS.approvalId,
          mode: BASE_APPLY_ARGS.mode,
          commitProtocol: 'cross_server_staged',
          status: 'STARTED',
          committed_generation_json: null,
          before_generation_json: beforeGenerationJson,
        }]];
      }
      if (sql.includes('SET status = ?, committed_generation_json = ?')) return [{ affectedRows: 1 }];
      if (sql.includes('UPDATE')) return [{ affectedRows: 1 }];
      return [[]];
    },
  };
  connection.beginTransaction = async () => {};
  connection.commit = async () => {};
  connection.rollback = async () => {};

  await assert.rejects(() => executeStagedProtocol({
    ...BASE_APPLY_ARGS,
    connections: createCrossServerConnectionViews(connection),
    applyWork: async ({ stage }) => ({ [stage]: 1 }),
  }), /stage marker.*readback/i);
  assert.ok(selectCount >= 2);
});

test('executeStagedProtocol requires an explicit coordinator transaction for FOR UPDATE stage claims', async () => {
  const connections = makeCrossServerConnections(undefined, { withCoordinatorTransaction: false });
  let applyCalls = 0;
  await assert.rejects(() => executeStagedProtocol({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async () => {
      applyCalls += 1;
      return { maint: 1 };
    },
  }), /coordinator.*transaction|beginTransaction|connection\[method\]/i);
  assert.equal(applyCalls, 0, 'the protocol must not apply before acquiring a durable coordinator lock');
});

test('executeStagedProtocol holds the coordinator lock from precondition through remote apply and marker', async () => {
  const events = [];
  let locked = false;
  let status = null;
  let committedGenerationJson = null;
  let runId = null;
  let bundleHash = null;
  let intentReadback = true;
  let markerReadback = false;
  let committedStageCount = 0;
  const coordinator = {
    beginTransaction: async () => {
      assert.equal(locked, false);
      locked = true;
      events.push('begin');
    },
    commit: async () => {
      assert.equal(locked, true);
      events.push('commit');
      committedStageCount += 1;
      locked = false;
    },
    rollback: async () => {
      events.push('rollback');
      locked = false;
    },
    query: async (sql, params) => {
      if (sql.includes('INSERT INTO crawler_automation_apply')) {
        runId = params?.[0];
        bundleHash = params?.[1];
        status = 'STARTED';
        events.push('intent');
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('SELECT') && sql.includes('FROM crawler_automation_apply')) {
        if (intentReadback) {
          assert.equal(locked, true, 'intent readback must execute inside the coordinator transaction');
          intentReadback = false;
        } else if (markerReadback) {
          assert.equal(locked, true, 'stage marker readback must execute inside the coordinator transaction');
          markerReadback = false;
        } else {
          assert.equal(locked, true, 'FOR UPDATE must execute inside the coordinator transaction');
          events.push('precondition-read');
        }
        return [[{
          runId,
          bundleHash,
          policySetHash: BASE_APPLY_ARGS.policySetHash,
          decisionHash: BASE_APPLY_ARGS.decisionHash,
          approvalId: BASE_APPLY_ARGS.approvalId,
          mode: BASE_APPLY_ARGS.mode,
          commitProtocol: 'cross_server_staged',
          status,
          committed_generation_json: committedGenerationJson,
          before_generation_json: JSON.stringify(BASE_APPLY_ARGS.beforeGenerations),
        }]];
      }
      if (sql.includes('SET status = ?, committed_generation_json = ?')) {
        assert.equal(locked, true, 'stage marker must be written while the claim lock is held');
        status = params?.[0];
        committedGenerationJson = params?.[1];
        markerReadback = true;
        events.push(`marker:${status}`);
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('UPDATE')) {
        status = sql.match(/SET\s+status\s*=\s*'([A-Z_]+)'/i)?.[1] ?? status;
        return [{ affectedRows: 1 }];
      }
      return [[]];
    },
  };
  const remote = { query: async () => [[]] };
  const remoteViews = createCrossServerConnectionViews(remote);

  await executeStagedProtocol({
    ...BASE_APPLY_ARGS,
    connections: { maint: remoteViews.maint, relation: remoteViews.relation, local: coordinator },
    applyWork: async ({ stage }) => {
      assert.equal(locked, true, `${stage} apply must run while coordinator lock is held`);
      events.push(`apply:${stage}`);
      return { [stage]: 1 };
    },
  });

  assert.deepStrictEqual(events.filter((event) => event !== 'intent'), [
    'begin', 'commit',
    'begin', 'precondition-read', 'apply:maint', 'marker:MAINT_COMMITTED', 'commit',
    'begin', 'precondition-read', 'apply:relation', 'marker:RELATION_COMMITTED', 'commit',
    'begin', 'precondition-read', 'apply:local', 'marker:LOCAL_COMMITTED', 'commit',
    'begin', 'precondition-read', 'commit',
  ]);
});

test('executeStagedProtocol never issues FOR UPDATE outside a coordinator transaction', async () => {
  const connections = makeCrossServerConnections();
  const coordinator = connections.local;
  const query = coordinator.query.bind(coordinator);
  const violations = [];
  let transactionActive = false;

  coordinator.beginTransaction = async () => { transactionActive = true; };
  coordinator.commit = async () => { transactionActive = false; };
  coordinator.rollback = async () => { transactionActive = false; };
  coordinator.query = async (sql, params) => {
    if (sql.includes('FOR UPDATE') && !transactionActive) violations.push(sql);
    return query(sql, params);
  };

  await executeStagedProtocol({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async ({ stage }) => ({ [stage]: 1 }),
  });

  assert.deepStrictEqual(violations, []);
});

test('staged callbacks receive a frozen before-generation snapshot', async () => {
  const connections = makeCrossServerConnections();
  const snapshots = [];

  await executeStagedProtocol({
    ...BASE_APPLY_ARGS,
    connections,
    preCommitVerifyWork: async ({ beforeGenerations }) => {
      snapshots.push({ phase: 'pre-commit', frozen: Object.isFrozen(beforeGenerations) });
      return { relationIntegrity: true };
    },
    applyWork: async ({ stage, beforeGenerations }) => {
      snapshots.push({ phase: stage, frozen: Object.isFrozen(beforeGenerations) });
      return { [stage]: beforeGenerations[stage] + 1 };
    },
  });

  assert.deepStrictEqual(snapshots, [
    { phase: 'pre-commit', frozen: true },
    { phase: 'maint', frozen: true },
    { phase: 'relation', frozen: true },
    { phase: 'local', frozen: true },
  ]);
});

test('apply readback verifies the complete immutable identity tuple', async () => {
  const connections = makeCrossServerConnections();
  const result = await executeStagedProtocol({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async ({ stage }) => ({ [stage]: 1 }),
  });
  assert.equal(result.status, 'committed');
  const readbackSql = connections.calls
    .filter(({ sql }) => sql.includes('SELECT') && sql.includes('FROM crawler_automation_apply'))
    .map(({ sql }) => sql)
    .join('\n');
  for (const field of ['policy_set_hash', 'decision_hash', 'approval_id', 'mode', 'commit_protocol']) {
    assert.match(readbackSql, new RegExp(field), `${field} must be read back`);
  }
});

test('apply readback rejects an identity mismatch even when run and bundle match', async () => {
  const connections = makeSameServerConnections((sql) => {
    if (sql.includes('SELECT') && sql.includes('FROM crawler_automation_apply')) {
      return [[{
        runId: BASE_APPLY_ARGS.runId,
        bundleHash: BASE_APPLY_ARGS.bundleHash,
        policySetHash: 'sha256:' + 'd'.repeat(64),
        decisionHash: BASE_APPLY_ARGS.decisionHash,
        approvalId: BASE_APPLY_ARGS.approvalId,
        mode: BASE_APPLY_ARGS.mode,
        commitProtocol: 'same_server_single_transaction',
        status: 'STARTED',
        committed_generation_json: null,
        before_generation_json: JSON.stringify(BASE_APPLY_ARGS.beforeGenerations),
      }]];
    }
    return undefined;
  });
  await assert.rejects(() => executeSameServerTransaction({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
  }), /identity|policy.*readback/i);
});

test('same-server post-commit compensation retains known generations and rejects drift', async () => {
  let status = null;
  let committedGenerationJson = null;
  let runId = null;
  let bundleHash = null;
  let drift = false;
  let compensationCalls = 0;
  const connection = {
    query: async (sql, params) => {
      if (sql.includes('INSERT INTO crawler_automation_apply')) {
        runId = params?.[0];
        bundleHash = params?.[1];
        status = 'STARTED';
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('SELECT') && sql.includes('FROM crawler_automation_apply')) {
        const generations = drift
          ? JSON.stringify({ maint: 2, relation: 1, local: 1 })
          : committedGenerationJson;
        return [[{
          runId,
          bundleHash,
          policySetHash: BASE_APPLY_ARGS.policySetHash,
          decisionHash: BASE_APPLY_ARGS.decisionHash,
          approvalId: BASE_APPLY_ARGS.approvalId,
          mode: BASE_APPLY_ARGS.mode,
          commitProtocol: 'same_server_single_transaction',
          status,
          committed_generation_json: generations,
          before_generation_json: JSON.stringify(BASE_APPLY_ARGS.beforeGenerations),
        }]];
      }
      if (sql.includes('SET status = ?, committed_generation_json = ?')) {
        status = params?.[0];
        committedGenerationJson = params?.[1];
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("SET status = 'POST_VERIFY_FAILED'")) {
        status = 'POST_VERIFY_FAILED';
        drift = true;
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('UPDATE')) {
        const next = sql.match(/SET\s+status\s*=\s*'([A-Z_]+)'/i)?.[1];
        if (next) status = next;
        return [{ affectedRows: 1 }];
      }
      return [[]];
    },
  };
  connection.beginTransaction = async () => {};
  connection.commit = async () => {};
  connection.rollback = async () => {};

  await assert.rejects(() => executeSameServerTransaction({
    ...BASE_APPLY_ARGS,
    connections: { maint: connection, relation: connection, local: connection },
    applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
    postCommitVerifyWork: async () => ({ apiSamples: false, cacheVisible: true }),
    compensateWork: async () => {
      compensationCalls += 1;
      return { status: 'compensated' };
    },
  }), /generation.*mismatch|drift|post-commit verification failed/i);
  assert.equal(compensationCalls, 0, 'generation drift must block automatic compensation');
});

test('same-server final COMMITTED readback failure never downgrades or compensates a committed row', async () => {
  let status = null;
  let committedGenerationJson = null;
  let runId = null;
  let bundleHash = null;
  let throwFinalReadback = false;
  let compensationCalls = 0;
  const statusWrites = [];
  const connection = {
    query: async (sql, params) => {
      if (sql.includes('INSERT INTO crawler_automation_apply')) {
        runId = params?.[0];
        bundleHash = params?.[1];
        status = 'STARTED';
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('SELECT') && sql.includes('FROM crawler_automation_apply')) {
        if (throwFinalReadback) {
          throwFinalReadback = false;
          throw new Error('final COMMITTED readback acknowledgement lost');
        }
        return [[{
          runId,
          bundleHash,
          policySetHash: BASE_APPLY_ARGS.policySetHash,
          decisionHash: BASE_APPLY_ARGS.decisionHash,
          approvalId: BASE_APPLY_ARGS.approvalId,
          mode: BASE_APPLY_ARGS.mode,
          commitProtocol: 'same_server_single_transaction',
          status,
          committed_generation_json: committedGenerationJson,
          before_generation_json: JSON.stringify(BASE_APPLY_ARGS.beforeGenerations),
        }]];
      }
      if (sql.includes('SET status = ?, committed_generation_json = ?')) {
        status = params?.[0];
        committedGenerationJson = params?.[1];
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("SET status = 'COMMITTED'")) {
        status = 'COMMITTED';
        statusWrites.push('COMMITTED');
        throwFinalReadback = true;
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('UPDATE')) {
        const next = sql.match(/SET\s+status\s*=\s*'([A-Z_]+)'/i)?.[1];
        if (next) {
          status = next;
          statusWrites.push(next);
        }
        return [{ affectedRows: 1 }];
      }
      if (sql === 'START TRANSACTION' || sql === 'COMMIT' || sql === 'ROLLBACK') return [{}];
      return [[]];
    },
  };
  connection.beginTransaction = async () => {};
  connection.commit = async () => {};
  connection.rollback = async () => {};

  await assert.rejects(() => executeSameServerTransaction({
    ...BASE_APPLY_ARGS,
    connections: { maint: connection, relation: connection, local: connection },
    applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
    compensateWork: async () => {
      compensationCalls += 1;
      return { status: 'compensated' };
    },
  }), /COMMITTED readback|acknowledgement|readback/i);
  assert.equal(compensationCalls, 0);
  assert.deepStrictEqual(statusWrites, ['COMMITTED']);
});

test('same-server recovery does not include COMMITTED in a failed-final-status CAS', async () => {
  const recoveryParams = [];
  const connections = makeSameServerConnections((sql, params) => {
    if (sql.includes("SET status = 'COMMITTED'")) return [{ affectedRows: 0 }];
    if (sql.includes("SET status = 'COMPENSATION_REQUIRED'")) {
      recoveryParams.push(params);
      return [{ affectedRows: 0 }];
    }
    return undefined;
  });

  await assert.rejects(() => executeSameServerTransaction({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
  }), /COMMITTED.*exactly one/i);

  assert.equal(recoveryParams.length, 1);
  assert.equal(recoveryParams[0].includes('COMMITTED'), false);
});

test('same-server status-write acknowledgement loss quarantines without compensation', async () => {
  const statusSql = [];
  let compensationCalls = 0;
  const connections = makeSameServerConnections((sql) => {
    if (sql.includes('UPDATE crawler_automation_apply')) statusSql.push(sql);
    if (sql.includes("status = 'POST_VERIFY_FAILED'")) {
      throw new Error('POST_VERIFY_FAILED acknowledgement lost');
    }
    return undefined;
  });

  const caught = await captureThrown(() => executeSameServerTransaction({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
    postCommitVerifyWork: async () => ({ apiSamples: false, cacheVisible: true }),
    compensateWork: async () => {
      compensationCalls += 1;
      return { status: 'compensated' };
    },
  }));

  assert.match(caught.message, /post-commit verification failed/);
  assert.equal(compensationCalls, 0, 'unknown status-write outcome must not invoke compensation');
  assert.equal(caught.requiresReadbackReconciliation, true);
  assert.ok(
    statusSql.some((sql) => sql.includes("status = 'COMPENSATION_REQUIRED'")),
    'a known DB_COMMITTED readback must be durably quarantined'
  );
  assert.ok(
    !statusSql.some((sql) => sql.includes("status = 'COMPENSATING'")),
    'unknown status-write outcome must remain quarantined'
  );
});

test('same-server recovery never rewrites an unknown observed status', async () => {
  let selectCount = 0;
  const statusSql = [];
  let compensationCalls = 0;
  const connections = makeSameServerConnections((sql) => {
    if (sql.includes('SELECT') && sql.includes('FROM crawler_automation_apply')) {
      selectCount += 1;
      if (selectCount >= 3) {
        return [[{
          runId: BASE_APPLY_ARGS.runId,
          bundleHash: BASE_APPLY_ARGS.bundleHash,
          policySetHash: BASE_APPLY_ARGS.policySetHash,
          decisionHash: BASE_APPLY_ARGS.decisionHash,
          approvalId: BASE_APPLY_ARGS.approvalId,
          mode: BASE_APPLY_ARGS.mode,
          commitProtocol: 'same_server_single_transaction',
          status: 'UNKNOWN',
          committed_generation_json: null,
          before_generation_json: JSON.stringify(BASE_APPLY_ARGS.beforeGenerations),
        }]];
      }
    }
    if (sql.includes('UPDATE crawler_automation_apply')) statusSql.push(sql);
    if (sql.includes("status = 'POST_VERIFY_FAILED'")) {
      throw new Error('POST_VERIFY_FAILED acknowledgement lost');
    }
    return undefined;
  });

  const caught = await captureThrown(() => executeSameServerTransaction({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
    postCommitVerifyWork: async () => ({ apiSamples: false, cacheVisible: true }),
    compensateWork: async () => {
      compensationCalls += 1;
      return { status: 'compensated' };
    },
  }));

  assert.match(caught.message, /post-commit verification failed/);
  assert.equal(compensationCalls, 0);
  assert.equal(caught.requiresReadbackReconciliation, true);
  assert.ok(
    !statusSql.some((sql) => sql.includes("status = 'COMPENSATION_REQUIRED'")),
    'unknown observed status must remain untouched'
  );
});

test('recovery identity/readback errors are surfaced instead of swallowed', async () => {
  let selectCount = 0;
  let compensationCalls = 0;
  const connections = makeSameServerConnections((sql) => {
    if (sql.includes('SELECT') && sql.includes('FROM crawler_automation_apply')) {
      selectCount += 1;
      // Intent and DB_COMMITTED marker readbacks are valid. Once the
      // post-verify status write is known-unknown, make both recovery reads
      // carry a mismatched policy identity.
      if (selectCount >= 3) {
        return [[{
          runId: BASE_APPLY_ARGS.runId,
          bundleHash: BASE_APPLY_ARGS.bundleHash,
          policySetHash: 'sha256:' + 'd'.repeat(64),
          decisionHash: BASE_APPLY_ARGS.decisionHash,
          approvalId: BASE_APPLY_ARGS.approvalId,
          mode: BASE_APPLY_ARGS.mode,
          commitProtocol: 'same_server_single_transaction',
          status: 'DB_COMMITTED',
          committed_generation_json: JSON.stringify({ maint: 1, relation: 1, local: 1 }),
          before_generation_json: JSON.stringify(BASE_APPLY_ARGS.beforeGenerations),
        }]];
      }
    }
    if (sql.includes("status = 'POST_VERIFY_FAILED'")) {
      throw new Error('POST_VERIFY_FAILED acknowledgement lost');
    }
    return undefined;
  });

  const caught = await captureThrown(() => executeSameServerTransaction({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
    postCommitVerifyWork: async () => ({ apiSamples: false, cacheVisible: true }),
    compensateWork: async () => {
      compensationCalls += 1;
      return { status: 'compensated' };
    },
  }));

  assert.equal(compensationCalls, 0);
  assert.equal(caught.requiresReadbackReconciliation, true);
  assert.ok(
    (caught.suppressed ?? []).some((error) => /identity readback mismatch/.test(error?.message ?? '')),
    'identity mismatch must remain observable on the original operation error'
  );
});

test('recovery transitions never use a broad status array in their CAS', async () => {
  const { connections, calls } = makeAmbiguousStagedConnections({
    failStage: 'relation',
    failureKind: 'apply-throw',
  });

  await assert.rejects(() => executeStagedProtocol({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async ({ stage }) => {
      if (stage === 'relation') throw new Error('relation outcome unknown');
      return { [stage]: 1 };
    },
  }), /relation outcome unknown/);

  const recoverySql = calls
    .filter(({ sql }) => sql.includes('COMPENSATION_REQUIRED') || sql.includes('COMPENSATING'))
    .map(({ sql }) => sql);
  assert.ok(recoverySql.length > 0, 'a recovery quarantine transition must be attempted');
  assert.ok(
    recoverySql.every((sql) => !sql.includes('status IN')),
    'recovery CAS must use the one status observed immediately before the transition'
  );
});

test('staged final-status CAS loss quarantines without compensation', async () => {
  const statusSql = [];
  let compensationCalls = 0;
  const connections = makeCrossServerConnections((sql) => {
    if (sql.includes('UPDATE crawler_automation_apply')) statusSql.push(sql);
    if (sql.includes("status = 'COMMITTED'")) return [{ affectedRows: 0 }];
    return undefined;
  });

  const caught = await captureThrown(() => executeStagedProtocol({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async ({ stage }) => ({ [stage]: 1 }),
    compensateWork: async () => {
      compensationCalls += 1;
      return { status: 'compensated' };
    },
  }));

  assert.match(caught.message, /COMMITTED.*exactly one/i);
  assert.equal(compensationCalls, 0, 'a lost final-status CAS must not invoke compensation');
  assert.equal(caught.requiresReadbackReconciliation, true);
  assert.ok(statusSql.some((sql) => sql.includes("status = 'COMPENSATION_REQUIRED'")));
  assert.ok(!statusSql.some((sql) => sql.includes("status = 'COMPENSATING'")));
});

test('staged recovery refuses unknown or failed observed states', async () => {
  for (const recoveryStatus of ['UNKNOWN', 'FAILED']) {
    const { connections, calls } = makeAmbiguousStagedConnections({
      failStage: 'relation',
      failureKind: 'apply-throw',
      recoveryStatusOverride: recoveryStatus,
    });

    const caught = await captureThrown(() => executeStagedProtocol({
      ...BASE_APPLY_ARGS,
      connections,
      applyWork: async ({ stage }) => {
        if (stage === 'relation') throw new Error('relation outcome unknown');
        return { [stage]: 1 };
      },
    }));

    assert.match(caught.message, /relation outcome unknown/);
    assert.equal(caught.requiresReadbackReconciliation, true);
    const recoverySql = calls
      .filter(({ sql }) => sql.includes('COMPENSATION_REQUIRED') || sql.includes('COMPENSATING'))
      .map(({ sql }) => sql);
    assert.deepEqual(recoverySql, [], `${recoveryStatus} must not be rewritten by stale recovery`);
  }
});

test('same-server ambiguous COMMIT refuses to downgrade a STARTED marker', async () => {
  let selectCount = 0;
  const statusSql = [];
  const connections = makeSameServerConnections((sql) => {
    if (sql.includes('SELECT') && sql.includes('FROM crawler_automation_apply')) {
      selectCount += 1;
      if (selectCount >= 3) {
        return [[{
          runId: BASE_APPLY_ARGS.runId,
          bundleHash: BASE_APPLY_ARGS.bundleHash,
          policySetHash: BASE_APPLY_ARGS.policySetHash,
          decisionHash: BASE_APPLY_ARGS.decisionHash,
          approvalId: BASE_APPLY_ARGS.approvalId,
          mode: BASE_APPLY_ARGS.mode,
          commitProtocol: 'same_server_single_transaction',
          status: 'STARTED',
          committed_generation_json: null,
          before_generation_json: JSON.stringify(BASE_APPLY_ARGS.beforeGenerations),
        }]];
      }
    }
    if (sql.includes('UPDATE crawler_automation_apply')) statusSql.push(sql);
    if (sql === 'COMMIT') throw new Error('COMMIT outcome unknown');
    return undefined;
  });

  const caught = await captureThrown(() => executeSameServerTransaction({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
  }));

  assert.match(caught.message, /COMMIT outcome unknown/);
  assert.equal(caught.requiresReadbackReconciliation, true);
  assert.ok(!statusSql.some((sql) => sql.includes("status = 'COMPENSATION_REQUIRED'")));
});

test('protocol-owned acquisition rejects a cross-server physical alias before any query or apply', async () => {
  const physicalConnection = makeSameServerConnections().local;
  physicalConnection.threadId = 701;
  physicalConnection.release = async () => {};
  const queries = [];
  const query = physicalConnection.query.bind(physicalConnection);
  physicalConnection.query = async (sql, params) => {
    queries.push({ sql, params });
    return query(sql, params);
  };
  let applyCalls = 0;
  const aliasManifest = {
    ...CROSS_SERVER_MANIFEST,
    databases: {
      ...CROSS_SERVER_MANIFEST.databases,
      relation: {
        ...CROSS_SERVER_MANIFEST.databases.relation,
        serverUuid: CROSS_SERVER_MANIFEST.databases.maint.serverUuid,
      },
    },
  };
  attachTestBorrowedConnectionIdentities(aliasManifest, {
    maint: physicalConnection,
    relation: physicalConnection,
    local: physicalConnection,
  });
  const connectionConfig = createTestConnectionConfig(aliasManifest, {
    maint: physicalConnection,
    relation: physicalConnection,
    local: physicalConnection,
  });

  await assert.rejects(() => executeStagedProtocolDirect({
    ...BASE_APPLY_ARGS,
    manifest: aliasManifest,
    connectionConfig,
    applyWork: async () => {
      applyCalls += 1;
      return { maint: 1 };
    },
  }), /cross-server.*physical.*connection|distinct.*connection/i);

  assert.deepStrictEqual(queries, []);
  assert.equal(applyCalls, 0);
});

test('cross-server allows equal connection IDs when server identities differ', async () => {
  const connections = makeCrossServerConnections();
  for (const role of ['maint', 'relation', 'local']) {
    connections[role].threadId = 901;
  }

  const result = await executeStagedProtocol({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async ({ stage }) => ({ [stage]: 1 }),
  });

  assert.equal(result.status, 'committed');
  assert.deepStrictEqual(result.appliedGenerations, { maint: 1, relation: 1, local: 1 });
});

test('public executor rejects consistently forged structural pool wrappers', async () => {
  const backingConnection = makeSameServerConnections().local;
  const wrapper = {
    threadId: 811,
    release: async () => {},
    query: async (sql, params) => {
      if (sql.includes('@@server_uuid') && sql.includes('CONNECTION_ID()')) {
        return [[{
          serverUuid: SAME_SERVER_MANIFEST.databases.local.serverUuid,
          port: SAME_SERVER_MANIFEST.databases.local.port,
          databaseName: SAME_SERVER_MANIFEST.databases.local.name,
          connectionId: 811,
        }]];
      }
      return backingConnection.query(sql, params);
    },
    beginTransaction: backingConnection.beginTransaction.bind(backingConnection),
    commit: backingConnection.commit.bind(backingConnection),
    rollback: backingConnection.rollback.bind(backingConnection),
  };
  const structuralPool = { getConnection: async () => wrapper };

  await assert.rejects(() => executeSameServerTransactionDirect({
    manifest: SAME_SERVER_MANIFEST,
    ...BASE_APPLY_ARGS,
    pools: {
      maint: structuralPool,
      relation: structuralPool,
      local: structuralPool,
    },
    applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
  }), /caller-supplied mysql pools/i);
});

test('protocol-owned acquisition releases an already-borrowed handle when a later role fails', async () => {
  const connections = makeCrossServerConnections();
  attachTestBorrowedConnectionIdentities(CROSS_SERVER_MANIFEST, connections);
  const connection = connections.maint;
  let releases = 0;
  connection.release = async () => { releases += 1; };
  const connectionConfig = createTestConnectionConfig(CROSS_SERVER_MANIFEST, connections);
  const relationKey = testPoolKey(connectionConfig.relation);
  TEST_PROTOCOL_POOL_ACQUISITION_FAILURES.set(relationKey, new Error('relation acquisition failed'));
  try {
    await assert.rejects(() => executeStagedProtocolDirect({
      manifest: CROSS_SERVER_MANIFEST,
      ...BASE_APPLY_ARGS,
      connectionConfig,
      applyWork: async ({ stage }) => ({ [stage]: 1 }),
    }), /relation.*acquisition failed/i);
  } finally {
    TEST_PROTOCOL_POOL_ACQUISITION_FAILURES.delete(relationKey);
  }

  assert.equal(releases, 1, 'partial acquisition must return the already borrowed maint handle');
});

test('protocol-owned borrowed connections are released after every execution', async () => {
  const connections = makeSameServerConnections();
  attachTestBorrowedConnectionIdentities(SAME_SERVER_MANIFEST, connections);
  const connection = connections.local;
  connection.threadId = 831;
  const identity = connection[TEST_BORROWED_CONNECTION];
  const query = connection.query.bind(connection);
  connection.query = async (sql, params) => {
    if (sql.includes('@@server_uuid') && sql.includes('CONNECTION_ID()')) {
      return [[{ ...identity, connectionId: connection.threadId }]];
    }
    return query(sql, params);
  };
  let releases = 0;
  connection.release = async () => { releases += 1; };
  const connectionConfig = createTestConnectionConfig(SAME_SERVER_MANIFEST, connections);
  let applyCalls = 0;

  await executeSameServerTransactionDirect({
    manifest: SAME_SERVER_MANIFEST,
    ...BASE_APPLY_ARGS,
    connectionConfig,
    applyWork: async () => {
      applyCalls += 1;
      return { maint: 1, relation: 1, local: 1 };
    },
  });

  await executeSameServerTransactionDirect({
    manifest: SAME_SERVER_MANIFEST,
    ...BASE_APPLY_ARGS,
    connectionConfig,
    applyWork: async () => {
      applyCalls += 1;
      return { maint: 1, relation: 1, local: 1 };
    },
  });

  assert.equal(releases, 2, 'each private one-shot capability must release its shared handle exactly once');
  assert.equal(applyCalls, 2, 'each public execution receives a fresh private capability');
});

test('executeSameServerTransaction rejects a caller-minted attestation for a method-shaped pool proxy', async () => {
  const backingConnection = makeSameServerConnections().local;
  const poolProxy = {
    threadId: 711,
    query: backingConnection.query.bind(backingConnection),
    beginTransaction: backingConnection.beginTransaction.bind(backingConnection),
    commit: backingConnection.commit.bind(backingConnection),
    rollback: backingConnection.rollback.bind(backingConnection),
  };
  const connections = { maint: poolProxy, relation: poolProxy, local: poolProxy };
  const borrowedConnections = Object.freeze({
    maint: Object.freeze({ connection: poolProxy, role: 'maint', threadId: 711 }),
    relation: Object.freeze({ connection: poolProxy, role: 'relation', threadId: 711 }),
    local: Object.freeze({ connection: poolProxy, role: 'local', threadId: 711 }),
  });
  let applyCalls = 0;

  assert.equal(typeof protocolModule.attestBorrowedConnection, 'undefined');

  await assert.rejects(() => executeSameServerTransactionDirect({
    manifest: SAME_SERVER_MANIFEST,
    ...BASE_APPLY_ARGS,
    connections,
    borrowedConnections,
    applyWork: async () => {
      applyCalls += 1;
      return { maint: 1, relation: 1, local: 1 };
    },
  }), /caller-supplied mysql pools, connections, and borrowed capabilities/i);

  assert.equal(applyCalls, 0);
});

test('same-server verifies identity before begin and rejects post-begin thread drift before intent', async () => {
  const connections = makeSameServerConnections();
  const connection = connections.local;
  connection.threadId = 851;
  connection.release = async () => {};
  const initialThreadId = connection.threadId;
  const events = [];
  const query = connection.query.bind(connection);
  connection.query = async (sql, params) => {
    if (sql.includes('@@server_uuid') && sql.includes('CONNECTION_ID()')) {
      events.push('identity');
      return [[{
        serverUuid: SAME_SERVER_MANIFEST.databases.local.serverUuid,
        port: SAME_SERVER_MANIFEST.databases.local.port,
        databaseName: SAME_SERVER_MANIFEST.databases.local.name,
        connectionId: initialThreadId,
      }]];
    }
    if (sql.includes('INSERT INTO crawler_automation_apply')) events.push('intent');
    return query(sql, params);
  };
  connection.beginTransaction = async () => {
    events.push('begin');
    connection.threadId = initialThreadId + 1;
  };
  connection.rollback = async () => { events.push('rollback'); };
  let applyCalls = 0;
  const connectionConfig = createTestConnectionConfig(SAME_SERVER_MANIFEST, connections);

  await assert.rejects(() => executeSameServerTransactionDirect({
    manifest: SAME_SERVER_MANIFEST,
    ...BASE_APPLY_ARGS,
    connectionConfig,
    applyWork: async () => {
      applyCalls += 1;
      return { maint: 1, relation: 1, local: 1 };
    },
  }), /physical threadId drift|borrowed connection.*drift/i);

  assert.deepEqual(events.slice(0, 2), ['identity', 'begin']);
  assert.equal(events.includes('intent'), false);
  assert.equal(applyCalls, 0);
});

test('executeStagedProtocol rejects borrowed-connection server UUID and database drift before intent or apply', async () => {
  const scenarios = [
    {
      label: 'server UUID',
      observedIdentity: (descriptor, role, connectionId) => ({
        serverUuid: role === 'relation' ? 'unexpected-server-uuid' : descriptor.serverUuid,
        port: descriptor.port,
        databaseName: descriptor.name,
        connectionId,
      }),
      expectedError: /borrowed connection.*server UUID|server UUID.*mismatch|serverUuid.*mismatch/i,
    },
    {
      label: 'database',
      observedIdentity: (descriptor, role, connectionId) => ({
        serverUuid: descriptor.serverUuid,
        port: descriptor.port,
        databaseName: role === 'relation' ? 'terria_v1_wrong_relation' : descriptor.name,
        connectionId,
      }),
      expectedError: /borrowed connection.*database|database.*mismatch/i,
    },
  ];

  for (const scenario of scenarios) {
    const connectionIds = { maint: 401, relation: 402, local: 403 };
    const connections = makeCrossServerConnections((sql, _params, role) => {
      if (sql.includes('@@server_uuid')) {
        const descriptor = CROSS_SERVER_MANIFEST.databases[role];
        return [[scenario.observedIdentity(descriptor, role, connectionIds[role])]];
      }
      return undefined;
    });
    for (const role of ['maint', 'relation', 'local']) {
      connections[role].threadId = connectionIds[role];
      connections[role].release = async () => {};
    }
    let applyCalls = 0;
    const connectionConfig = createTestConnectionConfig(CROSS_SERVER_MANIFEST, connections);

    await assert.rejects(() => executeStagedProtocolDirect({
      manifest: CROSS_SERVER_MANIFEST,
      ...BASE_APPLY_ARGS,
      connectionConfig,
      applyWork: async ({ stage }) => {
        applyCalls += 1;
        return { [stage]: 1 };
      },
    }), scenario.expectedError, `${scenario.label} drift must fail closed`);

    assert.equal(
      connections.calls.some(({ sql }) => sql.includes('INSERT INTO crawler_automation_apply')),
      false,
      `${scenario.label} drift must reject before the apply intent`
    );
    assert.equal(applyCalls, 0, `${scenario.label} drift must reject before applyWork`);
  }
});

test('executeSameServerTransaction rejects a transaction-method pool proxy without a borrowed-connection attestation', async () => {
  const transactionQueries = [];
  let applyCalls = 0;
  const poolProxy = {
    threadId: 711,
    query: async (sql) => {
      transactionQueries.push(sql);
      if (/^(START TRANSACTION|COMMIT|ROLLBACK)$/.test(sql)) {
        throw new Error('pool proxy must never receive transaction control SQL');
      }
      return [[]];
    },
    beginTransaction: async () => poolProxy.query('START TRANSACTION'),
    commit: async () => poolProxy.query('COMMIT'),
    rollback: async () => poolProxy.query('ROLLBACK'),
  };

  await assert.rejects(() => executeSameServerTransactionDirect({
    manifest: SAME_SERVER_MANIFEST,
    ...BASE_APPLY_ARGS,
    connections: { maint: poolProxy, relation: poolProxy, local: poolProxy },
    applyWork: async () => {
      applyCalls += 1;
      return { maint: 1, relation: 1, local: 1 };
    },
  }), /caller-supplied mysql pools, connections, and borrowed capabilities/i);

  assert.deepStrictEqual(transactionQueries, []);
  assert.equal(applyCalls, 0);
});

test('executeSameServerTransaction does not roll back when beginTransaction fails before any query or apply', async () => {
  const connections = makeSameServerConnections();
  const coordinator = connections.local;
  const queries = [];
  const query = coordinator.query.bind(coordinator);
  coordinator.query = async (sql, params) => {
    queries.push({ sql, params });
    return query(sql, params);
  };
  let beginCalls = 0;
  let rollbackCalls = 0;
  let applyCalls = 0;
  coordinator.beginTransaction = async () => {
    beginCalls += 1;
    throw new Error('begin transaction unavailable');
  };
  coordinator.rollback = async () => {
    rollbackCalls += 1;
  };

  await assert.rejects(() => executeSameServerTransaction({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async () => {
      applyCalls += 1;
      return { maint: 1, relation: 1, local: 1 };
    },
  }), /begin transaction unavailable/);

  assert.equal(beginCalls, 1);
  assert.deepStrictEqual(queries, []);
  assert.equal(applyCalls, 0);
  assert.equal(rollbackCalls, 0);
});

test('post-commit frozen and primitive errors retain reconciliation metadata when recovery begin fails', async () => {
  for (const originalError of [
    Object.freeze(new Error('frozen post-commit verification failure')),
    'primitive post-commit verification failure',
  ]) {
    const connections = makeSameServerConnections();
    const coordinator = connections.local;
    const beginTransaction = coordinator.beginTransaction.bind(coordinator);
    let beginCalls = 0;
    coordinator.beginTransaction = async () => {
      beginCalls += 1;
      if (beginCalls === 2) {
        throw new Error('POST_VERIFY_FAILED recovery begin unavailable');
      }
      return beginTransaction();
    };

    const caught = await captureThrown(() => executeSameServerTransaction({
      ...BASE_APPLY_ARGS,
      connections,
      applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
      postCommitVerifyWork: async () => { throw originalError; },
    }));

    assert.equal(caught.requiresReadbackReconciliation, true);
    assert.equal(caught.cause, originalError);
    assert.match(caught.message, /post-commit verification failure/);
    assert.ok(beginCalls >= 2, 'the failed status transaction must be attempted before recovery is quarantined');
  }
});

test('COMPENSATION_FAILED exact-one failure propagates a readback-reconciliation blocker to the original error', async () => {
  const connections = makeSameServerConnections((sql) => {
    if (sql.includes("status = 'COMPENSATION_FAILED'")) return [{ affectedRows: 2 }];
    return undefined;
  });

  const caught = await captureThrown(() => executeSameServerTransaction({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
    postCommitVerifyWork: async () => ({ apiSamples: false, cacheVisible: true }),
    compensateWork: async () => {
      throw new Error('compensation callback failed');
    },
  }));

  assert.match(caught.message, /post-commit verification failed/);
  assert.equal(caught.requiresReadbackReconciliation, true);
  assert.ok(
    (caught.suppressed ?? []).some((error) => /compensation callback failed/.test(error?.message ?? '')),
    'the original compensation failure must remain observable'
  );
});

test('frozen and primitive post-commit errors retain a top-level reconciliation marker after COMPENSATION_FAILED ambiguity', async () => {
  for (const originalError of [
    Object.freeze(new Error('frozen post-commit verification failure')),
    'primitive post-commit verification failure',
  ]) {
    let terminalWrites = 0;
    const connections = makeSameServerConnections((sql) => {
      if (sql.includes("status = 'COMPENSATION_FAILED'")) {
        terminalWrites += 1;
        return [{ affectedRows: 2 }];
      }
      return undefined;
    });

    const caught = await captureThrown(() => executeSameServerTransaction({
      ...BASE_APPLY_ARGS,
      connections,
      applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
      postCommitVerifyWork: async () => { throw originalError; },
      compensateWork: async () => { throw new Error('compensation callback failed'); },
    }));

    assert.equal(caught.requiresReadbackReconciliation, true);
    assert.equal(caught.cause, originalError);
    assert.equal(terminalWrites, 1);
  }
});

test('ambiguous COMPENSATED and COMPENSATION_FAILED terminal transitions always propagate a reconciliation blocker', async () => {
  const terminalStatuses = ['COMPENSATED', 'COMPENSATION_FAILED'];
  const faults = ['affected-rows', 'throw', 'readback'];

  for (const terminalStatus of terminalStatuses) {
    for (const fault of faults) {
      let terminalWrites = 0;
      let readbackFaultPending = fault === 'readback';
      const connections = makeSameServerConnections((sql) => {
        if (sql.includes(`status = '${terminalStatus}'`)) {
          terminalWrites += 1;
          if (fault === 'affected-rows') return [{ affectedRows: 2 }];
          if (fault === 'throw') throw new Error(`${terminalStatus} terminal write acknowledgement lost`);
        }
        if (readbackFaultPending
            && terminalWrites === 1
            && sql.includes('SELECT')
            && sql.includes('FROM crawler_automation_apply')) {
          readbackFaultPending = false;
          return new Error(`${terminalStatus} terminal readback acknowledgement lost`);
        }
        return undefined;
      });

      const caught = await captureThrown(() => executeSameServerTransaction({
        ...BASE_APPLY_ARGS,
        connections,
        applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
        postCommitVerifyWork: async () => ({ apiSamples: false, cacheVisible: true }),
        compensateWork: async () => {
          if (terminalStatus === 'COMPENSATED') return { status: 'compensated' };
          throw new Error('compensation callback failed');
        },
      }));

      assert.match(caught.message, /post-commit verification failed/);
      assert.equal(
        caught.requiresReadbackReconciliation,
        true,
        `${terminalStatus} ${fault} ambiguity must remain a top-level reconciliation blocker`
      );
      assert.equal(terminalWrites, 1, `${terminalStatus} ${fault} must attempt the requested terminal transition once`);
    }
  }
});

test('same-server intent and final transitions use locked readbacks inside active coordinator transactions', async () => {
  const connections = makeSameServerConnections();
  const coordinator = connections.local;
  const query = coordinator.query.bind(coordinator);
  const events = [];
  let active = false;
  let transactionEpoch = 0;

  coordinator.beginTransaction = async () => {
    assert.equal(active, false, 'coordinator transactions must not nest');
    active = true;
    transactionEpoch += 1;
    events.push({ type: 'begin', transactionEpoch });
  };
  coordinator.commit = async () => {
    assert.equal(active, true, 'commit requires the active coordinator transaction');
    events.push({ type: 'commit', transactionEpoch });
    active = false;
  };
  coordinator.rollback = async () => {
    events.push({ type: 'rollback', transactionEpoch });
    active = false;
  };
  coordinator.query = async (sql, params) => {
    if (sql.includes('FROM crawler_automation_apply')) {
      events.push({
        type: 'read',
        transactionEpoch,
        active,
        locked: sql.includes('FOR UPDATE'),
        sql,
      });
    }
    if (sql.includes('INSERT INTO crawler_automation_apply') || sql.includes('UPDATE crawler_automation_apply')) {
      events.push({ type: 'write', transactionEpoch, active, sql });
    }
    return query(sql, params);
  };

  await executeSameServerTransaction({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
  });

  const reads = events.filter((event) => event.type === 'read');
  assert.ok(reads.length >= 3, 'intent, marker, and final transitions must each read back their row');
  assert.ok(reads.every((event) => event.active && event.locked));
  const writes = events.filter((event) => event.type === 'write');
  assert.ok(writes.every((event) => event.active));
  for (const write of writes) {
    const readback = reads.find((event) => event.transactionEpoch === write.transactionEpoch);
    assert.ok(readback, 'each state mutation must have a same-transaction locked readback');
  }
});

test('same-server recovery transitions use locked readbacks inside active coordinator transactions', async () => {
  const connections = makeSameServerConnections();
  const coordinator = connections.local;
  const query = coordinator.query.bind(coordinator);
  const reads = [];
  const writes = [];
  let active = false;

  coordinator.beginTransaction = async () => { active = true; };
  coordinator.commit = async () => { active = false; };
  coordinator.rollback = async () => { active = false; };
  coordinator.query = async (sql, params) => {
    if (sql.includes('FROM crawler_automation_apply')) {
      reads.push({ active, locked: sql.includes('FOR UPDATE'), sql });
    }
    if (sql.includes('INSERT INTO crawler_automation_apply') || sql.includes('UPDATE crawler_automation_apply')) {
      writes.push({ active, sql });
    }
    return query(sql, params);
  };

  const caught = await captureThrown(() => executeSameServerTransaction({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
    postCommitVerifyWork: async () => ({ apiSamples: false, cacheVisible: true }),
    compensateWork: async () => ({ status: 'compensated' }),
  }));

  assert.match(caught.message, /post-commit verification failed/);
  assert.ok(reads.length >= 6, 'the post-verify and compensation transitions must read their state');
  assert.ok(reads.every((entry) => entry.active && entry.locked));
  assert.ok(writes.every((entry) => entry.active));
});

test('staged intent and final transitions use locked readbacks inside active coordinator transactions', async () => {
  const connections = makeCrossServerConnections();
  const coordinator = connections.local;
  const query = coordinator.query.bind(coordinator);
  const reads = [];
  const writes = [];
  let active = false;

  coordinator.beginTransaction = async () => { active = true; };
  coordinator.commit = async () => { active = false; };
  coordinator.rollback = async () => { active = false; };
  coordinator.query = async (sql, params) => {
    if (sql.includes('FROM crawler_automation_apply')) {
      reads.push({ active, locked: sql.includes('FOR UPDATE'), sql });
    }
    if (sql.includes('INSERT INTO crawler_automation_apply') || sql.includes('UPDATE crawler_automation_apply')) {
      writes.push({ active, sql });
    }
    return query(sql, params);
  };

  await executeStagedProtocol({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async ({ stage }) => ({ [stage]: 1 }),
  });

  assert.ok(reads.length >= 5, 'intent, three stage markers, and final status must all read back');
  assert.ok(reads.every((entry) => entry.active && entry.locked));
  assert.ok(writes.every((entry) => entry.active));
});

test('staged failed transition uses a locked readback inside an active coordinator transaction', async () => {
  const connections = makeCrossServerConnections();
  const coordinator = connections.local;
  const query = coordinator.query.bind(coordinator);
  const reads = [];
  const writes = [];
  let active = false;

  coordinator.beginTransaction = async () => { active = true; };
  coordinator.commit = async () => { active = false; };
  coordinator.rollback = async () => { active = false; };
  coordinator.query = async (sql, params) => {
    if (sql.includes('FROM crawler_automation_apply')) {
      reads.push({ active, locked: sql.includes('FOR UPDATE'), sql });
    }
    if (sql.includes('INSERT INTO crawler_automation_apply') || sql.includes('UPDATE crawler_automation_apply')) {
      writes.push({ active, sql });
    }
    return query(sql, params);
  };

  await assert.rejects(() => executeStagedProtocol({
    ...BASE_APPLY_ARGS,
    connections,
    preCommitVerifyWork: async () => ({ relationIntegrity: false }),
    applyWork: async () => {
      throw new Error('apply must not run after a failed pre-commit verifier');
    },
  }), /pre-commit verification failed/);

  assert.ok(reads.length >= 2, 'intent and FAILED transitions must each read their row');
  assert.ok(reads.every((entry) => entry.active && entry.locked));
  assert.ok(writes.every((entry) => entry.active));
});

test('staged recovery transitions use locked readbacks inside active coordinator transactions', async () => {
  const connections = makeCrossServerConnections();
  const coordinator = connections.local;
  const query = coordinator.query.bind(coordinator);
  const reads = [];
  const writes = [];
  let active = false;

  coordinator.beginTransaction = async () => { active = true; };
  coordinator.commit = async () => { active = false; };
  coordinator.rollback = async () => { active = false; };
  coordinator.query = async (sql, params) => {
    if (sql.includes('FROM crawler_automation_apply')) {
      reads.push({ active, locked: sql.includes('FOR UPDATE'), sql });
    }
    if (sql.includes('INSERT INTO crawler_automation_apply') || sql.includes('UPDATE crawler_automation_apply')) {
      writes.push({ active, sql });
    }
    return query(sql, params);
  };

  const caught = await captureThrown(() => executeStagedProtocol({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async ({ stage }) => ({ [stage]: 1 }),
    postCommitVerifyWork: async () => ({ relationIntegrity: true, apiSamples: false, cacheVisible: true }),
    compensateWork: async () => ({ status: 'compensated' }),
  }));

  assert.match(caught.message, /post-commit verification failed/);
  assert.ok(reads.length >= 8, 'stage and recovery transitions must read their locked state');
  assert.ok(reads.every((entry) => entry.active && entry.locked));
  assert.ok(writes.every((entry) => entry.active));
});

test('coordinator status-transaction commit uncertainty is a top-level reconciliation blocker', async () => {
  let commits = 0;
  const connections = makeSameServerConnections((sql) => {
    if (sql === 'COMMIT') {
      commits += 1;
      if (commits === 2) throw new Error('POST_VERIFY_FAILED coordinator COMMIT acknowledgement lost');
    }
    return undefined;
  });

  const caught = await captureThrown(() => executeSameServerTransaction({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
    postCommitVerifyWork: async () => ({ apiSamples: false, cacheVisible: true }),
  }));

  assert.match(caught.message, /post-commit verification failed/);
  assert.ok(
    (caught.suppressed ?? []).some((error) => /POST_VERIFY_FAILED coordinator COMMIT acknowledgement lost/.test(error?.message ?? '')),
    'the uncertain status-transaction COMMIT must remain observable on the preserved original error'
  );
  assert.equal(caught.requiresReadbackReconciliation, true);
});

test('public executors reject genuine mysql2 wrappers around an attacker-owned EventEmitter core', async () => {
  const attackerConnection = makeSameServerConnections().local;
  attackerConnection.threadId = 1301;
  attackerConnection.release = async () => {};
  const attackerPool = createTrustedTestPool(attackerConnection);

  assert.ok(attackerPool instanceof MYSQL.PromisePool);
  const attackerBorrowedConnection = await attackerPool.getConnection();
  assert.ok(attackerBorrowedConnection instanceof MYSQL.PromisePoolConnection);
  assert.equal(typeof protocolModule.acquireBorrowedConnectionSet, 'undefined');
  await assert.rejects(() => executeSameServerTransactionDirect({
    manifest: SAME_SERVER_MANIFEST,
    ...BASE_APPLY_ARGS,
    pools: { maint: attackerPool, relation: attackerPool, local: attackerPool },
    borrowedConnectionSet: attackerBorrowedConnection,
    applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
  }), /caller-supplied mysql pools/i);
  await attackerBorrowedConnection.release();
  await attackerPool.end();
});

test('canonical connectionConfig rejects streams and factory hooks before pool construction', async () => {
  for (const [field, value] of [
    ['stream', new EventEmitter()],
    ['factory', () => createTrustedTestPool(makeSameServerConnections().local)],
  ]) {
    const connections = makeSameServerConnections();
    attachTestBorrowedConnectionIdentities(SAME_SERVER_MANIFEST, connections);
    const connectionConfig = createTestConnectionConfig(SAME_SERVER_MANIFEST, connections);
    connectionConfig.local[field] = value;

    await assert.rejects(() => executeSameServerTransactionDirect({
      manifest: SAME_SERVER_MANIFEST,
      ...BASE_APPLY_ARGS,
      connectionConfig,
      applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
    }), /connectionConfig contains unsupported field/i);
  }
});

test('an invalid post-acquisition executor path releases its borrowed handle', async () => {
  const connections = makeSameServerConnections();
  const connection = connections.local;
  connection.threadId = 1302;
  let releases = 0;
  connection.release = async () => { releases += 1; };
  connection.beginTransaction = async () => { throw new Error('begin transaction unavailable'); };
  attachTestBorrowedConnectionIdentities(SAME_SERVER_MANIFEST, connections);
  const connectionConfig = createTestConnectionConfig(SAME_SERVER_MANIFEST, connections);

  await assert.rejects(() => executeSameServerTransactionDirect({
    ...BASE_APPLY_ARGS,
    manifest: SAME_SERVER_MANIFEST,
    connectionConfig,
    applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
  }), /begin transaction unavailable/i);

  assert.equal(releases, 1, 'a rejected invocation must not leave its acquired handle borrowed');
});

test('same-server rejects post-begin SQL identity drift even when public threadId is unchanged', async () => {
  const connections = makeSameServerConnections();
  const connection = connections.local;
  connection.threadId = 1303;
  connection.release = async () => {};
  const events = [];
  let identityReads = 0;
  const query = connection.query.bind(connection);
  connection.query = async (sql, params) => {
    if (sql.includes('@@server_uuid') && sql.includes('CONNECTION_ID()')) {
      identityReads += 1;
      return [[{
        serverUuid: identityReads === 1
          ? SAME_SERVER_MANIFEST.databases.local.serverUuid
          : 'unexpected-server-after-begin',
        port: SAME_SERVER_MANIFEST.databases.local.port,
        databaseName: SAME_SERVER_MANIFEST.databases.local.name,
        connectionId: connection.threadId,
      }]];
    }
    if (sql.includes('INSERT INTO crawler_automation_apply')) events.push('intent');
    return query(sql, params);
  };
  connection.beginTransaction = async () => { events.push('begin'); };
  connection.rollback = async () => { events.push('rollback'); };
  const connectionConfig = createTestConnectionConfig(SAME_SERVER_MANIFEST, connections);

  await assert.rejects(() => executeSameServerTransactionDirect({
    manifest: SAME_SERVER_MANIFEST,
    ...BASE_APPLY_ARGS,
    connectionConfig,
    applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
  }), /server UUID mismatch|borrowed connection.*identity/i);

  assert.equal(identityReads, 2, 'identity must be read before and immediately after beginTransaction');
  assert.deepEqual(events, ['begin', 'rollback']);
});

test('same-server rechecks every SQL identity field after beginTransaction', async () => {
  const drifts = [
    {
      label: 'server UUID',
      mutate: (identity) => { identity.serverUuid = 'unexpected-server-after-begin'; },
      expectedError: /server UUID mismatch/i,
    },
    {
      label: 'port',
      mutate: (identity) => { identity.port = 3307; },
      expectedError: /port mismatch/i,
    },
    {
      label: 'database',
      mutate: (identity) => { identity.databaseName = 'terria_v1_unexpected'; },
      expectedError: /database mismatch/i,
    },
    {
      label: 'connection ID',
      mutate: (identity) => { identity.connectionId = 999999; },
      expectedError: /physical connection identity mismatch/i,
    },
  ];

  for (const drift of drifts) {
    const connections = makeSameServerConnections();
    const connection = connections.local;
    connection.threadId = 1310;
    connection.release = async () => {};
    let identityReads = 0;
    let intentWrites = 0;
    const query = connection.query.bind(connection);
    connection.query = async (sql, params) => {
      if (sql.includes('@@server_uuid') && sql.includes('CONNECTION_ID()')) {
        identityReads += 1;
        const identity = {
          serverUuid: SAME_SERVER_MANIFEST.databases.local.serverUuid,
          port: SAME_SERVER_MANIFEST.databases.local.port,
          databaseName: SAME_SERVER_MANIFEST.databases.local.name,
          connectionId: connection.threadId,
        };
        if (identityReads === 2) drift.mutate(identity);
        return [[identity]];
      }
      if (sql.includes('INSERT INTO crawler_automation_apply')) intentWrites += 1;
      return query(sql, params);
    };
    connection.beginTransaction = async () => {};
    connection.rollback = async () => {};
    const connectionConfig = createTestConnectionConfig(SAME_SERVER_MANIFEST, connections);

    await assert.rejects(() => executeSameServerTransactionDirect({
      manifest: SAME_SERVER_MANIFEST,
      ...BASE_APPLY_ARGS,
      connectionConfig,
      applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
    }), drift.expectedError, `${drift.label} must reject before intent`);

    assert.equal(identityReads, 2, `${drift.label} must be re-read after beginTransaction`);
    assert.equal(intentWrites, 0, `${drift.label} must reject before intent`);
  }
});

test('recovery-status begin failures preserve frozen and primitive root causes', async () => {
  for (const originalError of [
    Object.freeze(new Error('frozen recovery root cause')),
    'primitive recovery root cause',
  ]) {
    const connections = makeSameServerConnections();
    const coordinator = connections.local;
    const beginTransaction = coordinator.beginTransaction.bind(coordinator);
    let beginCalls = 0;
    coordinator.beginTransaction = async () => {
      beginCalls += 1;
      if (beginCalls === 4) throw new Error('COMPENSATING recovery begin unavailable');
      return beginTransaction();
    };

    const caught = await captureThrown(() => executeSameServerTransaction({
      ...BASE_APPLY_ARGS,
      connections,
      applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
      postCommitVerifyWork: async () => { throw originalError; },
      compensateWork: async () => ({ status: 'compensated' }),
    }));

    assert.equal(caught.cause, originalError);
    assert.equal(caught.requiresReadbackReconciliation, true);
    assert.ok(
      (caught.suppressed ?? []).some((error) => /COMPENSATING recovery begin unavailable/.test(error?.message ?? '')),
      'the failed COMPENSATING status transaction must remain suppressed on the original error'
    );
  }
});

test('COMPENSATION_REQUIRED recovery begin failures preserve the original staged error', async () => {
  const originalError = Object.freeze(new Error('frozen staged recovery root cause'));
  const connections = makeCrossServerConnections();
  const coordinator = connections.local;
  const beginTransaction = coordinator.beginTransaction.bind(coordinator);
  let beginCalls = 0;
  coordinator.beginTransaction = async () => {
    beginCalls += 1;
    if (beginCalls === 5) throw new Error('COMPENSATION_REQUIRED recovery begin unavailable');
    return beginTransaction();
  };

  const caught = await captureThrown(() => executeStagedProtocol({
    ...BASE_APPLY_ARGS,
    connections,
    applyWork: async ({ stage }) => {
      if (stage === 'relation') throw originalError;
      return { [stage]: 1 };
    },
  }));

  assert.equal(caught.cause, originalError);
  assert.equal(caught.requiresReadbackReconciliation, true);
  assert.ok(
    (caught.suppressed ?? []).some((error) => /COMPENSATION_REQUIRED recovery begin unavailable/.test(error?.message ?? '')),
    'the failed COMPENSATION_REQUIRED status transaction must remain suppressed on the original error'
  );
});

test('recovery-status commit failures preserve the original normalized root cause', async () => {
  const sameServerRootCause = Object.freeze(new Error('frozen same-server commit recovery root cause'));
  const sameServerConnections = makeSameServerConnections();
  const sameServerCoordinator = sameServerConnections.local;
  const sameServerCommit = sameServerCoordinator.commit.bind(sameServerCoordinator);
  let sameServerCommits = 0;
  sameServerCoordinator.commit = async () => {
    sameServerCommits += 1;
    if (sameServerCommits === 4) throw new Error('COMPENSATING recovery commit unavailable');
    return sameServerCommit();
  };

  const sameServerCaught = await captureThrown(() => executeSameServerTransaction({
    ...BASE_APPLY_ARGS,
    connections: sameServerConnections,
    applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
    postCommitVerifyWork: async () => { throw sameServerRootCause; },
    compensateWork: async () => ({ status: 'compensated' }),
  }));

  assert.equal(sameServerCaught.cause, sameServerRootCause);
  assert.equal(sameServerCaught.requiresReadbackReconciliation, true);
  assert.ok(
    (sameServerCaught.suppressed ?? []).some((error) => /COMPENSATING recovery commit unavailable/.test(error?.message ?? ''))
  );

  const stagedRootCause = 'primitive staged commit recovery root cause';
  const stagedConnections = makeCrossServerConnections();
  const stagedCoordinator = stagedConnections.local;
  const stagedCommit = stagedCoordinator.commit.bind(stagedCoordinator);
  let stagedCommits = 0;
  stagedCoordinator.commit = async () => {
    stagedCommits += 1;
    if (stagedCommits === 4) throw new Error('COMPENSATION_REQUIRED recovery commit unavailable');
    return stagedCommit();
  };

  const stagedCaught = await captureThrown(() => executeStagedProtocol({
    ...BASE_APPLY_ARGS,
    connections: stagedConnections,
    applyWork: async ({ stage }) => {
      if (stage === 'relation') throw stagedRootCause;
      return { [stage]: 1 };
    },
  }));

  assert.equal(stagedCaught.cause, stagedRootCause);
  assert.equal(stagedCaught.requiresReadbackReconciliation, true);
  assert.ok(
    (stagedCaught.suppressed ?? []).some((error) => /COMPENSATION_REQUIRED recovery commit unavailable/.test(error?.message ?? ''))
  );
});

test('terminal recovery-status commit failures preserve frozen and primitive root causes', async () => {
  const scenarios = [
    {
      status: 'COMPENSATED',
      originalError: Object.freeze(new Error('frozen COMPENSATED root cause')),
      compensateWork: async () => ({ status: 'compensated' }),
    },
    {
      status: 'COMPENSATION_FAILED',
      originalError: 'primitive COMPENSATION_FAILED root cause',
      compensateWork: async () => { throw new Error('compensation callback failed'); },
    },
  ];

  for (const scenario of scenarios) {
    const connections = makeSameServerConnections();
    const coordinator = connections.local;
    const commit = coordinator.commit.bind(coordinator);
    let commits = 0;
    coordinator.commit = async () => {
      commits += 1;
      if (commits === 5) throw new Error(`${scenario.status} recovery commit unavailable`);
      return commit();
    };

    const caught = await captureThrown(() => executeSameServerTransaction({
      ...BASE_APPLY_ARGS,
      connections,
      applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
      postCommitVerifyWork: async () => { throw scenario.originalError; },
      compensateWork: scenario.compensateWork,
    }));

    const nestedSuppressed = (caught.suppressed ?? []).flatMap((error) => [
      error,
      ...(error?.suppressed ?? []),
    ]);
    assert.equal(caught.cause, scenario.originalError);
    assert.equal(caught.requiresReadbackReconciliation, true);
    assert.ok(
      nestedSuppressed.some((error) => new RegExp(`${scenario.status} recovery commit unavailable`).test(error?.message ?? ''))
    );
  }
});

function cloneSameServerManifest() {
  return {
    ...SAME_SERVER_MANIFEST,
    serverIdentity: { ...SAME_SERVER_MANIFEST.serverIdentity },
    databases: Object.fromEntries(Object.entries(SAME_SERVER_MANIFEST.databases).map(([role, descriptor]) => [
      role,
      { ...descriptor },
    ])),
  };
}

test('ambiguous same-server business COMMIT normalizes frozen and primitive errors before recovery', async () => {
  for (const originalError of [
    Object.freeze(new Error('frozen ambiguous business COMMIT failure')),
    'primitive ambiguous business COMMIT failure',
  ]) {
    const connections = makeSameServerConnections();
    const coordinator = connections.local;
    const rollback = coordinator.rollback.bind(coordinator);
    const recoveryError = new Error('ambiguous COMMIT recovery begin unavailable');
    let beginCalls = 0;
    let commitCalls = 0;
    let rollbackCalls = 0;

    protocolTransactionFailure = ({ method }) => {
      if (method === 'beginTransaction') {
        beginCalls += 1;
        if (beginCalls === 2) return recoveryError;
      }
      if (method === 'commit') {
        commitCalls += 1;
        if (commitCalls === 1) return originalError;
      }
      return undefined;
    };
    coordinator.rollback = async () => {
      rollbackCalls += 1;
      return rollback();
    };

    try {
      const caught = await captureThrown(() => executeSameServerTransaction({
        ...BASE_APPLY_ARGS,
        connections,
        applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
      }));

      assert.notEqual(caught, originalError);
      assert.equal(caught.cause, originalError);
      assert.equal(caught.requiresReadbackReconciliation, true);
      assert.ok(
        (caught.suppressed ?? []).some((error) => /ambiguous COMMIT recovery begin unavailable/.test(error?.message ?? ''))
      );
      assert.equal(beginCalls, 2);
      assert.equal(rollbackCalls, 0, 'an ambiguous business COMMIT must not trigger a blind rollback');
    } finally {
      resetProtocolPoolConstructionObservation();
    }
  }
});

test('same-server final-status begin failures normalize frozen and primitive errors with readback evidence', async () => {
  for (const originalError of [
    Object.freeze(new Error('frozen final-status begin failure')),
    'primitive final-status begin failure',
  ]) {
    const connections = makeSameServerConnections();
    const coordinator = connections.local;
    const rollback = coordinator.rollback.bind(coordinator);
    const query = coordinator.query.bind(coordinator);
    const reconciliationReadbackError = new Error('final-status reconciliation readback unavailable');
    let beginCalls = 0;
    let rollbackCalls = 0;
    let finalStatusBeginFailed = false;
    let reconciliationReadbackFailed = false;

    protocolTransactionFailure = ({ method }) => {
      if (method !== 'beginTransaction') return undefined;
      beginCalls += 1;
      if (beginCalls === 2) {
        finalStatusBeginFailed = true;
        return originalError;
      }
      return undefined;
    };
    coordinator.rollback = async () => {
      rollbackCalls += 1;
      return rollback();
    };
    coordinator.query = async (sql, params) => {
      if (finalStatusBeginFailed
          && sql.includes('FROM crawler_automation_apply')
          && sql.includes('FOR UPDATE')) {
        reconciliationReadbackFailed = true;
        throw reconciliationReadbackError;
      }
      return query(sql, params);
    };

    try {
      const caught = await captureThrown(() => executeSameServerTransaction({
        ...BASE_APPLY_ARGS,
        connections,
        applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
      }));

      assert.notEqual(caught, originalError);
      assert.equal(caught.cause, originalError);
      assert.equal(caught.requiresReadbackReconciliation, true);
      assert.equal(reconciliationReadbackFailed, true);
      assert.ok(
        (caught.suppressed ?? []).some((error) => /final-status reconciliation readback unavailable/.test(error?.message ?? ''))
      );
      assert.equal(beginCalls, 3);
      assert.equal(rollbackCalls, 1, 'only the attempted reconciliation transaction may roll back');
    } finally {
      resetProtocolPoolConstructionObservation();
    }
  }
});

test('input boundary rejects accessor-backed and descriptor-hostile inputs before pool or query side effects', async () => {
  const scenarios = [
    {
      label: 'manifest accessor',
      mutate({ manifest, countGetterRead }) {
        Object.defineProperty(manifest.serverIdentity, 'host', {
          configurable: true,
          enumerable: true,
          get() {
            countGetterRead();
            return 'db-host';
          },
        });
        return manifest;
      },
    },
    {
      label: 'connectionConfig accessor',
      mutate({ connectionConfig, countGetterRead }) {
        Object.defineProperty(connectionConfig.local, 'database', {
          configurable: true,
          enumerable: true,
          get() {
            countGetterRead();
            return 'terria_v1_local';
          },
        });
        return undefined;
      },
    },
    {
      label: 'descriptor-hostile manifest proxy',
      mutate({ manifest }) {
        return new Proxy(manifest, {
          getOwnPropertyDescriptor() {
            throw new Error('hostile manifest descriptor proxy');
          },
        });
      },
    },
  ];

  for (const scenario of scenarios) {
    const connections = makeSameServerConnections();
    const connection = connections.local;
    let queryCalls = 0;
    const query = connection.query.bind(connection);
    connection.query = async (sql, params) => {
      queryCalls += 1;
      return query(sql, params);
    };
    const manifest = cloneSameServerManifest();
    attachTestBorrowedConnectionIdentities(manifest, connections);
    const connectionConfig = createTestConnectionConfig(manifest, connections);
    let getterReads = 0;
    const suppliedManifest = scenario.mutate({
      manifest,
      connectionConfig,
      countGetterRead: () => { getterReads += 1; },
    }) ?? manifest;

    resetProtocolPoolConstructionObservation();
    try {
      await assert.rejects(() => executeSameServerTransactionDirect({
        manifest: suppliedManifest,
        ...BASE_APPLY_ARGS,
        connectionConfig,
        applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
      }), /data-only|accessor|descriptor|snapshot/i, scenario.label);

      assert.equal(protocolPoolConstructionCount, 0, `${scenario.label} must not construct a pool`);
      assert.equal(queryCalls, 0, `${scenario.label} must not query a borrowed connection`);
      assert.equal(getterReads, 0, `${scenario.label} must not invoke an accessor`);
    } finally {
      resetProtocolPoolConstructionObservation();
    }
  }
});

test('input boundary snapshots valid manifest and connectionConfig before later caller mutation', async () => {
  const connections = makeSameServerConnections();
  const manifest = cloneSameServerManifest();
  attachTestBorrowedConnectionIdentities(manifest, connections);
  const connectionConfig = createTestConnectionConfig(manifest, connections);
  let queryCalls = 0;
  const connection = connections.local;
  const query = connection.query.bind(connection);
  connection.query = async (sql, params) => {
    queryCalls += 1;
    return query(sql, params);
  };

  resetProtocolPoolConstructionObservation();
  protocolPoolConstructionHook = () => {
    manifest.databases.local.serverUuid = 'uuid-mutated-after-validation';
    manifest.databases.local.port = 3307;
    manifest.databases.local.name = 'terria_v1_mutated';
    connectionConfig.local.host = 'mutated-host';
    connectionConfig.local.port = 3307;
    connectionConfig.local.database = 'terria_v1_mutated';
  };
  try {
    const result = await executeSameServerTransactionDirect({
      manifest,
      ...BASE_APPLY_ARGS,
      connectionConfig,
      applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
    });

    assert.equal(result.status, 'committed');
    assert.equal(protocolPoolConstructionCount, 1);
    assert.equal(protocolPoolConstructionOptions[0].host, 'db-host');
    assert.equal(protocolPoolConstructionOptions[0].port, 3306);
    assert.equal(protocolPoolConstructionOptions[0].database, 'terria_v1_local');
    assert.ok(queryCalls > 0, 'the immutable snapshot must permit the original intended apply path');
  } finally {
    resetProtocolPoolConstructionObservation();
  }
});

test('input boundary snapshots each valid outer proxy exactly once', async () => {
  const connections = makeSameServerConnections();
  const manifestTarget = cloneSameServerManifest();
  attachTestBorrowedConnectionIdentities(manifestTarget, connections);
  const connectionConfigTarget = createTestConnectionConfig(manifestTarget, connections);
  let manifestPrototypeReads = 0;
  let connectionConfigPrototypeReads = 0;
  const manifest = new Proxy(manifestTarget, {
    getPrototypeOf(target) {
      manifestPrototypeReads += 1;
      return Reflect.getPrototypeOf(target);
    },
  });
  const connectionConfig = new Proxy(connectionConfigTarget, {
    getPrototypeOf(target) {
      connectionConfigPrototypeReads += 1;
      return Reflect.getPrototypeOf(target);
    },
  });

  const result = await executeSameServerTransactionDirect({
    manifest,
    ...BASE_APPLY_ARGS,
    connectionConfig,
    applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
  });

  assert.equal(result.status, 'committed');
  assert.equal(manifestPrototypeReads, 1);
  assert.equal(connectionConfigPrototypeReads, 1);
});

test('input boundary rejects object-valued scalar UUIDs before coercion or pool/query side effects', async () => {
  for (const location of ['serverIdentity', 'databases.local']) {
    const connections = makeSameServerConnections();
    const connection = connections.local;
    let queryCalls = 0;
    const query = connection.query.bind(connection);
    connection.query = async (sql, params) => {
      queryCalls += 1;
      return query(sql, params);
    };
    const manifest = cloneSameServerManifest();
    attachTestBorrowedConnectionIdentities(manifest, connections);
    const connectionConfig = createTestConnectionConfig(manifest, connections);
    let coercionCalls = 0;
    const mutableUuid = {
      state: 'uuid-1',
      toString() {
        coercionCalls += 1;
        this.state = 'uuid-mutated-by-coercion';
        return 'uuid-1';
      },
      valueOf() {
        coercionCalls += 1;
        this.state = 'uuid-mutated-by-valueOf';
        return 'uuid-1';
      },
    };
    if (location === 'serverIdentity') {
      manifest.serverIdentity.serverUuid = mutableUuid;
    } else {
      manifest.databases.local.serverUuid = mutableUuid;
    }

    resetProtocolPoolConstructionObservation();
    try {
      await assert.rejects(() => executeSameServerTransactionDirect({
        manifest,
        ...BASE_APPLY_ARGS,
        connectionConfig,
        applyWork: async () => ({ maint: 1, relation: 1, local: 1 }),
      }), /primitive|scalar|data-only|serverUuid|identity/i, `${location} UUID must fail closed`);

      assert.equal(protocolPoolConstructionCount, 0, `${location} UUID must not construct a pool`);
      assert.equal(queryCalls, 0, `${location} UUID must not query a borrowed connection`);
      assert.equal(coercionCalls, 0, `${location} UUID must not invoke coercion hooks`);
      assert.equal(mutableUuid.state, 'uuid-1', `${location} UUID object must not be mutated`);
    } finally {
      resetProtocolPoolConstructionObservation();
    }
  }
});
