import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMutationGenerationIdentity,
  readCurrentGeneration,
  recordMutationCommit,
  validateGenerationFreshness,
  canAutomaticallyRollback
} from './mutation-generation.mjs';

const MOCK_IDENTITY = {
  environmentId: 'test-env',
  databaseRole: 'local',
  table: 'npcs',
  scopeKey: { capability: 'town_npc' },
  schemaHash: 'sha256:' + '0'.repeat(64)
};

function mockConnection(rows = []) {
  return {
    query: async (sql, params) => {
      if (sql.includes('SELECT generation')) {
        return [rows];
      }
      if (sql.includes('INSERT INTO')) {
        return [{ affectedRows: 1 }];
      }
      throw new Error(`unexpected query: ${sql}`);
    }
  };
}

test('buildMutationGenerationIdentity requires all fields', () => {
  assert.throws(() => buildMutationGenerationIdentity({}), /environmentId is required/);
  assert.throws(() => buildMutationGenerationIdentity({ environmentId: 'x' }), /databaseRole is required/);
  assert.throws(() => buildMutationGenerationIdentity({ environmentId: 'x', databaseRole: 'local' }), /table is required/);
  assert.throws(
    () => buildMutationGenerationIdentity({ environmentId: 'x', databaseRole: 'local', table: 'items' }),
    /scope key must be a plain object/
  );
});

test('buildMutationGenerationIdentity hashes scope key canonically', () => {
  const identity1 = buildMutationGenerationIdentity({
    ...MOCK_IDENTITY,
    scopeKey: { b: 2, a: 1 }
  });
  const identity2 = buildMutationGenerationIdentity({
    ...MOCK_IDENTITY,
    scopeKey: { a: 1, b: 2 }
  });
  assert.strictEqual(identity1.scopeKeyHash, identity2.scopeKeyHash);
  assert.match(identity1.scopeKeyHash, /^sha256:[0-9a-f]{64}$/);
});

test('readCurrentGeneration returns zero for missing scope', async () => {
  const connection = mockConnection([]);
  const identity = buildMutationGenerationIdentity(MOCK_IDENTITY);
  const result = await readCurrentGeneration(connection, identity);

  assert.strictEqual(result.generation, 0);
  assert.strictEqual(result.lastWriterRunId, null);
  assert.strictEqual(result.schemaHash, null);
});

test('readCurrentGeneration returns existing generation', async () => {
  const connection = mockConnection([{
    generation: 5,
    last_writer_run_id: 'run-123',
    schema_hash: 'sha256:abc'
  }]);
  const identity = buildMutationGenerationIdentity(MOCK_IDENTITY);
  const result = await readCurrentGeneration(connection, identity);

  assert.strictEqual(result.generation, 5);
  assert.strictEqual(result.lastWriterRunId, 'run-123');
  assert.strictEqual(result.schemaHash, 'sha256:abc');
});

test('recordMutationCommit increments generation', async () => {
  const connection = mockConnection();
  const identity = buildMutationGenerationIdentity(MOCK_IDENTITY);
  const result = await recordMutationCommit(connection, identity, 'run-456', 3);

  assert.strictEqual(result.committedGeneration, 4);
  assert.strictEqual(result.affectedRows, 1);
});

test('recordMutationCommit rejects negative generation', async () => {
  const connection = mockConnection();
  const identity = buildMutationGenerationIdentity(MOCK_IDENTITY);

  await assert.rejects(
    () => recordMutationCommit(connection, identity, 'run-x', -1),
    /before generation must be a non-negative integer/
  );
});

test('validateGenerationFreshness accepts matching generation', async () => {
  const connection = mockConnection([{
    generation: 7,
    last_writer_run_id: 'run-x',
    schema_hash: MOCK_IDENTITY.schemaHash
  }]);
  const identity = buildMutationGenerationIdentity(MOCK_IDENTITY);

  assert.strictEqual(await validateGenerationFreshness(connection, identity, 7), true);
});

test('validateGenerationFreshness rejects stale generation', async () => {
  const connection = mockConnection([{
    generation: 10,
    last_writer_run_id: 'run-other',
    schema_hash: MOCK_IDENTITY.schemaHash
  }]);
  const identity = buildMutationGenerationIdentity(MOCK_IDENTITY);

  await assert.rejects(
    () => validateGenerationFreshness(connection, identity, 7),
    /generation mismatch: expected 7, found 10/
  );
});

test('validateGenerationFreshness rejects schema change', async () => {
  const connection = mockConnection([{
    generation: 7,
    last_writer_run_id: 'run-x',
    schema_hash: 'sha256:different'
  }]);
  const identity = buildMutationGenerationIdentity(MOCK_IDENTITY);

  await assert.rejects(
    () => validateGenerationFreshness(connection, identity, 7),
    /schema hash changed/
  );
});

test('canAutomaticallyRollback permits exact match', async () => {
  const connection = mockConnection([{
    generation: 4,
    last_writer_run_id: 'run-self',
    schema_hash: MOCK_IDENTITY.schemaHash
  }]);
  const identity = buildMutationGenerationIdentity(MOCK_IDENTITY);
  const result = await canAutomaticallyRollback(connection, identity, 'run-self', 3);

  assert.strictEqual(result.canRollback, true);
  assert.strictEqual(result.generation, 4);
});

test('canAutomaticallyRollback rejects later generation', async () => {
  const connection = mockConnection([{
    generation: 5,
    last_writer_run_id: 'run-self',
    schema_hash: MOCK_IDENTITY.schemaHash
  }]);
  const identity = buildMutationGenerationIdentity(MOCK_IDENTITY);
  const result = await canAutomaticallyRollback(connection, identity, 'run-self', 3);

  assert.strictEqual(result.canRollback, false);
  assert.strictEqual(result.reason, 'later_generation');
});

test('canAutomaticallyRollback rejects different writer', async () => {
  const connection = mockConnection([{
    generation: 4,
    last_writer_run_id: 'run-other',
    schema_hash: MOCK_IDENTITY.schemaHash
  }]);
  const identity = buildMutationGenerationIdentity(MOCK_IDENTITY);
  const result = await canAutomaticallyRollback(connection, identity, 'run-self', 3);

  assert.strictEqual(result.canRollback, false);
  assert.strictEqual(result.reason, 'different_writer');
});

test('canAutomaticallyRollback rejects schema change', async () => {
  const connection = mockConnection([{
    generation: 4,
    last_writer_run_id: 'run-self',
    schema_hash: 'sha256:changed'
  }]);
  const identity = buildMutationGenerationIdentity(MOCK_IDENTITY);
  const result = await canAutomaticallyRollback(connection, identity, 'run-self', 3);

  assert.strictEqual(result.canRollback, false);
  assert.strictEqual(result.reason, 'schema_changed');
});
