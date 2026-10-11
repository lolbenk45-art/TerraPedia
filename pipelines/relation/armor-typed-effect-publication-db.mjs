import { createHash } from 'node:crypto';
import {
  ARMOR_TYPED_EFFECT_RELATION_OWNERSHIP,
  buildArmorTypedEffectPublicationPlan,
  validateArmorTypedEffectPublicationPlan,
} from './armor-typed-effect-publication.mjs';
import { readArmorItemEffectMaintSources } from '../maint/armor-item-effect-source-reader.mjs';
import { isArmorItemEffectMaintRow } from '../maint/armor-item-effect-source-reader.mjs';
import { buildArmorAttributeDispatch } from './sync-maint-to-relation.mjs';

const TABLE = 'relation_equipment_effect_attributes';
const QUALIFIED_TABLE = `terria_v1_relation.${TABLE}`;
const ACTIVE_TYPED = row => row?.source_kind === 'armor_item_page'
  && Number(row?.status) === 1 && Number(row?.deleted) === 0;
const positiveId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;

function parseTypedMaintEffect(row) {
  const raw = typeof row.raw_json === 'string' ? JSON.parse(row.raw_json) : row.raw_json;
  const effect = raw?.effect;
  if (raw?.schemaVersion !== 'armor-item-effect-maint/v1'
      || !positiveId(effect?.ownerId)
      || typeof effect.itemInternalName !== 'string' || !effect.itemInternalName.trim()) {
    throw new Error('Armor typed maint source owner identity is invalid');
  }
  return { ownerId: Number(effect.ownerId), itemInternalName: effect.itemInternalName };
}

export async function readArmorTypedEffectSourceSnapshot({ connection, forUpdate = false } = {}) {
  if (typeof connection?.query !== 'function') throw new Error('Armor typed source snapshot requires a database connection');
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const [allMaintRows] = await connection.query(
    `SELECT * FROM terria_v1_maint.maint_armor_attribute_rows WHERE status = 1 AND deleted = 0 ORDER BY id${lock}`,
  );
  if (!Array.isArray(allMaintRows)) throw new Error('Armor typed maint query did not return rows');
  const maintArmorAttributeRows = allMaintRows.filter(isArmorItemEffectMaintRow);
  if (!maintArmorAttributeRows.length) throw new Error('Armor typed maint source rows are missing');
  const ownerRefs = maintArmorAttributeRows.map(parseTypedMaintEffect);
  const landingIds = [...new Set(maintArmorAttributeRows.map(row => Number(row.landing_source_id)))];
  if (landingIds.some(id => !positiveId(id))) throw new Error('Armor typed landing owner identity is invalid');
  const [maintLandings] = await connection.query(
    `SELECT * FROM terria_v1_maint.source_dataset_landings WHERE id IN (${landingIds.map(() => '?').join(', ')}) ORDER BY id${lock}`,
    landingIds,
  );
  if (!Array.isArray(maintLandings)) throw new Error('Armor typed landing query did not return rows');
  const ownerIds = [...new Set(ownerRefs.map(row => row.ownerId))];
  const itemNames = [...new Set(ownerRefs.map(row => row.itemInternalName))];
  const [maintItems] = await connection.query(
    `SELECT * FROM terria_v1_maint.maint_items WHERE status = 1 AND deleted = 0 `
      + `AND (source_id IN (${ownerIds.map(() => '?').join(', ')}) `
      + `OR internal_name IN (${itemNames.map(() => '?').join(', ')})) ORDER BY id${lock}`,
    [...ownerIds, ...itemNames],
  );
  if (!Array.isArray(maintItems)) throw new Error('Armor typed item-owner query did not return rows');
  const sourceGroups = readArmorItemEffectMaintSources({
    maintArmorAttributeRows,
    maintItems,
    maintLandings,
  });
  const fingerprints = sourceGroups.map(({ sourceCandidate }) => ({
    pageRevisionId: sourceCandidate.sources.page.revisionId,
    iteminfoRevisionId: sourceCandidate.sources.iteminfo.revisionId,
    armorSetsRevisionId: sourceCandidate.sources.armorSets.revisionId,
  }));
  const distinctFingerprints = new Map(fingerprints.map(value => [stable(value), value]));
  if (distinctFingerprints.size !== 1) throw new Error('Armor typed source revision tuple is missing or mixed');
  const dispatch = buildArmorAttributeDispatch({ maintArmorAttributeRows, maintItems, maintLandings });
  const typedEffects = dispatch.relationEquipmentEffectAttributes.filter(row => row.sourceKind === 'armor_item_page');
  if (!typedEffects.length) throw new Error('Armor typed relation effects could not be independently derived');
  return {
    typedEffects,
    sourceFingerprint: structuredClone(distinctFingerprints.values().next().value),
  };
}

function normalizeFailure(cause) {
  return cause instanceof Error && Object.isExtensible(cause)
    ? cause
    : new Error(cause instanceof Error ? cause.message : String(cause), { cause });
}

function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function stable(value) { return JSON.stringify(canonical(value)); }

function hashRows(rows) {
  return `sha256:${createHash('sha256').update(stable(rows), 'utf8').digest('hex')}`;
}

function comparableValue(value, field) {
  if (value == null) return null;
  if (['owner_id', 'source_line_index', 'effect_index', 'source_maint_id', 'landing_source_id', 'status', 'deleted'].includes(field)) {
    return Number(value);
  }
  if (['confidence', 'value_decimal', 'value_max_decimal'].includes(field)) return Number(value);
  if (field.endsWith('_timestamp') || field.endsWith('_at')) {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
  }
  return value;
}

function comparableRow(row) {
  const fields = Object.keys(row).filter(field => field !== 'id' && field !== 'created_at' && field !== 'updated_at');
  return Object.fromEntries(fields.sort().map(field => [field, comparableValue(row[field], field)]));
}

function snapshotRows(rows, label) {
  if (!Array.isArray(rows)) throw new Error(`Armor typed effect ${label} snapshot must be an array`);
  const keys = new Set();
  const normalized = rows.map((input, index) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error(`Armor typed effect ${label} row ${index} is invalid`);
    }
    const row = Object.fromEntries(Object.entries(input).map(([key, value]) => [
      key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`), value,
    ]));
    if (typeof row.record_key !== 'string' || !row.record_key.trim() || keys.has(row.record_key)) {
      throw new Error(`Armor typed effect ${label} record keys are missing or duplicate`);
    }
    keys.add(row.record_key);
    return row;
  });
  return normalized.sort((left, right) => left.record_key.localeCompare(right.record_key));
}

function expectedAfterRows(proposal) {
  const rows = snapshotRows(proposal.currentRelationRows, 'proposal before');
  const byKey = new Map(rows.map(row => [row.record_key, row]));
  for (const change of proposal.changes.updates) {
    if (!byKey.has(change.before.record_key)) throw new Error('Armor typed effect proposal update owner is missing');
    byKey.set(change.before.record_key, { ...byKey.get(change.before.record_key), ...change.after });
  }
  for (const row of proposal.changes.retire) {
    const current = byKey.get(row.record_key);
    if (!current) throw new Error('Armor typed effect proposal retirement owner is missing');
    byKey.set(row.record_key, { ...current, status: 0, deleted: 1 });
  }
  for (const row of proposal.changes.inserts) {
    if (byKey.has(row.record_key)) throw new Error('Armor typed effect proposal insert owner already exists');
    byKey.set(row.record_key, row);
  }
  return [...byKey.values()].sort((left, right) => left.record_key.localeCompare(right.record_key));
}

function snapshotHash(rows) {
  return hashRows(rows.map(comparableRow));
}

function normalizePostCommitAcceptance(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || value.schemaVersion !== 'armor-projection-api-acceptance/v1'
      || !['verified', 'blocked'].includes(value.status)
      || typeof value.runtimeVerified !== 'boolean'
      || value.databaseWrites !== false || value.apiReadOnly !== true || value.postCommit !== true
      || !Array.isArray(value.blockers)) {
    throw new Error('Armor post-commit projection/API acceptance evidence is invalid');
  }
  return structuredClone(value);
}

/** Classifies persisted relation state only; this never authorizes replay or further writes. */
export async function classifyArmorTypedEffectPublicationReadback({ proposal, currentRelationRows } = {}) {
  await validateArmorTypedEffectPublicationPlan(proposal);
  const before = snapshotRows(proposal.currentRelationRows, 'proposal before');
  const after = expectedAfterRows(proposal);
  const observed = snapshotRows(currentRelationRows, 'current relation');
  const beforeHash = snapshotHash(before);
  const afterHash = snapshotHash(after);
  const observedHash = snapshotHash(observed);
  const beforeMatches = observedHash === beforeHash;
  const afterMatches = observedHash === afterHash;
  const status = beforeMatches && !afterMatches
    ? 'ROLLBACK_CONFIRMED'
    : afterMatches && !beforeMatches
      ? 'COMMITTED_READBACK_REQUIRED'
      : beforeMatches && afterMatches
        ? 'EXPECTED_STATE_PRESENT'
        : 'RECONCILIATION_REQUIRED';
  return {
    schemaVersion: 'armor-typed-effect-publication-reconciliation/v1',
    operationId: proposal.operationId,
    status,
    proposalSha256: proposal.proposalSha256,
    sourceFingerprint: structuredClone(proposal.sourceFingerprint),
    expectedBeforeSha256: beforeHash,
    expectedAfterSha256: afterHash,
    observedRelationSha256: observedHash,
    projectionAndApiReadbackRequired: status === 'COMMITTED_READBACK_REQUIRED' || status === 'EXPECTED_STATE_PRESENT',
    applyAllowed: false,
    permitReplayAllowed: false,
  };
}

/** Reads one frozen attempt from its bound database without consuming authority or writing rows. */
export async function reconcileArmorTypedEffectPublicationReadback({
  connection, proposal, expectedServerUuid,
} = {}) {
  if (typeof connection?.query !== 'function' || typeof connection?.rollback !== 'function'
      || typeof expectedServerUuid !== 'string' || !expectedServerUuid.trim()) {
    throw new Error('Armor typed effect reconciliation requires a connection and expected server UUID');
  }
  await validateArmorTypedEffectPublicationPlan(proposal);
  let began = false;
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.query('START TRANSACTION READ ONLY');
    began = true;
    const [servers] = await connection.query('SELECT @@server_uuid AS serverUuid');
    if (!Array.isArray(servers) || servers.length !== 1 || servers[0].serverUuid !== expectedServerUuid) {
      throw new Error('Armor typed effect reconciliation server UUID drift');
    }
    const rows = await readRelationRows(connection);
    const result = await classifyArmorTypedEffectPublicationReadback({ proposal, currentRelationRows: rows });
    await connection.rollback();
    began = false;
    return result;
  } catch (cause) {
    const error = normalizeFailure(cause);
    error.databaseWrites = false;
    error.permitConsumed = false;
    if (began) {
      try { await connection.rollback(); }
      catch (rollbackError) { error.rollbackError = normalizeFailure(rollbackError); }
    }
    throw error;
  }
}

function assertRowsEqual(expected, actual, label) {
  const expectedRows = expected.map(comparableRow).sort((a, b) => String(a.record_key).localeCompare(String(b.record_key)));
  const actualRows = actual.map(comparableRow).sort((a, b) => String(a.record_key).localeCompare(String(b.record_key)));
  if (JSON.stringify(canonical(expectedRows)) !== JSON.stringify(canonical(actualRows))) {
    throw new Error(`Armor typed effect ${label} readback mismatch`);
  }
}

async function readRelationRows(connection, { lock = false } = {}) {
  const [rows] = await connection.query(`SELECT * FROM ${QUALIFIED_TABLE}${lock ? ' FOR UPDATE' : ''}`);
  if (!Array.isArray(rows)) throw new Error('Armor typed effect relation snapshot query must return rows');
  return structuredClone(rows);
}

function insertColumns(row) {
  return Object.keys(row)
    .filter(column => !['id', 'created_at', 'updated_at'].includes(column))
    .sort();
}

function sqlValue(value, column) {
  if (value == null) return null;
  if (column.endsWith('_timestamp') || column.endsWith('_at')) return new Date(value);
  return value;
}

async function executeInsert(connection, row) {
  const columns = insertColumns(row);
  const [receipt] = await connection.execute(
    `INSERT INTO terria_v1_relation.\`${TABLE}\` (${columns.map(column => `\`${column}\``).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map(column => sqlValue(row[column], column)),
  );
  if (Number(receipt?.affectedRows) !== 1) throw new Error('Armor typed effect insert receipt is not exactly one row');
}

async function executeUpdate(connection, before, after) {
  const columns = Object.keys(after)
    .filter(column => !['id', 'record_key', 'created_at', 'updated_at'].includes(column))
    .sort();
  const [receipt] = await connection.execute(
    `UPDATE terria_v1_relation.\`${TABLE}\` SET ${columns.map(column => `\`${column}\` = ?`).join(', ')} WHERE \`record_key\` = ? AND \`source_kind\` = 'armor_item_page'`,
    [...columns.map(column => sqlValue(after[column], column)), before.record_key],
  );
  if (Number(receipt?.affectedRows) !== 1) throw new Error('Armor typed effect update receipt is not exactly one row');
}

async function retireRow(connection, row) {
  const [receipt] = await connection.execute(
    `UPDATE terria_v1_relation.\`${TABLE}\` SET \`status\` = ?, \`deleted\` = ? WHERE \`record_key\` = ? AND \`source_kind\` = 'armor_item_page' AND \`status\` = 1 AND \`deleted\` = 0`,
    [0, 1, row.record_key],
  );
  if (Number(receipt?.affectedRows) !== 1) throw new Error('Armor typed effect retirement receipt is not exactly one row');
}

async function assertAfterReadback(connection, proposal) {
  const rows = await readRelationRows(connection);
  const typed = rows.filter(ACTIVE_TYPED);
  assertRowsEqual(proposal.proposedRows, typed, 'typed');
  const generic = rows.filter(row => row.source_kind !== 'armor_item_page' && Number(row.status) === 1 && Number(row.deleted) === 0)
    .map(row => row.record_key).filter(Boolean).sort();
  if (JSON.stringify(generic) !== JSON.stringify([...proposal.preservedGenericRecordKeys].sort())) {
    throw new Error('Armor typed effect generic row preservation mismatch');
  }
  return rows;
}

export async function executeArmorTypedEffectPublicationTransaction({
  connection, proposal, rederiveTypedEffects, assertRuntimeFence, consumePermit, persistPrepared, persistOutcome,
  postCommitAcceptance,
} = {}) {
  if (['query', 'execute', 'beginTransaction', 'commit', 'rollback'].some(key => typeof connection?.[key] !== 'function')
      || [rederiveTypedEffects, assertRuntimeFence, consumePermit, persistPrepared, persistOutcome].some(fn => typeof fn !== 'function')) {
    throw new Error('Armor typed effect execution requires source rederivation, authorization, permit and evidence adapters');
  }
  if (typeof postCommitAcceptance !== 'function') {
    throw new Error('Armor typed effect execution requires a post-commit projection/API acceptance adapter');
  }
  await validateArmorTypedEffectPublicationPlan(proposal);
  const bound = structuredClone(proposal);
  const evidence = {
    schemaVersion: 'armor-typed-effect-publication-execution/v1',
    operationId: bound.operationId,
    ownership: [...ARMOR_TYPED_EFFECT_RELATION_OWNERSHIP],
    proposalSha256: bound.proposalSha256,
    sourceFingerprint: bound.sourceFingerprint,
  };
  let began = false;
  let prepared = false;
  let committing = false;
  let committed = false;
  let permitAttempted = false;
  let permitConsumed = false;
  let affectedRows = 0;
  let acceptanceEvidence = null;
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.beginTransaction();
    began = true;
    await assertRuntimeFence();
    const lockedRows = await readRelationRows(connection, { lock: true });
    const sourceSnapshot = await rederiveTypedEffects({ connection, proposal: structuredClone(bound) });
    if (!sourceSnapshot || typeof sourceSnapshot !== 'object' || Array.isArray(sourceSnapshot)
        || JSON.stringify(Object.keys(sourceSnapshot).sort()) !== JSON.stringify(['sourceFingerprint', 'typedEffects'])) {
      throw new Error('Armor typed effect locked source snapshot is invalid');
    }
    const lockedPlan = buildArmorTypedEffectPublicationPlan({
      typedEffects: sourceSnapshot.typedEffects,
      currentRelationRows: lockedRows,
      sourceFingerprint: sourceSnapshot.sourceFingerprint,
    });
    if (lockedPlan.proposalSha256 !== bound.proposalSha256) throw new Error('Armor typed effect locked proposal drift');
    await assertRuntimeFence();
    await persistPrepared({ ...structuredClone(evidence), status: 'PREPARED' });
    prepared = true;
    permitAttempted = true;
    await consumePermit();
    permitConsumed = true;

    for (const row of bound.changes.inserts) { await executeInsert(connection, row); affectedRows += 1; }
    for (const change of bound.changes.updates) { await executeUpdate(connection, change.before, change.after); affectedRows += 1; }
    for (const row of bound.changes.retire) { await retireRow(connection, row); affectedRows += 1; }
    const relationRows = await assertAfterReadback(connection, bound);
    await assertRuntimeFence();
    committing = true;
    await connection.commit();
    committed = true;
    const committedRelationRows = await assertAfterReadback(connection, bound);
    acceptanceEvidence = normalizePostCommitAcceptance(await postCommitAcceptance({
      status: 'COMMITTED',
      connection,
      proposal: structuredClone(bound),
      relationRows: structuredClone(committedRelationRows),
      preCommitRelationRows: structuredClone(relationRows),
    }));
    if (acceptanceEvidence.status !== 'verified' || acceptanceEvidence.runtimeVerified !== true) {
      throw new Error('Armor post-commit projection/API acceptance is not verified');
    }
    const result = {
      ...structuredClone(evidence), status: 'COMMITTED', affectedRows,
      dispatchPermitConsumed: permitConsumed,
      acceptance: 'projection-api-verified',
      postCommitAcceptance: acceptanceEvidence,
    };
    await persistOutcome(result);
    return result;
  } catch (cause) {
    const error = normalizeFailure(cause);
    error.suppressedErrors = [];
    error.transactionCommitted = committed ? true : committing ? null : false;
    error.requiresReadbackReconciliation = committing;
    error.dispatchPermitConsumed = permitConsumed ? true : permitAttempted ? null : false;
    let status = committed ? 'COMMITTED_READBACK_REQUIRED' : committing ? 'COMMIT_UNKNOWN' : 'NOT_STARTED';
    if (began && !committing) {
      try { await connection.rollback(); status = 'ROLLBACK_CONFIRMED'; }
      catch (rollbackError) {
        error.suppressedErrors.push(normalizeFailure(rollbackError));
        error.requiresReadbackReconciliation = true;
        status = 'ROLLBACK_UNKNOWN';
      }
    }
    if (prepared) {
      try {
        await persistOutcome({ ...structuredClone(evidence), status, affectedRows,
          dispatchPermitConsumed: error.dispatchPermitConsumed,
          requiresReadbackReconciliation: error.requiresReadbackReconciliation,
          ...(acceptanceEvidence ? { postCommitAcceptance: acceptanceEvidence } : {}),
          error: error.message });
      } catch (outcomeError) {
        error.suppressedErrors.push(normalizeFailure(outcomeError));
        error.requiresReadbackReconciliation = true;
      }
    }
    throw error;
  }
}
