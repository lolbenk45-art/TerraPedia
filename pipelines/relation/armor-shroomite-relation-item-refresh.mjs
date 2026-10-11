import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import { buildBaseEntityRelations } from './base-entity-processor.mjs';

export const ARMOR_SHROOMITE_RELATION_ITEM_REFRESH_OPERATION_ID = 'canonical-armor-shroomite-relation-item-refresh';
export const ARMOR_SHROOMITE_RELATION_ITEM_TARGET_IDS = Object.freeze([1546, 1547, 1548, 1549, 1550]);
export const ARMOR_SHROOMITE_RELATION_ITEM_SOURCE_KEY = 'wiki.module.iteminfo.armor-shroomite.1023241';
export const ARMOR_SHROOMITE_RELATION_ITEM_REVISION_TIMESTAMP = '2026-08-22T03:26:22.000Z';
export const ARMOR_SHROOMITE_RELATION_ITEM_UPDATE_COLUMNS = Object.freeze([
  'module_generated_at',
  'terraria_version',
  'combat_value',
  'use_time',
  'stack_size',
  'sell_raw',
  'sell_text_raw',
  'landing_source_id',
  'landing_source_key',
  'landing_content_hash',
  'source_revision_timestamp',
]);

const TARGET_NAMES = new Map([
  [1546, 'ShroomiteHeadgear'],
  [1547, 'ShroomiteMask'],
  [1548, 'ShroomiteHelmet'],
  [1549, 'ShroomiteBreastplate'],
  [1550, 'ShroomiteLeggings'],
]);
const HASH = /^sha256:[a-f0-9]{64}$/;
const GENERATED = new Set(['created_at', 'updated_at']);
const CAMEL_TO_SNAKE = /[A-Z]/g;

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

function requiredRows(rows, label) {
  if (!Array.isArray(rows)) throw new Error(`Shroomite relation-item ${label} rows are required`);
  return rows;
}

function active(row) {
  return Number(row?.status) === 1 && Number(row?.deleted) === 0;
}

function dbRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(CAMEL_TO_SNAKE, match => `_${match.toLowerCase()}`), value]));
}

function comparable(row) {
  return stable(Object.fromEntries(Object.entries(row ?? {}).filter(([key]) => !GENERATED.has(key))));
}

function assertExactRows(rows, key, expected, label) {
  const byKey = new Map();
  for (const row of rows) {
    const value = Number(row?.[key]);
    if (!Number.isSafeInteger(value) || byKey.has(value)) throw new Error(`Shroomite relation-item ${label} identity is invalid or duplicate`);
    byKey.set(value, row);
  }
  if (byKey.size !== expected.length || expected.some(value => !byKey.has(value))) {
    throw new Error(`Shroomite relation-item ${label} must contain exactly five target identities`);
  }
  return byKey;
}

function assertUniqueNamedRows(rows, targetNames, label) {
  const names = new Set(targetNames);
  const seen = new Set();
  for (const row of rows) {
    if (!names.has(row.item_internal_name)) continue;
    if (seen.has(row.item_internal_name)) throw new Error(`Shroomite relation-item ${label} has duplicate owner rows`);
    seen.add(row.item_internal_name);
  }
  return rows;
}

function validateMaintOwner(row, id) {
  if (!row || Number(row.source_id) !== id || !active(row) || row.internal_name !== TARGET_NAMES.get(id)) {
    throw new Error(`Shroomite maint item owner identity is invalid for ${id}`);
  }
  if (row.source_provider !== 'terraria.wiki.gg'
      || row.source_page !== 'Module:Iteminfo/data'
      || row.landing_source_key !== ARMOR_SHROOMITE_RELATION_ITEM_SOURCE_KEY
      || !/^[a-f0-9]{64}$/.test(row.landing_content_hash ?? '')
      || timestampIso(row.source_revision_timestamp) !== ARMOR_SHROOMITE_RELATION_ITEM_REVISION_TIMESTAMP) {
    throw new Error(`Shroomite maint item frozen lineage is invalid for ${id}`);
  }
}

function timestampIso(value) {
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function validateRelationOwner(row, maint, id) {
  if (!row || !active(row) || Number(row.source_id) !== id
      || typeof row.record_key !== 'string' || row.record_key.trim() === ''
      || row.internal_name !== maint.internal_name
      || row.english_name !== maint.english_name
      || row.source_maint_table !== 'maint_items'
      || Number(row.source_maint_id) !== Number(maint.id)) {
    throw new Error(`Shroomite relation item owner identity is invalid for ${id}`);
  }
}

function buildAfterRow({ before, source }) {
  const derived = dbRow(source);
  const after = { ...before };
  for (const column of ARMOR_SHROOMITE_RELATION_ITEM_UPDATE_COLUMNS) after[column] = derived[column];
  delete after.created_at;
  delete after.updated_at;
  return after;
}

export function buildArmorShroomiteRelationItemRefreshCandidate({
  maintItems,
  relationItems,
  maintItemNumericOverrides = [],
  maintItemPages = [],
} = {}) {
  requiredRows(maintItems, 'maint item');
  requiredRows(relationItems, 'relation item');
  requiredRows(maintItemNumericOverrides, 'numeric override');
  requiredRows(maintItemPages, 'item page');

  const maintById = assertExactRows(maintItems, 'source_id', ARMOR_SHROOMITE_RELATION_ITEM_TARGET_IDS, 'maint item');
  const relationById = assertExactRows(relationItems, 'source_id', ARMOR_SHROOMITE_RELATION_ITEM_TARGET_IDS, 'relation item');
  const targetNames = ARMOR_SHROOMITE_RELATION_ITEM_TARGET_IDS.map(id => TARGET_NAMES.get(id));
  assertUniqueNamedRows(maintItemNumericOverrides, targetNames, 'numeric override');
  assertUniqueNamedRows(maintItemPages, targetNames, 'item page');

  for (const id of ARMOR_SHROOMITE_RELATION_ITEM_TARGET_IDS) {
    const maint = maintById.get(id);
    const relation = relationById.get(id);
    validateMaintOwner(maint, id);
    validateRelationOwner(relation, maint, id);
  }

  const sourceItems = ARMOR_SHROOMITE_RELATION_ITEM_TARGET_IDS.map(id => structuredClone(maintById.get(id)));
  const sourceOverrides = maintItemNumericOverrides.filter(row => targetNames.includes(row.item_internal_name)).map(row => structuredClone(row));
  const sourcePages = maintItemPages.filter(row => targetNames.includes(row.item_internal_name)).map(row => structuredClone(row));
  const derivedRows = buildBaseEntityRelations({
    maintItems: sourceItems,
    maintItemNumericOverrides: sourceOverrides,
    maintItemPages: sourcePages,
  }).relationItems;
  const derivedById = new Map(derivedRows.map(row => [Number(row.sourceId), row]));
  const updates = ARMOR_SHROOMITE_RELATION_ITEM_TARGET_IDS.map(id => {
    const before = structuredClone(relationById.get(id));
    const derived = derivedById.get(id);
    if (!derived) throw new Error(`Shroomite relation item after-set is missing for ${id}`);
    const after = buildAfterRow({ before, source: derived });
    if (after.record_key !== before.record_key || Number(after.id) !== Number(before.id)) {
      throw new Error(`Shroomite relation item stable identity changed for ${id}`);
    }
    return { before, after };
  });

  const body = {
    schemaVersion: 'armor-shroomite-relation-item-refresh-candidate/v1',
    operationId: ARMOR_SHROOMITE_RELATION_ITEM_REFRESH_OPERATION_ID,
    executable: false,
    databaseWrites: false,
    applyAllowed: false,
    targetItemSourceIds: [...ARMOR_SHROOMITE_RELATION_ITEM_TARGET_IDS],
    sourceInputs: {
      maintItems: sourceItems,
      maintItemNumericOverrides: sourceOverrides,
      maintItemPages: sourcePages,
    },
    changes: { relationItems: { updates } },
    acceptance: {
      exactTargetCount: true,
      stableRelationIdsAndRecordKeys: true,
      afterSetDerivedFromMaint: true,
      relationItemsOnly: true,
      databaseWrites: false,
    },
  };
  return { ...body, candidateSha256: hash(body) };
}

export function validateArmorShroomiteRelationItemRefreshCandidate(candidate) {
  const { candidateSha256, ...body } = candidate ?? {};
  if (candidate?.schemaVersion !== 'armor-shroomite-relation-item-refresh-candidate/v1'
      || candidate.operationId !== ARMOR_SHROOMITE_RELATION_ITEM_REFRESH_OPERATION_ID
      || candidate.executable !== false || candidate.databaseWrites !== false || candidate.applyAllowed !== false
      || !HASH.test(candidateSha256 ?? '') || hash(body) !== candidateSha256) {
    throw new Error('Shroomite relation-item candidate identity or hash is invalid');
  }
  if (JSON.stringify(candidate.targetItemSourceIds) !== JSON.stringify(ARMOR_SHROOMITE_RELATION_ITEM_TARGET_IDS)
      || candidate.changes?.relationItems?.updates?.length !== ARMOR_SHROOMITE_RELATION_ITEM_TARGET_IDS.length
      || candidate.acceptance?.relationItemsOnly !== true) {
    throw new Error('Shroomite relation-item candidate scope drifted');
  }
  const sourceById = assertExactRows(candidate.sourceInputs?.maintItems, 'source_id', ARMOR_SHROOMITE_RELATION_ITEM_TARGET_IDS, 'candidate maint item');
  const beforeById = assertExactRows(candidate.changes.relationItems.updates.map(change => change.before), 'source_id', ARMOR_SHROOMITE_RELATION_ITEM_TARGET_IDS, 'candidate relation item');
  const updateById = new Map();
  for (const change of candidate.changes.relationItems.updates) {
    const id = Number(change.before.source_id);
    if (updateById.has(id)) throw new Error('Shroomite relation-item candidate has duplicate updates');
    updateById.set(id, change);
    validateMaintOwner(sourceById.get(id), id);
    validateRelationOwner(change.before, sourceById.get(id), id);
    if (Number(change.after.id) !== Number(change.before.id)
        || change.after.record_key !== change.before.record_key
        || Number(change.after.source_id) !== id) {
      throw new Error(`Shroomite relation item stable identity changed for ${id}`);
    }
  }
  if (beforeById.size !== updateById.size) throw new Error('Shroomite relation-item candidate before-set drifted');
  return true;
}

export function buildArmorShroomiteRelationItemRefreshProposal({ candidate, serverUuid } = {}) {
  validateArmorShroomiteRelationItemRefreshCandidate(candidate);
  if (typeof serverUuid !== 'string' || !serverUuid.trim()) throw new Error('Shroomite relation-item server UUID is required');
  const body = {
    schemaVersion: 'armor-shroomite-relation-item-refresh-proposal/v1',
    operationId: ARMOR_SHROOMITE_RELATION_ITEM_REFRESH_OPERATION_ID,
    executable: false,
    databaseWrites: false,
    applyAllowed: false,
    serverUuid,
    candidate,
    changes: structuredClone(candidate.changes),
    beforeSha256: hash(candidate.changes.relationItems.updates.map(change => change.before)),
    afterSha256: hash(candidate.changes.relationItems.updates.map(change => change.after)),
  };
  return { ...body, proposalSha256: hash(body) };
}

export function validateArmorShroomiteRelationItemRefreshProposal(proposal) {
  const { proposalSha256, ...body } = proposal ?? {};
  if (proposal?.schemaVersion !== 'armor-shroomite-relation-item-refresh-proposal/v1'
      || proposal.operationId !== ARMOR_SHROOMITE_RELATION_ITEM_REFRESH_OPERATION_ID
      || proposal.executable !== false || proposal.databaseWrites !== false || proposal.applyAllowed !== false
      || !HASH.test(proposalSha256 ?? '') || hash(body) !== proposalSha256
      || !HASH.test(proposal.beforeSha256 ?? '') || !HASH.test(proposal.afterSha256 ?? '')) {
    throw new Error('Shroomite relation-item proposal identity or hash is invalid');
  }
  validateArmorShroomiteRelationItemRefreshCandidate(proposal.candidate);
  if (!isDeepStrictEqual(comparable(proposal.changes), comparable(proposal.candidate.changes))) {
    throw new Error('Shroomite relation-item proposal changes drifted from its candidate');
  }
  return true;
}

export function comparableArmorShroomiteRelationItemRow(row) {
  return comparable(row);
}
