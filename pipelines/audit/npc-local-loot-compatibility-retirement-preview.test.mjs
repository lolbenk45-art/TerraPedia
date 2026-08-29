import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildNpcLocalLootCompatibilityRetirementPreview,
  LOCAL_VARIANT_TARGETS,
} from './npc-local-loot-compatibility-retirement-preview.mjs';

function local(overrides = {}) {
  return {
    id: 10,
    npcId: 1,
    npcInternalName: 'Zombie',
    itemId: 2,
    itemInternalName: 'Gel',
    sourceItemId: 2,
    dropSourceKind: 'npc_drop',
    quantityText: '1',
    chanceText: '10%',
    quantityMin: null,
    quantityMax: null,
    chanceValue: null,
    conditions: null,
    status: 1,
    deleted: 0,
    ...overrides,
  };
}

test('retains the lowest id and targets only exact duplicate local tuples', () => {
  const preview = buildNpcLocalLootCompatibilityRetirementPreview({
    localRows: [
      local({ id: 10 }),
      local({ id: 20 }),
      local({ id: 30, chanceText: '20%' }),
    ],
    relationRows: [],
    variantTargets: [],
  });

  assert.deepEqual(preview.duplicateGroups, [{
    identity: '[1,2,2,"npc_drop","1","10%",null]',
    survivorLocalId: 10,
    targetLocalIds: [20],
  }]);
  assert.deepEqual(preview.targets.map((row) => row.localId), [20]);
});

test('targets a frozen wiki variant only when an accepted relation and local survivor exist', () => {
  const target = LOCAL_VARIANT_TARGETS[0];
  const preview = buildNpcLocalLootCompatibilityRetirementPreview({
    localRows: [
      local({
        id: 40,
        npcId: target.npcId,
        npcInternalName: target.npcInternalName,
        itemId: target.itemId,
        itemInternalName: target.itemInternalName,
        sourceItemId: target.itemId,
        quantityText: target.candidateQuantityText,
        chanceText: target.candidateChanceText,
      }),
      local({
        id: 41,
        npcId: target.npcId,
        npcInternalName: target.npcInternalName,
        itemId: target.itemId,
        itemInternalName: target.itemInternalName,
        sourceItemId: target.itemId,
        quantityText: target.survivorQuantityText,
        chanceText: target.survivorChanceText,
      }),
    ],
    relationRows: [{
      recordKey: target.survivorRecordKey,
      npcInternalName: target.npcInternalName,
      itemInternalName: target.itemInternalName,
      quantityText: target.survivorQuantityText,
      chanceText: target.survivorChanceText,
      sourceProvider: 'terraria.wiki.gg',
      status: 1,
      deleted: 0,
    }],
    variantTargets: [target],
  });

  assert.equal(preview.variantTargets.length, 1);
  assert.equal(preview.variantTargets[0].localId, 40);
  assert.equal(preview.targets.length, 1);
});

test('quarantines a variant when the accepted relation is missing', () => {
  const target = LOCAL_VARIANT_TARGETS[0];
  const preview = buildNpcLocalLootCompatibilityRetirementPreview({
    localRows: [local({
      id: 40,
      npcId: target.npcId,
      npcInternalName: target.npcInternalName,
      itemId: target.itemId,
      itemInternalName: target.itemInternalName,
      sourceItemId: target.itemId,
      quantityText: target.candidateQuantityText,
      chanceText: target.candidateChanceText,
    })],
    relationRows: [],
    variantTargets: [target],
  });

  assert.equal(preview.quarantine.variantMissingSurvivor.length, 1);
  assert.equal(preview.targets.length, 0);
});
