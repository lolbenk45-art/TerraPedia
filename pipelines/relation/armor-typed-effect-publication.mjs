import { createHash } from 'node:crypto';

export const ARMOR_TYPED_EFFECT_RELATION_OWNERSHIP = Object.freeze([
  'relation.relation_equipment_effect_attributes.item_effect_sources',
]);

const RECORD_KEY = /^[a-f0-9]{64}$/;
const SOURCE_HASH = /^[a-f0-9]{64}$/;
const REQUIRED_REVISIONS = Object.freeze(['pageRevisionId', 'iteminfoRevisionId', 'armorSetsRevisionId']);
const FIELDS = Object.freeze([
  'record_key', 'owner_kind', 'owner_record_key', 'owner_id', 'owner_key', 'source_kind',
  'source_locale', 'source_line_index', 'source_line', 'effect_index', 'apply_scope', 'variant_label',
  'item_internal_name', 'slot_type', 'stat_key', 'stat_label_zh', 'class_scope', 'operation',
  'value_decimal', 'value_max_decimal', 'unit', 'condition_text', 'raw_text', 'parse_status',
  'source_maint_table', 'source_maint_record_key', 'source_maint_id', 'landing_source_id',
  'landing_source_key', 'landing_content_hash', 'source_provider', 'source_page',
  'source_revision_timestamp', 'confidence', 'reason', 'review_status', 'raw_json', 'status', 'deleted',
]);

const snake = key => key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
const stable = value => {
  if (Array.isArray(value)) return value.map(stable);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
};
const hash = value => `sha256:${createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex')}`;
const active = row => Number(row?.status) === 1 && Number(row?.deleted) === 0;
const positive = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const text = value => typeof value === 'string' && value.trim() !== '';

function normalizeFingerprint(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('typed effect source fingerprint is required');
  const result = {};
  for (const key of REQUIRED_REVISIONS) {
    if (!positive(value[key])) throw new Error(`typed effect source fingerprint revision is invalid: ${key}`);
    result[key] = Number(value[key]);
  }
  return result;
}

function normalizeTimestamp(value, label) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} is invalid`);
  return date.toISOString();
}

function normalizeRow(input, label) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(`${label} row is invalid`);
  const row = Object.fromEntries(Object.entries(input).map(([key, value]) => [snake(key), value]));
  const result = Object.fromEntries(FIELDS.filter(field => Object.hasOwn(row, field)).map(field => [field, row[field]]));
  result.status = result.status ?? 1;
  result.deleted = result.deleted ?? 0;
  if (result.source_revision_timestamp != null) {
    result.source_revision_timestamp = normalizeTimestamp(result.source_revision_timestamp, `${label} source revision timestamp`);
  }
  if (!RECORD_KEY.test(String(result.record_key ?? '')) || result.owner_kind !== 'item'
      || result.source_kind !== 'armor_item_page' || !positive(result.owner_id)
      || !RECORD_KEY.test(String(result.owner_record_key ?? '')) || !text(result.owner_key)
      || !text(result.item_internal_name) || !text(result.stat_key) || !text(result.operation)
      || !['add', 'multiply'].includes(result.operation) || !Number.isFinite(Number(result.value_decimal))
      || !text(result.unit) || !text(result.condition_text) || !text(result.source_maint_table)
      || !RECORD_KEY.test(String(result.source_maint_record_key ?? '')) || !positive(result.source_maint_id)
      || !positive(result.landing_source_id) || !text(result.landing_source_key)
      || !SOURCE_HASH.test(String(result.landing_content_hash ?? '')) || !text(result.source_provider)
      || !text(result.source_page) || !text(result.source_revision_timestamp)
      || result.review_status !== 'accepted' || Number(result.status) !== 1 || Number(result.deleted) !== 0) {
    throw new Error(`${label} typed effect lineage, semantics or active state is invalid`);
  }
  return result;
}

function assertUnique(rows, label) {
  const keys = new Set();
  const owners = new Set();
  for (const row of rows) {
    if (keys.has(row.record_key)) throw new Error(`duplicate ${label} record_key`);
    if (owners.has(row.owner_id)) throw new Error(`duplicate ${label} owner`);
    keys.add(row.record_key); owners.add(row.owner_id);
  }
}

function comparable(row) { return Object.fromEntries(FIELDS.filter(field => field !== 'status' && field !== 'deleted').map(field => [field, row[field] ?? null])); }

export function buildArmorTypedEffectPublicationPlan({ typedEffects = [], currentRelationRows = [], sourceFingerprint } = {}) {
  if (!Array.isArray(typedEffects) || typedEffects.length === 0) throw new Error('typed effect rows are required');
  if (!Array.isArray(currentRelationRows)) throw new Error('current relation effect rows are required');
  const fingerprint = normalizeFingerprint(sourceFingerprint);
  const proposed = typedEffects.map((row, index) => normalizeRow(row, `proposed typed effect ${index}`));
  const current = currentRelationRows.map((row, index) => {
    if (!row || typeof row !== 'object') throw new Error(`current relation effect ${index} is invalid`);
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [snake(key), value]));
  });
  const currentTyped = current.filter(row => row.source_kind === 'armor_item_page' && active(row)).map((row, index) => normalizeRow(row, `current typed effect ${index}`));
  assertUnique(proposed, 'proposed typed effect');
  assertUnique(currentTyped, 'current typed effect');
  const currentByKey = new Map(currentTyped.map(row => [row.record_key, row]));
  const proposedByKey = new Map(proposed.map(row => [row.record_key, row]));
  const changes = {
    inserts: proposed.filter(row => !currentByKey.has(row.record_key)),
    updates: proposed.filter(row => currentByKey.has(row.record_key) && JSON.stringify(stable(comparable(currentByKey.get(row.record_key)))) !== JSON.stringify(stable(comparable(row))))
      .map(row => ({ before: currentByKey.get(row.record_key), after: row })),
    retire: currentTyped.filter(row => !proposedByKey.has(row.record_key)),
    unchanged: proposed.filter(row => currentByKey.has(row.record_key) && JSON.stringify(stable(comparable(currentByKey.get(row.record_key)))) === JSON.stringify(stable(comparable(row)))),
  };
  const preservedGenericRecordKeys = current.filter(row => row.source_kind !== 'armor_item_page' && active(row)).map(row => row.record_key).filter(Boolean).sort();
  const plan = {
    schemaVersion: 'armor-typed-effect-publication/v1', operationId: 'canonical-armor-typed-effect-publication',
    ownership: [...ARMOR_TYPED_EFFECT_RELATION_OWNERSHIP], databaseWrites: false, applyAllowed: false,
    sourceFingerprint: fingerprint, currentRelationRows: currentRelationRows.map(row => structuredClone(row)),
    proposedRows: proposed, preservedGenericRecordKeys, changes,
  };
  return { ...plan, proposalSha256: hash(plan) };
}

export async function validateArmorTypedEffectPublicationPlan(plan) {
  if (!plan || plan.schemaVersion !== 'armor-typed-effect-publication/v1' || plan.operationId !== 'canonical-armor-typed-effect-publication') throw new Error('typed effect publication plan identity is invalid');
  if (plan.databaseWrites !== false || plan.applyAllowed !== false || JSON.stringify(plan.ownership) !== JSON.stringify(ARMOR_TYPED_EFFECT_RELATION_OWNERSHIP)) throw new Error('typed effect publication plan safety flags drifted');
  const expected = buildArmorTypedEffectPublicationPlan({ typedEffects: plan.proposedRows, currentRelationRows: plan.currentRelationRows, sourceFingerprint: plan.sourceFingerprint });
  if (expected.proposalSha256 !== plan.proposalSha256 || JSON.stringify(stable(expected)) !== JSON.stringify(stable(plan))) throw new Error('typed effect publication plan drifted');
  return true;
}
