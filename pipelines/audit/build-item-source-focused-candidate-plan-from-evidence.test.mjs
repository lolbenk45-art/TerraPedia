import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildFocusedCandidatePlanFromEvidence,
  parseBuildItemSourceFocusedCandidatePlanFromEvidenceArgs
} from './build-item-source-focused-candidate-plan-from-evidence.mjs';

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'focused-candidate-plan-'));
  const sourcesDir = path.join(root, 'itemSources');
  const itemsPath = path.join(root, 'items.standardized.json');
  const npcsPath = path.join(root, 'npcs.standardized.json');
  fs.mkdirSync(sourcesDir, { recursive: true });
  fs.writeFileSync(path.join(sourcesDir, 'itemSources.part-0001.json'), JSON.stringify({ itemSources: [] }));
  fs.writeFileSync(itemsPath, JSON.stringify({
    records: [
      { id: 75, internalName: 'FallenStar', name: 'Fallen Star' },
      { id: 184, internalName: 'Star', name: 'Star' },
      { id: 9000, internalName: 'Painting', name: 'Painting' },
      { id: 1372, internalName: 'BloodMoonRising', name: 'Blood Moon Rising' },
      { id: 5481, internalName: 'BlueDragonfly', name: 'Blue Dragonfly' },
      { id: 576, internalName: 'MusicBox', name: 'Music Box' },
      { id: 567, internalName: 'MusicBoxBoss1', name: 'Music Box (Boss 1)' },
      { id: 3603, internalName: 'LogicGate_AND', name: 'Logic Gate (AND)' },
      { id: 5674, internalName: 'TeamBlockRedVariant', name: 'Dull Red Team Block' },
      { id: 3621, internalName: 'TeamBlockRed', name: 'Red Team Block' }
    ]
  }));
  fs.writeFileSync(npcsPath, JSON.stringify({
    records: [
      { id: 178, internalName: 'Steampunker', name: 'Steampunker', boss: false },
      { id: 368, internalName: 'TravelingMerchant', name: 'Traveling Merchant', boss: false },
      { id: 108, internalName: 'Wizard', name: 'Wizard', boss: false }
    ]
  }));
  return { root, sourcesDir, itemsPath, npcsPath };
}

test('parseBuildItemSourceFocusedCandidatePlanFromEvidenceArgs rejects mutation flags', () => {
  for (const flag of ['--apply', '--write-db', '--sync', '--import', '--materialize', '--backfill', '--crawler', '--fetch']) {
    assert.throws(
      () => parseBuildItemSourceFocusedCandidatePlanFromEvidenceArgs([flag]),
      /read-only focused candidate plan refuses mutation flag/
    );
  }
});

test('buildFocusedCandidatePlanFromEvidence filters raw candidates to raw_candidate_not_projected evidence rows', () => {
  const fixture = createFixture();
  const plan = buildFocusedCandidatePlanFromEvidence({
    evidenceReport: {
      rowsByEvidenceLayer: {
        raw_candidate_not_projected: [
          { itemId: 75, internalName: 'FallenStar', name: 'Fallen Star' },
          { itemId: 9000, internalName: 'Painting', name: 'Painting' }
        ],
        recipe_or_shimmer_covered: [
          { itemId: 184, internalName: 'Star', name: 'Star' }
        ]
      }
    },
    rawCandidateReport: {
      generatedAt: '2026-06-11T00:00:00.000Z',
      readOnly: true,
      candidates: [
        {
          itemId: 75,
          itemInternalName: 'FallenStar',
          name: 'Fallen Star',
          pageTitle: 'Fallen Star',
          reviewLane: 'direct_page_candidate',
          extractedSourceCount: 1,
          standardizedSourceCount: 0,
          extractedSources: [
            { sourceType: 'worldgen', sourceRefType: 'world', sourceRefName: 'Fallen Star sky fall' }
          ]
        },
        {
          itemId: 184,
          itemInternalName: 'Star',
          name: 'Star',
          pageTitle: 'Star',
          reviewLane: 'direct_page_candidate',
          extractedSourceCount: 1,
          standardizedSourceCount: 0,
          extractedSources: [
            { sourceType: 'drop', sourceRefType: 'npc_group', sourceRefName: 'any enemy' }
          ]
        },
        {
          itemId: 9000,
          itemInternalName: 'Painting',
          name: 'Painting',
          pageTitle: 'Unreviewed Decorations',
          reviewLane: 'family_or_shared_page_candidate',
          extractedSourceCount: 1,
          standardizedSourceCount: 0,
          extractedSources: [
            { sourceType: 'worldgen', sourceRefType: 'world', sourceRefName: 'Paintings worldgen' }
          ]
        }
      ]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.readOnly, true);
  assert.equal(plan.summary.totalCandidates, 2);
  assert.deepEqual(plan.summary.classificationCounts, {
    high_confidence: 1,
    family_page_candidate: 1
  });
  assert.equal(plan.summary.eligibleCandidates, 1);
  assert.equal(plan.summary.blockedCandidates, 1);
  assert.deepEqual(plan.eligibleCandidates.map((candidate) => candidate.itemInternalName), ['FallenStar']);
  assert.deepEqual(plan.blockedCandidates.map((candidate) => candidate.itemInternalName), ['Painting']);
});

test('buildFocusedCandidatePlanFromEvidence promotes reviewed small family pending rows from audited raw pages', () => {
  const fixture = createFixture();
  const plan = buildFocusedCandidatePlanFromEvidence({
    evidenceReport: {
      rowsByEvidenceLayer: {
        family_policy_pending: [
          { itemId: 3603, internalName: 'LogicGate_AND', name: 'Logic Gate (AND)' },
          { itemId: 5674, internalName: 'TeamBlockRedVariant', name: 'Dull Red Team Block' },
          { itemId: 9000, internalName: 'Painting', name: 'Painting' }
        ]
      }
    },
    rawCandidateReport: { generatedAt: '2026-06-11T00:00:00.000Z', readOnly: true, candidates: [] },
    familyCandidateAuditSummary: {
      generatedAt: '2026-06-13T00:00:00.000Z',
      readOnly: true,
      candidates: [
        {
          itemId: 3603,
          itemInternalName: 'LogicGate_AND',
          itemName: 'Logic Gate (AND)',
          pageTitle: 'Logic Gates',
          classification: 'family_page_candidate',
          rawSourceCount: 1,
          standardizedSourceCount: 0,
          extractedSources: [
            { sourceType: 'shop', sourceRefType: 'npc', sourceRefName: 'Steampunker' }
          ]
        },
        {
          itemId: 5674,
          itemInternalName: 'TeamBlockRedVariant',
          itemName: 'Dull Red Team Block',
          pageTitle: 'Team Blocks',
          classification: 'family_page_candidate',
          rawSourceCount: 1,
          standardizedSourceCount: 0,
          extractedSources: [
            { sourceType: 'shop', sourceRefType: 'npc', sourceRefName: 'Traveling Merchant' }
          ],
          extractedRecipes: [
            {
              resultName: 'Dull Red Team Block',
              resultQuantity: 1,
              ingredients: [
                { ingredientName: 'Red Team Block', ingredientGroupType: 'item' }
              ],
              stations: []
            }
          ]
        },
        {
          itemId: 9000,
          itemInternalName: 'Painting',
          itemName: 'Painting',
          pageTitle: 'Unreviewed Decorations',
          classification: 'family_page_candidate',
          rawSourceCount: 1,
          standardizedSourceCount: 0,
          extractedSources: [
            { sourceType: 'worldgen', sourceRefType: 'world', sourceRefName: 'Paintings worldgen' }
          ]
        }
      ]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.totalCandidates, 2);
  assert.equal(plan.summary.eligibleCandidates, 2);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.deepEqual(
    plan.eligibleCandidates.map((candidate) => [
      candidate.itemInternalName,
      candidate.plannedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName])
    ]),
    [
      ['LogicGate_AND', [['shop', 'npc', 'Steampunker']]],
      ['TeamBlockRedVariant', [['shimmer', 'item', 'Red Team Block']]]
    ]
  );
});

test('buildFocusedCandidatePlanFromEvidence promotes current remaining reviewed family pages', () => {
  const fixture = createFixture();
  const plan = buildFocusedCandidatePlanFromEvidence({
    evidenceReport: {
      rowsByEvidenceLayer: {
        family_policy_pending: [
          { itemId: 5481, internalName: 'BlueDragonfly', name: 'Blue Dragonfly' },
          { itemId: 567, internalName: 'MusicBoxBoss1', name: 'Music Box (Boss 1)' },
          { itemId: 1372, internalName: 'BloodMoonRising', name: 'Blood Moon Rising' }
        ]
      }
    },
    rawCandidateReport: { generatedAt: '2026-06-11T00:00:00.000Z', readOnly: true, candidates: [] },
    familyCandidateAuditSummary: {
      generatedAt: '2026-06-13T00:00:00.000Z',
      readOnly: true,
      candidates: [
        {
          itemId: 5481,
          itemInternalName: 'BlueDragonfly',
          itemName: 'Blue Dragonfly',
          pageTitle: 'Dragonflies',
          classification: 'family_page_candidate',
          extractedSources: [
            { sourceType: 'worldgen', sourceRefType: 'world', sourceRefName: 'Dragonflies worldgen' }
          ]
        },
        {
          itemId: 567,
          itemInternalName: 'MusicBoxBoss1',
          itemName: 'Music Box (Boss 1)',
          pageTitle: 'Music Boxes',
          classification: 'family_page_candidate',
          extractedSources: [
            { sourceType: 'shop', sourceRefType: 'npc', sourceRefName: 'Wizard' }
          ]
        },
        {
          itemId: 1372,
          itemInternalName: 'BloodMoonRising',
          itemName: 'Blood Moon Rising',
          pageTitle: 'Paintings',
          classification: 'family_page_candidate',
          extractedSources: [
            { sourceType: 'worldgen', sourceRefType: 'world', sourceRefName: 'Paintings worldgen' }
          ]
        }
      ]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.totalCandidates, 3);
  assert.equal(plan.summary.eligibleCandidates, 3);
  assert.deepEqual(
    plan.eligibleCandidates.map((candidate) => [
      candidate.itemInternalName,
      candidate.plannedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName])
    ]),
    [
      ['BlueDragonfly', [['capture', 'world', 'Bug Net capture']]],
      ['MusicBoxBoss1', [['transformation', 'item', 'Music Box']]],
      ['BloodMoonRising', [['worldgen', 'world', 'Paintings worldgen']]]
    ]
  );
});
