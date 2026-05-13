import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runNpcCoverageAudit } from '../src/coverage/run-npc-coverage-audit.mjs';

test('runNpcCoverageAudit writes coverage target and audit reports from standardized npcs', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'npc-coverage-audit-'));
  const sourceStandardizedDir = path.join(tempRoot, 'source-standardized');
  const crawlerOutputRoot = path.join(tempRoot, 'crawler-output');
  const outputRoot = path.join(tempRoot, 'wiki-crawler');

  await fs.mkdir(sourceStandardizedDir, { recursive: true });
  await fs.mkdir(path.join(crawlerOutputRoot, 'normalized-light', 'npc'), { recursive: true });

  await fs.writeFile(path.join(sourceStandardizedDir, 'npcs.standardized.json'), JSON.stringify({
    entity: 'npcs',
    records: [
      { id: 17, internalName: 'Merchant', name: 'Merchant', flags: { friendly: true }, extras: { townNPC: true } },
      { id: 125, internalName: 'Retinazer', name: 'Retinazer', flags: { boss: true } }
    ]
  }, null, 2));
  await fs.writeFile(path.join(crawlerOutputRoot, 'normalized-light', 'npc', 'merchant.latest.json'), JSON.stringify({
    entityId: 'merchant',
    source: { pageTitle: 'Merchant' }
  }, null, 2));

  const result = await runNpcCoverageAudit({
    sourceStandardizedDir,
    crawlerOutputRoot,
    outputRoot,
    fetchWikiPageMetadataBatchImpl: async ({ titles }) => titles.map((title) => ({
      requestedTitle: title,
      pageTitle: title === 'Retinazer' ? 'The Twins' : title,
      pageId: title === 'Merchant' ? 17 : 125,
      missing: false
    }))
  });

  assert.ok(result.targetsPath);
  assert.ok(result.auditPath);
  assert.equal(result.audit.summary.totalTargets, 2);
  assert.equal(result.audit.summary.eligibleBatchTargets, 1);

  const audit = JSON.parse(await fs.readFile(result.auditPath, 'utf8'));
  const targets = JSON.parse(await fs.readFile(result.targetsPath, 'utf8'));

  assert.equal(audit.summary.redirectTargets, 1);
  assert.equal(targets.targets.length, 2);
});

test('runNpcCoverageAudit treats alias and group-member crawler outputs as already crawled', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'npc-coverage-audit-alias-'));
  const sourceStandardizedDir = path.join(tempRoot, 'source-standardized');
  const crawlerOutputRoot = path.join(tempRoot, 'crawler-output');
  const outputRoot = path.join(tempRoot, 'wiki-crawler');

  await fs.mkdir(sourceStandardizedDir, { recursive: true });
  await fs.mkdir(path.join(crawlerOutputRoot, 'normalized-light', 'npc'), { recursive: true });

  await fs.writeFile(path.join(sourceStandardizedDir, 'npcs.standardized.json'), JSON.stringify({
    entity: 'npcs',
    records: [
      { id: 637, internalName: 'TownCat', name: 'Cat', extras: { townNPC: true } },
      { id: 680, internalName: 'TownSlimePurple', name: 'Clumsy Slime', extras: { townNPC: true } },
      { id: 678, internalName: 'TownSlimeGreen', name: 'Cool Slime', extras: { townNPC: true } }
    ]
  }, null, 2));

  await fs.writeFile(path.join(crawlerOutputRoot, 'normalized-light', 'npc', 'town-cat.latest.json'), JSON.stringify({
    entityId: 'town-cat',
    source: { pageTitle: 'Town Cat' },
    display: { name: 'Cat' }
  }, null, 2));

  await fs.writeFile(path.join(crawlerOutputRoot, 'normalized-light', 'npc', 'town-slimes.latest.json'), JSON.stringify({
    entityId: 'town-slimes',
    source: { pageTitle: 'Town Slimes' },
    display: { name: 'Town Slimes' },
    groupMembers: [
      { entityId: 'clumsy-slime', name: 'Clumsy Slime', moveInCondition: 'Break the balloon.' },
      { entityId: 'cool-slime', name: 'Cool Slime', moveInCondition: 'Move in during Party.' }
    ]
  }, null, 2));

  const result = await runNpcCoverageAudit({
    sourceStandardizedDir,
    crawlerOutputRoot,
    outputRoot,
    fetchWikiPageMetadataBatchImpl: async ({ titles }) => titles.map((title) => ({
      requestedTitle: title,
      pageTitle: title,
      pageId: 1,
      missing: false
    }))
  });

  const cat = result.targets.targets.find((target) => target.pageTitle === 'Town Cat');
  const townSlimes = result.targets.targets.find((target) => target.pageTitle === 'Town Slimes');

  assert.equal(cat.alreadyCrawled, true);
  assert.equal(townSlimes.alreadyCrawled, true);
  assert.equal(result.audit.summary.alreadyCrawledTargets, 2);
  assert.equal(result.audit.summary.eligibleBatchTargets, 0);
});

test('runNpcCoverageAudit treats a crawled resolved redirect title as already crawled', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'npc-coverage-audit-redirect-'));
  const sourceStandardizedDir = path.join(tempRoot, 'source-standardized');
  const crawlerOutputRoot = path.join(tempRoot, 'crawler-output');
  const outputRoot = path.join(tempRoot, 'wiki-crawler');

  await fs.mkdir(sourceStandardizedDir, { recursive: true });
  await fs.mkdir(path.join(crawlerOutputRoot, 'normalized-light', 'npc'), { recursive: true });

  await fs.writeFile(path.join(sourceStandardizedDir, 'npcs.standardized.json'), JSON.stringify({
    entity: 'npcs',
    records: [
      { id: 87, internalName: 'StatueMimic', name: 'Statue' }
    ]
  }, null, 2));

  await fs.writeFile(path.join(crawlerOutputRoot, 'normalized-light', 'npc', 'statues.latest.json'), JSON.stringify({
    entityId: 'statues',
    source: { pageTitle: 'Statues' }
  }, null, 2));

  const result = await runNpcCoverageAudit({
    sourceStandardizedDir,
    crawlerOutputRoot,
    outputRoot,
    fetchWikiPageMetadataBatchImpl: async ({ titles }) => titles.map((title) => ({
      requestedTitle: title,
      pageTitle: title === 'Statue' ? 'Statues' : title,
      pageId: 87,
      missing: false
    }))
  });

  const statue = result.targets.targets.find((target) => target.pageTitle === 'Statue');

  assert.equal(statue.entityId, 'statue');
  assert.deepEqual(statue.targetEntityIds, ['statue']);
  assert.equal(statue.alreadyCrawled, true);
  assert.equal(result.audit.summary.alreadyCrawledTargets, 1);
  assert.equal(result.audit.summary.eligibleBatchTargets, 0);
});

test('runNpcCoverageAudit treats a crawled redirect group page without group members as already crawled', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'npc-coverage-audit-redirect-group-'));
  const sourceStandardizedDir = path.join(tempRoot, 'source-standardized');
  const crawlerOutputRoot = path.join(tempRoot, 'crawler-output');
  const outputRoot = path.join(tempRoot, 'wiki-crawler');

  await fs.mkdir(sourceStandardizedDir, { recursive: true });
  await fs.mkdir(path.join(crawlerOutputRoot, 'normalized-light', 'npc'), { recursive: true });

  await fs.writeFile(path.join(sourceStandardizedDir, 'npcs.standardized.json'), JSON.stringify({
    entity: 'npcs',
    records: [
      { id: 379, internalName: 'CultistArcherBlue', name: 'Cultist Archer' },
      { id: 380, internalName: 'CultistArcherWhite', name: 'Cultist Archer' }
    ]
  }, null, 2));

  await fs.writeFile(path.join(crawlerOutputRoot, 'normalized-light', 'npc', 'cultists.latest.json'), JSON.stringify({
    entityId: 'cultists',
    source: { pageTitle: 'Cultists' },
    display: { name: 'Cultists' },
    sourceInfoboxes: [
      { autoId: '379', image: 'Cultist Archer.gif' }
    ],
    loot: []
  }, null, 2));

  const result = await runNpcCoverageAudit({
    sourceStandardizedDir,
    crawlerOutputRoot,
    outputRoot,
    fetchWikiPageMetadataBatchImpl: async ({ titles }) => titles.map((title) => ({
      requestedTitle: title,
      pageTitle: title === 'Cultist Archer' ? 'Cultists' : title,
      pageId: 12874,
      missing: false
    }))
  });

  const cultistArcherAudit = result.audit.targets.find((target) => target.requestedTitle === 'Cultist Archer');

  assert.equal(cultistArcherAudit.pageTitle, 'Cultists');
  assert.equal(cultistArcherAudit.alreadyCrawled, true);
  assert.equal(cultistArcherAudit.eligibleBatch, false);
  assert.equal(result.audit.summary.alreadyCrawledTargets, 1);
  assert.equal(result.audit.summary.eligibleBatchTargets, 0);
});
