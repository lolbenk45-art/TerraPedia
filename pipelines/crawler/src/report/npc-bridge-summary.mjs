import path from 'node:path';

import { ensureDir, writeJson } from '../../../lib/wiki-item-utils.mjs';

export function buildNpcBridgeSummary({
  crawlerNpcTotal,
  standardizedNpcTotal,
  matches,
  unmatchedCrawler,
  unenrichedStandardized,
  conflictSamples
} = {}) {
  const matchedRows = asArray(matches);
  const unmatchedRows = asArray(unmatchedCrawler);
  const unenrichedRows = asArray(unenrichedStandardized);
  const conflictRows = asArray(conflictSamples);

  return {
    crawlerNpcTotal: numericValue(crawlerNpcTotal, matchedRows.length + unmatchedRows.length),
    standardizedNpcTotal: numericValue(standardizedNpcTotal, matchedRows.length + unenrichedRows.length),
    matched: matchedRows.length,
    unmatchedCrawler: unmatchedRows.length,
    unenrichedStandardized: unenrichedRows.length,
    conflictSamples: conflictRows.slice(0, 20)
  };
}

export function writeNpcBridgeSummaryReport({
  summary,
  outputRoot
} = {}) {
  const resolvedOutputRoot = path.resolve(outputRoot ?? path.join(process.cwd(), 'data', 'generated', 'wiki-crawler-npc-bridge'));
  const reportPath = path.join(resolvedOutputRoot, 'report', 'npc-bridge-summary.latest.json');
  ensureDir(path.dirname(reportPath));
  writeJson(reportPath, summary ?? {});
  return reportPath;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function numericValue(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}
