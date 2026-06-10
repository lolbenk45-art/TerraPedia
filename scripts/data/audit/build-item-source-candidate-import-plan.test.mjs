import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  buildItemSourceCandidateBundle,
  buildItemSourceCandidateImportPlan,
  parseBuildItemSourceCandidateImportPlanArgs
} from './build-item-source-candidate-import-plan.mjs';

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'item-source-import-plan-'));
  const rawDir = path.join(root, 'raw');
  const sourcesDir = path.join(root, 'itemSources');
  const itemsPath = path.join(root, 'items.standardized.json');
  const npcsPath = path.join(root, 'npcs.standardized.json');
  fs.mkdirSync(rawDir, { recursive: true });
  fs.mkdirSync(sourcesDir, { recursive: true });
  fs.writeFileSync(path.join(sourcesDir, 'itemSources.part-0001.json'), JSON.stringify({ itemSources: [] }));
  fs.writeFileSync(itemsPath, JSON.stringify({
    records: [
      { id: 50, internalName: 'MagicMirror', name: 'Magic Mirror' },
      { id: 1001, internalName: 'GoldChest', name: 'Gold Chest' },
      { id: 1002, internalName: 'FrozenChest', name: 'Frozen Chest' },
      { id: 1003, internalName: 'WoodenCrate', name: 'Wooden Crate' },
      { id: 1004, internalName: 'BossBagDukeFishron', name: 'Treasure Bag (Duke Fishron)' },
      { id: 1005, internalName: 'LockBox', name: 'Lock Box' },
      { id: 2000, internalName: 'AetheriumBookcase', name: 'Aetherium Bookcase' },
      { id: 2001, internalName: 'ClownHat', name: 'Clown Hat' },
      { id: 2002, internalName: 'StyngerBolt', name: 'Stynger Bolt' },
      { id: 1774, internalName: 'GoodieBag', name: 'Goodie Bag' },
      { id: 1749, internalName: 'CatMask', name: 'Cat Mask' },
      { id: 1766, internalName: 'WitchHat', name: 'Witch Hat' },
      { id: 1775, internalName: 'WitchDress', name: 'Witch Dress' },
      { id: 1776, internalName: 'WitchBoots', name: 'Witch Boots' },
      { id: 2611, internalName: 'Flairon', name: 'Flairoon' },
      { id: 4410, internalName: 'Oyster', name: 'Oyster' },
      { id: 4411, internalName: 'ShuckedOyster', name: 'Shucked Oyster' },
      { id: 870, internalName: 'MummyMask', name: 'Mummy Mask' }
    ]
  }));
  fs.writeFileSync(npcsPath, JSON.stringify({
    records: [
      { id: 85, internalName: 'Mimic', name: 'Mimic', boss: false },
      { id: 54, internalName: 'Clothier', name: 'Clothier', boss: false },
      { id: 19, internalName: 'ArmsDealer', name: 'Arms Dealer', boss: false },
      { id: 228, internalName: 'WitchDoctor', name: 'Witch Doctor', boss: false },
      { id: 370, internalName: 'DukeFishron', name: 'Duke Fishron', boss: true },
      { id: 78, internalName: 'Mummy', name: 'Mummy', boss: false },
      { id: 79, internalName: 'DarkMummy', name: 'Dark Mummy', boss: false },
      { id: 80, internalName: 'LightMummy', name: 'Light Mummy', boss: false },
      { id: 630, internalName: 'BloodMummy', name: 'Blood Mummy', boss: false }
    ]
  }));
  return { root, rawDir, sourcesDir, itemsPath, npcsPath };
}

test('parseBuildItemSourceCandidateImportPlanArgs rejects mutation flags', () => {
  for (const flag of ['--apply', '--apply=true', '--write-db', '--sync', '--import', '--materialize']) {
    assert.throws(
      () => parseBuildItemSourceCandidateImportPlanArgs([flag]),
      /read-only import plan refuses mutation flag/
    );
  }
});

test('parseBuildItemSourceCandidateImportPlanArgs accepts promotion scope', () => {
  assert.equal(parseBuildItemSourceCandidateImportPlanArgs(['--promotion-scope=family']).promotionScope, 'family');
  assert.equal(parseBuildItemSourceCandidateImportPlanArgs(['--promotion-scope=polluted']).promotionScope, 'polluted');
  assert.equal(parseBuildItemSourceCandidateImportPlanArgs(['--promotion-scope=all']).promotionScope, 'all');
});

test('buildItemSourceCandidateImportPlan marks MagicMirror as eligible canary', () => {
  const fixture = createFixture();

  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 1,
      classificationCounts: { high_confidence: 1 },
      candidates: [{
        itemInternalName: 'MagicMirror',
        itemName: 'Magic Mirror',
        pageTitle: 'Magic Mirrors',
        rawPath: path.join(fixture.rawDir, 'magicmirror.latest.json'),
        rawSourceCount: 5,
        standardizedSourceCount: 0,
        classification: 'high_confidence',
        sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
        extractedSources: [
          { sourceType: 'container', sourceRefType: 'container', sourceRefName: 'Gold Chest', quantityText: '1', chanceText: '1/6 (16.67%)', conditions: 'Underground', notes: null },
          { sourceType: 'drop', sourceRefType: 'npc', sourceRefName: 'Mimics', quantityText: '1', chanceText: '16.67%', conditions: null, notes: null },
          { sourceType: 'drop', sourceRefType: 'npc', sourceRefName: 'Mimic', quantityText: '1', chanceText: '16.67%', conditions: null, notes: null },
          { sourceType: 'container', sourceRefType: 'container', sourceRefName: 'Frozen Chest', quantityText: '1', chanceText: '1/5 (20%)', conditions: null, notes: null },
          { sourceType: 'worldgen', sourceRefType: 'world', sourceRefName: 'Magic Mirrors worldgen', quantityText: null, chanceText: null, conditions: 'generated in Chests', notes: null }
        ]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.readOnly, true);
  assert.equal(plan.mode, 'candidate_import_plan');
  assert.equal(plan.summary.eligibleCandidates, 1);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.equal(plan.summary.plannedSourceRows, 5);
  assert.deepEqual(
    plan.eligibleCandidates[0].plannedSources.map((row) => [row.sourceRefName, row.sourceRefType, row.resolutionStatus]),
    [
      ['Gold Chest', 'container', 'resolved_item_ref'],
      ['Mimics', 'npc', 'resolved_npc_ref'],
      ['Mimic', 'npc', 'resolved_npc_ref'],
      ['Frozen Chest', 'container', 'resolved_item_ref'],
      ['Magic Mirrors worldgen', 'world', 'world_text_ref']
    ]
  );
});

test('buildItemSourceCandidateImportPlan cleans duplicate vendor tail rows', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 1,
      classificationCounts: { high_confidence: 1 },
      candidates: [{
        itemInternalName: 'ClownHat',
        itemName: 'Clown Hat',
        pageTitle: 'Clown set',
        rawPath: path.join(fixture.rawDir, 'clownhat.latest.json'),
        rawSourceCount: 2,
        standardizedSourceCount: 0,
        classification: 'high_confidence',
        sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
        extractedSources: [
          { sourceType: 'shop', sourceRefType: 'npc', sourceRefName: 'Clothier', quantityText: null, chanceText: null, conditions: null, notes: null },
          { sourceType: 'shop', sourceRefType: 'npc', sourceRefName: 'Clothier for', quantityText: null, chanceText: null, conditions: null, notes: 'Sold by the Clothier for 3 gold.' }
        ]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 1);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.equal(plan.summary.plannedSourceRows, 1);
  assert.deepEqual(
    plan.eligibleCandidates[0].plannedSources.map((row) => [row.sourceType, row.sourceRefType, row.sourceRefName, row.resolutionStatus, row.notes]),
    [['shop', 'npc', 'Clothier', 'resolved_npc_ref', 'Sold by the Clothier for 3 gold.']]
  );
});

test('buildItemSourceCandidateImportPlan drops covered composite vendor rows', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 1,
      classificationCounts: { high_confidence: 1 },
      candidates: [{
        itemInternalName: 'StyngerBolt',
        itemName: 'Stynger Bolt',
        pageTitle: 'Stynger',
        rawPath: path.join(fixture.rawDir, 'styngerbolt.latest.json'),
        rawSourceCount: 3,
        standardizedSourceCount: 0,
        classification: 'high_confidence',
        sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
        extractedSources: [
          { sourceType: 'shop', sourceRefType: 'npc', sourceRefName: 'Arms Dealer', quantityText: '60-99', chanceText: null, conditions: null, notes: null },
          { sourceType: 'shop', sourceRefType: 'npc', sourceRefName: 'Witch Doctor', quantityText: '60-99', chanceText: null, conditions: null, notes: null },
          { sourceType: 'shop', sourceRefType: 'npc', sourceRefName: 'Witch Doctor and Arms Dealer', quantityText: '60-99', chanceText: null, conditions: null, notes: 'Sold if the player has a Stynger.' }
        ]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 1);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.equal(plan.summary.plannedSourceRows, 2);
  assert.deepEqual(
    plan.eligibleCandidates[0].plannedSources.map((row) => [row.sourceRefName, row.notes]),
    [
      ['Arms Dealer', 'Sold if the player has a Stynger.'],
      ['Witch Doctor', 'Sold if the player has a Stynger.']
    ]
  );
});

test('buildItemSourceCandidateImportPlan blocks non-allowlisted family page candidates', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 1,
      classificationCounts: { family_page_candidate: 1 },
      candidates: [{
        itemInternalName: 'MagicMirror',
        itemName: 'Magic Mirror',
        pageTitle: 'Paintings',
        rawPath: path.join(fixture.rawDir, 'painting.latest.json'),
        rawSourceCount: 1,
        standardizedSourceCount: 0,
        classification: 'family_page_candidate',
        sourceRevisionTimestamp: '2026-05-14T05:44:56Z',
        extractedSources: [
          { sourceType: 'worldgen', sourceRefType: 'world', sourceRefName: 'Paintings worldgen', quantityText: null, chanceText: null, conditions: null, notes: null }
        ]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 0);
  assert.equal(plan.summary.blockedCandidates, 1);
  assert.equal(plan.blockedCandidates[0].itemInternalName, 'MagicMirror');
  assert.equal(plan.blockedCandidates[0].blockedReason, 'family_page_candidate');
});

test('buildItemSourceCandidateImportPlan promotes allowlisted shared-worldgen family pages only', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 2,
      classificationCounts: { family_page_candidate: 2 },
      candidates: [{
        itemInternalName: 'AetheriumBookcase',
        itemName: 'Aetherium Bookcase',
        pageTitle: 'Bookcases',
        rawPath: path.join(fixture.rawDir, 'aetheriumbookcase.latest.json'),
        rawSourceCount: 1,
        standardizedSourceCount: 0,
        classification: 'family_page_candidate',
        sourceRevisionTimestamp: '2026-05-14T05:44:56Z',
        extractedSources: [
          { sourceType: 'worldgen', sourceRefType: 'world', sourceRefName: 'Bookcases worldgen', quantityText: null, chanceText: null, conditions: 'generated in Underground Cabins', notes: null }
        ]
      }, {
        itemInternalName: 'MagicMirror',
        itemName: 'Magic Mirror',
        pageTitle: 'Paintings',
        rawPath: path.join(fixture.rawDir, 'painting.latest.json'),
        rawSourceCount: 1,
        standardizedSourceCount: 0,
        classification: 'family_page_candidate',
        sourceRevisionTimestamp: '2026-05-14T05:44:56Z',
        extractedSources: [
          { sourceType: 'worldgen', sourceRefType: 'world', sourceRefName: 'Paintings worldgen', quantityText: null, chanceText: null, conditions: null, notes: null }
        ]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 1);
  assert.equal(plan.summary.blockedCandidates, 1);
  assert.equal(plan.eligibleCandidates[0].itemInternalName, 'AetheriumBookcase');
  assert.equal(plan.eligibleCandidates[0].plannedSources[0].sourceRefType, 'world');
  assert.equal(plan.blockedCandidates[0].pageTitle, 'Paintings');
  assert.equal(plan.blockedCandidates[0].blockedReason, 'family_page_candidate');
});

test('buildItemSourceCandidateImportPlan maps Goodie Bag polluted unknown source to item-backed source', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 1,
      classificationCounts: { polluted_candidate: 1 },
      candidates: [{
        itemInternalName: 'CatMask',
        itemName: 'Cat Mask',
        pageTitle: 'Cat set',
        rawPath: path.join(fixture.rawDir, 'catmask.latest.json'),
        rawSourceCount: 1,
        standardizedSourceCount: 0,
        classification: 'polluted_candidate',
        sourceRevisionTimestamp: '2026-05-14T05:44:56Z',
        extractedSources: [
          { sourceType: 'drop', sourceRefType: 'unknown', sourceRefName: 'Goodie Bag', quantityText: null, chanceText: null, conditions: null, notes: null }
        ]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 1);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.equal(plan.eligibleCandidates[0].plannedSources[0].sourceRefType, 'item');
  assert.equal(plan.eligibleCandidates[0].plannedSources[0].sourceRefName, 'Goodie Bag');
  assert.equal(plan.eligibleCandidates[0].plannedSources[0].resolutionStatus, 'resolved_item_ref');
});

test('buildItemSourceCandidateImportPlan does not map Goodie Bag unknown source outside allowed polluted pages', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 1,
      classificationCounts: { high_confidence: 1 },
      candidates: [{
        itemInternalName: 'CatMask',
        itemName: 'Cat Mask',
        pageTitle: 'Unexpected Goodie Source',
        rawPath: path.join(fixture.rawDir, 'unexpected-goodie.latest.json'),
        rawSourceCount: 1,
        standardizedSourceCount: 0,
        classification: 'high_confidence',
        sourceRevisionTimestamp: '2026-05-14T05:44:56Z',
        extractedSources: [
          { sourceType: 'drop', sourceRefType: 'unknown', sourceRefName: 'Goodie Bag', quantityText: null, chanceText: null, conditions: null, notes: null }
        ]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 0);
  assert.equal(plan.summary.blockedCandidates, 1);
  assert.equal(plan.blockedCandidates[0].blockedSources[0].blockedReason, 'unknown_source_contract');
});

test('buildItemSourceCandidateImportPlan maps Shucked Oyster unknown Oyster source to item-backed source', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 1,
      classificationCounts: { polluted_candidate: 1 },
      candidates: [{
        itemInternalName: 'ShuckedOyster',
        itemName: 'Shucked Oyster',
        pageTitle: 'Shucked Oyster',
        rawPath: path.join(fixture.rawDir, 'shuckedoyster.latest.json'),
        rawSourceCount: 1,
        standardizedSourceCount: 0,
        classification: 'polluted_candidate',
        sourceRevisionTimestamp: '2026-03-29T04:32:14Z',
        extractedSources: [
          { sourceType: 'drop', sourceRefType: 'unknown', sourceRefName: 'Oyster', quantityText: '1', chanceText: '100%', conditions: null, notes: null }
        ]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 1);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.deepEqual(
    plan.eligibleCandidates[0].plannedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName, source.quantityText, source.chanceText, source.resolutionStatus]),
    [['drop', 'item', 'Oyster', '1', '100%', 'resolved_item_ref']]
  );
});

test('buildItemSourceCandidateImportPlan does not map unknown Oyster source outside Shucked Oyster page', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 1,
      classificationCounts: { high_confidence: 1 },
      candidates: [{
        itemInternalName: 'MagicMirror',
        itemName: 'Magic Mirror',
        pageTitle: 'Unexpected Oyster Source',
        rawPath: path.join(fixture.rawDir, 'unexpected-oyster.latest.json'),
        rawSourceCount: 1,
        standardizedSourceCount: 0,
        classification: 'high_confidence',
        sourceRevisionTimestamp: '2026-05-14T05:44:56Z',
        extractedSources: [
          { sourceType: 'drop', sourceRefType: 'unknown', sourceRefName: 'Oyster', quantityText: '1', chanceText: '100%', conditions: null, notes: null }
        ]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 0);
  assert.equal(plan.summary.blockedCandidates, 1);
  assert.equal(plan.blockedCandidates[0].blockedSources[0].blockedReason, 'unknown_source_contract');
});

test('buildItemSourceCandidateImportPlan keeps Witch set Goodie Bag source and drops Vampirism worldgen noise', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 1,
      classificationCounts: { polluted_candidate: 1 },
      candidates: [{
        itemInternalName: 'WitchHat',
        itemName: 'Witch Hat',
        pageTitle: 'Witch set',
        rawPath: path.join(fixture.rawDir, 'witchhat.latest.json'),
        rawSourceCount: 2,
        standardizedSourceCount: 0,
        classification: 'polluted_candidate',
        sourceRevisionTimestamp: '2026-05-23T16:47:45Z',
        extractedSources: [
          { sourceType: 'drop', sourceRefType: 'unknown', sourceRefName: 'Goodie Bag', quantityText: '1', chanceText: '3.51%', conditions: null, notes: null },
          { sourceType: 'worldgen', sourceRefType: 'world', sourceRefName: 'Witch set worldgen', quantityText: null, chanceText: null, conditions: 'It may also be found in chests in Vampirism worlds.', notes: null }
        ]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 1);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.deepEqual(
    plan.eligibleCandidates[0].plannedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName, source.chanceText, source.resolutionStatus]),
    [['drop', 'item', 'Goodie Bag', '3.51%', 'resolved_item_ref']]
  );
});

test('buildItemSourceCandidateImportPlan expands Mummy set group source to explicit NPC rows', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 1,
      classificationCounts: { polluted_candidate: 1 },
      candidates: [{
        itemInternalName: 'MummyMask',
        itemName: 'Mummy Mask',
        pageTitle: 'Mummy set',
        rawPath: path.join(fixture.rawDir, 'mummymask.latest.json'),
        rawSourceCount: 1,
        standardizedSourceCount: 0,
        classification: 'polluted_candidate',
        sourceRevisionTimestamp: '2023-10-24T00:43:54Z',
        extractedSources: [
          { sourceType: 'drop', sourceRefType: 'unknown', sourceRefName: 'Mummies', quantityText: '1', chanceText: '1.33%', conditions: null, notes: null }
        ]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 1);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.deepEqual(
    plan.eligibleCandidates[0].plannedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName, source.quantityText, source.chanceText, source.resolutionStatus]),
    [
      ['drop', 'npc', 'Blood Mummy', '1', '1.33%', 'resolved_npc_ref'],
      ['drop', 'npc', 'Dark Mummy', '1', '1.33%', 'resolved_npc_ref'],
      ['drop', 'npc', 'Light Mummy', '1', '1.33%', 'resolved_npc_ref'],
      ['drop', 'npc', 'Mummy', '1', '1.33%', 'resolved_npc_ref']
    ]
  );
});

test('buildItemSourceCandidateImportPlan does not expand Mummies group source outside Mummy set page', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 1,
      classificationCounts: { high_confidence: 1 },
      candidates: [{
        itemInternalName: 'MagicMirror',
        itemName: 'Magic Mirror',
        pageTitle: 'Unexpected Mummies Source',
        rawPath: path.join(fixture.rawDir, 'unexpected-mummies.latest.json'),
        rawSourceCount: 1,
        standardizedSourceCount: 0,
        classification: 'high_confidence',
        sourceRevisionTimestamp: '2023-10-24T00:43:54Z',
        extractedSources: [
          { sourceType: 'drop', sourceRefType: 'unknown', sourceRefName: 'Mummies', quantityText: '1', chanceText: '1.33%', conditions: null, notes: null }
        ]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 0);
  assert.equal(plan.summary.blockedCandidates, 1);
  assert.equal(plan.blockedCandidates[0].blockedSources[0].blockedReason, 'unknown_source_contract');
});

test('buildItemSourceCandidateImportPlan keeps polluted candidates blocked in family-only promotion scope', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    promotionScope: 'family',
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 1,
      classificationCounts: { polluted_candidate: 1 },
      candidates: [{
        itemInternalName: 'CatMask',
        itemName: 'Cat Mask',
        pageTitle: 'Cat set',
        rawPath: path.join(fixture.rawDir, 'catmask.latest.json'),
        rawSourceCount: 1,
        standardizedSourceCount: 0,
        classification: 'polluted_candidate',
        sourceRevisionTimestamp: '2026-05-14T05:44:56Z',
        extractedSources: [
          { sourceType: 'drop', sourceRefType: 'unknown', sourceRefName: 'Goodie Bag', quantityText: null, chanceText: null, conditions: null, notes: null }
        ]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 0);
  assert.equal(plan.summary.blockedCandidates, 1);
  assert.equal(plan.blockedCandidates[0].blockedReason, 'polluted_candidate');
});

test('buildItemSourceCandidateImportPlan keeps Flairon boss and treasure bag rows while treating Expert Mode as condition text', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 1,
      classificationCounts: { polluted_candidate: 1 },
      candidates: [{
        itemInternalName: 'Flairon',
        itemName: 'Flairoon',
        pageTitle: 'Flairon',
        rawPath: path.join(fixture.rawDir, 'flairon.latest.json'),
        rawSourceCount: 3,
        standardizedSourceCount: 0,
        classification: 'polluted_candidate',
        sourceRevisionTimestamp: '2026-05-14T05:44:56Z',
        extractedSources: [
          { sourceType: 'drop', sourceRefType: 'boss', sourceRefName: 'Duke Fishron', quantityText: '1', chanceText: '20%', conditions: null, notes: null },
          { sourceType: 'treasure_bag', sourceRefType: 'treasure_bag', sourceRefName: 'Treasure Bag (Duke Fishron)', quantityText: '1', chanceText: '33%', conditions: null, notes: null },
          { sourceType: 'drop', sourceRefType: 'unknown', sourceRefName: 'Expert Mode', quantityText: null, chanceText: null, conditions: null, notes: null }
        ]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 1);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.deepEqual(
    plan.eligibleCandidates[0].plannedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName, source.conditions, source.resolutionStatus]),
    [
      ['drop', 'boss', 'Duke Fishron', null, 'resolved_boss_ref'],
      ['treasure_bag', 'treasure_bag', 'Treasure Bag (Duke Fishron)', 'Expert Mode', 'resolved_item_ref']
    ]
  );
});

test('buildItemSourceCandidateImportPlan blocks Flairon when extra resolved sources are present', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 1,
      classificationCounts: { polluted_candidate: 1 },
      candidates: [{
        itemInternalName: 'Flairon',
        itemName: 'Flairoon',
        pageTitle: 'Flairon',
        rawPath: path.join(fixture.rawDir, 'flairon.latest.json'),
        rawSourceCount: 4,
        standardizedSourceCount: 0,
        classification: 'polluted_candidate',
        sourceRevisionTimestamp: '2026-05-14T05:44:56Z',
        extractedSources: [
          { sourceType: 'drop', sourceRefType: 'boss', sourceRefName: 'Duke Fishron', quantityText: '1', chanceText: '20%', conditions: null, notes: null },
          { sourceType: 'treasure_bag', sourceRefType: 'treasure_bag', sourceRefName: 'Treasure Bag (Duke Fishron)', quantityText: '1', chanceText: '33%', conditions: null, notes: null },
          { sourceType: 'drop', sourceRefType: 'npc', sourceRefName: 'Mimic', quantityText: '1', chanceText: '1%', conditions: null, notes: null },
          { sourceType: 'drop', sourceRefType: 'unknown', sourceRefName: 'Expert Mode', quantityText: null, chanceText: null, conditions: null, notes: null }
        ]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 0);
  assert.equal(plan.summary.blockedCandidates, 1);
  assert.equal(plan.blockedCandidates[0].blockedReason, 'polluted_candidate');
});

test('buildItemSourceCandidateImportPlan keeps high-risk polluted matrix pages blocked', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 3,
      classificationCounts: { polluted_candidate: 3 },
      candidates: ['Torches', 'Ropes', 'Block-placing wands'].map((pageTitle, index) => ({
        itemInternalName: ['Torch', 'Rope', 'BoneWand'][index],
        itemName: ['Torch', 'Rope', 'Bone Wand'][index],
        pageTitle,
        rawPath: path.join(fixture.rawDir, `${pageTitle}.latest.json`),
        rawSourceCount: 1,
        standardizedSourceCount: 0,
        classification: 'polluted_candidate',
        sourceRevisionTimestamp: '2026-05-14T05:44:56Z',
        extractedSources: [
          { sourceType: 'drop', sourceRefType: 'unknown', sourceRefName: 'Goodie Bag', quantityText: null, chanceText: null, conditions: null, notes: null }
        ]
      }))
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 0);
  assert.equal(plan.summary.blockedCandidates, 3);
  assert.deepEqual(plan.blockedCandidates.map((candidate) => candidate.pageTitle), ['Torches', 'Ropes', 'Block-placing wands']);
});

test('buildItemSourceCandidateImportPlan blocks container-like sources misclassified as NPC', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 1,
      classificationCounts: { high_confidence: 1 },
      candidates: [{
        itemInternalName: 'MagicMirror',
        itemName: 'Magic Mirror',
        pageTitle: 'Magic Mirrors',
        rawPath: path.join(fixture.rawDir, 'magicmirror.latest.json'),
        rawSourceCount: 1,
        standardizedSourceCount: 0,
        classification: 'high_confidence',
        sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
        extractedSources: [{
          sourceType: 'drop',
          sourceRefType: 'npc',
          sourceRefName: 'Gold Chest',
          quantityText: '1',
          chanceText: '1/6 (16.67%)',
          conditions: null,
          notes: null
        }]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 0);
  assert.equal(plan.summary.blockedCandidates, 1);
  assert.equal(plan.summary.blockedSourceRows, 1);
  assert.equal(plan.blockedCandidates[0].blockedSources[0].blockedReason, 'forbidden_npc_container_mapping');
});

test('build item source candidate import plan CLI supports --sample and prints JSON', () => {
  const fixture = createFixture();
  fs.writeFileSync(path.join(fixture.rawDir, 'magicmirror.latest.json'), JSON.stringify({
    itemInternalName: 'MagicMirror',
    itemName: 'Magic Mirror',
    pageTitle: 'Magic Mirrors',
    revisionTimestamp: '2026-04-02T10:40:10Z',
    wikitext: '',
    html: '<p>Magic Mirrors can be found in Chests generated in the Underground and Cavern layers.</p>'
  }));

  const result = spawnSync(process.execPath, [
    'scripts/data/audit/build-item-source-candidate-import-plan.mjs',
    '--raw-dir', fixture.rawDir,
    '--items', fixture.itemsPath,
    '--standardized-npcs', fixture.npcsPath,
    '--npcs', fixture.npcsPath,
    '--item-sources-dir', fixture.sourcesDir,
    '--sample', 'MagicMirror'
  ], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.summary.eligibleCandidates, 1);
  assert.equal(parsed.summary.plannedSourceRows, 1);
});

test('buildItemSourceCandidateBundle emits item_relations_bundle_raw compatible payload', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 1,
      classificationCounts: { high_confidence: 1 },
      candidates: [{
        itemInternalName: 'MagicMirror',
        itemName: 'Magic Mirror',
        pageTitle: 'Magic Mirrors',
        rawPath: path.join(fixture.rawDir, 'magicmirror.latest.json'),
        rawSourceCount: 1,
        standardizedSourceCount: 0,
        classification: 'high_confidence',
        sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
        extractedSources: [
          { sourceType: 'container', sourceRefType: 'container', sourceRefName: 'Gold Chest', quantityText: '1', chanceText: '1/6 (16.67%)', conditions: null, notes: null }
        ]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  const bundle = buildItemSourceCandidateBundle(plan);

  assert.equal(bundle.source, 'terraria.wiki.gg:item-source-gap-repair');
  assert.equal(bundle.overwriteExisting, false);
  assert.equal(bundle.itemSources.length, 1);
  assert.equal(bundle.itemSources[0].itemInternalName, 'MagicMirror');
  assert.equal(bundle.itemSources[0].sourceRefType, 'container');
  assert.deepEqual(bundle.itemImages, []);
  assert.deepEqual(bundle.recipes, []);
  assert.deepEqual(bundle.itemBiomes, []);
  assert.deepEqual(bundle.snapshots, []);
});

test('build item source candidate import plan CLI writes bundle root when requested', () => {
  const fixture = createFixture();
  const bundleRoot = path.join(fixture.root, 'bundle-root');
  fs.writeFileSync(path.join(fixture.rawDir, 'magicmirror.latest.json'), JSON.stringify({
    itemInternalName: 'MagicMirror',
    itemName: 'Magic Mirror',
    pageTitle: 'Magic Mirrors',
    revisionTimestamp: '2026-04-02T10:40:10Z',
    wikitext: '',
    html: '<p>Magic Mirrors can be found in Chests generated in the Underground and Cavern layers.</p>'
  }));

  const result = spawnSync(process.execPath, [
    'scripts/data/audit/build-item-source-candidate-import-plan.mjs',
    '--raw-dir', fixture.rawDir,
    '--items', fixture.itemsPath,
    '--standardized-npcs', fixture.npcsPath,
    '--npcs', fixture.npcsPath,
    '--item-sources-dir', fixture.sourcesDir,
    '--sample', 'MagicMirror',
    '--bundle-root', bundleRoot
  ], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr);
  const bundlePath = path.join(bundleRoot, 'normalized', 'item-relations.bundle.json');
  const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  assert.equal(bundle.itemSources.length, 1);
  assert.equal(bundle.itemSources[0].itemInternalName, 'MagicMirror');
});
