import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildDomainSourceCommand,
  connectionOptions,
  DOMAIN_PREVIEW_CONFIG,
  prepareSupplementaryDomainL1Preview,
  runDomainSource,
} from './prepare-supplementary-domain-l1-preview.mjs';

const HASH = (letter) => `sha256:${letter.repeat(64)}`;

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
    'scripts/data/fetch/fetch-wiki-audio-assets.mjs',
    '--mode=all',
    '--allow-full-audio-corpus=true',
    '--max-total-files=600',
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
  });
}

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
