import { createHash } from 'node:crypto';

import {
  validateArmorMissingAttributeSourceEvidence,
} from '../fetch/armor-missing-attribute-source-evidence.mjs';

export const ARMOR_MISSING_ATTRIBUTE_MAINT_CANDIDATE_SCHEMA =
  'armor-missing-attribute-maint-candidate/v1';

const HASH = /^sha256:[a-f0-9]{64}$/;
const RECORD_KEY = /^[a-f0-9]{64}$/;
const LANDING_SOURCE_PREFIX = 'wiki.page.armor.attributes.missing-owners';
const SLOT_TYPES = Object.freeze({ head: 'headSlot', body: 'bodySlot', legs: 'legSlot' });
const STAT_KEYS = Object.freeze({
  summonDamage: 'summon_damage',
  minionSlots: 'minion_slots',
  miningSpeed: 'mining_speed',
  fishingPower: 'fishing_power',
});

function stable(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

function hashJson(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex')}`;
}

function hashJsonHex(value) {
  return createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex');
}

function hashText(value) {
  return `sha256:${createHash('sha256').update(String(value), 'utf8').digest('hex')}`;
}

function requireText(value, label) {
  if (typeof value !== 'string' || value.trim() === '' || value !== value.trim()) {
    throw new Error(`${label} is required`);
  }
  return value;
}

function requirePositive(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${label} is invalid`);
  return number;
}

function requireTime(value, label) {
  const text = requireText(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(text)
      || !Number.isFinite(Date.parse(text))) throw new Error(`${label} is invalid`);
  return new Date(text).toISOString();
}

function requireRepoPath(value, label) {
  const path = requireText(value, label);
  if (path.startsWith('/') || path.includes('\\') || path.split('/').some(part => part === '' || part === '.' || part === '..')) {
    throw new Error(`${label} must be repository-relative`);
  }
  return path;
}

function active(row) {
  return Number(row?.status) === 1 && Number(row?.deleted) === 0;
}

function normalizeRows(rows, label) {
  if (!Array.isArray(rows)) throw new Error(`${label} rows are required`);
  const ids = new Set();
  const keys = new Set();
  for (const row of rows) {
    if (!row || typeof row !== 'object') throw new Error(`${label} row is invalid`);
    const id = requirePositive(row.id, `${label} row id`);
    if (ids.has(id)) throw new Error(`${label} row id is duplicate`);
    ids.add(id);
    if (row.record_key != null) {
      if (!RECORD_KEY.test(String(row.record_key)) || keys.has(row.record_key)) {
        throw new Error(`${label} row record key is invalid or duplicate`);
      }
      keys.add(row.record_key);
    }
  }
  return rows;
}

function comparable(value) {
  return stable(Object.fromEntries(Object.entries(value).filter(([key]) => ![
    'id', 'created_at', 'updated_at',
  ].includes(key))));
}

function equalRows(left, right) {
  return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
}

function normalizeEvidence(evidence) {
  validateArmorMissingAttributeSourceEvidence(evidence);
  if (!Array.isArray(evidence.records) || evidence.records.length === 0) {
    throw new Error('Armor missing-attribute evidence records are required');
  }
  const ids = new Set();
  for (const record of evidence.records) {
    const identity = record?.identity;
    const itemSourceId = requirePositive(identity?.itemSourceId, 'Armor missing-attribute item source ID');
    if (ids.has(itemSourceId)) throw new Error(`Armor missing-attribute item source ID is duplicate: ${itemSourceId}`);
    ids.add(itemSourceId);
    requireText(identity.internalName, `Armor item ${itemSourceId} internal name`);
    requireText(identity.itemName, `Armor item ${itemSourceId} name`);
    if (!['head', 'body', 'legs'].includes(identity.slotGroup)) throw new Error(`Armor item ${itemSourceId} slot is invalid`);
    if (!Number.isSafeInteger(identity.defenseValue) || identity.defenseValue < 0) throw new Error(`Armor item ${itemSourceId} defense is invalid`);
    if (record.sourceStatus !== 'revision-bound') throw new Error(`Armor item ${itemSourceId} source is not revision-bound`);
    const overview = record.source?.overview;
    if (!overview || overview.pageTitle !== 'Armor' || !HASH.test(overview.contentHash ?? '')
        || !HASH.test(overview.rowHash ?? '') || !Number.isSafeInteger(overview.revisionId)) {
      throw new Error(`Armor item ${itemSourceId} overview lineage is invalid`);
    }
    if (!Array.isArray(record.itemScopedFacts) || !Array.isArray(record.setOwnedFacts)
        || !Array.isArray(record.effectLines) || !Array.isArray(record.itemScopedSourceLines)) {
      throw new Error(`Armor item ${itemSourceId} effect evidence is invalid`);
    }
    for (const fact of record.itemScopedFacts) {
      if (!STAT_KEYS[fact?.statKey] || !['add', 'multiply'].includes(fact.operation)
          || typeof fact.valueDecimal !== 'number' || !Number.isFinite(fact.valueDecimal)
          || !['percent', 'points'].includes(fact.unit)) {
        throw new Error(`Armor item ${itemSourceId} item-scoped fact is invalid`);
      }
    }
  }
  return evidence;
}

function normalizeMaintItems(maintItems, records) {
  if (!Array.isArray(maintItems)) throw new Error('Armor maint items are required');
  const bySourceId = new Map();
  for (const row of maintItems) {
    const sourceId = requirePositive(row?.source_id ?? row?.id, 'Armor maint item source ID');
    if (bySourceId.has(sourceId) || !active(row)) throw new Error(`Armor maint item identity is duplicate or inactive: ${sourceId}`);
    bySourceId.set(sourceId, row);
  }
  for (const record of records) {
    const { itemSourceId, internalName, itemName, defenseValue } = record.identity;
    const item = bySourceId.get(itemSourceId);
    if (!item || item.internal_name !== internalName || Number(item.defense_value ?? item.defense) !== defenseValue) {
      throw new Error(`Armor maint item identity or defense mismatch: ${itemSourceId}`);
    }
    if (item.english_name != null && item.english_name !== itemName) {
      throw new Error(`Armor maint item name mismatch: ${itemSourceId}`);
    }
  }
  return bySourceId;
}

function buildLanding(evidence, evidencePath, preparedAt) {
  const payloadJson = JSON.stringify(stable(evidence));
  const contentHash = hashJsonHex(evidence);
  const sourceKey = `${LANDING_SOURCE_PREFIX}.${evidence.evidenceSha256.slice('sha256:'.length)}`;
  return {
    dataset_type: 'armor_attributes_raw',
    provider: 'terraria.wiki.gg',
    source_kind: 'wiki_revision_bundle',
    source_key: sourceKey,
    source_locator: evidencePath,
    source_page: 'Armor missing attribute source evidence',
    source_revision_timestamp: evidence.records[0].source.overview.revisionTimestamp,
    content_hash: contentHash,
    payload_json: payloadJson,
    fetched_at: preparedAt,
    parsed_at: preparedAt,
    parse_status: 'ok',
    artifact_role: 'source_evidence',
    producer_id: 'armor-missing-attribute-source-evidence',
    producer_version: '1',
    producer_run_key: evidence.evidenceSha256,
    bootstrap_manifest_hash: null,
    full_file_content_hash: contentHash,
    full_file_byte_size: Buffer.byteLength(payloadJson),
    is_current: 1,
    notes: `Revision-bound evidence bundle ${evidencePath}; candidate only, no persistence performed.`,
  };
}

function buildMaintRow(record, landing, landingId, maintItem, evidence) {
  const { itemSourceId, internalName, itemName, slotGroup, defenseValue } = record.identity;
  const recordKey = hashJsonHex([
    'armor-missing-attribute-maint/v1', landing.source_key, itemSourceId, internalName, slotGroup,
  ]);
  const raw = {
    schemaVersion: ARMOR_MISSING_ATTRIBUTE_MAINT_CANDIDATE_SCHEMA,
    targetGameVersion: evidence.targetGameVersion,
    sourceEvidenceHash: evidence.evidenceSha256,
    sourceEvidencePath: null,
    record,
  };
  return {
    record_key: recordKey,
    section_code: null,
    slot_group: slotGroup,
    item_page_title: itemName,
    item_href: `/wiki/${itemName.replaceAll(' ', '_')}`,
    item_name_zh: maintItem.name_zh ?? null,
    defense_value: defenseValue,
    raw_cells_json: JSON.stringify(stable({
      itemScopedFacts: record.itemScopedFacts,
      setOwnedFacts: record.setOwnedFacts,
      effectLines: record.effectLines,
      sourceEvidenceHash: evidence.evidenceSha256,
    })),
    source_provider: 'terraria.wiki.gg',
    source_page: record.source.overview.pageTitle,
    source_revision_timestamp: record.source.overview.revisionTimestamp,
    landing_source_id: landingId ?? null,
    landing_source_key: landing.source_key,
    landing_source_page: landing.source_page,
    landing_content_hash: landing.content_hash,
    landing_fetched_at: landing.fetched_at,
    landing_parsed_at: landing.parsed_at,
    raw_json: JSON.stringify(stable(raw)),
    status: 1,
    deleted: 0,
  };
}

function buildItemEffects(record, maintRow, landing, evidence) {
  const { itemSourceId, internalName, itemName, slotGroup } = record.identity;
  const slotType = SLOT_TYPES[slotGroup];
  return record.itemScopedFacts.map((fact, effectIndex) => {
    const sourceLine = record.itemScopedSourceLines[effectIndex] ?? record.itemScopedSourceLines[0] ?? null;
    const sourceLineIndex = sourceLine == null ? null : record.effectLines.indexOf(sourceLine);
    const effect = {
      ownerKind: 'item', ownerRecordKey: maintRow.record_key, ownerId: itemSourceId, ownerKey: internalName,
      sourceKind: 'armor_attribute_cell', sourceLocale: 'en', sourceLineIndex: sourceLineIndex >= 0 ? sourceLineIndex : null,
      sourceLine, effectIndex, applyScope: 'item_bonus', variantLabel: itemName,
      itemInternalName: internalName, slotType, statKey: STAT_KEYS[fact.statKey], statLabelZh: null,
      classScope: null, operation: fact.operation, valueDecimal: fact.valueDecimal, valueMaxDecimal: null,
      unit: fact.unit, conditionText: null, rawText: sourceLine, parseStatus: 'parsed',
      sourceMaintTable: 'maint_armor_attribute_rows', sourceMaintRecordKey: maintRow.record_key,
      sourceMaintId: maintRow.id ?? null, landingSourceId: landing.id ?? null,
      landingSourceKey: landing.source_key, landingContentHash: landing.content_hash,
      sourceProvider: 'terraria.wiki.gg', sourcePage: record.source.overview.pageTitle,
      sourceRevisionTimestamp: record.source.overview.revisionTimestamp, confidence: 1,
      reviewStatus: 'pending_owner_review', reason: 'derived_from_revision_bound_armor_source_evidence',
      rawJson: JSON.stringify(stable({ schemaVersion: 'armor-missing-attribute-item-effect/v1', evidenceHash: evidence.evidenceSha256, fact })),
      status: 1, deleted: 0,
    };
    return { ...effect, recordKey: hashJsonHex(['armor-missing-attribute-item-effect/v1', maintRow.record_key, effectIndex, fact]) };
  });
}

function planLanding(currentRows, proposed) {
  const rows = normalizeRows(currentRows, 'Armor landing');
  const matches = rows.filter(row => row.source_key === proposed.source_key);
  if (matches.length > 1) throw new Error('Armor missing-attribute landing identity is duplicate');
  if (matches.length === 1) {
    if (matches[0].content_hash !== proposed.content_hash || matches[0].payload_json !== proposed.payload_json) {
      throw new Error('Armor missing-attribute landing immutable evidence drift');
    }
    return { row: structuredClone(matches[0]), changes: { inserts: [], reused: [structuredClone(matches[0])], preserved: rows.filter(row => row !== matches[0]).map(row => structuredClone(row)) } };
  }
  return { row: structuredClone(proposed), changes: { inserts: [structuredClone(proposed)], reused: [], preserved: rows.map(row => structuredClone(row)) } };
}

export function buildArmorMissingAttributeMaintCandidate({
  evidence, evidencePath, preparedAt, maintItems, currentLandingRows = [], currentMaintRows = [],
} = {}) {
  const normalizedEvidence = normalizeEvidence(evidence);
  const path = requireRepoPath(evidencePath, 'Armor missing-attribute evidence path');
  const timestamp = requireTime(preparedAt, 'Armor missing-attribute preparedAt');
  const itemById = normalizeMaintItems(maintItems, normalizedEvidence.records);
  const currentMaint = normalizeRows(currentMaintRows, 'Armor maint attribute');
  const proposedLanding = buildLanding(normalizedEvidence, path, timestamp);
  const landingPlan = planLanding(currentLandingRows, proposedLanding);
  const landingId = landingPlan.row.id ?? null;
  const proposedRows = normalizedEvidence.records.map(record => buildMaintRow(record, landingPlan.row, landingId, itemById.get(record.identity.itemSourceId), normalizedEvidence));
  const currentByKey = new Map(currentMaint.map(row => [row.record_key, row]));
  const seen = new Set();
  const changes = { inserts: [], reused: [], preserved: [] };
  for (const proposed of proposedRows) {
    if (seen.has(proposed.record_key)) throw new Error('Armor missing-attribute maint record key is duplicate');
    seen.add(proposed.record_key);
    const before = currentByKey.get(proposed.record_key);
    if (!before) changes.inserts.push(proposed);
    else if (!equalRows(before, proposed)) throw new Error(`Armor missing-attribute maint immutable row drift: ${proposed.record_key}`);
    else changes.reused.push(structuredClone(before));
  }
  for (const row of currentMaint) if (!seen.has(row.record_key)) changes.preserved.push(structuredClone(row));
  const itemEffects = normalizedEvidence.records.flatMap(record => buildItemEffects(record, proposedRows.find(row => row.item_page_title === record.identity.itemName), landingPlan.row, normalizedEvidence));
  const setOwnedFacts = normalizedEvidence.records.map(record => ({
    itemSourceId: record.identity.itemSourceId,
    setTitle: record.source.overview.setTitle,
    facts: [...record.setOwnedFacts],
  }));
  const body = {
    schemaVersion: ARMOR_MISSING_ATTRIBUTE_MAINT_CANDIDATE_SCHEMA,
    executable: false,
    databaseWrites: false,
    applyAllowed: false,
    sourceEvidence: { path, sha256: normalizedEvidence.evidenceSha256 },
    evidenceRevision: normalizedEvidence.sourceRevision,
    proposedLanding,
    changes: { landing: landingPlan.changes, maint: changes },
    maintRows: proposedRows,
    itemEffects,
    setOwnedFacts,
    acceptance: {
      status: 'blocked',
      blockers: [
        { code: 'registered-armor-attribute-source-executor-required' },
        { code: 'owner-review-required-for-set-owned-facts', itemSourceIds: setOwnedFacts.filter(row => row.facts.length).map(row => row.itemSourceId) },
        ...(landingId == null ? [{ code: 'landing-id-allocation-required' }] : []),
        ...(changes.inserts.length ? [{ code: 'maint-id-allocation-required', count: changes.inserts.length }] : []),
      ],
    },
  };
  return { ...body, candidateSha256: hashJson(body) };
}

export function validateArmorMissingAttributeMaintCandidate(candidate) {
  if (!candidate || candidate.schemaVersion !== ARMOR_MISSING_ATTRIBUTE_MAINT_CANDIDATE_SCHEMA
      || candidate.executable !== false || candidate.databaseWrites !== false || candidate.applyAllowed !== false
      || !HASH.test(candidate.sourceEvidence?.sha256 ?? '') || !Array.isArray(candidate.maintRows)
      || !Array.isArray(candidate.itemEffects) || !Array.isArray(candidate.setOwnedFacts)) {
    throw new Error('Armor missing-attribute maint candidate identity is invalid');
  }
  const { candidateSha256, ...body } = candidate;
  if (!HASH.test(candidateSha256 ?? '') || hashJson(body) !== candidateSha256) {
    throw new Error('Armor missing-attribute maint candidate hash drifted');
  }
  if (candidate.changes?.landing?.inserts?.some(row => Object.hasOwn(row, 'id'))
      || candidate.changes?.maint?.inserts?.some(row => Object.hasOwn(row, 'id'))) {
    throw new Error('Armor missing-attribute maint candidate allocates an ID');
  }
  if (candidate.itemEffects.some(effect => effect.sourceKind !== 'armor_attribute_cell'
      || effect.sourceMaintTable !== 'maint_armor_attribute_rows')) {
    throw new Error('Armor missing-attribute item effect owner drifted');
  }
  return true;
}
