import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRelatedCategoryCodes,
  classifyItem,
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

test('classifyItem prefers standardized pickaxe mapping', () => {
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
        ['TOOL_PICKAXE_DRILL', { id: 1 }]
      ])
    }
  });

  assert.equal(result.categoryCode, 'TOOL_PICKAXE_DRILL');
  assert.equal(result.reason, 'standardized_pickaxe');
});
