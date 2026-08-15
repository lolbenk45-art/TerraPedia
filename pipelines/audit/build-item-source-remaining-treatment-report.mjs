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

const REVIEW_LANE_TO_CLASSIFICATION = {
  direct_page_candidate: 'high_confidence',
  family_recipe_exact_result_candidate: 'high_confidence',
  family_or_shared_page_candidate: 'family_page_candidate'
};

const DEFAULT_FAMILY_POLICY_REVIEW = {
  familyPolicyPendingItems: 278,
  familyPolicyCandidateBlockedItems: 632,
  topSourcePages: [
    { sourcePage: 'Paintings', items: 97 },
    { sourcePage: 'Music Boxes', items: 95 },
    { sourcePage: 'Statues', items: 52 },
    { sourcePage: 'Dragonflies', items: 6 },
    { sourcePage: 'Logic Gates', items: 6 },
    { sourcePage: 'Team Blocks', items: 6 },
    { sourcePage: 'Altars', items: 4 },
    { sourcePage: 'Moss', items: 4 },
    { sourcePage: 'Vases', items: 4 }
  ],
  topRowTypeCounts: [
    { sourceType: 'worldgen', sourceRefType: 'world', rows: 221 },
    { sourceType: 'shop', sourceRefType: 'npc', rows: 108 },
    { sourceType: 'drop', sourceRefType: 'boss', rows: 8 },
    { sourceType: 'mining', sourceRefType: 'world', rows: 5 },
    { sourceType: 'drop', sourceRefType: 'npc', rows: 4 }
  ],
  requiredWork: [
    '扩展 family policy/parser，不能把 Paintings/Statues/Music Boxes 等整页无条件放行。',
    'Music Boxes、Logic Gates、Team Blocks、Planter Boxes 属于 shop/NPC family rule，不适合走 shared worldgen allow。',
    'Altars 等混合页需要先解决 boss/ref 映射或拆 item-specific row。'
  ]
};

const DEFAULT_PUBLIC_CONTRACT_REVIEW = {
  publicDetailSourceVisibility: 'partial',
  missingContractFields: [
    'evidenceKind',
    'sourceFactKey',
    'recipeId',
    'recipeKind',
    'npcDetailPath',
    'lootEntryId',
    'shopEntryId',
    'dropSourceKind',
    'biomeDetailPath'
  ],
  conclusion: '前台 item detail 已能泛化展示 /public/items/{id}/sources 和 recipe-tree，但 recipe/shimmer、NPC loot/shop、biome/location 的专属证据字段还没有完整落到 public contract/UI。'
};

export function parseBuildItemSourceRemainingTreatmentReportArgs(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  for (const [key, value] of Object.entries(options)) {
    if (MUTATION_FLAGS.has(key.toLowerCase()) && value !== false && value !== 'false') {
      throw new Error(`read-only remaining treatment report refuses mutation flag: --${key}`);
    }
  }
  return {
    evidenceReportPath: options['evidence-report'] ?? options.evidenceReport ?? 'data/reports/item-source-existing-evidence-layers-2026-06-12.json',
    rawCandidatesPath: options['raw-candidates'] ?? options.rawCandidates ?? 'data/reports/item-source-raw-page-candidates-2026-06-11-current.json',
    candidatePlanPath: options['candidate-plan'] ?? options.candidatePlan ?? 'data/reports/item-source-candidate-import-plan.remaining-2026-06-12.json',
    dryRunReportPath: options['dry-run-report'] ?? options.dryRunReport ?? 'data/reports/item-source-candidate-local-compat-dry-run-2026-06-12.json',
    outputPath: options.output ?? null,
    summaryOutputPath: options['summary-output'] ?? options.summaryOutput ?? null
  };
}

export function buildFocusedCandidateAuditSummary(rawCandidateReport = {}) {
  const candidates = (Array.isArray(rawCandidateReport.candidates) ? rawCandidateReport.candidates : [])
    .map((candidate) => {
      const classification = REVIEW_LANE_TO_CLASSIFICATION[candidate.reviewLane] ?? candidate.classification ?? 'unknown';
      return {
        ...candidate,
        itemInternalName: candidate.itemInternalName ?? candidate.internalName ?? null,
        itemName: candidate.itemName ?? candidate.name ?? null,
        classification,
        rawSourceCount: Number(candidate.rawSourceCount ?? candidate.extractedSourceCount ?? (Array.isArray(candidate.extractedSources) ? candidate.extractedSources.length : 0)),
        standardizedSourceCount: Number(candidate.standardizedSourceCount ?? 0)
      };
    });

  return {
    generatedAt: rawCandidateReport.generatedAt ?? null,
    readOnly: true,
    totalCandidates: candidates.length,
    classificationCounts: countBy(candidates, (candidate) => candidate.classification),
    candidates
  };
}

export function buildItemSourceRemainingTreatmentReport({
  generatedAt = new Date().toISOString(),
  evidenceReport = {},
  rawCandidateReport = null,
  candidatePlan = {},
  dryRunReport = {},
  familyPolicyReview = DEFAULT_FAMILY_POLICY_REVIEW,
  publicContractReview = DEFAULT_PUBLIC_CONTRACT_REVIEW,
  inputs = {}
} = {}) {
  const focusedRawCandidateSummary = rawCandidateReport ? buildFocusedCandidateAuditSummary(rawCandidateReport) : null;
  const evidenceSummary = evidenceReport.summary ?? {};
  const layerCounts = evidenceSummary.layerCounts ?? {};
  const candidateSummary = candidatePlan.summary ?? {};
  const dryRunSummary = dryRunReport.summary ?? {};
  const projectionRequiredRows = Number(layerCounts.npc_relation_not_projected ?? 0) + Number(layerCounts.biome_projection_pending ?? 0);
  const dryRunReadyRows = Number(dryRunSummary.toInsert ?? candidateSummary.plannedSourceRows ?? 0);
  const dryRunReadyCandidates = Number(dryRunSummary.selectedCandidates ?? candidateSummary.eligibleCandidates ?? 0);
  const blockedReasonCounts = candidateSummary.blockedReasonCounts ?? {};
  const familyPolicyBlockedCandidates = Number(blockedReasonCounts.family_page_candidate ?? 0);
  const blockedSourceRows = countBlockedSourceRows(candidatePlan);

  const summary = {
    totalRemainingRows: Number(evidenceSummary.totalRows ?? 0),
    evidenceLayerCountSum: Number(evidenceSummary.layerCountSum ?? 0),
    allRowsClassifiedByEvidenceLayer: Number(evidenceSummary.totalRows ?? 0) === Number(evidenceSummary.layerCountSum ?? 0),
    itemOnlyNoSourceEvidenceRows: Number(layerCounts.item_only_no_source_evidence ?? 0),
    dedicatedStructureCoveredRows: Number(layerCounts.recipe_or_shimmer_covered ?? 0),
    rawCandidateRows: Number(layerCounts.raw_candidate_not_projected ?? 0),
    focusedRawCandidates: Number(candidateSummary.totalCandidates ?? focusedRawCandidateSummary?.totalCandidates ?? 0),
    dryRunReadyCandidates,
    dryRunReadySourceRows: dryRunReadyRows,
    requiresUserApprovedApplyRows: dryRunReadyRows,
    notAppliedBecauseSafetyBoundaryRows: dryRunReport.apply === false ? dryRunReadyRows : 0,
    dryRunValidationErrors: Number(dryRunSummary.validationErrors ?? 0),
    dryRunDuplicates: Number(dryRunSummary.duplicates ?? 0),
    familyPolicyBlockedCandidates,
    familyPolicyPendingClosureRows: Number(layerCounts.family_policy_pending ?? familyPolicyReview.familyPolicyPendingItems ?? 0),
    blockedSourceRowCandidates: Number(blockedReasonCounts.blocked_source_rows ?? 0),
    blockedSourceRows,
    projectionRequiredRows,
    npcRelationNotProjectedRows: Number(layerCounts.npc_relation_not_projected ?? 0),
    biomeProjectionPendingRows: Number(layerCounts.biome_projection_pending ?? 0),
    terminalExemptOrIdentityReviewRows: Number(layerCounts.terminal_exempt_or_identity_review ?? 0),
    missingRawRequiredRows: Number(layerCounts.missing_required_raw_evidence ?? 0),
    canClaimAllRowsAppliedToDb: false,
    dbWritesPerformed: false,
    crawlerOrFetchPerformed: false
  };

  return {
    generatedAt,
    readOnly: true,
    entity: 'item_source_remaining_treatment_report',
    inputs,
    summary,
    actions: buildActions(summary, dryRunReport),
    remainingWork: buildRemainingWork(summary),
    familyPolicyReview,
    publicContractReview,
    focusedRawCandidateSummary: focusedRawCandidateSummary ? {
      totalCandidates: focusedRawCandidateSummary.totalCandidates,
      classificationCounts: focusedRawCandidateSummary.classificationCounts
    } : null,
    candidatePlanSummary: candidateSummary,
    dryRunSummary,
    examples: buildExamples(evidenceReport, candidatePlan)
  };
}

export function renderItemSourceRemainingTreatmentChineseSummary(report) {
  const summary = report.summary ?? {};
  const lines = [];
  lines.push('# 物品来源剩余处理闭环汇总');
  lines.push('');
  lines.push(`生成时间：${report.generatedAt ?? ''}`);
  lines.push('');
  lines.push('## 总结论');
  lines.push('');
  lines.push('- 本次完成的是“剩余来源证据处理闭环”：把剩余行分成已由专属结构覆盖、dry-run 可导入、policy/parser 阻断、投影阻断、raw evidence 缺失、豁免审查。');
  if ((summary.dryRunReadySourceRows ?? 0) > 0) {
    lines.push(`- 已 dry-run 可写库但需要用户明确批准 \`--apply=true\`：\`${summary.dryRunReadySourceRows ?? 0}\` source rows / \`${summary.dryRunReadyCandidates ?? 0}\` candidates。当前未写库。`);
  } else {
    lines.push(`- dry-run 实际可插入普通来源：\`${summary.dryRunReadySourceRows ?? 0}\` source rows / \`${summary.dryRunReadyCandidates ?? 0}\` candidates。当前无待 apply 的普通来源行。`);
  }
  lines.push('- 不能说“全处理完并已入库”：因为写库 apply、crawler/fetch、真实 backfill 都在本轮安全边界之外。');
  lines.push('');
  lines.push('## 数量');
  lines.push('');
  lines.push('| 类别 | 数量 | 当前处理方式 |');
  lines.push('| --- | ---: | --- |');
  lines.push(`| 总剩余行 | ${summary.totalRemainingRows ?? 0} | 已按 evidence layer 全量分类 |`);
  lines.push(`| recipe/shimmer 专属结构覆盖 | ${summary.dedicatedStructureCoveredRows ?? 0} | 不重复写普通来源，后续补 API/UI 专属展示 |`);
  lines.push(`| dry-run 可插入普通来源 | ${summary.dryRunReadySourceRows ?? 0} | ${summary.dryRunReadySourceRows > 0 ? '需用户批准 apply' : '无待 apply 普通来源行'} |`);
  lines.push(`| family policy 阻断候选 | ${summary.familyPolicyBlockedCandidates ?? 0} | 需要 family page policy/parser |`);
  lines.push(`| family parser/policy 待建模 | ${summary.familyPolicyPendingClosureRows ?? 0} | 需要 pageTitle/sourceType/sourceRefType 规则 |`);
  lines.push(`| blocked source row 候选 | ${summary.blockedSourceRowCandidates ?? 0} | 需要 ref type / group source 精修 |`);
  lines.push(`| NPC/biome 投影阻断 | ${summary.projectionRequiredRows ?? 0} | 需要关系投影/API/UI contract |`);
  lines.push(`| 缺 raw evidence | ${summary.missingRawRequiredRows ?? 0} | 不能猜，需补精确 raw 页面证据 |`);
  lines.push(`| terminal/身份豁免 | ${summary.terminalExemptOrIdentityReviewRows ?? 0} | 保持豁免或人工审查，不导入普通来源 |`);
  lines.push(`| item-only 无证据 | ${summary.itemOnlyNoSourceEvidenceRows ?? 0} | 本轮为 0 |`);
  lines.push('');
  lines.push('## 已可执行但未越界执行');
  lines.push('');
  lines.push(`- 已生成 focused candidate plan：${summary.focusedRawCandidates ?? 0} candidates。`);
  lines.push(`- dry-run 选中：${summary.dryRunReadyCandidates ?? 0} candidates。`);
  lines.push(`- dry-run 将插入：${summary.dryRunReadySourceRows ?? 0} rows。`);
  lines.push(`- validation errors：${summary.dryRunValidationErrors ?? 0}。`);
  lines.push(`- duplicates：${summary.dryRunDuplicates ?? 0}。`);
  lines.push('- 本轮没有执行 `--apply=true`，没有写 DB，没有跑 crawler/fetch/import/backfill/sync/pipeline/Flyway。');
  lines.push('');
  lines.push('## family policy 审查');
  lines.push('');
  lines.push('| sourcePage | items |');
  lines.push('| --- | ---: |');
  for (const row of report.familyPolicyReview?.topSourcePages ?? []) {
    lines.push(`| ${escapePipe(row.sourcePage)} | ${row.items} |`);
  }
  lines.push('');
  lines.push('| sourceType/refType | rows |');
  lines.push('| --- | ---: |');
  for (const row of report.familyPolicyReview?.topRowTypeCounts ?? []) {
    lines.push(`| \`${row.sourceType}/${row.sourceRefType}\` | ${row.rows} |`);
  }
  lines.push('');
  lines.push('## API/UI 审查');
  lines.push('');
  lines.push(`- 可见性：${report.publicContractReview?.publicDetailSourceVisibility ?? 'unknown'}。`);
  lines.push(`- 结论：${report.publicContractReview?.conclusion ?? ''}`);
  lines.push(`- 缺字段：${(report.publicContractReview?.missingContractFields ?? []).map((field) => `\`${field}\``).join('、')}`);
  lines.push('');
  lines.push('## 样本');
  appendExampleTable(lines, 'dry-run 可插入样本', report.examples?.dryRunReady);
  appendExampleTable(lines, 'blocked source rows 样本', report.examples?.blockedSourceRows);
  appendExampleTable(lines, 'family policy 阻断样本', report.examples?.familyPolicyBlocked);
  appendExampleTable(lines, '投影阻断样本', report.examples?.projectionRequired);
  appendExampleTable(lines, '缺 raw evidence 样本', report.examples?.missingRawRequired);
  lines.push('');
  lines.push('## 下一步');
  lines.push('');
  for (const row of report.remainingWork ?? []) {
    lines.push(`- ${row.title}：${row.count}。${row.nextAction}`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function runBuildItemSourceRemainingTreatmentReport(options = {}, dependencies = {}) {
  const now = dependencies.now instanceof Date ? dependencies.now : new Date();
  const evidenceReport = dependencies.evidenceReport ?? readJson(options.evidenceReportPath);
  const rawCandidateReport = dependencies.rawCandidateReport ?? readJsonIfExists(options.rawCandidatesPath);
  const candidatePlan = dependencies.candidatePlan ?? readJson(options.candidatePlanPath);
  const dryRunReport = dependencies.dryRunReport ?? readJson(options.dryRunReportPath);
  const report = buildItemSourceRemainingTreatmentReport({
    generatedAt: now.toISOString(),
    evidenceReport,
    rawCandidateReport,
    candidatePlan,
    dryRunReport,
    inputs: {
      evidenceReportPath: options.evidenceReportPath,
      rawCandidatesPath: options.rawCandidatesPath,
      candidatePlanPath: options.candidatePlanPath,
      dryRunReportPath: options.dryRunReportPath
    }
  });
  if (options.outputPath) {
    writeJson(path.resolve(process.cwd(), options.outputPath), report);
  }
  if (options.summaryOutputPath) {
    fs.mkdirSync(path.dirname(path.resolve(process.cwd(), options.summaryOutputPath)), { recursive: true });
    fs.writeFileSync(path.resolve(process.cwd(), options.summaryOutputPath), renderItemSourceRemainingTreatmentChineseSummary(report));
  }
  return report;
}

function buildActions(summary, dryRunReport) {
  const actions = [];
  if ((summary.dryRunReadySourceRows ?? 0) > 0) {
    actions.push({
      lane: 'raw_candidate_not_projected',
      status: 'ready_but_requires_explicit_apply_approval',
      candidates: summary.dryRunReadyCandidates,
      sourceRows: summary.dryRunReadySourceRows,
      applyPerformed: Boolean(dryRunReport.apply),
      nextAction: '用户明确批准后，才能用 guarded local compat apply 执行 --apply=true。'
    });
  }
  return actions;
}

function countBlockedSourceRows(candidatePlan) {
  return (candidatePlan.blockedCandidates ?? [])
    .filter((candidate) => candidate.blockedReason === 'blocked_source_rows')
    .reduce((sum, candidate) => sum + (Array.isArray(candidate.blockedSources) ? candidate.blockedSources.length : 0), 0);
}

function buildRemainingWork(summary) {
  const rows = [];
  if ((summary.dryRunReadySourceRows ?? 0) > 0) {
    rows.push({
      lane: 'candidate_apply_requires_user_approval',
      title: 'dry-run 已通过但未写库',
      count: summary.dryRunReadySourceRows,
      nextAction: '需要用户批准 DB 写入边界后执行 guarded apply。'
    });
  }
  if ((summary.familyPolicyBlockedCandidates ?? 0) > 0 || (summary.familyPolicyPendingClosureRows ?? 0) > 0) {
    rows.push({
      lane: 'family_policy_parser_required',
      title: 'family/shared 页面 policy/parser',
      count: Number(summary.familyPolicyBlockedCandidates ?? 0) + Number(summary.familyPolicyPendingClosureRows ?? 0),
      nextAction: '按 Paintings、Statues、Music Boxes 等 pageTitle 分批扩展精确 policy/parser。'
    });
  }
  if ((summary.blockedSourceRowCandidates ?? 0) > 0) {
    rows.push({
      lane: 'blocked_source_rows_required',
      title: 'blocked source rows',
      count: summary.blockedSourceRowCandidates,
      nextAction: '修复 npc_group/boss_group/unknown 等 ref type 或拆成专属 parser。'
    });
  }
  if ((summary.projectionRequiredRows ?? 0) > 0) {
    rows.push({
      lane: 'projection_contract_required',
      title: 'NPC/biome 关系投影',
      count: summary.projectionRequiredRows,
      nextAction: '补 public contract 和前台专属展示，不伪造成普通来源。'
    });
  }
  if ((summary.missingRawRequiredRows ?? 0) > 0) {
    rows.push({
      lane: 'missing_raw_evidence_required',
      title: '缺 raw evidence',
      count: summary.missingRawRequiredRows,
      nextAction: '必须补精确 raw evidence；不能用相似页面猜来源。'
    });
  }
  return rows;
}

function buildExamples(evidenceReport, candidatePlan) {
  return {
    dryRunReady: (candidatePlan.eligibleCandidates ?? []).slice(0, 10).map((candidate) => ({
      internalName: candidate.itemInternalName,
      name: candidate.itemName,
      sourceRows: Array.isArray(candidate.plannedSources) ? candidate.plannedSources.length : 0,
      sourceTypes: unique((candidate.plannedSources ?? []).map((source) => `${source.sourceType}/${source.sourceRefType}`))
    })),
    blockedSourceRows: (candidatePlan.blockedCandidates ?? [])
      .filter((candidate) => candidate.blockedReason === 'blocked_source_rows')
      .slice(0, 10)
      .map((candidate) => ({
        internalName: candidate.itemInternalName,
        name: candidate.itemName,
        blockedReason: candidate.blockedReason,
        sourceReasons: unique((candidate.blockedSources ?? []).map((source) => source.blockedReason))
      })),
    familyPolicyBlocked: (candidatePlan.blockedCandidates ?? [])
      .filter((candidate) => candidate.blockedReason === 'family_page_candidate')
      .slice(0, 10)
      .map((candidate) => ({
        internalName: candidate.itemInternalName,
        name: candidate.itemName,
        pageTitle: candidate.pageTitle,
        sourceTypes: unique((candidate.blockedSources ?? []).map((source) => `${source.sourceType}/${source.sourceRefType}`))
      })),
    projectionRequired: [
      ...(evidenceReport.rowsByEvidenceLayer?.npc_relation_not_projected ?? []),
      ...(evidenceReport.rowsByEvidenceLayer?.biome_projection_pending ?? [])
    ].slice(0, 20).map(toEvidenceExample),
    missingRawRequired: (evidenceReport.rowsByEvidenceLayer?.missing_required_raw_evidence ?? [])
      .slice(0, 20)
      .map(toEvidenceExample),
    terminalExemptOrIdentityReview: (evidenceReport.rowsByEvidenceLayer?.terminal_exempt_or_identity_review ?? [])
      .slice(0, 20)
      .map(toEvidenceExample)
  };
}

function appendExampleTable(lines, title, rows = []) {
  if (!rows.length) return;
  lines.push('');
  lines.push(`### ${title}`);
  lines.push('');
  lines.push('| internalName | name | 说明 |');
  lines.push('| --- | --- | --- |');
  for (const row of rows) {
    const detail = row.sourceTypes?.join(', ')
      ?? row.sourceReasons?.join(', ')
      ?? row.blockedReason
      ?? row.pageTitle
      ?? String(row.sourceRows ?? '');
    lines.push(`| ${escapePipe(row.internalName)} | ${escapePipe(row.name)} | ${escapePipe(detail)} |`);
  }
}

function toEvidenceExample(row) {
  return {
    itemId: row.itemId,
    internalName: row.internalName,
    name: row.name,
    closureLane: row.closureLane,
    evidenceLayer: row.evidenceLayer
  };
}

function countBy(values, keySelector) {
  const counts = {};
  for (const value of values) {
    const key = keySelector(value) ?? 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filePath), 'utf8'));
}

function readJsonIfExists(filePath) {
  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) return null;
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function escapePipe(value) {
  return String(value ?? '').replaceAll('|', '\\|');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const report = runBuildItemSourceRemainingTreatmentReport(parseBuildItemSourceRemainingTreatmentReportArgs());
    process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
