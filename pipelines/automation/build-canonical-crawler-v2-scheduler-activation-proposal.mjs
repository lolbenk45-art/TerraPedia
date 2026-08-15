#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  resolveSchedulerActivationCodeBundlePaths,
  sha256Json,
} from './crawler-v2-scheduler-activation-preflight.mjs';

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

export function buildCrawlerV2SchedulerActivationProposal({
  t1Report,
  preflight,
  codeBundle = null,
  now = new Date().toISOString(),
} = {}) {
  if (arguments[0]?.current !== undefined) throw new Error('current state constants are forbidden; provide preflight');
  assertPreflight(preflight, t1Report, codeBundle, now);
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
    current: {
      enabled: preflight.control.enabled,
      mode: preflight.control.mode,
      epoch: preflight.v2.stateStoreEpoch,
      namespace: preflight.v2.namespace,
      liveAttempts: preflight.counts.liveAttempts,
      sweepClaims: preflight.counts.sweepClaims,
      reconcilerHealthy: preflight.reconciler.status === 'healthy',
    },
    eligibleDomains: Object.fromEntries(preflight.domains.map((domain) => [domain.actionId, domain.readinessStatus])),
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

function assertAuthorizationOutputPath(outputPath, repoRoot) {
  const root = path.resolve(repoRoot, 'reports/authorization/canonical');
  const normalized = path.resolve(outputPath);
  if (normalized !== root && !normalized.startsWith(`${root}${path.sep}`)) {
    throw new Error('proposal output must remain under reports/authorization/canonical');
  }
}

function assertInsideRepo(filePath, repoRoot, label) {
  const root = path.resolve(repoRoot);
  const normalized = path.resolve(filePath);
  if (normalized !== root && !normalized.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${label} must remain inside the repository`);
  }
  return normalized;
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
    const filePath = assertInsideRepo(path.resolve(repoRoot, relativePath), repoRoot, `code bundle ${relativePath}`);
    const actual = sha256File(filePath);
    if (actual !== entry.sha256) throw new Error(`code bundle hash drifted for ${relativePath}`);
    return { path: relativePath, sha256: actual };
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const t1Path = assertInsideRepo(path.resolve(repoRoot, args['t1-report']), repoRoot, 'T1 report');
  const preflightPath = assertInsideRepo(path.resolve(repoRoot, args.preflight), repoRoot, 'preflight');
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
  assertAuthorizationOutputPath(outputPath, repoRoot);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(outputPath, `${JSON.stringify(proposal, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ output: outputPath, proposalOnly: proposal.proposalOnly, enabled: proposal.current.enabled })}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
