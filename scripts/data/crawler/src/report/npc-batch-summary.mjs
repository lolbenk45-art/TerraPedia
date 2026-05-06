import path from 'node:path';

import { ensureDir, writeJson } from '../../../lib/wiki-item-utils.mjs';

export function buildNpcBatchSummary({ executions } = {}) {
  const rows = Array.isArray(executions) ? executions : [];
  const summary = {
    total: rows.length,
    pass: 0,
    warn: 0,
    fail: 0,
    sampleIssues: []
  };

  for (const row of rows) {
    const status = String(row?.audit?.status ?? 'fail').trim().toLowerCase();
    if (status === 'pass') summary.pass += 1;
    else if (status === 'warn') summary.warn += 1;
    else summary.fail += 1;

    const reasons = Array.isArray(row?.audit?.reasons) ? row.audit.reasons : [];
    if (status !== 'pass' && reasons.length) {
      summary.sampleIssues.push({
        entityId: row?.target?.entityId ?? '',
        pageTitle: row?.target?.pageTitle ?? '',
        status,
        reasons
      });
    }
  }

  return summary;
}

export function writeNpcBatchSummaryReport({
  summary,
  outputRoot
} = {}) {
  const resolvedOutputRoot = path.resolve(outputRoot ?? path.join(process.cwd(), 'data', 'wiki-crawler'));
  const reportPath = path.join(resolvedOutputRoot, 'report', 'npc', 'batch-summary.latest.json');
  ensureDir(path.dirname(reportPath));
  writeJson(reportPath, summary ?? {});
  return reportPath;
}
