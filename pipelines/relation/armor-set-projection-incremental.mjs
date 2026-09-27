import { createHash } from 'node:crypto';
import {
  ARMOR_SET_PROJECTION_COLUMNS,
  ARMOR_SET_PROJECTION_SOURCE_TABLES,
  normalizeArmorRows,
  readArmorProjectionRows,
  readArmorSourceRows,
  toMysqlDateTime,
} from './armor-set-projection-restoration.mjs';
import { isManagedImagePath, normalizeManagedImageUrlPrefixes } from './managed-image-url-policy.mjs';
import { buildProjectionPayload, validateProjectionArmorSetConsistency } from './projection-sync.mjs';

export { readArmorProjectionRows, readArmorSourceRows };
export const ARMOR_SET_PROJECTION_INCREMENTAL_OPERATION_ID = 'canonical-armor-set-projection-incremental';
const IMMUTABLE_FIELDS = new Set(['id', 'relationRecordKey', 'textKey', 'sourceKey', 'entityType', 'status', 'deleted', 'createdAt', 'updatedAt']);
export const ARMOR_SET_PROJECTION_INCREMENTAL_COLUMNS = Object.freeze(
  ARMOR_SET_PROJECTION_COLUMNS.filter((column) => !IMMUTABLE_FIELDS.has(toCamel(column))),
);
const JSON_FIELDS = ['setsJson', 'uniqueItemIdsJson', 'currentItemIdsJson', 'relatedItemsJson'];
const IMAGE_ROLES = { maleImages: ['male'], femaleImages: ['female'], specialImages: ['demo', 'other'] };
const TARGET = Object.freeze({ database: 'terria_v1_relation', table: 'terria_v1_relation.projection_armor_sets', writeTargets: ['relation.projection_armor_sets.update'], mutationMode: 'incremental-owned-fields' });

export function buildArmorSetProjectionIncrementalProposal({
  beforeRows,
  sourceRows,
  serverUuid,
  managedImageUrlPrefixes,
  generatedAt = new Date().toISOString(),
} = {}) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(String(serverUuid ?? ''))
      || !Number.isFinite(Date.parse(generatedAt))) throw new Error('Armor incremental source fingerprint or generatedAt is invalid');
  const prefixes = normalizeManagedImageUrlPrefixes(managedImageUrlPrefixes);
  if (!Array.isArray(managedImageUrlPrefixes) || prefixes.length === 0
      || managedImageUrlPrefixes.some((value) => typeof value !== 'string' || !value.trim())) {
    throw new Error('Armor incremental managed image prefixes are required');
  }
  const source = canonicalSourceRows(sourceRows, prefixes);
  const before = canonicalProjectionRows(beforeRows);
  const derived = canonicalProjectionRows(buildProjectionPayload({ ...source, managedImageUrlPrefixes: prefixes }).projectionArmorSets);
  const byTextKey = new Map(before.map((row) => [row.textKey, row]));
  const merged = new Map(before.map((row) => [row.textKey, row]));
  const changes = [];
  for (const row of derived) {
    const current = byTextKey.get(row.textKey);
    if (!current || current.relationRecordKey !== row.relationRecordKey || current.sourceKey !== row.sourceKey
        || current.entityType !== row.entityType || current.status !== 1 || current.deleted !== 0) {
      throw new Error(`Armor incremental projection identity drifted: ${row.textKey}`);
    }
    const candidate = { ...row };
    for (const field of IMMUTABLE_FIELDS) candidate[field] = current[field];
    preserveRelatedPartIdentity(current, candidate, prefixes);
    const armorImages = source.relationArmorSetImages.filter((image) => image.armorSetRecordKey === row.relationRecordKey || image.textKey === row.textKey);
    for (const [field, roles] of Object.entries(IMAGE_ROLES)) {
      const urls = [...new Set(armorImages.filter((image) => roles.includes(image.imageRole))
        .flatMap((image) => parseImages(image.cachedUrl, prefixes)))].sort();
      // The shared derivation also resolves the documented Hallowed image alias.
      if (!urls.length) urls.push(...parseImages(row[field], prefixes));
      const oldUrls = parseImages(current[field], prefixes);
      if (oldUrls.some((url) => !urls.includes(url))) throw new Error(`Armor incremental managed image loss requires a separate scope: ${field}`);
      candidate[field] = stable([...oldUrls].sort()) === stable(urls)
        ? current[field]
        : urls.length > 1 ? JSON.stringify(urls) : urls[0] ?? null;
    }
    if (stable(current) !== stable(candidate)) changes.push(candidate);
    merged.set(row.textKey, candidate);
  }
  const after = canonicalProjectionRows([...merged.values()]);
  const proposal = {
    schemaVersion: 1,
    proposalKind: 'canonical_armor_set_projection_incremental',
    operationId: ARMOR_SET_PROJECTION_INCREMENTAL_OPERATION_ID,
    generatedAt,
    applyAllowed: false,
    databaseWrites: false,
    externalRequests: false,
    authorityKind: 'current_relation_chain',
    serverFingerprint: { serverUuid, databases: ['terria_v1_relation'] },
    source: {
      tables: { ...ARMOR_SET_PROJECTION_SOURCE_TABLES },
      counts: Object.fromEntries(Object.entries(source).map(([key, rows]) => [key, rows.length])),
      sourceSnapshotSha256: hash(source),
      managedImageUrlPrefixes: prefixes,
      historical88RowBackupUsedAsAuthority: false,
      rows: source,
    },
    target: structuredClone(TARGET),
    columns: [...ARMOR_SET_PROJECTION_INCREMENTAL_COLUMNS],
    expectedRowCount: after.length,
    changedRowCount: changes.length,
    changedKeys: changes.map((row) => row.textKey),
    keys: after.map((row) => row.textKey),
    keySetSha256: hash(after.map((row) => row.textKey)),
    before: { rowCount: before.length, rowsSha256: hash(before), rows: before },
    after: { rowCount: after.length, rowsSha256: hash(after), rows: after },
    rows: changes,
  };
  proposal.scopeSha256 = hash(proposal);
  return proposal;
}

export function validateArmorSetProjectionIncrementalProposal(proposal) {
  if (!proposal || proposal.operationId !== ARMOR_SET_PROJECTION_INCREMENTAL_OPERATION_ID) {
    throw new Error('Armor incremental proposal operation identity is invalid');
  }
  const expected = buildArmorSetProjectionIncrementalProposal({
    beforeRows: proposal.before?.rows,
    sourceRows: proposal.source?.rows,
    serverUuid: proposal.serverFingerprint?.serverUuid,
    managedImageUrlPrefixes: proposal.source?.managedImageUrlPrefixes,
    generatedAt: proposal.generatedAt,
  });
  if (stable(expected) !== stable(proposal)) throw new Error('Armor incremental proposal hash, target, columns or derived rows drifted');
  return true;
}

export async function executeArmorSetProjectionIncrementalTransaction({
  connection,
  proposal,
  consumeDispatchPermit,
  assertWriterFence,
  readSourceRows = readArmorSourceRows,
  readCurrent = readArmorProjectionRows,
  readServerUuid = readArmorServerUuid,
} = {}) {
  validateArmorSetProjectionIncrementalProposal(proposal);
  if (!connection || typeof connection.beginTransaction !== 'function'
      || typeof consumeDispatchPermit !== 'function' || typeof assertWriterFence !== 'function') {
    throw new Error('Armor incremental transaction requires connection, dispatch permit and writer fence');
  }
  // Detach the transaction contract before any asynchronous callback can mutate it.
  const bound = structuredClone(proposal);
  let began = false;
  let committing = false;
  try {
    await connection.beginTransaction();
    began = true;
    if (await readServerUuid(connection) !== bound.serverFingerprint.serverUuid) throw new Error('Armor incremental server identity drifted');
    await assertWriterFence(connection, structuredClone(bound));
    const sourceRows = await readSourceRows(connection, { forUpdate: true });
    const beforeRows = await readCurrent(connection, bound, { forUpdate: true, after: false });
    const current = buildArmorSetProjectionIncrementalProposal({
      beforeRows, sourceRows,
      serverUuid: bound.serverFingerprint.serverUuid,
      managedImageUrlPrefixes: bound.source.managedImageUrlPrefixes,
      generatedAt: bound.generatedAt,
    });
    if (stable(current) !== stable(bound)) throw new Error('Armor incremental source snapshot or baseline drifted after lock');
    let affectedRows = 0;
    if (bound.changedRowCount > 0) {
      await consumeDispatchPermit();
      affectedRows = await updateArmorProjectionRows(connection, bound.rows);
    }
    if (affectedRows !== bound.changedRowCount) throw new Error('Armor incremental affected row count drifted');
    const after = canonicalProjectionRows(await readCurrent(connection, bound, { forUpdate: true, after: true }));
    if (hash(after) !== bound.after.rowsSha256) throw new Error('Armor incremental transaction readback drifted');
    committing = true;
    await connection.commit();
    return { transactionCommitted: true, affectedRows, afterRowsSha256: bound.after.rowsSha256, scopeSha256: bound.scopeSha256 };
  } catch (error) {
    if (committing) {
      error.requiresReadbackReconciliation = true;
    } else if (began) {
      try { await connection.rollback(); } catch (rollbackError) {
        error.requiresReadbackReconciliation = true;
        error.rollbackError = rollbackError;
      }
    }
    throw error;
  }
}

async function updateArmorProjectionRows(connection, rows) {
  const assignments = ARMOR_SET_PROJECTION_INCREMENTAL_COLUMNS.map((column) => `\`${column}\` = ?`);
  // MySQL ON UPDATE must not turn a publication into timestamp-only drift.
  assignments.push('`updated_at` = `updated_at`');
  const sql = `UPDATE \`terria_v1_relation\`.\`projection_armor_sets\` SET ${assignments.join(', ')} `
    + 'WHERE `id` = ? AND `text_key` = ? AND `relation_record_key` = ? AND `source_key` = ? AND `entity_type` = ? AND `status` = 1 AND `deleted` = 0';
  let affected = 0;
  for (const row of rows) {
    const values = ARMOR_SET_PROJECTION_INCREMENTAL_COLUMNS.map((column) => column === 'source_revision_timestamp' ? toMysqlDateTime(row[toCamel(column)]) : row[toCamel(column)]);
    const [result] = await connection.execute(sql, [...values, row.id, row.textKey, row.relationRecordKey, row.sourceKey, row.entityType]);
    if (Number(result?.affectedRows) !== 1) throw new Error('Armor incremental affected row count drifted');
    affected += 1;
  }
  return affected;
}

async function readArmorServerUuid(connection) {
  const [rows] = await connection.query('SELECT @@server_uuid AS serverUuid');
  return rows[0]?.serverUuid;
}

function canonicalSourceRows(sourceRows, prefixes) {
  if (!sourceRows || stable(Object.keys(sourceRows).sort()) !== stable(Object.keys(ARMOR_SET_PROJECTION_SOURCE_TABLES).sort())) {
    throw new Error('Armor incremental source tables are missing or unexpected');
  }
  const result = {};
  for (const [table, rows] of Object.entries(sourceRows)) {
    if (!Array.isArray(rows)) throw new Error(`Armor incremental source rows are invalid: ${table}`);
    const ids = new Set();
    result[table] = rows.map((raw) => {
      const row = camelRow(raw);
      if (!positiveId(row.id) || ids.has(Number(row.id)) || row.status !== 1 || row.deleted !== 0) throw new Error(`Armor incremental source identity or active state is invalid: ${table}`);
      ids.add(Number(row.id));
      return row;
    }).sort((left, right) => String(left.id).localeCompare(String(right.id), 'en', { numeric: true }));
  }
  const armorKeys = new Set();
  const textKeys = new Set();
  for (const row of result.relationArmorSets) {
    const raw = jsonObject(row.rawJson, 'Armor source rawJson');
    if (!recordKey(row.recordKey) || !text(row.textKey) || armorKeys.has(row.recordKey) || textKeys.has(row.textKey)
        || (raw.entityType != null && raw.entityType !== 'armor_set')) throw new Error('Armor incremental source identity is invalid or duplicate');
    armorKeys.add(row.recordKey);
    textKeys.add(row.textKey);
    jsonArray(row.setsJson, 'Armor source setsJson');
    jsonArray(row.uniqueItemIdsJson, 'Armor source uniqueItemIdsJson');
  }
  const itemsBySourceId = new Map();
  const itemsByInternalName = new Map();
  for (const row of result.relationItems) {
    if (!positiveId(row.sourceId) || !text(row.internalName)
        || itemsBySourceId.has(Number(row.sourceId)) || itemsByInternalName.has(row.internalName)) {
      throw new Error('Armor incremental source item identity is invalid or ambiguous');
    }
    itemsBySourceId.set(Number(row.sourceId), row);
    itemsByInternalName.set(row.internalName, row);
  }
  const parts = new Set();
  for (const row of result.relationArmorSetItems) {
    const identity = `${row.armorSetRecordKey}:${partKey(row)}`;
    if (!armorKeys.has(row.armorSetRecordKey) || parts.has(identity)
        || !Number.isInteger(row.setVariantIndex) || !Number.isInteger(row.partIndex)
        || row.setVariantIndex < 0 || row.partIndex < 0) throw new Error('Armor incremental source part identity is invalid or duplicate');
    parts.add(identity);
    const item = itemsBySourceId.get(Number(row.itemSourceId));
    if (!positiveId(row.itemSourceId) || !text(row.itemInternalName) || !item
        || item !== itemsByInternalName.get(row.itemInternalName)) {
      throw new Error('Armor incremental source part item identity is dangling or conflicting');
    }
  }
  const armorByKey = new Map(result.relationArmorSets.map((row) => [row.recordKey, row]));
  for (const row of result.relationArmorSetImages) {
    const owner = armorByKey.get(row.armorSetRecordKey);
    if (!owner || (row.textKey != null && row.textKey !== owner.textKey)) throw new Error('Armor incremental image source owner identity drifted');
  }
  for (const row of [...result.relationItemImages, ...result.relationArmorSetImages]) parseImages(row.cachedUrl, prefixes);
  return result;
}

function canonicalProjectionRows(rows) {
  if (!Array.isArray(rows)) throw new Error('Armor incremental projection rows are required');
  const allowed = new Set(ARMOR_SET_PROJECTION_COLUMNS.map(toCamel));
  for (const raw of rows) {
    if (Object.keys(camelRow(raw)).some((key) => !allowed.has(key))) throw new Error('Armor incremental projection column is not allowed');
  }
  const result = normalizeArmorRows(rows);
  const ids = new Set();
  const keys = new Set();
  const relationKeys = new Set();
  for (const row of result) {
    if (!positiveId(row.id) || ids.has(Number(row.id)) || !text(row.textKey) || keys.has(row.textKey)
        || !recordKey(row.relationRecordKey) || relationKeys.has(row.relationRecordKey)
        || !text(row.sourceKey) || row.entityType !== 'armor_set') throw new Error('Armor incremental projection identity is invalid or duplicated');
    ids.add(Number(row.id));
    keys.add(row.textKey);
    relationKeys.add(row.relationRecordKey);
    for (const field of JSON_FIELDS) row[field] = stable(jsonArray(row[field], `Armor projection ${field}`));
  }
  return result;
}

function preserveRelatedPartIdentity(before, after, prefixes) {
  const oldParts = jsonArray(before.relatedItemsJson, 'Armor related items');
  const newParts = jsonArray(after.relatedItemsJson, 'Armor related items');
  const byPart = new Map(newParts.map((part) => [partKey(part), part]));
  if (new Set(oldParts.map(partKey)).size !== oldParts.length || byPart.size !== newParts.length) throw new Error('Armor incremental related part identity is duplicated');
  for (const previous of oldParts) {
    const next = byPart.get(partKey(previous));
    if (!next || previous.internalName !== next.internalName || previous.sourceId !== next.sourceId
        || previous.partRole !== next.partRole) throw new Error('Armor incremental related part identity drifted');
    const oldImages = parseImages(previous.image, prefixes);
    const newImages = parseImages(next.image, prefixes);
    if (oldImages.some((image) => !newImages.includes(image))) throw new Error('Armor incremental related managed image loss requires a separate scope');
  }
  for (const part of newParts) parseImages(part.image, prefixes);
  const issues = validateProjectionArmorSetConsistency([after]);
  if (issues.length) throw new Error(`Armor incremental source part consistency failed: ${issues[0].code}`);
}

function parseImages(value, prefixes) {
  if (value == null || value === '') return [];
  const values = Array.isArray(value) ? value : typeof value === 'string' && value.trim().startsWith('[')
    ? jsonArray(value, 'Armor image array') : [value];
  for (const image of values) {
    if (typeof image !== 'string' || !image.trim() || !isManagedImagePath(image, prefixes)) throw new Error('Armor incremental image is malformed or unmanaged');
    let location;
    try { location = new URL(image, 'http://managed.invalid'); } catch { throw new Error('Armor incremental image path is malformed'); }
    if (/%(?:2f|5c|25)/i.test(location.pathname) || image.includes('\\')) throw new Error('Armor incremental image path contains encoded separators');
    // Origin-free paths need URL normalization before applying the shared policy.
    if (image.startsWith('/')) {
      let parsed;
      try { parsed = new URL(image, 'http://managed.invalid'); } catch { throw new Error('Armor incremental image path is malformed'); }
      if (parsed.search || parsed.hash || decodeURIComponent(parsed.pathname).split('/').some((part) => part === '..' || part === '.')
          || parsed.pathname !== image || !isManagedImagePath(parsed.pathname, prefixes)) throw new Error('Armor incremental image path is unmanaged');
    }
  }
  return [...new Set(values.map((value) => value.trim()))];
}

function jsonArray(value, label) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch { throw new Error(`${label} is malformed`); }
}

function jsonObject(value, label) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch { throw new Error(`${label} is malformed`); }
}

function camelRow(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Armor source row is malformed');
  const row = {};
  for (const [key, value] of Object.entries(raw)) {
    const field = toCamel(key);
    if (Object.hasOwn(row, field)) throw new Error('Armor source row has duplicate column identity');
    row[field] = stableValue(value);
  }
  return row;
}

function partKey(row) { return stable([row.setVariantIndex, row.partIndex]); }
function positiveId(value) {
  return (typeof value === 'number' || typeof value === 'string' && /^[1-9][0-9]*$/.test(value))
    && Number.isSafeInteger(Number(value)) && Number(value) > 0;
}
function recordKey(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function text(value) { return typeof value === 'string' && value.trim().length > 0 && value.trim() === value; }
function toCamel(value) { return String(value).replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase()); }
function stableValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}
function stable(value) { return JSON.stringify(stableValue(value)); }
function hash(value) { return `sha256:${createHash('sha256').update(stable(value)).digest('hex')}`; }
