import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY_DEFINITIONS,
  normalizeCategoryCode,
  resolveItemCategoryCode,
} from './item-category-normalization.mjs';

test('normalizeCategoryCode keeps legacy combined codes when item context is absent', () => {
  assert.equal(normalizeCategoryCode('PICKAXE'), 'PICKAXE');
  assert.equal(normalizeCategoryCode('AXE'), 'AXE');
  assert.equal(normalizeCategoryCode('TOOL_PICKAXE_DRILL'), 'TOOL_PICKAXE_DRILL');
  assert.equal(normalizeCategoryCode('TOOL_AXE_CHAINSAW'), 'TOOL_AXE_CHAINSAW');
});

test('resolveItemCategoryCode splits legacy tool codes with item identity context', () => {
  assert.equal(
    resolveItemCategoryCode('PICKAXE', { name: 'Iron Pickaxe', internalName: 'IronPickaxe' }),
    'TOOL_PICKAXE'
  );
  assert.equal(
    resolveItemCategoryCode('PICKAXE', { name: 'Cobalt Drill', internalName: 'CobaltDrill' }),
    'TOOL_DRILL'
  );
  assert.equal(
    resolveItemCategoryCode('AXE', { name: 'Iron Axe', internalName: 'IronAxe' }),
    'TOOL_AXE'
  );
  assert.equal(
    resolveItemCategoryCode('AXE', { name: 'Cobalt Chainsaw', internalName: 'CobaltChainsaw' }),
    'TOOL_CHAINSAW'
  );
});

test('resolveItemCategoryCode keeps legacy tool codes when item identity is absent', () => {
  assert.equal(resolveItemCategoryCode('PICKAXE'), 'PICKAXE');
  assert.equal(resolveItemCategoryCode('AXE'), 'AXE');
  assert.equal(resolveItemCategoryCode('TOOL_PICKAXE_DRILL', {}), 'TOOL_PICKAXE_DRILL');
  assert.equal(resolveItemCategoryCode('TOOL_AXE_CHAINSAW', {}), 'TOOL_AXE_CHAINSAW');
});

test('resolveItemCategoryCode keeps Drax in the pickaxe family and still detects drill text', () => {
  assert.equal(
    resolveItemCategoryCode('PICKAXE', { name: 'Drax', internalName: 'Drax', nameZh: '斧钻' }),
    'TOOL_PICKAXE'
  );
  assert.equal(
    resolveItemCategoryCode('PICKAXE', { name: 'Cobalt Drill', internalName: 'CobaltDrill' }),
    'TOOL_DRILL'
  );
  assert.equal(
    resolveItemCategoryCode('AXE', { name: 'Cobalt Chainsaw', internalName: 'CobaltChainsaw' }),
    'TOOL_CHAINSAW'
  );
});

test('tool split category definitions keep compatibility containers as parents', () => {
  const byCode = new Map(CATEGORY_DEFINITIONS.map((definition) => [definition.code, definition]));

  assert.equal(byCode.get('TOOL_PICKAXE_DRILL')?.name, '采掘工具');
  assert.equal(byCode.get('TOOL_PICKAXE')?.parentCode, 'TOOL_PICKAXE_DRILL');
  assert.equal(byCode.get('TOOL_DRILL')?.parentCode, 'TOOL_PICKAXE_DRILL');
  assert.equal(byCode.get('TOOL_AXE_CHAINSAW')?.name, '砍伐工具');
  assert.equal(byCode.get('TOOL_AXE')?.parentCode, 'TOOL_AXE_CHAINSAW');
  assert.equal(byCode.get('TOOL_CHAINSAW')?.parentCode, 'TOOL_AXE_CHAINSAW');
});
