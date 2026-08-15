import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMaintItemStackUpdates } from './sync-standardized-item-stack-to-maint.mjs';

test('buildMaintItemStackUpdates emits updates for items missing maint stack_size from standardized stack data', () => {
  const updates = buildMaintItemStackUpdates({
    standardizedItems: [
      { internalName: 'Torch', stack: { stackSize: 9999 } },
      { internalName: 'IronPickaxe', stack: { stackSize: 1 } },
      { internalName: 'NoStack', stack: {} },
    ],
    maintItems: [
      { id: 1, internal_name: 'Torch', stack_size: null },
      { id: 2, internal_name: 'IronPickaxe', stack_size: 1 },
      { id: 3, internal_name: 'NoStack', stack_size: null },
    ],
  });

  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0], {
    id: 1,
    internalName: 'Torch',
    stackSize: 9999,
  });
});
