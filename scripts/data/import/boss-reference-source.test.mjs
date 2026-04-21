import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveReferenceOnlyBossSource } from './boss-reference-source.mjs';

test('resolveReferenceOnlyBossSource recognizes Mechdusa as a reference-only composite boss', () => {
  assert.deepEqual(resolveReferenceOnlyBossSource('Mechdusa'), {
    sourceMode: 'reference',
    referenceBossCodes: ['THE_TWINS', 'THE_DESTROYER', 'SKELETRON_PRIME'],
  });
});

test('resolveReferenceOnlyBossSource returns null for normal bosses', () => {
  assert.equal(resolveReferenceOnlyBossSource('King Slime'), null);
});
