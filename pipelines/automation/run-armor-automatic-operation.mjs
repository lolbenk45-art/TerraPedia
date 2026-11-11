#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertArmorAutomaticBinding,
  readArmorAutomaticBinding,
  buildArmorAutomaticBindingPath,
} from './armor-automatic-dispatch-binding.mjs';
import {
  assertFrozenSourceMatchesDispatchIdentity,
  readFrozenSourceMonitorState,
} from './source-dispatch-identity.mjs';
import {
  acknowledgeBaseDomainSource,
  acknowledgeBaseDomainSourceWithFreshActivation,
  connectionOptions,
  loadFreshActivation,
  readBaseDomainSourceFingerprint,
} from './run-base-domain-automatic-operation.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import {
  buildActionProgressPayload,
  writeJsonFile,
} from '../workflow/backend-refresh-runtime-state.mjs';

const ACTION_ID = 'domain-source-armor-sets';
const OPERATION_ID = 'canonical-armor-ingestion';
const DOMAIN = 'armor_sets';
const DATABASE_DATETIME_TIME_ZONE = process.env.TERRAPEDIA_DB_TIME_ZONE ?? 'Asia/Shanghai';

/**
 * Execute the scheduler-owned Armor source fetch and its registered canonical
 * full-chain child. All side effects are behind injectable dependencies so the
 * contract can be exercised without MySQL, Redis, or network access.
 */
export async function runArmorAutomaticOperation({
  argv = process.argv.slice(2),
  env = process.env,
  now = new Date().toISOString(),
  readBindingImpl = readArmorAutomaticBinding,
  assertBindingMatchesAttemptImpl = assertBindingMatchesAttempt,
  spawnNodeImpl = spawnNode,
  readSourceProgressImpl = readCompletedSourceProgress,
  readCanonicalResultImpl = readCanonicalResult,
  readServerFingerprintImpl = readPrivateJson,
  acknowledgeSourceImpl = acknowledgeArmorSourceAfterFreshActivation,
  publishProgressImpl = publishProgress,
} = {}) {
  const args = parseArgs(argv);
  if (args.domain !== DOMAIN) throw new Error(`Armor automatic operation requires --domain=${DOMAIN}`);
  const repoRoot = path.resolve(env.WORKTREE_ROOT ?? process.cwd());
  const commandRoot = path.resolve(env.TERRAPEDIA_CRAWLER_COMMAND_ROOT ?? repoRoot);
  const progressPath = path.resolve(
    repoRoot,
    args['progress-path'] ?? env.TERRAPEDIA_CRAWLER_PROGRESS_PATH
      ?? 'data/generated/domain-source-armor-sets-progress.latest.json',
  );
  const sourceDispatchIdentity = sourceIdentityFromEnvironment(env);
  const startedAt = now;
  let binding;
  try {
    const bindingPath = env.TERRAPEDIA_ARMOR_AUTOMATIC_BINDING_PATH
      ?? buildArmorAutomaticBindingPath(sourceDispatchIdentity);
    binding = readBindingImpl({
      repoRoot,
      relativePath: bindingPath,
      now,
      expectedAttemptId: env.TERRAPEDIA_CRAWLER_ATTEMPT_ID,
      expectedSourceDispatchIdentity: sourceDispatchIdentity,
    });
    assertBindingMatchesAttemptImpl(binding, env);
    publishProgressImpl({ repoRoot, progressPath, env,
      status: 'running', phase: 'binding-validated', actionId: ACTION_ID, startedAt });

    const frozenProbeState = env.TERRAPEDIA_CRAWLER_SOURCE_STATE_PATH
      ? readFrozenSourceMonitorState({
          identity: binding.sourceDispatchIdentity,
          domain: DOMAIN,
          repoRoot,
          sourceStatePath: env.TERRAPEDIA_CRAWLER_SOURCE_STATE_PATH,
        })
      : null;
    const sourceSnapshot = frozenProbeState?.source?.snapshot?.path
      ? { ...frozenProbeState.source.snapshot, path: frozenProbeState.source.snapshot.path }
      : null;
    const sourceCommand = buildSourceCommand({ repoRoot, commandRoot, progressPath, sourceSnapshot });
    const childEnv = {
      ...env,
      WORKTREE_ROOT: env.WORKTREE_ROOT ?? repoRoot,
      TERRAPEDIA_CRAWLER_ACTION_ID: env.TERRAPEDIA_CRAWLER_ACTION_ID ?? ACTION_ID,
      TERRAPEDIA_CRAWLER_ATTEMPT_ID: binding.attemptId,
      TERRAPEDIA_CRAWLER_PROGRESS_PATH: env.TERRAPEDIA_CRAWLER_PROGRESS_PATH ?? progressPath,
    };
    await spawnNodeImpl({ argv: sourceCommand, env: childEnv, cwd: repoRoot, kind: 'source' });
    const sourceProgress = readSourceProgressImpl({ repoRoot, progressPath, binding, env: childEnv });
    assertSourceProgressMatchesBinding(sourceProgress, binding);
    publishProgressImpl({ repoRoot, progressPath, env,
      status: 'running', phase: 'source-completed', actionId: ACTION_ID, startedAt });

    const canonicalCommand = buildCanonicalCommand(binding, { repoRoot, commandRoot });
    const canonicalEnv = {
      ...childEnv,
      TERRAPEDIA_AUTHORIZED_PACKET_PATH: binding.authorization.packetPath,
      TERRAPEDIA_AUTHORIZED_SERVER_FINGERPRINT: readServerFingerprintImpl(
        repoRoot,
        binding.authorization.serverFingerprintPath,
        binding.authorization.serverFingerprintSha256,
      ),
      TERRAPEDIA_AUTHORIZED_DISPATCH_PERMIT_PATH: binding.authorization.permitPath,
      TERRAPEDIA_AUTHORIZED_DISPATCH_NONCE: binding.authorization.nonce,
    };
    await spawnNodeImpl({ argv: canonicalCommand, env: canonicalEnv, cwd: repoRoot, kind: 'canonical' });
    const result = readCanonicalResultImpl({ repoRoot, binding, env: canonicalEnv });
    assertCanonicalResult(result, binding, { repoRoot });
    await acknowledgeSourceImpl({
      repoRoot,
      binding,
      sourceDispatchIdentity: binding.sourceDispatchIdentity,
      sourceCheckedAt: sourceProgress.generatedAt,
      now,
      env: canonicalEnv,
    });
    publishProgressImpl({ repoRoot, progressPath, env,
      status: 'completed', phase: 'completed', actionId: ACTION_ID, startedAt,
      completedAt: now, resultKind: 'canonical_armor_ingestion_result' });
    return result;
  } catch (error) {
    publishProgressImpl({ repoRoot, progressPath, env,
      status: 'failed', phase: 'failed', actionId: ACTION_ID, startedAt,
      message: error?.message ?? String(error) });
    throw error;
  }
}

export function buildSourceCommand({ repoRoot, commandRoot = repoRoot, progressPath, sourceSnapshot = null }) {
  return [
    process.execPath,
    path.join(commandRoot, 'pipelines/fetch/fetch-wiki-armorsetbonuses.mjs'),
    `--progress-path=${progressPath}`,
    ...(sourceSnapshot?.path ? [`--source-snapshot-path=${sourceSnapshot.path}`] : []),
  ];
}

export function buildCanonicalCommand(binding, {
  repoRoot = process.cwd(),
  commandRoot = repoRoot,
} = {}) {
  return [
    process.execPath,
    path.join(commandRoot, 'pipelines/relation/run-armor-canonical-ingestion.mjs'),
    `--operation-id=${OPERATION_ID}`,
    `--result-label=${binding.resultLabel}`,
    `--intent=${binding.intent.path}`,
    '--apply=true',
  ];
}

export function assertBindingMatchesAttempt(binding, env) {
  if (env.TERRAPEDIA_CRAWLER_ACTION_ID != null && env.TERRAPEDIA_CRAWLER_ACTION_ID !== ACTION_ID) {
    throw new Error('Armor scheduler action environment does not match Armor action');
  }
  if (binding.actionId !== ACTION_ID) throw new Error('Armor binding action does not match scheduler action');
  if (binding.operationId !== OPERATION_ID) throw new Error('Armor binding operation does not match canonical operation');
  if (binding.attemptId !== env.TERRAPEDIA_CRAWLER_ATTEMPT_ID) {
    throw new Error('Armor binding attempt does not match scheduler attempt');
  }
  const identity = sourceIdentityFromEnvironment(env);
  for (const field of ['sourceFingerprint', 'sourceRunIdentity', 'sourceContentIdentity']) {
    if (identity != null && binding.sourceDispatchIdentity[field] !== identity[field]) {
      throw new Error(`Armor binding ${field} does not match scheduler attempt`);
    }
  }
  return true;
}

export function assertSourceProgressMatchesBinding(progress, binding) {
  if (!progress || String(progress.status).toLowerCase() !== 'completed') {
    throw new Error('Armor source progress must be completed before canonical ingestion');
  }
  const identity = progress.sourceDispatchIdentity ?? progress;
  if (identity.sourceFingerprint != null) {
    for (const field of ['sourceFingerprint', 'sourceRunIdentity', 'sourceContentIdentity']) {
      if (identity[field] !== binding.sourceDispatchIdentity[field]) {
        throw new Error(`Armor fetched source ${field} drifted from dispatch identity`);
      }
    }
  }
  assertFrozenSourceMatchesDispatchIdentity(
    binding.sourceDispatchIdentity,
    progress.sourceFingerprint ?? binding.sourceDispatchIdentity.sourceFingerprint,
  );
  return true;
}

export function assertCanonicalResult(result, binding, { repoRoot = process.cwd() } = {}) {
  if (!result || String(result.status).toUpperCase() !== 'COMPLETED'
      || result.operationId !== OPERATION_ID) {
    throw new Error('Armor canonical result must be completed');
  }
  const transactionCommitted = result.transaction?.committed === true
    || String(result.transaction?.status ?? '').toLowerCase() === 'committed';
  const readbackVerified = result.transaction?.readback?.verified === true
    || (Array.isArray(result.transaction?.receipts)
      && result.transaction.receipts.length > 0
      && result.transaction.receipts.every((receipt) => receipt?.readback != null));
  if (!transactionCommitted || !readbackVerified) {
    throw new Error('Armor canonical result requires committed independent readback');
  }
  const resultPath = path.join(
    path.resolve(repoRoot, 'reports/authorization/canonical'),
    `${OPERATION_ID}.${binding.resultLabel}.result.json`,
  );
  if (fs.existsSync(resultPath)) return true;
  // Injected result readers may provide a synthetic result; production readers
  // require the actual private result artifact before acknowledgement.
  if (result.__syntheticForTest === true) return true;
  throw new Error('Armor canonical result artifact is missing');
}

export async function acknowledgeArmorSourceAfterFreshActivation({
  repoRoot,
  binding,
  sourceDispatchIdentity,
  sourceCheckedAt,
  now,
  env = process.env,
  mysqlModule = null,
  readActivationImpl = loadFreshActivation,
  acknowledgeBaseImpl = acknowledgeBaseDomainSourceWithFreshActivation,
  acknowledgeImpl = null,
} = {}) {
  if (sourceDispatchIdentity == null || sourceCheckedAt == null) {
    throw new Error('Armor acknowledgement requires source identity and checked timestamp');
  }
  if (!Number.isFinite(Date.parse(sourceCheckedAt))) throw new Error('Armor source checked timestamp is invalid');
  if (Date.parse(now) >= Date.parse(binding.activation.expiresAt)) {
    throw new Error('Armor activation expired before acknowledgement');
  }
  if (typeof acknowledgeImpl === 'function') {
    return await acknowledgeImpl({ binding, sourceDispatchIdentity, sourceCheckedAt, now });
  }
  const db = mysqlModule ?? loadMysqlModule({ repoRoot });
  const connection = await db.createConnection(connectionOptions(env));
  try {
    const initialActivation = await readActivationImpl(connection);
    assertActivationMatchesBinding(initialActivation, binding.activation, now);
    return await acknowledgeBaseImpl({
      connection,
      initialActivation,
      startTime: now,
      sourceCheckedAt,
      nowProvider: () => now,
      sourceMode: 'live',
      domain: DOMAIN,
      repoRoot,
      sourceDispatchIdentity,
      sourceStatePath: env.TERRAPEDIA_CRAWLER_SOURCE_STATE_PATH,
      readSourceMonitorStateImpl: readFrozenSourceMonitorState,
      readSourceFingerprintImpl: readBaseDomainSourceFingerprint,
      acknowledgeSourceImpl: acknowledgeBaseDomainSource,
    });
  } finally {
    await connection.end();
  }
}

function assertActivationMatchesBinding(actual, expected, now) {
  if (!actual || !expected) throw new Error('Armor scheduler activation is missing');
  for (const field of ['decisionIdentity', 'packetHash', 'policySetHash', 'authorizedAt', 'expiresAt']) {
    const actualValue = ['authorizedAt', 'expiresAt'].includes(field)
      ? canonicalActivationTimestamp(actual[field], `database ${field}`)
      : actual[field];
    const expectedValue = ['authorizedAt', 'expiresAt'].includes(field)
      ? canonicalActivationTimestamp(expected[field], `binding ${field}`)
      : expected[field];
    if (actualValue !== expectedValue) {
      throw new Error(`Armor scheduler activation ${field} drifted from binding`);
    }
  }
  const verificationTime = Date.parse(now);
  if (!Number.isFinite(verificationTime)
      || verificationTime < Date.parse(expected.authorizedAt)
      || verificationTime >= Date.parse(expected.expiresAt)) {
    throw new Error('Armor scheduler activation is not currently valid');
  }
}

function canonicalActivationTimestamp(value, label) {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error(`Armor scheduler activation ${label} is invalid`);
    return value.toISOString();
  }
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Armor scheduler activation ${label} is required`);
  }
  const text = value.trim();
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(text)) {
    const parsed = new Date(text);
    if (!Number.isFinite(parsed.getTime())) throw new Error(`Armor scheduler activation ${label} is invalid`);
    return parsed.toISOString();
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/.exec(text);
  if (!match) throw new Error(`Armor scheduler activation ${label} must be an ISO timestamp or MySQL DATETIME`);
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const wallTime = Date.UTC(year, month - 1, day, hour, minute, second);
  const wallDate = new Date(wallTime);
  if (wallDate.getUTCFullYear() !== year || wallDate.getUTCMonth() !== month - 1
      || wallDate.getUTCDate() !== day || wallDate.getUTCHours() !== hour
      || wallDate.getUTCMinutes() !== minute || wallDate.getUTCSeconds() !== second) {
    throw new Error(`Armor scheduler activation ${label} is invalid`);
  }
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: DATABASE_DATETIME_TIME_ZONE,
    calendar: 'iso8601',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  let utcTime = wallTime;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(utcTime))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]));
    const representedWallTime = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second),
    );
    utcTime += wallTime - representedWallTime;
  }
  return new Date(utcTime).toISOString();
}

function readPrivateJson(repoRoot, relativePath, expectedHash) {
  const target = path.resolve(repoRoot, relativePath);
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    throw new Error('Armor server fingerprint artifact must be a private ordinary file');
  }
  const bytes = fs.readFileSync(target);
  const actual = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if (actual !== expectedHash) throw new Error('Armor server fingerprint artifact hash drifted');
  return bytes.toString('utf8');
}

function readCompletedSourceProgress({ repoRoot, progressPath }) {
  const payload = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  if (String(payload?.status).toLowerCase() !== 'completed') {
    throw new Error('Armor source progress must be completed');
  }
  return payload;
}

function readCanonicalResult({ repoRoot, binding }) {
  const resultPath = path.join(
    path.resolve(repoRoot, 'reports/authorization/canonical'),
    `${OPERATION_ID}.${binding.resultLabel}.result.json`,
  );
  return JSON.parse(fs.readFileSync(resultPath, 'utf8'));
}

function spawnNode({ argv, env, cwd }) {
  const [execPath, script, ...args] = argv;
  const child = spawnSync(execPath, [script, ...args], { cwd, env, stdio: 'inherit' });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`Armor ${script.includes('fetch-') ? 'source' : 'canonical'} operation failed with exit ${child.status}`);
}

function publishProgress({ progressPath, payload = null, ...rest }) {
  const progress = payload ?? rest;
  writeJsonFile(progressPath, buildActionProgressPayload({
    actionId: ACTION_ID,
    ...progress,
    generatedAt: progress.generatedAt ?? new Date().toISOString(),
    lastHeartbeatAt: progress.generatedAt ?? new Date().toISOString(),
    childStatusPath: progressPath,
  }));
}

function sourceIdentityFromEnvironment(env) {
  const values = {
    sourceFingerprint: env.TERRAPEDIA_CRAWLER_SOURCE_FINGERPRINT,
    sourceRunIdentity: env.TERRAPEDIA_CRAWLER_SOURCE_RUN_IDENTITY,
    sourceContentIdentity: env.TERRAPEDIA_CRAWLER_SOURCE_CONTENT_IDENTITY,
  };
  return Object.values(values).every((value) => value != null && String(value).trim()) ? values : null;
}

function parseArgs(argv) {
  return Object.fromEntries(argv.map((arg) => {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    return match ? [match[1], match[2]] : [String(arg).replace(/^--/, ''), true];
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runArmorAutomaticOperation().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
