#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  canonicalServerFingerprint,
  hashCanonicalServerFingerprint,
} from '../automation/automation-database-contract.mjs';
import {
  consumeAuthorizedOperationDispatchPermit,
  loadAuthorizedOperationContext,
} from '../automation/authorized-operation-context.mjs';
import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { upsertLandingRow } from '../landing/import-source-dataset-landings.mjs';
import { buildItemSourceRelations } from '../relation/item-source-relation-processor.mjs';

export const NPC_EXTERNAL_RELATION_SCOPE_OPERATION_ID = 'canonical-npc-external-relation-scope-apply';
export const NPC_EXTERNAL_RELATION_SCOPE_BUNDLE_PATH = 'reports/runtime/local-data-chain-closure/20260819/accepted-projection/npc-item-relations.accepted.bundle.json';
export const NPC_EXTERNAL_RELATION_SCOPE_PREVIEW_PATH = 'reports/runtime/local-data-chain-closure/20260819/accepted-projection/npc-relation-owner-scope-preview.json';
export const NPC_EXTERNAL_RELATION_SCOPE_PROJECTION_PATH = 'reports/runtime/local-data-chain-closure/20260819/npc-external-relation-scope-accepted-quarantine-projection.json';
export const NPC_EXTERNAL_RELATION_SCOPE_BINDING = Object.freeze({
  operationId: NPC_EXTERNAL_RELATION_SCOPE_OPERATION_ID,
  scopeSha256: 'sha256:759c022a34a243ed17c93630727bb07d965b95064ed296740ecdf5d01cc6ca39',
  bundleSha256: 'sha256:febde906014e59a8cbbcec8d04bf6083c1562d94b9fdcca5cc0a29c61bde6f05',
  previewSha256: 'sha256:090652680bb566c6ff670dfe2807fc7378e2d0daa286416304638232316a363d',
  projectionSha256: 'sha256:2e499d5b089a83f9654828a69113c1994a71d52a026cf6ea377b094be0dec6a4',
  recordCount: 1071,
  lootRecords: 663,
  shopRecords: 408,
  acceptedSourceFactCount: 1071,
  acceptedSourceDetailCount: 1071,
  acceptedLootRelationCount: 655,
  acceptedShopRelationCount: 408,
  quarantinedFactCount: 198,
  unresolvedCandidateCount: 357,
  unresolvedCandidates: Object.freeze({ npc_item_relation: 116, npc_projectile_relation: 241 }),
  writeTargets: Object.freeze([
    'landing.npc_item_relations_bundle_raw',
    'maint.maint_item_sources',
    'maint.maint_npc_crawler_facts',
    'relation.item_source_facts',
    'relation.item_source_details',
    'relation.item_npc_loot_relations',
    'relation.item_npc_shop_relations',
    'local.npc_loot_entries',
    'local.npc_shop_entries',
  ]),
  forbidden: Object.freeze(['direct_sql', 'image_download', 'CenxsWings', 'boss_loot', 'database_apply']),
});

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const RELATION_TYPES = new Set(['loot', 'shop']);
const CANDIDATE_DOMAINS = new Set(['npc_item_relation', 'npc_projectile_relation']);
const CANDIDATE_ACTION = 'crawl_npc_page';
const TARGET_SET = new Set(NPC_EXTERNAL_RELATION_SCOPE_BINDING.writeTargets);
const FORBIDDEN_TEXT = /cenxswings|boss[_ -]?loot/i;

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requireText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function sha256Bytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function sha256Json(value) {
  return sha256Bytes(Buffer.from(JSON.stringify(value), 'utf8'));
}

function stableMaintRecordKey(externalRecordKey) {
  return createHash('sha256').update(JSON.stringify({
    operationId: NPC_EXTERNAL_RELATION_SCOPE_OPERATION_ID,
    externalRecordKey: requireText(externalRecordKey, 'NPC external relation external recordKey'),
  })).digest('hex');
}

function readJsonArtifact(repoRoot, relativePath, expectedHash, label) {
  const root = path.resolve(repoRoot);
  const normalized = requireText(relativePath, `${label} path`).replaceAll('\\', '/');
  if (path.isAbsolute(normalized) || path.posix.normalize(normalized) !== normalized
      || normalized.split('/').includes('..')) {
    throw new Error(`${label} path must be a normalized repository path`);
  }
  const absolute = path.resolve(root, normalized);
  if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error(`${label} path escapes repository`);
  const bytes = fs.readFileSync(absolute);
  const actualHash = sha256Bytes(bytes);
  if (actualHash !== expectedHash) throw new Error(`${label} hash drifted`);
  let payload;
  try {
    payload = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`${label} JSON is invalid: ${error.message}`);
  }
  return { path: normalized, sha256: actualHash, bytes, payload };
}

function sortedEqual(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function assertExactList(actual, expected, label) {
  if (!Array.isArray(actual) || !sortedEqual(actual, expected)) {
    throw new Error(`${label} drifted`);
  }
}

function validatePreview(preview) {
  if (preview.schemaVersion !== 1 || preview.reportKind !== 'external_npc_relation_owner_scope_preview') {
    throw new Error('NPC external relation preview contract is invalid');
  }
  if (preview.scopeSha256 !== NPC_EXTERNAL_RELATION_SCOPE_BINDING.scopeSha256) {
    throw new Error('NPC external relation scope hash drifted');
  }
  if (preview.applyAllowed !== false) throw new Error('NPC external relation preview must remain no-write');
  assertExactList(preview.writeTargets, NPC_EXTERNAL_RELATION_SCOPE_BINDING.writeTargets, 'NPC external relation write targets');
  assertExactList(preview.forbidden, NPC_EXTERNAL_RELATION_SCOPE_BINDING.forbidden, 'NPC external relation forbidden set');
  if (preview.ownerFence?.required !== true || preview.ownerFence?.mode !== 'exact_request_preview_readback') {
    throw new Error('NPC external relation owner fence contract is required');
  }
  if (preview.conflictResolution?.status !== 'resolved_read_only'
      || !Array.isArray(preview.conflictResolution?.bridgeConflictSamples)
      || preview.conflictResolution.bridgeConflictSamples.length !== 0) {
    throw new Error('NPC external relation conflicts are not resolved');
  }
}

function validateRecord(record, seenKeys) {
  requireObject(record, 'NPC external relation record');
  const recordKey = requireText(record.recordKey, 'NPC external relation recordKey');
  if (seenKeys.has(recordKey)) throw new Error(`NPC external relation recordKey is duplicated: ${recordKey}`);
  seenKeys.add(recordKey);
  if (!RELATION_TYPES.has(record.relationType)) {
    throw new Error(`NPC external relation type is forbidden: ${record.relationType ?? ''}`);
  }
  for (const [field, label] of [
    ['npcInternalName', 'NPC internal name'],
    ['itemName', 'item name'],
    ['sourceRefInternalName', 'source reference internal name'],
    ['sourceUrl', 'source URL'],
  ]) requireText(record[field], label);
  if (FORBIDDEN_TEXT.test(JSON.stringify(record))) {
    throw new Error('NPC external relation record contains a forbidden domain or item');
  }
}

function validateCandidates(candidates) {
  if (!Array.isArray(candidates)) throw new Error('NPC external relation backfillCandidates must be an array');
  const seen = new Set();
  return candidates.map((candidate) => {
    requireObject(candidate, 'NPC external relation backfill candidate');
    const key = requireText(candidate.candidateKey, 'NPC external relation candidateKey');
    if (seen.has(key)) throw new Error(`NPC external relation candidateKey is duplicated: ${key}`);
    seen.add(key);
    if (!CANDIDATE_DOMAINS.has(candidate.domain) || candidate.status !== 'open'
        || candidate.recommendedAction !== CANDIDATE_ACTION) {
      throw new Error(`NPC external relation unresolved candidate is invalid: ${key}`);
    }
    return candidate;
  });
}

function validateAcceptedQuarantineProjection(projection) {
  requireObject(projection, 'NPC external relation accepted/quarantine projection');
  if (projection.schemaVersion !== 1
      || projection.reportKind !== 'npc_external_relation_scope_accepted_quarantine_projection'
      || projection.operationId !== NPC_EXTERNAL_RELATION_SCOPE_OPERATION_ID
      || projection.applyAllowed !== false
      || projection.databaseWrites !== false
      || projection.scopeSha256 !== NPC_EXTERNAL_RELATION_SCOPE_BINDING.scopeSha256) {
    throw new Error('NPC external relation accepted/quarantine projection contract is invalid');
  }
  const accepted = requireObject(projection.accepted, 'NPC external relation accepted projection');
  for (const [field, expected] of [
    ['sourceFacts', NPC_EXTERNAL_RELATION_SCOPE_BINDING.acceptedSourceFactCount],
    ['sourceDetails', NPC_EXTERNAL_RELATION_SCOPE_BINDING.acceptedSourceDetailCount],
    ['lootRelations', NPC_EXTERNAL_RELATION_SCOPE_BINDING.acceptedLootRelationCount],
    ['shopRelations', NPC_EXTERNAL_RELATION_SCOPE_BINDING.acceptedShopRelationCount],
  ]) {
    if (!Array.isArray(accepted[field]) || accepted[field].length !== expected) {
      throw new Error(`NPC external relation accepted projection ${field} count drifted`);
    }
    if (field !== 'sourceDetails' && accepted[field].some((row) => row.reviewStatus != null && row.reviewStatus !== 'resolved')) {
      throw new Error(`NPC external relation accepted projection ${field} contains non-resolved rows`);
    }
  }
  const summary = requireObject(projection.summary, 'NPC external relation accepted/quarantine projection summary');
  if (Number(summary.acceptedSourceFacts) !== NPC_EXTERNAL_RELATION_SCOPE_BINDING.acceptedSourceFactCount
      || Number(summary.acceptedSourceDetails) !== NPC_EXTERNAL_RELATION_SCOPE_BINDING.acceptedSourceDetailCount
      || Number(summary.acceptedLootRelations) !== NPC_EXTERNAL_RELATION_SCOPE_BINDING.acceptedLootRelationCount
      || Number(summary.acceptedShopRelations) !== NPC_EXTERNAL_RELATION_SCOPE_BINDING.acceptedShopRelationCount
      || !Array.isArray(projection.quarantine)
      || projection.quarantine.length !== NPC_EXTERNAL_RELATION_SCOPE_BINDING.quarantinedFactCount
      || Number(summary.quarantinedFacts) !== NPC_EXTERNAL_RELATION_SCOPE_BINDING.quarantinedFactCount) {
    throw new Error('NPC external relation quarantine count drifted');
  }
  if (projection.quarantine.some((row) => row.status !== 'unresolved'
      || !['item_unresolved', 'item_ambiguous'].includes(row.reason))) {
    throw new Error('NPC external relation quarantine contains an apply-eligible row');
  }
}

function validateProcessedRelationCounts(relation) {
  const expected = {
    sourceFacts: NPC_EXTERNAL_RELATION_SCOPE_BINDING.acceptedSourceFactCount,
    sourceDetails: NPC_EXTERNAL_RELATION_SCOPE_BINDING.acceptedSourceDetailCount,
    npcLootRelations: NPC_EXTERNAL_RELATION_SCOPE_BINDING.acceptedLootRelationCount,
    npcShopRelations: NPC_EXTERNAL_RELATION_SCOPE_BINDING.acceptedShopRelationCount,
  };
  for (const [field, count] of Object.entries(expected)) {
    if (relation[field]?.length !== count) {
      throw new Error(`NPC external relation processed ${field} count drifted`);
    }
  }
}

function buildWritePlan(records) {
  return records.map((record) => ({
    recordKey: record.recordKey,
    relationType: record.relationType,
    record,
    tables: [
      'maint.maint_item_sources',
      'relation.item_source_facts',
      'relation.item_source_details',
      `relation.item_npc_${record.relationType}_relations`,
      `local.npc_${record.relationType === 'loot' ? 'loot_entries' : 'shop_entries'}`,
    ],
  }));
}

function buildTableCounts(records) {
  const counts = Object.fromEntries(NPC_EXTERNAL_RELATION_SCOPE_BINDING.writeTargets.map((table) => [table, 0]));
  counts['landing.npc_item_relations_bundle_raw'] = records.length > 0 ? 1 : 0;
  counts['maint.maint_item_sources'] = records.length;
  counts['relation.item_source_facts'] = NPC_EXTERNAL_RELATION_SCOPE_BINDING.acceptedSourceFactCount;
  counts['relation.item_source_details'] = NPC_EXTERNAL_RELATION_SCOPE_BINDING.acceptedSourceDetailCount;
  counts['relation.item_npc_loot_relations'] = NPC_EXTERNAL_RELATION_SCOPE_BINDING.acceptedLootRelationCount;
  counts['relation.item_npc_shop_relations'] = NPC_EXTERNAL_RELATION_SCOPE_BINDING.acceptedShopRelationCount;
  counts['local.npc_loot_entries'] = counts['relation.item_npc_loot_relations'];
  counts['local.npc_shop_entries'] = counts['relation.item_npc_shop_relations'];
  return counts;
}

function requirePositiveInteger(value, label) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return normalized;
}

function buildExternalItemSourceRows(writePlan, landing) {
  const landingSourceId = requirePositiveInteger(landing?.id, 'NPC external relation landing id');
  const landingSourceKey = requireText(landing?.sourceKey, 'NPC external relation landing sourceKey');
  const landingContentHash = requireText(landing?.contentHash, 'NPC external relation landing contentHash');
  const landingSourcePage = requireText(landing?.sourcePage, 'NPC external relation landing sourcePage');
  const landingFetchedAt = requireText(landing?.fetchedAt, 'NPC external relation landing fetchedAt');
  const landingParsedAt = requireText(landing?.parsedAt, 'NPC external relation landing parsedAt');
  return writePlan.map(({ record, recordKey }, index) => {
    const maintRecordKey = stableMaintRecordKey(recordKey);
    const sourceRefName = requireText(
      record.sourceRefName ?? record.npcName ?? record.npcInternalName,
      'NPC external relation sourceRefName',
    );
    const raw = {
      ...record,
      sourceRefName,
      sourceRefInternalName: requireText(record.sourceRefInternalName, 'NPC external relation sourceRefInternalName'),
      sourceRefResolution: 'exact_internal_name',
    };
    return {
      record_key: maintRecordKey,
      source_maint_table: 'maint_item_sources',
      source_maint_record_key: maintRecordKey,
      source_maint_id: null,
      item_source_id: null,
      item_internal_name: record.itemInternalName ?? null,
      item_name: record.itemName,
      source_type: record.relationType === 'loot' ? 'drop' : 'shop',
      source_ref_type: 'npc',
      source_ref_name: sourceRefName,
      biome_code: null,
      sort_order: Number(record.sourceRowIndex ?? index) || 0,
      raw_json: JSON.stringify(raw),
      source_provider: 'terraria.wiki.gg',
      source_page: record.sourceUrl,
      source_revision_timestamp: record.sourceRevisionTimestamp ?? null,
      landing_source_id: landingSourceId,
      landing_source_key: landingSourceKey,
      landing_source_page: landingSourcePage,
      landing_content_hash: landingContentHash,
      landing_fetched_at: landingFetchedAt,
      landing_parsed_at: landingParsedAt,
      status: 1,
      deleted: 0,
    };
  });
}

function buildMaintItemSourceRows(itemSourceRows) {
  return itemSourceRows.map((row) => ({
    recordKey: row.record_key,
    itemInternalName: row.item_internal_name,
    itemName: row.item_name,
    sourceType: row.source_type,
    sourceRefType: row.source_ref_type,
    sourceRefName: row.source_ref_name,
    sortOrder: row.sort_order,
    biomeCode: row.biome_code,
    sourceProvider: row.source_provider,
    sourcePage: row.source_page,
    sourceRevisionTimestamp: row.source_revision_timestamp,
    landingSourceId: row.landing_source_id,
    landingSourceKey: row.landing_source_key,
    landingSourcePage: row.landing_source_page,
    landingContentHash: row.landing_content_hash,
    landingFetchedAt: row.landing_fetched_at,
    landingParsedAt: row.landing_parsed_at,
    rawJson: row.raw_json,
  }));
}

export function buildNpcExternalRelationScopeRows({
  plan,
  landing,
  itemIndex = new Map(),
  npcIndex = new Map(),
} = {}) {
  if (plan?.operationId !== NPC_EXTERNAL_RELATION_SCOPE_OPERATION_ID) {
    throw new Error('NPC external relation row builder requires the exact operation plan');
  }
  validateWritePlan(plan.writePlan);
  const itemSourceRows = buildExternalItemSourceRows(plan.writePlan, landing);
  const relation = buildItemSourceRelations({ itemSourceRows, itemIndex, npcIndex });
  if (relation.issues.length > 0
      || relation.sourceFacts.some((row) => row.reviewStatus !== 'resolved')
      || relation.npcLootRelations.some((row) => row.reviewStatus !== 'resolved')
      || relation.npcShopRelations.some((row) => row.reviewStatus !== 'resolved')) {
    throw new Error('NPC external relation rows require resolved local item and NPC identities');
  }
  const projection = plan.projectionPayload;
  if (projection) {
    validateProcessedRelationCounts(relation);
    validateAcceptedQuarantineProjection(projection);
  }
  return Object.freeze({
    maintItemSources: buildMaintItemSourceRows(itemSourceRows),
    maintNpcCrawlerFacts: [],
    relation: Object.freeze({
      itemSourceFacts: relation.sourceFacts,
      itemSourceDetails: relation.sourceDetails,
      npcLootRelations: relation.npcLootRelations,
      npcShopRelations: relation.npcShopRelations,
    }),
    quarantine: Object.freeze({
      facts: Object.freeze(projection?.quarantine ?? []),
      candidates: [...plan.unresolvedCandidates],
      writeCount: 0,
    }),
  });
}

function resolveLocalIdentity(index, internalName, label) {
  const key = requireText(internalName, `${label} internal name`);
  const normalizedKey = key.toLowerCase();
  const candidate = index.get(`__internal__:${normalizedKey}`)
    ?? index.get(key)
    ?? index.get(normalizedKey);
  const rows = Array.isArray(candidate) ? candidate : candidate ? [candidate] : [];
  if (rows.length !== 1 || !Number.isSafeInteger(Number(rows[0]?.id))) {
    throw new Error(`NPC external relation local ${label} identity is not unique`);
  }
  return rows[0];
}

export function buildNpcExternalRelationScopeLocalRows({
  relation,
  itemIndex = new Map(),
  npcIndex = new Map(),
} = {}) {
  const buildLootRow = (row) => {
    const npc = resolveLocalIdentity(npcIndex, row.npcInternalName, 'NPC');
    const item = resolveLocalIdentity(itemIndex, row.itemInternalName, 'item');
    return {
      relationRecordKey: requireText(row.recordKey, 'NPC external relation loot recordKey'),
      sourceFactKey: requireText(row.sourceFactKey, 'NPC external relation loot sourceFactKey'),
      npcId: Number(npc.id),
      itemId: Number(item.id),
      sourceItemId: Number(item.id),
      quantityMin: row.quantityMin ?? null,
      quantityMax: row.quantityMax ?? null,
      quantityText: row.quantityText ?? null,
      chanceValue: row.chanceValue ?? null,
      chanceText: row.chanceText ?? null,
      conditions: row.conditions ?? null,
      notes: row.conditionSourceText ?? null,
      sortOrder: Number(row.sortOrder ?? 0) || 0,
      dropSourceKind: 'npc_drop',
    };
  };
  const buildShopRow = (row) => {
    const npc = resolveLocalIdentity(npcIndex, row.npcInternalName, 'NPC');
    const item = resolveLocalIdentity(itemIndex, row.itemInternalName, 'item');
    return {
      relationRecordKey: requireText(row.recordKey, 'NPC external relation shop recordKey'),
      sourceFactKey: requireText(row.sourceFactKey, 'NPC external relation shop sourceFactKey'),
      npcId: Number(npc.id),
      itemId: Number(item.id),
      sourceItemId: Number(item.id),
      priceText: row.priceText ?? null,
      notes: row.conditionSourceText ?? null,
      sortOrder: Number(row.sortOrder ?? 0) || 0,
    };
  };
  return Object.freeze({
    loot: Object.freeze((relation?.npcLootRelations ?? []).map(buildLootRow)),
    shop: Object.freeze((relation?.npcShopRelations ?? []).map(buildShopRow)),
  });
}

function validateWritePlan(writePlan) {
  if (!Array.isArray(writePlan)) throw new Error('NPC external relation write plan is required');
  for (const entry of writePlan) {
    requireText(entry.recordKey, 'NPC external relation write plan recordKey');
    if (!Array.isArray(entry.tables) || entry.tables.length === 0
        || new Set(entry.tables).size !== entry.tables.length) {
      throw new Error('NPC external relation write plan tables are invalid');
    }
    for (const table of entry.tables) {
      if (!TARGET_SET.has(table)) throw new Error(`NPC external relation write target is forbidden: ${table}`);
    }
  }
}

export function validateNpcExternalRelationScope({
  bundle,
  preview,
  projection,
  serverFingerprint,
} = {}) {
  requireObject(bundle, 'NPC external relation bundle');
  validatePreview(requireObject(preview, 'NPC external relation preview'));
  if (projection != null) validateAcceptedQuarantineProjection(projection);
  const fingerprint = canonicalServerFingerprint(serverFingerprint);
  if (bundle.schemaVersion !== 1 || bundle.source !== 'wiki-crawler:npc') {
    throw new Error('NPC external relation bundle contract is invalid');
  }
  if (!Array.isArray(bundle.records)) throw new Error('NPC external relation records are required');
  const seenKeys = new Set();
  const records = bundle.records.map((record) => {
    validateRecord(record, seenKeys);
    return record;
  });
  const unresolvedCandidates = validateCandidates(bundle.backfillCandidates);
  const summary = preview.summary;
  if (summary?.recordCount !== records.length
      || summary?.lootRecords !== records.filter((record) => record.relationType === 'loot').length
      || summary?.shopRecords !== records.filter((record) => record.relationType === 'shop').length
      || summary?.candidateCount !== unresolvedCandidates.length) {
    throw new Error('NPC external relation preview summary drifted');
  }
  const writePlan = buildWritePlan(records);
  validateWritePlan(writePlan);
  const blockers = [];
  if (unresolvedCandidates.length > 0) {
    blockers.push(`unresolved candidates must remain quarantined: ${unresolvedCandidates.length}`);
  }
  return Object.freeze({
    operationId: NPC_EXTERNAL_RELATION_SCOPE_OPERATION_ID,
    scopeSha256: NPC_EXTERNAL_RELATION_SCOPE_BINDING.scopeSha256,
    serverFingerprint: fingerprint,
    serverFingerprintSha256: hashCanonicalServerFingerprint(fingerprint),
    applyAllowed: false,
    databaseWrites: false,
    records,
    writePlan,
    tableCounts: buildTableCounts(records),
    unresolvedCandidates,
    quarantinedFactCount: projection?.quarantine?.length ?? 0,
    blockers,
    ownerFence: { ...preview.ownerFence },
    allowedTables: [...NPC_EXTERNAL_RELATION_SCOPE_BINDING.writeTargets],
  });
}

export function buildNpcExternalRelationScopePlan({
  repoRoot = process.cwd(),
  bundlePath = NPC_EXTERNAL_RELATION_SCOPE_BUNDLE_PATH,
  previewPath = NPC_EXTERNAL_RELATION_SCOPE_PREVIEW_PATH,
  projectionPath = NPC_EXTERNAL_RELATION_SCOPE_PROJECTION_PATH,
  serverFingerprint,
} = {}) {
  const bundle = readJsonArtifact(
    repoRoot,
    bundlePath,
    NPC_EXTERNAL_RELATION_SCOPE_BINDING.bundleSha256,
    'NPC external relation bundle',
  );
  const preview = readJsonArtifact(
    repoRoot,
    previewPath,
    NPC_EXTERNAL_RELATION_SCOPE_BINDING.previewSha256,
    'NPC external relation preview',
  );
  const projection = readJsonArtifact(
    repoRoot,
    projectionPath,
    NPC_EXTERNAL_RELATION_SCOPE_BINDING.projectionSha256,
    'NPC external relation accepted/quarantine projection',
  );
  const validated = validateNpcExternalRelationScope({
    bundle: bundle.payload,
    preview: preview.payload,
    projection: projection.payload,
    serverFingerprint,
  });
  return Object.freeze({
    ...validated,
    bundle: { path: bundle.path, sha256: bundle.sha256 },
    preview: { path: preview.path, sha256: preview.sha256 },
    projection: { path: projection.path, sha256: projection.sha256 },
    projectionPayload: projection.payload,
  });
}

function assertAuthorizedContext(context, plan) {
  requireObject(context, 'NPC external relation authorization context');
  if (context.operationId !== NPC_EXTERNAL_RELATION_SCOPE_OPERATION_ID) {
    throw new Error('NPC external relation authorization operationId drifted');
  }
  const manifest = requireObject(context.executionManifest, 'NPC external relation execution manifest');
  const scope = requireObject(manifest.npcExternalRelationScope, 'NPC external relation manifest scope');
  const projectionBound = plan.quarantinedFactCount != null;
  if (scope.scopeSha256 !== plan.scopeSha256
      || scope.bundleSha256 !== NPC_EXTERNAL_RELATION_SCOPE_BINDING.bundleSha256
      || scope.previewSha256 !== NPC_EXTERNAL_RELATION_SCOPE_BINDING.previewSha256
      || (projectionBound && scope.projectionSha256 !== NPC_EXTERNAL_RELATION_SCOPE_BINDING.projectionSha256)
      || Number(scope.unresolvedCandidateCount) !== plan.unresolvedCandidates.length
      || (projectionBound && Number(scope.quarantinedFactCount) !== plan.quarantinedFactCount)) {
    throw new Error('NPC external relation authorization evidence drifted');
  }
  if (!context.actor || !context.reason || !context.authorizationReference || !context.decisionIdentity) {
    throw new Error('NPC external relation owner authorization is required');
  }
  const contextServerFingerprintHash = typeof context.serverFingerprint === 'string'
    ? context.serverFingerprint
    : hashCanonicalServerFingerprint(canonicalServerFingerprint(context.serverFingerprint));
  const expectedServerFingerprintHash = plan.serverFingerprintSha256
    ?? hashCanonicalServerFingerprint(canonicalServerFingerprint(plan.serverFingerprint));
  if (contextServerFingerprintHash !== expectedServerFingerprintHash) {
    throw new Error('NPC external relation server fingerprint drifted');
  }
  assertExactList(manifest.ownershipKeys, NPC_EXTERNAL_RELATION_SCOPE_BINDING.writeTargets, 'NPC external relation owner fence tables');
}

function validateCounts(actual, expected, label) {
  requireObject(actual, `${label} counts`);
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)
      || expectedKeys.some((key) => Number(actual[key]) !== Number(expected[key]))) {
    throw new Error(`NPC external relation ${label} counts drifted`);
  }
}

export async function executeNpcExternalRelationScope({
  plan,
  apply = false,
  authorizationContext = null,
  writer = null,
} = {}) {
  requireObject(plan, 'NPC external relation plan');
  if (plan.operationId !== NPC_EXTERNAL_RELATION_SCOPE_OPERATION_ID) {
    throw new Error('NPC external relation plan operationId is invalid');
  }
  validateWritePlan(plan.writePlan);
  if (!apply) {
    return {
      operationId: NPC_EXTERNAL_RELATION_SCOPE_OPERATION_ID,
      status: 'DRY_RUN',
      apply: false,
      databaseWrites: false,
      scopeSha256: plan.scopeSha256,
      unresolvedCandidateCount: plan.unresolvedCandidates.length,
      blockers: [...plan.blockers],
      writePlan: plan.writePlan,
    };
  }
  assertAuthorizedContext(authorizationContext, plan);
  if (!writer || typeof writer.begin !== 'function' || typeof writer.apply !== 'function'
      || typeof writer.readback !== 'function' || typeof writer.commit !== 'function'
      || typeof writer.rollback !== 'function') {
    throw new TypeError('NPC external relation writer begin/apply/readback/commit/rollback are required');
  }
  const expectedCounts = plan.tableCounts ?? Object.fromEntries(
    NPC_EXTERNAL_RELATION_SCOPE_BINDING.writeTargets.map((table) => [table, plan.writePlan.length]),
  );
  let began = false;
  try {
    await writer.begin({ operationId: NPC_EXTERNAL_RELATION_SCOPE_OPERATION_ID, tables: [...NPC_EXTERNAL_RELATION_SCOPE_BINDING.writeTargets] });
    began = true;
    const appliedCounts = await writer.apply({
      operationId: NPC_EXTERNAL_RELATION_SCOPE_OPERATION_ID,
      scopeSha256: plan.scopeSha256,
      writePlan: plan.writePlan,
      allowedTables: [...NPC_EXTERNAL_RELATION_SCOPE_BINDING.writeTargets],
    });
    validateCounts(appliedCounts, expectedCounts, 'apply');
    const readback = await writer.readback({
      operationId: NPC_EXTERNAL_RELATION_SCOPE_OPERATION_ID,
      writePlan: plan.writePlan,
      allowedTables: [...NPC_EXTERNAL_RELATION_SCOPE_BINDING.writeTargets],
    });
    validateCounts(readback, expectedCounts, 'readback');
    await writer.commit();
    return {
      operationId: NPC_EXTERNAL_RELATION_SCOPE_OPERATION_ID,
      status: 'COMPLETED',
      apply: true,
      databaseWrites: true,
      scopeSha256: plan.scopeSha256,
      serverFingerprintSha256: hashCanonicalServerFingerprint(plan.serverFingerprint),
      rowCounts: readback,
    };
  } catch (error) {
    if (began) await writer.rollback().catch(() => {});
    throw error;
  }
}

export function createNpcExternalRelationScopeWriter({
  connections,
  handlers,
} = {}) {
  const dbConnections = requireObject(connections, 'NPC external relation database connections');
  const dbHandlers = requireObject(handlers, 'NPC external relation database handlers');
  const orderedRoles = ['local', 'maint', 'relation'];
  for (const role of orderedRoles) {
    if (typeof dbConnections[role]?.beginTransaction !== 'function'
        || typeof dbConnections[role]?.commit !== 'function'
        || typeof dbConnections[role]?.rollback !== 'function') {
      throw new TypeError(`NPC external relation ${role} transaction connection is required`);
    }
  }
  for (const phase of ['landing', 'maint', 'relation', 'local']) {
    if (typeof dbHandlers[phase]?.apply !== 'function' || typeof dbHandlers[phase]?.readback !== 'function') {
      throw new TypeError(`NPC external relation ${phase} handler apply/readback is required`);
    }
  }
  const handlerContext = (payload) => ({
    ...payload,
    connections: dbConnections,
    allowedTables: [...NPC_EXTERNAL_RELATION_SCOPE_BINDING.writeTargets],
  });
  return Object.freeze({
    async begin(context) {
      for (const role of orderedRoles) await dbConnections[role].beginTransaction(context);
    },
    async apply(payload) {
      const context = handlerContext(payload);
      const counts = {};
      Object.assign(counts, await dbHandlers.landing.apply(context));
      Object.assign(counts, await dbHandlers.maint.apply(context));
      Object.assign(counts, await dbHandlers.relation.apply(context));
      Object.assign(counts, await dbHandlers.local.apply(context));
      return counts;
    },
    async readback(payload) {
      const context = handlerContext(payload);
      const counts = {};
      Object.assign(counts, await dbHandlers.landing.readback(context));
      Object.assign(counts, await dbHandlers.maint.readback(context));
      Object.assign(counts, await dbHandlers.relation.readback(context));
      Object.assign(counts, await dbHandlers.local.readback(context));
      return counts;
    },
    async commit() {
      for (const role of [...orderedRoles].reverse()) await dbConnections[role].commit();
    },
    async rollback() {
      for (const role of [...orderedRoles].reverse()) await dbConnections[role].rollback();
    },
  });
}

const FORMAL_DATABASES = Object.freeze({
  local: 'terria_v1_local',
  maint: 'terria_v1_maint',
  relation: 'terria_v1_relation',
});

const PERSISTENCE_COLUMNS = Object.freeze({
  maintItemSources: new Set([
    'record_key', 'item_internal_name', 'item_name', 'source_type', 'source_ref_type',
    'source_ref_name', 'sort_order', 'biome_code', 'source_provider', 'source_page',
    'source_revision_timestamp', 'landing_source_id', 'landing_source_key', 'landing_source_page',
    'landing_content_hash', 'landing_fetched_at', 'landing_parsed_at', 'raw_json', 'status', 'deleted',
  ]),
  itemSourceFacts: new Set([
    'record_key', 'item_source_id', 'item_internal_name', 'item_name', 'source_type', 'source_ref_type',
    'source_ref_name', 'source_ref_normalized', 'biome_code', 'sort_order', 'source_maint_table',
    'source_maint_record_key', 'source_maint_id', 'landing_source_id', 'landing_source_key',
    'landing_content_hash', 'source_provider', 'source_page', 'source_revision_timestamp', 'confidence',
    'reason', 'review_status', 'raw_json', 'status', 'deleted',
  ]),
  itemSourceDetails: new Set([
    'record_key', 'source_fact_key', 'source_ref_name', 'quantity_min', 'quantity_max', 'quantity_text',
    'chance_value', 'chance_text', 'source_ref_internal_name', 'source_ref_resolution', 'notes',
    'source_maint_table', 'source_maint_record_key', 'source_maint_id', 'landing_source_id',
    'landing_source_key', 'landing_content_hash', 'source_provider', 'source_page',
    'source_revision_timestamp', 'confidence', 'reason', 'review_status', 'raw_json', 'status', 'deleted',
  ]),
  itemNpcLootRelations: new Set([
    'record_key', 'source_fact_key', 'item_internal_name', 'item_name', 'npc_source_id', 'npc_internal_name',
    'npc_name', 'quantity_min', 'quantity_max', 'quantity_text', 'chance_value', 'chance_text', 'conditions',
    'condition_source_text', 'condition_parse_status', 'condition_biome_code', 'condition_game_period_code',
    'condition_time_code', 'condition_weather_code', 'condition_events_json', 'special_flags_json',
    'source_maint_table', 'source_maint_record_key', 'source_maint_id', 'landing_source_id',
    'landing_source_key', 'landing_content_hash', 'source_provider', 'source_page',
    'source_revision_timestamp', 'confidence', 'reason', 'review_status', 'raw_json', 'status', 'deleted',
  ]),
  itemNpcShopRelations: new Set([
    'record_key', 'source_fact_key', 'item_internal_name', 'item_name', 'npc_source_id', 'npc_internal_name',
    'npc_name', 'price_text', 'conditions', 'condition_source_text', 'condition_parse_status',
    'condition_biome_code', 'condition_game_period_code', 'condition_time_code', 'condition_weather_code',
    'condition_events_json', 'special_flags_json', 'source_maint_table', 'source_maint_record_key',
    'source_maint_id', 'landing_source_id', 'landing_source_key', 'landing_content_hash', 'source_provider',
    'source_page', 'source_revision_timestamp', 'confidence', 'reason', 'review_status', 'raw_json',
    'status', 'deleted',
  ]),
});

function camelToSnake(value) {
  return String(value).replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function qualifiedTable(database, table) {
  return `\`${database}\`.\`${table}\``;
}

function mysqlPersistenceValue(column, value) {
  if (value == null || !/_(at|timestamp)$/.test(column)) return value;
  if (value instanceof Date || Object.prototype.toString.call(value) === '[object Date]') {
    return Number.isFinite(value.getTime())
      ? value.toISOString().slice(0, 19).replace('T', ' ')
      : null;
  }
  if (typeof value !== 'string') return value;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return value;
  const parsed = new Date(value.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 19).replace('T', ' ') : value;
}

async function upsertPersistenceRows(connection, database, table, rows, allowedColumns) {
  for (const row of rows) {
    const mapped = Object.fromEntries(Object.entries(row)
      .map(([key, value]) => [camelToSnake(key), value])
      .filter(([key, value]) => allowedColumns.has(key) && value !== undefined));
    const columns = Object.keys(mapped);
    if (!columns.includes('record_key')) throw new Error(`${table} row requires record_key`);
    const updates = columns.filter((column) => column !== 'record_key')
      .map((column) => `\`${column}\` = VALUES(\`${column}\`)`).join(', ');
    await connection.execute(
      `INSERT INTO ${qualifiedTable(database, table)} (${columns.map((column) => `\`${column}\``).join(', ')})
       VALUES (${columns.map(() => '?').join(', ')})
       ON DUPLICATE KEY UPDATE ${updates || '`record_key` = VALUES(`record_key`)'}`,
      columns.map((column) => mysqlPersistenceValue(column, mapped[column])),
    );
  }
}

function buildExternalRelationLanding({ repoRoot, plan, now }) {
  const bundlePath = path.resolve(repoRoot, plan.bundle.path);
  const payload = {
    schemaVersion: 1,
    source: 'wiki-crawler:npc',
    records: plan.records,
    backfillCandidates: plan.unresolvedCandidates,
  };
  const timestamp = new Date(now).toISOString().slice(0, 19).replace('T', ' ');
  return {
    datasetType: 'npc_item_relations_bundle_raw',
    provider: 'terrapedia.generated',
    sourceKind: 'generated_bundle',
    sourceKey: 'generated.npc_item_relations_bundle',
    sourceLocator: `repo://${plan.bundle.path}`,
    sourcePage: 'npc-item-relations.bundle',
    sourceRevisionTimestamp: null,
    contentHash: plan.bundle.sha256.slice('sha256:'.length),
    payloadJson: JSON.stringify(payload),
    fetchedAt: timestamp,
    parsedAt: timestamp,
    parseStatus: 'ok',
    artifactRole: 'source_evidence',
    producerId: 'canonical-npc-external-relation-scope',
    producerVersion: '1',
    producerRunKey: `canonical-npc-external-relation-scope:${plan.scopeSha256}`,
    bootstrapManifestHash: null,
    fullFileContentHash: plan.bundle.sha256.slice('sha256:'.length),
    fullFileByteSize: fs.statSync(bundlePath).size,
    isCurrent: 1,
    notes: 'Unresolved candidates remain quarantine-only; no candidate rows are applied.',
  };
}

async function loadLookupRows(connection, database, table, columns, names = null) {
  const predicate = Array.isArray(names) && names.length > 0
    ? ` WHERE internal_name IN (${names.map(() => '?').join(', ')})`
    : '';
  const [rows] = await connection.query(
    `SELECT ${columns.join(', ')} FROM ${qualifiedTable(database, table)}${predicate}`,
    Array.isArray(names) && names.length > 0 ? names : [],
  );
  return rows;
}

function buildLookupIndex(rows) {
  const index = new Map();
  for (const row of rows) {
    const internalKey = String(row.internal_name ?? '').trim().toLowerCase();
    if (internalKey) {
      const current = index.get(`__internal__:${internalKey}`);
      if (!current) index.set(`__internal__:${internalKey}`, row);
      else if (Array.isArray(current)) current.push(row);
      else index.set(`__internal__:${internalKey}`, [current, row]);
    }
    for (const value of [row.internal_name, row.english_name, row.name, row.name_zh]) {
      const key = String(value ?? '').trim().toLowerCase();
      if (!key) continue;
      const current = index.get(key);
      if (!current) index.set(key, row);
      else if (Array.isArray(current)) current.push(row);
      else index.set(key, [current, row]);
    }
  }
  return index;
}

function assertScopeCounts(plan, built) {
  const expected = plan.tableCounts;
  const actual = {
    'landing.npc_item_relations_bundle_raw': 1,
    'maint.maint_item_sources': built.maintItemSources.length,
    'maint.maint_npc_crawler_facts': built.maintNpcCrawlerFacts.length,
    'relation.item_source_facts': built.relation.itemSourceFacts.length,
    'relation.item_source_details': built.relation.itemSourceDetails.length,
    'relation.item_npc_loot_relations': built.relation.npcLootRelations.length,
    'relation.item_npc_shop_relations': built.relation.npcShopRelations.length,
    'local.npc_loot_entries': built.relation.npcLootRelations.length,
    'local.npc_shop_entries': built.relation.npcShopRelations.length,
  };
  validateCounts(actual, expected, 'built rows');
  return actual;
}

async function loadLandingIdentity(connection, landing) {
  await upsertLandingRow(connection, landing, { rows: { inserted: 0, updated: 0, replaced: 0, unchanged: 0 } });
  const [rows] = await connection.execute(
    `SELECT id, source_key AS sourceKey, source_page AS sourcePage, content_hash AS contentHash,
            fetched_at AS fetchedAt, parsed_at AS parsedAt
     FROM ${qualifiedTable(FORMAL_DATABASES.local, 'source_dataset_landings')}
     WHERE dataset_type = ? AND provider = ? AND source_key = ? AND source_page = ?
       AND content_hash = ? AND is_current = 1`,
    [landing.datasetType, landing.provider, landing.sourceKey, landing.sourcePage, landing.contentHash],
  );
  if (rows.length !== 1) throw new Error('NPC external relation landing readback is not exact');
  return rows[0];
}

function localLootTuple(row) {
  return [row.npcId, row.itemId, row.sourceItemId, row.quantityMin, row.quantityMax,
    row.quantityText, row.chanceValue, row.chanceText, row.conditions, row.notes, row.sortOrder];
}

function localShopTuple(row) {
  return [row.npcId, row.itemId, row.sourceItemId, row.priceText, row.notes, row.sortOrder];
}

async function findLocalRows(connection, table, row) {
  if (table === 'npc_loot_entries') {
    const [rows] = await connection.execute(
      `SELECT id FROM ${qualifiedTable(FORMAL_DATABASES.local, table)}
       WHERE npc_id = ? AND item_id = ? AND source_item_id = ?
         AND quantity_min <=> ? AND quantity_max <=> ? AND quantity_text <=> ?
         AND chance_value <=> ? AND chance_text <=> ? AND conditions <=> ? AND notes <=> ?
         AND sort_order = ? AND drop_source_kind = 'npc_drop' AND status = 1 AND deleted = 0
       ORDER BY id LIMIT 2`,
      localLootTuple(row),
    );
    return rows;
  }
  const [rows] = await connection.execute(
    `SELECT id FROM ${qualifiedTable(FORMAL_DATABASES.local, table)}
     WHERE npc_id = ? AND item_id = ? AND source_item_id = ? AND price_text <=> ?
       AND notes <=> ? AND sort_order = ? AND status = 1 AND deleted = 0
     ORDER BY id LIMIT 2`,
    localShopTuple(row),
  );
  return rows;
}

async function upsertLocalRow(connection, table, row) {
  const existing = await findLocalRows(connection, table, row);
  // Local compatibility tables predate relation record keys. Treat an
  // existing duplicate tuple as logically present and leave both rows intact;
  // duplicate cleanup is outside this exact apply scope.
  if (existing.length >= 1) return 1;
  if (table === 'npc_loot_entries') {
    await connection.execute(
      `INSERT INTO ${qualifiedTable(FORMAL_DATABASES.local, table)}
       (npc_id, item_id, source_item_id, quantity_min, quantity_max, quantity_text, chance_value,
        chance_text, conditions, notes, sort_order, drop_source_kind, status, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'npc_drop', 1, 0)`,
      [...localLootTuple(row)],
    );
  } else {
    await connection.execute(
      `INSERT INTO ${qualifiedTable(FORMAL_DATABASES.local, table)}
       (npc_id, item_id, source_item_id, price_text, notes, sort_order, status, deleted)
       VALUES (?, ?, ?, ?, ?, ?, 1, 0)`,
      [...localShopTuple(row)],
    );
  }
  return 1;
}

export function createNpcExternalRelationScopeMysqlWriter({
  repoRoot = process.cwd(),
  plan,
  env = process.env,
  connectionFactory = null,
  now = new Date().toISOString(),
} = {}) {
  if (JSON.stringify(plan?.serverFingerprint?.databases) !== JSON.stringify(Object.values(FORMAL_DATABASES))) {
    throw new Error('NPC external relation MySQL writer requires the exact formal databases');
  }
  let connection = null;
  let built = null;
  let landing = null;
  const openConnection = connectionFactory ?? (async () => {
    const config = loadLocalStackConfig(path.resolve(repoRoot));
    return loadMysqlModule({ repoRoot: path.resolve(repoRoot) }).createConnection({
      host: env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
      port: Number(env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 13306),
      user: env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
      password: env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
      database: FORMAL_DATABASES.local,
    });
  });
  const close = async () => {
    if (connection && typeof connection.end === 'function') await connection.end();
    connection = null;
  };
  const assertPayloadMatchesPlan = (payload = {}) => {
    if (payload.operationId !== plan.operationId || payload.scopeSha256 !== plan.scopeSha256) {
      throw new Error('NPC external relation writer payload scope drifted');
    }
    const expected = plan.writePlan.map(({ recordKey, relationType, tables }) => ({
      recordKey,
      relationType,
      tables,
    }));
    const actual = Array.isArray(payload.writePlan)
      ? payload.writePlan.map(({ recordKey, relationType, tables }) => ({ recordKey, relationType, tables }))
      : null;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error('NPC external relation writer payload write plan drifted');
    }
  };
  return Object.freeze({
    async begin() {
      if (connection) throw new Error('NPC external relation MySQL transaction is already open');
      connection = await openConnection();
      await connection.beginTransaction();
    },
    async apply(payload = {}) {
      if (!connection) throw new Error('NPC external relation MySQL transaction is not open');
      assertPayloadMatchesPlan(payload);
      const landingArtifact = buildExternalRelationLanding({ repoRoot, plan, now });
      landing = await loadLandingIdentity(connection, landingArtifact);
      const [maintItems, maintNpcs] = await Promise.all([
        // Maint entity tables expose english_name/name_zh; the local
        // compatibility tables are the only lookup source that exposes name.
        loadLookupRows(connection, FORMAL_DATABASES.maint, 'maint_items', ['source_id', 'internal_name', 'english_name', 'name_zh']),
        loadLookupRows(connection, FORMAL_DATABASES.maint, 'maint_npcs', ['source_id', 'internal_name', 'english_name', 'name_zh']),
      ]);
      built = buildNpcExternalRelationScopeRows({
        plan,
        landing,
        itemIndex: buildLookupIndex(maintItems),
        npcIndex: buildLookupIndex(maintNpcs),
      });
      const counts = assertScopeCounts(plan, built);
      await upsertPersistenceRows(connection, FORMAL_DATABASES.maint, 'maint_item_sources', built.maintItemSources, PERSISTENCE_COLUMNS.maintItemSources);
      await upsertPersistenceRows(connection, FORMAL_DATABASES.relation, 'item_source_facts', built.relation.itemSourceFacts, PERSISTENCE_COLUMNS.itemSourceFacts);
      await upsertPersistenceRows(connection, FORMAL_DATABASES.relation, 'item_source_details', built.relation.itemSourceDetails, PERSISTENCE_COLUMNS.itemSourceDetails);
      await upsertPersistenceRows(connection, FORMAL_DATABASES.relation, 'item_npc_shop_relations', built.relation.npcShopRelations, PERSISTENCE_COLUMNS.itemNpcShopRelations);
      await upsertPersistenceRows(connection, FORMAL_DATABASES.relation, 'item_npc_loot_relations', built.relation.npcLootRelations, PERSISTENCE_COLUMNS.itemNpcLootRelations);
      const itemNames = [...new Set([...built.relation.npcLootRelations, ...built.relation.npcShopRelations].map((row) => row.itemInternalName))];
      const npcNames = [...new Set([...built.relation.npcLootRelations, ...built.relation.npcShopRelations].map((row) => row.npcInternalName))];
      const [localItems, localNpcs] = await Promise.all([
        loadLookupRows(connection, FORMAL_DATABASES.local, 'items', ['id', 'internal_name', 'name'], itemNames),
        loadLookupRows(connection, FORMAL_DATABASES.local, 'npcs', ['id', 'internal_name', 'name'], npcNames),
      ]);
      const localRows = buildNpcExternalRelationScopeLocalRows({
        relation: built.relation,
        itemIndex: buildLookupIndex(localItems),
        npcIndex: buildLookupIndex(localNpcs),
      });
      for (const row of localRows.shop) await upsertLocalRow(connection, 'npc_shop_entries', row);
      for (const row of localRows.loot) await upsertLocalRow(connection, 'npc_loot_entries', row);
      return counts;
    },
    async readback() {
      if (!connection || !built || !landing) throw new Error('NPC external relation MySQL apply has not run');
      const counts = await readbackNpcExternalRelationScope({ connection, plan, built, landing });
      return counts;
    },
    async commit() {
      if (!connection) throw new Error('NPC external relation MySQL transaction is not open');
      await connection.commit();
      await close();
    },
    async rollback() {
      if (!connection) return;
      try { await connection.rollback(); } finally { await close(); }
    },
  });
}

async function readbackRecordKeys(connection, database, table, keys, extra = '') {
  if (keys.length === 0) return 0;
  const predicate = typeof extra === 'string' ? extra : extra?.predicate ?? '';
  const params = typeof extra === 'string' ? [] : extra?.params ?? [];
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS total FROM ${qualifiedTable(database, table)}
     WHERE record_key IN (${keys.map(() => '?').join(', ')}) AND status = 1 AND deleted = 0 ${predicate}`,
    [...keys, ...params],
  );
  return Number(rows[0]?.total ?? 0);
}

async function readbackNpcExternalRelationScope({ connection, plan, built, landing }) {
  const [landingRows] = await connection.execute(
    `SELECT COUNT(*) AS total FROM ${qualifiedTable(FORMAL_DATABASES.local, 'source_dataset_landings')}
     WHERE dataset_type = ? AND provider = ? AND source_key = ? AND source_page = ?
       AND content_hash = ? AND is_current = 1`,
    ['npc_item_relations_bundle_raw', 'terrapedia.generated', landing.sourceKey, landing.sourcePage, landing.contentHash],
  );
  const maintKeys = built.maintItemSources.map((row) => row.recordKey);
  const factKeys = built.relation.itemSourceFacts.map((row) => row.recordKey);
  const detailKeys = built.relation.itemSourceDetails.map((row) => row.recordKey);
  const shopKeys = built.relation.npcShopRelations.map((row) => row.recordKey);
  const lootKeys = built.relation.npcLootRelations.map((row) => row.recordKey);
  const landingLineage = {
    predicate: 'AND landing_content_hash = ? AND landing_source_key = ? AND landing_source_page = ?',
    params: [landing.contentHash, landing.sourceKey, landing.sourcePage],
  };
  const relationLineage = {
    predicate: 'AND landing_content_hash = ? AND landing_source_key = ?',
    params: [landing.contentHash, landing.sourceKey],
  };
  const [maintCount, factCount, detailCount, shopCount, lootCount] = await Promise.all([
    readbackRecordKeys(connection, FORMAL_DATABASES.maint, 'maint_item_sources', maintKeys, landingLineage),
    readbackRecordKeys(connection, FORMAL_DATABASES.relation, 'item_source_facts', factKeys, {
      predicate: `${relationLineage.predicate} AND source_maint_table = 'maint_item_sources' AND source_maint_record_key IN (${maintKeys.map(() => '?').join(', ')})`,
      params: [...relationLineage.params, ...maintKeys],
    }),
    readbackRecordKeys(connection, FORMAL_DATABASES.relation, 'item_source_details', detailKeys, {
      predicate: `${relationLineage.predicate} AND source_fact_key IN (${factKeys.map(() => '?').join(', ')})`,
      params: [...relationLineage.params, ...factKeys],
    }),
    readbackRecordKeys(connection, FORMAL_DATABASES.relation, 'item_npc_shop_relations', shopKeys, {
      predicate: `${relationLineage.predicate} AND source_fact_key IN (${factKeys.map(() => '?').join(', ')})`,
      params: [...relationLineage.params, ...factKeys],
    }),
    readbackRecordKeys(connection, FORMAL_DATABASES.relation, 'item_npc_loot_relations', lootKeys, {
      predicate: `${relationLineage.predicate} AND source_fact_key IN (${factKeys.map(() => '?').join(', ')})`,
      params: [...relationLineage.params, ...factKeys],
    }),
  ]);
  const localItemNames = [...new Set([...built.relation.npcLootRelations, ...built.relation.npcShopRelations].map((row) => row.itemInternalName))];
  const localNpcNames = [...new Set([...built.relation.npcLootRelations, ...built.relation.npcShopRelations].map((row) => row.npcInternalName))];
  const [localItems, localNpcs] = await Promise.all([
    loadLookupRows(connection, FORMAL_DATABASES.local, 'items', ['id', 'internal_name', 'name'], localItemNames),
    loadLookupRows(connection, FORMAL_DATABASES.local, 'npcs', ['id', 'internal_name', 'name'], localNpcNames),
  ]);
  const localRows = buildNpcExternalRelationScopeLocalRows({
    relation: built.relation,
    itemIndex: buildLookupIndex(localItems),
    npcIndex: buildLookupIndex(localNpcs),
  });
  let localShopCount = 0;
  for (const row of localRows.shop) localShopCount += Math.min(1, (await findLocalRows(connection, 'npc_shop_entries', row)).length);
  let localLootCount = 0;
  for (const row of localRows.loot) localLootCount += Math.min(1, (await findLocalRows(connection, 'npc_loot_entries', row)).length);
  const result = {
    'landing.npc_item_relations_bundle_raw': Number(landingRows[0]?.total ?? 0),
    'maint.maint_item_sources': maintCount,
    'maint.maint_npc_crawler_facts': 0,
    'relation.item_source_facts': factCount,
    'relation.item_source_details': detailCount,
    'relation.item_npc_loot_relations': lootCount,
    'relation.item_npc_shop_relations': shopCount,
    'local.npc_loot_entries': localLootCount,
    'local.npc_shop_entries': localShopCount,
  };
  validateCounts(result, plan.tableCounts, 'readback');
  return result;
}

function writePrivateJson(repoRoot, outputPath, payload) {
  const root = path.resolve(repoRoot);
  const relative = requireText(outputPath, 'NPC external relation output path').replaceAll('\\', '/');
  if (path.isAbsolute(relative) || path.posix.normalize(relative) !== relative || relative.split('/').includes('..')) {
    throw new Error('NPC external relation output path must be a normalized repository path');
  }
  const output = path.resolve(root, relative);
  if (!output.startsWith(`${root}${path.sep}`)) throw new Error('NPC external relation output path escapes repository');
  fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
  const temporary = `${output}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, output);
    fs.chmodSync(output, 0o600);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return relative;
}

function parseArgs(argv) {
  return Object.fromEntries(argv.map((arg) => {
    const [key, ...rest] = String(arg).replace(/^--/, '').split('=');
    return [key, rest.join('=') || 'true'];
  }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(args['repo-root'] ?? process.cwd());
  const fingerprintArg = args['server-fingerprint'] ?? process.env.TERRAPEDIA_SERVER_FINGERPRINT;
  const fingerprintText = fingerprintArg && fingerprintArg.endsWith('.json')
    ? fs.readFileSync(path.resolve(repoRoot, fingerprintArg), 'utf8')
    : fingerprintArg;
  if (!fingerprintText) throw new Error('NPC external relation server fingerprint is required');
  const serverFingerprint = JSON.parse(fingerprintText);
  const plan = buildNpcExternalRelationScopePlan({
    repoRoot,
    serverFingerprint,
    bundlePath: args.bundle ?? NPC_EXTERNAL_RELATION_SCOPE_BUNDLE_PATH,
    previewPath: args.preview ?? NPC_EXTERNAL_RELATION_SCOPE_PREVIEW_PATH,
    projectionPath: args.projection ?? NPC_EXTERNAL_RELATION_SCOPE_PROJECTION_PATH,
  });
  if (args.apply !== 'true') {
    const result = await executeNpcExternalRelationScope({ plan, apply: false });
    if (args.output) {
      writePrivateJson(repoRoot, args.output, result);
    } else {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }
    return;
  }
  const authorizedContext = loadAuthorizedOperationContext({
    operationId: NPC_EXTERNAL_RELATION_SCOPE_OPERATION_ID,
  });
  consumeAuthorizedOperationDispatchPermit({
    authorizedContext,
    decisionLedgerPath: path.join(repoRoot, 'reports/authorization/canonical/used-decisions.json'),
  });
  const result = await executeNpcExternalRelationScope({
    plan,
    apply: true,
    authorizationContext: authorizedContext,
    writer: createNpcExternalRelationScopeMysqlWriter({ repoRoot, plan }),
  });
  const outputPath = args.output
    ?? `reports/authorization/canonical/${NPC_EXTERNAL_RELATION_SCOPE_OPERATION_ID}.result.json`;
  writePrivateJson(repoRoot, outputPath, result);
  process.stdout.write(`${JSON.stringify({ operationId: result.operationId, status: result.status, outputPath })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
