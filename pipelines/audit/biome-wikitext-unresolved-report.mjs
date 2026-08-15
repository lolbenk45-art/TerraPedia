#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ALLOWED_ARGS = new Set(['report', 'output']);
const ALLOWED_CANDIDATE_FIELDS = new Set(['entityType', 'id', 'internalName', 'name', 'nameZh']);

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const separatorIndex = body.indexOf('=');
    const key = separatorIndex >= 0 ? body.slice(0, separatorIndex) : body;
    if (!ALLOWED_ARGS.has(key)) {
      throw new Error(`Unknown option: --${key}`);
    }
    args[key] = separatorIndex >= 0 ? body.slice(separatorIndex + 1) : 'true';
  }
  if (!toNullableText(args.report)) {
    throw new Error('--report is required');
  }
  return {
    report: args.report,
    output: args.output ?? defaultOutputPath()
  };
}

export function buildBiomeWikitextUnresolvedReport({ sourceReport, sourceReportPath = null }) {
  const rows = [];
  for (const result of Array.isArray(sourceReport?.results) ? sourceReport.results : []) {
    const biomeCode = toNullableText(result?.biome?.code);
    const pageTitle = toNullableText(result?.wiki?.pageTitle ?? result?.biome?.pageTitle);
    for (const entry of Array.isArray(result?.entries) ? result.entries : []) {
      if (!['missing', 'ambiguous'].includes(entry?.matchStatus)) continue;
      const index = rows.length + 1;
      const reviewCategory = classifyUnresolvedRow(entry);
      rows.push({
        index,
        rowKey: buildRowKey({ biomeCode, entry, index }),
        biomeCode,
        pageTitle,
        matchType: toNullableText(entry?.matchType),
        matchStatus: toNullableText(entry?.matchStatus),
        section: toNullableText(entry?.section),
        source: toNullableText(entry?.source),
        name: toNullableText(entry?.name),
        note: toNullableText(entry?.note),
        candidateMatches: stableCandidateMatches(entry?.matches),
        reviewCategory,
        needsUserDecision: true
      });
    }
  }

  return {
    entity: 'biome_wikitext_unresolved_report',
    generatedAt: new Date().toISOString(),
    sourceReportPath,
    sourceGeneratedAt: toNullableText(sourceReport?.generatedAt),
    summary: summarizeRows(rows),
    rows
  };
}

export function classifyUnresolvedRow(row) {
  if (row?.matchStatus === 'ambiguous') return 'ambiguous_variant_group_needs_user_decision';
  if (row?.matchType === 'item') {
    const name = toNullableText(row?.name) ?? '';
    if (/\b(armor|set|furniture|banners?)\b/i.test(name)) return 'item_collection_or_set';
    if (/treasure bag/i.test(name)) return 'generic_item_name_needs_context';
    return 'local_item_missing_or_name_gap';
  }
  if (row?.matchType === 'npc') {
    const source = toNullableText(row?.source) ?? '';
    if (/critters?/i.test(source)) return 'local_npc_missing_or_critter_gap';
    return 'local_npc_missing_or_variant_gap';
  }
  return 'unresolved_needs_user_decision';
}

export function validateUnresolvedReportContract(report) {
  const issues = [];
  const topLevelRequired = ['entity', 'generatedAt', 'sourceReportPath', 'sourceGeneratedAt', 'summary', 'rows'];
  const rowRequired = ['index', 'rowKey', 'biomeCode', 'pageTitle', 'matchType', 'matchStatus', 'section', 'source', 'name', 'note', 'candidateMatches', 'reviewCategory', 'needsUserDecision'];
  for (const field of topLevelRequired) {
    if (!Object.hasOwn(report ?? {}, field)) issues.push(`top-level missing ${field}`);
  }
  if (report?.entity !== 'biome_wikitext_unresolved_report') issues.push(`unexpected entity ${report?.entity}`);
  if (typeof report?.generatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(report.generatedAt)) {
    issues.push('generatedAt is not an ISO-like string');
  }
  if (!Array.isArray(report?.rows)) issues.push('rows is not an array');

  const seen = new Set();
  for (const row of Array.isArray(report?.rows) ? report.rows : []) {
    for (const field of rowRequired) {
      if (!Object.hasOwn(row, field)) issues.push(`row ${row?.index} missing ${field}`);
    }
    if (seen.has(row?.index)) issues.push(`duplicate index ${row?.index}`);
    seen.add(row?.index);
    if (!['missing', 'ambiguous'].includes(row?.matchStatus)) {
      issues.push(`row ${row?.index} unsupported matchStatus ${row?.matchStatus}`);
    }
    if (!Array.isArray(row?.candidateMatches)) {
      issues.push(`row ${row?.index} candidateMatches is not an array`);
      continue;
    }
    if (row.matchStatus === 'ambiguous' && row.candidateMatches.length <= 1) {
      issues.push(`row ${row.index} ambiguous without multiple matches`);
    }
    if (row.matchStatus === 'missing' && row.candidateMatches.length !== 0) {
      issues.push(`row ${row.index} missing with candidate matches`);
    }
    for (const [candidateIndex, candidate] of row.candidateMatches.entries()) {
      for (const field of Object.keys(candidate ?? {})) {
        if (!ALLOWED_CANDIDATE_FIELDS.has(field)) {
          issues.push(`row ${row.index} candidate ${candidateIndex + 1} unexpected candidate match field ${field}`);
        }
      }
    }
    if (row?.needsUserDecision !== true) {
      issues.push(`row ${row?.index} needsUserDecision is not true`);
    }
  }
  return { valid: issues.length === 0, issues };
}

export function writeUnresolvedReport({ reportPath, outputPath }) {
  const resolvedReportPath = path.resolve(process.cwd(), reportPath);
  const resolvedOutputPath = path.resolve(process.cwd(), outputPath ?? defaultOutputPath());
  const sourceReport = JSON.parse(fs.readFileSync(resolvedReportPath, 'utf8'));
  const report = buildBiomeWikitextUnresolvedReport({
    sourceReport,
    sourceReportPath: resolvedReportPath
  });
  const validation = validateUnresolvedReportContract(report);
  if (!validation.valid) {
    throw new Error(`Unresolved report contract failed:\n${validation.issues.join('\n')}`);
  }
  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
  fs.writeFileSync(resolvedOutputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return { outputPath: resolvedOutputPath, summary: report.summary };
}

function summarizeRows(rows) {
  const summary = {
    total: rows.length,
    item: { missing: 0, ambiguous: 0 },
    npc: { missing: 0, ambiguous: 0 },
    byReviewCategory: {}
  };
  for (const row of rows) {
    if (summary[row.matchType]?.[row.matchStatus] != null) {
      summary[row.matchType][row.matchStatus] += 1;
    }
    summary.byReviewCategory[row.reviewCategory] = (summary.byReviewCategory[row.reviewCategory] ?? 0) + 1;
  }
  return summary;
}

function stableCandidateMatches(matches) {
  return (Array.isArray(matches) ? matches : []).map((match) => ({
    entityType: toNullableText(match?.entityType),
    id: match?.id ?? null,
    internalName: toNullableText(match?.internalName),
    name: toNullableText(match?.name),
    nameZh: toNullableText(match?.nameZh)
  }));
}

function buildRowKey({ biomeCode, entry, index }) {
  return [
    normalizeKey(biomeCode),
    normalizeKey(entry?.matchType),
    normalizeKey(entry?.matchStatus),
    normalizeKey(entry?.name),
    index
  ].join(':');
}

function normalizeKey(value) {
  return (toNullableText(value) ?? 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unknown';
}

function defaultOutputPath() {
  const dateTag = new Date().toISOString().slice(0, 10);
  return path.join('reports', `biome-wikitext-unresolved-${dateTag}.json`);
}

function toNullableText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

if (process.argv[1] === __filename) {
  try {
    const options = parseArgs();
    const result = writeUnresolvedReport({ reportPath: options.report, outputPath: options.output });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('[biome-wikitext-unresolved-report] failed');
    console.error(error);
    process.exitCode = 1;
  }
}
