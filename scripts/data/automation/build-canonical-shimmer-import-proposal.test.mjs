import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CANONICAL_SHIMMER_IMPORT_PROPOSAL_PATH,
  buildCanonicalShimmerImportProposal,
  materializeCanonicalShimmerImportInputContract,
  readCanonicalShimmerImportProposal,
  runCanonicalShimmerImportProposal,
  writeCanonicalShimmerImportProposal,
} from './build-canonical-shimmer-import-proposal.mjs';
import {
  CANONICAL_SHIMMER_IMPORT_INPUT_CONTRACT_PATH,
  assertCanonicalShimmerImportInputContract,
  readCanonicalShimmerImportInputContract,
  writeCanonicalShimmerImportInputContract,
} from './canonical-shimmer-import-input-contract.mjs';
import { loadVerifiedShimmerImportBundle } from '../import/import-wiki-shimmer-to-db.mjs';
import { publishShimmerGeneration } from '../transform/shimmer-generation-contract.mjs';

const proposalCliPath = fileURLToPath(new URL('./build-canonical-shimmer-import-proposal.mjs', import.meta.url));

test('Shimmer proposal freezes a verified manifest, read-only preview, and candidate input contract', () => {
  const fixture = createGenerationFixture();
  try {
    const bundle = loadVerifiedShimmerImportBundle({
      bundleManifestPath: fixture.publication.manifestPath,
      repoRoot: fixture.repoRoot,
    });
    const proposal = buildCanonicalShimmerImportProposal({
      bundle,
      existing: emptyExistingScope(),
      target: targetFingerprint(),
      generatedAt: '2026-08-04T01:00:00.000Z',
    });

    assert.equal(proposal.operationId, 'canonical-shimmer-import');
    assert.equal(proposal.status, 'proposed');
    assert.equal(proposal.apply, false);
    assert.equal(proposal.generationId, bundle.generationId);
    assert.equal(proposal.previewSha256, proposal.preview.previewSha256);
    assert.equal(proposal.inputContract.previewSha256, proposal.preview.previewSha256);
    assert.equal(proposal.inputContract.targetFingerprintSha256, proposal.preview.targetFingerprintSha256);
    assert.equal(proposal.inputContract.manifestSha256, bundle.manifestSha256);
    assertCanonicalShimmerImportInputContract(proposal.inputContract);
  } finally {
    fixture.cleanup();
  }
});

test('Shimmer proposal runner accepts only an injected read-only preview path and materializes one private contract', async () => {
  const fixture = createGenerationFixture();
  const writes = [];
  let previewLoads = 0;
  try {
    const bundle = loadVerifiedShimmerImportBundle({
      bundleManifestPath: fixture.publication.manifestPath,
      repoRoot: fixture.repoRoot,
    });
    const dependencies = {
      loadBundle: () => bundle,
      loadPreviewInputs: async () => {
        previewLoads += 1;
        return { existing: emptyExistingScope(), target: targetFingerprint() };
      },
      writeProposal: ({ proposal }) => {
        writes.push(proposal);
        return proposal;
      },
    };

    const proposal = await runCanonicalShimmerImportProposal({
      bundleManifestPath: fixture.publication.manifestPath,
      repoRoot: fixture.repoRoot,
      generatedAt: '2026-08-04T01:00:00.000Z',
    }, dependencies);
    assert.equal(previewLoads, 1);
    assert.deepEqual(writes, [proposal]);

    for (const apply of [true, false, 'true', 'false', '1', '0']) {
      await assert.rejects(
        runCanonicalShimmerImportProposal({
          apply,
          bundleManifestPath: fixture.publication.manifestPath,
          repoRoot: fixture.repoRoot,
        }, dependencies),
        /apply/i,
      );
    }
    assert.equal(previewLoads, 1, 'apply rejection must happen before preview access');

    const written = writeCanonicalShimmerImportProposal({
      repoRoot: fixture.repoRoot,
      proposal,
    });
    assert.equal(written.relativePath, CANONICAL_SHIMMER_IMPORT_PROPOSAL_PATH);
    assert.equal(fs.statSync(written.proposalPath).mode & 0o777, 0o600);

    const contract = materializeCanonicalShimmerImportInputContract({
      repoRoot: fixture.repoRoot,
    });
    assert.equal(contract.relativePath, CANONICAL_SHIMMER_IMPORT_INPUT_CONTRACT_PATH);
    assert.equal(fs.statSync(contract.contractPath).mode & 0o777, 0o600);
    assert.deepEqual(contract.contract, proposal.inputContract);

    assert.throws(
      () => materializeCanonicalShimmerImportInputContract({ repoRoot: fixture.repoRoot }),
      /already exists|overwrite/i,
    );
  } finally {
    fixture.cleanup();
  }
});

test('Shimmer proposal CLI rejects packet and permit inputs before resolving a bundle', () => {
  for (const option of ['packet', 'permit']) {
    const result = spawnSync(process.execPath, [proposalCliPath, `--${option}=unexpected`], {
      encoding: 'utf8',
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(`does not accept ${option}`, 'i'));
    assert.doesNotMatch(result.stderr, /bundle manifest is required/i);
  }
});

test('Shimmer proposal default preview uses one read-only transaction without DML', async () => {
  const fixture = createGenerationFixture();
  const sql = [];
  const calls = [];
  const connection = {
    async query(statement) {
      sql.push(statement);
      if (/@@server_uuid/i.test(statement)) return [[{ serverUuid: 'shimmer-proposal-server' }]];
      return [[]];
    },
    async execute(statement) {
      sql.push(statement);
      return [[]];
    },
    async rollback() {
      calls.push('rollback');
    },
    async end() {
      calls.push('end');
    },
  };

  try {
    await runCanonicalShimmerImportProposal({
      bundleManifestPath: fixture.publication.manifestPath,
      database: 'terria_v1_local',
      generatedAt: '2026-08-04T01:00:00.000Z',
      repoRoot: fixture.repoRoot,
    }, {
      loadLocalStackConfig: () => ({ database: {} }),
      mysql: {
        createConnection: async () => connection,
      },
      writeProposal: ({ proposal }) => proposal,
    });

    assert.ok(sql.some((statement) => /START TRANSACTION READ ONLY/i.test(statement)));
    assert.equal(
      sql.some((statement) => /\b(?:INSERT|UPDATE|DELETE|REPLACE|ALTER|DROP|CREATE)\b/i.test(statement)),
      false,
    );
    assert.deepEqual(calls, ['rollback', 'end']);
  } finally {
    fixture.cleanup();
  }
});

test('Shimmer private contract and proposal paths reject ancestor symlinks outside the repository', () => {
  const fixture = createGenerationFixture();
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-shimmer-private-outside-'));
  try {
    const bundle = loadVerifiedShimmerImportBundle({
      bundleManifestPath: fixture.publication.manifestPath,
      repoRoot: fixture.repoRoot,
    });
    const proposal = buildCanonicalShimmerImportProposal({
      bundle,
      existing: emptyExistingScope(),
      target: targetFingerprint(),
      generatedAt: '2026-08-04T01:00:00.000Z',
    });
    const canonicalDirectory = path.join(fixture.repoRoot, 'reports/authorization/canonical');
    const outsideCanonicalDirectory = path.join(outsideRoot, 'canonical');
    fs.mkdirSync(path.dirname(canonicalDirectory), { recursive: true });
    fs.mkdirSync(outsideCanonicalDirectory, { recursive: true });
    fs.symlinkSync(outsideCanonicalDirectory, canonicalDirectory, 'dir');

    const outsideContractPath = path.join(
      outsideCanonicalDirectory,
      'canonical-shimmer-import.input.json',
    );
    fs.writeFileSync(outsideContractPath, `${JSON.stringify(proposal.inputContract)}\n`, { mode: 0o600 });
    fs.chmodSync(outsideContractPath, 0o600);
    assert.throws(
      () => readCanonicalShimmerImportInputContract({ repoRoot: fixture.repoRoot }),
      /inside.*repository|ancestor|symbolic/i,
    );
    fs.rmSync(outsideContractPath);
    assert.throws(
      () => writeCanonicalShimmerImportInputContract({
        repoRoot: fixture.repoRoot,
        inputContract: proposal.inputContract,
      }),
      /inside.*repository|ancestor|symbolic/i,
    );

    const outsideProposalPath = path.join(
      outsideCanonicalDirectory,
      'canonical-shimmer-import.proposal.json',
    );
    fs.writeFileSync(outsideProposalPath, `${JSON.stringify(proposal)}\n`, { mode: 0o600 });
    fs.chmodSync(outsideProposalPath, 0o600);
    assert.throws(
      () => readCanonicalShimmerImportProposal({ repoRoot: fixture.repoRoot }),
      /inside.*repository|ancestor|symbolic/i,
    );
    fs.rmSync(outsideProposalPath);
    assert.throws(
      () => writeCanonicalShimmerImportProposal({ repoRoot: fixture.repoRoot, proposal }),
      /inside.*repository|ancestor|symbolic/i,
    );
  } finally {
    fixture.cleanup();
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  }
});

function createGenerationFixture() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-shimmer-proposal-'));
  const publication = publishShimmerGeneration({
    rawBytes: Buffer.from(JSON.stringify({
      entity: 'wiki_shimmer_page',
      pageTitle: 'Shimmer',
      pageId: 4242,
      revisionTimestamp: '2026-08-04T00:00:00.000Z',
      html: '<table></table>',
    })),
    shards: {
      context: {
        entity: 'wiki_shimmer_context_importable',
        records: [{ code: 'SHIMMER', sourcePage: 'Shimmer' }],
      },
      itemTransforms: {
        entity: 'wiki_shimmer_item_transforms_importable',
        records: [{
          inputKind: 'item',
          inputNameEn: 'Torch',
          inputNameZh: 'Torch',
          inputInternalName: 'Torch',
          outputKind: 'item',
          outputNameEn: 'Aether Torch',
          outputNameZh: 'Aether Torch',
          outputInternalName: 'AetherTorch',
          conditions: [],
          sourcePage: '\u5fae\u5149',
          sourceRevisionTimestamp: '2026-08-04T00:00:00.000Z',
        }],
      },
      decraftRules: {
        entity: 'wiki_shimmer_decraft_rules_importable',
        records: [{
          ruleType: 'decraft_unique',
          groupLabel: 'Unique',
          input: { kind: 'item', nameZh: 'Torch', nameEn: 'Torch', internalName: 'Torch' },
          outputs: [],
          conditions: [],
          sourcePage: '\u5fae\u5149',
          sourceRevisionTimestamp: '2026-08-04T00:00:00.000Z',
        }],
      },
      entityTransforms: {
        entity: 'wiki_shimmer_entity_transforms_importable',
        records: [{
          transformGroup: 'enemy_transforms',
          input: { kind: 'npc', nameZh: 'Guide', nameEn: 'Guide', internalName: 'Guide' },
          output: { kind: 'npc', nameZh: 'Shimmered Guide', nameEn: 'Shimmered Guide', internalName: 'GuideShimmer' },
          sourcePage: '\u5fae\u5149',
          sourceRevisionTimestamp: '2026-08-04T00:00:00.000Z',
        }],
      },
      npcTransforms: {
        entity: 'wiki_shimmer_npc_transforms_importable',
        records: [{
          npc: { kind: 'npc', nameZh: 'Guide', nameEn: 'Guide', internalName: 'Guide' },
          appearanceVariant: 'shimmer',
          effectType: 'visual_only',
          sourcePage: '\u5fae\u5149',
          sourceRevisionTimestamp: '2026-08-04T00:00:00.000Z',
        }],
      },
      titleResolution: {
        entity: 'wiki_shimmer_title_resolution',
        records: [{ nameZh: 'Torch', nameEn: 'Torch', kind: 'item', internalName: 'Torch' }],
      },
    },
    standardizedInputs: {
      items: { path: 'data/standardized/items.standardized.json', sha256: sha256('items') },
      npcs: { path: 'data/standardized/npcs.standardized.json', sha256: sha256('npcs') },
    },
    langlinkEvidenceBytes: Buffer.from(JSON.stringify({ records: [] })),
    producerCodeSha256: sha256('producer'),
    tableRoleVersion: 'shimmer-table-roles/1',
    generatedAt: '2026-08-04T00:00:00.000Z',
    generationRoot: path.join(repoRoot, 'data/generated/shimmer/generations'),
    pointerPath: path.join(repoRoot, 'data/generated/shimmer/wiki-shimmer-current-generation.json'),
    runId: 'proposal-test',
  });
  return {
    cleanup: () => fs.rmSync(repoRoot, { recursive: true, force: true }),
    publication,
    repoRoot,
  };
}

function emptyExistingScope() {
  return {
    worldContext: null,
    shimmerTables: {
      shimmer_item_transforms: [],
      shimmer_decraft_rules: [],
      shimmer_entity_transforms: [],
      shimmer_npc_transforms: [],
    },
    snapshots: [],
  };
}

function targetFingerprint() {
  return {
    host: '127.0.0.1',
    port: 13306,
    database: 'terria_v1_local',
    serverUuid: 'shimmer-proposal-server',
  };
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
}
