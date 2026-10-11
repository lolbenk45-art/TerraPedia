import {
  ARMOR_ATTRIBUTE_RELATION_PUBLICATION_OPERATION_ID,
  ARMOR_ATTRIBUTE_RELATION_TARGET_IDS,
  comparableArmorAttributeRelationRow,
  validateArmorAttributeRelationPublicationProposal,
} from './armor-attribute-relation-publication.mjs';

const ATTRIBUTE_TABLE = '`terria_v1_relation`.`relation_armor_attribute_rows`';
const EFFECT_TABLE = '`terria_v1_relation`.`relation_equipment_effect_attributes`';
const GENERATED = new Set(['id', 'created_at', 'updated_at']);
const NUMERIC = new Set(['item_id', 'source_maint_id', 'landing_source_id', 'owner_id', 'source_line_index', 'effect_index', 'status', 'deleted']);

function placeholders(values) { return values.map(() => '?').join(', '); }
function comparable(row) { return comparableArmorAttributeRelationRow(row); }
function normalize(value, column) {
  if (value == null) return null;
  if (NUMERIC.has(column)) return Number(value);
  if (column.endsWith('_timestamp') || column.endsWith('_at')) {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
  }
  return value;
}
function same(left, right) {
  const normalizeRow = row => Object.fromEntries(Object.keys(row ?? {}).filter(key => !GENERATED.has(key)).sort()
    .map(key => [key, normalize(row[key], key)]));
  return JSON.stringify(normalizeRow(left)) === JSON.stringify(normalizeRow(right));
}
function exactRows(rows, label) {
  if (!Array.isArray(rows)) throw new Error(`Armor attribute ${label} snapshot is invalid`);
  const byId = new Map();
  for (const row of rows) {
    const id = Number(row?.item_id ?? row?.owner_id);
    if (!ARMOR_ATTRIBUTE_RELATION_TARGET_IDS.includes(id) || !Number(row.status) || Number(row.deleted)) {
      throw new Error(`Armor attribute ${label} contains a foreign or inactive row`);
    }
    const key = `${row.item_id ?? row.owner_id}:${row.record_key}`;
    if (byId.has(key)) throw new Error(`Armor attribute ${label} contains duplicate rows`);
    byId.set(key, row);
  }
  return rows;
}

export async function readArmorAttributeRelationPublicationSnapshot({ connection, forUpdate = false } = {}) {
  if (typeof connection?.query !== 'function') throw new Error('Armor attribute relation snapshot requires query capability');
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const ids = [...ARMOR_ATTRIBUTE_RELATION_TARGET_IDS];
  const [attributes] = await connection.query(
    `SELECT * FROM ${ATTRIBUTE_TABLE} WHERE item_id IN (${placeholders(ids)}) AND status = 1 AND deleted = 0 ORDER BY item_id, id${lock}`,
    ids,
  );
  const [effects] = await connection.query(
    `SELECT * FROM ${EFFECT_TABLE} WHERE owner_id IN (${placeholders(ids)}) AND owner_kind = 'item' AND source_kind = 'armor_attribute_cell' ORDER BY owner_id, id${lock}`,
    ids,
  );
  exactRows(attributes, 'relation attribute');
  exactRows(effects, 'relation effect');
  return { relationArmorAttributeRows: attributes, relationEquipmentEffectAttributes: effects };
}

function expectedRows(current, changes) {
  const rows = new Map(current.map(row => [row.record_key, row]));
  for (const change of changes.updates) rows.set(change.before.record_key, { ...change.before, ...change.after });
  for (const row of changes.inserts) rows.set(row.record_key, row);
  return [...rows.values()].sort((left, right) => String(left.record_key).localeCompare(String(right.record_key)));
}

function columns(row) { return Object.keys(row).filter(column => !GENERATED.has(column)).sort(); }
function sqlValue(value, column) {
  if (value != null && (column.endsWith('_timestamp') || column.endsWith('_at'))) return new Date(value);
  return value;
}
async function insert(connection, table, row) {
  const names = columns(row);
  const [receipt] = await connection.execute(
    `INSERT INTO ${table} (${names.map(name => `\`${name}\``).join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
    names.map(name => sqlValue(row[name], name)),
  );
  if (Number(receipt?.affectedRows) !== 1) throw new Error('Armor attribute relation insert receipt is invalid');
}
async function update(connection, table, change) {
  const names = Object.keys(change.after).filter(column => !['id', 'record_key', 'created_at', 'updated_at'].includes(column)).sort();
  const [receipt] = await connection.execute(
    `UPDATE ${table} SET ${names.map(name => `\`${name}\` = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND record_key = ? AND status = 1 AND deleted = 0`,
    [...names.map(name => sqlValue(change.after[name], name)), change.before.id, change.before.record_key],
  );
  if (Number(receipt?.affectedRows) !== 1) throw new Error('Armor attribute relation update receipt is invalid');
}
function assertAfter(before, after, proposal) {
  const expectedAttributes = expectedRows(before.relationArmorAttributeRows, proposal.changes.relationArmorAttributeRows);
  const expectedEffects = expectedRows(before.relationEquipmentEffectAttributes, proposal.changes.relationEquipmentEffectAttributes);
  const actualAttributes = [...after.relationArmorAttributeRows].sort((a, b) => String(a.record_key).localeCompare(String(b.record_key)));
  const actualEffects = [...after.relationEquipmentEffectAttributes].sort((a, b) => String(a.record_key).localeCompare(String(b.record_key)));
  if (JSON.stringify(expectedAttributes.map(comparable)) !== JSON.stringify(actualAttributes.map(comparable))) {
    throw new Error('Armor attribute relation attribute after-set readback mismatch');
  }
  if (JSON.stringify(expectedEffects.map(comparable)) !== JSON.stringify(actualEffects.map(comparable))) {
    throw new Error('Armor attribute relation effect after-set readback mismatch');
  }
}

export async function executeArmorAttributeRelationPublicationTransaction({
  connection, proposal, rederive, assertRuntimeFence, consumePermit, persistPrepared, persistOutcome,
} = {}) {
  if (!connection || ['query', 'execute', 'beginTransaction', 'commit', 'rollback'].some(key => typeof connection[key] !== 'function')
      || [rederive, assertRuntimeFence, consumePermit, persistPrepared, persistOutcome].some(fn => typeof fn !== 'function')) {
    throw new Error('Armor attribute relation transaction adapters are required');
  }
  validateArmorAttributeRelationPublicationProposal(proposal);
  const evidence = { schemaVersion: 'armor-attribute-relation-publication-execution/v1',
    operationId: ARMOR_ATTRIBUTE_RELATION_PUBLICATION_OPERATION_ID, proposalSha256: proposal.proposalSha256,
    serverUuid: proposal.serverUuid, targetItemSourceIds: [...ARMOR_ATTRIBUTE_RELATION_TARGET_IDS] };
  let began = false; let prepared = false; let committing = false; let committed = false;
  let permitAttempted = false; let permitConsumed = false; let affectedRows = 0;
  const before = await readArmorAttributeRelationPublicationSnapshot({ connection });
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.beginTransaction(); began = true;
    await assertRuntimeFence();
    const locked = await readArmorAttributeRelationPublicationSnapshot({ connection, forUpdate: true });
    const lockedProposal = await rederive({ connection, lockedSnapshot: locked });
    if (lockedProposal.proposalSha256 !== proposal.proposalSha256) throw new Error('Armor attribute relation locked proposal drifted');
    await assertRuntimeFence();
    await persistPrepared({ ...structuredClone(evidence), status: 'PREPARED' }); prepared = true;
    permitAttempted = true; await consumePermit(); permitConsumed = true;
    for (const row of proposal.candidate.changes.relationArmorAttributeRows.inserts) { await insert(connection, ATTRIBUTE_TABLE, row); affectedRows += 1; }
    for (const change of proposal.candidate.changes.relationArmorAttributeRows.updates) { await update(connection, ATTRIBUTE_TABLE, change); affectedRows += 1; }
    for (const row of proposal.candidate.changes.relationEquipmentEffectAttributes.inserts) { await insert(connection, EFFECT_TABLE, row); affectedRows += 1; }
    for (const change of proposal.candidate.changes.relationEquipmentEffectAttributes.updates) { await update(connection, EFFECT_TABLE, change); affectedRows += 1; }
    const after = await readArmorAttributeRelationPublicationSnapshot({ connection, forUpdate: true });
    assertAfter(before, after, proposal.candidate);
    await assertRuntimeFence(); committing = true; await connection.commit(); committed = true;
    const result = { ...structuredClone(evidence), status: 'COMMITTED', affectedRows, dispatchPermitConsumed: true };
    await persistOutcome(result); return result;
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    error.transactionCommitted = committed ? true : committing ? null : false;
    error.requiresReadbackReconciliation = committing;
    error.dispatchPermitConsumed = permitConsumed ? true : permitAttempted ? null : false;
    if (began && !committing) {
      try { await connection.rollback(); } catch { error.requiresReadbackReconciliation = true; }
    }
    if (prepared) {
      const status = committed ? 'COMMITTED_READBACK_REQUIRED' : committing ? 'COMMIT_UNKNOWN' : 'ROLLBACK_CONFIRMED';
      try { await persistOutcome({ ...structuredClone(evidence), status, affectedRows,
        dispatchPermitConsumed: error.dispatchPermitConsumed, requiresReadbackReconciliation: error.requiresReadbackReconciliation, error: error.message }); }
      catch { error.requiresReadbackReconciliation = true; }
    }
    throw error;
  }
}
