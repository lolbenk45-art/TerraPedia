import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildArmorLocalSourceManifest,
  sanitizeArmorImageRows,
} from './armor-canonical-t1-acceptance.mjs';

test('local Armor source manifest binds the 64-set core and records partial image coverage', () => {
  const result = buildArmorLocalSourceManifest({ repoRoot: process.cwd() });
  assert.equal(result.sourceMode, 'local-offline-authorized');
  assert.equal(result.wikiUnchanged, false);
  assert.equal(result.counts.standardizedSets, 64);
  assert.equal(result.counts.wikiDefinitions, 88);
  assert.equal(result.counts.definitionMapRows, 151);
  assert.equal(result.counts.uniqueItemIds, 243);
  assert.equal(result.counts.matchedImageRows, 175);
  assert.equal(result.counts.matchedImageSetKeys, 33);
  assert.equal(result.counts.missingImageSetKeys, 31);
  assert.ok(result.sourceHashes.standardized.startsWith('sha256:'));
  assert.ok(result.missingImageSetKeys.includes('ArmorSetBonus.Shroomite'));
});

test('Armor image metadata cannot carry a production cached URL into the isolated payload', () => {
  const rows = sanitizeArmorImageRows([
    { textKey: 'ArmorSetBonus.Wood', cachedUrl: 'http://localhost:9000/terrapedia-images/items/a.png', sourceFileTitle: 'Wood.png' },
  ]);
  assert.deepEqual(rows, [
    { textKey: 'ArmorSetBonus.Wood', cachedUrl: null, sourceFileTitle: 'Wood.png' },
  ]);
});
