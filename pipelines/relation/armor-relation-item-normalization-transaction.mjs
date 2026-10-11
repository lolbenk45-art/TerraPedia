import { isDeepStrictEqual } from 'node:util';

import {
  ARMOR_RELATION_ITEM_NORMALIZATION_OPERATION_ID,
  ARMOR_RELATION_ITEM_NORMALIZATION_TARGET_IDS,
  validateArmorRelationItemNormalizationProposal,
} from './armor-relation-item-normalization.mjs';

const TABLE = '`terria_v1_relation`.`relation_items`';
function stable(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}

const comparable = row => stable(Object.fromEntries(Object.entries(row ?? {}).filter(([key]) => !['created_at', 'updated_at'].includes(key))));
const params = () => [...ARMOR_RELATION_ITEM_NORMALIZATION_TARGET_IDS];

export async function readArmorRelationItemNormalizationSnapshot({ connection, proposal, forUpdate = false } = {}) {
  validateArmorRelationItemNormalizationProposal(proposal);
  if (typeof connection?.query !== 'function') throw new Error('Armor relation-item normalization snapshot requires query capability');
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const [rows] = await connection.query(`SELECT * FROM ${TABLE} WHERE source_id IN (?, ?) AND status = 1 AND deleted = 0 ORDER BY source_id${lock}`, params());
  if (!Array.isArray(rows) || rows.length !== 2 || new Set(rows.map(row => Number(row.source_id))).size !== 2) throw new Error('Armor relation-item normalization relation baseline is incomplete');
  return { relationItems: rows };
}

function assertBaseline(snapshot, proposal) {
  const actual = new Map(snapshot.relationItems.map(row => [Number(row.source_id), row]));
  for (const change of proposal.changes.relationItems.updates) {
    const row = actual.get(Number(change.before.source_id));
    if (!row || !isDeepStrictEqual(comparable(row), comparable(change.before))) throw new Error(`Armor relation-item normalization baseline drifted for ${change.before.source_id}`);
  }
}

function assertAfter(snapshot, proposal) {
  const actual = new Map(snapshot.relationItems.map(row => [Number(row.source_id), row]));
  for (const change of proposal.changes.relationItems.updates) {
    const row = actual.get(Number(change.after.source_id));
    if (!row || !isDeepStrictEqual(comparable(row), comparable(change.after))) throw new Error(`Armor relation-item normalization after-set drifted for ${change.after.source_id}`);
  }
}

export async function executeArmorRelationItemNormalizationTransaction({ connection, proposal, assertRuntimeFence, consumePermit, persistPrepared, persistOutcome } = {}) {
  if (!connection || ['query', 'execute', 'beginTransaction', 'commit', 'rollback'].some(key => typeof connection[key] !== 'function')
      || [assertRuntimeFence, consumePermit, persistPrepared, persistOutcome].some(fn => typeof fn !== 'function')) throw new Error('Armor relation-item normalization transaction adapters are required');
  validateArmorRelationItemNormalizationProposal(proposal);
  const evidence = { schemaVersion: 'armor-relation-item-normalization-execution/v1', operationId: ARMOR_RELATION_ITEM_NORMALIZATION_OPERATION_ID, proposalSha256: proposal.proposalSha256, serverUuid: proposal.serverUuid, targetItemSourceIds: [...ARMOR_RELATION_ITEM_NORMALIZATION_TARGET_IDS] };
  let began = false; let prepared = false; let committing = false; let committed = false; let permitAttempted = false; let permitConsumed = false;
  const receipts = [];
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.beginTransaction(); began = true;
    await assertRuntimeFence();
    const locked = await readArmorRelationItemNormalizationSnapshot({ connection, proposal, forUpdate: true });
    assertBaseline(locked, proposal);
    await assertRuntimeFence();
    await persistPrepared({ ...structuredClone(evidence), status: 'PREPARED' }); prepared = true;
    permitAttempted = true; await consumePermit(); permitConsumed = true;
    for (const change of proposal.changes.relationItems.updates) {
      const [result] = await connection.execute(`UPDATE ${TABLE} SET defense_value = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND source_id = ? AND record_key = ? AND status = 1 AND deleted = 0`, [change.before.id, change.before.source_id, change.before.record_key]);
      if (result?.affectedRows !== 1) throw new Error(`Armor relation-item normalization update receipt is invalid for ${change.before.source_id}`);
      receipts.push({ table: 'relation_items', id: Number(change.before.id), sourceId: Number(change.before.source_id), recordKey: change.before.record_key });
    }
    const after = await readArmorRelationItemNormalizationSnapshot({ connection, proposal, forUpdate: true });
    assertAfter(after, proposal); await assertRuntimeFence(); committing = true; await connection.commit(); committed = true;
    const result = { ...structuredClone(evidence), status: 'COMMITTED', affectedRows: receipts.length, receipts, dispatchPermitConsumed: true };
    await persistOutcome(result); return result;
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    error.transactionCommitted = committed ? true : committing ? null : false; error.requiresReadbackReconciliation = committing; error.dispatchPermitConsumed = permitConsumed ? true : permitAttempted ? null : false;
    if (began && !committing) { try { await connection.rollback(); } catch { error.requiresReadbackReconciliation = true; } }
    if (prepared) { try { await persistOutcome({ ...structuredClone(evidence), status: committed ? 'COMMITTED_READBACK_REQUIRED' : committing ? 'COMMIT_UNKNOWN' : 'ROLLBACK_CONFIRMED', affectedRows: receipts.length, receipts, dispatchPermitConsumed: error.dispatchPermitConsumed, requiresReadbackReconciliation: error.requiresReadbackReconciliation, error: error.message }); } catch { error.requiresReadbackReconciliation = true; } }
    throw error;
  }
}
