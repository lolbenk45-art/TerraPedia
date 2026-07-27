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

test('manifest builder covers exactly the operations with real governed entrypoints', () => {
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

test('manifest builder refuses missing executors and invalid NPC limits', () => {
  for (const operationId of CANONICAL_CUTOVER_OPERATION_IDS.filter((id) => (
    CANONICAL_OPERATION_ENTRYPOINTS[id] === null
  ))) {
    assert.throws(
      () => buildCanonicalOperationExecutionManifest({ repoRoot, operationId }),
      /no governed executor/i,
      operationId,
    );
  }
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
