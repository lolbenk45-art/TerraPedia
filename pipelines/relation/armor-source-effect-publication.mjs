import { createHash } from 'node:crypto';
import { createRecordKey } from './relation-trace.mjs';
import { parseEquipmentEffectLines } from './equipment-effect-parser.mjs';
import { buildArmorAttributeEffectRows } from './sync-maint-to-relation.mjs';

export const ARMOR_SOURCE_EFFECT_PUBLICATION_OPERATION_ID =
  'canonical-armor-source-effect-publication';
export const ARMOR_SOURCE_EFFECT_PUBLICATION_OWNERSHIP = Object.freeze([
  'relation.relation_equipment_effect_attributes.set_effect_sources',
  'relation.relation_equipment_effect_attributes.armor_attribute_cell_sources',
]);

const HASH = /^(?:sha256:)?[a-f0-9]{64}$/;
const RECORD_KEY = /^[a-f0-9]{64}$/;
const SOURCE_KINDS = new Set(['benefit_zh', 'armor_attribute_cell']);
const PARSE_STATUSES = new Set(['parsed', 'unparsed', 'non_effect']);
const REVIEW_STATUSES = new Set(['accepted', 'needs_review']);
const FINGERPRINT_KEYS = Object.freeze(['moduleRevisionId', 'pageRevisionIds']);

function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function stable(value) { return JSON.stringify(canonical(value)); }
function hash(value) { return `sha256:${createHash('sha256').update(stable(value), 'utf8').digest('hex')}`; }
function text(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required`);
  return value.trim();
}
function positive(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${label} must be a positive integer`);
  return number;
}
function nullableNumber(value, label) {
  if (value == null) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be numeric`);
  return number;
}
function sourceOwned(row) {
  return row?.owner_kind === 'armor_set' && row?.source_kind === 'benefit_zh'
    || row?.owner_kind === 'item' && row?.source_kind === 'armor_attribute_cell';
}
function sourceIdentity(row) {
  return stable([row.owner_kind, row.owner_record_key, row.source_kind,
    row.source_line_index, row.effect_index]);
}

function snake(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`), value,
  ]));
}

function isItemScopedArmorMultiplier(row) {
  return row?.ownerKind === 'armor_set'
    && row.statKey === 'damage_bonus'
    && row.operation === 'multiply'
    && /弓|连弩|箭|枪|子弹|玉米糖|特定远程武器|非消耗品远程武器/.test(row.conditionText ?? '');
}

function armorSetEffectRows({ relationArmorSets = [], enrichedModulePayload } = {}) {
  if (!Array.isArray(relationArmorSets) || !enrichedModulePayload
      || !Array.isArray(enrichedModulePayload.armorSets)) {
    throw new Error('Armor source-effect set evidence and relation owners are required');
  }
  const owners = new Map(relationArmorSets.filter(row => Number(row.status) === 1 && Number(row.deleted) === 0)
    .map(row => [row.text_key ?? row.textKey, row]));
  return enrichedModulePayload.armorSets.flatMap(record => {
    const relation = owners.get(record.textKey);
    // A missing relation owner belongs to a separate materialization lane. Keep
    // this publication partial so that its unresolved source rows remain untouched.
    if (!relation) return [];
    const effectSource = record.effectTextSource && typeof record.effectTextSource === 'object'
      ? record.effectTextSource : null;
    if (typeof record.effectText !== 'string' || record.effectText.trim() === '') {
      throw new Error(`Armor source-effect set text is missing: ${record.textKey}`);
    }
    const parsed = parseEquipmentEffectLines({
      owner: {
        ownerKind: 'armor_set', ownerRecordKey: relation.record_key, ownerId: Number(relation.id),
        ownerKey: record.textKey, sourceProvider: effectSource?.provider ?? 'terraria.wiki.gg',
        sourcePage: effectSource?.pageTitle ?? relation.source_page,
        sourceRevisionTimestamp: effectSource?.revisionTimestamp ?? relation.source_revision_timestamp,
      }, text: record.effectText, sourceKind: 'benefit_zh', sourceLocale: effectSource?.locale ?? 'zh',
    }).filter(row => !isItemScopedArmorMultiplier(row));
    return parsed.filter(row => row.parseStatus === 'parsed').map(row => ({
      recordKey: createRecordKey(['equipment-effect', row.ownerKind, row.ownerRecordKey,
        row.sourceKind, row.sourceLineIndex, row.effectIndex, row.statKey, row.variantLabel ?? 'all']),
      ...row,
      confidence: row.confidence ?? 0.9,
      reviewStatus: row.parseStatus === 'parsed' ? 'accepted' : 'needs_review',
      reason: row.parseStatus === 'parsed' ? 'parsed_from_armor_set_benefit_zh' : 'unparsed_armor_set_benefit_zh',
      rawJson: JSON.stringify({ sourceLine: row.sourceLine, rawText: row.rawText,
        ownerKey: row.ownerKey, benefitExpression: record.benefitExpression ?? null,
        sourceEvidenceHash: record.effectTextEvidenceHash ?? null }),
    })).map(snake);
  });
}

export function buildArmorSourceEffectRows({ relationArmorSets = [], relationArmorAttributeRows = [],
  currentRelationRows = [], enrichedModulePayload } = {}) {
  const typedOwnerIds = new Set(currentRelationRows
    .filter(row => row?.source_kind === 'armor_item_page' && Number(row.status) === 1 && Number(row.deleted) === 0)
    .map(row => Number(row.owner_id)));
  const attributeRows = buildArmorAttributeEffectRows(relationArmorAttributeRows.map(row => {
    const camel = Object.fromEntries(Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()), value,
    ]));
    if (typedOwnerIds.has(Number(row.item_id))) {
      const raw = typeof camel.rawCellsJson === 'string' ? JSON.parse(camel.rawCellsJson) : { ...camel.rawCellsJson };
      if (Object.hasOwn(raw, 'rangedDamage')) {
        raw.rangedDamage = null;
        camel.rawCellsJson = JSON.stringify(raw);
      }
    }
    return camel;
  }), { unresolvedMode: 'skip' }).map(snake);
  const published = [...armorSetEffectRows({ relationArmorSets, enrichedModulePayload }), ...attributeRows];
  const publishedKeys = new Set(published.map(row => row.record_key));
  const activeQuarantineRows = currentRelationRows.filter(row => sourceOwned(row)
    && Number(row.status) === 1 && Number(row.deleted) === 0
    && row.parse_status !== 'parsed' && !publishedKeys.has(row.record_key));
  return [...published, ...activeQuarantineRows]
    .sort((left, right) => left.record_key.localeCompare(right.record_key));
}

function normalizeFingerprint(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...FINGERPRINT_KEYS].sort())) {
    throw new Error('Armor source-effect publication source fingerprint is invalid');
  }
  if (!Array.isArray(value.pageRevisionIds) || value.pageRevisionIds.length === 0
      || value.pageRevisionIds.some(revision => !Number.isSafeInteger(revision) || revision <= 0)) {
    throw new Error('pageRevisionIds must contain positive revisions');
  }
  const pageRevisionIds = [...new Set(value.pageRevisionIds)].sort((left, right) => left - right);
  if (pageRevisionIds.length !== value.pageRevisionIds.length) throw new Error('pageRevisionIds must be unique');
  return { moduleRevisionId: positive(value.moduleRevisionId, 'module revision'), pageRevisionIds };
}

function normalizeTimestamp(value, label) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} is invalid`);
  return date.toISOString();
}

function normalizeRow(input, label, { requireOwned = true } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(`${label} row is invalid`);
  const row = Object.fromEntries(Object.entries(input).map(([key, value]) => [
    key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`), value,
  ]));
  if (!RECORD_KEY.test(String(row.record_key ?? ''))) throw new Error(`${label} record_key is invalid`);
  if (requireOwned && !sourceOwned(row)) throw new Error(`${label} source owner is outside this operation`);
  if (!['armor_set', 'item'].includes(row.owner_kind)) throw new Error(`${label} owner_kind is invalid`);
  if (!SOURCE_KINDS.has(row.source_kind)
      || row.owner_kind === 'armor_set' && row.source_kind !== 'benefit_zh'
      || row.owner_kind === 'item' && row.source_kind !== 'armor_attribute_cell') {
    throw new Error(`${label} source_kind is outside this operation`);
  }
  text(row.owner_record_key, `${label} owner_record_key`);
  positive(row.owner_id, `${label} owner_id`);
  text(row.owner_key, `${label} owner_key`);
  text(row.source_locale, `${label} source_locale`);
  if (!Number.isSafeInteger(Number(row.source_line_index)) || Number(row.source_line_index) < 0) {
    throw new Error(`${label} source_line_index is invalid`);
  }
  if (!Number.isSafeInteger(Number(row.effect_index)) || Number(row.effect_index) < 0) {
    throw new Error(`${label} effect_index is invalid`);
  }
  text(row.stat_key, `${label} stat_key`);
  if (!PARSE_STATUSES.has(row.parse_status)) throw new Error(`${label} parse_status is invalid`);
  if (!REVIEW_STATUSES.has(row.review_status)
      || row.parse_status === 'parsed' && row.review_status !== 'accepted'
      || row.parse_status !== 'parsed' && row.review_status !== 'needs_review') {
    throw new Error(`${label} review_status does not match parse_status`);
  }
  if (Number(row.status ?? 1) !== 1 || Number(row.deleted ?? 0) !== 0) {
    throw new Error(`${label} must be an active row`);
  }
  text(row.source_provider, `${label} source_provider`);
  text(row.source_page, `${label} source_page`);
  if (row.owner_kind === 'item') {
    for (const [key, labelPart] of [
      ['source_maint_table', 'source_maint_table'], ['source_maint_record_key', 'source_maint_record_key'],
      ['landing_source_key', 'landing_source_key'],
    ]) text(row[key], `${label} ${labelPart}`);
    positive(row.source_maint_id, `${label} source_maint_id`);
    positive(row.landing_source_id, `${label} landing_source_id`);
    if (!HASH.test(String(row.landing_content_hash ?? ''))) throw new Error(`${label} landing_content_hash is invalid`);
  } else if (row.source_maint_id != null || row.landing_source_id != null
      || row.source_maint_record_key != null || row.landing_source_key != null
      || row.landing_content_hash != null) {
    throw new Error(`${label} set source must not claim item landing lineage`);
  }
  if (row.source_revision_timestamp == null) throw new Error(`${label} source_revision_timestamp is required`);
  row.source_revision_timestamp = normalizeTimestamp(row.source_revision_timestamp, `${label} source_revision_timestamp`);
  if (row.value_decimal != null) row.value_decimal = nullableNumber(row.value_decimal, `${label} value_decimal`);
  if (row.value_max_decimal != null) row.value_max_decimal = nullableNumber(row.value_max_decimal, `${label} value_max_decimal`);
  return {
    ...row,
    owner_id: Number(row.owner_id), source_line_index: Number(row.source_line_index),
    effect_index: Number(row.effect_index),
    source_maint_id: row.source_maint_id == null ? null : Number(row.source_maint_id),
    landing_source_id: row.landing_source_id == null ? null : Number(row.landing_source_id),
    status: 1, deleted: 0,
  };
}

function comparable(row, keys = Object.keys(row)) {
  const decimalColumns = new Set(['value_decimal', 'value_max_decimal', 'confidence']);
  const timestampColumns = new Set(['source_revision_timestamp']);
  const normalize = (value, key) => {
    if (value == null) return null;
    if (decimalColumns.has(key)) {
      const number = Number(value);
      return Number.isFinite(number) ? number : value;
    }
    if (timestampColumns.has(key)) {
      const date = value instanceof Date ? value : new Date(value);
      return Number.isNaN(date.getTime()) ? value : date.toISOString();
    }
    return value;
  };
  return Object.fromEntries(keys.filter(key => !['id', 'created_at', 'updated_at'].includes(key))
    .sort().map(key => [key, normalize(row[key], key)]));
}

function comparableEqual(left, right) {
  const keys = [...new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})])];
  return stable(comparable(left, keys)) === stable(comparable(right, keys));
}

export function buildArmorSourceEffectPublicationPlan({
  proposedRows = [], currentRelationRows = [], sourceEvidenceHash, sourceFingerprint,
} = {}) {
  if (!Array.isArray(proposedRows) || proposedRows.length === 0) throw new Error('Armor source-effect proposed rows are required');
  if (!Array.isArray(currentRelationRows)) throw new Error('Armor source-effect current relation rows are required');
  if (!HASH.test(String(sourceEvidenceHash ?? ''))) throw new Error('Armor source-effect evidence hash is required');
  const fingerprint = normalizeFingerprint(sourceFingerprint);
  const proposed = proposedRows.map((row, index) => normalizeRow(row, `proposed source-effect ${index}`));
  const proposedKeys = new Set(); const proposedIdentities = new Set();
  for (const row of proposed) {
    if (proposedKeys.has(row.record_key)) throw new Error('Armor source-effect proposed record_key is duplicate');
    if (proposedIdentities.has(sourceIdentity(row))) throw new Error('Armor source-effect proposed identity is duplicate');
    proposedKeys.add(row.record_key); proposedIdentities.add(sourceIdentity(row));
  }
  const allCurrent = currentRelationRows.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`Armor source-effect current row ${index} is invalid`);
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [
      key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`), value,
    ]));
  });
  const proposedItemOwners = new Set(proposed.filter(row => row.owner_kind === 'item').map(row => Number(row.owner_id)));
  const proposedSetOwners = new Set(proposed.filter(row => row.owner_kind === 'armor_set').map(row => row.owner_record_key));
  const inScope = row => row.owner_kind === 'armor_set'
    ? proposedSetOwners.has(row.owner_record_key)
    : proposedItemOwners.has(Number(row.owner_id));
  const current = allCurrent;
  const owned = current.filter(row => sourceOwned(row) && inScope(row) && Number(row.status) === 1 && Number(row.deleted) === 0)
    .map((row, index) => normalizeRow(row, `current source-effect ${index}`));
  const currentByKey = new Map(owned.map(row => [row.record_key, row]));
  const proposedByKey = new Map(proposed.map(row => [row.record_key, row]));
  const changes = {
    inserts: proposed.filter(row => !currentByKey.has(row.record_key)),
    updates: proposed.filter(row => currentByKey.has(row.record_key)
      && !comparableEqual(currentByKey.get(row.record_key), row))
      .map(row => ({ before: currentByKey.get(row.record_key), after: row })),
    retire: owned.filter(row => !proposedByKey.has(row.record_key)),
    unchanged: proposed.filter(row => currentByKey.has(row.record_key)
      && comparableEqual(currentByKey.get(row.record_key), row)),
  };
  const preservedRecordKeys = current.filter(row => (!sourceOwned(row) || !inScope(row)) && Number(row.status) === 1 && Number(row.deleted) === 0)
    .map(row => row.record_key).filter(Boolean).sort();
  const plan = {
    schemaVersion: 'armor-source-effect-publication/v1',
    operationId: ARMOR_SOURCE_EFFECT_PUBLICATION_OPERATION_ID,
    ownership: [...ARMOR_SOURCE_EFFECT_PUBLICATION_OWNERSHIP],
    sourceEvidenceHash: String(sourceEvidenceHash), sourceFingerprint: fingerprint,
    databaseWrites: false, applyAllowed: false,
    currentRelationRows: structuredClone(currentRelationRows), proposedRows: proposed,
    preservedRecordKeys, changes,
  };
  return Object.freeze({ ...plan, proposalSha256: hash(plan) });
}

export function validateArmorSourceEffectPublicationPlan(plan) {
  if (!plan || plan.schemaVersion !== 'armor-source-effect-publication/v1'
      || plan.operationId !== ARMOR_SOURCE_EFFECT_PUBLICATION_OPERATION_ID
      || plan.databaseWrites !== false || plan.applyAllowed !== false
      || stable(plan.ownership) !== stable(ARMOR_SOURCE_EFFECT_PUBLICATION_OWNERSHIP)) {
    throw new Error('Armor source-effect publication plan identity or safety flags are invalid');
  }
  const expected = buildArmorSourceEffectPublicationPlan({
    proposedRows: plan.proposedRows, currentRelationRows: plan.currentRelationRows,
    sourceEvidenceHash: plan.sourceEvidenceHash, sourceFingerprint: plan.sourceFingerprint,
  });
  if (stable(expected) !== stable(plan)) throw new Error('Armor source-effect publication plan drifted');
  return true;
}
