#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildDomainReadinessReport,
  resolveDomainReportPath,
} from '../audit/domain-readiness-audit.mjs';
import { buildDomainAcceptanceReportManifest } from './domain-acceptance-report-manifest.mjs';

const __filename = fileURLToPath(import.meta.url);

export function buildDomainAcceptanceReportGeneration({
  repoRoot = process.cwd(),
  manifest = buildDomainAcceptanceReportManifest(),
  domains = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  return generateDomainAcceptanceReports({
    repoRoot,
    manifest,
    domains,
    generatedAt,
    write: false,
  });
}

export function generateDomainAcceptanceReports({
  repoRoot = process.cwd(),
  manifest = buildDomainAcceptanceReportManifest(),
  domains = null,
  generatedAt = new Date().toISOString(),
  write = false,
} = {}) {
  const root = path.resolve(repoRoot);
  const selectedDomains = normalizeDomains(domains);
  const entries = selectedDomains
    ? manifest.filter((entry) => selectedDomains.has(entry.domainId))
    : manifest;
  const reports = entries.map((entry) => buildReportRecord({
    repoRoot: root,
    entry,
    generatedAt,
    write,
  }));

  return {
    generatedAt,
    write,
    summary: summarizeReports(reports),
    reports,
  };
}

function buildReportRecord({ repoRoot, entry, generatedAt, write }) {
  const outputPath = resolveDomainReportPath({
    domainId: entry.domainId,
    panel: entry.panelId,
    generatedAt,
  });
  assertDomainOutputPath(outputPath);
  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: entry.domainId,
    panel: entry.panelId,
    generatedAt,
    reportPath: outputPath,
  });

  if (write) {
    const fullPath = path.resolve(repoRoot, outputPath);
    const domainReportsRoot = path.resolve(repoRoot, 'reports/domain');
    if (!fullPath.startsWith(domainReportsRoot)) {
      throw new Error(`Refusing to write outside reports/domain: ${outputPath}`);
    }
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  return {
    domainId: entry.domainId,
    panelId: entry.panelId,
    status: report.status,
    outputPath,
    writePlanned: write === true,
    written: write === true,
    blockingCount: report.summary?.blockedCount ?? report.blockingReasons?.length ?? 0,
    warningCount: report.summary?.warningCount ?? report.warningReasons?.length ?? 0,
  };
}

function summarizeReports(reports) {
  return {
    domainCount: new Set(reports.map((report) => report.domainId)).size,
    panelCount: reports.length,
    plannedCount: reports.length,
    writtenCount: reports.filter((report) => report.written).length,
    passCount: reports.filter((report) => report.status === 'pass').length,
    warningCount: reports.filter((report) => report.status === 'warning').length,
    blockedCount: reports.filter((report) => report.status === 'blocked').length,
    missingCount: reports.filter((report) => report.status === 'missing').length,
  };
}

function assertDomainOutputPath(outputPath) {
  const normalized = normalizePath(outputPath);
  if (!normalized.startsWith('reports/domain/') || normalized.includes('..') || normalized.includes(':')) {
    throw new Error(`Invalid domain acceptance report output path: ${outputPath}`);
  }
}

function normalizeDomains(domains) {
  if (!domains) {
    return null;
  }
  const values = Array.isArray(domains) ? domains : String(domains).split(',');
  const normalized = values.map((value) => String(value).trim()).filter(Boolean);
  return normalized.length ? new Set(normalized) : null;
}

function normalizePath(value) {
  return String(value ?? '').replace(/\\/g, '/');
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (const arg of argv) {
    const match = String(arg).match(/^--([^=]+)=(.*)$/);
    if (match) {
      args[match[1]] = match[2];
    }
  }
  return args;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const result = generateDomainAcceptanceReports({
    repoRoot: args['repo-root'] ?? process.cwd(),
    generatedAt: args['generated-at'] ?? new Date().toISOString(),
    domains: args.domains ?? null,
    write: args.write === 'true',
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (args['fail-on-blocked'] === 'true' && result.summary.blockedCount > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
