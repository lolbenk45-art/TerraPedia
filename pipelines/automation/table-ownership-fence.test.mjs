import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFenceIdentity,
  acquireFence,
  commitFence,
  validateNoOwnershipIntersection,
  releaseFence
} from './table-ownership-fence.mjs';

const BASE_IDENTITY = {
  environmentId: 'test-env',
  databaseRole: 'local',
  table: 'npcs',
  fieldGroup: 'town_npc_columns',
  logicalPredicate: { kind: 'partition', group: 'npc_kind', partition: 'town' }
};

function makeConnection({ queryResults = [] } = {}) {
  let callIndex = 0;
  return {
    _queries: [],
    query: async (sql, params) => {
      const result = queryResults[callIndex++] ?? [[]];
      this?._queries?.push({ sql, params });
      return result;
    }
  };
}

// ── buildFenceIdentity ────────────────────────────────────────────────────────

test('buildFenceIdentity requires all fields', () => {
  assert.throws(() => buildFenceIdentity({}), /environmentId is required/);
  assert.throws(() => buildFenceIdentity({ environmentId: 'x' }), /databaseRole is required/);
  assert.throws(
    () => buildFenceIdentity({ environmentId: 'x', databaseRole: 'local', table: 't', fieldGroup: 'f' }),
    /logical predicate must be a plain object/
  );
});

test('buildFenceIdentity produces stable hash for same predicate', () => {
  const id1 = buildFenceIdentity({ ...BASE_IDENTITY, logicalPredicate: { b: 2, a: 1 } });
  const id2 = buildFenceIdentity({ ...BASE_IDENTITY, logicalPredicate: { a: 1, b: 2 } });
  assert.strictEqual(id1.logicalPredicateHash, id2.logicalPredicateHash);
  assert.match(id1.logicalPredicateHash, /^sha256:[0-9a-f]{64}$/);
});

test('buildFenceIdentity produces different hashes for different predicates', () => {
  const id1 = buildFenceIdentity(BASE_IDENTITY);
  const id2 = buildFenceIdentity({
    ...BASE_IDENTITY,
    logicalPredicate: { kind: 'partition', group: 'npc_kind', partition: 'non_town' }
  });
  assert.notStrictEqual(id1.logicalPredicateHash, id2.logicalPredicateHash);
});

// ── acquireFence ─────────────────────────────────────────────────────────────

test('acquireFence returns token when successfully acquired', async () => {
  const identity = buildFenceIdentity(BASE_IDENTITY);
  const connection = {
    query: async (sql) => {
      if (sql.includes('INSERT INTO')) return [{ affectedRows: 1 }];
      if (sql.includes('SELECT latest_run_id')) {
        return [[{
          latest_run_id: 'run-1',
          fence_token: null,        // will be replaced by actual token check below
          before_generation: 0,
          expires_at: new Date(Date.now() + 3600000),
          version: 0
        }]];
      }
      throw new Error(`unexpected query: ${sql}`);
    }
  };

  // patch: capture the token written so the SELECT mock can reflect it
  let capturedToken;
  const patchedConnection = {
    query: async (sql, params) => {
      if (sql.includes('INSERT INTO')) {
        capturedToken = params[6]; // fence_token position
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('SELECT latest_run_id')) {
        return [[{
          latest_run_id: 'run-1',
          fence_token: capturedToken,
          before_generation: 0,
          expires_at: new Date(Date.now() + 3600000),
          version: 0
        }]];
      }
      throw new Error(`unexpected query: ${sql}`);
    }
  };

  const result = await acquireFence(patchedConnection, identity, 'run-1', 0);
  assert.ok(result.fenceToken.startsWith('fence:'));
  assert.strictEqual(result.beforeGeneration, 0);
  assert.ok(result.expiresAt > new Date());
});

test('acquireFence rejects when fence held by another run', async () => {
  const identity = buildFenceIdentity(BASE_IDENTITY);
  const connection = {
    query: async (sql) => {
      if (sql.includes('INSERT INTO')) return [{ affectedRows: 0 }];
      if (sql.includes('SELECT latest_run_id')) {
        return [[{
          latest_run_id: 'run-other',
          fence_token: 'fence:other-token',
          before_generation: 0,
          expires_at: new Date(Date.now() + 3600000),
          version: 1
        }]];
      }
      throw new Error(`unexpected query: ${sql}`);
    }
  };

  await assert.rejects(
    () => acquireFence(connection, identity, 'run-1', 0),
    /fence is held by another run: run-other/
  );
});

test('acquireFence rejects missing before generation', async () => {
  const identity = buildFenceIdentity(BASE_IDENTITY);
  const connection = { query: async () => [[]] };

  await assert.rejects(
    () => acquireFence(connection, identity, 'run-1', -1),
    /before generation must be a non-negative integer/
  );
});

// ── commitFence ───────────────────────────────────────────────────────────────

test('commitFence updates committed generation and marker', async () => {
  const identity = buildFenceIdentity(BASE_IDENTITY);
  const connection = {
    query: async () => [{ affectedRows: 1 }]
  };

  const result = await commitFence(connection, identity, 'fence:abc', 1, 'txn-001');
  assert.strictEqual(result.committedGeneration, 1);
  assert.strictEqual(result.affectedRows, 1);
});

test('commitFence rejects token mismatch or expired fence', async () => {
  const identity = buildFenceIdentity(BASE_IDENTITY);
  const connection = {
    query: async () => [{ affectedRows: 0 }]
  };

  await assert.rejects(
    () => commitFence(connection, identity, 'fence:wrong', 1, 'txn-001'),
    /fence commit failed: token mismatch or fence expired/
  );
});

test('commitFence rejects non-positive committed generation', async () => {
  const identity = buildFenceIdentity(BASE_IDENTITY);
  const connection = { query: async () => [{ affectedRows: 1 }] };

  await assert.rejects(
    () => commitFence(connection, identity, 'fence:abc', 0, 'txn-001'),
    /committed generation must be a positive integer/
  );
});

// ── validateNoOwnershipIntersection ──────────────────────────────────────────

test('validateNoOwnershipIntersection accepts disjoint fences with no conflicts', async () => {
  const identity1 = buildFenceIdentity(BASE_IDENTITY);
  const identity2 = buildFenceIdentity({
    ...BASE_IDENTITY,
    logicalPredicate: { kind: 'partition', group: 'npc_kind', partition: 'non_town' }
  });
  const connection = {
    query: async () => [[]]   // no active conflicting fences
  };

  assert.strictEqual(
    await validateNoOwnershipIntersection(connection, [identity1, identity2]),
    true
  );
});

test('validateNoOwnershipIntersection rejects duplicate predicate hash', async () => {
  const identity = buildFenceIdentity(BASE_IDENTITY);
  const connection = { query: async () => [[]] };

  await assert.rejects(
    () => validateNoOwnershipIntersection(connection, [identity, identity]),
    /duplicate logical predicate hash/
  );
});

test('validateNoOwnershipIntersection rejects active conflicting fence from other run', async () => {
  const identity = buildFenceIdentity(BASE_IDENTITY);
  const connection = {
    query: async () => [[{
      logical_predicate_hash: identity.logicalPredicateHash,
      latest_run_id: 'run-other',
      fence_token: 'fence:xyz',
      expires_at: new Date(Date.now() + 3600000)
    }]]
  };

  await assert.rejects(
    () => validateNoOwnershipIntersection(connection, [identity]),
    /ownership intersection detected/
  );
});

test('validateNoOwnershipIntersection rejects empty identities array', async () => {
  const connection = { query: async () => [[]] };

  await assert.rejects(
    () => validateNoOwnershipIntersection(connection, []),
    /identities array is required/
  );
});

// ── releaseFence ──────────────────────────────────────────────────────────────

test('releaseFence returns released true on success', async () => {
  const identity = buildFenceIdentity(BASE_IDENTITY);
  const connection = {
    query: async () => [{ affectedRows: 1 }]
  };

  const result = await releaseFence(connection, identity, 'fence:abc');
  assert.strictEqual(result.released, true);
});

test('releaseFence returns released false when token not found', async () => {
  const identity = buildFenceIdentity(BASE_IDENTITY);
  const connection = {
    query: async () => [{ affectedRows: 0 }]
  };

  const result = await releaseFence(connection, identity, 'fence:wrong');
  assert.strictEqual(result.released, false);
});
