#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_BOUNDARY_PATH = 'docs/audits/canonical-migration-boundary.md';
const SECTION_START = '## 来源合同登记';
const SECTION_END = '## Apply 前准入';
const WARNING_WINDOW_DAYS = 7;
const MIGRATING_WINDOW_DAYS = 180;
const CANONICAL_REPORT_MAX_AGE_HOURS = 24;

export const CONTRACT_MODES = ['b1', 'b1_migrating', 'canonical', 'retired'];
export const DECLARED_STATES = ['DESIGN_APPROVED', 'CODE_READY', 'T1_VERIFIED', 'T2_CUTOVER_VERIFIED'];

export const DOMAIN_INPUT_MATCHERS = {
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
    'data/standardized/npcs.standardized.json',
  ],
};

export function readSourceContracts(fullBoundaryPath) {
  const source = fs.readFileSync(fullBoundaryPath, 'utf8');
  const section = extractSection(source, SECTION_START, SECTION_END);
  const contracts = new Map();

  for (const line of section.split(/\r?\n/)) {
    if (!line.trim().startsWith('| `')) {
      continue;
    }
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 4) {
      continue;
    }
    const input = stripCodeTicks(cells[0]);
    contracts.set(input, {
      input,
      mode: stripCodeTicks(cells[1]),
      evidence: cells[2],
      deadline: normalizeDeadline(cells[3]),
      declaredState: extractDeclaredState(cells[2]),
      designReference: extractLabelled(cells[2], 'design'),
      reportPath: extractLabelled(cells[2], 'report'),
      rawLine: line.trim(),
    });
  }

  return contracts;
}

export function buildSourceContractComplianceReport({
  repoRoot = process.cwd(),
  domainId,
  generatedAt = new Date().toISOString(),
  boundaryPath = DEFAULT_BOUNDARY_PATH,
  inputs = null,
} = {}) {
  if (!domainId) {
    throw new Error('source contract compliance requires domainId.');
  }

  const root = path.resolve(repoRoot);
  const now = parseDate(generatedAt) ?? new Date();
  const contracts = readSourceContracts(path.resolve(root, boundaryPath));
  const trackedInputs = inputs ?? DOMAIN_INPUT_MATCHERS[domainId] ?? [];
  const checks = trackedInputs.map((input) => buildCheck(root, input, contracts.get(input), now));

  const blockingReasons = checks.filter((c) => c.status === 'blocked').map((c) => c.reason);
  const warningReasons = checks.filter((c) => c.status === 'warning').map((c) => c.reason);

  if (trackedInputs.length === 0) {
    blockingReasons.push(`${domainId} has zero expected contracts; a vacuous pass is not accepted.`);
  }

  return {
    generatedAt,
    domainId,
    panelId: 'b1ExemptionCompliance',
    status: blockingReasons.length > 0 ? 'blocked' : warningReasons.length > 0 ? 'warning' : 'pass',
    requiresDatabase: false,
    writesDatabase: false,
    sourcePath: normalizePath(boundaryPath),
    summary: {
      trackedContractCount: checks.length,
      passedCount: checks.filter((c) => c.status === 'pass').length,
      warningCount: warningReasons.length,
      blockedCount: checks.filter((c) => c.status === 'blocked').length,
      modes: checks.reduce((acc, c) => {
        if (c.mode) {
          acc[c.mode] = (acc[c.mode] ?? 0) + 1;
        }
        return acc;
      }, {}),
    },
    blockingReasons,
    warningReasons,
    notes: [],
    checks,
  };
}

function buildCheck(root, input, contract, now) {
  const base = { input, mode: contract?.mode ?? null };

  if (!contract) {
    return { ...base, status: 'blocked', reason: `Source contract ${input} is missing from ${SECTION_START} registration.` };
  }
  if (!CONTRACT_MODES.includes(contract.mode)) {
    return { ...base, status: 'blocked', reason: `Source contract ${input} declares unknown mode "${contract.mode}".` };
  }

  if (contract.mode === 'b1') {
    return checkDeadline(base, contract, now, 'b1');
  }
  if (contract.mode === 'b1_migrating') {
    return checkMigrating(root, base, contract, now);
  }
  if (contract.mode === 'retired') {
    return checkRetired(root, base, contract);
  }
  return checkCanonical(root, base, contract, now);
}

function checkDeadline(base, contract, now, label) {
  if (!contract.deadline) {
    return { ...base, status: 'blocked', deadline: null, reason: `Source contract ${contract.input} in mode ${label} is missing a deadline.` };
  }
  const deadlineDate = parseDate(contract.deadline);
  if (!deadlineDate) {
    return { ...base, status: 'blocked', deadline: contract.deadline, reason: `Source contract ${contract.input} has an unparseable deadline "${contract.deadline}".` };
  }
  const daysRemaining = Math.ceil((deadlineDate.getTime() - now.getTime()) / 86_400_000);
  if (daysRemaining < 0) {
    return { ...base, status: 'blocked', deadline: contract.deadline, daysRemaining, reason: `Source contract ${contract.input} expired on ${contract.deadline}.` };
  }
  if (daysRemaining <= WARNING_WINDOW_DAYS) {
    return { ...base, status: 'warning', deadline: contract.deadline, daysRemaining, reason: `Source contract ${contract.input} expires within ${WARNING_WINDOW_DAYS} days on ${contract.deadline}.` };
  }
  return { ...base, status: 'pass', deadline: contract.deadline, daysRemaining, reason: null };
}

function checkMigrating(root, base, contract, now) {
  if (!contract.designReference) {
    return { ...base, status: 'blocked', reason: `Source contract ${contract.input} in mode b1_migrating is missing a design reference.` };
  }
  if (!fs.existsSync(path.resolve(root, contract.designReference))) {
    return { ...base, status: 'blocked', reason: `Source contract ${contract.input} design reference ${contract.designReference} was not found on disk.` };
  }
  if (!DECLARED_STATES.includes(contract.declaredState)) {
    return { ...base, status: 'blocked', reason: `Source contract ${contract.input} has an unrecognized declared state "${contract.declaredState ?? ''}".` };
  }

  const deadlineCheck = checkDeadline(base, contract, now, 'b1_migrating');
  const annotated = {
    ...deadlineCheck,
    declaredState: contract.declaredState,
    designReference: contract.designReference,
  };
  if (deadlineCheck.status === 'blocked') {
    return annotated;
  }
  if (deadlineCheck.daysRemaining > MIGRATING_WINDOW_DAYS) {
    return {
      ...annotated,
      status: 'blocked',
      reason: `Source contract ${contract.input} deadline ${contract.deadline} is outside the ${MIGRATING_WINDOW_DAYS}-day bounded window for b1_migrating.`,
    };
  }
  return annotated;
}

function checkRetired(root, base, contract) {
  if (!contract.reportPath) {
    return { ...base, status: 'blocked', reason: `Source contract ${contract.input} in mode retired is missing a report reference.` };
  }
  const full = path.resolve(root, contract.reportPath);
  if (!fs.existsSync(full)) {
    return { ...base, status: 'blocked', reportPath: contract.reportPath, reason: `Source contract ${contract.input} retirement report ${contract.reportPath} was not found on disk.` };
  }
  const payload = readJsonSafe(full);
  if (!payload) {
    return { ...base, status: 'blocked', reportPath: contract.reportPath, reason: `Source contract ${contract.input} retirement report ${contract.reportPath} is malformed.` };
  }
  if (payload.writesDatabase !== false) {
    return { ...base, status: 'blocked', reportPath: contract.reportPath, reason: `Source contract ${contract.input} retirement report must declare writesDatabase: false.` };
  }
  const referenceCount = Number(payload.referenceCount);
  if (!Number.isFinite(referenceCount)) {
    return { ...base, status: 'blocked', reportPath: contract.reportPath, reason: `Source contract ${contract.input} retirement report has a non-finite referenceCount; failing closed.` };
  }
  if (payload.status !== 'pass' || referenceCount !== 0) {
    return { ...base, status: 'blocked', reportPath: contract.reportPath, referenceCount, reason: `Source contract ${contract.input} is still referenced in ${referenceCount} place(s); retirement is not satisfied.` };
  }
  return { ...base, status: 'pass', reportPath: contract.reportPath, referenceCount: 0, reason: null };
}

function checkCanonical(root, base, contract, now) {
  if (!contract.reportPath) {
    return { ...base, status: 'blocked', reason: `Source contract ${contract.input} in mode canonical is missing a readiness report reference.` };
  }
  const full = path.resolve(root, contract.reportPath);
  if (!fs.existsSync(full)) {
    return { ...base, status: 'blocked', reportPath: contract.reportPath, reason: `Source contract ${contract.input} readiness report ${contract.reportPath} was not found on disk.` };
  }
  const payload = readJsonSafe(full);
  if (!payload) {
    return { ...base, status: 'blocked', reportPath: contract.reportPath, reason: `Source contract ${contract.input} readiness report ${contract.reportPath} is malformed.` };
  }
  if (payload.status !== 'pass') {
    return { ...base, status: 'blocked', reportPath: contract.reportPath, reason: `Source contract ${contract.input} readiness report is not passing.` };
  }
  if (payload.writesDatabase !== false || payload.requiresDatabase !== true) {
    return { ...base, status: 'blocked', reportPath: contract.reportPath, reason: `Source contract ${contract.input} readiness report must declare requiresDatabase: true and writesDatabase: false.` };
  }
  const generated = parseDate(payload.generatedAt);
  if (!generated) {
    return { ...base, status: 'blocked', reportPath: contract.reportPath, reason: `Source contract ${contract.input} readiness report has an unparseable generatedAt.` };
  }
  const ageHours = (now.getTime() - generated.getTime()) / 3_600_000;
  if (ageHours > CANONICAL_REPORT_MAX_AGE_HOURS) {
    return { ...base, status: 'blocked', reportPath: contract.reportPath, reason: `Source contract ${contract.input} readiness report is ${Math.round(ageHours)}h old, older than the ${CANONICAL_REPORT_MAX_AGE_HOURS}h limit.` };
  }
  return { ...base, status: 'pass', reportPath: contract.reportPath, reason: null };
}

function extractSection(source, startMarker, endMarker) {
  const startIndex = source.indexOf(startMarker);
  if (startIndex < 0) {
    throw new Error(`Missing section: ${startMarker}`);
  }
  const endIndex = source.indexOf(endMarker, startIndex);
  return endIndex >= 0 ? source.slice(startIndex, endIndex) : source.slice(startIndex);
}

function extractDeclaredState(text) {
  const match = String(text ?? '').match(/`([A-Z0-9_]+)`/);
  return match?.[1] ?? null;
}

function extractLabelled(text, label) {
  const match = String(text ?? '').match(new RegExp(`${label}\\s*[:：]\\s*\`([^\`]+)\``, 'i'));
  return match?.[1] ?? null;
}

function normalizeDeadline(cell) {
  const match = String(cell ?? '').match(/(\d{4}-\d{2}-\d{2})/);
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

function readJsonSafe(fullPath) {
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch {
    return null;
  }
}
