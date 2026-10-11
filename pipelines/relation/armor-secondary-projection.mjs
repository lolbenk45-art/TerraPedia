import { createHash } from 'node:crypto';
import { extractMaintEntitiesFromLandingRow } from '../maint/sync-landing-to-maint.mjs';
import { isArmorItemEffectMaintRow } from '../maint/armor-item-effect-source-reader.mjs';
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
const isArmorAttributeLandingSourceKey = value => value === 'wiki.page.armor_attributes'
  || /^wiki\.page\.armor\.attributes\.missing-owners\.[a-f0-9]{64}$/.test(String(value ?? ''));
const NESTED_EFFECT_STAT_KEYS = Object.freeze({
  summonDamage: 'summon_damage',
  minionSlots: 'minion_slots',
  miningSpeed: 'mining_speed',
  fishingPower: 'fishing_power',
});
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

function membersOf(source, explicitOwnerIds = null) {
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
  // A relation row can be published before its set tuple is available. Keep
  // this escape hatch explicit and owner-bound: callers must provide the IDs,
  // and each ID must already have one verified active relation attribute row
  // joined to the current maint/local item identities.
  if (explicitOwnerIds != null) {
    const attributes = source.relation_armor_attribute_rows.filter(active);
    for (const itemId of explicitOwnerIds) {
      if (members.has(itemId)) continue;
      const matches = attributes.filter(row => Number(row.item_id) === itemId);
      if (matches.length !== 1) fail(`explicit relation owner attribute is missing or ambiguous: ${itemId}`);
      const attribute = matches[0];
      const upstream = maint.get(itemId);
      const consumer = local.get(itemId);
      if (!upstream || !consumer || !text(attribute.item_internal_name)
          || attribute.item_internal_name !== upstream.internal_name
          || attribute.item_internal_name !== consumer.internal_name) {
        fail(`explicit relation owner identity is conflicting: ${itemId}`);
      }
      members.set(itemId, attribute.item_internal_name);
    }
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

function verifyRevisionBoundNestedSourceRecord(payload, maint) {
  if (!Array.isArray(payload.records)
      || !payload.records.some(record => record?.identity?.itemSourceId != null)) return false;
  const raw = json(maint.raw_json, 'maint attribute raw');
  const sourceRecord = raw.record;
  const sourceId = Number(sourceRecord?.identity?.itemSourceId);
  if (!sourceRecord || !Number.isSafeInteger(sourceId) || sourceId <= 0
      || typeof payload.evidenceSha256 !== 'string'
      || raw.sourceEvidenceHash !== payload.evidenceSha256) {
    fail('revision-bound nested source evidence is invalid');
  }
  const matched = payload.records.find(record => Number(record?.identity?.itemSourceId) === sourceId);
  if (!matched || stable(matched) !== stable(sourceRecord)) fail('maint row is absent from its landing payload');
  return true;
}

function verifyNestedItemEffects(attribute, effectIndex) {
  const raw = json(attribute.raw_json, 'relation attribute raw');
  const record = raw.record;
  if (record?.identity?.itemSourceId == null) return null;
  const facts = Array.isArray(record.itemScopedFacts) ? record.itemScopedFacts : [];
  const sourceLines = Array.isArray(record.itemScopedSourceLines) ? record.itemScopedSourceLines : [];
  const actual = [...effectIndex.values()].filter(row => active(row)
    && row.owner_kind === 'item' && Number(row.owner_id) === Number(attribute.item_id)
    && row.owner_record_key === attribute.record_key && row.source_kind === 'armor_attribute_cell');
  if (actual.length !== facts.length) fail('nested item effect count is invalid');
  return facts.map((fact, effectIndexNumber) => {
    const expectedStat = NESTED_EFFECT_STAT_KEYS[fact?.statKey];
    const row = actual.find(candidate => Number(candidate.effect_index) === effectIndexNumber);
    const sourceLine = sourceLines[effectIndexNumber] ?? sourceLines[0] ?? null;
    if (!row || !expectedStat || row.stat_key !== expectedStat
        || row.operation !== fact.operation || row.unit !== fact.unit
        || Number(row.value_decimal) !== Number(fact.valueDecimal)
        || sourceLine != null && row.source_line !== sourceLine
        || row.review_status !== 'accepted' || row.parse_status !== 'parsed') {
      fail(`nested item effect evidence drifted: ${JSON.stringify({
        found: Boolean(row), expectedStat, statKey: row?.stat_key, operation: row?.operation,
        expectedOperation: fact.operation, unit: row?.unit, expectedUnit: fact.unit,
        value: row?.value_decimal, expectedValue: fact.valueDecimal, sourceLine, actualSourceLine: row?.source_line,
        reviewStatus: row?.review_status, parseStatus: row?.parse_status,
      })}`);
    }
    return row;
  });
}

// Set-owned effects are already published in the relation source table.  They
// do not depend on an item attribute landing, but they still need an explicit
// owner/parse gate before entering the projection.  Rows that fail the gate
// remain quarantined so partial repair never mutates unresolved source data.
function verifySetOwnedEffects(source, { allowPartialApply, quarantine }) {
  const sets = index(source.relation_armor_sets.filter(active), 'record_key', 'relation set');
  const effects = [];
  for (const row of source.relation_equipment_effect_attributes.filter(active)) {
    if (row.owner_kind !== 'armor_set') continue;
    const owner = sets.get(row.owner_record_key);
    const valid = owner
      && Number(row.owner_id) === Number(owner.id)
      && row.owner_key === owner.text_key
      && row.source_kind === 'benefit_zh'
      && row.parse_status === 'parsed'
      && row.review_status === 'accepted';
    if (valid) {
      effects.push(row);
      continue;
    }
    if (!allowPartialApply) fail('set-owned effect source is unresolved or owner-bound incorrectly');
    quarantine.push({
      relationRecordKey: row.record_key,
      ownerId: row.owner_id,
      ownerRecordKey: row.owner_record_key,
      effectIndex: row.effect_index,
      reason: 'source-effect-unresolved',
    });
  }
  return effects;
}

const EFFECT_CELL_UNITS = Object.freeze({
  meleeDamage: 'percent', rangedDamage: 'percent', magicDamage: 'percent', summonDamage: 'percent',
  meleeCritChance: 'percent', rangedCritChance: 'percent', magicCritChance: 'percent', classSpecific: 'percent',
  maxMana: 'count', manaCost: 'percent', minionSlots: 'count', sentrySlots: 'count', movementSpeed: 'percent',
});

function buildPartialAttributeEffects(attribute) {
  const raw = json(attribute.raw_cells_json, 'armor attribute cells');
  const safeRaw = { ...raw };
  const unresolved = [];
  for (const [cellKey, unit] of Object.entries(EFFECT_CELL_UNITS)) {
    const rawValue = raw[cellKey];
    if (rawValue == null || rawValue === '' || rawValue === '—' || rawValue === '-') continue;
    const normalized = String(rawValue).trim().replace(/\u2212/g, '-').replace(/\uff05/g, '%');
    const pattern = unit === 'percent' ? /^[+-]?\d+(?:\.\d+)?%$/ : /^[+-]?\d+$/;
    const specialized = cellKey === 'rangedDamage' && /额外(?:弓|枪|其他远程)伤害/.test(String(raw.otherBonus ?? ''));
    const legacy = cellKey === 'rangedDamage'
      && /Shroomite(?:Headgear|Mask|Helmet)|Shroomite/i.test([attribute.item_internal_name, attribute.item_page_title, attribute.item_name_zh].filter(Boolean).join(' '))
      && /^15(?:\.0+)?%$/.test(normalized) && raw.otherBonus == null;
    if (!pattern.test(normalized) || specialized || legacy) {
      delete safeRaw[cellKey];
      unresolved.push({ cellKey, rawValue: String(rawValue), reason: specialized ? 'specialized-damage-semantics-unresolved' : 'qualified-or-invalid-numeric-cell' });
    }
  }
  if (!unresolved.length) return { effects: buildArmorAttributeEffectRows([camel(attribute)]).map(snake), unresolved };
  const safeAttribute = { ...attribute, raw_cells_json: JSON.stringify(safeRaw) };
  return { effects: buildArmorAttributeEffectRows([camel(safeAttribute)]).map(snake), unresolved };
}

async function verifySources(source, members, { allowPartialApply = false, unresolvedRowsMustRemainUntouched = false } = {}) {
  if (allowPartialApply && !unresolvedRowsMustRemainUntouched) {
    fail('partial apply requires unresolved rows to remain untouched');
  }
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
    if (!landing || landing.dataset_type !== 'armor_attributes_raw' || !isArmorAttributeLandingSourceKey(landing.source_key)
        || landing.provider !== 'terraria.wiki.gg' || landing.parse_status !== 'ok'
        || landing.content_hash !== maint.landing_content_hash) fail('attribute landing lineage is broken');
    if (!verifiedLandings.has(landing.id)) {
      const payload = json(landing.payload_json, 'landing payload');
      if (createHash('sha256').update(JSON.stringify(payload)).digest('hex') !== landing.content_hash) fail('landing payload hash drift');
      if (verifyRevisionBoundNestedSourceRecord(payload, maint)) {
        verifiedLandings.set(landing.id, payload);
      } else {
        const extracted = await extractMaintEntitiesFromLandingRow(landing);
        verifiedLandings.set(landing.id, index(extracted.rows.map(snake), 'record_key', 'extracted maint attribute'));
      }
    }
    const verified = verifiedLandings.get(landing.id);
    if (Array.isArray(verified.records)) {
      verifyRevisionBoundNestedSourceRecord(verified, maint);
    } else {
      const extracted = verified.get(maint.record_key);
      if (!extracted) fail('maint row is absent from its landing payload');
      assertDerived(extracted, maint, 'maint source');
    }
    if (maint.source_revision_timestamp == null) fail('maint source revision is missing');
    comparable(maint.source_revision_timestamp, 'source_revision_timestamp');
  }
  const activeMaint = source.maint_armor_attribute_rows.filter(active)
    .filter(row => !isArmorItemEffectMaintRow(row));
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
  const expectedEffects = [];
  const unresolvedSourceEffects = [];
  for (const attribute of attributes) {
    const nested = verifyNestedItemEffects(attribute, effectIndex);
    if (nested) {
      expectedEffects.push(...nested);
      continue;
    }
    const partial = buildPartialAttributeEffects(attribute);
    expectedEffects.push(...partial.effects);
    for (const unresolved of partial.unresolved) {
      unresolvedSourceEffects.push({ ownerId: attribute.item_id, ownerRecordKey: attribute.record_key, ...unresolved });
    }
  }
  // Item-page typed effects have their own source owner key and do not belong
  // to an attribute-cell owner record. They are already admitted relation
  // facts, so include only active, parsed, accepted rows for the selected
  // member scope in the projection expectation.
  for (const typed of source.relation_equipment_effect_attributes) {
    if (!active(typed) || typed.source_kind !== 'armor_item_page') continue;
    const ownerId = Number(typed.owner_id);
    if (typed.owner_kind !== 'item' || !members.has(ownerId)
        || typed.item_internal_name !== members.get(ownerId)
        || typed.review_status !== 'accepted' || typed.parse_status !== 'parsed') {
      fail('typed item-page effect owner or acceptance is invalid');
    }
    expectedEffects.push(typed);
  }
  const expectedIndex = index(expectedEffects, 'record_key', 'derived effect');
  const effects = [];
  const quarantine = [];
  for (const unresolved of unresolvedSourceEffects) {
    quarantine.push({ relationRecordKey: null, ownerId: unresolved.ownerId, ownerRecordKey: unresolved.ownerRecordKey,
      effectIndex: null, cellKey: unresolved.cellKey, reason: 'source-effect-parse-unresolved', sourceReason: unresolved.reason });
  }
  for (const expected of expectedEffects) {
    const actual = effectIndex.get(expected.record_key);
    if (!actual || !active(actual) || actual.review_status !== 'accepted' || actual.parse_status !== 'parsed') {
      if (!allowPartialApply) fail('source effect is missing, inactive or unaccepted');
      quarantine.push({
        relationRecordKey: expected.record_key,
        ownerId: expected.owner_id,
        ownerRecordKey: expected.owner_record_key,
        effectIndex: expected.effect_index,
        reason: !actual ? 'source-effect-missing' : !active(actual) ? 'source-effect-inactive' : 'source-effect-unaccepted',
      });
      continue;
    }
    try {
      assertDerived(expected, actual, 'relation effect');
    } catch (error) {
      if (!allowPartialApply) throw error;
      quarantine.push({
        relationRecordKey: expected.record_key,
        ownerId: expected.owner_id,
        ownerRecordKey: expected.owner_record_key,
        effectIndex: expected.effect_index,
        reason: 'source-effect-drift',
      });
      continue;
    }
    effects.push(actual);
  }
  const attributeKeys = new Set(attributes.map(row => row.record_key));
  for (const row of source.relation_equipment_effect_attributes) {
    if (active(row) && (attributeKeys.has(row.owner_record_key) || row.owner_kind === 'item' && members.has(row.owner_id))) {
      if (unresolvedSourceEffects.some(effect => effect.ownerRecordKey === row.owner_record_key)
          && !expectedIndex.has(row.record_key)) {
        quarantine.push({ relationRecordKey: row.record_key, ownerId: row.owner_id, ownerRecordKey: row.owner_record_key,
          effectIndex: row.effect_index, reason: 'source-effect-parse-unresolved' });
      } else if (!expectedIndex.has(row.record_key) || !active(row)) fail('foreign or stale effect under an Armor member');
    }
  }
  const setEffects = verifySetOwnedEffects(source, { allowPartialApply, quarantine });
  return { attributes, effects: [...setEffects, ...effects], quarantine };
}

function mergeTable(table, before, derived, sources, members, setOwnerIds, preservedRelationKeys = []) {
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
  const expectedKeys = new Set([...derived.map(row => row.relation_record_key), ...preservedRelationKeys]);
  const after = new Map(before.map(row => [row.id, row]));
  const inserts = []; const updates = []; const bindings = [];
  const matchedBeforeIds = new Set();
  for (const row of before) {
    const consumed = table === ARMOR_SECONDARY_PROJECTION_TABLES[0]
      ? members.has(row.item_id) : row.owner_kind === 'item' && members.has(row.owner_id);
    const setConsumed = table === ARMOR_SECONDARY_PROJECTION_TABLES[1]
      && row.owner_kind === 'armor_set' && setOwnerIds.has(Number(row.owner_id));
    const owned = consumed || setConsumed;
    // A prior governed retirement remains immutable history. It cannot
    // satisfy a current derived key or be admitted without its source key.
    if (owned && row.status === 0 && row.deleted === 1
        && historicalSourceKeys.has(row.relation_record_key)
        && !expectedKeys.has(row.relation_record_key)
        && identity(row) === identity(sourceIndex.get(row.relation_record_key))) continue;
    if (owned && !active(row)) fail('foreign/inactive projection under an Armor owner');
    if (owned && !expectedKeys.has(row.relation_record_key)
        && !historicalSourceKeys.has(row.relation_record_key)) {
      fail('foreign/inactive projection under a member');
    }
    if (owned && !expectedKeys.has(row.relation_record_key)) {
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

export async function buildArmorSecondaryProjectionProposal({ sourceRows, beforeRows, serverUuid, generatedAt,
  selectedMemberIds = null, allowPartialApply = false, unresolvedRowsMustRemainUntouched = false } = {}) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(serverUuid ?? '')) fail('server UUID is invalid');
  comparable(generatedAt, 'generated_at');
  if (generatedAt == null) fail('generatedAt is missing');
  const source = snapshotRows(sourceRows, Object.keys(ARMOR_SECONDARY_SOURCE_TABLES), 'source');
  const before = snapshotRows(beforeRows, ARMOR_SECONDARY_PROJECTION_TABLES, 'before');
  const explicitScope = selectedMemberIds == null ? null : structuredClone(selectedMemberIds);
  if (explicitScope != null && (!Array.isArray(explicitScope) || !explicitScope.length
      || new Set(explicitScope).size !== explicitScope.length
      || explicitScope.some(value => !id(value)))) fail('explicit member scope is invalid');
  const allMembers = membersOf(source, explicitScope);
  const selected = explicitScope == null ? [...allMembers.keys()] : explicitScope;
  if (!Array.isArray(selected) || !selected.length || new Set(selected).size !== selected.length
      || selected.some(value => !id(value) || !allMembers.has(value))) fail('explicit member scope is invalid');
  selected.sort((a, b) => a - b);
  const members = new Map(selected.map(value => [value, allMembers.get(value)]));
  const { attributes, effects, quarantine } = await verifySources(source, members, {
    allowPartialApply, unresolvedRowsMustRemainUntouched,
  });
  const payload = buildProjectionPayload({ relationArmorAttributeRows: attributes, relationEquipmentEffectAttributes: effects });
  const derived = [payload.projectionItemArmorAttributes, payload.projectionEquipmentEffectAttributes];
  const setOwnerIds = new Set(source.relation_armor_sets.filter(active).map(row => Number(row.id)));
  const proposal = {
    schemaVersion: 'armor-secondary-projection/v1', operationId: ARMOR_SECONDARY_PROJECTION_OPERATION_ID,
    authorityKind: 'verified-current-relation-projection-repair', applyAllowed: false, databaseWrites: false,
    generatedAt, serverUuid, sourceRows: source, beforeRows: before,
    allowPartialApply: Boolean(allowPartialApply),
    unresolvedRowsMustRemainUntouched: Boolean(unresolvedRowsMustRemainUntouched),
    quarantine,
    selectedMemberIds: selected,
    setOwnerIds: [...setOwnerIds].sort((a, b) => a - b),
    coverage: { totalMembers: allMembers.size, selectedMembers: members.size,
      excludedMemberIds: [...allMembers.keys()].filter(value => !members.has(value)).sort((a, b) => a - b),
      complete: allMembers.size === members.size },
    sourceSha256: hash(source), beforeSha256: hashArmorSecondaryProjectionRows(before),
    memberIdentities: [...members].sort((a, b) => a[0] - b[0]).map(([itemId, internalName]) => ({ itemId, internalName })),
    afterRows: {}, inserts: {}, updates: {}, insertBindings: [], changedRowCount: 0,
  };
  ARMOR_SECONDARY_PROJECTION_TABLES.forEach((table, i) => {
    const merged = mergeTable(table, before[table], derived[i].map(snake),
      i === 0 ? source.relation_armor_attribute_rows : source.relation_equipment_effect_attributes, members,
      setOwnerIds,
      i === 1 ? quarantine.map(row => row.relationRecordKey) : []);
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
