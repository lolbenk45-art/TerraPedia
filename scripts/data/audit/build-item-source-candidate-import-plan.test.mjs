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
      { id: 2000, internalName: 'AetheriumBookcase', name: 'Aetherium Bookcase' }
    ]
  }));
  fs.writeFileSync(npcsPath, JSON.stringify({
    records: [
      { id: 85, internalName: 'Mimic', name: 'Mimic', boss: false }
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

test('buildItemSourceCandidateImportPlan blocks family page candidates', () => {
  const fixture = createFixture();
  fs.writeFileSync(path.join(fixture.rawDir, 'aetheriumbookcase.latest.json'), JSON.stringify({
    itemInternalName: 'AetheriumBookcase',
    itemName: 'Aetherium Bookcase',
    pageTitle: 'Bookcases',
    revisionTimestamp: '2026-05-14T05:44:56Z',
    wikitext: '',
    html: '<p>Some bookcases can also be found in Underground Cabins.</p>'
  }));

  const plan = buildItemSourceCandidateImportPlan({
    rawItemPageDir: fixture.rawDir,
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 0);
  assert.equal(plan.summary.blockedCandidates, 1);
  assert.equal(plan.blockedCandidates[0].itemInternalName, 'AetheriumBookcase');
  assert.equal(plan.blockedCandidates[0].blockedReason, 'family_page_candidate');
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
