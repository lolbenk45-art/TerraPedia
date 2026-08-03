import assert from 'node:assert/strict';
import test from 'node:test';

import { buildShimmerSyncPreviewPlan } from './run-shimmer-sync-pipeline.mjs';

const manifestPath = `data/generated/shimmer/generations/${'a'.repeat(64)}/wiki-shimmer-manifest.json`;

test('shimmer sync pipeline passes only one verified bundle manifest to preview', () => {
  const plan = buildShimmerSyncPreviewPlan({ bundleManifest: manifestPath });

  assert.deepEqual(plan.extract, {
    scriptPath: 'scripts/data/pipeline/run-wiki-shimmer-extraction-pipeline.mjs',
    args: []
  });
  assert.deepEqual(plan.preview, {
    scriptPath: 'scripts/data/import/import-wiki-shimmer-to-db.mjs',
    args: ['--apply=false', `--bundle-manifest=${manifestPath}`]
  });
});

test('shimmer sync pipeline accepts the standard bundle-manifest CLI key', () => {
  const plan = buildShimmerSyncPreviewPlan({ 'bundle-manifest': manifestPath });

  assert.deepEqual(plan.preview.args, [
    '--apply=false',
    `--bundle-manifest=${manifestPath}`
  ]);
});

test('shimmer sync pipeline accepts an explicit preview apply=false option', () => {
  for (const apply of ['false', false]) {
    const plan = buildShimmerSyncPreviewPlan({ apply, bundleManifest: manifestPath });

    assert.deepEqual(plan.preview.args, [
      '--apply=false',
      `--bundle-manifest=${manifestPath}`
    ]);
  }
});

test('shimmer sync pipeline rejects apply, raw, and input bypass options', () => {
  for (const options of [
    { apply: 'true', bundleManifest: manifestPath },
    { raw: 'data/generated/wiki-shimmer.latest.json', bundleManifest: manifestPath },
    { input: 'data/generated/shimmer', bundleManifest: manifestPath }
  ]) {
    assert.throws(
      () => buildShimmerSyncPreviewPlan(options),
      /does not accept|preview inputs/i
    );
  }
});
