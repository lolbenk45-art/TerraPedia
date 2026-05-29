import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRelatedCategoryCodes,
  classifyItem,
  ensureCategories,
  parseArgs,
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
