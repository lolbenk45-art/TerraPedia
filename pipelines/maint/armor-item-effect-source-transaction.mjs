import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { buildArmorItemEffectMaintCandidate, bindArmorItemEffectMaintReadback } from './armor-item-effect-maint-candidate.mjs';

const OPERATION = 'canonical-armor-item-effect-source';
const TABLES = {
  currentLocalLandings: ['terria_v1_local', 'source_dataset_landings'],
  currentMaintLandings: ['terria_v1_maint', 'source_dataset_landings'],
  currentMaintRows: ['terria_v1_maint', 'maint_armor_attribute_rows'],
};
const canonical = value => value instanceof Date ? value.toISOString() : Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const hash = value => `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
const positive = value => Number.isSafeInteger(value) && value > 0;
const tableSql = key => TABLES[key].map(part => `\`${part}\``).join('.');
const generated = new Set(['id', 'created_at', 'updated_at', 'current_slot']);

function sourceInput(proposal) {
  const payload = JSON.parse(proposal.candidate.localLandingRow.payload_json);
  if (payload.schemaVersion !== 'armor-item-effect-source/v1') throw new Error('Armor item-source payload schema drift');
  const source = { targetGameVersion: payload.targetGameVersion };
  for (const key of ['page', 'iteminfo', 'armorSets']) {
    const artifact = payload.artifacts[key];
    const bytes = Buffer.from(artifact.bytesBase64, 'base64');
    if (bytes.toString('base64') !== artifact.bytesBase64) throw new Error('Armor item-source artifact encoding drift');
    source[key] = { bytes, expected: artifact.expected };
  }
  return { source, parsedAt: proposal.parsedAt, ...structuredClone(proposal.beforeRows) };
}

export function buildArmorItemEffectSourceProposal({ input, serverUuid }) {
  if (typeof serverUuid !== 'string' || !serverUuid.trim() || serverUuid !== serverUuid.trim()) throw new Error('Armor item-source server UUID is required');
  const candidate = buildArmorItemEffectMaintCandidate(input);
  const sourceKey = candidate.maintLandingRow.source_key;
  for (const key of Object.keys(TABLES)) {
    if (input[key].some(row => row[key === 'currentMaintRows' ? 'landing_source_key' : 'source_key'] !== sourceKey)) {
      throw new Error('Armor item-source proposal baseline is outside its exact namespace');
    }
  }
  const body = { schemaVersion: 'armor-item-effect-source-proposal/v1', operationId: OPERATION, serverUuid,
    parsedAt: input.parsedAt, beforeRows: Object.fromEntries(Object.keys(TABLES).map(key => [key, canonical(input[key])])),
    candidate: canonical(candidate) };
  return { ...body, proposalSha256: hash(body) };
}

export function validateArmorItemEffectSourceProposal(proposal) {
  const rebuilt = buildArmorItemEffectSourceProposal({ input: sourceInput(proposal), serverUuid: proposal.serverUuid });
  if (!isDeepStrictEqual(canonical(proposal), rebuilt)) throw new Error('Armor item-source proposal drift');
  return true;
}

export async function readArmorItemEffectSourceSnapshot({ connection, candidate, forUpdate = false }) {
  const sourceKey = candidate.maintLandingRow.source_key;
  const recordKeys = candidate.maintRows.map(row => row.record_key);
  const result = {};
  for (const key of Object.keys(TABLES)) {
    const isMaint = key === 'currentMaintRows';
    const column = isMaint ? 'landing_source_key' : 'source_key';
    const alternate = isMaint ? ` OR \`record_key\` IN (${recordKeys.map(() => '?').join(', ')})` : '';
    // Use the existing provider/source-key index, avoiding an unrelated payload scan
    // and unrelated landing range locks. Provider is part of the source identity.
    const provider = candidate.maintLandingRow.provider;
    const prefix = isMaint ? '' : '`provider` = ? COLLATE utf8mb4_0900_ai_ci AND ';
    const [rows] = await connection.query(`SELECT * FROM ${tableSql(key)} WHERE ${prefix}\`${column}\` = ? COLLATE utf8mb4_0900_ai_ci${alternate} ORDER BY \`id\`${forUpdate ? ' FOR UPDATE' : ''}`,
      isMaint ? [sourceKey, ...recordKeys] : [provider, sourceKey]);
    if (!Array.isArray(rows) || rows.some(row => row[column] !== sourceKey || !isMaint && row.provider !== provider)) {
      throw new Error('Armor item-source namespace collation/identity drift');
    }
    result[key] = rows;
  }
  return result;
}

async function checkStorage(connection, proposal) {
  const [servers] = await connection.query('SELECT @@server_uuid AS serverUuid, @@max_allowed_packet AS maxAllowedPacket');
  const server = servers?.[0];
  if (servers?.length !== 1 || server.serverUuid !== proposal.serverUuid || !positive(Number(server.maxAllowedPacket))) {
    throw new Error('Armor item-source server or packet-limit drift');
  }
  const [engines] = await connection.query("SELECT TABLE_SCHEMA AS databaseName, TABLE_NAME AS tableName, ENGINE AS engine FROM information_schema.TABLES WHERE (TABLE_SCHEMA = 'terria_v1_local' AND TABLE_NAME = 'source_dataset_landings') OR (TABLE_SCHEMA = 'terria_v1_maint' AND TABLE_NAME IN ('source_dataset_landings', 'maint_armor_attribute_rows'))");
  if (!Array.isArray(engines) || engines.length !== 3 || Object.values(TABLES).some(([database, table]) =>
    engines.filter(row => row.databaseName === database && row.tableName === table && row.engine === 'InnoDB').length !== 1)) {
    throw new Error('Armor item-source target tables must all be InnoDB');
  }
  for (const changes of Object.values(proposal.candidate.changes)) {
    for (const row of changes.inserts) {
      // Conservative bound for UTF-8 parameters plus statement/protocol metadata.
      const size = Object.entries(row).reduce((bytes, [key, value]) => bytes + Buffer.byteLength(key)
        + Buffer.byteLength(value == null ? '' : String(value)) + 32, 4096);
      if (size >= Number(server.maxAllowedPacket)) throw new Error('Armor item-source insert exceeds max_allowed_packet');
    }
  }
}

/** SQL protocol only. A registered runner must supply verified authorization and durable evidence adapters. */
export async function executeArmorItemEffectSourceTransaction({
  connection, proposal, assertRuntimeFence, consumePermit, persistPrepared, persistOutcome,
}) {
  if (['query', 'execute', 'beginTransaction', 'commit', 'rollback'].some(key => typeof connection?.[key] !== 'function')
      || [assertRuntimeFence, consumePermit, persistPrepared, persistOutcome].some(fn => typeof fn !== 'function')) {
    throw new Error('Armor item-source connection/authorization/permit/evidence adapters are required');
  }
  validateArmorItemEffectSourceProposal(proposal);
  const bound = structuredClone(proposal);
  const input = sourceInput(bound);
  let began = false; let prepared = false; let committing = false; let committed = false;
  let permitAttempted = false; let permitConsumed = false; let affectedRows = 0;
  const receipts = [];
  const evidence = { schemaVersion: 'armor-item-effect-source-execution/v1', operationId: OPERATION,
    proposalSha256: bound.proposalSha256, serverUuid: bound.serverUuid, sourceKey: bound.candidate.maintLandingRow.source_key };
  const insert = async (key, row) => {
    if (row.id != null) return row.id;
    const columns = Object.keys(row).filter(column => !generated.has(column)).sort();
    const values = columns.map(column => row[column] != null && /(?:_at|_timestamp)$/.test(column) ? new Date(row[column]) : row[column]);
    const [receipt] = await connection.execute(`INSERT INTO ${tableSql(key)} (${columns.map(column => `\`${column}\``).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, values);
    if (receipt?.affectedRows !== 1 || !positive(receipt.insertId)) throw new Error('Armor item-source insert receipt/ID is invalid');
    receipts.push({ table: key, id: receipt.insertId, key: key === 'currentMaintRows' ? row.record_key : row.source_key });
    affectedRows++;
    return receipt.insertId;
  };
  const readAfter = async forUpdate => {
    const rows = await readArmorItemEffectSourceSnapshot({ connection, candidate: bound.candidate, forUpdate });
    if (rows.currentLocalLandings.length !== 1 || rows.currentMaintLandings.length !== 1) throw new Error('Armor item-source landing after-set is not exact');
    for (const receipt of receipts) {
      const row = rows[receipt.table].find(row => (receipt.table === 'currentMaintRows' ? row.record_key : row.source_key) === receipt.key);
      if (row?.id !== receipt.id) throw new Error('Armor item-source insert ID readback mismatch');
    }
    bindArmorItemEffectMaintReadback({ input, candidate: bound.candidate,
      localLandingReadback: rows.currentLocalLandings[0], maintLandingReadback: rows.currentMaintLandings[0], maintReadback: rows.currentMaintRows });
    return { localLandingId: rows.currentLocalLandings[0].id, maintLandingId: rows.currentMaintLandings[0].id,
      maintIds: bound.candidate.maintRows.map(expected => rows.currentMaintRows.find(row => row.record_key === expected.record_key).id) };
  };
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.beginTransaction(); began = true;
    await assertRuntimeFence();
    const locked = await readArmorItemEffectSourceSnapshot({ connection, candidate: bound.candidate, forUpdate: true });
    const rederived = buildArmorItemEffectSourceProposal({ input: { ...input, ...locked }, serverUuid: bound.serverUuid });
    if (rederived.proposalSha256 !== bound.proposalSha256) throw new Error('Armor item-source locked proposal drift');
    await checkStorage(connection, bound);
    await assertRuntimeFence();
    await persistPrepared({ ...structuredClone(evidence), status: 'PREPARED' }); prepared = true;
    permitAttempted = true;
    await consumePermit(); permitConsumed = true;
    await insert('currentLocalLandings', bound.candidate.localLandingRow);
    const maintLandingId = await insert('currentMaintLandings', bound.candidate.maintLandingRow);
    for (const row of bound.candidate.maintRows) await insert('currentMaintRows', { ...row, landing_source_id: maintLandingId });
    await readAfter(true);
    await assertRuntimeFence();
    committing = true;
    await connection.commit(); committed = true;
    const bindings = await readAfter(false);
    const result = { ...structuredClone(evidence), status: 'COMMITTED', affectedRows, bindings,
      dispatchPermitConsumed: true, acceptance: 'source-persistence-only' };
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
