import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildAutomaticReconciliationInput,
  runSupplementaryDomainAutomaticOperation,
} from './run-supplementary-domain-automatic-operation.mjs';
import { buildAutomaticRunId } from './run-automatic-domain-operation.mjs';
import { buildSupplementaryL1Bundle } from './supplementary-domain-l1-contract.mjs';

const HASH = (letter) => `sha256:${letter.repeat(64)}`;
const BOSS_AUTOMATIC_SCOPES = Object.freeze([
  Object.freeze({ databaseRole: 'local', table: 'boss_groups', fieldGroup: 'all_columns' }),
  Object.freeze({ databaseRole: 'local', table: 'npcs', fieldGroup: 'boss_owned', logicalPredicateHash: HASH('d') }),
]);

function automaticBossPolicy() {
  return {
    domainId: 'bosses',
    level: 'L2',
    operationalState: 'ACTIVE',
    policyVersion: 2,
    policyHash: HASH('a'),
    policySetHash: HASH('b'),
    policyJson: {
      schemaVersion: 1,
      level: 'L2',
      ratioInsertCap: 0.1,
      ratioUpdateCap: 0.1,
      ratioRelationshipDeleteCap: 0.05,
      ratioDisableCap: 0.005,
      absoluteInsertCap: 500,
      absoluteUpdateCap: 500,
      absoluteRelationshipDeleteCap: 200,
      absoluteDisableCap: 20,
      sourceFreshnessMaxAgeMinutes: 60,
      requireSnapshot: true,
      anomalyAction: 'CIRCUIT_OPEN',
      ownedTables: BOSS_AUTOMATIC_SCOPES,
    },
  };
}

for (const failure of [false, true]) {
  test(`supplementary automatic runner ${failure ? 'fails without acknowledgement' : 'acknowledges only after apply'}`, async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'supplementary-automatic-runner-'));
    const progressPath = path.join(repoRoot, 'progress.json');
    let bundlePath = null;
    const events = [];
    let appliedBundle = null;
    let previewBundle = buildSupplementaryL1Bundle({
      operationId: 'automation-bosses-first-l1',
      runId: 'bosses_l1_preview_run',
      domainId: 'bosses',
      generatedAt: '2026-08-15T02:00:00.000Z',
      executionMode: 'ACTIVATION_GATED_AUTO',
      policy: automaticBossPolicy(),
      baseline: { environmentId: 'local', generations: [
        { ...BOSS_AUTOMATIC_SCOPES[0], generation: 1 },
        { ...BOSS_AUTOMATIC_SCOPES[1], generation: 1 },
      ], projectionHash: HASH('c') },
      source: { path: 'reports/authorization/canonical/source.json', sha256: HASH('d') },
      ownedTables: BOSS_AUTOMATIC_SCOPES,
      importPlan: { records: 1 },
    });
    const activationConnection = {
      query: async () => [[{
        decisionIdentity: 'activation-1', packetHash: HASH('e'), policySetHash: HASH('b'),
        actor: 'admin', reason: 'test', authorizationReference: 'test',
        authorizedAt: '2000-01-01T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z',
      }]],
      end: async () => {},
    };
    const operationConnection = {
      query: (() => {
        let calls = 0;
        return async () => {
          calls += 1;
          return calls === 1 ? [[]] : [[{
            decisionIdentity: 'activation-1', packetHash: HASH('e'), policySetHash: HASH('b'),
            actor: 'admin', reason: 'test', authorizationReference: 'test',
            authorizedAt: '2000-01-01T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z',
          }]];
        };
      })(),
      end: async () => {},
    };
    const connections = [activationConnection, operationConnection];

    const operation = runSupplementaryDomainAutomaticOperation({
      argv: [`--domain=bosses`, `--progress-path=${progressPath}`],
      env: databaseEnv(repoRoot),
      now: '2026-08-15T02:00:00.000Z',
      mysqlModule: { createConnection: async () => connections.shift() },
      runPreviewImpl: async ({ argv }) => {
        const runIdArg = argv.find((arg) => arg.startsWith('--run-id='));
        assert.ok(runIdArg, 'automatic runner must provide a preview run id');
        const previewRunId = runIdArg.slice('--run-id='.length);
        const artifactRoot = path.resolve(
          repoRoot,
          argv.find((arg) => arg.startsWith('--artifact-root=')).slice('--artifact-root='.length),
        );
        fs.mkdirSync(artifactRoot, { recursive: true, mode: 0o700 });
        const sourcePath = path.join(artifactRoot, 'source.json');
        const sourceBytes = Buffer.from('{"records":[]}\n', 'utf8');
        fs.writeFileSync(sourcePath, sourceBytes, { mode: 0o600, flag: 'wx' });
        previewBundle = buildSupplementaryL1Bundle({
          operationId: previewBundle.operationId,
          runId: previewRunId,
          domainId: previewBundle.domainId,
          generatedAt: previewBundle.generatedAt,
          executionMode: previewBundle.executionMode,
          policy: previewBundle.policy,
          baseline: previewBundle.baseline,
          source: {
            ...previewBundle.source,
            path: path.relative(repoRoot, sourcePath).replaceAll('\\', '/'),
            sha256: `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`,
          },
          ownedTables: previewBundle.ownedTables,
          importPlan: previewBundle.importPlan,
          reconciliationInput: previewBundle.reconciliationInput,
        });
        bundlePath = path.join(artifactRoot, 'bundle.json');
        fs.writeFileSync(bundlePath, `${JSON.stringify(previewBundle)}\n`, { mode: 0o600, flag: 'wx' });
        return {
          bundlePath,
          stableSourceSnapshot: {
            sourceKey: 'wiki.bosses.catalog', locator: 'Bosses', entityFamily: 'bosses',
            sourceKind: 'page_catalog', contentHash: HASH('f'), checkedAt: '2026-08-15T02:00:00.000Z',
          },
        };
      },
      executeOperationImpl: async ({ bundle }) => {
        appliedBundle = bundle;
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
    assert.equal(appliedBundle.importPlan.sourceCheckedAt, '2026-08-15T02:00:00.000Z');
  });
}

test('supplementary automatic runner carries a scheduler source dispatch identity into its bundle', async (t) => {
  const fixture = createRunnerFixture('bosses');
  t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
  const sourceDispatchIdentity = {
    sourceFingerprint: HASH('f'),
    sourceRunIdentity: fixture.now,
    sourceContentIdentity: fixture.sourceContentIdentity,
  };
  let capturedBundle = null;

  await runSupplementaryDomainAutomaticOperation({
    argv: ['--domain=bosses'],
    env: {
      ...databaseEnv(fixture.repoRoot),
      TERRAPEDIA_CRAWLER_REQUESTED_BY: 'v2-automation',
      TERRAPEDIA_CRAWLER_SOURCE_FINGERPRINT: sourceDispatchIdentity.sourceFingerprint,
      TERRAPEDIA_CRAWLER_SOURCE_RUN_IDENTITY: sourceDispatchIdentity.sourceRunIdentity,
      TERRAPEDIA_CRAWLER_SOURCE_CONTENT_IDENTITY: sourceDispatchIdentity.sourceContentIdentity,
      TERRAPEDIA_CRAWLER_SOURCE_STATE_PATH: fixture.sourceStatePath,
    },
    now: fixture.now,
    mysqlModule: fixture.mysqlModule([[]]),
    runPreviewImpl: fixture.runPreviewImpl,
    executeOperationImpl: async ({ bundle }) => {
      capturedBundle = bundle;
      return { status: 'completed' };
    },
    acknowledgeSourceImpl: () => {},
  });

  assert.deepEqual(capturedBundle.sourceDispatchIdentity, sourceDispatchIdentity);
});

test('supplementary automatic runner rejects a drifted scheduler source fingerprint before apply', async (t) => {
  const fixture = createRunnerFixture('bosses');
  t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
  let executeCalls = 0;
  let acknowledgements = 0;

  await assert.rejects(
    runSupplementaryDomainAutomaticOperation({
      argv: ['--domain=bosses'],
      env: {
        ...databaseEnv(fixture.repoRoot),
        TERRAPEDIA_CRAWLER_REQUESTED_BY: 'v2-automation',
        TERRAPEDIA_CRAWLER_SOURCE_FINGERPRINT: HASH('0'),
        TERRAPEDIA_CRAWLER_SOURCE_RUN_IDENTITY: fixture.now,
        TERRAPEDIA_CRAWLER_SOURCE_CONTENT_IDENTITY: fixture.sourceContentIdentity,
        TERRAPEDIA_CRAWLER_SOURCE_STATE_PATH: fixture.sourceStatePath,
      },
      now: fixture.now,
      mysqlModule: fixture.mysqlModule([[]]),
      runPreviewImpl: fixture.runPreviewImpl,
      executeOperationImpl: async () => {
        executeCalls += 1;
        return { status: 'completed' };
      },
      acknowledgeSourceImpl: async () => { acknowledgements += 1; },
    }),
    /frozen source fingerprint.*scheduler dispatch identity/i,
  );

  assert.equal(executeCalls, 0);
  assert.equal(acknowledgements, 0);
});

test('supplementary automatic runner rejects incomplete scheduler source identity before activation lookup', async () => {
  let connections = 0;
  let previews = 0;

  await assert.rejects(
    runSupplementaryDomainAutomaticOperation({
      argv: ['--domain=bosses'],
      env: {
        ...databaseEnv(process.cwd()),
        TERRAPEDIA_CRAWLER_REQUESTED_BY: 'v2-automation',
        TERRAPEDIA_CRAWLER_SOURCE_FINGERPRINT: HASH('f'),
      },
      mysqlModule: {
        createConnection: async () => {
          connections += 1;
          throw new Error('activation lookup must not run');
        },
      },
      runPreviewImpl: async () => {
        previews += 1;
        throw new Error('preview must not run');
      },
    }),
    /scheduler source dispatch identity is incomplete/i,
  );

  assert.equal(connections, 0);
  assert.equal(previews, 0);
});

test('supplementary automatic runner publishes source-identity failure when its initial monitor read rejects', async (t) => {
  const fixture = createRunnerFixture('bosses');
  t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
  const progressPath = path.join(fixture.repoRoot, 'initial-source-identity-failure.progress.json');
  let connections = 0;
  let previews = 0;

  await assert.rejects(
    runSupplementaryDomainAutomaticOperation({
      argv: ['--domain=bosses', `--progress-path=${progressPath}`],
      env: {
        ...databaseEnv(fixture.repoRoot),
        TERRAPEDIA_CRAWLER_REQUESTED_BY: 'v2-automation',
        TERRAPEDIA_CRAWLER_SOURCE_FINGERPRINT: HASH('f'),
        TERRAPEDIA_CRAWLER_SOURCE_RUN_IDENTITY: fixture.now,
        TERRAPEDIA_CRAWLER_SOURCE_CONTENT_IDENTITY: fixture.sourceContentIdentity,
        TERRAPEDIA_CRAWLER_SOURCE_STATE_PATH: fixture.sourceStatePath,
      },
      now: fixture.now,
      readSourceMonitorStateImpl: () => { throw new Error('controlled initial monitor failure'); },
      mysqlModule: {
        createConnection: async () => {
          connections += 1;
          throw new Error('activation lookup must not run');
        },
      },
      runPreviewImpl: async () => {
        previews += 1;
        throw new Error('preview must not run');
      },
    }),
    /controlled initial monitor failure/,
  );

  assert.equal(fs.existsSync(progressPath), true);
  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  assert.equal(progress.status, 'failed');
  assert.equal(progress.phase, 'source-identity');
  assert.match(progress.message, /controlled initial monitor failure/);
  assert.equal(connections, 0);
  assert.equal(previews, 0);
});

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

test('supplementary automatic runner gives preview and reconciliation artifacts fresh run identities', async () => {
  const fixture = createRunnerFixture('bosses');
  let previewArgs = [];
  let previewRepoRoot = null;
  let appliedBundle = null;

  await runSupplementaryDomainAutomaticOperation({
    argv: ['--domain=bosses'],
    env: databaseEnv(fixture.repoRoot),
    now: fixture.now,
    mysqlModule: fixture.mysqlModule([[]]),
    runPreviewImpl: async ({ argv, repoRoot }) => {
      previewArgs = argv;
      previewRepoRoot = repoRoot;
      return fixture.runPreviewImpl({ argv });
    },
    executeOperationImpl: async ({ bundle }) => {
      appliedBundle = bundle;
      return { status: 'completed' };
    },
    acknowledgeSourceImpl: () => {},
  });

  assert.ok(previewArgs.some((arg) => arg.startsWith('--run-id=bosses_l1_auto_preview_')));
  assert.ok(previewArgs.some((arg) => arg.startsWith('--artifact-root=')));
  assert.equal(previewRepoRoot, fixture.repoRoot);
  assert.match(appliedBundle.reconciliationInput.sourceCoveragePath, new RegExp(`^reports/runtime/l1-reconciliation/bosses/${appliedBundle.runId}/source-coverage\\.json$`));
});

test('supplementary automatic runner revalidates authorization with a fresh execution time after preview', async (t) => {
  const fixture = createRunnerFixture('bosses');
  t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
  const startedAt = fixture.now;
  const freshExecutionTime = '2026-08-15T02:01:00.000Z';
  const activation = {
    decisionIdentity: 'activation-delayed-supplementary',
    packetHash: HASH('e'),
    policySetHash: HASH('b'),
    actor: 'admin',
    reason: 'delayed test',
    authorizationReference: 'test',
    authorizedAt: '2026-08-15T01:00:00.000Z',
    expiresAt: freshExecutionTime,
  };
  let activationReloads = 0;
  const connections = [
    { query: async () => [[activation]], end: async () => {} },
    {
      query: async (sql) => {
        if (/crawler_automation_run/.test(sql)) return [[]];
        activationReloads += 1;
        return [[activation]];
      },
      end: async () => {},
    },
  ];
  let executeCalls = 0;

  await assert.rejects(
    runSupplementaryDomainAutomaticOperation({
      argv: ['--domain=bosses'],
      env: databaseEnv(fixture.repoRoot),
      now: startedAt,
      nowProvider: () => freshExecutionTime,
      mysqlModule: { createConnection: async () => connections.shift() },
      runPreviewImpl: fixture.runPreviewImpl,
      executeOperationImpl: async ({ now }) => {
        executeCalls += 1;
        return { status: 'completed' };
      },
      acknowledgeSourceImpl: () => {},
    }),
    /scheduler activation .*valid|expired|revoked/i,
  );
  assert.equal(executeCalls, 0);
  assert.equal(activationReloads, 1);
});

test('supplementary automatic runner refuses live acknowledgement after activation is revoked', async (t) => {
  const fixture = createRunnerFixture('bosses');
  t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
  const activation = {
    decisionIdentity: 'activation-before-acknowledgement',
    packetHash: HASH('e'),
    policySetHash: HASH('b'),
    actor: 'admin',
    reason: 'test',
    authorizationReference: 'test',
    authorizedAt: '2000-01-01T00:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
  };
  let operationQueries = 0;
  const connections = [
    { query: async () => [[activation]], end: async () => {} },
    {
      query: async () => {
        operationQueries += 1;
        if (operationQueries === 1) return [[]];
        if (operationQueries === 2) return [[activation]];
        return [[]];
      },
      end: async () => {},
    },
  ];
  let executeCalls = 0;
  let acknowledgements = 0;

  await assert.rejects(
    runSupplementaryDomainAutomaticOperation({
      argv: ['--domain=bosses'],
      env: databaseEnv(fixture.repoRoot),
      now: fixture.now,
      mysqlModule: { createConnection: async () => connections.shift() },
      runPreviewImpl: fixture.runPreviewImpl,
      executeOperationImpl: async () => {
        executeCalls += 1;
        return { status: 'completed' };
      },
      acknowledgeSourceImpl: async () => { acknowledgements += 1; },
    }),
    /activation.*expired|revoked|changed/i,
  );

  assert.equal(executeCalls, 1);
  assert.equal(acknowledgements, 0);
  assert.equal(operationQueries, 3);
});

test('supplementary automatic runner refuses live acknowledgement when the scheduler source state drifts after apply', async (t) => {
  const fixture = createRunnerFixture('bosses');
  t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
  const sourceDispatchIdentity = {
    sourceFingerprint: HASH('f'),
    sourceRunIdentity: fixture.now,
    sourceContentIdentity: fixture.sourceContentIdentity,
  };
  let acknowledgements = 0;

  await assert.rejects(
    runSupplementaryDomainAutomaticOperation({
      argv: ['--domain=bosses'],
      env: {
        ...databaseEnv(fixture.repoRoot),
        TERRAPEDIA_CRAWLER_REQUESTED_BY: 'v2-automation',
        TERRAPEDIA_CRAWLER_SOURCE_FINGERPRINT: sourceDispatchIdentity.sourceFingerprint,
        TERRAPEDIA_CRAWLER_SOURCE_RUN_IDENTITY: sourceDispatchIdentity.sourceRunIdentity,
        TERRAPEDIA_CRAWLER_SOURCE_CONTENT_IDENTITY: sourceDispatchIdentity.sourceContentIdentity,
        TERRAPEDIA_CRAWLER_SOURCE_STATE_PATH: fixture.sourceStatePath,
      },
      now: fixture.now,
      mysqlModule: fixture.mysqlModule([[]]),
      runPreviewImpl: fixture.runPreviewImpl,
      executeOperationImpl: async () => {
        const drifted = JSON.parse(fs.readFileSync(fixture.sourceStatePath, 'utf8'));
        drifted.checkedAt = '2026-08-15T02:01:00.000Z';
        drifted.sources[0].checkedAt = drifted.checkedAt;
        fs.writeFileSync(fixture.sourceStatePath, JSON.stringify(drifted));
        return { status: 'completed' };
      },
      acknowledgeSourceImpl: async () => { acknowledgements += 1; },
    }),
    /source monitor checkedAt does not match|dispatch identity/i,
  );

  assert.equal(acknowledgements, 0);
});

test('supplementary automatic runner rejects acknowledgement when activation changes during source verification', async (t) => {
  const fixture = createRunnerFixture('bosses');
  t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
  const activation = {
    decisionIdentity: 'activation-before-acknowledgement',
    packetHash: HASH('e'),
    policySetHash: HASH('b'),
    actor: 'admin',
    reason: 'test',
    authorizationReference: 'test',
    authorizedAt: '2000-01-01T00:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
  };
  const replacement = { ...activation, decisionIdentity: 'activation-replaced-during-source-check' };
  const sourceDispatchIdentity = {
    sourceFingerprint: HASH('f'),
    sourceRunIdentity: fixture.now,
    sourceContentIdentity: fixture.sourceContentIdentity,
  };
  let activationChanged = false;
  let sourceChecks = 0;
  let operationQueries = 0;
  let acknowledgements = 0;
  const connections = [
    { query: async () => [[activation]], end: async () => {} },
    {
      query: async () => {
        operationQueries += 1;
        if (operationQueries === 1) return [[]];
        return [[activationChanged ? replacement : activation]];
      },
      end: async () => {},
    },
  ];

  await assert.rejects(
    runSupplementaryDomainAutomaticOperation({
      argv: ['--domain=bosses'],
      env: {
        ...databaseEnv(fixture.repoRoot),
        TERRAPEDIA_CRAWLER_REQUESTED_BY: 'v2-automation',
        TERRAPEDIA_CRAWLER_SOURCE_FINGERPRINT: sourceDispatchIdentity.sourceFingerprint,
        TERRAPEDIA_CRAWLER_SOURCE_RUN_IDENTITY: sourceDispatchIdentity.sourceRunIdentity,
        TERRAPEDIA_CRAWLER_SOURCE_CONTENT_IDENTITY: sourceDispatchIdentity.sourceContentIdentity,
        TERRAPEDIA_CRAWLER_SOURCE_STATE_PATH: fixture.sourceStatePath,
      },
      now: fixture.now,
      mysqlModule: { createConnection: async () => connections.shift() },
      runPreviewImpl: fixture.runPreviewImpl,
      readSourceMonitorStateImpl: () => {
        sourceChecks += 1;
        if (sourceChecks === 2) activationChanged = true;
        return {
          runIdentity: fixture.now,
          contentIdentity: fixture.sourceContentIdentity,
          sourceKey: 'wiki.bosses.catalog',
          source: { currentValue: HASH('f') },
        };
      },
      executeOperationImpl: async () => ({ status: 'completed' }),
      acknowledgeSourceImpl: async () => { acknowledgements += 1; },
    }),
    /activation.*changed/i,
  );

  assert.equal(sourceChecks, 2);
  assert.equal(acknowledgements, 0);
});

test('supplementary automatic runner uses the later stable source probe time for execution', async (t) => {
  const fixture = createRunnerFixture('bosses');
  t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
  const laterProbeTime = '2026-08-15T02:03:00.000Z';
  let capturedExecutionTime = null;

  await runSupplementaryDomainAutomaticOperation({
    argv: ['--domain=bosses'],
    env: databaseEnv(fixture.repoRoot),
    now: fixture.now,
    nowProvider: () => '2026-08-15T02:01:00.000Z',
    mysqlModule: fixture.mysqlModule([[]]),
    runPreviewImpl: async (input) => {
      const preview = await fixture.runPreviewImpl(input);
      return {
        ...preview,
        stableSourceSnapshot: {
          ...preview.stableSourceSnapshot,
          checkedAt: laterProbeTime,
        },
      };
    },
    executeOperationImpl: async ({ now: executionTime }) => {
      capturedExecutionTime = executionTime;
      return { status: 'completed' };
    },
    acknowledgeSourceImpl: () => {},
  });

  assert.equal(capturedExecutionTime, laterProbeTime);
});

test('supplementary automatic runner rejects a preview bundle whose run identity is stale', async (t) => {
  const fixture = createRunnerFixture('bosses');
  t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
  let executed = 0;

  await assert.rejects(
    runSupplementaryDomainAutomaticOperation({
      argv: ['--domain=bosses'],
      env: databaseEnv(fixture.repoRoot),
      now: fixture.now,
      mysqlModule: fixture.mysqlModule([[]]),
      runPreviewImpl: async (input) => {
        const preview = await fixture.runPreviewImpl(input);
        const staleBundle = buildSupplementaryL1Bundle({
          ...fixture.previewBundle,
          runId: 'bosses_l1_stale_preview',
        });
        fs.writeFileSync(preview.bundlePath, `${JSON.stringify(staleBundle)}\n`, { mode: 0o600 });
        fixture.previewBundle = staleBundle;
        return preview;
      },
      executeOperationImpl: async () => { executed += 1; return { status: 'completed' }; },
      acknowledgeSourceImpl: () => {},
    }),
    /run.?id|identity|preview/i,
  );
  assert.equal(executed, 0);
});

for (const [label, mutate] of [
  ['bundle hash', (bundle) => ({ ...bundle, bundleHash: HASH('0') })],
  ['policy content', (bundle) => ({
    ...bundle,
    policy: { ...bundle.policy, policyJson: { ...bundle.policy.policyJson, tampered: true } },
  })],
  ['import plan', (bundle) => ({
    ...bundle,
    importPlan: { ...bundle.importPlan, tampered: true },
  })],
]) {
  test(`supplementary automatic runner rejects a tampered preview ${label}`, async (t) => {
    const fixture = createRunnerFixture('bosses');
    t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
    let executed = 0;

    await assert.rejects(
      runSupplementaryDomainAutomaticOperation({
        argv: ['--domain=bosses'],
        env: databaseEnv(fixture.repoRoot),
        now: fixture.now,
        mysqlModule: fixture.mysqlModule([[]]),
        runPreviewImpl: async (input) => {
          const preview = await fixture.runPreviewImpl(input);
          const tampered = mutate(JSON.parse(fs.readFileSync(preview.bundlePath, 'utf8')));
          fs.writeFileSync(preview.bundlePath, `${JSON.stringify(tampered)}\n`, { mode: 0o600 });
          return preview;
        },
        executeOperationImpl: async () => { executed += 1; return { status: 'completed' }; },
        acknowledgeSourceImpl: () => {},
      }),
      /bundle|hash|identity|content|policy|tamper/i,
    );
    assert.equal(executed, 0);
  });
}

test('supplementary automatic runner rejects a preview bundle outside its canonical repository artifact root', async (t) => {
  const fixture = createRunnerFixture('bosses');
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'supplementary-automatic-outside-'));
  t.after(() => {
    fs.rmSync(fixture.repoRoot, { recursive: true, force: true });
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  });
  const outsideBundlePath = path.join(outsideRoot, 'bundle.json');
  fs.writeFileSync(outsideBundlePath, `${JSON.stringify(fixture.previewBundle)}\n`, { mode: 0o600 });
  fs.chmodSync(outsideBundlePath, 0o600);
  let executed = 0;

  await assert.rejects(
    runSupplementaryDomainAutomaticOperation({
      argv: ['--domain=bosses'],
      env: databaseEnv(fixture.repoRoot),
      now: fixture.now,
      mysqlModule: fixture.mysqlModule([[]]),
      runPreviewImpl: async () => ({
        bundlePath: outsideBundlePath,
        stableSourceSnapshot: {
          sourceKey: 'wiki.bosses.catalog', locator: 'Bosses', entityFamily: 'bosses',
          sourceKind: 'page_catalog', contentHash: HASH('f'), checkedAt: fixture.now,
        },
      }),
      executeOperationImpl: async () => { executed += 1; return { status: 'completed' }; },
      acknowledgeSourceImpl: () => {},
    }),
    /canonical|artifact|outside|repository|preview/i,
  );
  assert.equal(executed, 0);
  assert.equal(fs.existsSync(path.join(outsideRoot, 'operation.bundle.json')), false);
});

test('supplementary automatic runner rejects a preview bundle with a symlinked artifact ancestor', async (t) => {
  const fixture = createRunnerFixture('bosses');
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'supplementary-automatic-symlink-outside-'));
  const automaticRoot = path.join(fixture.repoRoot, 'reports', 'authorization', 'canonical', 'automatic');
  t.after(() => {
    fs.rmSync(fixture.repoRoot, { recursive: true, force: true });
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  });
  fs.mkdirSync(path.dirname(automaticRoot), { recursive: true });
  fs.symlinkSync(outsideRoot, automaticRoot, 'dir');
  const outsideBundlePath = path.join(outsideRoot, 'bundle.json');
  fs.writeFileSync(outsideBundlePath, `${JSON.stringify(fixture.previewBundle)}\n`, { mode: 0o600 });
  fs.chmodSync(outsideBundlePath, 0o600);

  await assert.rejects(
    runSupplementaryDomainAutomaticOperation({
      argv: ['--domain=bosses'],
      env: databaseEnv(fixture.repoRoot),
      now: fixture.now,
      mysqlModule: fixture.mysqlModule([[]]),
      runPreviewImpl: async ({ argv }) => ({
        bundlePath: path.join(
          fixture.repoRoot,
          argv.find((arg) => arg.startsWith('--artifact-root=')).slice('--artifact-root='.length),
          'bundle.json',
        ),
        stableSourceSnapshot: {
          sourceKey: 'wiki.bosses.catalog', locator: 'Bosses', entityFamily: 'bosses',
          sourceKind: 'page_catalog', contentHash: HASH('f'), checkedAt: fixture.now,
        },
      }),
      executeOperationImpl: async () => { throw new Error('must not apply'); },
      acknowledgeSourceImpl: () => {},
    }),
    /canonical|symbolic|symlink|ancestor|artifact|identity/i,
  );
  assert.equal(fs.existsSync(path.join(outsideRoot, 'operation.bundle.json')), false);
});

test('supplementary automatic runner rejects a non-private preview file before database apply', async (t) => {
  const fixture = createRunnerFixture('bosses');
  t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
  let previewBundlePath = null;
  await assert.rejects(
    runSupplementaryDomainAutomaticOperation({
      argv: ['--domain=bosses'],
      env: databaseEnv(fixture.repoRoot),
      now: fixture.now,
      mysqlModule: fixture.mysqlModule([[]]),
      runPreviewImpl: async ({ argv }) => {
        const artifactRoot = path.resolve(
          fixture.repoRoot,
          argv.find((arg) => arg.startsWith('--artifact-root=')).slice('--artifact-root='.length),
        );
        fs.mkdirSync(artifactRoot, { recursive: true, mode: 0o700 });
        previewBundlePath = path.join(artifactRoot, 'bundle.json');
        fs.writeFileSync(previewBundlePath, `${JSON.stringify(fixture.previewBundle)}\n`, { mode: 0o600 });
        fs.chmodSync(previewBundlePath, 0o644);
        return {
          bundlePath: previewBundlePath,
          stableSourceSnapshot: {
            sourceKey: 'wiki.bosses.catalog', locator: 'Bosses', entityFamily: 'bosses',
            sourceKind: 'page_catalog', contentHash: HASH('f'), checkedAt: fixture.now,
          },
        };
      },
      executeOperationImpl: async () => { throw new Error('must not apply'); },
      acknowledgeSourceImpl: () => {},
    }),
    /0600|private|ordinary|preview|artifact/i,
  );
  assert.equal(fs.statSync(previewBundlePath).mode & 0o777, 0o644);
});

test('supplementary automatic runner rejects a preview bundle that points outside its frozen source artifact', async (t) => {
  const fixture = createRunnerFixture('bosses');
  t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
  let executed = 0;

  await assert.rejects(
    runSupplementaryDomainAutomaticOperation({
      argv: ['--domain=bosses'],
      env: databaseEnv(fixture.repoRoot),
      now: fixture.now,
      mysqlModule: fixture.mysqlModule([[]]),
      runPreviewImpl: async ({ argv }) => {
        const artifactRoot = path.resolve(
          fixture.repoRoot,
          argv.find((arg) => arg.startsWith('--artifact-root=')).slice('--artifact-root='.length),
        );
        fs.mkdirSync(artifactRoot, { recursive: true, mode: 0o700 });
        const outsideSourcePath = path.join(fixture.repoRoot, 'reports', 'authorization', 'canonical', 'legacy-source.json');
        fs.mkdirSync(path.dirname(outsideSourcePath), { recursive: true, mode: 0o700 });
        fs.writeFileSync(outsideSourcePath, '{"records":[]}\n', { mode: 0o600 });
        const bundlePath = path.join(artifactRoot, 'bundle.json');
        fs.writeFileSync(bundlePath, `${JSON.stringify({
          ...fixture.previewBundle,
          source: {
            ...fixture.previewBundle.source,
            path: 'reports/authorization/canonical/legacy-source.json',
          },
        })}\n`, { mode: 0o600 });
        return {
          bundlePath,
          stableSourceSnapshot: {
            sourceKey: 'wiki.bosses.catalog', locator: 'Bosses', entityFamily: 'bosses',
            sourceKind: 'page_catalog', contentHash: HASH('f'), checkedAt: fixture.now,
          },
        };
      },
      executeOperationImpl: async () => { executed += 1; return { status: 'completed' }; },
      acknowledgeSourceImpl: () => {},
    }),
    /source|canonical|preview|artifact/i,
  );
  assert.equal(executed, 0);
});

test('supplementary automatic runner rejects an unsafe writable automatic-artifact ancestor', async (t) => {
  const fixture = createRunnerFixture('bosses');
  t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
  let executed = 0;

  await assert.rejects(
    runSupplementaryDomainAutomaticOperation({
      argv: ['--domain=bosses'],
      env: databaseEnv(fixture.repoRoot),
      now: fixture.now,
      mysqlModule: fixture.mysqlModule([[]]),
      runPreviewImpl: async ({ argv }) => {
        const artifactRoot = path.resolve(
          fixture.repoRoot,
          argv.find((arg) => arg.startsWith('--artifact-root=')).slice('--artifact-root='.length),
        );
        fs.mkdirSync(artifactRoot, { recursive: true, mode: 0o700 });
        const automaticRoot = path.join(fixture.repoRoot, 'reports', 'authorization', 'canonical', 'automatic');
        fs.chmodSync(automaticRoot, 0o770);
        const bundlePath = path.join(artifactRoot, 'bundle.json');
        fs.writeFileSync(bundlePath, `${JSON.stringify(fixture.previewBundle)}\n`, { mode: 0o600 });
        return {
          bundlePath,
          stableSourceSnapshot: {
            sourceKey: 'wiki.bosses.catalog', locator: 'Bosses', entityFamily: 'bosses',
            sourceKind: 'page_catalog', contentHash: HASH('f'), checkedAt: fixture.now,
          },
        };
      },
      executeOperationImpl: async () => { executed += 1; return { status: 'completed' }; },
      acknowledgeSourceImpl: () => {},
    }),
    /owner|writable|trust|artifact|directory/i,
  );
  assert.equal(executed, 0);
});

test('supplementary automatic runner retains its published preview bundle and publishes a distinct operation bundle', async (t) => {
  const fixture = createRunnerFixture('bosses');
  t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
  let appliedBundlePath = null;
  let acknowledgementOutputPath = null;

  const result = await runSupplementaryDomainAutomaticOperation({
    argv: ['--domain=bosses'],
    env: databaseEnv(fixture.repoRoot),
    now: fixture.now,
    mysqlModule: fixture.mysqlModule([[]]),
    runPreviewImpl: fixture.runPreviewImpl,
    executeOperationImpl: async ({ adapter }) => {
      appliedBundlePath = adapter.bundlePath;
      return { status: 'completed' };
    },
    acknowledgeSourceImpl: ({ outputPath }) => { acknowledgementOutputPath = outputPath; },
  });

  const previewBytes = fs.readFileSync(fixture.bundlePath, 'utf8');
  const previewBundle = JSON.parse(previewBytes);
  const operationArtifactRoot = path.join(
    fixture.repoRoot,
    'reports',
    'authorization',
    'canonical',
    'automatic',
    'bosses',
    buildAutomaticRunId('bosses', HASH('f')),
  );
  const operationBundlePath = path.join(operationArtifactRoot, 'operation.bundle.json');
  const operationSourcePath = path.join(operationArtifactRoot, 'source.json');
  assert.notEqual(appliedBundlePath, fixture.bundlePath);
  assert.equal(appliedBundlePath, operationBundlePath);
  assert.equal(acknowledgementOutputPath, operationBundlePath);
  assert.equal(result.previewBundlePath, fixture.bundlePath);
  assert.equal(result.operationBundlePath, operationBundlePath);
  assert.equal(fs.readFileSync(fixture.bundlePath, 'utf8'), previewBytes);
  assert.equal(
    fs.readFileSync(operationSourcePath, 'utf8'),
    fs.readFileSync(path.join(path.dirname(fixture.bundlePath), 'source.json'), 'utf8'),
  );
  assert.equal(fs.statSync(operationBundlePath).mode & 0o777, 0o600);
  const operationBundle = JSON.parse(fs.readFileSync(operationBundlePath, 'utf8'));
  assert.notEqual(operationBundle.runId, previewBundle.runId);
  assert.equal(
    operationBundle.source.path,
    path.relative(fixture.repoRoot, operationSourcePath).replaceAll('\\', '/'),
  );
  assert.deepEqual(operationBundle.importPlan.automaticPreviewSource, previewBundle.source);
});

test('supplementary automatic runner rejects an operation bundle replaced after hard-link publication', async (t) => {
  const fixture = createRunnerFixture('bosses');
  t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
  const originalLinkSync = fs.linkSync;
  let replaced = false;
  fs.linkSync = function patchedLinkSync(from, to, ...args) {
    const result = originalLinkSync.call(this, from, to, ...args);
    if (!replaced && typeof to === 'string' && to.endsWith(`${path.sep}operation.bundle.json`)) {
      replaced = true;
      fs.unlinkSync(to);
      fs.writeFileSync(to, 'replacement operation bundle\n', { mode: 0o600, flag: 'wx' });
    }
    return result;
  };
  let executed = 0;
  try {
    await assert.rejects(
      runSupplementaryDomainAutomaticOperation({
        argv: ['--domain=bosses'],
        env: databaseEnv(fixture.repoRoot),
        now: fixture.now,
        mysqlModule: fixture.mysqlModule([[]]),
        runPreviewImpl: fixture.runPreviewImpl,
        executeOperationImpl: async () => { executed += 1; return { status: 'completed' }; },
        acknowledgeSourceImpl: () => {},
      }),
      /identity|changed|operation bundle|replacement|private/i,
    );
  } finally {
    fs.linkSync = originalLinkSync;
  }
  assert.equal(replaced, true);
  assert.equal(executed, 0);
  const operationBundlePath = path.join(
    fixture.repoRoot,
    'reports',
    'authorization',
    'canonical',
    'automatic',
    'bosses',
    buildAutomaticRunId('bosses', HASH('f')),
    'operation.bundle.json',
  );
  assert.equal(fs.readFileSync(operationBundlePath, 'utf8'), 'replacement operation bundle\n');
});

test('supplementary automatic runner fails closed when the distinct operation bundle already exists', async (t) => {
  const fixture = createRunnerFixture('bosses');
  t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
  const progressPath = path.join(fixture.repoRoot, 'operation-collision-progress.json');
  let executed = 0;

  await assert.rejects(
    runSupplementaryDomainAutomaticOperation({
      argv: ['--domain=bosses', `--progress-path=${progressPath}`],
      env: databaseEnv(fixture.repoRoot),
      now: fixture.now,
      mysqlModule: fixture.mysqlModule([[]]),
      runPreviewImpl: async (input) => {
        const preview = await fixture.runPreviewImpl(input);
        const operationArtifactRoot = path.join(
          fixture.repoRoot,
          'reports',
          'authorization',
          'canonical',
          'automatic',
          'bosses',
          buildAutomaticRunId('bosses', HASH('f')),
        );
        fs.mkdirSync(operationArtifactRoot, { recursive: true, mode: 0o700 });
        const operationBundlePath = path.join(operationArtifactRoot, 'operation.bundle.json');
        fs.writeFileSync(operationBundlePath, 'existing operation bundle\n', { mode: 0o600, flag: 'wx' });
        return preview;
      },
      executeOperationImpl: async () => { executed += 1; return { status: 'completed' }; },
      acknowledgeSourceImpl: () => {},
    }),
    /verified committed|committed.*recovery|recovery.*committed/i,
  );
  assert.equal(executed, 0);
  const previewBytes = fs.readFileSync(fixture.bundlePath, 'utf8');
  const operationBundlePath = path.join(
    fixture.repoRoot,
    'reports',
    'authorization',
    'canonical',
    'automatic',
    'bosses',
    buildAutomaticRunId('bosses', HASH('f')),
    'operation.bundle.json',
  );
  assert.equal(fs.readFileSync(fixture.bundlePath, 'utf8'), previewBytes);
  assert.equal(fs.readFileSync(operationBundlePath, 'utf8'), 'existing operation bundle\n');
  assert.equal(JSON.parse(fs.readFileSync(progressPath, 'utf8')).status, 'failed');
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
      return fixture.runPreviewImpl({ argv });
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

test('supplementary automatic runner rejects unsupported domains before activation or source work', async () => {
  let connections = 0;
  let previews = 0;
  await assert.rejects(
    runSupplementaryDomainAutomaticOperation({
      argv: ['--domain=items'],
      env: databaseEnv(process.cwd()),
      mysqlModule: { createConnection: async () => {
        connections += 1;
        throw new Error('must not connect');
      } },
      runPreviewImpl: async () => { previews += 1; throw new Error('must not preview'); },
    }),
    /unsupported supplementary domain|domain/i,
  );
  assert.equal(connections, 0);
  assert.equal(previews, 0);
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

test('committed reconciliation rejects a legacy run without exact immutable artifact binding', async () => {
  const fixture = createRunnerFixture('bosses');
  let acknowledgements = 0;
  let imports = 0;
  await assert.rejects(
    runSupplementaryDomainAutomaticOperation({
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
    }),
    /committed automatic run evidence does not match frozen source|immutable artifact|exact.*committed/i,
  );

  assert.equal(imports, 0);
  assert.equal(acknowledgements, 0);
});

test('committed supplementary retry reuses only its exact immutable operation artifact for acknowledgement', async (t) => {
  const fixture = createRunnerFixture('bosses');
  t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
  const operationRunId = buildAutomaticRunId('bosses', HASH('f'));
  const operationArtifactRoot = path.join(
    fixture.repoRoot,
    'reports',
    'authorization',
    'canonical',
    'automatic',
    'bosses',
    operationRunId,
  );
  let imports = 0;
  let acknowledgements = 0;
  let originalSourceBytes;
  let originalBundleBytes;

  const result = await runSupplementaryDomainAutomaticOperation({
    argv: ['--domain=bosses'],
    env: databaseEnv(fixture.repoRoot),
    now: fixture.now,
    mysqlModule: fixture.mysqlModule([[{
      domainId: 'bosses',
      manifestJson: JSON.stringify({
        automaticSourceFingerprint: HASH('f'),
        source: {
          path: path.relative(fixture.repoRoot, path.join(operationArtifactRoot, 'source.json')).replaceAll('\\', '/'),
          sha256: `sha256:${createHash('sha256').update('{"records":[]}\n').digest('hex')}`,
        },
      }),
    }]]),
    runPreviewImpl: async (input) => {
      const preview = await fixture.runPreviewImpl(input);
      const previewSourcePath = path.join(path.dirname(preview.bundlePath), 'source.json');
      originalSourceBytes = fs.readFileSync(previewSourcePath);
      const operationSourcePath = path.join(operationArtifactRoot, 'source.json');
      const source = {
        ...fixture.previewBundle.source,
        path: path.relative(fixture.repoRoot, operationSourcePath).replaceAll('\\', '/'),
      };
      const operationBundle = buildSupplementaryL1Bundle({
        operationId: fixture.previewBundle.operationId,
        runId: operationRunId,
        domainId: fixture.previewBundle.domainId,
        generatedAt: fixture.previewBundle.generatedAt,
        executionMode: fixture.previewBundle.executionMode,
        policy: fixture.previewBundle.policy,
        baseline: fixture.previewBundle.baseline,
        source,
        ownedTables: fixture.previewBundle.ownedTables,
        importPlan: {
          ...fixture.previewBundle.importPlan,
          automaticSourceFingerprint: HASH('f'),
          sourceCheckedAt: fixture.now,
          automaticPreviewSource: fixture.previewBundle.source,
        },
        reconciliationInput: buildAutomaticReconciliationInput('bosses', operationRunId),
      });
      fs.mkdirSync(operationArtifactRoot, { recursive: true, mode: 0o700 });
      fs.writeFileSync(operationSourcePath, originalSourceBytes, { mode: 0o600, flag: 'wx' });
      const operationBundlePath = path.join(operationArtifactRoot, 'operation.bundle.json');
      fs.writeFileSync(operationBundlePath, `${JSON.stringify(operationBundle, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
      fs.chmodSync(operationSourcePath, 0o600);
      fs.chmodSync(operationBundlePath, 0o600);
      originalBundleBytes = fs.readFileSync(operationBundlePath);
      return preview;
    },
    executeOperationImpl: async () => { imports += 1; throw new Error('must not import a committed run'); },
    acknowledgeSourceImpl: () => { acknowledgements += 1; },
  });

  const operationSourcePath = path.join(operationArtifactRoot, 'source.json');
  const operationBundlePath = path.join(operationArtifactRoot, 'operation.bundle.json');
  assert.equal(result.reconciledCommittedRun, true);
  assert.equal(result.operationBundlePath, operationBundlePath);
  assert.equal(imports, 0);
  assert.equal(acknowledgements, 1);
  assert.deepEqual(fs.readFileSync(operationSourcePath), originalSourceBytes);
  assert.deepEqual(fs.readFileSync(operationBundlePath), originalBundleBytes);
});

test('committed supplementary retry accepts its immutable pre-commit baseline after generations advance', async (t) => {
  const fixture = createRunnerFixture('bosses');
  t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
  const operationRunId = buildAutomaticRunId('bosses', HASH('f'));
  let imports = 0;
  let acknowledgements = 0;
  let artifact;

  const result = await runSupplementaryDomainAutomaticOperation({
    argv: ['--domain=bosses'],
    env: databaseEnv(fixture.repoRoot),
    now: fixture.now,
    mysqlModule: fixture.mysqlModule([[{
      domainId: 'bosses',
      manifestJson: JSON.stringify({
        automaticSourceFingerprint: HASH('f'),
        source: {
          path: `reports/authorization/canonical/automatic/bosses/${operationRunId}/source.json`,
          sha256: `sha256:${createHash('sha256').update('{"records":[]}\n').digest('hex')}`,
        },
      }),
    }]]),
    runPreviewImpl: async (input) => {
      const preview = await fixture.runPreviewImpl(input);
      artifact = writeAutomaticOperationArtifact(fixture);
      const prior = fixture.previewBundle;
      const postCommitPreview = buildSupplementaryL1Bundle({
        operationId: prior.operationId,
        runId: prior.runId,
        domainId: prior.domainId,
        generatedAt: prior.generatedAt,
        executionMode: prior.executionMode,
        policy: prior.policy,
        baseline: {
          ...prior.baseline,
          generations: prior.baseline.generations.map((generation) => ({
            ...generation,
            generation: generation.generation + 1,
          })),
        },
        source: prior.source,
        ownedTables: prior.ownedTables,
        importPlan: prior.importPlan,
        reconciliationInput: prior.reconciliationInput,
      });
      fs.writeFileSync(preview.bundlePath, `${JSON.stringify(postCommitPreview)}\n`, { mode: 0o600 });
      fixture.previewBundle = postCommitPreview;
      return preview;
    },
    executeOperationImpl: async () => { imports += 1; throw new Error('must not import a committed run'); },
    acknowledgeSourceImpl: () => { acknowledgements += 1; },
  });

  assert.equal(result.reconciledCommittedRun, true);
  assert.equal(imports, 0);
  assert.equal(acknowledgements, 1);
  assert.ok(artifact);
  const immutableArtifactBundle = JSON.parse(fs.readFileSync(artifact.bundlePath, 'utf8'));
  assert.deepEqual(
    immutableArtifactBundle.baseline.generations.map(({ generation }) => generation),
    [1, 1],
  );
  assert.deepEqual(
    fixture.previewBundle.baseline.generations.map(({ generation }) => generation),
    [2, 2],
  );
});

test('committed supplementary retry keeps every non-baseline binding after generations advance', async (t) => {
  const cases = [
    {
      name: 'fresh source bytes',
      mutatePreview({ prior, previewSourcePath }) {
        const sourceBytes = Buffer.from('{"records":[{"id":"changed"}]}\n', 'utf8');
        fs.writeFileSync(previewSourcePath, sourceBytes, { mode: 0o600 });
        fs.chmodSync(previewSourcePath, 0o600);
        return {
          source: {
            ...prior.source,
            sha256: hashBytes(sourceBytes),
          },
        };
      },
    },
    {
      name: 'policy identity',
      mutateArtifact(bundle) {
        return rebuildSupplementaryBundle(bundle, {
          policy: { ...bundle.policy, policyHash: HASH('0') },
        });
      },
    },
    {
      name: 'run identity',
      mutateArtifact(bundle) {
        return rebuildSupplementaryBundle(bundle, {
          runId: 'bosses_l1_recovery_identity',
        });
      },
    },
    {
      name: 'domain identity',
      mutateArtifact: buildAlternateDomainRecoveryBundle,
    },
    {
      name: 'owned-table scope',
      mutateArtifact(bundle) {
        const ownedTables = [...bundle.ownedTables].reverse();
        return rebuildSupplementaryBundle(bundle, {
          policy: {
            ...bundle.policy,
            policyJson: { ...bundle.policy.policyJson, ownedTables },
          },
          ownedTables,
        });
      },
    },
    {
      name: 'reconciliation input',
      mutateArtifact(bundle) {
        return rebuildSupplementaryBundle(bundle, {
          reconciliationInput: {
            ...bundle.reconciliationInput,
            outputPath: 'reports/runtime/l1-reconciliation/bosses/bosses_l1_recovery/recovery-other.json',
          },
        });
      },
    },
    {
      name: 'stable import-plan fields',
      mutateArtifact(bundle) {
        return rebuildSupplementaryBundle(bundle, {
          importPlan: { ...bundle.importPlan, records: 2 },
        });
      },
    },
  ];

  for (const testCase of cases) {
    await t.test(`rejects a tampered ${testCase.name}`, async (t) => {
      const fixture = createRunnerFixture('bosses');
      t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
      let operationRows = [[]];
      let artifact;
      let imports = 0;
      let acknowledgements = 0;
      let postCommitPreview;

      await assert.rejects(
        runSupplementaryDomainAutomaticOperation({
          argv: ['--domain=bosses'],
          env: databaseEnv(fixture.repoRoot),
          now: fixture.now,
          mysqlModule: fixture.mysqlModule(() => operationRows),
          runPreviewImpl: async (input) => {
            const preview = await fixture.runPreviewImpl(input);
            const prior = fixture.previewBundle;
            artifact = writeAutomaticOperationArtifact(fixture, {
              transformBundle: testCase.mutateArtifact ?? ((bundle) => bundle),
            });
            const previewSourcePath = path.join(path.dirname(preview.bundlePath), 'source.json');
            postCommitPreview = buildBaselineAdvancedPreview(prior, testCase.mutatePreview?.({
              prior,
              previewSourcePath,
            }));
            fs.writeFileSync(preview.bundlePath, `${JSON.stringify(postCommitPreview)}\n`, { mode: 0o600 });
            fs.chmodSync(preview.bundlePath, 0o600);
            fixture.previewBundle = postCommitPreview;
            operationRows = [[{
              domainId: 'bosses',
              manifestJson: JSON.stringify({
                automaticSourceFingerprint: HASH('f'),
                source: {
                  path: path.relative(fixture.repoRoot, artifact.sourcePath).replaceAll('\\', '/'),
                  sha256: postCommitPreview.source.sha256,
                },
              }),
            }]];
            return preview;
          },
          executeOperationImpl: async () => {
            imports += 1;
            throw new Error('must not import a tampered committed recovery');
          },
          acknowledgeSourceImpl: () => { acknowledgements += 1; },
        }),
        /committed automatic operation artifact|supplementary L1 bundle|automatic owned table scopes/i,
      );

      assert.equal(imports, 0);
      assert.equal(acknowledgements, 0);
      assert.deepEqual(fs.readFileSync(artifact.sourcePath), artifact.sourceBytes);
      assert.deepEqual(fs.readFileSync(artifact.bundlePath), artifact.bundleBytes);
      assert.deepEqual(
        JSON.parse(fs.readFileSync(artifact.bundlePath, 'utf8')).baseline.generations.map(({ generation }) => generation),
        [1, 1],
      );
      assert.deepEqual(
        postCommitPreview.baseline.generations.map(({ generation }) => generation),
        [2, 2],
      );
    });
  }
});

test('supplementary automatic runner rejects a canonical but uncommitted operation artifact collision', async (t) => {
  const fixture = createRunnerFixture('bosses');
  t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
  let artifact;
  let imports = 0;
  let acknowledgements = 0;

  await assert.rejects(
    runSupplementaryDomainAutomaticOperation({
      argv: ['--domain=bosses'],
      env: databaseEnv(fixture.repoRoot),
      now: fixture.now,
      mysqlModule: fixture.mysqlModule([[]]),
      runPreviewImpl: async (input) => {
        const preview = await fixture.runPreviewImpl(input);
        artifact = writeAutomaticOperationArtifact(fixture);
        return preview;
      },
      executeOperationImpl: async () => { imports += 1; throw new Error('must not import an artifact collision'); },
      acknowledgeSourceImpl: () => { acknowledgements += 1; },
    }),
    /verified committed|committed.*recovery|recovery.*committed/i,
  );

  assert.equal(imports, 0);
  assert.equal(acknowledgements, 0);
  assert.deepEqual(fs.readFileSync(artifact.sourcePath), artifact.sourceBytes);
  assert.deepEqual(fs.readFileSync(artifact.bundlePath), artifact.bundleBytes);
});

test('supplementary automatic runner rejects a committed recovery artifact with mismatched policy data', async (t) => {
  const fixture = createRunnerFixture('bosses');
  t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
  const operationRunId = buildAutomaticRunId('bosses', HASH('f'));
  const operationArtifactRoot = path.join(
    fixture.repoRoot,
    'reports',
    'authorization',
    'canonical',
    'automatic',
    'bosses',
    operationRunId,
  );
  const operationSource = {
    path: path.relative(fixture.repoRoot, path.join(operationArtifactRoot, 'source.json')).replaceAll('\\', '/'),
    sha256: `sha256:${createHash('sha256').update('{"records":[]}\n').digest('hex')}`,
  };
  let artifact;
  let imports = 0;
  let acknowledgements = 0;

  await assert.rejects(
    runSupplementaryDomainAutomaticOperation({
      argv: ['--domain=bosses'],
      env: databaseEnv(fixture.repoRoot),
      now: fixture.now,
      mysqlModule: fixture.mysqlModule([[{
        domainId: 'bosses',
        manifestJson: JSON.stringify({ automaticSourceFingerprint: HASH('f'), source: operationSource }),
      }]]),
      runPreviewImpl: async (input) => {
        const preview = await fixture.runPreviewImpl(input);
        artifact = writeAutomaticOperationArtifact(fixture, {
          transformBundle: (bundle) => buildSupplementaryL1Bundle({
            operationId: bundle.operationId,
            runId: bundle.runId,
            domainId: bundle.domainId,
            generatedAt: bundle.generatedAt,
            executionMode: bundle.executionMode,
            policy: { ...bundle.policy, policyHash: HASH('0') },
            baseline: bundle.baseline,
            source: bundle.source,
            ownedTables: bundle.ownedTables,
            importPlan: bundle.importPlan,
            reconciliationInput: bundle.reconciliationInput,
          }),
        });
        return preview;
      },
      executeOperationImpl: async () => { imports += 1; throw new Error('must not import a mismatched artifact'); },
      acknowledgeSourceImpl: () => { acknowledgements += 1; },
    }),
    /policy.*does not match|artifact.*policy|fresh frozen operation/i,
  );

  assert.equal(imports, 0);
  assert.equal(acknowledgements, 0);
  assert.deepEqual(fs.readFileSync(artifact.sourcePath), artifact.sourceBytes);
  assert.deepEqual(fs.readFileSync(artifact.bundlePath), artifact.bundleBytes);
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

for (const [label, queryImpl, expectedMessage] of [
  ['missing activation', async () => [[]], /no fresh scheduler activation/],
  ['activation query failure', async () => { throw new Error('activation lookup failed'); }, /activation lookup failed/],
]) {
  test(`supplementary automatic runner publishes failed progress when ${label}`, async (t) => {
    const fixture = createRunnerFixture('bosses');
    t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
    const progressPath = path.join(fixture.repoRoot, `${label.replaceAll(' ', '-')}.progress.json`);
    let previewCalls = 0;

    await assert.rejects(
      runSupplementaryDomainAutomaticOperation({
        argv: ['--domain=bosses', `--progress-path=${progressPath}`],
        env: databaseEnv(fixture.repoRoot),
        now: fixture.now,
        mysqlModule: {
          createConnection: async () => ({ query: queryImpl, end: async () => {} }),
        },
        runPreviewImpl: async () => {
          previewCalls += 1;
          throw new Error('preview must not run before activation');
        },
      }),
      expectedMessage,
    );

    const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
    assert.equal(progress.status, 'failed');
    assert.equal(progress.phase, 'failed');
    assert.match(progress.message, /activation|lookup/i);
    assert.equal(previewCalls, 0);
  });
}

function createRunnerFixture(domain) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'supplementary-automatic-fixture-'));
  const now = '2026-08-15T02:00:00.000Z';
  const sourceStatePath = path.join(repoRoot, 'data', 'generated', 'source-update-monitor.latest.json');
  const sourceState = {
    checkedAt: now,
    summary: { probeHealthy: true, errorSources: 0 },
    sources: [{
      key: 'wiki.bosses.catalog',
      status: 'ok',
      checkedAt: now,
      currentValue: HASH('f'),
      changed: true,
    }],
  };
  fs.mkdirSync(path.dirname(sourceStatePath), { recursive: true });
  fs.writeFileSync(sourceStatePath, JSON.stringify(sourceState));
  const sourceContentIdentity = `sha256:${createHash('sha256').update(JSON.stringify(sourceState)).digest('hex')}`;
  const source = { path: 'reports/authorization/canonical/source.json', sha256: HASH('d') };
  let previewBundle = buildSupplementaryL1Bundle({
    operationId: `automation-${domain}-first-l1`,
    runId: `${domain}_l1_preview_run`,
    domainId: domain,
    generatedAt: now,
    executionMode: 'ACTIVATION_GATED_AUTO',
    policy: automaticBossPolicy(),
    baseline: { environmentId: 'local', generations: [
      { ...BOSS_AUTOMATIC_SCOPES[0], generation: 1 },
      { ...BOSS_AUTOMATIC_SCOPES[1], generation: 1 },
    ], projectionHash: HASH('c') },
    source,
    ownedTables: BOSS_AUTOMATIC_SCOPES,
    importPlan: { records: 1 },
  });
  const activation = {
    decisionIdentity: 'activation-1', packetHash: HASH('e'), policySetHash: HASH('b'),
    actor: 'admin', reason: 'test', authorizationReference: 'test',
    authorizedAt: '2000-01-01T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z',
  };
  const fixture = {
    repoRoot,
    sourceStatePath,
    sourceContentIdentity,
    bundlePath: null,
    previewBundle,
    now,
    runPreviewImpl: async ({ argv = [] } = {}) => {
      const runIdArg = argv.find((arg) => arg.startsWith('--run-id='));
      assert.ok(runIdArg, 'automatic runner must provide a preview run id');
      const previewRunId = runIdArg.slice('--run-id='.length);
      const artifactArg = argv.find((arg) => arg.startsWith('--artifact-root='));
      assert.ok(artifactArg, 'automatic runner must provide an artifact root');
      const artifactRoot = path.resolve(repoRoot, artifactArg.slice('--artifact-root='.length));
      fs.mkdirSync(artifactRoot, { recursive: true, mode: 0o700 });
      const bundlePath = path.join(artifactRoot, 'bundle.json');
      const sourcePath = path.join(artifactRoot, 'source.json');
      const sourceBytes = Buffer.from('{"records":[]}\n', 'utf8');
      fs.writeFileSync(sourcePath, sourceBytes, { mode: 0o600, flag: 'wx' });
      const bundle = buildSupplementaryL1Bundle({
        operationId: previewBundle.operationId,
        runId: previewRunId,
        domainId: previewBundle.domainId,
        generatedAt: previewBundle.generatedAt,
        executionMode: previewBundle.executionMode,
        policy: previewBundle.policy,
        baseline: previewBundle.baseline,
        source: {
          ...previewBundle.source,
          path: path.relative(repoRoot, sourcePath).replaceAll('\\', '/'),
          sha256: `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`,
        },
        ownedTables: previewBundle.ownedTables,
        importPlan: previewBundle.importPlan,
        reconciliationInput: previewBundle.reconciliationInput,
      });
      fixture.previewBundle = bundle;
      fs.writeFileSync(bundlePath, `${JSON.stringify(bundle)}\n`, { mode: 0o600, flag: 'wx' });
      fs.chmodSync(bundlePath, 0o600);
      fixture.bundlePath = bundlePath;
      return {
        bundlePath,
        stableSourceSnapshot: {
          sourceKey: 'wiki.bosses.catalog', locator: 'Bosses', entityFamily: domain,
          sourceKind: 'page_catalog', contentHash: HASH('f'), checkedAt: now,
        },
      };
    },
    mysqlModule(operationRows) {
      const connections = [
        { query: async () => [[activation]], end: async () => {} },
        {
          query: (() => {
            let calls = 0;
            return async () => {
              calls += 1;
              if (calls === 1) return typeof operationRows === 'function' ? operationRows() : operationRows;
              return [[activation]];
            };
          })(),
          end: async () => {},
        },
      ];
      return { createConnection: async () => connections.shift() };
    },
  };
  return fixture;
}

function writeAutomaticOperationArtifact(fixture, { transformBundle = (bundle) => bundle } = {}) {
  const operationRunId = buildAutomaticRunId('bosses', HASH('f'));
  const artifactRoot = path.join(
    fixture.repoRoot,
    'reports',
    'authorization',
    'canonical',
    'automatic',
    'bosses',
    operationRunId,
  );
  const previewSourcePath = path.join(path.dirname(fixture.bundlePath), 'source.json');
  const sourceBytes = fs.readFileSync(previewSourcePath);
  const sourcePath = path.join(artifactRoot, 'source.json');
  const source = {
    ...fixture.previewBundle.source,
    path: path.relative(fixture.repoRoot, sourcePath).replaceAll('\\', '/'),
  };
  const expectedBundle = buildSupplementaryL1Bundle({
    operationId: fixture.previewBundle.operationId,
    runId: operationRunId,
    domainId: fixture.previewBundle.domainId,
    generatedAt: fixture.previewBundle.generatedAt,
    executionMode: fixture.previewBundle.executionMode,
    policy: fixture.previewBundle.policy,
    baseline: fixture.previewBundle.baseline,
    source,
    ownedTables: fixture.previewBundle.ownedTables,
    importPlan: {
      ...fixture.previewBundle.importPlan,
      automaticSourceFingerprint: HASH('f'),
      sourceCheckedAt: fixture.now,
      automaticPreviewSource: fixture.previewBundle.source,
    },
    reconciliationInput: buildAutomaticReconciliationInput('bosses', operationRunId),
  });
  const bundle = transformBundle(expectedBundle);
  const bundlePath = path.join(artifactRoot, 'operation.bundle.json');
  fs.mkdirSync(artifactRoot, { recursive: true, mode: 0o700 });
  fs.writeFileSync(sourcePath, sourceBytes, { mode: 0o600, flag: 'wx' });
  fs.writeFileSync(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  fs.chmodSync(sourcePath, 0o600);
  fs.chmodSync(bundlePath, 0o600);
  return {
    artifactRoot,
    sourcePath,
    bundlePath,
    sourceBytes,
    bundleBytes: fs.readFileSync(bundlePath),
  };
}

function buildBaselineAdvancedPreview(bundle, overrides = {}) {
  return rebuildSupplementaryBundle(bundle, {
    ...overrides,
    baseline: {
      ...bundle.baseline,
      generations: bundle.baseline.generations.map((generation) => ({
        ...generation,
        generation: generation.generation + 1,
      })),
    },
  });
}

function rebuildSupplementaryBundle(bundle, overrides = {}) {
  return buildSupplementaryL1Bundle({
    operationId: overrides.operationId ?? bundle.operationId,
    runId: overrides.runId ?? bundle.runId,
    domainId: overrides.domainId ?? bundle.domainId,
    generatedAt: overrides.generatedAt ?? bundle.generatedAt,
    executionMode: overrides.executionMode ?? bundle.executionMode,
    policy: overrides.policy ?? bundle.policy,
    baseline: overrides.baseline ?? bundle.baseline,
    source: overrides.source ?? bundle.source,
    ownedTables: overrides.ownedTables ?? bundle.ownedTables,
    importPlan: overrides.importPlan ?? bundle.importPlan,
    reconciliationInput: overrides.reconciliationInput ?? bundle.reconciliationInput,
  });
}

function buildAlternateDomainRecoveryBundle(bundle) {
  const ownedTables = [
    { databaseRole: 'local', table: 'audio_assets', fieldGroup: 'all_columns' },
    { databaseRole: 'local', table: 'audio_asset_links', fieldGroup: 'all_columns' },
  ];
  const policy = {
    ...automaticBossPolicy(),
    domainId: 'audio',
    policyJson: {
      ...automaticBossPolicy().policyJson,
      ownedTables,
    },
  };
  return buildSupplementaryL1Bundle({
    operationId: 'automation-audio-first-l1',
    runId: 'audio_l1_recovery_identity',
    domainId: 'audio',
    generatedAt: bundle.generatedAt,
    executionMode: bundle.executionMode,
    policy,
    baseline: {
      environmentId: bundle.baseline.environmentId,
      generations: ownedTables.map((scope) => ({ ...scope, generation: 1 })),
      projectionHash: bundle.baseline.projectionHash,
    },
    source: bundle.source,
    ownedTables,
    importPlan: bundle.importPlan,
    reconciliationInput: bundle.reconciliationInput,
  });
}

function hashBytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
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
