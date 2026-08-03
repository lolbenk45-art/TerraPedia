import test from 'node:test';
import assert from 'node:assert/strict';

import { buildShimmerImportArgs } from './shimmer-sync-args.mjs';

const inputContractPath = 'reports/authorization/canonical/canonical-shimmer-import.input.json';

test('buildShimmerImportArgs requires the canonical private input contract', () => {
  assert.throws(
    () => buildShimmerImportArgs({}),
    /input.*contract/i
  );
});

test('buildShimmerImportArgs defaults to preview and never exposes direct apply or a bundle manifest', () => {
  assert.deepEqual(
    buildShimmerImportArgs({
      inputContract: inputContractPath
    }),
    [
      '--apply=false',
      `--input-contract=${inputContractPath}`
    ]
  );
  assert.throws(
    () => buildShimmerImportArgs({
      inputContract: inputContractPath,
      'input-contract': 'reports/authorization/canonical/other.input.json'
    }),
    /conflicting input contract/i
  );
  assert.throws(
    () => buildShimmerImportArgs({
      apply: 'true',
      inputContract: inputContractPath
    }),
    /direct apply/i
  );
  assert.throws(
    () => buildShimmerImportArgs({ bundleManifest: generationManifestPath() }),
    /bundle manifest.*forbidden/i
  );
});

function generationManifestPath() {
  return `data/generated/shimmer/generations/${'a'.repeat(64)}/wiki-shimmer-manifest.json`;
}

test('buildShimmerImportArgs rejects non-canonical input contracts', () => {
  assert.throws(
    () => buildShimmerImportArgs({
      inputContract: 'reports/authorization/canonical/other.input.json'
    }),
    /canonical.*input contract/i
  );
});
