#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const DEFAULT_BOUNDARY_PATH = 'docs/audits/canonical-migration-boundary.md';
const WARNING_WINDOW_DAYS = 7;

const DOMAIN_INPUT_MATCHERS = {
  'support.recipe': [
    'data/generated/recipe-material-reference.json',
    'data/generated/recipe-group-overrides.json',
  ],
  'support.shimmer': [
    'data/generated/item-group-overrides.json',
  ],
  'support.item_group': [
    'data/generated/item-group-overrides.json',
    'data/generated/recipe-group-overrides.json',
    'data/generated/recipe-material-reference.json',
  ],
  'support.town_npc_maintenance': [
    'data/generated/wiki-crawler-npc-bridge/standardized/npcs.standardized.json',
  ],
};

export function buildB1ExemptionComplianceReport({
  repoRoot = process.cwd(),
  domainId,
  generatedAt = new Date().toISOString(),
  boundaryPath = DEFAULT_BOUNDARY_PATH,
} = {}) {
  if (!domainId) {
    throw new Error('b1 exemption compliance requires domainId.');
  }

  const fullBoundaryPath = path.resolve(repoRoot, boundaryPath);
  const now = parseDate(generatedAt) ?? new Date();
  const exemptions = readBoundaryExemptions(fullBoundaryPath);
  const trackedInputs = DOMAIN_INPUT_MATCHERS[domainId] ?? [];
  const checks = trackedInputs.map((input) => buildCheck(input, exemptions.get(input), now));
  const blockingReasons = checks
    .filter((check) => check.status === 'blocked')
    .map((check) => check.reason);
  const warningReasons = checks
    .filter((check) => check.status === 'warning')
    .map((check) => check.reason);
  const notes = checks.length === 0
    ? [`No B1 exemptions registered for ${domainId}.`]
    : [];

  return {
    generatedAt,
    domainId,
    panelId: 'b1ExemptionCompliance',
    status: blockingReasons.length > 0 ? 'blocked' : warningReasons.length > 0 ? 'warning' : 'pass',
    requiresDatabase: false,
    writesDatabase: false,
    sourcePath: normalizePath(boundaryPath),
    summary: {
      trackedExemptionCount: checks.length,
      passedCount: checks.filter((check) => check.status === 'pass').length,
      warningCount: checks.filter((check) => check.status === 'warning').length,
      blockedCount: checks.filter((check) => check.status === 'blocked').length,
    },
    blockingReasons,
    warningReasons,
    notes,
    checks,
  };
}

export function readBoundaryExemptions(fullBoundaryPath) {
  const source = fs.readFileSync(fullBoundaryPath, 'utf8');
  const section = extractSection(source, '## 过渡豁免登记', '## Apply 前准入');
  const exemptions = new Map();

  for (const line of section.split(/\r?\n/)) {
    if (!line.trim().startsWith('| `data/')) {
      continue;
    }
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 4) {
      continue;
    }
    const input = stripCodeTicks(cells[0]);
    exemptions.set(input, {
      input,
      consumer: cells[1],
      migrationTarget: cells[2],
      acceptanceCommand: stripCodeTicks(cells[3]),
      deadline: extractDeadline([cells[1], cells[2], cells[3]].join(' ')),
      rawLine: line.trim(),
    });
  }

  return exemptions;
}

function buildCheck(input, record, now) {
  if (!record) {
    return {
      input,
      status: 'blocked',
      deadline: null,
      reason: `B1 exemption ${input} is missing from canonical migration boundary registration.`,
    };
  }

  const deadline = record.deadline;
  if (!deadline) {
    return {
      input,
      consumer: record.consumer,
      migrationTarget: record.migrationTarget,
      acceptanceCommand: record.acceptanceCommand,
      status: 'blocked',
      deadline: null,
      reason: `B1 exemption ${input} is missing deadline in canonical migration boundary registration.`,
    };
  }

  const deadlineDate = parseDate(deadline);
  const daysRemaining = Math.ceil((deadlineDate.getTime() - now.getTime()) / 86_400_000);
  if (daysRemaining < 0) {
    return {
      input,
      consumer: record.consumer,
      migrationTarget: record.migrationTarget,
      acceptanceCommand: record.acceptanceCommand,
      status: 'blocked',
      deadline,
      daysRemaining,
      reason: `B1 exemption ${input} expired on ${deadline}.`,
    };
  }
  if (daysRemaining <= WARNING_WINDOW_DAYS) {
    return {
      input,
      consumer: record.consumer,
      migrationTarget: record.migrationTarget,
      acceptanceCommand: record.acceptanceCommand,
      status: 'warning',
      deadline,
      daysRemaining,
      reason: `B1 exemption ${input} expires within ${WARNING_WINDOW_DAYS} days on ${deadline}.`,
    };
  }

  return {
    input,
    consumer: record.consumer,
    migrationTarget: record.migrationTarget,
    acceptanceCommand: record.acceptanceCommand,
    status: 'pass',
    deadline,
    daysRemaining,
    reason: null,
  };
}

function extractSection(source, startMarker, endMarker) {
  const startIndex = source.indexOf(startMarker);
  if (startIndex < 0) {
    throw new Error(`Missing section: ${startMarker}`);
  }
  const endIndex = source.indexOf(endMarker, startIndex);
  return endIndex >= 0
    ? source.slice(startIndex, endIndex)
    : source.slice(startIndex);
}

function extractDeadline(text) {
  const match = String(text).match(/deadline\s*[:：]\s*(\d{4}-\d{2}-\d{2})/i);
  return match?.[1] ?? null;
}

function stripCodeTicks(value) {
  return String(value ?? '').replace(/^`|`$/g, '').trim();
}

function parseDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
  const report = buildB1ExemptionComplianceReport({
    repoRoot: args['repo-root'] ?? process.cwd(),
    domainId: args.domain,
    generatedAt: args['generated-at'] ?? new Date().toISOString(),
    boundaryPath: args['boundary-path'] ?? DEFAULT_BOUNDARY_PATH,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
