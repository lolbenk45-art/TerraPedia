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

test('automatic Item apply forwards the complete frozen dependency snapshot', async () => {
  const fixture = writeFrozenSource({
    datasets: {
      items: { entity: 'items', records: [{ id: 1, internalName: 'IronPickaxe' }] },
    },
  });
  const dependencyRows = [{
    id: 41,
    internal_name: 'GuideVoodooFish',
    name: 'Guide Voodoo Fish',
    name_zh: '向导巫毒鱼',
    image: 'http://localhost:9000/terrapedia-images/items/guide-voodoo-fish.png',
    category_id: 7,
    description: 'A preserved Item dependency.',
    damage: 1,
    defense: 0,
    knockback: 0,
    use_time: 20,
    width: 24,
    height: 24,
    buy: 10,
    sell: 2,
    tooltip: 'Summons the guide',
    rarity_id: 2,
    game_period_id: 3,
    game_model_id: 4,
    is_stackable: 0,
    stack_size: 1,
    status: 1,
    deleted: 0,
  }];
  const calls = [];
  await operationModule.applyFrozenDomainImport({
    connection: { marker: 'connection' },
    repoRoot: fixture.root,
    bundle: {
      domainId: 'items',
      source: fixture.source,
      executionMode: 'ACTIVATION_GATED_AUTO',
      baseline: { dependencyTables: { categories: [{ id: 7, code: 'WEAPON' }], items: dependencyRows } },
    },
  }, {
    runBaseItemsImportImpl: async (options) => {
      calls.push(options);
      return { items: { input: options.records.length, errors: [] } };
    },
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].existingRows, dependencyRows);
  assert.deepEqual(calls[0].categoryRows, [{ id: 7, code: 'WEAPON' }]);
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

test('automatic Audio apply passes only the bundle-locked Items/NPC/BGM dependencies', async () => {
  const fixture = writeFrozenSource({ assets: [] });
  const connection = { marker: 'connection' };
  const dependencyTables = {
    items: [{ id: 41, source_id: 7, internal_name: 'GuideVoodooFish', name: 'Guide Voodoo Fish' }],
    npcs: [{ id: 51, internal_name: 'Guide', name: 'Guide' }],
    audioBgmDisplayNames: [{ sourceKey: 'Music-Test', displayNameZh: '测试音乐', displayNameEn: 'Test Music' }],
  };
  const calls = [];

  await operationModule.applyFrozenDomainImport({
    connection,
    repoRoot: fixture.root,
    bundle: {
      domainId: 'audio',
      source: fixture.source,
      baseline: { dependencyTables },
    },
  }, {
    runAudioAssetImportImpl: async (options, dependencies) => {
      calls.push({ options, dependencies });
      return { summary: { failures: [] } };
    },
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].dependencies.itemRows, dependencyTables.items);
  assert.deepEqual(calls[0].dependencies.npcRows, dependencyTables.npcs);
  assert.deepEqual(calls[0].dependencies.localBgmDisplayNameRows, dependencyTables.audioBgmDisplayNames);
  assert.equal(calls[0].dependencies.connection, connection);
  assert.equal(calls[0].dependencies.transactionOwner, 'caller');
});

test('automatic Audio apply rejects a missing frozen dependency before importer work', async () => {
  const fixture = writeFrozenSource({ assets: [] });
  let importerCalled = false;

  await assert.rejects(
    operationModule.applyFrozenDomainImport({
      connection: { marker: 'connection' },
      repoRoot: fixture.root,
      bundle: {
        domainId: 'audio',
        source: fixture.source,
        baseline: { dependencyTables: { items: [], npcs: [] } },
      },
    }, {
      runAudioAssetImportImpl: async () => {
        importerCalled = true;
        return { summary: { failures: [] } };
      },
    }),
    /locked.*audioBgmDisplayNames|dependency/i,
  );
  assert.equal(importerCalled, false);
});

test('automatic NPC apply passes the bundle-locked zh mapping to the importer', async () => {
  const fixture = writeFrozenSource({
    datasets: {
      items: { entity: 'items', records: [] },
      npcs: { entity: 'npcs', records: [{ id: 4, internalName: 'Guide', name: 'Guide' }] },
    },
  });
  const npcZhMap = [{ internalName: 'Guide', nameZh: '向导', subNameZh: null }];
  const calls = [];

  await operationModule.applyFrozenDomainImport({
    connection: { marker: 'connection' },
    repoRoot: fixture.root,
    bundle: {
      domainId: 'npcs',
      source: fixture.source,
      baseline: { dependencyTables: { items: [], categories: [], npcZhMap } },
    },
  }, {
    runIndependentEntityImportImpl: async (args, dependencies) => {
      calls.push({ args, dependencies });
      return { npcs: { errors: [] } };
    },
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].dependencies.npcZhRows, npcZhMap);
});

test('automatic Boss apply never targets the historical flat import report', async () => {
  const fixture = writeFrozenSource({
    entity: 'bosses',
    records: [{ titleEn: 'King Slime', groupType: 'boss' }],
  });
  const historicalReport = path.join(
    fixture.root,
    'reports',
    'authorization',
    'canonical',
    'automation-bosses-first-l1.import.json',
  );
  fs.mkdirSync(path.dirname(historicalReport), { recursive: true, mode: 0o700 });
  fs.writeFileSync(historicalReport, 'historical-sentinel\n', { mode: 0o600 });
  const calls = [];

  await operationModule.applyFrozenDomainImport({
    connection: { marker: 'connection' },
    repoRoot: fixture.root,
    bundle: {
      domainId: 'bosses',
      source: fixture.source,
      executionMode: 'ACTIVATION_GATED_AUTO',
      baseline: { dependencyTables: { npcs: [{ id: 50, game_id: 50, internal_name: 'KingSlime', name: 'King Slime', name_zh: '史莱姆王', is_boss: 1, raw_json: '{}' }] } },
    },
  }, {
    runBossImportImpl: async (args, dependencies) => {
      calls.push({ args, dependencies });
      return { totalBosses: 1, unresolvedBosses: [] };
    },
  });

  assert.equal(calls.length, 1);
  assert.notEqual(calls[0].args['report-json'], historicalReport);
  assert.equal(calls[0].args['write-report'], 'false');
  assert.equal(calls[0].dependencies.generatedNpcMap, null);
  assert.equal(calls[0].dependencies.npcRows[0].internal_name, 'KingSlime');
  assert.equal(fs.readFileSync(historicalReport, 'utf8'), 'historical-sentinel\n');
});

const HASH = (letter) => `sha256:${letter.repeat(64)}`;

test('manual L1 execution rejects a source-identity-bearing bundle before transaction work', async () => {
  const manualBundle = {
    ...bundle(),
    sourceDispatchIdentity: {
      sourceFingerprint: HASH('a'),
      sourceRunIdentity: '2026-08-14T06:00:00.000Z',
      sourceContentIdentity: HASH('b'),
    },
  };
  let began = false;

  await assert.rejects(
    executeSupplementaryL1Operation({
      bundle: manualBundle,
      authorizationContext: authorization(manualBundle.operationId),
      adapter: {
        begin: async () => { began = true; },
      },
    }),
    /manual.*source dispatch identity|source dispatch identity.*manual/i,
  );

  assert.equal(began, false);
});

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function directoryPathForFsync(fd) {
  const stat = fs.fstatSync(fd);
  if (!stat.isDirectory()) return null;
  return path.resolve(fs.readlinkSync(`/proc/self/fd/${fd}`));
}

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

function automaticBundle(domainId = 'audio', overrides = {}) {
  const manual = bundle(domainId);
  const ownedTables = manual.ownedTables.map((scope) => ({
    ...scope,
    fieldGroup: 'all_columns',
  }));
  const policy = {
    ...manual.policy,
    level: 'L2',
    policyVersion: 2,
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
      ownedTables,
    },
  };
  const input = {
    operationId: manual.operationId,
    runId: manual.runId,
    domainId: manual.domainId,
    generatedAt: manual.generatedAt,
    executionMode: 'ACTIVATION_GATED_AUTO',
    policy,
    baseline: {
      ...manual.baseline,
      generations: ownedTables.map((scope) => ({
        ...scope,
        generation: manual.baseline.generations.find((entry) => (
          entry.databaseRole === scope.databaseRole && entry.table === scope.table
        ))?.generation ?? 0,
      })),
    },
    source: manual.source,
    ownedTables,
    importPlan: manual.importPlan,
  };
  return buildSupplementaryL1Bundle({ ...input, ...overrides });
}

function zeroAutomaticDiff(ownedTables, sourceCheckedAt = '2026-08-31T09:59:00.000Z') {
  const scopes = ownedTables.map((scope) => ({
    scopeId: `${scope.databaseRole}.${scope.table}.${scope.fieldGroup}`,
    ...scope,
    entityBaselineCount: 1,
    relationshipBaselineCount: 0,
    inserts: 0,
    updates: 0,
    relationshipDeletes: 0,
    softDisables: 0,
    hardDeletes: 0,
    insertedKeys: [],
    updatedKeys: [],
    deletedRelationshipKeys: [],
    softDisabledKeys: [],
    hardDeletedKeys: [],
  }));
  return {
    schemaVersion: 1,
    producer: 'read_only_sql_intent_zero_mutation_v2',
    rowCountEvidence: 'zero_mutation_sql_trace',
    sourceCheckedAt,
    snapshot: true,
    wholeDomainRebuild: false,
    scopes,
    counts: {
      entityBaselineCount: scopes.length,
      relationshipBaselineCount: 0,
      inserts: 0,
      updates: 0,
      relationshipDeletes: 0,
      softDisables: 0,
      hardDeletes: 0,
    },
  };
}

function prepareCanonicalAutomaticArtifact(root, { domainId, runId, sourceBytes } = {}) {
  const artifactRoot = path.join(
    root,
    'reports',
    'authorization',
    'canonical',
    'automatic',
    domainId,
    runId,
  );
  fs.mkdirSync(artifactRoot, { recursive: true, mode: 0o700 });
  fs.chmodSync(root, 0o700);
  let current = root;
  for (const segment of path.relative(root, artifactRoot).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    fs.chmodSync(current, 0o700);
  }
  const sourceRelativePath = `reports/authorization/canonical/automatic/${domainId}/${runId}/source.json`;
  const sourcePath = path.join(root, sourceRelativePath);
  const bytes = sourceBytes ?? Buffer.from('{"schemaVersion":1,"domainId":"audio","assets":[]}\n');
  fs.writeFileSync(sourcePath, bytes, { mode: 0o600 });
  return {
    artifactRoot,
    bundlePath: path.join(artifactRoot, 'bundle.json'),
    sourcePath,
    source: {
      path: sourceRelativePath,
      sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    },
  };
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

function compensationFailedConfirmation(frozen, overrides = {}) {
  return {
    status: 'COMPENSATION_FAILED',
    applyAffectedRows: 1,
    runAffectedRows: 1,
    readback: {
      apply: {
        runId: frozen.runId,
        bundleHash: frozen.bundleHash,
        status: 'COMPENSATION_FAILED',
      },
      run: {
        runId: frozen.runId,
        status: 'COMPENSATION_FAILED',
      },
    },
    ...overrides,
  };
}

function postCommitFailureAdapter(frozen, {
  repoRoot = null,
  postCommitFailure = new Error('API readback failed'),
  compensate = async () => { throw new Error('generation fence changed'); },
  markCompensationFailed,
  recordAlert = async () => {},
  persistCriticalAlertRetry,
} = {}) {
  return {
    ...(repoRoot == null ? {} : { repoRoot }),
    begin: async () => {},
    lockCurrentContext: async () => ({
      ownerUsername: 'admin', ownerStatus: 'ACTIVE', domainId: 'audio',
      policyVersion: 1, policyHash: HASH('a'), policySetHash: HASH('b'),
      currentLevel: 'L1', operationalState: 'ACTIVE',
      baselineFingerprint: frozen.baselineFingerprint,
      approvalMode: 'APPROVED_OWNER_L1', approvalConsumed: false,
    }),
    persistRunChain: async () => {},
    applyFrozenImport: async () => ({ inserted: 1 }),
    advanceMutationGenerations: async () => {},
    persistCommittedApply: async () => {},
    commit: async () => {},
    rollback: async () => {},
    postCommitVerify: async () => { throw postCommitFailure; },
    ...(compensate == null ? {} : { compensate }),
    ...(markCompensationFailed == null ? {} : { markCompensationFailed }),
    recordAlert,
    ...(persistCriticalAlertRetry == null ? {} : { persistCriticalAlertRetry }),
  };
}

for (const {
  label,
  postCommitFailure,
  expectedMessage,
} of [
  {
    label: 'a string post-commit failure',
    postCommitFailure: 'post-commit string failure',
    expectedMessage: 'post-commit string failure',
  },
  {
    label: 'a frozen Error post-commit failure',
    postCommitFailure: Object.freeze(new Error('post-commit frozen failure')),
    expectedMessage: 'post-commit frozen failure',
  },
]) {
  test(`keeps compensation marker and retry handling reachable for ${label}`, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'critical-recovery-error-'));
    const frozen = bundle();
    const calls = [];
    const adapter = postCommitFailureAdapter(frozen, {
      repoRoot: root,
      postCommitFailure,
      markCompensationFailed: async () => {
        calls.push('mark:COMPENSATION_FAILED');
        return compensationFailedConfirmation(frozen);
      },
      recordAlert: async () => {
        calls.push('alert:CRITICAL');
        throw new Error('alert ledger unavailable');
      },
    });
    let failure = null;

    await assert.rejects(
      executeSupplementaryL1Operation({
        adapter,
        bundle: frozen,
        authorizationContext: authorization(frozen.operationId),
        now: '2026-08-14T06:02:00.000Z',
      }),
      (error) => {
        failure = error;
        return error?.code === 'CRITICAL_ALERT_DELIVERY_RETRY_REQUIRED'
          && error.message.includes(expectedMessage)
          && error.cause?.cause === postCommitFailure;
      },
    );

    assert.deepEqual(calls, ['mark:COMPENSATION_FAILED', 'alert:CRITICAL']);
    const retryPath = path.join(root, failure.alertDelivery.retryArtifact.path);
    const retry = JSON.parse(fs.readFileSync(retryPath, 'utf8'));
    assert.equal(retry.originalFailure.message, expectedMessage);
  });
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

test('automatic execution uses the live L2 context and runs its ceiling gate before any apply', async () => {
  const tables = ['audio_assets', 'audio_asset_links'];
  const automatic = buildSupplementaryL1Bundle({
    operationId: 'automation-audio-first-l1',
    runId: 'audio_l1_auto_20260831_01',
    domainId: 'audio',
    generatedAt: '2026-08-31T10:00:00.000Z',
    executionMode: 'ACTIVATION_GATED_AUTO',
    policy: {
      domainId: 'audio',
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
        ownedTables: tables.map((table) => ({ databaseRole: 'local', table, fieldGroup: 'all_columns' })),
      },
    },
    baseline: {
      environmentId: 'local',
      generations: tables.map((table) => ({ databaseRole: 'local', table, fieldGroup: 'all_columns', generation: 2 })),
      projectionHash: HASH('c'),
    },
    source: {
      path: 'reports/authorization/canonical/automation/audio/source.json',
      sha256: HASH('d'),
    },
    ownedTables: tables.map((table) => ({ databaseRole: 'local', table, fieldGroup: 'all_columns' })),
    importPlan: {
      l2Diff: {
        schemaVersion: 1,
        producer: 'read_only_sql_intent_zero_mutation_v2',
        rowCountEvidence: 'zero_mutation_sql_trace',
        snapshot: true,
        sourceCheckedAt: '2026-08-31T09:59:00.000Z',
        wholeDomainRebuild: false,
        scopes: tables.map((table) => ({
          scopeId: `local.${table}`,
          databaseRole: 'local',
          table,
          fieldGroup: 'all_columns',
          entityBaselineCount: 100,
          relationshipBaselineCount: 0,
          inserts: 0,
          updates: 0,
          relationshipDeletes: 0,
          softDisables: 0,
          hardDeletes: 0,
          insertedKeys: [],
          updatedKeys: [],
          deletedRelationshipKeys: [],
          softDisabledKeys: [],
          hardDeletedKeys: [],
        })),
        counts: {
          entityBaselineCount: 200,
          relationshipBaselineCount: 0,
          inserts: 0,
          updates: 0,
          relationshipDeletes: 0,
          softDisables: 0,
          hardDeletes: 0,
        },
      },
    },
  });
  const calls = [];
  const adapter = {
    begin: async () => calls.push('begin'),
    lockCurrentContext: async () => ({
      ownerUsername: 'admin', ownerStatus: 'ACTIVE', domainId: 'audio',
      policyVersion: 2, policyHash: HASH('a'), policySetHash: HASH('b'),
      currentLevel: 'L2', operationalState: 'ACTIVE',
      policyJson: automatic.policy.policyJson,
      ownedTables: automatic.ownedTables,
      baselineFingerprint: automatic.baselineFingerprint,
      approvalConsumed: false,
      activationDecisionIdentity: 'activation-1',
      activationPacketHash: HASH('e'),
      activationPolicySetHash: HASH('b'),
      activationExpiresAt: '2026-08-31T11:00:00.000Z',
    }),
    readDatabaseTime: async ({ executionTime }) => {
      calls.push('db-clock');
      return executionTime;
    },
    buildAutomaticL2Diff: async () => {
      calls.push('gate');
      return automatic.importPlan.l2Diff;
    },
    persistRunChain: async () => calls.push('persist'),
    applyFrozenImport: async () => { calls.push('apply'); return { inserted: 0 }; },
    advanceMutationGenerations: async () => calls.push('generation'),
    persistCommittedApply: async () => calls.push('result'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
  };

  const result = await executeSupplementaryL1Operation({
    adapter,
    bundle: automatic,
    authorizationContext: {
      ...authorization(automatic.operationId),
      authorizedAt: '2026-08-31T09:00:00.000Z',
      expiresAt: '2026-08-31T11:00:00.000Z',
      executionMode: 'ACTIVATION_GATED_AUTO',
      activationDecisionIdentity: 'activation-1',
      activationPacketHash: HASH('e'),
      activationPolicySetHash: HASH('b'),
    },
    now: '2026-08-31T10:00:00.000Z',
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(calls, ['begin', 'db-clock', 'gate', 'db-clock', 'persist', 'apply', 'generation', 'result', 'commit']);
});

test('automatic execution revalidates authorization with the database clock after locking context', async () => {
  const automatic = automaticBundle('audio', {
    importPlan: { l2Diff: zeroAutomaticDiff(automaticBundle('audio').ownedTables) },
  });
  const calls = [];
  const adapter = {
    begin: async () => calls.push('begin'),
    lockCurrentContext: async () => {
      calls.push('lock');
      return {
        ownerUsername: 'admin', ownerStatus: 'ACTIVE', domainId: 'audio',
        policyVersion: 2, policyHash: HASH('a'), policySetHash: HASH('b'),
        currentLevel: 'L2', operationalState: 'ACTIVE', policyJson: automatic.policy.policyJson,
        ownedTables: automatic.ownedTables, baselineFingerprint: automatic.baselineFingerprint,
        approvalConsumed: false, activationDecisionIdentity: 'activation-1',
        activationPacketHash: HASH('e'), activationPolicySetHash: HASH('b'),
        activationAuthorizedAt: '2026-08-31T09:00:00.000Z',
        activationExpiresAt: '2026-08-31T12:00:00.000Z',
      };
    },
    readDatabaseTime: async () => {
      calls.push('db-clock');
      return '2026-08-31T12:01:00.000Z';
    },
    buildAutomaticL2Diff: async () => zeroAutomaticDiff(automatic.ownedTables),
    persistRunChain: async () => calls.push('persist'),
    applyFrozenImport: async () => { calls.push('apply'); return { inserted: 0 }; },
    advanceMutationGenerations: async () => calls.push('generation'),
    persistCommittedApply: async () => calls.push('result'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
  };

  await assert.rejects(
    executeSupplementaryL1Operation({
      adapter,
      bundle: automatic,
      authorizationContext: {
        ...authorization(automatic.operationId),
        authorizedAt: '2026-08-31T09:00:00.000Z',
        expiresAt: '2026-08-31T12:00:00.000Z',
        executionMode: 'ACTIVATION_GATED_AUTO',
        activationDecisionIdentity: 'activation-1',
        activationPacketHash: HASH('e'),
        activationPolicySetHash: HASH('b'),
      },
      now: '2026-08-31T10:00:00.000Z',
    }),
    /database.*clock|expired|activation.*valid/i,
  );

  assert.deepEqual(calls, ['begin', 'lock', 'db-clock', 'rollback']);
});

test('automatic execution revalidates the database clock after a delayed L2 gate before persistence', async () => {
  const automatic = automaticBundle('audio', {
    importPlan: { l2Diff: zeroAutomaticDiff(automaticBundle('audio').ownedTables) },
  });
  const calls = [];
  const gateStarted = createDeferred();
  const releaseGate = createDeferred();
  let clockReads = 0;
  const adapter = {
    begin: async () => calls.push('begin'),
    lockCurrentContext: async () => {
      calls.push('lock');
      return {
        ownerUsername: 'admin', ownerStatus: 'ACTIVE', domainId: 'audio',
        policyVersion: 2, policyHash: HASH('a'), policySetHash: HASH('b'),
        currentLevel: 'L2', operationalState: 'ACTIVE', policyJson: automatic.policy.policyJson,
        ownedTables: automatic.ownedTables, baselineFingerprint: automatic.baselineFingerprint,
        approvalConsumed: false, activationDecisionIdentity: 'activation-1',
        activationPacketHash: HASH('e'), activationPolicySetHash: HASH('b'),
        activationAuthorizedAt: '2026-08-31T09:00:00.000Z',
        activationExpiresAt: '2026-08-31T11:00:00.000Z',
      };
    },
    readDatabaseTime: async () => {
      calls.push('db-clock');
      clockReads += 1;
      return clockReads === 1
        ? '2026-08-31T10:00:00.000Z'
        : '2026-08-31T11:00:00.000Z';
    },
    buildAutomaticL2Diff: async () => {
      calls.push('gate');
      gateStarted.resolve();
      await releaseGate.promise;
      return zeroAutomaticDiff(automatic.ownedTables);
    },
    persistRunChain: async () => calls.push('persist'),
    applyFrozenImport: async () => { calls.push('apply'); return { inserted: 0 }; },
    advanceMutationGenerations: async () => calls.push('generation'),
    persistCommittedApply: async () => calls.push('result'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
  };

  const operation = executeSupplementaryL1Operation({
    adapter,
    bundle: automatic,
    authorizationContext: {
      ...authorization(automatic.operationId),
      authorizedAt: '2026-08-31T09:00:00.000Z',
      expiresAt: '2026-08-31T11:00:00.000Z',
      executionMode: 'ACTIVATION_GATED_AUTO',
      activationDecisionIdentity: 'activation-1',
      activationPacketHash: HASH('e'),
      activationPolicySetHash: HASH('b'),
    },
    now: '2026-08-31T10:00:00.000Z',
  });

  try {
    await gateStarted.promise;
    releaseGate.resolve();
    await assert.rejects(operation, /database.*clock|expired|activation.*valid/i);
    assert.deepEqual(calls, ['begin', 'lock', 'db-clock', 'gate', 'db-clock', 'rollback']);
  } finally {
    releaseGate.resolve();
    await operation.catch(() => {});
  }
});

test('automatic execution admits a registered shared NPC structured scope before persistence', async () => {
  const npcCompareColumns = [
    'source_id',
    'internal_name',
    'name',
    'name_zh',
    'sub_name',
    'sub_name_zh',
    'category_id',
    'is_boss',
    'is_friendly',
    'is_town_npc',
    'net_id',
    'npc_type',
    'ai_style',
    'damage',
    'defense',
    'life_max',
    'knock_back_resist',
    'width',
    'height',
    'scale',
    'value',
    'banner_source_item_id',
    'banner_item_id',
    'catch_source_item_id',
    'catch_item_id',
    'buff_immune',
    'raw_json',
    'status',
    'deleted',
  ];
  const npcScope = {
    databaseRole: 'local',
    table: 'npcs',
    fieldGroup: 'npc_owned',
    logicalPredicateHash: 'sha256:694a8d7bb81ab810737b5fc36b6815db4a5a849f5bc2a37c14bc8edd2295a09d',
  };
  const policyJson = {
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
    ownedTables: [npcScope],
  };
  const automatic = buildSupplementaryL1Bundle({
    operationId: 'automation-npcs-l1',
    runId: 'npcs_l1_auto_20260831_01',
    domainId: 'npcs',
    generatedAt: '2026-08-31T10:00:00.000Z',
    executionMode: 'ACTIVATION_GATED_AUTO',
    policy: {
      domainId: 'npcs',
      level: 'L2',
      operationalState: 'ACTIVE',
      policyVersion: 2,
      policyHash: HASH('a'),
      policySetHash: HASH('b'),
      policyJson,
    },
    baseline: {
      environmentId: 'local',
      generations: [{ ...npcScope, generation: 2 }],
      projectionHash: HASH('c'),
    },
    source: {
      path: 'reports/authorization/canonical/automatic/npcs/npcs_l1_auto_20260831_01/source.json',
      sha256: HASH('d'),
    },
    ownedTables: [npcScope],
    importPlan: {},
  });
  const structuredDiff = {
    schemaVersion: 1,
    producer: 'structured_source_rows_v1',
    rowCountEvidence: 'verified_structured_row_diff',
    snapshot: true,
    wholeDomainRebuild: false,
    sourceCheckedAt: '2026-08-31T09:59:00.000Z',
    scopes: [{
      scopeId: 'local.npcs.npc_owned',
      ...npcScope,
      keyColumns: ['source_id'],
      compareColumns: npcCompareColumns,
      mutationKind: 'entity',
      entityBaselineCount: 10,
      relationshipBaselineCount: 0,
      inserts: 0,
      updates: 0,
      relationshipDeletes: 0,
      softDisables: 0,
      hardDeletes: 0,
      insertedKeys: [],
      updatedKeys: [],
      deletedRelationshipKeys: [],
      softDisabledKeys: [],
      hardDeletedKeys: [],
    }],
    rowLevelEvidence: {
      schemaVersion: 1,
      completeSnapshot: true,
      scopes: [{
        scopeId: 'local.npcs.npc_owned',
        ...npcScope,
        keyColumns: ['source_id'],
        compareColumns: npcCompareColumns,
        mutationKind: 'entity',
        candidateRowCount: 10,
        baselineRowCount: 10,
        candidateRowsSha256: HASH('1'),
        baselineRowsSha256: HASH('2'),
      }],
    },
    counts: {
      entityBaselineCount: 10,
      relationshipBaselineCount: 0,
      inserts: 0,
      updates: 0,
      relationshipDeletes: 0,
      softDisables: 0,
      hardDeletes: 0,
    },
  };
  const calls = [];
  const adapter = {
    begin: async () => calls.push('begin'),
    lockCurrentContext: async () => ({
      ownerUsername: 'admin', ownerStatus: 'ACTIVE', domainId: 'npcs',
      policyVersion: 2, policyHash: HASH('a'), policySetHash: HASH('b'),
      currentLevel: 'L2', operationalState: 'ACTIVE', policyJson,
      ownedTables: [npcScope], baselineFingerprint: automatic.baselineFingerprint,
      approvalConsumed: false, activationDecisionIdentity: 'activation-1',
      activationPacketHash: HASH('e'), activationPolicySetHash: HASH('b'),
      activationExpiresAt: '2026-08-31T11:00:00.000Z',
    }),
    readDatabaseTime: async ({ executionTime }) => {
      calls.push('db-clock');
      return executionTime;
    },
    buildAutomaticL2Diff: async () => { calls.push('gate'); return structuredDiff; },
    persistRunChain: async () => calls.push('persist'),
    applyFrozenImport: async () => { calls.push('apply'); return { inserted: 0 }; },
    advanceMutationGenerations: async () => calls.push('generation'),
    persistCommittedApply: async () => calls.push('result'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
  };

  const result = await executeSupplementaryL1Operation({
    adapter,
    bundle: automatic,
    authorizationContext: {
      ...authorization(automatic.operationId),
      authorizedAt: '2026-08-31T09:00:00.000Z',
      expiresAt: '2026-08-31T11:00:00.000Z',
      executionMode: 'ACTIVATION_GATED_AUTO',
      activationDecisionIdentity: 'activation-1',
      activationPacketHash: HASH('e'),
      activationPolicySetHash: HASH('b'),
    },
    now: '2026-08-31T10:00:00.000Z',
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(calls, ['begin', 'db-clock', 'gate', 'db-clock', 'persist', 'apply', 'generation', 'result', 'commit']);
});

test('activation-gated scoped ownership rejects before a transaction or automatic persistence', async () => {
  const standard = automaticBundle('audio');
  const ownedTables = standard.ownedTables.map((scope, index) => index === 0
    ? { ...scope, fieldGroup: 'audio_metadata', logicalPredicateHash: HASH('f') }
    : scope);
  const frozen = automaticBundle('audio', {
    policy: {
      ...standard.policy,
      policyJson: { ...standard.policy.policyJson, ownedTables },
    },
    ownedTables,
  });
  const scopes = ownedTables.map((scope) => ({
    scopeId: `${scope.databaseRole}.${scope.table}.${scope.fieldGroup}.${scope.logicalPredicateHash ?? ''}`,
    ...scope,
    entityBaselineCount: 1,
    relationshipBaselineCount: 1,
    inserts: 0,
    updates: 0,
    relationshipDeletes: 0,
    softDisables: 0,
    hardDeletes: 0,
    insertedKeys: [],
    updatedKeys: [],
    deletedRelationshipKeys: [],
    softDisabledKeys: [],
    hardDeletedKeys: [],
  }));
  const calls = [];
  const adapter = {
    begin: async () => calls.push('begin'),
    lockCurrentContext: async () => {
      calls.push('lock');
      return {
        ownerUsername: 'admin', ownerStatus: 'ACTIVE', domainId: 'audio',
        policyVersion: 2, policyHash: HASH('a'), policySetHash: HASH('b'),
        currentLevel: 'L2', operationalState: 'ACTIVE', policyJson: frozen.policy.policyJson,
        ownedTables: frozen.ownedTables, baselineFingerprint: frozen.baselineFingerprint,
        approvalConsumed: false, activationDecisionIdentity: 'activation-1',
        activationPacketHash: HASH('e'), activationPolicySetHash: HASH('b'),
        activationExpiresAt: '2026-08-31T11:00:00.000Z',
      };
    },
    buildAutomaticL2Diff: async () => {
      calls.push('gate');
      return {
        schemaVersion: 1,
        snapshot: true,
        sourceCheckedAt: '2026-08-31T09:59:00.000Z',
        wholeDomainRebuild: false,
        scopes,
        counts: {
          entityBaselineCount: scopes.length,
          relationshipBaselineCount: scopes.length,
          inserts: 0,
          updates: 0,
          relationshipDeletes: 0,
          softDisables: 0,
          hardDeletes: 0,
        },
      };
    },
    persistRunChain: async () => calls.push('persist'),
    applyFrozenImport: async () => { calls.push('apply'); return { inserted: 0 }; },
    advanceMutationGenerations: async () => calls.push('generation'),
    persistCommittedApply: async () => calls.push('result'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
  };

  const outcome = await executeSupplementaryL1Operation({
    adapter,
    bundle: frozen,
    authorizationContext: {
      ...authorization(frozen.operationId),
      authorizedAt: '2026-08-31T09:00:00.000Z',
      expiresAt: '2026-08-31T11:00:00.000Z',
      executionMode: 'ACTIVATION_GATED_AUTO',
      activationDecisionIdentity: 'activation-1',
      activationPacketHash: HASH('e'),
      activationPolicySetHash: HASH('b'),
    },
    now: '2026-08-31T10:00:00.000Z',
  }).then(
    (value) => ({ status: 'resolved', value }),
    (error) => ({ status: 'rejected', error }),
  );

  assert.deepEqual(calls, []);
  assert.equal(outcome.status, 'rejected');
  assert.match(outcome.error?.message ?? '', /cannot prove.*scoped ownership|structured SQL target producer/i);
});

test('automatic execution fails closed before persistence when the L2 gate is unavailable', async () => {
  const automatic = automaticBundle('audio', {
    importPlan: { ...bundle('audio').importPlan },
  });
  const calls = [];
  const adapter = {
    begin: async () => calls.push('begin'),
    lockCurrentContext: async () => ({
      ownerUsername: 'admin', ownerStatus: 'ACTIVE', domainId: 'audio',
      policyVersion: 2, policyHash: HASH('a'), policySetHash: HASH('b'),
      currentLevel: 'L2', operationalState: 'ACTIVE',
      ownedTables: automatic.ownedTables,
      baselineFingerprint: automatic.baselineFingerprint,
      approvalConsumed: false,
      activationDecisionIdentity: 'activation-1', activationPacketHash: HASH('e'),
      activationPolicySetHash: HASH('b'), activationExpiresAt: '2026-08-31T11:00:00.000Z',
    }),
    readDatabaseTime: async ({ executionTime }) => executionTime,
    persistRunChain: async () => calls.push('persist'),
    applyFrozenImport: async () => calls.push('apply'),
    advanceMutationGenerations: async () => {},
    persistCommittedApply: async () => {},
    commit: async () => {},
    rollback: async () => calls.push('rollback'),
  };
  await assert.rejects(
    executeSupplementaryL1Operation({
      adapter,
      bundle: automatic,
      authorizationContext: {
        ...authorization(automatic.operationId),
        authorizedAt: '2026-08-31T09:00:00.000Z',
        expiresAt: '2026-08-31T11:00:00.000Z',
        executionMode: 'ACTIVATION_GATED_AUTO',
        activationDecisionIdentity: 'activation-1', activationPacketHash: HASH('e'), activationPolicySetHash: HASH('b'),
      },
      now: '2026-08-31T10:00:00.000Z',
    }),
    /automatic L2 gate|diff evidence|ceiling/i,
  );
  assert.deepEqual(calls, ['begin', 'rollback']);
});

test('automatic current context derives its exact scoped ownership from the live L2 policy', async () => {
  const policyScopes = [
    { databaseRole: 'local', table: 'boss_groups', fieldGroup: 'all_columns' },
    { databaseRole: 'local', table: 'npcs', fieldGroup: 'boss_owned', logicalPredicateHash: HASH('d') },
  ];
  const connection = {
    async query(sql) {
      if (/crawler_automation_owner/.test(sql)) return [[{ username: 'admin', status: 'ACTIVE' }]];
      if (/SELECT p\.domain_id/.test(sql)) {
        return [[{
          domainId: 'bosses',
          policyVersion: 2,
          policyHash: HASH('a'),
          currentLevel: 'L2',
          operationalState: 'ACTIVE',
          policyJson: JSON.stringify({
            schemaVersion: 1,
            level: 'L2',
            ownedTables: policyScopes,
          }),
        }]];
      }
      if (/crawler_automation_mutation_generation/.test(sql)) return [[{ generation: 7 }]];
      if (/FROM `boss_groups`/.test(sql) || /FROM `npcs`/.test(sql)) return [[]];
      if (/crawler_automation_activation_decision/.test(sql)) return [[]];
      throw new Error(`unexpected query: ${sql}`);
    },
  };

  const current = await operationModule.readCurrentSupplementaryContext(connection, {
    bundle: {
      domainId: 'bosses',
      executionMode: 'ACTIVATION_GATED_AUTO',
      ownedTables: [
        { databaseRole: 'local', table: 'boss_groups' },
        { databaseRole: 'local', table: 'npcs' },
      ],
    },
  });

  assert.deepEqual(current.ownedTables, policyScopes);
  assert.deepEqual(current.baseline.generations, policyScopes.map((scope) => ({ ...scope, generation: 7 })));
});

test('automatic Item context freezes every dependency field used by the importer projection', async () => {
  const itemScope = { databaseRole: 'local', table: 'items', fieldGroup: 'all_columns' };
  const itemRow = {
    id: 41,
    internal_name: 'GuideVoodooFish',
    name: 'Guide Voodoo Fish',
    name_zh: '向导巫毒鱼',
    image: 'http://localhost:9000/terrapedia-images/items/guide-voodoo-fish.png',
    category_id: 7,
    description: 'A preserved Item dependency.',
    damage: 1,
    defense: 0,
    knockback: 0,
    use_time: 20,
    width: 24,
    height: 24,
    buy: 10,
    sell: 2,
    tooltip: 'Summons the guide',
    rarity_id: 2,
    game_period_id: 3,
    game_model_id: 4,
    is_stackable: 0,
    stack_size: 1,
    status: 1,
    deleted: 0,
  };
  const queries = [];
  const connection = {
    async query(sql) {
      queries.push(sql);
      if (/crawler_automation_owner/.test(sql)) return [[{ username: 'admin', status: 'ACTIVE' }]];
      if (/SELECT p\.domain_id/.test(sql)) {
        return [[{
          domainId: 'items',
          policyVersion: 2,
          policyHash: HASH('a'),
          currentLevel: 'L2',
          operationalState: 'ACTIVE',
          policyJson: JSON.stringify({ schemaVersion: 1, level: 'L2', ownedTables: [itemScope] }),
        }]];
      }
      if (/crawler_automation_mutation_generation/.test(sql)) return [[{ generation: 7 }]];
      if (/FROM `items`/.test(sql)) return [[itemRow]];
      if (/FROM `category`/.test(sql)) return [[{ id: 7, code: 'WEAPON' }]];
      if (/crawler_automation_activation_decision/.test(sql)) return [[]];
      throw new Error(`unexpected query: ${sql}`);
    },
  };

  const current = await operationModule.readCurrentSupplementaryContext(connection, {
    bundle: {
      domainId: 'items',
      executionMode: 'ACTIVATION_GATED_AUTO',
      ownedTables: [itemScope],
    },
  });

  const dependencyQuery = queries.find((sql) => /SELECT id, internal_name/.test(sql));
  assert.ok(dependencyQuery, 'Item dependency query must be present');
  assert.doesNotMatch(dependencyQuery, /\bsource_id\b/, 'Item dependency query must use the real Items schema');
  for (const column of [
    'image',
    'category_id',
    'description',
    'damage',
    'defense',
    'knockback',
    'use_time',
    'width',
    'height',
    'buy',
    'sell',
    'tooltip',
    'rarity_id',
    'game_period_id',
    'game_model_id',
    'is_stackable',
    'stack_size',
    'status',
    'deleted',
  ]) {
    assert.match(dependencyQuery, new RegExp(`\\b${column}\\b`), `dependency query must select ${column}`);
  }
  assert.deepEqual(current.baseline.dependencyTables.items, [itemRow]);
});

test('automatic current context rejects a bundle whose scope order differs from persisted policy', async () => {
  const policyScopes = [
    { databaseRole: 'local', table: 'boss_groups', fieldGroup: 'all_columns' },
    { databaseRole: 'local', table: 'npcs', fieldGroup: 'boss_owned', logicalPredicateHash: HASH('d') },
  ];
  const connection = {
    async query(sql) {
      if (/crawler_automation_owner/.test(sql)) return [[{ username: 'admin', status: 'ACTIVE' }]];
      if (/SELECT p\.domain_id/.test(sql)) {
        return [[{
          domainId: 'bosses',
          policyVersion: 2,
          policyHash: HASH('a'),
          currentLevel: 'L2',
          operationalState: 'ACTIVE',
          policyJson: JSON.stringify({ schemaVersion: 1, level: 'L2', ownedTables: policyScopes }),
        }]];
      }
      if (/crawler_automation_mutation_generation/.test(sql)) return [[{ generation: 7 }]];
      if (/FROM `boss_groups`/.test(sql) || /FROM `npcs`/.test(sql)) return [[]];
      if (/crawler_automation_activation_decision/.test(sql)) return [[]];
      throw new Error(`unexpected query: ${sql}`);
    },
  };
  const reordered = [...policyScopes].reverse();

  await assert.rejects(
    operationModule.readCurrentSupplementaryContext(connection, {
      bundle: {
        domainId: 'bosses',
        executionMode: 'ACTIVATION_GATED_AUTO',
        ownedTables: reordered,
      },
    }),
    /order|scope|policy|match/i,
  );
});

test('automatic MySQL write fences preserve the current policy field group and predicate hash', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mysql-automatic-scoped-fence-'));
  const runId = 'bosses_l1_auto_fence01';
  const artifact = prepareCanonicalAutomaticArtifact(root, {
    domainId: 'bosses',
    runId,
    sourceBytes: Buffer.from('{"schemaVersion":1,"domainId":"bosses","records":[]}\n'),
  });
  const policyScopes = [
    { databaseRole: 'local', table: 'boss_groups', fieldGroup: 'all_columns' },
    { databaseRole: 'local', table: 'npcs', fieldGroup: 'boss_owned', logicalPredicateHash: HASH('d') },
  ];
  const sourceDispatchIdentity = {
    sourceFingerprint: HASH('e'),
    sourceRunIdentity: '2026-08-31T10:00:00.000Z',
    sourceContentIdentity: HASH('f'),
  };
  const frozen = buildSupplementaryL1Bundle({
    operationId: 'automation-bosses-first-l1',
    runId,
    domainId: 'bosses',
    generatedAt: '2026-08-31T10:00:00.000Z',
    executionMode: 'ACTIVATION_GATED_AUTO',
    policy: {
      domainId: 'bosses', level: 'L2', operationalState: 'ACTIVE', policyVersion: 2,
      policyHash: HASH('a'), policySetHash: HASH('b'),
      policyJson: {
        schemaVersion: 1, level: 'L2', requireSnapshot: true, anomalyAction: 'CIRCUIT_OPEN',
        ratioInsertCap: 0.1, ratioUpdateCap: 0.1, ratioRelationshipDeleteCap: 0.05, ratioDisableCap: 0.005,
        absoluteInsertCap: 500, absoluteUpdateCap: 500, absoluteRelationshipDeleteCap: 200, absoluteDisableCap: 20,
        sourceFreshnessMaxAgeMinutes: 60, ownedTables: policyScopes,
      },
    },
    baseline: {
      environmentId: 'local',
      generations: policyScopes.map((scope) => ({ ...scope, generation: 2 })),
      projectionHash: HASH('c'),
    },
    source: artifact.source,
    sourceDispatchIdentity,
    ownedTables: policyScopes,
    importPlan: { records: [] },
  });
  fs.writeFileSync(artifact.bundlePath, `${JSON.stringify(frozen)}\n`, { mode: 0o600 });
  const queries = [];
  const connection = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (/INSERT INTO crawler_automation_apply/.test(sql)) return [{ insertId: 7 }];
      return [{ affectedRows: 1 }];
    },
  };
  const adapter = operationModule.createMysqlSupplementaryL1Adapter(connection, {
    bundlePath: artifact.bundlePath,
    repoRoot: root,
  });

  await adapter.persistRunChain(frozen, {
    ...authorization(frozen.operationId),
    authorizedAt: '2026-08-31T09:00:00.000Z',
    expiresAt: '2026-08-31T11:00:00.000Z',
    executionMode: 'ACTIVATION_GATED_AUTO',
    activationDecisionIdentity: 'activation-1',
    activationPacketHash: HASH('f'),
    activationPolicySetHash: HASH('b'),
  }, { counts: {} });

  const fenceParams = queries
    .filter(({ sql }) => /INSERT INTO crawler_automation_write_fence/.test(sql))
    .map(({ params }) => ({ table: params[2], fieldGroup: params[3], logicalPredicateHash: params[4] }));
  assert.deepEqual(fenceParams, [
    { table: 'boss_groups', fieldGroup: 'all_columns', logicalPredicateHash: 'sha256:01d1d67c18498c24b952f18bede005859e426058eccd3e441bcac4b025fde289' },
    { table: 'npcs', fieldGroup: 'boss_owned', logicalPredicateHash: HASH('d') },
  ]);
  const evidenceSet = queries.find(({ sql }) => /INSERT INTO crawler_automation_evidence_set/.test(sql));
  assert.deepEqual(JSON.parse(evidenceSet.params[2]).sourceDispatchIdentity, sourceDispatchIdentity);

  await adapter.advanceMutationGenerations(frozen);
  const fenceUpdateParams = queries
    .filter(({ sql }) => /UPDATE crawler_automation_write_fence SET committed_generation/.test(sql))
    .map(({ params }) => ({
      table: params[4],
      fieldGroup: params[5],
      logicalPredicateHash: params[6],
    }));
  assert.deepEqual(fenceUpdateParams, [
    { table: 'boss_groups', fieldGroup: 'all_columns', logicalPredicateHash: 'sha256:01d1d67c18498c24b952f18bede005859e426058eccd3e441bcac4b025fde289' },
    { table: 'npcs', fieldGroup: 'boss_owned', logicalPredicateHash: HASH('d') },
  ]);
});

test('automatic MySQL adapter delegates L2 diff construction to the read-only producer', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mysql-automatic-diff-producer-'));
  const runId = 'audio_l1_20260814_01';
  const artifact = prepareCanonicalAutomaticArtifact(root, { domainId: 'audio', runId });
  const frozen = automaticBundle('audio', { runId, source: artifact.source });
  fs.writeFileSync(artifact.bundlePath, `${JSON.stringify(frozen)}\n`, { mode: 0o600 });
  const connection = { marker: 'connection' };
  const calls = [];
  const adapter = operationModule.createMysqlSupplementaryL1Adapter(connection, {
    bundlePath: artifact.bundlePath,
    repoRoot: root,
    buildAutomaticL2DiffImpl: async (input) => {
      calls.push(input);
      return { marker: 'read-only-diff' };
    },
  });

  const current = { marker: 'current' };
  const result = await adapter.buildAutomaticL2Diff({
    bundle: frozen,
    current,
    executionTime: '2026-08-31T10:00:00.000Z',
  });

  assert.deepEqual(result, { marker: 'read-only-diff' });
  assert.deepEqual(calls, [{
    repoRoot: root,
    connection,
    bundle: frozen,
    current,
    executionTime: '2026-08-31T10:00:00.000Z',
  }]);
});

test('automatic MySQL adapter locks the exact activation row while reading the database clock', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mysql-automatic-activation-clock-'));
  const runId = 'audio_l1_20260814_clock01';
  const artifact = prepareCanonicalAutomaticArtifact(root, { domainId: 'audio', runId });
  const frozen = automaticBundle('audio', { runId, source: artifact.source });
  fs.writeFileSync(artifact.bundlePath, `${JSON.stringify(frozen)}\n`, { mode: 0o600 });
  const queries = [];
  const connection = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      return [[{
        decisionIdentity: 'activation-1',
        packetHash: HASH('e'),
        policySetHash: HASH('b'),
        actor: 'admin',
        reason: 'test',
        authorizationReference: 'owner-approval',
        authorizedAt: '2026-08-31 09:00:00',
        expiresAt: '2026-08-31 11:00:00',
        databaseTime: '2026-08-31 10:00:00',
      }]];
    },
  };
  const adapter = operationModule.createMysqlSupplementaryL1Adapter(connection, {
    bundlePath: artifact.bundlePath,
    repoRoot: root,
  });

  const result = await adapter.readDatabaseTime({
    authorizationContext: {
      activationDecisionIdentity: 'activation-1',
      activationPacketHash: HASH('e'),
      activationPolicySetHash: HASH('b'),
    },
  });

  assert.equal(result.databaseTime, '2026-08-31 10:00:00');
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /CURRENT_TIMESTAMP/);
  assert.match(queries[0].sql, /decision_identity = \?/);
  assert.match(queries[0].sql, /packet_hash = \?/);
  assert.match(queries[0].sql, /policy_set_hash = \?/);
  assert.match(queries[0].sql, /LIMIT 1 FOR UPDATE/);
  assert.deepEqual(queries[0].params, ['SCHEDULER_ACTIVATION', 'crawler_v2_scheduler', 'activation-1', HASH('e'), HASH('b')]);
});

test('automatic execution rolls back before persistence when current policy scope drifts', async () => {
  const frozen = automaticBundle('audio', {
    importPlan: {
      l2Diff: {
        schemaVersion: 1,
        snapshot: true,
        sourceCheckedAt: '2026-08-31T09:59:00.000Z',
        wholeDomainRebuild: false,
        scopes: ['audio_assets', 'audio_asset_links'].map((table) => ({
          scopeId: `local.${table}`,
          databaseRole: 'local',
          table,
          fieldGroup: 'all_columns',
          entityBaselineCount: 10,
          relationshipBaselineCount: 0,
          inserts: 0,
          updates: 0,
          relationshipDeletes: 0,
          softDisables: 0,
          hardDeletes: 0,
          insertedKeys: [],
          updatedKeys: [],
          deletedRelationshipKeys: [],
          softDisabledKeys: [],
          hardDeletedKeys: [],
        })),
        counts: {
          entityBaselineCount: 20,
          relationshipBaselineCount: 0,
          inserts: 0,
          updates: 0,
          relationshipDeletes: 0,
          softDisables: 0,
          hardDeletes: 0,
        },
      },
    },
  });
  const calls = [];
  const adapter = {
    begin: async () => calls.push('begin'),
    lockCurrentContext: async () => ({
      ownerUsername: 'admin', ownerStatus: 'ACTIVE', domainId: 'audio',
      policyVersion: 2, policyHash: HASH('a'), policySetHash: HASH('b'),
      currentLevel: 'L2', operationalState: 'ACTIVE', policyJson: frozen.policy.policyJson,
      ownedTables: [{ databaseRole: 'local', table: 'audio_assets', fieldGroup: 'all_columns' }],
      baselineFingerprint: frozen.baselineFingerprint, approvalConsumed: false,
      activationDecisionIdentity: 'activation-1', activationPacketHash: HASH('e'),
      activationPolicySetHash: HASH('b'), activationExpiresAt: '2026-08-31T11:00:00.000Z',
    }),
    buildAutomaticL2Diff: async () => frozen.importPlan.l2Diff,
    persistRunChain: async () => calls.push('persist'),
    applyFrozenImport: async () => calls.push('apply'),
    advanceMutationGenerations: async () => {},
    persistCommittedApply: async () => {},
    commit: async () => {},
    rollback: async () => calls.push('rollback'),
  };

  await assert.rejects(
    executeSupplementaryL1Operation({
      adapter,
      bundle: frozen,
      authorizationContext: {
        ...authorization(frozen.operationId),
        authorizedAt: '2026-08-31T09:00:00.000Z',
        expiresAt: '2026-08-31T11:00:00.000Z',
        executionMode: 'ACTIVATION_GATED_AUTO',
        activationDecisionIdentity: 'activation-1', activationPacketHash: HASH('e'), activationPolicySetHash: HASH('b'),
      },
      now: '2026-08-31T10:00:00.000Z',
    }),
    /owned table scope|scope.*match/i,
  );
  assert.deepEqual(calls, ['begin', 'rollback']);
});

test('records a durable alert after a pre-commit import failure', async () => {
  const frozen = bundle();
  const alerts = [];
  const adapter = {
    begin: async () => {},
    lockCurrentContext: async () => ({
      ownerUsername: 'admin', ownerStatus: 'ACTIVE', domainId: 'audio',
      policyVersion: 1, policyHash: HASH('a'), policySetHash: HASH('b'),
      currentLevel: 'L1', operationalState: 'ACTIVE',
      baselineFingerprint: frozen.baselineFingerprint,
      approvalMode: 'APPROVED_OWNER_L1', approvalConsumed: false,
    }),
    persistRunChain: async () => {},
    applyFrozenImport: async () => { throw new Error('import row failed'); },
    advanceMutationGenerations: async () => {},
    persistCommittedApply: async () => {},
    commit: async () => {},
    rollback: async () => {},
    recordAlert: async (payload) => alerts.push(payload),
  };

  await assert.rejects(
    executeSupplementaryL1Operation({
      adapter,
      bundle: frozen,
      authorizationContext: authorization(frozen.operationId),
      now: '2026-08-14T06:02:00.000Z',
    }),
    /import row failed/,
  );

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].severity, 'CRITICAL');
  assert.equal(alerts[0].runId, null);
  assert.equal(alerts[0].dedupeKey, `automation:audio:${frozen.runId}:pre-commit-apply`);
  assert.equal(alerts[0].details.compensationStatus, 'not_attempted');
});

test('MySQL alert adapter preserves a null run id after the run transaction rolled back', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mysql-alert-null-run-'));
  const bundlePath = path.join(root, 'bundle.json');
  const frozen = bundle();
  fs.writeFileSync(bundlePath, `${JSON.stringify(frozen)}\n`, { mode: 0o600 });
  const queries = [];
  const connection = {
    async query(sql, params) {
      queries.push({ sql, params });
      return [{ affectedRows: 1 }];
    },
  };
  const adapter = operationModule.createMysqlSupplementaryL1Adapter(connection, {
    bundlePath,
    repoRoot: root,
  });

  await adapter.recordAlert({
    bundle: frozen,
    runId: null,
    severity: 'CRITICAL',
    dedupeKey: `automation:audio:${frozen.runId}:pre-commit-apply`,
    details: { title: 'Automatic import failed' },
  });

  const alertInsert = queries.find(({ sql }) => /INSERT INTO crawler_automation_alert/.test(sql));
  assert.ok(alertInsert);
  assert.equal(alertInsert.params[0], null);
});

test('treats a failed commit acknowledgement as an ambiguous committed operation', async () => {
  const frozen = bundle();
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
    applyFrozenImport: async () => { calls.push('apply'); return { inserted: 1 }; },
    advanceMutationGenerations: async () => calls.push('generation'),
    persistCommittedApply: async () => calls.push('result'),
    commit: async () => {
      calls.push('commit');
      throw new Error('commit acknowledgement lost');
    },
    rollback: async () => calls.push('rollback'),
    compensate: async ({ reason }) => {
      calls.push(`compensate:${reason}`);
      return { status: 'compensated' };
    },
    recordAlert: async ({ runId, severity, dedupeKey, details }) => {
      calls.push(`alert:${runId}:${severity}:${dedupeKey}:${details.compensationStatus}`);
    },
  };

  await assert.rejects(
    executeSupplementaryL1Operation({
      adapter,
      bundle: frozen,
      authorizationContext: authorization(frozen.operationId),
      now: '2026-08-14T06:02:00.000Z',
    }),
    /commit acknowledgement lost/,
  );

  assert.deepEqual(calls, [
    'begin', 'persist', 'apply', 'generation', 'result', 'commit',
    'compensate:post_commit_verification_failed',
    `alert:${frozen.runId}:WARNING:automation:audio:${frozen.runId}:post-commit-verification:compensated`,
  ]);
});

test('compensates a committed operation when post-commit verification fails', async () => {
  const frozen = bundle();
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
    applyFrozenImport: async () => { calls.push('apply'); return { inserted: 1 }; },
    advanceMutationGenerations: async () => calls.push('generation'),
    persistCommittedApply: async () => calls.push('result'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    postCommitVerify: async () => { calls.push('verify'); throw new Error('API readback failed'); },
    compensate: async ({ reason }) => { calls.push(`compensate:${reason}`); return { status: 'compensated' }; },
    recordAlert: async ({ severity, dedupeKey, details }) => {
      calls.push(`alert:${severity}:${dedupeKey}:${details.compensationStatus}`);
    },
  };

  await assert.rejects(
    executeSupplementaryL1Operation({
      adapter,
      bundle: frozen,
      authorizationContext: authorization(frozen.operationId),
      now: '2026-08-14T06:02:00.000Z',
    }),
    (error) => error.message.includes('API readback failed')
      && error.compensation?.status === 'compensated',
  );
  assert.deepEqual(calls, [
    'begin', 'persist', 'apply', 'generation', 'result', 'commit', 'verify',
    'compensate:post_commit_verification_failed',
    `alert:WARNING:automation:audio:${frozen.runId}:post-commit-verification:compensated`,
  ]);
});

test('marks an operation compensation failure and raises a critical alert', async () => {
  const frozen = bundle();
  const calls = [];
  const adapter = {
    begin: async () => {},
    lockCurrentContext: async () => ({
      ownerUsername: 'admin', ownerStatus: 'ACTIVE', domainId: 'audio',
      policyVersion: 1, policyHash: HASH('a'), policySetHash: HASH('b'),
      currentLevel: 'L1', operationalState: 'ACTIVE',
      baselineFingerprint: frozen.baselineFingerprint,
      approvalMode: 'APPROVED_OWNER_L1', approvalConsumed: false,
    }),
    persistRunChain: async () => {},
    applyFrozenImport: async () => ({ inserted: 1 }),
    advanceMutationGenerations: async () => {},
    persistCommittedApply: async () => {},
    commit: async () => {},
    rollback: async () => {},
    postCommitVerify: async () => { throw new Error('API readback failed'); },
    compensate: async () => { throw new Error('generation fence changed'); },
    markCompensationFailed: async () => {
      calls.push('mark:COMPENSATION_FAILED');
      return compensationFailedConfirmation(frozen);
    },
    recordAlert: async ({ severity, details }) => calls.push(`alert:${severity}:${details.compensationStatus}`),
  };

  await assert.rejects(
    executeSupplementaryL1Operation({
      adapter,
      bundle: frozen,
      authorizationContext: authorization(frozen.operationId),
      now: '2026-08-14T06:02:00.000Z',
    }),
    /API readback failed/,
  );
  assert.deepEqual(calls, ['mark:COMPENSATION_FAILED', 'alert:CRITICAL:compensation_failed']);
});

test('records a distinct critical alert when post-commit compensation is unavailable', async () => {
  const frozen = bundle();
  const alerts = [];
  const adapter = {
    begin: async () => {},
    lockCurrentContext: async () => ({
      ownerUsername: 'admin', ownerStatus: 'ACTIVE', domainId: 'audio',
      policyVersion: 1, policyHash: HASH('a'), policySetHash: HASH('b'),
      currentLevel: 'L1', operationalState: 'ACTIVE',
      baselineFingerprint: frozen.baselineFingerprint,
      approvalMode: 'APPROVED_OWNER_L1', approvalConsumed: false,
    }),
    persistRunChain: async () => {},
    applyFrozenImport: async () => ({ inserted: 1 }),
    advanceMutationGenerations: async () => {},
    persistCommittedApply: async () => {},
    commit: async () => {},
    rollback: async () => {},
    postCommitVerify: async () => { throw new Error('API readback failed'); },
    markCompensationFailed: async () => compensationFailedConfirmation(frozen),
    recordAlert: async (payload) => alerts.push(payload),
  };

  await assert.rejects(
    executeSupplementaryL1Operation({
      adapter,
      bundle: frozen,
      authorizationContext: authorization(frozen.operationId),
      now: '2026-08-14T06:02:00.000Z',
    }),
    /API readback failed/,
  );
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].severity, 'CRITICAL');
  assert.equal(alerts[0].details.title, 'Automatic import compensation is unavailable');
  assert.equal(alerts[0].details.reason, 'post_commit_compensation_unavailable');
  assert.equal(alerts[0].details.compensationStatus, 'compensation_unavailable');
});

test('keeps a compensation failure retryable when critical alert persistence fails', async () => {
  const frozen = bundle();
  const calls = [];
  const retryArtifact = {
    path: `reports/runtime/automation-alert-retry/audio/${frozen.runId}/critical-alert-delivery-retry.json`,
    sha256: HASH('f'),
  };
  const adapter = {
    begin: async () => {},
    lockCurrentContext: async () => ({
      ownerUsername: 'admin', ownerStatus: 'ACTIVE', domainId: 'audio',
      policyVersion: 1, policyHash: HASH('a'), policySetHash: HASH('b'),
      currentLevel: 'L1', operationalState: 'ACTIVE',
      baselineFingerprint: frozen.baselineFingerprint,
      approvalMode: 'APPROVED_OWNER_L1', approvalConsumed: false,
    }),
    persistRunChain: async () => {},
    applyFrozenImport: async () => ({ inserted: 1 }),
    advanceMutationGenerations: async () => {},
    persistCommittedApply: async () => {},
    commit: async () => {},
    rollback: async () => {},
    postCommitVerify: async () => { throw new Error('API readback failed'); },
    compensate: async () => { throw new Error('generation fence changed'); },
    markCompensationFailed: async () => {
      calls.push('mark:COMPENSATION_FAILED');
      return compensationFailedConfirmation(frozen);
    },
    recordAlert: async ({ severity, details }) => {
      calls.push(`alert:${severity}:${details.compensationStatus}`);
      throw new Error('alert ledger unavailable');
    },
    persistCriticalAlertRetry: async ({ retry }) => {
      calls.push(`retry:${retry.status}:${retry.compensationStatus}:${retry.dedupeKey}`);
      return retryArtifact;
    },
  };

  await assert.rejects(
    executeSupplementaryL1Operation({
      adapter,
      bundle: frozen,
      authorizationContext: authorization(frozen.operationId),
      now: '2026-08-14T06:02:00.000Z',
    }),
    (error) => error?.code === 'CRITICAL_ALERT_DELIVERY_RETRY_REQUIRED'
      && error?.compensationStatus === 'compensation_failed'
      && error?.alertDelivery?.status === 'retry_required'
      && error?.alertDelivery?.dedupeKey === `automation:audio:${frozen.runId}:post-commit-verification`
      && error?.alertDelivery?.retryArtifact?.path === retryArtifact.path
      && error?.alertDelivery?.retryArtifact?.sha256 === retryArtifact.sha256
      && error?.message.includes('API readback failed'),
  );
  assert.deepEqual(calls, [
    'mark:COMPENSATION_FAILED',
    'alert:CRITICAL:compensation_failed',
    `retry:PENDING:compensation_failed:automation:audio:${frozen.runId}:post-commit-verification`,
  ]);
});

test('persists critical alert retry evidence when the alert adapter is unavailable', async () => {
  const frozen = bundle();
  const calls = [];
  const retryArtifact = {
    path: `reports/runtime/automation-alert-retry/audio/${frozen.runId}/critical-alert-delivery-retry.json`,
    sha256: HASH('c'),
  };
  const adapter = {
    begin: async () => {},
    lockCurrentContext: async () => ({
      ownerUsername: 'admin', ownerStatus: 'ACTIVE', domainId: 'audio',
      policyVersion: 1, policyHash: HASH('a'), policySetHash: HASH('b'),
      currentLevel: 'L1', operationalState: 'ACTIVE',
      baselineFingerprint: frozen.baselineFingerprint,
      approvalMode: 'APPROVED_OWNER_L1', approvalConsumed: false,
    }),
    persistRunChain: async () => {},
    applyFrozenImport: async () => ({ inserted: 1 }),
    advanceMutationGenerations: async () => {},
    persistCommittedApply: async () => {},
    commit: async () => {},
    rollback: async () => {},
    postCommitVerify: async () => { throw new Error('API readback failed'); },
    compensate: async () => { throw new Error('generation fence changed'); },
    markCompensationFailed: async () => {
      calls.push('mark:COMPENSATION_FAILED');
      return compensationFailedConfirmation(frozen);
    },
    persistCriticalAlertRetry: async ({ retry }) => {
      calls.push(`retry:${retry.status}:${retry.compensationStatus}:${retry.reason}`);
      return retryArtifact;
    },
  };

  await assert.rejects(
    executeSupplementaryL1Operation({
      adapter,
      bundle: frozen,
      authorizationContext: authorization(frozen.operationId),
      now: '2026-08-14T06:02:00.000Z',
    }),
    (error) => error?.code === 'CRITICAL_ALERT_DELIVERY_RETRY_REQUIRED'
      && error?.alertDelivery?.reason === 'alert_adapter_unavailable'
      && error?.alertDelivery?.retryArtifact?.path === retryArtifact.path,
  );
  assert.deepEqual(calls, [
    'mark:COMPENSATION_FAILED',
    'retry:PENDING:compensation_failed:alert_adapter_unavailable',
  ]);
});

test('does not report a critical alert as delivered when compensation failure state cannot persist', async () => {
  const frozen = bundle();
  const calls = [];
  const retryArtifact = {
    path: `reports/runtime/automation-alert-retry/audio/${frozen.runId}/critical-alert-delivery-retry.json`,
    sha256: HASH('e'),
  };
  const adapter = {
    begin: async () => {},
    lockCurrentContext: async () => ({
      ownerUsername: 'admin', ownerStatus: 'ACTIVE', domainId: 'audio',
      policyVersion: 1, policyHash: HASH('a'), policySetHash: HASH('b'),
      currentLevel: 'L1', operationalState: 'ACTIVE',
      baselineFingerprint: frozen.baselineFingerprint,
      approvalMode: 'APPROVED_OWNER_L1', approvalConsumed: false,
    }),
    persistRunChain: async () => {},
    applyFrozenImport: async () => ({ inserted: 1 }),
    advanceMutationGenerations: async () => {},
    persistCommittedApply: async () => {},
    commit: async () => {},
    rollback: async () => {},
    postCommitVerify: async () => { throw new Error('API readback failed'); },
    compensate: async () => { throw new Error('generation fence changed'); },
    markCompensationFailed: async () => {
      calls.push('mark:COMPENSATION_FAILED');
      throw new Error('compensation state ledger unavailable');
    },
    recordAlert: async () => calls.push('alert:must-not-run'),
    persistCriticalAlertRetry: async ({ retry }) => {
      calls.push(`retry:${retry.status}:${retry.compensationStatus}:${retry.reason}`);
      return retryArtifact;
    },
  };

  await assert.rejects(
    executeSupplementaryL1Operation({
      adapter,
      bundle: frozen,
      authorizationContext: authorization(frozen.operationId),
      now: '2026-08-14T06:02:00.000Z',
    }),
    (error) => error?.code === 'CRITICAL_ALERT_DELIVERY_RETRY_REQUIRED'
      && error?.compensationStatus === 'compensation_state_unconfirmed'
      && error?.alertDelivery?.reason === 'compensation_state_persistence_failed'
      && error?.alertDelivery?.retryArtifact?.path === retryArtifact.path
      && error?.message.includes('API readback failed'),
  );
  assert.deepEqual(calls, [
    'mark:COMPENSATION_FAILED',
    'retry:PENDING:compensation_state_unconfirmed:compensation_state_persistence_failed',
  ]);
});

for (const {
  label,
  compensate,
  markCompensationFailed,
} of [
  {
    label: 'a zero marker confirmation after failed compensation',
    compensate: undefined,
    markCompensationFailed: async (frozen) => compensationFailedConfirmation(frozen, {
      applyAffectedRows: 0,
    }),
  },
  {
    label: 'a zero run marker confirmation after failed compensation',
    compensate: undefined,
    markCompensationFailed: async (frozen) => compensationFailedConfirmation(frozen, {
      runAffectedRows: 0,
    }),
  },
  {
    label: 'a mismatched marker readback after unavailable compensation',
    compensate: null,
    markCompensationFailed: async (frozen) => {
      const confirmation = compensationFailedConfirmation(frozen);
      return {
        ...confirmation,
        readback: {
          ...confirmation.readback,
          run: { ...confirmation.readback.run, status: 'COMPLETED' },
        },
      };
    },
  },
  {
    label: 'a missing marker writer after unavailable compensation',
    compensate: null,
    markCompensationFailed: null,
  },
  {
    label: 'a throwing marker writer after unavailable compensation',
    compensate: null,
    markCompensationFailed: async () => { throw new Error('marker ledger unavailable'); },
  },
]) {
  test(`keeps CRITICAL delivery retryable without recordAlert for ${label}`, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'critical-marker-state-'));
    const frozen = bundle();
    const calls = [];
    const adapter = postCommitFailureAdapter(frozen, {
      repoRoot: root,
      ...(compensate === undefined ? {} : { compensate }),
      ...(markCompensationFailed == null
        ? {}
        : { markCompensationFailed: () => markCompensationFailed(frozen) }),
      recordAlert: async () => calls.push('recordAlert'),
    });
    let failure = null;

    await assert.rejects(
      executeSupplementaryL1Operation({
        adapter,
        bundle: frozen,
        authorizationContext: authorization(frozen.operationId),
        now: '2026-08-14T06:02:00.000Z',
      }),
      (error) => {
        failure = error;
        return error?.code === 'CRITICAL_ALERT_DELIVERY_RETRY_REQUIRED'
          && error?.compensationStatus === 'compensation_state_unconfirmed'
          && error?.alertDelivery?.reason === 'compensation_state_persistence_failed';
      },
    );

    assert.deepEqual(calls, []);
    assert.equal(failure.alertDelivery.retryArtifact.path,
      `reports/runtime/automation-alert-retry/audio/${frozen.runId}/critical-alert-delivery-retry.json`);
    const artifactPath = path.join(root, failure.alertDelivery.retryArtifact.path);
    const retry = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    assert.equal(retry.status, 'PENDING');
    assert.equal(retry.compensationStatus, 'compensation_state_unconfirmed');
    assert.equal(retry.reason, 'compensation_state_persistence_failed');
    assert.equal(fs.statSync(artifactPath).mode & 0o777, 0o600);
  });
}

for (const unsafePath of [
  '/private/host/critical-alert-delivery-retry.json',
  '../outside/critical-alert-delivery-retry.json',
]) {
  test(`does not serialize adapter retry metadata with unsafe path ${unsafePath}`, async () => {
    const frozen = bundle();
    const adapter = postCommitFailureAdapter(frozen, {
      markCompensationFailed: async () => compensationFailedConfirmation(frozen),
      recordAlert: async () => { throw new Error('alert ledger unavailable'); },
      persistCriticalAlertRetry: async () => ({ path: unsafePath, sha256: HASH('f') }),
    });
    let failure = null;

    await assert.rejects(
      executeSupplementaryL1Operation({
        adapter,
        bundle: frozen,
        authorizationContext: authorization(frozen.operationId),
        now: '2026-08-14T06:02:00.000Z',
      }),
      (error) => {
        failure = error;
        return error?.code === 'CRITICAL_ALERT_DELIVERY_RETRY_REQUIRED';
      },
    );

    const serialized = JSON.stringify(operationModule.serializeSupplementaryL1OperationFailure(failure));
    assert.equal(failure.alertDelivery.retryArtifact, null);
    assert.equal(failure.alertDelivery.retryPersistenceStatus, 'failed');
    assert.equal(serialized.includes(unsafePath), false);
  });
}

test('represents default retry-artifact persistence collision safely and fail-closed', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'critical-alert-retry-collision-'));
  const frozen = bundle();
  const retry = {
    schemaVersion: 1,
    status: 'PENDING',
    compensationStatus: 'compensation_failed',
    reason: 'alert_persistence_failed',
    dedupeKey: `automation:audio:${frozen.runId}:post-commit-verification`,
    domainId: frozen.domainId,
    runId: frozen.runId,
    operationId: frozen.operationId,
    originalFailure: { message: 'API readback failed', code: null },
  };
  const existing = operationModule.persistCriticalAlertRetryArtifact({ repoRoot: root, retry });
  const adapter = postCommitFailureAdapter(frozen, {
    repoRoot: root,
    markCompensationFailed: async () => compensationFailedConfirmation(frozen),
    recordAlert: async () => { throw new Error('alert ledger unavailable'); },
  });
  let failure = null;

  await assert.rejects(
    executeSupplementaryL1Operation({
      adapter,
      bundle: frozen,
      authorizationContext: authorization(frozen.operationId),
      now: '2026-08-14T06:02:00.000Z',
    }),
    (error) => {
      failure = error;
      return error?.code === 'CRITICAL_ALERT_DELIVERY_RETRY_REQUIRED';
    },
  );

  const serialized = JSON.stringify(operationModule.serializeSupplementaryL1OperationFailure(failure));
  assert.equal(failure.alertDelivery.retryArtifact, null);
  assert.equal(failure.alertDelivery.retryPersistenceStatus, 'failed');
  assert.equal(serialized.includes(root), false);
  assert.equal(serialized.includes(existing.path), false);
  assert.equal(fs.existsSync(path.join(root, existing.path)), true);
});

test('CLI catch path writes only safe structured CRITICAL retry state', async () => {
  const unsafe = new Error('API readback failed; CRITICAL alert delivery retry required');
  unsafe.code = 'CRITICAL_ALERT_DELIVERY_RETRY_REQUIRED';
  unsafe.compensationStatus = 'compensation_failed';
  unsafe.alertDelivery = {
    status: 'retry_required',
    severity: 'CRITICAL',
    dedupeKey: 'automation:audio:run:post-commit-verification',
    reason: 'alert_persistence_failed',
    retryArtifact: {
      path: '/private/host/critical-alert-delivery-retry.json',
      sha256: HASH('d'),
    },
    retryPersistenceStatus: 'failed',
    retryPersistenceError: 'permission denied at /private/host',
  };
  const stdout = [];
  const stderr = [];
  const exitCodes = [];

  const result = await operationModule.runSupplementaryL1OperationCliEntrypoint({
    runCli: async () => { throw unsafe; },
    stdout: { write: (value) => stdout.push(value) },
    stderr: { write: (value) => stderr.push(value) },
    setExitCode: (value) => exitCodes.push(value),
  });

  assert.equal(result, null);
  assert.deepEqual(stdout, []);
  assert.deepEqual(exitCodes, [1]);
  assert.equal(stderr.length, 1);
  const output = JSON.parse(stderr[0]);
  assert.equal(output.code, 'CRITICAL_ALERT_DELIVERY_RETRY_REQUIRED');
  assert.equal(output.alertDelivery.retryArtifact, null);
  assert.equal(output.alertDelivery.retryPersistenceStatus, 'failed');
  assert.equal(stderr[0].includes('/private/host'), false);
});

test('CLI catch path remains structured for a null-prototype thrown value', async () => {
  const stdout = [];
  const stderr = [];
  const exitCodes = [];
  const hostile = Object.create(null);

  const result = await operationModule.runSupplementaryL1OperationCliEntrypoint({
    runCli: async () => { throw hostile; },
    stdout: { write: (value) => stdout.push(value) },
    stderr: { write: (value) => stderr.push(value) },
    setExitCode: (value) => exitCodes.push(value),
  });

  assert.equal(result, null);
  assert.deepEqual(stdout, []);
  assert.deepEqual(exitCodes, [1]);
  assert.equal(stderr.length, 1);
  const output = JSON.parse(stderr[0]);
  assert.equal(output.status, 'failed');
  assert.equal(typeof output.message, 'string');
});

test('serializes critical alert retry state for CLI failure output', () => {
  const error = new Error('API readback failed; CRITICAL alert delivery retry required');
  error.code = 'CRITICAL_ALERT_DELIVERY_RETRY_REQUIRED';
  error.compensationStatus = 'compensation_failed';
  error.alertDelivery = {
    status: 'retry_required',
    severity: 'CRITICAL',
    dedupeKey: 'automation:audio:run:post-commit-verification',
    reason: 'alert_persistence_failed',
    retryArtifact: {
      path: 'reports/runtime/automation-alert-retry/audio/run/critical-alert-delivery-retry.json',
      sha256: HASH('d'),
    },
  };

  assert.deepEqual(operationModule.serializeSupplementaryL1OperationFailure(error), {
    schemaVersion: 1,
    status: 'failed',
    message: error.message,
    code: error.code,
    compensationStatus: 'compensation_failed',
    alertDelivery: error.alertDelivery,
  });
});

test('persists confined private no-overwrite critical alert retry evidence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'critical-alert-retry-'));
  const retry = {
    schemaVersion: 1,
    status: 'PENDING',
    compensationStatus: 'compensation_failed',
    reason: 'alert_persistence_failed',
    dedupeKey: 'automation:audio:audio_l1_20260814_01:post-commit-verification',
    domainId: 'audio',
    runId: 'audio_l1_20260814_01',
    operationId: 'automation-audio-first-l1',
    originalFailure: {
      message: 'API readback failed',
      code: null,
    },
  };

  const written = operationModule.persistCriticalAlertRetryArtifact({ repoRoot: root, retry });
  const expectedPath = 'reports/runtime/automation-alert-retry/audio/audio_l1_20260814_01/'
    + 'critical-alert-delivery-retry.json';
  assert.equal(written.path, expectedPath);
  assert.match(written.sha256, /^sha256:[0-9a-f]{64}$/);
  const artifactPath = path.join(root, written.path);
  assert.deepEqual(JSON.parse(fs.readFileSync(artifactPath, 'utf8')), retry);
  assert.equal(fs.statSync(artifactPath).mode & 0o777, 0o600);
  assert.throws(
    () => operationModule.persistCriticalAlertRetryArtifact({ repoRoot: root, retry }),
    /already exists.*overwrite is forbidden/i,
  );
});

test('fails closed without reporting a retry artifact when final artifact-directory synchronization fails', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'critical-alert-retry-final-sync-failure-'));
  const frozen = bundle();
  const finalDirectoryPath = path.join(
    root,
    'reports/runtime/automation-alert-retry',
    frozen.domainId,
    frozen.runId,
  );
  const finalArtifactPath = path.join(finalDirectoryPath, 'critical-alert-delivery-retry.json');
  const adapter = postCommitFailureAdapter(frozen, {
    repoRoot: root,
    markCompensationFailed: async () => compensationFailedConfirmation(frozen),
    recordAlert: async () => { throw new Error('alert ledger unavailable'); },
  });
  const originalFsyncSync = fs.fsyncSync;
  let failedFinalDirectorySync = false;
  fs.fsyncSync = function failFinalDirectorySync(fd, ...args) {
    if (directoryPathForFsync(fd) === finalDirectoryPath) {
      failedFinalDirectorySync = true;
      const error = new Error('final retry artifact directory synchronization failed');
      error.code = 'EIO';
      throw error;
    }
    return originalFsyncSync.call(this, fd, ...args);
  };
  let failure = null;

  try {
    await assert.rejects(
      executeSupplementaryL1Operation({
        adapter,
        bundle: frozen,
        authorizationContext: authorization(frozen.operationId),
        now: '2026-08-14T06:02:00.000Z',
      }),
      (error) => {
        failure = error;
        return error?.code === 'CRITICAL_ALERT_DELIVERY_RETRY_REQUIRED'
          && error?.alertDelivery?.retryArtifact === null
          && error?.alertDelivery?.retryPersistenceStatus === 'failed';
      },
    );

    assert.equal(failedFinalDirectorySync, true);
    assert.equal(failure.alertDelivery.retryArtifact, null);
    assert.equal(fs.existsSync(finalArtifactPath), true);
  } finally {
    fs.fsyncSync = originalFsyncSync;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('synchronizes the final retry artifact directory after successful publication', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'critical-alert-retry-final-sync-'));
  const retry = {
    schemaVersion: 1,
    status: 'PENDING',
    compensationStatus: 'compensation_failed',
    reason: 'alert_persistence_failed',
    dedupeKey: 'automation:audio:audio_l1_20260814_06:post-commit-verification',
    domainId: 'audio',
    runId: 'audio_l1_20260814_06',
    operationId: 'automation-audio-first-l1',
    originalFailure: { message: 'API readback failed', code: null },
  };
  const finalDirectoryPath = path.join(
    root,
    'reports/runtime/automation-alert-retry/audio/audio_l1_20260814_06',
  );
  const synchronizedDirectories = new Set();
  const originalFsyncSync = fs.fsyncSync;
  fs.fsyncSync = function recordDirectorySync(fd, ...args) {
    const directoryPath = directoryPathForFsync(fd);
    if (directoryPath != null) synchronizedDirectories.add(directoryPath);
    return originalFsyncSync.call(this, fd, ...args);
  };

  try {
    operationModule.persistCriticalAlertRetryArtifact({ repoRoot: root, retry });
    assert.equal(synchronizedDirectories.has(finalDirectoryPath), true);
  } finally {
    fs.fsyncSync = originalFsyncSync;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('synchronizes every created retry artifact and staging directory parent entry', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'critical-alert-retry-created-chain-sync-'));
  const retry = {
    schemaVersion: 1,
    status: 'PENDING',
    compensationStatus: 'compensation_failed',
    reason: 'alert_persistence_failed',
    dedupeKey: 'automation:audio:audio_l1_20260814_07:post-commit-verification',
    domainId: 'audio',
    runId: 'audio_l1_20260814_07',
    operationId: 'automation-audio-first-l1',
    originalFailure: { message: 'API readback failed', code: null },
  };
  const retryRoot = path.join(root, 'reports/runtime/automation-alert-retry');
  const artifactDirectoryPath = path.join(retryRoot, 'audio/audio_l1_20260814_07');
  const stagingDirectoryPath = path.join(retryRoot, '.staging');
  const expectedSynchronizedDirectories = [
    root,
    path.join(root, 'reports'),
    path.join(root, 'reports/runtime'),
    retryRoot,
    path.join(retryRoot, 'audio'),
    artifactDirectoryPath,
    stagingDirectoryPath,
  ];
  const synchronizedDirectories = new Set();
  const originalFsyncSync = fs.fsyncSync;
  fs.fsyncSync = function recordCreatedDirectorySync(fd, ...args) {
    const directoryPath = directoryPathForFsync(fd);
    if (directoryPath != null) synchronizedDirectories.add(directoryPath);
    return originalFsyncSync.call(this, fd, ...args);
  };

  try {
    operationModule.persistCriticalAlertRetryArtifact({ repoRoot: root, retry });
    for (const directoryPath of expectedSynchronizedDirectories) {
      assert.equal(synchronizedDirectories.has(directoryPath), true, directoryPath);
    }
  } finally {
    fs.fsyncSync = originalFsyncSync;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fails closed before creating retry artifact descendants below a group-or-other-writable ancestor', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'critical-alert-retry-unsafe-ancestor-'));
  const reportsPath = path.join(root, 'reports');
  const artifactPath = path.join(
    root,
    'reports/runtime/automation-alert-retry/audio/audio_l1_20260814_04/critical-alert-delivery-retry.json',
  );
  fs.mkdirSync(reportsPath, { mode: 0o700 });
  fs.chmodSync(reportsPath, 0o777);
  const retry = {
    schemaVersion: 1,
    status: 'PENDING',
    compensationStatus: 'compensation_failed',
    reason: 'alert_persistence_failed',
    dedupeKey: 'automation:audio:audio_l1_20260814_04:post-commit-verification',
    domainId: 'audio',
    runId: 'audio_l1_20260814_04',
    operationId: 'automation-audio-first-l1',
    originalFailure: { message: 'API readback failed', code: null },
  };

  try {
    assert.throws(
      () => operationModule.persistCriticalAlertRetryArtifact({ repoRoot: root, retry }),
      /critical alert retry artifact trust boundary/i,
    );
    assert.deepEqual(fs.readdirSync(reportsPath), []);
    assert.equal(fs.existsSync(artifactPath), false);
  } finally {
    fs.chmodSync(reportsPath, 0o700);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fails closed before creating retry artifact descendants below a foreign-owned ancestor', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'critical-alert-retry-foreign-owner-'));
  const reportsPath = path.join(root, 'reports');
  const artifactPath = path.join(
    root,
    'reports/runtime/automation-alert-retry/audio/audio_l1_20260814_05/critical-alert-delivery-retry.json',
  );
  fs.mkdirSync(reportsPath, { mode: 0o700 });
  const retry = {
    schemaVersion: 1,
    status: 'PENDING',
    compensationStatus: 'compensation_failed',
    reason: 'alert_persistence_failed',
    dedupeKey: 'automation:audio:audio_l1_20260814_05:post-commit-verification',
    domainId: 'audio',
    runId: 'audio_l1_20260814_05',
    operationId: 'automation-audio-first-l1',
    originalFailure: { message: 'API readback failed', code: null },
  };
  const originalLstatSync = fs.lstatSync;
  fs.lstatSync = function simulateForeignOwnedReports(pathname, ...args) {
    const stat = originalLstatSync.call(this, pathname, ...args);
    if (typeof pathname === 'string' && path.resolve(pathname) === reportsPath) {
      return Object.create(stat, {
        uid: { value: stat.uid + 1, enumerable: true },
      });
    }
    return stat;
  };

  try {
    assert.throws(
      () => operationModule.persistCriticalAlertRetryArtifact({ repoRoot: root, retry }),
      /critical alert retry artifact trust boundary/i,
    );
    assert.deepEqual(fs.readdirSync(reportsPath), []);
    assert.equal(fs.existsSync(artifactPath), false);
  } finally {
    fs.lstatSync = originalLstatSync;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fails closed when the retry artifact parent is swapped after confinement validation', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'critical-alert-retry-toctou-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'critical-alert-retry-toctou-outside-'));
  const relativeDirectory = 'reports/runtime/automation-alert-retry/audio/audio_l1_20260814_02';
  const parent = path.join(root, relativeDirectory);
  const originalParent = `${parent}-original`;
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  const retry = {
    schemaVersion: 1,
    status: 'PENDING',
    compensationStatus: 'compensation_failed',
    reason: 'alert_persistence_failed',
    dedupeKey: 'automation:audio:audio_l1_20260814_02:post-commit-verification',
    domainId: 'audio',
    runId: 'audio_l1_20260814_02',
    operationId: 'automation-audio-first-l1',
    originalFailure: { message: 'API readback failed', code: null },
  };
  const retryArtifactFile = 'critical-alert-delivery-retry.json';
  const outsideArtifact = path.join(outside, retryArtifactFile);
  let swapped = false;
  const originalWriteFileSync = fs.writeFileSync;
  fs.writeFileSync = function swapParentBeforeFinalWrite(target, ...args) {
    if (!swapped && (typeof target === 'number' || String(target).endsWith(retryArtifactFile))) {
      fs.renameSync(parent, originalParent);
      fs.symlinkSync(outside, parent, 'dir');
      swapped = true;
    }
    return originalWriteFileSync.call(this, target, ...args);
  };

  try {
    assert.throws(
      () => operationModule.persistCriticalAlertRetryArtifact({ repoRoot: root, retry }),
      /changed|symbolic-link|confinement|unavailable|trust boundary/i,
    );
  } finally {
    fs.writeFileSync = originalWriteFileSync;
  }

  assert.equal(swapped, true);
  assert.equal(fs.existsSync(outsideArtifact), false);
});

test('fails closed before writing when the bound retry artifact parent is relocated outside the repository', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'critical-alert-retry-relocation-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'critical-alert-retry-relocation-outside-'));
  const relativeDirectory = 'reports/runtime/automation-alert-retry/audio/audio_l1_20260814_03';
  const parent = path.join(root, relativeDirectory);
  const detachedParent = path.join(outside, 'detached-parent');
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  const retry = {
    schemaVersion: 1,
    status: 'PENDING',
    compensationStatus: 'compensation_failed',
    reason: 'alert_persistence_failed',
    dedupeKey: 'automation:audio:audio_l1_20260814_03:post-commit-verification',
    domainId: 'audio',
    runId: 'audio_l1_20260814_03',
    operationId: 'automation-audio-first-l1',
    originalFailure: { message: 'API readback failed', code: null },
  };
  let relocated = false;
  const originalWriteFileSync = fs.writeFileSync;
  fs.writeFileSync = function relocateBoundParentBeforeWrite(target, ...args) {
    if (!relocated && typeof target === 'number') {
      fs.renameSync(parent, detachedParent);
      relocated = true;
    }
    return originalWriteFileSync.call(this, target, ...args);
  };

  try {
    assert.throws(
      () => operationModule.persistCriticalAlertRetryArtifact({ repoRoot: root, retry }),
      /changed|symbolic-link|confinement|unavailable/i,
    );
  } finally {
    fs.writeFileSync = originalWriteFileSync;
  }

  assert.equal(relocated, true);
  assert.deepEqual(fs.readdirSync(detachedParent), []);
});

test('fails closed before writing when the repository root is group-writable', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'critical-alert-retry-mode-'));
  const retry = {
    schemaVersion: 1,
    status: 'PENDING',
    compensationStatus: 'compensation_failed',
    reason: 'alert_persistence_failed',
    dedupeKey: 'automation:audio:audio_l1_20260814_04:post-commit-verification',
    domainId: 'audio',
    runId: 'audio_l1_20260814_04',
    operationId: 'automation-audio-first-l1',
    originalFailure: { message: 'API readback failed', code: null },
  };
  const originalMode = fs.statSync(root).mode & 0o777;
  fs.chmodSync(root, originalMode | 0o002);
  try {
    assert.throws(
      () => operationModule.persistCriticalAlertRetryArtifact({ repoRoot: root, retry }),
      /owner-only|group|other|permission|writable|trust boundary/i,
    );
    assert.equal(fs.existsSync(path.join(root, 'reports')), false);
  } finally {
    fs.chmodSync(root, originalMode);
  }
});

test('fails closed before writing when the repository root owner differs from the scheduler uid', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'critical-alert-retry-owner-'));
  const retry = {
    schemaVersion: 1,
    status: 'PENDING',
    compensationStatus: 'compensation_failed',
    reason: 'alert_persistence_failed',
    dedupeKey: 'automation:audio:audio_l1_20260814_05:post-commit-verification',
    domainId: 'audio',
    runId: 'audio_l1_20260814_05',
    operationId: 'automation-audio-first-l1',
    originalFailure: { message: 'API readback failed', code: null },
  };
  const originalLstatSync = fs.lstatSync;
  fs.lstatSync = function reportForeignOwner(target, ...args) {
    const stat = originalLstatSync.call(this, target, ...args);
    if (path.resolve(String(target)) === path.resolve(root)) {
      Object.defineProperty(stat, 'uid', { value: (stat.uid ?? 0) + 1 });
    }
    return stat;
  };
  try {
    assert.throws(
      () => operationModule.persistCriticalAlertRetryArtifact({ repoRoot: root, retry }),
      /owner|uid|trust boundary|scheduler/i,
    );
    assert.equal(fs.existsSync(path.join(root, 'reports')), false);
  } finally {
    fs.lstatSync = originalLstatSync;
  }
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

test('MySQL adapter reads the explicit completed progress path for automatic reconciliation', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mysql-l1-explicit-progress-'));
  const runId = 'audio_l1_20260829_explicit01';
  const sourceRelativePath = `reports/authorization/canonical/l1-runs/audio/${runId}/source.json`;
  const bundleRelativePath = `reports/authorization/canonical/l1-runs/audio/${runId}/bundle.json`;
  const sourcePath = path.join(root, sourceRelativePath);
  const bundlePath = path.join(root, bundleRelativePath);
  const progressRelativePath = `reports/crawler-monitor/v2/2026-08-29/attempt-1/progress.json`;
  const progressPath = path.join(root, progressRelativePath);
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.mkdirSync(path.dirname(progressPath), { recursive: true });
  const sourceBytes = Buffer.from('{\n  "schemaVersion": 1,\n  "domainId": "audio",\n  "assets": []\n}\n');
  fs.writeFileSync(sourcePath, sourceBytes, { mode: 0o600 });
  fs.writeFileSync(progressPath, JSON.stringify({ status: 'completed' }), { mode: 0o600 });
  const frozen = buildSupplementaryL1Bundle({
    ...bundle('audio'),
    runId,
    source: {
      path: sourceRelativePath,
      sha256: `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`,
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
      if (/crawler_automation_mutation_generation/.test(sql)) return [[{ generation: 3, lastWriterRunId: runId }]];
      if (/crawler_automation_write_fence/.test(sql)) return [[{
        latestRunId: runId,
        beforeGeneration: 2,
        committedGeneration: 3,
        commitMarker: frozen.bundleHash.slice(7),
      }]];
      if (/crawler_automation_run_attempt/.test(sql)) return [[{ activeAttempts: 0, overdueAttempts: 0 }]];
      if (/crawler_automation_attempt_reservation/.test(sql)) return [[{ activeReservations: 0, overdueReservations: 0 }]];
      if (/FROM `audio_assets`/.test(sql)) return [[{ id: 1, asset_id: 'music:empty' }]];
      if (/FROM `audio_asset_links`/.test(sql)) return [[{ id: 2, asset_id: 'music:empty' }]];
      return [[]];
    },
  };
  const adapter = operationModule.createMysqlSupplementaryL1Adapter(connection, {
    bundlePath,
    progressPath,
    repoRoot: root,
  });

  const result = await adapter.writeReconciliationInputs({
    bundle: frozen,
    reconciliationInput: frozen.reconciliationInput,
    executionTime: '2026-08-29T00:00:00.000Z',
  });

  assert.equal(result.sourceCoverage.terminalProgress, true);
  assert.equal(result.sourceCoverage.progressPath, progressRelativePath);
});

test('MySQL compensation restores a legacy whole-table snapshot behind the generation fence', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mysql-l1-compensation-'));
  const bundlePath = path.join(root, 'bundle.json');
  const frozen = bundle('audio');
  fs.writeFileSync(bundlePath, `${JSON.stringify(frozen)}\n`, { mode: 0o600 });
  const queries = [];
  const tableReads = new Map();
  const connection = {
    async beginTransaction() { queries.push('BEGIN'); },
    async commit() { queries.push('COMMIT'); },
    async rollback() { queries.push('ROLLBACK'); },
    async query(sql, params) {
      queries.push({ sql, params });
      if (/SELECT username, status FROM crawler_automation_owner/.test(sql)) {
        return [[{ username: 'admin', status: 'ACTIVE' }]];
      }
      if (/SELECT p\.domain_id/.test(sql)) {
        return [[{
          domainId: 'audio', policyVersion: 1, policyHash: HASH('a'),
          currentLevel: 'L1', operationalState: 'ACTIVE',
        }]];
      }
      if (/INSERT IGNORE INTO crawler_automation_mutation_generation/.test(sql)) return [{ affectedRows: 1 }];
      if (/SELECT generation FROM crawler_automation_mutation_generation/.test(sql)) return [[{ generation: 2 }]];
      if (/FROM crawler_automation_activation_decision/.test(sql)) return [[]];
      if (/SELECT \* FROM `audio_/.test(sql)) {
        const table = sql.includes('audio_assets') ? 'audio_assets' : 'audio_asset_links';
        const count = tableReads.get(table) ?? 0;
        tableReads.set(table, count + 1);
        return [[
          table === 'audio_assets'
            ? { id: 1, asset_id: count === 0 ? 'before' : 'after' }
            : { id: 2, asset_id: 'before-link' },
          ...(count === 0 && table === 'audio_assets' ? [] : table === 'audio_assets' ? [{ id: 9, asset_id: 'new' }] : []),
        ]];
      }
      if (/SELECT generation, last_writer_run_id/.test(sql)) {
        return [[{ generation: 3, lastWriterRunId: frozen.runId }]];
      }
      if (/UPDATE crawler_automation_mutation_generation/.test(sql)) return [{ affectedRows: 1 }];
      if (/FROM crawler_automation_write_fence/.test(sql)) {
        return [[{
          latestRunId: frozen.runId,
          beforeGeneration: 2,
          committedGeneration: null,
          commitMarker: 'COMPENSATED',
        }]];
      }
      if (/FROM crawler_automation_apply/.test(sql)) {
        return [[{ runId: frozen.runId, bundleHash: frozen.bundleHash, status: 'COMPENSATED' }]];
      }
      if (/FROM crawler_automation_run/.test(sql)) {
        return [[{ runId: frozen.runId, status: 'ROLLED_BACK' }]];
      }
      return [{ affectedRows: 1 }];
    },
  };
  const adapter = operationModule.createMysqlSupplementaryL1Adapter(connection, {
    bundlePath,
    repoRoot: root,
  });

  await adapter.lockCurrentContext(frozen, '2026-08-31T00:00:00.000Z');
  const result = await adapter.compensate({ bundle: frozen });

  assert.equal(result.status, 'compensated');
  assert.deepEqual(result.restoredTables, ['audio_assets', 'audio_asset_links']);
  assert.ok(queries.some((entry) => entry === 'BEGIN'));
  assert.ok(queries.some((entry) => entry === 'COMMIT'));
  assert.ok(queries.some((entry) => typeof entry === 'object' && /DELETE FROM `audio_assets`/.test(entry.sql)));
  assert.ok(queries.some((entry) => typeof entry === 'object' && /ON DUPLICATE KEY UPDATE/.test(entry.sql)));
  assert.ok(queries.some((entry) => typeof entry === 'object' && /SET status = \?/.test(entry.sql)));
});

for (const failurePoint of ['write-fence', 'apply', 'run']) {
  test(`MySQL compensation rolls back when the ${failurePoint} status transition affects zero rows`, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `mysql-l1-compensation-${failurePoint}-zero-`));
    const bundlePath = path.join(root, 'bundle.json');
    const frozen = bundle('audio');
    fs.writeFileSync(bundlePath, `${JSON.stringify(frozen)}\n`, { mode: 0o600 });
    let compensating = false;
    const transactions = [];
    const tableReadCounts = new Map();
    const connection = {
      async beginTransaction() {
        transactions.push('BEGIN');
        compensating = true;
      },
      async commit() { transactions.push('COMMIT'); },
      async rollback() { transactions.push('ROLLBACK'); },
      async query(sql) {
        if (/SELECT username, status FROM crawler_automation_owner/.test(sql)) {
          return [[{ username: 'admin', status: 'ACTIVE' }]];
        }
        if (/SELECT p\.domain_id/.test(sql)) {
          return [[{
            domainId: 'audio', policyVersion: 1, policyHash: HASH('a'),
            currentLevel: 'L1', operationalState: 'ACTIVE',
          }]];
        }
        if (/INSERT IGNORE INTO crawler_automation_mutation_generation/.test(sql)) return [{ affectedRows: 1 }];
        if (/SELECT generation FROM crawler_automation_mutation_generation/.test(sql)) return [[{ generation: 2 }]];
        if (/FROM crawler_automation_activation_decision/.test(sql)) return [[]];
        if (/SELECT \* FROM `audio_/.test(sql)) {
          const table = sql.includes('audio_assets') ? 'audio_assets' : 'audio_asset_links';
          const count = tableReadCounts.get(table) ?? 0;
          tableReadCounts.set(table, count + 1);
          return [[table === 'audio_assets' ? { id: 1, asset_id: 'before' } : { id: 2, asset_id: 'before-link' }]];
        }
        if (/SELECT generation, last_writer_run_id/.test(sql)) {
          return [[{ generation: 3, lastWriterRunId: frozen.runId }]];
        }
        if (/UPDATE crawler_automation_mutation_generation/.test(sql)) return [{ affectedRows: 1 }];
        if (/UPDATE crawler_automation_write_fence/.test(sql)) {
          return [{ affectedRows: failurePoint === 'write-fence' ? 0 : 1 }];
        }
        if (/UPDATE crawler_automation_apply/.test(sql)) {
          return [{ affectedRows: failurePoint === 'apply' ? 0 : 1 }];
        }
        if (/UPDATE crawler_automation_run/.test(sql)) {
          return [{ affectedRows: failurePoint === 'run' ? 0 : 1 }];
        }
        if (/SELECT .* FROM crawler_automation_write_fence/.test(sql)) {
          return [[{
            latestRunId: frozen.runId,
            beforeGeneration: 2,
            committedGeneration: 3,
            commitMarker: frozen.bundleHash.slice(7),
          }]];
        }
        if (/SELECT .* FROM crawler_automation_apply/.test(sql)) {
          return [[{ runId: frozen.runId, bundleHash: frozen.bundleHash, status: 'COMPENSATED' }]];
        }
        if (/SELECT .* FROM crawler_automation_run/.test(sql)) {
          return [[{ runId: frozen.runId, status: 'ROLLED_BACK' }]];
        }
        return [{ affectedRows: 1 }];
      },
    };
    const adapter = operationModule.createMysqlSupplementaryL1Adapter(connection, {
      bundlePath,
      repoRoot: root,
    });

    await adapter.lockCurrentContext(frozen, '2026-08-31T00:00:00.000Z');
    await assert.rejects(
      adapter.compensate({ bundle: frozen }),
      new RegExp(`compensation ${failurePoint.replace('-', ' ')} transition was not persisted`, 'i'),
    );
    assert.deepEqual(transactions, ['BEGIN', 'ROLLBACK']);
  });
}

test('MySQL adapter transactionally confirms both compensation-failed status rows before alert delivery', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mysql-l1-compensation-marker-confirmed-'));
  const bundlePath = path.join(root, 'bundle.json');
  const frozen = bundle('audio');
  fs.writeFileSync(bundlePath, `${JSON.stringify(frozen)}\n`, { mode: 0o600 });
  const transactions = [];
  const queries = [];
  const connection = {
    async beginTransaction() { transactions.push('BEGIN'); },
    async commit() { transactions.push('COMMIT'); },
    async rollback() { transactions.push('ROLLBACK'); },
    async query(sql, params) {
      queries.push({ sql, params });
      if (/UPDATE crawler_automation_apply/.test(sql)
          || /UPDATE crawler_automation_run/.test(sql)) return [{ affectedRows: 1 }];
      if (/SELECT run_id AS runId, bundle_hash AS bundleHash, status FROM crawler_automation_apply/.test(sql)) {
        return [[{ runId: frozen.runId, bundleHash: frozen.bundleHash, status: 'COMPENSATION_FAILED' }]];
      }
      if (/SELECT run_id AS runId, status FROM crawler_automation_run/.test(sql)) {
        return [[{ runId: frozen.runId, status: 'COMPENSATION_FAILED' }]];
      }
      throw new Error(`unexpected marker query: ${sql}`);
    },
  };
  const adapter = operationModule.createMysqlSupplementaryL1Adapter(connection, {
    bundlePath,
    repoRoot: root,
  });

  const result = await adapter.markCompensationFailed({ bundle: frozen });

  assert.deepEqual(result, compensationFailedConfirmation(frozen));
  assert.deepEqual(transactions, ['BEGIN', 'COMMIT']);
  assert.equal(queries.filter(({ sql }) => /UPDATE crawler_automation_(?:apply|run)/.test(sql)).length, 2);
  assert.equal(queries.filter(({ sql }) => /SELECT run_id AS runId/.test(sql)).length, 2);
});

test('MySQL adapter rolls back an unconfirmed compensation failed transition', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mysql-l1-compensation-marker-'));
  const bundlePath = path.join(root, 'bundle.json');
  const frozen = bundle('audio');
  fs.writeFileSync(bundlePath, `${JSON.stringify(frozen)}\n`, { mode: 0o600 });
  const transactions = [];
  const queries = [];
  const connection = {
    async beginTransaction() { transactions.push('BEGIN'); },
    async commit() { transactions.push('COMMIT'); },
    async rollback() { transactions.push('ROLLBACK'); },
    async query(sql, params) {
      queries.push({ sql, params });
      return [{ affectedRows: 0 }];
    },
  };
  const adapter = operationModule.createMysqlSupplementaryL1Adapter(connection, {
    bundlePath,
    repoRoot: root,
  });

  await assert.rejects(
    adapter.markCompensationFailed({ bundle: frozen }),
    /compensation apply status transition was not persisted/i,
  );
  assert.deepEqual(transactions, ['BEGIN', 'ROLLBACK']);
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /UPDATE crawler_automation_apply/);
});

test('MySQL adapter rolls back when compensation-failed readback does not match', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mysql-l1-compensation-marker-readback-'));
  const bundlePath = path.join(root, 'bundle.json');
  const frozen = bundle('audio');
  fs.writeFileSync(bundlePath, `${JSON.stringify(frozen)}\n`, { mode: 0o600 });
  const transactions = [];
  const connection = {
    async beginTransaction() { transactions.push('BEGIN'); },
    async commit() { transactions.push('COMMIT'); },
    async rollback() { transactions.push('ROLLBACK'); },
    async query(sql) {
      if (/UPDATE crawler_automation_apply/.test(sql)
          || /UPDATE crawler_automation_run/.test(sql)) return [{ affectedRows: 1 }];
      if (/SELECT run_id AS runId, bundle_hash AS bundleHash, status FROM crawler_automation_apply/.test(sql)) {
        return [[{ runId: frozen.runId, bundleHash: frozen.bundleHash, status: 'COMMITTED' }]];
      }
      if (/SELECT run_id AS runId, status FROM crawler_automation_run/.test(sql)) {
        return [[{ runId: frozen.runId, status: 'COMPENSATION_FAILED' }]];
      }
      throw new Error(`unexpected marker query: ${sql}`);
    },
  };
  const adapter = operationModule.createMysqlSupplementaryL1Adapter(connection, {
    bundlePath,
    repoRoot: root,
  });

  await assert.rejects(
    adapter.markCompensationFailed({ bundle: frozen }),
    /compensation apply status readback was not persisted/i,
  );
  assert.deepEqual(transactions, ['BEGIN', 'ROLLBACK']);
});

test('MySQL compensation rejects a scoped snapshot before a transaction or table DML without a scoped snapshot restorer', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mysql-scoped-compensation-'));
  const runId = 'bosses_l1_scoped_comp01';
  const artifact = prepareCanonicalAutomaticArtifact(root, {
    domainId: 'bosses',
    runId,
    sourceBytes: Buffer.from('{"schemaVersion":1,"domainId":"bosses","records":[]}\n'),
  });
  const policyScopes = [
    { databaseRole: 'local', table: 'boss_groups', fieldGroup: 'all_columns' },
    { databaseRole: 'local', table: 'npcs', fieldGroup: 'boss_owned', logicalPredicateHash: HASH('d') },
  ];
  const frozen = buildSupplementaryL1Bundle({
    operationId: 'automation-bosses-first-l1',
    runId,
    domainId: 'bosses',
    generatedAt: '2026-08-31T10:00:00.000Z',
    executionMode: 'ACTIVATION_GATED_AUTO',
    policy: {
      domainId: 'bosses', level: 'L2', operationalState: 'ACTIVE', policyVersion: 2,
      policyHash: HASH('a'), policySetHash: HASH('b'),
      policyJson: {
        schemaVersion: 1, level: 'L2', requireSnapshot: true, anomalyAction: 'CIRCUIT_OPEN',
        ratioInsertCap: 0.1, ratioUpdateCap: 0.1, ratioRelationshipDeleteCap: 0.05, ratioDisableCap: 0.005,
        absoluteInsertCap: 500, absoluteUpdateCap: 500, absoluteRelationshipDeleteCap: 200, absoluteDisableCap: 20,
        sourceFreshnessMaxAgeMinutes: 60, ownedTables: policyScopes,
      },
    },
    baseline: {
      environmentId: 'local',
      generations: policyScopes.map((scope) => ({ ...scope, generation: 2 })),
      projectionHash: HASH('c'),
    },
    source: artifact.source,
    ownedTables: policyScopes,
    importPlan: { records: [] },
  });
  fs.writeFileSync(artifact.bundlePath, `${JSON.stringify(frozen)}\n`, { mode: 0o600 });

  let compensating = false;
  const compensationCalls = [];
  const connection = {
    async beginTransaction() {
      if (compensating) {
        compensationCalls.push('BEGIN');
        throw new Error('beginTransaction must not run before scoped compensation rejection');
      }
    },
    async query(sql, params) {
      if (compensating) {
        compensationCalls.push(sql);
        throw new Error(`compensation query must not run before scoped compensation rejection: ${sql}`);
      }
      if (/crawler_automation_owner/.test(sql)) return [[{ username: 'admin', status: 'ACTIVE' }]];
      if (/SELECT p\.domain_id/.test(sql)) {
        return [[{
          domainId: 'bosses', policyVersion: 2, policyHash: HASH('a'),
          currentLevel: 'L2', operationalState: 'ACTIVE',
          policyJson: JSON.stringify({ schemaVersion: 1, level: 'L2', ownedTables: policyScopes }),
        }]];
      }
      if (/INSERT IGNORE INTO crawler_automation_mutation_generation/.test(sql)) return [{ affectedRows: 1 }];
      if (/SELECT generation FROM crawler_automation_mutation_generation/.test(sql)) return [[{ generation: 2 }]];
      if (/FROM `boss_groups`/.test(sql) || /FROM `npcs`/.test(sql)) return [[]];
      if (/crawler_automation_activation_decision/.test(sql)) return [[]];
      throw new Error(`unexpected setup query: ${sql}`);
    },
  };
  const adapter = operationModule.createMysqlSupplementaryL1Adapter(connection, {
    bundlePath: artifact.bundlePath,
    repoRoot: root,
  });

  await adapter.lockCurrentContext(frozen, '2026-08-31T10:01:00.000Z');
  compensating = true;

  await assert.rejects(
    adapter.compensate({ bundle: frozen }),
    /scoped snapshot restorer/i,
  );
  assert.equal(compensationCalls.includes('BEGIN'), false);
  assert.equal(compensationCalls.some((sql) => /^(?:DELETE|INSERT|UPDATE)\b/i.test(sql)), false);
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
  const frozen = automaticBundle('audio');
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

test('CLI rejects an automatic bundle outside its canonical run-specific artifact root before database connection', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'supplementary-cli-path-'));
  const outsideBundlePath = path.join(root, 'outside', 'bundle.json');
  fs.mkdirSync(path.dirname(outsideBundlePath), { recursive: true, mode: 0o700 });
  const frozen = automaticBundle('audio');
  fs.writeFileSync(outsideBundlePath, `${JSON.stringify(frozen)}\n`, { mode: 0o600 });
  let connected = false;
  let authorized = false;
  const env = {
    WORKTREE_ROOT: root,
    TERRAPEDIA_DB_HOST: '127.0.0.1',
    TERRAPEDIA_DB_PORT: '13306',
    TERRAPEDIA_DB_NAME: 'terria_v1_local',
    TERRAPEDIA_DB_USERNAME: 'root',
    TERRAPEDIA_DB_PASSWORD: 'root',
  };

  await assert.rejects(
    operationModule.runSupplementaryL1OperationCli({
      argv: [
        '--apply=true',
        `--input=${outsideBundlePath}`,
        `--output=${path.join(root, 'result.json')}`,
        `--operation-id=${frozen.operationId}`,
      ],
      env,
      loadAuthorizationContextImpl: () => {
        authorized = true;
        return authorization(frozen.operationId);
      },
      mysqlModule: {
        createConnection: async () => {
          connected = true;
          throw new Error('database connection must not be attempted');
        },
      },
    }),
    /canonical|run-specific|automatic.*artifact|bundle path/i,
  );
  assert.equal(authorized, false);
  assert.equal(connected, false);
});

test('CLI rejects an automatic bundle whose canonical artifact file is not private 0600', async () => {
  const fixture = writeAutomaticCliFixture();
  fs.chmodSync(fixture.bundlePath, 0o644);
  let connected = false;
  await assert.rejects(
    operationModule.runSupplementaryL1OperationCli({
      argv: [
        '--apply=true',
        `--input=${fixture.bundlePath}`,
        `--output=${fixture.outputPath}`,
        `--operation-id=${fixture.bundle.operationId}`,
      ],
      env: fixture.env,
      mysqlModule: {
        createConnection: async () => {
          connected = true;
          throw new Error('database connection must not be attempted');
        },
      },
    }),
    /0600|private|ordinary/i,
  );
  assert.equal(connected, false);
});

test('CLI refuses an existing result output before authorization or database connection', async () => {
  const fixture = writeAutomaticCliFixture();
  fs.writeFileSync(fixture.outputPath, 'existing-result\n', { mode: 0o600 });
  let connected = false;
  let authorized = false;
  await assert.rejects(
    operationModule.runSupplementaryL1OperationCli({
      argv: [
        '--apply=true',
        `--input=${fixture.bundlePath}`,
        `--output=${fixture.outputPath}`,
        `--operation-id=${fixture.bundle.operationId}`,
      ],
      env: fixture.env,
      loadAuthorizationContextImpl: () => {
        authorized = true;
        return authorization(fixture.bundle.operationId);
      },
      mysqlModule: {
        createConnection: async () => {
          connected = true;
          throw new Error('database connection must not be attempted');
        },
      },
    }),
    /already exists|overwrite|collision/i,
  );
  assert.equal(fs.readFileSync(fixture.outputPath, 'utf8'), 'existing-result\n');
  assert.equal(authorized, false);
  assert.equal(connected, false);
});

test('MySQL adapter rejects an automatic bundle path outside the canonical artifact root before reading it', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'supplementary-adapter-path-'));
  const bundlePath = path.join(root, 'outside', 'bundle.json');
  fs.mkdirSync(path.dirname(bundlePath), { recursive: true, mode: 0o700 });
  const frozen = automaticBundle('audio');
  fs.writeFileSync(bundlePath, `${JSON.stringify(frozen)}\n`, { mode: 0o600 });

  assert.throws(
    () => operationModule.createMysqlSupplementaryL1Adapter({}, { bundlePath, repoRoot: root }),
    /canonical|run-specific|automatic.*artifact|bundle path/i,
  );
});

function writeAutomaticCliFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'supplementary-cli-fixture-'));
  const runId = 'audio_l1_cli_fixture01';
  const artifactRoot = path.join(
    root,
    'reports',
    'authorization',
    'canonical',
    'automatic',
    'audio',
    runId,
  );
  fs.mkdirSync(artifactRoot, { recursive: true, mode: 0o700 });
  for (const directory of [
    root,
    path.join(root, 'reports'),
    path.join(root, 'reports', 'authorization'),
    path.join(root, 'reports', 'authorization', 'canonical'),
    path.join(root, 'reports', 'authorization', 'canonical', 'automatic'),
    path.join(root, 'reports', 'authorization', 'canonical', 'automatic', 'audio'),
    artifactRoot,
  ]) fs.chmodSync(directory, 0o700);
  const sourceRelativePath = `reports/authorization/canonical/automatic/audio/${runId}/source.json`;
  const sourceBytes = Buffer.from('{"schemaVersion":1,"domainId":"audio","assets":[]}\n');
  const sourcePath = path.join(root, sourceRelativePath);
  fs.writeFileSync(sourcePath, sourceBytes, { mode: 0o600 });
  const base = automaticBundle('audio', { runId });
  const bundle = buildSupplementaryL1Bundle({
    ...base,
    runId,
    source: {
      path: sourceRelativePath,
      sha256: `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`,
    },
  });
  const bundlePath = path.join(artifactRoot, 'operation.bundle.json');
  const outputPath = path.join(artifactRoot, 'result.json');
  fs.writeFileSync(bundlePath, `${JSON.stringify(bundle)}\n`, { mode: 0o600 });
  return {
    root,
    bundle,
    bundlePath,
    outputPath,
    env: {
      WORKTREE_ROOT: root,
      TERRAPEDIA_DB_HOST: '127.0.0.1',
      TERRAPEDIA_DB_PORT: '13306',
      TERRAPEDIA_DB_NAME: 'terria_v1_local',
      TERRAPEDIA_DB_USERNAME: 'root',
      TERRAPEDIA_DB_PASSWORD: 'root',
    },
  };
}
