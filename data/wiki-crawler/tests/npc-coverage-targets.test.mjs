import test from 'node:test';
import assert from 'node:assert/strict';

import { buildNpcCoverageTargets } from '../src/coverage/build-npc-coverage-targets.mjs';

test('buildNpcCoverageTargets groups duplicate standardized npc names into one crawl target and marks priorities', () => {
  const result = buildNpcCoverageTargets({
    standardizedPayload: {
      entity: 'npcs',
      records: [
        { id: -55, internalName: 'BigRainZombie', name: 'Zombie' },
        { id: -54, internalName: 'SmallRainZombie', name: 'Zombie' },
        { id: 17, internalName: 'Merchant', name: 'Merchant', flags: { friendly: true }, extras: { townNPC: true } },
        { id: 4, internalName: 'EyeofCthulhu', name: 'Eye of Cthulhu', flags: { boss: true } }
      ]
    },
    crawledEntityIds: ['merchant']
  });

  assert.equal(result.summary.totalStandardized, 4);
  assert.equal(result.summary.totalTargets, 3);
  assert.equal(result.summary.duplicateNameGroups, 1);

  const zombie = result.targets.find((target) => target.pageTitle === 'Zombie');
  const merchant = result.targets.find((target) => target.pageTitle === 'Merchant');
  const eye = result.targets.find((target) => target.pageTitle === 'Eye of Cthulhu');

  assert.equal(zombie.standardizedRecords.length, 2);
  assert.equal(zombie.priority, 'p1_enemy');
  assert.equal(merchant.priority, 'p0_town');
  assert.equal(merchant.alreadyCrawled, true);
  assert.equal(eye.priority, 'p0_boss');
});
