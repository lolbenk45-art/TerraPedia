import test from 'node:test';
import assert from 'node:assert/strict';

import { buildNpcStandardizedBridge } from '../src/bridge/build-npc-standardized-bridge.mjs';

test('buildNpcStandardizedBridge overlays wikiCrawler data without breaking the standardized npc shape', () => {
  const standardizedPayload = {
    entity: 'npcs',
    records: [
      {
        id: 480,
        internalName: 'Medusa',
        name: 'Medusa',
        combat: { damage: 30 },
        dimensions: { width: 18 },
        economy: { value: 1000 }
      }
    ]
  };
  const crawlerRecords = [
    {
      entityId: 'medusa',
      display: { name: 'Medusa' },
      source: { pageTitle: 'Medusa' },
      summary: { leadText: 'Medusa is a Hardmode enemy.' },
      profile: { kind: 'enemy' },
      shop: { items: [] },
      happiness: { sourceTemplatePresent: false, notes: [] },
      relationships: { relatedNpcs: [], relatedItems: [], relatedBiomes: [] },
      contentBlocks: { dialogue: '', tips: '', history: '' },
      audit: { status: 'pass', reasons: [] },
      sourceMetadata: { pageId: 13709 }
    }
  ];

  const result = buildNpcStandardizedBridge({
    standardizedPayload,
    crawlerNormalizedRecords: crawlerRecords
  });

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].internalName, 'Medusa');
  assert.equal(result.records[0].combat.damage, 30);
  assert.equal(result.records[0].wikiCrawler.summary.leadText, 'Medusa is a Hardmode enemy.');
  assert.equal(result.summary.matched, 1);
  assert.equal(result.summary.unmatchedCrawler, 0);
});

test('buildNpcStandardizedBridge enriches every standardized npc record that shares the same page title', () => {
  const standardizedPayload = {
    entity: 'npcs',
    records: [
      { id: -55, internalName: 'BigRainZombie', name: 'Zombie' },
      { id: -54, internalName: 'SmallRainZombie', name: 'Zombie' }
    ]
  };
  const crawlerRecords = [
    {
      entityId: 'zombie',
      display: { name: 'Zombie' },
      source: { pageTitle: 'Zombie' },
      summary: { leadText: 'Zombie is a common enemy.' },
      profile: { kind: 'enemy' },
      shop: { items: [] },
      happiness: { sourceTemplatePresent: false, notes: [] },
      relationships: { relatedNpcs: [], relatedItems: [], relatedBiomes: [] },
      contentBlocks: { dialogue: '', tips: '', history: '' },
      audit: { status: 'pass', reasons: [] },
      sourceMetadata: { pageId: 3 }
    }
  ];

  const result = buildNpcStandardizedBridge({
    standardizedPayload,
    crawlerNormalizedRecords: crawlerRecords
  });

  assert.equal(result.records[0].wikiCrawler.summary.leadText, 'Zombie is a common enemy.');
  assert.equal(result.records[1].wikiCrawler.summary.leadText, 'Zombie is a common enemy.');
  assert.equal(result.summary.matched, 2);
});
