import { createHash } from 'node:crypto';
import { applyArmorSourceIdentityCorrections } from './armor-source-identity.mjs';

const EXPECTED = Object.freeze([
  ['Mining Helmet.png', 88, 'MiningHelmet', 'head'],
  ['Mining Shirt.png', 410, 'MiningShirt', 'body'],
  ['Mining Pants.png', 411, 'MiningPants', 'legs'],
]);
const RECORD_KEY = /^[a-f0-9]{64}$/;
const HASH = /^(?:sha256:)?[a-f0-9]{64}$/;

function stable(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function digest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex')}`;
}

function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required`);
  return value;
}

function positive(value, label) {
  if (!Number.isSafeInteger(Number(value)) || Number(value) <= 0) throw new Error(`${label} is invalid`);
  return Number(value);
}

function sourceTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Mining source revision timestamp is invalid');
  return date.toISOString();
}

function active(row) {
  return Number(row?.status) === 1 && Number(row?.deleted) === 0;
}

function parseCells(value, label) {
  try {
    const cells = typeof value === 'string' ? JSON.parse(value) : value;
    if (!cells || typeof cells !== 'object' || Array.isArray(cells)) throw new Error('not an object');
    return stable(cells);
  } catch {
    throw new Error(`${label} raw cells are invalid`);
  }
}

function same(value, other) {
  return JSON.stringify(stable(value)) === JSON.stringify(stable(other));
}

function validateIdentityMap(identityMap) {
  if (!Array.isArray(identityMap) || identityMap.length !== EXPECTED.length) {
    throw new Error('Mining independent identity map must contain Helmet, Shirt and Pants');
  }
  const byImage = new Map();
  const byId = new Set();
  for (const identity of identityMap) {
    const image = requiredText(identity?.imageFileTitle, 'Mining identity imageFileTitle');
    if (byImage.has(image) || byId.has(identity.itemSourceId)) throw new Error('Mining independent identity is duplicate');
    const expected = EXPECTED.find(([title]) => title === image);
    if (!expected || Number(identity.itemSourceId) !== expected[1]
        || identity.itemInternalName !== expected[2] || identity.slotGroup !== expected[3]) {
      throw new Error(`Mining independent identity is unknown or mismatched: ${image}`);
    }
    requiredText(identity.itemPageTitle, 'Mining identity itemPageTitle');
    requiredText(identity.itemNameZh, 'Mining identity itemNameZh');
    requiredText(identity.itemHref, 'Mining identity itemHref');
    if (!identity.evidence || !requiredText(identity.evidence.artifactPath, 'Mining identity evidence artifactPath')
        || !HASH.test(identity.evidence.artifactHash) || !Number.isSafeInteger(Number(identity.evidence.revisionId))
        || Number(identity.evidence.revisionId) <= 0) {
      throw new Error(`Mining independent identity evidence is invalid: ${image}`);
    }
    byImage.set(image, identity);
    byId.add(Number(identity.itemSourceId));
  }
  if (EXPECTED.some(([image]) => !byImage.has(image))) throw new Error('Mining independent identity map is incomplete');
  return byImage;
}

function sourceFacts({ source, identityMap, identityCorrections }) {
  if (!source || typeof source !== 'object' || !Array.isArray(source.records)) throw new Error('Mining attribute source records are required');
  const revisionId = positive(source.sourceRevisionId, 'Mining source revisionId');
  const revisionTimestamp = sourceTimestamp(source.sourceRevisionTimestamp);
  requiredText(source.sourcePageTitle, 'Mining source page title');
  const byImage = validateIdentityMap(identityMap);
  const corrected = applyArmorSourceIdentityCorrections({ records: source.records, corrections: identityCorrections });
  const facts = [];
  for (const [image, itemSourceId, itemInternalName, slotGroup] of EXPECTED) {
    const identity = byImage.get(image);
    const rows = corrected.filter((row) => row.imageFileTitle === image);
    if (rows.length !== 1) throw new Error(`Mining source identity must resolve exactly one row: ${image}`);
    const row = rows[0];
    if (row.sourceRevisionTimestamp && sourceTimestamp(row.sourceRevisionTimestamp) !== revisionTimestamp) {
      throw new Error(`Mining source revision drift: ${image}`);
    }
    for (const field of ['itemPageTitle', 'itemNameZh', 'itemHref']) {
      if (row[field] !== identity[field]) throw new Error(`Mining source identity is not corrected: ${image}`);
    }
    if (row.slotGroup !== slotGroup || !Number.isSafeInteger(Number(row.defenseValue)) || Number(row.defenseValue) < 0) {
      throw new Error(`Mining source slot or defense is invalid: ${image}`);
    }
    facts.push({ itemSourceId, itemInternalName, itemNameZh: identity.itemNameZh, itemPageTitle: identity.itemPageTitle,
      itemHref: identity.itemHref, imageFileTitle: image, slotGroup, defenseValue: Number(row.defenseValue),
      rawCells: stable(row.rawCells ?? {}), sourceRevisionId: revisionId, sourceRevisionTimestamp: revisionTimestamp,
      identityEvidence: structuredClone(identity.evidence), identityCorrection: structuredClone(row.sourceIdentityCorrection ?? null) });
  }
  return facts;
}

function activeItemMap(maintItems, facts) {
  if (!Array.isArray(maintItems)) throw new Error('Mining maint items are required');
  const result = new Map();
  for (const fact of facts) {
    const matches = maintItems.filter((row) => active(row) && Number(row.source_id) === fact.itemSourceId
      && row.internal_name === fact.itemInternalName);
    if (matches.length !== 1) throw new Error(`Mining maint item identity is ambiguous: ${fact.itemInternalName}`);
    result.set(fact.itemSourceId, matches[0]);
  }
  return result;
}

function validateRows(rows, label) {
  if (!Array.isArray(rows)) throw new Error(`Mining ${label} rows are required`);
  const ids = new Set();
  const keys = new Set();
  for (const row of rows) {
    if (!positive(row?.id, `Mining ${label} row id`) || ids.has(Number(row.id))) throw new Error(`Mining ${label} row id is duplicate`);
    if (row.record_key != null && (!RECORD_KEY.test(row.record_key) || keys.has(row.record_key))) throw new Error(`Mining ${label} record key is invalid or duplicate`);
    ids.add(Number(row.id));
    if (row.record_key) keys.add(row.record_key);
  }
}

function buildBlockers(facts, maintById, relationRows) {
  const blockers = [];
  const relationByItem = new Map();
  for (const row of relationRows.filter(active)) {
    const list = relationByItem.get(Number(row.item_id)) ?? [];
    list.push(row);
    relationByItem.set(Number(row.item_id), list);
  }
  const duplicate = facts.filter((fact) => (relationByItem.get(fact.itemSourceId) ?? []).length > 1);
  if (duplicate.length) blockers.push({ code: 'duplicate_relation_attribute_owner', itemSourceIds: duplicate.map((fact) => fact.itemSourceId),
    relationRowIds: duplicate.flatMap((fact) => relationByItem.get(fact.itemSourceId).map((row) => Number(row.id))) });
  const defenseConflicts = facts.filter((fact) => Number(maintById.get(fact.itemSourceId).defense_value) !== fact.defenseValue);
  if (defenseConflicts.length) blockers.push({ code: 'maint_item_defense_conflict', items: defenseConflicts.map((fact) => ({
    itemSourceId: fact.itemSourceId, sourceDefense: fact.defenseValue, maintDefense: Number(maintById.get(fact.itemSourceId).defense_value),
  })) });
  const semanticDrift = facts.filter((fact) => (relationByItem.get(fact.itemSourceId) ?? []).some((row) => {
    return Number(row.defense_value) !== fact.defenseValue || !same(parseCells(row.raw_cells_json, 'Mining relation'), fact.rawCells);
  }));
  if (semanticDrift.length) blockers.push({ code: 'relation_attribute_semantics_drift', itemSourceIds: semanticDrift.map((fact) => fact.itemSourceId) });
  const missing = facts.filter((fact) => !(relationByItem.get(fact.itemSourceId) ?? []).length);
  if (missing.length) blockers.push({ code: 'missing_relation_attribute_owner', itemSourceIds: missing.map((fact) => fact.itemSourceId) });
  return blockers;
}

/** Build a source and identity bound, no-write Mining attribute review candidate. */
export function buildArmorMiningAttributeCandidate(input = {}) {
  const required = ['source', 'identityMap', 'identityCorrections', 'maintItems', 'currentMaintRows', 'currentRelationRows', 'currentProjectionRows'];
  if (!input || typeof input !== 'object' || required.some((key) => !Object.hasOwn(input, key))) {
    throw new Error('Mining attribute candidate requires source, identity and complete snapshots');
  }
  const facts = sourceFacts(input);
  validateRows(input.currentMaintRows, 'maint attribute');
  validateRows(input.currentRelationRows, 'relation attribute');
  validateRows(input.currentProjectionRows, 'projection attribute');
  const maintById = activeItemMap(input.maintItems, facts);
  const blockers = buildBlockers(facts, maintById, input.currentRelationRows);
  const body = {
    schemaVersion: 'armor-mining-attribute-candidate/v1', executable: false, databaseWrites: false, applyAllowed: false,
    source: { sourcePageTitle: input.source.sourcePageTitle, sourceRevisionId: positive(input.source.sourceRevisionId, 'Mining source revisionId'),
      sourceRevisionTimestamp: sourceTimestamp(input.source.sourceRevisionTimestamp) },
    sourceFacts: facts, current: { maintItems: structuredClone(input.maintItems), maintRows: structuredClone(input.currentMaintRows),
      relationRows: structuredClone(input.currentRelationRows), projectionRows: structuredClone(input.currentProjectionRows) },
    changes: { maint: [], relation: [], projection: [] },
    acceptance: { status: blockers.length ? 'blocked' : 'owner-review-required', blockers,
      ownerDecision: { status: 'required', scope: 'Mining attribute relation owner and source/item conflicts' } },
  };
  return { ...body, candidateSha256: digest(body) };
}

export const ARMOR_MINING_ATTRIBUTE_EXPECTED_ITEMS = Object.freeze(EXPECTED.map(([imageFileTitle, itemSourceId, itemInternalName, slotGroup]) => ({
  imageFileTitle, itemSourceId, itemInternalName, slotGroup,
})));
