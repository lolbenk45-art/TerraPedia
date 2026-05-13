import test from 'node:test';
import assert from 'node:assert/strict';

import { buildNpcStandardizedBridge } from '../src/bridge/build-npc-standardized-bridge.mjs';
import { buildNpcItemRelationsBundle } from '../../fetch/build-npc-item-relations-bundle.mjs';

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

test('buildNpcStandardizedBridge marks unique direct-page loot rows as exact scoped evidence', () => {
  const standardizedPayload = {
    entity: 'npcs',
    records: [
      { id: 253, internalName: 'Reaper', name: 'Reaper' }
    ]
  };
  const crawlerRecords = [
    {
      entityId: 'reaper',
      display: { name: 'Reaper' },
      source: { pageTitle: 'Reaper' },
      profile: { kind: 'enemy' },
      loot: [
        {
          relationType: 'loot',
          itemName: 'Death Sickle',
          chanceText: '2.5%',
          quantityText: '1',
          sourceRowIndex: 0
        },
        {
          relationType: 'loot',
          itemName: 'Death Sickle',
          chanceText: '2.5%',
          quantityText: '1',
          sourceRowIndex: 1
        }
      ]
    }
  ];

  const result = buildNpcStandardizedBridge({
    standardizedPayload,
    crawlerNormalizedRecords: crawlerRecords
  });
  const reaper = result.records.find((record) => record.internalName === 'Reaper');
  assert.deepEqual(
    reaper.wikiCrawler.loot.map((row) => [row.itemName, row.sourceRefInternalName, row.sourceRefResolution]),
    [
      ['Death Sickle', 'Reaper', 'exact_internal_name'],
      ['Death Sickle', 'Reaper', 'exact_internal_name']
    ]
  );

  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-05-13T00:00:00.000Z',
    standardizedPayload: result
  });
  assert.deepEqual(
    bundle.records.map((record) => [record.itemName, record.sourceRowIndex]),
    [
      ['Death Sickle', 0],
      ['Death Sickle', 1]
    ]
  );
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

test('buildNpcStandardizedBridge keeps only matching group-page infobox debuffs for each NPC', () => {
  const standardizedPayload = {
    entity: 'npcs',
    records: [
      { id: 525, internalName: 'DesertGhoulCorruption', name: 'Vile Ghoul' },
      { id: 526, internalName: 'DesertGhoulCrimson', name: 'Tainted Ghoul' },
      { id: 527, internalName: 'DesertGhoulHallow', name: 'Dreamer Ghoul' },
      { id: 126, internalName: 'Spazmatism', name: 'Spazmatism' }
    ]
  };
  const crawlerRecords = [
    {
      entityId: 'vile-ghoul',
      display: { name: 'Ghouls' },
      source: { pageTitle: 'Ghouls' },
      buffInflictions: [
        { buffName: 'Cursed Inferno', sourceInfobox: { autoId: '525', image: 'Vile Ghoul.gif', name: '' } },
        { buffName: 'Ichor', sourceInfobox: { autoId: '526', image: 'Tainted Ghoul.gif', name: '' } },
        { buffName: 'Confused', sourceInfobox: { autoId: '527', image: 'Dreamer Ghoul.gif', name: '' } }
      ]
    },
    {
      entityId: 'spazmatism',
      display: { name: 'The Twins' },
      source: { pageTitle: 'The Twins' },
      buffInflictions: [
        { buffName: 'Cursed Inferno', sourceInfobox: { autoId: '126', image: 'Spazmatism (first form).gif', name: '' } }
      ]
    }
  ];

  const result = buildNpcStandardizedBridge({
    standardizedPayload,
    crawlerNormalizedRecords: crawlerRecords
  });

  const vileGhoul = result.records.find((record) => record.internalName === 'DesertGhoulCorruption');
  const spazmatism = result.records.find((record) => record.internalName === 'Spazmatism');
  assert.deepEqual(vileGhoul.wikiCrawler.buffInflictions.map((row) => row.buffName), ['Cursed Inferno']);
  assert.deepEqual(spazmatism.wikiCrawler.buffInflictions.map((row) => row.buffName), ['Cursed Inferno']);
});

test('buildNpcStandardizedBridge keeps only matching group-page infobox loot for Mimic variants', () => {
  const standardizedPayload = {
    entity: 'npcs',
    records: [
      { id: 473, internalName: 'BigMimicCrimson', name: 'Crimson Mimic' },
      { id: 474, internalName: 'BigMimicHallow', name: 'Hallowed Mimic' }
    ]
  };
  const crawlerRecords = [
    {
      entityId: 'mimics',
      display: { name: 'Mimics' },
      source: { pageTitle: 'Mimics' },
      loot: [
        {
          relationType: 'loot',
          itemName: 'Life Drain',
          chanceText: '20%',
          quantityText: '1',
          sourceSection: 'drops',
          sourceInfobox: { autoId: '473', image: 'Crimson Mimic.gif', name: 'Crimson Mimic' }
        },
        {
          relationType: 'loot',
          itemName: 'Dart Pistol',
          chanceText: '20%',
          quantityText: '1',
          sourceSection: 'drops',
          sourceInfobox: { autoId: '473', image: 'Crimson Mimic.gif', name: 'Crimson Mimic' }
        },
        {
          relationType: 'loot',
          itemName: 'Flying Knife',
          chanceText: '25%',
          quantityText: '1',
          sourceSection: 'drops',
          sourceInfobox: { autoId: '474', image: 'Hallowed Mimic.gif', name: 'Hallowed Mimic' }
        }
      ]
    }
  ];

  const result = buildNpcStandardizedBridge({
    standardizedPayload,
    crawlerNormalizedRecords: crawlerRecords
  });

  const crimson = result.records.find((record) => record.internalName === 'BigMimicCrimson');
  const hallowed = result.records.find((record) => record.internalName === 'BigMimicHallow');
  assert.deepEqual(crimson.wikiCrawler.loot.map((row) => row.itemName), ['Life Drain', 'Dart Pistol']);
  assert.deepEqual(hallowed.wikiCrawler.loot.map((row) => row.itemName), ['Flying Knife']);

  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-05-09T00:00:00.000Z',
    standardizedPayload: result
  });
  const crimsonRecords = bundle.records.filter((record) => record.npcInternalName === 'BigMimicCrimson');
  assert.deepEqual(crimsonRecords.map((record) => record.itemName), ['Life Drain', 'Dart Pistol']);
  assert.ok(crimsonRecords.every((record) => record.sourceRefInternalName === 'BigMimicCrimson'));
  assert.ok(crimsonRecords.every((record) => record.sourceRefResolution === 'exact_internal_name'));
});

test('buildNpcStandardizedBridge attaches no-loot source infobox evidence only to exact auto-id matches', () => {
  const standardizedPayload = {
    entity: 'npcs',
    records: [
      { id: 611, internalName: 'Owl', name: 'Owl', imageFileTitle: 'Owl.gif' },
      { id: 689, internalName: 'OwlMimic', name: 'Owl', imageFileTitle: 'Owl.png' }
    ]
  };
  const crawlerRecords = [
    {
      entityId: 'owl',
      display: { name: 'Owl' },
      source: { pageTitle: 'Owl' },
      sourceInfoboxes: [
        { autoId: '689', image: 'Owl.png', name: '' }
      ],
      profile: { kind: 'Critter' },
      loot: []
    }
  ];

  const result = buildNpcStandardizedBridge({
    standardizedPayload,
    crawlerNormalizedRecords: crawlerRecords
  });

  const owl = result.records.find((record) => record.internalName === 'Owl');
  const owlMimic = result.records.find((record) => record.internalName === 'OwlMimic');
  assert.equal(owl.wikiCrawler, undefined);
  assert.deepEqual(owlMimic.wikiCrawler.loot, []);
  assert.deepEqual(owlMimic.wikiCrawler.sourceInfoboxes, [
    { autoId: '689', image: 'Owl.png', name: '' }
  ]);
  assert.equal(result.summary.matched, 1);
});

test('buildNpcStandardizedBridge normalizes commented source infobox auto ids before matching', () => {
  const standardizedPayload = {
    entity: 'npcs',
    records: [
      { id: 21, internalName: 'Skeleton', name: 'Skeleton', imageFileTitle: 'Skeleton.gif' },
      { id: 449, internalName: 'BoneThrowingSkeleton', name: 'Skeleton', imageFileTitle: 'Skeleton.gif' }
    ]
  };
  const crawlerRecords = [
    {
      entityId: 'skeleton',
      display: { name: 'Skeleton' },
      source: { pageTitle: 'Skeleton' },
      sourceInfoboxes: [
        { autoId: '449 <!--| expertonly = no -->', image: 'Skeleton.gif', name: '' }
      ],
      profile: { kind: 'Enemy' },
      loot: [
        {
          itemName: 'Hook',
          chanceText: '4%',
          quantityText: '1',
          sourceInfobox: { autoId: '21', image: 'Skeleton.gif', name: '' }
        }
      ]
    }
  ];

  const result = buildNpcStandardizedBridge({
    standardizedPayload,
    crawlerNormalizedRecords: crawlerRecords
  });

  const skeleton = result.records.find((record) => record.internalName === 'Skeleton');
  const boneThrowing = result.records.find((record) => record.internalName === 'BoneThrowingSkeleton');
  assert.deepEqual(skeleton.wikiCrawler.loot.map((row) => row.itemName), ['Hook']);
  assert.deepEqual(boneThrowing.wikiCrawler.sourceInfoboxes, [
    { autoId: '449', image: 'Skeleton.gif', name: '' }
  ]);
  assert.deepEqual(boneThrowing.wikiCrawler.loot, []);
});

test('buildNpcStandardizedBridge does not fan out same-name scoped loot without exact variant evidence', () => {
  const standardizedPayload = {
    entity: 'npcs',
    records: [
      { id: 801, internalName: 'Scarecrow1', name: 'Scarecrow' },
      { id: 802, internalName: 'Scarecrow2', name: 'Scarecrow' }
    ]
  };
  const crawlerRecords = [
    {
      entityId: 'scarecrow',
      display: { name: 'Scarecrow' },
      source: { pageTitle: 'Scarecrow' },
      loot: [
        {
          relationType: 'loot',
          itemName: 'Pumpkin Pie',
          chanceText: '1.79%',
          quantityText: '1',
          sourceSection: 'drops',
          sourceInfobox: { autoId: '', image: 'Scarecrow.png', name: 'Scarecrow' }
        }
      ]
    }
  ];

  const result = buildNpcStandardizedBridge({
    standardizedPayload,
    crawlerNormalizedRecords: crawlerRecords
  });

  assert.deepEqual(result.records.find((record) => record.internalName === 'Scarecrow1').wikiCrawler.loot, []);
  assert.deepEqual(result.records.find((record) => record.internalName === 'Scarecrow2').wikiCrawler.loot, []);
});

test('buildNpcStandardizedBridge matches same-name variant loot by image-derived identity only', () => {
  const standardizedPayload = {
    entity: 'npcs',
    records: [
      { id: 801, internalName: 'Scarecrow1', name: 'Scarecrow' },
      { id: 802, internalName: 'Scarecrow2', name: 'Scarecrow' }
    ]
  };
  const crawlerRecords = [
    {
      entityId: 'scarecrow',
      display: { name: 'Scarecrow' },
      source: { pageTitle: 'Scarecrow' },
      loot: [
        {
          relationType: 'loot',
          itemName: 'Pumpkin Pie',
          chanceText: '1.79%',
          quantityText: '1',
          sourceSection: 'drops',
          sourceInfobox: { autoId: '', image: 'Scarecrow 1.png', name: 'Scarecrow' }
        }
      ]
    }
  ];

  const result = buildNpcStandardizedBridge({
    standardizedPayload,
    crawlerNormalizedRecords: crawlerRecords
  });

  assert.deepEqual(
    result.records.find((record) => record.internalName === 'Scarecrow1').wikiCrawler.loot.map((row) => row.itemName),
    ['Pumpkin Pie']
  );
  assert.deepEqual(result.records.find((record) => record.internalName === 'Scarecrow2').wikiCrawler.loot, []);
});

test('buildNpcStandardizedBridge rejects conflicting scoped autoId and image evidence', () => {
  const standardizedPayload = {
    entity: 'npcs',
    records: [
      { id: 305, internalName: 'Scarecrow1', name: 'Scarecrow', imageFileTitle: 'Scarecrow 1.gif' },
      { id: 310, internalName: 'Scarecrow6', name: 'Scarecrow', imageFileTitle: 'Scarecrow 6.gif' }
    ]
  };
  const crawlerRecords = [
    {
      entityId: 'scarecrow',
      display: { name: 'Scarecrow' },
      source: { pageTitle: 'Scarecrow' },
      loot: ['Heart', 'Scarecrow Hat', 'Scarecrow Shirt', 'Scarecrow Pants'].map((itemName, index) => ({
        relationType: 'loot',
        itemName,
        chanceText: index === 0 ? '25%' : '0.37%-3.33%',
        quantityText: '1',
        sourceRowIndex: index,
        sourceSection: 'drops',
        sourceInfobox: { autoId: '305', image: 'Scarecrow 6.gif', name: '' }
      }))
    }
  ];

  const result = buildNpcStandardizedBridge({
    standardizedPayload,
    crawlerNormalizedRecords: crawlerRecords
  });

  assert.deepEqual(result.records.find((record) => record.internalName === 'Scarecrow1').wikiCrawler?.loot ?? [], []);
  assert.deepEqual(result.records.find((record) => record.internalName === 'Scarecrow6').wikiCrawler?.loot ?? [], []);
});

test('buildNpcStandardizedBridge does not attach no-loot source infoboxes when auto id targets another NPC', () => {
  const standardizedPayload = {
    entity: 'npcs',
    records: [
      { id: 569, internalName: 'DD2WitherBeastT3', name: 'Wither Beast', imageFileTitle: 'Wither Beast.gif' }
    ]
  };
  const crawlerRecords = [
    {
      entityId: 'wither-beast',
      display: { name: 'Wither Beast' },
      source: { pageTitle: 'Wither Beast' },
      sourceInfoboxes: [
        { autoId: '568', image: 'Wither Beast.gif', name: '' }
      ],
      loot: []
    }
  ];

  const result = buildNpcStandardizedBridge({
    standardizedPayload,
    crawlerNormalizedRecords: crawlerRecords
  });
  const witherT3 = result.records.find((record) => record.internalName === 'DD2WitherBeastT3');

  assert.deepEqual(witherT3.wikiCrawler.sourceInfoboxes, []);
  assert.deepEqual(witherT3.wikiCrawler.loot, []);
  assert.equal(witherT3.wikiCrawler.sourceLootRowsTotal, 0);
  assert.equal(witherT3.wikiCrawler.pageTitle, 'Wither Beast');
});

test('buildNpcStandardizedBridge keeps exact auto-id source infobox evidence despite stale local image title', () => {
  const standardizedPayload = {
    entity: 'npcs',
    records: [
      { id: 395, internalName: 'MartianSaucerCore', name: 'Martian Saucer', imageFileTitle: 'Martian Saucer Core.png' }
    ]
  };
  const crawlerRecords = [
    {
      entityId: 'martian-saucer',
      display: { name: 'Martian Saucer' },
      source: { pageTitle: 'Martian Saucer' },
      sourceInfoboxes: [
        { autoId: '392', image: 'Martian Saucer.gif', name: '' },
        { autoId: '395', image: 'Martian Saucer Core.gif', name: '' }
      ],
      loot: [
        {
          relationType: 'loot',
          itemName: 'Xenopopper',
          chanceText: '16.66%',
          quantityText: '1',
          sourceSection: 'drops',
          sourceInfobox: { autoId: '392', image: 'Martian Saucer.gif', name: '' }
        }
      ]
    }
  ];

  const result = buildNpcStandardizedBridge({
    standardizedPayload,
    crawlerNormalizedRecords: crawlerRecords
  });
  const core = result.records.find((record) => record.internalName === 'MartianSaucerCore');

  assert.deepEqual(core.wikiCrawler.sourceInfoboxes, [
    { autoId: '395', image: 'Martian Saucer Core.gif', name: '' }
  ]);
  assert.deepEqual(core.wikiCrawler.loot, []);
  assert.equal(core.wikiCrawler.sourceLootRowsTotal, 1);
});

test('buildNpcStandardizedBridge attaches reviewed Scarecrow page-level shared loot to explicit targets', () => {
  const targetInternalNames = Array.from({ length: 10 }, (_, index) => `Scarecrow${index + 1}`);
  const standardizedPayload = {
    entity: 'npcs',
    records: targetInternalNames.map((internalName, index) => ({
      id: 305 + index,
      internalName,
      name: 'Scarecrow',
      imageFileTitle: `Scarecrow ${index + 1}.gif`
    }))
  };
  const crawlerRecords = [
    {
      entityId: 'scarecrow',
      display: { name: 'Scarecrow' },
      source: { pageTitle: 'Scarecrow' },
      sourceMetadata: { revisionTimestamp: '2026-04-01T07:29:09Z' },
      summary: {
        leadText: 'There are ten varieties of Scarecrow, five of which lack legs and can only move by jumping, while the other five follow the normal Fighter AI.'
      },
      loot: ['Heart', 'Scarecrow Hat', 'Scarecrow Shirt', 'Scarecrow Pants'].map((itemName, index) => ({
        relationType: 'loot',
        itemName,
        chanceText: index === 0 ? '25%' : '0.37%-3.33%',
        quantityText: '1',
        sourceRowIndex: index,
        sourceSection: 'drops',
        sourceInfobox: { autoId: '305', image: 'Scarecrow 6.gif', name: '' }
      }))
    }
  ];

  const result = buildNpcStandardizedBridge({
    standardizedPayload,
    crawlerNormalizedRecords: crawlerRecords
  });

  for (const internalName of targetInternalNames) {
    const record = result.records.find((entry) => entry.internalName === internalName);
    assert.equal(record.wikiCrawler.pageTitle, 'Scarecrow');
    assert.equal(record.wikiCrawler.reviewedSharedLoot.evidenceSource, 'docs/audits/2026-05-12_npc-r42-scarecrow-page-shared-loot-review.md');
    assert.deepEqual(record.wikiCrawler.reviewedSharedLoot.targetInternalNames, targetInternalNames);
    assert.deepEqual(record.wikiCrawler.loot.map((row) => row.itemName), ['Heart', 'Scarecrow Hat', 'Scarecrow Shirt', 'Scarecrow Pants']);
  }
  assert.equal(result.summary.matched, 10);
});

test('buildNpcStandardizedBridge attaches reviewed Zombie Elf page-level shared loot only to held variants', () => {
  const standardizedPayload = {
    entity: 'npcs',
    records: [
      { id: 338, internalName: 'ZombieElf', name: 'Zombie Elf', imageFileTitle: 'Zombie Elf.gif' },
      { id: 339, internalName: 'ZombieElfBeard', name: 'Zombie Elf', imageFileTitle: 'Zombie Elf Beard.gif' },
      { id: 340, internalName: 'ZombieElfGirl', name: 'Zombie Elf', imageFileTitle: 'Zombie Elf Girl.gif' },
    ]
  };
  const crawlerRecords = [
    {
      entityId: 'zombie-elf',
      display: { name: 'Zombie Elf' },
      source: { pageTitle: 'Zombie Elf' },
      sourceMetadata: { revisionTimestamp: '2025-03-18T07:10:16Z' },
      summary: {
        leadText: 'The Zombie Elf is a [[Hardmode]], post-[[Plantera]] [[Enemies|enemy]] that spawns during the [[Frost Moon]] [[Events|event]]. They are the most basic fighter-type enemy that spawns during the event.'
      },
      loot: ['Elf Hat', 'Elf Shirt', 'Elf Pants', 'Heart'].map((itemName, index) => ({
        relationType: 'loot',
        itemName,
        chanceText: index === 3 ? '20%' : '0.17%',
        quantityText: '1',
        sourceRowIndex: index,
        sourceSection: 'drops',
        sourceInfobox: { autoId: '338', image: 'Zombie Elves.png', name: '' }
      }))
    }
  ];

  const result = buildNpcStandardizedBridge({
    standardizedPayload,
    crawlerNormalizedRecords: crawlerRecords
  });

  const base = result.records.find((entry) => entry.internalName === 'ZombieElf');
  assert.equal(base.wikiCrawler.reviewedSharedLoot, undefined);
  assert.deepEqual(base.wikiCrawler.loot, []);

  for (const internalName of ['ZombieElfBeard', 'ZombieElfGirl']) {
    const record = result.records.find((entry) => entry.internalName === internalName);
    assert.equal(record.wikiCrawler.pageTitle, 'Zombie Elf');
    assert.equal(record.wikiCrawler.reviewedSharedLoot.evidenceSource, 'docs/audits/2026-05-12_npc-r43-zombie-elf-page-shared-loot-review.md');
    assert.deepEqual(record.wikiCrawler.reviewedSharedLoot.targetInternalNames, ['ZombieElfBeard', 'ZombieElfGirl']);
    assert.deepEqual(record.wikiCrawler.loot.map((row) => row.itemName), ['Elf Hat', 'Elf Shirt', 'Elf Pants', 'Heart']);
    assert.ok(record.wikiCrawler.loot.every((row) => row.sourceRefName === 'Zombie Elf'));
    assert.ok(record.wikiCrawler.loot.every((row) => row.sourceRefResolution === 'reviewed_page_level_shared_loot'));
  }
  assert.equal(result.summary.matched, 3);
});

test('buildNpcStandardizedBridge attaches reviewed Zombie and Skeleton shared loot only to explicitly reviewed base variants', () => {
  const standardizedPayload = {
    entity: 'npcs',
    records: [
      { id: 3, internalName: 'Zombie', name: 'Zombie', imageFileTitle: 'Zombie.gif' },
      { id: 132, internalName: 'BaldZombie', name: 'Zombie', imageFileTitle: 'Bald Zombie.gif' },
      { id: 188, internalName: 'SwampZombie', name: 'Zombie', imageFileTitle: 'Swamp Zombie.gif' },
      { id: 189, internalName: 'TwiggyZombie', name: 'Zombie', imageFileTitle: 'Twiggy Zombie.gif' },
      { id: 200, internalName: 'FemaleZombie', name: 'Zombie', imageFileTitle: 'Female Zombie.gif' },
      { id: 319, internalName: 'ZombieDoctor', name: 'Zombie', imageFileTitle: 'Nurse Zombie.gif' },
      { id: 430, internalName: 'ArmedZombie', name: 'Zombie', imageFileTitle: 'Armed Zombie.gif' },
      { id: 21, internalName: 'Skeleton', name: 'Skeleton', imageFileTitle: 'Skeleton.gif' },
      { id: 201, internalName: 'HeadacheSkeleton', name: 'Skeleton', imageFileTitle: 'Headache Skeleton.gif' },
      { id: 202, internalName: 'MisassembledSkeleton', name: 'Skeleton', imageFileTitle: 'Misassembled Skeleton.gif' },
      { id: 203, internalName: 'PantlessSkeleton', name: 'Skeleton', imageFileTitle: 'Pantless Skeleton.gif' },
      { id: 322, internalName: 'SkeletonTopHat', name: 'Skeleton', imageFileTitle: 'Top Hat Skeleton.gif' },
      { id: 323, internalName: 'SkeletonAstonaut', name: 'Skeleton', imageFileTitle: 'Astronaut Skeleton.gif' },
      { id: 324, internalName: 'SkeletonAlien', name: 'Skeleton', imageFileTitle: 'Alien Skeleton.gif' },
      { id: 449, internalName: 'BoneThrowingSkeleton', name: 'Skeleton', imageFileTitle: 'Skeleton.gif' },
      { id: 450, internalName: 'BoneThrowingSkeleton2', name: 'Skeleton', imageFileTitle: 'Headache Skeleton.gif' },
    ]
  };
  const crawlerRecords = [
    {
      entityId: 'zombie',
      display: { name: 'Zombie' },
      source: { pageTitle: 'Zombie' },
      sourceMetadata: { revisionTimestamp: '2026-04-08T00:43:54Z' },
      summary: {
        leadText: 'The Zombie is a common pre-Hardmode enemy that spawns on the surface at night, and is a primary reason newer players will want to build a shelter before night arrives.'
      },
      loot: ['Shackle', 'Zombie Arm', 'Spiffo Plush'].map((itemName, index) => ({
        relationType: 'loot',
        itemName,
        chanceText: index === 0 ? '2%' : index === 1 ? '0.4%' : '0.07%',
        quantityText: '1',
        sourceRowIndex: index,
        sourceSection: 'drops',
        sourceInfobox: { autoId: '3', image: 'Zombie.gif', name: '' }
      }))
    },
    {
      entityId: 'skeleton',
      display: { name: 'Skeleton' },
      source: { pageTitle: 'Skeleton' },
      sourceMetadata: { revisionTimestamp: '2026-05-10T13:23:02Z' },
      summary: {
        leadText: 'The Skeleton is a pre-Hardmode enemy that frequently spawns in the Cavern layer as one of many variants. Regular Skeletons can be spawned by the Skeleton Statue.'
      },
      loot: ['Carton of Milk', 'Ancient Iron Helmet', 'Ancient Gold Helmet', 'Bone Sword', 'Skull', 'Hook'].map((itemName, index) => ({
        relationType: 'loot',
        itemName,
        chanceText: ['0.67%', '1%', '0.5%', '0.5%', '0.2%', '4%'][index],
        quantityText: '1',
        sourceRowIndex: index,
        sourceSection: 'drops',
        sourceInfobox: { autoId: '21', image: 'Skeleton.gif', name: '' }
      }))
    }
  ];

  const result = buildNpcStandardizedBridge({
    standardizedPayload,
    crawlerNormalizedRecords: crawlerRecords
  });

  for (const internalName of ['BaldZombie', 'SwampZombie', 'TwiggyZombie', 'FemaleZombie']) {
    const record = result.records.find((entry) => entry.internalName === internalName);
    assert.equal(record.wikiCrawler.reviewedSharedLoot.evidenceSource, 'docs/audits/2026-05-12_npc-r51-zombie-skeleton-shared-loot-review.md');
    assert.deepEqual(record.wikiCrawler.loot.map((row) => row.itemName), ['Shackle', 'Zombie Arm', 'Spiffo Plush']);
    assert.ok(record.wikiCrawler.loot.every((row) => row.sourceRefName === 'Zombie'));
    assert.ok(record.wikiCrawler.loot.every((row) => row.sourceRefResolution === 'reviewed_page_level_shared_loot'));
  }

  for (const internalName of ['HeadacheSkeleton', 'MisassembledSkeleton', 'PantlessSkeleton']) {
    const record = result.records.find((entry) => entry.internalName === internalName);
    assert.equal(record.wikiCrawler.reviewedSharedLoot.evidenceSource, 'docs/audits/2026-05-12_npc-r51-zombie-skeleton-shared-loot-review.md');
    assert.deepEqual(record.wikiCrawler.loot.map((row) => row.itemName), ['Carton of Milk', 'Ancient Iron Helmet', 'Ancient Gold Helmet', 'Bone Sword', 'Skull', 'Hook']);
    assert.ok(record.wikiCrawler.loot.every((row) => row.sourceRefName === 'Skeleton'));
    assert.ok(record.wikiCrawler.loot.every((row) => row.sourceRefResolution === 'reviewed_page_level_shared_loot'));
  }

  for (const internalName of ['Zombie', 'ZombieDoctor', 'ArmedZombie', 'Skeleton', 'SkeletonTopHat', 'SkeletonAstonaut', 'SkeletonAlien', 'BoneThrowingSkeleton', 'BoneThrowingSkeleton2']) {
    const record = result.records.find((entry) => entry.internalName === internalName);
    assert.equal(record.wikiCrawler?.reviewedSharedLoot, undefined, `${internalName} must not be closed by R51 reviewed shared loot`);
  }
});

test('buildNpcStandardizedBridge rejects Zombie shared loot when required rows are not scoped to base Zombie infobox', () => {
  const standardizedPayload = {
    entity: 'npcs',
    records: [
      { id: 132, internalName: 'BaldZombie', name: 'Zombie', imageFileTitle: 'Bald Zombie.gif' },
      { id: 188, internalName: 'SwampZombie', name: 'Zombie', imageFileTitle: 'Swamp Zombie.gif' },
      { id: 189, internalName: 'TwiggyZombie', name: 'Zombie', imageFileTitle: 'Twiggy Zombie.gif' },
      { id: 200, internalName: 'FemaleZombie', name: 'Zombie', imageFileTitle: 'Female Zombie.gif' },
    ]
  };
  const crawlerRecords = [
    {
      entityId: 'zombie',
      display: { name: 'Zombie' },
      source: { pageTitle: 'Zombie' },
      sourceMetadata: { revisionTimestamp: '2026-04-08T00:43:54Z' },
      summary: {
        leadText: 'The Zombie is a common pre-Hardmode enemy that spawns on the surface at night. Most variants can now drop the Spiffo Plush.'
      },
      loot: ['Shackle', 'Zombie Arm', 'Spiffo Plush'].map((itemName, index) => ({
        relationType: 'loot',
        itemName,
        chanceText: index === 0 ? '2%' : index === 1 ? '0.4%' : '0.07%',
        quantityText: '1',
        sourceRowIndex: index,
        sourceSection: 'drops',
        sourceInfobox: { autoId: '186', image: 'Pincushion Zombie.gif', name: 'Pincushion Zombie' }
      }))
    }
  ];

  const result = buildNpcStandardizedBridge({
    standardizedPayload,
    crawlerNormalizedRecords: crawlerRecords
  });

  for (const internalName of ['BaldZombie', 'SwampZombie', 'TwiggyZombie', 'FemaleZombie']) {
    const record = result.records.find((entry) => entry.internalName === internalName);
    assert.equal(record.wikiCrawler?.reviewedSharedLoot, undefined, `${internalName} must not inherit non-base Zombie rows`);
  }
});

test('buildNpcStandardizedBridge keeps scoped autoId rows on the exact standardized id only', () => {
  const standardizedPayload = {
    entity: 'npcs',
    records: [
      { id: 186, type: 186, internalName: 'PincushionZombie', name: 'Zombie', imageFileTitle: 'Pincushion Zombie.gif' },
      { id: -30, type: 186, internalName: 'SmallPincushionZombie', name: 'Zombie', imageFileTitle: 'Pincushion Zombie.gif' },
      { id: -31, type: 186, internalName: 'BigPincushionZombie', name: 'Zombie', imageFileTitle: 'Pincushion Zombie.gif' }
    ]
  };
  const crawlerRecords = [
    {
      entityId: 'zombie',
      display: { name: 'Zombie' },
      source: { pageTitle: 'Zombie' },
      loot: [
        {
          relationType: 'loot',
          itemName: 'Wooden Arrow',
          chanceText: '100%',
          quantityText: '1-9',
          sourceSection: 'drops',
          sourceInfobox: { autoId: '186', image: 'Pincushion Zombie.gif', name: 'Pincushion Zombie' }
        },
        {
          relationType: 'loot',
          itemName: 'Small Wooden Arrow',
          chanceText: '100%',
          quantityText: '1-9',
          sourceSection: 'drops',
          sourceInfobox: { autoId: '-30', image: 'Pincushion Zombie.gif', name: 'Pincushion Zombie' }
        },
        {
          relationType: 'loot',
          itemName: 'Big Wooden Arrow',
          chanceText: '100%',
          quantityText: '1-9',
          sourceSection: 'drops',
          sourceInfobox: { autoId: '-31', image: 'Pincushion Zombie.gif', name: 'Pincushion Zombie' }
        }
      ]
    }
  ];

  const result = buildNpcStandardizedBridge({
    standardizedPayload,
    crawlerNormalizedRecords: crawlerRecords
  });

  assert.deepEqual(
    result.records.find((record) => record.internalName === 'PincushionZombie').wikiCrawler.loot.map((row) => row.itemName),
    ['Wooden Arrow']
  );
  assert.deepEqual(
    result.records.find((record) => record.internalName === 'SmallPincushionZombie').wikiCrawler.loot.map((row) => row.itemName),
    ['Small Wooden Arrow']
  );
  assert.deepEqual(
    result.records.find((record) => record.internalName === 'BigPincushionZombie').wikiCrawler.loot.map((row) => row.itemName),
    ['Big Wooden Arrow']
  );
});

test('buildNpcStandardizedBridge matches scoped group loot by exact standardized image title', () => {
  const standardizedPayload = {
    entity: 'npcs',
    records: [
      { id: 1, internalName: 'BlueSlime', name: 'Blue Slime', imageFileTitle: 'Blue Slime.png' },
      { id: 302, internalName: 'SlimeMasked', name: 'Slime', imageFileTitle: 'Bunny Slime.png' },
      { id: 333, internalName: 'SlimeRibbonWhite', name: 'Slime', imageFileTitle: 'White Present Slime.png' }
    ]
  };
  const crawlerRecords = [
    {
      entityId: 'slimes',
      display: { name: 'Slimes' },
      source: { pageTitle: 'Slimes' },
      loot: [
        {
          relationType: 'loot',
          itemName: 'Gel',
          chanceText: '100%',
          quantityText: '1-2',
          sourceSection: 'drops',
          sourceInfobox: { autoId: '', image: 'Bunny Slime.png', name: '' }
        },
        {
          relationType: 'loot',
          itemName: 'Giant Bow',
          chanceText: '5%',
          quantityText: '1',
          sourceSection: 'drops',
          sourceInfobox: { autoId: '', image: 'White Present Slime.png', name: '' }
        }
      ]
    }
  ];

  const result = buildNpcStandardizedBridge({
    standardizedPayload,
    crawlerNormalizedRecords: crawlerRecords
  });

  assert.equal(result.summary.matched, 2);
  assert.equal(result.records.find((record) => record.internalName === 'BlueSlime').wikiCrawler, undefined);
  assert.deepEqual(
    result.records.find((record) => record.internalName === 'SlimeMasked').wikiCrawler.loot.map((row) => [
      row.itemName,
      row.sourceRefInternalName,
      row.sourceRefResolution
    ]),
    [['Gel', 'SlimeMasked', 'exact_internal_name']]
  );
  assert.deepEqual(
    result.records.find((record) => record.internalName === 'SlimeRibbonWhite').wikiCrawler.loot.map((row) => [
      row.itemName,
      row.sourceRefInternalName,
      row.sourceRefResolution
    ]),
    [['Giant Bow', 'SlimeRibbonWhite', 'exact_internal_name']]
  );
});

test('buildNpcStandardizedBridge matches secondary image titles from scoped multi-image infobox loot', () => {
  const standardizedPayload = {
    entity: 'npcs',
    records: [
      { id: 580, internalName: 'WalkingAntlion', name: 'Antlion Charger', imageFileTitle: 'Antlion Charger.gif' },
      { id: 508, internalName: 'GiantWalkingAntlion', name: 'Giant Antlion Charger', imageFileTitle: 'Giant Antlion Charger.gif' }
    ]
  };
  const crawlerRecords = [
    {
      entityId: 'antlion-charger',
      display: { name: 'Antlion Charger' },
      source: { pageTitle: 'Antlion Charger' },
      loot: [
        {
          relationType: 'loot',
          itemName: 'Antlion Mandible',
          chanceText: '33.3%',
          quantityText: '1',
          sourceSection: 'drops',
          sourceInfobox: {
            autoId: '580',
            image: '[[File:Antlion Charger.gif|link=]] [[File:Giant Antlion Charger.gif|link=]]',
            name: 'Antlion Charger'
          }
        }
      ]
    }
  ];

  const result = buildNpcStandardizedBridge({
    standardizedPayload,
    crawlerNormalizedRecords: crawlerRecords
  });

  assert.deepEqual(
    result.records.map((record) => [
      record.internalName,
      record.wikiCrawler?.loot.map((row) => [
        row.itemName,
        row.sourceRefInternalName,
        row.sourceRefResolution
      ]) ?? []
    ]),
    [
      ['WalkingAntlion', [['Antlion Mandible', 'WalkingAntlion', 'exact_internal_name']]],
      ['GiantWalkingAntlion', [['Antlion Mandible', 'GiantWalkingAntlion', 'exact_internal_name']]]
    ]
  );
});

test('buildNpcStandardizedBridge matches all uniquely imaged variants from scoped multi-image infobox loot', () => {
  const standardizedPayload = {
    entity: 'npcs',
    records: [
      { id: 170, internalName: 'PigronCorruption', name: 'Pigron', imageFileTitle: 'Corruption Pigron.gif' },
      { id: 171, internalName: 'PigronHallow', name: 'Pigron', imageFileTitle: 'Hallow Pigron.gif' },
      { id: 180, internalName: 'PigronCrimson', name: 'Pigron', imageFileTitle: 'Crimson Pigron.gif' }
    ]
  };
  const crawlerRecords = [
    {
      entityId: 'pigron',
      display: { name: 'Pigron' },
      source: { pageTitle: 'Pigron' },
      loot: [
        {
          relationType: 'loot',
          itemName: 'Bacon',
          chanceText: '33.3%',
          quantityText: '1',
          sourceSection: 'drops',
          sourceInfobox: {
            autoId: '170',
            image: '[[File:Corruption Pigron.gif|link=]] [[File:Crimson Pigron.gif|link=]] [[File:Hallow Pigron.gif|link=]]',
            name: 'Corruption Pigron'
          }
        }
      ]
    }
  ];

  const result = buildNpcStandardizedBridge({
    standardizedPayload,
    crawlerNormalizedRecords: crawlerRecords
  });

  assert.deepEqual(
    result.records.map((record) => [
      record.internalName,
      record.wikiCrawler?.loot.map((row) => [
        row.itemName,
        row.sourceRefInternalName,
        row.sourceRefResolution
      ]) ?? []
    ]),
    [
      ['PigronCorruption', [['Bacon', 'PigronCorruption', 'exact_internal_name']]],
      ['PigronHallow', [['Bacon', 'PigronHallow', 'exact_internal_name']]],
      ['PigronCrimson', [['Bacon', 'PigronCrimson', 'exact_internal_name']]]
    ]
  );
});

test('buildNpcStandardizedBridge rejects ambiguous exact image title matches', () => {
  const standardizedPayload = {
    entity: 'npcs',
    records: [
      { id: 901, internalName: 'SharedImageA', name: 'Shared Image', imageFileTitle: 'Shared Image.png' },
      { id: 902, internalName: 'SharedImageB', name: 'Shared Image', imageFileTitle: 'Shared Image.png' }
    ]
  };
  const crawlerRecords = [
    {
      entityId: 'shared-images',
      display: { name: 'Shared Images' },
      source: { pageTitle: 'Shared Images' },
      loot: [
        {
          relationType: 'loot',
          itemName: 'Shared Drop',
          chanceText: '1%',
          quantityText: '1',
          sourceSection: 'drops',
          sourceInfobox: { autoId: '', image: 'Shared Image.png', name: '' }
        }
      ]
    }
  ];

  const result = buildNpcStandardizedBridge({
    standardizedPayload,
    crawlerNormalizedRecords: crawlerRecords
  });

  assert.equal(result.summary.matched, 0);
  assert.equal(result.summary.unmatchedCrawler, 1);
  assert.equal(result.records.find((record) => record.internalName === 'SharedImageA').wikiCrawler, undefined);
  assert.equal(result.records.find((record) => record.internalName === 'SharedImageB').wikiCrawler, undefined);
});

test('buildNpcStandardizedBridge does not assign unscoped group-page loot to multiple NPC records', () => {
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
      loot: [
        {
          relationType: 'loot',
          itemName: 'Shared Hook',
          chanceText: '20%',
          quantityText: '1',
          sourceSection: 'drops'
        }
      ]
    }
  ];

  const result = buildNpcStandardizedBridge({
    standardizedPayload,
    crawlerNormalizedRecords: crawlerRecords
  });

  const bigRainZombie = result.records.find((record) => record.internalName === 'BigRainZombie');
  const smallRainZombie = result.records.find((record) => record.internalName === 'SmallRainZombie');
  assert.deepEqual(bigRainZombie.wikiCrawler.loot, []);
  assert.deepEqual(smallRainZombie.wikiCrawler.loot, []);
});

test('buildNpcStandardizedBridge keeps unscoped inflictions when a scoped row matches the same NPC record', () => {
  const standardizedPayload = {
    entity: 'npcs',
    records: [
      { id: 525, internalName: 'DesertGhoulCorruption', name: 'Vile Ghoul' },
      { id: 526, internalName: 'DesertGhoulCrimson', name: 'Tainted Ghoul' }
    ]
  };
  const crawlerRecords = [
    {
      entityId: 'vile-ghoul',
      display: { name: 'Ghouls' },
      source: { pageTitle: 'Ghouls' },
      buffInflictions: [
        { buffName: 'Cursed Inferno', sourceInfobox: { autoId: '525', image: 'Vile Ghoul.gif', name: '' } },
        { buffName: 'Shimmer', durationText: '5 seconds' }
      ]
    }
  ];

  const result = buildNpcStandardizedBridge({
    standardizedPayload,
    crawlerNormalizedRecords: crawlerRecords
  });

  const vileGhoul = result.records.find((record) => record.internalName === 'DesertGhoulCorruption');

  assert.deepEqual(vileGhoul.wikiCrawler.buffInflictions.map((row) => row.buffName), ['Cursed Inferno', 'Shimmer']);
});

test('buildNpcStandardizedBridge does not assign unscoped inflictions to unrelated group-page NPC records', () => {
  const standardizedPayload = {
    entity: 'npcs',
    records: [
      { id: 101, internalName: 'ZombieA', name: 'Zombie' },
      { id: 102, internalName: 'ZombieB', name: 'Zombie' }
    ]
  };
  const crawlerRecords = [
    {
      entityId: 'zombie',
      display: { name: 'Zombie' },
      source: { pageTitle: 'Zombie' },
      buffInflictions: [
        { buffName: 'Cursed Inferno', sourceInfobox: { autoId: '101', image: 'ZombieA.gif', name: '' } },
        { buffName: 'Shimmer' }
      ]
    }
  ];

  const result = buildNpcStandardizedBridge({
    standardizedPayload,
    crawlerNormalizedRecords: crawlerRecords
  });

  const zombieA = result.records.find((record) => record.internalName === 'ZombieA');
  const zombieB = result.records.find((record) => record.internalName === 'ZombieB');

  assert.deepEqual(zombieA.wikiCrawler.buffInflictions.map((row) => row.buffName), ['Cursed Inferno']);
  assert.equal(zombieB.wikiCrawler, undefined);
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
        recordKey: 'npc-item:merchant:shop:lesser-healing-potion:0',
        relationType: 'shop',
        npcInternalName: 'Merchant',
        itemName: 'Lesser Healing Potion',
        priceText: '3 silver',
        chanceText: null,
        sourceUrl: 'https://terraria.wiki.gg/wiki/Merchant'
      },
      {
        recordKey: 'npc-item:merchant:loot:merchant-hat:0',
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
