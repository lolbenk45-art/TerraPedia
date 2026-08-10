#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { buildCanonicalOperationExecutionManifest } from './canonical-operation-execution-manifest.mjs';

const OPERATION_ID = 'canonical-crawler-v2-scheduler-activation';
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const V2_NAMESPACE_PATTERN = /^terrapedia:crawler:wiki-monitor:v2:/;
const DEFAULT_MAX_AGE_MS = 15 * 60 * 1000;

function sortedValue(value) {
  if (Array.isArray(value)) return value.map(sortedValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortedValue(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(sortedValue(value));
}

export function sha256Json(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function requireText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required`);
  return value.trim();
}

function requireHash(value, label) {
  if (!HASH_PATTERN.test(value ?? '')) throw new Error(`${label} must be a sha256 hash`);
  return value;
}

function parseTime(value, label) {
  const time = Date.parse(value ?? '');
  if (!Number.isFinite(time)) throw new Error(`${label} must be an ISO timestamp`);
  return time;
}

function assertFresh(value, label, nowMs, maxAgeMs) {
  const observedMs = parseTime(value, `${label}.observedAt`);
  if (observedMs > nowMs) throw new Error(`${label} observedAt is in the future`);
  if (nowMs - observedMs > maxAgeMs) throw new Error(`${label} observation is stale`);
}

function assertReaderReadOnly(reader) {
  if (!reader) return;
  const names = new Set();
  let current = reader;
  while (current && current !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(current)) names.add(name);
    current = Object.getPrototypeOf(current);
  }
  const forbidden = [...names].filter((key) => /^(put|post|write|delete|mutate|sweep|claim|enqueue|spawn)/i.test(key));
  if (forbidden.length > 0) throw new Error(`preflight reader exposes mutation methods: ${forbidden.join(', ')}`);
}

function assertSnapshot(snapshot, { nowMs, maxAgeMs }) {
  if (!snapshot || typeof snapshot !== 'object') throw new Error('preflight snapshot is required');
  if (snapshot.operationId !== OPERATION_ID) throw new Error('preflight operationId is invalid');
  assertFresh(snapshot.observedAt, 'preflight', nowMs, maxAgeMs);

  const control = snapshot.control;
  if (!control || control.enabled !== false) throw new Error('preflight requires disabled automation');
  if (control.mode !== 'changed-only') throw new Error('preflight requires changed-only mode');
  if (!Number.isInteger(control.sweepIntervalMinutes) || control.sweepIntervalMinutes < 1) {
    throw new Error('preflight sweep interval is invalid');
  }

  const v2 = snapshot.v2;
  const epoch = requireText(v2?.stateStoreEpoch, 'preflight V2 epoch');
  const namespace = requireText(v2?.namespace, 'preflight V2 namespace');
  if (!V2_NAMESPACE_PATTERN.test(namespace)) throw new Error('preflight namespace is not V2');
  requireText(v2?.queueContractVersion, 'preflight queue contract version');

  if (Number(snapshot.counts?.liveAttempts) !== 0) throw new Error('preflight requires zero live attempts');
  if (Number(snapshot.counts?.sweepClaims) !== 0) throw new Error('preflight requires zero sweep claims');
  if (snapshot.reconciler?.status !== 'healthy') throw new Error('preflight reconciler is not healthy');
  if (Number(snapshot.reconciler?.overdueAttemptCount) !== 0 || Number(snapshot.reconciler?.failureCount) !== 0) {
    throw new Error('preflight reconciler has overdue or failed work');
  }

  if (!Array.isArray(snapshot.domains) || snapshot.domains.length === 0) {
    throw new Error('preflight domain readiness is missing');
  }
  const actionIds = new Set();
  for (const domain of snapshot.domains) {
    requireText(domain?.domain, 'preflight domain');
    const actionId = requireText(domain?.actionId, 'preflight actionId');
    if (actionIds.has(actionId)) throw new Error(`preflight duplicate actionId: ${actionId}`);
    actionIds.add(actionId);
    if (domain.readinessStatus !== 'eligible') throw new Error(`preflight domain is not ready: ${actionId}`);
    requireHash(domain.sourceHash, `${actionId} sourceHash`);
    requireText(domain.evidencePath, `${actionId} evidencePath`);
    assertFresh(domain.observedAt, `${actionId} readiness`, nowMs, maxAgeMs);
    if (domain.stateStoreEpoch != null && domain.stateStoreEpoch !== epoch) {
      throw new Error(`preflight domain epoch drifted: ${actionId}`);
    }
  }

  if (snapshot.databaseWrites !== false || snapshot.networkAccess !== false || snapshot.isolatedResourceWrites !== false) {
    throw new Error('preflight must be read-only and no-write');
  }
  return true;
}

export function buildCrawlerV2SchedulerActivationPreflight({
  snapshot,
  t1Report,
  codeBundle = [],
  reader = null,
  now = new Date().toISOString(),
  maxAgeMs = DEFAULT_MAX_AGE_MS,
} = {}) {
  assertReaderReadOnly(reader);
  const nowMs = parseTime(now, 'now');
  assertSnapshot(snapshot, { nowMs, maxAgeMs });
  if (!t1Report || t1Report.status !== 'passed' || t1Report.scheduledTickObserved !== true || t1Report.cleanupPassed !== true) {
    throw new Error('preflight requires a passed cleaned runtime T1 report');
  }
  requireText(t1Report.path, 'T1 report path');
  requireHash(t1Report.sha256, 'T1 report sha256');
  if (t1Report.contentSha256 != null && t1Report.contentSha256 !== t1Report.sha256) {
    throw new Error('T1 report hash drifted from its content');
  }
  if (!Array.isArray(codeBundle) || codeBundle.length === 0) throw new Error('preflight code bundle is required');
  const seen = new Set();
  for (const entry of codeBundle) {
    const entryPath = requireText(entry?.path, 'code bundle path');
    if (seen.has(entryPath)) throw new Error(`duplicate code bundle path: ${entryPath}`);
    seen.add(entryPath);
    requireHash(entry.sha256, `code bundle hash for ${entryPath}`);
  }

  const payload = {
    schemaVersion: 1,
    operationId: OPERATION_ID,
    observedAt: snapshot.observedAt,
    endpoint: snapshot.endpoint,
    control: snapshot.control,
    v2: snapshot.v2,
    counts: snapshot.counts,
    reconciler: snapshot.reconciler,
    domains: snapshot.domains,
    t1Report: { ...t1Report },
    codeBundle: codeBundle.map((entry) => ({ path: entry.path, sha256: entry.sha256 })),
    databaseWrites: false,
    networkAccess: false,
    isolatedResourceWrites: false,
  };
  return Object.freeze({ ...payload, preflightHash: sha256Json(payload) });
}

export const CRAWLER_V2_SCHEDULER_ACTIVATION_PREFLIGHT_MAX_AGE_MS = DEFAULT_MAX_AGE_MS;

// The code bundle must be the operation's manifest-declared governing code
// set, not an operator-supplied list. Deriving it from the execution manifest
// (which transitively expands static imports and fails closed on any missing
// file) is what makes "freeze the exact current code bundle" a real guarantee.
export function resolveSchedulerActivationCodeBundlePaths(repoRoot) {
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: OPERATION_ID,
  });
  const paths = (manifest.codeBundleEntries ?? []).map((entry) => entry.path);
  if (paths.length === 0) throw new Error('manifest declared an empty code bundle');
  return paths;
}

function resolveSchedulerActivationCodeBundle(repoRoot) {
  return resolveSchedulerActivationCodeBundlePaths(repoRoot).map((relativePath) => {
    const bytes = fs.readFileSync(
      assertInsideRepo(path.resolve(repoRoot, relativePath), repoRoot, `code bundle ${relativePath}`),
    );
    return { path: relativePath, sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}` };
  });
}

function parseArgs(argv) {
  const args = Object.fromEntries(argv.filter((arg) => arg.startsWith('--')).map((arg) => {
    const [key, ...rest] = arg.slice(2).split('=');
    return [key, rest.join('=')];
  }));
  for (const key of ['api-base', 't1-report', 'output']) {
    if (!args[key]) throw new Error(`--${key}=<path> is required`);
  }
  return args;
}

async function readPreflightEndpoint(apiBase) {
  const base = new URL(apiBase);
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(base.hostname)) {
    throw new Error('preflight API base must be loopback');
  }
  const url = new URL('/admin/crawler-monitor/v2/automation/preflight', `${base.toString().replace(/\/$/, '')}/`);
  const headers = { accept: 'application/json' };
  if (process.env.TERRAPEDIA_ADMIN_TOKEN) headers.authorization = `Bearer ${process.env.TERRAPEDIA_ADMIN_TOKEN}`;
  const response = await fetch(url, { method: 'GET', headers });
  if (!response.ok) throw new Error(`preflight GET failed with HTTP ${response.status}`);
  const body = await response.json();
  if (body?.success === false) throw new Error('preflight GET returned success=false');
  return body?.data ?? body;
}

function readT1Report(reportPath, repoRoot) {
  const absolute = assertInsideRepo(path.resolve(repoRoot, reportPath), repoRoot, 'T1 report');
  const bytes = fs.readFileSync(absolute);
  const report = JSON.parse(bytes.toString('utf8'));
  return {
    ...report,
    path: reportPath,
    sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    contentSha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  };
}

function assertInsideRepo(filePath, repoRoot, label) {
  const root = path.resolve(repoRoot);
  const normalized = path.resolve(filePath);
  if (normalized !== root && !normalized.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${label} must remain inside the repository`);
  }
  return normalized;
}

function writeAtomicNoOverwrite(outputPath, payload) {
  const directory = path.dirname(outputPath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temp = path.join(directory, `.${path.basename(outputPath)}.${process.pid}.tmp`);
  fs.writeFileSync(temp, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  try {
    fs.renameSync(temp, outputPath);
  } catch (error) {
    try { fs.unlinkSync(temp); } catch {}
    throw error;
  }
}

function assertAuthorizationOutputPath(outputPath, repoRoot) {
  const root = path.resolve(repoRoot, 'reports/authorization/canonical');
  const normalized = path.resolve(outputPath);
  if (normalized !== root && !normalized.startsWith(`${root}${path.sep}`)) {
    throw new Error('preflight output must remain under reports/authorization/canonical');
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const snapshot = await readPreflightEndpoint(args['api-base']);
  const t1Report = readT1Report(args['t1-report'], repoRoot);
  const codeBundle = resolveSchedulerActivationCodeBundle(repoRoot);
  const preflight = buildCrawlerV2SchedulerActivationPreflight({
    snapshot,
    t1Report,
    codeBundle,
  });
  const outputPath = path.resolve(repoRoot, args.output);
  assertAuthorizationOutputPath(outputPath, repoRoot);
  writeAtomicNoOverwrite(outputPath, preflight);
  process.stdout.write(`${JSON.stringify({ output: outputPath, preflightHash: preflight.preflightHash })}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
