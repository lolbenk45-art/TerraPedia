import test from 'node:test';
import assert from 'node:assert/strict';

import { buildShimmerImportArgs } from './shimmer-sync-args.mjs';

test('buildShimmerImportArgs requires one content-addressed bundle manifest', () => {
  assert.throws(
    () => buildShimmerImportArgs({}),
    /bundleManifest/i
  );
});

test('buildShimmerImportArgs defaults to preview and never exposes direct apply', () => {
  assert.deepEqual(
    buildShimmerImportArgs({
      bundleManifest: generationManifestPath()
    }),
    [
      '--apply=false',
      `--bundle-manifest=${generationManifestPath()}`
    ]
  );
  assert.throws(
    () => buildShimmerImportArgs({
      bundleManifest: generationManifestPath(),
      'bundle-manifest': `data/generated/shimmer/generations/${'b'.repeat(64)}/wiki-shimmer-manifest.json`
    }),
    /conflicting bundle manifest/i
  );
  assert.throws(
    () => buildShimmerImportArgs({
      apply: 'true',
      bundleManifest: generationManifestPath()
    }),
    /direct apply/i
  );
});

function generationManifestPath() {
  return `data/generated/shimmer/generations/${'a'.repeat(64)}/wiki-shimmer-manifest.json`;
}

test('buildShimmerImportArgs rejects mutable latest pointers', () => {
  assert.throws(
    () => buildShimmerImportArgs({
      bundleManifest: 'data/generated/shimmer/wiki-shimmer-manifest.latest.json'
    }),
    /latest|content-addressed/i
  );
});
