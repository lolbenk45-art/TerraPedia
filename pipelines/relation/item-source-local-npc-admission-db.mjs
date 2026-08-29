import {
  canonicalJson,
  sha256,
} from './item-source-local-npc-admission.mjs';
import {
  assertAuthorizationEligibleProposal,
  assertItemSourceLocalNpcAdmissionInputContract,
} from './item-source-local-npc-admission-contract.mjs';

const LANDING_TABLE = 'terria_v1_local.source_dataset_landings';
const LOCAL_SOURCE_TABLE = 'terria_v1_local.item_acquisition_sources';
const INSERT_ORDER = Object.freeze([
  LANDING_TABLE,
  'terria_v1_maint.maint_npc_crawler_facts',
  'terria_v1_relation.item_source_facts',
  'terria_v1_relation.item_source_details',
  'terria_v1_relation.item_npc_shop_relations',
  'terria_v1_relation.item_npc_loot_relations',
  LOCAL_SOURCE_TABLE,
]);

export async function executeItemSourceLocalNpcAdmissionTransaction({
  connection,
  inputContract,
  proposal,
  consumeDispatchPermit,
  assertInputContract = assertItemSourceLocalNpcAdmissionInputContract,
  assertProposal = assertAuthorizationEligibleProposal,
  readCurrentRows = readItemSourceLocalNpcAdmissionCurrentRows,
  applyWriteSets = applyItemSourceLocalNpcAdmissionWriteSets,
  assertReadback = assertItemSourceLocalNpcAdmissionReadback,
} = {}) {
  if (!connection || typeof connection.beginTransaction !== 'function'
      || typeof connection.commit !== 'function' || typeof connection.rollback !== 'function') {
    throw new Error('Item-source admission transaction requires a transaction-capable connection');
  }
  if (typeof consumeDispatchPermit !== 'function') {
    throw new Error('Item-source admission transaction requires an authorized dispatch permit consumer');
  }
  assertInputContract(inputContract);
  assertProposal(proposal);
  assertInputMatchesProposal(inputContract, proposal);
  await connection.beginTransaction();
  try {
    const before = await readCurrentRows({ connection, proposal, phase: 'before' });
    assertFrozenBeforeState({ inputContract, proposal, before });
    await consumeDispatchPermit();
    const outcome = await applyWriteSets({ connection, proposal, before });
    const after = await readCurrentRows({ connection, proposal, phase: 'after' });
    assertReadback({ inputContract, proposal, after, outcome });
    await connection.commit();
    return outcome;
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

export async function readItemSourceLocalNpcAdmissionCurrentRows({ connection, proposal, phase }) {
  if (!['before', 'after'].includes(phase)) throw new Error('Item-source admission current-row phase is invalid');
  const rows = {};
  for (const table of INSERT_ORDER) {
    rows[table] = await readTargetRows({ connection, table, proposal, lock: true });
  }
  return {
    rows,
    tableBeforeFingerprints: buildTableFingerprints(rows),
  };
}

export async function applyItemSourceLocalNpcAdmissionWriteSets({ connection, proposal, before }) {
  assertInsertTargetsAbsent({ proposal, before });
  await applyLocalSourceReconciliation({ connection, rows: proposal.localSourceReconciliation });
  const resolvedWriteSets = cloneWriteSets(proposal.writeSets);
  await insertRows({ connection, table: LANDING_TABLE, rows: resolvedWriteSets[LANDING_TABLE] });
  const landingIds = await readLandingIds({ connection, rows: resolvedWriteSets[LANDING_TABLE] });
  applyLandingLineage({ resolvedWriteSets, lineageBindings: proposal.lineageBindings, landingIds });
  for (const table of INSERT_ORDER.slice(1)) {
    await insertRows({ connection, table, rows: resolvedWriteSets[table] });
  }
  const insertedCounts = Object.fromEntries(INSERT_ORDER.map((table) => [
    table,
    Array.isArray(resolvedWriteSets[table]) ? resolvedWriteSets[table].length : 0,
  ]));
  return {
    insertedCounts,
    reconciledCount: proposal.localSourceReconciliation.length,
    resolvedWriteSets,
  };
}

export function assertItemSourceLocalNpcAdmissionReadback({ inputContract, proposal, after, outcome }) {
  const expectedChangedRowCount = Object.values(outcome?.insertedCounts ?? {})
    .reduce((sum, count) => sum + Number(count ?? 0), 0) + Number(outcome?.reconciledCount ?? 0);
  if (expectedChangedRowCount !== Number(inputContract.expectedChangedRowCount)) {
    throw new Error('Item-source admission changed row count drifted during transaction');
  }
  for (const reconciliation of proposal.localSourceReconciliation) {
    const row = (after.rows?.[LOCAL_SOURCE_TABLE] ?? []).find((candidate) => Number(candidate?.id) === Number(reconciliation.rowId));
    if (!row || canonicalReconciliationRowHash(row) !== canonicalReconciliationRowHash(reconciliation.after)) {
      throw new Error(`Item-source admission reconciliation readback drifted: ${reconciliation.rowId}`);
    }
  }
  for (const table of INSERT_ORDER) {
    const expectedRows = outcome?.resolvedWriteSets?.[table] ?? [];
    const actualRows = after.rows?.[table] ?? [];
    for (const expected of expectedRows) {
      if (!actualRows.some((actual) => databaseRowMatchesExpected(actual, expected))) {
        throw new Error(`Item-source admission inserted row readback drifted: ${table}`);
      }
    }
  }
  const logicalAfterFingerprint = sha256({
    writeSets: proposal.writeSets,
    lineageBindings: proposal.lineageBindings,
    localSourceReconciliation: proposal.localSourceReconciliation,
  });
  if (logicalAfterFingerprint !== inputContract.afterFingerprint
      || logicalAfterFingerprint !== proposal.afterFingerprint) {
    throw new Error('Item-source admission expected after fingerprint drifted');
  }
}

function assertInputMatchesProposal(inputContract, proposal) {
  for (const [inputField, proposalField] of [
    ['proposalScopeHash', 'scopeHash'],
    ['beforeFingerprint', 'beforeFingerprint'],
    ['afterFingerprint', 'afterFingerprint'],
    ['selectedIdentityHash', 'selectedIdentityHash'],
  ]) {
    if (inputContract[inputField] !== proposal[proposalField]) {
      throw new Error(`Item-source admission input ${inputField} drifted from the proposal`);
    }
  }
  if (JSON.stringify(inputContract.tableBeforeFingerprints) !== JSON.stringify(proposal.tableBeforeFingerprints)) {
    throw new Error('Item-source admission input table before fingerprints drifted from the proposal');
  }
}

function assertFrozenBeforeState({ inputContract, proposal, before }) {
  const actual = before?.tableBeforeFingerprints;
  if (!actual || typeof actual !== 'object') throw new Error('Item-source admission before rows are incomplete');
  for (const [table, expected] of Object.entries(proposal.tableBeforeFingerprints)) {
    if (actual[table] !== expected || inputContract.tableBeforeFingerprints?.[table] !== expected) {
      throw new Error(`Item-source admission before fingerprint drifted: ${table}`);
    }
  }
  const fingerprint = sha256(proposal.tableBeforeFingerprints);
  if (fingerprint !== proposal.beforeFingerprint || fingerprint !== inputContract.beforeFingerprint) {
    throw new Error('Item-source admission aggregate before fingerprint drifted');
  }
  for (const reconciliation of proposal.localSourceReconciliation) {
    const row = (before.rows?.[LOCAL_SOURCE_TABLE] ?? []).find((candidate) => Number(candidate?.id) === Number(reconciliation.rowId));
    if (!row || sha256(row) !== reconciliation.beforeHash) {
      throw new Error(`Item-source admission reconciliation before image drifted: ${reconciliation.rowId}`);
    }
  }
}

export function assertInsertTargetsAbsent({ proposal, before }) {
  for (const table of INSERT_ORDER) {
    const existing = before.rows?.[table] ?? [];
    if (table === LOCAL_SOURCE_TABLE) {
      const reconciliationIds = new Set(proposal.localSourceReconciliation.map((row) => Number(row.rowId)));
      if (existing.some((row) => !reconciliationIds.has(Number(row?.id))
          && Number(row?.status ?? 1) === 1 && Number(row?.deleted ?? 0) === 0)) {
        throw new Error('Item-source admission local insert target already exists');
      }
      continue;
    }
    if (existing.length !== 0) throw new Error(`Item-source admission insert target already exists: ${table}`);
  }
}

export async function applyLocalSourceReconciliation({ connection, rows }) {
  for (const reconciliation of rows ?? []) {
    const after = reconciliation?.after;
    if (!after || Number(after.id) !== Number(reconciliation.rowId)) {
      throw new Error('Item-source admission reconciliation after image is invalid');
    }
    const columns = Object.keys(after).filter((column) => column !== 'id');
    const assignments = columns.map((column) => `\`${column}\` = ?`).join(', ');
    const values = columns.map((column) => DATETIME_COLUMNS.has(column)
      ? toMysqlDateTime(after[column])
      : after[column]);
    const [result] = await connection.query(
      `UPDATE \`terria_v1_local\`.\`item_acquisition_sources\` SET ${assignments} WHERE \`id\` = ?`,
      [...values, reconciliation.rowId],
    );
    if (Number(result?.affectedRows) !== 1) {
      throw new Error(`Item-source admission reconciliation row disappeared: ${reconciliation.rowId}`);
    }
  }
}

const DATETIME_COLUMNS = new Set([
  'created_at',
  'updated_at',
  'source_revision_timestamp',
  'fetched_at',
  'parsed_at',
]);

function toMysqlDateTime(value) {
  if (value == null || value === '') return null;
  const normalized = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(normalized)) return normalized;
  const date = value instanceof Date ? value : new Date(normalized);
  if (!Number.isFinite(date.getTime())) throw new Error('Item-source admission datetime value is invalid');
  return formatLocalDateTime(date);
}

function formatLocalDateTime(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function canonicalReconciliationRowHash(row) {
  const normalized = Object.fromEntries(Object.entries(row ?? {}).map(([column, value]) => [
    column,
    DATETIME_COLUMNS.has(column) ? toMysqlDateTime(value) : value,
  ]));
  return sha256(normalized);
}

export async function insertRows({ connection, table, rows }) {
  for (const row of rows ?? []) {
    const columns = Object.keys(row);
    if (columns.length === 0) throw new Error(`Item-source admission cannot insert an empty row: ${table}`);
    const [database, tableName] = splitTable(table);
    const placeholders = columns.map(() => '?').join(', ');
    await connection.query(
      `INSERT INTO \`${database}\`.\`${tableName}\` (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES (${placeholders})`,
      columns.map((column) => DATETIME_COLUMNS.has(column)
        ? toMysqlDateTime(row[column])
        : row[column]),
    );
  }
}

async function readLandingIds({ connection, rows }) {
  const keys = (rows ?? []).map((row) => row?.source_key).filter(Boolean);
  if (keys.length === 0) return new Map();
  const result = await queryRows(connection,
    `SELECT \`id\`, \`source_key\` FROM \`terria_v1_local\`.\`source_dataset_landings\` WHERE \`source_key\` IN (${keys.map(() => '?').join(', ')}) FOR UPDATE`,
    keys,
  );
  if (result.length !== keys.length) throw new Error('Item-source admission landing readback is incomplete');
  return new Map(result.map((row) => [row.source_key, Number(row.id)]));
}

function applyLandingLineage({ resolvedWriteSets, lineageBindings, landingIds }) {
  for (const [table, bindings] of Object.entries(lineageBindings ?? {})) {
    const bindingByRecordKey = new Map((bindings ?? []).map((binding) => [binding.recordKey, binding.landingSourceKey]));
    resolvedWriteSets[table] = (resolvedWriteSets[table] ?? []).map((row) => {
      const landingKey = bindingByRecordKey.get(row.record_key);
      if (!landingKey) return row;
      const landingId = landingIds.get(landingKey);
      if (!Number.isSafeInteger(landingId) || landingId < 1) {
        throw new Error(`Item-source admission landing lineage is missing: ${landingKey}`);
      }
      return { ...row, landing_source_id: landingId };
    });
  }
}

async function readTargetRows({ connection, table, proposal, lock }) {
  const clause = lock ? ' FOR UPDATE' : '';
  if (table === LANDING_TABLE) {
    const keys = (proposal.writeSets?.[table] ?? []).map((row) => row.source_key).filter(Boolean);
    return queryRowsByValues(connection, 'terria_v1_local', 'source_dataset_landings', 'source_key', keys, clause);
  }
  if (table === LOCAL_SOURCE_TABLE) {
    const identities = [
      ...(proposal.writeSets?.[table] ?? []),
      ...(proposal.localSourceReconciliation ?? []).map((entry) => entry.before),
    ];
    const ids = [...new Set((proposal.localSourceReconciliation ?? []).map((entry) => Number(entry.rowId)).filter(Number.isSafeInteger))];
    const filters = [];
    const values = [];
    if (ids.length > 0) {
      filters.push(`\`id\` IN (${ids.map(() => '?').join(', ')})`);
      values.push(...ids);
    }
    for (const identity of identities) {
      if (!identity) continue;
      filters.push('(\`item_id\` = ? AND \`source_type\` = ? AND \`source_ref_type\` = ? AND \`source_ref_id\` = ?)');
      values.push(identity.item_id, identity.source_type, identity.source_ref_type, identity.source_ref_id);
    }
    if (filters.length === 0) return [];
    return queryRows(connection,
      `SELECT * FROM \`terria_v1_local\`.\`item_acquisition_sources\` WHERE ${filters.join(' OR ')} ORDER BY \`id\`${clause}`,
      values,
    );
  }
  const [database, tableName] = splitTable(table);
  const keys = (proposal.writeSets?.[table] ?? []).map((row) => row.record_key).filter(Boolean);
  return queryRowsByValues(connection, database, tableName, 'record_key', keys, clause);
}

async function queryRowsByValues(connection, database, table, column, values, suffix) {
  const unique = [...new Set(values)];
  if (unique.length === 0) return [];
  return queryRows(connection,
    `SELECT * FROM \`${database}\`.\`${table}\` WHERE \`${column}\` IN (${unique.map(() => '?').join(', ')}) ORDER BY \`${column}\`${suffix}`,
    unique,
  );
}

async function queryRows(connection, sql, values) {
  const [rows] = await connection.query(sql, values);
  return Array.isArray(rows) ? rows : [];
}

function buildTableFingerprints(rows) {
  return Object.fromEntries(INSERT_ORDER.map((table) => [
    table,
    sha256(sortRows(rows?.[table] ?? [])),
  ]));
}

function sortRows(rows) {
  return [...rows].sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
}

function cloneWriteSets(writeSets) {
  const clone = {};
  for (const table of INSERT_ORDER) clone[table] = (writeSets?.[table] ?? []).map((row) => ({ ...row }));
  return clone;
}

function databaseRowMatchesExpected(actual, expected) {
  return Object.entries(expected).every(([column, expectedValue]) => databaseValueEquals(actual?.[column], expectedValue));
}

function databaseValueEquals(actual, expected) {
  if (actual instanceof Date) actual = actual.toISOString();
  if (expected instanceof Date) expected = expected.toISOString();
  if (actual == null || expected == null) return actual == null && expected == null;
  if (typeof actual === 'number' || typeof expected === 'number') {
    const left = Number(actual);
    const right = Number(expected);
    return Number.isFinite(left) && Number.isFinite(right) && left === right;
  }
  const actualTime = Date.parse(actual);
  const expectedTime = Date.parse(expected);
  if (typeof actual === 'string' && typeof expected === 'string'
      && Number.isFinite(actualTime) && Number.isFinite(expectedTime)) {
    return actualTime === expectedTime;
  }
  return actual === expected;
}

function splitTable(table) {
  const [database, tableName, extra] = String(table).split('.');
  if (!database || !tableName || extra) throw new Error(`Item-source admission table name is invalid: ${table}`);
  return [database, tableName];
}
