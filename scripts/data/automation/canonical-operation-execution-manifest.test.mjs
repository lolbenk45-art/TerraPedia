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
  writeCanonicalOperationExecutionManifest,
} from './canonical-operation-execution-manifest.mjs';
import {
  CANONICAL_CUTOVER_OPERATION_IDS,
  CANONICAL_OPERATION_DATA_PATHS,
  CANONICAL_OPERATION_ENTRYPOINTS,
} from './build-canonical-cutover-authorization.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
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

function manifestOptions(operationId) {
  if (operationId === 'canonical-npc-t1-acceptance') {
    return {
      npcT1ConfigPath,
      npcT1RedisDb: 9,
      npcT1RunId: 'npc-t1-20260730-01',
    };
  }
  return operationId === 'canonical-image-sync' ? { ...IMAGE_SYNC_OPTIONS } : {};
}

test('manifest builder covers 30 governed operations and keeps NPC apply explicitly fail closed', () => {
  assert.equal(CANONICAL_CUTOVER_OPERATION_IDS.length, 32);
  assert.equal(CANONICAL_EXECUTABLE_OPERATION_IDS.length, 31);
  assert.equal(CANONICAL_OPERATION_ENTRYPOINTS['canonical-npc-apply'], null);
  assert.deepEqual(
    Object.entries(CANONICAL_OPERATION_ENTRYPOINTS)
      .filter(([, entrypoint]) => entrypoint === null)
      .map(([operationId]) => operationId),
    ['canonical-npc-apply'],
  );
  assert.deepEqual(
    CANONICAL_EXECUTABLE_OPERATION_IDS,
    CANONICAL_CUTOVER_OPERATION_IDS.filter((operationId) => (
      CANONICAL_OPERATION_ENTRYPOINTS[operationId] !== null
    )),
  );

  for (const operationId of CANONICAL_EXECUTABLE_OPERATION_IDS) {
    const manifest = buildCanonicalOperationExecutionManifest({
      repoRoot,
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
      entry.path === 'scripts/data/automation/run-authorized-canonical-operation.mjs'
    )), `${operationId}: authorized runner`);
    for (const entry of manifest.codeBundleEntries) {
      const bytes = fs.readFileSync(path.join(repoRoot, entry.path));
      const expected = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
      assert.equal(entry.contentHash, expected, `${operationId}:${entry.path}`);
    }
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
    'scripts/data/transform/promote-item-image-sources.mjs',
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
    entry.path === 'scripts/data/transform/promote-item-image-sources.mjs'
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
    'scripts/data/workflow/run-backend-data-refresh.mjs',
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
    entry.path === 'scripts/data/fetch/fetch-item-image-source-verification.mjs'
  )));
});

test('NPC item relation lineage repair manifest binds historical predecessors and a distinct result', () => {
  const operationId = 'canonical-npc-item-relation-lineage-repair';
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId,
    artifactDate: '2026-07-30',
  });

  assert.deepEqual(manifest.command, [
    'node', 'scripts/data/npc-canonical/npc-owner-phase-apply.mjs',
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
      'node', 'scripts/data/npc-canonical/npc-base-maint-apply.mjs',
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
      entry.path === 'scripts/data/npc-canonical/npc-base-maint-apply.mjs'
    )));
    assert.ok(manifest.codeBundleEntries.some((entry) => (
      entry.path === 'scripts/data/maint/sync-landing-to-maint.mjs'
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
    'scripts/data/automation/run-live-automation-acceptance.mjs',
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

test('manifest CLI accepts the exact NPC T1 private-config arguments', () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-npc-t1-manifest-cli-'));
  const outputPath = path.join(outputDirectory, 'manifest.json');
  try {
    execFileSync(process.execPath, [
      'scripts/data/automation/canonical-operation-execution-manifest.mjs',
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

test('bootstrap, recipe, and NPC manifests freeze exact safety-critical arguments', () => {
  const bootstrap = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'automation-biomes-l0-bootstrap',
    artifactDate: '2026-07-28',
  });
  assert.deepEqual(bootstrap.command, [
    'node',
    'scripts/data/automation/bootstrap-automation-policy.mjs',
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
  ]) {
    const manifest = buildCanonicalOperationExecutionManifest({
      repoRoot,
      operationId,
      artifactDate: '2026-07-28',
    });
    const paths = manifest.codeBundleEntries.map((entry) => entry.path);
    assert.ok(paths.includes('scripts/data/automation/authorized-operation-context.mjs'), operationId);
    assert.ok(paths.includes('scripts/data/automation/build-canonical-cutover-authorization.mjs'), operationId);
  }
});

test('schema manifest binds every role schema module executed after Flyway', () => {
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-schema-v56-v58',
    artifactDate: '2026-07-28',
  });
  const paths = manifest.codeBundleEntries.map((entry) => entry.path);
  assert.ok(paths.includes('scripts/data/maint/maint-schema.mjs'));
  assert.ok(paths.includes('scripts/data/relation/relation-schema.mjs'));
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
    'back/src/main/java/com/terraria/skills/controller/FileStorageController.java',
    'back/src/main/java/com/terraria/skills/service/ObjectStorageService.java',
    'back/src/main/java/com/terraria/skills/service/UserAvatarValidator.java',
    'back/src/main/java/com/terraria/skills/service/impl/MinioObjectStorageServiceImpl.java',
  ]) {
    assert.ok(paths.includes(expectedPath), expectedPath);
  }
});

test('every manifest binds all repository-local static imports of its code bundle', () => {
  for (const operationId of CANONICAL_EXECUTABLE_OPERATION_IDS) {
    const manifest = buildCanonicalOperationExecutionManifest({
      repoRoot,
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
      const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
      for (const specifier of staticRelativeImports(source)) {
        let importedPath = path.posix.normalize(path.posix.join(
          path.posix.dirname(relativePath),
          specifier,
        ));
        if (!path.posix.extname(importedPath)) importedPath += '.mjs';
        if (fs.existsSync(path.join(repoRoot, importedPath)) && !paths.has(importedPath)) {
          missing.push(importedPath);
        }
      }
    }
    assert.deepEqual([...new Set(missing)], [], operationId);
  }
});

test('formal cutover and activation manifests freeze exact safety-critical arguments', () => {
  const expected = {
    'canonical-schema-v56-v58': [
      'node', 'scripts/data/automation/run-canonical-schema-migration.mjs',
      '--output=reports/authorization/canonical/canonical-schema-v56-v58.result.json',
      '--apply=true',
    ],
    'canonical-item-group-bootstrap': [
      'node', 'scripts/data/item-groups/item-group-canonical-action.mjs',
      '--action-id=item-group-canonical-apply',
      '--input=reports/authorization/canonical/canonical-item-group-bootstrap.input.json',
      '--output=reports/authorization/canonical/canonical-item-group-bootstrap.result.json',
      '--progress-path=reports/backend-refresh/history/canonical-item-group-bootstrap.runtime/child-status.json',
    ],
    'automation-biomes-l1-policy-promotion': [
      'node', 'scripts/data/automation/run-automation-policy-decision.mjs',
      '--operation-id=automation-biomes-l1-policy-promotion',
      '--input=reports/authorization/canonical/automation-biomes-l1-policy-promotion.input.json',
      '--output=reports/authorization/canonical/automation-biomes-l1-policy-promotion.result.json',
      '--apply=true',
    ],
    'automation-biomes-first-l1': [
      'node', 'scripts/data/automation/run-biomes-automation-operation.mjs',
      '--operation-id=automation-biomes-first-l1',
      '--input=reports/authorization/canonical/automation-biomes-first-l1.bundle.json',
      '--output=reports/authorization/canonical/automation-biomes-first-l1.result.json',
      '--apply=true',
    ],
    'automation-biomes-second-l1': [
      'node', 'scripts/data/automation/run-biomes-automation-operation.mjs',
      '--operation-id=automation-biomes-second-l1',
      '--input=reports/authorization/canonical/automation-biomes-second-l1.bundle.json',
      '--output=reports/authorization/canonical/automation-biomes-second-l1.result.json',
      '--apply=true',
    ],
    'automation-biomes-l2-promotion': [
      'node', 'scripts/data/automation/run-automation-policy-decision.mjs',
      '--operation-id=automation-biomes-l2-promotion',
      '--input=reports/authorization/canonical/automation-biomes-l2-promotion.input.json',
      '--output=reports/authorization/canonical/automation-biomes-l2-promotion.result.json',
      '--apply=true',
    ],
    'automation-biomes-scheduler-activation': [
      'node', 'scripts/data/automation/run-automation-policy-decision.mjs',
      '--operation-id=automation-biomes-scheduler-activation',
      '--input=reports/authorization/canonical/automation-biomes-scheduler-activation.input.json',
      '--output=reports/authorization/canonical/automation-biomes-scheduler-activation.result.json',
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
