#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDataSourceAcceptanceReportManifest } from './data-source-acceptance-report-manifest.mjs';

const __filename = fileURLToPath(import.meta.url);

const UNSAFE_COMMAND_PATTERNS = [
  /--apply=true/i,
  /--mode=apply/i,
  /\bimport\b/i,
  /\bbackfill\b/i,
  /\bapply\b/i,
  /\bdelete\b/i,
  /\bremove\b/i,
  /\brm\b/i,
  /\bcrawl\b/i,
  /\bload\b/i,
];

export function buildDataSourceAcceptanceFreshnessAudit({
  repoRoot = process.cwd(),
  manifest = buildDataSourceAcceptanceReportManifest(),
  generatedAt = new Date().toISOString(),
} = {}) {
  const root = path.resolve(repoRoot);
  const now = parseDate(generatedAt) ?? new Date();
  const panels = manifest.map((entry) => buildPanelFreshness({ entry, repoRoot: root, now }));
  const gate = summarizeGate(panels);
  return {
    generatedAt,
    overallStatus: gate.overallStatus,
    summary: summarizePanels(panels),
    blockingReasons: gate.blockingReasons,
    warningReasons: gate.warningReasons,
    panels,
  };
}

export function classifyCommandRisk(command = '') {
  const normalized = String(command ?? '');
  if (/^read-only monitor overview:/i.test(normalized)) {
    return 'external-read-only';
  }
  return UNSAFE_COMMAND_PATTERNS.some((pattern) => pattern.test(normalized))
    ? 'unsafe'
    : 'safe-read-only';
}

function buildPanelFreshness({ entry, repoRoot, now }) {
  const commandRisk = classifyCommandRisk(entry.generatorCommand);
  const base = {
    panelId: entry.panelId,
    reportPattern: entry.reportPattern,
    latestReportPath: null,
    freshnessStatus: 'unknown',
    freshnessReason: null,
    ageHours: null,
    staleAfterHours: entry.staleAfterHours,
    nextEvidenceCommand: entry.generatorCommand,
    requiresDatabase: entry.requiresDatabase,
    writesDatabase: entry.writesDatabase,
    commandRisk,
  };

  if (entry.freshnessSource === 'crawler-monitor') {
    return {
      ...base,
      freshnessStatus: 'unknown',
      freshnessReason: 'External monitor evidence is not read by the offline audit.',
    };
  }

  const latestReport = findLatestReport(repoRoot, entry.reportPattern);
  if (!latestReport) {
    return {
      ...base,
      freshnessStatus: 'missing',
      freshnessReason: 'No matching acceptance report evidence found.',
    };
  }

  const reportTime = readReportTime(latestReport.fullPath);
  if (reportTime.unreadable) {
    return {
      ...base,
      latestReportPath: latestReport.relativePath,
      freshnessStatus: 'unknown',
      freshnessReason: 'Acceptance report JSON is unreadable or invalid.',
    };
  }
  if (!reportTime.generatedAt) {
    return {
      ...base,
      latestReportPath: latestReport.relativePath,
      freshnessStatus: 'unknown',
      freshnessReason: 'Acceptance report time is unavailable.',
    };
  }

  const ageHours = Math.max(0, Math.floor((now.getTime() - reportTime.generatedAt.getTime()) / 3_600_000));
  const staleAfterHours = Number(entry.staleAfterHours);
  const isStale = Number.isFinite(staleAfterHours) && ageHours > staleAfterHours;
  return {
    ...base,
    latestReportPath: latestReport.relativePath,
    freshnessStatus: isStale ? 'stale' : 'fresh',
    freshnessReason: isStale
      ? `Evidence is older than ${staleAfterHours} hours.`
      : reportTime.source === 'mtime'
        ? 'Using file modified time because generatedAt is unavailable.'
        : null,
    ageHours,
    nextEvidenceCommand: isStale ? entry.generatorCommand : null,
  };
}

function summarizePanels(panels) {
  return {
    panelCount: panels.length,
    freshCount: panels.filter((panel) => panel.freshnessStatus === 'fresh').length,
    staleCount: panels.filter((panel) => panel.freshnessStatus === 'stale').length,
    missingCount: panels.filter((panel) => panel.freshnessStatus === 'missing').length,
    unknownCount: panels.filter((panel) => panel.freshnessStatus === 'unknown').length,
    databaseRequiredCount: panels.filter((panel) => panel.requiresDatabase === true).length,
    unsafeCommandCount: panels.filter((panel) => panel.commandRisk === 'unsafe').length,
  };
}

function summarizeGate(panels) {
  const blockingReasons = panels
    .filter((panel) => panel.commandRisk === 'unsafe')
    .map((panel) => `${panel.panelId} generator command is unsafe`);
  const warningReasons = panels
    .filter((panel) => ['missing', 'stale', 'unknown'].includes(panel.freshnessStatus))
    .map((panel) => `${panel.panelId} evidence is ${panel.freshnessStatus}`);
  return {
    overallStatus: blockingReasons.length > 0 ? 'blocked' : warningReasons.length > 0 ? 'warning' : 'pass',
    blockingReasons,
    warningReasons,
  };
}

function findLatestReport(repoRoot, reportPattern) {
  const parsed = parseReportPattern(reportPattern);
  if (!parsed) {
    return null;
  }
  const dir = path.join(repoRoot, parsed.dir);
  if (!fs.existsSync(dir)) {
    return null;
  }
  const candidates = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .filter((entry) => entry.name.startsWith(parsed.prefix) && entry.name.endsWith(parsed.suffix))
    .map((entry) => {
      const relativePath = normalizePath(path.join(parsed.dir, entry.name));
      const fullPath = path.join(repoRoot, relativePath);
      const stat = fs.statSync(fullPath);
      return {
        fullPath,
        relativePath,
        fileName: entry.name,
        mtimeMs: stat.mtimeMs,
      };
    });
  candidates.sort(compareReportCandidates);
  return candidates[0] ?? null;
}

function parseReportPattern(reportPattern = '') {
  const pattern = String(reportPattern ?? '');
  if (!pattern.includes('*') || pattern.includes(':')) {
    return null;
  }
  const normalized = normalizePath(pattern);
  const dir = path.posix.dirname(normalized);
  const filePattern = path.posix.basename(normalized);
  const [prefix, suffix] = filePattern.split('*');
  if (prefix === undefined || suffix === undefined) {
    return null;
  }
  return { dir, prefix, suffix };
}

function compareReportCandidates(left, right) {
  const leftDate = datedNameValue(left.fileName);
  const rightDate = datedNameValue(right.fileName);
  if (leftDate !== rightDate) {
    return rightDate - leftDate;
  }
  if (left.mtimeMs !== right.mtimeMs) {
    return right.mtimeMs - left.mtimeMs;
  }
  return right.fileName.localeCompare(left.fileName);
}

function readReportTime(fullPath) {
  const report = readJsonReport(fullPath);
  if (!report.readable) {
    return { generatedAt: null, source: null, unreadable: true };
  }
  const generatedAt = parseDate(report.payload?.generatedAt);
  if (generatedAt) {
    return { generatedAt, source: 'generatedAt' };
  }
  const stat = fs.statSync(fullPath);
  return { generatedAt: new Date(stat.mtimeMs), source: 'mtime' };
}

function readJsonReport(fullPath) {
  try {
    return {
      readable: true,
      payload: JSON.parse(fs.readFileSync(fullPath, 'utf8')),
    };
  } catch {
    return { readable: false, payload: null };
  }
}

function datedNameValue(fileName) {
  const match = String(fileName ?? '').match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    return 0;
  }
  return Number(`${match[1]}${match[2]}${match[3]}`);
}

function parseDate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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
  const audit = buildDataSourceAcceptanceFreshnessAudit({
    repoRoot: args['repo-root'] ?? process.cwd(),
    generatedAt: args['generated-at'] ?? new Date().toISOString(),
  });
  process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
