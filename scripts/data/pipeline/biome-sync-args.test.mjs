import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBiomeImportArgs, shouldRunBiomeImport } from './biome-sync-args.mjs';

test('shouldRunBiomeImport only enables import in apply mode', () => {
  assert.equal(shouldRunBiomeImport({}), false);
  assert.equal(shouldRunBiomeImport({ apply: 'false' }), false);
  assert.equal(shouldRunBiomeImport({ apply: 'true' }), true);
});

test('buildBiomeImportArgs passes wiki biomes file when apply mode is enabled', () => {
  assert.deepEqual(
    buildBiomeImportArgs({ wikiBiomesFile: 'data/generated/wiki-biomes.importable.latest.json' }),
    ['--wiki-biomes-file=data/generated/wiki-biomes.importable.latest.json']
  );
});
