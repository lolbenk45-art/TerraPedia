import assert from 'node:assert/strict';
import test from 'node:test';

import { buildShimmerSyncPreviewPlan } from './run-shimmer-sync-pipeline.mjs';

const inputContractPath = 'reports/authorization/canonical/canonical-shimmer-import.input.json';

test('shimmer sync pipeline previews only an existing canonical input contract', () => {
  const plan = buildShimmerSyncPreviewPlan({ inputContract: inputContractPath });

  assert.deepEqual(plan.preview, {
    scriptPath: 'scripts/data/import/import-wiki-shimmer-to-db.mjs',
    args: ['--apply=false', `--input-contract=${inputContractPath}`]
  });
  assert.equal('extract' in plan, false);
});

test('shimmer sync pipeline accepts the standard input-contract CLI key', () => {
  const plan = buildShimmerSyncPreviewPlan({ 'input-contract': inputContractPath });

  assert.deepEqual(plan.preview.args, [
    '--apply=false',
    `--input-contract=${inputContractPath}`
  ]);
});

test('shimmer sync pipeline accepts an explicit preview apply=false option', () => {
  for (const apply of ['false', false]) {
    const plan = buildShimmerSyncPreviewPlan({ apply, inputContract: inputContractPath });

    assert.deepEqual(plan.preview.args, [
      '--apply=false',
      `--input-contract=${inputContractPath}`
    ]);
  }
});

test('shimmer sync pipeline rejects apply, raw, input, and direct manifest bypass options', () => {
  for (const options of [
    { apply: 'true', inputContract: inputContractPath },
    { raw: 'data/generated/wiki-shimmer.latest.json', inputContract: inputContractPath },
    { input: 'data/generated/shimmer', inputContract: inputContractPath },
    { bundleManifest: `data/generated/shimmer/generations/${'a'.repeat(64)}/wiki-shimmer-manifest.json` }
  ]) {
    assert.throws(
      () => buildShimmerSyncPreviewPlan(options),
      /does not accept|preview inputs|bundle manifest/i
    );
  }
});
