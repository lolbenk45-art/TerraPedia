import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runSupplementaryDomainAutomaticOperation } from './run-supplementary-domain-automatic-operation.mjs';
import { buildSupplementaryL1Bundle } from './supplementary-domain-l1-contract.mjs';

const HASH = (letter) => `sha256:${letter.repeat(64)}`;

for (const failure of [false, true]) {
  test(`supplementary automatic runner ${failure ? 'fails without acknowledgement' : 'acknowledges only after apply'}`, async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'supplementary-automatic-runner-'));
    const progressPath = path.join(repoRoot, 'progress.json');
    const bundlePath = path.join(repoRoot, 'bundle.json');
    const events = [];
    const previewBundle = buildSupplementaryL1Bundle({
      operationId: 'automation-bosses-first-l1',
      runId: 'bosses_l1_preview_run',
      domainId: 'bosses',
      generatedAt: '2026-08-15T02:00:00.000Z',
      executionMode: 'ACTIVATION_GATED_AUTO',
      policy: { domainId: 'bosses', level: 'L1', operationalState: 'ACTIVE', policyVersion: 1, policyHash: HASH('a'), policySetHash: HASH('b') },
      baseline: { environmentId: 'local', generations: [
        { databaseRole: 'local', table: 'boss_groups', generation: 1 },
        { databaseRole: 'local', table: 'npcs', generation: 1 },
      ], projectionHash: HASH('c') },
      source: { path: 'reports/authorization/canonical/source.json', sha256: HASH('d') },
      ownedTables: [
        { databaseRole: 'local', table: 'boss_groups' },
        { databaseRole: 'local', table: 'npcs' },
      ],
      importPlan: { records: 1 },
    });
    fs.writeFileSync(bundlePath, `${JSON.stringify(previewBundle)}\n`);
    const activationConnection = {
      query: async () => [[{
        decisionIdentity: 'activation-1', packetHash: HASH('e'), policySetHash: HASH('b'),
        actor: 'admin', reason: 'test', authorizationReference: 'test',
        authorizedAt: '2026-08-15T01:00:00.000Z', expiresAt: '2026-08-16T01:00:00.000Z',
      }]],
      end: async () => {},
    };
    const operationConnection = {
      query: async () => [[]],
      end: async () => {},
    };
    const connections = [activationConnection, operationConnection];

    const operation = runSupplementaryDomainAutomaticOperation({
      argv: [`--domain=bosses`, `--progress-path=${progressPath}`],
      env: databaseEnv(repoRoot),
      now: '2026-08-15T02:00:00.000Z',
      mysqlModule: { createConnection: async () => connections.shift() },
      runPreviewImpl: async () => ({
        bundlePath,
        stableSourceSnapshot: {
          sourceKey: 'wiki.bosses.catalog', locator: 'Bosses', entityFamily: 'bosses',
          sourceKind: 'page_catalog', contentHash: HASH('f'), checkedAt: '2026-08-15T02:00:00.000Z',
        },
      }),
      executeOperationImpl: async () => {
        events.push('apply');
        if (failure) throw new Error('controlled apply failure');
        return { status: 'completed' };
      },
      acknowledgeSourceImpl: () => events.push('acknowledge'),
    });

    if (failure) {
      await assert.rejects(operation, /controlled apply failure/);
      assert.deepEqual(events, ['apply']);
      assert.equal(JSON.parse(fs.readFileSync(progressPath)).status, 'failed');
    } else {
      const result = await operation;
      assert.equal(result.status, 'completed');
      assert.deepEqual(events, ['apply', 'acknowledge']);
      assert.equal(JSON.parse(fs.readFileSync(progressPath)).status, 'completed');
    }
  });
}

test('shimmer automatic runner requests an ephemeral import proposal', async () => {
  let previewArgs = null;
  const activationConnection = {
    query: async () => [[{
      decisionIdentity: 'activation-1', packetHash: HASH('e'), policySetHash: HASH('b'),
      actor: 'admin', reason: 'test', authorizationReference: 'test',
      authorizedAt: '2026-08-15T01:00:00.000Z', expiresAt: '2026-08-16T01:00:00.000Z',
    }]],
    end: async () => {},
  };

  await assert.rejects(
    runSupplementaryDomainAutomaticOperation({
      argv: ['--domain=shimmer'],
      env: databaseEnv(process.cwd()),
      mysqlModule: { createConnection: async () => activationConnection },
      runPreviewImpl: async ({ argv }) => {
        previewArgs = argv;
        throw new Error('stop after preview argument capture');
      },
    }),
    /stop after preview argument capture/,
  );

  assert.equal(previewArgs.includes('--persist-canonical-shimmer-proposal=false'), true);
});

test('supplementary automatic runner isolates preview progress from the V2 attempt progress', async () => {
  const fixture = createRunnerFixture('bosses');
  const progressPath = path.join(fixture.repoRoot, 'attempt', 'progress.json');
  let previewProgressPath = null;
  await runSupplementaryDomainAutomaticOperation({
    argv: ['--domain=bosses', `--progress-path=${progressPath}`],
    env: databaseEnv(fixture.repoRoot),
    now: fixture.now,
    mysqlModule: fixture.mysqlModule([[]]),
    runPreviewImpl: async ({ argv }) => {
      previewProgressPath = argv.find((arg) => arg.startsWith('--progress-path='))?.slice('--progress-path='.length);
      return fixture.runPreviewImpl();
    },
    executeOperationImpl: async () => ({ status: 'completed' }),
    acknowledgeSourceImpl: () => {},
  });
  assert.ok(previewProgressPath);
  assert.notEqual(previewProgressPath, progressPath);
  assert.match(previewProgressPath, /\.preview\.json$/);
  assert.equal(JSON.parse(fs.readFileSync(progressPath, 'utf8')).status, 'completed');
});

test('supplementary automatic runner rejects caller-supplied run ids', async () => {
  let connections = 0;
  await assert.rejects(
    runSupplementaryDomainAutomaticOperation({
      argv: ['--domain=bosses', '--run-id=existing-committed-run'],
      env: databaseEnv(process.cwd()),
      mysqlModule: { createConnection: async () => { connections += 1; throw new Error('must not connect'); } },
    }),
    /--run-id is not allowed for automatic operations/,
  );
  assert.equal(connections, 0);
});

test('local supplementary acceptance does not acknowledge a live source snapshot', async () => {
  const fixture = createRunnerFixture('bosses');
  let acknowledgements = 0;
  const result = await runSupplementaryDomainAutomaticOperation({
    argv: ['--domain=bosses', '--source-mode=local'],
    env: databaseEnv(fixture.repoRoot),
    now: fixture.now,
    mysqlModule: fixture.mysqlModule([[]]),
    runPreviewImpl: fixture.runPreviewImpl,
    executeOperationImpl: async () => ({ status: 'completed' }),
    acknowledgeSourceImpl: () => { acknowledgements += 1; },
  });

  assert.equal(acknowledgements, 0);
  assert.equal(result.sourceAcknowledged, false);
  assert.equal(result.sourceAcknowledgementReason, 'local_source_not_acknowledged');
});

test('committed reconciliation fails closed when evidence belongs to another frozen source', async () => {
  const fixture = createRunnerFixture('bosses');
  let acknowledgements = 0;
  await assert.rejects(
    runSupplementaryDomainAutomaticOperation({
      argv: ['--domain=bosses'],
      env: databaseEnv(fixture.repoRoot),
      now: fixture.now,
      mysqlModule: fixture.mysqlModule([[{
        domainId: 'bosses',
        manifestJson: JSON.stringify({
          automaticSourceFingerprint: HASH('0'),
          source: { path: 'other-source.json', sha256: HASH('0') },
        }),
      }]]),
      runPreviewImpl: fixture.runPreviewImpl,
      executeOperationImpl: async () => { throw new Error('must not import a committed run'); },
      acknowledgeSourceImpl: () => { acknowledgements += 1; },
    }),
    /committed automatic run evidence does not match frozen source/,
  );
  assert.equal(acknowledgements, 0);
});

test('committed reconciliation accepts legacy evidence through the derived fingerprint run id', async () => {
  const fixture = createRunnerFixture('bosses');
  let acknowledgements = 0;
  let imports = 0;
  const result = await runSupplementaryDomainAutomaticOperation({
    argv: ['--domain=bosses'],
    env: databaseEnv(fixture.repoRoot),
    now: fixture.now,
    mysqlModule: fixture.mysqlModule([[{
      domainId: 'bosses',
      manifestJson: JSON.stringify({ source: { path: 'legacy.json', sha256: HASH('0') } }),
    }]]),
    runPreviewImpl: fixture.runPreviewImpl,
    executeOperationImpl: async () => { imports += 1; },
    acknowledgeSourceImpl: () => { acknowledgements += 1; },
  });

  assert.equal(result.reconciledCommittedRun, true);
  assert.equal(imports, 0);
  assert.equal(acknowledgements, 1);
});

test('supplementary database apply preserves V2 identity and advances heartbeat progress', async () => {
  const fixture = createRunnerFixture('bosses');
  const progressPath = path.join(fixture.repoRoot, 'progress.json');
  let initialApplyProgress;
  let heartbeatProgress;
  const env = {
    ...databaseEnv(fixture.repoRoot),
    TERRAPEDIA_CRAWLER_QUEUE_ID: 'queue-1',
    TERRAPEDIA_CRAWLER_ATTEMPT_ID: 'attempt-1',
    TERRAPEDIA_CRAWLER_FENCE_TOKEN: '42',
    TERRAPEDIA_CRAWLER_STATE_STORE_EPOCH: 'epoch-1',
    TERRAPEDIA_CRAWLER_INITIAL_STATE_VERSION: '7',
    TERRAPEDIA_CRAWLER_PROGRESS_SEQUENCE: '10',
  };

  await runSupplementaryDomainAutomaticOperation({
    argv: ['--domain=bosses', `--progress-path=${progressPath}`],
    env,
    now: fixture.now,
    heartbeatIntervalMs: 5,
    mysqlModule: fixture.mysqlModule([[]]),
    runPreviewImpl: fixture.runPreviewImpl,
    executeOperationImpl: async () => {
      initialApplyProgress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
      await new Promise((resolve) => setTimeout(resolve, 25));
      heartbeatProgress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
      return { status: 'completed' };
    },
    acknowledgeSourceImpl: () => {},
  });

  const terminal = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  for (const progress of [initialApplyProgress, heartbeatProgress, terminal]) {
    assert.equal(progress.queueId, 'queue-1');
    assert.equal(progress.attemptId, 'attempt-1');
    assert.equal(progress.fenceToken, 42);
    assert.equal(progress.stateStoreEpoch, 'epoch-1');
  }
  assert.ok(heartbeatProgress.progressSequence > initialApplyProgress.progressSequence);
  assert.ok(terminal.progressSequence > heartbeatProgress.progressSequence);
  assert.equal(terminal.status, 'completed');
});

test('supplementary automatic runner advances V2 heartbeat while preview is still running', async () => {
  const fixture = createRunnerFixture('bosses');
  const progressPath = path.join(fixture.repoRoot, 'progress.json');
  const env = {
    ...databaseEnv(fixture.repoRoot),
    TERRAPEDIA_CRAWLER_QUEUE_ID: 'queue-preview',
    TERRAPEDIA_CRAWLER_ATTEMPT_ID: 'attempt-preview',
    TERRAPEDIA_CRAWLER_FENCE_TOKEN: '43',
    TERRAPEDIA_CRAWLER_STATE_STORE_EPOCH: 'epoch-preview',
    TERRAPEDIA_CRAWLER_INITIAL_STATE_VERSION: '2',
    TERRAPEDIA_CRAWLER_PROGRESS_SEQUENCE: '1',
  };
  let initialPreviewProgress;
  let heartbeatProgress;

  await assert.rejects(
    runSupplementaryDomainAutomaticOperation({
      argv: ['--domain=bosses', `--progress-path=${progressPath}`],
      env,
      now: fixture.now,
      heartbeatIntervalMs: 5,
      mysqlModule: fixture.mysqlModule([]),
      runPreviewImpl: async () => {
        initialPreviewProgress = fs.existsSync(progressPath)
          ? JSON.parse(fs.readFileSync(progressPath, 'utf8'))
          : null;
        await new Promise((resolve) => setTimeout(resolve, 25));
        heartbeatProgress = fs.existsSync(progressPath)
          ? JSON.parse(fs.readFileSync(progressPath, 'utf8'))
          : null;
        throw new Error('controlled preview stop');
      },
    }),
    /controlled preview stop/,
  );

  assert.ok(initialPreviewProgress);
  assert.equal(initialPreviewProgress.status, 'running');
  assert.equal(initialPreviewProgress.phase, 'source-preview');
  assert.equal(initialPreviewProgress.attemptId, 'attempt-preview');
  assert.ok(heartbeatProgress.progressSequence > initialPreviewProgress.progressSequence);
  assert.ok(Date.parse(heartbeatProgress.lastHeartbeatAt) >= Date.parse(initialPreviewProgress.lastHeartbeatAt));
});

function createRunnerFixture(domain) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'supplementary-automatic-fixture-'));
  const bundlePath = path.join(repoRoot, 'bundle.json');
  const now = '2026-08-15T02:00:00.000Z';
  const source = { path: 'reports/authorization/canonical/source.json', sha256: HASH('d') };
  fs.writeFileSync(bundlePath, `${JSON.stringify(buildSupplementaryL1Bundle({
    operationId: `automation-${domain}-first-l1`,
    runId: `${domain}_l1_preview_run`,
    domainId: domain,
    generatedAt: now,
    executionMode: 'ACTIVATION_GATED_AUTO',
    policy: { domainId: domain, level: 'L1', operationalState: 'ACTIVE', policyVersion: 1, policyHash: HASH('a'), policySetHash: HASH('b') },
    baseline: { environmentId: 'local', generations: [
      { databaseRole: 'local', table: 'boss_groups', generation: 1 },
      { databaseRole: 'local', table: 'npcs', generation: 1 },
    ], projectionHash: HASH('c') },
    source,
    ownedTables: [
      { databaseRole: 'local', table: 'boss_groups' },
      { databaseRole: 'local', table: 'npcs' },
    ],
    importPlan: { records: 1 },
  }))}\n`);
  const activation = {
    decisionIdentity: 'activation-1', packetHash: HASH('e'), policySetHash: HASH('b'),
    actor: 'admin', reason: 'test', authorizationReference: 'test',
    authorizedAt: '2026-08-15T01:00:00.000Z', expiresAt: '2026-08-16T01:00:00.000Z',
  };
  return {
    repoRoot,
    now,
    runPreviewImpl: async () => ({
      bundlePath,
      stableSourceSnapshot: {
        sourceKey: 'wiki.bosses.catalog', locator: 'Bosses', entityFamily: domain,
        sourceKind: 'page_catalog', contentHash: HASH('f'), checkedAt: now,
      },
    }),
    mysqlModule(operationRows) {
      const connections = [
        { query: async () => [[activation]], end: async () => {} },
        { query: async () => operationRows, end: async () => {} },
      ];
      return { createConnection: async () => connections.shift() };
    },
  };
}

function databaseEnv(repoRoot) {
  return {
    WORKTREE_ROOT: repoRoot,
    TERRAPEDIA_DB_HOST: '127.0.0.1',
    TERRAPEDIA_DB_PORT: '13306',
    TERRAPEDIA_DB_USERNAME: 'root',
    TERRAPEDIA_DB_PASSWORD: 'root',
    TERRAPEDIA_DB_NAME: 'terria_v1_local',
  };
}
