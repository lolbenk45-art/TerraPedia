import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  assertAutomationRedisLogicalDb,
  FORMAL_DATABASES,
} from './automation-database-contract.mjs';
import { createSystemDriver } from '../monitor/crawler-queue-v2-scheduler-system-driver.mjs';

export const DEFAULT_WINDOW_MINUTES = 5;
export const MAX_WINDOW_MINUTES = 15;
export const TEST_REDIS_DB = 13;
export const FIXTURE_ACTION_ID = 'crawler-queue-v2-fixture';
export const FIXTURE_DOMAIN = 'crawler_queue_v2_fixture';
export const FIXTURE_MODE = 'fixture-changed-only';

const RUN_KEY = /^[a-z0-9]{1,3}_[a-f0-9]{16}$/;
const ISOLATED_DATABASE = /^terria_v1_automation_acceptance_[a-z0-9]{1,3}_[a-f0-9]{16}_(local|maint|relation)$/;
const FIXTURE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '../buff/fixtures/buff-t1.sample.json');

function requireText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function parseInteger(value, label) {
  if (!/^[0-9]+$/.test(String(value ?? ''))) throw new Error(`${label} must be an integer`);
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error(`${label} is out of range`);
  return number;
}

export function parseWindowArgs(argv = []) {
  const parsed = { profile: 't1', windowMinutes: DEFAULT_WINDOW_MINUTES };
  for (const raw of argv) {
    const match = String(raw).match(/^--([^=]+)(?:=(.*))?$/);
    if (!match) throw new Error(`unknown argument: ${raw}`);
    const [, key, value] = match;
    if (key === 'fixture-profile') {
      if (value !== 't1') throw new Error('fixture profile must be t1');
      parsed.profile = value;
    } else if (key === 'window-minutes') {
      const minutes = parseInteger(value, 'window minutes');
      if (minutes < 1 || minutes > MAX_WINDOW_MINUTES) {
        throw new Error(`window minutes must be between 1 and ${MAX_WINDOW_MINUTES}`);
      }
      parsed.windowMinutes = minutes;
    } else {
      throw new Error(`unknown argument: --${key}`);
    }
  }
  return Object.freeze(parsed);
}

export function buildBuffAutomationTestIdentity(runId, logicalDb = TEST_REDIS_DB, { validateWindow = true } = {}) {
  const normalized = requireText(runId, 'run ID');
  const slug = normalized.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 3) || 'run';
  const hash = createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 16);
  const runKey = `${slug}_${hash}`;
  const databases = Object.fromEntries(['local', 'maint', 'relation'].map((role) => [
    role,
    `terria_v1_automation_acceptance_${runKey}_${role}`,
  ]));
  const redis = {
    host: '127.0.0.1',
    port: 6380,
    logicalDb,
    namespace: `terrapedia:crawler:wiki-monitor:v2:test:${normalized}:`,
    epoch: `epoch-${runKey}`,
  };
  const identity = Object.freeze({ profile: 't1', runId: normalized, runKey, databases, redis });
  if (validateWindow) assertTestWindowResources(identity);
  return identity;
}

export function assertTestWindowResources(identity) {
  if (identity?.profile !== 't1' || !RUN_KEY.test(identity.runKey ?? '')) {
    throw new Error('Buff test window requires a run-derived T1 identity');
  }
  const databases = identity.databases ?? {};
  if (Object.keys(databases).sort().join(',') !== 'local,maint,relation') {
    throw new Error('Buff test window requires exactly local, maint, and relation databases');
  }
  for (const [role, name] of Object.entries(databases)) {
    if (!ISOLATED_DATABASE.test(name) || !name.endsWith(`_${role}`)) {
      throw new Error(`database is not an isolated T1 database: ${name}`);
    }
    if (Object.values(FORMAL_DATABASES).includes(name)) {
      throw new Error(`formal database is forbidden in Buff test window: ${name}`);
    }
  }
  const logicalDb = Number(identity.redis?.logicalDb);
  assertAutomationRedisLogicalDb(logicalDb, 'Buff test window Redis logical DB');
  if (logicalDb !== TEST_REDIS_DB) throw new Error('Buff test window Redis logical DB must be DB13');
  if (!/^terrapedia:crawler:wiki-monitor:v2:test:[^:]+:$/.test(identity.redis?.namespace ?? '')) {
    throw new Error('Buff test window Redis namespace must be run-derived fixture scope');
  }
  return true;
}

export function assertFixtureAutomationPayload(payload) {
  if (payload?.enabled !== true
      || payload.mode !== FIXTURE_MODE
      || Number(payload.sweepIntervalMinutes) !== 1
      || payload.canaryActionId !== FIXTURE_ACTION_ID) {
    throw new Error('fixture mode must be enabled with the registered fixture canary');
  }
  return true;
}

export function assertNaturalFixtureTick(value) {
  const sweep = value?.sweep ?? value;
  const detected = Array.isArray(sweep?.detected) ? sweep.detected : [];
  const dispatched = Array.isArray(sweep?.dispatched) ? sweep.dispatched : [];
  const fixtureDetection = detected.find((entry) => entry?.actionId === FIXTURE_ACTION_ID && entry?.changed === true);
  const fixtureDispatches = dispatched.filter((entry) => entry?.actionId === FIXTURE_ACTION_ID);
  if (!fixtureDetection || fixtureDispatches.length !== 1 || fixtureDispatches[0]?.accepted !== true) {
    throw new Error('natural fixture scheduler tick did not produce exactly one accepted dispatch');
  }
  if (value?.manualSweepCalls !== undefined && Number(value.manualSweepCalls) !== 0) {
    throw new Error('manual sweep was used in the fixture scheduler test window');
  }
  const attemptId = requireText(fixtureDispatches[0].attemptId, 'fixture attempt ID');
  return Object.freeze({ attemptId, checkedAt: sweep.checkedAt ?? null, status: sweep.status ?? null });
}

export function assertTerminalFixtureAttempt(value) {
  const status = String(value?.status ?? '').toLowerCase();
  if (!['completed', 'failed', 'timed_out', 'cancelled'].includes(status)) {
    throw new Error('fixture attempt did not reach a terminal state');
  }
  const attemptId = requireText(value?.attemptId, 'fixture attempt ID');
  return Object.freeze({ attemptId, status });
}

export function buildWindowArtifact({
  identity,
  status,
  failure = null,
  startedAt = null,
  expiresAt = null,
  enabledAt = null,
  disabledAt = null,
  disableConfirmed = false,
  naturalTick = null,
  terminalAttempt = null,
  buffAcceptance = null,
  readback = null,
  enableResponse = null,
  disableResponse = null,
} = {}) {
  assertTestWindowResources(identity);
  return {
    schemaVersion: 1,
    recordType: 'buff_manual_automation_test_window',
    manual_isolated_acceptance: true,
    production_source_delta: false,
    databaseWritesToFormalRuntime: false,
    profile: identity.profile,
    fixtureId: 'buff-t1-scheduler-fixture',
    fixtureSha256: `sha256:${createHash('sha256').update(fs.readFileSync(FIXTURE_PATH)).digest('hex')}`,
    runId: identity.runId,
    runKey: identity.runKey,
    databases: identity.databases,
    redis: identity.redis,
    startedAt,
    expiresAt,
    enabledAt,
    disabledAt,
    status,
    disableConfirmed,
    failure,
    naturalTick,
    terminalAttempt,
    buffAcceptance,
    readback,
    enableResponse,
    disableResponse,
  };
}

export async function runBuffAutomationTestWindow({
  runId,
  identity = buildBuffAutomationTestIdentity(runId),
  windowMinutes = DEFAULT_WINDOW_MINUTES,
  driver,
  writeArtifact = async () => {},
  now = () => new Date(),
} = {}) {
  if (!driver || typeof driver !== 'object') throw new Error('fixture scheduler driver is required');
  assertTestWindowResources(identity);
  if (!Number.isInteger(windowMinutes) || windowMinutes < 1 || windowMinutes > MAX_WINDOW_MINUTES) {
    throw new Error(`window minutes must be between 1 and ${MAX_WINDOW_MINUTES}`);
  }
  let startedAt = null;
  let expiresAt = null;
  let enabledAt = null;
  let disabledAt = null;
  let disableConfirmed = false;
  let enableResponse = null;
  let disableResponse = null;
  let naturalTick = null;
  let terminalAttempt = null;
  let buffAcceptance = null;
  let readback = null;
  let failure = null;
  let cleanupFailure = null;
  let prepared = false;
  try {
    await driver.prepare();
    prepared = true;
    const disabled = await driver.observeDisabledTick();
    if (Number(disabled?.dispatches ?? 0) !== 0) throw new Error('fixture scheduler was not disabled before the test window');
    const started = now();
    startedAt = started.toISOString();
    expiresAt = new Date(started.getTime() + windowMinutes * 60_000).toISOString();
    enableResponse = await driver.enableAutomation({ mode: FIXTURE_MODE, canaryActionId: FIXTURE_ACTION_ID });
    assertFixtureAutomationPayload(enableResponse);
    enabledAt = now().toISOString();
    naturalTick = assertNaturalFixtureTick(await driver.waitForScheduledTick({ deadline: expiresAt }));
    const progress = await driver.waitForProgress({ deadline: expiresAt });
    terminalAttempt = assertTerminalFixtureAttempt({
      attemptId: progress?.attemptId ?? naturalTick.attemptId,
      status: progress?.status,
    });
    if (terminalAttempt.status !== 'completed') throw new Error(`fixture attempt ended ${terminalAttempt.status}`);
    buffAcceptance = progress?.buffAcceptance ?? null;
    if (buffAcceptance?.status !== 'passed') throw new Error('Buff T1 chain acceptance did not pass');
    disableResponse = await driver.disableAutomation({ mode: FIXTURE_MODE, canaryActionId: FIXTURE_ACTION_ID });
    disableConfirmed = disableResponse?.enabled === false;
    if (!disableConfirmed) throw new Error('fixture scheduler disable was not confirmed');
    disabledAt = now().toISOString();
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  } finally {
    if (prepared && !disableConfirmed && typeof driver.disableAutomation === 'function'
        && (enabledAt !== null || enableResponse !== null)) {
      try {
        disableResponse = await driver.disableAutomation({ mode: FIXTURE_MODE, canaryActionId: FIXTURE_ACTION_ID });
        disableConfirmed = disableResponse?.enabled === false;
        disabledAt ??= now().toISOString();
      } catch (error) {
        cleanupFailure = `disable failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    try {
      if (typeof driver.cleanup === 'function') await driver.cleanup({ retainDiagnostics: Boolean(failure || cleanupFailure), failureMessage: failure || cleanupFailure });
    } catch (error) {
      cleanupFailure = `cleanup failed: ${error instanceof Error ? error.message : String(error)}`;
    }
    try {
      readback = prepared && typeof driver.independentReadback === 'function' ? await driver.independentReadback() : null;
    } catch (error) {
      cleanupFailure = `readback failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  if (cleanupFailure) failure = failure ? `${failure}; ${cleanupFailure}` : cleanupFailure;
  const readbackClean = !readback || [
    'liveAttempts', 'liveClaims', 'liveFences', 'backendProcesses', 'childProcesses', 'redisKeys',
    'credentials', 'files', 'ports', 'databases',
  ].every((key) => readback[key] === undefined || Number(readback[key]) === 0);
  if (!readbackClean) failure = failure ? `${failure}; independent readback is not clean` : 'independent readback is not clean';
  const status = failure ? (disableConfirmed ? 'failed' : 'blocked') : 'passed';
  const artifact = buildWindowArtifact({
    identity,
    status,
    failure,
    startedAt,
    expiresAt,
    enabledAt,
    disabledAt,
    disableConfirmed,
    naturalTick,
    terminalAttempt,
    buffAcceptance,
    readback,
    enableResponse,
    disableResponse,
  });
  await writeArtifact(artifact);
  return Object.freeze(artifact);
}

function readLocalConfig(configPath) {
  const target = path.resolve(configPath);
  if (!fs.existsSync(target)) throw new Error(`local stack config is missing: ${target}`);
  return JSON.parse(fs.readFileSync(target, 'utf8'));
}

function resolveLocalConfigPath(repoRoot) {
  const worktreeMarker = `${path.sep}.worktrees${path.sep}`;
  const worktreeIndex = repoRoot.indexOf(worktreeMarker);
  const primaryRoot = worktreeIndex >= 0 ? repoRoot.slice(0, worktreeIndex) : null;
  const candidates = [
    process.env.TP_CONFIG_PATH,
    process.env.TERRAPEDIA_LOCAL_STACK_CONFIG,
    path.join(repoRoot, 'platform/local/config/local-stack.config.json'),
    ...(primaryRoot ? [path.join(primaryRoot, 'platform/local/config/local-stack.config.json')] : []),
  ].filter(Boolean).map((value) => path.resolve(value));
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error('local stack config is required; create platform/local/config/local-stack.config.json or set TP_CONFIG_PATH');
  }
  return found;
}

function materializeWorktreeConfig(repoRoot, sourcePath) {
  const target = path.join(repoRoot, 'platform', 'local', 'config', 'local-stack.config.json');
  if (path.resolve(sourcePath) === path.resolve(target) || fs.existsSync(target)) {
    return Object.freeze({ path: target, cleanup: () => {} });
  }
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.copyFileSync(sourcePath, target, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(target, 0o600);
  return Object.freeze({ path: target, cleanup: () => fs.rmSync(target, { force: true }) });
}

function assertRedisDatabaseEmpty({ host, port, password, logicalDb }) {
  const args = ['--raw', '-h', host, '-p', String(port), '-n', String(logicalDb), 'DBSIZE'];
  const result = spawnSync('redis-cli', args, {
    encoding: 'utf8',
    env: password ? { ...process.env, REDISCLI_AUTH: password } : process.env,
  });
  if (result.status !== 0) throw new Error(`test Redis preflight failed: ${String(result.stderr ?? '').trim() || `exit ${result.status}`}`);
  if (Number(String(result.stdout ?? '').trim()) !== 0) throw new Error(`test Redis DB${logicalDb} is not empty`);
}

async function main() {
  const args = parseWindowArgs(process.argv.slice(2));
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const runId = `buff-window-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${randomBytes(4).toString('hex')}`;
  const identity = buildBuffAutomationTestIdentity(runId);
  const sourceConfigPath = resolveLocalConfigPath(repoRoot);
  const configLease = materializeWorktreeConfig(repoRoot, sourceConfigPath);
  const configPath = configLease.path;
  const config = readLocalConfig(configPath);
  const redis = config.redis ?? {};
  assertRedisDatabaseEmpty({
    host: redis.host ?? '127.0.0.1',
    port: Number(redis.port ?? 6380),
    password: redis.password,
    logicalDb: TEST_REDIS_DB,
  });
  const markerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-buff-window-'));
  fs.chmodSync(markerRoot, 0o700);
  const artifactPath = path.join(repoRoot, '.local', 'tmp', `buff-automation-test-window-${identity.runKey}.json`);
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true, mode: 0o700 });
  try {
    const driver = await createSystemDriver({
      repoRoot,
      configPath,
      runId,
      redisDb: TEST_REDIS_DB,
      markerRoot,
      backendPort: 18189,
      fixtureMode: true,
      buffMode: true,
      progressTimeoutMs: args.windowMinutes * 60_000,
      tickTimeoutMs: args.windowMinutes * 60_000,
      mysql: config.database,
      redis,
    });
    const artifact = await runBuffAutomationTestWindow({
      runId,
      identity,
      windowMinutes: args.windowMinutes,
      driver,
      writeArtifact: async (value) => fs.writeFileSync(artifactPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'w' }),
    });
    process.stdout.write(`${JSON.stringify({ status: artifact.status, artifact: artifactPath }, null, 2)}\n`);
    if (artifact.status !== 'passed') process.exitCode = 1;
  } finally {
    configLease.cleanup();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Buff automation test window failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
