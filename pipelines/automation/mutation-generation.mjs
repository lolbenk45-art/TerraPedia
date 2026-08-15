import { createHash } from 'node:crypto';

const GENERATION_TABLE = 'crawler_automation_mutation_generation';
const REQUIRED_FIELDS = Object.freeze(['environmentId', 'databaseRole', 'table', 'scopeKeyHash']);

function hashScopeKey(scopeKey) {
  if (!scopeKey || typeof scopeKey !== 'object' || Array.isArray(scopeKey)) {
    throw new Error('scope key must be a plain object');
  }
  const canonical = JSON.stringify(
    Object.keys(scopeKey)
      .sort((a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')))
      .reduce((acc, key) => {
        acc[key] = scopeKey[key];
        return acc;
      }, {})
  );
  return `sha256:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
}

function requireField(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

export function buildMutationGenerationIdentity({
  environmentId,
  databaseRole,
  table,
  scopeKey,
  schemaHash
} = {}) {
  const identity = {
    environmentId: requireField(environmentId, 'environmentId'),
    databaseRole: requireField(databaseRole, 'databaseRole'),
    table: requireField(table, 'table'),
    scopeKeyHash: hashScopeKey(scopeKey),
    schemaHash: requireField(schemaHash, 'schemaHash')
  };

  if (!/^sha256:[0-9a-f]{64}$/.test(identity.scopeKeyHash)) {
    throw new Error('scope key hash must be a sha256 hash');
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(identity.schemaHash)) {
    throw new Error('schema hash must be a sha256 hash');
  }

  return Object.freeze(identity);
}

export async function readCurrentGeneration(connection, identity) {
  REQUIRED_FIELDS.forEach((field) => requireField(identity[field], field));

  const [rows] = await connection.query(
    `SELECT generation, last_writer_run_id, schema_hash
     FROM ${GENERATION_TABLE}
     WHERE environment_id = ? AND database_role = ? AND physical_table = ? AND scope_key_hash = ?`,
    [identity.environmentId, identity.databaseRole, identity.table, identity.scopeKeyHash]
  );

  if (rows.length === 0) {
    return Object.freeze({ generation: 0, lastWriterRunId: null, schemaHash: null });
  }

  const row = rows[0];
  return Object.freeze({
    generation: Number(row.generation),
    lastWriterRunId: row.last_writer_run_id,
    schemaHash: row.schema_hash
  });
}

export async function recordMutationCommit(connection, identity, runId, beforeGeneration) {
  REQUIRED_FIELDS.forEach((field) => requireField(identity[field], field));
  requireField(runId, 'runId');

  if (!Number.isSafeInteger(beforeGeneration) || beforeGeneration < 0) {
    throw new Error('before generation must be a non-negative integer');
  }

  const result = await connection.query(
    `INSERT INTO ${GENERATION_TABLE}
       (environment_id, database_role, physical_table, scope_key_hash, generation, last_writer_run_id, schema_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       generation = VALUES(generation),
       last_writer_run_id = VALUES(last_writer_run_id),
       schema_hash = VALUES(schema_hash),
       updated_at = CURRENT_TIMESTAMP`,
    [
      identity.environmentId,
      identity.databaseRole,
      identity.table,
      identity.scopeKeyHash,
      beforeGeneration + 1,
      runId,
      identity.schemaHash
    ]
  );

  return {
    committedGeneration: beforeGeneration + 1,
    affectedRows: result[0].affectedRows
  };
}

export async function validateGenerationFreshness(connection, identity, expectedGeneration) {
  const current = await readCurrentGeneration(connection, identity);

  if (current.generation !== expectedGeneration) {
    throw new Error(
      `generation mismatch: expected ${expectedGeneration}, found ${current.generation} ` +
      `(last writer: ${current.lastWriterRunId || 'none'})`
    );
  }

  if (current.schemaHash && current.schemaHash !== identity.schemaHash) {
    throw new Error(
      `schema hash changed: expected ${identity.schemaHash}, found ${current.schemaHash}`
    );
  }

  return true;
}

export async function canAutomaticallyRollback(connection, identity, runId, beforeGeneration) {
  const current = await readCurrentGeneration(connection, identity);

  // Automatic rollback is safe only when:
  // 1. The current generation is exactly beforeGeneration + 1 (our commit)
  // 2. The last writer is this exact run
  // 3. No schema change occurred

  if (current.generation !== beforeGeneration + 1) {
    return {
      canRollback: false,
      reason: 'later_generation',
      details: `current generation ${current.generation} != expected ${beforeGeneration + 1}`
    };
  }

  if (current.lastWriterRunId !== runId) {
    return {
      canRollback: false,
      reason: 'different_writer',
      details: `last writer ${current.lastWriterRunId} != this run ${runId}`
    };
  }

  if (current.schemaHash !== identity.schemaHash) {
    return {
      canRollback: false,
      reason: 'schema_changed',
      details: `schema hash changed from ${identity.schemaHash} to ${current.schemaHash}`
    };
  }

  return Object.freeze({ canRollback: true, generation: current.generation });
}
