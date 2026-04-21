import test from 'node:test';
import assert from 'node:assert/strict';

import { buildIndependentEntityFetchArgs, buildIndependentEntityImportArgs } from './independent-entity-sync-args.mjs';

test('buildIndependentEntityFetchArgs refreshes mature independent entity sources', () => {
  assert.deepEqual(
    buildIndependentEntityFetchArgs(),
    [
      '--mode=apply',
      '--entity=buffs,projectiles,armor_sets'
    ]
  );
});

test('buildIndependentEntityImportArgs defaults to dry-run mode', () => {
  assert.deepEqual(buildIndependentEntityImportArgs({}), ['--dry-run=true']);
});

test('buildIndependentEntityImportArgs supports explicit apply mode', () => {
  assert.deepEqual(buildIndependentEntityImportArgs({ apply: 'true' }), []);
});
