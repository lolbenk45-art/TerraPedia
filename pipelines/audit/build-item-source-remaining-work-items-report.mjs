#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { parseCliArgs, writeJson } from '../lib/wiki-item-utils.mjs';

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

export function parseBuildItemSourceRemainingWorkItemsReportArgs(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  for (const [key, value] of Object.entries(options)) {
    if (MUTATION_FLAGS.has(key.toLowerCase()) && value !== false && value !== 'false') {
      throw new Error(`read-only remaining work items report refuses mutation flag: --${key}`);
    }
  }
  return {
    evidenceReportPath: options['evidence-report'] ?? options.evidenceReport ?? 'data/reports/item-source-existing-evidence-layers-2026-06-12.json',
    candidatePlanPath: options['candidate-plan'] ?? options.candidatePlan ?? 'data/reports/item-source-candidate-import-plan.remaining-2026-06-12.json',
    dryRunReportPath: options['dry-run-report'] ?? options.dryRunReport ?? 'data/reports/item-source-candidate-local-compat-dry-run-2026-06-12.json',
    outputPath: options.output ?? null,
    summaryOutputPath: options['summary-output'] ?? options.summaryOutput ?? null
  };
}

export function buildItemSourceRemainingWorkItemsReport({
  generatedAt = new Date().toISOString(),
  evidenceReport = {},
  candidatePlan = {},
  dryRunReport = {},
  inputs = {}
} = {}) {
  const familyPending = evidenceRows(evidenceReport, 'family_policy_pending').map(toEvidenceWorkItem);
  const projectionRequired = [
    ...evidenceRows(evidenceReport, 'npc_relation_not_projected'),
    ...evidenceRows(evidenceReport, 'biome_projection_pending')
  ].map(toEvidenceWorkItem);
  const terminalExempt = evidenceRows(evidenceReport, 'terminal_exempt_or_identity_review').map(toEvidenceWorkItem);
  const missingRaw = evidenceRows(evidenceReport, 'missing_required_raw_evidence').map(toEvidenceWorkItem);
  const familyBlocked = (candidatePlan.blockedCandidates ?? [])
    .filter((candidate) => candidate.blockedReason === 'family_page_candidate')
    .map(toBlockedCandidateWorkItem);
  const blockedSourceRows = (candidatePlan.blockedCandidates ?? [])
    .filter((candidate) => candidate.blockedReason === 'blocked_source_rows')
    .map(toBlockedCandidateWorkItem);
  const explicitSourceExemptions = (candidatePlan.explicitSourceExemptionCandidates ?? [])
    .map(toExplicitSourceExemptionWorkItem);
  const candidateDryRunReady = (candidatePlan.eligibleCandidates ?? []).flatMap((candidate) =>
    (candidate.plannedSources ?? []).map((source) => toDryRunReadySourceWorkItem(candidate, source)));
  const dryRunReadyCount = Number(dryRunReport.summary?.toInsert ?? candidatePlan.summary?.plannedSourceRows ?? candidateDryRunReady.length);
  const dryRunReady = candidateDryRunReady.slice(0, Math.max(0, dryRunReadyCount));
  const blockedSourceRowCount = blockedSourceRows.reduce((sum, candidate) => sum + candidate.blockedSourceRows, 0);
  const resolutionMatrixRows = buildResolutionMatrixRows({
    dryRunReady,
    familyBlocked,
    familyPending,
    blockedSourceRows,
    explicitSourceExemptions,
    projectionRequired,
    terminalExempt,
    missingRaw
  });

  return {
    generatedAt,
    readOnly: true,
    entity: 'item_source_remaining_work_items',
    inputs,
    summary: {
      dryRunReadyCandidates: Number(dryRunReport.summary?.selectedCandidates ?? candidatePlan.summary?.eligibleCandidates ?? 0),
      dryRunReadySourceRows: Number(dryRunReport.summary?.toInsert ?? candidatePlan.summary?.plannedSourceRows ?? dryRunReady.length),
      familyPolicyBlockedCandidates: familyBlocked.length,
      familyPolicyPendingClosureRows: familyPending.length,
      blockedSourceRowCandidates: blockedSourceRows.length,
      blockedSourceRows: blockedSourceRowCount,
      explicitSourceExemptionCandidates: explicitSourceExemptions.length,
      explicitSourceExemptionRows: explicitSourceExemptions.reduce((sum, row) => sum + row.exemptedSourceRows, 0),
      projectionRequiredRows: projectionRequired.length,
      terminalExemptOrIdentityReviewRows: terminalExempt.length,
      missingRawRequiredRows: missingRaw.length,
      dbWritesPerformed: Boolean(dryRunReport.apply)
    },
    aggregates: {
      familyBlockedByPage: countBy(familyBlocked, (row) => row.pageTitle),
      familyPendingByPolicyFamily: countBy(familyPending, (row) => classifyFamilyPendingPolicyFamily(row)),
      familyPendingByNameSuffix: countBy(familyPending, (row) => classifyFamilyPendingName(row.name)),
      blockedSourceReasons: countBy(blockedSourceRows.flatMap((row) => row.blockedSourceReasons), (reason) => reason),
      blockedSourceTypeRef: countBy(blockedSourceRows.flatMap((row) => row.blockedSourceTypeRefs), (typeRef) => typeRef),
      explicitSourceExemptionStatuses: countBy(explicitSourceExemptions.flatMap((row) => row.exemptionStatuses), (status) => status),
      dryRunReadyTypeRef: countBy(dryRunReady, (row) => row.sourceTypeRef),
      projectionByLayer: countBy(projectionRequired, (row) => row.evidenceLayer),
      terminalStatusCounts: countBy([...terminalExempt, ...missingRaw], (row) => row.terminalClosureStatus)
    },
    resolutionMatrix: {
      summaryByLane: countBy(resolutionMatrixRows, (row) => row.resolutionLane),
      rows: resolutionMatrixRows
    },
    workItems: {
      dryRunReadySourceRows: dryRunReady,
      familyPolicyBlockedCandidates: familyBlocked,
      familyPolicyPendingClosureRows: familyPending,
      blockedSourceRowCandidates: blockedSourceRows,
      explicitSourceExemptionCandidates: explicitSourceExemptions,
      projectionRequiredRows: projectionRequired,
      terminalExemptOrIdentityReviewRows: terminalExempt,
      missingRawRequiredRows: missingRaw
    }
  };
}

export function renderItemSourceRemainingWorkItemsChineseSummary(report) {
  const summary = report.summary ?? {};
  const lines = [];
  lines.push('# 物品来源剩余工作项明细');
  lines.push('');
  lines.push(`生成时间：${report.generatedAt ?? ''}`);
  lines.push('');
  lines.push('## 总览');
  lines.push('');
  lines.push(`- DB 写入：${summary.dbWritesPerformed ? '已执行' : '未执行'}。`);
  lines.push(`- dry-run 实际可插入来源行：${summary.dryRunReadySourceRows ?? 0}，dry-run 选中候选物品：${summary.dryRunReadyCandidates ?? 0}。`);
  lines.push(`- family policy blocked candidates：${summary.familyPolicyBlockedCandidates ?? 0}。`);
  lines.push(`- family parser/policy 待建模 rows：${summary.familyPolicyPendingClosureRows ?? 0}。`);
  lines.push(`- blocked source row candidates：${summary.blockedSourceRowCandidates ?? 0}，blocked source rows：${summary.blockedSourceRows ?? 0}。`);
  lines.push(`- 显式不可导入来源豁免 candidates：${summary.explicitSourceExemptionCandidates ?? 0}，source rows：${summary.explicitSourceExemptionRows ?? 0}。`);
  lines.push(`- NPC/biome 投影 rows：${summary.projectionRequiredRows ?? 0}。`);
  lines.push(`- terminal/身份豁免 rows：${summary.terminalExemptOrIdentityReviewRows ?? 0}。`);
  lines.push(`- 缺 raw evidence rows：${summary.missingRawRequiredRows ?? 0}。`);
  lines.push('');
  appendAggregate(lines, 'dry-run ready 类型', report.aggregates?.dryRunReadyTypeRef);
  appendAggregate(lines, 'family blocked sourcePage Top', report.aggregates?.familyBlockedByPage);
  appendAggregate(lines, 'family parser/policy 待建模分组', report.aggregates?.familyPendingByPolicyFamily);
  appendAggregate(lines, 'family pending 名称后缀旧聚合', report.aggregates?.familyPendingByNameSuffix);
  appendAggregate(lines, 'blocked source 原因', report.aggregates?.blockedSourceReasons);
  appendAggregate(lines, 'blocked source 类型', report.aggregates?.blockedSourceTypeRef);
  appendAggregate(lines, '显式来源豁免状态', report.aggregates?.explicitSourceExemptionStatuses);
  appendAggregate(lines, '投影阻断 layer', report.aggregates?.projectionByLayer);
  appendAggregate(lines, 'terminal 状态', report.aggregates?.terminalStatusCounts);
  appendResolutionMatrix(lines, report.resolutionMatrix);
  appendItems(lines, 'dry-run 可写入样本', report.workItems?.dryRunReadySourceRows, formatDryRunRow, 40);
  appendItems(lines, 'family policy blocked 样本', report.workItems?.familyPolicyBlockedCandidates, formatCandidateRow, 60);
  appendItems(lines, 'closure family pending 样本', report.workItems?.familyPolicyPendingClosureRows, formatEvidenceRow, 80);
  appendItems(lines, 'blocked source rows 全量', report.workItems?.blockedSourceRowCandidates, formatBlockedCandidateRow, 200);
  appendItems(lines, '显式不可导入来源豁免全量', report.workItems?.explicitSourceExemptionCandidates, formatExplicitSourceExemptionRow, 200);
  appendItems(lines, 'NPC/biome 投影 rows 全量', report.workItems?.projectionRequiredRows, formatEvidenceRow, 200);
  appendItems(lines, 'terminal/身份豁免 rows 全量', report.workItems?.terminalExemptOrIdentityReviewRows, formatEvidenceRow, 200);
  appendItems(lines, '缺 raw evidence rows 全量', report.workItems?.missingRawRequiredRows, formatEvidenceRow, 200);
  lines.push('');
  lines.push('完整列表见 JSON 报告。');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function runBuildItemSourceRemainingWorkItemsReport(options = {}, dependencies = {}) {
  const now = dependencies.now instanceof Date ? dependencies.now : new Date();
  const report = buildItemSourceRemainingWorkItemsReport({
    generatedAt: now.toISOString(),
    evidenceReport: dependencies.evidenceReport ?? readJson(options.evidenceReportPath),
    candidatePlan: dependencies.candidatePlan ?? readJson(options.candidatePlanPath),
    dryRunReport: dependencies.dryRunReport ?? readJson(options.dryRunReportPath),
    inputs: {
      evidenceReportPath: options.evidenceReportPath,
      candidatePlanPath: options.candidatePlanPath,
      dryRunReportPath: options.dryRunReportPath
    }
  });
  if (options.outputPath) {
    writeJson(path.resolve(process.cwd(), options.outputPath), report);
  }
  if (options.summaryOutputPath) {
    fs.mkdirSync(path.dirname(path.resolve(process.cwd(), options.summaryOutputPath)), { recursive: true });
    fs.writeFileSync(path.resolve(process.cwd(), options.summaryOutputPath), renderItemSourceRemainingWorkItemsChineseSummary(report));
  }
  return report;
}

function evidenceRows(report, layer) {
  return report.rowsByEvidenceLayer?.[layer]
    ?? (Array.isArray(report.rows) ? report.rows.filter((row) => row.evidenceLayer === layer) : []);
}

function toEvidenceWorkItem(row) {
  return {
    itemId: row.itemId ?? null,
    internalName: row.internalName ?? row.itemInternalName ?? null,
    name: row.name ?? row.itemName ?? null,
    evidenceLayer: row.evidenceLayer ?? null,
    closureLane: row.closureLane ?? null,
    coverageLane: row.coverageLane ?? null,
    terminalClosureStatus: row.terminalClosureStatus ?? null,
    nextAction: row.nextAction ?? null
  };
}

function toBlockedCandidateWorkItem(candidate) {
  const blockedSources = Array.isArray(candidate.blockedSources) ? candidate.blockedSources : [];
  return {
    itemId: candidate.itemResolution?.id ?? candidate.itemId ?? null,
    itemInternalName: candidate.itemInternalName ?? candidate.internalName ?? null,
    itemName: candidate.itemName ?? candidate.name ?? null,
    pageTitle: candidate.pageTitle ?? null,
    blockedReason: candidate.blockedReason ?? null,
    classification: candidate.classification ?? null,
    blockedSourceRows: blockedSources.length,
    blockedSourceReasons: unique(blockedSources.map((source) => source.blockedReason ?? candidate.blockedReason)),
    blockedSourceTypeRefs: unique(blockedSources.map((source) => `${source.sourceType ?? 'unknown'}/${source.sourceRefType ?? 'unknown'}`)),
    blockedSources: blockedSources.map((source) => ({
      sourceType: source.sourceType ?? null,
      sourceRefType: source.sourceRefType ?? null,
      sourceRefName: source.sourceRefName ?? null,
      blockedReason: source.blockedReason ?? candidate.blockedReason ?? null,
      conditions: source.conditions ?? null,
      chanceText: source.chanceText ?? null,
      sourcePage: source.sourcePage ?? candidate.pageTitle ?? null
    }))
  };
}

function toExplicitSourceExemptionWorkItem(candidate) {
  const exemptedSources = Array.isArray(candidate.exemptedSources) ? candidate.exemptedSources : [];
  return {
    itemId: candidate.itemResolution?.id ?? candidate.itemId ?? null,
    itemInternalName: candidate.itemInternalName ?? candidate.internalName ?? null,
    itemName: candidate.itemName ?? candidate.name ?? null,
    pageTitle: candidate.pageTitle ?? null,
    exemptionReason: candidate.exemptionReason ?? null,
    exemptedSourceRows: exemptedSources.length,
    exemptionStatuses: unique(exemptedSources.map((source) => source.exemptionStatus)),
    exemptedSourceTypeRefs: unique(exemptedSources.map((source) => `${source.sourceType ?? 'unknown'}/${source.sourceRefType ?? 'unknown'}`)),
    exemptedSources: exemptedSources.map((source) => ({
      sourceType: source.sourceType ?? null,
      sourceRefType: source.sourceRefType ?? null,
      sourceRefName: source.sourceRefName ?? null,
      exemptionStatus: source.exemptionStatus ?? null,
      conditions: source.conditions ?? null,
      sourcePage: source.sourcePage ?? candidate.pageTitle ?? null
    }))
  };
}

function toDryRunReadySourceWorkItem(candidate, source) {
  return {
    itemId: candidate.itemResolution?.id ?? null,
    itemInternalName: candidate.itemInternalName ?? null,
    itemName: candidate.itemName ?? null,
    sourceType: source.sourceType ?? null,
    sourceRefType: source.sourceRefType ?? null,
    sourceTypeRef: `${source.sourceType ?? 'unknown'}/${source.sourceRefType ?? 'unknown'}`,
    sourceRefName: source.sourceRefName ?? null,
    sourcePage: source.sourcePage ?? candidate.pageTitle ?? null,
    resolutionStatus: source.resolutionStatus ?? null,
    conditions: source.conditions ?? null,
    chanceText: source.chanceText ?? null
  };
}

function buildResolutionMatrixRows({
  dryRunReady = [],
  familyBlocked = [],
  familyPending = [],
  blockedSourceRows = [],
  explicitSourceExemptions = [],
  projectionRequired = [],
  terminalExempt = [],
  missingRaw = []
} = {}) {
  return [
    ...dryRunReady.map((row) => ({
      itemId: row.itemId ?? null,
      itemInternalName: row.itemInternalName ?? null,
      itemName: row.itemName ?? null,
      sourcePage: row.sourcePage ?? null,
      sourceTypeRef: row.sourceTypeRef ?? null,
      resolutionLane: 'dry_run_ready_requires_user_apply',
      canImportOrdinarySource: true,
      requiresProjection: false,
      requiresRawEvidence: false,
      nextAction: '用户明确批准 --apply=true 后可写入 item_acquisition_sources。'
    })),
    ...familyBlocked.map((row) => ({
      itemId: row.itemId ?? null,
      itemInternalName: row.itemInternalName ?? null,
      itemName: row.itemName ?? null,
      sourcePage: row.pageTitle ?? null,
      sourceTypeRef: row.blockedSourceTypeRefs.join(', '),
      resolutionLane: 'family_policy_parser_required',
      canImportOrdinarySource: false,
      requiresProjection: false,
      requiresRawEvidence: false,
      nextAction: familyBlockedNextAction(row)
    })),
    ...familyPending.map((row) => ({
      itemId: row.itemId ?? null,
      itemInternalName: row.internalName ?? null,
      itemName: row.name ?? null,
      sourcePage: null,
      sourceTypeRef: row.evidenceLayer ?? null,
      resolutionLane: 'family_policy_parser_required',
      canImportOrdinarySource: false,
      requiresProjection: false,
      requiresRawEvidence: false,
      nextAction: row.nextAction ?? '按 family page/sourcePage 做精确 policy parser。'
    })),
    ...blockedSourceRows.map(classifyBlockedSourceResolutionRow),
    ...explicitSourceExemptions.map((row) => ({
      itemId: row.itemId ?? null,
      itemInternalName: row.itemInternalName ?? null,
      itemName: row.itemName ?? null,
      sourcePage: row.pageTitle ?? null,
      sourceTypeRef: row.exemptedSourceTypeRefs.join(', '),
      resolutionLane: 'explicit_exemption_review',
      canImportOrdinarySource: false,
      requiresProjection: false,
      requiresRawEvidence: false,
      nextAction: '显式不可获得/未实现来源，保留为豁免，不导入普通 item source。'
    })),
    ...projectionRequired.map((row) => ({
      itemId: row.itemId ?? null,
      itemInternalName: row.internalName ?? null,
      itemName: row.name ?? null,
      sourcePage: null,
      sourceTypeRef: row.evidenceLayer ?? null,
      resolutionLane: 'projection_contract_required',
      canImportOrdinarySource: false,
      requiresProjection: true,
      requiresRawEvidence: false,
      nextAction: row.nextAction ?? '补 API/UI 投影契约，不伪造成普通来源。'
    })),
    ...terminalExempt.map((row) => ({
      itemId: row.itemId ?? null,
      itemInternalName: row.internalName ?? null,
      itemName: row.name ?? null,
      sourcePage: null,
      sourceTypeRef: row.terminalClosureStatus ?? row.evidenceLayer ?? null,
      resolutionLane: 'explicit_exemption_review',
      canImportOrdinarySource: false,
      requiresProjection: false,
      requiresRawEvidence: false,
      nextAction: row.nextAction ?? '保留为豁免/身份审查，不导入普通 item source。'
    })),
    ...missingRaw.map((row) => ({
      itemId: row.itemId ?? null,
      itemInternalName: row.internalName ?? null,
      itemName: row.name ?? null,
      sourcePage: null,
      sourceTypeRef: row.terminalClosureStatus ?? row.evidenceLayer ?? null,
      resolutionLane: 'missing_raw_evidence_required',
      canImportOrdinarySource: false,
      requiresProjection: false,
      requiresRawEvidence: true,
      nextAction: row.nextAction ?? '补精确 raw evidence 后再解析，不能用相似页面猜来源。'
    }))
  ];
}

function classifyBlockedSourceResolutionRow(row) {
  const sourceNames = row.blockedSources.map((source) => normalizeIdentity(source.sourceRefName));
  const typeRefs = new Set(row.blockedSourceTypeRefs);
  const hasTerminalSource = sourceNames.some((name) => ['unimplemented', 'unobtainable', 'unobtainableasitem'].includes(name));
  const hasHardmodeTreasureBagGroup = row.blockedSources.some((source) =>
    source.sourceType === 'treasure_bag'
    && source.sourceRefType === 'treasure_bag'
    && normalizeText(source.sourceRefName) === 'Hardmode Treasure Bag (except Queen Slime)');
  const hasTransformOrTradeMechanic = row.blockedSources.some((source) =>
    source.sourceRefType === 'npc'
    || /transformation|purifying|sunlight/i.test(`${source.sourceRefName ?? ''} ${source.conditions ?? ''}`));
  const hasEventReward = sourceNames.includes('thetorchgodevent');
  const hasEditionSource = sourceNames.includes('terrariacollectorsedition');
  const hasCookingSource = sourceNames.includes('campfirecooking');
  const hasFishingJunkSource = sourceNames.includes('fishingjunkreplacement');

  if (hasTerminalSource) {
    return {
      ...blockedResolutionBase(row),
      resolutionLane: 'explicit_exemption_review',
      canImportOrdinarySource: false,
      requiresProjection: false,
      nextAction: '标记为 unimplemented/unobtainable 豁免，不写普通来源。'
    };
  }
  if (hasHardmodeTreasureBagGroup && typeRefs.size === 1) {
    return {
      ...blockedResolutionBase(row),
      resolutionLane: 'importable_normalization_candidate',
      canImportOrdinarySource: true,
      requiresProjection: false,
      nextAction: '把 Hardmode Treasure Bag group 转成 text-only boss_group/treasure_bag 规则，测试后进入 dry-run。'
    };
  }
  if (hasTransformOrTradeMechanic || hasEventReward) {
    return {
      ...blockedResolutionBase(row),
      resolutionLane: 'dedicated_projection_required',
      canImportOrdinarySource: false,
      requiresProjection: true,
      nextAction: '需要 transformation/NPC 机制投影或专属来源类型，不能伪造成 drop/shop。'
    };
  }
  if (hasEditionSource || hasCookingSource || hasFishingJunkSource) {
    return {
      ...blockedResolutionBase(row),
      resolutionLane: 'importable_normalization_candidate',
      canImportOrdinarySource: true,
      requiresProjection: false,
      nextAction: '补明确 sourceType/refType 规范化规则并 dry-run 校验。'
    };
  }
  return {
    ...blockedResolutionBase(row),
    resolutionLane: 'manual_source_contract_review',
    canImportOrdinarySource: false,
    requiresProjection: false,
    nextAction: '需要人工确认来源契约后再决定导入、投影或豁免。'
  };
}

function blockedResolutionBase(row) {
  return {
    itemId: row.itemId ?? null,
    itemInternalName: row.itemInternalName ?? null,
    itemName: row.itemName ?? null,
    sourcePage: row.pageTitle ?? null,
    sourceTypeRef: row.blockedSourceTypeRefs.join(', '),
    blockedSourceReasons: row.blockedSourceReasons,
    requiresRawEvidence: false
  };
}

function familyBlockedNextAction(row) {
  const pageTitle = normalizeText(row.pageTitle);
  if (pageTitle === 'Banners (enemy)') return '按 banner item -> NPC/enemy 身份映射，不能整页放行。';
  if (['Trophies', 'Masks', 'Relics'].includes(pageTitle)) return '补 boss 映射或 boss/drop 投影规则后再放行。';
  if (pageTitle === 'Wings') return '拆 developer wings、treasure bag、shop/craft 子规则。';
  if (pageTitle === 'Treasure Bag') return '补 treasure bag item/group ref 解析。';
  return '按 sourcePage/sourceType/sourceRefType 写精确 family parser，测试后再进入 dry-run。';
}

function classifyFamilyPendingName(name) {
  const text = String(name ?? '');
  if (/Statue\b/i.test(text)) return 'Statues';
  if (/Music Box/i.test(text)) return 'Music Boxes';
  if (/Painting\b/i.test(text)) return 'Paintings';
  if (/Block\b/i.test(text)) return 'Blocks';
  if (/Moss\b/i.test(text)) return 'Moss';
  if (/Vase\b/i.test(text)) return 'Vases';
  if (/Altar\b/i.test(text)) return 'Altars';
  return 'Other';
}

function classifyFamilyPendingPolicyFamily(row) {
  const internalName = String(row?.internalName ?? row?.itemInternalName ?? '');
  const name = String(row?.name ?? row?.itemName ?? '');
  if (/MusicBox/i.test(internalName) || /Music Box/i.test(name)) return 'Music Boxes';
  if (/Statue$/i.test(internalName) || /Statue\b/i.test(name)) return 'Statues';
  if (/Dragonfly/i.test(internalName) || /Dragonfly\b/i.test(name)) return 'Dragonflies';
  if (/LogicGate/i.test(internalName) || /Logic Gate/i.test(name)) return 'Logic Gates';
  if (/TeamBlock/i.test(internalName) || /Team Block/i.test(name)) return 'Team Blocks';
  if (/PlanterBox/i.test(internalName) || /Planter Box/i.test(name)) return 'Planter Boxes';
  if (/Altar/i.test(internalName) || /Altar\b/i.test(name)) return 'Altars';
  if (/Moss/i.test(internalName) || /Moss\b/i.test(name)) return 'Moss';
  if (/Vase/i.test(internalName) || /Vase\b/i.test(name)) return 'Vases';
  if (/Wall/i.test(internalName) || /Wall\b/i.test(name)) return 'Unsafe Walls';
  if (/Shimmer/i.test(internalName) || /Shimmer/i.test(name)) return 'Shimmer Tools';
  if (/Banner/i.test(internalName) || /Banner\b/i.test(name)) return 'Banners';
  return 'Paintings';
}

function appendResolutionMatrix(lines, matrix = {}) {
  lines.push('');
  lines.push('## 处置矩阵');
  lines.push('');
  lines.push('| resolutionLane | count |');
  lines.push('| --- | ---: |');
  for (const row of matrix.summaryByLane ?? []) {
    lines.push(`| ${escapePipe(row.key)} | ${row.count} |`);
  }
}

function countBy(values = [], keySelector) {
  const counts = {};
  for (const value of values) {
    const key = keySelector(value) ?? '(blank)';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function appendAggregate(lines, title, rows = []) {
  if (!rows.length) return;
  lines.push('');
  lines.push(`## ${title}`);
  lines.push('');
  lines.push('| key | count |');
  lines.push('| --- | ---: |');
  for (const row of rows.slice(0, 30)) {
    lines.push(`| ${escapePipe(row.key)} | ${row.count} |`);
  }
}

function appendItems(lines, title, rows = [], formatter, limit) {
  if (!rows.length) return;
  const listed = rows.slice(0, limit);
  lines.push('');
  lines.push(`## ${title}`);
  lines.push('');
  lines.push('| item | detail |');
  lines.push('| --- | --- |');
  for (const row of listed) {
    const formatted = formatter(row);
    lines.push(`| ${escapePipe(formatted.item)} | ${escapePipe(formatted.detail)} |`);
  }
  if (rows.length > listed.length) {
    lines.push('');
    lines.push(`仅展示前 ${listed.length} 条，完整 ${rows.length} 条见 JSON。`);
  }
}

function formatDryRunRow(row) {
  return {
    item: `${row.itemId ?? ''} ${row.itemInternalName ?? ''} / ${row.itemName ?? ''}`.trim(),
    detail: `${row.sourceTypeRef} -> ${row.sourceRefName ?? ''} (${row.sourcePage ?? ''})`
  };
}

function formatCandidateRow(row) {
  return {
    item: `${row.itemId ?? ''} ${row.itemInternalName ?? ''} / ${row.itemName ?? ''}`.trim(),
    detail: `${row.pageTitle ?? ''}; ${row.blockedReason ?? ''}; ${row.blockedSourceTypeRefs.join(', ')}`
  };
}

function formatBlockedCandidateRow(row) {
  return {
    item: `${row.itemId ?? ''} ${row.itemInternalName ?? ''} / ${row.itemName ?? ''}`.trim(),
    detail: `${row.pageTitle ?? ''}; ${row.blockedSourceReasons.join(', ')}; ${row.blockedSourceTypeRefs.join(', ')}`
  };
}

function formatExplicitSourceExemptionRow(row) {
  return {
    item: `${row.itemId ?? ''} ${row.itemInternalName ?? ''} / ${row.itemName ?? ''}`.trim(),
    detail: `${row.pageTitle ?? ''}; ${row.exemptionReason ?? ''}; ${row.exemptionStatuses.join(', ')}`
  };
}

function formatEvidenceRow(row) {
  return {
    item: `${row.itemId ?? ''} ${row.internalName ?? ''} / ${row.name ?? ''}`.trim(),
    detail: `${row.evidenceLayer ?? ''}; ${row.closureLane ?? ''}; ${row.terminalClosureStatus ?? ''}`
  };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filePath), 'utf8'));
}

function escapePipe(value) {
  return String(value ?? '').replaceAll('|', '\\|');
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
    const report = runBuildItemSourceRemainingWorkItemsReport(parseBuildItemSourceRemainingWorkItemsReportArgs());
    process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
