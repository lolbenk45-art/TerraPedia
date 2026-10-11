import { validateArmorCanonicalLandingMaintIntent } from './armor-canonical-landing-maint-intent.mjs';
import { validateArmorCanonicalIntent } from './armor-canonical-intent.mjs';

export const ARMOR_CANONICAL_TRANSACTION_SCHEMA = 'armor-canonical-transaction/v1';
export const ARMOR_CANONICAL_TRANSACTION_OPERATION_ID = 'canonical-armor-ingestion';

export const ARMOR_CANONICAL_DATABASES = Object.freeze({
  local: 'terria_v1_local',
  maint: 'terria_v1_maint',
  relation: 'terria_v1_relation',
});
const TABLES = new Set([
  'local.source_dataset_landings',
  'maint.maint_armor_sets',
  'maint.maint_armor_set_images',
  'relation.relation_armor_sets',
  'relation.relation_armor_set_items',
  'relation.relation_armor_set_images',
  'relation.projection_armor_sets',
]);
const HASH = /^sha256:[0-9a-f]{64}$/;
const IDENTIFIER = /^[a-z][a-z0-9_]*$/;

function resolveDatabases(databaseNames = ARMOR_CANONICAL_DATABASES) {
  if (!databaseNames || typeof databaseNames !== 'object' || Array.isArray(databaseNames)) {
    throw new Error('Armor transaction database names are required');
  }
  const resolved = {};
  for (const role of ['local', 'maint', 'relation']) {
    const name = databaseNames[role];
    if (typeof name !== 'string' || !IDENTIFIER.test(name)) {
      throw new Error(`Armor transaction ${role} database name is invalid`);
    }
    resolved[role] = name;
  }
  return Object.freeze(resolved);
}

const text = (value, label) => {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) throw new Error(`${label} is required`);
  return value;
};

function mysqlTimestamp(value) {
  const normalized = text(value, 'Armor transaction timestamp');
  const iso = normalized.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d{1,3})?Z$/);
  if (iso) {
    const local = new Date(`${iso[1]}Z`).getTime() + (8 * 60 * 60 * 1000);
    return new Date(local).toISOString().slice(0, 19).replace('T', ' ');
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(normalized)) return normalized;
  throw new Error('Armor transaction timestamp must be second-precision UTC');
}

function mysqlColumnValue(column, value) {
  if ((column.endsWith('_at') || column.endsWith('_timestamp'))
      && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return mysqlTimestamp(value);
  }
  return value;
}

function timestampValue(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== 'string') return Number.NaN;
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function valuesEqual(column, actual, expected) {
  if (typeof expected === 'boolean' && (actual === 0 || actual === 1)) return actual === (expected ? 1 : 0);
  if (typeof expected === 'number' && typeof actual === 'string' && actual.trim() !== '') {
    const numeric = Number(actual);
    if (Number.isFinite(numeric)) return numeric === expected;
  }
  if ((column.endsWith('_at') || column.endsWith('_timestamp'))
      && (typeof actual === 'string' || actual instanceof Date)
      && typeof expected === 'string') {
    const left = timestampValue(actual);
    const right = timestampValue(expected);
    if (Number.isFinite(left) && Number.isFinite(right)) return left === right;
  }
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function plain(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} is required`);
  return value;
}

function quote(value, label) {
  text(value, label);
  if (!IDENTIFIER.test(value)) throw new Error(`${label} is invalid`);
  return `\`${value}\``;
}

function hashValue(value, label) {
  if (!HASH.test(value ?? '')) throw new Error(`${label} must be a sha256 hash`);
  return value;
}

const LANDING_IDENTITY_COLUMNS = Object.freeze(['dataset_type', 'provider', 'source_key', 'source_page']);

function landingText(value, label) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) throw new Error(`${label} is required`);
  return value;
}

function collationFold(value) {
  return landingText(value, 'Armor landing identity').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en-US');
}

export function buildArmorLandingCollationLockQuery(row, { databaseName = ARMOR_CANONICAL_DATABASES.local } = {}) {
  plain(row, 'Armor landing identity row');
  const databases = resolveDatabases({ local: databaseName, maint: ARMOR_CANONICAL_DATABASES.maint, relation: ARMOR_CANONICAL_DATABASES.relation });
  const values = LANDING_IDENTITY_COLUMNS.map(column => landingText(row[column], `Armor landing ${column}`));
  return {
    sql: `SELECT * FROM ${quote(databases.local, 'database')}.source_dataset_landings WHERE ${LANDING_IDENTITY_COLUMNS
      .map(column => `\`${column}\` = ? COLLATE utf8mb4_0900_ai_ci`).join(' AND ')} ORDER BY \`id\` FOR UPDATE`,
    params: values,
  };
}

export function validateArmorLandingCollationLockRows({ incoming, rows } = {}) {
  plain(incoming, 'Armor incoming landing identity');
  if (!Array.isArray(rows)) throw new Error('Armor landing collation lock rows are required');
  const incomingValues = LANDING_IDENTITY_COLUMNS.map(column => landingText(incoming[column], `Armor incoming landing ${column}`));
  const incomingFolded = incomingValues.map(collationFold);
  for (const row of rows) {
    plain(row, 'Armor locked landing row');
    const values = LANDING_IDENTITY_COLUMNS.map(column => landingText(row[column], `Armor locked landing ${column}`));
    if (values.every((value, index) => collationFold(value) === incomingFolded[index])
        && values.some((value, index) => value !== incomingValues[index])) {
      throw new Error('Armor landing tuple is byte-different but equivalent under the native MySQL collation');
    }
  }
  return true;
}

function planIdentity(plan) {
  const identity = `${plan?.databaseRole}.${plan?.table}|${plan?.logicalKey}`;
  if (!TABLES.has(identity.split('|')[0])) throw new Error(`Armor transaction plan is outside scope: ${identity}`);
  return identity;
}

function tableIdentity(plan) {
  const role = text(plan.databaseRole, 'Armor transaction databaseRole');
  const table = text(plan.table, 'Armor transaction table');
  const scope = `${role}.${table}`;
  if (!TABLES.has(scope)) throw new Error(`Armor transaction table is outside scope: ${scope}`);
  return scope;
}

function planList(expected) {
  const all = [];
  for (const plan of expected.landingMaintIntent?.insertPlans ?? []) all.push(plan);
  for (const plan of expected.relationIntent?.insertPlans ?? []) all.push(plan);
  const seen = new Set();
  for (const plan of all) {
    const identity = planIdentity(plan);
    if (seen.has(identity)) throw new Error(`duplicate Armor transaction insert plan: ${identity}`);
    seen.add(identity);
    tableIdentity(plan);
  }
  return all;
}

function validateEnvelope(expected, validateContracts, allowPartial) {
  plain(expected, 'Armor transaction expected intents');
  plain(expected.landingMaintIntent, 'Armor landing/maint intent');
  if (!Array.isArray(expected.landingMaintIntent.insertPlans)) throw new Error('Armor landing/maint insert plans are required');
  if (validateContracts) {
    validateArmorCanonicalLandingMaintIntent(expected.landingMaintIntent);
    if (!expected.relationIntent && !allowPartial) throw new Error('Armor relation intent is required for the full-chain executor');
    if (expected.relationIntent) validateArmorCanonicalIntent(expected.relationIntent);
  } else if (expected.relationIntent && !Array.isArray(expected.relationIntent.insertPlans)) {
    throw new Error('Armor relation insert plans are required');
  }
  if (!expected.relationIntent && !allowPartial) throw new Error('Armor relation intent is required for the full-chain executor');
  return planList(expected);
}

function validatePacket(packet) {
  plain(packet, 'Armor transaction packet');
  text(packet.runId, 'Armor transaction runId');
  text(packet.decisionIdentity, 'Armor transaction decisionIdentity');
  hashValue(packet.packetHash, 'Armor transaction packetHash');
  text(packet.actor, 'Armor transaction actor');
  text(packet.serverUuid, 'Armor transaction serverUuid');
  text(packet.fenceToken, 'Armor transaction fenceToken');
}

function logicalWhere(plan) {
  const fields = plan.nonGeneratedFields ?? {};
  if (plan.table === 'source_dataset_landings') {
    return {
      columns: ['dataset_type', 'provider', 'source_key', 'source_page'],
      values: ['dataset_type', 'provider', 'source_key', 'source_page'].map(column => fields[column]),
    };
  }
  const key = plan.table === 'projection_armor_sets' ? 'text_key' : 'record_key';
  return { columns: [key], values: [fields[key] ?? plan.logicalKey] };
}

function identityQuery(plan, databases) {
  const scope = tableIdentity(plan);
  const [role, table] = scope.split('.');
  const where = logicalWhere(plan);
  return {
    sql: `SELECT * FROM ${quote(databases[role], 'database')} . ${quote(table, 'table')} WHERE ${where.columns.map(column => `${quote(column, 'column')} = ?`).join(' AND ')} ORDER BY ${quote('id', 'column')} DESC FOR UPDATE`,
    params: where.values,
  };
}

function updatePlanList(expected) {
  const result = [];
  const add = (role, table, changes) => {
    for (const change of changes?.updates ?? []) {
      if (!change?.before || !change?.after || !Number.isSafeInteger(change.after.id) || change.after.id < 1) {
        throw new Error(`Armor ${role}.${table} update identity is invalid`);
      }
      const keyColumn = table === 'projection_armor_sets' ? 'text_key' : 'record_key';
      const logicalKey = change.after[keyColumn];
      text(logicalKey, `Armor ${role}.${table} update logical key`);
      result.push({ databaseRole: role, table, logicalKey, nonGeneratedFields: change.after, before: change.before, after: change.after });
    }
  };
  const maint = expected.landingMaintIntent?.snapshots?.maintCandidate?.changes ?? {};
  add('maint', 'maint_armor_sets', maint.maint_armor_sets);
  add('maint', 'maint_armor_set_images', maint.maint_armor_set_images);
  const candidate = expected.relationIntent?.candidateSnapshot ?? {};
  const relation = candidate.relationCandidate?.changes ?? {};
  add('relation', 'relation_armor_sets', relation.relation_armor_sets);
  add('relation', 'relation_armor_set_items', relation.relation_armor_set_items);
  add('relation', 'relation_armor_set_images', relation.relation_armor_set_images);
  add('relation', 'projection_armor_sets', candidate.changes?.projection_armor_sets);
  return result;
}

function demotionList(expected) {
  return (expected.landingMaintIntent?.demotions ?? []).map((demotion) => {
    if (!Number.isSafeInteger(demotion?.after?.id) || demotion.after.id < 1
      || demotion.after.is_current !== 0 || demotion.after.current_slot !== null) {
      throw new Error('Armor landing demotion is invalid');
    }
    return demotion.after;
  });
}

function existingReferenceIds(expected) {
  const result = new Map();
  const rows = expected.relationIntent?.candidateSnapshot?.relationCandidate?.expectedRows ?? {};
  for (const table of ['relation_armor_sets', 'relation_armor_set_items', 'relation_armor_set_images']) {
    for (const row of rows[table] ?? []) {
      if (Number.isSafeInteger(row?.id) && row.id > 0 && typeof row.record_key === 'string') {
        result.set(`relation.${table}|${row.record_key}`, row.id);
      }
    }
  }
  return result;
}

async function query(connection, sql, params = []) {
  if (typeof connection?.query !== 'function') throw new Error('Armor transaction connection query capability is required');
  return connection.query(sql, params);
}

async function lockRuntime(connection, packet, databases) {
  const [servers] = await query(connection, 'SELECT @@server_uuid AS serverUuid, @@port AS serverPort, DATABASE() AS databaseName');
  if (servers?.length !== 1 || servers[0].serverUuid !== packet.serverUuid) throw new Error('Armor transaction server identity drifted');
  const [owners] = await query(connection, `SELECT username, status FROM ${quote(databases.local, 'database')}.crawler_automation_owner WHERE singleton_key = 1 FOR UPDATE`);
  if (owners?.length !== 1 || owners[0].username !== packet.actor || owners[0].status !== 'ACTIVE') throw new Error('Armor transaction Owner is not active');
  const [fences] = await query(connection, `SELECT latest_run_id, fence_token, (expires_at > CURRENT_TIMESTAMP) AS active FROM ${quote(databases.local, 'database')}.crawler_automation_write_fence FOR UPDATE`);
  const active = (fences ?? []).filter(row => Number(row.active) === 1);
  if (active.length !== 1 || active[0].latest_run_id !== packet.runId || active[0].fence_token !== packet.fenceToken) {
    throw new Error('Armor transaction ownership fence is missing, foreign or expired');
  }
}

async function lockLandingCollationIdentities(connection, expected, databases) {
  const incomingRows = expected?.landingMaintIntent?.snapshots?.landingTransition?.inserts ?? [];
  for (const incoming of incomingRows) {
    const lock = buildArmorLandingCollationLockQuery(incoming, { databaseName: databases.local });
    const [rows] = await query(connection, lock.sql, lock.params);
    validateArmorLandingCollationLockRows({ incoming, rows: rows ?? [] });
  }
}

function insertOrder(plan) {
  return { local: 0, maint: 1, relation: plan.table === 'projection_armor_sets' ? 3 : 2 }[plan.databaseRole];
}

function resolveReference(reference, receipts, existingIds) {
  const receipt = receipts.get(reference.target);
  if (receipt) return receipt.insertId;
  const existing = existingIds.get(reference.target);
  if (Number.isSafeInteger(existing) && existing > 0) return existing;
  throw new Error(`Armor transaction reference is unresolved: ${reference.target}`);
}

function rowValues(plan, receipts, existingIds, writeTimestamp) {
  const values = Object.fromEntries(Object.entries(plan.nonGeneratedFields ?? {})
    .map(([column, value]) => [column, mysqlColumnValue(column, value)]));
  for (const reference of plan.references ?? []) values[reference.column] = resolveReference(reference, receipts, existingIds);
  if (plan.generatedColumns?.includes('created_at')) values.created_at = mysqlTimestamp(writeTimestamp);
  if (plan.generatedColumns?.includes('updated_at')) values.updated_at = mysqlTimestamp(writeTimestamp);
  if (plan.generatedColumns?.includes('current_slot')) delete values.current_slot;
  if (!(plan.references ?? []).some(reference => reference.column === 'id')) delete values.id;
  return values;
}

function readbackId(result, label) {
  const insertId = Number(result?.insertId);
  if (!Number.isSafeInteger(insertId) || insertId < 1 || result?.affectedRows !== 1) throw new Error(`Armor transaction insert receipt is invalid: ${label}`);
  return insertId;
}

async function insertPlan(connection, plan, receipts, existingIds, writeTimestamp, strictReadback, databases) {
  const values = rowValues(plan, receipts, existingIds, writeTimestamp);
  const columns = Object.keys(values);
  if (!columns.length || columns.some(column => !IDENTIFIER.test(column))) throw new Error(`Armor transaction insert columns are invalid: ${planIdentity(plan)}`);
  const scope = tableIdentity(plan);
  const [role, table] = scope.split('.');
  const placeholders = columns.map(() => '?').join(', ');
  const [result] = await query(connection,
    `INSERT INTO ${quote(databases[role], 'database')} . ${quote(table, 'table')} (${columns.map(column => quote(column, 'column')).join(', ')}) VALUES (${placeholders})`,
    columns.map(column => values[column]));
  const insertId = plan.references?.some(reference => reference.column === 'id')
    ? Number(values.id)
    : readbackId(result, planIdentity(plan));
  if (!Number.isSafeInteger(insertId) || insertId < 1) throw new Error(`Armor transaction generated ID is invalid: ${planIdentity(plan)}`);
  const readbackQuery = plan.references?.some(reference => reference.column === 'id')
    ? { sql: `SELECT * FROM ${quote(databases[plan.databaseRole], 'database')} . ${quote(plan.table, 'table')} WHERE ${quote('id', 'column')} = ? FOR UPDATE`, params: [insertId] }
    : identityQuery({ ...plan, nonGeneratedFields: { ...values, id: insertId } }, databases);
  const [rows] = await query(connection, readbackQuery.sql, readbackQuery.params);
  const readbackRow = rows?.[0];
  if (!readbackRow || Number(readbackRow.id) !== insertId) throw new Error(`Armor transaction insert readback ID drifted: ${planIdentity(plan)}`);
  if (strictReadback && (readbackRow.created_at == null || readbackRow.updated_at == null)) throw new Error(`Armor transaction insert timestamp readback is incomplete: ${planIdentity(plan)}`);
  return { databaseRole: plan.databaseRole, table: plan.table, logicalKey: plan.logicalKey, insertId, affectedRows: 1, readback: readbackRow };
}

async function applyUpdate(connection, change, writeTimestamp, strictReadback, databases) {
  const after = { ...change.after };
  delete after.id; delete after.created_at; delete after.updated_at;
  const columns = Object.keys(after);
  if (!columns.length || columns.some(column => !IDENTIFIER.test(column))) throw new Error(`Armor transaction update columns are invalid: ${change.table}`);
  const scope = `${change.databaseRole}.${change.table}`;
  const [role, table] = scope.split('.');
  const [result] = await query(connection,
    `UPDATE ${quote(databases[role], 'database')} . ${quote(table, 'table')} SET ${columns.map(column => `${quote(column, 'column')} = ?`).join(', ')}, ${quote('updated_at', 'column')} = ? WHERE ${quote('id', 'column')} = ?`,
    [...columns.map(column => mysqlColumnValue(column, after[column])), mysqlTimestamp(writeTimestamp), change.after.id]);
  if (result?.affectedRows !== 1) throw new Error(`Armor transaction update affectedRows is not one: ${scope}|${change.after.id}`);
  const [rows] = await query(connection, `SELECT * FROM ${quote(databases[role], 'database')} . ${quote(table, 'table')} WHERE ${quote('id', 'column')} = ? FOR UPDATE`, [change.after.id]);
  if (!rows?.[0] || Number(rows[0].id) !== change.after.id) throw new Error(`Armor transaction update readback drifted: ${scope}|${change.after.id}`);
  if (strictReadback) {
    if (rows[0].updated_at == null) throw new Error(`Armor transaction update timestamp readback is incomplete: ${scope}|${change.after.id}`);
    for (const [column, expected] of Object.entries(after)) {
      if (!valuesEqual(column, rows[0][column], expected)) {
        const actual = rows[0][column] instanceof Date ? rows[0][column].toISOString() : rows[0][column];
        throw new Error(`Armor transaction update readback drifted: ${scope}|${change.after.id}.${column} actual=${actual} expected=${expected}`);
      }
    }
  }
}

export async function executeArmorCanonicalTransaction({
  connection, packet, expected, deriveLocked, journal, validateContracts = true,
  strictReadback = true, allowPartial = false, databaseNames = ARMOR_CANONICAL_DATABASES,
} = {}) {
  const databases = resolveDatabases(databaseNames);
  validatePacket(packet);
  const insertPlans = validateEnvelope(expected, validateContracts, allowPartial).sort((left, right) => insertOrder(left) - insertOrder(right));
  if (!allowPartial && !packet.fenceCommit) throw new Error('Armor transaction fence commit marker is required for the full-chain executor');
  if (expected.relationIntent && expected.relationIntent.writeTimestamp
      && expected.relationIntent.writeTimestamp !== expected.landingMaintIntent.writeTimestamp) {
    throw new Error('Armor transaction writeTimestamp drifted between intent layers');
  }
  if (typeof deriveLocked !== 'function') throw new Error('Armor transaction locked rederivation callback is required');
  for (const method of ['beginTransaction', 'commit', 'rollback']) if (typeof connection?.[method] !== 'function') throw new Error(`Armor transaction connection ${method} capability is required`);
  for (const method of ['prepared', 'materialized', 'rolledBack', 'commitUnknown', 'committed']) if (typeof journal?.[method] !== 'function') throw new Error(`Armor transaction journal ${method} writer is required`);
  const writeTimestamp = expected.landingMaintIntent.writeTimestamp ?? expected.relationIntent?.writeTimestamp;
  text(writeTimestamp, 'Armor transaction writeTimestamp');
  let transactionStarted = false;
  let committed = false;
  let commitAttempted = false;
  let journalPrepared = false;
  const receipts = new Map();
  const existingIds = new Map();
  const lockedRows = new Map();
  for (const [identity, id] of existingReferenceIds(expected)) existingIds.set(identity, id);
  try {
    await query(connection, 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.beginTransaction(); transactionStarted = true;
    await lockRuntime(connection, packet, databases);
    const [landingRows] = await query(connection,
      `SELECT * FROM ${quote(databases.local, 'database')}.source_dataset_landings WHERE dataset_type IN (?, ?) ORDER BY id FOR UPDATE`,
      ['armor_sets_raw', 'armor_set_images_raw']);
    lockedRows.set('local.source_dataset_landings|partition:armor', structuredClone(landingRows ?? []));
    await lockLandingCollationIdentities(connection, expected, databases);
    for (const plan of [...insertPlans, ...updatePlanList(expected)]) {
      const lock = identityQuery(plan, databases);
      const [rows] = await query(connection, lock.sql, lock.params);
      lockedRows.set(planIdentity(plan), structuredClone(rows ?? []));
      for (const row of rows ?? []) if (Number.isSafeInteger(Number(row.id)) && Number(row.id) > 0) existingIds.set(`${plan.databaseRole}.${plan.table}|${plan.logicalKey}`, Number(row.id));
    }
    for (const demotion of demotionList(expected)) {
      const [rows] = await query(connection, `SELECT id FROM ${quote(databases.local, 'database')}.source_dataset_landings WHERE id = ? FOR UPDATE`, [demotion.id]);
      if (!rows?.length) throw new Error(`Armor landing demotion row is missing: ${demotion.id}`);
    }
    const locked = await deriveLocked({ connection, packet, existingIds: new Map(existingIds), lockedRows: new Map(lockedRows) });
    if (!locked?.landingMaintIntent || locked.landingMaintIntent.intentSha256 !== expected.landingMaintIntent.intentSha256
      || expected.relationIntent && locked.relationIntent?.intentSha256 !== expected.relationIntent.intentSha256) {
      throw new Error('Armor transaction locked rederivation drifted from packet intent');
    }
    await journal.prepared({ packet, expected, locked });
    journalPrepared = true;
    for (const demotion of demotionList(expected)) {
      const [result] = await query(connection, `UPDATE ${quote(databases.local, 'database')}.source_dataset_landings SET is_current = 0, updated_at = ? WHERE id = ?`, [mysqlTimestamp(writeTimestamp), demotion.id]);
      if (result?.affectedRows !== 1) throw new Error(`Armor landing demotion affectedRows is not one: ${demotion.id}`);
    }
    for (const plan of insertPlans) {
      const receipt = await insertPlan(connection, plan, receipts, existingIds, writeTimestamp, strictReadback, databases);
      receipts.set(planIdentity(plan), receipt);
    }
    for (const [identity, receipt] of receipts) existingIds.set(identity, receipt.insertId);
    for (const change of updatePlanList(expected)) {
      await applyUpdate(connection, change, writeTimestamp, strictReadback, databases);
    }
    const verifiedIdMap = Object.fromEntries([...receipts].map(([identity, receipt]) => [identity, receipt.insertId]));
    if (packet.fenceCommit) {
      const generation = Number(packet.fenceCommit.generation);
      const marker = text(packet.fenceCommit.marker, 'Armor transaction fence commit marker');
      if (!Number.isSafeInteger(generation) || generation < 1) throw new Error('Armor transaction fence commit generation is invalid');
      const [fenceResult] = await query(connection,
        `UPDATE ${quote(databases.local, 'database')}.crawler_automation_write_fence SET committed_generation = ?, commit_marker = ? WHERE fence_token = ? AND latest_run_id = ?`,
        [generation, marker, packet.fenceToken, packet.runId]);
      if (fenceResult?.affectedRows !== 1) throw new Error('Armor transaction fence commit was not exact');
    } else if (!allowPartial) {
      throw new Error('Armor transaction fence commit marker is required for the full-chain executor');
    }
    await journal.materialized({ packet, expected, receipts: [...receipts.values()], verifiedIdMap });
    commitAttempted = true;
    try {
      await connection.commit();
    } catch (commitError) {
      // A lost acknowledgement does not prove rollback.  Leave the original
      // transaction outcome to a readback/reconciliation observer and never
      // issue a blind rollback on this connection.
      transactionStarted = false;
      commitError.requiresReadbackReconciliation = true;
      if (typeof journal.commitUnknown === 'function') {
        try { await journal.commitUnknown({ packet, expected, receipts: [...receipts.values()], verifiedIdMap }); }
        catch (journalError) { commitError.journalError = journalError; }
      }
      throw commitError;
    }
    committed = true; transactionStarted = false;
    await journal.committed({ packet, expected, receipts: [...receipts.values()], verifiedIdMap });
    return Object.freeze({ schemaVersion: ARMOR_CANONICAL_TRANSACTION_SCHEMA, operationId: ARMOR_CANONICAL_TRANSACTION_OPERATION_ID, status: 'committed', receipts: [...receipts.values()], verifiedIdMap });
  } catch (error) {
    if (transactionStarted && !committed && !commitAttempted) {
      try {
        await connection.rollback();
        if (journalPrepared) await journal.rolledBack({ packet, expected, error });
      } catch (rollbackError) { error.rollbackError = rollbackError; }
    }
    throw error;
  }
}
