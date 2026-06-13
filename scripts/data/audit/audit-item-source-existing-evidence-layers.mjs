#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import { parseCliArgs, writeJson } from '../lib/wiki-item-utils.mjs';

const repoRoot = getProjectRoot();
const require = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'));

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
  'alter',
  'write'
]);

const EVIDENCE_LAYERS = [
  'active_source_present',
  'terminal_exempt_or_identity_review',
  'missing_required_raw_evidence',
  'recipe_or_shimmer_covered',
  'npc_relation_not_projected',
  'biome_projection_pending',
  'maint_or_relation_not_published',
  'candidate_import_not_applied',
  'raw_candidate_not_projected',
  'family_policy_pending',
  'item_only_no_source_evidence'
];

const LAYER_LABELS = {
  active_source_present: 'active 来源已存在，剩余报告可能过期',
  terminal_exempt_or_identity_review: 'terminal/身份审查豁免',
  missing_required_raw_evidence: '缺精确 raw evidence',
  recipe_or_shimmer_covered: 'recipe/shimmer 专属结构已覆盖',
  npc_relation_not_projected: 'NPC 掉落/商店关系未投影',
  biome_projection_pending: 'biome/location 证据待投影',
  maint_or_relation_not_published: 'maint/relation 证据未发布到 local',
  candidate_import_not_applied: '候选导入计划未 apply/publish',
  raw_candidate_not_projected: 'raw 页面已提取但未进入候选导入/发布',
  family_policy_pending: 'family/shared 页面策略待解析',
  item_only_no_source_evidence: '只有 item 实体，未找到已检查来源证据'
};

const NEXT_ACTIONS = {
  active_source_present: '先重建 closure report 或排查 stale report，不做数据导入。',
  terminal_exempt_or_identity_review: '保留为豁免/身份审查，不导入普通 item source。',
  missing_required_raw_evidence: '补精确 raw evidence 后再解析，不能用相似页面猜来源。',
  recipe_or_shimmer_covered: '验证 backend/API/UI 展示 recipe/shimmer，不重复写普通 source row。',
  npc_relation_not_projected: '检查 NPC loot/shop 到 item detail/API 的投影链。',
  biome_projection_pending: '检查 biome/location 关系投影，不伪造成普通 drop/shop。',
  maint_or_relation_not_published: '制定 relation/maint publication dry-run，不直接手写 SQL。',
  candidate_import_not_applied: '跑 local compat candidate dry-run，审查 validation/duplicate 后再申请 apply。',
  raw_candidate_not_projected: '把 raw candidates 重新生成 focused candidate import plan。',
  family_policy_pending: '按 family page/sourcePage 做精确 policy parser。',
  item_only_no_source_evidence: '按类别和名称分组，再决定是否需要补 raw evidence。'
};

export function parseAuditItemSourceExistingEvidenceLayersArgs(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  for (const [key, value] of Object.entries(options)) {
    if (MUTATION_FLAGS.has(key.toLowerCase()) && value !== false && value !== 'false') {
      throw new Error(`read-only existing evidence audit refuses mutation flag: --${key}`);
    }
  }
  return {
    closureReportPath: options['closure-report'] ?? options.closureReport ?? 'data/reports/item-source-remaining-closure-2026-06-11-current.json',
    coveragePlanPath: options['coverage-plan'] ?? options.coveragePlan ?? 'data/reports/item-source-gap-coverage-plan-2026-06-11-current.json',
    rawCandidatesPath: options['raw-candidates'] ?? options.rawCandidates ?? 'data/reports/item-source-raw-page-candidates-2026-06-11-current.json',
    candidatePlanPath: options['candidate-plan'] ?? options.candidatePlan ?? 'data/reports/item-source-candidate-import-plan.post-ref-closure.json',
    terminalPlanPath: options['terminal-plan'] ?? options.terminalPlan ?? 'data/reports/item-source-terminal-exemption-plan-2026-06-11.json',
    outputPath: options.output ?? null,
    summaryOutputPath: options['summary-output'] ?? options.summaryOutput ?? null,
    localDatabase: safeDatabaseIdentifier(options['local-database'] ?? options.localDatabase ?? 'terria_v1_local'),
    maintDatabase: safeDatabaseIdentifier(options['maint-database'] ?? options.maintDatabase ?? 'terria_v1_maint'),
    relationDatabase: safeDatabaseIdentifier(options['relation-database'] ?? options.relationDatabase ?? 'terria_v1_relation'),
    host: options.host ?? null,
    port: options.port ?? null,
    user: options.user ?? null,
    password: options.password ?? null
  };
}

export function buildItemSourceExistingEvidenceLayersReport({
  generatedAt = new Date().toISOString(),
  closureReport = {},
  coveragePlan = {},
  rawCandidateReport = {},
  candidatePlan = {},
  terminalPlan = {},
  dbEvidence = new Map(),
  warnings = [],
  inputs = {}
} = {}) {
  const closureRows = Array.isArray(closureReport.rows) ? closureReport.rows : flattenRowsByLane(closureReport.rowsByLane);
  const coverageByItemId = indexByItemId(coveragePlan.rows);
  const rawCandidateCounts = buildRawCandidateCounts(rawCandidateReport);
  const candidatePlanCounts = buildCandidatePlanCounts(candidatePlan);
  const terminalByIdentity = buildTerminalIndex(terminalPlan);

  const rows = closureRows
    .map((row) => buildEvidenceRow(row, {
      coverageRow: coverageByItemId.get(Number(row.itemId)),
      rawCandidateCount: rawCandidateCounts.get(Number(row.itemId)) ?? rawCandidateCounts.get(normalizeIdentity(row.internalName)) ?? 0,
      candidatePlanCount: candidatePlanCounts.get(Number(row.itemId)) ?? candidatePlanCounts.get(normalizeIdentity(row.internalName)) ?? 0,
      terminal: terminalByIdentity.get(Number(row.itemId)) ?? terminalByIdentity.get(normalizeIdentity(row.internalName)) ?? null,
      dbEvidence: dbEvidence.get(Number(row.itemId)) ?? {}
    }))
    .sort((a, b) => a.itemId - b.itemId);

  assertUniqueRows(rows);
  return {
    generatedAt,
    readOnly: true,
    entity: 'item_source_existing_evidence_layers',
    inputs,
    summary: buildSummary(rows),
    warnings,
    rowsByEvidenceLayer: groupRowsBy(rows, 'evidenceLayer'),
    sampleRowsByEvidenceLayer: buildSamples(rows),
    rows
  };
}

export async function loadItemSourceExistingEvidenceDbFacts(connection, {
  localDatabase = 'terria_v1_local',
  maintDatabase = 'terria_v1_maint',
  relationDatabase = 'terria_v1_relation',
  itemIds = []
} = {}) {
  const ids = [...new Set(itemIds.map(Number).filter(Number.isInteger))].sort((a, b) => a - b);
  const warnings = [];
  const evidence = new Map(ids.map((id) => [id, emptyDbEvidence()]));
  if (!ids.length) return { evidence, warnings };

  await mergeItemSet(evidence, await loadExistingItemIds(connection, localDatabase, ids, warnings), 'itemExists');
  await mergeCounts(evidence, await loadCounts(connection, localDatabase, 'item_acquisition_sources', 'item_id', ids, 'status = 1 AND deleted = 0', warnings), 'activeSourceCount');
  await mergeCounts(evidence, await loadCounts(connection, localDatabase, 'item_acquisition_sources', 'item_id', ids, 'NOT (status = 1 AND deleted = 0)', warnings), 'inactiveOrDeletedSourceCount');
  await mergeCounts(evidence, await loadCounts(connection, localDatabase, 'recipes', 'result_item_id', ids, 'status = 1 AND deleted = 0', warnings), 'recipeCount');
  await mergeCounts(evidence, await loadNpcLootOrShopCounts(connection, localDatabase, ids, warnings), 'npcLootOrShopCount');
  await mergeCounts(evidence, await loadBiomeEvidenceCounts(connection, localDatabase, ids, warnings), 'biomeEvidenceCount');
  await mergeCounts(evidence, await loadMaintSourceCounts(connection, maintDatabase, localDatabase, ids, warnings), 'maintSourceCount');
  await mergeCounts(evidence, await loadRelationFactCounts(connection, relationDatabase, localDatabase, ids, warnings), 'relationFactCount');

  return { evidence, warnings };
}

export function renderItemSourceExistingEvidenceLayersChineseSummary(report) {
  const lines = [];
  const summary = report.summary ?? {};
  lines.push('# 物品来源现有证据层审计汇总');
  lines.push('');
  lines.push(`生成时间：${report.generatedAt ?? ''}`);
  lines.push('');
  lines.push('## 结论');
  lines.push('');
  lines.push('items 表有物品，不等于 active item_acquisition_sources 来源闭合。');
  lines.push('');
  lines.push('- `items` 表有物品，只代表物品实体存在。');
  lines.push('- `active item_acquisition_sources` 才代表当前来源闭环口径里已有 active 来源行。');
  lines.push('- `recipes`、`npc_loot_entries`、`npc_shop_entries`、`item_biomes`、maint/relation、raw candidate 都是“库里有/报告里有”的证据层，但处理方式不同。');
  lines.push('- 本报告的目的不是重做数据，而是说明每条剩余 item 应该走投影、导入、豁免还是补 raw evidence。');
  lines.push('');
  lines.push('## 三层口径对照');
  lines.push('');
  lines.push('| 口径 | 代表什么 | 不代表什么 |');
  lines.push('| --- | --- | --- |');
  lines.push('| `items` 实体存在 | 物品记录在库里 | 不代表有获取来源 |');
  lines.push('| 专属证据存在 | recipe/shimmer/NPC/biome/maint/relation/raw candidate 有证据 | 不一定已经发布为 active source |');
  lines.push('| active `item_acquisition_sources` | 当前 closure 统计认可的普通来源行 | 不覆盖所有专属结构来源 |');
  lines.push('');
  lines.push('## 总数');
  lines.push('');
  lines.push(`- 剩余行数：${summary.totalRows ?? 0}`);
  lines.push(`- layer 计数合计：${summary.layerCountSum ?? 0}`);
  lines.push(`- active 来源已存在但仍在 closure：${summary.activeSourcePresentButStillInClosure ?? 0}`);
  lines.push('');
  lines.push('## 分层统计');
  lines.push('');
  lines.push('| evidenceLayer | 中文说明 | 数量 | 下一步 |');
  lines.push('| --- | --- | ---: | --- |');
  for (const layer of EVIDENCE_LAYERS) {
    const count = summary.layerCounts?.[layer] ?? 0;
    lines.push(`| \`${layer}\` | ${LAYER_LABELS[layer]} | ${count} | ${NEXT_ACTIONS[layer]} |`);
  }
  lines.push('');
  lines.push('## 每层样本');
  for (const layer of EVIDENCE_LAYERS) {
    const rows = report.rowsByEvidenceLayer?.[layer] ?? [];
    if (!rows.length) continue;
    lines.push('');
    lines.push(`### ${layer}（${rows.length}）`);
    lines.push('');
    const listedRows = rows.length <= 30 ? rows : rows.slice(0, 50);
    lines.push('| itemId | internalName | name | closureLane | 关键计数 |');
    lines.push('| ---: | --- | --- | --- | --- |');
    for (const row of listedRows) {
      lines.push(`| ${row.itemId} | ${escapePipe(row.internalName)} | ${escapePipe(row.name)} | \`${row.closureLane}\` | active=${row.activeSourceCount}, recipe=${row.recipeCount}, raw=${row.rawCandidateSourceCount}, candidate=${row.candidateImportPlannedSourceRows}, npc=${row.npcLootOrShopCount}, biome=${row.biomeEvidenceCount}, maint=${row.maintSourceCount}, relation=${row.relationFactCount} |`);
    }
    if (rows.length > listedRows.length) {
      lines.push('');
      lines.push(`仅展示前 ${listedRows.length} 条；完整列表见 JSON 报告。`);
    }
  }
  lines.push('');
  lines.push('## 下一轮建议');
  lines.push('');
  lines.push(resolveNextRecommendation(summary));
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export async function runAuditItemSourceExistingEvidenceLayers(options = {}, dependencies = {}) {
  const now = dependencies.now instanceof Date ? dependencies.now : new Date();
  const closureReport = readJson(options.closureReportPath);
  const coveragePlan = readJson(options.coveragePlanPath);
  const rawCandidateReport = readJson(options.rawCandidatesPath);
  const candidatePlan = readJson(options.candidatePlanPath);
  const terminalPlan = readJson(options.terminalPlanPath);
  const closureRows = Array.isArray(closureReport.rows) ? closureReport.rows : flattenRowsByLane(closureReport.rowsByLane);
  const itemIds = closureRows.map((row) => Number(row.itemId)).filter(Number.isInteger);

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
    throw new Error(`Refusing existing evidence audit against non-local database: ${connectionConfig.database}`);
  }

  const connection = dependencies.connection ?? await mysqlModule.createConnection(connectionConfig);
  const shouldClose = !dependencies.connection;
  try {
    const { evidence, warnings } = await loadItemSourceExistingEvidenceDbFacts(connection, {
      localDatabase: options.localDatabase,
      maintDatabase: options.maintDatabase,
      relationDatabase: options.relationDatabase,
      itemIds
    });
    const report = buildItemSourceExistingEvidenceLayersReport({
      generatedAt: now.toISOString(),
      closureReport,
      coveragePlan,
      rawCandidateReport,
      candidatePlan,
      terminalPlan,
      dbEvidence: evidence,
      warnings,
      inputs: {
        closureReportPath: options.closureReportPath,
        coveragePlanPath: options.coveragePlanPath,
        rawCandidatesPath: options.rawCandidatesPath,
        candidatePlanPath: options.candidatePlanPath,
        terminalPlanPath: options.terminalPlanPath,
        localDatabase: options.localDatabase,
        maintDatabase: options.maintDatabase,
        relationDatabase: options.relationDatabase
      }
    });
    if (options.outputPath) {
      writeJson(path.resolve(process.cwd(), options.outputPath), report);
    }
    if (options.summaryOutputPath) {
      fs.mkdirSync(path.dirname(path.resolve(process.cwd(), options.summaryOutputPath)), { recursive: true });
      fs.writeFileSync(path.resolve(process.cwd(), options.summaryOutputPath), renderItemSourceExistingEvidenceLayersChineseSummary(report));
    }
    return report;
  } finally {
    if (shouldClose) {
      await connection.end();
    }
  }
}

function buildEvidenceRow(row, context) {
  const itemId = Number(row.itemId);
  const dbEvidence = { ...emptyDbEvidence(), ...context.dbEvidence };
  const rawCandidateSourceCount = Number(context.rawCandidateCount ?? 0);
  const candidateImportPlannedSourceRows = Number(context.candidatePlanCount ?? 0);
  const terminalClosureStatus = context.terminal?.terminalClosureStatus ?? context.coverageRow?.terminalClosureStatus ?? row.terminalClosureStatus ?? null;
  const terminalResolutionLane = context.terminal?.resolutionLane ?? context.coverageRow?.terminalResolutionLane ?? row.terminalResolutionLane ?? null;
  const base = {
    itemId,
    internalName: normalizeText(row.internalName ?? row.itemInternalName),
    name: normalizeText(row.name ?? row.itemName),
    closureLane: normalizeText(row.closureLane ?? context.coverageRow?.lane),
    coverageLane: normalizeText(row.coverageLane ?? context.coverageRow?.lane),
    itemExists: Boolean(dbEvidence.itemExists),
    activeSourceCount: Number(dbEvidence.activeSourceCount ?? 0),
    inactiveOrDeletedSourceCount: Number(dbEvidence.inactiveOrDeletedSourceCount ?? 0),
    recipeCount: Number(dbEvidence.recipeCount ?? 0),
    npcLootOrShopCount: Number(dbEvidence.npcLootOrShopCount ?? 0),
    biomeEvidenceCount: Number(dbEvidence.biomeEvidenceCount ?? 0),
    maintSourceCount: Number(dbEvidence.maintSourceCount ?? 0),
    relationFactCount: Number(dbEvidence.relationFactCount ?? 0),
    rawCandidateSourceCount,
    candidateImportPlannedSourceRows,
    terminalClosureStatus,
    terminalResolutionLane
  };
  const layer = resolveEvidenceLayer(base);
  return {
    ...base,
    evidenceLayer: layer,
    projectionGap: resolveProjectionGap(layer),
    nextAction: NEXT_ACTIONS[layer]
  };
}

export function resolveEvidenceLayer(row) {
  if (row.activeSourceCount > 0) return 'active_source_present';
  if (row.terminalResolutionLane === 'missing_required_raw_evidence' || row.closureLane === 'missing_required_raw_evidence' || row.terminalClosureStatus === 'missing_bait_raw') return 'missing_required_raw_evidence';
  if (row.terminalResolutionLane === 'explicit_no_source_exemption_candidate' || ['explicit_no_source_exemption_candidate', 'runtime_or_developer_internal'].includes(row.closureLane)) return 'terminal_exempt_or_identity_review';
  if (row.closureLane === 'recipe_or_shimmer_chain_covered' || row.recipeCount > 0) return 'recipe_or_shimmer_covered';
  if (row.closureLane === 'npc_relation_chain_gap' || row.npcLootOrShopCount > 0) return 'npc_relation_not_projected';
  if (row.closureLane === 'biome_evidence_projection' || row.biomeEvidenceCount > 0) return 'biome_projection_pending';
  if (row.maintSourceCount > 0 || row.relationFactCount > 0) return 'maint_or_relation_not_published';
  if (row.candidateImportPlannedSourceRows > 0) return 'candidate_import_not_applied';
  if (row.rawCandidateSourceCount > 0) return 'raw_candidate_not_projected';
  if (row.closureLane === 'family_policy_candidate') return 'family_policy_pending';
  return 'item_only_no_source_evidence';
}

function resolveProjectionGap(layer) {
  return {
    active_source_present: 'closure_report_stale_or_source_reintroduced',
    terminal_exempt_or_identity_review: 'terminal_or_identity_review_not_importable',
    missing_required_raw_evidence: 'required_raw_evidence_missing',
    recipe_or_shimmer_covered: 'dedicated_recipe_or_shimmer_projection_required',
    npc_relation_not_projected: 'npc_loot_or_shop_relation_not_projected',
    biome_projection_pending: 'biome_relation_projection_required',
    maint_or_relation_not_published: 'maint_or_relation_fact_not_published_to_local',
    candidate_import_not_applied: 'planned_candidate_rows_not_inserted_or_published',
    raw_candidate_not_projected: 'candidate_import_missing_or_not_applied',
    family_policy_pending: 'family_shared_page_policy_required',
    item_only_no_source_evidence: 'no_checked_source_evidence_found'
  }[layer];
}

function buildSummary(rows) {
  const layerCounts = Object.fromEntries(EVIDENCE_LAYERS.map((layer) => [layer, 0]));
  const closureLaneCounts = {};
  for (const row of rows) {
    layerCounts[row.evidenceLayer] = (layerCounts[row.evidenceLayer] ?? 0) + 1;
    closureLaneCounts[row.closureLane] = (closureLaneCounts[row.closureLane] ?? 0) + 1;
  }
  const layerCountSum = Object.values(layerCounts).reduce((sum, count) => sum + count, 0);
  return {
    totalRows: rows.length,
    activeSourcePresentButStillInClosure: layerCounts.active_source_present ?? 0,
    itemOnlyNoSourceEvidence: layerCounts.item_only_no_source_evidence ?? 0,
    rawCandidateNotProjected: layerCounts.raw_candidate_not_projected ?? 0,
    candidateImportNotApplied: layerCounts.candidate_import_not_applied ?? 0,
    recipeOrShimmerCovered: layerCounts.recipe_or_shimmer_covered ?? 0,
    npcRelationNotProjected: layerCounts.npc_relation_not_projected ?? 0,
    biomeProjectionPending: layerCounts.biome_projection_pending ?? 0,
    maintOrRelationNotPublished: layerCounts.maint_or_relation_not_published ?? 0,
    familyPolicyPending: layerCounts.family_policy_pending ?? 0,
    terminalExemptOrIdentityReview: layerCounts.terminal_exempt_or_identity_review ?? 0,
    missingRequiredRawEvidence: layerCounts.missing_required_raw_evidence ?? 0,
    layerCountSum,
    layerCounts,
    closureLaneCounts
  };
}

function buildRawCandidateCounts(report) {
  const counts = new Map();
  for (const row of Array.isArray(report.candidates) ? report.candidates : []) {
    const count = Array.isArray(row.extractedSources) ? row.extractedSources.length : Number(row.extractedSourceCount ?? 0);
    addIdentityCount(counts, row.itemId, row.itemInternalName ?? row.internalName, count);
  }
  return counts;
}

function buildCandidatePlanCounts(plan) {
  const counts = new Map();
  for (const row of Array.isArray(plan.eligibleCandidates) ? plan.eligibleCandidates : []) {
    addIdentityCount(counts, row.itemResolution?.id ?? row.itemId, row.itemInternalName ?? row.internalName, Array.isArray(row.plannedSources) ? row.plannedSources.length : 0);
  }
  for (const row of Array.isArray(plan.blockedCandidates) ? plan.blockedCandidates : []) {
    if (row.blockedReason !== 'family_page_candidate') {
      addIdentityCount(counts, row.itemResolution?.id ?? row.itemId, row.itemInternalName ?? row.internalName, Array.isArray(row.blockedSources) ? row.blockedSources.length : 0);
    }
  }
  return counts;
}

function buildTerminalIndex(plan) {
  const byIdentity = new Map();
  for (const row of Array.isArray(plan.rows) ? plan.rows : []) {
    const value = {
      terminalClosureStatus: row.terminalClosureStatus ?? null,
      resolutionLane: row.resolutionLane ?? null
    };
    const itemId = Number(row.itemId);
    if (Number.isInteger(itemId)) byIdentity.set(itemId, value);
    const identity = normalizeIdentity(row.internalName ?? row.itemInternalName);
    if (identity) byIdentity.set(identity, value);
  }
  return byIdentity;
}

async function loadExistingItemIds(connection, database, itemIds, warnings) {
  try {
    const [rows] = await connection.execute(
      `SELECT id FROM \`${database}\`.\`items\` WHERE id IN (${placeholders(itemIds)}) AND status = 1 AND deleted = 0`,
      itemIds
    );
    return new Set((Array.isArray(rows) ? rows : []).map((row) => Number(row.id)).filter(Number.isInteger));
  } catch (error) {
    warnings.push({ table: `${database}.items`, reason: 'item_existence_unavailable', message: error.message });
    return new Set();
  }
}

async function loadCounts(connection, database, tableName, columnName, itemIds, whereClause, warnings) {
  try {
    const [rows] = await connection.execute(
      `SELECT \`${columnName}\` AS itemId, COUNT(*) AS rowCount
       FROM \`${database}\`.\`${tableName}\`
       WHERE \`${columnName}\` IN (${placeholders(itemIds)}) AND ${whereClause}
       GROUP BY \`${columnName}\``,
      itemIds
    );
    return new Map((Array.isArray(rows) ? rows : []).map((row) => [Number(row.itemId), Number(row.rowCount)]));
  } catch (error) {
    warnings.push({ table: `${database}.${tableName}`, reason: 'count_unavailable', message: error.message });
    return new Map();
  }
}

async function loadNpcLootOrShopCounts(connection, database, itemIds, warnings) {
  const result = new Map();
  for (const tableName of ['npc_loot_entries', 'npc_shop_entries']) {
    const counts = await loadCounts(connection, database, tableName, 'item_id', itemIds, 'status = 1 AND deleted = 0', warnings);
    mergeCountMaps(result, counts);
  }
  return result;
}

async function loadBiomeEvidenceCounts(connection, database, itemIds, warnings) {
  const result = new Map();
  mergeCountMaps(result, await loadCounts(connection, database, 'item_biomes', 'item_id', itemIds, 'item_id IS NOT NULL', warnings));
  mergeCountMaps(result, await loadCounts(connection, database, 'item_acquisition_sources', 'item_id', itemIds, "source_ref_type = 'biome_wikitext' AND status = 1 AND deleted = 0", warnings));
  return result;
}

async function loadMaintSourceCounts(connection, maintDatabase, localDatabase, itemIds, warnings) {
  try {
    const [rows] = await connection.execute(
      `SELECT i.id AS itemId, COUNT(*) AS rowCount
       FROM \`${maintDatabase}\`.\`maint_item_sources\` m
       JOIN \`${localDatabase}\`.\`items\` i
         ON LOWER(TRIM(i.internal_name)) COLLATE utf8mb4_unicode_ci = LOWER(TRIM(m.item_internal_name)) COLLATE utf8mb4_unicode_ci
       WHERE i.id IN (${placeholders(itemIds)}) AND m.status = 1 AND m.deleted = 0
       GROUP BY i.id`,
      itemIds
    );
    return new Map((Array.isArray(rows) ? rows : []).map((row) => [Number(row.itemId), Number(row.rowCount)]));
  } catch (error) {
    warnings.push({ table: `${maintDatabase}.maint_item_sources`, reason: 'count_unavailable', message: error.message });
    return new Map();
  }
}

async function loadRelationFactCounts(connection, relationDatabase, localDatabase, itemIds, warnings) {
  try {
    const [rows] = await connection.execute(
      `SELECT i.id AS itemId, COUNT(*) AS rowCount
       FROM \`${relationDatabase}\`.\`item_source_facts\` f
       JOIN \`${localDatabase}\`.\`items\` i
         ON LOWER(TRIM(i.internal_name)) COLLATE utf8mb4_unicode_ci = LOWER(TRIM(f.item_internal_name)) COLLATE utf8mb4_unicode_ci
       WHERE i.id IN (${placeholders(itemIds)}) AND f.status = 1 AND f.deleted = 0
       GROUP BY i.id`,
      itemIds
    );
    return new Map((Array.isArray(rows) ? rows : []).map((row) => [Number(row.itemId), Number(row.rowCount)]));
  } catch (error) {
    warnings.push({ table: `${relationDatabase}.item_source_facts`, reason: 'count_unavailable', message: error.message });
    return new Map();
  }
}

function emptyDbEvidence() {
  return {
    itemExists: false,
    activeSourceCount: 0,
    inactiveOrDeletedSourceCount: 0,
    recipeCount: 0,
    npcLootOrShopCount: 0,
    biomeEvidenceCount: 0,
    maintSourceCount: 0,
    relationFactCount: 0
  };
}

async function mergeItemSet(evidence, ids, key) {
  for (const id of ids) {
    evidence.set(id, { ...emptyDbEvidence(), ...(evidence.get(id) ?? {}), [key]: true });
  }
}

async function mergeCounts(evidence, counts, key) {
  for (const [id, count] of counts) {
    evidence.set(id, { ...emptyDbEvidence(), ...(evidence.get(id) ?? {}), [key]: Number(count) });
  }
}

function mergeCountMaps(target, source) {
  for (const [id, count] of source) {
    target.set(id, Number(target.get(id) ?? 0) + Number(count ?? 0));
  }
}

function addIdentityCount(map, itemId, internalName, count) {
  const number = Number(count ?? 0);
  const id = Number(itemId);
  if (Number.isInteger(id)) map.set(id, Number(map.get(id) ?? 0) + number);
  const identity = normalizeIdentity(internalName);
  if (identity) map.set(identity, Number(map.get(identity) ?? 0) + number);
}

function indexByItemId(rows) {
  return new Map((Array.isArray(rows) ? rows : [])
    .map((row) => [Number(row.itemId), row])
    .filter(([itemId]) => Number.isInteger(itemId)));
}

function flattenRowsByLane(rowsByLane = {}) {
  return Object.values(rowsByLane ?? {}).flatMap((rows) => Array.isArray(rows) ? rows : []);
}

function groupRowsBy(rows, key) {
  const grouped = {};
  for (const row of rows) {
    const value = row[key] ?? 'unknown';
    grouped[value] ??= [];
    grouped[value].push(row);
  }
  return grouped;
}

function buildSamples(rows) {
  const samples = {};
  const grouped = groupRowsBy(rows, 'evidenceLayer');
  for (const [layer, layerRows] of Object.entries(grouped)) {
    samples[layer] = layerRows.slice(0, 20);
  }
  return samples;
}

function assertUniqueRows(rows) {
  const seen = new Set();
  for (const row of rows) {
    if (!Number.isInteger(row.itemId) || !row.internalName) {
      throw new Error(`invalid evidence row identity: ${JSON.stringify(row)}`);
    }
    if (seen.has(row.itemId)) {
      throw new Error(`duplicate evidence itemId: ${row.itemId}`);
    }
    seen.add(row.itemId);
  }
}

function placeholders(values) {
  return values.map(() => '?').join(', ');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filePath), 'utf8'));
}

function safeDatabaseIdentifier(value) {
  const text = String(value ?? '').trim();
  if (!/^[A-Za-z0-9_]+$/.test(text)) {
    throw new Error(`unsafe database identifier: ${value}`);
  }
  return text;
}

function normalizeIdentity(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function escapePipe(value) {
  return String(value ?? '').replaceAll('|', '\\|');
}

function resolveNextRecommendation(summary) {
  if ((summary.layerCounts?.active_source_present ?? 0) > 0) return `先处理 \`active_source_present\` ${summary.layerCounts.active_source_present} 条：重建 closure 或排查 stale report。`;
  if ((summary.layerCounts?.candidate_import_not_applied ?? 0) > 0) return `优先处理 \`candidate_import_not_applied\` ${summary.layerCounts.candidate_import_not_applied} 条：准备 guarded dry-run/apply 计划。`;
  if ((summary.layerCounts?.raw_candidate_not_projected ?? 0) > 0) return `优先处理 \`raw_candidate_not_projected\` ${summary.layerCounts.raw_candidate_not_projected} 条：从 raw candidates 生成 focused candidate import plan。`;
  if ((summary.layerCounts?.maint_or_relation_not_published ?? 0) > 0) return `优先处理 \`maint_or_relation_not_published\` ${summary.layerCounts.maint_or_relation_not_published} 条：做 publication projection dry-run。`;
  if ((summary.layerCounts?.family_policy_pending ?? 0) > 0) return `优先处理 \`family_policy_pending\` ${summary.layerCounts.family_policy_pending} 条：按 family/shared page 写 policy parser。`;
  if ((summary.layerCounts?.item_only_no_source_evidence ?? 0) > 0) return `最后处理 \`item_only_no_source_evidence\` ${summary.layerCounts.item_only_no_source_evidence} 条：按类别/名称拆分后决定是否补 raw evidence。`;
  return '当前没有需要进入普通来源导入的优先 lane；继续做 API/UI 投影和豁免闭环验收。';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAuditItemSourceExistingEvidenceLayers(parseAuditItemSourceExistingEvidenceLayersArgs())
    .then((report) => {
      process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
