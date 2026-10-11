import { createHash } from 'node:crypto';

import {
  buildArmorAttributeRelations,
} from './sync-maint-to-relation.mjs';

export const ARMOR_ATTRIBUTE_RELATION_PUBLICATION_OPERATION_ID =
  'canonical-armor-attribute-relation-publication';
export const ARMOR_ATTRIBUTE_RELATION_PUBLICATION_OWNERSHIP = Object.freeze([
  'relation.relation_armor_attribute_rows.item_source_id.954,955,5524,5588-5593',
  'relation.relation_equipment_effect_attributes.armor_attribute_cell.item_source_id.954,955,5524,5588-5593',
]);
export const ARMOR_ATTRIBUTE_RELATION_TARGET_IDS = Object.freeze([
  954, 955, 5524, 5588, 5589, 5590, 5591, 5592, 5593,
]);

const HASH = /^sha256:[a-f0-9]{64}$/;
const STAT_KEYS = Object.freeze({
  summonDamage: 'summon_damage',
  minionSlots: 'minion_slots',
  miningSpeed: 'mining_speed',
  fishingPower: 'fishing_power',
});
const SLOT_TYPES = Object.freeze({ head: 'headSlot', body: 'bodySlot', legs: 'legSlot' });
const GENERATED = new Set(['id', 'created_at', 'updated_at']);
const READBACK_DEFAULTS = Object.freeze({ status: 1, deleted: 0 });
const DECIMAL_COLUMNS = new Set(['confidence', 'value_decimal', 'value_max_decimal']);

function stable(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

function hash(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex')}`;
}

function hashHex(value) {
  return createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex');
}

function active(row) { return Number(row?.status) === 1 && Number(row?.deleted) === 0; }
function positive(value) { return Number.isSafeInteger(Number(value)) && Number(value) > 0; }
function snake(value) {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`), item,
  ]));
}

function comparable(row) {
  const values = Object.fromEntries(Object.entries(row ?? {}).filter(([key]) => !GENERATED.has(key)));
  for (const [key, value] of Object.entries(READBACK_DEFAULTS)) {
    if (values[key] == null) values[key] = value;
  }
  for (const key of DECIMAL_COLUMNS) {
    if (values[key] != null && Number.isFinite(Number(values[key]))) values[key] = Number(values[key]);
  }
  return stable(values);
}

function parseRaw(row) {
  try {
    const value = typeof row.raw_json === 'string' ? JSON.parse(row.raw_json) : row.raw_json;
    return value?.record && typeof value.record === 'object' ? value.record : null;
  } catch {
    return null;
  }
}

function parseFacts(row) {
  const record = parseRaw(row);
  if (!record || !Array.isArray(record.itemScopedFacts) || !Array.isArray(record.itemScopedSourceLines)
      || !Array.isArray(record.effectLines)) throw new Error(`Armor attribute source facts are invalid: ${row.record_key}`);
  return { record, facts: record.itemScopedFacts };
}

function buildItemScopedEffectRows(attributeRows, maintItems) {
  const items = new Map(maintItems.map(row => [Number(row.source_id), row]));
  return attributeRows.flatMap(attribute => {
    if (!positive(attribute.item_id)) throw new Error(`Armor attribute item owner is unresolved: ${attribute.record_key}`);
    const item = items.get(Number(attribute.item_id));
    if (!item || !active(item) || item.internal_name !== attribute.item_internal_name) {
      throw new Error(`Armor attribute maint item identity is unresolved: ${attribute.item_id}`);
    }
    const { record, facts } = parseFacts({ ...attribute, raw_json: attribute.raw_json });
    const sourceEvidenceHash = JSON.parse(attribute.raw_json)?.sourceEvidenceHash
      ?? JSON.parse(attribute.raw_json)?.record?.sourceEvidenceHash ?? null;
    return facts.map((fact, effectIndex) => {
      const statKey = STAT_KEYS[fact?.statKey];
      if (!statKey || !['add', 'multiply'].includes(fact.operation)
          || !Number.isFinite(Number(fact.valueDecimal)) || !['percent', 'points'].includes(fact.unit)) {
        throw new Error(`Armor attribute item-scoped fact is invalid: ${attribute.record_key}`);
      }
      const sourceLine = record.itemScopedSourceLines[effectIndex] ?? record.itemScopedSourceLines[0] ?? null;
      const sourceLineIndex = sourceLine == null ? null : record.effectLines.indexOf(sourceLine);
      const factPayload = { operation: fact.operation, statKey: fact.statKey, unit: fact.unit, valueDecimal: Number(fact.valueDecimal) };
      const row = {
        record_key: hashHex(['armor-missing-attribute-item-effect/v1', attribute.record_key, effectIndex, factPayload]),
        owner_kind: 'item', owner_record_key: attribute.record_key, owner_id: Number(attribute.item_id),
        owner_key: attribute.item_internal_name, source_kind: 'armor_attribute_cell', source_locale: 'en',
        source_line_index: sourceLineIndex >= 0 ? sourceLineIndex : null, source_line: sourceLine,
        effect_index: effectIndex, apply_scope: 'item_bonus', variant_label: attribute.item_page_title,
        item_internal_name: attribute.item_internal_name, slot_type: SLOT_TYPES[attribute.slot_group] ?? null,
        stat_key: statKey, stat_label_zh: null, class_scope: null, operation: fact.operation,
        value_decimal: Number(fact.valueDecimal), value_max_decimal: null, unit: fact.unit,
        condition_text: null, raw_text: sourceLine, parse_status: 'parsed',
        source_maint_table: 'maint_armor_attribute_rows', source_maint_record_key: attribute.record_key,
        source_maint_id: Number(attribute.source_maint_id), landing_source_id: Number(attribute.landing_source_id),
        landing_source_key: attribute.landing_source_key, landing_content_hash: attribute.landing_content_hash,
        source_provider: attribute.source_provider, source_page: attribute.source_page,
        source_revision_timestamp: attribute.source_revision_timestamp, confidence: 1,
        review_status: 'accepted', reason: 'derived_from_revision_bound_armor_source_evidence',
        raw_json: JSON.stringify(stable({ schemaVersion: 'armor-missing-attribute-item-effect/v1',
          evidenceHash: sourceEvidenceHash, fact: factPayload })), status: 1, deleted: 0,
      };
      return row;
    });
  });
}

function exactTargetRows(rows, key, label) {
  if (!Array.isArray(rows)) throw new Error(`Armor attribute ${label} rows are required`);
  const byId = new Map();
  for (const row of rows) {
    const id = Number(row?.[key]);
    if (!ARMOR_ATTRIBUTE_RELATION_TARGET_IDS.includes(id) || byId.has(id)) {
      throw new Error(`Armor attribute ${label} target identity is invalid or duplicate`);
    }
    byId.set(id, row);
  }
  if (byId.size !== ARMOR_ATTRIBUTE_RELATION_TARGET_IDS.length) {
    throw new Error(`Armor attribute ${label} must contain exactly nine target owners`);
  }
  return byId;
}

function exactActiveTargetRows(rows, key, label) {
  const byId = exactTargetRows(rows, key, label);
  for (const row of byId.values()) if (!active(row)) throw new Error(`Armor attribute ${label} target is inactive`);
  return byId;
}

function diffRows(currentRows, proposedRows) {
  const currentByKey = new Map(currentRows.map(row => [row.record_key, row]));
  const proposedByKey = new Map(proposedRows.map(row => [row.record_key, row]));
  const inserts = proposedRows.filter(row => !currentByKey.has(row.record_key));
  const updates = proposedRows.filter(row => currentByKey.has(row.record_key)
    && JSON.stringify(comparable(currentByKey.get(row.record_key))) !== JSON.stringify(comparable(row)))
    .map(row => ({ before: currentByKey.get(row.record_key), after: row }));
  const unchanged = proposedRows.filter(row => currentByKey.has(row.record_key)
    && JSON.stringify(comparable(currentByKey.get(row.record_key))) === JSON.stringify(comparable(row)));
  const preserved = currentRows.filter(row => !proposedByKey.has(row.record_key));
  return { inserts, updates, unchanged, preserved };
}

export function buildArmorAttributeRelationPublicationCandidate({
  maintArmorAttributeRows, maintItems, relationArmorSetItems, currentRelationAttributeRows,
  currentRelationEffectRows,
} = {}) {
  const normalizedMaintArmorAttributeRows = (maintArmorAttributeRows ?? []).map(row => ({
    ...row,
    item_source_id: Number(parseRaw(row)?.identity?.itemSourceId),
  }));
  const maintById = exactActiveTargetRows(normalizedMaintArmorAttributeRows, 'item_source_id', 'maint attribute');
  const itemById = exactActiveTargetRows(maintItems, 'source_id', 'maint item');
  const relationMembers = relationArmorSetItems.filter(row => ARMOR_ATTRIBUTE_RELATION_TARGET_IDS.includes(Number(row.item_source_id)));
  const relationRows = buildArmorAttributeRelations({
    maintArmorAttributeRows: [...maintById.values()], maintItems: [...itemById.values()],
    relationArmorSetItems: relationMembers,
  }).map(snake);
  if (relationRows.length !== ARMOR_ATTRIBUTE_RELATION_TARGET_IDS.length
      || relationRows.some(row => row.review_status !== 'accepted' || !positive(row.item_id))) {
    throw new Error('Armor attribute relation owner resolution is incomplete');
  }
  if (!Array.isArray(currentRelationAttributeRows) || currentRelationAttributeRows.some(row => {
    const id = Number(row?.item_id);
    return !ARMOR_ATTRIBUTE_RELATION_TARGET_IDS.includes(id) || !active(row);
  })) throw new Error('Armor attribute current relation attribute scope is invalid');
  if (new Set(currentRelationAttributeRows.map(row => Number(row.item_id))).size !== currentRelationAttributeRows.length) {
    throw new Error('Armor attribute current relation attribute scope is duplicate');
  }
  const effects = buildItemScopedEffectRows(relationRows, [...itemById.values()]);
  const effectIds = new Set(effects.map(row => row.owner_id));
  if (effects.some(row => !effectIds.has(row.owner_id))) throw new Error('Armor attribute effect owner resolution failed');
  const attributeChanges = diffRows(currentRelationAttributeRows, relationRows);
  const effectChanges = diffRows(currentRelationEffectRows, effects);
  const body = {
    schemaVersion: 'armor-attribute-relation-publication-candidate/v1', operationId: ARMOR_ATTRIBUTE_RELATION_PUBLICATION_OPERATION_ID,
    executable: false, databaseWrites: false, applyAllowed: false,
    targetItemSourceIds: [...ARMOR_ATTRIBUTE_RELATION_TARGET_IDS], ownership: [...ARMOR_ATTRIBUTE_RELATION_PUBLICATION_OWNERSHIP],
    sourceSnapshots: { maintArmorAttributeRows: structuredClone([...maintById.values()]), maintItems: structuredClone([...itemById.values()]),
      relationArmorSetItems: structuredClone(relationMembers), currentRelationAttributeRows: structuredClone(currentRelationAttributeRows),
      currentRelationEffectRows: structuredClone(currentRelationEffectRows) },
    proposedRows: { relationArmorAttributeRows: structuredClone(relationRows), relationEquipmentEffectAttributes: structuredClone(effects) },
    changes: { relationArmorAttributeRows: attributeChanges, relationEquipmentEffectAttributes: effectChanges },
    acceptance: { exactTargetCount: true, unresolvedRowsUntouched: true, relationTablesOnly: true,
      parsedItemEffectCount: effects.length, setOwnedFactsPublished: false },
  };
  return { ...body, candidateSha256: hash(body) };
}

export function validateArmorAttributeRelationPublicationCandidate(candidate) {
  const { candidateSha256, ...body } = candidate ?? {};
  if (candidate?.schemaVersion !== 'armor-attribute-relation-publication-candidate/v1'
      || candidate.operationId !== ARMOR_ATTRIBUTE_RELATION_PUBLICATION_OPERATION_ID
      || candidate.executable !== false || candidate.databaseWrites !== false || candidate.applyAllowed !== false
      || !HASH.test(candidateSha256 ?? '') || hash(body) !== candidateSha256
      || JSON.stringify(candidate.targetItemSourceIds) !== JSON.stringify(ARMOR_ATTRIBUTE_RELATION_TARGET_IDS)
      || JSON.stringify(candidate.ownership) !== JSON.stringify(ARMOR_ATTRIBUTE_RELATION_PUBLICATION_OWNERSHIP)
      || candidate.acceptance?.unresolvedRowsUntouched !== true || candidate.acceptance?.relationTablesOnly !== true) {
    throw new Error('Armor attribute relation candidate identity, scope or safety flags are invalid');
  }
  exactActiveTargetRows(candidate.sourceSnapshots?.maintArmorAttributeRows, 'item_source_id', 'candidate maint attribute');
  exactActiveTargetRows(candidate.sourceSnapshots?.maintItems, 'source_id', 'candidate maint item');
  if (!Array.isArray(candidate.proposedRows?.relationArmorAttributeRows)
      || candidate.proposedRows.relationArmorAttributeRows.length !== ARMOR_ATTRIBUTE_RELATION_TARGET_IDS.length) {
    throw new Error('Armor attribute relation candidate proposed owners are incomplete');
  }
  if (!Array.isArray(candidate.changes?.relationArmorAttributeRows?.inserts)
      || !Array.isArray(candidate.changes?.relationEquipmentEffectAttributes?.inserts)) {
    throw new Error('Armor attribute relation candidate changes are invalid');
  }
  return true;
}

export function buildArmorAttributeRelationPublicationProposal({ candidate, serverUuid } = {}) {
  validateArmorAttributeRelationPublicationCandidate(candidate);
  if (typeof serverUuid !== 'string' || !serverUuid.trim()) throw new Error('Armor attribute relation server UUID is required');
  const body = { schemaVersion: 'armor-attribute-relation-publication-proposal/v1',
    operationId: ARMOR_ATTRIBUTE_RELATION_PUBLICATION_OPERATION_ID, executable: false, databaseWrites: false,
    applyAllowed: false, serverUuid, candidate, proposalSha256: null };
  delete body.proposalSha256;
  return { ...body, proposalSha256: hash(body) };
}

export function validateArmorAttributeRelationPublicationProposal(proposal) {
  const { proposalSha256, ...body } = proposal ?? {};
  if (proposal?.schemaVersion !== 'armor-attribute-relation-publication-proposal/v1'
      || proposal.operationId !== ARMOR_ATTRIBUTE_RELATION_PUBLICATION_OPERATION_ID
      || proposal.executable !== false || proposal.databaseWrites !== false || proposal.applyAllowed !== false
      || !HASH.test(proposalSha256 ?? '') || hash(body) !== proposalSha256) {
    throw new Error('Armor attribute relation proposal identity or safety flags are invalid');
  }
  validateArmorAttributeRelationPublicationCandidate(proposal.candidate);
  return true;
}

export function comparableArmorAttributeRelationRow(row) { return comparable(row); }
