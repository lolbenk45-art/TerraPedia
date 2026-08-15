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
  'alter'
]);

const DEFAULT_INPUT = path.join(process.cwd(), 'data', 'reports', 'item-source-raw-page-candidates-2026-06-11-current.json');
const DEFAULT_OUTPUT = path.join(process.cwd(), 'data', 'reports', 'item-source-terminal-exemption-plan-2026-06-11.json');

const STATUS_RULES = new Map([
  ['non_item_effect', {
    resolutionLane: 'explicit_no_source_exemption_candidate',
    exemptionRule: 'terminal_non_item_effect'
  }],
  ['enemy_page_identity_mismatch', {
    resolutionLane: 'explicit_no_source_exemption_candidate',
    exemptionRule: 'terminal_enemy_page_identity_mismatch'
  }],
  ['internal_or_unobtainable_identity_review', {
    resolutionLane: 'explicit_no_source_exemption_candidate',
    exemptionRule: 'terminal_internal_or_unobtainable_identity_review'
  }],
  ['missing_bait_raw', {
    resolutionLane: 'missing_required_raw_evidence',
    exemptionRule: null
  }],
  ['missing_exact_raw', {
    resolutionLane: 'missing_required_raw_evidence',
    exemptionRule: null
  }]
]);

export function parseBuildItemSourceTerminalExemptionPlanArgs(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  for (const [key, value] of Object.entries(options)) {
    if (MUTATION_FLAGS.has(key.toLowerCase()) && value !== false && value !== 'false') {
      throw new Error(`read-only terminal exemption plan refuses mutation flag: --${key}`);
    }
  }
  return {
    inputPath: options.input ?? DEFAULT_INPUT,
    outputPath: options.output ?? null
  };
}

export function buildItemSourceTerminalExemptionPlan({
  generatedAt = new Date().toISOString(),
  sourceReportPath = null,
  sourceReport = {}
} = {}) {
  const hardBlockedRows = Array.isArray(sourceReport.hardBlockedRows) ? sourceReport.hardBlockedRows : [];
  const rows = hardBlockedRows
    .map((row) => buildTerminalPlanRow(row, sourceReportPath))
    .sort((a, b) => a.itemId - b.itemId);

  return {
    generatedAt,
    readOnly: true,
    entity: 'item_source_terminal_exemption_plan',
    inputs: {
      sourceReportPath,
      sourceReportGeneratedAt: sourceReport.generatedAt ?? null
    },
    summary: buildSummary(rows),
    rows
  };
}

export function writeItemSourceTerminalExemptionPlan({
  inputPath = DEFAULT_INPUT,
  outputPath = DEFAULT_OUTPUT
} = {}) {
  const resolvedInput = path.resolve(process.cwd(), inputPath);
  const sourceReport = JSON.parse(fs.readFileSync(resolvedInput, 'utf8'));
  const plan = buildItemSourceTerminalExemptionPlan({
    sourceReportPath: inputPath,
    sourceReport
  });
  const resolvedOutput = path.resolve(process.cwd(), outputPath);
  writeJson(resolvedOutput, plan);
  return {
    outputPath: resolvedOutput,
    summary: plan.summary
  };
}

function buildTerminalPlanRow(row, sourceReportPath) {
  if (!row.terminalClosureStatus) {
    throw new Error(`hard-block row missing terminalClosureStatus: itemId=${row.itemId ?? '(missing)'}`);
  }
  const rule = STATUS_RULES.get(row.terminalClosureStatus);
  if (!rule) {
    throw new Error(`unsupported terminalClosureStatus ${row.terminalClosureStatus}: itemId=${row.itemId ?? '(missing)'}`);
  }
  return {
    itemId: Number(row.itemId),
    internalName: normalizeText(row.itemInternalName ?? row.internalName),
    name: normalizeText(row.name ?? row.itemName),
    categoryCode: normalizeText(row.categoryCode),
    categoryName: normalizeText(row.categoryName),
    terminalClosureStatus: row.terminalClosureStatus,
    terminalClosureReason: normalizeText(row.terminalClosureReason),
    terminalClosureEvidence: normalizeText(row.terminalClosureEvidence),
    recommendedNextAction: normalizeText(row.recommendedNextAction),
    hardBlockLane: normalizeText(row.hardBlockLane),
    priorUnresolvedLane: normalizeText(row.priorUnresolvedLane),
    resolutionLane: rule.resolutionLane,
    exemptionRule: rule.exemptionRule,
    importableAsSource: false,
    sourceReportPath,
    evidence: [
      {
        kind: 'terminal_closure_status',
        status: row.terminalClosureStatus,
        reason: normalizeText(row.terminalClosureReason),
        evidence: normalizeText(row.terminalClosureEvidence),
        reportPath: sourceReportPath
      }
    ]
  };
}

function buildSummary(rows) {
  return {
    totalTerminalRows: rows.length,
    exemptionCandidateRows: rows.filter((row) => row.resolutionLane === 'explicit_no_source_exemption_candidate').length,
    requiredRawEvidenceRows: rows.filter((row) => row.resolutionLane === 'missing_required_raw_evidence').length,
    importCandidateRows: rows.filter((row) => row.importableAsSource).length,
    terminalStatusCounts: countBy(rows, (row) => row.terminalClosureStatus),
    resolutionLaneCounts: countBy(rows, (row) => row.resolutionLane),
    exemptionRuleCounts: countBy(rows.filter((row) => row.exemptionRule), (row) => row.exemptionRule)
  };
}

function countBy(rows, keyFn) {
  const counts = {};
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseBuildItemSourceTerminalExemptionPlanArgs();
    const result = writeItemSourceTerminalExemptionPlan({
      inputPath: options.inputPath,
      outputPath: options.outputPath ?? DEFAULT_OUTPUT
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
