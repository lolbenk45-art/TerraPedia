import test from 'node:test';
import assert from 'node:assert/strict';

import { canonicalizeNpc } from '../src/phases/canonicalize.mjs';

test('canonicalizeNpc projects consumer-facing thin fields', () => {
  const canonical = canonicalizeNpc({
    display: { name: 'Goblin Tinkerer' },
    summary: {
      leadText: 'Goblin Tinkerer is a helpful NPC who can reforge items.',
      sourceDescription: 'A helpful NPC who can reforge items.'
    },
    profile: {
      kind: 'NPC',
      subtypes: ['Goblin'],
      environment: ['Cavern', 'Valid house'],
      boundVariantName: 'Bound Goblin',
      shimmerForm: { present: true, args: ['Goblin Tinkerer', 'male'] }
    },
    shop: {
      items: [{ name: 'Rocket Boots', valueText: '5', availabilityNote: 'Sold after Goblin Army' }]
    },
    happiness: {
      sourceTemplatePresent: true,
      notes: ['loves=[[Mechanic]]']
    },
    relationships: {
      relatedNpcs: ['Mechanic'],
      relatedItems: ['Rocket Boots'],
      relatedBiomes: ['Underground']
    }
  });

  assert.equal(canonical.summary, 'Goblin Tinkerer is a helpful NPC who can reforge items.');
  assert.deepEqual(canonical.shop.items.map((item) => item.name), ['Rocket Boots']);
});
