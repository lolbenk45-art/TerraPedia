import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

import {
  CANONICAL_EXECUTABLE_OPERATION_IDS,
  buildCanonicalOperationExecutionManifest,
  assertCanonicalOperationExecutionManifestContract,
  writeCanonicalOperationExecutionManifest,
} from './canonical-operation-execution-manifest.mjs';
import {
  CANONICAL_CUTOVER_OPERATION_IDS,
  CANONICAL_OPERATION_DATA_PATHS,
  CANONICAL_OPERATION_ENTRYPOINTS,
} from './build-canonical-cutover-authorization.mjs';
import {
  SHIMMER_IMPORT_PROVIDER_SCOPE,
  shimmerImportBindingFromInputContract,
  writeCanonicalShimmerImportInputContract,
} from './canonical-shimmer-import-input-contract.mjs';
import { publishShimmerGeneration } from '../transform/shimmer-generation-contract.mjs';
import {
  buildItemImageProjectionAttemptPaths,
  buildItemImageProjectionInputContract,
  buildItemImageProjectionProposal,
} from '../relation/item-image-projection-contract.mjs';
import {
  buildItemSourceLocalNpcAdmissionAttemptPaths,
  buildItemSourceLocalNpcAdmissionInputContract,
} from '../relation/item-source-local-npc-admission-contract.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const npcT1ConfigDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-npc-t1-config-'));
const npcT1ConfigPath = path.join(npcT1ConfigDirectory, 'local-stack.json');
const NPC_T1_SERVER_FINGERPRINT = Object.freeze({
  host: '127.0.0.1',
  port: 13306,
  serverUuid: 'npc-t1-server-uuid',
  databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
});
fs.writeFileSync(npcT1ConfigPath, `${JSON.stringify({
  database: { host: '127.0.0.1', port: 13306 },
  redis: { port: 6379 },
  npcT1ServerFingerprint: NPC_T1_SERVER_FINGERPRINT,
})}\n`, { mode: 0o600 });
const npcT1ConfigHash = `sha256:${createHash('sha256').update(fs.readFileSync(npcT1ConfigPath)).digest('hex')}`;

after(() => fs.rmSync(npcT1ConfigDirectory, { recursive: true, force: true }));

const IMAGE_SYNC_OPTIONS = Object.freeze({
  itemImagePromotionBundlePath: 'reports/audit/item-image-source-promotion-abc.bundle.json',
  managedObjectOrigin: 'http://127.0.0.1:19100',
});

const GOVERNED_L1_OPERATION_CASES = Object.freeze([
  { domainId: 'items', operationId: 'automation-items-l1' },
  { domainId: 'npcs', operationId: 'automation-npcs-l1' },
  { domainId: 'projectiles', operationId: 'automation-projectiles-l1' },
  { domainId: 'armor_sets', operationId: 'automation-armor-sets-l1' },
  { domainId: 'buffs', operationId: 'automation-buffs-l1' },
  { domainId: 'audio', operationId: 'automation-audio-first-l1' },
  { domainId: 'bosses', operationId: 'automation-bosses-first-l1' },
  { domainId: 'shimmer', operationId: 'automation-shimmer-first-l1' },
]);

function governedL1ManifestOptions(operationId) {
  const entry = GOVERNED_L1_OPERATION_CASES.find((candidate) => candidate.operationId === operationId);
  if (!entry) return {};
  const runId = `${entry.domainId}_l1_manifest_20260829`;
  return {
    l1RunRoot: `reports/authorization/canonical/l1-runs/${entry.domainId}/${runId}`,
  };
}

function manifestOptions(operationId) {
  const governed = governedL1ManifestOptions(operationId);
  if (governed.l1RunRoot) return governed;
  if (['canonical-npc-t1-acceptance', 'canonical-recipe-t1-acceptance', 'canonical-boss-t1-acceptance', 'canonical-projectile-t1-acceptance', 'canonical-buff-t1-acceptance', 'canonical-biome-t1-acceptance', 'canonical-crawler-v2-scheduler-t1-acceptance', 'canonical-crawler-v2-items-t1-acceptance'].includes(operationId)) {
    return {
      npcT1ConfigPath,
      npcT1RedisDb: 9,
      npcT1RunId: 'npc-t1-20260730-01',
    };
  }
  if (operationId === 'canonical-item-image-projection-missing-row-insert') {
    return {
      itemImageProjectionMissingRowInsertAttemptRoot:
        `reports/authorization/canonical/item-image-projection-missing-row-insert/${'b'.repeat(64)}`,
    };
  }
  if (operationId === 'canonical-item-base-entity-restoration') {
    return {
      itemCanonicalBaseEntityRestorationAttemptRoot:
        `reports/authorization/canonical/item-canonical-base-entity-restoration/${'c'.repeat(64)}`,
    };
  }
  if (operationId === 'canonical-npc-t2-cutover-verification') {
    return {
      backendApiBase: 'http://127.0.0.1:18191',
      npcT2AttemptRoot:
        `reports/authorization/canonical/canonical-npc-t2-cutover-verification/${'d'.repeat(64)}`,
    };
  }
  return operationId === 'canonical-image-sync' ? { ...IMAGE_SYNC_OPTIONS } : {};
}

test('base-domain policy bootstrap and promotion operations are governed entrypoints', () => {
  for (const domainId of ['items', 'projectiles']) {
    const bootstrap = `automation-${domainId}-l0-bootstrap`;
    const promotion = `automation-${domainId}-l1-policy-promotion`;
    assert.ok(CANONICAL_CUTOVER_OPERATION_IDS.includes(bootstrap));
    assert.ok(CANONICAL_CUTOVER_OPERATION_IDS.includes(promotion));
    assert.equal(CANONICAL_OPERATION_ENTRYPOINTS[bootstrap], 'pipelines/automation/bootstrap-automation-policy.mjs');
    assert.equal(CANONICAL_OPERATION_ENTRYPOINTS[promotion], 'pipelines/automation/run-automation-policy-decision.mjs');
    assert.deepEqual(CANONICAL_OPERATION_DATA_PATHS[bootstrap], [
      `reports/authorization/canonical/${bootstrap}.input.json`,
    ]);
    assert.deepEqual(CANONICAL_OPERATION_DATA_PATHS[promotion], [
      `reports/authorization/canonical/${promotion}.input.json`,
    ]);
  }
});

test('governed exact manual L1 operations bind a dynamic run root', () => {
  for (const { domainId, operationId } of GOVERNED_L1_OPERATION_CASES) {
    const runId = `${domainId}_l1_20260829_run01`;
    const l1RunRoot = `reports/authorization/canonical/l1-runs/${domainId}/${runId}`;
    assert.ok(CANONICAL_CUTOVER_OPERATION_IDS.includes(operationId), operationId);
    assert.equal(
      CANONICAL_OPERATION_ENTRYPOINTS[operationId],
      'pipelines/automation/run-governed-l1-operation.mjs',
    );
    assert.deepEqual(CANONICAL_OPERATION_DATA_PATHS[operationId], []);

    const manifest = buildCanonicalOperationExecutionManifest({
      repoRoot,
      operationId,
      artifactDate: '2026-08-29',
      l1RunRoot,
    });
    assert.equal(manifest.executionClass, 'formal_automation_l1_apply');
    assert.equal(manifest.l1RunRoot, l1RunRoot);
    assert.deepEqual(manifest.command, [
      'node',
      'pipelines/automation/run-governed-l1-operation.mjs',
      `--domain=${domainId}`,
      `--run-id=${runId}`,
      '--source-mode=local',
      '--full-reconciliation=false',
      `--repo-root=${repoRoot}`,
    ]);
    assert.deepEqual(manifest.inputPaths, [`${l1RunRoot}/authorization-context.json`]);
    assert.deepEqual(manifest.outputPaths, [`${l1RunRoot}/result.json`]);
    assert.deepEqual(manifest.progressPaths, [`${l1RunRoot}/progress.json`]);
    assert.equal(manifest.databaseWrites, true);
    assert.equal(manifest.networkAccess, false);

    const alternateRoot = `reports/authorization/canonical/l1-runs/${domainId}/${domainId}_l1_20260829_run02`;
    const alternate = buildCanonicalOperationExecutionManifest({
      repoRoot,
      operationId,
      artifactDate: '2026-08-29',
      l1RunRoot: alternateRoot,
    });
    assert.notEqual(alternate.l1RunRoot, manifest.l1RunRoot);
    assert.notDeepEqual(alternate.outputPaths, manifest.outputPaths);
    assert.doesNotThrow(() => assertCanonicalOperationExecutionManifestContract({
      repoRoot,
      operationId,
      manifest,
    }));
  }
});

test('governed exact manual L1 manifests reject fixed or mismatched run roots', () => {
  for (const [operationId, l1RunRoot] of [
    ['automation-items-l1', 'reports/authorization/canonical/automation-items-l1.bundle.json'],
    ['automation-items-l1', 'reports/authorization/canonical/l1-runs/projectiles/items_l1_20260829_run01'],
    ['automation-items-l1', 'reports/authorization/canonical/l1-runs/items/items_l1_bad'],
  ]) {
    assert.throws(() => buildCanonicalOperationExecutionManifest({
      repoRoot,
      operationId,
      artifactDate: '2026-08-29',
      l1RunRoot,
    }), /L1 run root|run root|runId|domain/i);
  }
});

test('scheduler reactivation uses a distinct frozen policy input', () => {
  const operationId = 'automation-crawler-v2-scheduler-reactivation';
  assert.ok(CANONICAL_CUTOVER_OPERATION_IDS.includes(operationId));
  assert.equal(CANONICAL_OPERATION_ENTRYPOINTS[operationId], 'pipelines/automation/run-automation-policy-decision.mjs');
  assert.deepEqual(CANONICAL_OPERATION_DATA_PATHS[operationId], [
    'reports/authorization/canonical/automation-crawler-v2-scheduler-reactivation.input.json',
  ]);
});

test('narrow image provenance and Buff projection operations have independent governed manifests', () => {
  const cases = [
    ['canonical-item-image-provenance-patch', 'pipelines/relation/item-image-provenance-patch.mjs'],
    ['canonical-buff-image-projection-patch', 'pipelines/relation/buff-image-projection-patch.mjs'],
    ['canonical-two-item-image-quarantine-repair', 'pipelines/relation/two-item-image-quarantine-repair.mjs'],
  ];
  for (const [operationId, entrypoint] of cases) {
    assert.ok(CANONICAL_CUTOVER_OPERATION_IDS.includes(operationId));
    assert.equal(CANONICAL_OPERATION_ENTRYPOINTS[operationId], entrypoint);
    assert.deepEqual(CANONICAL_OPERATION_DATA_PATHS[operationId], operationId === 'canonical-two-item-image-quarantine-repair'
      ? [
          'reports/authorization/canonical/canonical-two-item-image-quarantine-repair.input.json',
          'reports/runtime/local-data-chain-closure/20260821/remaining-image-repair/two-item-quarantine-repair.preview.json',
        ]
      : [
          `reports/authorization/canonical/${operationId}.input.json`,
          `reports/runtime/local-data-chain-closure/20260820/image-provenance-closure/${operationId}.preview.json`,
        ]);
    const manifest = buildCanonicalOperationExecutionManifest({ repoRoot, operationId });
    assert.equal(manifest.databaseWrites, true);
    assert.equal(manifest.networkAccess, false);
    assert.deepEqual(manifest.ownershipKeys, operationId === 'canonical-item-image-provenance-patch'
      ? [
        'maint.maint_item_images.source_page',
        'maint.maint_item_images.source_revision_timestamp',
        'maint.maint_item_images.original_url',
        'relation.relation_item_images.source_page',
        'relation.relation_item_images.source_revision_timestamp',
        'relation.relation_item_images.original_url',
        'local.item_images.source_page',
        'local.item_images.source_revision_timestamp',
        'local.item_images.original_url',
      ]
      : operationId === 'canonical-buff-image-projection-patch'
        ? ['relation.projection_buffs.image']
        : [
          'maint.maint_item_images.source_file_title',
          'maint.maint_item_images.source_page',
          'maint.maint_item_images.source_revision_timestamp',
          'maint.maint_item_images.original_url',
          'maint.maint_item_images.cached_url',
          'relation.relation_item_images.source_file_title',
          'relation.relation_item_images.source_page',
          'relation.relation_item_images.source_revision_timestamp',
          'relation.relation_item_images.original_url',
          'relation.relation_item_images.cached_url',
          'local.item_images.source_file_title',
          'local.item_images.source_page',
          'local.item_images.source_revision_timestamp',
          'local.item_images.original_url',
      'local.item_images.cached_url',
      'relation.projection_items.image',
      'local.items.image',
    ]);
  }
});

test('NPC Buff relation recovery is one Buff-owned exact governed operation', () => {
  const operationId = 'canonical-npc-buff-relation-recovery';
  assert.ok(CANONICAL_CUTOVER_OPERATION_IDS.includes(operationId));
  assert.equal(
    CANONICAL_OPERATION_ENTRYPOINTS[operationId],
    'pipelines/relation/npc-buff-relation-recovery.mjs',
  );
  assert.deepEqual(CANONICAL_OPERATION_DATA_PATHS[operationId], [
    'reports/authorization/canonical/canonical-npc-buff-relation-recovery.retry-02.input.json',
    'reports/runtime/local-data-chain-closure/20260824/ten-blocker-closure/072100/npc-buff-relation-recovery.proposal.json',
  ]);
  const manifest = buildCanonicalOperationExecutionManifest({ repoRoot, operationId });
  assert.equal(manifest.databaseWrites, true);
  assert.equal(manifest.networkAccess, false);
  assert.deepEqual(manifest.ownershipKeys, ['relation.npc_buff_relations.buffs']);
  assert.deepEqual(manifest.command, [
    'node',
    'pipelines/relation/npc-buff-relation-recovery.mjs',
    '--apply=true',
  ]);
  assert.deepEqual(manifest.outputPaths, [
    'reports/authorization/canonical/canonical-npc-buff-relation-recovery.retry-02.result.json',
  ]);
});

test('image-origin and Armor restoration lanes are separate governed operations', () => {
  const cases = [
    {
      operationId: 'canonical-item-image-origin-normalization',
      entrypoint: 'pipelines/relation/projection-image-origin-normalization.mjs',
      proposal: 'item-image-origin-normalization.proposal.json',
      ownership: [
        'relation.relation_item_images.cached_url',
        'relation.projection_items.image',
      ],
    },
    {
      operationId: 'canonical-npc-image-origin-normalization',
      entrypoint: 'pipelines/relation/projection-image-origin-normalization.mjs',
      proposal: 'npc-image-origin-normalization.proposal.json',
      ownership: ['relation.projection_npcs.image_url'],
    },
    {
      operationId: 'canonical-projectile-image-origin-normalization',
      entrypoint: 'pipelines/relation/projection-image-origin-normalization.mjs',
      proposal: 'projectile-image-origin-normalization.proposal.json',
      ownership: ['relation.projection_projectiles.image_url'],
    },
    {
      operationId: 'canonical-biome-image-origin-normalization',
      entrypoint: 'pipelines/relation/projection-image-origin-normalization.mjs',
      proposal: 'biome-image-origin-normalization.proposal.json',
      ownership: ['relation.projection_biomes.icon_url'],
    },
    {
      operationId: 'canonical-armor-set-projection-restoration',
      entrypoint: 'pipelines/relation/armor-set-projection-restoration.mjs',
      proposal: 'armor-set-projection-restoration.retry-02.proposal.json',
      ownership: ['relation.projection_armor_sets.insert'],
    },
  ];
  for (const { operationId, entrypoint, proposal, ownership } of cases) {
    assert.ok(CANONICAL_CUTOVER_OPERATION_IDS.includes(operationId));
    assert.equal(CANONICAL_OPERATION_ENTRYPOINTS[operationId], entrypoint);
    const attempt = operationId === 'canonical-armor-set-projection-restoration' ? 'retry-05' : 'retry-01';
    assert.deepEqual(CANONICAL_OPERATION_DATA_PATHS[operationId], [
      `reports/authorization/canonical/${operationId}.${attempt}.input.json`,
      `reports/runtime/local-data-chain-closure/20260824/ten-blocker-closure/072100/${proposal}`,
    ]);
    const manifest = buildCanonicalOperationExecutionManifest({ repoRoot, operationId });
    assert.equal(manifest.databaseWrites, true);
    assert.equal(manifest.networkAccess, false);
    assert.deepEqual(manifest.ownershipKeys, ownership);
    assert.ok(manifest.command.includes(`--operation-id=${operationId}`));
    assert.ok(manifest.command.includes('--apply=true'));
    assert.deepEqual(manifest.outputPaths, [
      `reports/authorization/canonical/${operationId}.${attempt}.result.json`,
    ]);
  }
});

test('manifest builder covers governed operations and keeps NPC apply explicitly fail closed', () => {
  const shimmerFixture = createShimmerManifestFixture();
  assert.equal(CANONICAL_CUTOVER_OPERATION_IDS.length, 111);
  assert.equal(CANONICAL_EXECUTABLE_OPERATION_IDS.length, 109);
  assert.equal(CANONICAL_OPERATION_ENTRYPOINTS['canonical-npc-apply'], null);
  assert.equal(CANONICAL_OPERATION_ENTRYPOINTS['automation-l1-historical-source-hash-disposition'], null);
  assert.deepEqual(
    Object.entries(CANONICAL_OPERATION_ENTRYPOINTS)
      .filter(([, entrypoint]) => entrypoint === null)
      .map(([operationId]) => operationId),
    ['canonical-npc-apply', 'automation-l1-historical-source-hash-disposition'],
  );
  assert.deepEqual(
    CANONICAL_EXECUTABLE_OPERATION_IDS,
    CANONICAL_CUTOVER_OPERATION_IDS.filter((operationId) => (
      CANONICAL_OPERATION_ENTRYPOINTS[operationId] !== null
    )),
  );

  try {
    for (const operationId of CANONICAL_EXECUTABLE_OPERATION_IDS) {
      if (operationId === 'canonical-item-image-projection-apply'
          || operationId === 'canonical-item-source-local-npc-admission') continue;
      const operationRepoRoot = operationId === 'canonical-shimmer-import'
        ? shimmerFixture.repoRoot
        : repoRoot;
      const manifest = buildCanonicalOperationExecutionManifest({
        repoRoot: operationRepoRoot,
        operationId,
        artifactDate: '2026-07-28',
        npcLimit: 25,
        ...(operationId === 'canonical-image-sync' || operationId === 'canonical-boss-import'
          ? { backendApiBase: 'http://127.0.0.1:18191/api' }
          : {}),
        ...manifestOptions(operationId),
      });
      assert.equal(manifest.schemaVersion, 1);
      assert.equal(manifest.operationId, operationId);
      assert.equal(manifest.command[0], 'node');
      assert.equal(manifest.command[1], CANONICAL_OPERATION_ENTRYPOINTS[operationId]);
      assert.ok(manifest.codeBundleEntries.length >= 2, operationId);
      assert.ok(manifest.codeBundleEntries.some((entry) => entry.path === manifest.command[1]));
      assert.ok(manifest.codeBundleEntries.some((entry) => (
        entry.path === 'pipelines/automation/run-authorized-canonical-operation.mjs'
      )), `${operationId}: authorized runner`);
      for (const entry of manifest.codeBundleEntries) {
        const bytes = fs.readFileSync(path.join(operationRepoRoot, entry.path));
        const expected = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
        assert.equal(entry.contentHash, expected, `${operationId}:${entry.path}`);
      }
    }
  } finally {
    shimmerFixture.cleanup();
  }
});

test('NPC T2 manifest binds one no-write attempt and the exact formal evidence', () => {
  const attemptRoot = `reports/authorization/canonical/canonical-npc-t2-cutover-verification/${'d'.repeat(64)}`;
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-npc-t2-cutover-verification',
    artifactDate: '2026-08-06',
    backendApiBase: 'http://127.0.0.1:18191',
    npcT2AttemptRoot: attemptRoot,
  });

  assert.equal(manifest.noWrite, true);
  assert.equal(manifest.databaseWrites, false);
  assert.equal(manifest.networkAccess, false);
  assert.deepEqual(manifest.databases, {
    local: 'terria_v1_local',
    maint: 'terria_v1_maint',
    relation: 'terria_v1_relation',
  });
  assert.deepEqual(manifest.inputPaths, [
    'reports/authorization/canonical/canonical-npc-apply.input.json',
    'reports/authorization/canonical/canonical-npc-apply.completion.json',
    'reports/authorization/canonical/canonical-npc-base-maint.completion.json',
    'reports/canonical-migration/canonical-npc-t1-acceptance.json',
  ]);
  assert.deepEqual(manifest.outputPaths, [
    `${attemptRoot}/result.json`,
    'reports/canonical-migration/canonical-npc-crawler-facts-readiness.json',
  ]);
  assert.ok(manifest.command.includes('--no-write=true'));
  assert.ok(manifest.command.includes('--apiBase=http://127.0.0.1:18191'));
  assert.ok(manifest.command.includes(`--output=${attemptRoot}/result.json`));
});

test('Item-source local NPC admission manifest binds its exact decision-derived transaction attempt', () => {
  const decisionIdentity = 'owner-item-source-local-npc-manifest-test-01';
  const paths = buildItemSourceLocalNpcAdmissionAttemptPaths(decisionIdentity);
  const proposal = itemSourceAdmissionProposal();
  const proposalBytes = Buffer.from(`${JSON.stringify(proposal)}\n`);
  const proposalPath = paths.proposalPath;
  const input = buildItemSourceLocalNpcAdmissionInputContract({
    proposal,
    proposalPath,
    proposalSha256: `sha256:${createHash('sha256').update(proposalBytes).digest('hex')}`,
    decisionIdentity,
  });
  const attemptDirectory = path.join(repoRoot, paths.attemptRoot);
  fs.mkdirSync(attemptDirectory, { recursive: true });
  fs.writeFileSync(path.join(repoRoot, proposalPath), proposalBytes, { mode: 0o600 });
  fs.writeFileSync(path.join(repoRoot, paths.inputPath), `${JSON.stringify(input)}\n`, { mode: 0o600 });
  try {
    const manifest = buildCanonicalOperationExecutionManifest({
      repoRoot,
      operationId: 'canonical-item-source-local-npc-admission',
      artifactDate: '2026-08-25',
      itemSourceLocalNpcAdmissionAttemptRoot: paths.attemptRoot,
    });

    assert.equal(manifest.databaseWrites, true);
    assert.equal(manifest.networkAccess, false);
    assert.deepEqual(manifest.inputPaths, [paths.inputPath]);
    assert.deepEqual(manifest.outputPaths, [paths.resultPath]);
    assert.deepEqual(manifest.command, [
      'node',
      'pipelines/relation/apply-item-source-local-npc-admission.mjs',
      `--input-contract=${paths.inputPath}`,
      '--apply=true',
      `--output=${paths.resultPath}`,
    ]);
    assert.deepEqual(manifest.itemSourceLocalNpcAdmissionAttempt, paths);
    assert.deepEqual(manifest.ownershipKeys, [
      'local.source_dataset_landings.item_source_npc_admission_insert',
      'maint.maint_npc_crawler_facts.item_source_npc_admission_insert',
      'relation.item_source_facts.item_source_npc_admission_insert',
      'relation.item_source_details.item_source_npc_admission_insert',
      'relation.item_npc_shop_relations.item_source_npc_admission_insert',
      'relation.item_npc_loot_relations.item_source_npc_admission_insert',
      'local.item_acquisition_sources.item_source_npc_admission_reconciliation',
    ]);
  } finally {
    fs.rmSync(attemptDirectory, { recursive: true, force: true });
  }
});

test('image sync manifest freezes the local reuse evidence bundle and managed origin', () => {
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot: process.cwd(),
    operationId: 'canonical-image-sync',
    artifactDate: '2026-08-01',
    backendApiBase: 'http://127.0.0.1:18191',
    itemImagePromotionBundlePath: 'reports/audit/item-image-source-promotion-abc.bundle.json',
    managedObjectOrigin: 'http://127.0.0.1:19100',
  });

  assert.ok(manifest.command.includes(
    '--local-evidence=reports/audit/item-image-source-promotion-abc.bundle.json'
  ));
  assert.ok(manifest.command.includes('--managed-object-origin=http://127.0.0.1:19100'));
  assert.ok(manifest.inputPaths.includes('reports/audit/item-image-source-promotion-abc.bundle.json'));
  // The frozen evidence path is content addressed, never a mutable pointer.
  assert.ok(manifest.command.every((token) => !String(token).includes('latest')));
});

test('image sync manifest freezes the legacy-origin probe-only repair boundary', () => {
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot: process.cwd(),
    operationId: 'canonical-image-sync',
    artifactDate: '2026-08-04',
    backendApiBase: 'http://127.0.0.1:18188/api',
    itemImagePromotionBundlePath: 'reports/audit/item-image-source-promotion-abc.bundle.json',
    managedObjectOrigin: 'http://127.0.0.1:19100',
    legacyOriginRepair: true,
    legacyOrigin: 'http://localhost:9000',
    expectedLegacyCount: 331,
  });

  assert.ok(manifest.command.includes('--legacy-origin-repair=true'));
  assert.ok(manifest.command.includes('--legacy-origin=http://localhost:9000'));
  assert.ok(manifest.command.includes('--expected-legacy-count=331'));
  assert.equal(manifest.databaseWrites, false);
  assert.equal(manifest.networkAccess, true);
});

test('image sync manifest refuses a missing local reuse evidence bundle', () => {
  assert.throws(
    () => buildCanonicalOperationExecutionManifest({
      repoRoot: process.cwd(),
      operationId: 'canonical-image-sync',
      artifactDate: '2026-08-01',
      backendApiBase: 'http://127.0.0.1:18191',
      managedObjectOrigin: 'http://127.0.0.1:19100',
    }),
    /itemImagePromotionBundlePath is required/i
  );
});

test('image sync manifest binds the item image promotion result as an input', () => {
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot: process.cwd(),
    operationId: 'canonical-image-sync',
    artifactDate: '2026-08-01',
    backendApiBase: 'http://127.0.0.1:18191',
    ...IMAGE_SYNC_OPTIONS,
  });

  assert.deepEqual(manifest.inputPaths, [
    'data/standardized/items.standardized.json',
    'reports/authorization/canonical/canonical-item-image-source-promotion.result.json',
    'reports/audit/item-image-source-promotion-abc.bundle.json',
  ]);
  assert.deepEqual(CANONICAL_OPERATION_DATA_PATHS['canonical-image-sync'], [
    'data/standardized/items.standardized.json',
    'reports/authorization/canonical/canonical-item-image-source-promotion.result.json',
  ]);
});

test('item image promotion manifest binds the content-addressed bundle contract', () => {
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot: process.cwd(),
    operationId: 'canonical-item-image-source-promotion',
    artifactDate: '2026-08-01',
  });

  assert.deepEqual(manifest.command, [
    'node',
    'pipelines/transform/promote-item-image-sources.mjs',
    '--input-contract=reports/authorization/canonical/canonical-item-image-source-promotion.input.json',
    '--apply=true',
  ]);
  assert.deepEqual(manifest.inputPaths, [
    'reports/authorization/canonical/canonical-item-image-source-promotion.input.json',
  ]);
  assert.deepEqual(manifest.outputPaths, [
    'data/standardized/items.standardized.json',
    'reports/authorization/canonical/canonical-item-image-source-promotion.result.json',
  ]);
  assert.equal(manifest.databaseWrites, false);
  assert.equal(manifest.networkAccess, false);
  // The command must never name a mutable latest pointer; the bundle reaches it
  // only through the hash-bound contract.
  assert.ok(manifest.command.every((token) => !String(token).includes('latest')));
  assert.ok(manifest.codeBundleEntries.some((entry) => (
    entry.path === 'pipelines/transform/promote-item-image-sources.mjs'
  )));
});

test('item image verification manifest binds the frozen backend child and request cap', () => {
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-item-image-source-verification',
    artifactDate: '2026-07-31',
  });

  assert.deepEqual(manifest.command, [
    'node',
    'pipelines/workflow/run-backend-data-refresh.mjs',
    '--mode=apply',
    '--steps=item-image-source-verification',
    '--output=reports/backend-refresh/history/canonical-item-image-source-verification.json',
  ]);
  assert.deepEqual(manifest.inputPaths, [
    'reports/authorization/canonical/canonical-item-image-source-verification.input.json',
  ]);
  assert.deepEqual(manifest.reportPaths, [
    'reports/audit/item-image-source-verification.round-04-2026-08-01.json',
    'reports/backend-refresh/history/canonical-item-image-source-verification.json',
  ]);
  assert.deepEqual(manifest.progressPaths, [
    'reports/backend-refresh/history/canonical-item-image-source-verification.runtime/item-image-source-verification.child-status.json',
  ]);
  assert.deepEqual(manifest.bounds, {
    unresolvedIdentityCount: 9,
    batchSize: 8,
    maxRequests: 9,
    serial: true,
  });
  assert.equal(manifest.databaseWrites, false);
  assert.equal(manifest.networkAccess, true);
  assert.ok(manifest.codeBundleEntries.some((entry) => (
    entry.path === 'pipelines/fetch/fetch-item-image-source-verification.mjs'
  )));
});

test('shimmer generation manifest binds the frozen source contract, data inputs, monitor progress, and request cap', () => {
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-shimmer-generation',
    artifactDate: '2026-08-01',
  });

  assert.deepEqual(manifest.command, [
    'node',
    'pipelines/pipeline/run-wiki-shimmer-extraction-pipeline.mjs',
    '--input-contract=reports/authorization/canonical/canonical-shimmer-generation.input.json',
    '--page=Shimmer',
    '--api=https://terraria.wiki.gg/zh/api.php',
    '--progress-path=data/generated/domain-source-shimmer-progress.latest.json',
    '--report-output=reports/wiki-shimmer-generation-2026-08-01.md',
  ]);
  assert.equal(manifest.actionId, 'domain-source-shimmer');
  assert.deepEqual(manifest.inputPaths, [
    'reports/authorization/canonical/canonical-shimmer-generation.input.json',
    'data/standardized/items.standardized.json',
    'data/standardized/npcs.standardized.json',
  ]);
  assert.deepEqual(manifest.outputPaths, [
    'data/generated/shimmer/wiki-shimmer-current-generation.json',
  ]);
  assert.deepEqual(manifest.reportPaths, ['reports/wiki-shimmer-generation-2026-08-01.md']);
  assert.deepEqual(manifest.progressPaths, [
    'data/generated/domain-source-shimmer-progress.latest.json',
  ]);
  assert.deepEqual(manifest.sources, ['https://terraria.wiki.gg/zh/api.php']);
  assert.deepEqual(manifest.bounds, {
    pageTitle: 'Shimmer',
    rawRequests: 3,
    langlinkBatchSize: 8,
    maxLanglinkRequests: 128,
    maxRequests: 131,
    serial: true,
  });
  assert.equal(manifest.databaseWrites, false);
  assert.equal(manifest.networkAccess, true);
  const codePaths = new Set(manifest.codeBundleEntries.map((entry) => entry.path));
  for (const expectedPath of [
    'pipelines/pipeline/run-wiki-shimmer-extraction-pipeline.mjs',
    'pipelines/fetch/fetch-wiki-shimmer-page.mjs',
    'pipelines/fetch/fetch-wiki-shimmer-langlinks.mjs',
    'pipelines/transform/shimmer-generation-builder.mjs',
    'pipelines/maint/shimmer-structured-parser.mjs',
    'pipelines/transform/shimmer-generation-contract.mjs',
    'pipelines/workflow/backend-refresh-runtime-state.mjs',
    'pipelines/automation/authorized-operation-context.mjs',
    'pipelines/automation/build-canonical-cutover-authorization.mjs',
  ]) {
    assert.ok(codePaths.has(expectedPath), expectedPath);
  }
});

test('shimmer import manifest passes only the private exact input contract to the importer', () => {
  const fixture = createShimmerManifestFixture();

  try {
    const manifest = buildCanonicalOperationExecutionManifest({
      repoRoot: fixture.repoRoot,
      operationId: 'canonical-shimmer-import',
      artifactDate: '2026-08-03',
    });

    assert.deepEqual(manifest.command, [
      'node',
      'pipelines/import/import-wiki-shimmer-to-db.mjs',
      '--input-contract=reports/authorization/canonical/canonical-shimmer-import.input.json',
      '--apply=true',
      '--output=reports/authorization/canonical/canonical-shimmer-import.result.json',
      '--database=terria_v1_local',
    ]);
    assert.deepEqual(manifest.inputPaths, [
      'reports/authorization/canonical/canonical-shimmer-import.input.json',
    ]);
    assert.deepEqual(manifest.outputPaths, [
      'reports/authorization/canonical/canonical-shimmer-import.result.json',
    ]);
    assert.deepEqual(manifest.reportPaths, []);
    assert.equal(manifest.databaseWrites, true);
    assert.equal(manifest.networkAccess, false);
    assert.deepEqual(manifest.shimmerImport, fixture.binding);
    assert.ok(manifest.command.every((token) => !String(token).includes('latest')));
    assert.ok(manifest.command.every((token) => !String(token).startsWith('--raw=')));
    assert.ok(manifest.command.every((token) => !String(token).startsWith('--input=')));

    assert.doesNotThrow(() => assertCanonicalOperationExecutionManifestContract({
      repoRoot: fixture.repoRoot,
      operationId: 'canonical-shimmer-import',
      manifest,
    }));
    assert.throws(() => assertCanonicalOperationExecutionManifestContract({
      repoRoot: fixture.repoRoot,
      operationId: 'canonical-shimmer-import',
      manifest: {
        ...manifest,
        shimmerImport: {
          ...manifest.shimmerImport,
          previewSha256: `sha256:${'f'.repeat(64)}`,
        },
      },
    }), /contract drifted/i);

    const codePaths = new Set(manifest.codeBundleEntries.map((entry) => entry.path));
    for (const expectedPath of [
      'pipelines/import/import-wiki-shimmer-to-db.mjs',
      'pipelines/automation/canonical-shimmer-import-input-contract.mjs',
      'pipelines/automation/authorized-operation-context.mjs',
      'pipelines/automation/build-canonical-cutover-authorization.mjs',
      'pipelines/transform/shimmer-generation-contract.mjs',
      'pipelines/transform/shimmer-generation-builder.mjs',
      'pipelines/maint/shimmer-structured-parser.mjs',
    ]) {
      assert.ok(codePaths.has(expectedPath), expectedPath);
    }
  } finally {
    fixture.cleanup();
  }
});

function createShimmerManifestFixture() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-shimmer-manifest-'));
  const sourceScripts = path.join(repoRoot, 'scripts');
  fs.symlinkSync(sourceScripts, path.join(fixtureRoot, 'scripts'), 'dir');
  fs.symlinkSync(path.join(repoRoot, 'pipelines'), path.join(fixtureRoot, 'pipelines'), 'dir');
  const publication = publishShimmerGeneration({
    rawBytes: Buffer.from(JSON.stringify({ pageTitle: 'Shimmer', html: '<table></table>' })),
    shards: {
      context: { entity: 'wiki_shimmer_context_importable', records: [{ code: 'SHIMMER' }] },
      itemTransforms: { entity: 'wiki_shimmer_item_transforms_importable', records: [] },
      decraftRules: { entity: 'wiki_shimmer_decraft_rules_importable', records: [] },
      entityTransforms: { entity: 'wiki_shimmer_entity_transforms_importable', records: [] },
      npcTransforms: { entity: 'wiki_shimmer_npc_transforms_importable', records: [] },
      titleResolution: { entity: 'wiki_shimmer_title_resolution', records: [] },
    },
    standardizedInputs: {
      items: { path: 'data/standardized/items.standardized.json', sha256: `sha256:${'a'.repeat(64)}` },
      npcs: { path: 'data/standardized/npcs.standardized.json', sha256: `sha256:${'b'.repeat(64)}` },
    },
    langlinkEvidenceBytes: Buffer.from(JSON.stringify({ records: [] })),
    producerCodeSha256: `sha256:${'c'.repeat(64)}`,
    tableRoleVersion: 'shimmer-table-roles/1',
    generatedAt: '2026-08-04T00:00:00.000Z',
    generationRoot: path.join(fixtureRoot, 'data/generated/shimmer/generations'),
    pointerPath: path.join(fixtureRoot, 'data/generated/shimmer/wiki-shimmer-current-generation.json'),
    runId: 'manifest-test',
  });
  const inputContract = writeCanonicalShimmerImportInputContract({
    repoRoot: fixtureRoot,
    inputContract: {
      schemaVersion: 1,
      operationId: 'canonical-shimmer-import',
      generationId: publication.manifest.generationId,
      manifestPath: path.relative(fixtureRoot, publication.manifestPath).replaceAll('\\', '/'),
      manifestSha256: publication.manifest.manifestSha256,
      dataBundleSha256: publication.manifest.dataBundleSha256,
      previewSha256: `sha256:${'d'.repeat(64)}`,
      targetFingerprintSha256: `sha256:${'e'.repeat(64)}`,
      providerScope: {
        provider: SHIMMER_IMPORT_PROVIDER_SCOPE.provider,
        sourcePage: SHIMMER_IMPORT_PROVIDER_SCOPE.sourcePage,
        tables: [...SHIMMER_IMPORT_PROVIDER_SCOPE.tables],
      },
    },
  });
  return {
    binding: shimmerImportBindingFromInputContract(inputContract.contract),
    cleanup: () => fs.rmSync(fixtureRoot, { recursive: true, force: true }),
    repoRoot: fixtureRoot,
  };
}

test('NPC item relation lineage repair manifest binds historical predecessors and a distinct result', () => {
  const operationId = 'canonical-npc-item-relation-lineage-repair';
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId,
    artifactDate: '2026-07-30',
  });

  assert.deepEqual(manifest.command, [
    'node', 'pipelines/npc-canonical/npc-owner-phase-apply.mjs',
    `--operation-id=${operationId}`,
    '--input=reports/authorization/canonical/canonical-npc-apply.input.json',
    `--output=reports/authorization/canonical/${operationId}.result.json`,
    '--apply=true',
  ]);
  assert.deepEqual(manifest.inputPaths, [
    'reports/authorization/canonical/canonical-npc-apply.input.json',
    'reports/authorization/canonical/canonical-npc-landing-apply.result.json',
    'reports/authorization/canonical/canonical-npc-facts-maint-apply.result.json',
    'reports/authorization/canonical/canonical-npc-item-relations-apply.result.json',
  ]);
  assert.deepEqual(manifest.outputPaths, [
    `reports/authorization/canonical/${operationId}.result.json`,
  ]);
  assert.deepEqual(manifest.ownershipKeys, [
    'relation.item_source_facts.items',
    'relation.item_source_details.items',
  ]);
  assert.deepEqual(manifest.requiredOperationIds, [
    'canonical-npc-landing-apply',
    'canonical-npc-facts-maint-apply',
    'canonical-npc-item-relations-apply',
  ]);
  assert.equal(manifest.executionClass, 'formal_npc_relation_lineage_repair');
  assert.equal(manifest.databaseWrites, true);
  assert.equal(manifest.networkAccess, false);
});

test('NPC owner retry manifest binds a validated distinct result label', () => {
  const operationId = 'canonical-npc-nonboss-loot-projection-apply';
  const resultLabel = 'owner-scope-repair-20260730-01';
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId,
    artifactDate: '2026-07-30',
    resultLabel,
  });
  const resultPath = `reports/authorization/canonical/${operationId}.${resultLabel}.result.json`;

  assert.equal(manifest.resultLabel, resultLabel);
  assert.ok(manifest.command.includes(`--output=${resultPath}`));
  assert.deepEqual(manifest.outputPaths, [resultPath]);
  assert.throws(() => buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId,
    artifactDate: '2026-07-30',
    resultLabel: '../replacement',
  }), /result label/i);
  assert.throws(() => buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-boss-loot-import',
    artifactDate: '2026-07-30',
    resultLabel,
  }), /NPC owner operation/i);
});

test('NPC base maint manifests bind exact source, landing result, owner partition, and no network access', () => {
  const expected = {
    'canonical-npc-base-maint-nontown-apply': 'maint.maint_npcs.npcs',
    'canonical-npc-base-maint-town-apply': 'maint.maint_npcs.town',
  };
  for (const [operationId, ownershipKey] of Object.entries(expected)) {
    const manifest = buildCanonicalOperationExecutionManifest({
      repoRoot,
      operationId,
      artifactDate: '2026-07-30',
    });
    assert.deepEqual(manifest.command, [
      'node', 'pipelines/npc-canonical/npc-base-maint-apply.mjs',
      `--operation-id=${operationId}`,
      '--input=reports/authorization/canonical/canonical-npc-apply.input.json',
      `--output=reports/authorization/canonical/${operationId}.result.json`,
      '--apply=true',
    ]);
    assert.deepEqual(manifest.inputPaths, [
      'reports/authorization/canonical/canonical-npc-apply.input.json',
      'reports/authorization/canonical/canonical-npc-landing-apply.result.json',
      'data/standardized/npcs.standardized.json',
    ]);
    assert.deepEqual(manifest.ownershipKeys, [ownershipKey]);
    assert.deepEqual(manifest.requiredOperationIds, ['canonical-npc-landing-apply']);
    assert.equal(manifest.databaseWrites, true);
    assert.equal(manifest.networkAccess, false);
    assert.ok(manifest.codeBundleEntries.some((entry) => (
      entry.path === 'pipelines/npc-canonical/npc-base-maint-apply.mjs'
    )));
    assert.ok(manifest.codeBundleEntries.some((entry) => (
      entry.path === 'pipelines/maint/sync-landing-to-maint.mjs'
    )));
  }
});

test('NPC T1 manifest freezes the private config identity and isolated-resource boundary', () => {
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-npc-t1-acceptance',
    artifactDate: '2026-07-30',
    ...manifestOptions('canonical-npc-t1-acceptance'),
  });
  assert.deepEqual(manifest.command, [
    'node',
    'pipelines/automation/run-live-automation-acceptance.mjs',
    '--profile=t1',
    '--scope=npc-canonical',
    `--config-path=${npcT1ConfigPath}`,
    `--config-sha256=${npcT1ConfigHash}`,
    '--redis-db=9',
    '--run-id=npc-t1-20260730-01',
    '--max-rows=2',
    '--output=reports/canonical-migration/canonical-npc-t1-acceptance.json',
  ]);
  assert.deepEqual(manifest.isolatedAcceptance, {
    configPath: npcT1ConfigPath,
    configSha256: npcT1ConfigHash,
    redisLogicalDb: 9,
    runId: 'npc-t1-20260730-01',
    serverFingerprint: NPC_T1_SERVER_FINGERPRINT,
  });
  assert.equal(manifest.databaseWrites, false);
  assert.equal(manifest.isolatedResourceWrites, true);
  assert.equal(manifest.networkAccess, false);
});

test('recipe T1 manifest freezes a bounded offline fixture', () => {
  assert.deepEqual(CANONICAL_OPERATION_DATA_PATHS['canonical-recipe-t1-acceptance'], [
    'pipelines/recipe/fixtures/recipe-t1.sample.json',
  ]);
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-recipe-t1-acceptance',
    artifactDate: '2026-08-07',
    ...manifestOptions('canonical-recipe-t1-acceptance'),
  });

  assert.ok(manifest.command.includes('--max-rows=25'));
  assert.deepEqual(manifest.inputPaths, [
    'pipelines/recipe/fixtures/recipe-t1.sample.json',
  ]);
  assert.equal(manifest.networkAccess, false);
});

test('boss T1 manifest freezes joint boss and loot fixtures offline', () => {
  assert.deepEqual(CANONICAL_OPERATION_DATA_PATHS['canonical-boss-t1-acceptance'], [
    'pipelines/boss/fixtures/boss-t1.sample.json',
    'pipelines/boss/fixtures/boss-loot-t1.sample.json',
  ]);
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-boss-t1-acceptance',
    artifactDate: '2026-08-07',
    ...manifestOptions('canonical-boss-t1-acceptance'),
  });

  assert.ok(manifest.command.includes('--scope=boss-canonical'));
  assert.ok(manifest.command.includes('--max-rows=25'));
  assert.equal(manifest.databaseWrites, false);
  assert.equal(manifest.isolatedResourceWrites, true);
  assert.equal(manifest.networkAccess, false);
});

test('projectile T1 manifest freezes the item-only fixture and explicit isolated boundary', () => {
  assert.deepEqual(CANONICAL_OPERATION_DATA_PATHS['canonical-projectile-t1-acceptance'], [
    'pipelines/projectile/fixtures/projectile-t1.sample.json',
  ]);
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-projectile-t1-acceptance',
    artifactDate: '2026-08-07',
    ...manifestOptions('canonical-projectile-t1-acceptance'),
  });

  assert.ok(manifest.command.includes('--scope=projectile-canonical'));
  assert.ok(manifest.command.includes('--max-rows=25'));
  assert.ok(manifest.command.includes('--output=reports/canonical-migration/canonical-projectile-t1-acceptance.json'));
  assert.deepEqual(manifest.inputPaths, [
    'pipelines/projectile/fixtures/projectile-t1.sample.json',
  ]);
  assert.equal(manifest.databaseWrites, false);
  assert.equal(manifest.isolatedResourceWrites, true);
  assert.equal(manifest.networkAccess, false);
});

test('buff T1 manifest freezes the two-record fixture and explicit isolated boundary', () => {
  assert.deepEqual(CANONICAL_OPERATION_DATA_PATHS['canonical-buff-t1-acceptance'], [
    'pipelines/buff/fixtures/buff-t1.sample.json',
  ]);
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-buff-t1-acceptance',
    artifactDate: '2026-08-08',
    ...manifestOptions('canonical-buff-t1-acceptance'),
  });
  assert.ok(manifest.command.includes('--scope=buff-canonical'));
  assert.ok(manifest.command.includes('--max-rows=25'));
  assert.ok(manifest.command.includes('--output=reports/canonical-migration/canonical-buff-t1-acceptance.json'));
  assert.equal(manifest.databaseWrites, false);
  assert.equal(manifest.isolatedResourceWrites, true);
  assert.equal(manifest.networkAccess, false);
});

test('biome T1 manifest freezes the reciprocal two-biome fixture and isolated boundary', () => {
  assert.deepEqual(CANONICAL_OPERATION_DATA_PATHS['canonical-biome-t1-acceptance'], [
    'pipelines/biome/fixtures/biome-t1.sample.json',
  ]);
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-biome-t1-acceptance',
    artifactDate: '2026-08-08',
    ...manifestOptions('canonical-biome-t1-acceptance'),
  });
  assert.ok(manifest.command.includes('--scope=biome-canonical'));
  assert.ok(manifest.command.includes('--max-rows=25'));
  assert.ok(manifest.command.includes('--output=reports/canonical-migration/canonical-biome-t1-acceptance.json'));
  assert.deepEqual(manifest.inputPaths, ['pipelines/biome/fixtures/biome-t1.sample.json']);
  assert.equal(manifest.databaseWrites, false);
  assert.equal(manifest.isolatedResourceWrites, true);
  assert.equal(manifest.networkAccess, false);
});

test('scheduler T1 manifests dispatch the live driver into run-specific reports', () => {
  for (const [operationId, reportStem] of [
    ['canonical-crawler-v2-scheduler-t1-acceptance', 'canonical-crawler-v2-scheduler-t1-acceptance'],
    ['canonical-crawler-v2-items-t1-acceptance', 'canonical-crawler-v2-items-t1-acceptance'],
  ]) {
    const manifest = buildCanonicalOperationExecutionManifest({
      repoRoot,
      operationId,
      ...manifestOptions(operationId),
    });
    const output = `reports/canonical-migration/${reportStem}-npc-t1-20260730-01.json`;
    const scope = operationId === 'canonical-crawler-v2-items-t1-acceptance'
      ? 'crawler-v2-items'
      : 'crawler-v2-scheduler';
    assert.equal(manifest.command.includes('--live=true'), true);
    assert.equal(manifest.command.includes('--offline=true'), false);
    assert.equal(
      manifest.command.includes('--driver-module=pipelines/monitor/crawler-queue-v2-scheduler-system-driver.mjs'),
      true,
    );
    assert.equal(manifest.command.includes(`--output=${output}`), true);
    assert.equal(
      manifest.command.includes(`--marker-root=/tmp/terrapedia-${scope}-npc-t1-20260730-01`),
      true,
    );
    assert.deepEqual(manifest.outputPaths, [output]);
    assert.ok(manifest.codeBundleEntries.some((entry) => entry.path === 'pipelines/monitor/crawler-queue-v2-scheduler-system-driver.mjs'));
  }
});

test('manifest CLI accepts the exact NPC T1 private-config arguments', () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-npc-t1-manifest-cli-'));
  const outputPath = path.join(outputDirectory, 'manifest.json');
  try {
    execFileSync(process.execPath, [
      'pipelines/automation/canonical-operation-execution-manifest.mjs',
      `--repo-root=${repoRoot}`,
      '--operation-id=canonical-npc-t1-acceptance',
      '--artifact-date=2026-07-30',
      `--npc-t1-config-path=${npcT1ConfigPath}`,
      '--npc-t1-redis-db=9',
      '--npc-t1-run-id=npc-t1-20260730-01',
      `--output=${outputPath}`,
    ], { cwd: repoRoot, encoding: 'utf8' });
    const manifest = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(manifest.operationId, 'canonical-npc-t1-acceptance');
    assert.equal(manifest.isolatedAcceptance.configSha256, npcT1ConfigHash);
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('manifest CLI preserves the exact legacy-origin repair arguments', () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-image-sync-manifest-cli-'));
  const outputPath = path.join(outputDirectory, 'manifest.json');
  try {
    execFileSync(process.execPath, [
      'pipelines/automation/canonical-operation-execution-manifest.mjs',
      `--repo-root=${repoRoot}`,
      '--operation-id=canonical-image-sync',
      '--artifact-date=2026-08-04',
      '--backend-api-base=http://127.0.0.1:18188/api',
      '--item-image-promotion-bundle-path=reports/audit/item-image-source-promotion-abc.bundle.json',
      '--managed-object-origin=http://127.0.0.1:19100',
      '--legacy-origin-repair=true',
      '--legacy-origin=http://localhost:9000',
      '--expected-legacy-count=331',
      `--output=${outputPath}`,
    ], { cwd: repoRoot, encoding: 'utf8' });
    const manifest = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.deepEqual(manifest.command.slice(-6), [
      '--managed-object-origin=http://127.0.0.1:19100',
      '--legacy-origin-repair=true',
      '--legacy-origin=http://localhost:9000',
      '--expected-legacy-count=331',
      '--output=reports/workflow-image-sync-2026-08-04.json',
      '--progress-path=reports/backend-refresh/history/canonical-image-sync.runtime/child-status.json',
    ]);
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('manifest CLI forwards a dynamic governed L1 run root', () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-l1-manifest-cli-'));
  const outputPath = path.join(outputDirectory, 'manifest.json');
  const l1RunRoot = 'reports/authorization/canonical/l1-runs/items/items_l1_cli_20260829';
  try {
    execFileSync(process.execPath, [
      'pipelines/automation/canonical-operation-execution-manifest.mjs',
      `--repo-root=${repoRoot}`,
      '--operation-id=automation-items-l1',
      '--artifact-date=2026-08-29',
      `--l1-run-root=${l1RunRoot}`,
      `--output=${outputPath}`,
    ], { cwd: repoRoot, encoding: 'utf8' });
    const manifest = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(manifest.l1RunRoot, l1RunRoot);
    assert.deepEqual(manifest.command, [
      'node',
      'pipelines/automation/run-governed-l1-operation.mjs',
      '--domain=items',
      '--run-id=items_l1_cli_20260829',
      '--source-mode=local',
      '--full-reconciliation=false',
      `--repo-root=${repoRoot}`,
    ]);
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('bootstrap, recipe, and NPC manifests freeze exact safety-critical arguments', () => {
  const bootstrap = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'automation-biomes-l0-bootstrap',
    artifactDate: '2026-07-28',
  });
  assert.deepEqual(bootstrap.command, [
    'node',
    'pipelines/automation/bootstrap-automation-policy.mjs',
    '--input=reports/authorization/canonical/automation-biomes-l0-bootstrap.input.json',
    '--output=reports/authorization/canonical/automation-biomes-l0-bootstrap.result.json',
    '--apply=true',
  ]);
  assert.deepEqual(bootstrap.inputPaths, [
    'reports/authorization/canonical/automation-biomes-l0-bootstrap.input.json',
  ]);
  assert.equal(bootstrap.databaseWrites, true);
  assert.equal(bootstrap.networkAccess, false);

  const recipe = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-recipe-crawler',
    artifactDate: '2026-07-28',
  });
  assert.deepEqual(recipe.bounds, { seedPageCount: 2, maxDepth: 1, serial: true });
  assert.deepEqual(recipe.progressPaths, [
    'reports/backend-refresh/history/canonical-recipe-crawler.runtime/child-status.json',
    'data/generated/wiki-sync-progress.latest.json',
  ]);
  assert.equal(recipe.databaseWrites, false);
  assert.equal(recipe.networkAccess, true);

  const recipeApply = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-recipe-apply',
    artifactDate: '2026-07-28',
  });
  assert.deepEqual(recipeApply.inputPaths, ['data/generated/wiki-zh-recipe-pages.latest.json']);

  const npc = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-npc-crawler',
    artifactDate: '2026-07-28',
    npcLimit: 25,
  });
  assert.ok(npc.command.includes('--limit=25'));
  assert.ok(npc.command.includes('--targets-file=reports/authorization/canonical/canonical-npc-crawler.targets.json'));
  assert.deepEqual(npc.bounds, { targetLimit: 25, serial: true });
  assert.equal(npc.databaseWrites, false);
  assert.equal(npc.networkAccess, true);
});

test('formal child executors bind the exact packet verifier into their code bundles', () => {
  for (const operationId of [
    'automation-biomes-l0-bootstrap',
    'canonical-schema-v56-v58',
    'canonical-item-group-bootstrap',
    'automation-biomes-l1-policy-promotion',
    'automation-biomes-l2-promotion',
    'automation-biomes-scheduler-activation',
    'automation-crawler-v2-scheduler-activation',
  ]) {
    const manifest = buildCanonicalOperationExecutionManifest({
      repoRoot,
      operationId,
      artifactDate: '2026-07-28',
    });
    const paths = manifest.codeBundleEntries.map((entry) => entry.path);
    assert.ok(paths.includes('pipelines/automation/authorized-operation-context.mjs'), operationId);
    assert.ok(paths.includes('pipelines/automation/build-canonical-cutover-authorization.mjs'), operationId);
  }
});

test('supplementary L1 operations bind exact governed executors and exact-domain L2 operations', () => {
  const l2OperationIds = {
    audio: 'automation-audio-l2-promotion',
    bosses: 'automation-bosses-l2-promotion',
    shimmer: 'automation-shimmer-l2-promotion',
  };
  for (const domainId of ['audio', 'bosses', 'shimmer']) {
    const bootstrapId = `automation-${domainId}-l0-bootstrap`;
    const promotionId = `automation-${domainId}-l1-policy-promotion`;
    const applyId = GOVERNED_L1_OPERATION_CASES.find((entry) => entry.domainId === domainId).operationId;
    const bootstrap = buildCanonicalOperationExecutionManifest({ repoRoot, operationId: bootstrapId });
    const promotion = buildCanonicalOperationExecutionManifest({ repoRoot, operationId: promotionId });
    const apply = buildCanonicalOperationExecutionManifest({
      repoRoot,
      operationId: applyId,
      ...governedL1ManifestOptions(applyId),
    });

    assert.deepEqual(bootstrap.command, [
      'node', 'pipelines/automation/bootstrap-automation-policy.mjs',
      `--input=reports/authorization/canonical/${bootstrapId}.input.json`,
      `--output=reports/authorization/canonical/${bootstrapId}.result.json`,
      '--apply=true',
    ]);
    assert.deepEqual(promotion.command, [
      'node', 'pipelines/automation/run-automation-policy-decision.mjs',
      `--operation-id=${promotionId}`,
      `--input=reports/authorization/canonical/${promotionId}.input.json`,
      `--output=reports/authorization/canonical/${promotionId}.result.json`,
      '--apply=true',
    ]);
    assert.deepEqual(apply.command, [
      'node', 'pipelines/automation/run-governed-l1-operation.mjs',
      `--domain=${domainId}`,
      `--run-id=${domainId}_l1_manifest_20260829`,
      '--source-mode=local',
      '--full-reconciliation=false',
      `--repo-root=${repoRoot}`,
    ]);
    assert.equal(bootstrap.databaseWrites, true);
    assert.equal(promotion.databaseWrites, true);
    assert.equal(apply.databaseWrites, true);
    assert.equal(apply.networkAccess, false);
    assert.equal(apply.l1RunRoot, governedL1ManifestOptions(applyId).l1RunRoot);
    const l2 = buildCanonicalOperationExecutionManifest({
      repoRoot,
      operationId: l2OperationIds[domainId],
    });
    assert.equal(l2.databaseWrites, true);
    assert.equal(l2.networkAccess, false);
  }
});

test('schema manifest binds every role schema module executed after Flyway', () => {
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-schema-v56-v58',
    artifactDate: '2026-07-28',
  });
  const paths = manifest.codeBundleEntries.map((entry) => entry.path);
  assert.ok(paths.includes('pipelines/maint/maint-schema.mjs'));
  assert.ok(paths.includes('pipelines/relation/relation-schema.mjs'));
});

test('boss manifest binds the backend managed-image upload contract it executes', () => {
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-boss-import',
    artifactDate: '2026-07-29',
    backendApiBase: 'http://127.0.0.1:18192/api',
  });
  const paths = manifest.codeBundleEntries.map((entry) => entry.path);
  for (const expectedPath of [
    'services/catalog-api/src/main/java/com/terraria/skills/controller/FileStorageController.java',
    'services/catalog-api/src/main/java/com/terraria/skills/service/ObjectStorageService.java',
    'services/catalog-api/src/main/java/com/terraria/skills/service/UserAvatarValidator.java',
    'services/catalog-api/src/main/java/com/terraria/skills/service/impl/MinioObjectStorageServiceImpl.java',
  ]) {
    assert.ok(paths.includes(expectedPath), expectedPath);
  }
});

test('every manifest binds all repository-local static imports of its code bundle', () => {
  const shimmerFixture = createShimmerManifestFixture();
  try {
    for (const operationId of CANONICAL_EXECUTABLE_OPERATION_IDS) {
      if (operationId === 'canonical-item-image-projection-apply'
          || operationId === 'canonical-item-source-local-npc-admission') continue;
      const operationRepoRoot = operationId === 'canonical-shimmer-import'
        ? shimmerFixture.repoRoot
        : repoRoot;
      const manifest = buildCanonicalOperationExecutionManifest({
        repoRoot: operationRepoRoot,
        operationId,
        artifactDate: '2026-07-28',
        npcLimit: 25,
        ...(operationId === 'canonical-image-sync' || operationId === 'canonical-boss-import'
          ? { backendApiBase: 'http://127.0.0.1:18191/api' }
          : {}),
        ...manifestOptions(operationId),
      });
      const paths = new Set(manifest.codeBundleEntries.map((entry) => entry.path));
      const missing = [];
      for (const relativePath of paths) {
        if (!relativePath.endsWith('.mjs')) continue;
        const source = fs.readFileSync(path.join(operationRepoRoot, relativePath), 'utf8');
        for (const specifier of staticRelativeImports(source)) {
          let importedPath = path.posix.normalize(path.posix.join(
            path.posix.dirname(relativePath),
            specifier,
          ));
          if (!path.posix.extname(importedPath)) importedPath += '.mjs';
          if (fs.existsSync(path.join(operationRepoRoot, importedPath)) && !paths.has(importedPath)) {
            missing.push(importedPath);
          }
        }
      }
      assert.deepEqual([...new Set(missing)], [], operationId);
    }
  } finally {
    shimmerFixture.cleanup();
  }
});

test('formal cutover and activation manifests freeze exact safety-critical arguments', () => {
  const expected = {
    'canonical-schema-v56-v58': [
      'node', 'pipelines/automation/run-canonical-schema-migration.mjs',
      '--output=reports/authorization/canonical/canonical-schema-v56-v58.result.json',
      '--apply=true',
    ],
    'canonical-item-group-bootstrap': [
      'node', 'pipelines/item-groups/item-group-canonical-action.mjs',
      '--action-id=item-group-canonical-apply',
      '--input=reports/authorization/canonical/canonical-item-group-bootstrap.input.json',
      '--output=reports/authorization/canonical/canonical-item-group-bootstrap.result.json',
      '--progress-path=reports/backend-refresh/history/canonical-item-group-bootstrap.runtime/child-status.json',
    ],
    'automation-biomes-l1-policy-promotion': [
      'node', 'pipelines/automation/run-automation-policy-decision.mjs',
      '--operation-id=automation-biomes-l1-policy-promotion',
      '--input=reports/authorization/canonical/automation-biomes-l1-policy-promotion.input.json',
      '--output=reports/authorization/canonical/automation-biomes-l1-policy-promotion.result.json',
      '--apply=true',
    ],
    'automation-biomes-first-l1': [
      'node', 'pipelines/automation/run-biomes-automation-operation.mjs',
      '--operation-id=automation-biomes-first-l1',
      '--input=reports/authorization/canonical/automation-biomes-first-l1.bundle.json',
      '--output=reports/authorization/canonical/automation-biomes-first-l1.result.json',
      '--apply=true',
    ],
    'automation-biomes-second-l1': [
      'node', 'pipelines/automation/run-biomes-automation-operation.mjs',
      '--operation-id=automation-biomes-second-l1',
      '--input=reports/authorization/canonical/automation-biomes-second-l1.bundle.json',
      '--output=reports/authorization/canonical/automation-biomes-second-l1.result.json',
      '--apply=true',
    ],
    'automation-biomes-l2-promotion': [
      'node', 'pipelines/automation/run-automation-policy-decision.mjs',
      '--operation-id=automation-biomes-l2-promotion',
      '--input=reports/authorization/canonical/automation-biomes-l2-promotion.input.json',
      '--output=reports/authorization/canonical/automation-biomes-l2-promotion.result.json',
      '--apply=true',
    ],
    'automation-biomes-scheduler-activation': [
      'node', 'pipelines/automation/run-automation-policy-decision.mjs',
      '--operation-id=automation-biomes-scheduler-activation',
      '--input=reports/authorization/canonical/automation-biomes-scheduler-activation.input.json',
      '--output=reports/authorization/canonical/automation-biomes-scheduler-activation.result.json',
      '--apply=true',
    ],
    'automation-crawler-v2-scheduler-activation': [
      'node', 'pipelines/automation/run-automation-policy-decision.mjs',
      '--operation-id=automation-crawler-v2-scheduler-activation',
      '--input=reports/authorization/canonical/automation-crawler-v2-scheduler-activation.input.json',
      '--output=reports/authorization/canonical/automation-crawler-v2-scheduler-activation.result.json',
      '--apply=true',
    ],
  };
  for (const [operationId, command] of Object.entries(expected)) {
    const manifest = buildCanonicalOperationExecutionManifest({
      repoRoot,
      operationId,
      artifactDate: '2026-07-28',
    });
    assert.deepEqual(manifest.command, command, operationId);
    assert.equal(manifest.databaseWrites, true, operationId);
    assert.equal(manifest.networkAccess, false, operationId);
  }
  assert.throws(() => buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-npc-apply',
    artifactDate: '2026-07-28',
  }), /no governed executor.*canonical-npc-apply/i);
  assert.throws(() => buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'automation-l1-historical-source-hash-disposition',
    artifactDate: '2026-07-28',
  }), /no governed executor.*automation-l1-historical-source-hash-disposition/i);
});

test('L2 policy ceiling registration manifests include an immutable post-commit marker output', () => {
  const domains = ['items', 'npcs', 'projectiles', 'armor-sets', 'buffs', 'audio', 'bosses', 'shimmer'];
  for (const domain of domains) {
    const operationId = `automation-${domain}-l2-policy-ceiling-registration`;
    const resultPath = `reports/authorization/canonical/${operationId}.result.json`;
    const manifest = buildCanonicalOperationExecutionManifest({
      repoRoot,
      operationId,
      artifactDate: '2026-08-26',
    });
    assert.deepEqual(manifest.command, [
      'node', 'pipelines/automation/register-l2-policy-ceiling.mjs',
      `--operation-id=${operationId}`,
      `--input=reports/authorization/canonical/${operationId}.input.json`,
      `--output=${resultPath}`,
      '--apply=true',
    ], operationId);
    assert.deepEqual(manifest.outputPaths, [resultPath, `${resultPath}.commit.json`], operationId);
  }
});

test('L2 policy ceiling registration recovery manifests bind the retained pending result', () => {
  const operationId = 'automation-items-l2-policy-ceiling-registration';
  const inputPath = `reports/authorization/canonical/${operationId}.input.json`;
  const resultPath = `reports/authorization/canonical/${operationId}.result.json`;
  const markerPath = `${resultPath}.commit.json`;
  const recovery = buildCanonicalOperationExecutionManifest({
    repoRoot, operationId, artifactDate: '2026-08-26', policyCeilingRegistrationMode: 'recover',
  });
  assert.deepEqual(recovery.command, [
    'node', 'pipelines/automation/register-l2-policy-ceiling.mjs',
    `--operation-id=${operationId}`, `--input=${inputPath}`, `--output=${resultPath}`, '--recover=true',
  ]);
  assert.deepEqual(recovery.inputPaths, [inputPath, resultPath]);
  assert.deepEqual(recovery.outputPaths, [markerPath]);
  assert.deepEqual(recovery.policyCeilingRegistration, { mode: 'recover' });
  assert.equal(recovery.databaseWrites, true);
  assert.equal(assertCanonicalOperationExecutionManifestContract({ repoRoot, operationId, manifest: recovery }), true);

});

test('L2 policy decision manifests expose the pending result and immutable commit marker', () => {
  for (const operationId of [
    'automation-biomes-l2-promotion',
    'automation-items-l2-promotion',
    'automation-npcs-l2-promotion',
    'automation-projectiles-l2-promotion',
    'automation-armor-sets-l2-promotion',
    'automation-buffs-l2-promotion',
    'automation-audio-l2-promotion',
    'automation-bosses-l2-promotion',
    'automation-shimmer-l2-promotion',
  ]) {
    const resultPath = `reports/authorization/canonical/${operationId}.result.json`;
    const markerPath = `${resultPath}.commit.json`;
    const manifest = buildCanonicalOperationExecutionManifest({ repoRoot, operationId });
    assert.deepEqual(manifest.outputPaths, [resultPath, markerPath], operationId);
    assert.deepEqual(manifest.policyDecisionPublication, {
      pendingResultPath: resultPath,
      commitMarkerPath: markerPath,
    }, operationId);
  }
});

test('L2 policy decision retry labels bind paired input and publication paths', () => {
  const operationId = 'automation-armor-sets-l2-promotion';
  const suffix = '.retry-02';
  const inputPath = `reports/authorization/canonical/${operationId}${suffix}.input.json`;
  const resultPath = `reports/authorization/canonical/${operationId}${suffix}.result.json`;
  const markerPath = `${resultPath}.commit.json`;
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId,
    artifactDate: '2026-08-30',
    resultLabel: 'retry-02',
  });
  assert.deepEqual(manifest.command, [
    'node', 'pipelines/automation/run-automation-policy-decision.mjs',
    `--operation-id=${operationId}`,
    `--input=${inputPath}`,
    `--output=${resultPath}`,
    '--apply=true',
  ]);
  assert.deepEqual(manifest.inputPaths, [inputPath]);
  assert.deepEqual(manifest.outputPaths, [resultPath, markerPath]);
  assert.deepEqual(manifest.policyDecisionPublication, {
    pendingResultPath: resultPath,
    commitMarkerPath: markerPath,
  });
  assert.equal(
    assertCanonicalOperationExecutionManifestContract({ repoRoot, operationId, manifest }),
    true,
  );
});

test('L2 manifests freeze the explicit evidence root and complete historical disposition paths', () => {
  const operationId = 'automation-items-l2-promotion';
  const databaseEvidenceRoot = repoRoot;
  const historicalDispositionPaths = [
    'reports/authorization/canonical/l1-historical-source-hash-disposition/items/'
      + `${'a'.repeat(64)}/disposition.json`,
    'reports/authorization/canonical/l1-historical-source-hash-disposition/projectiles/'
      + `${'b'.repeat(64)}/disposition.json`,
    'reports/authorization/canonical/l1-historical-source-hash-disposition/shimmer/'
      + `${'c'.repeat(64)}/disposition.json`,
  ];
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId,
    databaseEvidenceRoot,
    historicalSourceHashDispositionPaths: historicalDispositionPaths,
  });
  assert.ok(manifest.command.includes(`--database-evidence-root=${databaseEvidenceRoot}`));
  assert.ok(manifest.command.includes(
    `--historical-source-hash-disposition=${historicalDispositionPaths.join(',')}`,
  ));
  assert.deepEqual(manifest.policyDecisionEvidence, {
    databaseEvidenceRoot,
    historicalSourceHashDispositionPaths: historicalDispositionPaths,
  });
  assert.equal(
    historicalDispositionPaths.every((value) => manifest.inputPaths.includes(value)),
    true,
  );
});

test('L2 manifests reject historical disposition paths without an explicit evidence root', () => {
  assert.throws(() => buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'automation-items-l2-promotion',
    historicalSourceHashDispositionPaths: [
      `reports/authorization/canonical/l1-historical-source-hash-disposition/items/${'a'.repeat(64)}/disposition.json`,
    ],
  }), /database evidence root|evidence root/i);
});

test('scheduler activation manifest consumes explicit preflight and T1 paths without writes', () => {
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-crawler-v2-scheduler-activation',
    artifactDate: '2026-08-10',
  });
  assert.deepEqual(manifest.command, [
    'node',
    'pipelines/automation/build-canonical-crawler-v2-scheduler-activation-proposal.mjs',
    '--preflight=reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.preflight.json',
    '--t1-report=reports/canonical-migration/canonical-crawler-v2-scheduler-t1-acceptance-npc-t1-crawler-v2-auto-ingestion-20260809-04.json',
    '--output=reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.proposal.json',
  ]);
  assert.deepEqual(manifest.inputPaths, [
    'reports/canonical-migration/canonical-crawler-v2-scheduler-t1-acceptance-npc-t1-crawler-v2-auto-ingestion-20260809-04.json',
    'reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.preflight.json',
  ]);
  assert.deepEqual(manifest.outputPaths, [
    'reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.proposal.json',
  ]);
  assert.equal(manifest.executionClass, 'formal_activation_proposal_only');
  assert.equal(manifest.databaseWrites, false);
  assert.equal(manifest.isolatedResourceWrites, false);
  assert.equal(manifest.networkAccess, false);
  assert.ok(manifest.codeBundleEntries.some((entry) => entry.path.endsWith('crawler-v2-scheduler-activation-preflight.mjs')));
});

test('scheduler activation manifest binds retry-labelled proposal inputs and output', () => {
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-crawler-v2-scheduler-activation',
    artifactDate: '2026-09-07',
    resultLabel: 'retry-02',
  });

  assert.deepEqual(manifest.command, [
    'node',
    'pipelines/automation/build-canonical-crawler-v2-scheduler-activation-proposal.mjs',
    '--preflight=reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.retry-02.preflight.json',
    '--t1-report=reports/canonical-migration/canonical-crawler-v2-scheduler-t1-acceptance-npc-t1-crawler-v2-auto-ingestion-20260809-04.json',
    '--output=reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.retry-02.proposal.json',
  ]);
  assert.deepEqual(manifest.inputPaths, [
    'reports/canonical-migration/canonical-crawler-v2-scheduler-t1-acceptance-npc-t1-crawler-v2-auto-ingestion-20260809-04.json',
    'reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.retry-02.preflight.json',
  ]);
  assert.deepEqual(manifest.outputPaths, [
    'reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.retry-02.proposal.json',
  ]);
  assert.equal(manifest.resultLabel, 'retry-02');
});

test('image and boss manifests require and freeze the active backend API base', () => {
  assert.throws(
    () => buildCanonicalOperationExecutionManifest({
      repoRoot,
      operationId: 'canonical-image-sync',
      artifactDate: '2026-07-28',
    }),
    /backendApiBase.*required/i,
  );
  assert.throws(
    () => buildCanonicalOperationExecutionManifest({
      repoRoot,
      operationId: 'canonical-boss-import',
      artifactDate: '2026-07-28',
    }),
    /backendApiBase.*required/i,
  );
  for (const operationId of ['canonical-image-sync', 'canonical-boss-import']) {
    const manifest = buildCanonicalOperationExecutionManifest({
      repoRoot,
      operationId,
      artifactDate: '2026-07-28',
      backendApiBase: 'http://127.0.0.1:18191/api',
      ...manifestOptions(operationId),
    });
    assert.ok(manifest.command.includes('--apiBase=http://127.0.0.1:18191/api'));
  }
});

test('manifest builder refuses invalid NPC limits', () => {
  assert.throws(
    () => buildCanonicalOperationExecutionManifest({
      repoRoot,
      operationId: 'canonical-npc-crawler',
      npcLimit: 0,
    }),
    /npcLimit.*exactly 25/i,
  );
});

test('manifest writer atomically emits one private operation artifact', () => {
  const outputDir = fs.mkdtempSync(path.join(repoRoot, '.tmp-canonical-manifest-test-'));
  const outputPath = path.join(outputDir, 'recipe.json');
  try {
    const manifest = writeCanonicalOperationExecutionManifest({
      repoRoot,
      operationId: 'canonical-recipe-crawler',
      artifactDate: '2026-07-28',
      outputPath,
    });
    assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, 'utf8')), manifest);
    assert.equal(fs.statSync(outputPath).mode & 0o077, 0);
    assert.deepEqual(fs.readdirSync(outputDir), ['recipe.json']);
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
});

function staticRelativeImports(source) {
  const imports = [];
  for (const pattern of [
    /(?:import\s+(?:[^'\"]*?\s+from\s+)?|export\s+[^'\"]*?\s+from\s+)['\"](\.[^'\"]+)['\"]/g,
    /import\s*\(\s*['\"](\.[^'\"]+)['\"]\s*\)/g,
  ]) {
    for (const match of source.matchAll(pattern)) imports.push(match[1]);
  }
  return imports;
}

test('the item image lineage code bundle pins every module the apply loads', () => {
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-item-image-lineage-apply',
    artifactDate: '2026-08-01',
  });

  const pinned = new Set(manifest.codeBundleEntries.map((entry) => entry.path));
  // The bundle is resolved through the import graph, so the staged writers and
  // the runtime-config resolver are pinned without being listed by hand. This
  // locks that in: the approval has to cover the code that touches the tables,
  // not just the orchestrator named in the catalog.
  for (const required of [
    'pipelines/relation/apply-item-image-lineage.mjs',
    'pipelines/relation/item-image-lineage-adapter.mjs',
    'pipelines/relation/item-image-lineage-db.mjs',
  ]) {
    assert.ok(pinned.has(required), `${required} must be pinned by the code bundle`);
  }
});

test('item image lineage manifest binds one fresh attempt root', () => {
  const attemptRoot = 'reports/authorization/canonical/item-image-lineage-apply/'
    + 'a'.repeat(64);
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-item-image-lineage-apply',
    artifactDate: '2026-08-05',
    itemImageLineageAttemptRoot: attemptRoot,
  });

  assert.deepEqual(manifest.inputPaths, [`${attemptRoot}/input.json`]);
  assert.deepEqual(manifest.outputPaths, [
    `${attemptRoot}/snapshot.json`,
    `${attemptRoot}/result.json`,
  ]);
  assert.deepEqual(manifest.command, [
    'node',
    'pipelines/relation/apply-item-image-lineage.mjs',
    `--input-contract=${attemptRoot}/input.json`,
    '--apply=true',
    `--snapshot=${attemptRoot}/snapshot.json`,
    `--result=${attemptRoot}/result.json`,
  ]);
  assert.equal(manifest.databaseWrites, true);
  assert.equal(manifest.networkAccess, false);
  assert.equal(manifest.itemImageLineageAttempt.attemptRoot, attemptRoot);
});

test('item image projection manifest binds one decision-derived attempt root', () => {
  const fixture = createProjectionManifestFixture();
  try {
    const manifest = buildProjectionManifest(fixture);
    const { attemptRoot } = fixture.paths;
    assert.deepEqual(manifest.inputPaths, [`${attemptRoot}/input.json`]);
    assert.deepEqual(manifest.outputPaths, [`${attemptRoot}/result.json`]);
    assert.deepEqual(manifest.itemImageProjectionAttempt, {
      attemptId: fixture.paths.attemptId,
      attemptRoot,
      manifestPath: fixture.paths.manifestPath,
      requestPath: fixture.paths.requestPath,
      packetPath: fixture.paths.packetPath,
      permitPath: fixture.paths.permitPath,
      resultPath: fixture.paths.resultPath,
      inputBinding: projectionInputBinding(fixture.input),
    });
    assert.deepEqual(manifest.command, [
      'node',
      'pipelines/relation/apply-item-image-projection.mjs',
      `--input-contract=${attemptRoot}/input.json`,
      '--apply=true',
      `--output=${attemptRoot}/result.json`,
    ]);
    assert.equal(manifest.databaseWrites, true);
    assert.equal(manifest.networkAccess, false);

    const pinned = new Set(manifest.codeBundleEntries.map((entry) => entry.path));
    assert.deepEqual([...pinned].sort(), [
      'pipelines/automation/authorized-operation-context.mjs',
      'pipelines/automation/automation-database-contract.mjs',
      'pipelines/automation/build-canonical-cutover-authorization.mjs',
      'pipelines/automation/canonical-operation-catalog.mjs',
      'pipelines/automation/canonical-operation-execution-manifest.mjs',
      'pipelines/automation/canonical-shimmer-import-input-contract.mjs',
      'pipelines/automation/policy-set-hash.mjs',
      'pipelines/automation/run-authorized-canonical-operation.mjs',
      'pipelines/automation/table-ownership-matrix.mjs',
      'pipelines/lib/mysql-module.mjs',
      'pipelines/lib/private-repository-path.mjs',
      'pipelines/lib/project-root.mjs',
      'pipelines/maint/maint-schema.mjs',
      'pipelines/npc-canonical/npc-apply-ownership-preparation.mjs',
      'pipelines/relation/apply-item-image-projection.mjs',
      'pipelines/relation/build-item-image-projection-proposal.mjs',
      'pipelines/relation/item-image-lineage-db.mjs',
      'pipelines/relation/item-image-origin-repair-evidence-adapter.mjs',
      'pipelines/relation/item-image-projection-contract.mjs',
      'pipelines/relation/item-image-projection-db.mjs',
      'pipelines/relation/managed-image-url-policy.mjs',
      'pipelines/relation/projection-schema.mjs',
      'pipelines/relation/relation-schema.mjs',
      'pipelines/transform/shimmer-generation-contract.mjs',
      'scripts/lib/local-runtime-config.mjs',
    ].sort());
  } finally {
    fixture.cleanup();
  }
});

test('item image projection manifest rejects attempt aliases and input-derived identity drift', () => {
  const fixture = createProjectionManifestFixture();
  const sibling = createProjectionManifestFixture({
    decisionIdentity: 'canonical-item-image-projection-proposal-read-20990101-02',
  });
  try {
    for (const attemptRoot of [
      `${fixture.paths.attemptRoot}/child`,
      `${fixture.paths.attemptRoot}/../${fixture.paths.attemptId}`,
      sibling.paths.attemptRoot,
      path.resolve(fixture.repoRoot, fixture.paths.attemptRoot),
    ]) {
      assert.throws(
        () => buildProjectionManifest(fixture, { attemptRoot }),
        /attempt|input.*root|relative|projection input contract/i,
      );
    }
  } finally {
    fixture.cleanup();
    sibling.cleanup();
  }
});

test('item image projection manifest rejects every dynamic import expression form', () => {
  for (const expression of [
    "import('./unbound.mjs')",
    "import('/tmp/unbound.mjs')",
    "import('unbound-package')",
    'import(specifier)',
    'import(`./${specifier}.mjs`)',
    '`${import(specifier)}`',
  ]) {
    const fixture = createProjectionManifestFixture();
    try {
      const entrypoint = path.join(
        fixture.repoRoot,
        'pipelines/relation/apply-item-image-projection.mjs',
      );
      fs.appendFileSync(entrypoint, `\nvoid ${expression};\n`);
      assert.throws(() => buildProjectionManifest(fixture), /forbids dynamic import/i, expression);
    } finally {
      fixture.cleanup();
    }
  }
});

test('item image projection supplied manifest verification rechecks dynamic imports', () => {
  const fixture = createProjectionManifestFixture();
  try {
    const manifest = buildProjectionManifest(fixture);
    const relativeEntrypoint = 'pipelines/relation/apply-item-image-projection.mjs';
    const entrypoint = path.join(fixture.repoRoot, relativeEntrypoint);
    fs.appendFileSync(entrypoint, "\nvoid import('./unbound.mjs');\n");
    const codeBundleEntries = manifest.codeBundleEntries.map((entry) => (
      entry.path === relativeEntrypoint
        ? {
            ...entry,
            contentHash: `sha256:${createHash('sha256').update(fs.readFileSync(entrypoint)).digest('hex')}`,
          }
        : entry
    ));
    assert.throws(() => assertCanonicalOperationExecutionManifestContract({
      repoRoot: fixture.repoRoot,
      operationId: 'canonical-item-image-projection-apply',
      manifest: { ...manifest, codeBundleEntries },
    }), /forbids dynamic import/i);
  } finally {
    fixture.cleanup();
  }
});

test('item image projection manifest writer requires the exact private no-overwrite attempt path', () => {
  const fixture = createProjectionManifestFixture();
  try {
    const exactOutput = path.join(fixture.repoRoot, fixture.paths.manifestPath);
    const manifest = writeCanonicalOperationExecutionManifest({
      ...projectionManifestOptions(fixture),
      outputPath: exactOutput,
    });
    assert.equal(manifest.itemImageProjectionAttempt.manifestPath, fixture.paths.manifestPath);
    assert.equal(fs.statSync(exactOutput).mode & 0o777, 0o600);
    assert.throws(() => writeCanonicalOperationExecutionManifest({
      ...projectionManifestOptions(fixture),
      outputPath: exactOutput,
    }), /already exists|overwrite/i);

    for (const outputPath of [
      path.join(fixture.repoRoot, 'execution-manifest.json'),
      path.join(fixture.repoRoot, fixture.paths.attemptRoot, 'nested', 'execution-manifest.json'),
    ]) {
      assert.throws(() => writeCanonicalOperationExecutionManifest({
        ...projectionManifestOptions(fixture),
        outputPath,
      }), /execution-manifest\.json|attempt root|exact/i);
      assert.equal(fs.existsSync(outputPath), false);
    }
  } finally {
    fixture.cleanup();
  }
});

test('item image projection manifest writer rejects a retained failed attempt before creating a replacement', () => {
  const fixture = createProjectionManifestFixture();
  try {
    const resultPath = path.join(fixture.repoRoot, fixture.paths.resultPath);
    fs.mkdirSync(path.dirname(resultPath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(resultPath, JSON.stringify({
      operationId: 'canonical-item-image-projection-apply',
      status: 'failed',
      apply: true,
    }) + '\n', { mode: 0o600 });
    const outputPath = path.join(fixture.repoRoot, fixture.paths.manifestPath);
    assert.throws(() => writeCanonicalOperationExecutionManifest({
      ...projectionManifestOptions(fixture),
      outputPath,
    }), /retained failed attempt|result.*already exists|retry/i);
    assert.equal(fs.existsSync(outputPath), false);
  } finally {
    fixture.cleanup();
  }
});

function createProjectionManifestFixture({
  decisionIdentity = 'canonical-item-image-projection-proposal-read-20990101-01',
} = {}) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-projection-manifest-'));
  fs.cpSync(path.join(repoRoot, 'scripts'), path.join(fixtureRoot, 'scripts'), { recursive: true });
  fs.cpSync(path.join(repoRoot, 'pipelines'), path.join(fixtureRoot, 'pipelines'), { recursive: true });
  const paths = buildItemImageProjectionAttemptPaths(decisionIdentity);
  const hash = `sha256:${'a'.repeat(64)}`;
  const managedPrefix = 'http://127.0.0.1:9000/terrapedia-images/items/';
  const target = {
    host: '127.0.0.1',
    port: 13306,
    serverUuid: 'projection-manifest-server',
    databases: {
      local: 'terria_v1_local',
      maint: 'terria_v1_maint',
      relation: 'terria_v1_relation',
    },
    ownedDatabase: 'terria_v1_relation',
    ownedTable: 'projection_items',
    ownedColumn: 'image',
  };
  const proposal = buildItemImageProjectionProposal({
    generatedAt: '2020-01-01T00:00:00.000Z',
    expiresAt: '2099-01-02T00:00:00.000Z',
    proposalAuthorization: {
      path: paths.proposalReadOwnerInputPath,
      sha256: hash,
      decisionIdentity,
      authorizationHash: hash,
    },
    lineage: {
      inputContractPath: 'reports/authorization/canonical/canonical-item-image-lineage-apply.input.json',
      inputContractSha256: hash,
      resultPath: 'reports/authorization/canonical/canonical-item-image-lineage-apply.result.json',
      resultSha256: hash,
      bundlePath: 'reports/audit/item-image-lineage.bundle.json',
      bundleSha256: hash,
      applySnapshotPath: 'reports/authorization/canonical/canonical-item-image-lineage-apply.snapshot.json',
      applySnapshotSha256: hash,
      authorizationPacketPath: 'reports/authorization/canonical/canonical-item-image-lineage-apply.packet.json',
      authorizationPacketSha256: hash,
      decisionIdentity: 'canonical-item-image-lineage-apply-20990101-01',
      packetHash: hash,
      dispatchPermitHash: hash,
      completedRowCount: 1,
    },
    lineageKeys: ['Wood'],
    target,
    snapshotPath: paths.snapshotPath,
    snapshotSha256: hash,
    managedUrlPolicy: {
      sourcePath: 'pipelines/relation/managed-image-url-policy.mjs',
      sourceSha256: hash,
      resolvedPrefixesSha256: hashValue([managedPrefix]),
    },
    managedUrlPrefixes: [managedPrefix],
    relationRows: [{
      recordKey: 'relation-wood',
      internalName: 'Wood',
      cachedUrl: '/terrapedia-images/items/wood.png',
      role: 'icon',
      isPrimary: 1,
      status: 1,
      deleted: 0,
    }],
    projectionRows: [{
      id: 1,
      relationRecordKey: 'relation-wood',
      internalName: 'Wood',
      image: '/legacy/wood.png',
      status: 1,
      deleted: 0,
    }],
  });
  const input = buildItemImageProjectionInputContract({
    proposal,
    proposalPath: paths.proposalPath,
    proposalSha256: hash,
  });
  const inputPath = path.join(fixtureRoot, paths.inputPath);
  fs.mkdirSync(path.dirname(inputPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(inputPath, `${JSON.stringify(input, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(inputPath, 0o600);
  return {
    repoRoot: fixtureRoot,
    paths,
    input,
    cleanup: () => fs.rmSync(fixtureRoot, { recursive: true, force: true }),
  };
}

function projectionManifestOptions(fixture) {
  return {
    repoRoot: fixture.repoRoot,
    operationId: 'canonical-item-image-projection-apply',
    artifactDate: '2099-01-01',
    itemImageProjectionAttemptRoot: fixture.paths.attemptRoot,
  };
}

function buildProjectionManifest(fixture, { attemptRoot = fixture.paths.attemptRoot } = {}) {
  return buildCanonicalOperationExecutionManifest({
    ...projectionManifestOptions(fixture),
    itemImageProjectionAttemptRoot: attemptRoot,
  });
}

function projectionInputBinding(input) {
  return {
    operationId: input.operationId,
    contractVersion: input.contractVersion,
    attemptId: input.attemptId,
    attemptRoot: input.attemptRoot,
    proposalAuthorization: input.proposalAuthorization,
    proposalPath: input.proposalPath,
    proposalSha256: input.proposalSha256,
    snapshotPath: input.snapshotPath,
    snapshotSha256: input.snapshotSha256,
    lineage: input.lineage,
    target: input.target,
    managedUrlPolicy: input.managedUrlPolicy,
    managedUrlPrefixes: input.managedUrlPrefixes,
    keys: input.keys,
    keySetSha256: input.keySetSha256,
    relationRowsSha256: input.relationRowsSha256,
    projectionBeforeSha256: input.projectionBeforeSha256,
    projectionAfterSha256: input.projectionAfterSha256,
    targetRowCount: input.targetRowCount,
    changedRowCount: input.changedRowCount,
  };
}

function itemSourceAdmissionProposal() {
  const hash = `sha256:${'a'.repeat(64)}`;
  return {
    schemaVersion: 'item-source-local-npc-admission-proposal-v1',
    operationId: 'canonical-item-source-local-npc-admission',
    readOnly: true,
    authorizationAllowed: true,
    databaseFingerprint: {
      host: '127.0.0.1', port: 13306, serverUuid: 'manifest-test',
      databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    },
    sourceFreeze: {
      partition: { path: 'reports/runtime/frozen-partition.json', sha256: hash, scopeHash: hash, candidateCount: 1 },
      snapshotPairs: [{
        entityId: 'dryad', normalizedPath: 'data/npc/dryad.json', normalizedSha256: hash,
        auditPath: 'data/audit/dryad.json', auditSha256: hash,
      }],
    },
    selectedIdentityHash: hash,
    tableBeforeFingerprints: { 'terria_v1_local.item_acquisition_sources': hash },
    beforeFingerprint: hash,
    afterFingerprint: hash,
    scopeHash: hash,
    changedRowCount: 16,
    summary: { accepted: 1, blocked: 0, unclassified: 0, localSourceReconciliation: 9 },
  };
}

function hashValue(value) {
  const stable = (candidate) => Array.isArray(candidate)
    ? candidate.map(stable)
    : candidate && typeof candidate === 'object'
      ? Object.fromEntries(Object.keys(candidate).sort().map((key) => [key, stable(candidate[key])]))
      : candidate;
  return `sha256:${createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')}`;
}
