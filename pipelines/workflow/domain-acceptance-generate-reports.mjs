#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildDomainReadinessReport,
  resolveDomainReportPath,
} from '../audit/domain-readiness-audit.mjs';
import { assertRepositoryPathConfinement } from '../lib/private-repository-path.mjs';
import { buildDomainAcceptanceReportManifest } from './domain-acceptance-report-manifest.mjs';

const __filename = fileURLToPath(import.meta.url);

export function buildDomainAcceptanceReportGeneration({
  repoRoot = process.cwd(),
  manifest = buildDomainAcceptanceReportManifest(),
  domains = null,
  generatedAt = new Date().toISOString(),
  outputRoot = null,
} = {}) {
  return generateDomainAcceptanceReports({
    repoRoot,
    manifest,
    domains,
    generatedAt,
    outputRoot,
    write: false,
  });
}

export function generateDomainAcceptanceReports({
  repoRoot = process.cwd(),
  manifest = buildDomainAcceptanceReportManifest(),
  domains = null,
  generatedAt = new Date().toISOString(),
  write = false,
  outputRoot = null,
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
    outputRoot,
  }));

  if (write) {
    preflightReportWrites({ repoRoot: root, reports, outputRoot });
    writeReports({ repoRoot: root, reports, outputRoot });
  }

  const publicReports = reports.map(({ report, bytes, ...summary }) => summary);

  return {
    generatedAt,
    write,
    summary: summarizeReports(publicReports),
    reports: publicReports,
  };
}

function buildReportRecord({ repoRoot, entry, generatedAt, outputRoot }) {
  const outputPath = resolveDomainReportPath({
    domainId: entry.domainId,
    panel: entry.panelId,
    generatedAt,
    outputRoot,
  });
  assertDomainOutputPath(outputPath, { outputRoot });
  if (outputRoot != null) {
    assertImmutableAncestorPaths({ repoRoot, outputPath });
  }
  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: entry.domainId,
    panel: entry.panelId,
    generatedAt,
    reportPath: outputPath,
  });

  return {
    domainId: entry.domainId,
    panelId: entry.panelId,
    status: report.status,
    outputPath,
    report,
    bytes: `${JSON.stringify(report, null, 2)}\n`,
    writePlanned: false,
    written: false,
    blockingCount: report.summary?.blockedCount ?? report.blockingReasons?.length ?? 0,
    warningCount: report.summary?.warningCount ?? report.warningReasons?.length ?? 0,
  };
}

function preflightReportWrites({ repoRoot, reports, outputRoot }) {
  const immutable = outputRoot != null;
  const seen = new Set();
  const targets = reports.map((record) => {
    const fullPath = path.resolve(repoRoot, record.outputPath);
    if (seen.has(fullPath)) {
      throw new Error(`Report output collision: ${record.outputPath}`);
    }
    seen.add(fullPath);
    if (immutable) {
      assertImmutableOutputRoot(outputRoot);
      assertImmutableAncestorPaths({ repoRoot, outputPath: record.outputPath });
      if (pathEntryExists(fullPath)) {
        throw new Error(`Immutable domain report already exists: ${record.outputPath}`);
      }
    } else {
      assertDomainOutputPath(record.outputPath, { outputRoot: null });
    }
    return fullPath;
  });
  return targets;
}

function pathEntryExists(filePath) {
  try {
    fs.lstatSync(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function writeReports({ repoRoot, reports, outputRoot }) {
  const immutable = outputRoot != null;
  for (const record of reports) {
    const fullPath = path.resolve(repoRoot, record.outputPath);
    if (immutable) {
      assertRepositoryPathConfinement({
        repoRoot,
        filePath: fullPath,
        label: 'immutable domain report',
        createParent: true,
      });
    }
    fs.mkdirSync(path.dirname(fullPath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(
      fullPath,
      record.bytes,
      immutable ? { encoding: 'utf8', flag: 'wx', mode: 0o600 } : 'utf8',
    );
    record.written = true;
    record.writePlanned = true;
  }
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

function assertDomainOutputPath(outputPath, { outputRoot = null } = {}) {
  const normalized = normalizePath(outputPath);
  if (outputRoot != null) {
    const normalizedRoot = assertImmutableOutputRoot(outputRoot);
    if (!normalized.startsWith(`${normalizedRoot}/`)
      || normalized.includes('..') || normalized.includes(':')) {
      throw new Error(`Invalid immutable domain report output path: ${outputPath}`);
    }
    return;
  }
  if (!normalized.startsWith('reports/domain/') || normalized.includes('..') || normalized.includes(':')) {
    throw new Error(`Invalid domain acceptance report output path: ${outputPath}`);
  }
}

function assertImmutableOutputRoot(outputRoot) {
  const normalized = normalizePath(outputRoot).replace(/\/+$/, '');
  if (!/^reports\/runtime\/local-data-chain-closure\/\d{8}\/l2-readiness\/[A-Za-z0-9._-]+\/domain$/.test(normalized)) {
    throw new Error(`Invalid immutable report output root: ${outputRoot}`);
  }
  return normalized;
}

function assertImmutableAncestorPaths({ repoRoot, outputPath }) {
  const root = path.resolve(repoRoot);
  const target = path.resolve(root, outputPath);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error(`Immutable domain report must remain inside the repository root: ${outputPath}`);
  }
  let current = root;
  for (const segment of relative.split(path.sep).slice(0, -1)) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (error?.code === 'ENOENT') break;
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error(`Immutable domain report has a symbolic-link ancestor: ${outputPath}`);
    if (!stat.isDirectory()) throw new Error(`Immutable domain report has a non-directory ancestor: ${outputPath}`);
    const realRoot = fs.realpathSync(root);
    const realCurrent = fs.realpathSync(current);
    const realRelative = path.relative(realRoot, realCurrent);
    if (realRelative.startsWith(`..${path.sep}`) || realRelative === '..' || path.isAbsolute(realRelative)) {
      throw new Error(`Immutable domain report ancestor escapes the repository: ${outputPath}`);
    }
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
    outputRoot: args['output-root'] ?? null,
    write: args.write === 'true',
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (args['fail-on-blocked'] === 'true' && result.summary.blockedCount > 0) {
    process.exitCode = 1;
  }
  if (args['fail-on-warning'] === 'true' && result.summary.warningCount > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
