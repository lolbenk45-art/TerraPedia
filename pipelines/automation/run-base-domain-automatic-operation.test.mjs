import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { buildCanonicalOperationExecutionManifest } from './canonical-operation-execution-manifest.mjs';

import * as baseOperationModule from './run-base-domain-automatic-operation.mjs';
import { createMysqlSupplementaryL1Adapter, runSupplementaryL1OperationCli } from './run-supplementary-domain-l1-operation.mjs';
import { buildSupplementaryL1Bundle } from './supplementary-domain-l1-contract.mjs';

const {
  buildBaseDomainSourceCommand,
  buildAutomaticReconciliationInput,
  buildReconciliationInputFromArgs,
  hashFrozenSourcePayload,
  runBaseDomainAutomaticOperation,
  validateItemDryRunDataset,
} = baseOperationModule;
import { createHash } from 'node:crypto';

test('full reconciliation inputs are all-or-nothing and remain explicit read-only artifacts', () => {
  assert.equal(buildReconciliationInputFromArgs({}), undefined);
  assert.deepEqual(buildReconciliationInputFromArgs({
    'source-coverage': 'reports/runtime/items/source.json',
    'table-readback': 'reports/runtime/items/table.json',
    'attempt-state': 'reports/runtime/items/attempt.json',
    'reconciliation-output': 'reports/runtime/items/reconciliation.json',
  }), {
    sourceCoveragePath: 'reports/runtime/items/source.json',
    ownedTableReadbackPath: 'reports/runtime/items/table.json',
    attemptStatePath: 'reports/runtime/items/attempt.json',
    outputPath: 'reports/runtime/items/reconciliation.json',
  });
  assert.throws(() => buildReconciliationInputFromArgs({ 'source-coverage': 'reports/runtime/items/source.json' }), /together/i);
});

test('base automatic operations derive reconciliation artifacts from the frozen run identity', () => {
  assert.deepEqual(buildAutomaticReconciliationInput('npcs', 'npcs_l1_auto_abc12345'), {
    sourceCoveragePath: 'reports/runtime/l1-reconciliation/npcs/npcs_l1_auto_abc12345/source-coverage.json',
    ownedTableReadbackPath: 'reports/runtime/l1-reconciliation/npcs/npcs_l1_auto_abc12345/owned-table-readback.json',
    attemptStatePath: 'reports/runtime/l1-reconciliation/npcs/npcs_l1_auto_abc12345/attempt-state.json',
    outputPath: 'reports/runtime/l1-reconciliation/npcs/npcs_l1_auto_abc12345/reconciliation-evidence.json',
  });
});

test('base automatic runner carries a scheduler source dispatch identity into its L2 bundle', async (t) => {
  const fixture = createLiveBaseAutomaticRunnerFixture();
  t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
  const sourceDispatchIdentity = {
    sourceFingerprint: fixture.sourceFingerprint,
    sourceRunIdentity: fixture.sourceRunIdentity,
    sourceContentIdentity: fixture.sourceContentIdentity,
  };
  let capturedBundle = null;

  await runBaseDomainAutomaticOperation(createLiveBaseAutomaticRunnerOptions(fixture, {
    env: {
      ...fixture.env,
      TERRAPEDIA_CRAWLER_REQUESTED_BY: 'v2-automation',
      TERRAPEDIA_CRAWLER_SOURCE_FINGERPRINT: sourceDispatchIdentity.sourceFingerprint,
      TERRAPEDIA_CRAWLER_SOURCE_RUN_IDENTITY: sourceDispatchIdentity.sourceRunIdentity,
      TERRAPEDIA_CRAWLER_SOURCE_CONTENT_IDENTITY: sourceDispatchIdentity.sourceContentIdentity,
    },
    executeOperationImpl: async ({ bundle }) => {
      capturedBundle = bundle;
      return { status: 'completed' };
    },
  }));

  assert.deepEqual(capturedBundle.sourceDispatchIdentity, sourceDispatchIdentity);
});

test('base automatic bundle preserves the live L2 policy scope instead of static configuration scope', () => {
  assert.equal(typeof baseOperationModule.buildBaseAutomaticBundle, 'function');
  const policyScopes = [
    { databaseRole: 'local', table: 'npcs', fieldGroup: 'npc_owned', logicalPredicateHash: `sha256:${'a'.repeat(64)}` },
  ];
  const current = {
    currentLevel: 'L2',
    operationalState: 'ACTIVE',
    policyVersion: 2,
    policyHash: `sha256:${'b'.repeat(64)}`,
    policySetHash: `sha256:${'c'.repeat(64)}`,
    policyJson: {
      schemaVersion: 1,
      level: 'L2',
      requireSnapshot: true,
      anomalyAction: 'CIRCUIT_OPEN',
      ratioInsertCap: 0.1,
      ratioUpdateCap: 0.1,
      ratioRelationshipDeleteCap: 0.05,
      ratioDisableCap: 0.005,
      absoluteInsertCap: 500,
      absoluteUpdateCap: 500,
      absoluteRelationshipDeleteCap: 200,
      absoluteDisableCap: 20,
      sourceFreshnessMaxAgeMinutes: 60,
      ownedTables: policyScopes,
    },
    baseline: {
      environmentId: 'local',
      generations: policyScopes.map((scope) => ({ ...scope, generation: 4 })),
      projectionHash: `sha256:${'d'.repeat(64)}`,
    },
    ownedTables: policyScopes,
  };
  const bundle = baseOperationModule.buildBaseAutomaticBundle({
    domain: 'npcs',
    config: { operationId: 'automation-npcs-l1', ownedTables: [{ databaseRole: 'local', table: 'npcs' }] },
    current,
    runId: 'npcs_l1_auto_abcdef1234567890',
    generatedAt: '2026-08-31T10:00:00.000Z',
    frozen: {
      source: { path: 'reports/authorization/canonical/automatic/npcs/source.json', sha256: `sha256:${'e'.repeat(64)}` },
      importPlan: { recordCount: 1 },
    },
    sourceFingerprint: `sha256:${'f'.repeat(64)}`,
    sourceCheckedAt: '2026-08-31T09:59:00.000Z',
  });

  assert.deepEqual(bundle.ownedTables, policyScopes);
  assert.deepEqual(bundle.policy.policyJson.ownedTables, policyScopes);
  assert.deepEqual(bundle.baseline.generations, [{ ...policyScopes[0], generation: 4 }]);
  assert.equal(bundle.importPlan.sourceCheckedAt, '2026-08-31T09:59:00.000Z');
});

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

test('base automatic runner publishes failed progress when activation lookup is missing', async (t) => {
  const fixture = createLiveBaseAutomaticRunnerFixture();
  t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
  const progressPath = path.join(fixture.repoRoot, 'activation-missing.progress.json');
  let sourceRuns = 0;

  await assert.rejects(
    runBaseDomainAutomaticOperation({
      ...createLiveBaseAutomaticRunnerOptions(fixture),
      argv: ['--domain=items', '--source-mode=local', `--progress-path=${progressPath}`],
      mysqlModule: { createConnection: async () => ({ query: async () => [[]], end: async () => {} }) },
      runSourceImpl: async () => { sourceRuns += 1; },
    }),
    /no fresh scheduler activation/,
  );

  assert.equal(sourceRuns, 0);
  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  assert.equal(progress.status, 'failed');
  assert.equal(progress.phase, 'failed');
  assert.match(progress.message, /activation/i);
});

test('base automatic artifacts reject a group-writable ancestor before publication', async (t) => {
  if (!fs.statSync('/tmp').mode) {
    return;
  }
  const fixture = createLiveBaseAutomaticRunnerFixture();
  t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
  const automaticRoot = path.join(
    fixture.repoRoot,
    'reports',
    'authorization',
    'canonical',
    'automatic',
  );
  fs.mkdirSync(automaticRoot, { recursive: true, mode: 0o770 });
  fs.chmodSync(automaticRoot, 0o770);

  await assert.rejects(
    runBaseDomainAutomaticOperation({
      ...createLiveBaseAutomaticRunnerOptions(fixture),
      argv: ['--domain=items', '--source-mode=local', `--progress-path=${fixture.progressPath}`],
      requireAutoDomainOperationImpl: () => ({
        operationId: 'automation-items-l1',
        databaseMode: 'DRY_RUN',
        ownedTables: [{ databaseRole: 'local', table: 'items', fieldGroup: 'all_columns' }],
      }),
    }),
    /owner|writable|trust|artifact|directory/i,
  );
  assert.equal(fs.existsSync(path.join(automaticRoot, 'items')), false);
});

test('base automatic artifacts reject the runtime canonical authorization root when it is group-writable', async (t) => {
  const fixture = createLiveBaseAutomaticRunnerFixture();
  t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
  const canonicalRoot = path.join(fixture.repoRoot, 'reports', 'authorization', 'canonical');
  fs.mkdirSync(canonicalRoot, { recursive: true, mode: 0o755 });
  fs.chmodSync(canonicalRoot, 0o775);

  await assert.rejects(
    runBaseDomainAutomaticOperation({
      ...createLiveBaseAutomaticRunnerOptions(fixture),
      argv: ['--domain=items', '--source-mode=local', `--progress-path=${fixture.progressPath}`],
      requireAutoDomainOperationImpl: () => ({
        operationId: 'automation-items-l1',
        databaseMode: 'DRY_RUN',
        ownedTables: [{ databaseRole: 'local', table: 'items', fieldGroup: 'all_columns' }],
      }),
    }),
    /owner|writable|trust|artifact|directory/i,
  );
  assert.equal(fs.existsSync(path.join(canonicalRoot, 'automatic')), false);
});

test('frozen source identity hashes the exact pretty JSON bytes published to source.json', () => {
  const payload = { z: 1, a: { y: 2, b: 3 } };
  const expected = `sha256:${createHash('sha256').update(`${JSON.stringify(payload, null, 2)}\n`).digest('hex')}`;
  assert.equal(hashFrozenSourcePayload(payload), expected);
});

test('base automatic source commands defer manifest acknowledgement to the outer operation', () => {
  assert.deepEqual(buildBaseDomainSourceCommand('npcs', '/tmp/npcs-progress.json'), [
    'pipelines/workflow/run-wiki-sync.mjs',
    '--mode=apply',
    '--force=true',
    '--entity=npcs',
    '--manifest-path=/tmp/npcs-source-manifest.staging.json',
    '--plan-path=/tmp/npcs-wiki-sync-plan.staging.json',
  ]);
  assert.equal(buildBaseDomainSourceCommand('buffs', '/tmp/buffs-progress.json').some((arg) => arg.startsWith('--manifest-path=')), false);
  assert.equal(buildBaseDomainSourceCommand('armor_sets', '/tmp/armor-progress.json').some((arg) => arg.startsWith('--manifest-path=')), false);
});

test('base automatic Buff source resumes a valid page checkpoint after a failed natural tick', () => {
  assert.deepEqual(buildBaseDomainSourceCommand('buffs', '/tmp/buffs-progress.json'), [
    'pipelines/fetch/fetch-wiki-buffs.mjs',
    '--progress-path=/tmp/buffs-progress.json',
    '--resume-mode=auto',
  ]);
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

test('Items frozen input validates record identity instead of trusting the array length', () => {
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

test('base committed reconciliation rejects a mismatched scheduler source dispatch identity', async () => {
  const sourceFingerprint = `sha256:${'a'.repeat(64)}`;
  const sourceDispatchIdentity = {
    sourceFingerprint,
    sourceRunIdentity: '2026-08-31T10:00:00.000Z',
    sourceContentIdentity: `sha256:${'b'.repeat(64)}`,
  };
  const connection = {
    query: async () => [[{
      domainId: 'npcs',
      manifestJson: JSON.stringify({
        automaticSourceFingerprint: sourceFingerprint,
        source: { path: 'frozen.json', sha256: `sha256:${'c'.repeat(64)}` },
        sourceDispatchIdentity: {
          ...sourceDispatchIdentity,
          sourceContentIdentity: `sha256:${'d'.repeat(64)}`,
        },
      }),
    }]],
  };

  await assert.rejects(
    baseOperationModule.isCommittedBaseAutomaticRun(connection, {
      runId: automaticRunId('npcs', sourceFingerprint),
      domainId: 'npcs',
      sourceFingerprint,
      source: { path: 'frozen.json', sha256: `sha256:${'c'.repeat(64)}` },
      sourceDispatchIdentity,
    }),
    /source dispatch identity|committed automatic run evidence/i,
  );
});

test('base committed reconciliation does not replace frozen artifacts before checking idempotence', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'base-committed-artifact-order-'));
  const sourceFingerprint = `sha256:${'a'.repeat(64)}`;
  const runId = automaticRunId('items', sourceFingerprint);
  const standardizedPath = path.join(repoRoot, 'data', 'standardized', 'items.standardized.json');
  const progressPath = path.join(repoRoot, 'reports', 'crawler-monitor', 'v2', 'attempt-1', 'progress.json');
  const legacySourcePath = path.join(
    repoRoot,
    'reports',
    'authorization',
    'canonical',
    `automation-items-${runId}.source.json`,
  );
  const preservedSource = '{"historical":"must-remain-immutable"}\n';
  fs.mkdirSync(path.dirname(standardizedPath), { recursive: true });
  fs.mkdirSync(path.dirname(progressPath), { recursive: true });
  fs.mkdirSync(path.dirname(legacySourcePath), { recursive: true });
  fs.writeFileSync(standardizedPath, JSON.stringify({ entity: 'items', records: [] }));
  fs.writeFileSync(legacySourcePath, preservedSource, { mode: 0o600 });
  let idempotenceChecks = 0;

  try {
    const result = await runBaseDomainAutomaticOperation({
      argv: ['--domain=items', '--source-mode=local', `--progress-path=${progressPath}`],
      env: { ...databaseEnv(), WORKTREE_ROOT: repoRoot },
      mysqlModule: { createConnection: async () => ({
        query: async () => [[{
          decisionIdentity: 'activation-1',
          packetHash: `sha256:${'b'.repeat(64)}`,
          policySetHash: `sha256:${'c'.repeat(64)}`,
          actor: 'admin',
          reason: 'test',
          authorizationReference: 'test',
          authorizedAt: '2026-08-31T09:00:00.000Z',
          expiresAt: '2026-08-31T11:00:00.000Z',
        }]],
        end: async () => {},
      }) },
      readSourceFingerprintImpl: () => sourceFingerprint,
      isCommittedRunImpl: async () => {
        idempotenceChecks += 1;
        return true;
      },
    });

    assert.equal(result.reconciledCommittedRun, true);
    assert.equal(idempotenceChecks, 1);
    assert.equal(fs.readFileSync(legacySourcePath, 'utf8'), preservedSource);
    assert.equal(fs.existsSync(path.join(
      repoRoot,
      'reports',
      'authorization',
      'canonical',
      'automatic',
      'items',
      runId,
    )), false);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('base committed reconciliation refuses live acknowledgement after activation is revoked', async (t) => {
  const fixture = createLiveBaseAutomaticRunnerFixture();
  t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
  const activation = {
    decisionIdentity: 'activation-1',
    packetHash: `sha256:${'a'.repeat(64)}`,
    policySetHash: `sha256:${'b'.repeat(64)}`,
    actor: 'admin',
    reason: 'test',
    authorizationReference: 'test',
    authorizedAt: '2000-01-01T00:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
  };
  let activationReads = 0;
  let acknowledgements = 0;
  const connection = {
    query: async () => {
      activationReads += 1;
      return activationReads === 1 ? [[activation]] : [[]];
    },
    end: async () => {},
  };

  await assert.rejects(
    runBaseDomainAutomaticOperation(createLiveBaseAutomaticRunnerOptions(fixture, {
      mysqlModule: { createConnection: async () => connection },
      isCommittedRunImpl: async () => true,
      acknowledgeSourceImpl: async () => { acknowledgements += 1; },
    })),
    /activation.*expired|revoked|changed/i,
  );

  assert.equal(activationReads, 2);
  assert.equal(acknowledgements, 0);
});

test('base automatic runner refuses live acknowledgement when the scheduler source state drifts after apply', async (t) => {
  const fixture = createLiveBaseAutomaticRunnerFixture();
  t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
  const sourceDispatchIdentity = {
    sourceFingerprint: fixture.sourceFingerprint,
    sourceRunIdentity: fixture.sourceRunIdentity,
    sourceContentIdentity: fixture.sourceContentIdentity,
  };
  let acknowledgements = 0;

  await assert.rejects(
    runBaseDomainAutomaticOperation(createLiveBaseAutomaticRunnerOptions(fixture, {
      env: {
        ...fixture.env,
        TERRAPEDIA_CRAWLER_REQUESTED_BY: 'v2-automation',
        TERRAPEDIA_CRAWLER_SOURCE_FINGERPRINT: sourceDispatchIdentity.sourceFingerprint,
        TERRAPEDIA_CRAWLER_SOURCE_RUN_IDENTITY: sourceDispatchIdentity.sourceRunIdentity,
        TERRAPEDIA_CRAWLER_SOURCE_CONTENT_IDENTITY: sourceDispatchIdentity.sourceContentIdentity,
      },
      executeOperationImpl: async () => {
        const drifted = JSON.parse(fs.readFileSync(fixture.sourceStatePath, 'utf8'));
        drifted.checkedAt = '2026-08-31T09:01:00.000Z';
        drifted.sources[0].checkedAt = drifted.checkedAt;
        fs.writeFileSync(fixture.sourceStatePath, JSON.stringify(drifted));
        return { status: 'completed' };
      },
      acknowledgeSourceImpl: async () => { acknowledgements += 1; },
    })),
    /source monitor checkedAt does not match|dispatch identity/i,
  );

  assert.equal(acknowledgements, 0);
});

test('base automatic runner rejects acknowledgement when activation changes during source verification', async (t) => {
  const fixture = createLiveBaseAutomaticRunnerFixture();
  t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
  const activation = {
    decisionIdentity: 'activation-before-acknowledgement',
    packetHash: `sha256:${'a'.repeat(64)}`,
    policySetHash: `sha256:${'b'.repeat(64)}`,
    actor: 'admin',
    reason: 'test',
    authorizationReference: 'test',
    authorizedAt: '2000-01-01T00:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
  };
  const replacement = { ...activation, decisionIdentity: 'activation-replaced-during-source-check' };
  const sourceDispatchIdentity = {
    sourceFingerprint: fixture.sourceFingerprint,
    sourceRunIdentity: fixture.sourceRunIdentity,
    sourceContentIdentity: fixture.sourceContentIdentity,
  };
  let activationChanged = false;
  let sourceChecks = 0;
  let acknowledgements = 0;
  const connection = {
    query: async () => [[activationChanged ? replacement : activation]],
    end: async () => {},
  };

  await assert.rejects(
    runBaseDomainAutomaticOperation(createLiveBaseAutomaticRunnerOptions(fixture, {
      env: {
        ...fixture.env,
        TERRAPEDIA_CRAWLER_REQUESTED_BY: 'v2-automation',
        TERRAPEDIA_CRAWLER_SOURCE_FINGERPRINT: sourceDispatchIdentity.sourceFingerprint,
        TERRAPEDIA_CRAWLER_SOURCE_RUN_IDENTITY: sourceDispatchIdentity.sourceRunIdentity,
        TERRAPEDIA_CRAWLER_SOURCE_CONTENT_IDENTITY: sourceDispatchIdentity.sourceContentIdentity,
      },
      mysqlModule: { createConnection: async () => connection },
      readSourceMonitorStateImpl: () => {
        sourceChecks += 1;
        if (sourceChecks === 2) activationChanged = true;
        return {
          runIdentity: fixture.sourceRunIdentity,
          contentIdentity: fixture.sourceContentIdentity,
          source: { currentValue: fixture.sourceFingerprint },
        };
      },
      acknowledgeSourceImpl: async () => { acknowledgements += 1; },
    })),
    /activation.*changed/i,
  );

  assert.equal(sourceChecks, 2);
  assert.equal(acknowledgements, 0);
});

test('base automatic DRY_RUN checks idempotence before frozen artifact publication', async () => {
  const fixture = createLiveBaseAutomaticRunnerFixture();
  const runId = automaticRunId('items', fixture.sourceFingerprint);
  const artifactRoot = path.join(
    fixture.repoRoot,
    'reports',
    'authorization',
    'canonical',
    'automatic',
    'items',
    runId,
  );
  let idempotenceChecks = 0;

  try {
    const result = await runBaseDomainAutomaticOperation(createLiveBaseAutomaticRunnerOptions(fixture, {
      argv: ['--domain=items', '--source-mode=local', `--progress-path=${fixture.progressPath}`],
      requireAutoDomainOperationImpl: () => ({
        operationId: 'automation-items-dry-run',
        databaseMode: 'DRY_RUN',
        ownedTables: fixture.current.ownedTables,
      }),
      isCommittedRunImpl: async () => {
        idempotenceChecks += 1;
        return true;
      },
    }));

    assert.equal(result.reconciledCommittedRun, true);
    assert.equal(idempotenceChecks, 1);
    assert.equal(fs.existsSync(artifactRoot), false);
  } finally {
    fs.rmSync(fixture.repoRoot, { recursive: true, force: true });
  }
});

test('base automatic operation rejects an output path inside its protected artifact root before import', async () => {
  const fixture = createLiveBaseAutomaticRunnerFixture();
  const runId = automaticRunId('items', fixture.sourceFingerprint);
  const artifactRoot = path.join(
    fixture.repoRoot,
    'reports',
    'authorization',
    'canonical',
    'automatic',
    'items',
    runId,
  );
  const sourcePath = path.join(artifactRoot, 'source.json');
  let executionCalls = 0;

  try {
    await assert.rejects(
      runBaseDomainAutomaticOperation(createLiveBaseAutomaticRunnerOptions(fixture, {
        argv: ['--domain=items', '--source-mode=local', `--progress-path=${fixture.progressPath}`, `--output=${sourcePath}`],
        executeOperationImpl: async () => {
          executionCalls += 1;
          return { status: 'completed' };
        },
      })),
      /--output must not overlap the protected base automatic artifact directory/i,
    );

    assert.equal(executionCalls, 0);
    assert.equal(fs.existsSync(artifactRoot), false);
  } finally {
    fs.rmSync(fixture.repoRoot, { recursive: true, force: true });
  }
});

test('base automatic operation rejects an output path with a symlinked ancestor to its artifact root', async () => {
  const fixture = createLiveBaseAutomaticRunnerFixture();
  const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'base-output-symlink-'));
  const runId = automaticRunId('items', fixture.sourceFingerprint);
  const artifactRoot = path.join(
    fixture.repoRoot,
    'reports',
    'authorization',
    'canonical',
    'automatic',
    'items',
    runId,
  );
  const outputAlias = path.join(externalRoot, 'artifact-alias');
  const outputPath = path.join(outputAlias, 'source.json');
  fs.symlinkSync(artifactRoot, outputAlias, 'dir');
  let executionCalls = 0;

  try {
    await assert.rejects(
      runBaseDomainAutomaticOperation(createLiveBaseAutomaticRunnerOptions(fixture, {
        argv: ['--domain=items', '--source-mode=local', `--progress-path=${fixture.progressPath}`, `--output=${outputPath}`],
        executeOperationImpl: async () => {
          executionCalls += 1;
          return { status: 'completed' };
        },
      })),
      /--output must not have a symbolic-link ancestor/i,
    );

    assert.equal(executionCalls, 0);
    assert.equal(fs.existsSync(artifactRoot), false);
  } finally {
    fs.rmSync(fixture.repoRoot, { recursive: true, force: true });
    fs.rmSync(externalRoot, { recursive: true, force: true });
  }
});

test('base automatic result publication keeps protected source and bundle artifacts immutable across a final parent swap', async () => {
  for (const targetName of ['source.json', 'bundle.json']) {
    const fixture = createLiveBaseAutomaticRunnerFixture();
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'base-output-final-rename-symlink-'));
    const outputParent = path.join(outputRoot, 'result');
    const movedOutputParent = path.join(outputRoot, 'result-before-swap');
    const outputPath = path.join(outputParent, targetName);
    const { artifactRoot, sourcePath, bundlePath } = baseAutomaticArtifactPaths(fixture);
    const originalRenameSync = fs.renameSync;
    let swapped = false;
    let preservedSource = null;
    let preservedBundle = null;
    fs.mkdirSync(outputParent, { recursive: true });

    try {
      fs.renameSync = function renameDuringFinalPublication(sourcePathname, destinationPathname) {
        const temporaryName = path.basename(sourcePathname).replace(/^\./, '');
        if (!swapped
            && path.basename(destinationPathname) === targetName
            && temporaryName.startsWith(`${targetName}.`)) {
          swapped = true;
          fs.linkSync(sourcePathname, path.join(artifactRoot, path.basename(sourcePathname)));
          originalRenameSync.call(fs, outputParent, movedOutputParent);
          fs.symlinkSync(artifactRoot, outputParent, 'dir');
        }
        return originalRenameSync.call(fs, sourcePathname, destinationPathname);
      };

      const result = await runBaseDomainAutomaticOperation(createLiveBaseAutomaticRunnerOptions(fixture, {
        argv: ['--domain=items', '--source-mode=local', `--progress-path=${fixture.progressPath}`, `--output=${outputPath}`],
        executeOperationImpl: async () => {
          preservedSource = fs.readFileSync(sourcePath, 'utf8');
          preservedBundle = fs.readFileSync(bundlePath, 'utf8');
          return { status: 'completed' };
        },
      }));

      assert.equal(swapped, true);
      assert.equal(fs.readFileSync(sourcePath, 'utf8'), preservedSource);
      assert.equal(fs.readFileSync(bundlePath, 'utf8'), preservedBundle);
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(movedOutputParent, targetName), 'utf8')), result);
    } finally {
      fs.renameSync = originalRenameSync;
      fs.rmSync(fixture.repoRoot, { recursive: true, force: true });
      fs.rmSync(outputRoot, { recursive: true, force: true });
    }
  }
});

test('base automatic result publication rejects protected artifact relocation before binding the external output directory', async () => {
  for (const targetName of ['source.json', 'bundle.json']) {
    const fixture = createLiveBaseAutomaticRunnerFixture();
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'base-output-prebind-artifact-relocation-'));
    const outputParent = path.join(outputRoot, 'result');
    const outputPath = path.join(outputParent, targetName);
    const { artifactRoot, sourcePath, bundlePath } = baseAutomaticArtifactPaths(fixture);
    const originalOpenSync = fs.openSync;
    const originalRenameSync = fs.renameSync;
    let relocated = false;
    let preservedSource = null;
    let preservedBundle = null;
    fs.mkdirSync(outputParent, { recursive: true });

    try {
      fs.openSync = function openDuringOutputDirectoryBinding(pathname, flags, mode) {
        if (!relocated && String(pathname).endsWith(`/${path.basename(outputParent)}`)) {
          relocated = true;
          originalRenameSync.call(fs, artifactRoot, outputParent);
        }
        return originalOpenSync.call(fs, pathname, flags, mode);
      };

      await assert.rejects(
        runBaseDomainAutomaticOperation(createLiveBaseAutomaticRunnerOptions(fixture, {
          argv: ['--domain=items', '--source-mode=local', `--progress-path=${fixture.progressPath}`, `--output=${outputPath}`],
          executeOperationImpl: async () => {
            preservedSource = fs.readFileSync(sourcePath, 'utf8');
            preservedBundle = fs.readFileSync(bundlePath, 'utf8');
            return { status: 'completed' };
          },
        })),
        /protected base automatic artifact directory identity changed or is unavailable/i,
      );

      assert.equal(relocated, true);
      assert.equal(fs.readFileSync(path.join(outputParent, 'source.json'), 'utf8'), preservedSource);
      assert.equal(fs.readFileSync(path.join(outputParent, 'bundle.json'), 'utf8'), preservedBundle);
    } finally {
      fs.openSync = originalOpenSync;
      fs.rmSync(fixture.repoRoot, { recursive: true, force: true });
      fs.rmSync(outputRoot, { recursive: true, force: true });
    }
  }
});

test('base automatic result publication does not follow pre-created external temporary symlinks into protected artifacts', async () => {
  const originalDateNow = Date.now;
  const fixedNow = 1_700_000_000_000;
  try {
    Date.now = () => fixedNow;
    for (const targetName of ['source.json', 'bundle.json']) {
      const fixture = createLiveBaseAutomaticRunnerFixture();
      const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'base-output-temporary-symlink-'));
      const outputPath = path.join(outputRoot, targetName);
      const { sourcePath, bundlePath } = baseAutomaticArtifactPaths(fixture);
      const protectedPath = targetName === 'source.json' ? sourcePath : bundlePath;
      const temporaryPath = `${outputPath}.${process.pid}.${fixedNow}.tmp`;
      let preservedSource = null;
      let preservedBundle = null;
      fs.symlinkSync(protectedPath, temporaryPath);

      try {
        const result = await runBaseDomainAutomaticOperation(createLiveBaseAutomaticRunnerOptions(fixture, {
          argv: ['--domain=items', '--source-mode=local', `--progress-path=${fixture.progressPath}`, `--output=${outputPath}`],
          executeOperationImpl: async () => {
            preservedSource = fs.readFileSync(sourcePath, 'utf8');
            preservedBundle = fs.readFileSync(bundlePath, 'utf8');
            return { status: 'completed' };
          },
        }));

        assert.equal(fs.readFileSync(sourcePath, 'utf8'), preservedSource);
        assert.equal(fs.readFileSync(bundlePath, 'utf8'), preservedBundle);
        assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, 'utf8')), result);
      } finally {
        fs.rmSync(fixture.repoRoot, { recursive: true, force: true });
        fs.rmSync(outputRoot, { recursive: true, force: true });
      }
    }
  } finally {
    Date.now = originalDateNow;
  }
});

test('base automatic operation preserves a safe external output path', async () => {
  const fixture = createLiveBaseAutomaticRunnerFixture();
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'base-safe-output-'));
  const outputPath = path.join(outputRoot, 'result.json');

  try {
    const result = await runBaseDomainAutomaticOperation(createLiveBaseAutomaticRunnerOptions(fixture, {
      argv: ['--domain=items', '--source-mode=local', `--progress-path=${fixture.progressPath}`, `--output=${outputPath}`],
    }));

    assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, 'utf8')), result);
  } finally {
    fs.rmSync(fixture.repoRoot, { recursive: true, force: true });
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});

test('base automatic operation rejects unavailable external output publication before runner side effects', async () => {
  const fixture = createLiveBaseAutomaticRunnerFixture();
  const outputPath = path.join(fixture.repoRoot, 'external-result.json');
  const { artifactRoot } = baseAutomaticArtifactPaths(fixture);
  let connections = 0;
  let sourceRuns = 0;

  try {
    await assert.rejects(
      runBaseDomainAutomaticOperation(createLiveBaseAutomaticRunnerOptions(fixture, {
        argv: ['--domain=items', '--source-mode=live', `--progress-path=${fixture.progressPath}`, `--output=${outputPath}`],
        externalOutputPlatform: 'darwin',
        mysqlModule: {
          createConnection: async () => {
            connections += 1;
            return fixture.connection;
          },
        },
        runSourceImpl: async () => { sourceRuns += 1; },
      })),
      /secure external --output publication is unavailable on this platform/i,
    );

    assert.equal(connections, 0);
    assert.equal(sourceRuns, 0);
    assert.equal(fs.existsSync(artifactRoot), false);
    assert.equal(fs.existsSync(outputPath), false);
  } finally {
    fs.rmSync(fixture.repoRoot, { recursive: true, force: true });
  }
});

test('base committed output fails closed when the protected artifact identity is unavailable', async () => {
  const fixture = createLiveBaseAutomaticRunnerFixture();
  const outputPath = path.join(fixture.repoRoot, 'external-result.json');
  const { artifactRoot } = baseAutomaticArtifactPaths(fixture);

  try {
    await assert.rejects(
      runBaseDomainAutomaticOperation(createLiveBaseAutomaticRunnerOptions(fixture, {
        argv: ['--domain=items', '--source-mode=local', `--progress-path=${fixture.progressPath}`, `--output=${outputPath}`],
        isCommittedRunImpl: async () => true,
      })),
      /protected base automatic artifact directory identity changed or is unavailable/i,
    );

    assert.equal(fs.existsSync(artifactRoot), false);
    assert.equal(fs.existsSync(outputPath), false);
  } finally {
    fs.rmSync(fixture.repoRoot, { recursive: true, force: true });
  }
});

test('base automatic operation refuses an existing run-specific artifact path before downstream work', async () => {
  const fixture = createLiveBaseAutomaticRunnerFixture();
  const runId = automaticRunId('items', fixture.sourceFingerprint);
  const artifactRoot = path.join(
    fixture.repoRoot,
    'reports',
    'authorization',
    'canonical',
    'automatic',
    'items',
    runId,
  );
  const sourcePath = path.join(artifactRoot, 'source.json');
  const preservedSource = '{"existing":"must-not-be-replaced"}\n';
  fs.mkdirSync(artifactRoot, { recursive: true, mode: 0o700 });
  fs.writeFileSync(sourcePath, preservedSource, { mode: 0o600 });
  let policyReads = 0;
  let executionCalls = 0;

  try {
    await assert.rejects(
      runBaseDomainAutomaticOperation(createLiveBaseAutomaticRunnerOptions(fixture, {
        isCommittedRunImpl: async () => false,
        readCurrentContextImpl: async () => {
          policyReads += 1;
          throw new Error('policy context must not be read after artifact collision');
        },
        executeOperationImpl: async () => {
          executionCalls += 1;
          return { status: 'completed' };
        },
      })),
      /base automatic artifact directory already exists; overwrite is forbidden/i,
    );

    assert.equal(policyReads, 0);
    assert.equal(executionCalls, 0);
    assert.equal(fs.readFileSync(sourcePath, 'utf8'), preservedSource);
  } finally {
    fs.rmSync(fixture.repoRoot, { recursive: true, force: true });
  }
});

test('base automatic source and bundle artifacts use a private run-specific path', async () => {
  const fixture = createLiveBaseAutomaticRunnerFixture();
  const runId = automaticRunId('items', fixture.sourceFingerprint);
  const artifactRoot = path.join(
    fixture.repoRoot,
    'reports',
    'authorization',
    'canonical',
    'automatic',
    'items',
    runId,
  );
  const sourcePath = path.join(artifactRoot, 'source.json');
  const bundlePath = path.join(artifactRoot, 'bundle.json');
  const relativeSourcePath = path.posix.join(
    'reports',
    'authorization',
    'canonical',
    'automatic',
    'items',
    runId,
    'source.json',
  );

  try {
    const result = await runBaseDomainAutomaticOperation(createLiveBaseAutomaticRunnerOptions(fixture));

    assert.equal(result.status, 'completed');
    assert.equal(fs.statSync(artifactRoot).mode & 0o777, 0o700);
    assert.equal(fs.statSync(sourcePath).mode & 0o777, 0o600);
    assert.equal(fs.statSync(bundlePath).mode & 0o777, 0o600);
    assert.equal(JSON.parse(fs.readFileSync(bundlePath, 'utf8')).source.path, relativeSourcePath);
    assert.equal(fs.existsSync(path.join(
      fixture.repoRoot,
      'reports',
      'authorization',
      'canonical',
      `automation-items-${runId}.source.json`,
    )), false);
  } finally {
    fs.rmSync(fixture.repoRoot, { recursive: true, force: true });
  }
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

test('base runner progress preserves V2 identity and advances heartbeat sequence', async (t) => {
  assert.equal(typeof baseOperationModule.createBaseRunnerProgress, 'function');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'base-runner-progress-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
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

test('base automatic operations freeze a completed source progress snapshot before database apply', (t) => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'base-source-progress-snapshot-'));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  const progressPath = path.join(repoRoot, 'reports/crawler-monitor/v2/attempt-1/progress.json');
  fs.mkdirSync(path.dirname(progressPath), { recursive: true });
  fs.writeFileSync(progressPath, JSON.stringify({ status: 'completed', actionId: 'wiki-npcs-refresh' }), { mode: 0o600 });

  const snapshotPath = baseOperationModule.freezeBaseSourceProgressSnapshot({
    repoRoot,
    domain: 'npcs',
    runId: 'npcs_l1_auto_abc12345',
    progressPath,
  });

  assert.match(snapshotPath, /reports[\\/]runtime[\\/]l1-reconciliation[\\/]npcs[\\/]npcs_l1_auto_abc12345[\\/]source-progress\.json$/);
  assert.deepEqual(JSON.parse(fs.readFileSync(snapshotPath, 'utf8')), {
    status: 'completed',
    actionId: 'wiki-npcs-refresh',
  });
  assert.equal(fs.statSync(snapshotPath).mode & 0o777, 0o600);
});

test('base automatic bundle takes source freshness from the terminal progress artifact', (t) => {
  assert.equal(typeof baseOperationModule.readCompletedBaseSourceProgressTimestamp, 'function');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'base-source-progress-time-'));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  const progressPath = path.join(repoRoot, 'reports/crawler-monitor/v2/attempt-1/progress.json');
  fs.mkdirSync(path.dirname(progressPath), { recursive: true });
  fs.writeFileSync(progressPath, JSON.stringify({
    status: 'completed',
    generatedAt: '2026-08-31T09:59:00.000Z',
    lastHeartbeatAt: '2026-08-31T09:59:01.000Z',
  }), { mode: 0o600 });

  assert.equal(baseOperationModule.readCompletedBaseSourceProgressTimestamp({ repoRoot, progressPath }), '2026-08-31T09:59:00.000Z');
});

test('base source progress readers reject a symbolic-link ancestor', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'base-source-progress-link-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'base-source-progress-outside-'));
  const link = path.join(repoRoot, 'source-link');
  const progressPath = path.join(link, 'progress.json');
  try {
    fs.writeFileSync(path.join(outside, 'progress.json'), JSON.stringify({
      status: 'completed',
      generatedAt: '2026-08-31T09:59:00.000Z',
    }));
    fs.symlinkSync(outside, link, 'dir');

    assert.throws(
      () => baseOperationModule.readCompletedBaseSourceProgressTimestamp({ repoRoot, progressPath }),
      /symbolic-link ancestor/i,
    );
    assert.throws(
      () => baseOperationModule.freezeBaseSourceProgressSnapshot({
        repoRoot,
        domain: 'items',
        runId: 'items_l1_auto_source_link',
        progressPath,
      }),
      /symbolic-link ancestor/i,
    );
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('base source progress snapshot rejects a symbolic-link target ancestor', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'base-source-snapshot-link-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'base-source-snapshot-outside-'));
  const progressPath = path.join(repoRoot, 'input', 'progress.json');
  const targetLink = path.join(repoRoot, 'reports', 'runtime', 'l1-reconciliation');
  try {
    fs.mkdirSync(path.dirname(progressPath), { recursive: true });
    fs.writeFileSync(progressPath, JSON.stringify({
      status: 'completed',
      generatedAt: '2026-08-31T09:59:00.000Z',
    }));
    fs.mkdirSync(path.dirname(targetLink), { recursive: true });
    fs.symlinkSync(outside, targetLink, 'dir');

    assert.throws(
      () => baseOperationModule.freezeBaseSourceProgressSnapshot({
        repoRoot,
        domain: 'items',
        runId: 'items_l1_auto_target_link',
        progressPath,
      }),
      /symbolic-link ancestor/i,
    );
    assert.deepEqual(fs.readdirSync(outside), []);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('base automatic runner completes source progress and carries its timestamp into the read-only L2 bundle', async (t) => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'base-automatic-source-time-'));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  const standardizedPath = path.join(repoRoot, 'data', 'standardized', 'items.standardized.json');
  const progressPath = path.join(repoRoot, 'reports', 'crawler-monitor', 'v2', 'attempt-1', 'progress.json');
  fs.mkdirSync(path.dirname(standardizedPath), { recursive: true });
  fs.mkdirSync(path.dirname(progressPath), { recursive: true });
  fs.writeFileSync(standardizedPath, JSON.stringify({ entity: 'items', records: [] }));
  const activation = {
    decisionIdentity: 'activation-1', packetHash: `sha256:${'a'.repeat(64)}`, policySetHash: `sha256:${'b'.repeat(64)}`,
    actor: 'admin', reason: 'test', authorizationReference: 'test',
    authorizedAt: '2000-01-01T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z',
  };
  const policyScope = [{ databaseRole: 'local', table: 'items', fieldGroup: 'all_columns' }];
  const current = {
    currentLevel: 'L2', operationalState: 'ACTIVE', policyVersion: 2,
    policyHash: `sha256:${'c'.repeat(64)}`, policySetHash: activation.policySetHash,
    policyJson: {
      schemaVersion: 1, level: 'L2', requireSnapshot: true, anomalyAction: 'CIRCUIT_OPEN',
      ratioInsertCap: 0.1, ratioUpdateCap: 0.1, ratioRelationshipDeleteCap: 0.05, ratioDisableCap: 0.005,
      absoluteInsertCap: 500, absoluteUpdateCap: 500, absoluteRelationshipDeleteCap: 200, absoluteDisableCap: 20,
      sourceFreshnessMaxAgeMinutes: 60, ownedTables: policyScope,
    },
    ownedTables: policyScope,
    baseline: {
      environmentId: 'local',
      generations: [{ ...policyScope[0], generation: 0 }],
      projectionHash: `sha256:${'d'.repeat(64)}`,
    },
  };
  const connection = { query: async () => [[activation]], end: async () => {} };
  let capturedBundle = null;
  let capturedExecutionTime = null;

  const result = await runBaseDomainAutomaticOperation({
    argv: ['--domain=items', '--source-mode=local', `--progress-path=${progressPath}`],
    env: { ...databaseEnv(), WORKTREE_ROOT: repoRoot },
    now: '2026-08-31T09:00:00.000Z',
    nowProvider: () => '2026-08-31T09:00:00.000Z',
    mysqlModule: { createConnection: async () => connection },
    readSourceFingerprintImpl: () => `sha256:${'e'.repeat(64)}`,
    readCurrentContextImpl: async () => current,
    isCommittedRunImpl: async () => false,
    createAdapterImpl: () => ({ marker: 'adapter' }),
    executeOperationImpl: async ({ bundle, now }) => {
      capturedBundle = bundle;
      capturedExecutionTime = now;
      return { status: 'completed' };
    },
  });

  const snapshotPath = path.join(
    repoRoot,
    'reports',
    'runtime',
    'l1-reconciliation',
    'items',
    capturedBundle.runId,
    'source-progress.json',
  );
  const progress = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const sourceBytes = fs.readFileSync(path.join(repoRoot, capturedBundle.source.path));
  assert.equal(
    capturedBundle.source.sha256,
    `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`,
    'automatic Base bundle source hash must bind the published source bytes',
  );
  assert.equal(result.status, 'completed');
  assert.equal(progress.status, 'completed');
  assert.equal(capturedBundle.importPlan.sourceCheckedAt, progress.generatedAt);
  assert.equal(capturedExecutionTime, progress.generatedAt);
});

test('base automatic runner revalidates authorization with a fresh execution time after source work', async (t) => {
  const fixture = createLiveBaseAutomaticRunnerFixture();
  t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
  const startedAt = new Date().toISOString();
  const freshExecutionTime = new Date(Date.parse(startedAt) + 60_000).toISOString();
  const activation = {
    decisionIdentity: 'activation-delayed-base',
    packetHash: `sha256:${'a'.repeat(64)}`,
    policySetHash: `sha256:${'b'.repeat(64)}`,
    actor: 'admin',
    reason: 'delayed test',
    authorizationReference: 'test',
    authorizedAt: new Date(Date.parse(startedAt) - 60_000).toISOString(),
    expiresAt: freshExecutionTime,
  };
  let executeCalls = 0;
  let capturedExecutionTime = null;

  await assert.rejects(
    runBaseDomainAutomaticOperation({
      ...createLiveBaseAutomaticRunnerOptions(fixture, {
        argv: ['--domain=items', '--source-mode=live', `--progress-path=${fixture.progressPath}`],
        now: startedAt,
        nowProvider: () => freshExecutionTime,
        mysqlModule: { createConnection: async () => ({ query: async () => [[activation]], end: async () => {} }) },
        executeOperationImpl: async ({ now }) => {
          executeCalls += 1;
          capturedExecutionTime = now;
          return { status: 'completed' };
        },
      }),
    }),
    /scheduler activation .*valid|expired|revoked/i,
  );
  assert.equal(executeCalls, 0);
  assert.equal(capturedExecutionTime, null);
});

test('base automatic runner waits for a live source before downstream work', async () => {
  const fixture = createLiveBaseAutomaticRunnerFixture();
  let resolveSource;
  let markSourceStarted;
  const sourceCompletion = new Promise((resolve) => { resolveSource = resolve; });
  const sourceStarted = new Promise((resolve) => { markSourceStarted = resolve; });
  const calls = {
    source: 0,
    fingerprint: 0,
    current: 0,
    adapter: 0,
    executor: 0,
    acknowledgement: 0,
  };
  const operation = runBaseDomainAutomaticOperation({
    argv: ['--domain=items', '--source-mode=live', `--progress-path=${fixture.progressPath}`],
    env: fixture.env,
    now: '2026-08-31T09:00:00.000Z',
    mysqlModule: { createConnection: async () => fixture.connection },
    runSourceImpl: () => {
      calls.source += 1;
      markSourceStarted();
      return sourceCompletion;
    },
    readSourceFingerprintImpl: () => {
      calls.fingerprint += 1;
      return fixture.sourceFingerprint;
    },
    readCurrentContextImpl: async () => {
      calls.current += 1;
      return fixture.current;
    },
    isCommittedRunImpl: async () => false,
    createAdapterImpl: () => {
      calls.adapter += 1;
      return { marker: 'adapter' };
    },
    executeOperationImpl: async () => {
      calls.executor += 1;
      return { status: 'completed' };
    },
    acknowledgeSourceImpl: () => { calls.acknowledgement += 1; },
  });

  try {
    await sourceStarted;
    assert.deepEqual(calls, {
      source: 1,
      fingerprint: 0,
      current: 0,
      adapter: 0,
      executor: 0,
      acknowledgement: 0,
    });

    resolveSource();
    const result = await operation;
    assert.equal(result.status, 'completed');
    assert.deepEqual(calls, {
      source: 1,
      fingerprint: 1,
      current: 1,
      adapter: 1,
      executor: 1,
      acknowledgement: 1,
    });
  } finally {
    resolveSource();
    await operation.catch(() => {});
    fs.rmSync(fixture.repoRoot, { recursive: true, force: true });
  }
});

test('base automatic runner fails closed when a live source rejects', async () => {
  const fixture = createLiveBaseAutomaticRunnerFixture();
  const calls = {
    fingerprint: 0,
    current: 0,
    adapter: 0,
    executor: 0,
    acknowledgement: 0,
  };
  try {
    await assert.rejects(
      runBaseDomainAutomaticOperation({
        argv: ['--domain=items', '--source-mode=live', `--progress-path=${fixture.progressPath}`],
        env: fixture.env,
        mysqlModule: { createConnection: async () => fixture.connection },
        runSourceImpl: async () => { throw new Error('intentional live source failure'); },
        readSourceFingerprintImpl: () => {
          calls.fingerprint += 1;
          return fixture.sourceFingerprint;
        },
        readCurrentContextImpl: async () => {
          calls.current += 1;
          return fixture.current;
        },
        isCommittedRunImpl: async () => false,
        createAdapterImpl: () => {
          calls.adapter += 1;
          return { marker: 'adapter' };
        },
        executeOperationImpl: async () => {
          calls.executor += 1;
          return { status: 'completed' };
        },
        acknowledgeSourceImpl: () => { calls.acknowledgement += 1; },
      }),
      /intentional live source failure/,
    );

    assert.equal(JSON.parse(fs.readFileSync(fixture.progressPath, 'utf8')).status, 'failed');
    assert.deepEqual(calls, {
      fingerprint: 0,
      current: 0,
      adapter: 0,
      executor: 0,
      acknowledgement: 0,
    });
  } finally {
    fs.rmSync(fixture.repoRoot, { recursive: true, force: true });
  }
});

test('base automatic runner awaits live acknowledgement before normal terminal completion', async () => {
  const fixture = createLiveBaseAutomaticRunnerFixture();
  const acknowledgement = createDeferred();
  const acknowledgementStarted = createDeferred();
  const events = [];
  let completed = false;
  const operation = runBaseDomainAutomaticOperation(createLiveBaseAutomaticRunnerOptions(fixture, {
    executeOperationImpl: async () => {
      events.push('execute');
      return { status: 'completed' };
    },
    acknowledgeSourceImpl: () => {
      events.push('acknowledgement');
      acknowledgementStarted.resolve();
      return acknowledgement.promise;
    },
  }));
  operation.then(() => { completed = true; }, () => {});

  try {
    await acknowledgementStarted.promise;
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(events, ['execute', 'acknowledgement']);
    assert.equal(completed, false);
    assert.equal(JSON.parse(fs.readFileSync(fixture.progressPath, 'utf8')).status, 'running');

    acknowledgement.resolve();
    const result = await operation;
    assert.equal(result.status, 'completed');
    assert.equal(JSON.parse(fs.readFileSync(fixture.progressPath, 'utf8')).status, 'completed');
  } finally {
    acknowledgement.resolve();
    await operation.catch(() => {});
    fs.rmSync(fixture.repoRoot, { recursive: true, force: true });
  }
});

test('base automatic runner fails closed when live acknowledgement rejects', async () => {
  const fixture = createLiveBaseAutomaticRunnerFixture();
  const acknowledgement = createDeferred();
  const acknowledgementStarted = createDeferred();
  acknowledgement.promise.catch(() => {});
  let executeCalls = 0;
  const operation = runBaseDomainAutomaticOperation(createLiveBaseAutomaticRunnerOptions(fixture, {
    executeOperationImpl: async () => {
      executeCalls += 1;
      return { status: 'completed' };
    },
    acknowledgeSourceImpl: () => {
      acknowledgementStarted.resolve();
      return acknowledgement.promise;
    },
  }));

  try {
    await acknowledgementStarted.promise;
    acknowledgement.reject(new Error('intentional acknowledgement failure'));
    await assert.rejects(operation, /intentional acknowledgement failure/);
    assert.equal(executeCalls, 1);
    assert.equal(JSON.parse(fs.readFileSync(fixture.progressPath, 'utf8')).status, 'failed');
  } finally {
    acknowledgement.resolve();
    await operation.catch(() => {});
    fs.rmSync(fixture.repoRoot, { recursive: true, force: true });
  }
});

test('base automatic DRY_RUN awaits and fails closed on live acknowledgement rejection', async () => {
  const fixture = createLiveBaseAutomaticRunnerFixture();
  const acknowledgement = createDeferred();
  const acknowledgementStarted = createDeferred();
  acknowledgement.promise.catch(() => {});
  let executeCalls = 0;
  const operation = runBaseDomainAutomaticOperation(createLiveBaseAutomaticRunnerOptions(fixture, {
    requireAutoDomainOperationImpl: () => ({
      operationId: 'automation-items-dry-run',
      databaseMode: 'DRY_RUN',
      ownedTables: fixture.current.ownedTables,
    }),
    executeOperationImpl: async () => {
      executeCalls += 1;
      return { status: 'completed' };
    },
    acknowledgeSourceImpl: () => {
      acknowledgementStarted.resolve();
      return acknowledgement.promise;
    },
  }));

  try {
    await acknowledgementStarted.promise;
    acknowledgement.reject(new Error('intentional dry-run acknowledgement failure'));
    await assert.rejects(operation, /intentional dry-run acknowledgement failure/);
    assert.equal(executeCalls, 0);
    assert.equal(JSON.parse(fs.readFileSync(fixture.progressPath, 'utf8')).status, 'failed');
  } finally {
    acknowledgement.resolve();
    await operation.catch(() => {});
    fs.rmSync(fixture.repoRoot, { recursive: true, force: true });
  }
});

test('local base reconciliation does not acknowledge the live canonical manifest', async (t) => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'base-local-no-ack-'));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
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
    authorizedAt: '2000-01-01T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z',
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
    isCommittedRunImpl: async () => true,
  });

  assert.equal(fs.existsSync(manifestPath), false);
  assert.equal(result.sourceAcknowledged, false);
  assert.equal(result.sourceAcknowledgementReason, 'local_source_not_acknowledged');
});

function databaseEnv() {
  return {
    TERRAPEDIA_CRAWLER_STATE_STORE_EPOCH: 'epoch-1',
    TERRAPEDIA_CRAWLER_QUEUE_ID: 'queue-1',
    TERRAPEDIA_CRAWLER_ATTEMPT_ID: 'attempt-1',
    TERRAPEDIA_CRAWLER_FENCE_TOKEN: '1',
    TERRAPEDIA_CRAWLER_INITIAL_STATE_VERSION: '1',
    TERRAPEDIA_DB_HOST: '127.0.0.1',
    TERRAPEDIA_DB_PORT: '13306',
    TERRAPEDIA_DB_USERNAME: 'root',
    TERRAPEDIA_DB_PASSWORD: 'root',
    TERRAPEDIA_DB_NAME: 'terria_v1_local',
  };
}

function schedulerBaseEnv(fixture, overrides = {}) {
  return {
    ...fixture.env,
    TERRAPEDIA_CRAWLER_REQUESTED_BY: 'v2-automation',
    TERRAPEDIA_CRAWLER_SOURCE_FINGERPRINT: fixture.sourceFingerprint,
    TERRAPEDIA_CRAWLER_SOURCE_RUN_IDENTITY: fixture.sourceRunIdentity,
    TERRAPEDIA_CRAWLER_SOURCE_CONTENT_IDENTITY: fixture.sourceContentIdentity,
    ...overrides,
  };
}

test('base source executes reviewed code when the durable data root contains different child bytes', (t) => {
  const fixture = createLiveBaseAutomaticRunnerFixture();
  const codeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'base-reviewed-code-'));
  t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
  t.after(() => fs.rmSync(codeRoot, { recursive: true, force: true }));
  const sourceRoot = path.resolve(import.meta.dirname, '../..');
  const manifest = buildCanonicalOperationExecutionManifest({ repoRoot: sourceRoot, operationId: 'canonical-crawler-v2-scheduler-activation' });
  for (const entry of manifest.codeBundleEntries) {
    const destination = path.join(codeRoot, entry.path);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(sourceRoot, entry.path), destination);
  }
  for (const [root, selectedCode] of [[codeRoot, 'reviewed'], [fixture.repoRoot, 'stale-primary']]) {
    const child = path.join(root, 'pipelines/workflow/run-wiki-sync.mjs');
    fs.mkdirSync(path.dirname(child), { recursive: true });
    fs.writeFileSync(child, `import fs from 'node:fs'; import path from 'node:path';
      const env = process.env;
      fs.writeFileSync(path.join(env.WORKTREE_ROOT, 'selected-code.json'), JSON.stringify({ selectedCode: ${JSON.stringify(selectedCode)}, cwd: process.cwd() }));
      fs.writeFileSync(env.TERRAPEDIA_CRAWLER_PROGRESS_PATH, JSON.stringify({ status: 'completed', generatedAt: ${JSON.stringify(fixture.sourceRunIdentity)},
        stateStoreEpoch: env.TERRAPEDIA_CRAWLER_STATE_STORE_EPOCH, queueId: env.TERRAPEDIA_CRAWLER_QUEUE_ID, attemptId: env.TERRAPEDIA_CRAWLER_ATTEMPT_ID }));`);
  }
  const activation = { decisionIdentity: 'activation-1', packetHash: `sha256:${'a'.repeat(64)}`,
    policySetHash: fixture.current.policySetHash, actor: 'admin', reason: 'test', authorizationReference: 'test',
    authorizedAt: '2000-01-01T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z' };
  const script = `const { runBaseDomainAutomaticOperation } = await import(${JSON.stringify(pathToFileURL(path.join(codeRoot, 'pipelines/automation/run-base-domain-automatic-operation.mjs')).href)});
    await runBaseDomainAutomaticOperation({ argv: ['--domain=items', ${JSON.stringify(`--progress-path=${fixture.progressPath}`)}],
      mysqlModule: { createConnection: async () => ({ query: async () => [[${JSON.stringify(activation)}]], end: async () => {} }) },
      readSourceFingerprintImpl: () => ${JSON.stringify(fixture.sourceFingerprint)}, readCurrentContextImpl: async () => (${JSON.stringify(fixture.current)}),
      isCommittedRunImpl: async () => false, createAdapterImpl: () => ({}), executeOperationImpl: async () => ({ status: 'completed' }), acknowledgeSourceImpl: () => {} });`;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: fixture.repoRoot, env: { ...process.env, ...schedulerBaseEnv(fixture) }, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fixture.repoRoot, 'selected-code.json'))), { selectedCode: 'reviewed', cwd: fixture.repoRoot });
  assert.equal(JSON.parse(fs.readFileSync(fixture.progressPath)).status, 'completed');
  assert.equal(fs.existsSync(path.join(fixture.repoRoot, 'reports/authorization/canonical/automatic/items')), true);
  assert.equal(fs.existsSync(path.join(codeRoot, 'reports')), false);
  assert.equal(fs.existsSync(path.join(codeRoot, 'data/generated')), false);
});

for (const target of ['old-source', 'old-bundle', 'old-progress', 'old-reconciliation', 'other-domain', 'automatic-root', 'reconciliation-root', 'reports-ancestor']) {
  test(`base retry output cannot replace immutable ${target} artifacts before apply or acknowledgement`, async (t) => {
    const fixture = createLiveBaseAutomaticRunnerFixture();
    t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
    let originalBundle;
    await assert.rejects(runBaseDomainAutomaticOperation(createLiveBaseAutomaticRunnerOptions(fixture, {
      env: schedulerBaseEnv(fixture),
      executeOperationImpl: async ({ bundle }) => { originalBundle = bundle; throw new Error('retain failed attempt'); },
    })), /retain failed attempt/);
    const paths = {
      'old-source': originalBundle.source.path,
      'old-bundle': `${path.dirname(originalBundle.source.path)}/bundle.json`,
      'old-progress': `${path.dirname(originalBundle.reconciliationInput.outputPath)}/source-progress.json`,
      'old-reconciliation': originalBundle.reconciliationInput.outputPath,
      'other-domain': 'reports/authorization/canonical/automatic/npcs/retained/source.json',
      'automatic-root': 'reports/authorization/canonical/automatic',
      'reconciliation-root': 'reports/runtime/l1-reconciliation',
      'reports-ancestor': 'reports',
    };
    const outputPath = path.join(fixture.repoRoot, paths[target]);
    if (['old-reconciliation', 'other-domain'].includes(target)) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, '{"retained":true}\n', { mode: 0o600 });
    }
    const originalSource = fs.readFileSync(path.join(fixture.repoRoot, originalBundle.source.path));
    const originalOutput = fs.statSync(outputPath).isFile() ? fs.readFileSync(outputPath) : null;
    let imports = 0;
    let acknowledgements = 0;
    await assert.rejects(runBaseDomainAutomaticOperation(createLiveBaseAutomaticRunnerOptions(fixture, {
      argv: ['--domain=items', `--progress-path=${fixture.progressPath}`, `--output=${outputPath}`],
      env: schedulerBaseEnv(fixture, { TERRAPEDIA_CRAWLER_ATTEMPT_ID: 'attempt-2' }),
      executeOperationImpl: async () => { imports += 1; return { status: 'completed' }; },
      acknowledgeSourceImpl: () => { acknowledgements += 1; },
    })), /--output.*overlap.*(protected|immutable)/);
    assert.equal(imports, 0);
    assert.equal(acknowledgements, 0);
    assert.deepEqual(fs.readFileSync(path.join(fixture.repoRoot, originalBundle.source.path)), originalSource);
    if (originalOutput) assert.deepEqual(fs.readFileSync(outputPath), originalOutput);
  });
}

test('base scheduler result still publishes to its supervisor attempt report', async (t) => {
  const fixture = createLiveBaseAutomaticRunnerFixture();
  t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
  const outputPath = path.join(fixture.repoRoot, 'reports/crawler-monitor/v2/attempt-1/report.json');
  const result = await runBaseDomainAutomaticOperation(createLiveBaseAutomaticRunnerOptions(fixture, {
    argv: ['--domain=items', `--progress-path=${fixture.progressPath}`, `--output=${outputPath}`],
    env: schedulerBaseEnv(fixture),
  }));
  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath)), result);
});

test('base runner rejects sibling source progress before replacing it with runner progress', async (t) => {
  const fixture = createLiveBaseAutomaticRunnerFixture();
  t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
  let imports = 0;
  await assert.rejects(runBaseDomainAutomaticOperation(createLiveBaseAutomaticRunnerOptions(fixture, {
    env: schedulerBaseEnv(fixture),
    runSourceImpl: async ({ progressPath }) => {
      fs.writeFileSync(progressPath, JSON.stringify({
        status: 'completed', generatedAt: fixture.sourceRunIdentity,
        stateStoreEpoch: 'epoch-1', queueId: 'queue-1', attemptId: 'sibling-attempt',
      }));
    },
    executeOperationImpl: async () => { imports += 1; return { status: 'completed' }; },
  })), /source progress.*attempt identity/);
  assert.equal(imports, 0);
});

test('automatic adapter rejects sibling progress before opening a transaction', async (t) => {
  const fixture = createLiveBaseAutomaticRunnerFixture();
  t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
  let frozen;
  let bundlePath;
  let progressPath;
  await runBaseDomainAutomaticOperation(createLiveBaseAutomaticRunnerOptions(fixture, {
    env: schedulerBaseEnv(fixture),
    createAdapterImpl: (_connection, input) => { ({ bundlePath, progressPath } = input); return {}; },
    executeOperationImpl: async ({ bundle }) => { frozen = bundle; return { status: 'completed' }; },
  }));
  const connection = { beginTransaction: () => assert.fail('must not begin'), query: () => assert.fail('must not query') };
  assert.doesNotThrow(() => createMysqlSupplementaryL1Adapter(connection, { repoRoot: fixture.repoRoot, bundlePath, progressPath }));
  const progress = JSON.parse(fs.readFileSync(progressPath));
  assert.equal(progress.attemptId, frozen.importPlan.automaticAttemptIdentity.attemptId);
  fs.writeFileSync(progressPath, JSON.stringify({ ...progress, attemptId: 'sibling-attempt' }), { mode: 0o600 });
  assert.throws(() => createMysqlSupplementaryL1Adapter(connection, {
    repoRoot: fixture.repoRoot, bundlePath, progressPath,
  }), /progress.*attempt identity/);
  fs.writeFileSync(progressPath, JSON.stringify(progress), { mode: 0o600 });
  const injected = buildSupplementaryL1Bundle({
    ...frozen, reconciliationInput: { ...frozen.reconciliationInput,
      attemptStatePath: 'reports/runtime/l1-reconciliation/items/sibling/attempt-state.json' },
  });
  fs.writeFileSync(bundlePath, JSON.stringify(injected), { mode: 0o600 });
  assert.throws(() => createMysqlSupplementaryL1Adapter(connection, {
    repoRoot: fixture.repoRoot, bundlePath, progressPath,
  }), /exact L1 run path/);
  fs.writeFileSync(bundlePath, JSON.stringify(frozen), { mode: 0o600 });
  const canonicalResult = path.join(path.dirname(bundlePath), 'result.json');
  const cli = (output) => runSupplementaryL1OperationCli({
    argv: ['--apply=true', `--input=${bundlePath}`, `--output=${output}`, `--operation-id=${frozen.operationId}`],
    env: { WORKTREE_ROOT: fixture.repoRoot },
    loadAuthorizationContextImpl: () => { throw new Error('valid paths reached authorization'); },
  });
  await assert.rejects(cli(canonicalResult), /valid paths reached authorization/);
  await assert.rejects(cli(path.join(fixture.repoRoot, 'reports/authorization/canonical/automatic/items', frozen.runId, 'result.json')), /canonical run-specific automatic result/);
  fs.writeFileSync(path.join(fixture.repoRoot, frozen.reconciliationInput.attemptStatePath), JSON.stringify({
    automaticAttemptIdentity: { ...frozen.importPlan.automaticAttemptIdentity, attemptId: 'sibling-attempt' },
  }), { mode: 0o600 });
  assert.throws(() => createMysqlSupplementaryL1Adapter(connection, {
    repoRoot: fixture.repoRoot, bundlePath, progressPath,
  }), /already exists|overwrite/);
});

for (const corruption of [null, 'hash', 'source-triple', 'attempt-tuple', 'reconciliation', 'policy', 'policy-set']) {
  test(`base scheduler committed retry ${corruption ? `rejects corrupted ${corruption}` : 'verifies original evidence without importing'}`, async (t) => {
    const fixture = createLiveBaseAutomaticRunnerFixture();
    t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
    let originalBundle;
    await runBaseDomainAutomaticOperation(createLiveBaseAutomaticRunnerOptions(fixture, {
      env: schedulerBaseEnv(fixture),
      executeOperationImpl: async ({ bundle }) => { originalBundle = bundle; return { status: 'completed' }; },
    }));
    const bundlePath = path.join(fixture.repoRoot, path.dirname(originalBundle.source.path), 'bundle.json');
    if (['attempt-tuple', 'reconciliation', 'policy'].includes(corruption)) {
      const modified = buildSupplementaryL1Bundle({
        ...originalBundle,
        ...(corruption === 'attempt-tuple' ? { importPlan: {
          ...originalBundle.importPlan, automaticAttemptIdentity: { ...originalBundle.importPlan.automaticAttemptIdentity, attemptId: 'sibling-attempt' },
        } } : {}),
        ...(corruption === 'reconciliation' ? { reconciliationInput: {
          ...originalBundle.reconciliationInput, attemptStatePath: 'reports/runtime/l1-reconciliation/items/sibling/attempt-state.json',
        } } : {}),
        ...(corruption === 'policy' ? { policy: { ...originalBundle.policy, policyVersion: 99 } } : {}),
      });
      fs.writeFileSync(bundlePath, `${JSON.stringify(modified)}\n`, { mode: 0o600 });
    }
    const bytes = fs.readFileSync(bundlePath);
    const manifest = {
      automaticSourceFingerprint: fixture.sourceFingerprint,
      sourceDispatchIdentity: corruption === 'source-triple'
        ? { ...originalBundle.sourceDispatchIdentity, sourceRunIdentity: '2026-08-31T08:00:00.000Z' }
        : originalBundle.sourceDispatchIdentity,
      source: originalBundle.source, privatePath: bundlePath,
      bundleFileHash: corruption === 'hash' ? `sha256:${'0'.repeat(64)}` : `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    };
    const query = fixture.connection.query;
    fixture.connection.query = async (sql, ...args) => sql.includes('JOIN crawler_automation_apply')
      ? [[{ domainId: 'items', manifestJson: manifest }]] : query(sql, ...args);
    let acknowledged = 0;
    const current = {
      ...fixture.current,
      policyJson: Object.fromEntries(Object.entries(fixture.current.policyJson).reverse()),
      ...(corruption === 'policy-set' ? { policySetHash: `sha256:${'0'.repeat(64)}` } : {}),
    };
    const promise = runBaseDomainAutomaticOperation(createLiveBaseAutomaticRunnerOptions(fixture, {
      env: schedulerBaseEnv(fixture, { TERRAPEDIA_CRAWLER_ATTEMPT_ID: 'attempt-2' }),
      isCommittedRunImpl: undefined,
      readCurrentContextImpl: async () => current,
      executeOperationImpl: async () => { assert.fail('committed retry must not import'); },
      acknowledgeSourceImpl: () => { acknowledged += 1; },
    }));
    if (corruption) {
      await assert.rejects(promise, /committed.*hash|manifest.*hash|source dispatch identity|canonical run-specific|exact L1 run path|policy/);
      assert.equal(acknowledged, 0);
    } else {
      assert.equal((await promise).reconciledCommittedRun, true);
      assert.equal(acknowledged, 1);
    }
    assert.deepEqual(fs.readFileSync(bundlePath), bytes);
  });
}

for (const changedProbe of [false, true]) {
  test(`base retry preserves failed artifacts with ${changedProbe ? 'a fresh probe' : 'the same source triple'} and a new attempt`, async (t) => {
    const fixture = createLiveBaseAutomaticRunnerFixture();
    t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
    const bundles = [];
    const options = (env) => createLiveBaseAutomaticRunnerOptions(fixture, {
      env,
      executeOperationImpl: async ({ bundle }) => {
        bundles.push(bundle);
        throw new Error('retained preapply failure');
      },
    });
    await assert.rejects(runBaseDomainAutomaticOperation(options(schedulerBaseEnv(fixture))), /retained preapply failure/);
    const originalPath = path.join(fixture.repoRoot, bundles[0].source.path);
    const originalBytes = fs.readFileSync(originalPath);
    if (changedProbe) {
      const state = JSON.parse(fs.readFileSync(fixture.sourceStatePath));
      state.checkedAt = '2026-08-31T09:01:00.000Z';
      state.sources[0].checkedAt = state.checkedAt;
      fs.writeFileSync(fixture.sourceStatePath, JSON.stringify(state));
      fixture.sourceRunIdentity = state.checkedAt;
      fixture.sourceContentIdentity = `sha256:${createHash('sha256').update(JSON.stringify(state)).digest('hex')}`;
    }
    const retryEnv = schedulerBaseEnv(fixture, { TERRAPEDIA_CRAWLER_ATTEMPT_ID: 'attempt-2' });
    await assert.rejects(runBaseDomainAutomaticOperation(options(retryEnv)), /retained preapply failure/);
    assert.equal(bundles[0].runId, bundles[1].runId);
    assert.notEqual(bundles[0].source.path, bundles[1].source.path);
    assert.notEqual(bundles[0].reconciliationInput.outputPath, bundles[1].reconciliationInput.outputPath);
    assert.deepEqual(bundles[1].importPlan.automaticAttemptIdentity, {
      stateStoreEpoch: 'epoch-1', queueId: 'queue-1', attemptId: 'attempt-2',
    });
    assert.deepEqual(fs.readFileSync(originalPath), originalBytes);
    await assert.rejects(runBaseDomainAutomaticOperation(options(retryEnv)), /already exists|overwrite/);
  });
}

for (const invalid of [undefined, '', '../attempt', ' attempt-1', 'a'.repeat(257)]) {
  test(`base scheduler rejects invalid immutable attempt before source work: ${String(invalid)}`, async (t) => {
    const fixture = createLiveBaseAutomaticRunnerFixture();
    t.after(() => fs.rmSync(fixture.repoRoot, { recursive: true, force: true }));
    let sourceRuns = 0;
    await assert.rejects(runBaseDomainAutomaticOperation(createLiveBaseAutomaticRunnerOptions(fixture, {
      env: schedulerBaseEnv(fixture, { TERRAPEDIA_CRAWLER_ATTEMPT_ID: invalid }),
      runSourceImpl: async () => { sourceRuns += 1; },
    })), /automatic attempt identity|attemptId/);
    assert.equal(sourceRuns, 0);
  });
}

function createLiveBaseAutomaticRunnerFixture() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'base-live-source-runner-'));
  const standardizedPath = path.join(repoRoot, 'data', 'standardized', 'items.standardized.json');
  const progressPath = path.join(repoRoot, 'reports', 'crawler-monitor', 'v2', 'attempt-1', 'progress.json');
  fs.mkdirSync(path.dirname(standardizedPath), { recursive: true });
  fs.mkdirSync(path.dirname(progressPath), { recursive: true });
  fs.writeFileSync(standardizedPath, JSON.stringify({ entity: 'items', records: [] }));
  const sourceRunIdentity = '2026-08-31T09:00:00.000Z';
  const sourceStatePath = path.join(repoRoot, 'data', 'generated', 'source-update-monitor.latest.json');
  const sourceState = {
    checkedAt: sourceRunIdentity,
    summary: { probeHealthy: true, errorSources: 0 },
    sources: [{
      key: 'wiki.module.iteminfo',
      status: 'ok',
      checkedAt: sourceRunIdentity,
      currentValue: `sha256:${'e'.repeat(64)}`,
      changed: true,
    }],
  };
  fs.mkdirSync(path.dirname(sourceStatePath), { recursive: true });
  fs.writeFileSync(sourceStatePath, JSON.stringify(sourceState));
  const sourceContentIdentity = `sha256:${createHash('sha256').update(JSON.stringify(sourceState)).digest('hex')}`;

  const activation = {
    decisionIdentity: 'activation-1',
    packetHash: `sha256:${'a'.repeat(64)}`,
    policySetHash: `sha256:${'b'.repeat(64)}`,
    actor: 'admin',
    reason: 'test',
    authorizationReference: 'test',
    authorizedAt: '2000-01-01T00:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
  };
  const policyScope = [{ databaseRole: 'local', table: 'items', fieldGroup: 'all_columns' }];
  const current = {
    currentLevel: 'L2',
    operationalState: 'ACTIVE',
    policyVersion: 2,
    policyHash: `sha256:${'c'.repeat(64)}`,
    policySetHash: activation.policySetHash,
    policyJson: {
      schemaVersion: 1,
      level: 'L2',
      requireSnapshot: true,
      anomalyAction: 'CIRCUIT_OPEN',
      ratioInsertCap: 0.1,
      ratioUpdateCap: 0.1,
      ratioRelationshipDeleteCap: 0.05,
      ratioDisableCap: 0.005,
      absoluteInsertCap: 500,
      absoluteUpdateCap: 500,
      absoluteRelationshipDeleteCap: 200,
      absoluteDisableCap: 20,
      sourceFreshnessMaxAgeMinutes: 60,
      ownedTables: policyScope,
    },
    ownedTables: policyScope,
    baseline: {
      environmentId: 'local',
      generations: [{ ...policyScope[0], generation: 0 }],
      projectionHash: `sha256:${'d'.repeat(64)}`,
    },
  };
  return {
    repoRoot,
    progressPath,
    sourceFingerprint: `sha256:${'e'.repeat(64)}`,
    sourceRunIdentity,
    sourceContentIdentity,
    sourceStatePath,
    current,
    connection: { query: async () => [[activation]], end: async () => {} },
    env: {
      ...databaseEnv(),
      WORKTREE_ROOT: repoRoot,
      TERRAPEDIA_CRAWLER_SOURCE_STATE_PATH: sourceStatePath,
    },
  };
}

function createLiveBaseAutomaticRunnerOptions(fixture, overrides = {}) {
  return {
    argv: ['--domain=items', '--source-mode=live', `--progress-path=${fixture.progressPath}`],
    env: fixture.env,
    now: '2026-08-31T09:00:00.000Z',
    mysqlModule: { createConnection: async () => fixture.connection },
    runSourceImpl: async ({ progressPath, env }) => {
      fs.writeFileSync(progressPath, JSON.stringify({
        status: 'completed', generatedAt: fixture.sourceRunIdentity,
        stateStoreEpoch: env.TERRAPEDIA_CRAWLER_STATE_STORE_EPOCH,
        queueId: env.TERRAPEDIA_CRAWLER_QUEUE_ID,
        attemptId: env.TERRAPEDIA_CRAWLER_ATTEMPT_ID,
      }));
    },
    readSourceFingerprintImpl: () => fixture.sourceFingerprint,
    readCurrentContextImpl: async () => fixture.current,
    isCommittedRunImpl: async () => false,
    createAdapterImpl: () => ({ marker: 'adapter' }),
    executeOperationImpl: async () => ({ status: 'completed' }),
    acknowledgeSourceImpl: () => {},
    ...overrides,
  };
}

function baseAutomaticArtifactPaths(fixture) {
  const runId = automaticRunId('items', fixture.sourceFingerprint);
  const artifactRoot = path.join(
    fixture.repoRoot,
    'reports',
    'authorization',
    'canonical',
    'automatic',
    'items',
    runId,
  );
  return {
    artifactRoot,
    sourcePath: path.join(artifactRoot, 'source.json'),
    bundlePath: path.join(artifactRoot, 'bundle.json'),
  };
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function automaticRunId(domain, sourceFingerprint) {
  const digest = createHash('sha256').update(`${domain}\n${sourceFingerprint}`).digest('hex').slice(0, 32);
  return `${domain}_l1_auto_${digest}`;
}
