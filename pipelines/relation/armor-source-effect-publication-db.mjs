import { buildArmorSourceEffectPublicationPlan, validateArmorSourceEffectPublicationPlan } from './armor-source-effect-publication.mjs';

const TABLE = 'relation_equipment_effect_attributes';
const QUALIFIED = `terria_v1_relation.${TABLE}`;
const EFFECT_COLUMNS = Object.freeze([
  'record_key', 'owner_kind', 'owner_record_key', 'owner_id', 'owner_key',
  'source_kind', 'source_locale', 'source_line_index', 'source_line', 'effect_index',
  'apply_scope', 'variant_label', 'item_internal_name', 'slot_type', 'stat_key',
  'stat_label_zh', 'class_scope', 'operation', 'value_decimal', 'value_max_decimal',
  'unit', 'condition_text', 'raw_text', 'parse_status', 'source_maint_table',
  'source_maint_record_key', 'source_maint_id', 'landing_source_id', 'landing_source_key',
  'landing_content_hash', 'source_provider', 'source_page', 'source_revision_timestamp',
  'confidence', 'reason', 'review_status', 'raw_json', 'status', 'deleted',
]);
const owned = row => row?.owner_kind === 'armor_set' && row?.source_kind === 'benefit_zh'
  || row?.owner_kind === 'item' && row?.source_kind === 'armor_attribute_cell';

function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function stable(value) { return JSON.stringify(canonical(value)); }
const DECIMAL_COLUMNS = new Set(['value_decimal', 'value_max_decimal', 'confidence']);
function comparableValue(value, column) {
  if (value == null) return null;
  if (DECIMAL_COLUMNS.has(column)) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  if (column.endsWith('_timestamp') || column.endsWith('_at')) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return value;
}
function comparable(row) {
  return Object.fromEntries(EFFECT_COLUMNS.map(key => [key, comparableValue(row?.[key], key)]));
}
function normalizeRows(rows, label) {
  if (!Array.isArray(rows)) throw new Error(`Armor source-effect ${label} rows are invalid`);
  return structuredClone(rows).sort((left, right) => String(left.record_key).localeCompare(String(right.record_key)));
}
function expectedAfterRows(proposal) {
  const rows = normalizeRows(proposal.currentRelationRows, 'proposal before');
  const byKey = new Map(rows.map(row => [row.record_key, row]));
  for (const change of proposal.changes.updates) byKey.set(change.before.record_key, { ...byKey.get(change.before.record_key), ...change.after });
  for (const row of proposal.changes.retire) byKey.set(row.record_key, { ...byKey.get(row.record_key), status: 0, deleted: 1 });
  for (const row of proposal.changes.inserts) byKey.set(row.record_key, row);
  return [...byKey.values()].sort((left, right) => String(left.record_key).localeCompare(String(right.record_key)));
}

export async function readArmorSourceEffectRelationRows(connection, { lock = false } = {}) {
  if (typeof connection?.query !== 'function') throw new Error('Armor source-effect relation snapshot requires query capability');
  const [rows] = await connection.query(`SELECT * FROM ${QUALIFIED}${lock ? ' FOR UPDATE' : ''}`);
  if (!Array.isArray(rows)) throw new Error('Armor source-effect relation snapshot query must return rows');
  return structuredClone(rows);
}

function insertColumns(row) {
  return Object.keys(row).filter(column => !['id', 'created_at', 'updated_at'].includes(column)).sort();
}
function sqlValue(value, column) {
  if (value != null && (column.endsWith('_timestamp') || column.endsWith('_at'))) return new Date(value);
  return value;
}
async function executeInsert(connection, row) {
  const columns = insertColumns(row);
  const [receipt] = await connection.execute(
    `INSERT INTO ${QUALIFIED} (${columns.map(column => `\`${column}\``).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map(column => sqlValue(row[column], column)),
  );
  if (Number(receipt?.affectedRows) !== 1) throw new Error('Armor source-effect insert receipt is not exactly one row');
}
async function executeUpdate(connection, before, after) {
  const columns = Object.keys(after).filter(column => !['id', 'record_key', 'created_at', 'updated_at'].includes(column)).sort();
  const [receipt] = await connection.execute(
    `UPDATE ${QUALIFIED} SET ${columns.map(column => `\`${column}\` = ?`).join(', ')} WHERE record_key = ?`,
    [...columns.map(column => sqlValue(after[column], column)), before.record_key],
  );
  if (Number(receipt?.affectedRows) !== 1) throw new Error('Armor source-effect update receipt is not exactly one row');
}
async function retire(connection, row) {
  const [receipt] = await connection.execute(
    `UPDATE ${QUALIFIED} SET status = ?, deleted = ? WHERE record_key = ? AND owner_kind = ? AND source_kind = ? AND status = 1 AND deleted = 0`,
    [0, 1, row.record_key, row.owner_kind, row.source_kind],
  );
  if (Number(receipt?.affectedRows) !== 1) throw new Error('Armor source-effect retirement receipt is not exactly one row');
}
function assertExactRows(expected, actual) {
  const left = normalizeRows(expected, 'expected').map(comparable);
  const right = normalizeRows(actual, 'observed').map(comparable);
  if (stable(left) !== stable(right)) throw new Error('Armor source-effect exact after-set readback mismatch');
}
function normalizeFailure(cause) {
  return cause instanceof Error && Object.isExtensible(cause) ? cause : new Error(String(cause), { cause });
}

export async function executeArmorSourceEffectPublicationTransaction({
  connection, proposal, rederiveSourceEffects, assertRuntimeFence, consumePermit,
  persistPrepared, persistOutcome,
} = {}) {
  if (['query', 'execute', 'beginTransaction', 'commit', 'rollback'].some(key => typeof connection?.[key] !== 'function')
      || [rederiveSourceEffects, assertRuntimeFence, consumePermit, persistPrepared, persistOutcome].some(fn => typeof fn !== 'function')) {
    throw new Error('Armor source-effect execution requires connection, rederivation, authorization, permit and evidence adapters');
  }
  await validateArmorSourceEffectPublicationPlan(proposal);
  const bound = structuredClone(proposal);
  const evidence = {
    schemaVersion: 'armor-source-effect-publication-execution/v1', operationId: bound.operationId,
    proposalSha256: bound.proposalSha256, sourceEvidenceHash: bound.sourceEvidenceHash,
    sourceFingerprint: bound.sourceFingerprint,
  };
  let began = false; let prepared = false; let committing = false; let committed = false;
  let permitConsumed = false; let affectedRows = 0;
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.beginTransaction(); began = true;
    await assertRuntimeFence();
    const currentRelationRows = await readArmorSourceEffectRelationRows(connection, { lock: true });
    const source = await rederiveSourceEffects({ connection, proposal: structuredClone(bound), currentRelationRows });
    if (!source || typeof source !== 'object' || Array.isArray(source)
        || JSON.stringify(Object.keys(source).sort()) !== JSON.stringify(['proposedRows', 'sourceEvidenceHash', 'sourceFingerprint'])) {
      throw new Error('Armor source-effect locked source snapshot is invalid');
    }
    const lockedPlan = buildArmorSourceEffectPublicationPlan({ currentRelationRows,
      proposedRows: source.proposedRows, sourceEvidenceHash: source.sourceEvidenceHash,
      sourceFingerprint: source.sourceFingerprint });
    if (lockedPlan.proposalSha256 !== bound.proposalSha256) throw new Error('Armor source-effect locked proposal drift');
    await assertRuntimeFence();
    await persistPrepared({ ...structuredClone(evidence), status: 'PREPARED' }); prepared = true;
    await consumePermit(); permitConsumed = true;
    for (const row of bound.changes.inserts) { await executeInsert(connection, row); affectedRows += 1; }
    for (const change of bound.changes.updates) { await executeUpdate(connection, change.before, change.after); affectedRows += 1; }
    for (const row of bound.changes.retire) { await retire(connection, row); affectedRows += 1; }
    assertExactRows(expectedAfterRows(bound), await readArmorSourceEffectRelationRows(connection));
    await assertRuntimeFence(); committing = true; await connection.commit(); committed = true;
    const result = { ...structuredClone(evidence), status: 'COMMITTED', affectedRows,
      dispatchPermitConsumed: permitConsumed, terminalRowsSha256: bound.proposalSha256 };
    await persistOutcome(result); return result;
  } catch (cause) {
    const error = normalizeFailure(cause);
    error.transactionCommitted = committed ? true : committing ? null : false;
    error.requiresReadbackReconciliation = committing;
    error.dispatchPermitConsumed = permitConsumed;
    if (began && !committing) {
      try { await connection.rollback(); }
      catch (rollbackError) { error.rollbackError = normalizeFailure(rollbackError); error.requiresReadbackReconciliation = true; }
    }
    if (prepared) {
      try { await persistOutcome({ ...structuredClone(evidence), status: committed ? 'COMMITTED_READBACK_REQUIRED' : 'ROLLBACK_CONFIRMED',
        affectedRows, dispatchPermitConsumed: permitConsumed, error: error.message,
        requiresReadbackReconciliation: error.requiresReadbackReconciliation }); }
      catch (outcomeError) { error.outcomeError = normalizeFailure(outcomeError); error.requiresReadbackReconciliation = true; }
    }
    throw error;
  }
}
