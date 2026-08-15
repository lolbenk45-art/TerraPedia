import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as baseOperationModule from './run-base-domain-automatic-operation.mjs';

const {
  buildBaseDomainSourceCommand,
  hashFrozenSourcePayload,
  runBaseDomainAutomaticOperation,
  validateItemDryRunDataset,
} = baseOperationModule;
import { createHash } from 'node:crypto';

test('base automatic runner fails closed before source work when activation is absent', async () => {
  let sourceRuns = 0;
  let ended = false;
  const connection = {
    query: async () => [[]],
    end: async () => { ended = true; },
  };
  await assert.rejects(
    runBaseDomainAutomaticOperation({
      argv: ['--domain=npcs'],
      env: databaseEnv(),
      mysqlModule: { createConnection: async () => connection },
      runSourceImpl: () => { sourceRuns += 1; },
    }),
    /no fresh scheduler activation/,
  );
  assert.equal(sourceRuns, 0);
  assert.equal(ended, true);
});

test('frozen source identity uses the established JSON field-order hash', () => {
  const payload = { z: 1, a: { y: 2, b: 3 } };
  const expected = `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
  assert.equal(hashFrozenSourcePayload(payload), expected);
});

test('base automatic source commands defer manifest acknowledgement to the outer operation', () => {
  assert.deepEqual(buildBaseDomainSourceCommand('npcs', '/tmp/npcs-progress.json'), [
    'scripts/data/workflow/run-wiki-sync.mjs',
    '--mode=apply',
    '--force=true',
    '--entity=npcs',
    '--manifest-path=/tmp/npcs-source-manifest.staging.json',
    '--plan-path=/tmp/npcs-wiki-sync-plan.staging.json',
  ]);
  assert.equal(buildBaseDomainSourceCommand('buffs', '/tmp/buffs-progress.json').some((arg) => arg.startsWith('--manifest-path=')), false);
  assert.equal(buildBaseDomainSourceCommand('armor_sets', '/tmp/armor-progress.json').some((arg) => arg.startsWith('--manifest-path=')), false);
});

test('base automatic acknowledgement resolves the scheduler canonical manifest inside the worktree', () => {
  assert.equal(typeof baseOperationModule.resolveBaseDomainManifestPath, 'function');
  assert.equal(
    baseOperationModule.resolveBaseDomainManifestPath({
      manifestPath: 'data/generated/wiki-source-manifest.latest.json',
      repoRoot: '/repo',
    }),
    '/repo/data/generated/wiki-source-manifest.latest.json',
  );
  assert.equal(
    baseOperationModule.resolveBaseDomainManifestPath({ repoRoot: '/repo' }),
    '/repo/data/generated/wiki-source-manifest.latest.json',
  );
});

test('Items dry-run validates record identity instead of trusting the array length', () => {
  assert.deepEqual(validateItemDryRunDataset({ records: [
    { id: 1, internalName: 'IronPickaxe', name: 'Iron Pickaxe', stats: {}, stack: {} },
    { id: 2, internalName: 'DirtBlock', name: 'Dirt Block', stats: {}, stack: {} },
  ] }), { input: 2, validated: 2, mutations: 0 });
  assert.throws(
    () => validateItemDryRunDataset({ records: [
      { id: 1, internalName: 'IronPickaxe', name: 'Iron Pickaxe', stats: {}, stack: {} },
      { id: 1, internalName: '', name: 'Broken', stats: {}, stack: {} },
    ] }),
    /invalid standardized item record at index 1/,
  );
});

test('base automatic runner rejects caller-supplied run ids before connecting', async () => {
  let connections = 0;
  await assert.rejects(
    runBaseDomainAutomaticOperation({
      argv: ['--domain=npcs', '--run-id=existing-committed-run'],
      env: databaseEnv(),
      mysqlModule: { createConnection: async () => { connections += 1; throw new Error('must not connect'); } },
    }),
    /--run-id is not allowed for automatic operations/,
  );
  assert.equal(connections, 0);
});

test('base committed reconciliation rejects evidence for another frozen source', async () => {
  assert.equal(typeof baseOperationModule.isCommittedBaseAutomaticRun, 'function');
  const connection = {
    query: async () => [[{
      domainId: 'npcs',
      manifestJson: JSON.stringify({ source: { path: 'old.json', sha256: 'sha256:old' } }),
    }]],
  };
  await assert.rejects(
    baseOperationModule.isCommittedBaseAutomaticRun(connection, {
      runId: 'npcs_l1_auto_test',
      domainId: 'npcs',
      source: { path: 'new.json', sha256: 'sha256:new' },
    }),
    /committed automatic run evidence does not match frozen source/,
  );
});

test('base committed reconciliation accepts legacy evidence only through its derived fingerprint run id', async () => {
  const sourceFingerprint = 'sha256:legacy-source';
  const digest = createHash('sha256').update(`npcs\n${sourceFingerprint}`).digest('hex').slice(0, 32);
  const connection = {
    query: async () => [[{
      domainId: 'npcs',
      manifestJson: JSON.stringify({ source: { path: 'legacy.json', sha256: 'sha256:legacy' } }),
    }]],
  };
  assert.equal(await baseOperationModule.isCommittedBaseAutomaticRun(connection, {
    runId: `npcs_l1_auto_${digest}`,
    domainId: 'npcs',
    sourceFingerprint,
    source: { path: 'current.json', sha256: 'sha256:current' },
  }), true);
});

test('base frozen input is keyed by the content-derived operation run id', () => {
  assert.equal(typeof baseOperationModule.freezeBaseAutomaticInput, 'function');
  let frozenWithRunId = null;
  const result = baseOperationModule.freezeBaseAutomaticInput({
    domain: 'npcs',
    sourceFingerprint: 'sha256:source',
    repoRoot: '/repo',
    freezeInputImpl: ({ runId }) => {
      frozenWithRunId = runId;
      return { source: { path: 'source.json', sha256: 'sha256:frozen' } };
    },
  });
  const digest = createHash('sha256').update('npcs\nsha256:source').digest('hex').slice(0, 32);
  assert.equal(result.runId, `npcs_l1_auto_${digest}`);
  assert.equal(frozenWithRunId, result.runId);
});

test('base runner progress preserves V2 identity and advances heartbeat sequence', async () => {
  assert.equal(typeof baseOperationModule.createBaseRunnerProgress, 'function');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'base-runner-progress-'));
  const progressPath = path.join(root, 'progress.json');
  const progress = baseOperationModule.createBaseRunnerProgress({
    progressPath,
    domain: 'buffs',
    heartbeatIntervalMs: 5,
    env: {
      TERRAPEDIA_CRAWLER_QUEUE_ID: 'queue-1',
      TERRAPEDIA_CRAWLER_ATTEMPT_ID: 'attempt-1',
      TERRAPEDIA_CRAWLER_FENCE_TOKEN: '42',
      TERRAPEDIA_CRAWLER_STATE_STORE_EPOCH: 'epoch-1',
      TERRAPEDIA_CRAWLER_INITIAL_STATE_VERSION: '7',
      TERRAPEDIA_CRAWLER_PROGRESS_SEQUENCE: '10',
    },
  });
  progress.publish({ status: 'running', phase: 'database-apply', runId: 'run-1' });
  const initial = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  await new Promise((resolve) => setTimeout(resolve, 25));
  const heartbeat = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  progress.publish({ status: 'completed', phase: 'completed', runId: 'run-1' });
  const terminal = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  progress.stop();

  for (const payload of [initial, heartbeat, terminal]) {
    assert.equal(payload.queueId, 'queue-1');
    assert.equal(payload.attemptId, 'attempt-1');
    assert.equal(payload.fenceToken, 42);
    assert.equal(payload.stateStoreEpoch, 'epoch-1');
  }
  assert.ok(heartbeat.progressSequence > initial.progressSequence);
  assert.ok(terminal.progressSequence > heartbeat.progressSequence);
});

test('local base dry-run does not acknowledge the live canonical manifest', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'base-local-no-ack-'));
  const standardizedPath = path.join(repoRoot, 'data', 'standardized', 'items.standardized.json');
  const manifestPath = path.join(repoRoot, 'data', 'generated', 'wiki-source-manifest.latest.json');
  const progressPath = path.join(repoRoot, 'data', 'generated', 'items-progress.json');
  fs.mkdirSync(path.dirname(standardizedPath), { recursive: true });
  fs.mkdirSync(path.dirname(progressPath), { recursive: true });
  fs.writeFileSync(standardizedPath, JSON.stringify({
    entity: 'items',
    records: [{ id: 1, internalName: 'IronPickaxe', name: 'Iron Pickaxe', stats: {}, stack: {} }],
  }));
  const activation = {
    decisionIdentity: 'activation-1', packetHash: 'sha256:packet', policySetHash: 'sha256:policy',
    actor: 'admin', reason: 'test', authorizationReference: 'test',
    authorizedAt: '2026-08-15T01:00:00.000Z', expiresAt: '2026-08-16T01:00:00.000Z',
  };
  const connection = {
    query: async () => [[activation]],
    end: async () => {},
  };

  const result = await runBaseDomainAutomaticOperation({
    argv: [
      '--domain=items',
      '--source-mode=local',
      `--manifest-path=${manifestPath}`,
      `--progress-path=${progressPath}`,
    ],
    env: { ...databaseEnv(), WORKTREE_ROOT: repoRoot },
    mysqlModule: { createConnection: async () => connection },
  });

  assert.equal(fs.existsSync(manifestPath), false);
  assert.equal(result.sourceAcknowledged, false);
  assert.equal(result.sourceAcknowledgementReason, 'local_source_not_acknowledged');
});

function databaseEnv() {
  return {
    TERRAPEDIA_DB_HOST: '127.0.0.1',
    TERRAPEDIA_DB_PORT: '13306',
    TERRAPEDIA_DB_USERNAME: 'root',
    TERRAPEDIA_DB_PASSWORD: 'root',
    TERRAPEDIA_DB_NAME: 'terria_v1_local',
  };
}
