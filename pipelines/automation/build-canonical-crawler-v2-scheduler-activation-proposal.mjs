#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  resolveSchedulerActivationCodeBundlePaths,
  SCHEDULER_ACTION_BY_DOMAIN,
  sha256Json,
} from './crawler-v2-scheduler-activation-preflight.mjs';
import {
  assertRepositoryOrdinaryFile,
  assertRepositoryPathConfinement,
} from '../lib/private-repository-path.mjs';
import { canonicalizePolicySet, computePolicySetHash } from './policy-set-hash.mjs';

const OPERATION_ID = 'canonical-crawler-v2-scheduler-activation';
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const MAX_PREFLIGHT_AGE_MS = 15 * 60 * 1000;

export function sha256File(filePath) {
  return `sha256:${createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

function requireText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required`);
  return value.trim();
}

function requireHash(value, label) {
  if (!HASH_PATTERN.test(value ?? '')) throw new Error(`${label} must be a sha256 hash`);
  return value;
}

function assertFreshPreflight(preflight, now) {
  const observedAt = Date.parse(preflight.observedAt ?? '');
  const nowMs = Date.parse(now);
  if (!Number.isFinite(observedAt) || !Number.isFinite(nowMs)) throw new Error('preflight observedAt is invalid');
  if (observedAt > nowMs || nowMs - observedAt > MAX_PREFLIGHT_AGE_MS) throw new Error('preflight observation is stale');
}

function assertPreflightHash(preflight) {
  requireHash(preflight?.preflightHash, 'preflightHash');
  const { preflightHash, ...payload } = preflight;
  if (sha256Json(payload) !== preflightHash) throw new Error('preflight hash drifted from its content');
}

function assertT1(t1Report, preflight) {
  if (!t1Report || t1Report.status !== 'passed' || t1Report.scheduledTickObserved !== true || t1Report.cleanupPassed !== true) {
    throw new Error('scheduler activation requires a passed cleaned runtime T1 report');
  }
  requireText(t1Report.path, 'T1 report path');
  if (t1Report.path.endsWith('/canonical-crawler-v2-scheduler-t1-acceptance.json')) {
    throw new Error('generic T1 report path is forbidden; pass the exact approved report');
  }
  requireHash(t1Report.sha256, 'T1 report sha256');
  if (!preflight.t1Report || preflight.t1Report.path !== t1Report.path || preflight.t1Report.sha256 !== t1Report.sha256) {
    throw new Error('preflight T1 report identity drifted');
  }
}

function assertCodeBundle(codeBundle, preflight) {
  const expected = preflight.codeBundle;
  if (!Array.isArray(expected) || expected.length === 0) throw new Error('preflight code bundle is required');
  // A missing codeBundle must fail closed. Defaulting to preflight.codeBundle
  // would compare the expected set to itself and make the drift check a no-op,
  // so the caller must supply the independently observed bundle.
  if (!Array.isArray(codeBundle) || codeBundle.length === 0) {
    throw new Error('explicit code bundle is required; the preflight bundle cannot vouch for itself');
  }
  if (JSON.stringify(codeBundle) !== JSON.stringify(expected)) throw new Error('code bundle drifted from preflight');
  const seen = new Set();
  for (const entry of expected) {
    const entryPath = requireText(entry?.path, 'code bundle path');
    if (seen.has(entryPath)) throw new Error(`duplicate code bundle path: ${entryPath}`);
    seen.add(entryPath);
    requireHash(entry.sha256, `code bundle hash for ${entryPath}`);
  }
}

function assertPreflight(preflight, t1Report, codeBundle, now) {
  if (!preflight || preflight.operationId !== OPERATION_ID) throw new Error('current preflight is required');
  assertPreflightHash(preflight);
  assertFreshPreflight(preflight, now);
  const eligibleDomains = normalizeSchedulerEligibleDomains(preflight.domains);
  assertSchedulerPolicyBinding({
    policyRows: preflight.policyRows,
    policySetHash: preflight.policySetHash,
    expectedDomainIds: eligibleDomains.map((domain) => domain.domainId),
  });
  assertT1(t1Report, preflight);
  assertCodeBundle(codeBundle, preflight);
  if (preflight.control?.enabled !== false || preflight.control?.mode !== 'changed-only') {
    throw new Error('preflight requires disabled changed-only config');
  }
  if (Number(preflight.counts?.liveAttempts) !== 0 || Number(preflight.counts?.sweepClaims) !== 0) {
    throw new Error('preflight requires zero live attempts and sweep claims');
  }
  if (preflight.reconciler?.status !== 'healthy') throw new Error('preflight reconciler is not healthy');
  if (preflight.databaseWrites !== false || preflight.networkAccess !== false || preflight.isolatedResourceWrites !== false) {
    throw new Error('preflight is write-capable');
  }
}

export function normalizeSchedulerEligibleDomains(domains) {
  if (!Array.isArray(domains) || domains.length === 0) {
    throw new Error('scheduler activation eligible domains are required');
  }
  const domainIds = new Set();
  const actionIds = new Set();
  const normalized = domains.map((domain) => {
    if (domain?.domainId != null && domain?.domain != null && domain.domainId !== domain.domain) {
      throw new Error('eligible domainId and domain alias conflict');
    }
    const domainId = requireText(domain?.domainId ?? domain?.domain, 'eligible domainId');
    const actionId = requireText(domain?.actionId, `eligible actionId for ${domainId}`);
    const expectedActionId = SCHEDULER_ACTION_BY_DOMAIN[domainId];
    if (!expectedActionId) throw new Error(`eligible domain is not registered for scheduler activation: ${domainId}`);
    if (actionId !== expectedActionId) {
      throw new Error(`eligible actionId ${actionId} is not registered for domain ${domainId}; expected ${expectedActionId}`);
    }
    if (domainIds.has(domainId)) throw new Error(`duplicate eligible domain: ${domainId}`);
    if (actionIds.has(actionId)) throw new Error(`duplicate eligible actionId: ${actionId}`);
    domainIds.add(domainId);
    actionIds.add(actionId);
    if (domain.readinessStatus !== 'eligible') {
      throw new Error(`eligible domain is not ready: ${domainId}`);
    }
    return { domainId, actionId, readinessStatus: 'eligible' };
  });
  return Object.freeze(normalized.sort((left, right) => left.domainId.localeCompare(right.domainId)));
}

export function assertSchedulerPolicyBinding({ policyRows, policySetHash, expectedDomainIds = null } = {}) {
  if (!Array.isArray(policyRows) || policyRows.length === 0) {
    throw new Error('scheduler activation requires exact current L2 policy rows');
  }
  const canonicalRows = canonicalizePolicySet(policyRows);
  const rowByDomain = new Map(policyRows.map((row) => [row.domainId, row]));
  requireHash(policySetHash, 'policySetHash');
  if (computePolicySetHash(canonicalRows) !== policySetHash) {
    throw new Error('scheduler activation policy-set hash does not match policy rows');
  }
  if (expectedDomainIds != null) {
    if (!Array.isArray(expectedDomainIds) || expectedDomainIds.some((domainId) => typeof domainId !== 'string')) {
      throw new Error('scheduler activation eligible domain set is invalid');
    }
    if (new Set(expectedDomainIds).size !== expectedDomainIds.length) {
      throw new Error('scheduler activation eligible domain set contains duplicates');
    }
    const expected = [...expectedDomainIds].sort();
    for (const domainId of expected) {
      const source = rowByDomain.get(domainId);
      const level = source?.currentLevel ?? source?.level;
      if (!source || level !== 'L2' || source.operationalState !== 'ACTIVE') {
        throw new Error(`scheduler activation requires active L2 policy row: ${domainId}`);
      }
    }
  } else {
    for (const row of canonicalRows) {
      const source = rowByDomain.get(row.domainId);
      const level = source?.currentLevel ?? source?.level;
      if (level !== 'L2' || source?.operationalState !== 'ACTIVE') {
        throw new Error(`scheduler activation requires active L2 policy row: ${row.domainId}`);
      }
    }
  }
  return Object.freeze({
    rows: canonicalRows.map((row) => {
      const source = rowByDomain.get(row.domainId);
      return Object.freeze({
        ...row,
        currentLevel: source.currentLevel ?? source.level,
        operationalState: source.operationalState,
      });
    }),
    policySetHash,
  });
}

export function buildCrawlerV2SchedulerActivationProposal({
  t1Report,
  preflight,
  codeBundle = null,
  now = new Date().toISOString(),
} = {}) {
  if (arguments[0]?.current !== undefined) throw new Error('current state constants are forbidden; provide preflight');
  assertPreflight(preflight, t1Report, codeBundle, now);
  const eligibleDomains = normalizeSchedulerEligibleDomains(preflight.domains);
  const policyBinding = assertSchedulerPolicyBinding({
    policyRows: preflight.policyRows,
    policySetHash: preflight.policySetHash,
    expectedDomainIds: eligibleDomains.map((domain) => domain.domainId),
  });
  const payload = {
    schemaVersion: 2,
    operationId: OPERATION_ID,
    proposalOnly: true,
    authorizationStatus: 'AWAITING_OWNER',
    databaseWrites: false,
    networkAccess: false,
    isolatedResourceWrites: false,
    preflight: {
      observedAt: preflight.observedAt,
      preflightHash: preflight.preflightHash,
      endpoint: preflight.endpoint,
    },
    mutation: {
      method: 'PUT',
      endpoint: '/admin/crawler-monitor/v2/automation',
      authenticatedLoopbackOnly: true,
    },
    t1Report: {
      path: t1Report.path,
      sha256: t1Report.sha256,
      cleanupPassed: true,
    },
    codeBundle: preflight.codeBundle.map((entry) => ({ path: entry.path, sha256: entry.sha256 })),
    policyRows: policyBinding.rows,
    policySetHash: policyBinding.policySetHash,
    current: {
      enabled: preflight.control.enabled,
      mode: preflight.control.mode,
      epoch: preflight.v2.stateStoreEpoch,
      namespace: preflight.v2.namespace,
      liveAttempts: preflight.counts.liveAttempts,
      sweepClaims: preflight.counts.sweepClaims,
      reconcilerHealthy: preflight.reconciler.status === 'healthy',
    },
    eligibleDomains,
    requested: {
      sweepIntervalMinutes: preflight.control.sweepIntervalMinutes,
      actor: null,
      reason: null,
      expiresAt: null,
    },
    rollback: {
      endpoint: '/admin/crawler-monitor/v2/automation',
      body: { enabled: false, mode: 'changed-only' },
    },
    forbidden: ['direct-json-write', 'direct-redis-write', 'manual-sweep', 'external-daemon', 'formal-permit-consumption'],
  };
  return Object.freeze({ ...payload, proposalHash: sha256Json(payload) });
}

function parseArgs(argv) {
  const args = Object.fromEntries(argv.filter((arg) => arg.startsWith('--')).map((arg) => {
    const [key, ...rest] = arg.slice(2).split('=');
    return [key, rest.join('=')];
  }));
  for (const key of ['preflight', 't1-report', 'output']) {
    if (!args[key]) throw new Error(`--${key}=<path> is required; no default or latest scan is allowed`);
  }
  return args;
}

function assertPreflightBundleMatchesManifest(preflight, repoRoot) {
  const expectedPaths = resolveSchedulerActivationCodeBundlePaths(repoRoot);
  const actualPaths = (preflight?.codeBundle ?? []).map((entry) => entry?.path);
  const expectedSet = [...expectedPaths].sort();
  const actualSet = [...actualPaths].sort();
  if (JSON.stringify(expectedSet) !== JSON.stringify(actualSet)) {
    throw new Error('preflight code bundle path set does not match the operation manifest');
  }
}

function readAndVerifyCodeBundle(preflight, repoRoot) {
  if (!Array.isArray(preflight?.codeBundle) || preflight.codeBundle.length === 0) {
    throw new Error('preflight code bundle is required');
  }
  return preflight.codeBundle.map((entry) => {
    const relativePath = requireText(entry?.path, 'code bundle path');
    const filePath = assertRepositoryOrdinaryFile({
      repoRoot,
      filePath: path.resolve(repoRoot, relativePath),
      label: `code bundle ${relativePath}`,
    });
    const actual = sha256File(filePath);
    if (actual !== entry.sha256) throw new Error(`code bundle hash drifted for ${relativePath}`);
    return { path: relativePath, sha256: actual };
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const t1Path = assertRepositoryOrdinaryFile({
    repoRoot,
    filePath: path.resolve(repoRoot, args['t1-report']),
    label: 'T1 report',
  });
  const preflightPath = assertRepositoryOrdinaryFile({
    repoRoot,
    filePath: path.resolve(repoRoot, args.preflight),
    label: 'preflight',
  });
  const outputPath = path.resolve(args.output);
  const t1Report = JSON.parse(fs.readFileSync(t1Path, 'utf8'));
  const preflight = JSON.parse(fs.readFileSync(preflightPath, 'utf8'));
  assertPreflightBundleMatchesManifest(preflight, repoRoot);
  const fileT1 = {
    ...t1Report,
    path: args['t1-report'],
    sha256: sha256File(t1Path),
    contentSha256: sha256File(t1Path),
  };
  if (preflight.t1Report?.sha256 !== fileT1.sha256) throw new Error('preflight T1 hash does not match the explicit T1 file');
  const codeBundle = readAndVerifyCodeBundle(preflight, repoRoot);
  const proposal = buildCrawlerV2SchedulerActivationProposal({ t1Report: fileT1, preflight, codeBundle });
  assertAuthorizationRootPath(outputPath, repoRoot, 'proposal output');
  const confinedOutputPath = assertRepositoryPathConfinement({
    repoRoot,
    filePath: outputPath,
    label: 'proposal output',
    createParent: true,
  });
  assertNoExistingEntry(confinedOutputPath, 'proposal output');
  fs.writeFileSync(confinedOutputPath, `${JSON.stringify(proposal, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ output: outputPath, proposalOnly: proposal.proposalOnly, enabled: proposal.current.enabled })}\n`);
}

function assertAuthorizationRootPath(filePath, repoRoot, label) {
  const root = path.resolve(repoRoot, 'reports/authorization/canonical');
  const normalized = path.resolve(filePath);
  if (normalized !== root && !normalized.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${label} must remain under reports/authorization/canonical`);
  }
}

function assertNoExistingEntry(filePath, label) {
  try {
    fs.lstatSync(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  throw new Error(`${label} already exists; overwrite is forbidden`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
