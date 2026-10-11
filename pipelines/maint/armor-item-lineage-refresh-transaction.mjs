import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import {
  ARMOR_ITEM_LINEAGE_REFRESH_OPERATION_ID,
  ARMOR_ITEM_LINEAGE_SOURCE_KEY,
  ARMOR_ITEM_LINEAGE_SOURCE_PAGE,
  ARMOR_ITEM_LINEAGE_TARGET_IDS,
  buildArmorItemLineageRefreshCandidate,
  comparableArmorItemLineageRow,
  validateArmorItemLineageRefreshCandidate,
} from './armor-item-lineage-refresh.mjs';

const TABLES = Object.freeze({
  localLanding: ['terria_v1_local', 'source_dataset_landings'],
  maintLanding: ['terria_v1_maint', 'source_dataset_landings'],
  maintItems: ['terria_v1_maint', 'maint_items'],
});
const GENERATED = new Set(['id', 'created_at', 'updated_at', 'current_slot']);
const positive = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const canonical = value => value instanceof Date ? value.toISOString()
  : Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
      : value;
const hash = value => `sha256:${createHash('sha256').update(JSON.stringify(canonical(value)), 'utf8').digest('hex')}`;
const quote = value => value.split('.').map(part => `\`${part}\``).join('.');

function assertServer(serverUuid) {
  if (typeof serverUuid !== 'string' || serverUuid.trim() === '') throw new Error('Armor Iteminfo lineage server UUID is required');
}
function snapshotRows(rows, label) {
  if (!Array.isArray(rows)) throw new Error(`Armor Iteminfo lineage ${label} snapshot is required`);
  return rows;
}

export function buildArmorItemLineageRefreshProposal({ candidate, serverUuid } = {}) {
  validateArmorItemLineageRefreshCandidate(candidate);
  assertServer(serverUuid);
  const body = {
    schemaVersion: 'armor-item-lineage-refresh-proposal/v1',
    operationId: ARMOR_ITEM_LINEAGE_REFRESH_OPERATION_ID,
    executable: false,
    databaseWrites: false,
    applyAllowed: false,
    serverUuid,
    candidate,
  };
  return { ...body, proposalSha256: hash(body) };
}

export function validateArmorItemLineageRefreshProposal(proposal) {
  const { proposalSha256, ...body } = proposal ?? {};
  if (!/^sha256:[a-f0-9]{64}$/.test(proposalSha256 ?? '') || hash(body) !== proposalSha256
      || body.schemaVersion !== 'armor-item-lineage-refresh-proposal/v1'
      || body.operationId !== ARMOR_ITEM_LINEAGE_REFRESH_OPERATION_ID
      || body.executable !== false || body.databaseWrites !== false || body.applyAllowed !== false) {
    throw new Error('Armor Iteminfo lineage proposal identity or hash is invalid');
  }
  validateArmorItemLineageRefreshCandidate(body.candidate);
  assertServer(body.serverUuid);
  return true;
}

export async function readArmorItemLineageRefreshSnapshot({ connection, candidate, forUpdate = false } = {}) {
  validateArmorItemLineageRefreshCandidate(candidate);
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const [localRows] = await connection.query(
    `SELECT * FROM ${quote(TABLES.localLanding.join('.'))} WHERE dataset_type = ? AND provider = ? AND source_key = ? AND source_page = ? ORDER BY id${lock}`,
    [candidate.proposedLanding.dataset_type, candidate.proposedLanding.provider, candidate.proposedLanding.source_key, candidate.proposedLanding.source_page],
  );
  const [maintLandingRows] = await connection.query(
    `SELECT * FROM ${quote(TABLES.maintLanding.join('.'))} WHERE dataset_type = ? AND provider = ? AND source_key = ? AND source_page = ? ORDER BY id${lock}`,
    [candidate.proposedLanding.dataset_type, candidate.proposedLanding.provider, candidate.proposedLanding.source_key, candidate.proposedLanding.source_page],
  );
  const placeholders = ARMOR_ITEM_LINEAGE_TARGET_IDS.map(() => '?').join(', ');
  const [maintItems] = await connection.query(
    `SELECT * FROM ${quote(TABLES.maintItems.join('.'))} WHERE source_id IN (${placeholders}) ORDER BY source_id${lock}`,
    ARMOR_ITEM_LINEAGE_TARGET_IDS,
  );
  return { localLanding: snapshotRows(localRows, 'local landing'), maintLanding: snapshotRows(maintLandingRows, 'maint landing'), maintItems: snapshotRows(maintItems, 'maint items') };
}

function expectedItemRows(candidate, maintLandingId) {
  return candidate.changes.maintItems.updates.map(change => ({
    ...change.after,
    landing_source_id: maintLandingId,
  }));
}

function assertBaseline(snapshot, candidate) {
  if (snapshot.localLanding.length !== 0 || snapshot.maintLanding.length !== 0) {
    throw new Error('Armor Iteminfo lineage landing namespace is already materialized');
  }
  const byId = new Map(snapshot.maintItems.map(row => [Number(row.source_id), row]));
  if (byId.size !== ARMOR_ITEM_LINEAGE_TARGET_IDS.length) throw new Error('Armor Iteminfo lineage maint item baseline is incomplete');
  for (const change of candidate.changes.maintItems.updates) {
    const current = byId.get(Number(change.before.source_id));
    if (!current || !isDeepStrictEqual(comparableArmorItemLineageRow(current), comparableArmorItemLineageRow(change.before))) {
      throw new Error(`Armor Iteminfo lineage maint item baseline drifted: ${change.before.source_id}`);
    }
  }
}

function assertAfter(snapshot, candidate, localLandingId, maintLandingId) {
  if (snapshot.localLanding.length !== 1 || snapshot.maintLanding.length !== 1) throw new Error('Armor Iteminfo lineage landing after-set is incomplete');
  if (Number(snapshot.localLanding[0].id) !== localLandingId || Number(snapshot.maintLanding[0].id) !== maintLandingId) throw new Error('Armor Iteminfo lineage landing receipt drifted');
  const byId = new Map(snapshot.maintItems.map(row => [Number(row.source_id), row]));
  for (const expected of expectedItemRows(candidate, maintLandingId)) {
    const actual = byId.get(Number(expected.source_id));
    if (!actual || !isDeepStrictEqual(comparableArmorItemLineageRow(actual), comparableArmorItemLineageRow(expected))) {
      throw new Error(`Armor Iteminfo lineage maint item readback drifted: ${expected.source_id}`);
    }
  }
}

function insertColumns(row) {
  return Object.keys(row).filter(key => !GENERATED.has(key));
}

export async function executeArmorItemLineageRefreshTransaction({
  connection,
  proposal,
  assertRuntimeFence,
  consumePermit,
  persistPrepared,
  persistOutcome,
} = {}) {
  if (!connection || ['query', 'execute', 'beginTransaction', 'commit', 'rollback'].some(key => typeof connection[key] !== 'function')
      || [assertRuntimeFence, consumePermit, persistPrepared, persistOutcome].some(fn => typeof fn !== 'function')) {
    throw new Error('Armor Iteminfo lineage transaction adapters are required');
  }
  validateArmorItemLineageRefreshProposal(proposal);
  let began = false; let prepared = false; let committing = false; let committed = false;
  let permitAttempted = false; let permitConsumed = false; let affectedRows = 0;
  const receipts = [];
  const evidence = { schemaVersion: 'armor-item-lineage-refresh-execution/v1', operationId: ARMOR_ITEM_LINEAGE_REFRESH_OPERATION_ID, proposalSha256: proposal.proposalSha256, serverUuid: proposal.serverUuid, targetItemSourceIds: [...ARMOR_ITEM_LINEAGE_TARGET_IDS] };
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.beginTransaction(); began = true;
    await assertRuntimeFence();
    const locked = await readArmorItemLineageRefreshSnapshot({ connection, candidate: proposal.candidate, forUpdate: true });
    assertBaseline(locked, proposal.candidate);
    await assertRuntimeFence();
    await persistPrepared({ ...structuredClone(evidence), status: 'PREPARED' }); prepared = true;
    permitAttempted = true;
    await consumePermit(); permitConsumed = true;

    const insertLanding = async (tableKey) => {
      const row = proposal.candidate.proposedLanding;
      const columns = insertColumns(row);
      const [result] = await connection.execute(
        `INSERT INTO ${quote(TABLES[tableKey].join('.'))} (${columns.map(column => `\`${column}\``).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
        columns.map(column => row[column]),
      );
      const id = Number(result?.insertId);
      if (result?.affectedRows !== 1 || !positive(id)) throw new Error(`Armor Iteminfo lineage ${tableKey} insert receipt is invalid`);
      receipts.push({ table: tableKey, id }); affectedRows++;
      return id;
    };
    const localLandingId = await insertLanding('localLanding');
    const maintLandingId = await insertLanding('maintLanding');
    for (const change of proposal.candidate.changes.maintItems.updates) {
      const after = { ...change.after, landing_source_id: maintLandingId };
      delete after.id; delete after.created_at; delete after.updated_at;
      const columns = Object.keys(after);
      const [result] = await connection.execute(
        `UPDATE ${quote(TABLES.maintItems.join('.'))} SET ${columns.map(column => `\`${column}\` = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND source_id = ? AND status = 1 AND deleted = 0`,
        [...columns.map(column => after[column]), change.before.id, change.before.source_id],
      );
      if (result?.affectedRows !== 1) throw new Error(`Armor Iteminfo lineage maint update receipt is invalid: ${change.before.source_id}`);
      receipts.push({ table: 'maintItems', id: Number(change.before.id), sourceId: Number(change.before.source_id) }); affectedRows++;
    }
    const after = await readArmorItemLineageRefreshSnapshot({ connection, candidate: proposal.candidate, forUpdate: true });
    assertAfter(after, proposal.candidate, localLandingId, maintLandingId);
    await assertRuntimeFence();
    committing = true;
    await connection.commit(); committed = true;
    const result = { ...structuredClone(evidence), status: 'COMMITTED', affectedRows, receipts, localLandingId, maintLandingId, dispatchPermitConsumed: true };
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
      try { await persistOutcome({ ...structuredClone(evidence), status, affectedRows, receipts, dispatchPermitConsumed: error.dispatchPermitConsumed, requiresReadbackReconciliation: error.requiresReadbackReconciliation, error: error.message }); } catch { error.requiresReadbackReconciliation = true; }
    }
    throw error;
  }
}
