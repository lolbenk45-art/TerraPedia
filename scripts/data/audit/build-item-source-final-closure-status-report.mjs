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

const PROJECTION_CONTRACT_FILES = [
  'back/src/main/java/com/terraria/skills/dto/ItemSourceDTO.java',
  'back/src/main/java/com/terraria/skills/dto/PublicItemSourceDTO.java',
  'back/src/main/java/com/terraria/skills/service/impl/ItemSourceServiceImpl.java',
  'back/src/main/java/com/terraria/skills/controller/PublicItemRelationController.java',
  'front-nuxt/types/public-api.ts',
  'front-nuxt/pages/items/[id].vue'
];

export function parseBuildItemSourceFinalClosureStatusReportArgs(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  for (const [key, value] of Object.entries(options)) {
    if (MUTATION_FLAGS.has(key.toLowerCase()) && value !== false && value !== 'false') {
      throw new Error(`read-only final closure status report refuses mutation flag: --${key}`);
    }
  }
  return {
    workItemsPath: options['work-items'] ?? options.workItems ?? 'data/reports/item-source-remaining-work-items-report-2026-06-12.json',
    candidatePlanPath: options['candidate-plan'] ?? options.candidatePlan ?? 'data/reports/item-source-candidate-import-plan.remaining-2026-06-12.json',
    dryRunReportPath: options['dry-run-report'] ?? options.dryRunReport ?? 'data/reports/item-source-candidate-local-compat-dry-run-2026-06-12.json',
    outputPath: options.output ?? null,
    summaryOutputPath: options['summary-output'] ?? options.summaryOutput ?? null,
    verifyLocalDb: booleanOption(options['verify-local-db'] ?? options.verifyLocalDb, false),
    database: options.database ?? 'terria_v1_local'
  };
}

export function buildItemSourceFinalClosureStatusReport({
  generatedAt = new Date().toISOString(),
  workItemsReport = {},
  candidatePlan = {},
  dryRunReport = {},
  projectionEvidenceRows = []
} = {}) {
  const workSummary = workItemsReport.summary ?? {};
  const dryRunSummary = dryRunReport.summary ?? {};
  const dryRunApplyStatus = classifyDryRunApplyStatus(dryRunReport);
  const projectionRows = workItemsReport.workItems?.projectionRequiredRows ?? [];
  const projectionEvidenceById = new Map(projectionEvidenceRows.map((row) => [Number(row.itemId ?? row.id), row]));
  const projectionClosures = projectionRows.map((row) => {
    const evidence = projectionEvidenceById.get(Number(row.itemId));
    const evidenceCount = Number(evidence?.npcLoot ?? 0)
      + Number(evidence?.npcShop ?? 0)
      + Number(evidence?.biomeResource ?? 0)
      + Number(evidence?.itemBiome ?? 0);
    return {
      ...row,
      closureStatus: evidenceCount > 0 ? 'projected_by_public_sources_contract' : 'projection_evidence_missing',
      publicContractFiles: PROJECTION_CONTRACT_FILES,
      evidenceCounts: evidence ? {
        npcLoot: Number(evidence.npcLoot ?? 0),
        npcShop: Number(evidence.npcShop ?? 0),
        biomeResource: Number(evidence.biomeResource ?? 0),
        itemBiome: Number(evidence.itemBiome ?? 0)
      } : null,
      nextAction: evidenceCount > 0
        ? '由 public item sources contract 只读投影，不写 item_acquisition_sources。'
        : '本地 DB 未读到 NPC/biome evidence，需先补证据链。'
    };
  });
  const blockedSourceClosures = (workItemsReport.workItems?.blockedSourceRowCandidates ?? []).map((row) => {
    const matrixRow = (workItemsReport.resolutionMatrix?.rows ?? [])
      .find((entry) => entry.itemInternalName === row.itemInternalName);
    return {
      ...row,
      closureStatus: matrixRow?.resolutionLane ?? 'manual_source_contract_review',
      nextAction: matrixRow?.nextAction ?? row.nextAction ?? '人工确认来源契约。'
    };
  });
  const explicitSourceExemptionClosures = (workItemsReport.workItems?.explicitSourceExemptionCandidates ?? []).map((row) => ({
    ...row,
    closureStatus: 'explicit_exemption_review',
    importableAsSource: false,
    nextAction: row.nextAction ?? '显式不可获得/未实现来源，保留为豁免，不导入普通 item source。'
  }));
  const terminalRows = workItemsReport.workItems?.terminalExemptOrIdentityReviewRows ?? [];
  const terminalClosures = terminalRows.map((row) => ({
    ...row,
    terminalClosureStatus: row.terminalClosureStatus ?? inferTerminalClosureStatus(row),
    closureStatus: 'explicit_exemption_review',
    importableAsSource: false,
    nextAction: '保持显式豁免/身份审查，不导入普通来源。'
  }));
  const missingRawClosures = (workItemsReport.workItems?.missingRawRequiredRows ?? []).map((row) => ({
    ...row,
    closureStatus: 'missing_raw_evidence_required',
    importableAsSource: false,
    nextAction: '缺精确 raw evidence，不能猜来源；需单独 raw evidence acquisition。'
  }));
  const blockedSourceSummaryByStatus = summarizeBy(
    [...blockedSourceClosures, ...explicitSourceExemptionClosures],
    (row) => row.closureStatus ?? 'manual_source_contract_review'
  );

  const summary = {
    dbWritesPerformed: dryRunApplyStatus.status === 'applied_to_local_db',
    crawlerOrFetchPerformed: false,
    dryRunReadyCandidates: Number(dryRunSummary.selectedCandidates ?? workSummary.dryRunReadyCandidates ?? 0),
    dryRunReadySourceRows: Number(dryRunSummary.toInsert ?? workSummary.dryRunReadySourceRows ?? 0),
    dryRunValidationErrors: Number(dryRunSummary.validationErrors ?? 0),
    dryRunDuplicates: Number(dryRunSummary.duplicates ?? 0),
    familyPolicyRowsAwaitingParser: Number(workSummary.familyPolicyBlockedCandidates ?? 0) + Number(workSummary.familyPolicyPendingClosureRows ?? 0),
    blockedSourceRowsRemaining: Number(workSummary.blockedSourceRows ?? 0),
    blockedSourceCandidatesRemaining: Number(workSummary.blockedSourceRowCandidates ?? 0),
    explicitSourceExemptionRows: Number(workSummary.explicitSourceExemptionRows ?? 0),
    explicitSourceExemptionCandidates: Number(workSummary.explicitSourceExemptionCandidates ?? 0),
    projectionRows: projectionClosures.length,
    projectionRowsClosedByPublicContract: projectionClosures.filter((row) => row.closureStatus === 'projected_by_public_sources_contract').length,
    terminalExemptionRows: terminalClosures.length,
    missingRawRows: missingRawClosures.length,
    blockedSourceSummaryByStatus,
    allProjectionRowsHaveEvidence: projectionClosures.every((row) => row.closureStatus === 'projected_by_public_sources_contract'),
    canClaimAllOrdinarySourcesAppliedToDb: dryRunApplyStatus.status === 'applied_to_local_db',
    canClaimNoRemainingWork: false
  };

  return {
    generatedAt,
    readOnly: true,
    entity: 'item_source_final_closure_status',
    summary,
    candidatePlanSummary: candidatePlan.summary ?? null,
    dryRunSummary,
    closures: {
      dryRunReady: {
        closureStatus: dryRunApplyStatus.status,
        candidates: summary.dryRunReadyCandidates,
        sourceRows: summary.dryRunReadySourceRows,
        nextAction: dryRunApplyStatus.nextAction,
        evidence: dryRunApplyStatus.evidence
      },
      familyPolicy: {
        closureStatus: 'parser_policy_required',
        rows: summary.familyPolicyRowsAwaitingParser,
        nextAction: '需要按 page/source row 做 item-specific family parser；不能整页粗放放行。'
      },
      blockedSourceRows: blockedSourceClosures,
      explicitSourceExemptions: explicitSourceExemptionClosures,
      projections: projectionClosures,
      terminalExemptions: terminalClosures,
      missingRaw: missingRawClosures
    }
  };
}

export function renderItemSourceFinalClosureStatusChineseSummary(report) {
  const summary = report.summary ?? {};
  const lines = [];
  lines.push('# 物品来源闭环状态报告');
  lines.push('');
  lines.push(`生成时间：${report.generatedAt ?? ''}`);
  lines.push('');
  lines.push('## 结论');
  lines.push('');
  if (summary.dbWritesPerformed) {
    lines.push(`- 普通来源 apply 证据：${summary.dryRunReadySourceRows ?? 0} rows / ${summary.dryRunReadyCandidates ?? 0} candidates 已写入本地库；该数字是历史 apply 证据，不代表仍待写入。`);
  } else {
    const dryRunStatusText = (summary.dryRunReadySourceRows ?? 0) > 0
      ? '未写库，等待用户批准 apply'
      : '无待 apply 的普通来源行';
    lines.push(`- dry-run 实际可插入普通来源：${summary.dryRunReadySourceRows ?? 0} rows / ${summary.dryRunReadyCandidates ?? 0} candidates；当前${dryRunStatusText}。`);
  }
  lines.push(`- family parser/policy 待处理：${summary.familyPolicyRowsAwaitingParser ?? 0} rows。`);
  lines.push(`- blocked source 剩余：${summary.blockedSourceRowsRemaining ?? 0} rows / ${summary.blockedSourceCandidatesRemaining ?? 0} candidates；其中 ${summary.blockedSourceSummaryByStatus?.explicit_exemption_review ?? 0} 个显式豁免、${summary.blockedSourceSummaryByStatus?.dedicated_projection_required ?? 0} 个仍需专属机制投影。`);
  lines.push(`- candidate plan 显式不可导入来源豁免：${summary.explicitSourceExemptionRows ?? 0} rows / ${summary.explicitSourceExemptionCandidates ?? 0} candidates。`);
  lines.push(`- NPC/biome projection：${summary.projectionRowsClosedByPublicContract ?? 0}/${summary.projectionRows ?? 0} 已由 public sources contract 只读投影；不包括 blocked source 中仍需专属机制建模的转换/事件类来源。`);
  lines.push(`- terminal/身份豁免：${summary.terminalExemptionRows ?? 0} rows。`);
  lines.push(`- 缺 raw evidence：${summary.missingRawRows ?? 0} rows。`);
  lines.push(`- validation errors：${summary.dryRunValidationErrors ?? 0}；duplicates：${summary.dryRunDuplicates ?? 0}。`);
  lines.push('');
  lines.push('## Projection 全量');
  lines.push('');
  lines.push('| item | status | evidence | next |');
  lines.push('| --- | --- | --- | --- |');
  for (const row of report.closures?.projections ?? []) {
    const evidence = row.evidenceCounts
      ? `loot ${row.evidenceCounts.npcLoot}, shop ${row.evidenceCounts.npcShop}, biomeResource ${row.evidenceCounts.biomeResource}, itemBiome ${row.evidenceCounts.itemBiome}`
      : '未验证';
    lines.push(`| ${escapePipe(`${row.itemId} ${row.internalName} / ${row.name}`)} | ${row.closureStatus} | ${escapePipe(evidence)} | ${escapePipe(row.nextAction)} |`);
  }
  lines.push('');
  lines.push('## Blocked Source 剩余全量');
  lines.push('');
  lines.push('| item | status | next |');
  lines.push('| --- | --- | --- |');
  for (const row of report.closures?.blockedSourceRows ?? []) {
    lines.push(`| ${escapePipe(`${row.itemId} ${row.itemInternalName} / ${row.itemName}`)} | ${row.closureStatus} | ${escapePipe(row.nextAction)} |`);
  }
  lines.push('');
  lines.push('## 显式不可导入来源豁免全量');
  lines.push('');
  lines.push('| item | status | next |');
  lines.push('| --- | --- | --- |');
  for (const row of report.closures?.explicitSourceExemptions ?? []) {
    lines.push(`| ${escapePipe(`${row.itemId} ${row.itemInternalName} / ${row.itemName}`)} | ${row.closureStatus} | ${escapePipe(row.nextAction)} |`);
  }
  lines.push('');
  lines.push('## Terminal / 身份豁免全量');
  lines.push('');
  lines.push('| item | status | next |');
  lines.push('| --- | --- | --- |');
  for (const row of report.closures?.terminalExemptions ?? []) {
    lines.push(`| ${escapePipe(`${row.itemId} ${row.internalName} / ${row.name}`)} | ${escapePipe(row.terminalClosureStatus)} | ${escapePipe(row.nextAction)} |`);
  }
  lines.push('');
  lines.push('## Missing Raw 全量');
  lines.push('');
  lines.push('| item | next |');
  lines.push('| --- | --- |');
  for (const row of report.closures?.missingRaw ?? []) {
    lines.push(`| ${escapePipe(`${row.itemId} ${row.internalName} / ${row.name}`)} | ${escapePipe(row.nextAction)} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export async function runBuildItemSourceFinalClosureStatusReport(options = {}, dependencies = {}) {
  const now = dependencies.now instanceof Date ? dependencies.now : new Date();
  const workItemsReport = dependencies.workItemsReport ?? readJson(options.workItemsPath);
  const candidatePlan = dependencies.candidatePlan ?? readJson(options.candidatePlanPath);
  const dryRunReport = dependencies.dryRunReport ?? readJson(options.dryRunReportPath);
  const projectionEvidenceRows = dependencies.projectionEvidenceRows
    ?? (options.verifyLocalDb ? await loadProjectionEvidenceRows(workItemsReport, options) : []);
  const report = buildItemSourceFinalClosureStatusReport({
    generatedAt: now.toISOString(),
    workItemsReport,
    candidatePlan,
    dryRunReport,
    projectionEvidenceRows
  });
  if (options.outputPath) writeJson(path.resolve(process.cwd(), options.outputPath), report);
  if (options.summaryOutputPath) {
    fs.mkdirSync(path.dirname(path.resolve(process.cwd(), options.summaryOutputPath)), { recursive: true });
    fs.writeFileSync(path.resolve(process.cwd(), options.summaryOutputPath), renderItemSourceFinalClosureStatusChineseSummary(report));
  }
  return report;
}

async function loadProjectionEvidenceRows(workItemsReport, options) {
  const database = options.database ?? process.env.TERRAPEDIA_DB_NAME ?? 'terria_v1_local';
  if (database !== 'terria_v1_local') {
    throw new Error(`read-only final closure status report refuses non-local projection verification database: ${database}`);
  }
  const rows = workItemsReport.workItems?.projectionRequiredRows ?? [];
  const ids = rows.map((row) => Number(row.itemId)).filter(Number.isInteger);
  if (!ids.length) return [];
  const config = loadLocalStackConfig(repoRoot);
  const mysql = require('mysql2/promise');
  const connection = await mysql.createConnection({
    host: process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
    port: Number(process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 13306),
    user: process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
    password: process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
    database
  });
  try {
    const placeholders = ids.map(() => '?').join(',');
    const [result] = await connection.execute(
      `SELECT i.id AS itemId,
              i.internal_name AS internalName,
              i.name,
              (SELECT COUNT(*) FROM npc_loot_entries nle WHERE nle.item_id = i.id AND nle.status = 1 AND nle.deleted = 0) AS npcLoot,
              (SELECT COUNT(*) FROM npc_shop_entries nse WHERE nse.item_id = i.id AND nse.status = 1 AND nse.deleted = 0) AS npcShop,
              (SELECT COUNT(*) FROM biome_resources br WHERE br.item_id = i.id) AS biomeResource,
              (SELECT COUNT(*) FROM item_biomes ib WHERE ib.item_id = i.id) AS itemBiome
         FROM items i
        WHERE i.id IN (${placeholders})`,
      ids
    );
    return Array.isArray(result) ? result : [];
  } finally {
    await connection.end();
  }
}

function classifyDryRunApplyStatus(dryRunReport = {}) {
  const summary = dryRunReport.summary ?? {};
  const applyIsExactlyTrue = dryRunReport.apply === true;
  const toInsert = Number(summary.toInsert ?? -1);
  const inserted = Number(summary.inserted ?? 0);
  const validationErrors = Number(summary.validationErrors ?? 0);
  const duplicates = Number(summary.duplicates ?? 0);
  const hasRollback = typeof dryRunReport.rollbackSql === 'string' && dryRunReport.rollbackSql.trim() !== '';
  const hasBackup = typeof dryRunReport.backupPath === 'string' && dryRunReport.backupPath.trim() !== '';
  const appliedEvidence = {
    apply: dryRunReport.apply,
    toInsert,
    inserted,
    validationErrors,
    duplicates,
    hasRollback,
    hasBackup
  };
  if (!applyIsExactlyTrue) {
    return {
      status: 'waiting_for_user_approved_apply',
      nextAction: '需要用户明确批准 --apply=true 后才能写 item_acquisition_sources。',
      evidence: appliedEvidence
    };
  }
  if (toInsert >= 0 && inserted === toInsert && validationErrors === 0 && hasRollback && hasBackup) {
    return {
      status: 'applied_to_local_db',
      nextAction: '已写入本地 DB，且 apply 报告包含 rollback/backup evidence。',
      evidence: appliedEvidence
    };
  }
  return {
    status: 'apply_report_unverified',
    nextAction: '输入 apply 报告缺少完整插入、rollback 或 backup evidence；不能宣称已写库完成。',
    evidence: appliedEvidence
  };
}

function inferTerminalClosureStatus(row) {
  const key = normalizeIdentity(`${row.internalName} ${row.name}`);
  if (/bossbag/.test(key)) return 'internal_boss_bag_identity';
  if (/firstfractal/.test(key)) return 'unreleased_internal_item';
  if (/sleepingicon|tageffect/.test(key)) return 'runtime_internal_effect';
  return 'explicit_identity_review';
}

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filePath), 'utf8'));
}

function normalizeIdentity(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function escapePipe(value) {
  return String(value ?? '').replaceAll('|', '\\|');
}

function summarizeBy(rows, keyFn) {
  return rows.reduce((summary, row) => {
    const key = keyFn(row);
    summary[key] = (summary[key] ?? 0) + 1;
    return summary;
  }, {});
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const report = await runBuildItemSourceFinalClosureStatusReport(parseBuildItemSourceFinalClosureStatusReportArgs());
    process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
