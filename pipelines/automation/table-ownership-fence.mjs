import { createHash, randomBytes } from 'node:crypto';

const FENCE_TABLE = 'crawler_automation_write_fence';
const FENCE_TTL_MINUTES = 60;
const REQUIRED_FIELDS = Object.freeze(['environmentId', 'databaseRole', 'table', 'fieldGroup', 'logicalPredicateHash']);

function hashLogicalPredicate(predicate) {
  if (!predicate || typeof predicate !== 'object' || Array.isArray(predicate)) {
    throw new Error('logical predicate must be a plain object');
  }
  const canonical = JSON.stringify(
    Object.keys(predicate)
      .sort((a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')))
      .reduce((acc, key) => {
        acc[key] = predicate[key];
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

function generateFenceToken(runId, identity) {
  const entropy = randomBytes(8).toString('hex');
  const components = [
    runId,
    identity.databaseRole,
    identity.table,
    identity.fieldGroup,
    entropy
  ].join(':');
  return `fence:${createHash('sha256').update(components, 'utf8').digest('hex')}`;
}

export function buildFenceIdentity({
  environmentId,
  databaseRole,
  table,
  fieldGroup,
  logicalPredicate
} = {}) {
  const identity = {
    environmentId: requireField(environmentId, 'environmentId'),
    databaseRole: requireField(databaseRole, 'databaseRole'),
    table: requireField(table, 'table'),
    fieldGroup: requireField(fieldGroup, 'fieldGroup'),
    logicalPredicateHash: hashLogicalPredicate(logicalPredicate)
  };

  if (!/^sha256:[0-9a-f]{64}$/.test(identity.logicalPredicateHash)) {
    throw new Error('logical predicate hash must be a sha256 hash');
  }

  return Object.freeze(identity);
}

export async function acquireFence(connection, identity, runId, beforeGeneration) {
  REQUIRED_FIELDS.forEach((field) => requireField(identity[field], field));
  requireField(runId, 'runId');

  if (!Number.isSafeInteger(beforeGeneration) || beforeGeneration < 0) {
    throw new Error('before generation must be a non-negative integer');
  }

  const fenceToken = generateFenceToken(runId, identity);
  const expiresAt = new Date(Date.now() + FENCE_TTL_MINUTES * 60 * 1000);

  // Try to acquire the fence
  const [result] = await connection.query(
    `INSERT INTO ${FENCE_TABLE}
       (environment_id, database_role, physical_table, field_group, logical_predicate_hash,
        latest_run_id, fence_token, before_generation, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       latest_run_id = IF(expires_at < NOW(), VALUES(latest_run_id), latest_run_id),
       fence_token = IF(expires_at < NOW(), VALUES(fence_token), fence_token),
       before_generation = IF(expires_at < NOW(), VALUES(before_generation), before_generation),
       expires_at = IF(expires_at < NOW(), VALUES(expires_at), expires_at),
       version = IF(expires_at < NOW(), 0, version + 1)`,
    [
      identity.environmentId,
      identity.databaseRole,
      identity.table,
      identity.fieldGroup,
      identity.logicalPredicateHash,
      runId,
      fenceToken,
      beforeGeneration,
      expiresAt
    ]
  );

  // Verify we actually acquired the fence
  const [rows] = await connection.query(
    `SELECT latest_run_id, fence_token, before_generation, expires_at, version
     FROM ${FENCE_TABLE}
     WHERE environment_id = ? AND database_role = ? AND physical_table = ?
       AND field_group = ? AND logical_predicate_hash = ?`,
    [
      identity.environmentId,
      identity.databaseRole,
      identity.table,
      identity.fieldGroup,
      identity.logicalPredicateHash
    ]
  );

  if (rows.length === 0) {
    throw new Error('fence acquisition verification failed: fence row not found');
  }

  const row = rows[0];
  if (row.latest_run_id !== runId || row.fence_token !== fenceToken) {
    throw new Error(
      `fence is held by another run: ${row.latest_run_id} (this run: ${runId})`
    );
  }

  return Object.freeze({
    fenceToken,
    beforeGeneration,
    version: Number(row.version),
    expiresAt
  });
}

export async function commitFence(connection, identity, fenceToken, committedGeneration, commitMarker) {
  REQUIRED_FIELDS.forEach((field) => requireField(identity[field], field));
  requireField(fenceToken, 'fenceToken');
  requireField(commitMarker, 'commitMarker');

  if (!Number.isSafeInteger(committedGeneration) || committedGeneration < 1) {
    throw new Error('committed generation must be a positive integer');
  }

  const [result] = await connection.query(
    `UPDATE ${FENCE_TABLE}
     SET committed_generation = ?, commit_marker = ?
     WHERE environment_id = ? AND database_role = ? AND physical_table = ?
       AND field_group = ? AND logical_predicate_hash = ? AND fence_token = ?`,
    [
      committedGeneration,
      commitMarker,
      identity.environmentId,
      identity.databaseRole,
      identity.table,
      identity.fieldGroup,
      identity.logicalPredicateHash,
      fenceToken
    ]
  );

  if (result.affectedRows !== 1) {
    throw new Error('fence commit failed: token mismatch or fence expired');
  }

  return { committedGeneration, affectedRows: result.affectedRows };
}

export async function validateNoOwnershipIntersection(connection, identities) {
  if (!Array.isArray(identities) || identities.length === 0) {
    throw new Error('identities array is required');
  }

  // Group by (environmentId, databaseRole, table, fieldGroup)
  const groupKey = (id) => `${id.environmentId}:${id.databaseRole}:${id.table}:${id.fieldGroup}`;
  const groups = new Map();

  for (const identity of identities) {
    REQUIRED_FIELDS.forEach((field) => requireField(identity[field], field));
    const key = groupKey(identity);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(identity.logicalPredicateHash);
  }

  // Check for predicate hash conflicts within each group
  for (const [key, hashes] of groups.entries()) {
    const unique = new Set(hashes);
    if (unique.size !== hashes.length) {
      throw new Error(`duplicate logical predicate hash detected in group: ${key}`);
    }

    // Query for active fences in this group
    const [envId, role, table, fieldGroup] = key.split(':');
    const [rows] = await connection.query(
      `SELECT logical_predicate_hash, latest_run_id, fence_token, expires_at
       FROM ${FENCE_TABLE}
       WHERE environment_id = ? AND database_role = ? AND physical_table = ?
         AND field_group = ? AND logical_predicate_hash IN (?)
         AND expires_at > NOW() AND commit_marker IS NULL`,
      [envId, role, table, fieldGroup, Array.from(unique)]
    );

    if (rows.length > 0) {
      const conflicts = rows.map((r) => `${r.logical_predicate_hash} (run: ${r.latest_run_id})`);
      throw new Error(
        `ownership intersection detected in ${key}: ${conflicts.join(', ')}`
      );
    }
  }

  return true;
}

export async function releaseFence(connection, identity, fenceToken) {
  REQUIRED_FIELDS.forEach((field) => requireField(identity[field], field));
  requireField(fenceToken, 'fenceToken');

  const [result] = await connection.query(
    `DELETE FROM ${FENCE_TABLE}
     WHERE environment_id = ? AND database_role = ? AND physical_table = ?
       AND field_group = ? AND logical_predicate_hash = ? AND fence_token = ?`,
    [
      identity.environmentId,
      identity.databaseRole,
      identity.table,
      identity.fieldGroup,
      identity.logicalPredicateHash,
      fenceToken
    ]
  );

  return { released: result.affectedRows === 1 };
}
