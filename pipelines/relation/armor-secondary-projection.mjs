import { createHash } from 'node:crypto';
import { extractMaintEntitiesFromLandingRow } from '../maint/sync-landing-to-maint.mjs';
import { buildArmorAttributeRelations, buildArmorAttributeEffectRows } from './sync-maint-to-relation.mjs';
import { buildProjectionPayload } from './projection-sync.mjs';

export const ARMOR_SECONDARY_PROJECTION_OPERATION_ID = 'canonical-armor-secondary-projection';
export const ARMOR_SECONDARY_PROJECTION_TABLES = Object.freeze([
  'projection_item_armor_attributes', 'projection_equipment_effect_attributes',
]);
export const ARMOR_SECONDARY_COLUMNS = Object.freeze({
  projection_item_armor_attributes: Object.freeze([
    'id', 'relation_record_key', 'item_id', 'item_internal_name', 'item_name_zh', 'item_page_title',
    'item_href', 'section_code', 'slot_group', 'defense_value', 'raw_cells_json', 'source_provider',
    'source_page', 'source_revision_timestamp', 'status', 'deleted', 'created_at', 'updated_at',
  ]),
  projection_equipment_effect_attributes: Object.freeze([
    'id', 'relation_record_key', 'owner_kind', 'owner_id', 'owner_key', 'source_kind', 'source_line',
    'source_line_index', 'effect_index', 'apply_scope', 'variant_label', 'item_internal_name', 'slot_type',
    'stat_key', 'stat_label_zh', 'class_scope', 'operation', 'value_decimal', 'value_max_decimal', 'unit',
    'condition_text', 'raw_text', 'parse_status', 'confidence', 'status', 'deleted', 'created_at', 'updated_at',
  ]),
});
export const ARMOR_SECONDARY_SOURCE_TABLES = Object.freeze({
  relation_armor_sets: 'terria_v1_relation.relation_armor_sets',
  relation_armor_set_items: 'terria_v1_relation.relation_armor_set_items',
  maint_items: 'terria_v1_maint.maint_items',
  local_items: 'terria_v1_local.items',
  maint_armor_attribute_rows: 'terria_v1_maint.maint_armor_attribute_rows',
  maint_landings: 'terria_v1_maint.source_dataset_landings',
  relation_armor_attribute_rows: 'terria_v1_relation.relation_armor_attribute_rows',
  relation_equipment_effect_attributes: 'terria_v1_relation.relation_equipment_effect_attributes',
});
const SOURCE_BY_TARGET = {
  projection_item_armor_attributes: 'relation_armor_attribute_rows',
  projection_equipment_effect_attributes: 'relation_equipment_effect_attributes',
};
const NUMERIC = new Set(['confidence', 'value_decimal', 'value_max_decimal', 'defense_value']);
const active = row => row.status === 1 && row.deleted === 0;
const id = value => Number.isSafeInteger(value) && value > 0;
const text = value => typeof value === 'string' && value.trim() !== '' && value === value.trim();
const fail = message => { throw new Error(`Armor secondary ${message}`); };
const snake = row => Object.fromEntries(Object.entries(row)
  .filter(([field]) => !['scope', 'tableName'].includes(field))
  .map(([field, value]) => [field.replace(/[A-Z]/g, char => `_${char.toLowerCase()}`), value]));
const camel = row => Object.fromEntries(Object.entries(row)
  .map(([field, value]) => [field.replace(/_([a-z])/g, (_, char) => char.toUpperCase()), value]));

function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort()
    .map(key => [key, canonical(value[key])]));
  return value;
}
const stable = value => JSON.stringify(canonical(value));
const hash = value => `sha256:${createHash('sha256').update(stable(value)).digest('hex')}`;

function json(value, label, array = false) {
  let parsed;
  try { parsed = typeof value === 'string' ? JSON.parse(value) : value; }
  catch { fail(`${label} is malformed JSON`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) !== array) fail(`${label} has invalid JSON shape`);
  return parsed;
}

function comparable(value, field) {
  if (value == null) return null;
  if (field.endsWith('_json')) return json(value, field, false);
  if (field.endsWith('_timestamp') || field.endsWith('_at')) {
    const raw = value instanceof Date ? value.toISOString() : value;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(raw) || !Number.isFinite(Date.parse(raw))) {
      fail(`${field} is not an explicit UTC timestamp`);
    }
    const normalized = new Date(raw).toISOString();
    if (normalized.slice(0, 19) !== raw.slice(0, 19)) fail(`${field} has invalid calendar date`);
    return normalized;
  }
  if (NUMERIC.has(field)) {
    if (value === '' || typeof value === 'boolean' || !Number.isFinite(Number(value))) fail(`${field} is invalid`);
    return Number(value);
  }
  return value;
}

function assertDerived(expected, actual, label) {
  if (!actual) fail(`${label} is missing`);
  for (const [field, value] of Object.entries(expected)) {
    if (!Object.hasOwn(actual, field) || stable(comparable(value, field)) !== stable(comparable(actual[field], field))) {
      fail(`${label} field drift: ${field}`);
    }
  }
}

function index(rows, column, label, predicate = text) {
  const result = new Map();
  for (const row of rows) {
    if (!predicate(row[column]) || result.has(row[column])) fail(`${label} has missing or duplicate ${column}`);
    result.set(row[column], row);
  }
  return result;
}

function snapshotRows(value, keys, label) {
  if (!value || Object.keys(value).length !== keys.length || keys.some(key => !Array.isArray(value[key]))) {
    fail(`${label} requires complete exact table snapshots`);
  }
  const copy = canonical(structuredClone(value));
  for (const key of keys) {
    index(copy[key], 'id', `${label}.${key}`, id);
    copy[key].sort((a, b) => a.id - b.id);
  }
  return copy;
}

export function hashArmorSecondaryProjectionRows(value) {
  const rows = snapshotRows(value, ARMOR_SECONDARY_PROJECTION_TABLES, 'projection');
  for (const table of ARMOR_SECONDARY_PROJECTION_TABLES) {
    rows[table] = rows[table].map(row => {
      const columns = ARMOR_SECONDARY_COLUMNS[table];
      if (Object.keys(row).length !== columns.length || columns.some(column => !Object.hasOwn(row, column) || row[column] === undefined)) {
        fail(`${table} requires exact complete columns`);
      }
      return Object.fromEntries(columns.map(column => [column, comparable(row[column], column)]));
    });
  }
  return hash(rows);
}

function membersOf(source) {
  const sets = index(source.relation_armor_sets.filter(active), 'record_key', 'set');
  const maint = index(source.maint_items.filter(active), 'source_id', 'maint item', id);
  const local = index(source.local_items.filter(active), 'id', 'local item', id);
  const members = new Map();
  const tuples = new Set();
  for (const row of source.relation_armor_set_items.filter(active)) {
    const owner = sets.get(row.armor_set_record_key);
    if (!owner || row.text_key !== owner.text_key || !id(row.item_source_id)
        || !Number.isSafeInteger(row.set_variant_index) || row.set_variant_index < 0
        || !Number.isSafeInteger(row.part_index) || row.part_index < 0 || row.part_index > 2) fail('member owner/variant identity is invalid');
    const setsJson = json(owner.sets_json, 'set variants', true);
    if (setsJson[row.set_variant_index]?.[row.part_index] !== row.item_source_id) fail('member is not in the source variant');
    const tuple = stable([owner.record_key, row.set_variant_index, row.part_index]);
    if (tuples.has(tuple)) fail('member variant is duplicate');
    tuples.add(tuple);
    const upstream = maint.get(row.item_source_id);
    const consumer = local.get(row.item_source_id);
    if (!upstream || !consumer || !text(row.item_internal_name)
        || row.item_internal_name !== upstream.internal_name || row.item_internal_name !== consumer.internal_name
        || members.has(row.item_source_id) && members.get(row.item_source_id) !== row.item_internal_name) fail('member maint/local ID-name join is conflicting');
    members.set(row.item_source_id, row.item_internal_name);
  }
  for (const owner of sets.values()) {
    const variants = json(owner.sets_json, 'set variants', true);
    if (!variants.length) fail('set variants are empty');
    variants.forEach((variant, variantIndex) => {
      if (!Array.isArray(variant) || variant.length !== 3) fail('set variant is malformed');
      variant.forEach((sourceId, partIndex) => {
        if (!Number.isSafeInteger(sourceId) || sourceId < 0) fail('set part source ID is invalid');
        if (sourceId > 0 && !tuples.has(stable([owner.record_key, variantIndex, partIndex]))) fail('member source coverage is incomplete');
      });
    });
  }
  if (!members.size) fail('member scope is empty');
  return members;
}

function assertUnambiguousNames(source, maintRows) {
  const aliases = new Map();
  const normalized = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, '');
  for (const item of source.maint_items.filter(active)) {
    const raw = json(item.raw_json, 'maint item raw');
    for (const name of [item.name_zh, item.english_name, item.internal_name, raw.name, raw.nameZh, raw.internalName]) {
      const alias = normalized(name);
      if (!alias) continue;
      if (!aliases.has(alias)) aliases.set(alias, new Set());
      aliases.get(alias).add(item.source_id);
    }
  }
  for (const row of maintRows) for (const name of [row.item_name_zh, row.item_page_title]) {
    if ((aliases.get(normalized(name))?.size ?? 0) > 1) fail('maint item alias is ambiguous');
  }
}

async function verifySources(source, members) {
  const attributeIndex = index(source.relation_armor_attribute_rows, 'record_key', 'relation attribute');
  const effectIndex = index(source.relation_equipment_effect_attributes, 'record_key', 'relation effect');
  const attributes = [...attributeIndex.values()].filter(row => active(row) && members.has(row.item_id));
  index(attributes, 'item_id', 'attribute member', id);
  const maintIndex = index(source.maint_armor_attribute_rows, 'record_key', 'maint attribute');
  const landingIndex = index(source.maint_landings, 'id', 'maint landing', id);
  const verifiedLandings = new Map();
  for (const attribute of attributes) {
    if (attribute.item_internal_name !== members.get(attribute.item_id) || attribute.review_status !== 'accepted') fail('attribute member identity or review status is invalid');
    const maint = maintIndex.get(attribute.source_maint_record_key);
    if (!maint || !active(maint) || attribute.source_maint_table !== 'maint_armor_attribute_rows'
        || attribute.source_maint_id !== maint.id) fail('attribute maint lineage is broken');
    const landing = landingIndex.get(maint.landing_source_id);
    if (!landing || landing.dataset_type !== 'armor_attributes_raw' || landing.source_key !== 'wiki.page.armor_attributes'
        || landing.provider !== 'terraria.wiki.gg' || landing.parse_status !== 'ok'
        || landing.content_hash !== maint.landing_content_hash) fail('attribute landing lineage is broken');
    if (!verifiedLandings.has(landing.id)) {
      const payload = json(landing.payload_json, 'landing payload');
      if (createHash('sha256').update(JSON.stringify(payload)).digest('hex') !== landing.content_hash) fail('landing payload hash drift');
      const extracted = await extractMaintEntitiesFromLandingRow(landing);
      verifiedLandings.set(landing.id, index(extracted.rows.map(snake), 'record_key', 'extracted maint attribute'));
    }
    const extracted = verifiedLandings.get(landing.id).get(maint.record_key);
    if (!extracted) fail('maint row is absent from its landing payload');
    assertDerived(extracted, maint, 'maint source');
    if (maint.source_revision_timestamp == null) fail('maint source revision is missing');
    comparable(maint.source_revision_timestamp, 'source_revision_timestamp');
  }
  const activeMaint = source.maint_armor_attribute_rows.filter(active);
  assertUnambiguousNames(source, activeMaint);
  const derived = buildArmorAttributeRelations({
    maintArmorAttributeRows: activeMaint,
    maintItems: source.maint_items.filter(active),
    relationArmorSetItems: source.relation_armor_set_items.filter(active),
  });
  const derivedIndex = index(derived.map(snake), 'record_key', 'derived attribute');
  for (const attribute of attributes) assertDerived(derivedIndex.get(attribute.record_key) ?? {}, attribute, 'relation attribute');
  for (const attribute of attributes) if (!derivedIndex.has(attribute.record_key)) fail('attribute is not derived from current maint');
  for (const memberId of members.keys()) if (!attributes.some(row => row.item_id === memberId)) fail(`member attribute is missing: ${memberId}`);
  const expectedEffects = buildArmorAttributeEffectRows(attributes.map(camel)).map(snake);
  const expectedIndex = index(expectedEffects, 'record_key', 'derived effect');
  const effects = [];
  for (const expected of expectedEffects) {
    const actual = effectIndex.get(expected.record_key);
    if (!actual || !active(actual) || actual.review_status !== 'accepted' || actual.parse_status !== 'parsed') fail('source effect is missing, inactive or unaccepted');
    assertDerived(expected, actual, 'relation effect');
    effects.push(actual);
  }
  const attributeKeys = new Set(attributes.map(row => row.record_key));
  for (const row of source.relation_equipment_effect_attributes) {
    if (active(row) && (attributeKeys.has(row.owner_record_key) || row.owner_kind === 'item' && members.has(row.owner_id))) {
      if (!expectedIndex.has(row.record_key) || !active(row)) fail('foreign or stale effect under an Armor member');
    }
  }
  return { attributes, effects };
}

function mergeTable(table, before, derived, sources, members) {
  const byKey = index(before, 'relation_record_key', `before ${table}`);
  const byId = index(before, 'id', `before ${table}`, id);
  const identityFields = table === ARMOR_SECONDARY_PROJECTION_TABLES[0]
    ? ['item_id', 'item_internal_name']
    : ['owner_kind', 'owner_id', 'owner_key', 'source_kind', 'item_internal_name', 'slot_type', 'stat_key', 'class_scope', 'operation', 'value_decimal'];
  const identity = row => stable(identityFields.map(field => row[field] ?? null));
  const byIdentity = new Map();
  for (const row of before) if (!byIdentity.has(identity(row))) byIdentity.set(identity(row), row);
  const sourceIndex = index(sources, 'record_key', `source ${table}`);
  const historicalSourceKeys = new Set(sources.filter(row => !active(row)).map(row => row.record_key));
  const expectedKeys = new Set(derived.map(row => row.relation_record_key));
  const after = new Map(before.map(row => [row.id, row]));
  const inserts = []; const updates = []; const bindings = [];
  const matchedBeforeIds = new Set();
  for (const row of before) {
    const consumed = table === ARMOR_SECONDARY_PROJECTION_TABLES[0]
      ? members.has(row.item_id) : row.owner_kind === 'item' && members.has(row.owner_id);
    // A prior governed retirement remains immutable history. It cannot
    // satisfy a current derived key or be admitted without its source key.
    if (consumed && row.status === 0 && row.deleted === 1
        && historicalSourceKeys.has(row.relation_record_key)
        && !expectedKeys.has(row.relation_record_key)
        && identity(row) === identity(sourceIndex.get(row.relation_record_key))) continue;
    if (consumed && !active(row)) fail('foreign/inactive projection under a member');
    if (consumed && !expectedKeys.has(row.relation_record_key)
        && !historicalSourceKeys.has(row.relation_record_key)) {
      fail('foreign/inactive projection under a member');
    }
    if (consumed && !expectedKeys.has(row.relation_record_key)) {
      const retired = { ...row, status: 0, deleted: 1 };
      updates.push(retired); after.set(retired.id, retired); continue;
    }
  }
  for (const generated of derived) {
    const source = sourceIndex.get(generated.relation_record_key);
    const current = byKey.get(generated.relation_record_key) ?? byIdentity.get(identity(generated));
    if (current) {
      const identities = table === ARMOR_SECONDARY_PROJECTION_TABLES[0]
        ? ['item_id', 'item_internal_name'] : ['owner_kind', 'owner_id', 'owner_key', 'source_kind', 'item_internal_name'];
      if (!active(current) || identities.some(field => current[field] !== generated[field])) fail('existing projection owner identity drift');
      const next = { ...current, ...generated, id: current.id, created_at: current.created_at, updated_at: current.updated_at };
      // Retain equivalent SQL/JSON representations so a numeric string is not a fake delta.
      for (const field of Object.keys(next)) if (stable(comparable(current[field], field)) === stable(comparable(next[field], field))) next[field] = current[field];
      if (stable(next) !== stable(current)) updates.push(next);
      matchedBeforeIds.add(current.id);
      after.set(next.id, next);
    } else {
      if (!source || !id(source.id) || byId.has(source.id)) fail('new projection ID collision or missing relation ID');
      const next = { ...generated, id: source.id };
      inserts.push(next); after.set(next.id, next);
      bindings.push({ table, relationRecordKey: source.record_key, id: source.id,
        sourceTable: SOURCE_BY_TARGET[table], sourceId: source.id, mode: 'existing-relation-id' });
    }
  }
  return { rows: [...after.values()].sort((a, b) => a.id - b.id), inserts, updates, bindings };
}

export async function buildArmorSecondaryProjectionProposal({ sourceRows, beforeRows, serverUuid, generatedAt, selectedMemberIds = null } = {}) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(serverUuid ?? '')) fail('server UUID is invalid');
  comparable(generatedAt, 'generated_at');
  if (generatedAt == null) fail('generatedAt is missing');
  const source = snapshotRows(sourceRows, Object.keys(ARMOR_SECONDARY_SOURCE_TABLES), 'source');
  const before = snapshotRows(beforeRows, ARMOR_SECONDARY_PROJECTION_TABLES, 'before');
  const allMembers = membersOf(source);
  const selected = selectedMemberIds == null ? [...allMembers.keys()] : structuredClone(selectedMemberIds);
  if (!Array.isArray(selected) || !selected.length || new Set(selected).size !== selected.length
      || selected.some(value => !id(value) || !allMembers.has(value))) fail('explicit member scope is invalid');
  selected.sort((a, b) => a - b);
  const members = new Map(selected.map(value => [value, allMembers.get(value)]));
  const { attributes, effects } = await verifySources(source, members);
  const payload = buildProjectionPayload({ relationArmorAttributeRows: attributes, relationEquipmentEffectAttributes: effects });
  const derived = [payload.projectionItemArmorAttributes, payload.projectionEquipmentEffectAttributes];
  const proposal = {
    schemaVersion: 'armor-secondary-projection/v1', operationId: ARMOR_SECONDARY_PROJECTION_OPERATION_ID,
    authorityKind: 'verified-current-relation-projection-repair', applyAllowed: false, databaseWrites: false,
    generatedAt, serverUuid, sourceRows: source, beforeRows: before,
    selectedMemberIds: selected,
    coverage: { totalMembers: allMembers.size, selectedMembers: members.size,
      excludedMemberIds: [...allMembers.keys()].filter(value => !members.has(value)).sort((a, b) => a - b),
      complete: allMembers.size === members.size },
    sourceSha256: hash(source), beforeSha256: hashArmorSecondaryProjectionRows(before),
    memberIdentities: [...members].sort((a, b) => a[0] - b[0]).map(([itemId, internalName]) => ({ itemId, internalName })),
    afterRows: {}, inserts: {}, updates: {}, insertBindings: [], changedRowCount: 0,
  };
  ARMOR_SECONDARY_PROJECTION_TABLES.forEach((table, i) => {
    const merged = mergeTable(table, before[table], derived[i].map(snake),
      i === 0 ? source.relation_armor_attribute_rows : source.relation_equipment_effect_attributes, members);
    proposal.afterRows[table] = merged.rows;
    proposal.inserts[table] = merged.inserts; proposal.updates[table] = merged.updates;
    proposal.insertBindings.push(...merged.bindings);
    proposal.changedRowCount += merged.inserts.length + merged.updates.length;
  });
  proposal.afterSha256 = hashArmorSecondaryProjectionRows(proposal.afterRows);
  proposal.proposalSha256 = hash(proposal);
  return proposal;
}

export async function validateArmorSecondaryProjectionProposal(proposal) {
  if (!proposal || proposal.operationId !== ARMOR_SECONDARY_PROJECTION_OPERATION_ID) fail('proposal operation identity is invalid');
  const expected = await buildArmorSecondaryProjectionProposal(proposal);
  if (stable(expected) !== stable(proposal)) fail('proposal hash, scope or derived values drift');
  return true;
}
