import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDependencyEvidence } from './build-local-formal-catch-up-dependency-evidence.mjs';

const hash = (char) => `sha256:${char.repeat(64)}`;

test('builds complete item stable-key and row-hash closure from a frozen module payload', () => {
  const result = buildDependencyEvidence({
    domain: 'items',
    sourcePayload: {
      moduleContent: 'ignored',
      records: [
        { id: 1, internalName: 'IronPickaxe', name: 'Iron Pickaxe' },
        { id: 2, internalName: 'DirtBlock', name: 'Dirt Block' },
      ],
    },
  });

  assert.equal(result.complete, true);
  assert.equal(result.unresolvedCount, 0);
  assert.equal(result.duplicateCount, 0);
  assert.equal(result.rowCount, 2);
  assert.match(result.stableKeyHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(result.rows[0].stableKey, 'item:1:IronPickaxe');
  assert.match(result.rows[0].rowHash, /^sha256:[a-f0-9]{64}$/);
});

test('closes armor item dependencies and reports unresolved IDs without admitting the domain', () => {
  const result = buildDependencyEvidence({
    domain: 'armor_sets',
    sourcePayload: {
      records: [{ textKey: 'ArmorSetBonus.Test', uniqueItemIds: [0, 1, 2, 99] }],
    },
    dependencyPayloads: {
      items: { records: [{ id: 1, internalName: 'One' }, { id: 2, internalName: 'Two' }] },
    },
  });

  assert.equal(result.complete, false);
  assert.equal(result.unresolvedCount, 1);
  assert.deepEqual(result.unresolved[0], { dependency: 'items', id: 99, stableKey: 'item:99' });
  assert.equal(result.duplicateCount, 0);
  assert.equal(result.rows[0].stableKey, 'armor-set:ArmorSetBonus.Test');
  assert.match(result.sourceHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(hash('a').startsWith('sha256:'), true);
});
