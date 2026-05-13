#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getProjectRoot } from '../lib/project-root.mjs';

const repoRoot = getProjectRoot();

const DEFAULTS = Object.freeze({
  dateTag: new Date().toISOString().slice(0, 10),
  writeReport: true,
});

const BLOCKING_COVERAGE_STATUSES = Object.freeze([
  'source_page_missing',
  'source_page_present_unextracted',
  'source_page_present_parse_failed',
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
    dateTag: raw['date-tag'] ?? raw.dateTag ?? DEFAULTS.dateTag,
    domainReportPath: raw['domain-report'] ?? raw.domainReport ?? null,
    coverageReportPath: raw['coverage-report'] ?? raw.coverageReport ?? null,
    runtimeReportPath: raw['runtime-report'] ?? raw.runtimeReport ?? null,
    writeReport: booleanOption(raw['write-report'] ?? raw.writeReport, DEFAULTS.writeReport),
    output: raw.output ?? null,
  };
}

export async function runNpcLootClosureSmokeCheck(options = {}, dependencies = {}) {
  const normalized = {
    dateTag: options.dateTag ?? DEFAULTS.dateTag,
    domainReportPath: options.domainReportPath ?? null,
    coverageReportPath: options.coverageReportPath ?? null,
    runtimeReportPath: options.runtimeReportPath ?? null,
    writeReport: options.writeReport ?? DEFAULTS.writeReport,
    output: options.output ?? null,
  };

  const readJson = dependencies.readJson ?? readJsonFile;
  const domainReportPath = normalized.domainReportPath
    ?? path.join(repoRoot, 'reports', 'audit', `npc-domain-loot-chain-${normalized.dateTag}.json`);
  const coverageReportPath = normalized.coverageReportPath
    ?? path.join(repoRoot, 'reports', 'audit', `npc-source-coverage-inventory-${normalized.dateTag}.json`);
  const runtimeReportPath = normalized.runtimeReportPath
    ?? path.join(repoRoot, 'reports', 'audit', `npc-loot-runtime-parity-${normalized.dateTag}.json`);

  const report = await buildNpcLootClosureSmokeReport({
    domainReport: await readJson(domainReportPath),
    coverageReport: await readJson(coverageReportPath),
    runtimeReport: await readJson(runtimeReportPath).catch((error) => {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }),
    reportPaths: {
      domainReportPath,
      coverageReportPath,
      runtimeReportPath,
    },
    options: normalized,
  });

  const reportPath = normalized.writeReport ? await writeReport(report, normalized) : null;
  return { report, reportPath };
}

export function buildNpcLootClosureSmokeReport({
  domainReport = null,
  coverageReport = null,
  runtimeReport = null,
  reportPaths = {},
  options = {},
} = {}) {
  const domainSummary = domainReport?.summary ?? {};
  const coverageSummary = coverageReport?.summary?.bySourceCoverageStatus ?? {};
  const runtimeSummary = runtimeReport?.summary ?? null;
  const remainingDomainBlockers = [
    ['unclassifiedZero', domainSummary.unclassifiedZero ?? 0],
    ['blockedSourceGap', domainSummary.blockedSourceGap ?? 0],
    ['relationGap', domainSummary.relationGap ?? 0],
    ['projectionGap', domainSummary.projectionGap ?? 0],
    ['localGap', domainSummary.localGap ?? 0],
    ['apiGap', domainSummary.apiGap ?? 0],
    ['duplicateOrPolluted', domainSummary.duplicateOrPolluted ?? 0],
    ['runtimeFallbackOnly', domainSummary.runtimeFallbackOnly ?? 0],
    ['projectionOnly', domainSummary.projectionOnly ?? 0],
    ['countParityOnly', domainSummary.countParityOnly ?? 0],
    ['blockedGenericBucket', domainSummary.blockedGenericBucket ?? 0],
    ['blockedAmbiguousVariant', domainSummary.blockedAmbiguousVariant ?? 0],
    ['blockedMissingItemOrNpcIdentity', domainSummary.blockedMissingItemOrNpcIdentity ?? 0],
    ['blockedNonNpcSource', domainSummary.blockedNonNpcSource ?? 0],
    ['duplicateSourceIdentity', domainSummary.duplicateSourceIdentity ?? 0],
    ['blockedNonNpcSourcePromoted', domainSummary.blockedNonNpcSourcePromoted ?? 0],
    ['unknown', domainSummary.unknown ?? 0],
  ]
    .filter(([, count]) => Number(count) > 0)
    .map(([key, count]) => ({ key, count: Number(count) }));
  const remainingCoverageBlockers = BLOCKING_COVERAGE_STATUSES
    .map((status) => [status, coverageSummary[status] ?? 0])
    .filter(([, count]) => Number(count) > 0)
    .map(([key, count]) => ({ key, count: Number(count) }));

  const blockers = [];
  if (!domainReport) {
    blockers.push({ code: 'domain_report_missing', reportPath: reportPaths.domainReportPath ?? null });
  }
  if (!coverageReport) {
    blockers.push({ code: 'coverage_report_missing', reportPath: reportPaths.coverageReportPath ?? null });
  }
  if (domainReport && (domainReport.evidenceHealth ?? 'sufficient') !== 'sufficient') {
    blockers.push({ code: 'domain_evidence_unavailable', evidenceHealth: domainReport.evidenceHealth ?? null });
  }
  if (remainingDomainBlockers.length > 0) {
    blockers.push({
      code: 'remaining_domain_blockers',
      releaseBlockingCount: Number(domainSummary.releaseBlockingCount ?? 0),
      items: remainingDomainBlockers,
    });
  }
  if (remainingCoverageBlockers.length > 0) {
    blockers.push({
      code: 'remaining_coverage_blockers',
      items: remainingCoverageBlockers,
    });
  }
  if (runtimeSummary && Number(runtimeSummary.blockingCount ?? 0) > 0) {
    blockers.push({
      code: 'runtime_blockers_present',
      blockingCount: Number(runtimeSummary.blockingCount ?? 0),
      countsByStatus: runtimeSummary.byStatus ?? {},
    });
  }

  return {
    auditName: 'npc-loot-closure-smoke-check',
    generatedAt: new Date().toISOString(),
    auditStatus: blockers.length === 0 ? 'pass' : 'blocked',
    evidenceHealth:
      blockers.some((entry) => entry.code === 'domain_evidence_unavailable')
        ? 'domain_report_unavailable'
        : blockers.some((entry) => entry.code === 'coverage_report_missing')
          ? 'coverage_report_unavailable'
          : 'sufficient',
    summary: {
      domainReleaseBlockingCount: Number(domainSummary.releaseBlockingCount ?? 0),
      remainingDomainBlockers,
      remainingCoverageBlockers,
      coverageCounts: coverageSummary,
      runtimeBlockingCount: runtimeSummary ? Number(runtimeSummary.blockingCount ?? 0) : null,
      runtimeByStatus: runtimeSummary?.byStatus ?? null,
    },
    blockers,
    reportPaths,
    options,
  };
}

async function writeReport(report, options) {
  const reportPath = options.output
    ? path.resolve(repoRoot, options.output)
    : path.join(repoRoot, 'reports', 'audit', `npc-loot-closure-smoke-check-${options.dateTag}.json`);
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
}

async function readJsonFile(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function booleanOption(value, defaultValue) {
  if (value == null) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  return defaultValue;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) {
  const result = await runNpcLootClosureSmokeCheck(parseArgs());
  console.log(JSON.stringify(result.report, null, 2));
  process.exitCode = result.report.auditStatus === 'pass' ? 0 : 2;
}
