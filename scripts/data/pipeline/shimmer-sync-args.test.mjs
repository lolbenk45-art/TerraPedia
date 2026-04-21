import test from 'node:test';
import assert from 'node:assert/strict';

import { buildShimmerImportArgs } from './shimmer-sync-args.mjs';

test('buildShimmerImportArgs defaults to dry-run mode', () => {
  assert.deepEqual(buildShimmerImportArgs({}), ['--apply=false']);
});

test('buildShimmerImportArgs supports explicit apply mode', () => {
  assert.deepEqual(buildShimmerImportArgs({ apply: 'true' }), ['--apply=true']);
});

test('buildShimmerImportArgs forwards input directory and raw path', () => {
  assert.deepEqual(
    buildShimmerImportArgs({
      apply: 'true',
      input: 'data/generated/shimmer',
      raw: 'data/generated/wiki-shimmer.latest.json'
    }),
    [
      '--apply=true',
      '--input=data/generated/shimmer',
      '--raw=data/generated/wiki-shimmer.latest.json'
    ]
  );
});
