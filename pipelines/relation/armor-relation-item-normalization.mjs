import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

export const ARMOR_RELATION_ITEM_NORMALIZATION_OPERATION_ID = 'canonical-armor-relation-item-normalization';
export const ARMOR_RELATION_ITEM_NORMALIZATION_TARGET_IDS = Object.freeze([729, 1282]);
export const ARMOR_RELATION_ITEM_NORMALIZATION_OWNERSHIP = Object.freeze([
  'relation.relation_items.source_id.729,1282.defense_value',
]);

const TARGETS = new Map([
  [729, ['WoodGreaves', 'Wood Greaves']],
  [1282, ['AmethystRobe', 'Amethyst Robe']],
]);
const HASH = /^sha256:[a-f0-9]{64}$/;
const GENERATED = new Set(['created_at', 'updated_at']);

function stable(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}

function hash(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex')}`;
}

function active(row) {
  return Number(row?.status) === 1 && Number(row?.deleted) === 0;
}

function exact(rows, label) {
  if (!Array.isArray(rows)) throw new Error(`Armor relation-item normalization ${label} rows are required`);
  const byId = new Map();
  for (const row of rows) {
    const id = Number(row?.source_id);
    if (!ARMOR_RELATION_ITEM_NORMALIZATION_TARGET_IDS.includes(id) || byId.has(id)) throw new Error(`Armor relation-item normalization ${label} identity is invalid or duplicate`);
    byId.set(id, row);
  }
  if (byId.size !== ARMOR_RELATION_ITEM_NORMALIZATION_TARGET_IDS.length) throw new Error(`Armor relation-item normalization ${label} must contain exactly two targets`);
  return byId;
}

function rawObject(row) {
  try {
    const parsed = typeof row?.raw_json === 'string' ? JSON.parse(row.raw_json) : row?.raw_json;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

function validateMaint(row, id) {
  const [internal, english] = TARGETS.get(id);
  const raw = rawObject(row);
  if (!row || !active(row) || Number(row.source_id) !== id || row.internal_name !== internal || row.english_name !== english
      || row.source_provider !== 'terraria.wiki.gg' || row.source_page !== 'Module:Iteminfo/data'
      || row.defense_value !== null || !raw || Number(raw.id) !== id || raw.internalName !== internal || Object.hasOwn(raw, 'defense')) {
    throw new Error(`Armor relation-item normalization maint source is not canonical for ${id}`);
  }
}

function validateRelation(row, maint, id) {
  if (!row || !active(row) || Number(row.source_id) !== id || !row.record_key
      || row.internal_name !== maint.internal_name || row.english_name !== maint.english_name
      || row.source_maint_table !== 'maint_items' || Number(row.source_maint_id) !== Number(maint.id)
      || Number(row.defense_value) !== 0) {
    throw new Error(`Armor relation-item normalization relation owner or stale value is invalid for ${id}`);
  }
}

function comparable(row) {
  return stable(Object.fromEntries(Object.entries(row ?? {}).filter(([key]) => !GENERATED.has(key))));
}

export function buildArmorRelationItemNormalizationCandidate({ maintItems, relationItems } = {}) {
  const maintById = exact(maintItems, 'maint item');
  const relationById = exact(relationItems, 'relation item');
  const updates = ARMOR_RELATION_ITEM_NORMALIZATION_TARGET_IDS.map(id => {
    const maint = maintById.get(id);
    const before = structuredClone(relationById.get(id));
    validateMaint(maint, id);
    validateRelation(before, maint, id);
    const after = { ...before, defense_value: null };
    if (Number(after.id) !== Number(before.id) || after.record_key !== before.record_key) throw new Error(`Armor relation-item normalization stable identity drifted for ${id}`);
    return { before, after };
  });
  const body = {
    schemaVersion: 'armor-relation-item-normalization-candidate/v1',
    operationId: ARMOR_RELATION_ITEM_NORMALIZATION_OPERATION_ID,
    executable: false,
    databaseWrites: false,
    applyAllowed: false,
    targetItemSourceIds: [...ARMOR_RELATION_ITEM_NORMALIZATION_TARGET_IDS],
    changes: { relationItems: { updates } },
    acceptance: { relationItemsOnly: true, defenseNullCanonicalizationOnly: true, stableRelationIdsAndRecordKeys: true, databaseWrites: false },
  };
  return { ...body, candidateSha256: hash(body) };
}

export function validateArmorRelationItemNormalizationCandidate(candidate) {
  const { candidateSha256, ...body } = candidate ?? {};
  if (!candidate || candidate.schemaVersion !== 'armor-relation-item-normalization-candidate/v1'
      || candidate.operationId !== ARMOR_RELATION_ITEM_NORMALIZATION_OPERATION_ID
      || candidate.executable !== false || candidate.databaseWrites !== false || candidate.applyAllowed !== false
      || !HASH.test(candidateSha256 ?? '') || hash(body) !== candidateSha256
      || JSON.stringify(candidate.targetItemSourceIds) !== JSON.stringify(ARMOR_RELATION_ITEM_NORMALIZATION_TARGET_IDS)
      || candidate.changes?.relationItems?.updates?.length !== 2
      || candidate.acceptance?.relationItemsOnly !== true || candidate.acceptance?.defenseNullCanonicalizationOnly !== true) {
    throw new Error('Armor relation-item normalization candidate identity or scope is invalid');
  }
  exact(candidate.changes.relationItems.updates.map(change => change.before), 'candidate before');
  for (const change of candidate.changes.relationItems.updates) {
    const id = Number(change.before.source_id);
    if (!isDeepStrictEqual(comparable(change.after), comparable({ ...change.before, defense_value: null }))
        || Number(change.after.id) !== Number(change.before.id) || change.after.record_key !== change.before.record_key) {
      throw new Error(`Armor relation-item normalization candidate after-set drifted for ${id}`);
    }
  }
  return true;
}

export function buildArmorRelationItemNormalizationProposal({ candidate, serverUuid } = {}) {
  validateArmorRelationItemNormalizationCandidate(candidate);
  if (typeof serverUuid !== 'string' || !serverUuid.trim()) throw new Error('Armor relation-item normalization server UUID is required');
  const body = {
    schemaVersion: 'armor-relation-item-normalization-proposal/v1',
    operationId: ARMOR_RELATION_ITEM_NORMALIZATION_OPERATION_ID,
    executable: false,
    databaseWrites: false,
    applyAllowed: false,
    serverUuid,
    targetItemSourceIds: [...ARMOR_RELATION_ITEM_NORMALIZATION_TARGET_IDS],
    candidate,
    changes: structuredClone(candidate.changes),
  };
  return { ...body, proposalSha256: hash(body) };
}

export function validateArmorRelationItemNormalizationProposal(proposal) {
  const { proposalSha256, ...body } = proposal ?? {};
  if (!proposal || proposal.schemaVersion !== 'armor-relation-item-normalization-proposal/v1'
      || proposal.operationId !== ARMOR_RELATION_ITEM_NORMALIZATION_OPERATION_ID
      || proposal.executable !== false || proposal.databaseWrites !== false || proposal.applyAllowed !== false
      || !HASH.test(proposalSha256 ?? '') || hash(body) !== proposalSha256) {
    throw new Error('Armor relation-item normalization proposal identity or scope is invalid');
  }
  validateArmorRelationItemNormalizationCandidate(proposal.candidate);
  return true;
}
