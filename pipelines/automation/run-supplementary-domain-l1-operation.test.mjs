import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildSupplementaryL1Bundle } from './supplementary-domain-l1-contract.mjs';
import * as operationModule from './run-supplementary-domain-l1-operation.mjs';

const { executeSupplementaryL1Operation } = operationModule;

test('uses string dates so frozen shimmer previews are deterministic at apply time', () => {
  assert.equal(operationModule.connectionOptions({
    TERRAPEDIA_DB_HOST: '127.0.0.1',
    TERRAPEDIA_DB_PORT: '13306',
    TERRAPEDIA_DB_USERNAME: 'root',
    TERRAPEDIA_DB_PASSWORD: 'root',
    TERRAPEDIA_DB_NAME: 'terria_v1_local',
  }).dateStrings, true);
});

test('Boss L1 base apply does not make offline image localization a strict blocker', () => {
  const source = fs.readFileSync(new URL('./run-supplementary-domain-l1-operation.mjs', import.meta.url), 'utf8');
  assert.match(source, /offline:\s*'true',\s*\n\s*strict:\s*'false'/);
});

test('base item automatic apply dispatches only the frozen Items dataset', async () => {
  assert.equal(typeof operationModule.applyFrozenDomainImport, 'function');
  const fixture = writeFrozenSource({
    datasets: {
      items: { entity: 'items', records: [{ id: 1, internalName: 'IronPickaxe' }] },
    },
  });
  const connection = { marker: 'connection' };
  const calls = [];

  const summary = await operationModule.applyFrozenDomainImport({
    connection,
    repoRoot: fixture.root,
    bundle: {
      domainId: 'items',
      source: fixture.source,
    },
  }, {
    runBaseItemsImportImpl: async ({ connection: receivedConnection, records }) => {
      calls.push({ receivedConnection, records });
      return { items: { input: records.length, errors: [] } };
    },
  });

  assert.deepEqual(summary, { items: { input: 1, errors: [] } });
  assert.deepEqual(calls, [{
    receivedConnection: connection,
    records: [{ id: 1, internalName: 'IronPickaxe' }],
  }]);
});

test('base projectile automatic apply uses the frozen dataset and caller-owned transaction', async () => {
  assert.equal(typeof operationModule.applyFrozenDomainImport, 'function');
  const fixture = writeFrozenSource({
    datasets: {
      items: { entity: 'items', records: [] },
      projectiles: { entity: 'projectiles', records: [{ id: 1, internalName: 'WoodenArrowFriendly' }] },
    },
  });
  const connection = { marker: 'connection' };
  const calls = [];

  const summary = await operationModule.applyFrozenDomainImport({
    connection,
    repoRoot: fixture.root,
    bundle: {
      domainId: 'projectiles',
      source: fixture.source,
    },
  }, {
    runIndependentEntityImportImpl: async (args, options) => {
      calls.push({ args, options });
      return { projectiles: { input: 1, errors: [] } };
    },
  });

  assert.deepEqual(summary, { projectiles: { input: 1, errors: [] } });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, { apply: 'true', entity: 'projectiles' });
  assert.equal(calls[0].options.connection, connection);
  assert.equal(calls[0].options.transactionOwner, 'caller');
  assert.deepEqual(calls[0].options.datasets, {
    items: { entity: 'items', records: [] },
    projectiles: { entity: 'projectiles', records: [{ id: 1, internalName: 'WoodenArrowFriendly' }] },
  });
});

const HASH = (letter) => `sha256:${letter.repeat(64)}`;

function bundle(domainId = 'audio') {
  const tables = {
    audio: ['audio_assets', 'audio_asset_links'],
    bosses: ['boss_groups', 'npcs'],
    shimmer: ['shimmer_item_transforms', 'shimmer_decraft_rules', 'shimmer_entity_transforms', 'shimmer_npc_transforms'],
  }[domainId];
  return buildSupplementaryL1Bundle({
    operationId: `automation-${domainId}-first-l1`,
    runId: `${domainId}_l1_20260814_01`,
    domainId,
    generatedAt: '2026-08-14T06:00:00.000Z',
    policy: {
      domainId,
      level: 'L1',
      operationalState: 'ACTIVE',
      policyVersion: 1,
      policyHash: HASH('a'),
      policySetHash: HASH('b'),
    },
    baseline: {
      environmentId: 'local',
      generations: tables.map((table) => ({ databaseRole: 'local', table, generation: 2 })),
      projectionHash: HASH('c'),
    },
    source: {
      path: `reports/authorization/canonical/automation-${domainId}-first-l1.source.json`,
      sha256: HASH('d'),
    },
    ownedTables: tables.map((table) => ({ databaseRole: 'local', table })),
    importPlan: { records: [{ id: 1 }] },
  });
}

function authorization(operationId) {
  return {
    operationId,
    actor: 'admin',
    reason: 'approved L1 apply',
    authorizationReference: 'owner-approval-20260814',
    decisionIdentity: 'supplementary-l1-01',
    packetHash: HASH('e'),
    authorizedAt: '2026-08-14T06:01:00.000Z',
    expiresAt: '2026-08-14T07:01:00.000Z',
  };
}

function writeFrozenSource(payload) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'frozen-base-domain-'));
  const relativePath = 'reports/authorization/canonical/source.json';
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  const bytes = fs.readFileSync(absolutePath);
  return {
    root,
    source: {
      path: relativePath,
      sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    },
  };
}

test('frozen source identity is bound to file bytes, including formatting and newline', async () => {
  const fixture = writeFrozenSource({ datasets: { items: { entity: 'items', records: [] } } });
  const connection = { marker: 'connection' };
  const bundle = {
    domainId: 'items',
    source: fixture.source,
  };

  await operationModule.applyFrozenDomainImport({
    connection,
    repoRoot: fixture.root,
    bundle,
  }, {
    runBaseItemsImportImpl: async () => ({ items: { input: 0, errors: [] } }),
  });

  fs.writeFileSync(
    path.join(fixture.root, fixture.source.path),
    JSON.stringify({ datasets: { items: { entity: 'items', records: [] } } }),
    { mode: 0o600 },
  );
  await assert.rejects(
    operationModule.applyFrozenDomainImport({
      connection,
      repoRoot: fixture.root,
      bundle,
    }, {
      runBaseItemsImportImpl: async () => ({ items: { input: 0, errors: [] } }),
    }),
    /frozen source hash drifted/i,
  );
});

test('commits an approved frozen L1 operation once', async () => {
  const frozen = bundle();
  const calls = [];
  const adapter = {
    begin: async () => calls.push('begin'),
    lockCurrentContext: async () => ({
      ownerUsername: 'admin',
      ownerStatus: 'ACTIVE',
      domainId: 'audio',
      policyVersion: 1,
      policyHash: HASH('a'),
      policySetHash: HASH('b'),
      currentLevel: 'L1',
      operationalState: 'ACTIVE',
      baselineFingerprint: frozen.baselineFingerprint,
      approvalMode: 'APPROVED_OWNER_L1',
      approvalConsumed: false,
    }),
    persistRunChain: async () => calls.push('persist'),
    applyFrozenImport: async () => { calls.push('apply'); return { inserted: 1 }; },
    advanceMutationGenerations: async () => calls.push('generation'),
    persistCommittedApply: async () => calls.push('result'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
  };

  const result = await executeSupplementaryL1Operation({
    adapter,
    bundle: frozen,
    authorizationContext: authorization(frozen.operationId),
    now: '2026-08-14T06:02:00.000Z',
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(calls, ['begin', 'persist', 'apply', 'generation', 'result', 'commit']);
});

test('builds reconciliation evidence inputs from the committed transaction boundary', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'supplementary-l1-reconciliation-'));
  const runId = 'audio_l1_20260814_01';
  const sourcePath = 'reports/authorization/canonical/l1-runs/audio/audio_l1_20260814_01/source.json';
  const bundlePath = 'reports/authorization/canonical/l1-runs/audio/audio_l1_20260814_01/bundle.json';
  const reconciliationRoot = `reports/runtime/l1-reconciliation/audio/${runId}`;
  const reconciliationInput = {
    sourceCoveragePath: `${reconciliationRoot}/source-coverage.json`,
    ownedTableReadbackPath: `${reconciliationRoot}/owned-table-readback.json`,
    attemptStatePath: `${reconciliationRoot}/attempt-state.json`,
    outputPath: `${reconciliationRoot}/reconciliation-evidence.json`,
  };
  const sourcePayload = { schemaVersion: 1, domainId: 'audio', assets: [] };
  writeTestJson(root, sourcePath, sourcePayload);
  const frozenSource = {
    path: sourcePath,
    sha256: sha256JsonForTest(sourcePayload),
  };
  const frozen = buildSupplementaryL1Bundle({
    ...bundle('audio'),
    runId,
    source: frozenSource,
    reconciliationInput,
  });
  writeTestJson(root, bundlePath, frozen);
  writeTestJson(root, reconciliationInput.sourceCoveragePath, {
    schemaVersion: 1,
    artifactKind: 'l1-source-coverage',
    domainId: 'audio',
    runId,
    sourcePath,
    sourceSha256: frozenSource.sha256,
    completeSourceCoverage: true,
    terminalProgress: true,
    unclassifiedCount: 0,
  });
  writeTestJson(root, reconciliationInput.ownedTableReadbackPath, {
    schemaVersion: 1,
    artifactKind: 'l1-owned-table-readback',
    domainId: 'audio',
    runId,
    ownedTables: frozen.ownedTables,
    generationReadback: true,
    unauthorizedMutationCount: 0,
    unclassifiedMutationCount: 0,
  });
  writeTestJson(root, reconciliationInput.attemptStatePath, {
    schemaVersion: 1,
    artifactKind: 'l1-attempt-state',
    domainId: 'audio',
    runId,
    activeAttemptCount: 0,
    overdueAttemptCount: 0,
  });
  const calls = [];
  const adapter = {
    begin: async () => calls.push('begin'),
    lockCurrentContext: async () => ({
      ownerUsername: 'admin', ownerStatus: 'ACTIVE', domainId: 'audio', policyVersion: 1,
      policyHash: HASH('a'), policySetHash: HASH('b'), currentLevel: 'L1',
      operationalState: 'ACTIVE', baselineFingerprint: frozen.baselineFingerprint,
      approvalConsumed: false,
    }),
    persistRunChain: async () => calls.push('persist'),
    applyFrozenImport: async () => { calls.push('apply'); return { inserted: 1 }; },
    advanceMutationGenerations: async () => calls.push('generation'),
    writeReconciliationInputs: async ({ bundle: received }) => {
      calls.push('reconciliation-inputs');
      assert.equal(received.runId, frozen.runId);
    },
    repoRoot: root,
    bundlePath: path.join(root, bundlePath),
    persistReconciliationEvidence: async () => calls.push('reconciliation-evidence'),
    persistCommittedApply: async () => calls.push('result'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
  };

  await executeSupplementaryL1Operation({
    adapter,
    bundle: frozen,
    authorizationContext: authorization(frozen.operationId),
    now: '2026-08-14T06:02:00.000Z',
  });
  assert.deepEqual(calls, [
    'begin', 'persist', 'apply', 'generation', 'reconciliation-inputs',
    'reconciliation-evidence', 'result', 'commit',
  ]);
  assert.ok(fs.existsSync(path.join(root, reconciliationInput.outputPath)));
});

test('fails closed when full reconciliation has no transaction-bound producer', async () => {
  const base = bundle('audio');
  const frozen = buildSupplementaryL1Bundle({
    ...base,
    reconciliationInput: {
      sourceCoveragePath: 'reports/runtime/l1-reconciliation/audio/audio_l1_20260829_noproducer/source-coverage.json',
      ownedTableReadbackPath: 'reports/runtime/l1-reconciliation/audio/audio_l1_20260829_noproducer/owned-table-readback.json',
      attemptStatePath: 'reports/runtime/l1-reconciliation/audio/audio_l1_20260829_noproducer/attempt-state.json',
      outputPath: 'reports/runtime/l1-reconciliation/audio/audio_l1_20260829_noproducer/reconciliation-evidence.json',
    },
  });
  const adapter = {
    repoRoot: '/repo',
    bundlePath: '/repo/bundle.json',
    begin: async () => {},
    lockCurrentContext: async () => ({
      ownerUsername: 'admin', ownerStatus: 'ACTIVE', domainId: 'audio', policyVersion: 1,
      policyHash: HASH('a'), policySetHash: HASH('b'), currentLevel: 'L1',
      operationalState: 'ACTIVE', baselineFingerprint: frozen.baselineFingerprint,
      approvalConsumed: false,
    }),
    persistRunChain: async () => {},
    applyFrozenImport: async () => ({ inserted: 1 }),
    advanceMutationGenerations: async () => {},
    persistCommittedApply: async () => {},
    commit: async () => {},
    rollback: async () => {},
  };

  await assert.rejects(
    executeSupplementaryL1Operation({
      adapter,
      bundle: frozen,
      authorizationContext: authorization(frozen.operationId),
      now: '2026-08-14T06:02:00.000Z',
    }),
    /reconciliation input producer is required/i,
  );
});

test('MySQL adapter writes reconciliation inputs from the post-apply transaction readback', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mysql-l1-reconciliation-inputs-'));
  const runId = 'audio_l1_20260829_inputs01';
  const sourcePath = path.join(root, 'reports/authorization/canonical/l1-runs/audio', runId, 'source.json');
  const bundlePath = path.join(root, 'reports/authorization/canonical/l1-runs/audio', runId, 'bundle.json');
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, '{\n  "schemaVersion": 1,\n  "domainId": "audio",\n  "assets": []\n}\n', { mode: 0o600 });
  const frozen = buildSupplementaryL1Bundle({
    ...bundle('audio'),
    runId,
    source: {
      path: `reports/authorization/canonical/l1-runs/audio/${runId}/source.json`,
      sha256: `sha256:${createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex')}`,
    },
    reconciliationInput: {
      sourceCoveragePath: `reports/runtime/l1-reconciliation/audio/${runId}/source-coverage.json`,
      ownedTableReadbackPath: `reports/runtime/l1-reconciliation/audio/${runId}/owned-table-readback.json`,
      attemptStatePath: `reports/runtime/l1-reconciliation/audio/${runId}/attempt-state.json`,
      outputPath: `reports/runtime/l1-reconciliation/audio/${runId}/reconciliation-evidence.json`,
    },
  });
  fs.writeFileSync(bundlePath, `${JSON.stringify(frozen, null, 2)}\n`, { mode: 0o600 });
  fs.writeFileSync(
    path.join(path.dirname(bundlePath), 'progress.json'),
    `${JSON.stringify({ status: 'completed' })}\n`,
    { mode: 0o600 },
  );
  const queries = [];
  const connection = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (/crawler_automation_run_attempt/.test(sql)) return [[{ activeAttempts: 0 }]];
      if (/crawler_automation_attempt_reservation/.test(sql)) return [[{ activeReservations: 0 }]];
      if (/crawler_automation_mutation_generation/.test(sql)) {
        return [[{ generation: 3, lastWriterRunId: runId }]];
      }
      if (/crawler_automation_write_fence/.test(sql)) {
        return [[{
          latestRunId: runId,
          beforeGeneration: 2,
          committedGeneration: 3,
          commitMarker: frozen.bundleHash.slice(7),
        }]];
      }
      if (/FROM `audio_assets`/.test(sql)) return [[{ id: 1, asset_id: 'music:empty' }]];
      if (/FROM `audio_asset_links`/.test(sql)) return [[{ id: 2, asset_id: 'music:empty' }]];
      return [[]];
    },
  };
  const adapter = operationModule.createMysqlSupplementaryL1Adapter(connection, {
    bundlePath,
    repoRoot: root,
  });

  const result = await adapter.writeReconciliationInputs({
    bundle: frozen,
    importSummary: { summary: { insertedAssets: 0 } },
    reconciliationInput: frozen.reconciliationInput,
    executionTime: '2026-08-29T00:00:00.000Z',
  });

  assert.equal(result.sourceCoverage.completeSourceCoverage, true);
  assert.equal(result.sourceCoverage.terminalProgress, true);
  assert.equal(result.ownedTableReadback.generationReadback, true);
  assert.deepEqual(result.ownedTableReadback.ownedTables, frozen.ownedTables);
  assert.equal(result.attemptState.activeAttemptCount, 0);
  assert.equal(result.attemptState.overdueAttemptCount, 0);
  for (const relativePath of [
    frozen.reconciliationInput.sourceCoveragePath,
    frozen.reconciliationInput.ownedTableReadbackPath,
    frozen.reconciliationInput.attemptStatePath,
  ]) {
    assert.equal(fs.existsSync(path.join(root, relativePath)), true, relativePath);
  }
  assert.ok(queries.some(({ sql }) => /crawler_automation_run_attempt/.test(sql)));
  assert.ok(queries.some(({ sql }) => /crawler_automation_mutation_generation/.test(sql)));
});

test('MySQL adapter fails closed when the L1 source progress artifact is missing', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mysql-l1-missing-progress-'));
  const runId = 'audio_l1_20260829_noprogress01';
  const sourcePath = path.join(root, 'reports/authorization/canonical/l1-runs/audio', runId, 'source.json');
  const bundlePath = path.join(root, 'reports/authorization/canonical/l1-runs/audio', runId, 'bundle.json');
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, '{\n  "schemaVersion": 1,\n  "domainId": "audio",\n  "assets": []\n}\n', { mode: 0o600 });
  const frozen = buildSupplementaryL1Bundle({
    ...bundle('audio'),
    runId,
    source: {
      path: `reports/authorization/canonical/l1-runs/audio/${runId}/source.json`,
      sha256: `sha256:${createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex')}`,
    },
    reconciliationInput: {
      sourceCoveragePath: `reports/runtime/l1-reconciliation/audio/${runId}/source-coverage.json`,
      ownedTableReadbackPath: `reports/runtime/l1-reconciliation/audio/${runId}/owned-table-readback.json`,
      attemptStatePath: `reports/runtime/l1-reconciliation/audio/${runId}/attempt-state.json`,
      outputPath: `reports/runtime/l1-reconciliation/audio/${runId}/reconciliation-evidence.json`,
    },
  });
  fs.writeFileSync(bundlePath, `${JSON.stringify(frozen, null, 2)}\n`, { mode: 0o600 });
  const connection = {
    async query(sql) {
      if (/crawler_automation_mutation_generation/.test(sql)) {
        return [[{ generation: 3, lastWriterRunId: runId }]];
      }
      if (/crawler_automation_write_fence/.test(sql)) {
        return [[{
          latestRunId: runId,
          beforeGeneration: 2,
          committedGeneration: 3,
          commitMarker: frozen.bundleHash.slice(7),
        }]];
      }
      if (/crawler_automation_run_attempt/.test(sql)) return [[{ activeAttempts: 0 }]];
      if (/crawler_automation_attempt_reservation/.test(sql)) return [[{ activeReservations: 0 }]];
      return [[]];
    },
  };
  const adapter = operationModule.createMysqlSupplementaryL1Adapter(connection, {
    bundlePath,
    repoRoot: root,
  });

  await assert.rejects(
    adapter.writeReconciliationInputs({
      bundle: frozen,
      importSummary: { summary: { insertedAssets: 0 } },
      reconciliationInput: frozen.reconciliationInput,
      executionTime: '2026-08-29T00:00:00.000Z',
    }),
    /L1 source progress artifact is required/i,
  );
});

function writeTestJson(root, relativePath, value) {
  const absolute = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(value)}\n`, { mode: 0o600 });
}

function sha256JsonForTest(value) {
  return `sha256:${createHash('sha256').update(`${JSON.stringify(value)}\n`, 'utf8').digest('hex')}`;
}

test('rolls back before apply when policy or baseline identity drifts', async () => {
  const frozen = bundle('bosses');
  const calls = [];
  const adapter = {
    begin: async () => calls.push('begin'),
    lockCurrentContext: async () => ({
      ownerUsername: 'admin', ownerStatus: 'ACTIVE', domainId: 'bosses',
      policyVersion: 1, policyHash: HASH('a'), policySetHash: HASH('b'),
      currentLevel: 'L1', operationalState: 'ACTIVE',
      baselineFingerprint: HASH('f'), approvalMode: 'APPROVED_OWNER_L1', approvalConsumed: false,
    }),
    persistRunChain: async () => calls.push('persist'),
    applyFrozenImport: async () => calls.push('apply'),
    advanceMutationGenerations: async () => calls.push('generation'),
    persistCommittedApply: async () => calls.push('result'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
  };

  await assert.rejects(
    executeSupplementaryL1Operation({
      adapter,
      bundle: frozen,
      authorizationContext: authorization(frozen.operationId),
      now: '2026-08-14T06:02:00.000Z',
    }),
    /baseline fingerprint/,
  );
  assert.deepEqual(calls, ['begin', 'rollback']);
});

test('rejects expired or mismatched authorization before a transaction', async () => {
  const frozen = bundle('shimmer');
  let begun = false;
  const adapter = { begin: async () => { begun = true; } };

  await assert.rejects(
    executeSupplementaryL1Operation({
      adapter,
      bundle: frozen,
      authorizationContext: authorization('automation-audio-first-l1'),
      now: '2026-08-14T06:02:00.000Z',
    }),
    /operationId/,
  );
  await assert.rejects(
    executeSupplementaryL1Operation({
      adapter,
      bundle: frozen,
      authorizationContext: authorization(frozen.operationId),
      now: '2026-08-14T08:02:00.000Z',
    }),
    /currently valid/,
  );
  assert.equal(begun, false);
});

test('loads shimmer generation through the frozen automatic source contract', () => {
  const frozenSource = {
    generationId: 'verified-generation',
    manifestPath: 'data/generated/shimmer/generations/verified-generation/wiki-shimmer-manifest.json',
    manifestSha256: HASH('a'),
    dataBundleSha256: HASH('b'),
  };
  const calls = [];
  const verifiedBundle = {
    generationId: frozenSource.generationId,
    manifestSha256: frozenSource.manifestSha256,
    dataBundleSha256: frozenSource.dataBundleSha256,
  };

  const result = operationModule.loadFrozenShimmerImportBundle({
    repoRoot: '/repo',
    frozenSource,
  }, {
    loadBundleImpl: (options) => {
      calls.push(['bundle', options]);
      return verifiedBundle;
    },
  });

  assert.equal(result, verifiedBundle);
  assert.deepEqual(calls, [
    ['bundle', { bundleManifestPath: frozenSource.manifestPath, repoRoot: '/repo' }],
  ]);

  assert.throws(
    () => operationModule.loadFrozenShimmerImportBundle({ repoRoot: '/repo', frozenSource }, {
      loadBundleImpl: () => ({ ...verifiedBundle, manifestSha256: HASH('c') }),
    }),
    /frozen Shimmer source does not match the verified generation/,
  );
});

test('activation-gated automatic apply fails before transaction without activation identity', async () => {
  const frozen = buildSupplementaryL1Bundle({
    ...bundle('audio'),
    executionMode: 'ACTIVATION_GATED_AUTO',
  });
  let begun = false;
  await assert.rejects(
    executeSupplementaryL1Operation({
      adapter: { begin: async () => { begun = true; } },
      bundle: frozen,
      authorizationContext: {
        ...authorization(frozen.operationId),
        executionMode: 'ACTIVATION_GATED_AUTO',
      },
      now: '2026-08-14T06:02:00.000Z',
    }),
    /activationPolicySetHash/,
  );
  assert.equal(begun, false);
});

test('import summaries with swallowed row errors roll back before generation advancement', async () => {
  const frozen = bundle('audio');
  const calls = [];
  const adapter = {
    begin: async () => calls.push('begin'),
    lockCurrentContext: async () => ({
      ownerUsername: 'admin', ownerStatus: 'ACTIVE', domainId: 'audio',
      policyVersion: 1, policyHash: HASH('a'), policySetHash: HASH('b'),
      currentLevel: 'L1', operationalState: 'ACTIVE',
      baselineFingerprint: frozen.baselineFingerprint,
      approvalMode: 'APPROVED_OWNER_L1', approvalConsumed: false,
    }),
    persistRunChain: async () => calls.push('persist'),
    applyFrozenImport: async () => {
      calls.push('apply');
      return { summary: { insertedAssets: 0 }, failures: ['invalid audio row'] };
    },
    advanceMutationGenerations: async () => calls.push('generation'),
    persistCommittedApply: async () => calls.push('result'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
  };

  await assert.rejects(
    executeSupplementaryL1Operation({
      adapter,
      bundle: frozen,
      authorizationContext: authorization(frozen.operationId),
      now: '2026-08-14T06:02:00.000Z',
    }),
    /import summary contains 1 error/,
  );
  assert.deepEqual(calls, ['begin', 'persist', 'apply', 'rollback']);
});
