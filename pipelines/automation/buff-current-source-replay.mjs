import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { assertAutomationRedisLogicalDb } from './automation-database-contract.mjs';
import { buildBuffAutomationTestIdentity } from './buff-automation-test-window.mjs';
import { runLiveAutomationAcceptance } from './run-live-automation-acceptance.mjs';
import { runBuffCanonicalT1Acceptance } from '../buff/buff-canonical-t1-acceptance.mjs';
import {
  assertCurrentBuffSourceReplay,
  captureCurrentBuffSource,
  SOURCE_REPLAY_REDIS_DB,
  SOURCE_REPLAY_PROGRESS_PATH,
} from '../fetch/buff-current-source-replay.mjs';
import { writeJsonFile } from '../workflow/backend-refresh-runtime-state.mjs';

export { SOURCE_REPLAY_REDIS_DB };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function buildBuffCurrentSourceReplayIdentity(runId) {
  return buildBuffAutomationTestIdentity(runId, SOURCE_REPLAY_REDIS_DB, { validateWindow: false });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writePrivateArtifact(filePath, payload) {
  writeJsonFile(filePath, payload);
  fs.chmodSync(filePath, 0o600);
}

function resolveConfigPath(repoRoot) {
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
  if (!found) throw new Error('local stack config is required for current Buff source replay');
  return found;
}

export function assertLoopbackHost(host, label) {
  const normalized = String(host ?? '').trim().toLowerCase();
  const isLoopback = normalized === 'localhost'
    || (net.isIP(normalized) === 4 && normalized.startsWith('127.'))
    || normalized === '::1';
  if (!isLoopback) throw new Error(`${label} host must be loopback for isolated replay: ${host}`);
  return host;
}

function redisDbSize(redis) {
  assertAutomationRedisLogicalDb(SOURCE_REPLAY_REDIS_DB, 'current Buff source replay Redis DB');
  const result = spawnSync('redis-cli', [
    '--raw', '-h', String(redis.host ?? '127.0.0.1'), '-p', String(redis.port ?? 6380),
    '-n', String(SOURCE_REPLAY_REDIS_DB), 'DBSIZE',
  ], {
    encoding: 'utf8',
    env: redis.password ? { ...process.env, REDISCLI_AUTH: redis.password } : process.env,
  });
  if (result.status !== 0) throw new Error(`current Buff source replay Redis preflight failed: ${String(result.stderr ?? '').trim()}`);
  const value = Number(String(result.stdout ?? '').trim());
  if (!Number.isInteger(value) || value < 0) throw new Error('current Buff source replay Redis DBSIZE is invalid');
  return value;
}

function assertRedisDbEmpty(redis, redisDbSizeImpl) {
  const size = Number(redisDbSizeImpl(redis));
  if (!Number.isInteger(size) || size < 0) throw new Error('current Buff source replay Redis DBSIZE is invalid');
  if (size !== 0) throw new Error('current Buff source replay requires an empty Redis DB18');
  return size;
}

export function assertBuffCurrentSourceReplayIdentity({ expected, observed } = {}) {
  if (observed?.runKey !== expected?.runKey) throw new Error('current Buff source replay acceptance runKey mismatch');
  if (JSON.stringify(observed?.databases) !== JSON.stringify(expected?.databases)) {
    throw new Error('current Buff source replay acceptance database identity mismatch');
  }
  if (Number(observed?.redis?.logicalDb) !== SOURCE_REPLAY_REDIS_DB) {
    throw new Error('current Buff source replay acceptance Redis DB identity mismatch');
  }
  return true;
}

export async function runBuffCurrentSourceReplay({
  repoRoot = ROOT,
  configPath = null,
  runId = `buff-source-replay-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${randomBytes(4).toString('hex')}`,
  captureImpl = captureCurrentBuffSource,
  acceptanceImpl = runLiveAutomationAcceptance,
  validateSourceReplayImpl = assertCurrentBuffSourceReplay,
  redisDbSizeImpl = redisDbSize,
  now = () => new Date().toISOString(),
} = {}) {
  const root = path.resolve(repoRoot);
  const identity = buildBuffCurrentSourceReplayIdentity(runId);
  const artifactPath = path.join(root, '.local', 'tmp', `buff-current-source-replay-${identity.runKey}.json`);
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true, mode: 0o700 });
  const baseArtifact = {
    schemaVersion: 'buff-current-source-replay-run/v1',
    manual_source_replay: true,
    production_source_delta: false,
    databaseWritesToFormalRuntime: false,
    startedAt: now(),
    runId,
    runKey: identity.runKey,
    redis: identity.redis,
    databases: identity.databases,
    status: 'running',
  };
  writePrivateArtifact(artifactPath, baseArtifact);
  let sourceReplay;
  let redis;
  let privateDirectory;
  let redisPreflightPassed = false;
  let acceptance;
  let redisPreflight;
  let redisPostflight;
  let failure;
  try {
    const config = readJson(configPath ?? resolveConfigPath(root));
    const mysql = config.database ?? {};
    redis = config.redis ?? {};
    assertLoopbackHost(mysql.host, 'MySQL target');
    assertLoopbackHost(redis.host, 'Redis target');
    redisPreflight = assertRedisDbEmpty(redis, redisDbSizeImpl);
    redisPreflightPassed = true;
    sourceReplay = await captureImpl({ progressPath: SOURCE_REPLAY_PROGRESS_PATH });
    validateSourceReplayImpl(sourceReplay);
    writePrivateArtifact(artifactPath, { ...baseArtifact, redis: { ...identity.redis, host: redis.host, port: Number(redis.port) }, sourceReplay, status: 'captured' });
    privateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-buff-source-replay-'));
    const result = await acceptanceImpl({
      profile: 't1',
      runId,
      privateDirectory,
      mysql: {
        host: mysql.host,
        port: Number(mysql.port),
        username: mysql.username,
        password: mysql.password,
      },
      redis: {
        host: redis.host,
        port: Number(redis.port),
        password: redis.password,
        logicalDb: SOURCE_REPLAY_REDIS_DB,
      },
      scope: 'buff-canonical',
      acceptanceExecutor: async (context) => runBuffCanonicalT1Acceptance({
        profile: context.profile,
        runId: context.runId,
        repoRoot: root,
        databases: context.databases,
        mysql: { ...context.mysql, readonlyUsername: context.mysql.readonlyUsername, readonlyPassword: context.mysql.readonlyPassword },
        sourceReplay,
        redisLogicalDb: SOURCE_REPLAY_REDIS_DB,
      }),
      onResources: async (resources) => {
        if (Number(resources.redis?.logicalDb) !== SOURCE_REPLAY_REDIS_DB
            || String(resources.redis?.host) !== String(redis.host)
            || Number(resources.redis?.port) !== Number(redis.port)) {
          throw new Error('current Buff source replay selected a different Redis resource');
        }
        assertBuffCurrentSourceReplayIdentity({
          expected: identity,
          observed: { runKey: identity.runKey, databases: resources.databases, redis: resources.redis },
        });
      },
    });
    acceptance = result;
    assertBuffCurrentSourceReplayIdentity({ expected: identity, observed: result });
    if (result.status !== 'passed' || result.cleanupPassed !== true) {
      throw new Error('current Buff source replay acceptance or T1 cleanup did not pass');
    }
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error));
  } finally {
    if (redis && redisPreflightPassed) {
      try {
        redisPostflight = assertRedisDbEmpty(redis, redisDbSizeImpl);
      } catch (error) {
        if (!failure) failure = error instanceof Error ? error : new Error(String(error));
        else failure.message += `; Redis DB18 postflight failed: ${error?.message ?? String(error)}`;
      }
    }
    if (privateDirectory) {
      try {
        fs.rmSync(privateDirectory, { recursive: true, force: true });
      } catch (error) {
        if (!failure) failure = error instanceof Error ? error : new Error(String(error));
        else failure.message += `; private artifact cleanup failed: ${error?.message ?? String(error)}`;
      }
    }
    const artifact = {
      ...baseArtifact,
      redis: { ...identity.redis, ...(redis ? { host: redis.host, port: Number(redis.port) } : {}) },
      sourceReplay,
      acceptance,
      redisPreflight: redisPreflight === undefined ? undefined : { dbSize: redisPreflight },
      redisPostflight: redisPostflight === undefined ? undefined : { dbSize: redisPostflight },
      cleanupPassed: acceptance?.cleanupPassed === true && !failure,
      status: failure ? 'failed' : 'passed',
      ...(failure ? { failure: failure.message } : {}),
    };
    writePrivateArtifact(artifactPath, artifact);
    if (failure) failure.artifactPath = artifactPath;
  }
  if (failure) throw failure;
  const artifact = readJson(artifactPath);
  return Object.freeze({ artifactPath, ...artifact });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0] !== `--redis-db=${SOURCE_REPLAY_REDIS_DB}`) {
    process.stderr.write(`Buff current source replay requires --redis-db=${SOURCE_REPLAY_REDIS_DB}\n`);
    process.exitCode = 2;
  } else runBuffCurrentSourceReplay()
    .then((result) => {
      process.stdout.write(`${JSON.stringify({ status: result.status, artifact: result.artifactPath }, null, 2)}\n`);
      if (result.status !== 'passed') process.exitCode = 1;
    })
    .catch((error) => {
      process.stderr.write(`Buff current source replay failed: ${error.message}${error.artifactPath ? `; artifact: ${error.artifactPath}` : ''}\n`);
      process.exitCode = 1;
    });
}
