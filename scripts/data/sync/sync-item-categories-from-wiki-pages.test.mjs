import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRelatedCategoryCodes,
  classifyItem,
  ensureCategories,
  parseArgs,
  runItemCategorySync,
  shouldApplyCategoryChange
} from './sync-item-categories-from-wiki-pages.mjs';

test('parseArgs reads apply/report/itemPagesDir switches', () => {
  const actual = parseArgs([
    '--apply=true',
    '--report=reports/relation/category-local-sync-2026-04-26.json',
    '--itemPagesDir=data/wiki/item-pages'
  ]);

  assert.deepEqual(actual, {
    apply: 'true',
    report: 'reports/relation/category-local-sync-2026-04-26.json',
    itemPagesDir: 'data/wiki/item-pages'
  });
});

test('shouldApplyCategoryChange upgrades to deeper or explicit mapped categories', () => {
  const categoryLookup = {
    depthByCode: new Map([
      ['MATERIAL', 1],
      ['MATERIAL_BAR', 2],
      ['WEAPON', 1],
      ['WEAPON_MELEE_SWORD', 2]
    ])
  };

  assert.equal(
    shouldApplyCategoryChange({
      currentCode: 'MATERIAL',
      nextCode: 'MATERIAL_BAR',
      categoryLookup,
      reason: 'type:bar'
    }),
    true
  );

  assert.equal(
    shouldApplyCategoryChange({
      currentCode: 'WEAPON_MELEE_SWORD',
      nextCode: 'WEAPON',
      categoryLookup,
      reason: 'fallback'
    }),
    false
  );
});

test('shouldApplyCategoryChange migrates legacy combined tool categories to split leaves', () => {
  const categoryLookup = {
    depthByCode: new Map([
      ['TOOL_PICKAXE_DRILL', 2],
      ['TOOL_PICKAXE', 3],
      ['TOOL_DRILL', 3],
      ['TOOL_AXE_CHAINSAW', 2],
      ['TOOL_AXE', 3],
      ['TOOL_CHAINSAW', 3],
    ])
  };

  assert.equal(
    shouldApplyCategoryChange({
      currentCode: 'TOOL_PICKAXE_DRILL',
      nextCode: 'TOOL_PICKAXE',
      categoryLookup,
      reason: 'standardized_pickaxe'
    }),
    true
  );

  assert.equal(
    shouldApplyCategoryChange({
      currentCode: 'TOOL_AXE_CHAINSAW',
      nextCode: 'TOOL_CHAINSAW',
      categoryLookup,
      reason: 'standardized_chainsaw'
    }),
    true
  );
});

test('buildRelatedCategoryCodes includes ancestors and type-derived roots', () => {
  const categoryLookup = {
    byCode: new Map([
      ['MATERIAL_GEM', { id: 1 }],
      ['MATERIAL', { id: 2 }],
      ['CONSUMABLE', { id: 3 }]
    ]),
    parentCodeByCode: new Map([
      ['MATERIAL_GEM', 'MATERIAL']
    ])
  };

  const actual = buildRelatedCategoryCodes({
    primaryCode: 'MATERIAL_GEM',
    wiki: {
      wikitext: `
{{item infobox
| type = consumable / gem
}}
      `
    },
    categoryLookup
  });

  assert.deepEqual(actual, ['MATERIAL_GEM', 'MATERIAL', 'CONSUMABLE']);
});

test('ensureCategories dry-run updates legacy combined tool container names and parents', async () => {
  const connection = {
    query: async () => [[
      { id: 1, parent_id: 0, code: 'TOOL', name: '工具' },
      { id: 2, parent_id: 1, code: 'TOOL_PICKAXE_DRILL', name: '镐和钻头' },
      { id: 3, parent_id: 1, code: 'TOOL_AXE_CHAINSAW', name: '斧头和链锯' },
    ]],
  };

  const lookup = await ensureCategories(connection, false);

  assert.equal(lookup.byCode.get('TOOL_PICKAXE_DRILL')?.name, '采掘工具');
  assert.equal(lookup.byCode.get('TOOL_AXE_CHAINSAW')?.name, '砍伐工具');
  assert.equal(lookup.parentCodeByCode.get('TOOL_PICKAXE'), 'TOOL_PICKAXE_DRILL');
  assert.equal(lookup.parentCodeByCode.get('TOOL_DRILL'), 'TOOL_PICKAXE_DRILL');
  assert.equal(lookup.parentCodeByCode.get('TOOL_AXE'), 'TOOL_AXE_CHAINSAW');
  assert.equal(lookup.parentCodeByCode.get('TOOL_CHAINSAW'), 'TOOL_AXE_CHAINSAW');
});

test('ensureCategories apply mode upserts missing categories so soft-deleted codes are revived', async () => {
  const executed = [];
  const connection = {
    query: async () => [[
      { id: 1, parent_id: 0, code: 'TOOL', name: '工具' },
      { id: 2, parent_id: 1, code: 'TOOL_PICKAXE_DRILL', name: '镐和钻头' },
      { id: 3, parent_id: 1, code: 'TOOL_AXE_CHAINSAW', name: '斧头和链锯' },
    ]],
    execute: async (sql, params) => {
      executed.push({ sql, params });
      return [{ insertId: executed.length + 10 }];
    },
  };

  await ensureCategories(connection, true);

  const insert = executed.find(({ sql, params }) =>
    /INSERT\s+INTO\s+category/i.test(sql)
    && params.includes('TOOL_PICKAXE')
  );
  assert.ok(insert);
  assert.match(insert.sql, /ON\s+DUPLICATE\s+KEY\s+UPDATE/i);
  assert.match(insert.sql, /deleted\s*=\s*0/i);
});

test('classifyItem maps standardized pickaxe records to pickaxe-only category', () => {
  const result = classifyItem({
    item: { name: 'Iron Pickaxe', internal_name: 'IronPickaxe' },
    wiki: {
      wikitext: `
{{item infobox
| type = tool
| pick = 35
}}
[[Category:Pickaxes]]
      `
    },
    standardizedRecord: {
      categoryCode: 'PICKAXE'
    },
    categoryLookup: {
      byCode: new Map([
        ['TOOL_PICKAXE', { id: 1 }]
      ])
    }
  });

  assert.equal(result.categoryCode, 'TOOL_PICKAXE');
  assert.equal(result.reason, 'standardized_pickaxe');
});

test('classifyItem maps drill records to drill-only category', () => {
  const result = classifyItem({
    item: { name: 'Cobalt Drill', internal_name: 'CobaltDrill' },
    wiki: {
      wikitext: `
{{item infobox
| type = tool
| pick = 110
}}
[[Category:Drills]]
      `
    },
    standardizedRecord: {
      categoryCode: 'PICKAXE'
    },
    categoryLookup: {
      byCode: new Map([
        ['TOOL_DRILL', { id: 2 }]
      ])
    }
  });

  assert.equal(result.categoryCode, 'TOOL_DRILL');
  assert.equal(result.reason, 'standardized_drill');
});

test('classifyItem keeps Drax in the pickaxe family', () => {
  const result = classifyItem({
    item: { name: 'Drax', internal_name: 'Drax', nameZh: '斧钻' },
    wiki: {
      wikitext: `
{{item infobox
| type = tool
| pick = 110
}}
[[Category:Pickaxes]]
      `
    },
    standardizedRecord: {
      categoryCode: 'PICKAXE'
    },
    categoryLookup: {
      byCode: new Map([
        ['TOOL_PICKAXE', { id: 1 }],
        ['TOOL_DRILL', { id: 2 }]
      ])
    }
  });

  assert.equal(result.categoryCode, 'TOOL_PICKAXE');
  assert.equal(result.reason, 'standardized_pickaxe');
});

test('classifyItem keeps standardized pickaxe when drill only appears in page noise', () => {
  const result = classifyItem({
    item: { name: 'Iron Pickaxe', internal_name: 'IronPickaxe' },
    wiki: {
      wikitext: `
{{item infobox
| type = tool
| pick = 35
}}
This page belongs to an overview about pickaxes and drills.
[[Category:Drills]]
      `
    },
    standardizedRecord: {
      categoryCode: 'PICKAXE'
    },
    categoryLookup: {
      byCode: new Map([
        ['TOOL_PICKAXE', { id: 1 }],
        ['TOOL_DRILL', { id: 2 }]
      ])
    }
  });

  assert.equal(result.categoryCode, 'TOOL_PICKAXE');
  assert.equal(result.reason, 'standardized_pickaxe');
});

test('classifyItem keeps wiki-only pickaxe when drill only appears in page noise', () => {
  const result = classifyItem({
    item: { name: 'Iron Pickaxe', internal_name: 'IronPickaxe' },
    wiki: {
      wikitext: `
{{item infobox
| type = tool
| pick = 35
}}
The navigation mentions drills.
      `
    },
    standardizedRecord: null,
    categoryLookup: {
      byCode: new Map([
        ['TOOL_PICKAXE', { id: 1 }],
        ['TOOL_DRILL', { id: 2 }]
      ])
    }
  });

  assert.equal(result.categoryCode, 'TOOL_PICKAXE');
  assert.equal(result.reason, 'type:tool');
});

test('classifyItem separates standardized axe and chainsaw records', () => {
  const axe = classifyItem({
    item: { name: 'Iron Axe', internal_name: 'IronAxe' },
    wiki: {
      wikitext: `
{{item infobox
| type = tool
| axe = 9
}}
[[Category:Axes]]
      `
    },
    standardizedRecord: {
      categoryCode: 'AXE'
    },
    categoryLookup: {
      byCode: new Map([
        ['TOOL_AXE', { id: 3 }],
        ['TOOL_CHAINSAW', { id: 4 }]
      ])
    }
  });

  const chainsaw = classifyItem({
    item: { name: 'Cobalt Chainsaw', internal_name: 'CobaltChainsaw' },
    wiki: {
      wikitext: `
{{item infobox
| type = tool
| axe = 18
}}
[[Category:Chainsaws]]
      `
    },
    standardizedRecord: {
      categoryCode: 'AXE'
    },
    categoryLookup: {
      byCode: new Map([
        ['TOOL_AXE', { id: 3 }],
        ['TOOL_CHAINSAW', { id: 4 }]
      ])
    }
  });

  assert.equal(axe.categoryCode, 'TOOL_AXE');
  assert.equal(axe.reason, 'standardized_axe');
  assert.equal(chainsaw.categoryCode, 'TOOL_CHAINSAW');
  assert.equal(chainsaw.reason, 'standardized_chainsaw');
});

test('classifyItem keeps standardized axe when chainsaw only appears in page noise', () => {
  const result = classifyItem({
    item: { name: 'Iron Axe', internal_name: 'IronAxe' },
    wiki: {
      wikitext: `
{{item infobox
| type = tool
| axe = 9
}}
The category navigation also links to chainsaws.
[[Category:Chainsaws]]
      `
    },
    standardizedRecord: {
      categoryCode: 'AXE'
    },
    categoryLookup: {
      byCode: new Map([
        ['TOOL_AXE', { id: 3 }],
        ['TOOL_CHAINSAW', { id: 4 }]
      ])
    }
  });

  assert.equal(result.categoryCode, 'TOOL_AXE');
  assert.equal(result.reason, 'standardized_axe');
});

test('classifyItem keeps wiki-only axe when chainsaw only appears in page noise', () => {
  const result = classifyItem({
    item: { name: 'Iron Axe', internal_name: 'IronAxe' },
    wiki: {
      wikitext: `
{{item infobox
| type = tool
| axe = 9
}}
The navigation mentions chainsaws.
      `
    },
    standardizedRecord: null,
    categoryLookup: {
      byCode: new Map([
        ['TOOL_AXE', { id: 3 }],
        ['TOOL_CHAINSAW', { id: 4 }]
      ])
    }
  });

  assert.equal(result.categoryCode, 'TOOL_AXE');
  assert.equal(result.reason, 'type:tool');
});

test('classifyItem maps explicit wiki type taxonomy leaves ahead of material fallback', () => {
  const categoryLookup = {
    byCode: new Map([
      ['MOUNT', { id: 1 }],
      ['PET', { id: 2 }],
      ['ACCESSORY_MISC', { id: 3 }],
      ['AMMUNITION_ARROW', { id: 4 }],
      ['CONSUMABLE_POTION', { id: 5 }],
      ['CONSUMABLE_SUMMON', { id: 6 }],
      ['CONSUMABLE_GRAB_BAG', { id: 7 }],
      ['FURNITURE_CRAFTING_STATION', { id: 8 }],
      ['FURNITURE_LIGHT', { id: 9 }],
      ['MATERIAL_BAR', { id: 10 }],
      ['TOOL_DRILL', { id: 11 }],
      ['TOOL_PICKAXE', { id: 12 }],
      ['TOOL_AXE', { id: 13 }],
      ['TOOL_CHAINSAW', { id: 14 }],
      ['ARMOR_PART_HEAD', { id: 15 }],
      ['ARMOR_PART_BODY', { id: 16 }],
      ['ARMOR_PART_LEGS', { id: 17 }],
    ]),
    depthByCode: new Map(),
    parentCodeByCode: new Map(),
  };

  const samples = [
    ['Drill Containment Unit', 'DrillContainmentUnit', 'Mount summon', 'MOUNT'],
    ['Slimy Saddle', 'SlimySaddle', 'Mount summon', 'MOUNT'],
    ['Fuzzy Carrot', 'FuzzyCarrot', 'Mount summon', 'MOUNT'],
    ['Cosmic Car Key', 'CosmicCarKey', 'Mount summon', 'MOUNT'],
    ["Witch's Broom", 'WitchBroom', 'Mount summon', 'MOUNT'],
    ['Cursed Piper Flute', 'RatMountItem', 'Mount summon', 'MOUNT'],
    ['Dog Whistle', 'DogWhistle', 'Pet summon', 'PET'],
    ['Cloud in a Bottle', 'CloudinaBottle', 'Accessory', 'ACCESSORY_MISC'],
    ['Wooden Arrow', 'WoodenArrow', 'Ammunition', 'AMMUNITION_ARROW'],
    ['Ironskin Potion', 'IronskinPotion', 'Potion / Consumable', 'CONSUMABLE_POTION'],
    ['Suspicious Looking Eye', 'SuspiciousLookingEye', 'Boss summon / Consumable', 'CONSUMABLE_SUMMON'],
    ['Treasure Bag', 'KingSlimeBossBag', 'Grab bag / Consumable', 'CONSUMABLE_GRAB_BAG'],
    ['Iron Anvil', 'IronAnvil', 'Furniture / Crafting station', 'FURNITURE_CRAFTING_STATION'],
    ['Torch', 'Torch', 'Furniture / Light source', 'FURNITURE_LIGHT'],
    ['Luminite Bar', 'LunarBar', 'Bar / Crafting material', 'MATERIAL_BAR'],
  ];

  for (const [name, internalName, type, expectedCategoryCode] of samples) {
    const result = classifyItem({
      item: { name, internal_name: internalName },
      wiki: {
        wikitext: `
{{item infobox
| type = ${type}
}}
        `
      },
      standardizedRecord: { categoryCode: 'MATERIAL' },
      categoryLookup,
    });

    assert.equal(result.categoryCode, expectedCategoryCode, `${internalName} should classify from ${type}`);
  }
});

test('classifyItem lets explicit raw wiki type override stale standardized category', () => {
  const result = classifyItem({
    item: { name: 'Drill Containment Unit', internal_name: 'DrillContainmentUnit' },
    wiki: {
      wikitext: `
{{item infobox
| type = Mount summon
}}
      `,
    },
    standardizedRecord: {
      categoryCode: 'PICKAXE',
    },
    categoryLookup: {
      byCode: new Map([
        ['MOUNT', { id: 1 }],
        ['TOOL_PICKAXE', { id: 2 }],
      ]),
    },
  });

  assert.equal(result.categoryCode, 'MOUNT');
  assert.equal(result.reason, 'type:mount summon');
});

test('runItemCategorySync rejects missing raw item pages before opening DB', async () => {
  await assert.rejects(
    () => runItemCategorySync(
      {
        apply: 'false',
        itemPagesDir: '/tmp/terrapedia-missing-raw-item-pages-for-sync-test',
      },
      {
        repoRoot: process.cwd(),
        skipWriteReport: true,
      }
    ),
    /Item pages directory not found:/
  );
});

test('runItemCategorySync default fallback mode reports missing injected wiki pages as skippedNoWiki', async () => {
  const categoryRows = [
    { id: 1, parent_id: 0, code: 'MATERIAL', name: '材料' },
    { id: 2, parent_id: 0, code: 'MOUNT', name: '坐骑召唤' },
  ];
  const items = [
    {
      id: 100,
      name: 'Drill Containment Unit',
      internal_name: 'DrillContainmentUnit',
      category_id: 1,
      status: 1,
      current_category_code: 'MATERIAL',
    },
  ];
  const connection = {
    query: async (sql) => {
      if (/FROM\s+category/i.test(sql)) return [categoryRows];
      if (/FROM\s+items/i.test(sql)) return [items];
      throw new Error(`unexpected query: ${sql}`);
    },
    end: async () => {},
  };

  const { report } = await runItemCategorySync(
    {
      apply: 'false',
      itemPagesDir: '/tmp/not-used-with-injected-pages',
    },
    {
      connection,
      db: { database: 'terria_v1_local' },
      repoRoot: process.cwd(),
      standardizedByInternal: new Map([
        ['DrillContainmentUnit', { internalName: 'DrillContainmentUnit', categoryCode: 'MATERIAL' }],
      ]),
      wikiPagesByInternal: new Map(),
      skipWriteReport: true,
    }
  );

  assert.equal(report.fallbackMode, 'none');
  assert.equal(report.scanned, 1);
  assert.equal(report.wikiMatched, 0);
  assert.equal(report.classified, 0);
  assert.equal(report.updated, 0);
  assert.equal(report.skippedNoWiki, 1);
  assert.equal(report.standardizedInferred, 0);
  assert.equal(report.skippedInsufficientEvidence, 0);
  assert.deepEqual(report.inferenceSamples, []);
});

test('runItemCategorySync fallback mode infers from standardized records when raw wiki page is missing', async () => {
  const categoryRows = [
    { id: 1, parent_id: 0, code: 'MATERIAL', name: '材料' },
    { id: 2, parent_id: 0, code: 'MOUNT', name: '坐骑召唤' },
  ];
  const items = [
    {
      id: 100,
      name: 'Drill Containment Unit',
      internal_name: 'DrillContainmentUnit',
      category_id: 1,
      status: 1,
      current_category_code: 'MATERIAL',
    },
  ];
  const standardizedRecord = {
    internalName: 'DrillContainmentUnit',
    categoryCode: 'MATERIAL',
    stack: {
      stackSize: 1,
    },
    stats: {
      damage: 0,
      defense: 0,
    },
  };
  const itemPage = {
    entityType: 'item',
    itemInternalName: 'DrillContainmentUnit',
  };
  const inference = {
    categoryCode: 'MOUNT',
    reason: 'mount_allowlist:DrillContainmentUnit',
    confidence: 'high',
    source: 'standardized_inference',
    evidence: {
      itemPageMatch: true,
      currentCategoryCode: 'MATERIAL',
      stackSize: 1,
      damage: 0,
      defense: 0,
    },
    reportOnly: false,
  };
  const connection = {
    query: async (sql) => {
      if (/FROM\s+category/i.test(sql)) return [categoryRows];
      if (/FROM\s+items/i.test(sql)) return [items];
      throw new Error(`unexpected query: ${sql}`);
    },
    end: async () => {},
  };

  const { report } = await runItemCategorySync(
    {
      apply: 'false',
      fallbackMode: 'standardized_inference',
      itemPagesDir: '/tmp/terrapedia-missing-raw-item-pages-for-fallback-test',
    },
    {
      connection,
      db: { database: 'terria_v1_local' },
      repoRoot: process.cwd(),
      standardizedByInternal: new Map([
        ['DrillContainmentUnit', standardizedRecord],
      ]),
      itemPagesByInternal: new Map([
        ['DrillContainmentUnit', itemPage],
      ]),
      inferCategoryFromStandardizedRecord: ({ item, itemPage: actualPage }) => {
        assert.equal(item.internalName, 'DrillContainmentUnit');
        assert.equal(item.currentCategoryCode, 'MATERIAL');
        assert.equal(item.stackSize, 1);
        assert.equal(item.damage, 0);
        assert.equal(item.defense, 0);
        assert.equal(actualPage, itemPage);
        return inference;
      },
      mountAllowlist: new Set(['DrillContainmentUnit']),
      wikiPagesByInternal: new Map(),
      skipWriteReport: true,
    }
  );

  assert.equal(report.fallbackMode, 'standardized_inference');
  assert.equal(report.scanned, 1);
  assert.equal(report.wikiMatched, 0);
  assert.equal(report.classified, 1);
  assert.equal(report.updated, 1);
  assert.equal(report.skippedNoWiki, 0);
  assert.equal(report.standardizedInferred, 1);
  assert.equal(report.skippedInsufficientEvidence, 0);
  assert.deepEqual(report.changedSamples, [
    {
      id: 100,
      internalName: 'DrillContainmentUnit',
      currentCategoryCode: 'MATERIAL',
      nextCategoryCode: 'MOUNT',
      reason: 'mount_allowlist:DrillContainmentUnit',
      source: 'standardized_inference',
      confidence: 'high',
      evidence: inference.evidence,
      willUpdate: true,
    },
  ]);
  assert.deepEqual(report.inferenceSamples, report.changedSamples);
});

test('runItemCategorySync fallback mode counts missing inference evidence without skippedNoWiki', async () => {
  const categoryRows = [
    { id: 1, parent_id: 0, code: 'MATERIAL', name: '材料' },
    { id: 2, parent_id: 0, code: 'MOUNT', name: '坐骑召唤' },
  ];
  const items = [
    {
      id: 101,
      name: 'Plain Carrot',
      internal_name: 'PlainCarrot',
      category_id: 1,
      status: 1,
      current_category_code: 'MATERIAL',
    },
  ];
  const connection = {
    query: async (sql) => {
      if (/FROM\s+category/i.test(sql)) return [categoryRows];
      if (/FROM\s+items/i.test(sql)) return [items];
      throw new Error(`unexpected query: ${sql}`);
    },
    end: async () => {},
  };

  const { report } = await runItemCategorySync(
    {
      apply: 'false',
      fallbackMode: 'standardized_inference',
      itemPagesDir: '/tmp/terrapedia-missing-raw-item-pages-for-fallback-test',
    },
    {
      connection,
      db: { database: 'terria_v1_local' },
      repoRoot: process.cwd(),
      standardizedByInternal: new Map([
        ['PlainCarrot', { internalName: 'PlainCarrot', categoryCode: 'MATERIAL' }],
      ]),
      itemPagesByInternal: new Map([
        ['PlainCarrot', { entityType: 'item', itemInternalName: 'PlainCarrot' }],
      ]),
      inferCategoryFromStandardizedRecord: () => null,
      mountAllowlist: new Set(),
      wikiPagesByInternal: new Map(),
      skipWriteReport: true,
    }
  );

  assert.equal(report.fallbackMode, 'standardized_inference');
  assert.equal(report.scanned, 1);
  assert.equal(report.wikiMatched, 0);
  assert.equal(report.classified, 0);
  assert.equal(report.updated, 0);
  assert.equal(report.skippedNoWiki, 0);
  assert.equal(report.standardizedInferred, 0);
  assert.equal(report.skippedInsufficientEvidence, 1);
  assert.deepEqual(report.inferenceSamples, []);
});

test('runItemCategorySync keeps raw wiki classification ahead of standardized inference fallback', async () => {
  const categoryRows = [
    { id: 1, parent_id: 0, code: 'MATERIAL', name: '材料' },
    { id: 2, parent_id: 0, code: 'MOUNT', name: '坐骑召唤' },
    { id: 3, parent_id: 0, code: 'CONSUMABLE_SUMMON', name: '召唤消耗品' },
  ];
  const items = [
    {
      id: 100,
      name: 'Drill Containment Unit',
      internal_name: 'DrillContainmentUnit',
      category_id: 1,
      status: 1,
      current_category_code: 'MATERIAL',
    },
  ];
  const connection = {
    query: async (sql) => {
      if (/FROM\s+category/i.test(sql)) return [categoryRows];
      if (/FROM\s+items/i.test(sql)) return [items];
      throw new Error(`unexpected query: ${sql}`);
    },
    end: async () => {},
  };

  const { report } = await runItemCategorySync(
    {
      apply: 'false',
      fallbackMode: 'standardized_inference',
      itemPagesDir: '/tmp/not-used-with-injected-pages',
    },
    {
      connection,
      db: { database: 'terria_v1_local' },
      repoRoot: process.cwd(),
      standardizedByInternal: new Map([
        ['DrillContainmentUnit', { internalName: 'DrillContainmentUnit', categoryCode: 'MATERIAL' }],
      ]),
      itemPagesByInternal: new Map([
        ['DrillContainmentUnit', { entityType: 'item', itemInternalName: 'DrillContainmentUnit' }],
      ]),
      inferCategoryFromStandardizedRecord: () => {
        throw new Error('standardized inference should not run when raw wiki exists');
      },
      mountAllowlist: new Set(['DrillContainmentUnit']),
      wikiPagesByInternal: new Map([
        [
          'DrillContainmentUnit',
          {
            itemInternalName: 'DrillContainmentUnit',
            wikitext: `
{{item infobox
| type = Boss summon / Consumable
}}
            `,
          },
        ],
      ]),
      skipWriteReport: true,
    }
  );

  assert.equal(report.wikiMatched, 1);
  assert.equal(report.standardizedInferred, 0);
  assert.equal(report.skippedNoWiki, 0);
  assert.equal(report.skippedInsufficientEvidence, 0);
  assert.deepEqual(report.inferenceSamples, []);
  assert.equal(report.changedSamples[0].nextCategoryCode, 'CONSUMABLE_SUMMON');
  assert.equal(report.changedSamples[0].reason, 'type:boss summon|consumable');
});

test('runItemCategorySync dry-run reports distribution and verified changed samples', async () => {
  const categoryRows = [
    { id: 1, parent_id: 0, code: 'MATERIAL', name: '材料' },
    { id: 2, parent_id: 0, code: 'MOUNT', name: '坐骑召唤' },
  ];
  const items = [
    {
      id: 100,
      name: 'Drill Containment Unit',
      internal_name: 'DrillContainmentUnit',
      category_id: 1,
      status: 1,
      current_category_code: 'MATERIAL',
    },
  ];
  const connection = {
    query: async (sql) => {
      if (/FROM\s+category/i.test(sql)) return [categoryRows];
      if (/FROM\s+items/i.test(sql)) return [items];
      throw new Error(`unexpected query: ${sql}`);
    },
    end: async () => {},
  };

  const { report } = await runItemCategorySync(
    {
      apply: 'false',
      itemPagesDir: '/tmp/not-used-with-injected-pages',
    },
    {
      connection,
      db: { database: 'terria_v1_local' },
      repoRoot: process.cwd(),
      standardizedByInternal: new Map([
        ['DrillContainmentUnit', { internalName: 'DrillContainmentUnit', categoryCode: 'MATERIAL' }],
      ]),
      wikiPagesByInternal: new Map([
        [
          'DrillContainmentUnit',
          {
            itemInternalName: 'DrillContainmentUnit',
            wikitext: `
{{item infobox
| type = Mount summon
}}
            `,
          },
        ],
      ]),
      skipWriteReport: true,
    }
  );

  assert.equal(report.apply, false);
  assert.equal(report.db.database, 'terria_v1_local');
  assert.equal(report.scanned, 1);
  assert.equal(report.wikiMatched, 1);
  assert.equal(report.classified, 1);
  assert.equal(report.updated, 1);
  assert.deepEqual(report.categoryDistribution, { MOUNT: 1 });
  assert.deepEqual(report.changedSamples, [
    {
      id: 100,
      internalName: 'DrillContainmentUnit',
      currentCategoryCode: 'MATERIAL',
      nextCategoryCode: 'MOUNT',
      reason: 'type:mount summon',
      willUpdate: true,
    },
  ]);
  assert.deepEqual(report.verifiedSamples, [
    {
      id: 100,
      internalName: 'DrillContainmentUnit',
      currentCategoryCode: 'MATERIAL',
      nextCategoryCode: 'MOUNT',
      reason: 'type:mount summon',
      willUpdate: true,
    },
  ]);
});
