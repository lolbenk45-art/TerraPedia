import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveBossLootOwnerContext } from './boss-loot-owner.mjs';

test('resolveBossLootOwnerContext marks Mechdusa as a reference-only composite boss without npc owner', () => {
  assert.deepEqual(resolveBossLootOwnerContext({
    code: 'MECHDUSA',
    nameEn: 'Mechdusa',
    members: [],
  }), {
    ownerNpc: null,
    ownerMode: 'reference_only_composite_without_npc_owner',
    skipReason: 'reference_only_composite_boss_without_npc_owner',
  });
});

test('resolveBossLootOwnerContext resolves a normal boss owner npc', () => {
  assert.deepEqual(resolveBossLootOwnerContext({
    code: 'KING_SLIME',
    nameEn: 'King Slime',
    members: [
      { id: 116, bossRole: 'primary', internalName: 'KingSlime' },
    ],
  }), {
    ownerNpc: { id: 116, bossRole: 'primary', internalName: 'KingSlime' },
    ownerMode: 'assigned',
    skipReason: null,
  });
});
