import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildDomainSourceCommand,
  connectionOptions,
  DOMAIN_PREVIEW_CONFIG,
  loadReusableCurrentSourceSnapshot,
  prepareSupplementaryDomainL1Preview,
  resolveSupplementaryPreviewExecutionMode,
  runDomainSource,
} from './prepare-supplementary-domain-l1-preview.mjs';

const HASH = (letter) => `sha256:${letter.repeat(64)}`;

test('manual preview CLI keeps the owner-authorized execution mode by default', () => {
  assert.equal(resolveSupplementaryPreviewExecutionMode({}), 'MANUAL_OWNER_L1');
  assert.equal(
    resolveSupplementaryPreviewExecutionMode({ 'execution-mode': 'ACTIVATION_GATED_AUTO' }),
    'ACTIVATION_GATED_AUTO',
  );
});

test('preview preparation rejects an unknown execution mode before any publication or source work', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'supplementary-unknown-mode-'));
  let sourceRuns = 0;
  const progressWrites = [];

  assert.throws(
    () => resolveSupplementaryPreviewExecutionMode({ 'execution-mode': 'UNTRUSTED_MODE' }),
    /execution mode|MANUAL_OWNER_L1|ACTIVATION_GATED_AUTO/i,
  );
  await assert.rejects(
    prepareSupplementaryDomainL1Preview({
      domainId: 'bosses',
      repoRoot,
      generatedAt: '2026-09-01T06:00:00.000Z',
      runId: 'bosses_l1_unknown_mode',
      executionMode: 'UNTRUSTED_MODE',
    }, {
      writeProgress: (_filePath, payload) => progressWrites.push(payload),
      runSource: async () => { sourceRuns += 1; return { sourcePayload: { records: [] } }; },
      loadPolicyContext: async () => { throw new Error('policy must not be reached'); },
      buildImportPlan: async () => { throw new Error('plan must not be reached'); },
    }),
    /execution mode|MANUAL_OWNER_L1|ACTIVATION_GATED_AUTO/i,
  );
  assert.equal(sourceRuns, 0);
  assert.deepEqual(progressWrites, []);
  assert.equal(fs.existsSync(path.join(repoRoot, 'reports')), false);
});

test('uses string dates when freezing supplementary L1 baselines', () => {
  assert.equal(connectionOptions({
    TERRAPEDIA_DB_HOST: '127.0.0.1',
    TERRAPEDIA_DB_PORT: '13306',
    TERRAPEDIA_DB_USERNAME: 'root',
    TERRAPEDIA_DB_PASSWORD: 'root',
    TERRAPEDIA_DB_NAME: 'terria_v1_local',
  }).dateStrings, true);
});

test('audio preview owns an explicit bounded full-corpus source command', () => {
  assert.deepEqual(buildDomainSourceCommand({
    domainId: 'audio',
    progressPath: '/tmp/audio-progress.json',
    runId: 'audio_l1_20260814_01',
    resumeMode: 'fresh',
  }), [
    'pipelines/fetch/fetch-wiki-audio-assets.mjs',
    '--mode=all',
    '--allow-full-audio-corpus=true',
    '--max-total-files=600',
    '--max-api-pages-per-prefix=100',
    '--progress-path=/tmp/audio-progress.json',
  ]);
});

test('shimmer bootstrap preview can reuse only the verified current generation', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'supplementary-shimmer-current-'));
  const pointerPath = path.join(repoRoot, 'data/generated/shimmer/wiki-shimmer-current-generation.json');
  fs.mkdirSync(path.dirname(pointerPath), { recursive: true });
  const inputContract = {
    generationId: 'verified-generation',
    manifestPath: 'data/generated/shimmer/generations/verified-generation/wiki-shimmer-manifest.json',
    manifestSha256: 'sha256:manifest',
    dataBundleSha256: 'sha256:data',
    previewSha256: 'sha256:old-preview',
    targetFingerprintSha256: 'sha256:old-target',
    providerScope: { provider: 'wiki_zh', sourcePage: '微光', tables: ['shimmer_item_transforms'] },
  };
  fs.writeFileSync(pointerPath, JSON.stringify({
    generationId: inputContract.generationId,
    manifestPath: 'generations/verified-generation/wiki-shimmer-manifest.json',
    manifestSha256: inputContract.manifestSha256,
    dataBundleSha256: inputContract.dataBundleSha256,
  }));
  const proposal = {
    inputContract,
    previewSha256: 'sha256:preview',
    targetFingerprintSha256: 'sha256:target',
    preview: { summary: { records: 1 } },
  };
  const refreshedProposal = {
    ...proposal,
    inputContract: { ...inputContract, previewSha256: 'sha256:new-preview', targetFingerprintSha256: 'sha256:new-target' },
    previewSha256: 'sha256:refreshed-preview',
    preview: { summary: { records: 0 } },
  };

  const result = await runDomainSource({
    domainId: 'shimmer',
    repoRoot,
    progressPath: '/tmp/shimmer-progress.json',
  }, {
    env: { TERRAPEDIA_DB_NAME: 'terria_v1_local' },
    runId: 'shimmer_l1_20260814_01',
    resumeMode: 'fresh',
    reuseCurrentGeneration: true,
  }, {
    runNodeImpl: async () => { throw new Error('current-generation reuse must not crawl'); },
    runProposalImpl: async () => { throw new Error('current-generation reuse must not write a proposal'); },
    runReadOnlyProposalImpl: async () => refreshedProposal,
    readInputContractImpl: () => ({ contract: inputContract }),
    readProposalImpl: () => ({ proposal }),
  });

  assert.deepEqual(result.sourcePayload, inputContract);
  assert.deepEqual(result.proposal, refreshedProposal);
  await assert.rejects(
    runDomainSource({ domainId: 'audio', repoRoot, progressPath: '/tmp/audio.json' }, {
      env: {}, runId: 'audio_l1_20260814_01', resumeMode: 'fresh', reuseCurrentGeneration: true,
    }),
    /only supported for shimmer/,
  );
});

test('fresh automatic shimmer preview builds its import proposal without overwriting canonical authorization evidence', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'supplementary-shimmer-automatic-'));
  const pointerPath = path.join(repoRoot, 'data/generated/shimmer/wiki-shimmer-current-generation.json');
  fs.mkdirSync(path.dirname(pointerPath), { recursive: true });
  fs.writeFileSync(pointerPath, JSON.stringify({ manifestPath: 'generations/fresh/wiki-shimmer-manifest.json' }));
  const proposal = {
    inputContract: { generationId: 'fresh-generation' },
    previewSha256: 'sha256:preview',
    targetFingerprintSha256: 'sha256:target',
    preview: { summary: { records: 1 } },
  };
  let sourceRan = false;

  const result = await runDomainSource({
    domainId: 'shimmer',
    repoRoot,
    progressPath: '/tmp/shimmer-progress.json',
  }, {
    env: { TERRAPEDIA_DB_NAME: 'terria_v1_local' },
    runId: 'shimmer_l1_automatic',
    resumeMode: 'fresh',
    persistCanonicalShimmerProposal: false,
  }, {
    runNodeImpl: async () => { sourceRan = true; },
    runProposalImpl: async () => { throw new Error('automatic preview must not overwrite canonical proposal evidence'); },
    runReadOnlyProposalImpl: async () => proposal,
  });

  assert.equal(sourceRan, true);
  assert.deepEqual(result, { sourcePayload: proposal.inputContract, proposal });
});

test('local automatic shimmer preview reuses the current generation without legacy canonical proposal evidence', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'supplementary-shimmer-local-automatic-'));
  const pointerPath = path.join(repoRoot, 'data/generated/shimmer/wiki-shimmer-current-generation.json');
  fs.mkdirSync(path.dirname(pointerPath), { recursive: true });
  fs.writeFileSync(pointerPath, JSON.stringify({
    generationId: 'current-generation',
    manifestPath: 'generations/current-generation/wiki-shimmer-manifest.json',
    manifestSha256: 'sha256:manifest',
    dataBundleSha256: 'sha256:data',
  }));
  const proposal = {
    inputContract: {
      generationId: 'current-generation',
      manifestPath: 'data/generated/shimmer/generations/current-generation/wiki-shimmer-manifest.json',
      manifestSha256: 'sha256:manifest',
      dataBundleSha256: 'sha256:data',
      providerScope: { provider: 'wiki_zh' },
    },
    previewSha256: 'sha256:preview',
    targetFingerprintSha256: 'sha256:target',
    preview: { summary: { records: 1 } },
  };

  const result = await runDomainSource({
    domainId: 'shimmer', repoRoot, progressPath: '/tmp/shimmer-progress.json',
  }, {
    env: { TERRAPEDIA_DB_NAME: 'terria_v1_local' },
    runId: 'shimmer_l1_local_automatic',
    resumeMode: 'fresh',
    reuseCurrentGeneration: true,
    reuseCurrentSource: true,
    persistCanonicalShimmerProposal: false,
  }, {
    runNodeImpl: async () => { throw new Error('local automatic preview must not crawl'); },
    runProposalImpl: async () => { throw new Error('local automatic preview must not write canonical proposal evidence'); },
    runReadOnlyProposalImpl: async () => proposal,
    readInputContractImpl: () => { throw new Error('local automatic preview must not require legacy input evidence'); },
    readProposalImpl: () => { throw new Error('local automatic preview must not require legacy proposal evidence'); },
  });

  assert.deepEqual(result, { sourcePayload: proposal.inputContract, proposal });
});

test('local source reuse takes its stable Shimmer identity from the canonical manifest without a remote probe', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'supplementary-local-source-snapshot-'));
  const manifestPath = path.join(repoRoot, 'data', 'generated', 'wiki-source-manifest.latest.json');
  const snapshotHash = 'c'.repeat(64);
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify({
    records: [{
      contentHash: snapshotHash,
      entityFamily: 'shimmer',
      lang: 'en',
      lastFetchedAt: '2026-08-15T10:21:43.767Z',
      lastParsedAt: '2026-08-15T10:21:43.767Z',
      localPath: 'reports/authorization/canonical/automation-shimmer-first-l1.bundle.json',
      pageTitle: '微光',
      requestedPageTitle: '微光',
      sourceKey: 'wiki.shimmer.page_and_langlinks',
      sourceKind: 'page_and_langlinks',
      status: 'ok',
    }],
  }), 'utf8');

  const snapshot = loadReusableCurrentSourceSnapshot({ domainId: 'shimmer', repoRoot, manifestPath });
  let probeCalls = 0;
  const result = await prepareSupplementaryDomainL1Preview({
    domainId: 'shimmer',
    repoRoot,
    generatedAt: '2026-08-17T00:00:00.000Z',
    runId: 'shimmer_l1_20260817_01',
    deferSourceAcknowledgement: true,
    reuseCurrentSourceSnapshot: snapshot,
  }, {
    probeSource: async () => { probeCalls += 1; throw new Error('local source reuse must not probe remotely'); },
    runSource: async () => ({ sourcePayload: { records: [] } }),
    loadPolicyContext: async () => ({
      policy: { domainId: 'shimmer', level: 'L1', operationalState: 'ACTIVE', policyVersion: 1, policyHash: HASH('a'), policySetHash: HASH('b') },
      baseline: { environmentId: 'local', generations: DOMAIN_PREVIEW_CONFIG.shimmer.ownedTables.map((scope) => ({ ...scope, generation: 0 })), projectionHash: HASH('c') },
    }),
    buildImportPlan: async () => ({ records: [] }),
  });

  assert.equal(probeCalls, 0);
  assert.deepEqual(result.stableSourceSnapshot, snapshot);
  assert.equal(result.sourceAcknowledged, false);
  assert.equal(result.sourceAcknowledgementReason, 'local_source_reused');
});

for (const domainId of ['audio', 'bosses', 'shimmer']) {
  test(`prepares a monitor-visible frozen ${domainId} L1 preview`, async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), `supplementary-${domainId}-`));
    const progressWrites = [];
    const config = DOMAIN_PREVIEW_CONFIG[domainId];
    const result = await prepareSupplementaryDomainL1Preview({
      domainId,
      repoRoot,
      generatedAt: '2026-08-14T06:00:00.000Z',
      runId: `${domainId}_l1_20260814_01`,
    }, {
      writeProgress: (filePath, payload) => progressWrites.push({ filePath, payload }),
      runSource: async ({ progressPath }) => {
        assert.equal(progressPath, path.join(repoRoot, config.progressPath));
        return { sourcePayload: { domainId, records: [{ id: 1 }] } };
      },
      loadPolicyContext: async () => ({
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
          generations: config.ownedTables.map((scope) => ({ ...scope, generation: 0 })),
          projectionHash: HASH('c'),
        },
      }),
      buildImportPlan: async ({ sourcePayload }) => ({ records: sourcePayload.records }),
    });

    assert.equal(progressWrites[0].payload.status, 'running');
    assert.equal(progressWrites[0].payload.phase, 'source');
    assert.equal(progressWrites.at(-1).payload.status, 'completed');
    assert.equal(progressWrites.at(-1).payload.phase, 'preview');
    assert.equal(progressWrites.every(({ payload }) => payload.actionId === config.actionId), true);
    assert.equal(progressWrites.every(({ payload }) => payload.childStatusPath === path.join(repoRoot, config.progressPath)), true);
    assert.equal(result.bundle.domainId, domainId);
    assert.equal(result.bundle.approvalMode, 'APPROVED_OWNER_L1');
    assert.equal(fs.existsSync(result.sourcePath), true);
    assert.equal(fs.existsSync(result.bundlePath), true);
    assert.equal(
      result.bundle.source.sha256,
      `sha256:${createHash('sha256').update(fs.readFileSync(result.sourcePath)).digest('hex')}`,
    );
  });
}

test('activation-gated previews use a run-specific canonical artifact path', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'supplementary-automatic-artifacts-'));
  const legacySourcePath = path.join(repoRoot, 'reports/authorization/canonical/automation-bosses-first-l1.source.json');
  const automaticScopes = [
    { databaseRole: 'local', table: 'boss_groups', fieldGroup: 'all_columns' },
    { databaseRole: 'local', table: 'npcs', fieldGroup: 'boss_owned', logicalPredicateHash: HASH('d') },
  ];
  fs.mkdirSync(path.dirname(legacySourcePath), { recursive: true });
  fs.writeFileSync(legacySourcePath, 'legacy\n', { mode: 0o600 });

  const result = await prepareSupplementaryDomainL1Preview({
    domainId: 'bosses',
    repoRoot,
    generatedAt: '2026-08-31T06:00:00.000Z',
    runId: 'bosses_l1_auto_preview_20260831_01',
    executionMode: 'ACTIVATION_GATED_AUTO',
  }, {
    runSource: async () => ({ sourcePayload: { domainId: 'bosses', records: [] } }),
    loadPolicyContext: async () => ({
      policy: {
        domainId: 'bosses', level: 'L2', operationalState: 'ACTIVE', policyVersion: 2,
        policyHash: HASH('a'), policySetHash: HASH('b'),
        policyJson: {
          schemaVersion: 1,
          level: 'L2',
          requireSnapshot: true,
          anomalyAction: 'CIRCUIT_OPEN',
          ownedTables: automaticScopes,
        },
      },
      baseline: {
        environmentId: 'local',
        generations: automaticScopes.map((scope) => ({ ...scope, generation: 0 })),
        projectionHash: HASH('c'),
      },
      ownedTables: automaticScopes,
    }),
    buildImportPlan: async () => ({ records: [] }),
  });

  assert.match(result.sourcePath, /reports[\\/]authorization[\\/]canonical[\\/]automatic[\\/]bosses[\\/]bosses_l1_auto_preview_20260831_01[\\/]source\.json$/);
  assert.match(result.bundlePath, /reports[\\/]authorization[\\/]canonical[\\/]automatic[\\/]bosses[\\/]bosses_l1_auto_preview_20260831_01[\\/]bundle\.json$/);
  assert.equal(fs.lstatSync(result.sourcePath).isFile(), true);
  assert.equal(fs.lstatSync(result.sourcePath).mode & 0o777, 0o600);
  assert.equal(fs.lstatSync(result.bundlePath).isFile(), true);
  assert.equal(fs.lstatSync(result.bundlePath).mode & 0o777, 0o600);
  assert.deepEqual(result.bundle.ownedTables, automaticScopes);
  assert.equal(fs.readFileSync(legacySourcePath, 'utf8'), 'legacy\n');
});

test('activation-gated preview rejects source identity drift before source or bundle publication', async (t) => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'supplementary-preview-identity-drift-'));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  const checkedAt = '2026-08-31T06:00:00.000Z';
  const sourceFingerprint = HASH('f');
  const sourceStatePath = path.join(repoRoot, 'data', 'generated', 'source-update-monitor.latest.json');
  const sourceState = {
    checkedAt,
    summary: { probeHealthy: true, errorSources: 0 },
    sources: [{
      key: 'wiki.bosses.catalog',
      status: 'ok',
      checkedAt,
      currentValue: sourceFingerprint,
      changed: true,
    }],
  };
  fs.mkdirSync(path.dirname(sourceStatePath), { recursive: true });
  fs.writeFileSync(sourceStatePath, JSON.stringify(sourceState));
  const sourceDispatchIdentity = {
    sourceFingerprint,
    sourceRunIdentity: checkedAt,
    sourceContentIdentity: `sha256:${createHash('sha256').update(JSON.stringify(sourceState)).digest('hex')}`,
  };
  const runId = 'bosses_l1_auto_preview_identity_drift';
  const artifactRoot = path.join(repoRoot, 'reports', 'authorization', 'canonical', 'automatic', 'bosses', runId);
  const automaticScopes = [
    { databaseRole: 'local', table: 'boss_groups', fieldGroup: 'all_columns' },
    { databaseRole: 'local', table: 'npcs', fieldGroup: 'boss_owned', logicalPredicateHash: HASH('d') },
  ];
  const snapshot = {
    sourceKey: 'wiki.bosses.catalog',
    locator: 'Bosses',
    entityFamily: 'bosses',
    sourceKind: 'page_catalog',
    contentHash: sourceFingerprint,
    checkedAt,
  };

  await assert.rejects(
    prepareSupplementaryDomainL1Preview({
      domainId: 'bosses',
      repoRoot,
      generatedAt: checkedAt,
      runId,
      executionMode: 'ACTIVATION_GATED_AUTO',
      sourceDispatchIdentity,
      sourceStatePath,
    }, {
      runSource: async () => {
        const drifted = JSON.parse(fs.readFileSync(sourceStatePath, 'utf8'));
        drifted.summary.lastObservedAt = '2026-08-31T06:00:01.000Z';
        fs.writeFileSync(sourceStatePath, JSON.stringify(drifted));
        return { sourcePayload: { domainId: 'bosses', records: [] } };
      },
      loadPolicyContext: async () => ({
        policy: {
          domainId: 'bosses', level: 'L2', operationalState: 'ACTIVE', policyVersion: 2,
          policyHash: HASH('a'), policySetHash: HASH('b'),
          policyJson: {
            schemaVersion: 1,
            level: 'L2',
            requireSnapshot: true,
            anomalyAction: 'CIRCUIT_OPEN',
            ownedTables: automaticScopes,
          },
        },
        baseline: {
          environmentId: 'local',
          generations: automaticScopes.map((scope) => ({ ...scope, generation: 0 })),
          projectionHash: HASH('c'),
        },
        ownedTables: automaticScopes,
      }),
      buildImportPlan: async () => ({ records: [] }),
      probeSource: async () => snapshot,
    }),
    /source monitor content identity|source dispatch identity/i,
  );

  assert.equal(fs.existsSync(path.join(artifactRoot, 'source.json')), false);
  assert.equal(fs.existsSync(path.join(artifactRoot, 'bundle.json')), false);
});

test('activation-gated preview refuses an existing run artifact before source work', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'supplementary-automatic-collision-'));
  const artifactRoot = path.join(
    repoRoot,
    'reports/authorization/canonical/automatic/bosses/bosses_l1_auto_preview_collision',
  );
  fs.mkdirSync(artifactRoot, { recursive: true });
  fs.writeFileSync(path.join(artifactRoot, 'source.json'), 'existing\n', { mode: 0o600 });
  let sourceRuns = 0;

  await assert.rejects(
    prepareSupplementaryDomainL1Preview({
      domainId: 'bosses',
      repoRoot,
      generatedAt: '2026-08-31T06:00:00.000Z',
      runId: 'bosses_l1_auto_preview_collision',
      executionMode: 'ACTIVATION_GATED_AUTO',
    }, {
      runSource: async () => { sourceRuns += 1; },
      loadPolicyContext: async () => { throw new Error('policy must not be reached'); },
      buildImportPlan: async () => { throw new Error('plan must not be reached'); },
    }),
    /refusing to overwrite automatic preview artifact/,
  );
  assert.equal(sourceRuns, 0);
});

test('activation-gated preview rejects a symlinked canonical artifact ancestor before source work', async (t) => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'supplementary-automatic-symlink-'));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'supplementary-automatic-symlink-outside-'));
  t.after(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  });
  const authorizationRoot = path.join(repoRoot, 'reports', 'authorization');
  fs.mkdirSync(authorizationRoot, { recursive: true });
  fs.symlinkSync(outsideRoot, path.join(authorizationRoot, 'canonical'), 'dir');
  let sourceRuns = 0;

  await assert.rejects(
    prepareSupplementaryDomainL1Preview({
      domainId: 'bosses',
      repoRoot,
      generatedAt: '2026-09-01T06:20:00.000Z',
      runId: 'bosses_l1_auto_preview_symlink',
      executionMode: 'ACTIVATION_GATED_AUTO',
    }, {
      writeProgress: () => {},
      runSource: async () => {
        sourceRuns += 1;
        return { sourcePayload: { domainId: 'bosses', records: [] } };
      },
      loadPolicyContext: async () => { throw new Error('policy must not be reached'); },
      buildImportPlan: async () => { throw new Error('plan must not be reached'); },
    }),
    /symbolic|symlink|canonical.*ordinary|artifact.*directory/i,
  );
  assert.equal(sourceRuns, 0);
  assert.deepEqual(fs.readdirSync(outsideRoot), []);
});

test('activation-gated preview preserves a target created after the initial freshness check', async (t) => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'supplementary-automatic-late-collision-'));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  const artifactRoot = path.join(
    repoRoot,
    'reports/authorization/canonical/automatic/bosses/bosses_l1_auto_preview_late_collision',
  );
  const sourcePath = path.join(artifactRoot, 'source.json');
  const automaticScopes = [
    { databaseRole: 'local', table: 'boss_groups', fieldGroup: 'all_columns' },
    { databaseRole: 'local', table: 'npcs', fieldGroup: 'boss_owned', logicalPredicateHash: HASH('d') },
  ];
  const originalRenameSync = fs.renameSync;
  const originalLinkSync = fs.linkSync;
  const originalOpenSync = fs.openSync;
  let raced = false;
  const publishCollision = (candidate) => {
    if (raced || typeof candidate !== 'string' || !candidate.endsWith(`${path.sep}source.json`)) return;
    raced = true;
    const fd = originalOpenSync(
      sourcePath,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL,
      0o600,
    );
    fs.writeFileSync(fd, 'late collision\n');
    fs.closeSync(fd);
  };
  fs.renameSync = function patchedRenameSync(from, to, ...args) {
    publishCollision(to);
    return originalRenameSync.call(this, from, to, ...args);
  };
  fs.linkSync = function patchedLinkSync(from, to, ...args) {
    publishCollision(to);
    return originalLinkSync.call(this, from, to, ...args);
  };

  try {
    await assert.rejects(
      prepareSupplementaryDomainL1Preview({
        domainId: 'bosses',
        repoRoot,
        generatedAt: '2026-09-01T06:20:00.000Z',
        runId: 'bosses_l1_auto_preview_late_collision',
        executionMode: 'ACTIVATION_GATED_AUTO',
      }, {
        writeProgress: () => {},
        runSource: async () => ({ sourcePayload: { domainId: 'bosses', records: [] } }),
        loadPolicyContext: async () => ({
          policy: {
            domainId: 'bosses', level: 'L2', operationalState: 'ACTIVE', policyVersion: 2,
            policyHash: HASH('a'), policySetHash: HASH('b'),
            policyJson: {
              schemaVersion: 1,
              level: 'L2',
              requireSnapshot: true,
              anomalyAction: 'CIRCUIT_OPEN',
              ownedTables: automaticScopes,
            },
          },
          baseline: {
            environmentId: 'local',
            generations: automaticScopes.map((scope) => ({ ...scope, generation: 0 })),
            projectionHash: HASH('c'),
          },
          ownedTables: automaticScopes,
        }),
        buildImportPlan: async () => ({ records: [] }),
      }),
      /already exists|overwrite/i,
    );
  } finally {
    fs.renameSync = originalRenameSync;
    fs.linkSync = originalLinkSync;
  }
  assert.equal(raced, true);
  assert.equal(fs.readFileSync(sourcePath, 'utf8'), 'late collision\n');
});

test('activation-gated preview rejects a destination replaced after hard-link publication', async (t) => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'supplementary-automatic-replaced-destination-'));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  const automaticScopes = [
    { databaseRole: 'local', table: 'boss_groups', fieldGroup: 'all_columns' },
    { databaseRole: 'local', table: 'npcs', fieldGroup: 'boss_owned', logicalPredicateHash: HASH('d') },
  ];
  const originalLinkSync = fs.linkSync;
  let replaced = false;
  fs.linkSync = function patchedLinkSync(from, to, ...args) {
    const result = originalLinkSync.call(this, from, to, ...args);
    if (!replaced && typeof to === 'string' && to.endsWith(`${path.sep}bundle.json`)) {
      replaced = true;
      fs.unlinkSync(to);
      fs.writeFileSync(to, '{"replacement":true}\n', { mode: 0o600, flag: 'wx' });
    }
    return result;
  };
  try {
    await assert.rejects(
      prepareSupplementaryDomainL1Preview({
        domainId: 'bosses',
        repoRoot,
        generatedAt: '2026-09-01T06:20:00.000Z',
        runId: 'bosses_l1_auto_preview_replaced',
        executionMode: 'ACTIVATION_GATED_AUTO',
      }, {
        writeProgress: () => {},
        runSource: async () => ({ sourcePayload: { domainId: 'bosses', records: [] } }),
        loadPolicyContext: async () => ({
          policy: {
            domainId: 'bosses', level: 'L2', operationalState: 'ACTIVE', policyVersion: 2,
            policyHash: HASH('a'), policySetHash: HASH('b'),
            policyJson: {
              schemaVersion: 1,
              level: 'L2',
              requireSnapshot: true,
              anomalyAction: 'CIRCUIT_OPEN',
              ownedTables: automaticScopes,
            },
          },
          baseline: {
            environmentId: 'local',
            generations: automaticScopes.map((scope) => ({ ...scope, generation: 0 })),
            projectionHash: HASH('c'),
          },
          ownedTables: automaticScopes,
        }),
        buildImportPlan: async () => ({ records: [] }),
      }),
      /identity|changed|replacement|ordinary|private/i,
    );
  } finally {
    fs.linkSync = originalLinkSync;
  }
  assert.equal(replaced, true);
  const replacedPath = path.join(
    repoRoot,
    'reports/authorization/canonical/automatic/bosses/bosses_l1_auto_preview_replaced/bundle.json',
  );
  assert.equal(fs.readFileSync(replacedPath, 'utf8'), '{"replacement":true}\n');
});

test('records a terminal failed progress snapshot', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'supplementary-failed-'));
  const writes = [];

  await assert.rejects(
    prepareSupplementaryDomainL1Preview({
      domainId: 'audio',
      repoRoot,
      generatedAt: '2026-08-14T06:00:00.000Z',
      runId: 'audio_l1_20260814_01',
    }, {
      writeProgress: (_filePath, payload) => writes.push(payload),
      runSource: async () => { throw new Error('controlled source failure'); },
      loadPolicyContext: async () => { throw new Error('policy must not be reached'); },
      buildImportPlan: async () => { throw new Error('plan must not be reached'); },
    }),
    /controlled source failure/,
  );

  assert.equal(writes.at(-1).status, 'failed');
  assert.equal(writes.at(-1).phase, 'source');
  assert.match(writes.at(-1).message, /controlled source failure/);
});

test('acknowledges only a stable supplementary source snapshot after the frozen bundle is written', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'supplementary-stable-ack-'));
  const snapshot = {
    sourceKey: 'wiki.bosses.catalog', locator: 'Bosses', entityFamily: 'bosses',
    sourceKind: 'page_catalog', contentHash: 'stable', checkedAt: '2026-08-14T06:00:00.000Z',
  };
  const acknowledgements = [];
  const baseDependencies = {
    runSource: async () => ({ sourcePayload: { records: [] } }),
    loadPolicyContext: async () => ({ policy: { domainId: 'bosses', level: 'L1', operationalState: 'ACTIVE', policyVersion: 1, policyHash: HASH('a'), policySetHash: HASH('b') }, baseline: { environmentId: 'local', generations: DOMAIN_PREVIEW_CONFIG.bosses.ownedTables.map((scope) => ({ ...scope, generation: 0 })), projectionHash: HASH('c') } }),
    buildImportPlan: async () => ({ records: [] }),
    acknowledgeSource: (input) => acknowledgements.push(input),
  };
  const stable = await prepareSupplementaryDomainL1Preview({ domainId: 'bosses', repoRoot, generatedAt: '2026-08-14T06:00:00.000Z', runId: 'bosses_l1_20260814_01' }, {
    ...baseDependencies,
    probeSource: async () => snapshot,
  });
  assert.equal(stable.sourceAcknowledged, true);
  assert.equal(acknowledgements.length, 1);

  const drifted = await prepareSupplementaryDomainL1Preview({ domainId: 'bosses', repoRoot, generatedAt: '2026-08-14T06:01:00.000Z', runId: 'bosses_l1_20260814_02' }, {
    ...baseDependencies,
    probeSource: (() => { const values = [snapshot, { ...snapshot, contentHash: 'next' }]; return async () => values.shift(); })(),
  });
  assert.equal(drifted.sourceAcknowledged, false);
  assert.equal(drifted.sourceAcknowledgementReason, 'source_changed_during_preview');
  assert.equal(acknowledgements.length, 1);
});

test('automatic preview defers a stable source acknowledgement until database apply succeeds', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'supplementary-deferred-ack-'));
  const snapshot = {
    sourceKey: 'wiki.bosses.catalog', locator: 'Bosses', entityFamily: 'bosses',
    sourceKind: 'page_catalog', contentHash: 'stable', checkedAt: '2026-08-14T06:00:00.000Z',
  };
  const acknowledgements = [];
  const result = await prepareSupplementaryDomainL1Preview({
    domainId: 'bosses',
    repoRoot,
    generatedAt: '2026-08-14T06:00:00.000Z',
    runId: 'bosses_l1_20260814_deferred',
    deferSourceAcknowledgement: true,
  }, {
    runSource: async () => ({ sourcePayload: { records: [] } }),
    loadPolicyContext: async () => ({
      policy: { domainId: 'bosses', level: 'L1', operationalState: 'ACTIVE', policyVersion: 1, policyHash: HASH('a'), policySetHash: HASH('b') },
      baseline: { environmentId: 'local', generations: DOMAIN_PREVIEW_CONFIG.bosses.ownedTables.map((scope) => ({ ...scope, generation: 0 })), projectionHash: HASH('c') },
    }),
    buildImportPlan: async () => ({ records: [] }),
    probeSource: async () => snapshot,
    acknowledgeSource: (input) => acknowledgements.push(input),
  });

  assert.equal(result.sourceAcknowledged, false);
  assert.equal(result.sourceAcknowledgementReason, 'deferred_until_apply');
  assert.deepEqual(result.stableSourceSnapshot, snapshot);
  assert.equal(acknowledgements.length, 0);
});

test('keeps a valid frozen preview completed but does not acknowledge when the post-probe fails', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'supplementary-post-probe-failure-'));
  const manifestPath = path.join(repoRoot, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ records: [] }), 'utf8');
  const before = fs.readFileSync(manifestPath, 'utf8');
  const writes = [];
  const stableSnapshot = {
    sourceKey: 'wiki.audio_assets.catalog', locator: 'Music|NPC_Hit|NPC_Killed|Item_', entityFamily: 'audio',
    sourceKind: 'media_catalog', contentHash: 'stable', checkedAt: '2026-08-14T06:00:00.000Z',
  };
  let probeCount = 0;
  const result = await prepareSupplementaryDomainL1Preview({
    domainId: 'audio', repoRoot, manifestPath, generatedAt: '2026-08-14T06:00:00.000Z', runId: 'audio_l1_20260814_02',
  }, {
    writeProgress: (_path, payload) => writes.push(payload),
    probeSource: async () => {
      probeCount += 1;
      if (probeCount === 2) throw new Error('post probe unavailable');
      return stableSnapshot;
    },
    runSource: async () => ({ sourcePayload: { records: [] } }),
    loadPolicyContext: async () => ({
      policy: { domainId: 'audio', level: 'L1', operationalState: 'ACTIVE', policyVersion: 1, policyHash: HASH('a'), policySetHash: HASH('b') },
      baseline: { environmentId: 'local', generations: DOMAIN_PREVIEW_CONFIG.audio.ownedTables.map((scope) => ({ ...scope, generation: 0 })), projectionHash: HASH('c') },
    }),
    buildImportPlan: async () => ({ records: [] }),
    acknowledgeSource: () => { throw new Error('must not acknowledge after post-probe failure'); },
  });

  assert.equal(result.sourceAcknowledged, false);
  assert.equal(result.sourceAcknowledgementReason, 'post_probe_failed');
  assert.equal(writes.at(-1).status, 'completed');
  assert.equal(fs.readFileSync(manifestPath, 'utf8'), before);
});

test('keeps a valid frozen preview completed but does not acknowledge when acknowledgement fails', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'supplementary-ack-failure-'));
  const manifestPath = path.join(repoRoot, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ records: [] }), 'utf8');
  const before = fs.readFileSync(manifestPath, 'utf8');
  const writes = [];
  const snapshot = {
    sourceKey: 'wiki.bosses.catalog', locator: 'Bosses', entityFamily: 'bosses',
    sourceKind: 'page_catalog', contentHash: 'stable', checkedAt: '2026-08-14T06:00:00.000Z',
  };
  const result = await prepareSupplementaryDomainL1Preview({
    domainId: 'bosses', repoRoot, manifestPath, generatedAt: '2026-08-14T06:00:00.000Z', runId: 'bosses_l1_20260814_02',
  }, {
    writeProgress: (_path, payload) => writes.push(payload),
    probeSource: async () => snapshot,
    runSource: async () => ({ sourcePayload: { records: [] } }),
    loadPolicyContext: async () => ({
      policy: { domainId: 'bosses', level: 'L1', operationalState: 'ACTIVE', policyVersion: 1, policyHash: HASH('a'), policySetHash: HASH('b') },
      baseline: { environmentId: 'local', generations: DOMAIN_PREVIEW_CONFIG.bosses.ownedTables.map((scope) => ({ ...scope, generation: 0 })), projectionHash: HASH('c') },
    }),
    buildImportPlan: async () => ({ records: [] }),
    acknowledgeSource: () => { throw new Error('acknowledgement write failed'); },
  });

  assert.equal(result.sourceAcknowledged, false);
  assert.equal(result.sourceAcknowledgementReason, 'post_probe_failed');
  assert.equal(writes.at(-1).status, 'completed');
  assert.equal(fs.readFileSync(manifestPath, 'utf8'), before);
});
