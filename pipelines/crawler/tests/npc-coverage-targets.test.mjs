import test from 'node:test';
import assert from 'node:assert/strict';

import { auditNpcCoverageTargets } from '../src/coverage/audit-npc-coverage-targets.mjs';
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

test('buildNpcCoverageTargets maps town pet aliases and town slime group pages to crawl titles', () => {
  const result = buildNpcCoverageTargets({
    standardizedPayload: {
      entity: 'npcs',
      records: [
        { id: 637, internalName: 'TownCat', name: 'Cat', extras: { townNPC: true } },
        { id: 638, internalName: 'TownDog', name: 'Dog', extras: { townNPC: true } },
        { id: 680, internalName: 'TownSlimePurple', name: 'Clumsy Slime', extras: { townNPC: true } },
        { id: 678, internalName: 'TownSlimeGreen', name: 'Cool Slime', extras: { townNPC: true } },
        { id: 681, internalName: 'TownSlimeRainbow', name: 'Diva Slime', extras: { townNPC: true } }
      ]
    },
    crawledEntityIds: ['cat', 'dog', 'clumsy-slime', 'cool-slime', 'diva-slime']
  });

  const cat = result.targets.find((target) => target.pageTitle === 'Town Cat');
  const dog = result.targets.find((target) => target.pageTitle === 'Town Dog');
  const townSlimes = result.targets.find((target) => target.pageTitle === 'Town Slimes');

  assert.equal(cat.entityId, 'cat');
  assert.deepEqual(cat.targetEntityIds, ['cat']);
  assert.equal(cat.alreadyCrawled, true);

  assert.equal(dog.entityId, 'dog');
  assert.deepEqual(dog.targetEntityIds, ['dog']);
  assert.equal(dog.alreadyCrawled, true);

  assert.equal(townSlimes.entityId, 'town-slimes');
  assert.deepEqual(townSlimes.targetEntityIds, ['clumsy-slime', 'cool-slime', 'diva-slime']);
  assert.deepEqual(
    townSlimes.standardizedRecords.map((record) => record.name),
    ['Cool Slime', 'Clumsy Slime', 'Diva Slime']
  );
  assert.equal(townSlimes.variantCount, 3);
  assert.equal(townSlimes.alreadyCrawled, true);
});

test('buildNpcCoverageTargets maps known plural NPC group pages instead of missing singular aliases', () => {
  const result = buildNpcCoverageTargets({
    standardizedPayload: {
      entity: 'npcs',
      records: [
        { id: 595, internalName: 'BlackDragonfly', name: 'Dragonfly' },
        { id: 596, internalName: 'BlueDragonfly', name: 'Dragonfly' },
        { id: 362, internalName: 'Duck', name: 'Duck' },
        { id: 363, internalName: 'Duck2', name: 'Duck' },
        { id: 366, internalName: 'ScorpionBlack', name: 'Scorpion' },
        { id: 367, internalName: 'Scorpion', name: 'Scorpion' },
        { id: 302, internalName: 'SlimeMasked', name: 'Slime' },
        { id: 333, internalName: 'SlimeRibbonWhite', name: 'Slime' },
        { id: 63, internalName: 'BlueJellyfish', name: 'Blue Jellyfish' },
        { id: 64, internalName: 'PinkJellyfish', name: 'Pink Jellyfish' },
        { id: 78, internalName: 'Mummy', name: 'Mummy' },
        { id: 79, internalName: 'DarkMummy', name: 'Dark Mummy' }
      ]
    },
    crawledEntityIds: []
  });

  const targetByTitle = new Map(result.targets.map((target) => [target.pageTitle, target]));

  assert.deepEqual(
    [...targetByTitle.keys()].sort(),
    ['Dragonflies', 'Ducks', 'Jellyfish', 'Mummies', 'Scorpions', 'Slimes']
  );
  assert.deepEqual(
    targetByTitle.get('Dragonflies').standardizedRecords.map((record) => record.internalName),
    ['BlackDragonfly', 'BlueDragonfly']
  );
  assert.deepEqual(
    targetByTitle.get('Ducks').standardizedRecords.map((record) => record.internalName),
    ['Duck', 'Duck2']
  );
  assert.deepEqual(
    targetByTitle.get('Mummies').standardizedRecords.map((record) => record.internalName),
    ['Mummy', 'DarkMummy']
  );
});

test('auditNpcCoverageTargets treats MediaWiki redirect aliases as present without closing loot ownership', async () => {
  const audit = await auditNpcCoverageTargets({
    targets: [
      {
        pageTitle: 'Fungo Fish',
        alreadyCrawled: false,
        standardizedRecords: [{ internalName: 'FungoFish' }],
      },
      {
        pageTitle: 'The Hungry',
        alreadyCrawled: false,
        standardizedRecords: [{ internalName: 'TheHungry' }],
      },
    ],
    fetchWikiPageMetadataBatchImpl: async ({ titles }) => titles.map((title) => {
      if (title === 'Fungo Fish') {
        return {
          requestedTitle: 'Fungo Fish',
          pageTitle: 'Jellyfish',
          pageId: 123,
          missing: false,
        };
      }
      return {
        requestedTitle: 'The Hungry',
        pageTitle: 'Wall of Flesh',
        pageId: 456,
        missing: false,
      };
    }),
  });

  assert.equal(audit.summary.missingTargets, 0);
  assert.equal(audit.summary.redirectTargets, 2);
  assert.deepEqual(
    audit.eligibleBatchTargets.map((target) => ({
      pageTitle: target.pageTitle,
      requestedTitles: target.requestedTitles,
      variantCount: target.variantCount,
    })),
    [
      { pageTitle: 'Jellyfish', requestedTitles: ['Fungo Fish'], variantCount: 1 },
      { pageTitle: 'Wall of Flesh', requestedTitles: ['The Hungry'], variantCount: 1 },
    ]
  );
});
