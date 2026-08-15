import test from 'node:test';
import assert from 'node:assert/strict';

import { buildIndependentEntityFetchArgs, buildIndependentEntityImportArgs, resolveEntities } from './independent-entity-sync-args.mjs';

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

test('single-domain selection is forwarded without enabling unrelated domains', () => {
  assert.deepEqual(buildIndependentEntityFetchArgs('npcs'), ['--mode=apply', '--entity=npcs']);
  assert.deepEqual(buildIndependentEntityImportArgs({ entity: 'armor_sets', apply: 'true' }), ['--entity=armor_sets']);
});

test('unknown or empty explicit entity selection fails closed', () => {
  assert.throws(() => resolveEntities(''), /Unsupported independent entity selection/);
  assert.throws(() => resolveEntities('buffs,unknown'), /Unsupported independent entity selection/);
});
