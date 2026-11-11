import { createHash } from 'node:crypto';

export const BUFF_NPC_SECONDARY_OPERATION_ID = 'canonical-buff-npc-secondary-apply';
export const BUFF_NPC_SECONDARY_CANDIDATE_OPERATION_ID = 'canonical-buff-npc-secondary-candidate';
export const BUFF_NPC_SECONDARY_WRITE_TARGETS = Object.freeze([
  'relation.npc_buff_relations.immune',
]);
export const BUFF_NPC_SECONDARY_TARGET_BUFF_IDS = Object.freeze(
  Array.from({ length: 12 }, (_, index) => 389 + index),
);

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
export const BUFF_NPC_SECONDARY_COLUMNS = Object.freeze([
  'record_key', 'npc_source_id', 'npc_internal_name', 'npc_name',
  'buff_source_id', 'buff_internal_name', 'relation_type', 'duration_ticks',
  'chance_value', 'chance_text', 'conditions', 'source_maint_table',
  'source_maint_record_key', 'source_maint_id', 'landing_source_id',
  'landing_source_key', 'landing_content_hash', 'source_provider', 'source_page',
  'source_revision_timestamp', 'confidence', 'reason', 'review_status', 'raw_json',
  'status', 'deleted',
]);

export function buildBuffNpcSecondaryProposal({
  candidate,
  candidateArtifactSha256,
  currentRows = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  validateCandidate(candidate);
  requireHash(candidateArtifactSha256, 'candidate artifact hash');
  requireTimestamp(generatedAt, 'generatedAt');
  const preserved = currentRows == null ? candidate.changes.preserved : currentRows;
  if (!Array.isArray(preserved)) throw new Error('NPC secondary proposal preserved rows must be an array');
  if (hashJson(preserved) !== candidate.before.rowsSha256) {
    throw new Error('NPC secondary proposal current baseline drifted from candidate');
  }
  const inserts = candidate.changes.inserts.map(clone).sort(compareRows);
  const afterRows = [...preserved.map(clone), ...inserts].sort(compareRows);
  if (hashJson(afterRows) !== candidate.after.rowsSha256) {
    throw new Error('NPC secondary proposal after-set drifted from candidate');
  }
  const proposal = {
    schemaVersion: 'buff-npc-secondary-apply-proposal/v1',
    operationId: BUFF_NPC_SECONDARY_OPERATION_ID,
    generatedAt,
    executable: false,
    applyAllowed: false,
    databaseWrites: false,
    destructiveClear: false,
    externalRequests: false,
    target: {
      database: 'terria_v1_relation',
      table: 'terria_v1_relation.npc_buff_relations',
      columns: [...BUFF_NPC_SECONDARY_COLUMNS],
      writeTargets: [...BUFF_NPC_SECONDARY_WRITE_TARGETS],
      mutationMode: 'insert-only-preserve-existing',
      relationType: 'immune',
      targetBuffIds: [...BUFF_NPC_SECONDARY_TARGET_BUFF_IDS],
    },
    source: {
      candidateOperationId: candidate.operationId,
      candidateArtifactSha256,
      candidateSha256: candidate.candidateSha256,
      candidateGeneratedAt: candidate.generatedAt,
      serverUuid: candidate.serverUuid,
      deferredCount: candidate.deferred.length,
      deferredSha256: hashJson(candidate.deferred),
      ...(candidate.scopeContract ? { scopeContract: clone(candidate.scopeContract) } : {}),
    },
    before: { rowCount: preserved.length, rowsSha256: hashJson(preserved) },
    after: { rowCount: afterRows.length, rowsSha256: hashJson(afterRows) },
    changes: {
      inserts,
      updates: [],
      deletes: [],
      preserved: preserved.map(clone),
    },
    summary: {
      currentRowCount: preserved.length,
      insertCount: inserts.length,
      deferredCount: candidate.deferred.length,
      deferredDisplayOnlyCount: candidate.summary.deferredDisplayOnlyCount,
      afterRowCount: afterRows.length,
    },
  };
  proposal.scopeSha256 = hashJson({
    operationId: proposal.operationId,
    target: proposal.target,
    source: proposal.source,
    before: proposal.before,
    after: proposal.after,
    summary: proposal.summary,
  });
  validateBuffNpcSecondaryProposal(proposal);
  return proposal;
}

export function validateBuffNpcSecondaryProposal(proposal) {
  if (!proposal || proposal.schemaVersion !== 'buff-npc-secondary-apply-proposal/v1'
      || proposal.operationId !== BUFF_NPC_SECONDARY_OPERATION_ID
      || proposal.executable !== false || proposal.applyAllowed !== false
      || proposal.databaseWrites !== false || proposal.destructiveClear !== false
      || proposal.externalRequests !== false) {
    throw new Error('NPC secondary proposal identity or safety flags are invalid');
  }
  if (proposal.target?.database !== 'terria_v1_relation'
      || proposal.target.table !== 'terria_v1_relation.npc_buff_relations'
      || proposal.target.mutationMode !== 'insert-only-preserve-existing'
      || proposal.target.relationType !== 'immune'
      || JSON.stringify(proposal.target.columns) !== JSON.stringify(BUFF_NPC_SECONDARY_COLUMNS)
      || JSON.stringify(proposal.target.writeTargets) !== JSON.stringify(BUFF_NPC_SECONDARY_WRITE_TARGETS)
      || JSON.stringify(proposal.target.targetBuffIds) !== JSON.stringify(BUFF_NPC_SECONDARY_TARGET_BUFF_IDS)) {
    throw new Error('NPC secondary proposal target scope drifted');
  }
  if (!proposal.source || proposal.source.candidateOperationId !== BUFF_NPC_SECONDARY_CANDIDATE_OPERATION_ID
      || !HASH_PATTERN.test(proposal.source.candidateArtifactSha256 ?? '')
      || !HASH_PATTERN.test(proposal.source.candidateSha256 ?? '')
      || !isUuid(proposal.source.serverUuid)
      || !Number.isInteger(proposal.source.deferredCount)
      || !HASH_PATTERN.test(proposal.source.deferredSha256 ?? '')) {
    throw new Error('NPC secondary proposal source binding is invalid');
  }
  const scopeContract = proposal.source.scopeContract == null
    ? null
    : validateScopeContract(proposal.source.scopeContract);
  const inserts = proposal.changes?.inserts;
  const preserved = proposal.changes?.preserved;
  if (!Array.isArray(inserts) || !Array.isArray(preserved)
      || !Array.isArray(proposal.changes.updates) || proposal.changes.updates.length !== 0
      || !Array.isArray(proposal.changes.deletes) || proposal.changes.deletes.length !== 0) {
    throw new Error('NPC secondary proposal change shape is invalid');
  }
  assertUniqueRows(preserved, 'preserved');
  assertUniqueRows(inserts, 'inserts');
  const preservedKeys = new Set(preserved.map(row => row.record_key));
  for (const row of inserts) {
    if (preservedKeys.has(row.record_key)) throw new Error('NPC secondary proposal insert already exists');
    if (row.relation_type !== 'immune' || Number(row.status) !== 1 || Number(row.deleted) !== 0) {
      throw new Error('NPC secondary proposal insert is not an active immune row');
    }
    if (!BUFF_NPC_SECONDARY_TARGET_BUFF_IDS.includes(Number(row.buff_source_id))) {
      throw new Error('NPC secondary proposal insert is outside Buff scope');
    }
    if (!Number.isSafeInteger(Number(row.npc_source_id)) || !String(row.npc_internal_name ?? '').trim()) {
      throw new Error('NPC secondary proposal insert lacks stable NPC identity');
    }
  }
  if (scopeContract
    ? inserts.length !== scopeContract.promotableCount || proposal.source.deferredCount !== scopeContract.deferredCount
    : inserts.length !== 259 || proposal.source.deferredCount !== 114) {
    throw new Error('NPC secondary proposal bounded counts drifted');
  }
  const afterRows = [...preserved, ...inserts].sort(compareRows);
  if (proposal.before.rowCount !== preserved.length
      || proposal.before.rowsSha256 !== hashJson(preserved)
      || proposal.after.rowCount !== afterRows.length
      || proposal.after.rowsSha256 !== hashJson(afterRows)
      || proposal.summary.currentRowCount !== preserved.length
      || proposal.summary.insertCount !== inserts.length
      || proposal.summary.afterRowCount !== afterRows.length
      || proposal.scopeSha256 !== hashJson({
        operationId: proposal.operationId,
        target: proposal.target,
        source: proposal.source,
        before: proposal.before,
        after: proposal.after,
        summary: proposal.summary,
      })) {
    throw new Error('NPC secondary proposal snapshot or scope hash drifted');
  }
  return true;
}

export async function executeBuffNpcSecondaryTransaction({
  connection,
  proposal,
  lockRuntime,
  readLockedRows,
  consumeDispatchPermit,
  applyMutation,
  readAfterRows,
  journal = null,
} = {}) {
  validateBuffNpcSecondaryProposal(proposal);
  if (!connection || typeof connection.beginTransaction !== 'function'
      || typeof connection.commit !== 'function' || typeof connection.rollback !== 'function') {
    throw new TypeError('NPC secondary transaction connection is required');
  }
  for (const [name, callback] of Object.entries({ lockRuntime, readLockedRows, consumeDispatchPermit, applyMutation, readAfterRows })) {
    if (typeof callback !== 'function') throw new TypeError(`NPC secondary transaction ${name} callback is required`);
  }
  if (journal != null) {
    for (const name of ['prepared', 'commitUnknown', 'committed', 'rolledBack']) {
      if (typeof journal[name] !== 'function') throw new TypeError(`NPC secondary journal ${name} callback is required`);
    }
  }
  let began = false;
  let prepared = false;
  let commitAttempted = false;
  try {
    await connection.beginTransaction();
    began = true;
    await lockRuntime({ proposal });
    assertRowsSnapshot(await readLockedRows({ proposal }), proposal.before.rowsSha256, 'before');
    if (journal) {
      await journal.prepared({ proposal });
      prepared = true;
    }
    await consumeDispatchPermit({ proposal });
    await applyMutation({ connection, proposal });
    assertRowsSnapshot(await readAfterRows({ proposal }), proposal.after.rowsSha256, 'after');
    commitAttempted = true;
    try {
      await connection.commit();
    } catch (error) {
      if (journal) await journal.commitUnknown({ proposal, error });
      throw error;
    }
    if (journal) await journal.committed({ proposal });
    return Object.freeze({ status: 'completed', beforeSha256: proposal.before.rowsSha256, afterSha256: proposal.after.rowsSha256, inserted: proposal.changes.inserts.length });
  } catch (error) {
    if (began && !commitAttempted) {
      await connection.rollback();
      if (journal && prepared) await journal.rolledBack({ proposal, error });
    }
    throw error;
  }
}

export async function applyBuffNpcSecondaryMutation({ connection, proposal }) {
  validateBuffNpcSecondaryProposal(proposal);
  if (!connection || typeof connection.execute !== 'function') throw new TypeError('NPC secondary mutation connection is required');
  const sql = `INSERT INTO \`terria_v1_relation\`.\`npc_buff_relations\` (${BUFF_NPC_SECONDARY_COLUMNS.map(column => `\`${column}\``).join(', ')}) VALUES (${BUFF_NPC_SECONDARY_COLUMNS.map(() => '?').join(', ')})`;
  let inserted = 0;
  for (const row of proposal.changes.inserts) {
    const [result] = await connection.execute(sql, BUFF_NPC_SECONDARY_COLUMNS.map(column => row[column]));
    if (Number(result?.affectedRows ?? 0) !== 1) throw new Error('NPC secondary insert receipt is invalid');
    inserted += 1;
  }
  return Object.freeze({ inserted });
}

export function hashJson(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;
}

function validateCandidate(candidate) {
  if (!candidate || candidate.schemaVersion !== 'buff-npc-secondary-candidate/v1'
      || candidate.operationId !== BUFF_NPC_SECONDARY_CANDIDATE_OPERATION_ID
      || candidate.readOnly !== true || candidate.executable !== false
      || candidate.applyAllowed !== false || candidate.databaseWrites !== false
      || candidate.externalRequests !== false) {
    throw new Error('NPC secondary candidate is not a read-only candidate');
  }
  if (candidate.target?.database !== 'terria_v1_relation'
      || candidate.target.table !== 'terria_v1_relation.npc_buff_relations'
      || candidate.target.mutationMode !== 'insert-only-preserve-existing'
      || candidate.target.relationType !== 'immune') {
    throw new Error('NPC secondary candidate target is invalid');
  }
  if (JSON.stringify(candidate.target.columns) !== JSON.stringify(BUFF_NPC_SECONDARY_COLUMNS)
      || JSON.stringify(candidate.targetBuffIds) !== JSON.stringify(BUFF_NPC_SECONDARY_TARGET_BUFF_IDS)
      || !isUuid(candidate.serverUuid)
      || !Array.isArray(candidate.changes?.inserts)
      || !Array.isArray(candidate.changes?.preserved)
      || !Array.isArray(candidate.deferred)
      || candidate.changes.updates.length !== 0
      || candidate.changes.deletes.length !== 0) {
    throw new Error('NPC secondary candidate shape is invalid');
  }
  const scopeContract = candidate.scopeContract == null
    ? null
    : validateScopeContract(candidate.scopeContract);
  if (scopeContract
    ? candidate.changes.inserts.length !== scopeContract.promotableCount
      || candidate.deferred.length !== scopeContract.deferredCount
      || candidate.summary?.insertCount !== scopeContract.promotableCount
      || candidate.summary?.deferredCount !== scopeContract.deferredCount
    : candidate.changes.inserts.length !== 259 || candidate.deferred.length !== 114
      || candidate.summary?.insertCount !== 259 || candidate.summary?.deferredDisplayOnlyCount !== 114) {
    throw new Error('NPC secondary candidate bounded counts are invalid');
  }
  if (candidate.before?.rowsSha256 !== hashJson(candidate.changes.preserved)
      || candidate.after?.rowsSha256 !== hashJson([...candidate.changes.preserved, ...candidate.changes.inserts].sort(compareRows))) {
    throw new Error('NPC secondary candidate snapshot hash is invalid');
  }
  const copy = clone(candidate);
  delete copy.candidateSha256;
  if (candidate.candidateSha256 !== hashJson(copy)) throw new Error('NPC secondary candidate hash is invalid');
}

function assertRowsSnapshot(rows, expectedHash, label) {
  if (!Array.isArray(rows) || hashJson(rows) !== expectedHash) throw new Error(`NPC secondary ${label}-set drifted`);
}

function assertUniqueRows(rows, label) {
  const keys = rows.map(row => String(row?.record_key ?? '').trim());
  if (keys.some(key => !key) || new Set(keys).size !== keys.length) throw new Error(`NPC secondary ${label} identity is duplicated or missing`);
}

function validateScopeContract(scopeContract) {
  if (!scopeContract || scopeContract.schemaVersion !== 'buff-npc-secondary-identity-scope/v1'
      || !HASH_PATTERN.test(String(scopeContract.discoverySha256 ?? ''))
      || !Number.isSafeInteger(scopeContract.promotableCount) || scopeContract.promotableCount < 0
      || !Number.isSafeInteger(scopeContract.deferredCount) || scopeContract.deferredCount < 0) {
    throw new Error('NPC secondary identity scope contract is invalid');
  }
  return scopeContract;
}

function compareRows(left, right) { return String(left?.record_key ?? '').localeCompare(String(right?.record_key ?? '')); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function requireHash(value, label) { if (!HASH_PATTERN.test(String(value ?? ''))) throw new Error(`${label} must be a sha256 hash`); }
function requireTimestamp(value, label) { if (!Number.isFinite(Date.parse(String(value ?? '')))) throw new Error(`${label} is invalid`); }
function isUuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? '')); }
