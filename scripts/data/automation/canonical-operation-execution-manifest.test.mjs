import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  CANONICAL_EXECUTABLE_OPERATION_IDS,
  buildCanonicalOperationExecutionManifest,
  writeCanonicalOperationExecutionManifest,
} from './canonical-operation-execution-manifest.mjs';
import {
  CANONICAL_CUTOVER_OPERATION_IDS,
  CANONICAL_OPERATION_ENTRYPOINTS,
} from './build-canonical-cutover-authorization.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../../..');

test('manifest builder covers 16 governed operations and keeps NPC apply explicitly fail closed', () => {
  assert.equal(CANONICAL_CUTOVER_OPERATION_IDS.length, 17);
  assert.equal(CANONICAL_EXECUTABLE_OPERATION_IDS.length, 16);
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
    });
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.operationId, operationId);
    assert.equal(manifest.command[0], 'node');
    assert.equal(manifest.command[1], CANONICAL_OPERATION_ENTRYPOINTS[operationId]);
    assert.ok(manifest.codeBundleEntries.length >= 2, operationId);
    assert.ok(manifest.codeBundleEntries.some((entry) => entry.path === manifest.command[1]));
    for (const entry of manifest.codeBundleEntries) {
      const bytes = fs.readFileSync(path.join(repoRoot, entry.path));
      const expected = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
      assert.equal(entry.contentHash, expected, `${operationId}:${entry.path}`);
    }
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
