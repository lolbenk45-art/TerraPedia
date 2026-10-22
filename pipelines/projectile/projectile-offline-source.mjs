import { createHash } from 'node:crypto';
import fs from 'node:fs';

import { buildDependencyManifest } from '../automation/eight-domain-dependency-seeder.mjs';
import { buildSecondaryRelations } from '../relation/secondary-relation-processor.mjs';

export const REQUIRED_PROJECTILE_COUNT = 1111;
export const PROJECTILE_SOURCE_KEY = 'wiki.module.projectileinfo';
const HASH = /^sha256:[a-f0-9]{64}$/;

export const PROJECTILE_MAINT_ITEM_COLUMNS = Object.freeze([
  'id', 'source_id', 'internal_name', 'english_name', 'name_zh', 'source_provider', 'source_page',
  'source_revision_timestamp', 'landing_source_id', 'landing_source_key', 'landing_source_page',
  'landing_content_hash', 'landing_fetched_at', 'landing_parsed_at', 'module_generated_at',
  'terraria_version', 'major_value', 'combat_value', 'defense_value', 'use_time', 'stack_size',
  'width', 'height', 'flags_json', 'raw_json', 'status', 'deleted',
]);

export const PROJECTILE_MAINT_NPC_COLUMNS = PROJECTILE_MAINT_ITEM_COLUMNS;

function hashBytes(value) {
  return 'sha256:' + createHash('sha256').update(value).digest('hex');
}

function hashJson(value) {
  return hashBytes(Buffer.from(JSON.stringify(value), 'utf8'));
}

function readJson(filePath, label) {
  const bytes = fs.readFileSync(filePath);
  try {
    return { bytes, value: JSON.parse(bytes.toString('utf8')) };
  } catch (error) {
    throw new Error(label + ' is not valid JSON: ' + filePath, { cause: error });
  }
}

function requireProjectileIdentity(value) {
  const pageId = Number(value?.pageId);
  const revisionTimestamp = String(value?.revisionTimestamp ?? '').trim();
  const revisionId = value?.revisionId == null ? null : Number(value.revisionId);
  if (!Number.isSafeInteger(pageId) || pageId <= 0 || !revisionTimestamp || !Number.isFinite(Date.parse(revisionTimestamp))) {
    throw new Error('Projectile source manifest requires a valid page ID and revision timestamp');
  }
  if (revisionId != null && (!Number.isSafeInteger(revisionId) || revisionId <= 0)) {
    throw new Error('Projectile source manifest revision ID is invalid');
  }
  return Object.freeze({ pageId, revisionId, revisionTimestamp });
}

export function buildLocalProjectileSourceBinding({
  standardizedPath,
  viewMetaPath,
  wikiManifestRecord,
} = {}) {
  if (wikiManifestRecord?.sourceKey !== PROJECTILE_SOURCE_KEY) {
    throw new Error('Projectile local source requires the bound wiki.module.projectileinfo record');
  }
  const standardizedFile = readJson(standardizedPath, 'standardized Projectile source');
  const viewMetaFile = readJson(viewMetaPath, 'Projectile view metadata');
  const records = standardizedFile.value?.records;
  if (standardizedFile.value?.entity !== 'projectiles' || !Array.isArray(records)
      || records.length !== REQUIRED_PROJECTILE_COUNT || viewMetaFile.value?.totalRecords !== REQUIRED_PROJECTILE_COUNT) {
    throw new Error('Projectile local source and view metadata must each bind exactly 1,111 records');
  }
  const ids = new Set();
  const names = new Set();
  for (const [index, record] of records.entries()) {
    const id = Number(record?.id);
    const internalName = String(record?.internalName ?? '').trim();
    if (!Number.isSafeInteger(id)) throw new Error('Projectile record ' + index + ' has no stable numeric source ID');
    if (ids.has(id)) throw new Error('Projectile local source has duplicate stable Projectile IDs: ' + id);
    if (!internalName) throw new Error('Projectile record ' + index + ' has no internalName');
    if (names.has(internalName.toLowerCase())) throw new Error('Projectile local source has duplicate internalName: ' + internalName);
    ids.add(id);
    names.add(internalName.toLowerCase());
  }
  const sourceIdentity = requireProjectileIdentity(wikiManifestRecord);
  const localTimestamp = standardizedFile.value.upstreamMeta?.sourceRevisionTimestamp ?? null;
  if (localTimestamp !== sourceIdentity.revisionTimestamp) {
    throw new Error('Projectile standardized source timestamp differs from the prior Wiki manifest identity');
  }
  const sortedIds = [...ids].sort((left, right) => left - right);
  return Object.freeze({
    sourceKey: PROJECTILE_SOURCE_KEY,
    mode: 'local',
    recordCount: records.length,
    stableIdCount: ids.size,
    standardizedPath,
    viewMetaPath,
    standardizedSha256: hashBytes(standardizedFile.bytes),
    viewMetaSha256: hashBytes(viewMetaFile.bytes),
    stableIdsSha256: hashJson(sortedIds),
    sourceIdentity,
    sourceManifestContentHash: wikiManifestRecord.contentHash ?? null,
    sourceRevisionTimestamp: localTimestamp,
    wikiVersion: standardizedFile.value.upstreamMeta?.wikiVersion ?? null,
  });
}

export function buildProjectileOfflineSourceDecision({ localBinding, authorization, outageEvidence } = {}) {
  if (authorization !== 'user-directed-local-offline') {
    throw new Error('Projectile offline source requires explicit user-directed local-offline authorization');
  }
  if (!localBinding || localBinding.sourceKey !== PROJECTILE_SOURCE_KEY
      || localBinding.recordCount !== REQUIRED_PROJECTILE_COUNT
      || localBinding.stableIdCount !== REQUIRED_PROJECTILE_COUNT
      || !HASH.test(localBinding.standardizedSha256 ?? '')) {
    throw new Error('Projectile offline source requires a complete hash-bound 1,111-record local source');
  }
  if (outageEvidence?.status !== 'probe_unavailable'
      || outageEvidence.actionId !== 'domain-source-npcs'
      || outageEvidence.phase !== 'wiki-revision-probe'
      || !String(outageEvidence.artifactPath ?? '').startsWith('.local/tmp/')
      || !HASH.test(outageEvidence.artifactSha256 ?? '')
      || !String(outageEvidence.reason ?? '').trim()) {
    throw new Error('Projectile offline source requires private hash-bound Wiki outage evidence');
  }
  return Object.freeze({
    sourceMode: 'local-offline-authorized',
    wikiUnchanged: false,
    recordCount: localBinding.recordCount,
    authorization,
    localBinding,
    outageEvidence: Object.freeze({
      actionId: outageEvidence.actionId,
      phase: outageEvidence.phase,
      artifactPath: outageEvidence.artifactPath,
      artifactSha256: outageEvidence.artifactSha256,
      reason: outageEvidence.reason,
    }),
  });
}

function sourceId(value, label) {
  const id = Number(value);
  if (!Number.isSafeInteger(id)) throw new Error(label + ' has an invalid source ID');
  return id;
}

function canonicalHash(value) {
  return hashJson(value);
}

export function buildProjectileSourceRelationEvidence({ projectiles, itemRows, npcRows } = {}) {
  if (!Array.isArray(projectiles) || !Array.isArray(itemRows) || !Array.isArray(npcRows)) {
    throw new Error('Projectile relation inventory requires Projectile and Item/NPC row arrays');
  }
  const projectileIds = new Set(projectiles.map((row, index) => sourceId(row?.id, 'Projectile record ' + index)));
  if (projectileIds.size !== projectiles.length) throw new Error('Projectile source IDs are not unique');
  const maintainedProjectiles = projectiles.map((row) => ({
    source_id: Number(row.id),
    internal_name: row.internalName,
    english_name: row.name,
    name: row.name,
  }));
  const inventory = buildSecondaryRelations({
    maintProjectileRows: maintainedProjectiles,
    maintItemRows: itemRows,
    maintNpcRows: npcRows,
  });
  const explicitItemAudits = inventory.itemProjectileAudits.filter((row) => row.auditStatus !== 'crawl_candidate');
  const explicitNpcAudits = inventory.npcProjectileAudits.filter((row) => row.auditStatus !== 'crawl_candidate');
  const itemSourceIds = [...new Set(explicitItemAudits.map((row) => sourceId(row.itemSourceId, 'Projectile Item relation')))]
    .sort((left, right) => left - right);
  const npcSourceIds = [...new Set(explicitNpcAudits.map((row) => sourceId(row.npcSourceId, 'Projectile NPC relation')))]
    .sort((left, right) => left - right);
  const unresolvedItemAudits = explicitItemAudits.filter((row) => row.auditStatus === 'projectile_missing');
  const unresolvedNpcAudits = explicitNpcAudits.filter((row) => row.auditStatus === 'projectile_missing');
  const unresolvedItemSamples = unresolvedItemAudits
    .slice(0, 12)
    .map((row) => ({
      itemSourceId: Number(row.itemSourceId),
      itemInternalName: row.itemInternalName,
      projectileSourceId: Number(row.projectileSourceId),
      sourceField: row.availableFieldsJson ? JSON.parse(row.availableFieldsJson).sourceField : null,
    }));
  const unresolvedNpcSamples = unresolvedNpcAudits
    .slice(0, 12)
    .map((row) => ({
      npcSourceId: Number(row.npcSourceId),
      npcInternalName: row.npcInternalName,
      projectileSourceId: Number(row.projectileSourceId),
    }));
  const itemRelations = inventory.itemProjectileRelations.map((row) => ({
    sourceId: Number(row.itemSourceId),
    internalName: row.itemInternalName,
    projectileSourceId: Number(row.projectileSourceId),
    projectileInternalName: row.projectileInternalName,
    sourceField: row.sourceField,
    sourceValue: row.sourceValue,
  }));
  const npcRelations = inventory.npcProjectileRelations.map((row) => ({
    sourceId: Number(row.npcSourceId),
    internalName: row.npcInternalName,
    projectileSourceId: Number(row.projectileSourceId),
    projectileInternalName: row.projectileInternalName,
    sourceField: row.sourceField,
    sourceValue: row.sourceValue,
  }));
  const explicitRelations = [
    ...itemRelations.map((row) => ({ sourceKind: 'item', ...row })),
    ...npcRelations.map((row) => ({ sourceKind: 'npc', ...row })),
  ];
  const body = {
    schemaVersion: 1,
    manifestKind: 'projectile_explicit_source_relation_manifest',
    relationSourcePolicy: 'explicit-raw-json-fields-only',
    projectiles: {
      recordCount: projectiles.length,
      stableIdsSha256: canonicalHash([...projectileIds].sort((left, right) => left - right)),
    },
    sourceInventory: {
      maintainedItemRows: itemRows.length,
      maintainedNpcRows: npcRows.length,
      itemRowsWithExplicitProjectileField: explicitItemAudits.length,
      npcRowsWithExplicitProjectileField: explicitNpcAudits.length,
    },
    dependencies: {
      itemSourceIds,
      npcSourceIds,
      itemRowsSha256: canonicalHash(itemRows
        .filter((row) => itemSourceIds.includes(Number(row.source_id)))
        .map((row) => ({ source_id: Number(row.source_id), raw_json: row.raw_json }))),
      npcRowsSha256: canonicalHash(npcRows
        .filter((row) => npcSourceIds.includes(Number(row.source_id)))
        .map((row) => ({ source_id: Number(row.source_id), raw_json: row.raw_json }))),
    },
    relations: {
      item: itemRelations,
      npc: npcRelations,
    },
    explicitRelations,
    counts: {
      itemRelationCount: inventory.itemProjectileRelations.length,
      itemExplicitAuditCount: explicitItemAudits.length,
      unresolvedItemRelationCount: unresolvedItemAudits.length,
      npcRelationCount: inventory.npcProjectileRelations.length,
      npcExplicitAuditCount: explicitNpcAudits.length,
      unresolvedNpcRelationCount: unresolvedNpcAudits.length,
      itemRowsWithoutProjectileField: itemRows.length - explicitItemAudits.length,
      npcRowsWithoutProjectileField: npcRows.length - explicitNpcAudits.length,
    },
    unresolvedItemSamples,
    unresolvedNpcSamples,
  };
  return Object.freeze({ ...body, manifestSha256: hashJson(body) });
}

export function buildProjectileDependencyManifest({
  runId,
  runKey,
  databases,
  itemRows,
  npcRows = [],
  relationSourceIds,
  npcRelationSourceIds = [],
} = {}) {
  const exactItemRows = [...itemRows].sort((left, right) => Number(left.source_id) - Number(right.source_id));
  const exactNpcRows = [...npcRows].sort((left, right) => Number(left.source_id) - Number(right.source_id));
  const assertExactIds = (rows, expected, label) => {
    if (rows.length !== expected.length
        || JSON.stringify(rows.map((row) => Number(row.source_id))) !== JSON.stringify([...expected].sort((a, b) => a - b))) {
      throw new Error('Projectile ' + label + ' dependency rows do not match the explicit relation source IDs');
    }
  };
  assertExactIds(exactItemRows, relationSourceIds ?? [], 'Item');
  assertExactIds(exactNpcRows, npcRelationSourceIds, 'NPC');
  const dependency = ({ id, purpose, table, rows, columns }) => ({
    id,
    purpose,
    source: { database: 'terria_v1_maint', table },
    target: { database: databases.maint, table },
    keyColumns: ['source_id'],
    keyValues: rows.map((row) => ({ source_id: Number(row.source_id) })),
    columns: [...columns],
    rowHashes: [],
    expectedRowCount: rows.length,
  });
  const dependencies = [];
  const sourceRows = {};
  if (exactItemRows.length > 0) {
    const id = 'projectile-explicit-item-projectile-dependencies';
    dependencies.push(dependency({
      id,
      purpose: id,
      table: 'maint_items',
      rows: exactItemRows,
      columns: PROJECTILE_MAINT_ITEM_COLUMNS,
    }));
    sourceRows[id] = exactItemRows;
  }
  if (exactNpcRows.length > 0) {
    const id = 'projectile-explicit-npc-projectile-dependencies';
    dependencies.push(dependency({
      id,
      purpose: id,
      table: 'maint_npcs',
      rows: exactNpcRows,
      columns: PROJECTILE_MAINT_NPC_COLUMNS,
    }));
    sourceRows[id] = exactNpcRows;
  }
  if (dependencies.length === 0) throw new Error('Projectile dependency manifest has no explicit Item or NPC relation rows');
  return buildDependencyManifest({
    manifest: { schemaVersion: 1, domain: 'projectiles', runId, runKey, dependencies },
    sourceRows,
  });
}
