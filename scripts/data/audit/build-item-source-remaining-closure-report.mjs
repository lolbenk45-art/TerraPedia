#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import { parseCliArgs, writeJson } from '../lib/wiki-item-utils.mjs';

const repoRoot = getProjectRoot();
const require = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'));

const CLOSURE_LANES = [
  'local_source_already_present',
  'recipe_or_shimmer_chain_covered',
  'biome_evidence_projection',
  'npc_relation_chain_gap',
  'family_policy_candidate',
  'needs_external_source_evidence',
  'explicit_no_source_exemption_candidate',
  'missing_required_raw_evidence',
  'runtime_or_developer_internal',
  'manual_review_required'
];

const MUTATION_FLAGS = new Set([
  'apply',
  'write-db',
  'sync',
  'import',
  'materialize',
  'backfill',
  'refresh',
  'pipeline',
  'crawler',
  'fetch',
  'flyway',
  'delete',
  'truncate',
  'drop',
  'alter'
]);

const CATEGORY_BY_CODE = new Map([
  ['FURNITURE', '家具'],
  ['MATERIAL', '材料'],
  ['CONSUMABLE', '消耗品'],
  ['ARMOR_PART_HEAD', '头盔'],
  ['ARMOR_PART_BODY', '胸甲'],
  ['ARMOR_PART_LEGS', '护腿'],
  ['UNCATEGORIZED', '未分类'],
  ['WEAPON', '武器'],
  ['TOOL', '工具'],
  ['TOOL_AXE', '斧类'],
  ['TOOL_CHAINSAW', '链锯'],
  ['FURNITURE_STORAGE', '收纳家具'],
  ['MOUNT', '坐骑召唤']
]);

export function parseBuildItemSourceRemainingClosureReportArgs(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  for (const [key, value] of Object.entries(options)) {
    if (MUTATION_FLAGS.has(key.toLowerCase()) && value !== false && value !== 'false') {
      throw new Error(`read-only remaining closure report refuses mutation flag: --${key}`);
    }
  }
  return {
    baselinePath: options.baseline ?? null,
    coveragePlanPath: options['coverage-plan'] ?? options.coveragePlan ?? null,
    sourceQualityPath: options['source-quality-report'] ?? options.sourceQualityReport ?? null,
    outputPath: options.output ?? null,
    writeSourceQualityOnlyPath: options['write-source-quality-only'] ?? options.writeSourceQualityOnly ?? null,
    localDatabase: options['local-database'] ?? options.localDatabase ?? 'terria_v1_local',
    host: options.host ?? null,
    port: options.port ?? null,
    user: options.user ?? null,
    password: options.password ?? null
  };
}

export function buildItemSourceRemainingClosureReport({
  generatedAt = new Date().toISOString(),
  baselinePath = null,
  coveragePlanPath = null,
  sourceQualityPath = null,
  baselineReport = {},
  coveragePlan = {},
  sourceRowQuality = {}
} = {}) {
  const warnings = [];
  const baselineRows = Array.isArray(baselineReport.rows) ? baselineReport.rows : [];
  assertUniqueBaselineRows(baselineRows);

  const activeSourceLackingRows = baselineRows
    .filter((row) => Number(row.activeSourceCount ?? 0) === 0)
    .map((row) => normalizeBaselineRow(row));
  const denominator = Number(baselineReport.summary?.itemsWithoutActiveSources ?? activeSourceLackingRows.length);
  if (denominator !== activeSourceLackingRows.length) {
    throw new Error(`denominator mismatch: baseline summary has ${denominator}, active-source-lacking rows have ${activeSourceLackingRows.length}`);
  }

  const coverageRows = Array.isArray(coveragePlan.rows) ? coveragePlan.rows : [];
  const coverageByItemId = new Map(coverageRows.map((row) => [Number(row.itemId), row]));
  const baselineIds = new Set(baselineRows.map((row) => Number(row.itemId ?? row.id)).filter(Number.isFinite));
  const unmatchedCoverageRows = coverageRows
    .filter((row) => Number.isFinite(Number(row.itemId)) && !baselineIds.has(Number(row.itemId)))
    .map((row) => normalizeCoverageWarningRow(row));

  const rows = activeSourceLackingRows
    .map((row) => buildClosureRow(row, coverageByItemId.get(row.itemId), { baselinePath, coveragePlanPath, sourceQualityPath }))
    .sort((a, b) => a.itemId - b.itemId);

  assertClosureRows(rows);
  const rowsByLane = buildRowsByLane(rows);
  const laneCounts = buildLaneCounts(rowsByLane);
  const categoryBreakdownByLane = buildCategoryBreakdownByLane(rowsByLane);
  const sampleRowsByLane = buildSampleRowsByLane(rowsByLane);
  const staleNpcRefGapRows = buildStaleNpcRefGapRows(coverageRows, sourceRowQuality, {
    generatedAt,
    coveragePlanPath,
    oldNpcRefResolutionGapCount: Number(coveragePlan.summary?.npcRefResolutionGap ?? 0)
  });

  if (staleNpcRefGapRows.length > 0) {
    warnings.push(
      `coverage report ${coveragePlanPath ?? '(inline)'} has npcRefResolutionGap=${Number(coveragePlan.summary?.npcRefResolutionGap ?? staleNpcRefGapRows.length)} but current missingNpcBossRefRows=${numberValue(sourceRowQuality.missingNpcBossRefRows)}`
    );
  }
  const reconciliations = buildReconciliations(baselineReport, coveragePlan, sourceRowQuality, warnings);
  if (unmatchedCoverageRows.length > 0) {
    warnings.push(`coverage rows unmatched to active-source-lacking baseline rows: ${unmatchedCoverageRows.length}`);
  }

  const laneCountSum = Object.values(laneCounts).reduce((sum, count) => sum + count, 0);
  const uniqueItemIds = new Set(rows.map((row) => row.itemId)).size;

  return {
    generatedAt,
    readOnly: true,
    entity: 'item_source_remaining_closure_report',
    inputs: {
      baselinePath,
      coveragePlanPath,
      sourceQualityPath,
      baselineGeneratedAt: baselineReport.generatedAt ?? null,
      coveragePlanGeneratedAt: coveragePlan.generatedAt ?? null,
      sourceQualityGeneratedAt: sourceRowQuality.generatedAt ?? sourceRowQualityReportGeneratedAt(sourceRowQuality) ?? null
    },
    summary: {
      totalBaselineRows: baselineRows.length,
      totalRows: rows.length,
      denominator,
      uniqueItemIds,
      laneCountSum,
      unclassifiedOpen: rows.filter((row) => !row.closureLane).length,
      laneCounts,
      zeroCountLanes: Object.fromEntries(CLOSURE_LANES.map((lane) => [lane, laneCounts[lane] ?? 0]).filter(([, count]) => count === 0)),
      localSourceAlreadyPresent: Number(baselineReport.summary?.localSourceAlreadyPresent ?? 0),
      itemsWithoutActiveSources: denominator,
      manualReviewRequired: laneCounts.manual_review_required ?? 0,
      needsExternalSourceEvidence: laneCounts.needs_external_source_evidence ?? 0,
      explicitNoSourceExemptionCandidate: laneCounts.explicit_no_source_exemption_candidate ?? 0,
      missingRequiredRawEvidence: laneCounts.missing_required_raw_evidence ?? 0,
      familyPolicyCandidate: laneCounts.family_policy_candidate ?? 0,
      staleNpcRefGapWarning: staleNpcRefGapRows.length > 0,
      unmatchedCoverageRows: unmatchedCoverageRows.length,
      sourceRowQuality: normalizeSourceQuality(sourceRowQuality),
      reconciliations
    },
    warnings,
    staleNpcRefGapRows,
    unmatchedCoverageRows,
    categoryBreakdownByLane,
    sampleRowsByLane,
    rowsByLane,
    rows
  };
}

export async function runBuildItemSourceRemainingClosureReport(options = {}, dependencies = {}) {
  if (options.writeSourceQualityOnlyPath) {
    const qualityReport = await buildCurrentSourceRowQualityReport(options, dependencies);
    writeJson(path.resolve(process.cwd(), options.writeSourceQualityOnlyPath), qualityReport);
    return qualityReport;
  }
  if (!options.baselinePath || !options.coveragePlanPath || !options.sourceQualityPath) {
    throw new Error('required: --baseline, --coverage-plan, --source-quality-report');
  }
  const baselineReport = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), options.baselinePath), 'utf8'));
  const coveragePlan = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), options.coveragePlanPath), 'utf8'));
  const sourceQualityReport = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), options.sourceQualityPath), 'utf8'));
  const sourceRowQuality = sourceQualityReport.sourceRowQuality ?? sourceQualityReport.summary?.sourceRowQuality ?? sourceQualityReport.summary ?? sourceQualityReport;
  if (sourceQualityReport.generatedAt && !sourceRowQuality.generatedAt) {
    sourceRowQuality.generatedAt = sourceQualityReport.generatedAt;
  }
  const report = buildItemSourceRemainingClosureReport({
    baselinePath: options.baselinePath,
    coveragePlanPath: options.coveragePlanPath,
    sourceQualityPath: options.sourceQualityPath,
    baselineReport,
    coveragePlan,
    sourceRowQuality
  });
  if (options.outputPath) {
    writeJson(path.resolve(process.cwd(), options.outputPath), report);
  }
  return report;
}

export async function buildCurrentSourceRowQualityReport(options = {}, dependencies = {}) {
  const config = dependencies.config ?? loadLocalStackConfig(repoRoot);
  const mysqlModule = dependencies.mysqlModule ?? require('mysql2/promise');
  const connectionConfig = {
    host: options.host ?? process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
    port: Number(options.port ?? process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 13306),
    user: options.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
    password: options.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
    database: options.localDatabase ?? process.env.TERRAPEDIA_DB_NAME ?? config.database?.name ?? 'terria_v1_local'
  };
  if (connectionConfig.database !== 'terria_v1_local') {
    throw new Error(`Refusing source-row quality audit against non-local database: ${connectionConfig.database}`);
  }

  const connection = dependencies.connection ?? await mysqlModule.createConnection(connectionConfig);
  const shouldClose = !dependencies.connection;
  try {
    const [rows] = await connection.query(`
      SELECT
        SUM(CASE WHEN source_ref_type IN ('npc','boss') AND source_ref_id IS NULL AND status = 1 AND deleted = 0 THEN 1 ELSE 0 END) AS missingNpcBossRefRows,
        SUM(CASE WHEN source_ref_type = 'unknown' AND status = 1 AND deleted = 0 THEN 1 ELSE 0 END) AS unknownSourceRefRows,
        SUM(CASE WHEN source_page LIKE 'http%' AND status = 1 AND deleted = 0 THEN 1 ELSE 0 END) AS wikiUrlSourcePageRows,
        SUM(CASE WHEN source_ref_type <> 'biome_wikitext' AND (source_ref_name IS NULL OR TRIM(source_ref_name) = '') AND status = 1 AND deleted = 0 THEN 1 ELSE 0 END) AS emptyRuntimeSourceNameRows,
        SUM(CASE WHEN source_ref_type = 'biome_wikitext' AND (source_ref_name IS NULL OR TRIM(source_ref_name) = '') AND status = 1 AND deleted = 0 THEN 1 ELSE 0 END) AS emptyBiomeWikitextNameRowsPreserved,
        COUNT(*) AS activeRows
      FROM item_acquisition_sources
      WHERE status = 1 AND deleted = 0
    `);
    return {
      generatedAt: new Date().toISOString(),
      readOnly: true,
      entity: 'item_source_row_quality_snapshot',
      connection: {
        host: connectionConfig.host,
        port: connectionConfig.port,
        database: connectionConfig.database
      },
      sourceRowQuality: normalizeSourceQuality(rows[0] ?? {})
    };
  } finally {
    if (shouldClose) {
      await connection.end();
    }
  }
}

function buildClosureRow(row, coverageRow, paths) {
  const lane = resolveClosureLane(row, coverageRow);
  const rule = resolveClassificationRule(row, coverageRow, lane);
  const sourceEvidenceStatus = resolveSourceEvidenceStatus(row, coverageRow, lane);
  const failedRules = lane === 'manual_review_required' ? buildFailedRules(row, coverageRow) : [];
  return {
    itemId: row.itemId,
    internalName: row.internalName,
    name: row.name,
    categoryCode: row.categoryCode,
    categoryName: row.categoryName,
    activeSourceCount: row.activeSourceCount,
    baselineBucket: row.primaryBucket,
    coverageLane: coverageRow?.lane ?? null,
    closureLane: lane,
    closureReason: resolveClosureReason(row, coverageRow, lane),
    classificationRule: rule,
    sourceEvidenceStatus,
    sourceReportPaths: [paths.baselinePath, paths.coveragePlanPath, paths.sourceQualityPath].filter(Boolean),
    failedRules,
    coverageBlockedReason: coverageRow?.blockedReason ?? null,
    ...(coverageRow?.terminalClosureStatus ? {
      terminalClosureStatus: coverageRow.terminalClosureStatus,
      terminalRecommendedNextAction: coverageRow.terminalRecommendedNextAction ?? null
    } : {}),
    evidence: [
      ...(Array.isArray(row.evidence) ? row.evidence : []),
      ...(Array.isArray(coverageRow?.evidence) ? coverageRow.evidence : [])
    ]
  };
}

function resolveClosureLane(row, coverageRow) {
  if (coverageRow?.lane === 'family_policy_candidate') return 'family_policy_candidate';
  if (coverageRow?.lane === 'explicit_no_source_exemption') return 'explicit_no_source_exemption_candidate';
  if (coverageRow?.lane === 'missing_required_raw_evidence') return 'missing_required_raw_evidence';
  if (row.primaryBucket === 'recipe_chain_covered' || row.hasRecipe) return 'recipe_or_shimmer_chain_covered';
  if (row.primaryBucket === 'biome_evidence_only' || row.hasBiomeEvidence) return 'biome_evidence_projection';
  if (row.primaryBucket === 'npc_relation_chain_gap' || row.hasNpcLootOrShop || coverageRow?.lane === 'npc_ref_resolution_gap') return 'npc_relation_chain_gap';
  if (isExternalEvidenceCandidate(row)) return 'needs_external_source_evidence';
  if (isExplicitNoSourceExemptionCandidate(row)) return 'explicit_no_source_exemption_candidate';
  if (isRuntimeOrDeveloperInternal(row)) return 'runtime_or_developer_internal';
  return 'manual_review_required';
}

function resolveClassificationRule(row, coverageRow, lane) {
  if (lane === 'family_policy_candidate') return coverageRow?.blockedReason ?? 'coverage_family_policy_candidate';
  if (lane === 'recipe_or_shimmer_chain_covered') return 'baseline_recipe_or_shimmer_evidence';
  if (lane === 'biome_evidence_projection') return 'baseline_biome_evidence_projection';
  if (lane === 'npc_relation_chain_gap') return 'baseline_npc_relation_chain_gap';
  if (lane === 'explicit_no_source_exemption_candidate' && coverageRow?.exemptionRule) return coverageRow.exemptionRule;
  if (lane === 'explicit_no_source_exemption_candidate') return 'deterministic_no_source_exemption_candidate';
  if (lane === 'missing_required_raw_evidence') return 'terminal_missing_required_raw_evidence';
  if (lane === 'runtime_or_developer_internal') return 'deterministic_runtime_or_developer_internal';
  if (lane === 'needs_external_source_evidence') return 'deterministic_obtainable_shape_absent_local_evidence';
  return 'manual_review_no_deterministic_rule_matched';
}

function resolveClosureReason(row, coverageRow, lane) {
  if (lane === 'family_policy_candidate') return `coverage plan blocks family-page source rows: ${coverageRow?.blockedReason ?? 'family_policy_candidate'}`;
  if (lane === 'recipe_or_shimmer_chain_covered') return 'item has recipe or shimmer coverage and does not require an acquisition source row in this lane';
  if (lane === 'biome_evidence_projection') return 'item has biome evidence that should be projected, not inserted as a fabricated source row';
  if (lane === 'npc_relation_chain_gap') return 'baseline has NPC loot/shop relation evidence but no current local item source row; keep named for a future relation projection lane';
  if (lane === 'explicit_no_source_exemption_candidate' && coverageRow?.terminalClosureStatus) return `terminal closure marks item as ${coverageRow.terminalClosureStatus}; no item acquisition source row should be imported without identity review`;
  if (lane === 'explicit_no_source_exemption_candidate') return 'item appears to be a deterministic no-source or unreleased/internal exemption candidate';
  if (lane === 'missing_required_raw_evidence') return 'terminal closure found a source-like item but the exact required raw evidence is missing; do not fabricate a source row';
  if (lane === 'runtime_or_developer_internal') return 'item appears to be runtime, internal, inactive, or developer/internal content without obtainable source evidence';
  if (lane === 'needs_external_source_evidence') return 'no local source evidence exists in current artifacts; external source evidence refresh or manual source review is required';
  return 'no deterministic rule matched; row remains fully enumerated for manual classification';
}

function resolveSourceEvidenceStatus(row, coverageRow, lane) {
  if (row.evidence?.length > 0 || row.hasRecipe || row.hasBiomeEvidence || row.hasNpcLootOrShop) return 'local_evidence_present';
  if (lane === 'explicit_no_source_exemption_candidate' && coverageRowHasTerminalEvidence(coverageRow)) return 'terminal_closure_evidence';
  if (lane === 'missing_required_raw_evidence') return 'missing_required_raw_evidence';
  if (lane === 'family_policy_candidate') return 'blocked_family_page_evidence';
  if (lane === 'manual_review_required') return 'absent_local_evidence_manual_review';
  return 'absent_local_evidence';
}

function buildFailedRules(row, coverageRow) {
  const failed = [];
  if (coverageRow?.lane !== 'family_policy_candidate') failed.push('not_family_policy_candidate');
  if (!(row.primaryBucket === 'recipe_chain_covered' || row.hasRecipe)) failed.push('not_recipe_or_shimmer_covered');
  if (!(row.primaryBucket === 'biome_evidence_only' || row.hasBiomeEvidence)) failed.push('not_biome_evidence_projection');
  if (!(row.primaryBucket === 'npc_relation_chain_gap' || row.hasNpcLootOrShop || coverageRow?.lane === 'npc_ref_resolution_gap')) failed.push('not_npc_relation_chain_gap');
  if (!(coverageRow?.lane === 'explicit_no_source_exemption' || isExplicitNoSourceExemptionCandidate(row))) failed.push('not_explicit_no_source_exemption_candidate');
  if (coverageRow?.lane !== 'missing_required_raw_evidence') failed.push('not_missing_required_raw_evidence');
  if (!isRuntimeOrDeveloperInternal(row)) failed.push('not_runtime_or_developer_internal');
  if (!isExternalEvidenceCandidate(row)) failed.push('not_needs_external_source_evidence');
  return failed;
}

function coverageRowHasTerminalEvidence(row) {
  return Array.isArray(row?.evidence) && row.evidence.some((entry) => entry?.kind === 'terminal_closure_status');
}

function isExplicitNoSourceExemptionCandidate(row) {
  const identity = normalizeIdentity(`${row.internalName} ${row.name}`);
  return [
    'firstfractal',
    'boringbow',
    'sleepingicon',
    'coloronlydye',
    'foxparkstageffect',
    'manacloakstar'
  ].some((token) => identity.includes(token));
}

function isRuntimeOrDeveloperInternal(row) {
  const text = normalizeIdentity(`${row.internalName} ${row.name}`);
  const display = normalizeText(`${row.internalName} ${row.name}`).toLowerCase();
  return (
    display.includes('(inactive)')
    || text.includes('bossbag')
    || text.includes('tag effect')
    || text.includes('tageffect')
    || text.includes('fake')
    || text.includes('developer')
    || text.includes('unused')
    || text.includes('test')
    || /^(aaron|arkhalis|cenx|chickenbones|chippy|crowno|dtown|foodbarbarian|ghostar|groxthegreat|heroicis|jim|kazzymodus|lazure|leinfors|loki|luna|red|safeman|skiphs|will|yoraiz0r)/.test(text)
  );
}

function isExternalEvidenceCandidate(row) {
  const text = normalizeIdentity(`${row.internalName} ${row.name} ${row.categoryCode}`);
  return (
    /banner|statue|pylon|trophy|relic|painting|monolith|bucket|fish|critter|butterfly|dragonfly|goldfish|star|dye|hook|rod|mount|weapon|armor|helmet|mask|shirt|pants|wings|tool|axe|chainsaw|hammer|consumable|material|furniture|storage|chest|crate|present|key|mold|sword|bow|yoyo|flower|cap|backpack|javelin/.test(text)
  );
}

function normalizeBaselineRow(row) {
  const itemId = Number(row.itemId ?? row.id);
  const internalName = normalizeText(row.internalName ?? row.itemInternalName);
  const name = normalizeText(row.name ?? row.itemName);
  if (!Number.isFinite(itemId) || !internalName || !name) {
    throw new Error(`missing required item identity for itemId=${row.itemId ?? row.id ?? '(missing)'}`);
  }
  return {
    ...row,
    itemId,
    internalName,
    name,
    activeSourceCount: Number(row.activeSourceCount ?? 0),
    categoryCode: normalizeText(row.categoryCode ?? row.category_code ?? 'UNCATEGORIZED'),
    categoryName: normalizeText(row.categoryName ?? row.category_name ?? CATEGORY_BY_CODE.get(row.categoryCode) ?? '未分类')
  };
}

function assertUniqueBaselineRows(rows) {
  const seen = new Set();
  for (const row of rows) {
    const itemId = Number(row.itemId ?? row.id);
    if (!Number.isFinite(itemId)) continue;
    if (seen.has(itemId)) {
      throw new Error(`duplicate baseline itemId: ${itemId}`);
    }
    seen.add(itemId);
  }
}

function assertClosureRows(rows) {
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.itemId)) throw new Error(`duplicate closure itemId: ${row.itemId}`);
    seen.add(row.itemId);
    for (const field of ['closureLane', 'closureReason', 'classificationRule', 'sourceEvidenceStatus']) {
      if (!row[field]) throw new Error(`row missing closure field ${field}: ${row.itemId}`);
    }
    if (!Array.isArray(row.sourceReportPaths)) throw new Error(`row missing sourceReportPaths: ${row.itemId}`);
  }
}

function buildRowsByLane(rows) {
  const byLane = Object.fromEntries(CLOSURE_LANES.map((lane) => [lane, []]));
  for (const row of rows) {
    byLane[row.closureLane] ??= [];
    byLane[row.closureLane].push(row);
  }
  return byLane;
}

function buildLaneCounts(rowsByLane) {
  return Object.fromEntries(CLOSURE_LANES.map((lane) => [lane, rowsByLane[lane]?.length ?? 0]));
}

function buildCategoryBreakdownByLane(rowsByLane) {
  const breakdown = {};
  for (const [lane, rows] of Object.entries(rowsByLane)) {
    const byCategory = new Map();
    for (const row of rows) {
      const categoryCode = row.categoryCode ?? 'UNCATEGORIZED';
      const entry = byCategory.get(categoryCode) ?? {
        categoryCode,
        categoryName: row.categoryName ?? CATEGORY_BY_CODE.get(categoryCode) ?? '未分类',
        rowCount: 0,
        items: []
      };
      entry.rowCount += 1;
      entry.items.push({ itemId: row.itemId, internalName: row.internalName, name: row.name });
      byCategory.set(categoryCode, entry);
    }
    breakdown[lane] = [...byCategory.values()].sort((a, b) => b.rowCount - a.rowCount || a.categoryCode.localeCompare(b.categoryCode));
  }
  return breakdown;
}

function buildSampleRowsByLane(rowsByLane) {
  return Object.fromEntries(Object.entries(rowsByLane).map(([lane, rows]) => [
    lane,
    rows.slice(0, 3).map((row) => ({
      itemId: row.itemId,
      internalName: row.internalName,
      name: row.name,
      categoryCode: row.categoryCode,
      closureReason: row.closureReason,
      sourceEvidenceStatus: row.sourceEvidenceStatus
    }))
  ]));
}

function buildStaleNpcRefGapRows(coverageRows, sourceRowQuality, metadata = {}) {
  if (numberValue(sourceRowQuality.missingNpcBossRefRows) !== 0) return [];
  return coverageRows
    .filter((row) => row.lane === 'npc_ref_resolution_gap')
    .map((row) => ({
      itemId: Number(row.itemId),
      internalName: normalizeText(row.internalName),
      name: normalizeText(row.name),
      inputReportPath: metadata.coveragePlanPath ?? null,
      oldNpcRefResolutionGapCount: numberValue(metadata.oldNpcRefResolutionGapCount),
      currentMissingNpcBossRefRows: numberValue(sourceRowQuality.missingNpcBossRefRows),
      closureReportGeneratedAt: metadata.generatedAt ?? null,
      oldLane: row.lane,
      oldBlockedReason: row.blockedReason ?? null,
      evidence: Array.isArray(row.evidence) ? row.evidence : [],
      staleReason: 'current source-row quality has zero missing npc/boss source_ref_id rows'
    }));
}

function sourceRowQualityReportGeneratedAt(sourceRowQuality) {
  return typeof sourceRowQuality.generatedAt === 'string' ? sourceRowQuality.generatedAt : null;
}

function buildReconciliations(baselineReport, coveragePlan, sourceRowQuality, warnings) {
  const baselineNpc = Number(baselineReport.summary?.npcRelationChainGap ?? 0);
  const coverageNpc = Number(coveragePlan.summary?.npcRefResolutionGap ?? 0);
  const baselineBiome = Number(baselineReport.summary?.biomeEvidenceOnly ?? 0);
  const coverageBiome = Number(coveragePlan.summary?.biomeEvidenceProjection ?? 0);
  const emptyBiome = numberValue(sourceRowQuality.emptyBiomeWikitextNameRowsPreserved);
  const result = {
    baselineNpcRelationChainGap: baselineNpc,
    coverageNpcRefResolutionGap: coverageNpc,
    baselineBiomeEvidenceOnly: baselineBiome,
    coverageBiomeEvidenceProjection: coverageBiome,
    emptyBiomeWikitextNameRowsPreserved: emptyBiome
  };
  if (baselineNpc !== coverageNpc) warnings.push(`npc gap reconciliation differs: baseline=${baselineNpc}, coverage=${coverageNpc}`);
  if (baselineBiome !== coverageBiome) warnings.push(`biome evidence reconciliation differs: baseline=${baselineBiome}, coverage=${coverageBiome}`);
  return result;
}

function normalizeCoverageWarningRow(row) {
  return {
    itemId: Number(row.itemId),
    internalName: normalizeText(row.internalName),
    name: normalizeText(row.name),
    lane: row.lane ?? null,
    blockedReason: row.blockedReason ?? null
  };
}

function normalizeSourceQuality(value = {}) {
  return {
    missingNpcBossRefRows: numberValue(value.missingNpcBossRefRows ?? value.npcBossMissingRefRows),
    unknownSourceRefRows: numberValue(value.unknownSourceRefRows),
    wikiUrlSourcePageRows: numberValue(value.wikiUrlSourcePageRows),
    emptyRuntimeSourceNameRows: numberValue(value.emptyRuntimeSourceNameRows),
    emptyBiomeWikitextNameRowsPreserved: numberValue(value.emptyBiomeWikitextNameRowsPreserved),
    activeRows: numberValue(value.activeRows)
  };
}

function numberValue(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeIdentity(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const report = await runBuildItemSourceRemainingClosureReport(parseBuildItemSourceRemainingClosureReportArgs());
    process.stdout.write(`${JSON.stringify(report.summary ?? report.sourceRowQuality, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
