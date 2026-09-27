import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { computePolicySetHash } from './policy-set-hash.mjs';
import { sha256Json } from './crawler-v2-scheduler-activation-preflight.mjs';

const HASH = (character) => `sha256:${character.repeat(64)}`;
const SERVER_FINGERPRINT = Object.freeze({
  host: '127.0.0.1',
  port: 13306,
  serverUuid: 'local-server-uuid',
  databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
});
const CANARY_REQUEST = Object.freeze({
  operationId: 'canonical-crawler-v2-scheduler-activation',
  requestHash: HASH('a'),
  canary: { actionId: 'wiki-items-refresh', domainId: 'items' },
  requested: { canaryActionId: 'wiki-items-refresh' },
});

function canonicalRequest(overrides = {}) {
  const payload = {
    schemaVersion: 1,
    requestKind: 'scheduler_activation_authorization',
    operationId: 'canonical-crawler-v2-scheduler-activation',
    authorizationStatus: 'AWAITING_OWNER',
    databaseWrites: false,
    networkAccess: false,
    isolatedResourceWrites: false,
    generatedAt: '2026-09-19T01:00:00.000Z',
    expiresAt: '2026-09-19T02:00:00.000Z',
    canary: CANARY_REQUEST.canary,
    requested: CANARY_REQUEST.requested,
    actor: null,
    reason: null,
    authorizationReference: null,
    decisionIdentity: null,
    missingOwnerFields: ['actor', 'reason', 'authorizationReference', 'decisionIdentity'],
    ...overrides,
  };
  const { requestHash, ...withoutRequestHash } = payload;
  return { ...withoutRequestHash, requestHash: requestHash ?? sha256Json(withoutRequestHash) };
}

function cliEnv(repoRoot) {
  return {
    WORKTREE_ROOT: repoRoot,
    TERRAPEDIA_DB_NAME: 'terria_v1_local',
    TERRAPEDIA_DB_HOST: '127.0.0.1',
    TERRAPEDIA_DB_PORT: '13306',
    TERRAPEDIA_DB_USERNAME: 'root',
    TERRAPEDIA_DB_PASSWORD: 'root',
  };
}

function cliArgs(requestPath) {
  return [
    `--request=${requestPath}`,
    '--input=reports/authorization/canonical/capture.input.json',
    '--policy-rows=reports/authorization/canonical/capture.policy-rows.json',
    '--server-fingerprint=reports/authorization/canonical/capture.server-fingerprint.json',
  ];
}

function policyRows({ schedulerLevel = 'L1', schedulerState = 'ACTIVE' } = {}) {
  return [
    { domainId: 'audio', policyVersion: 1, policyHash: HASH('a'), currentLevel: 'L1', operationalState: 'ACTIVE' },
    { domainId: 'crawler_v2_scheduler', policyVersion: 1, policyHash: HASH('b'), currentLevel: schedulerLevel, operationalState: schedulerState },
    { domainId: 'shimmer', policyVersion: 1, policyHash: HASH('c'), currentLevel: 'L1', operationalState: 'ACTIVE' },
  ];
}

test('freezes the exact active scheduler policy identity for the policy writer', async () => {
  const { buildCrawlerV2SchedulerActivationSnapshot } = await import(
    './capture-crawler-v2-scheduler-activation-input.mjs'
  );
  const rows = policyRows();

  const snapshot = buildCrawlerV2SchedulerActivationSnapshot({
    policyRows: rows,
    serverFingerprint: SERVER_FINGERPRINT,
    request: CANARY_REQUEST,
  });

  assert.deepEqual(snapshot.input, {
    schemaVersion: 1,
    operationId: 'automation-crawler-v2-scheduler-activation',
    databaseName: 'terria_v1_local',
    domainId: 'crawler_v2_scheduler',
    policySetHash: computePolicySetHash(rows),
    policyVersion: 1,
    policyHash: HASH('b'),
    minimumSuccessfulL1Runs: 2,
    canary: { actionId: 'wiki-items-refresh', domainId: 'items' },
    authorizedActionId: 'wiki-items-refresh',
    authorizationRequest: { requestHash: HASH('a') },
  });
  assert.deepEqual(snapshot.policyRows, [
    { domainId: 'audio', policyVersion: 1, policyHash: HASH('a') },
    { domainId: 'crawler_v2_scheduler', policyVersion: 1, policyHash: HASH('b') },
    { domainId: 'shimmer', policyVersion: 1, policyHash: HASH('c') },
  ]);
  assert.deepEqual(snapshot.serverFingerprint, SERVER_FINGERPRINT);
});

test('refuses a missing or mismatched scheduler canary request before publishing input', async () => {
  const { buildCrawlerV2SchedulerActivationSnapshot } = await import(
    './capture-crawler-v2-scheduler-activation-input.mjs'
  );
  for (const request of [
    undefined,
    { ...CANARY_REQUEST, canary: { actionId: 'wiki-items-refresh', domainId: 'npcs' } },
    { ...CANARY_REQUEST, canary: { actionId: 'unknown-action', domainId: 'items' } },
  ]) {
    assert.throws(
      () => buildCrawlerV2SchedulerActivationSnapshot({
        policyRows: policyRows(),
        serverFingerprint: SERVER_FINGERPRINT,
        request,
      }),
      /canary|request/i,
    );
  }
});

test('requires the requested canary action to match the captured canary before freezing input', async () => {
  const { buildCrawlerV2SchedulerActivationSnapshot } = await import(
    './capture-crawler-v2-scheduler-activation-input.mjs'
  );
  for (const request of [
    { ...CANARY_REQUEST, requested: {} },
    { ...CANARY_REQUEST, requested: { canaryActionId: 'wiki-npcs-refresh' } },
  ]) {
    assert.throws(
      () => buildCrawlerV2SchedulerActivationSnapshot({
        policyRows: policyRows(),
        serverFingerprint: SERVER_FINGERPRINT,
        request,
      }),
      /requested.*canary.*action|canary.*scope/i,
    );
  }
});

test('rejects a forged canonical request before opening the read-only MySQL connection', async () => {
  const { captureCrawlerV2SchedulerActivationInputCli } = await import(
    './capture-crawler-v2-scheduler-activation-input.mjs'
  );
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-scheduler-request-cli-'));
  const requestPath = 'reports/authorization/canonical/scheduler.request.json';
  const absoluteRequestPath = path.join(repoRoot, requestPath);
  fs.mkdirSync(path.dirname(absoluteRequestPath), { recursive: true });
  fs.writeFileSync(absoluteRequestPath, `${JSON.stringify(canonicalRequest({ requestHash: HASH('f') }))}\n`, { mode: 0o600 });
  let connectionOpened = false;
  try {
    await assert.rejects(
      captureCrawlerV2SchedulerActivationInputCli({
        argv: cliArgs(requestPath),
        env: cliEnv(repoRoot),
        mysqlModule: {
          async createConnection() {
            connectionOpened = true;
            throw new Error('unexpected MySQL connection');
          },
        },
      }),
      /request hash or content mismatch/i,
    );
    assert.equal(connectionOpened, false);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('captures a private canonical request and freezes its byte and request identities', async () => {
  const { captureCrawlerV2SchedulerActivationInputCli } = await import(
    './capture-crawler-v2-scheduler-activation-input.mjs'
  );
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-scheduler-request-cli-valid-'));
  const requestPath = 'reports/authorization/canonical/scheduler.request.json';
  const absoluteRequestPath = path.join(repoRoot, requestPath);
  const request = canonicalRequest();
  const requestBytes = Buffer.from(`${JSON.stringify(request)}\n`, 'utf8');
  fs.mkdirSync(path.dirname(absoluteRequestPath), { recursive: true });
  fs.writeFileSync(absoluteRequestPath, requestBytes, { mode: 0o600 });
  const queries = [];
  const connection = {
    async query(sql) {
      queries.push(sql);
      if (sql === 'START TRANSACTION READ ONLY') return [];
      if (sql.includes('FROM crawler_automation_policy p')) return [policyRows()];
      if (sql === 'SELECT @@server_uuid AS serverUuid') return [[{ serverUuid: 'local-server-uuid' }]];
      return [];
    },
    async rollback() {},
    async end() {},
  };
  try {
    const result = await captureCrawlerV2SchedulerActivationInputCli({
      argv: cliArgs(requestPath),
      env: cliEnv(repoRoot),
      mysqlModule: { async createConnection() { return connection; } },
    });
    const input = JSON.parse(fs.readFileSync(result.inputPath, 'utf8'));
    assert.equal(fs.statSync(absoluteRequestPath).mode & 0o777, 0o600);
    assert.deepEqual(input.authorizationRequest, {
      path: requestPath,
      fileSha256: `sha256:${createHash('sha256').update(requestBytes).digest('hex')}`,
      requestHash: request.requestHash,
    });
    assert.equal(queries[0], 'START TRANSACTION READ ONLY');
    assert.equal(fs.statSync(result.inputPath).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('rejects a scheduler policy that is not active L1 before artifacts are written', async () => {
  const { buildCrawlerV2SchedulerActivationSnapshot } = await import(
    './capture-crawler-v2-scheduler-activation-input.mjs'
  );

  assert.throws(
    () => buildCrawlerV2SchedulerActivationSnapshot({
      policyRows: policyRows({ schedulerState: 'SHADOW' }),
      serverFingerprint: SERVER_FINGERPRINT,
    }),
    /L1.*ACTIVE/i,
  );
});

test('rejects a missing scheduler policy before artifacts are written', async () => {
  const { buildCrawlerV2SchedulerActivationSnapshot } = await import(
    './capture-crawler-v2-scheduler-activation-input.mjs'
  );

  assert.throws(
    () => buildCrawlerV2SchedulerActivationSnapshot({
      policyRows: policyRows().filter((row) => row.domainId !== 'crawler_v2_scheduler'),
      serverFingerprint: SERVER_FINGERPRINT,
    }),
    /L1.*ACTIVE/i,
  );
});

test('refuses an existing output before writing any part of the private snapshot', async () => {
  const {
    buildCrawlerV2SchedulerActivationSnapshot,
    writeCrawlerV2SchedulerActivationSnapshot,
  } = await import('./capture-crawler-v2-scheduler-activation-input.mjs');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-scheduler-activation-'));
  const canonicalRoot = path.join(repoRoot, 'reports', 'authorization', 'canonical');
  const inputPath = 'reports/authorization/canonical/input.json';
  const policyRowsPath = 'reports/authorization/canonical/policy-rows.json';
  const serverFingerprintPath = 'reports/authorization/canonical/server-fingerprint.json';
  fs.mkdirSync(canonicalRoot, { recursive: true });
  fs.writeFileSync(path.join(canonicalRoot, 'policy-rows.json'), '{"retained":true}\n', { mode: 0o600 });
  try {
    assert.throws(
      () => writeCrawlerV2SchedulerActivationSnapshot({
        repoRoot,
        snapshot: buildCrawlerV2SchedulerActivationSnapshot({
          policyRows: policyRows(),
          serverFingerprint: SERVER_FINGERPRINT,
          request: CANARY_REQUEST,
        }),
        inputPath,
        policyRowsPath,
        serverFingerprintPath,
      }),
      /already exists/i,
    );
    assert.equal(fs.existsSync(path.join(canonicalRoot, 'input.json')), false);
    assert.equal(fs.existsSync(path.join(canonicalRoot, 'server-fingerprint.json')), false);
    assert.equal(fs.readFileSync(path.join(canonicalRoot, 'policy-rows.json'), 'utf8'), '{"retained":true}\n');
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('rejects a canonical output directory symlink that escapes the repository', async () => {
  const {
    buildCrawlerV2SchedulerActivationSnapshot,
    writeCrawlerV2SchedulerActivationSnapshot,
  } = await import('./capture-crawler-v2-scheduler-activation-input.mjs');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-scheduler-activation-symlink-'));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-scheduler-activation-outside-'));
  const reportsRoot = path.join(repoRoot, 'reports', 'authorization');
  fs.mkdirSync(reportsRoot, { recursive: true });
  fs.symlinkSync(outsideRoot, path.join(reportsRoot, 'canonical'), 'dir');
  try {
    assert.throws(
      () => writeCrawlerV2SchedulerActivationSnapshot({
        repoRoot,
        snapshot: buildCrawlerV2SchedulerActivationSnapshot({
          policyRows: policyRows(),
          serverFingerprint: SERVER_FINGERPRINT,
          request: CANARY_REQUEST,
        }),
        inputPath: 'reports/authorization/canonical/input.json',
        policyRowsPath: 'reports/authorization/canonical/policy-rows.json',
        serverFingerprintPath: 'reports/authorization/canonical/server-fingerprint.json',
      }),
      /symbolic-link ancestor/i,
    );
    assert.deepEqual(fs.readdirSync(outsideRoot), []);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  }
});
