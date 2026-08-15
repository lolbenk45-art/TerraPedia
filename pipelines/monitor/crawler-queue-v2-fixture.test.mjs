import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { resolveRecordedItemConfig, resolveRecordedRecipeConfig } from './crawler-queue-v2-recorded-config.mjs';

const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'crawler-queue-v2-fixture.mjs');

test('recorded Recipe mode requires explicit isolated database and marker inputs', () => {
  assert.equal(resolveRecordedRecipeConfig({}), null);
  assert.throws(() => resolveRecordedRecipeConfig({ TERRAPEDIA_RECORDED_RECIPE: 'true' }), /requires TERRAPEDIA_RECORDED_RECIPE_REPO_ROOT/);
  const config = resolveRecordedRecipeConfig({
    TERRAPEDIA_RECORDED_RECIPE: 'true',
    TERRAPEDIA_RECORDED_RECIPE_REPO_ROOT: '/repo',
    TERRAPEDIA_RECORDED_RECIPE_MARKER_ROOT: '/tmp/marker',
    TERRAPEDIA_RECORDED_RECIPE_DB: 'terria_v1_automation_acceptance_ab_0123456789abcdef_local',
    TERRAPEDIA_RECORDED_RECIPE_MYSQL_HOST: '127.0.0.1',
    TERRAPEDIA_RECORDED_RECIPE_MYSQL_PORT: '13306',
    TERRAPEDIA_RECORDED_RECIPE_MYSQL_USER: 'prov',
    TERRAPEDIA_RECORDED_RECIPE_MYSQL_PASSWORD: 'secret',
  });
  assert.equal(config.mysql.port, 13306);
  assert.equal(config.limit, 2);
});

test('recorded Item mode requires isolated three-schema identities and readonly access', () => {
  assert.equal(resolveRecordedItemConfig({}), null);
  assert.throws(() => resolveRecordedItemConfig({ TERRAPEDIA_RECORDED_ITEM: 'true' }), /requires TERRAPEDIA_RECORDED_ITEM_REPO_ROOT/);
  const config = resolveRecordedItemConfig({
    TERRAPEDIA_RECORDED_ITEM: 'true', TERRAPEDIA_RECORDED_ITEM_REPO_ROOT: '/repo', TERRAPEDIA_RECORDED_ITEM_MARKER_ROOT: '/tmp/marker',
    TERRAPEDIA_RECORDED_ITEM_LOCAL_DB: 'terria_v1_automation_acceptance_itm_0123456789abcdef_local',
    TERRAPEDIA_RECORDED_ITEM_MAINT_DB: 'terria_v1_automation_acceptance_itm_0123456789abcdef_maint',
    TERRAPEDIA_RECORDED_ITEM_RELATION_DB: 'terria_v1_automation_acceptance_itm_0123456789abcdef_relation',
    TERRAPEDIA_RECORDED_ITEM_MYSQL_HOST: '127.0.0.1', TERRAPEDIA_RECORDED_ITEM_MYSQL_PORT: '13306',
    TERRAPEDIA_RECORDED_ITEM_MYSQL_USER: 'prov', TERRAPEDIA_RECORDED_ITEM_MYSQL_PASSWORD: 'secret',
    TERRAPEDIA_RECORDED_ITEM_READONLY_USER: 'ro', TERRAPEDIA_RECORDED_ITEM_READONLY_PASSWORD: 'ro-secret',
  });
  assert.equal(config.mysql.port, 13306);
  assert.equal(config.limit, 100);
  assert.equal(config.databases.relation.endsWith('_relation'), true);
});

test('fixture writes monotonic V2 progress without network or database access', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crawler-v2-fixture-'));
  const progressPath = path.join(root, 'progress.json');
  const result = await runFixture([
    '--heartbeats=3',
    '--interval-ms=10',
    `--progress-path=${progressPath}`,
  ], identityEnv());

  assert.equal(result.code, 0, result.stderr);
  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  assert.equal(progress.status, 'completed');
  assert.equal(progress.queueId, 'queue-fixture');
  assert.equal(progress.attemptId, 'attempt-fixture');
  assert.equal(progress.fenceToken, 9);
  assert.equal(progress.stateStoreEpoch, 'epoch-fixture');
  assert.ok(progress.progressSequence >= 4);
  assert.doesNotMatch(result.stdout + result.stderr, /https?:\/\//);
});

test('fixture can ignore TERM long enough to exercise forced cancellation', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crawler-v2-ignore-term-'));
  const progressPath = path.join(root, 'progress.json');
  const child = spawn(process.execPath, [
    scriptPath,
    '--heartbeats=1000',
    '--interval-ms=20',
    '--ignore-term',
    `--progress-path=${progressPath}`,
  ], { env: { ...process.env, ...identityEnv() }, stdio: ['ignore', 'pipe', 'pipe'] });

  try {
    await waitFor(() => fs.existsSync(progressPath), 2000);
    child.kill('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(child.exitCode, null);
  } finally {
    await stopChild(child);
  }
});

test('fixture stalls progress but remains alive after the configured heartbeat', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crawler-v2-stall-'));
  const progressPath = path.join(root, 'progress.json');
  const child = spawn(process.execPath, [
    scriptPath,
    '--heartbeats=1',
    '--stall-after=0',
    '--interval-ms=20',
    `--progress-path=${progressPath}`,
  ], { env: { ...process.env, ...identityEnv() }, stdio: ['ignore', 'pipe', 'pipe'] });

  try {
    await waitFor(() => fs.existsSync(progressPath), 2000);
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(child.exitCode, null);
    assert.equal(JSON.parse(fs.readFileSync(progressPath, 'utf8')).phase, 'starting');
  } finally {
    await stopChild(child);
  }
});

function identityEnv() {
  return {
    TERRAPEDIA_CRAWLER_QUEUE_ID: 'queue-fixture',
    TERRAPEDIA_CRAWLER_ATTEMPT_ID: 'attempt-fixture',
    TERRAPEDIA_CRAWLER_FENCE_TOKEN: '9',
    TERRAPEDIA_CRAWLER_STATE_STORE_EPOCH: 'epoch-fixture',
    TERRAPEDIA_CRAWLER_INITIAL_STATE_VERSION: '2',
    TERRAPEDIA_CRAWLER_PROGRESS_SEQUENCE: '0',
  };
}

async function runFixture(args, extraEnv) {
  const child = spawn(process.execPath, [scriptPath, ...args], {
    env: { ...process.env, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, 3000);

  try {
    const [code, signal] = await once(child, 'exit');
    if (timedOut) {
      throw new Error(`fixture timed out; signal=${signal}; stderr=${stderr}`);
    }
    return { code, signal, stdout, stderr };
  } finally {
    clearTimeout(timeout);
    await stopChild(child);
  }
}

async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`condition was not met within ${timeoutMs}ms`);
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGKILL');
  await once(child, 'exit');
}
