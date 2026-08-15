import { createHash } from 'node:crypto';

import { buildBaseEntityRelations } from './base-entity-processor.mjs';
import { buildProjectionPayload } from './projection-sync.mjs';
import {
  isManagedImagePath,
  resolveManagedImageUrlPrefixes,
} from './managed-image-url-policy.mjs';

export const ITEM_CANONICAL_BASE_ENTITY_RESTORATION_OPERATION_ID =
  'canonical-item-base-entity-restoration';

export const ITEM_CANONICAL_BASE_ENTITY_RESTORATION_KEYS = Object.freeze([
  'AntlionEggs',
  'BoneWhip',
  'RoninShirt',
  'TVHeadPants',
  'TimelessTravelerHood',
]);

export const ITEM_CANONICAL_BASE_ENTITY_RESTORATION_IDS = Object.freeze([
  5067,
  5074,
  5049,
  5063,
  5051,
]);
export const ITEM_CANONICAL_BASE_ENTITY_RESTORATION_ATTEMPT_ROOT_PREFIX =
  'reports/authorization/canonical/item-canonical-base-entity-restoration';

const RESTORATION_ID_BY_KEY = new Map(ITEM_CANONICAL_BASE_ENTITY_RESTORATION_KEYS.map((key, index) => [
  key,
  ITEM_CANONICAL_BASE_ENTITY_RESTORATION_IDS[index],
]));

const LEGACY_OCCUPANT_BY_ID = new Map([
  [5067, 'FestiveTopHat'],
  [5074, 'Wiesnbrau'],
  [5049, 'HeartArrow'],
  [5063, 'TurkeyFeather'],
  [5051, 'ValentineRing'],
]);

const ITEM_LANDING_SOURCE = Object.freeze({
  id: 6470,
  key: 'wiki.module.iteminfo',
});

export function buildItemCanonicalBaseEntityRestorationProposal(options = {}) {
  const records = assertExactStandardizedRecords(options.standardized);
  const legacyMaintRows = assertLegacyRows('maint', options.legacyMaintRows, 'sourceId');
  const legacyRelationRows = assertLegacyRows('relation', options.legacyRelationRows, 'sourceId');
  const legacyProjectionRows = assertLegacyRows('projection', options.legacyProjectionRows, 'id');
  const legacyProjectileAudits = assertLegacyRows(
    'item projectile audit',
    options.legacyProjectileAudits,
    'itemSourceId',
  );
  assertNoProtectedReferences(options.protectedReferences);
  const imagesByKey = assertManagedPrimaryImages(
    options.managedImages,
    records,
    options.managedImageUrlPrefixes ?? resolveManagedImageUrlPrefixes(),
  );
  const maintRows = records.map((record) => buildMaintRow({
    record,
    standardized: options.standardized,
    sourceBytesSha256: options.sourceBytesSha256,
  }));
  const relationRows = buildBaseEntityRelations({
    maintItems: maintRows.map(toMaintDbRow),
  }).relationItems.map((row, index) => ({
    ...row,
    rareRaw: records[index].rarityId,
    valueRaw: records[index].economy?.buy ?? null,
    status: 1,
    deleted: 0,
  }));
  const projectionRows = buildProjectionPayload({
    relationItems: relationRows,
    relationItemImages: records.map((record) => imagesByKey.get(record.internalName)),
    managedImageUrlPrefixes: options.managedImageUrlPrefixes ?? resolveManagedImageUrlPrefixes(),
  }).projectionItems.map((row, index) => ({
    ...row,
    rarityId: records[index].rarityId ?? null,
  }));
  const attemptId = deriveItemCanonicalBaseEntityRestorationAttemptId(options.proposalAuthorization?.decisionIdentity);
  const attemptRoot = `${ITEM_CANONICAL_BASE_ENTITY_RESTORATION_ATTEMPT_ROOT_PREFIX}/${attemptId}`;
  const proposal = {
    schemaVersion: 1,
    contractVersion: 'item-canonical-base-entity-restoration-v1',
    operationId: ITEM_CANONICAL_BASE_ENTITY_RESTORATION_OPERATION_ID,
    generatedAt: requireTimestamp(options.generatedAt, 'generatedAt'),
    expiresAt: requireTimestamp(options.expiresAt, 'expiresAt'),
    apply: false,
    attemptId,
    attemptRoot,
    keys: [...ITEM_CANONICAL_BASE_ENTITY_RESTORATION_KEYS],
    sourceIds: [...ITEM_CANONICAL_BASE_ENTITY_RESTORATION_IDS],
    target: assertTarget(options.target),
    proposalAuthorization: assertProposalAuthorization(options.proposalAuthorization),
    standardizedSource: {
      path: 'data/standardized/items.standardized.json',
      sha256: requireSha256(options.sourceBytesSha256, 'standardized source hash'),
      schemaVersion: requireText(options.standardized?.schemaVersion, 'standardized schemaVersion'),
      generatedAt: requireTimestamp(options.standardized?.generatedAt, 'standardized generatedAt'),
      upstreamMeta: normalizeUpstreamMeta(options.standardized?.upstreamMeta),
    },
    targetCounts: {
      maintItems: 5,
      relationItems: 5,
      projectionItems: 5,
      itemProjectileAudits: 5,
    },
    deleteCounts: {
      maintItems: 5,
      relationItems: 5,
      projectionItems: 5,
      itemProjectileAudits: 5,
    },
    snapshotPath: `${attemptRoot}/snapshot.json`,
    proposalPath: `${attemptRoot}/proposal.json`,
    inputPath: `${attemptRoot}/input.json`,
    maintRows,
    relationRows,
    projectionRows,
    managedImages: records.map((record) => imagesByKey.get(record.internalName)),
    legacyMaintRows,
    legacyRelationRows,
    legacyProjectionRows,
    legacyProjectileAudits,
    protectedReferences: [],
  };
  return {
    ...proposal,
    standardizedRowsSha256: hashCanonicalJson(records),
    maintRowsSha256: hashCanonicalJson(maintRows),
    relationRowsSha256: hashCanonicalJson(relationRows),
    projectionRowsSha256: hashCanonicalJson(projectionRows),
    managedImagesSha256: hashCanonicalJson(proposal.managedImages),
    legacyMaintRowsSha256: hashCanonicalJson(legacyMaintRows),
    legacyRelationRowsSha256: hashCanonicalJson(legacyRelationRows),
    legacyProjectionRowsSha256: hashCanonicalJson(legacyProjectionRows),
    legacyProjectileAuditsSha256: hashCanonicalJson(legacyProjectileAudits),
  };
}

export function deriveItemCanonicalBaseEntityRestorationAttemptId(decisionIdentity) {
  return createHash('sha256').update(requireText(decisionIdentity, 'decisionIdentity'), 'utf8').digest('hex');
}

export function buildItemCanonicalBaseEntityRestorationAttemptPaths(decisionIdentity) {
  const attemptId = deriveItemCanonicalBaseEntityRestorationAttemptId(decisionIdentity);
  const attemptRoot = `${ITEM_CANONICAL_BASE_ENTITY_RESTORATION_ATTEMPT_ROOT_PREFIX}/${attemptId}`;
  return Object.freeze({
    attemptId, attemptRoot,
    proposalReadOwnerInputPath: `${attemptRoot}/proposal-read.owner-input.json`,
    snapshotPath: `${attemptRoot}/snapshot.json`, proposalPath: `${attemptRoot}/proposal.json`,
    inputPath: `${attemptRoot}/input.json`, manifestPath: `${attemptRoot}/execution-manifest.json`,
    requestPath: `${attemptRoot}/request.json`, packetPath: `${attemptRoot}/packet.json`,
    permitPath: `${attemptRoot}/permit.json`, resultPath: `${attemptRoot}/result.json`,
  });
}

export function buildItemCanonicalBaseEntityRestorationInputContract(proposal) {
  if (proposal?.operationId !== ITEM_CANONICAL_BASE_ENTITY_RESTORATION_OPERATION_ID || proposal?.apply !== false) {
    throw new Error('canonical restoration proposal is required');
  }
  return Object.freeze({ ...proposal, apply: true });
}

export function hashCanonicalJson(value) {
  return `sha256:${createHash('sha256').update(stableJson(value)).digest('hex')}`;
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function assertExactStandardizedRecords(standardized) {
  if (!standardized || standardized.entity !== 'items' || !Array.isArray(standardized.records)) {
    throw new Error('approved standardized items payload is required');
  }
  const records = standardized.records;
  const candidates = records.filter((record) => RESTORATION_ID_BY_KEY.has(record?.internalName)
    || ITEM_CANONICAL_BASE_ENTITY_RESTORATION_IDS.includes(Number(record?.id)));
  if (candidates.length !== ITEM_CANONICAL_BASE_ENTITY_RESTORATION_KEYS.length) {
    throw new Error('exactly five approved standardized records are required');
  }
  const byKey = new Map(candidates.map((record) => [record.internalName, record]));
  const ordered = ITEM_CANONICAL_BASE_ENTITY_RESTORATION_KEYS.map((key) => byKey.get(key));
  if (ordered.some((record) => record == null)
      || ordered.some((record) => Number(record.id) !== RESTORATION_ID_BY_KEY.get(record.internalName))) {
    throw new Error('approved standardized records must match the exact key and ID set');
  }
  return ordered;
}

function assertLegacyRows(layer, rows, idKey) {
  if (!Array.isArray(rows) || rows.length !== ITEM_CANONICAL_BASE_ENTITY_RESTORATION_IDS.length) {
    throw new Error(`exactly five legacy ${layer} rows are required`);
  }
  const normalized = rows.map((row) => ({
    sourceId: Number(row?.[idKey] ?? row?.source_id ?? row?.id ?? row?.item_source_id),
    internalName: row?.internalName ?? row?.internal_name ?? row?.itemInternalName ?? row?.item_internal_name,
    recordKey: row?.recordKey ?? row?.record_key ?? null,
    sourcePage: row?.sourcePage ?? row?.source_page ?? null,
    terrariaVersion: row?.terrariaVersion ?? row?.terraria_version ?? null,
    rawJson: row?.rawJson ?? row?.raw_json ?? null,
    status: Number(row?.status),
    deleted: Number(row?.deleted),
  }));
  const seen = new Set();
  for (const row of normalized) {
    const expectedName = LEGACY_OCCUPANT_BY_ID.get(row.sourceId);
    if (!expectedName || row.internalName !== expectedName || seen.has(row.sourceId)) {
      throw new Error(`legacy ${layer} identity does not match the approved collision scope`);
    }
    seen.add(row.sourceId);
    if (row.status !== 1 || row.deleted !== 0) {
      throw new Error(`legacy ${layer} row is not active`);
    }
    if (layer === 'item projectile audit' && !isLegacySourcePage(row.sourcePage)) {
      throw new Error(`legacy ${layer} row is missing its historical source page`);
    }
    if (layer !== 'projection' && layer !== 'item projectile audit' && (row.terrariaVersion !== 'legacy'
        || !isLegacySourcePage(row.sourcePage)
        || !legacyMarker(row.rawJson))) {
      throw new Error(`legacy ${layer} row is missing its historical provenance markers`);
    }
  }
  if (seen.size !== ITEM_CANONICAL_BASE_ENTITY_RESTORATION_IDS.length) {
    throw new Error(`exactly five legacy ${layer} rows are required`);
  }
  return normalized;
}

function legacyMarker(value) {
  try {
    return JSON.parse(String(value ?? '')).legacyNpcShopItem === true;
  } catch {
    return false;
  }
}

function isLegacySourcePage(value) {
  const text = String(value ?? '');
  if (text.includes('旧版')) return true;
  try {
    return decodeURIComponent(text).includes('旧版');
  } catch {
    return false;
  }
}

function assertNoProtectedReferences(rows) {
  if (!Array.isArray(rows)) throw new Error('protected consumer reference scan is required');
  if (rows.length > 0) throw new Error('protected consumer references block canonical reconciliation');
}

function assertManagedPrimaryImages(rows, records, managedImageUrlPrefixes) {
  if (!Array.isArray(rows)) throw new Error('managed image evidence is required');
  const byKey = new Map();
  for (const row of rows) {
    const key = row?.itemInternalName ?? row?.item_internal_name;
    if (!RESTORATION_ID_BY_KEY.has(key)) continue;
    if (Number(row?.status) !== 1 || Number(row?.deleted) !== 0 || Number(row?.isPrimary ?? row?.is_primary) !== 1) continue;
    const cachedUrl = row?.cachedUrl ?? row?.cached_url;
    if (!isManagedImagePath(cachedUrl, managedImageUrlPrefixes)) {
      throw new Error(`managed image evidence is invalid for ${key}`);
    }
    if (byKey.has(key)) throw new Error(`managed image evidence must have one primary row for ${key}`);
    byKey.set(key, {
      recordKey: requireText(row?.recordKey ?? row?.record_key, `managed image recordKey for ${key}`),
      itemInternalName: key,
      cachedUrl: String(cachedUrl).trim(),
      role: row?.role ?? null,
      isPrimary: 1,
      status: 1,
      deleted: 0,
    });
  }
  if (byKey.size !== records.length) throw new Error('managed image evidence must cover every approved record');
  return byKey;
}

function buildMaintRow({ record, standardized, sourceBytesSha256 }) {
  const meta = normalizeUpstreamMeta(standardized?.upstreamMeta);
  const flags = { categoryCode: record.categoryCode ?? null };
  return {
    sourceId: Number(record.id),
    internalName: record.internalName,
    englishName: record.name ?? record.internalName,
    nameZh: record.nameZh ?? null,
    sourceProvider: meta.sourceProvider,
    sourcePage: meta.sourcePage,
    sourceRevisionTimestamp: meta.sourceRevisionTimestamp,
    landingSourceId: ITEM_LANDING_SOURCE.id,
    landingSourceKey: ITEM_LANDING_SOURCE.key,
    landingSourcePage: meta.sourcePage,
    landingContentHash: requireSha256(sourceBytesSha256, 'standardized source hash').slice('sha256:'.length),
    landingFetchedAt: meta.fetchedAt,
    landingParsedAt: standardized.generatedAt,
    moduleGeneratedAt: meta.moduleGeneratedAt,
    terrariaVersion: meta.wikiVersion,
    majorValue: nullableNumber(record.economy?.buy),
    combatValue: nullableNumber(record.stats?.damage),
    defenseValue: nullableNumber(record.stats?.defense),
    useTime: nullableNumber(record.stats?.useTime),
    stackSize: nullableNumber(record.stack?.stackSize),
    width: nullableNumber(record.stats?.width),
    height: nullableNumber(record.stats?.height),
    flagsJson: stableJson(flags),
    rawJson: stableJson(record),
    status: Number(record.status ?? 1),
    deleted: 0,
  };
}

function toMaintDbRow(row) {
  return {
    source_id: row.sourceId,
    internal_name: row.internalName,
    english_name: row.englishName,
    name_zh: row.nameZh,
    source_provider: row.sourceProvider,
    source_page: row.sourcePage,
    source_revision_timestamp: row.sourceRevisionTimestamp,
    landing_source_id: row.landingSourceId,
    landing_source_key: row.landingSourceKey,
    landing_content_hash: row.landingContentHash,
    module_generated_at: row.moduleGeneratedAt,
    terraria_version: row.terrariaVersion,
    major_value: row.majorValue,
    combat_value: row.combatValue,
    defense_value: row.defenseValue,
    use_time: row.useTime,
    stack_size: row.stackSize,
    width: row.width,
    height: row.height,
    flags_json: row.flagsJson,
    raw_json: row.rawJson,
  };
}

function normalizeUpstreamMeta(value) {
  const source = requireText(value?.source, 'standardized upstream source');
  const separator = source.indexOf(':');
  if (separator <= 0) throw new Error('standardized upstream source must contain provider and page');
  return {
    sourceProvider: source.slice(0, separator),
    sourcePage: requireText(value?.sourcePageTitle ?? source.slice(separator + 1), 'standardized upstream sourcePageTitle'),
    sourceRevisionTimestamp: requireTimestamp(value?.sourceRevisionTimestamp, 'standardized upstream sourceRevisionTimestamp'),
    fetchedAt: requireTimestamp(value?.fetchedAt, 'standardized upstream fetchedAt'),
    moduleGeneratedAt: requireText(value?.moduleGeneratedAt, 'standardized upstream moduleGeneratedAt'),
    wikiVersion: requireText(value?.wikiVersion, 'standardized upstream wikiVersion'),
  };
}

function assertTarget(value) {
  if (!value || typeof value !== 'object') throw new Error('target is required');
  const port = Number(value.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('target port is invalid');
  return {
    host: requireText(value.host, 'target host'),
    port,
    serverUuid: requireText(value.serverUuid, 'target serverUuid'),
    databases: {
      maint: requireText(value.databases?.maint, 'target maint database'),
      relation: requireText(value.databases?.relation, 'target relation database'),
    },
  };
}

function assertProposalAuthorization(value) {
  if (!value || typeof value !== 'object') throw new Error('proposal authorization is required');
  return {
    decisionIdentity: requireText(value.decisionIdentity, 'proposal authorization decisionIdentity'),
    path: requireText(value.path, 'proposal authorization path'),
    sha256: requireSha256(value.sha256, 'proposal authorization hash'),
    authorizationHash: requireSha256(value.authorizationHash, 'proposal authorization content hash'),
  };
}

function nullableNumber(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function requireTimestamp(value, label) {
  const text = requireText(value, label);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${label} must be an ISO timestamp`);
  return text;
}

function requireSha256(value, label) {
  const text = requireText(value, label);
  if (!/^sha256:[a-f0-9]{64}$/.test(text)) throw new Error(`${label} must be a SHA-256 digest`);
  return text;
}
