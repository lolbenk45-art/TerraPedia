#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { classifyNpcLootSource } from '../lib/npc-loot-source-taxonomy.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = getProjectRoot();
const require = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'));
const mysql = require('mysql2/promise');

const DEFAULTS = Object.freeze({
  maintDatabase: 'terria_v1_maint',
  relationDatabase: 'terria_v1_relation',
  localDatabase: 'terria_v1_local',
  writeReport: false,
  dateTag: new Date().toISOString().slice(0, 10),
  requireApiEvidence: true,
});

const ALLOWED_EXPECTED_ZERO_REASONS = new Set([
  'town_npc_no_loot',
  'bound_or_rescue_state',
  'critter_no_loot',
  'body_or_segment_inherits',
  'event_helper_no_loot',
  'projectile_or_effect_not_killable',
]);

const ALLOWED_INHERITANCE_KINDS = new Set([
  'segment_family',
  'prototype_variant',
  'same_name_variant',
]);

const NPC_STATUSES = Object.freeze([
  'trusted_direct_loot',
  'trusted_inherited_loot',
  'expected_zero_loot',
  'unclassified_zero',
  'blocked_source_gap',
  'relation_gap',
  'projection_gap',
  'local_gap',
  'api_gap',
  'duplicate_or_polluted',
  'runtime_fallback_only',
  'projection_only',
  'count_parity_only',
  'unknown',
]);

const BLOCKING_NPC_STATUSES = new Set([
  'unclassified_zero',
  'blocked_source_gap',
  'relation_gap',
  'projection_gap',
  'local_gap',
  'api_gap',
  'duplicate_or_polluted',
  'runtime_fallback_only',
  'projection_only',
  'count_parity_only',
  'unknown',
]);

const BLOCKING_SOURCE_STATUSES = new Set([
  'blocked_generic_bucket',
  'blocked_ambiguous_variant',
  'blocked_non_npc_source',
  'blocked_missing_item_or_npc_identity',
  'duplicate_source_identity',
]);

const ALLOWED_NON_NPC_EXCLUSION_REASONS = new Set([
  'chest_container',
  'crate_container',
  'treasure_bag_container',
  'present_container',
  'tree_source',
  'bag_container',
  'lock_box_container',
  'heart_or_orb_source',
  'mode_or_bonus_bucket',
  'non_npc_item_source_entity',
]);

export function parseArgs(argv = process.argv.slice(2)) {
  const raw = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const index = body.indexOf('=');
    if (index >= 0) raw[body.slice(0, index)] = body.slice(index + 1);
    else raw[body] = 'true';
  }
  return {
    maintDatabase: raw['maint-database'] ?? raw.maintDatabase ?? DEFAULTS.maintDatabase,
    relationDatabase: raw['relation-database'] ?? raw.relationDatabase ?? DEFAULTS.relationDatabase,
    localDatabase: raw['local-database'] ?? raw.localDatabase ?? DEFAULTS.localDatabase,
    writeReport: booleanOption(raw['write-report'] ?? raw.writeReport, DEFAULTS.writeReport),
    output: raw.output ?? null,
    dateTag: raw['date-tag'] ?? raw.dateTag ?? DEFAULTS.dateTag,
    requireApiEvidence: booleanOption(raw['require-api-evidence'] ?? raw.requireApiEvidence, DEFAULTS.requireApiEvidence),
  };
}

export function computeRowIdentityHash(row = {}) {
  const normalized = {
    npcInternalName: normalizeText(row.npcInternalName ?? row.npc_internal_name ?? row.sourceRefInternalName ?? row.source_ref_internal_name),
    itemInternalName: normalizeText(row.itemInternalName ?? row.item_internal_name),
    chanceText: normalizeText(row.chanceText ?? row.chance_text),
    quantityText: normalizeText(row.quantityText ?? row.quantity_text),
    conditions: normalizeText(row.conditions),
  };
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex');
}

export function classifySourceRows(sourceRows = [], options = {}) {
  const preparedRows = sourceRows.map((row, index) => {
    const sourceRefInternalName = normalizeText(row.sourceRefInternalName ?? row.source_ref_internal_name);
    const itemInternalName = normalizeText(row.itemInternalName ?? row.item_internal_name);
    const rowIdentityHash = computeRowIdentityHash({
      ...row,
      npcInternalName: sourceRefInternalName,
      itemInternalName,
    });
    return {
      ...row,
      rowIndex: index,
      itemInternalName,
      sourceRefName: normalizeText(row.sourceRefName ?? row.source_ref_name),
      sourceRefInternalName,
      sourceRefResolution: normalizeText(row.sourceRefResolution ?? row.source_ref_resolution),
      rowIdentityHash,
    };
  });
  const identityCounts = new Map();
  for (const row of preparedRows) {
    identityCounts.set(row.rowIdentityHash, (identityCounts.get(row.rowIdentityHash) ?? 0) + 1);
  }

  return preparedRows.map((row) => {
    const status = classifySourceRow(row, identityCounts.get(row.rowIdentityHash) ?? 0, options);
    return {
      ...row,
      sourceRowStatus: status.sourceRowStatus,
      statusReason: status.statusReason,
      materializable: status.sourceRowStatus === 'accepted_materializable',
      targetNpcInternalName: status.targetNpcInternalName ?? row.sourceRefInternalName ?? null,
    };
  });
}

export function buildNpcDomainLootChainReport(input = {}) {
  const options = sanitizeOptions(input.options ?? {});
  const activeNpcs = (Array.isArray(input.npcs) ? input.npcs : []).filter(isActiveNpc);
  const expectedZeroValidation = validateExpectedZeroRules(input.expectedZeroRules);
  const inheritanceValidation = validateInheritanceRules(input.inheritanceRules);
  const reviewedNonNpcExclusionValidation = validateReviewedNonNpcSourceExclusions(input.reviewedNonNpcSourceExclusions);
  const sourceRows = classifySourceRows(input.sourceRows ?? [], {
    reviewedNonNpcSourceExclusions: reviewedNonNpcExclusionValidation.validRows,
  });
  const sourceCoverage = normalizeSourceCoverage(input.sourceGaps, input.sourceCoverageRows);
  const expectedZeroByNpc = keyBy(expectedZeroValidation.validRows, (row) => row.npcInternalName ?? row.npc_internal_name);
  const inheritanceByNpc = keyBy(inheritanceValidation.validRows, (row) => row.targetNpcInternalName ?? row.target_npc_internal_name);
  const sourceGapByNpc = keyBy(sourceCoverage.gapRows, (row) => row.npcInternalName ?? row.npc_internal_name);
  const sourceCoverageByNpc = keyBy(sourceCoverage.coverageRows, (row) => row.npcInternalName ?? row.npc_internal_name);
  const runtimeFallbackByNpc = keyBy(input.runtimeFallbackRows, (row) => row.npcInternalName ?? row.npc_internal_name);
  const pollutionByNpc = keyBy(input.pollutionRows, (row) => row.npcInternalName ?? row.npc_internal_name);
  const relationRowsByNpc = groupRowsByNpc(input.relationLootRows);
  const projectionRowsByNpc = groupRowsByNpc(input.projectionLootRows);
  const localRowsByNpc = groupRowsByNpc(input.localLootRows);
  const apiRowsByNpc = groupRowsByNpc(input.apiLootRows);
  const acceptedSourceRowsByNpc = groupRowsBySourceNpc(sourceRows.filter((row) => row.sourceRowStatus === 'accepted_materializable'));
  const duplicateSourceRows = sourceRows.filter((row) => row.sourceRowStatus === 'duplicate_source_identity');
  const duplicateByNpc = groupRowsBySourceNpc(duplicateSourceRows);
  const apiRowsProvided = Array.isArray(input.apiLootRows) && input.apiLootRows.length > 0;

  const npcStatuses = activeNpcs.map((npc) => {
    const npcInternalName = normalizeText(npc.internalName ?? npc.internal_name);
    const context = {
      npc,
      npcInternalName,
      expectedZeroRule: expectedZeroByNpc.get(npcInternalName),
      inheritanceRule: inheritanceByNpc.get(npcInternalName),
      sourceGap: sourceGapByNpc.get(npcInternalName),
      sourceCoverage: sourceCoverageByNpc.get(npcInternalName),
      runtimeFallback: runtimeFallbackByNpc.get(npcInternalName),
      pollution: pollutionByNpc.get(npcInternalName),
      duplicateRows: duplicateByNpc.get(npcInternalName) ?? [],
      sourceRows: acceptedSourceRowsByNpc.get(npcInternalName) ?? [],
      relationRows: relationRowsByNpc.get(npcInternalName) ?? [],
      projectionRows: projectionRowsByNpc.get(npcInternalName) ?? [],
      localRows: localRowsByNpc.get(npcInternalName) ?? [],
      apiRows: apiRowsByNpc.get(npcInternalName) ?? [],
      relationRowsByNpc,
      projectionRowsByNpc,
      localRowsByNpc,
      apiRowsByNpc,
      apiRowsProvided,
    };
    const classification = classifyNpcStatus(context);
    return buildNpcStatusRow(context, classification);
  });

  const blockedRows = sourceRows.filter((row) => BLOCKING_SOURCE_STATUSES.has(row.sourceRowStatus));
  const chainGaps = npcStatuses.filter((row) => BLOCKING_NPC_STATUSES.has(row.npcStatus));
  const releaseBlockers = [
    ...sourceCoverage.blockers,
    ...expectedZeroValidation.invalidRows.map((row) => ({
      type: 'contract_row',
      contract: 'expected_zero',
      npcInternalName: row.npcInternalName ?? row.npc_internal_name ?? null,
      status: 'invalid_contract_row',
      reason: row.invalidReason,
    })),
    ...inheritanceValidation.invalidRows.map((row) => ({
      type: 'contract_row',
      contract: 'inheritance',
      npcInternalName: row.targetNpcInternalName ?? row.target_npc_internal_name ?? null,
      status: 'invalid_contract_row',
      reason: row.invalidReason,
    })),
    ...reviewedNonNpcExclusionValidation.invalidRows.map((row) => ({
      type: 'contract_row',
      contract: 'reviewed_non_npc_source_exclusion',
      sourceRefName: row.sourceRefName ?? row.source_ref_name ?? null,
      status: 'invalid_contract_row',
      reason: row.invalidReason,
    })),
    ...chainGaps.map((row) => ({
      type: 'npc_status',
      npcInternalName: row.npcInternalName,
      status: row.npcStatus,
      reason: row.statusReason,
    })),
    ...blockedRows.map((row) => ({
      type: 'source_row',
      sourceRowStatus: row.sourceRowStatus,
      itemInternalName: row.itemInternalName,
      sourceRefName: row.sourceRefName,
      sourceRefInternalName: row.sourceRefInternalName,
      reason: row.statusReason,
    })),
  ];
  const summary = buildSummary({ npcStatuses, sourceRows, releaseBlockers });

  return {
    auditName: 'npc-domain-loot-chain-audit',
    generatedAt: new Date().toISOString(),
    auditStatus: releaseBlockers.length === 0 ? 'pass' : 'blocked',
    evidenceHealth: input.evidenceHealth ?? sourceCoverage.evidenceHealth ?? 'sufficient',
    summary,
    npcStatuses,
    sourceRows,
    chainGaps,
    duplicates: duplicateSourceRows,
    blockedRows,
    releaseBlockers,
    contractHealth: buildContractHealth({
      ...input,
      expectedZeroRules: expectedZeroValidation.validRows,
      inheritanceRules: inheritanceValidation.validRows,
      reviewedNonNpcSourceExclusions: reviewedNonNpcExclusionValidation.validRows,
      invalidExpectedZeroRules: expectedZeroValidation.invalidRows,
      invalidInheritanceRules: inheritanceValidation.invalidRows,
      invalidReviewedNonNpcSourceExclusions: reviewedNonNpcExclusionValidation.invalidRows,
    }),
    options,
  };
}

export async function runNpcDomainLootChainAudit(options = {}, dependencies = {}) {
  const normalized = normalizeOptions(options);
  let connection = dependencies.connection ?? null;
  let shouldClose = false;
  try {
    if (!connection) {
      const config = dependencies.config ?? loadLocalStackConfig(repoRoot);
      const mysqlFactory = dependencies.mysqlFactory ?? mysql;
      connection = await mysqlFactory.createConnection({
        host: config.database?.host ?? '127.0.0.1',
        port: Number(config.database?.port ?? 3306),
        user: config.database?.username ?? 'root',
        password: config.database?.password ?? 'root',
      });
      shouldClose = true;
    }

    const loaders = {
      loadActiveNpcs: dependencies.loadActiveNpcs ?? loadActiveNpcs,
      loadSourceRows: dependencies.loadSourceRows ?? loadSourceRows,
      loadRelationLootRows: dependencies.loadRelationLootRows ?? loadRelationLootRows,
      loadProjectionLootRows: dependencies.loadProjectionLootRows ?? loadProjectionLootRows,
      loadLocalLootRows: dependencies.loadLocalLootRows ?? loadLocalLootRows,
      loadContracts: dependencies.loadContracts ?? loadContracts,
      loadSourceGaps: dependencies.loadSourceGaps ?? loadSourceGaps,
      loadRuntimeFallbackRows: dependencies.loadRuntimeFallbackRows ?? loadRuntimeFallbackRows,
      loadApiLootRows: dependencies.loadApiLootRows ?? loadApiLootRows,
      loadPollutionRows: dependencies.loadPollutionRows ?? loadPollutionRows,
    };
    const [
      npcs,
      sourceRows,
      relationLootRows,
      projectionLootRows,
      localLootRows,
      contracts,
      sourceGaps,
      runtimeFallbackRows,
      apiLootRows,
      pollutionRows,
    ] = await Promise.all([
      loaders.loadActiveNpcs(connection, normalized),
      loaders.loadSourceRows(connection, normalized),
      loaders.loadRelationLootRows(connection, normalized),
      loaders.loadProjectionLootRows(connection, normalized),
      loaders.loadLocalLootRows(connection, normalized),
      loaders.loadContracts(normalized),
      loaders.loadSourceGaps(connection, normalized),
      loaders.loadRuntimeFallbackRows(connection, normalized),
      loaders.loadApiLootRows(connection, normalized),
      loaders.loadPollutionRows(connection, normalized),
    ]);
    const report = buildNpcDomainLootChainReport({
      npcs,
      sourceRows,
      relationLootRows,
      projectionLootRows,
      localLootRows,
      apiLootRows,
      sourceGaps,
      sourceCoverageRows: sourceGaps,
      runtimeFallbackRows,
      pollutionRows,
      expectedZeroRules: contracts.expectedZeroRules,
      inheritanceRules: contracts.inheritanceRules,
      reviewedNonNpcSourceExclusions: contracts.reviewedNonNpcSourceExclusions,
      contractFiles: contracts.contractFiles,
      options: normalized,
    });
    const reportPath = normalized.writeReport ? await writeReport(report, normalized) : null;
    return { report, reportPath };
  } catch (error) {
    const report = buildBlockedReport(normalized, error);
    const reportPath = normalized.writeReport ? await writeReport(report, normalized) : null;
    return { report, reportPath };
  } finally {
    if (shouldClose && connection) {
      await connection.end();
    }
  }
}

function classifySourceRow(row, identityCount, options = {}) {
  if (identityCount > 1) {
    return {
      sourceRowStatus: 'duplicate_source_identity',
      statusReason: 'duplicate_stable_source_identity',
    };
  }
  const candidateNames = normalizeList(row.candidateNpcInternalNames ?? row.candidate_npc_internal_names);
  if (candidateNames.length > 1 && row.sourceRefResolution === 'positive_id_fallback') {
    return {
      sourceRowStatus: 'blocked_ambiguous_variant',
      statusReason: 'positive_id_fallback_has_multiple_variant_candidates',
    };
  }
  const taxonomy = classifyNpcLootSource(row, {
    sourceType: row.sourceType,
    sourceRefType: row.sourceRefType,
    reviewedNonNpcSourceExclusions: options.reviewedNonNpcSourceExclusions,
  });
  if (taxonomy.status === 'reviewed_non_npc_source_exclusion') {
    return {
      sourceRowStatus: 'reviewed_non_npc_source_exclusion',
      statusReason: taxonomy.reason,
    };
  }
  if (taxonomy.status === 'generic_bucket') {
    return {
      sourceRowStatus: 'blocked_generic_bucket',
      statusReason: taxonomy.reason,
    };
  }
  if (taxonomy.status === 'non_npc_source_misclassified') {
    return {
      sourceRowStatus: 'blocked_non_npc_source',
      statusReason: taxonomy.reason,
    };
  }
  if (!row.itemInternalName || !row.sourceRefInternalName) {
    return {
      sourceRowStatus: 'blocked_missing_item_or_npc_identity',
      statusReason: 'missing_item_or_npc_identity',
    };
  }
  if (!taxonomy.materializable) {
    return {
      sourceRowStatus: 'blocked_ambiguous_variant',
      statusReason: taxonomy.reason,
    };
  }
  return {
    sourceRowStatus: 'accepted_materializable',
    statusReason: taxonomy.reason,
    targetNpcInternalName: taxonomy.targetNpcInternalName,
  };
}

function classifyNpcStatus(context) {
  const counts = getCounts(context);
  const inheritanceSourceCounts = getInheritanceSourceCounts(context);
  if (context.pollution || context.duplicateRows.length > 0) {
    return { npcStatus: 'duplicate_or_polluted', statusReason: context.pollution?.reason ?? 'duplicate_or_polluted_rows' };
  }
  if (counts.local > 0 && counts.relation === 0 && counts.projection === 0) {
    return { npcStatus: 'duplicate_or_polluted', statusReason: 'local_rows_without_relation_or_projection_provenance' };
  }
  if (counts.local > 0 && context.apiRowsProvided && counts.api === 0) {
    return { npcStatus: 'api_gap', statusReason: 'local_loot_missing_from_api' };
  }
  if ((counts.relation > 0 || counts.projection > 0) && counts.local === 0) {
    return { npcStatus: 'local_gap', statusReason: 'trusted_rows_missing_from_local_loot' };
  }
  if ((counts.relation > 0 || context.inheritanceRule) && counts.projection === 0) {
    return { npcStatus: 'projection_gap', statusReason: 'trusted_rows_missing_from_projection' };
  }
  if (context.sourceRows.length > 0 && counts.relation === 0) {
    return { npcStatus: 'relation_gap', statusReason: 'materializable_source_missing_relation_rows' };
  }
  if (context.inheritanceRule && !hasTrustedInheritanceSource(inheritanceSourceCounts)) {
    return { npcStatus: 'relation_gap', statusReason: 'inheritance_source_lacks_trusted_structured_rows' };
  }
  if (context.runtimeFallback && !context.inheritanceRule) {
    return { npcStatus: 'runtime_fallback_only', statusReason: 'runtime_fallback_without_inheritance_contract' };
  }
  if (counts.projection > 0 && counts.relation === 0 && counts.local === 0) {
    return { npcStatus: 'projection_only', statusReason: 'projection_rows_without_trusted_local_or_relation_provenance' };
  }
  if (hasCountParityButIdentityMismatch(context)) {
    return { npcStatus: 'count_parity_only', statusReason: 'counts_match_but_row_identity_differs' };
  }
  if (context.sourceGap && !context.expectedZeroRule) {
    return { npcStatus: 'blocked_source_gap', statusReason: context.sourceGap.reason ?? 'source_gap_without_contract' };
  }
  if (isTrustedDirect(counts, context)) {
    if (context.inheritanceRule) {
      return { npcStatus: 'trusted_inherited_loot', statusReason: 'contract_backed_inherited_loot' };
    }
    return { npcStatus: 'trusted_direct_loot', statusReason: 'relation_projection_local_api_rows_match' };
  }
  if (context.inheritanceRule) {
    return { npcStatus: 'trusted_inherited_loot', statusReason: 'contract_backed_inherited_loot' };
  }
  if (context.expectedZeroRule) {
    return { npcStatus: 'expected_zero_loot', statusReason: context.expectedZeroRule.reason ?? 'contract_backed_expected_zero' };
  }
  if (counts.relation === 0 && counts.projection === 0 && counts.local === 0 && counts.api === 0) {
    return { npcStatus: 'unclassified_zero', statusReason: 'zero_loot_without_contract' };
  }
  return { npcStatus: 'unknown', statusReason: 'no_deterministic_classification' };
}

function buildNpcStatusRow(context, classification) {
  const counts = getCounts(context);
  const contractRef = context.expectedZeroRule
    ? `expected_zero:${context.npcInternalName}`
    : context.inheritanceRule
      ? `inheritance:${context.npcInternalName}->${normalizeText(context.inheritanceRule.sourceNpcInternalName ?? context.inheritanceRule.source_npc_internal_name)}`
      : null;
  return {
    npcInternalName: context.npcInternalName,
    npcName: normalizeText(context.npc.name ?? context.npc.npcName ?? context.npc.npc_name) ?? context.npcInternalName,
    npcType: normalizeText(context.npc.npcType ?? context.npc.npc_type) ?? (context.npc.isTownNpc ? 'town' : 'unknown'),
    npcStatus: classification.npcStatus,
    statusReason: classification.statusReason,
    sourceCoverageStatus: context.sourceCoverage?.sourceCoverageStatus
      ?? context.sourceGap?.reason
      ?? (context.sourceRows.length > 0 ? 'source_row_present' : 'unknown'),
    contractRef,
    relationLootCount: counts.relation,
    projectionLootCount: counts.projection,
    localLootCount: counts.local,
    apiLootCount: counts.api,
    maintSourceCount: Number(context.sourceCoverage?.maintSourceCount ?? context.sourceCoverage?.maint_source_count ?? 0),
    maintSourceRows: Array.isArray(context.sourceCoverage?.maintSourceRows)
      ? context.sourceCoverage.maintSourceRows
      : Array.isArray(context.sourceCoverage?.maint_source_rows)
        ? context.sourceCoverage.maint_source_rows
        : [],
    rowIdentityHash: computeNpcIdentityHash(context),
  };
}

function buildSummary({ npcStatuses, sourceRows, releaseBlockers }) {
  const statusCounts = Object.fromEntries(NPC_STATUSES.map((status) => [status, 0]));
  for (const row of npcStatuses) {
    statusCounts[row.npcStatus] = (statusCounts[row.npcStatus] ?? 0) + 1;
  }
  const sourceStatusCounts = {};
  for (const row of sourceRows) {
    sourceStatusCounts[row.sourceRowStatus] = (sourceStatusCounts[row.sourceRowStatus] ?? 0) + 1;
  }
  return {
    activeNpcs: npcStatuses.length,
    classifiedNpcs: npcStatuses.filter((row) => row.npcStatus !== 'unknown').length,
    trustedDirectLoot: statusCounts.trusted_direct_loot,
    trustedInheritedLoot: statusCounts.trusted_inherited_loot,
    expectedZeroLoot: statusCounts.expected_zero_loot,
    unclassifiedZero: statusCounts.unclassified_zero,
    blockedSourceGap: statusCounts.blocked_source_gap,
    blockedGenericBucket: sourceStatusCounts.blocked_generic_bucket ?? 0,
    blockedAmbiguousVariant: sourceStatusCounts.blocked_ambiguous_variant ?? 0,
    blockedNonNpcSource: sourceStatusCounts.blocked_non_npc_source ?? 0,
    reviewedNonNpcExclusion: sourceStatusCounts.reviewed_non_npc_source_exclusion ?? 0,
    blockedNonNpcSourcePromoted: 0,
    blockedMissingItemOrNpcIdentity: sourceStatusCounts.blocked_missing_item_or_npc_identity ?? 0,
    relationGap: statusCounts.relation_gap,
    projectionGap: statusCounts.projection_gap,
    localGap: statusCounts.local_gap,
    apiGap: statusCounts.api_gap,
    duplicateOrPolluted: statusCounts.duplicate_or_polluted,
    runtimeFallbackOnly: statusCounts.runtime_fallback_only,
    projectionOnly: statusCounts.projection_only,
    countParityOnly: statusCounts.count_parity_only,
    unknown: statusCounts.unknown,
    releaseBlockingCount: releaseBlockers.length,
  };
}

function buildBlockedReport(options, error) {
  return {
    auditName: 'npc-domain-loot-chain-audit',
    generatedAt: new Date().toISOString(),
    auditStatus: 'blocked',
    evidenceHealth: 'db_unavailable',
    summary: emptySummary(),
    npcStatuses: [],
    sourceRows: [],
    chainGaps: [],
    duplicates: [],
    blockedRows: [],
    releaseBlockers: [{
      type: 'audit_runtime',
      status: 'db_unavailable',
      reason: error?.message ?? String(error),
    }],
    contractHealth: { missing: [], loaded: [] },
    options: sanitizeOptions(options),
    error: {
      message: error?.message ?? String(error),
      code: error?.code ?? null,
    },
  };
}

function emptySummary() {
  return {
    activeNpcs: 0,
    classifiedNpcs: 0,
    trustedDirectLoot: 0,
    trustedInheritedLoot: 0,
    expectedZeroLoot: 0,
    unclassifiedZero: 0,
    blockedSourceGap: 0,
    blockedGenericBucket: 0,
    blockedAmbiguousVariant: 0,
    blockedNonNpcSource: 0,
    reviewedNonNpcExclusion: 0,
    blockedNonNpcSourcePromoted: 0,
    blockedMissingItemOrNpcIdentity: 0,
    relationGap: 0,
    projectionGap: 0,
    localGap: 0,
    apiGap: 0,
    duplicateOrPolluted: 0,
    runtimeFallbackOnly: 0,
    projectionOnly: 0,
    countParityOnly: 0,
    unknown: 0,
    releaseBlockingCount: 1,
  };
}

async function loadActiveNpcs(connection, options) {
  const [rows] = await connection.query(`
    SELECT
      internal_name AS internalName,
      name,
      CASE WHEN is_town_npc = 1 THEN 'town' ELSE COALESCE(CAST(npc_type AS CHAR), 'unknown') END AS npcType,
      is_town_npc AS isTownNpc
    FROM \`${options.localDatabase}\`.\`npcs\`
    WHERE deleted = 0 AND status = 1
    ORDER BY internal_name
  `);
  return rows;
}

async function loadSourceRows(connection, options) {
  const [rows] = await connection.query(`
    SELECT
      item_internal_name AS itemInternalName,
      item_name AS itemName,
      source_ref_name AS sourceRefName,
      source_ref_type AS sourceRefType,
      source_type AS sourceType,
      raw_json AS rawJson,
      record_key AS recordKey
    FROM \`${options.maintDatabase}\`.\`maint_item_sources\`
    WHERE source_ref_type = 'npc' AND source_type IN ('drop', 'loot')
    ORDER BY source_ref_name, item_internal_name
  `);
  return rows.map((row) => {
    const raw = parseJsonObject(row.rawJson);
    return {
      ...row,
      chanceText: raw.chanceText ?? raw.chance_text ?? null,
      quantityText: raw.quantityText ?? raw.quantity_text ?? null,
      conditions: raw.conditions ?? raw.conditionText ?? raw.condition_text ?? raw.notes ?? null,
      sourceRefInternalName: raw.sourceRefInternalName ?? raw.source_ref_internal_name ?? null,
      sourceRefResolution: raw.sourceRefResolution ?? raw.source_ref_resolution ?? null,
      candidateNpcInternalNames: raw.candidateNpcInternalNames ?? raw.candidate_npc_internal_names ?? [],
    };
  });
}

async function loadRelationLootRows(connection, options) {
  const [rows] = await connection.query(`
    SELECT npc_internal_name AS npcInternalName, item_internal_name AS itemInternalName, chance_text AS chanceText, quantity_text AS quantityText, conditions
    FROM \`${options.relationDatabase}\`.\`item_npc_loot_relations\`
    WHERE deleted = 0 AND status = 1
  `);
  return rows;
}

async function loadProjectionLootRows(connection, options) {
  const [rows] = await connection.query(`
    SELECT internal_name AS npcInternalName, loot_items_json AS lootItemsJson
    FROM \`${options.relationDatabase}\`.\`projection_npcs\`
    WHERE deleted = 0 AND status = 1 AND JSON_VALID(loot_items_json) = 1
  `);
  return rows.flatMap((row) => parseProjectionLootRows(row));
}

async function loadLocalLootRows(connection, options) {
  const [rows] = await connection.query(`
    SELECT
      n.internal_name AS npcInternalName,
      i.internal_name AS itemInternalName,
      l.quantity_text AS quantityText,
      l.chance_text AS chanceText,
      l.conditions
    FROM \`${options.localDatabase}\`.\`npc_loot_entries\` l
    JOIN \`${options.localDatabase}\`.\`npcs\` n ON n.id = l.npc_id
    JOIN \`${options.localDatabase}\`.\`items\` i ON i.id = l.item_id
    WHERE l.deleted = 0 AND n.deleted = 0 AND i.deleted = 0
  `);
  return rows;
}

async function loadSourceGaps(connection, options) {
  const coveragePath = path.join(repoRoot, 'reports', 'audit', `npc-source-coverage-inventory-${options.dateTag}.json`);
  try {
    const report = JSON.parse(await fs.readFile(coveragePath, 'utf8'));
    return (Array.isArray(report.npcs) ? report.npcs : []).map((row) => ({
      npcInternalName: row.npcInternalName,
      reason: row.sourceCoverageStatus,
      sourceCoverageStatus: row.sourceCoverageStatus,
      sourcePage: row.sourcePage,
      sourceUrl: row.sourceUrl,
      nextAction: row.nextAction,
      maintSourceCount: row.maintSourceCount ?? row.maint_source_count ?? null,
      maintSourceRows: Array.isArray(row.maintSourceRows)
        ? row.maintSourceRows
        : Array.isArray(row.maint_source_rows)
          ? row.maint_source_rows
          : [],
    }));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return [{
    npcInternalName: null,
    reason: 'source_coverage_report_missing',
    sourceCoverageStatus: 'source_coverage_report_missing',
    evidenceBlocker: true,
    reportPath: coveragePath,
  }];
}

async function loadRuntimeFallbackRows(connection, options) {
  return [];
}

async function loadApiLootRows(connection, options) {
  return [];
}

async function loadPollutionRows(connection, options) {
  return [];
}

async function loadContracts(options) {
  const expectedZeroPath = path.join(repoRoot, 'docs', 'contracts', 'npc-domain-expected-zero-contract.md');
  const inheritancePath = path.join(repoRoot, 'docs', 'contracts', 'npc-domain-loot-inheritance-contract.md');
  const reviewedNonNpcPath = path.join(repoRoot, 'docs', 'contracts', 'npc-domain-non-npc-source-exclusion-contract.md');
  const [expectedZero, inheritance, reviewedNonNpc] = await Promise.all([
    readContractRows(expectedZeroPath, 'expected_zero'),
    readContractRows(inheritancePath, 'inheritance'),
    readContractRows(reviewedNonNpcPath, 'reviewed_non_npc_source_exclusion'),
  ]);
  return {
    expectedZeroRules: expectedZero.rows,
    inheritanceRules: inheritance.rows,
    reviewedNonNpcSourceExclusions: reviewedNonNpc.rows,
    contractFiles: [
      { path: expectedZeroPath, status: expectedZero.status },
      { path: inheritancePath, status: inheritance.status },
      { path: reviewedNonNpcPath, status: reviewedNonNpc.status },
    ],
    options,
  };
}

async function readContractRows(contractPath, kind) {
  try {
    const text = await fs.readFile(contractPath, 'utf8');
    return { status: 'loaded', rows: parseMarkdownTableRows(text, kind) };
  } catch (error) {
    if (error?.code === 'ENOENT') return { status: 'missing', rows: [] };
    throw error;
  }
}

function parseMarkdownTableRows(text, kind) {
  const rows = [];
  const lines = String(text ?? '').split(/\r?\n/).filter((line) => line.trim().startsWith('|'));
  let headers = null;
  const requiredHeader = kind === 'inheritance'
    ? 'targetNpcInternalName'
    : kind === 'reviewed_non_npc_source_exclusion'
      ? 'sourceRefName'
      : 'npcInternalName';
  for (const line of lines) {
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length === 0 || cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    if (cells.includes(requiredHeader)) {
      headers = cells;
      continue;
    }
    if (!headers || !headers.includes(requiredHeader)) continue;
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? null]));
    rows.push(kind === 'inheritance'
      ? {
          targetNpcInternalName: row.targetNpcInternalName,
          sourceNpcInternalName: row.sourceNpcInternalName,
          inheritanceKind: row.inheritanceKind,
          evidenceSource: row.evidenceSource,
          reviewedBy: row.reviewedBy,
          reviewedAt: row.reviewedAt,
        }
      : kind === 'reviewed_non_npc_source_exclusion'
        ? {
            sourceType: row.sourceType,
            sourceRefType: row.sourceRefType,
            matchType: row.matchType,
            sourceRefName: row.sourceRefName,
            reason: row.reason,
            evidenceSource: row.evidenceSource,
            reviewedBy: row.reviewedBy,
            reviewedAt: row.reviewedAt,
            notes: row.notes,
          }
        : {
          npcInternalName: row.npcInternalName,
          reason: row.reason,
          evidenceSource: row.evidenceSource,
          reviewedBy: row.reviewedBy,
          reviewedAt: row.reviewedAt,
        });
  }
  return rows.filter((row) => {
    const key = normalizeText(row.npcInternalName ?? row.targetNpcInternalName ?? row.sourceRefName);
    return key && key !== '_none yet_';
  });
}

function normalizeSourceCoverage(sourceGaps = [], sourceCoverageRows = null) {
  const rawRows = Array.isArray(sourceCoverageRows) ? sourceCoverageRows : sourceGaps;
  const coverageRows = [];
  const blockers = [];
  for (const row of Array.isArray(rawRows) ? rawRows : []) {
    if (row?.evidenceBlocker) {
      blockers.push({
        type: 'evidence',
        status: row.sourceCoverageStatus ?? row.reason ?? 'source_coverage_unavailable',
        reason: row.reason ?? 'source_coverage_unavailable',
        reportPath: row.reportPath ?? null,
      });
      continue;
    }
    const npcInternalName = normalizeText(row.npcInternalName ?? row.npc_internal_name);
    if (!npcInternalName) continue;
    const sourceCoverageStatus = normalizeText(row.sourceCoverageStatus ?? row.source_coverage_status ?? row.reason);
    coverageRows.push({
      ...row,
      npcInternalName,
      sourceCoverageStatus,
      reason: sourceCoverageStatus,
    });
  }
  return {
    coverageRows,
    gapRows: coverageRows.filter((row) => ['source_page_missing', 'source_page_present_parse_failed', 'group_page_present_variant_not_extracted'].includes(row.sourceCoverageStatus)),
    blockers,
    evidenceHealth: blockers.length > 0 ? 'source_coverage_unavailable' : 'sufficient',
  };
}

function validateExpectedZeroRules(rows = []) {
  return validateContractRows(rows, (row) => {
    const npcInternalName = normalizeText(row.npcInternalName ?? row.npc_internal_name);
    const npcType = normalizeText(row.npcType ?? row.npc_type);
    const reason = normalizeText(row.reason);
    const evidenceSource = normalizeText(row.evidenceSource ?? row.evidence_source);
    const reviewedBy = normalizeText(row.reviewedBy ?? row.reviewed_by);
    const reviewedAt = normalizeText(row.reviewedAt ?? row.reviewed_at);
    if (!npcInternalName) return 'missing_npc_internal_name';
    if (!npcType) return 'missing_npc_type';
    if (!reason || !ALLOWED_EXPECTED_ZERO_REASONS.has(reason)) return 'invalid_expected_zero_reason';
    if (!evidenceSource) return 'missing_evidence_source';
    if (!reviewedBy) return 'missing_reviewed_by';
    if (!isIsoDate(reviewedAt)) return 'invalid_reviewed_at';
    return null;
  });
}

function validateInheritanceRules(rows = []) {
  return validateContractRows(rows, (row) => {
    const targetNpcInternalName = normalizeText(row.targetNpcInternalName ?? row.target_npc_internal_name);
    const sourceNpcInternalName = normalizeText(row.sourceNpcInternalName ?? row.source_npc_internal_name);
    const inheritanceKind = normalizeText(row.inheritanceKind ?? row.inheritance_kind);
    const evidenceSource = normalizeText(row.evidenceSource ?? row.evidence_source);
    const reviewedBy = normalizeText(row.reviewedBy ?? row.reviewed_by);
    const reviewedAt = normalizeText(row.reviewedAt ?? row.reviewed_at);
    if (!targetNpcInternalName) return 'missing_target_npc_internal_name';
    if (!sourceNpcInternalName) return 'missing_source_npc_internal_name';
    if (!inheritanceKind || !ALLOWED_INHERITANCE_KINDS.has(inheritanceKind)) return 'invalid_inheritance_kind';
    if (!evidenceSource) return 'missing_evidence_source';
    if (!reviewedBy) return 'missing_reviewed_by';
    if (!isIsoDate(reviewedAt)) return 'invalid_reviewed_at';
    return null;
  });
}

function validateReviewedNonNpcSourceExclusions(rows = []) {
  return validateContractRows(rows, (row) => {
    const sourceType = normalizeText(row.sourceType ?? row.source_type);
    const sourceRefType = normalizeText(row.sourceRefType ?? row.source_ref_type);
    const matchType = normalizeText(row.matchType ?? row.match_type);
    const sourceRefName = normalizeText(row.sourceRefName ?? row.source_ref_name);
    const reason = normalizeText(row.reason);
    const evidenceSource = normalizeText(row.evidenceSource ?? row.evidence_source);
    const reviewedBy = normalizeText(row.reviewedBy ?? row.reviewed_by);
    const reviewedAt = normalizeText(row.reviewedAt ?? row.reviewed_at);
    if (sourceType !== 'drop') return 'invalid_source_type';
    if (sourceRefType !== 'npc') return 'invalid_source_ref_type';
    if (!['exact', 'regex'].includes(matchType)) return 'invalid_match_type';
    if (!sourceRefName) return 'missing_source_ref_name';
    if (matchType === 'regex' && (!sourceRefName.startsWith('^') || !sourceRefName.endsWith('$'))) return 'unanchored_regex';
    if (!reason || !ALLOWED_NON_NPC_EXCLUSION_REASONS.has(reason)) return 'invalid_non_npc_exclusion_reason';
    if (!evidenceSource) return 'missing_evidence_source';
    if (!reviewedBy) return 'missing_reviewed_by';
    if (!isIsoDate(reviewedAt)) return 'invalid_reviewed_at';
    return null;
  });
}

function validateContractRows(rows, validate) {
  const validRows = [];
  const invalidRows = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const invalidReason = validate(row);
    if (invalidReason) invalidRows.push({ ...row, invalidReason });
    else validRows.push(row);
  }
  return { validRows, invalidRows };
}

function isIsoDate(value) {
  const text = normalizeText(value);
  return Boolean(text && /^\d{4}-\d{2}-\d{2}$/.test(text));
}

async function writeReport(report, options) {
  const outputPath = options.output
    ? path.resolve(repoRoot, options.output)
    : path.join(repoRoot, 'reports', 'audit', `npc-domain-loot-chain-${options.dateTag}.json`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return outputPath;
}

function parseProjectionLootRows(row) {
  const lootRows = parseJsonArray(row.lootItemsJson);
  return lootRows.map((lootRow) => ({
    npcInternalName: row.npcInternalName,
    itemInternalName: lootRow.itemInternalName ?? lootRow.internalName ?? lootRow.item_internal_name,
    chanceText: lootRow.chanceText ?? lootRow.chance_text,
    quantityText: lootRow.quantityText ?? lootRow.quantity_text,
    conditions: lootRow.conditions,
  })).filter((lootRow) => normalizeText(lootRow.itemInternalName));
}

function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getCounts(context) {
  return {
    relation: context.relationRows.length,
    projection: context.projectionRows.length,
    local: context.localRows.length,
    api: context.apiRows.length,
  };
}

function getInheritanceSourceCounts(context) {
  const sourceNpcInternalName = normalizeText(context.inheritanceRule?.sourceNpcInternalName ?? context.inheritanceRule?.source_npc_internal_name);
  if (!sourceNpcInternalName) {
    return { relation: 0, projection: 0, local: 0, api: 0 };
  }
  return {
    relation: (context.relationRowsByNpc?.get(sourceNpcInternalName) ?? []).length,
    projection: (context.projectionRowsByNpc?.get(sourceNpcInternalName) ?? []).length,
    local: (context.localRowsByNpc?.get(sourceNpcInternalName) ?? []).length,
    api: (context.apiRowsByNpc?.get(sourceNpcInternalName) ?? []).length,
  };
}

function hasTrustedInheritanceSource(counts) {
  return counts.relation > 0 && counts.projection > 0 && counts.local > 0;
}

function isTrustedDirect(counts, context) {
  if (!(counts.relation > 0 && counts.projection > 0 && counts.local > 0)) return false;
  if (context.apiRowsProvided && counts.api === 0) return false;
  return !hasCountParityButIdentityMismatch(context);
}

function hasCountParityButIdentityMismatch(context) {
  const sets = [
    identitySet(context.relationRows),
    identitySet(context.projectionRows),
    identitySet(context.localRows),
  ].filter((set) => set.size > 0);
  if (context.apiRowsProvided && context.apiRows.length > 0) {
    sets.push(identitySet(context.apiRows));
  }
  if (sets.length < 2) return false;
  const sizes = new Set(sets.map((set) => set.size));
  if (sizes.size !== 1) return false;
  const [first, ...rest] = sets;
  return rest.some((set) => !sameSet(first, set));
}

function computeNpcIdentityHash(context) {
  const values = [
    ...context.relationRows,
    ...context.projectionRows,
    ...context.localRows,
    ...context.apiRows,
  ].map((row) => computeRowIdentityHash({ ...row, npcInternalName: context.npcInternalName })).sort();
  return crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

function identitySet(rows) {
  return new Set(rows.map(computeRowIdentityHash));
}

function sameSet(left, right) {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

function groupRowsByNpc(rows = []) {
  const grouped = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const npcInternalName = normalizeText(row.npcInternalName ?? row.npc_internal_name);
    if (!npcInternalName) continue;
    if (!grouped.has(npcInternalName)) grouped.set(npcInternalName, []);
    grouped.get(npcInternalName).push(row);
  }
  return grouped;
}

function groupRowsBySourceNpc(rows = []) {
  const grouped = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const npcInternalName = normalizeText(row.targetNpcInternalName ?? row.sourceRefInternalName ?? row.source_ref_internal_name);
    if (!npcInternalName) continue;
    if (!grouped.has(npcInternalName)) grouped.set(npcInternalName, []);
    grouped.get(npcInternalName).push(row);
  }
  return grouped;
}

function keyBy(rows = [], keyFn) {
  const keyed = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = normalizeText(keyFn(row));
    if (key) keyed.set(key, row);
  }
  return keyed;
}

function buildContractHealth(input) {
  const files = Array.isArray(input.contractFiles) ? input.contractFiles : [];
  return {
    loaded: files.filter((file) => file.status === 'loaded').map((file) => file.path),
    missing: files.filter((file) => file.status === 'missing').map((file) => file.path),
    expectedZeroRules: Array.isArray(input.expectedZeroRules) ? input.expectedZeroRules.length : 0,
    inheritanceRules: Array.isArray(input.inheritanceRules) ? input.inheritanceRules.length : 0,
    reviewedNonNpcSourceExclusions: Array.isArray(input.reviewedNonNpcSourceExclusions) ? input.reviewedNonNpcSourceExclusions.length : 0,
    invalidReviewedNonNpcSourceExclusions: input.invalidReviewedNonNpcSourceExclusions ?? [],
  };
}

function isActiveNpc(npc = {}) {
  if (!normalizeText(npc.internalName ?? npc.internal_name)) return false;
  if (npc.deleted === 1 || npc.deleted === true) return false;
  if (npc.status === 0 || npc.status === '0') return false;
  return true;
}

function normalizeOptions(options = {}) {
  return {
    maintDatabase: options.maintDatabase ?? DEFAULTS.maintDatabase,
    relationDatabase: options.relationDatabase ?? DEFAULTS.relationDatabase,
    localDatabase: options.localDatabase ?? DEFAULTS.localDatabase,
    writeReport: options.writeReport ?? DEFAULTS.writeReport,
    output: options.output ?? null,
    dateTag: options.dateTag ?? DEFAULTS.dateTag,
    requireApiEvidence: options.requireApiEvidence ?? DEFAULTS.requireApiEvidence,
  };
}

function sanitizeOptions(options = {}) {
  return {
    maintDatabase: options.maintDatabase ?? DEFAULTS.maintDatabase,
    relationDatabase: options.relationDatabase ?? DEFAULTS.relationDatabase,
    localDatabase: options.localDatabase ?? DEFAULTS.localDatabase,
    writeReport: options.writeReport ?? DEFAULTS.writeReport,
    dateTag: options.dateTag ?? DEFAULTS.dateTag,
    requireApiEvidence: options.requireApiEvidence ?? DEFAULTS.requireApiEvidence,
  };
}

function normalizeList(values) {
  if (Array.isArray(values)) return values.map(normalizeText).filter(Boolean);
  if (typeof values === 'string') return values.split(',').map(normalizeText).filter(Boolean);
  return [];
}

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function booleanOption(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'y'].includes(String(value).trim().toLowerCase());
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const options = parseArgs();
  const result = await runNpcDomainLootChainAudit(options);
  console.log(`Audit status: ${result.report.auditStatus}`);
  console.log(`Evidence health: ${result.report.evidenceHealth}`);
  console.log(`Active NPCs: ${result.report.summary.activeNpcs}`);
  console.log(`Release blockers: ${result.report.summary.releaseBlockingCount}`);
  if (result.reportPath) {
    console.log(`Report: ${result.reportPath}`);
  }
  if (result.report.auditStatus === 'blocked') {
    process.exitCode = 2;
  }
}
