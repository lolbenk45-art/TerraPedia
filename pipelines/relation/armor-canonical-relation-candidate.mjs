import { createHash } from 'node:crypto';
import { buildArmorCanonicalMaintCandidate } from '../maint/armor-canonical-maint-candidate.mjs';
import { buildArmorSetRelations } from './armor-set-processor.mjs';

const TABLES = ['relation_armor_sets', 'relation_armor_set_items', 'relation_armor_set_images'];
const MAINT_TABLES = ['maint_armor_sets', 'maint_armor_set_images'];
const DATASETS = ['armor_sets_raw', 'armor_set_images_raw'];
const text = value => typeof value === 'string' && value.trim() !== '' && value.trim() === value;
const positiveId = value => Number.isSafeInteger(value) && value > 0;
const recordKey = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const active = row => row.status === 1 && row.deleted === 0;
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function canonical(value, sortKeys = true) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(child => canonical(child, sortKeys));
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (sortKeys) keys.sort();
    return Object.fromEntries(keys.map(key => [key, canonical(value[key], sortKeys)]));
  }
  return value;
}

const stable = value => JSON.stringify(canonical(value));
const digest = value => createHash('sha256').update(stable(value)).digest('hex');
const hash = value => `sha256:${digest(value)}`;

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || stable(Object.keys(value).sort()) !== stable([...keys].sort())) throw new Error(`Armor ${label} requires exact complete inputs/tables`);
}

function jsonArray(value, label) {
  let parsed;
  try { parsed = typeof value === 'string' ? JSON.parse(value) : value; } catch { /* Rejected below. */ }
  if (!Array.isArray(parsed)) throw new Error(`Armor ${label} is malformed`);
  return parsed;
}

function jsonObject(value, label) {
  let parsed;
  try { parsed = typeof value === 'string' ? JSON.parse(value) : value; } catch { /* Rejected below. */ }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`Armor ${label} is malformed`);
  return parsed;
}

function slotNumber(value) {
  if (value == null || value === '') return null;
  if (!(typeof value === 'number' || typeof value === 'string' && /^-?\d+$/.test(value))
      || !Number.isSafeInteger(Number(value)) || Number(value) < -1) throw new Error('Armor item slot evidence is malformed');
  return Number(value);
}

function utcTime(value, label) {
  const string = value instanceof Date ? value.toISOString() : value;
  if (typeof string !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(string)
      || !Number.isFinite(Date.parse(string))) throw new Error(`Armor ${label} timestamp is malformed`);
  const normalized = new Date(string).toISOString();
  if (normalized.slice(0, 19) !== string.slice(0, 19)) throw new Error(`Armor ${label} timestamp has an invalid UTC calendar date`);
  return normalized;
}

function rowState(row, label) {
  if (!row || typeof row !== 'object' || Array.isArray(row) || ![0, 1].includes(row.status) || ![0, 1].includes(row.deleted)) {
    throw new Error(`Armor ${label} identity/state is malformed`);
  }
  if (Object.keys(row).some(key => /[A-Z]/.test(key))) throw new Error(`Armor ${label} requires unambiguous SQL column identities`);
}

function identity(row, table) {
  if (!text(row.text_key)) throw new Error('Armor relation text identity is missing');
  if (table === TABLES[0]) return row.text_key;
  if (table === TABLES[1]) {
    if (!Number.isSafeInteger(row.set_variant_index) || row.set_variant_index < 0 || !Number.isSafeInteger(row.part_index)
        || row.part_index < 0 || row.part_index > 2 || !positiveId(row.item_source_id) || !text(row.item_internal_name)) {
      throw new Error('Armor relation part identity is malformed');
    }
    return stable([row.text_key, row.set_variant_index, row.part_index, row.item_source_id]);
  }
  if (!['male', 'female', 'demo', 'part', 'other'].includes(row.image_role) || !text(row.source_file_title)) {
    throw new Error('Armor relation image identity is malformed');
  }
  return stable([row.text_key, row.image_role, row.source_file_title]);
}

function itemIndex(rows) {
  if (!Array.isArray(rows)) throw new Error('Armor maint item dependencies are required');
  const bySource = new Map();
  const names = new Set();
  const ids = new Set();
  for (const row of rows) {
    rowState(row, 'item dependency');
    if (Object.hasOwn(row, 'record_key')) throw new Error('Armor maint item lineage cannot include nonexistent record_key');
    if (['head_slot', 'body_slot', 'leg_slot'].some(column => Object.hasOwn(row, column))) {
      throw new Error('Armor maint item slot column does not exist; raw_json is authoritative');
    }
    if (!text(row.source_provider) || !positiveId(row.landing_source_id) || !text(row.landing_source_key) || !recordKey(row.landing_content_hash)) {
      throw new Error('Armor item dependency lineage is missing or malformed');
    }
    // Unlike the DATETIME trace fields, this VARCHAR(64) retains Wiki _generated.
    if (row.module_generated_at != null && (!text(row.module_generated_at) || row.module_generated_at.length > 64
        || /[\u0000-\u001f\u007f]/.test(row.module_generated_at))) throw new Error('Armor module_generated_at producer text is malformed');
    for (const column of ['source_revision_timestamp', 'landing_fetched_at', 'landing_parsed_at']) {
      if (row[column] != null) utcTime(row[column], `item trace ${column}`);
    }
    if (!positiveId(row.id) || !positiveId(row.source_id) || !text(row.internal_name) || ids.has(row.id)
        || bySource.has(row.source_id) || names.has(row.internal_name)) throw new Error('Armor item dependency identity is invalid or ambiguous/duplicate');
    ids.add(row.id);
    names.add(row.internal_name);
    bySource.set(row.source_id, row);
  }
  return bySource;
}

function validateBaseline(currentRows, items) {
  const indexes = {};
  for (const table of TABLES) {
    if (!Array.isArray(currentRows[table])) throw new Error('Armor requires complete relation table baselines');
    const byIdentity = new Map();
    const ids = new Set();
    const keys = new Set();
    const slots = new Set();
    for (const row of currentRows[table]) {
      rowState(row, 'relation baseline');
      const key = identity(row, table);
      if (!positiveId(row.id) || !recordKey(row.record_key) || ids.has(row.id) || keys.has(row.record_key) || byIdentity.has(key)) {
        throw new Error('Armor relation baseline identity is invalid or duplicate');
      }
      const sourceTable = table === TABLES[0] ? MAINT_TABLES[0] : table === TABLES[1] ? 'maint_items' : MAINT_TABLES[1];
      if (row.source_maint_table !== sourceTable) throw new Error('Armor relation baseline escaped its maint owner scope');
      if (table === TABLES[0] && active(row) && row.raw_json != null) {
        const raw = jsonObject(row.raw_json, 'parent definition');
        if (raw.entityType != null && raw.entityType !== 'armor_set') throw new Error('Armor parent entity escaped its owner scope');
      }
      ids.add(row.id);
      keys.add(row.record_key);
      byIdentity.set(key, row);
      if (table === TABLES[1] && active(row)) {
        const slot = stable([row.text_key, row.set_variant_index, row.part_index]);
        if (slots.has(slot)) throw new Error('Armor baseline has duplicate active part slot');
        slots.add(slot);
      }
    }
    indexes[table] = byIdentity;
  }
  const parents = new Map(currentRows.relation_armor_sets.map(row => [row.record_key, row]));
  for (const table of TABLES.slice(1)) for (const row of currentRows[table]) {
    const parent = parents.get(row.armor_set_record_key);
    if (!parent || parent.text_key !== row.text_key) throw new Error('Armor relation child has a foreign parent/owner identity');
    if (!active(row)) continue;
    if (!active(parent)) throw new Error('Armor active child has an inactive parent');
    if (table === TABLES[1]) {
      const item = items.get(row.item_source_id);
      if (!item || !active(item) || item.internal_name !== row.item_internal_name || row.source_maint_id !== item.id) {
        throw new Error('Armor relation part item dependency join identity is missing, inactive or stale');
      }
      const sets = jsonArray(parent.sets_json, 'baseline parent sets');
      if (sets[row.set_variant_index]?.[row.part_index] !== row.item_source_id) throw new Error('Armor baseline part slot identity disagrees with its parent');
    }
  }
  return indexes;
}

function sourcePresentRows(candidate, table) {
  const delta = candidate.changes[table];
  return [...delta.inserts, ...delta.updates.map(change => change.after), ...delta.unchanged];
}

function dbRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`), value]));
}

function comparable(value, column) {
  if (column.endsWith('_json') && typeof value === 'string') return canonical(JSON.parse(value));
  if (value != null && /_(?:timestamp|at)$/.test(column)) {
    return utcTime(value, `relation ${column}`);
  }
  if (column === 'is_primary' && [true, false, 0, 1].includes(value)) return Number(value);
  if (column === 'confidence' && (typeof value === 'number' || typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value))) return Number(value);
  return canonical(value);
}

function reconcile(table, rows, baseline) {
  const expected = new Map(baseline);
  const keys = new Set([...baseline.values()].map(row => row.record_key));
  const seen = new Set();
  const changes = { inserts: [], updates: [], unchanged: [], preserved: [] };
  for (const row of rows) {
    const key = identity(row, table);
    if (seen.has(key)) throw new Error('Armor derived relation identity is duplicate');
    seen.add(key);
    const before = baseline.get(key);
    if (before && !active(before)) throw new Error('Armor relation candidate cannot reactivate an inactive identity');
    const candidate = { ...row, record_key: before?.record_key ?? digest([table, key]), status: 1, deleted: 0 };
    if (!before) {
      if (keys.has(candidate.record_key)) throw new Error('Armor relation candidate record key collides with another identity');
      keys.add(candidate.record_key);
      changes.inserts.push(candidate);
      expected.set(key, candidate);
      continue;
    }
    const changedColumns = Object.keys(candidate).filter(column => stable(comparable(candidate[column], column)) !== stable(comparable(before[column], column))).sort();
    if (changedColumns.length === 0) changes.unchanged.push(before);
    else {
      const after = { ...before, ...candidate };
      changes.updates.push({ key: before.record_key, before, after, changedColumns });
      expected.set(key, after);
    }
  }
  for (const [key, row] of baseline) if (!seen.has(key)) changes.preserved.push(row);
  const sort = (left, right) => compare(identity(left, table), identity(right, table));
  for (const field of ['inserts', 'unchanged', 'preserved']) changes[field].sort(sort);
  changes.updates.sort((left, right) => sort(left.after, right.after));
  return { changes, expectedRows: [...expected.values()].sort(sort) };
}

// Pure proposal only. The future executor must capture complete locked snapshots,
// resolve generated maint/relation IDs and bind its runtime media policy itself.
// Caller hashes, candidate objects and execution booleans are never authority.
async function buildArmorCanonicalRelationCandidateInternal(input = {}, { idIndependent = false } = {}) {
  exactKeys(input, ['maintInput', 'maintItems', 'currentRows'], 'relation candidate');
  // Producer payload hashes bind JSON insertion order. Normalize Dates without
  // sorting detached inputs; only the separate candidate hashes canonicalize.
  const snapshot = canonical(structuredClone(input), false);
  exactKeys(snapshot.maintInput, idIndependent
    ? ['landingRows', 'currentRows', 'managedImageUrlPrefixes', 'allowUnmaterializedLandingIds']
    : ['landingRows', 'currentRows', 'managedImageUrlPrefixes'], 'maint input');
  if (idIndependent && snapshot.maintInput.allowUnmaterializedLandingIds !== true) {
    throw new Error('Armor ID-independent relation candidate requires unresolved landing IDs to be explicit');
  }
  exactKeys(snapshot.currentRows, TABLES, 'relation baseline');
  exactKeys(snapshot.maintInput.currentRows, MAINT_TABLES, 'maint baseline');
  const items = itemIndex(snapshot.maintItems);
  const baselines = validateBaseline(snapshot.currentRows, items);
  for (const table of TABLES) snapshot.currentRows[table].sort((left, right) => compare(identity(left, table), identity(right, table)));
  snapshot.maintItems.sort((left, right) => left.source_id - right.source_id);
  if (!Array.isArray(snapshot.maintInput.landingRows)) throw new Error('Armor landing snapshots are required');
  snapshot.maintInput.landingRows.sort((left, right) => DATASETS.indexOf(left.dataset_type) - DATASETS.indexOf(right.dataset_type));
  for (const table of MAINT_TABLES) {
    if (!Array.isArray(snapshot.maintInput.currentRows[table])) throw new Error('Armor requires complete maint baselines');
    snapshot.maintInput.currentRows[table].sort((left, right) => compare(stable([left.text_key, left.image_role, left.source_file_title]), stable([right.text_key, right.image_role, right.source_file_title])));
  }
  freeze(snapshot);
  const maint = await buildArmorCanonicalMaintCandidate(idIndependent
    ? { ...snapshot.maintInput, allowUnmaterializedLandingIds: true }
    : snapshot.maintInput);
  const armorRows = sourcePresentRows(maint, MAINT_TABLES[0]);
  const imageRows = sourcePresentRows(maint, MAINT_TABLES[1]);
  for (const row of imageRows) {
    if (row.source_maint_table != null && row.source_maint_table !== MAINT_TABLES[1]) throw new Error('Armor image derivation escaped its maint owner scope');
  }
  for (const armor of armorRows) for (const sourceId of jsonArray(armor.unique_item_ids_json, 'canonical item IDs')) {
    if (sourceId > 0 && !active(items.get(sourceId) ?? {})) throw new Error('Armor canonical part item dependency is missing or inactive');
  }
  const derived = buildArmorSetRelations({
    maintArmorSets: armorRows, maintArmorSetImages: imageRows,
    maintItems: snapshot.maintItems.filter(active), managedImageUrlPrefixes: maint.managedImageUrlPrefixes,
  });
  if (derived.issues.length || derived.relationArmorSetImages.length !== imageRows.length) throw new Error('Armor relation derivation has unresolved dependencies');
  for (const part of derived.relationArmorSetItems) {
    const item = items.get(part.itemSourceId);
    const raw = jsonObject(item.raw_json, 'item slot evidence');
    const slots = [raw.headSlot, raw.bodySlot, raw.legSlot].map(slotNumber);
    const roles = ['head', 'body', 'legs'];
    const equipped = slots.map((value, index) => value != null && value >= 0 ? index : null)
      .filter(index => index != null);
    if (equipped.length !== 1 || equipped[0] !== part.partIndex || roles[part.partIndex] !== part.partRole) {
      throw new Error('Armor item slot role is unknown, ambiguous or inconsistent with its canonical part');
    }
  }
  const changes = {};
  const expectedRows = {};
  const parentKeys = new Map();
  const summary = { inserts: 0, updates: 0, unchanged: 0, preserved: 0 };
  for (const [index, field] of ['relationArmorSets', 'relationArmorSetItems', 'relationArmorSetImages'].entries()) {
    const table = TABLES[index];
    const rows = derived[field].map(dbRow);
    for (const row of rows) if (index > 0) {
      const key = parentKeys.get(row.text_key);
      if (!key) throw new Error('Armor derived child has an unresolved parent');
      row.armor_set_record_key = key;
    }
    const result = reconcile(table, rows, baselines[table]);
    changes[table] = result.changes;
    expectedRows[table] = result.expectedRows;
    if (index === 0) for (const row of result.expectedRows) parentKeys.set(row.text_key, row.record_key);
    for (const field of Object.keys(summary)) summary[field] += result.changes[field].length;
  }
  const removedIdentities = Object.fromEntries(TABLES.map(table => [table, changes[table].preserved.filter(active).map(row => identity(row, table))]));
  const unresolvedGeneratedIds = TABLES.flatMap(table => changes[table].inserts.map(row => ({ table, recordKey: row.record_key })));
  const unresolvedDependencies = [armorRows, imageRows].flatMap((rows, index) => rows.filter(row => !positiveId(row.id))
    .map(row => ({ table: MAINT_TABLES[index], recordKey: row.record_key, column: 'source_maint_id' })))
    .sort((left, right) => compare(stable(left), stable(right)));
  const result = {
    schemaVersion: 'armor-canonical-relation-candidate/v1', executable: false,
    executionBlocker: 'registered-full-chain-executor-required', tables: [...TABLES],
    changes, expectedRows, summary, deletes: [], removedIdentities,
    requiresRemovalReview: maint.requiresRemovalReview || Object.values(removedIdentities).some(rows => rows.length > 0),
    unresolvedGeneratedIds, unresolvedDependencies, inputSnapshots: snapshot,
    sourceSnapshotSha256: maint.sourceSnapshotSha256, maintBaselineSha256: maint.baselineSha256,
    baselineSha256: hash(snapshot.currentRows), itemDependenciesSha256: hash(snapshot.maintItems),
    inputSha256: hash(snapshot), managedImageUrlPrefixes: maint.managedImageUrlPrefixes,
  };
  return freeze({ ...result, candidateSha256: hash(result) });
}

export async function buildArmorCanonicalRelationCandidate(input = {}) {
  return buildArmorCanonicalRelationCandidateInternal(input);
}

export async function buildArmorCanonicalRelationIdIndependentCandidate(input = {}) {
  return buildArmorCanonicalRelationCandidateInternal(input, { idIndependent: true });
}
