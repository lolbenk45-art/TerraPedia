import { createHash } from 'node:crypto';

export const ARMOR_PROJECTION_API_ACCEPTANCE_SCHEMA = 'armor-projection-api-acceptance/v1';

const HASH = /^sha256:[a-f0-9]{64}$/;
const GENERATED_FIELDS = new Set(['created_at', 'updated_at']);
const NUMERIC_FIELDS = new Set([
  'defense_value', 'value_decimal', 'value_max_decimal', 'confidence',
  'owner_id', 'source_maint_id', 'landing_source_id', 'effect_index',
]);

function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function stable(value) {
  return JSON.stringify(canonical(value));
}

function hashJson(value) {
  return `sha256:${createHash('sha256').update(stable(value), 'utf8').digest('hex')}`;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`Armor ${label} readback must be an array`);
  return value;
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Armor ${label} is required`);
  }
  return value;
}

function asNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

function asUtc(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value.toISOString();
  const raw = String(value);
  const hasExplicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const normalized = raw.includes(' ') ? raw.replace(' ', 'T') : raw;
  const date = new Date(hasExplicitZone ? normalized : `${normalized}+08:00`);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function comparable(value, field) {
  if (value == null) return null;
  if (field.endsWith('_json') && typeof value === 'string') {
    try { return canonical(JSON.parse(value)); } catch { return value; }
  }
  if (NUMERIC_FIELDS.has(field)) return asNumber(value);
  if (field.endsWith('_at') || field.endsWith('_timestamp')) return asUtc(value);
  return canonical(value);
}

function equalField(expected, actual, field) {
  return stable(comparable(expected, field)) === stable(comparable(actual, field));
}

function positiveId(value) {
  return Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

function rowMap(rows, key, label, blockers) {
  const map = new Map();
  requireArray(rows, label).forEach((row, index) => {
    requireObject(row, `${label} row ${index}`);
    const value = row[key];
    if (typeof value !== 'string' || value.trim() === '') {
      blockers.push({ code: `${label}-identity-invalid`, index, field: key });
      return;
    }
    if (map.has(value)) blockers.push({ code: `${label}-duplicate`, key: value });
    else map.set(value, row);
  });
  return map;
}

function compareProjectionRows(expectedRows, observedRows, {
  key, label, blockers, requireStorageId = false,
} = {}) {
  const expected = rowMap(expectedRows, key, label, blockers);
  const observed = rowMap(observedRows, key, `${label}-readback`, blockers);
  for (const [identity, expectedRow] of expected) {
    const observedRow = observed.get(identity);
    if (!observedRow) {
      blockers.push({ code: `${label}-missing`, [key]: identity });
      continue;
    }
    if (requireStorageId && !positiveId(observedRow.id)) {
      blockers.push({ code: `${label}-storage-id-missing`, [key]: identity });
    }
    if (positiveId(expectedRow.id) && Number(expectedRow.id) !== Number(observedRow.id)) {
      blockers.push({ code: `${label}-storage-id-drift`, [key]: identity });
    }
    for (const [field, value] of Object.entries(expectedRow)) {
      if (field === 'id' || GENERATED_FIELDS.has(field)) continue;
      if (!equalField(value, observedRow[field], field)) {
        blockers.push({ code: `${label}-field-drift`, [key]: identity, field });
      }
    }
  }
  for (const identity of observed.keys()) {
    if (!expected.has(identity)) blockers.push({ code: `${label}-foreign`, [key]: identity });
  }
  return { expectedCount: expected.size, observedCount: observed.size };
}

const ATTRIBUTE_API_FIELDS = Object.freeze([
  ['item_id', 'itemId'],
  ['item_internal_name', 'itemInternalName'],
  ['item_name_zh', 'itemNameZh'],
  ['item_page_title', 'itemPageTitle'],
  ['item_href', 'itemHref'],
  ['section_code', 'sectionCode'],
  ['slot_group', 'slotGroup'],
  ['defense_value', 'defenseValue'],
  ['raw_cells_json', 'rawCellsJson'],
  ['source_provider', 'sourceProvider'],
  ['source_page', 'sourcePage'],
  ['source_revision_timestamp', 'sourceRevisionTimestamp'],
]);

const EFFECT_API_FIELDS = Object.freeze([
  ['owner_id', 'itemId'],
  ['item_internal_name', 'itemInternalName'],
  ['owner_kind', 'ownerKind'],
  ['owner_key', 'ownerKey'],
  ['source_kind', 'sourceKind'],
  ['source_line', 'sourceLine'],
  ['effect_index', 'effectIndex'],
  ['apply_scope', 'applyScope'],
  ['slot_type', 'slotType'],
  ['stat_key', 'statKey'],
  ['stat_label_zh', 'statLabelZh'],
  ['class_scope', 'classScope'],
  ['operation', 'operation'],
  ['value_decimal', 'valueDecimal'],
  ['value_max_decimal', 'valueMaxDecimal'],
  ['unit', 'unit'],
  ['variant_label', 'variantLabel'],
  ['condition_text', 'conditionText'],
  ['raw_text', 'rawText'],
  ['parse_status', 'parseStatus'],
  ['source_maint_record_key', 'sourceMaintRecordKey'],
  ['source_maint_id', 'sourceMaintId'],
  ['landing_source_id', 'landingSourceId'],
  ['landing_source_key', 'landingSourceKey'],
  ['landing_content_hash', 'landingContentHash'],
  ['source_provider', 'sourceProvider'],
  ['source_page', 'sourcePage'],
  ['source_revision_timestamp', 'sourceRevisionTimestamp'],
]);

function apiIdentity(row, identityFields, label, index) {
  const values = identityFields.map(field => row?.[field]);
  if (values.some(value => value == null || value === '')) {
    throw new Error(`Armor ${label} API row ${index} identity is incomplete`);
  }
  return values.join('|');
}

function compareApiRows(expectedRows, observedRows, {
  ownerKind, fields, label, blockers,
} = {}) {
  const expected = requireArray(expectedRows, `${label} expected`)
    .filter(row => ownerKind == null || row.owner_kind === ownerKind);
  const observed = requireArray(observedRows, `${label} API`);
  const expectedMap = new Map();
  const observedMap = new Map();
  expected.forEach((row, index) => {
    const identity = ownerKind === 'item'
      ? `${row.owner_id}|${row.source_kind}|${row.effect_index}|${row.owner_key ?? ''}`
      : `${row.item_id}|${row.section_code}|${row.slot_group}|${row.item_internal_name}`;
    if (expectedMap.has(identity)) blockers.push({ code: `${label}-duplicate`, identity });
    else expectedMap.set(identity, row);
    if (ownerKind === 'item' && !positiveId(row.owner_id)) {
      blockers.push({ code: `${label}-owner-id-missing`, index });
    }
  });
  observed.forEach((row, index) => {
    requireObject(row, `${label} API row ${index}`);
    const identityFields = ownerKind === 'item'
      ? ['itemId', 'sourceKind', 'effectIndex', 'ownerKey']
      : ['itemId', 'sectionCode', 'slotGroup', 'itemInternalName'];
    const identity = apiIdentity(row, identityFields, label, index);
    if (observedMap.has(identity)) blockers.push({ code: `${label}-api-duplicate`, identity });
    else observedMap.set(identity, row);
    if (ownerKind === 'item' && !positiveId(row.itemId)) blockers.push({ code: `${label}-api-owner-id-missing`, index });
  });
  for (const [identity, expectedRow] of expectedMap) {
    const actual = observedMap.get(identity);
    if (!actual) {
      blockers.push({ code: `${label}-api-missing`, identity });
      continue;
    }
    for (const [source, api] of fields) {
      if (!equalField(expectedRow[source], actual[api], source)) {
        blockers.push({ code: `${label}-api-field-drift`, identity, field: api });
      }
    }
  }
  for (const identity of observedMap.keys()) {
    if (!expectedMap.has(identity)) blockers.push({ code: `${label}-api-foreign`, identity });
  }
  return { expectedCount: expectedMap.size, observedCount: observedMap.size };
}

function assertInput(input) {
  requireObject(input, 'projection/API acceptance input');
  const keys = Object.keys(input).sort();
  const expected = [
    'apiItemArmorAttributes', 'apiItemEquipmentEffects', 'candidate',
    'projectionArmorSets', 'projectionEquipmentEffectAttributes',
    'projectionItemArmorAttributes',
  ].sort();
  if (stable(keys) !== stable(expected)) throw new Error('Armor projection/API acceptance input fields drifted');
  requireObject(input.candidate, 'projection candidate');
  if (input.candidate.candidateSha256 != null && !HASH.test(String(input.candidate.candidateSha256))) {
    throw new Error('Armor projection candidate hash is invalid');
  }
  requireObject(input.candidate.expectedRows, 'projection candidate expected rows');
  requireObject(input.candidate.dependencyExpectations, 'projection candidate dependency expectations');
  return input;
}

/**
 * Compares a committed Armor projection and its public item API readback.
 * This is evidence only: it has no database, HTTP, filesystem, or permit side effects.
 */
export function buildArmorProjectionApiAcceptance(input = {}) {
  const snapshot = assertInput(input);
  const blockers = [];
  const candidateBlockers = snapshot.candidate.acceptance?.blockers;
  if (!Array.isArray(candidateBlockers)) {
    blockers.push({ code: 'candidate-acceptance-missing' });
  } else {
    for (const blocker of candidateBlockers) blockers.push({ code: 'candidate-blocked', blocker });
  }
  const projection = {
    armorSets: compareProjectionRows(snapshot.candidate.expectedRows.projection_armor_sets,
      snapshot.projectionArmorSets, {
        key: 'text_key', label: 'projection-armor-set', blockers, requireStorageId: true,
      }),
    armorAttributes: compareProjectionRows(snapshot.candidate.dependencyExpectations.projection_item_armor_attributes,
      snapshot.projectionItemArmorAttributes, {
        key: 'relation_record_key', label: 'projection-armor-attribute', blockers,
      }),
    equipmentEffects: compareProjectionRows(snapshot.candidate.dependencyExpectations.projection_equipment_effect_attributes,
      snapshot.projectionEquipmentEffectAttributes, {
        key: 'relation_record_key', label: 'projection-equipment-effect', blockers,
      }),
  };
  const api = {
    armorAttributes: compareApiRows(snapshot.candidate.dependencyExpectations.projection_item_armor_attributes,
      snapshot.apiItemArmorAttributes, {
        fields: ATTRIBUTE_API_FIELDS, label: 'api-item-armor-attribute', blockers,
      }),
    equipmentEffects: compareApiRows(snapshot.candidate.dependencyExpectations.projection_equipment_effect_attributes,
      snapshot.apiItemEquipmentEffects, {
        ownerKind: 'item', fields: EFFECT_API_FIELDS, label: 'api-item-equipment-effect', blockers,
      }),
  };
  const expected = {
    projectionArmorSets: snapshot.candidate.expectedRows.projection_armor_sets,
    projectionItemArmorAttributes: snapshot.candidate.dependencyExpectations.projection_item_armor_attributes,
    projectionEquipmentEffectAttributes: snapshot.candidate.dependencyExpectations.projection_equipment_effect_attributes,
  };
  const observed = {
    projectionArmorSets: snapshot.projectionArmorSets,
    projectionItemArmorAttributes: snapshot.projectionItemArmorAttributes,
    projectionEquipmentEffectAttributes: snapshot.projectionEquipmentEffectAttributes,
    apiItemArmorAttributes: snapshot.apiItemArmorAttributes,
    apiItemEquipmentEffects: snapshot.apiItemEquipmentEffects,
  };
  return Object.freeze({
    schemaVersion: ARMOR_PROJECTION_API_ACCEPTANCE_SCHEMA,
    operationId: snapshot.candidate.operationId ?? 'canonical-armor-projection',
    candidateSha256: snapshot.candidate.candidateSha256 ?? null,
    databaseWrites: false,
    apiReadOnly: true,
    postCommit: true,
    status: blockers.length ? 'blocked' : 'verified',
    runtimeVerified: blockers.length === 0,
    blockers,
    projection,
    api,
    expectedSha256: hashJson(expected),
    observedSha256: hashJson(observed),
  });
}
