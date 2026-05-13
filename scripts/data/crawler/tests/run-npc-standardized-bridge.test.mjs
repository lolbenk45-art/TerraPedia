import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runNpcStandardizedBridge } from '../src/bridge/run-npc-standardized-bridge.mjs';
import { parseRunNpcStandardizedBridgeArgs } from '../src/bridge/run-npc-standardized-bridge.mjs';

test('parseRunNpcStandardizedBridgeArgs honors explicit output roots', () => {
  assert.deepEqual(
    parseRunNpcStandardizedBridgeArgs([
      '--domain=npc',
      '--source-standardized-dir=C:/tmp/source-standardized',
      '--crawler-output-root=C:/tmp/crawler-output',
      '--crawler-overlay-root=C:/tmp/crawler-overlay',
      '--crawler-overlay-entity-id=skeleton,jellyfish',
      '--output-root=C:/tmp/generated-bridge'
    ]),
    {
      domain: 'npc',
      sourceStandardizedDir: 'C:/tmp/source-standardized',
      crawlerOutputRoot: 'C:/tmp/crawler-output',
      crawlerOverlayRoots: ['C:/tmp/crawler-overlay'],
      crawlerOverlayEntityIds: ['skeleton', 'jellyfish'],
      outputRoot: 'C:/tmp/generated-bridge'
    }
  );
});

test('runNpcStandardizedBridge generates a standardized-compatible bridge dir and report from crawler outputs', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'npc-bridge-run-'));
  const sourceStandardizedDir = path.join(tempRoot, 'source-standardized');
  const crawlerOutputRoot = path.join(tempRoot, 'crawler-output');
  const outputRoot = path.join(tempRoot, 'generated');

  await fs.mkdir(path.join(sourceStandardizedDir), { recursive: true });
  await fs.mkdir(path.join(crawlerOutputRoot, 'normalized-light', 'npc'), { recursive: true });
  await fs.mkdir(path.join(crawlerOutputRoot, 'audit', 'npc'), { recursive: true });

  await fs.writeFile(path.join(sourceStandardizedDir, 'npcs.standardized.json'), JSON.stringify({
    entity: 'npcs',
    records: [
      { id: 107, internalName: 'GoblinTinkerer', name: 'Goblin Tinkerer' },
      { id: 480, internalName: 'Medusa', name: 'Medusa' },
      { id: 999, internalName: 'LostGirl', name: 'Lost Girl' }
    ]
  }, null, 2));

  for (const entity of ['items', 'buffs', 'projectiles', 'armor_sets']) {
    await fs.writeFile(path.join(sourceStandardizedDir, `${entity}.standardized.json`), JSON.stringify({
      entity,
      records: []
    }, null, 2));
  }

  await fs.writeFile(path.join(sourceStandardizedDir, '_manifest.standardized.json'), JSON.stringify({
    generatedAt: '2026-04-16T00:00:00.000Z',
    datasets: ['npcs', 'items', 'buffs', 'projectiles', 'armor_sets']
  }, null, 2));

  await fs.writeFile(path.join(crawlerOutputRoot, 'normalized-light', 'npc', 'goblin-tinkerer.latest.json'), JSON.stringify({
    entityId: 'goblin-tinkerer',
    source: { pageTitle: 'Goblin Tinkerer' },
    display: { name: 'Goblin Tinkerer' },
    summary: { leadText: 'Helpful NPC vendor.' },
    profile: { kind: 'NPC' },
    shop: {
      items: [],
      normalizedRows: [
        {
          relationType: 'shop',
          itemName: 'Rocket Boots',
          priceText: '5 gold',
          conditionText: 'After Goblin Army'
        }
      ]
    },
    loot: [
      {
        relationType: 'loot',
        itemName: 'Tinkerers Workshop',
        chanceText: '100%',
        quantityText: '1'
      }
    ],
    backfillCandidates: [
      {
        candidateKey: 'c'.repeat(64),
        domain: 'npc_projectile_relation',
        entityType: 'npc',
        entityInternalName: 'goblin-tinkerer',
        missingField: 'projectileId',
        recommendedAction: 'crawl_npc_page',
        evidenceJson: [{ sourcePage: 'Goblin Tinkerer' }],
        status: 'open'
      }
    ],
    happiness: { sourceTemplatePresent: false, notes: [] },
    relationships: { relatedNpcs: [], relatedItems: [], relatedBiomes: [] },
    contentBlocks: { dialogue: '', tips: '', history: '' }
  }, null, 2));

  await fs.writeFile(path.join(crawlerOutputRoot, 'normalized-light', 'npc', 'medusa.latest.json'), JSON.stringify({
    entityId: 'medusa',
    source: { pageTitle: 'Medusa' },
    display: { name: 'Medusa' },
    summary: { leadText: 'Hardmode enemy.' },
    profile: { kind: 'enemy' },
    shop: { items: [] },
    happiness: { sourceTemplatePresent: false, notes: [] },
    relationships: { relatedNpcs: [], relatedItems: [], relatedBiomes: [] },
    contentBlocks: { dialogue: '', tips: '', history: '' }
  }, null, 2));

  await fs.writeFile(path.join(crawlerOutputRoot, 'audit', 'npc', 'goblin-tinkerer.latest.json'), JSON.stringify({
    status: 'pass',
    reasons: []
  }, null, 2));
  await fs.writeFile(path.join(crawlerOutputRoot, 'audit', 'npc', 'medusa.latest.json'), JSON.stringify({
    status: 'warn',
    reasons: ['missing section coverage']
  }, null, 2));

  const result = await runNpcStandardizedBridge({
    sourceStandardizedDir,
    crawlerOutputRoot,
    outputRoot
  });

  assert.equal(result.summary.crawlerNpcTotal, 2);
  assert.equal(result.summary.matched, 2);
  assert.equal(result.summary.unenrichedStandardized, 1);

  const bridgedNpcs = JSON.parse(await fs.readFile(path.join(result.standardizedDir, 'npcs.standardized.json'), 'utf8'));
  const report = JSON.parse(await fs.readFile(result.reportPath, 'utf8'));
  const medusa = bridgedNpcs.records.find((record) => record.internalName === 'Medusa');
  const goblin = bridgedNpcs.records.find((record) => record.internalName === 'GoblinTinkerer');

  assert.equal(goblin.wikiCrawler.shop[0].itemName, 'Rocket Boots');
  assert.equal(goblin.wikiCrawler.loot[0].itemName, 'Tinkerers Workshop');
  assert.equal(goblin.wikiCrawler.backfillCandidates[0].candidateKey, 'c'.repeat(64));
  assert.equal(medusa.wikiCrawler.audit.status, 'warn');
  assert.equal(medusa.wikiCrawler.sourceMetadata.entityId, 'medusa');
  assert.equal(report.matched, 2);
  assert.equal(report.unenrichedStandardized, 1);
});

test('runNpcStandardizedBridge can merge explicit overlay evidence roots by entity id', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'npc-bridge-overlay-'));
  const sourceStandardizedDir = path.join(tempRoot, 'source-standardized');
  const crawlerOutputRoot = path.join(tempRoot, 'crawler-output');
  const overlayRoot = path.join(tempRoot, 'overlay-output');
  const outputRoot = path.join(tempRoot, 'generated');

  await fs.mkdir(sourceStandardizedDir, { recursive: true });
  for (const root of [crawlerOutputRoot, overlayRoot]) {
    await fs.mkdir(path.join(root, 'normalized-light', 'npc'), { recursive: true });
    await fs.mkdir(path.join(root, 'audit', 'npc'), { recursive: true });
  }

  await fs.writeFile(path.join(sourceStandardizedDir, 'npcs.standardized.json'), JSON.stringify({
    entity: 'npcs',
    records: [
      { id: 3, internalName: 'Zombie', name: 'Zombie', imageFileTitle: 'Zombie.gif' },
      { id: 322, internalName: 'SkeletonTopHat', name: 'Skeleton', imageFileTitle: 'Top Hat Skeleton.gif' },
      { id: 256, internalName: 'FungoFish', name: 'Fungo Fish', imageFileTitle: 'Fungo Fish.gif' }
    ]
  }, null, 2));

  for (const entity of ['items', 'buffs', 'projectiles', 'armor_sets']) {
    await fs.writeFile(path.join(sourceStandardizedDir, `${entity}.standardized.json`), JSON.stringify({ entity, records: [] }, null, 2));
  }
  await fs.writeFile(path.join(sourceStandardizedDir, '_manifest.standardized.json'), JSON.stringify({
    generatedAt: '2026-05-12T00:00:00.000Z',
    datasets: ['npcs', 'items', 'buffs', 'projectiles', 'armor_sets']
  }, null, 2));

  await fs.writeFile(path.join(crawlerOutputRoot, 'normalized-light', 'npc', 'zombie.latest.json'), JSON.stringify({
    entityId: 'zombie',
    source: { pageTitle: 'Zombie' },
    display: { name: 'Zombie' },
    sourceInfoboxes: [{ autoId: '3', image: 'Zombie.gif', name: '' }],
    loot: [{ relationType: 'loot', itemName: 'Shackle', sourceInfobox: { autoId: '3', image: 'Zombie.gif', name: '' } }]
  }, null, 2));
  await fs.writeFile(path.join(crawlerOutputRoot, 'audit', 'npc', 'zombie.latest.json'), JSON.stringify({ status: 'pass', reasons: [] }, null, 2));

  await fs.writeFile(path.join(overlayRoot, 'normalized-light', 'npc', 'skeleton.latest.json'), JSON.stringify({
    entityId: 'skeleton',
    source: { pageTitle: 'Skeleton' },
    display: { name: 'Skeleton' },
    sourceInfoboxes: [
      { autoId: '21', image: 'Skeleton.gif', name: '' },
      { autoId: '322', image: 'Top Hat Skeleton.gif', name: '' }
    ],
    loot: [{ relationType: 'loot', itemName: 'Hook', sourceInfobox: { autoId: '21', image: 'Skeleton.gif', name: '' } }]
  }, null, 2));
  await fs.writeFile(path.join(overlayRoot, 'audit', 'npc', 'skeleton.latest.json'), JSON.stringify({ status: 'pass', reasons: [] }, null, 2));

  await fs.writeFile(path.join(overlayRoot, 'normalized-light', 'npc', 'jellyfish.latest.json'), JSON.stringify({
    entityId: 'jellyfish',
    source: { pageTitle: 'Jellyfish' },
    display: { name: 'Jellyfish' },
    sourceInfoboxes: [
      { autoId: '63', image: 'Blue Jellyfish.gif', name: '' },
      { autoId: '256', image: 'Fungo Fish.gif', name: '' }
    ],
    loot: [{ relationType: 'loot', itemName: 'Glowstick', sourceInfobox: { autoId: '63', image: 'Blue Jellyfish.gif', name: '' } }]
  }, null, 2));
  await fs.writeFile(path.join(overlayRoot, 'audit', 'npc', 'jellyfish.latest.json'), JSON.stringify({ status: 'pass', reasons: [] }, null, 2));

  const result = await runNpcStandardizedBridge({
    sourceStandardizedDir,
    crawlerOutputRoot,
    crawlerOverlayRoots: [overlayRoot],
    crawlerOverlayEntityIds: ['skeleton'],
    outputRoot
  });

  const bridgedNpcs = JSON.parse(await fs.readFile(path.join(result.standardizedDir, 'npcs.standardized.json'), 'utf8'));
  const zombie = bridgedNpcs.records.find((record) => record.internalName === 'Zombie');
  const skeletonTopHat = bridgedNpcs.records.find((record) => record.internalName === 'SkeletonTopHat');
  const fungoFish = bridgedNpcs.records.find((record) => record.internalName === 'FungoFish');

  assert.equal(result.summary.crawlerNpcTotal, 2);
  assert.equal(result.summary.matched, 2);
  assert.equal(zombie.wikiCrawler.pageTitle, 'Zombie');
  assert.deepEqual(skeletonTopHat.wikiCrawler.sourceInfoboxes, [{ autoId: '322', image: 'Top Hat Skeleton.gif', name: '' }]);
  assert.equal(skeletonTopHat.wikiCrawler.sourceLootRowsTotal, 1);
  assert.equal(skeletonTopHat.wikiCrawler.loot.length, 0);
  assert.equal(fungoFish.wikiCrawler, undefined);
});

test('runNpcStandardizedBridge expands town slime group members into per-entity bridge matches', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'npc-bridge-town-slimes-'));
  const sourceStandardizedDir = path.join(tempRoot, 'source-standardized');
  const crawlerOutputRoot = path.join(tempRoot, 'crawler-output');
  const outputRoot = path.join(tempRoot, 'generated');

  await fs.mkdir(path.join(sourceStandardizedDir), { recursive: true });
  await fs.mkdir(path.join(crawlerOutputRoot, 'normalized-light', 'npc'), { recursive: true });
  await fs.mkdir(path.join(crawlerOutputRoot, 'audit', 'npc'), { recursive: true });

  await fs.writeFile(path.join(sourceStandardizedDir, 'npcs.standardized.json'), JSON.stringify({
    entity: 'npcs',
    records: [
      { id: 684, internalName: 'TownSlimeCopper', name: 'Squire Slime' },
      { id: 680, internalName: 'TownSlimePurple', name: 'Clumsy Slime' }
    ]
  }, null, 2));

  for (const entity of ['items', 'buffs', 'projectiles', 'armor_sets']) {
    await fs.writeFile(path.join(sourceStandardizedDir, `${entity}.standardized.json`), JSON.stringify({
      entity,
      records: []
    }, null, 2));
  }

  await fs.writeFile(path.join(sourceStandardizedDir, '_manifest.standardized.json'), JSON.stringify({
    generatedAt: '2026-04-19T00:00:00.000Z',
    datasets: ['npcs', 'items', 'buffs', 'projectiles', 'armor_sets']
  }, null, 2));

  await fs.writeFile(path.join(crawlerOutputRoot, 'normalized-light', 'npc', 'town-slimes.latest.json'), JSON.stringify({
    entityId: 'town-slimes',
    source: { pageTitle: 'Town Slimes' },
    display: { name: 'Town Slimes' },
    summary: { leadText: 'Town Slimes are a type of town pet.' },
    profile: { kind: 'NPC / Slime' },
    shop: { items: [] },
    happiness: { sourceTemplatePresent: false, notes: [] },
    relationships: { relatedNpcs: [], relatedItems: [], relatedBiomes: [] },
    contentBlocks: { dialogue: '', tips: '', history: '' },
    groupMembers: [
      { entityId: 'squire-slime', name: 'Squire Slime', pageTitle: 'Town Slimes', moveInCondition: 'Drop copper gear on a slime.' },
      { entityId: 'clumsy-slime', name: 'Clumsy Slime', pageTitle: 'Town Slimes', moveInCondition: 'Break the balloon.' }
    ]
  }, null, 2));

  await fs.writeFile(path.join(crawlerOutputRoot, 'audit', 'npc', 'town-slimes.latest.json'), JSON.stringify({
    status: 'pass',
    reasons: []
  }, null, 2));

  const result = await runNpcStandardizedBridge({
    sourceStandardizedDir,
    crawlerOutputRoot,
    outputRoot
  });

  const bridgedNpcs = JSON.parse(await fs.readFile(path.join(result.standardizedDir, 'npcs.standardized.json'), 'utf8'));
  const squire = bridgedNpcs.records.find((record) => record.internalName === 'TownSlimeCopper');
  const clumsy = bridgedNpcs.records.find((record) => record.internalName === 'TownSlimePurple');

  assert.equal(result.summary.crawlerNpcTotal, 2);
  assert.equal(result.summary.matched, 2);
  assert.equal(squire.wikiCrawler.pageTitle, 'Town Slimes');
  assert.equal(squire.wikiCrawler.sourceMetadata.entityId, 'squire-slime');
  assert.deepEqual(squire.wikiCrawler.groupMember, {
    entityId: 'squire-slime',
    name: 'Squire Slime',
    pageTitle: 'Town Slimes',
    moveInCondition: 'Drop copper gear on a slime.'
  });
  assert.equal(clumsy.wikiCrawler.sourceMetadata.entityId, 'clumsy-slime');
});

test('runNpcStandardizedBridge counts reviewed Scarecrow shared-loot target matches in the bridge report', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'npc-bridge-scarecrow-'));
  const sourceStandardizedDir = path.join(tempRoot, 'source-standardized');
  const crawlerOutputRoot = path.join(tempRoot, 'crawler-output');
  const outputRoot = path.join(tempRoot, 'generated');

  await fs.mkdir(path.join(sourceStandardizedDir), { recursive: true });
  await fs.mkdir(path.join(crawlerOutputRoot, 'normalized-light', 'npc'), { recursive: true });
  await fs.mkdir(path.join(crawlerOutputRoot, 'audit', 'npc'), { recursive: true });

  const targetInternalNames = Array.from({ length: 10 }, (_, index) => `Scarecrow${index + 1}`);
  await fs.writeFile(path.join(sourceStandardizedDir, 'npcs.standardized.json'), JSON.stringify({
    entity: 'npcs',
    records: targetInternalNames.map((internalName, index) => ({
      id: 305 + index,
      internalName,
      name: 'Scarecrow',
      imageFileTitle: `Scarecrow ${index + 1}.gif`
    }))
  }, null, 2));

  for (const entity of ['items', 'buffs', 'projectiles', 'armor_sets']) {
    await fs.writeFile(path.join(sourceStandardizedDir, `${entity}.standardized.json`), JSON.stringify({
      entity,
      records: []
    }, null, 2));
  }

  await fs.writeFile(path.join(sourceStandardizedDir, '_manifest.standardized.json'), JSON.stringify({
    generatedAt: '2026-05-12T00:00:00.000Z',
    datasets: ['npcs', 'items', 'buffs', 'projectiles', 'armor_sets']
  }, null, 2));

  await fs.writeFile(path.join(crawlerOutputRoot, 'normalized-light', 'npc', 'scarecrow.latest.json'), JSON.stringify({
    entityId: 'scarecrow',
    source: { pageTitle: 'Scarecrow' },
    sourceMetadata: { revisionTimestamp: '2026-04-01T07:29:09Z' },
    display: { name: 'Scarecrow' },
    summary: {
      leadText: 'There are ten varieties of Scarecrow, five of which lack legs and can only move by jumping, while the other five follow the normal Fighter AI.'
    },
    profile: { kind: 'Enemy' },
    shop: { items: [] },
    loot: ['Heart', 'Scarecrow Hat', 'Scarecrow Shirt', 'Scarecrow Pants'].map((itemName, index) => ({
      relationType: 'loot',
      itemName,
      sourceRowIndex: index,
      chanceText: index === 0 ? '25%' : '0.37%-3.33%',
      quantityText: '1',
      sourceInfobox: { autoId: '305', image: 'Scarecrow 6.gif', name: '' }
    }))
  }, null, 2));

  await fs.writeFile(path.join(crawlerOutputRoot, 'audit', 'npc', 'scarecrow.latest.json'), JSON.stringify({
    status: 'pass',
    reasons: []
  }, null, 2));

  const result = await runNpcStandardizedBridge({
    sourceStandardizedDir,
    crawlerOutputRoot,
    outputRoot
  });

  const report = JSON.parse(await fs.readFile(result.reportPath, 'utf8'));
  assert.equal(result.summary.matched, 10);
  assert.equal(report.matched, 10);
  assert.equal(result.summary.unenrichedStandardized, 0);
});

test('runNpcStandardizedBridge counts reviewed Zombie Elf shared-loot variant matches in the bridge report', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'npc-bridge-zombie-elf-'));
  const sourceStandardizedDir = path.join(tempRoot, 'source-standardized');
  const crawlerOutputRoot = path.join(tempRoot, 'crawler-output');
  const outputRoot = path.join(tempRoot, 'generated');

  await fs.mkdir(path.join(sourceStandardizedDir), { recursive: true });
  await fs.mkdir(path.join(crawlerOutputRoot, 'normalized-light', 'npc'), { recursive: true });
  await fs.mkdir(path.join(crawlerOutputRoot, 'audit', 'npc'), { recursive: true });

  await fs.writeFile(path.join(sourceStandardizedDir, 'npcs.standardized.json'), JSON.stringify({
    entity: 'npcs',
    records: [
      { id: 338, internalName: 'ZombieElf', name: 'Zombie Elf', imageFileTitle: 'Zombie Elf.gif' },
      { id: 339, internalName: 'ZombieElfBeard', name: 'Zombie Elf', imageFileTitle: 'Zombie Elf Beard.gif' },
      { id: 340, internalName: 'ZombieElfGirl', name: 'Zombie Elf', imageFileTitle: 'Zombie Elf Girl.gif' }
    ]
  }, null, 2));

  for (const entity of ['items', 'buffs', 'projectiles', 'armor_sets']) {
    await fs.writeFile(path.join(sourceStandardizedDir, `${entity}.standardized.json`), JSON.stringify({
      entity,
      records: []
    }, null, 2));
  }

  await fs.writeFile(path.join(sourceStandardizedDir, '_manifest.standardized.json'), JSON.stringify({
    generatedAt: '2026-05-12T00:00:00.000Z',
    datasets: ['npcs', 'items', 'buffs', 'projectiles', 'armor_sets']
  }, null, 2));

  await fs.writeFile(path.join(crawlerOutputRoot, 'normalized-light', 'npc', 'zombie-elf.latest.json'), JSON.stringify({
    entityId: 'zombie-elf',
    source: { pageTitle: 'Zombie Elf' },
    sourceMetadata: { revisionTimestamp: '2025-03-18T07:10:16Z' },
    display: { name: 'Zombie Elf' },
    summary: {
      leadText: 'The Zombie Elf is a Hardmode, post-Plantera enemy that spawns during the Frost Moon event. They are the most basic fighter-type enemy that spawns during the event.'
    },
    profile: { kind: 'Undead Enemy' },
    shop: { items: [] },
    loot: ['Elf Hat', 'Elf Shirt', 'Elf Pants', 'Heart'].map((itemName, index) => ({
      relationType: 'loot',
      itemName,
      sourceRowIndex: index,
      chanceText: index === 3 ? '20%' : '0.17%',
      quantityText: '1',
      sourceInfobox: { autoId: '338', image: 'Zombie Elves.png', name: '' }
    }))
  }, null, 2));

  await fs.writeFile(path.join(crawlerOutputRoot, 'audit', 'npc', 'zombie-elf.latest.json'), JSON.stringify({
    status: 'pass',
    reasons: []
  }, null, 2));

  const result = await runNpcStandardizedBridge({
    sourceStandardizedDir,
    crawlerOutputRoot,
    outputRoot
  });

  const report = JSON.parse(await fs.readFile(result.reportPath, 'utf8'));
  const bridgedNpcs = JSON.parse(await fs.readFile(path.join(result.standardizedDir, 'npcs.standardized.json'), 'utf8'));
  assert.equal(result.summary.matched, 3);
  assert.equal(report.matched, 3);
  assert.equal(result.summary.unenrichedStandardized, 0);
  assert.equal(bridgedNpcs.records.find((record) => record.internalName === 'ZombieElfBeard').wikiCrawler.reviewedSharedLoot.evidenceSource, 'docs/audits/2026-05-12_npc-r43-zombie-elf-page-shared-loot-review.md');
});
