import {
  ARMOR_SHROOMITE_RELATION_ITEM_REFRESH_OPERATION_ID,
  ARMOR_SHROOMITE_RELATION_ITEM_TARGET_IDS,
  ARMOR_SHROOMITE_RELATION_ITEM_UPDATE_COLUMNS,
  comparableArmorShroomiteRelationItemRow,
  validateArmorShroomiteRelationItemRefreshProposal,
} from './armor-shroomite-relation-item-refresh.mjs';

export const ARMOR_SHROOMITE_RELATION_ITEM_REFRESH_EXECUTION_SCHEMA = 'armor-shroomite-relation-item-refresh-execution/v1';
const TABLE = '`terria_v1_relation`.`relation_items`';

function targetParams() {
  return [...ARMOR_SHROOMITE_RELATION_ITEM_TARGET_IDS];
}

function assertRows(rows, label) {
  if (!Array.isArray(rows)) throw new Error(`Shroomite relation-item ${label} snapshot is malformed`);
  const byId = new Map();
  for (const row of rows) {
    const sourceId = Number(row?.source_id);
    if (!ARMOR_SHROOMITE_RELATION_ITEM_TARGET_IDS.includes(sourceId) || byId.has(sourceId)) {
      throw new Error(`Shroomite relation-item ${label} contains an invalid or duplicate target`);
    }
    if (Number(row.status) !== 1 || Number(row.deleted) !== 0) {
      throw new Error(`Shroomite relation-item ${label} contains an inactive target`);
    }
    byId.set(sourceId, row);
  }
  if (byId.size !== ARMOR_SHROOMITE_RELATION_ITEM_TARGET_IDS.length) {
    throw new Error(`Shroomite relation-item ${label} must contain exactly five targets`);
  }
  return byId;
}

export async function readArmorShroomiteRelationItemRefreshSnapshot({ connection, proposal, forUpdate = false } = {}) {
  validateShroomiteProposal(proposal);
  if (typeof connection?.query !== 'function') throw new Error('Shroomite relation-item snapshot requires query capability');
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const [rows] = await connection.query(
    `SELECT * FROM ${TABLE} WHERE source_id IN (?, ?, ?, ?, ?) AND status = 1 AND deleted = 0 ORDER BY source_id${lock}`,
    targetParams(),
  );
  assertRows(rows, 'relation item');
  return { relationItems: rows };
}

function validateShroomiteProposal(proposal) {
  validateArmorShroomiteRelationItemRefreshProposal(proposal);
  if (proposal.operationId !== ARMOR_SHROOMITE_RELATION_ITEM_REFRESH_OPERATION_ID) {
    throw new Error('Shroomite relation-item transaction operation drifted');
  }
}

function assertBaseline(snapshot, proposal) {
  const actual = assertRows(snapshot.relationItems, 'locked relation item');
  const expected = new Map(proposal.changes.relationItems.updates.map(change => [Number(change.before.source_id), change.before]));
  for (const id of ARMOR_SHROOMITE_RELATION_ITEM_TARGET_IDS) {
    const row = actual.get(id);
    const before = expected.get(id);
    if (!before || !isDeepStrictEqual(comparableArmorShroomiteRelationItemRow(row), comparableArmorShroomiteRelationItemRow(before))) {
      throw new Error(`Shroomite relation-item baseline drifted for ${id}`);
    }
  }
}

function assertAfter(snapshot, proposal) {
  const actual = assertRows(snapshot.relationItems, 'after relation item');
  for (const change of proposal.changes.relationItems.updates) {
    const id = Number(change.after.source_id);
    const row = actual.get(id);
    if (!row || !isDeepStrictEqual(comparableArmorShroomiteRelationItemRow(row), comparableArmorShroomiteRelationItemRow(change.after))) {
      throw new Error(`Shroomite relation-item after-set readback drifted for ${id}`);
    }
  }
}

function updateValues(after) {
  return ARMOR_SHROOMITE_RELATION_ITEM_UPDATE_COLUMNS.map(column => (
    column === 'source_revision_timestamp' ? toMysqlDateTime(after[column]) : after[column]
  ));
}

function toMysqlDateTime(value) {
  if (value == null) return null;
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) return text;
  const date = value instanceof Date ? value : new Date(text);
  if (Number.isNaN(date.getTime())) throw new Error('Shroomite relation-item source revision timestamp is invalid');
  return new Date(date.getTime() + (8 * 60 * 60 * 1000)).toISOString().slice(0, 19).replace('T', ' ');
}

export async function executeArmorShroomiteRelationItemRefreshTransaction({
  connection,
  proposal,
  assertRuntimeFence,
  consumePermit,
  persistPrepared,
  persistOutcome,
} = {}) {
  if (!connection || ['query', 'execute', 'beginTransaction', 'commit', 'rollback'].some(key => typeof connection[key] !== 'function')
      || [assertRuntimeFence, consumePermit, persistPrepared, persistOutcome].some(fn => typeof fn !== 'function')) {
    throw new Error('Shroomite relation-item transaction adapters are required');
  }
  validateShroomiteProposal(proposal);
  const evidence = {
    schemaVersion: ARMOR_SHROOMITE_RELATION_ITEM_REFRESH_EXECUTION_SCHEMA,
    operationId: ARMOR_SHROOMITE_RELATION_ITEM_REFRESH_OPERATION_ID,
    proposalSha256: proposal.proposalSha256,
    serverUuid: proposal.serverUuid,
    targetItemSourceIds: [...ARMOR_SHROOMITE_RELATION_ITEM_TARGET_IDS],
  };
  let began = false;
  let prepared = false;
  let committing = false;
  let committed = false;
  let permitAttempted = false;
  let permitConsumed = false;
  let affectedRows = 0;
  const receipts = [];
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.beginTransaction();
    began = true;
    await assertRuntimeFence();
    const locked = await readArmorShroomiteRelationItemRefreshSnapshot({ connection, proposal, forUpdate: true });
    assertBaseline(locked, proposal);
    await assertRuntimeFence();
    await persistPrepared({ ...structuredClone(evidence), status: 'PREPARED' });
    prepared = true;
    permitAttempted = true;
    await consumePermit();
    permitConsumed = true;

    for (const change of proposal.changes.relationItems.updates) {
      const columns = [...ARMOR_SHROOMITE_RELATION_ITEM_UPDATE_COLUMNS];
      const assignments = columns.map(column => `\`${column}\` = ?`).join(', ');
      const [result] = await connection.execute(
        `UPDATE ${TABLE} SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND source_id = ? AND record_key = ? AND status = 1 AND deleted = 0`,
        [...updateValues(change.after), change.before.id, change.before.source_id, change.before.record_key],
      );
      if (result?.affectedRows !== 1) throw new Error(`Shroomite relation-item update receipt is invalid for ${change.before.source_id}`);
      receipts.push({ table: 'relation_items', id: Number(change.before.id), sourceId: Number(change.before.source_id), recordKey: change.before.record_key });
      affectedRows += 1;
    }

    const after = await readArmorShroomiteRelationItemRefreshSnapshot({ connection, proposal, forUpdate: true });
    assertAfter(after, proposal);
    await assertRuntimeFence();
    committing = true;
    await connection.commit();
    committed = true;
    const result = { ...structuredClone(evidence), status: 'COMMITTED', affectedRows, receipts, dispatchPermitConsumed: true };
    await persistOutcome(result);
    return result;
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
      try {
        await persistOutcome({ ...structuredClone(evidence), status, affectedRows, receipts,
          dispatchPermitConsumed: error.dispatchPermitConsumed,
          requiresReadbackReconciliation: error.requiresReadbackReconciliation,
          error: error.message });
      } catch { error.requiresReadbackReconciliation = true; }
    }
    throw error;
  }
}
import { isDeepStrictEqual } from 'node:util';
