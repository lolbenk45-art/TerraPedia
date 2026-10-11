import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import {
  ARMOR_MISSING_ATTRIBUTE_MAINT_CANDIDATE_SCHEMA,
  validateArmorMissingAttributeMaintCandidate,
} from './armor-missing-attribute-maint-candidate.mjs';

const OPERATION = 'canonical-armor-missing-attribute-source';
const TABLES = {
  currentLanding: ['terria_v1_maint', 'source_dataset_landings'],
  currentMaintRows: ['terria_v1_maint', 'maint_armor_attribute_rows'],
};
const GENERATED = new Set(['id', 'created_at', 'updated_at', 'current_slot']);
const HASH = /^sha256:[a-f0-9]{64}$/;

function stable(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}

const hashJson = value => `sha256:${createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex')}`;
const tableSql = key => TABLES[key].map(part => `\`${part}\``).join('.');
const positive = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;

function comparable(value) {
  return stable(Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['id', 'created_at', 'updated_at', 'current_slot'].includes(key))
    .map(([key, rowValue]) => [
      key,
      rowValue != null && /(?:_at|_timestamp)$/.test(key)
        ? new Date(rowValue instanceof Date ? rowValue.toISOString() : rowValue).toISOString()
        : rowValue,
    ])));
}

function equalRows(left, right) {
  return isDeepStrictEqual(comparable(left), comparable(right));
}

export function buildArmorMissingAttributeSourceProposal({ candidate, serverUuid } = {}) {
  validateArmorMissingAttributeMaintCandidate(candidate);
  if (typeof serverUuid !== 'string' || serverUuid.trim() === '') throw new Error('Armor missing-attribute server UUID is required');
  const body = {
    schemaVersion: 'armor-missing-attribute-source-proposal/v1',
    operationId: OPERATION,
    serverUuid,
    candidate: structuredClone(candidate),
  };
  return { ...body, proposalSha256: hashJson(body) };
}

export function validateArmorMissingAttributeSourceProposal(proposal) {
  if (!proposal || proposal.schemaVersion !== 'armor-missing-attribute-source-proposal/v1'
      || proposal.operationId !== OPERATION || !HASH.test(proposal.proposalSha256 ?? '')) {
    throw new Error('Armor missing-attribute source proposal identity is invalid');
  }
  const { proposalSha256, ...body } = proposal;
  if (hashJson(body) !== proposalSha256) throw new Error('Armor missing-attribute source proposal hash drifted');
  validateArmorMissingAttributeMaintCandidate(proposal.candidate);
  return true;
}

export async function readArmorMissingAttributeSourceSnapshot({ connection, candidate, forUpdate = false }) {
  const source = candidate.proposedLanding.source_key;
  const recordKeys = candidate.maintRows.map(row => row.record_key);
  const [landings] = await connection.query(
    `SELECT * FROM ${tableSql('currentLanding')} WHERE \`provider\` = ? COLLATE utf8mb4_0900_ai_ci AND \`source_key\` = ? COLLATE utf8mb4_0900_ai_ci ORDER BY \`id\`${forUpdate ? ' FOR UPDATE' : ''}`,
    [candidate.proposedLanding.provider, source],
  );
  const [maintRows] = await connection.query(
    `SELECT * FROM ${tableSql('currentMaintRows')} WHERE \`landing_source_key\` = ? COLLATE utf8mb4_0900_ai_ci OR \`record_key\` IN (${recordKeys.map(() => '?').join(', ')}) ORDER BY \`id\`${forUpdate ? ' FOR UPDATE' : ''}`,
    [source, ...recordKeys],
  );
  if (landings.some(row => row.provider !== candidate.proposedLanding.provider || row.source_key !== source)) {
    throw new Error('Armor missing-attribute landing namespace drift');
  }
  return { currentLanding: landings, currentMaintRows: maintRows };
}

async function checkStorage(connection, proposal) {
  const [servers] = await connection.query('SELECT @@server_uuid AS serverUuid, @@max_allowed_packet AS maxAllowedPacket');
  if (servers?.length !== 1 || servers[0].serverUuid !== proposal.serverUuid || !positive(servers[0].maxAllowedPacket)) {
    throw new Error('Armor missing-attribute server or packet-limit drift');
  }
  const [engines] = await connection.query("SELECT TABLE_SCHEMA AS databaseName, TABLE_NAME AS tableName, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'terria_v1_maint' AND TABLE_NAME IN ('source_dataset_landings', 'maint_armor_attribute_rows')");
  if (!Array.isArray(engines) || engines.length !== 2 || engines.some(row => row.engine !== 'InnoDB')) {
    throw new Error('Armor missing-attribute target tables must be InnoDB');
  }
  for (const row of proposal.candidate.changes.landing.inserts.concat(proposal.candidate.changes.maint.inserts)) {
    const size = Object.entries(row).reduce((total, [key, value]) => total + Buffer.byteLength(key) + Buffer.byteLength(value == null ? '' : String(value)) + 32, 4096);
    if (size >= Number(servers[0].maxAllowedPacket)) throw new Error('Armor missing-attribute insert exceeds max_allowed_packet');
  }
}

function assertSnapshotMatchesCandidate(snapshot, candidate) {
  if (snapshot.currentLanding.length > 1) throw new Error('Armor missing-attribute landing identity is duplicate');
  const landing = snapshot.currentLanding[0];
  const expectedLanding = candidate.proposedLanding;
  if (landing && !equalRows(expectedLanding, landing)) throw new Error('Armor missing-attribute landing immutable drift');
  const byKey = new Map(snapshot.currentMaintRows.map(row => [row.record_key, row]));
  for (const expected of candidate.maintRows) {
    const actual = byKey.get(expected.record_key);
    if (actual && !equalRows({ ...expected, landing_source_id: landing?.id ?? expected.landing_source_id }, actual)) {
      throw new Error(`Armor missing-attribute maint immutable drift: ${expected.record_key}`);
    }
  }
  if (snapshot.currentMaintRows.some(row => row.landing_source_key === expectedLanding.source_key
      && !candidate.maintRows.some(expected => expected.record_key === row.record_key))) {
    throw new Error('Armor missing-attribute owned maint namespace drift');
  }
}

export async function executeArmorMissingAttributeSourceTransaction({
  connection, proposal, assertRuntimeFence, consumePermit, persistPrepared, persistOutcome,
} = {}) {
  if (['query', 'execute', 'beginTransaction', 'commit', 'rollback'].some(key => typeof connection?.[key] !== 'function')
      || [assertRuntimeFence, consumePermit, persistPrepared, persistOutcome].some(fn => typeof fn !== 'function')) {
    throw new Error('Armor missing-attribute connection/authorization/permit/evidence adapters are required');
  }
  validateArmorMissingAttributeSourceProposal(proposal);
  let candidate = structuredClone(proposal.candidate);
  const evidence = { schemaVersion: 'armor-missing-attribute-source-execution/v1', operationId: OPERATION,
    proposalSha256: proposal.proposalSha256, serverUuid: proposal.serverUuid, sourceKey: candidate.proposedLanding.source_key };
  let began = false; let prepared = false; let committing = false; let committed = false;
  let permitAttempted = false; let permitConsumed = false; let affectedRows = 0;
  const receipts = [];
  const insert = async (key, row) => {
    if (row.id != null) return row.id;
    const columns = Object.keys(row).filter(column => !GENERATED.has(column)).sort();
    const values = columns.map(column => row[column] != null && /(?:_at|_timestamp)$/.test(column) ? new Date(row[column]) : row[column]);
    const [receipt] = await connection.execute(`INSERT INTO ${tableSql(key)} (${columns.map(column => `\`${column}\``).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, values);
    if (receipt?.affectedRows !== 1 || !positive(receipt.insertId)) throw new Error('Armor missing-attribute insert receipt/ID is invalid');
    receipts.push({ table: key, id: receipt.insertId, key: key === 'currentLanding' ? row.source_key : row.record_key });
    affectedRows++;
    return receipt.insertId;
  };
  const readAfter = async forUpdate => {
    const snapshot = await readArmorMissingAttributeSourceSnapshot({ connection, candidate, forUpdate });
    assertSnapshotMatchesCandidate(snapshot, candidate);
    if (snapshot.currentLanding.length !== 1) throw new Error('Armor missing-attribute landing after-set is not exact');
    for (const receipt of receipts) {
      const rows = receipt.table === 'currentLanding' ? snapshot.currentLanding : snapshot.currentMaintRows;
      const found = rows.find(row => (receipt.table === 'currentLanding' ? row.source_key : row.record_key) === receipt.key);
      if (!found || found.id !== receipt.id) throw new Error('Armor missing-attribute insert ID readback mismatch');
    }
    return { landingId: snapshot.currentLanding[0].id, maintIds: candidate.maintRows.map(row => snapshot.currentMaintRows.find(item => item.record_key === row.record_key)?.id) };
  };
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.beginTransaction(); began = true;
    await assertRuntimeFence();
    const locked = await readArmorMissingAttributeSourceSnapshot({ connection, candidate, forUpdate: true });
    assertSnapshotMatchesCandidate(locked, candidate);
    const lockedLanding = locked.currentLanding[0];
    const lockedMaintByKey = new Map(locked.currentMaintRows.map(row => [row.record_key, row]));
    candidate = {
      ...candidate,
      proposedLanding: lockedLanding ? { ...candidate.proposedLanding, id: lockedLanding.id } : candidate.proposedLanding,
      maintRows: candidate.maintRows.map(row => {
        const existing = lockedMaintByKey.get(row.record_key);
        return existing ? { ...row, id: existing.id, landing_source_id: lockedLanding?.id ?? row.landing_source_id } : row;
      }),
    };
    await checkStorage(connection, proposal);
    await assertRuntimeFence();
    await persistPrepared({ ...structuredClone(evidence), status: 'PREPARED' }); prepared = true;
    permitAttempted = true;
    await consumePermit(); permitConsumed = true;
    const landingId = await insert('currentLanding', candidate.proposedLanding);
    for (const row of candidate.maintRows) await insert('currentMaintRows', { ...row, landing_source_id: landingId });
    await readAfter(true);
    await assertRuntimeFence();
    committing = true;
    await connection.commit(); committed = true;
    const bindings = await readAfter(false);
    const result = { ...structuredClone(evidence), status: 'COMMITTED', affectedRows, bindings,
      dispatchPermitConsumed: true, acceptance: 'missing-attribute-source-persistence-only' };
    await persistOutcome(structuredClone(result));
    return result;
  } catch (cause) {
    const error = cause instanceof Error && Object.isExtensible(cause) ? cause : new Error(String(cause?.message ?? cause), { cause });
    error.suppressedErrors = [];
    error.transactionCommitted = committed ? true : committing ? null : false;
    error.requiresReadbackReconciliation = committing;
    error.dispatchPermitConsumed = permitConsumed ? true : permitAttempted ? null : false;
    let status = committed ? 'COMMITTED_READBACK_REQUIRED' : committing ? 'COMMIT_UNKNOWN' : 'NOT_STARTED';
    if (began && !committing) {
      try { await connection.rollback(); status = 'ROLLBACK_CONFIRMED'; }
      catch (failure) { error.suppressedErrors.push(failure); error.requiresReadbackReconciliation = true; status = 'ROLLBACK_UNKNOWN'; }
    }
    if (prepared) {
      try { await persistOutcome({ ...structuredClone(evidence), status, affectedRows, receipts: structuredClone(receipts),
        dispatchPermitConsumed: error.dispatchPermitConsumed, requiresReadbackReconciliation: error.requiresReadbackReconciliation, error: error.message }); }
      catch (failure) { error.suppressedErrors.push(failure); error.requiresReadbackReconciliation = true; }
    }
    throw error;
  }
}
