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

test('category definitions cover classifier taxonomy output families', () => {
  const expectedDefinitions = [
    ['ACCESSORY', null],
    ['ACCESSORY_SHIELD', 'ACCESSORY'],
    ['ACCESSORY_BOOTS', 'ACCESSORY'],
    ['ACCESSORY_WINGS', 'ACCESSORY'],
    ['ACCESSORY_MISC', 'ACCESSORY'],
    ['AMMUNITION', null],
    ['AMMUNITION_ARROW', 'AMMUNITION'],
    ['AMMUNITION_BULLET', 'AMMUNITION'],
    ['AMMUNITION_ROCKET', 'AMMUNITION'],
    ['AMMUNITION_DART', 'AMMUNITION'],
    ['AMMUNITION_FLASH', 'AMMUNITION'],
    ['AMMUNITION_TOOL_BAIT', 'AMMUNITION'],
    ['AMMUNITION_TOOL_SOLUTION', 'AMMUNITION'],
    ['AMMUNITION_TOOL_WIRE', 'AMMUNITION'],
    ['AMMUNITION_OTHER_TYPE', 'AMMUNITION'],
    ['PET', null],
    ['MOUNT', null],
    ['VANITY', null],
    ['DYE', null],
    ['CRITTER', null],
    ['MISC', null],
    ['CONSUMABLE_POTION', 'CONSUMABLE'],
    ['CONSUMABLE_SUMMON', 'CONSUMABLE'],
    ['CONSUMABLE_GRAB_BAG', 'CONSUMABLE'],
    ['CONSUMABLE_PERMANENT_BOOSTER', 'CONSUMABLE'],
    ['CONSUMABLE_MISC', 'CONSUMABLE'],
    ['CONSUMABLE_FOOD', 'CONSUMABLE'],
    ['MATERIAL_ORE', 'MATERIAL'],
    ['MATERIAL_BAR', 'MATERIAL'],
    ['MATERIAL_GEM', 'MATERIAL'],
    ['MATERIAL_SEED', 'MATERIAL'],
    ['MATERIAL_POTION_INGREDIENT', 'MATERIAL'],
    ['MATERIAL_BLOCK', 'MATERIAL'],
    ['MATERIAL_BRICK', 'MATERIAL'],
    ['MATERIAL_WALL', 'MATERIAL'],
    ['MATERIAL_MISC', 'MATERIAL'],
    ['MATERIAL_CURRENCY', 'MATERIAL'],
    ['MATERIAL_KEY', 'MATERIAL'],
    ['FURNITURE_CRAFTING_STATION', 'FURNITURE'],
    ['FURNITURE_STORAGE', 'FURNITURE'],
    ['FURNITURE_LIGHT', 'FURNITURE'],
    ['FURNITURE_FUNCTIONAL', 'FURNITURE'],
    ['FURNITURE_DECORATION', 'FURNITURE'],
    ['WEAPON_MELEE', 'WEAPON'],
    ['WEAPON_MELEE_SWORD', 'WEAPON_MELEE'],
    ['WEAPON_MELEE_BOOMERANG', 'WEAPON_MELEE'],
    ['WEAPON_MELEE_YOYO', 'WEAPON_MELEE'],
    ['WEAPON_MELEE_SPEAR', 'WEAPON_MELEE'],
    ['WEAPON_MELEE_FLAIL', 'WEAPON_MELEE'],
    ['WEAPON_MELEE_OTHER', 'WEAPON_MELEE'],
    ['WEAPON_RANGED', 'WEAPON'],
    ['WEAPON_RANGED_BOW_CROSSBOW', 'WEAPON_RANGED'],
    ['WEAPON_RANGED_GUN', 'WEAPON_RANGED'],
    ['WEAPON_RANGED_LAUNCHER', 'WEAPON_RANGED'],
    ['WEAPON_RANGED_CONSUMABLE', 'WEAPON_RANGED'],
    ['WEAPON_RANGED_OTHER', 'WEAPON_RANGED'],
    ['WEAPON_MAGIC', 'WEAPON'],
    ['WEAPON_MAGIC_GUN', 'WEAPON_MAGIC'],
    ['WEAPON_MAGIC_SPELLBOOK', 'WEAPON_MAGIC'],
    ['WEAPON_MAGIC_WAND', 'WEAPON_MAGIC'],
    ['WEAPON_SUMMON', 'WEAPON'],
    ['WEAPON_SUMMON_WHIP', 'WEAPON_SUMMON'],
    ['WEAPON_SUMMON_MINION', 'WEAPON_SUMMON'],
    ['WEAPON_SUMMON_SENTRY', 'WEAPON_SUMMON'],
    ['WEAPON_OTHER', 'WEAPON'],
    ['WEAPON_OTHER_EXPLOSIVE', 'WEAPON_OTHER'],
    ['WEAPON_OTHER_TOOL', 'WEAPON_OTHER'],
    ['ARMOR_OTHER', 'ARMOR'],
  ];
  const byCode = new Map(CATEGORY_DEFINITIONS.map((definition) => [definition.code, definition]));

  for (const [code, parentCode] of expectedDefinitions) {
    const definition = byCode.get(code);
    assert.ok(definition, `missing ${code}`);
    assert.equal(definition.parentCode ?? null, parentCode, `${code} parentCode`);
  }
});
