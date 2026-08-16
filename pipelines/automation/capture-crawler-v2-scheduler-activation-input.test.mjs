import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { computePolicySetHash } from './policy-set-hash.mjs';

const HASH = (character) => `sha256:${character.repeat(64)}`;
const SERVER_FINGERPRINT = Object.freeze({
  host: '127.0.0.1',
  port: 13306,
  serverUuid: 'local-server-uuid',
  databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
});

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
  });
  assert.deepEqual(snapshot.policyRows, [
    { domainId: 'audio', policyVersion: 1, policyHash: HASH('a') },
    { domainId: 'crawler_v2_scheduler', policyVersion: 1, policyHash: HASH('b') },
    { domainId: 'shimmer', policyVersion: 1, policyHash: HASH('c') },
  ]);
  assert.deepEqual(snapshot.serverFingerprint, SERVER_FINGERPRINT);
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
