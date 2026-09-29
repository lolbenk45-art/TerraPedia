import { createHash } from 'node:crypto';
import { extractMaintEntitiesFromLandingRow } from './sync-landing-to-maint.mjs';
import { isManagedImagePath, normalizeManagedImageUrlPrefixes } from '../relation/managed-image-url-policy.mjs';

const TABLES = ['maint_armor_sets', 'maint_armor_set_images'];
const DATASETS = ['armor_sets_raw', 'armor_set_images_raw'];
const SOURCE_KEYS = ['wiki.module.armorsetbonuses', 'wiki.armor_set_images'];
const CANONICAL_MODULE_SOURCE_KEY = /^wiki\.module\.armorsetbonuses\.canonical\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const sha256 = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text = (value) => typeof value === 'string' && value.trim() !== '' && value === value.trim();
const positiveId = (value) => Number.isSafeInteger(value) && value > 0;

function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function requireTime(value, label) {
  const string = value instanceof Date ? value.toISOString() : value;
  if (typeof string !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(string)
      || !Number.isFinite(Date.parse(string))) throw new Error(`Armor ${label} timestamp is missing or invalid`);
  const normalized = new Date(string).toISOString();
  if (normalized.slice(0, 19) !== string.slice(0, 19)) throw new Error(`Armor ${label} timestamp has an invalid UTC calendar date`);
  return normalized;
}

// Existing landing/maint DATETIME columns store seconds. Source payload hashes
// still bind the full producer timestamp; only DB-column comparisons truncate.
function storageTime(value, label) {
  return requireTime(value, label).replace(/\.\d{3}Z$/, '.000Z');
}

function parseLanding(row, index, { allowUnmaterializedId = false } = {}) {
  const moduleNamespace = index === 0 && typeof row?.source_key === 'string'
    && CANONICAL_MODULE_SOURCE_KEY.test(row.source_key);
  const sourceKeyMatches = row?.source_key === SOURCE_KEYS[index] || moduleNamespace;
  if (!row || row.dataset_type !== DATASETS[index] || !sourceKeyMatches) {
    throw new Error('Armor landing dataset/source identity mismatch');
  }
  if (row.artifact_role !== 'source_evidence') throw new Error('Armor landing must retain immutable source_evidence history');
  const hasMaterializedId = positiveId(row.id);
  const hasUnmaterializedId = row.id == null && allowUnmaterializedId;
  if ((!hasMaterializedId && !hasUnmaterializedId) || row.provider !== 'terraria.wiki.gg'
      || row.is_current !== 1 || row.parse_status !== 'ok') {
    throw new Error('Armor landing snapshot is not current verified evidence');
  }
  const payload = typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : structuredClone(row.payload_json);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || sha256(payload) !== row.content_hash) {
    throw new Error('Armor landing payload hash mismatch');
  }
  if (!text(payload.sourcePageTitle) || row.source_page !== payload.sourcePageTitle) throw new Error('Armor source title binding mismatch');
  const fetchedAt = storageTime(payload.fetchedAt, 'source fetched');
  if (fetchedAt !== storageTime(row.fetched_at, 'landing fetched') || storageTime(row.parsed_at, 'landing parsed') < fetchedAt) {
    throw new Error('Armor landing source time binding mismatch');
  }
  return payload;
}

function validateModule(payload, landing) {
  if (payload.source !== 'terraria.wiki.gg:Module:ArmorSetBonuses' || payload.sourcePageTitle !== 'Module:ArmorSetBonuses'
      || !Array.isArray(payload.armorSets) || payload.armorSets.length === 0 || payload.totalArmorSets !== payload.armorSets.length) {
    throw new Error('Armor canonical module armorSets payload is missing or invalid');
  }
  const revision = requireTime(payload.sourceRevisionTimestamp, 'module revision');
  if (storageTime(revision, 'module revision') !== storageTime(landing.source_revision_timestamp, 'landing revision')
      || revision > requireTime(payload.fetchedAt, 'module fetched')) throw new Error('Armor module revision binding mismatch');
  const keys = new Set();
  for (const record of payload.armorSets) {
    if (!text(record.textKey) || keys.has(record.textKey)) throw new Error('Armor module text identity is missing or duplicate');
    keys.add(record.textKey);
    if (!Array.isArray(record.sets) || record.sets.length === 0 || record.setCount !== record.sets.length
        || record.sets.some(set => !Array.isArray(set) || set.length !== 3 || set.some(id => !Number.isSafeInteger(id) || id < 0))) {
      throw new Error('Armor module set/part structure is invalid');
    }
    const ids = [...new Set(record.sets.flat())].sort((a, b) => a - b);
    if (!Array.isArray(record.uniqueItemIds) || JSON.stringify([...record.uniqueItemIds].sort((a, b) => a - b)) !== JSON.stringify(ids)) {
      throw new Error('Armor module unique item identities disagree with parts');
    }
  }
  return keys;
}

function validateImages(payload, moduleKeys, prefixes) {
  if (!Array.isArray(payload.armorSetImages) || !Array.isArray(payload.warnings) || payload.warnings.length !== 0
      || payload.totalArmorSetImages !== payload.armorSetImages.length) throw new Error('Armor image evidence is incomplete');
  const keys = new Set();
  for (const row of payload.armorSetImages) {
    if (!moduleKeys.has(row.textKey) || !text(row.sourceFileTitle) || !text(row.pageTitle)
        || !['male', 'female', 'demo', 'part', 'other'].includes(row.imageRole)) throw new Error('Armor image identity is not module-bound');
    const key = JSON.stringify([row.textKey, row.imageRole, row.sourceFileTitle]);
    if (keys.has(key)) throw new Error('Armor image identity is duplicate');
    keys.add(key);
    if (typeof row.isPrimary !== 'boolean') throw new Error('Armor image boolean shape is invalid');
    if (requireTime(row.sourceRevisionTimestamp, 'image revision') > requireTime(payload.fetchedAt, 'image fetched')) {
      throw new Error('Armor image revision is newer than its fetch');
    }
    if (!safeManagedImage(row.cachedUrl, prefixes)) throw new Error('Armor image lacks managed cache evidence');
  }
  if (payload.totalArmorSets !== moduleKeys.size) {
    throw new Error(`Armor image evidence set denominator ${payload.totalArmorSets} does not match module set count ${moduleKeys.size}`);
  }
}

function safeManagedImage(value, prefixes) {
  if (!text(value) || /[?#\\\u0000-\u0020\u007f]/.test(value) || /%(?:25|2f|5c)/i.test(value)) return false;
  try {
    const decoded = decodeURIComponent(value);
    if (/[\\\u0000-\u001f\u007f]/.test(decoded) || decoded.split('/').some(part => part === '.' || part === '..')) return false;
    if (value.startsWith('/') && new URL(value, 'https://managed.invalid').pathname !== value) return false;
    return isManagedImagePath(value, prefixes);
  } catch { return false; }
}

function comparable(value, column) {
  if (column.endsWith('_json') && typeof value === 'string') return canonical(JSON.parse(value));
  if (value != null && (column.endsWith('_timestamp') || column.endsWith('_at'))) return requireTime(value, column);
  if (column === 'is_primary' && [true, false, 0, 1].includes(value)) return Number(value);
  return canonical(value);
}

function dbRow(row) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !['scope', 'tableName'].includes(key))
    .map(([key, value]) => {
      const column = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      return [column, value != null && /_(?:timestamp|at)$/.test(column) ? storageTime(value, column) : value];
    }));
}

function identity(row, table) {
  if (!text(row.text_key)) throw new Error('Armor maint text identity is missing');
  if (table === TABLES[0]) return row.text_key;
  if (!text(row.image_role) || !text(row.source_file_title)) throw new Error('Armor maint image identity is missing');
  return JSON.stringify([row.text_key, row.image_role, row.source_file_title]);
}

function diffRows(current, proposed, table) {
  const byIdentity = new Map();
  const ids = new Set();
  const recordKeys = new Set();
  for (const row of current) {
    const key = identity(row, table);
    if (!positiveId(row.id) || !/^[a-f0-9]{64}$/.test(row.record_key ?? '') || ids.has(row.id)
        || recordKeys.has(row.record_key) || byIdentity.has(key)) throw new Error('Armor maint baseline identity is invalid or duplicate');
    ids.add(row.id);
    recordKeys.add(row.record_key);
    byIdentity.set(key, row);
  }
  const expected = new Map(byIdentity);
  const seen = new Set();
  const changes = { inserts: [], updates: [], unchanged: [], preserved: [] };
  for (const row of proposed) {
    const key = identity(row, table);
    if (seen.has(key)) throw new Error('Armor maint candidate identity is duplicate');
    seen.add(key);
    const before = byIdentity.get(key);
    if (before && (before.status !== 1 || before.deleted !== 0)) throw new Error('Armor maint candidate cannot reactivate an inactive identity');
    const candidate = { ...row, record_key: before?.record_key ?? sha256([table, key]), status: 1, deleted: 0 };
    if (!before) {
      if (recordKeys.has(candidate.record_key)) throw new Error('Armor maint candidate record key collides with another identity');
      recordKeys.add(candidate.record_key);
      changes.inserts.push(candidate);
      expected.set(key, candidate);
      continue;
    }
    const changedColumns = Object.keys(candidate).filter(column => JSON.stringify(comparable(candidate[column], column)) !== JSON.stringify(comparable(before[column], column))).sort();
    if (changedColumns.length === 0) changes.unchanged.push(before);
    else {
      const after = { ...before, ...candidate };
      changes.updates.push({ key: before.record_key, before, after, changedColumns });
      expected.set(key, after);
    }
  }
  for (const [key, row] of byIdentity) if (!seen.has(key)) changes.preserved.push(row);
  const sort = (a, b) => identity(a, table).localeCompare(identity(b, table));
  for (const field of ['inserts', 'unchanged', 'preserved']) changes[field].sort(sort);
  changes.updates.sort((a, b) => sort(a.after, b.after));
  return { changes, expectedRows: [...expected.values()].sort(sort) };
}

// Pure proposal building only: the future executor must bind these snapshots to
// locked DB reads, runtime media policy, a fresh packet and exact owner fences.
export async function buildArmorCanonicalMaintCandidate({
  landingRows, currentRows, managedImageUrlPrefixes, allowUnmaterializedLandingIds = false,
} = {}) {
  if (!Array.isArray(landingRows) || landingRows.length !== 2) throw new Error('Armor requires both landing snapshots');
  if (!currentRows || Object.keys(currentRows).length !== 2 || TABLES.some(table => !Array.isArray(currentRows[table]))) {
    throw new Error('Armor requires the exact complete maint table baselines');
  }
  const prefixes = normalizeManagedImageUrlPrefixes(managedImageUrlPrefixes).sort();
  if (!Array.isArray(managedImageUrlPrefixes) || prefixes.length === 0
      || managedImageUrlPrefixes.some(prefix => normalizeManagedImageUrlPrefixes([prefix]).length !== 1)) {
    throw new Error('Armor managed image prefixes are missing or invalid');
  }
  const baseline = structuredClone(currentRows);
  const snapshots = DATASETS.map(dataset => structuredClone(landingRows.find(row => row.dataset_type === dataset)));
  const payloads = snapshots.map((row, index) => parseLanding(row, index, {
    allowUnmaterializedId: allowUnmaterializedLandingIds,
  }));
  const moduleKeys = validateModule(payloads[0], snapshots[0]);
  validateImages(payloads[1], moduleKeys, prefixes);
  const changes = {};
  const expectedRows = {};
  const summary = { inserts: 0, updates: 0, unchanged: 0, preserved: 0 };
  for (const [index, table] of TABLES.entries()) {
    const extracted = await extractMaintEntitiesFromLandingRow(snapshots[index]);
    if (extracted.rows.some(row => row.tableName !== table)) throw new Error('Armor extractor escaped its table scope');
    const delta = diffRows(baseline[table], extracted.rows.map(dbRow), table);
    changes[table] = delta.changes;
    expectedRows[table] = delta.expectedRows;
    for (const field of Object.keys(summary)) summary[field] += delta.changes[field].length;
  }
  const removedSourceIdentities = changes.maint_armor_sets.preserved.filter(row => row.status === 1 && row.deleted === 0).map(row => row.text_key);
  const removedImageIdentities = changes.maint_armor_set_images.preserved.filter(row => row.status === 1 && row.deleted === 0).map(row => identity(row, TABLES[1]));
  const unresolvedLandingReferences = snapshots.filter(row => row.id == null)
    .map(row => [row.dataset_type, row.provider, row.source_key, row.source_page].join('|'));
  return {
    schemaVersion: 'armor-canonical-maint-candidate/v1', executable: false,
    executionBlocker: 'registered-full-chain-executor-required', tables: [...TABLES],
    changes, expectedRows, summary, deletes: [], removedSourceIdentities, removedImageIdentities,
    requiresRemovalReview: removedSourceIdentities.length > 0 || removedImageIdentities.length > 0,
    unresolvedLandingReferences,
    sourceSnapshotSha256: `sha256:${sha256(canonical(snapshots))}`,
    baselineSha256: `sha256:${sha256(canonical(baseline))}`,
    managedImageUrlPrefixes: prefixes,
  };
}
