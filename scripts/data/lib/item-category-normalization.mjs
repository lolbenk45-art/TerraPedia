function toNullableString(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

export const CATEGORY_CODE_ALIASES = Object.freeze({
  DRILL: 'TOOL_DRILL',
  CHAINSAW: 'TOOL_CHAINSAW',
  HELMET: 'ARMOR_PART_HEAD',
  CHESTPLATE: 'ARMOR_PART_BODY',
  LEGGINGS: 'ARMOR_PART_LEGS',
});

function buildItemIdentityText(item) {
  if (!item || typeof item !== 'object') return '';
  return [
    item.name,
    item.internalName,
    item.internal_name,
    item.nameZh,
    item.name_zh,
  ]
    .filter((value) => value != null)
    .map((value) => String(value).trim())
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function containsAny(text, keywords) {
  const source = String(text || '').toLowerCase();
  return keywords.some((keyword) => source.includes(String(keyword).toLowerCase()));
}

export const CATEGORY_DEFINITIONS = Object.freeze([
  { code: 'WEAPON', name: '武器', sort: 25, topType: 'ROOT' },
  { code: 'TOOL', name: '工具', sort: 30, topType: 'ROOT' },
  { code: 'ARMOR', name: '盔甲', sort: 50, topType: 'ROOT' },
  { code: 'CONSUMABLE', name: '消耗品', sort: 4, topType: 'ROOT' },
  { code: 'MATERIAL', name: '材料', sort: 5, topType: 'ROOT' },
  { code: 'FURNITURE', name: '家具', sort: 60, topType: 'ROOT' },
  { code: 'BUFF', name: '状态效果', sort: 30, topType: 'ROOT' },
  { code: 'NPC', name: '非玩家角色', sort: 31, topType: 'ROOT' },
  { code: 'PROJECTILE', name: '投射物', sort: 32, topType: 'ROOT' },
  { code: 'ARMOR_SET', name: '盔甲套装', sort: 33, topType: 'ROOT' },
  { code: 'ACCESSORY', name: 'Accessory', parentCode: null, sort: 51, topType: 'ACCESSORY' },
  { code: 'ACCESSORY_SHIELD', name: 'Shield', parentCode: 'ACCESSORY', sort: 50, topType: 'ACCESSORY' },
  { code: 'ACCESSORY_BOOTS', name: 'Boots', parentCode: 'ACCESSORY', sort: 49, topType: 'ACCESSORY' },
  { code: 'ACCESSORY_WINGS', name: 'Wings', parentCode: 'ACCESSORY', sort: 48, topType: 'ACCESSORY' },
  { code: 'ACCESSORY_MISC', name: 'Other Accessory', parentCode: 'ACCESSORY', sort: 47, topType: 'ACCESSORY' },
  { code: 'AMMUNITION', name: 'Ammunition', parentCode: null, sort: 46, topType: 'AMMUNITION' },
  { code: 'AMMUNITION_ARROW', name: 'Arrow', parentCode: 'AMMUNITION', sort: 45, topType: 'AMMUNITION' },
  { code: 'AMMUNITION_BULLET', name: 'Bullet', parentCode: 'AMMUNITION', sort: 44, topType: 'AMMUNITION' },
  { code: 'AMMUNITION_ROCKET', name: 'Rocket', parentCode: 'AMMUNITION', sort: 43, topType: 'AMMUNITION' },
  { code: 'AMMUNITION_DART', name: 'Dart', parentCode: 'AMMUNITION', sort: 42, topType: 'AMMUNITION' },
  { code: 'AMMUNITION_FLASH', name: 'Flare', parentCode: 'AMMUNITION', sort: 41, topType: 'AMMUNITION' },
  { code: 'AMMUNITION_TOOL_BAIT', name: 'Bait', parentCode: 'AMMUNITION', sort: 40, topType: 'AMMUNITION' },
  { code: 'AMMUNITION_TOOL_SOLUTION', name: 'Solution', parentCode: 'AMMUNITION', sort: 39, topType: 'AMMUNITION' },
  { code: 'AMMUNITION_TOOL_WIRE', name: 'Wire', parentCode: 'AMMUNITION', sort: 38, topType: 'AMMUNITION' },
  { code: 'AMMUNITION_OTHER_TYPE', name: 'Other Ammunition', parentCode: 'AMMUNITION', sort: 37, topType: 'AMMUNITION' },
  { code: 'PET', name: 'Pet', parentCode: null, sort: 54, topType: 'PET' },
  { code: 'MOUNT', name: 'Mount', parentCode: null, sort: 55, topType: 'MOUNT' },
  { code: 'VANITY', name: 'Vanity', parentCode: null, sort: 52, topType: 'VANITY' },
  { code: 'DYE', name: 'Dye', parentCode: null, sort: 53, topType: 'DYE' },
  { code: 'CRITTER', name: 'Critter', parentCode: null, sort: 56, topType: 'CRITTER' },
  { code: 'MISC', name: 'Misc', parentCode: null, sort: 57, topType: 'MISC' },
  { code: 'CONSUMABLE_POTION', name: 'Potion', parentCode: 'CONSUMABLE', sort: 10, topType: 'CONSUMABLE' },
  { code: 'CONSUMABLE_SUMMON', name: 'Summon Item', parentCode: 'CONSUMABLE', sort: 9, topType: 'CONSUMABLE' },
  { code: 'CONSUMABLE_GRAB_BAG', name: 'Grab Bag', parentCode: 'CONSUMABLE', sort: 8, topType: 'CONSUMABLE' },
  { code: 'CONSUMABLE_PERMANENT_BOOSTER', name: 'Permanent Booster', parentCode: 'CONSUMABLE', sort: 7, topType: 'CONSUMABLE' },
  { code: 'CONSUMABLE_MISC', name: 'Other Consumable', parentCode: 'CONSUMABLE', sort: 6, topType: 'CONSUMABLE' },
  { code: 'CONSUMABLE_FOOD', name: 'Food', parentCode: 'CONSUMABLE', sort: 5, topType: 'CONSUMABLE' },
  { code: 'MATERIAL_ORE', name: 'Ore', parentCode: 'MATERIAL', sort: 15, topType: 'MATERIAL' },
  { code: 'MATERIAL_BAR', name: 'Bar', parentCode: 'MATERIAL', sort: 14, topType: 'MATERIAL' },
  { code: 'MATERIAL_GEM', name: 'Gem', parentCode: 'MATERIAL', sort: 13, topType: 'MATERIAL' },
  { code: 'MATERIAL_SEED', name: 'Seed', parentCode: 'MATERIAL', sort: 12, topType: 'MATERIAL' },
  { code: 'MATERIAL_POTION_INGREDIENT', name: 'Potion Ingredient', parentCode: 'MATERIAL', sort: 11, topType: 'MATERIAL' },
  { code: 'MATERIAL_BLOCK', name: 'Block', parentCode: 'MATERIAL', sort: 10, topType: 'MATERIAL' },
  { code: 'MATERIAL_BRICK', name: 'Brick', parentCode: 'MATERIAL', sort: 9, topType: 'MATERIAL' },
  { code: 'MATERIAL_WALL', name: 'Wall', parentCode: 'MATERIAL', sort: 8, topType: 'MATERIAL' },
  { code: 'MATERIAL_MISC', name: 'Other Material', parentCode: 'MATERIAL', sort: 7, topType: 'MATERIAL' },
  { code: 'MATERIAL_CURRENCY', name: 'Currency', parentCode: 'MATERIAL', sort: 6, topType: 'MATERIAL' },
  { code: 'MATERIAL_KEY', name: 'Key', parentCode: 'MATERIAL', sort: 5, topType: 'MATERIAL' },
  { code: 'FURNITURE_CRAFTING_STATION', name: 'Crafting Station', parentCode: 'FURNITURE', sort: 65, topType: 'FURNITURE' },
  { code: 'FURNITURE_STORAGE', name: 'Storage', parentCode: 'FURNITURE', sort: 64, topType: 'FURNITURE' },
  { code: 'FURNITURE_LIGHT', name: 'Light Source', parentCode: 'FURNITURE', sort: 63, topType: 'FURNITURE' },
  { code: 'FURNITURE_FUNCTIONAL', name: 'Functional Furniture', parentCode: 'FURNITURE', sort: 62, topType: 'FURNITURE' },
  { code: 'FURNITURE_DECORATION', name: 'Decoration', parentCode: 'FURNITURE', sort: 61, topType: 'FURNITURE' },
  { code: 'WEAPON_MELEE', name: 'Melee Weapon', parentCode: 'WEAPON', sort: 90, topType: 'WEAPON' },
  { code: 'WEAPON_MELEE_SWORD', name: 'Sword', parentCode: 'WEAPON_MELEE', sort: 89, topType: 'WEAPON' },
  { code: 'WEAPON_MELEE_BOOMERANG', name: 'Boomerang', parentCode: 'WEAPON_MELEE', sort: 88, topType: 'WEAPON' },
  { code: 'WEAPON_MELEE_YOYO', name: 'Yoyo', parentCode: 'WEAPON_MELEE', sort: 87, topType: 'WEAPON' },
  { code: 'WEAPON_MELEE_SPEAR', name: 'Spear', parentCode: 'WEAPON_MELEE', sort: 86, topType: 'WEAPON' },
  { code: 'WEAPON_MELEE_FLAIL', name: 'Flail', parentCode: 'WEAPON_MELEE', sort: 85, topType: 'WEAPON' },
  { code: 'WEAPON_MELEE_OTHER', name: 'Other Melee Weapon', parentCode: 'WEAPON_MELEE', sort: 84, topType: 'WEAPON' },
  { code: 'WEAPON_RANGED', name: 'Ranged Weapon', parentCode: 'WEAPON', sort: 83, topType: 'WEAPON' },
  { code: 'WEAPON_RANGED_BOW_CROSSBOW', name: 'Bow and Crossbow', parentCode: 'WEAPON_RANGED', sort: 82, topType: 'WEAPON' },
  { code: 'WEAPON_RANGED_GUN', name: 'Gun', parentCode: 'WEAPON_RANGED', sort: 81, topType: 'WEAPON' },
  { code: 'WEAPON_RANGED_LAUNCHER', name: 'Launcher', parentCode: 'WEAPON_RANGED', sort: 80, topType: 'WEAPON' },
  { code: 'WEAPON_RANGED_CONSUMABLE', name: 'Consumable Ranged Weapon', parentCode: 'WEAPON_RANGED', sort: 79, topType: 'WEAPON' },
  { code: 'WEAPON_RANGED_OTHER', name: 'Other Ranged Weapon', parentCode: 'WEAPON_RANGED', sort: 78, topType: 'WEAPON' },
  { code: 'WEAPON_MAGIC', name: 'Magic Weapon', parentCode: 'WEAPON', sort: 77, topType: 'WEAPON' },
  { code: 'WEAPON_MAGIC_GUN', name: 'Magic Gun', parentCode: 'WEAPON_MAGIC', sort: 76, topType: 'WEAPON' },
  { code: 'WEAPON_MAGIC_SPELLBOOK', name: 'Spellbook', parentCode: 'WEAPON_MAGIC', sort: 75, topType: 'WEAPON' },
  { code: 'WEAPON_MAGIC_WAND', name: 'Wand', parentCode: 'WEAPON_MAGIC', sort: 74, topType: 'WEAPON' },
  { code: 'WEAPON_SUMMON', name: 'Summon Weapon', parentCode: 'WEAPON', sort: 73, topType: 'WEAPON' },
  { code: 'WEAPON_SUMMON_WHIP', name: 'Whip', parentCode: 'WEAPON_SUMMON', sort: 72, topType: 'WEAPON' },
  { code: 'WEAPON_SUMMON_MINION', name: 'Minion Staff', parentCode: 'WEAPON_SUMMON', sort: 71, topType: 'WEAPON' },
  { code: 'WEAPON_SUMMON_SENTRY', name: 'Sentry Staff', parentCode: 'WEAPON_SUMMON', sort: 70, topType: 'WEAPON' },
  { code: 'WEAPON_OTHER', name: 'Other Weapon', parentCode: 'WEAPON', sort: 69, topType: 'WEAPON' },
  { code: 'WEAPON_OTHER_EXPLOSIVE', name: 'Explosive', parentCode: 'WEAPON_OTHER', sort: 68, topType: 'WEAPON' },
  { code: 'WEAPON_OTHER_TOOL', name: 'Tool Weapon', parentCode: 'WEAPON_OTHER', sort: 67, topType: 'WEAPON' },
  { code: 'TOOL_PICKAXE_DRILL', name: '采掘工具', parentCode: 'TOOL', sort: 29, topType: 'TOOL' },
  { code: 'TOOL_PICKAXE', name: '镐类', parentCode: 'TOOL_PICKAXE_DRILL', sort: 28, topType: 'TOOL' },
  { code: 'TOOL_DRILL', name: '钻头', parentCode: 'TOOL_PICKAXE_DRILL', sort: 27, topType: 'TOOL' },
  { code: 'TOOL_AXE_CHAINSAW', name: '砍伐工具', parentCode: 'TOOL', sort: 26, topType: 'TOOL' },
  { code: 'TOOL_AXE', name: '斧类', parentCode: 'TOOL_AXE_CHAINSAW', sort: 25, topType: 'TOOL' },
  { code: 'TOOL_CHAINSAW', name: '链锯', parentCode: 'TOOL_AXE_CHAINSAW', sort: 24, topType: 'TOOL' },
  { code: 'ARMOR_PART', name: '盔甲部件', parentCode: 'ARMOR', sort: 47, topType: 'ARMOR' },
  { code: 'ARMOR_PART_HEAD', name: '头盔', parentCode: 'ARMOR_PART', sort: 40, topType: 'ARMOR' },
  { code: 'ARMOR_PART_BODY', name: '胸甲', parentCode: 'ARMOR_PART', sort: 41, topType: 'ARMOR' },
  { code: 'ARMOR_PART_LEGS', name: '护腿', parentCode: 'ARMOR_PART', sort: 42, topType: 'ARMOR' },
  { code: 'ARMOR_OTHER', name: 'Other Armor', parentCode: 'ARMOR', sort: 43, topType: 'ARMOR' },
]);

const categoryDefinitionByCode = new Map(
  CATEGORY_DEFINITIONS.map((definition) => [definition.code, definition])
);

export function normalizeCategoryCode(value) {
  const code = toNullableString(value)?.toUpperCase();
  if (!code) return null;
  return CATEGORY_CODE_ALIASES[code] || code;
}

export function resolveItemCategoryCode(value, item = null) {
  const code = toNullableString(value)?.toUpperCase();
  if (!code) return null;
  const identity = buildItemIdentityText(item);
  if (code === 'PICKAXE' || code === 'TOOL_PICKAXE_DRILL') {
    if (!identity) return code;
    return containsAny(identity, ['drill', '钻头', '电钻']) ? 'TOOL_DRILL' : 'TOOL_PICKAXE';
  }
  if (code === 'AXE' || code === 'TOOL_AXE_CHAINSAW') {
    if (!identity) return code;
    return containsAny(identity, ['chainsaw', '链锯']) ? 'TOOL_CHAINSAW' : 'TOOL_AXE';
  }
  return CATEGORY_CODE_ALIASES[code] || code;
}

export function getCategoryDisplayName(code) {
  const normalizedCode = normalizeCategoryCode(code);
  if (!normalizedCode) return null;

  const definition = categoryDefinitionByCode.get(normalizedCode);
  if (definition?.name) return definition.name;

  return normalizedCode
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}
