import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runNpcStandardizedBridge } from '../src/bridge/run-npc-standardized-bridge.mjs';

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
    shop: { items: [] },
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

  assert.equal(medusa.wikiCrawler.audit.status, 'warn');
  assert.equal(medusa.wikiCrawler.sourceMetadata.entityId, 'medusa');
  assert.equal(report.matched, 2);
  assert.equal(report.unenrichedStandardized, 1);
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
