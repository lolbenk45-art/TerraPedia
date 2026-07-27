import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authorizeCanonicalCutoverRequest,
  buildCanonicalAuthorizationRequest,
} from './build-canonical-cutover-authorization.mjs';
import {
  consumeDecisionIdentityFile,
  runExecutionManifestCommand,
  runAuthorizedCanonicalOperation,
  runAuthorizedCanonicalOperationsIndependently,
} from './run-authorized-canonical-operation.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HASH = `sha256:${'a'.repeat(64)}`;

function technicalInput(operationId = 'canonical-image-sync') {
  return {
    operationId,
    targetDatabases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    serverFingerprint: {
      host: '127.0.0.1',
      port: 13306,
      serverUuid: 'server-uuid',
      databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    },
    schemaEntries: [],
    dataEntries: [{ path: 'data/frozen/input.json', bytes: '{}' }],
    policyRows: [{ domainId: 'biomes', policyVersion: 1, policyHash: HASH }],
    executionManifest: {
      schemaVersion: 1,
      command: ['node', 'scripts/data/workflow/run-image-sync.mjs', '--apply=true'],
      outputPaths: ['reports/workflow-image-sync-frozen.json'],
      progressPath: 'data/generated/wiki-sync-progress.latest.json',
    },
    requiredTechnicalFields: [
      'serverFingerprint',
      'schemaBundleSha256',
      'dataBundleSha256',
      'policySetHash',
      'executionManifestHash',
    ],
  };
}

function authorizedJob(operationId, decisionIdentity) {
  const currentTechnicalInput = technicalInput(operationId);
  const request = buildCanonicalAuthorizationRequest({
    ...currentTechnicalInput,
    generatedAt: '2026-07-28T00:00:00.000Z',
    expiresAt: '2026-07-29T00:00:00.000Z',
  });
  const packet = authorizeCanonicalCutoverRequest({
    request,
    requestHash: request.requestHash,
    actor: 'owner',
    reason: `approve ${operationId}`,
    authorizationReference: `decision://${operationId}`,
    decisionIdentity,
    authorizedAt: '2026-07-28T00:10:00.000Z',
    currentTechnicalInput,
  });
  return { packet, currentTechnicalInput };
}

test('runner revalidates current identity and consumes the decision before dispatch', async () => {
  const usedDecisionIdentities = new Set();
  const job = authorizedJob('canonical-image-sync', 'image-sync-1');
  let observedConsumed = false;

  const result = await runAuthorizedCanonicalOperation({
    ...job,
    usedDecisionIdentities,
    now: '2026-07-28T01:00:00.000Z',
    dispatchers: {
      'canonical-image-sync': async () => {
        observedConsumed = usedDecisionIdentities.has('image-sync-1');
        return { applied: true };
      },
    },
  });

  assert.equal(observedConsumed, true);
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.result, { applied: true });
  await assert.rejects(() => runAuthorizedCanonicalOperation({
    ...job,
    usedDecisionIdentities,
    now: '2026-07-28T01:01:00.000Z',
    dispatchers: { 'canonical-image-sync': async () => ({}) },
  }), /decision identity.*already used/i);
});

test('runner rejects technical drift before dispatch', async () => {
  const job = authorizedJob('canonical-image-sync', 'image-sync-2');
  let dispatched = false;

  await assert.rejects(() => runAuthorizedCanonicalOperation({
    ...job,
    currentTechnicalInput: {
      ...job.currentTechnicalInput,
      dataEntries: [{ path: 'data/frozen/input.json', bytes: '{"changed":true}' }],
    },
    usedDecisionIdentities: new Set(),
    now: '2026-07-28T01:00:00.000Z',
    dispatchers: {
      'canonical-image-sync': async () => { dispatched = true; },
    },
  }), /data bundle.*drift/i);
  assert.equal(dispatched, false);
});

test('runner supports durable decision consumption immediately before dispatch', async () => {
  const job = authorizedJob('canonical-image-sync', 'image-sync-durable');
  let consumed = false;
  let dispatchedAfterConsume = false;
  await runAuthorizedCanonicalOperation({
    ...job,
    usedDecisionIdentities: new Set(),
    now: '2026-07-28T01:00:00.000Z',
    consumeDecisionIdentity: async (identity) => {
      assert.equal(identity, 'image-sync-durable');
      consumed = true;
    },
    dispatchers: {
      'canonical-image-sync': async () => {
        dispatchedAfterConsume = consumed;
        return {};
      },
    },
  });
  assert.equal(dispatchedAfterConsume, true);
});

test('independent coordinator keeps a failed lane closed and continues eligible lanes', async () => {
  const first = authorizedJob('canonical-image-sync', 'image-sync-3');
  const second = authorizedJob('canonical-boss-import', 'boss-import-1');
  const usedDecisionIdentities = new Set();

  const results = await runAuthorizedCanonicalOperationsIndependently({
    jobs: [first, second],
    usedDecisionIdentities,
    now: '2026-07-28T01:00:00.000Z',
    dispatchers: {
      'canonical-image-sync': async () => { throw new Error('image sync failed'); },
      'canonical-boss-import': async () => ({ imported: 5 }),
    },
  });

  assert.deepEqual(results.map((entry) => [entry.operationId, entry.status]), [
    ['canonical-image-sync', 'failed'],
    ['canonical-boss-import', 'completed'],
  ]);
  assert.match(results[0].error, /image sync failed/);
  assert.deepEqual(results[1].result, { imported: 5 });
  assert.deepEqual([...usedDecisionIdentities].sort(), ['boss-import-1', 'image-sync-3']);
});

test('durable decision ledger atomically records one-time use and rejects reuse', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-decision-ledger-'));
  const ledgerPath = path.join(dir, 'used-decisions.json');
  consumeDecisionIdentityFile({ ledgerPath, decisionIdentity: 'decision-1' });
  assert.deepEqual(JSON.parse(fs.readFileSync(ledgerPath, 'utf8')), ['decision-1']);
  assert.throws(
    () => consumeDecisionIdentityFile({ ledgerPath, decisionIdentity: 'decision-1' }),
    /already used/i,
  );
});

test('manifest command dispatch uses no shell and rejects credential-shaped arguments', async () => {
  let observed;
  const result = await runExecutionManifestCommand({
    cwd: '/tmp/worktree',
    authorizationPacketPath: '/tmp/private/packet.json',
    manifest: {
      command: ['node', 'scripts/data/fetch/example.mjs', '--limit=10'],
    },
    spawnImpl: async (command, args, options) => {
      observed = { command, args, options };
      return { exitCode: 0 };
    },
  });
  assert.equal(result.exitCode, 0);
  assert.equal(observed.command, 'node');
  assert.deepEqual(observed.args, ['scripts/data/fetch/example.mjs', '--limit=10']);
  assert.equal(observed.options.cwd, '/tmp/worktree');
  assert.equal(observed.options.shell, false);
  assert.equal(observed.options.env.TERRAPEDIA_AUTHORIZED_PACKET_PATH, '/tmp/private/packet.json');
  await assert.rejects(() => runExecutionManifestCommand({
    cwd: '/tmp/worktree',
    manifest: { command: ['node', 'script.mjs', '--password=secret'] },
    spawnImpl: async () => ({ exitCode: 0 }),
  }), /credential-shaped/i);
});
