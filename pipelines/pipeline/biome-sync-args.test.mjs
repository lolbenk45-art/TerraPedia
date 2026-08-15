import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { buildBiomeImportArgs, shouldRunBiomeImport } from './biome-sync-args.mjs';

test('shouldRunBiomeImport only enables import in apply mode', () => {
  assert.equal(shouldRunBiomeImport({}), false);
  assert.equal(shouldRunBiomeImport({ apply: 'false' }), false);
  assert.equal(shouldRunBiomeImport({ apply: 'true' }), true);
});

test('buildBiomeImportArgs passes wiki biomes file when apply mode is enabled', () => {
  assert.deepEqual(
    buildBiomeImportArgs({ apply: 'true', wikiBiomesFile: 'data/generated/wiki-biomes.importable.latest.json' }),
    [
      '--apply=true',
      '--wiki-biomes-file=data/generated/wiki-biomes.importable.latest.json',
    ]
  );
});

test('biome sync pipeline uses biome-only importer', () => {
  const source = new URL('./run-biome-sync-pipeline.mjs', import.meta.url);
  const text = fs.readFileSync(source, 'utf8');

  assert.match(text, /scripts\/data\/import\/import-biomes-to-db\.mjs/);
  assert.doesNotMatch(text, /scripts\/data\/import\/import-standardized-to-db\.mjs/);
});
