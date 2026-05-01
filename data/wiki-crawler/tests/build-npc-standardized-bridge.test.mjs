import test from 'node:test';
import assert from 'node:assert/strict';

import { buildNpcStandardizedBridge } from '../src/bridge/build-npc-standardized-bridge.mjs';
import { buildNpcItemRelationsBundle } from '../../../scripts/data/fetch/build-npc-item-relations-bundle.mjs';

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
      combat: { projectileId: '24' },
      buffInflictions: [
        {
          buffName: 'Stoned',
          durationText: '{{duration|rawseconds=1-4}}',
          sourceSection: 'infobox'
        }
      ],
      summary: { leadText: 'Medusa is a Hardmode enemy.' },
      profile: { kind: 'enemy' },
      shop: {
        items: [],
        normalizedRows: [
          {
            relationType: 'shop',
            itemName: 'Lesser Healing Potion',
            priceText: '3 silver',
            conditionText: 'Always'
          }
        ]
      },
      loot: [
        {
          relationType: 'loot',
          itemName: 'Pocket Mirror',
          chanceText: '1%',
          quantityText: '1'
        }
      ],
      backfillCandidates: [
        {
          candidateKey: 'a'.repeat(64),
          domain: 'npc_item_relation',
          entityType: 'npc',
          entityInternalName: 'medusa',
          missingField: 'shop',
          recommendedAction: 'crawl_npc_page',
          evidenceJson: [{ sourcePage: 'Medusa' }],
          status: 'open'
        }
      ],
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
  assert.equal(result.records[0].wikiCrawler.combat.projectileId, '24');
  assert.equal(result.records[0].wikiCrawler.buffInflictions[0].buffName, 'Stoned');
  assert.equal(result.records[0].wikiCrawler.shop[0].itemName, 'Lesser Healing Potion');
  assert.equal(result.records[0].wikiCrawler.loot[0].itemName, 'Pocket Mirror');
  assert.equal(result.records[0].wikiCrawler.backfillCandidates[0].candidateKey, 'a'.repeat(64));
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

test('buildNpcItemRelationsBundle materializes standardized NPC shop, loot, and backfill candidates', () => {
  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-04-29T00:00:00.000Z',
    standardizedPayload: {
      entity: 'npcs',
      records: [
        {
          id: 17,
          internalName: 'Merchant',
          name: 'Merchant',
          wikiCrawler: {
            pageTitle: 'Merchant',
            shop: [
              {
                relationType: 'shop',
                itemName: 'Lesser Healing Potion',
                priceText: '3 silver',
                conditionText: 'Always',
                sourceSection: 'shop',
                sourceRowIndex: 0,
                raw: { itemName: 'Lesser Healing Potion' }
              }
            ],
            loot: [
              {
                relationType: 'loot',
                itemName: 'Merchant Hat',
                chanceText: '100%',
                quantityText: '1',
                sourceSection: 'drops',
                sourceRowIndex: 0,
                raw: { itemName: 'Merchant Hat' }
              }
            ],
            backfillCandidates: [
              {
                candidateKey: 'b'.repeat(64),
                domain: 'npc_item_relation',
                entityType: 'npc',
                entityInternalName: 'Merchant',
                entitySourceId: 17,
                missingField: 'loot',
                recommendedAction: 'crawl_npc_page',
                evidenceJson: [{ sourcePage: 'Merchant' }],
                status: 'open'
              }
            ]
          }
        }
      ]
    }
  });

  assert.equal(bundle.schemaVersion, 1);
  assert.equal(bundle.source, 'wiki-crawler:npc');
  assert.equal(bundle.generatedAt, '2026-04-29T00:00:00.000Z');
  assert.deepEqual(
    bundle.records.map((record) => ({
      recordKey: record.recordKey,
      relationType: record.relationType,
      npcInternalName: record.npcInternalName,
      itemName: record.itemName,
      priceText: record.priceText,
      chanceText: record.chanceText,
      sourceUrl: record.sourceUrl
    })),
    [
      {
        recordKey: 'npc-item:merchant:shop:lesser-healing-potion',
        relationType: 'shop',
        npcInternalName: 'Merchant',
        itemName: 'Lesser Healing Potion',
        priceText: '3 silver',
        chanceText: null,
        sourceUrl: 'https://terraria.wiki.gg/wiki/Merchant'
      },
      {
        recordKey: 'npc-item:merchant:loot:merchant-hat',
        relationType: 'loot',
        npcInternalName: 'Merchant',
        itemName: 'Merchant Hat',
        priceText: null,
        chanceText: '100%',
        sourceUrl: 'https://terraria.wiki.gg/wiki/Merchant'
      }
    ]
  );
  assert.equal(bundle.backfillCandidates[0].candidateKey, 'b'.repeat(64));
});

test('buildNpcItemRelationsBundle uses zh wiki source URLs when crawler source came from zh api', () => {
  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-04-29T00:00:00.000Z',
    standardizedPayload: {
      entity: 'npcs',
      records: [
        {
          id: 17,
          internalName: 'Merchant',
          name: 'Merchant',
          wikiCrawler: {
            pageTitle: '商人',
            sourceMetadata: {
              apiUrl: 'https://terraria.wiki.gg/zh/api.php'
            },
            shop: [
              {
                relationType: 'shop',
                itemName: 'Heart Arrow',
                priceText: '{{cc|50}}',
                conditionText: "During [[Valentine's Day]]",
                sourceSection: 'shop',
                sourceRowIndex: 0,
                raw: { itemName: 'Heart Arrow' }
              }
            ]
          }
        }
      ]
    }
  });

  assert.equal(bundle.records[0].sourceUrl, 'https://terraria.wiki.gg/zh/wiki/%E5%95%86%E4%BA%BA');
});

test('buildNpcItemRelationsBundle keeps standardized NPC internal name over crawler entity id', () => {
  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-04-29T00:00:00.000Z',
    standardizedPayload: {
      entity: 'npcs',
      records: [
        {
          id: 17,
          internalName: 'Merchant',
          name: 'Merchant',
          wikiCrawler: {
            pageTitle: '商人',
            shop: [
              {
                relationType: 'shop',
                itemName: 'Heart Arrow',
                npcInternalName: 'merchant',
                npcName: '商人',
                sourceSection: 'shop',
                sourceRowIndex: 0,
                raw: { itemName: 'Heart Arrow' }
              }
            ]
          }
        }
      ]
    }
  });

  assert.equal(bundle.records[0].npcInternalName, 'Merchant');
  assert.equal(bundle.records[0].npcName, 'Merchant');
});
