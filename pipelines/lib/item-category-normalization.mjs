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
  { code: 'ACCESSORY', name: '饰品', parentCode: null, sort: 51, topType: 'ACCESSORY' },
  { code: 'ACCESSORY_SHIELD', name: '盾牌', parentCode: 'ACCESSORY', sort: 50, topType: 'ACCESSORY' },
  { code: 'ACCESSORY_BOOTS', name: '靴子', parentCode: 'ACCESSORY', sort: 49, topType: 'ACCESSORY' },
  { code: 'ACCESSORY_WINGS', name: '翅膀', parentCode: 'ACCESSORY', sort: 48, topType: 'ACCESSORY' },
  { code: 'ACCESSORY_MISC', name: '其他饰品', parentCode: 'ACCESSORY', sort: 47, topType: 'ACCESSORY' },
  { code: 'AMMUNITION', name: '弹药', parentCode: null, sort: 46, topType: 'AMMUNITION' },
  { code: 'AMMUNITION_ARROW', name: '箭', parentCode: 'AMMUNITION', sort: 45, topType: 'AMMUNITION' },
  { code: 'AMMUNITION_BULLET', name: '子弹', parentCode: 'AMMUNITION', sort: 44, topType: 'AMMUNITION' },
  { code: 'AMMUNITION_ROCKET', name: '火箭', parentCode: 'AMMUNITION', sort: 43, topType: 'AMMUNITION' },
  { code: 'AMMUNITION_DART', name: '飞镖', parentCode: 'AMMUNITION', sort: 42, topType: 'AMMUNITION' },
  { code: 'AMMUNITION_FLASH', name: '照明弹', parentCode: 'AMMUNITION', sort: 41, topType: 'AMMUNITION' },
  { code: 'AMMUNITION_TOOL_BAIT', name: '鱼饵', parentCode: 'AMMUNITION', sort: 40, topType: 'AMMUNITION' },
  { code: 'AMMUNITION_TOOL_SOLUTION', name: '溶液', parentCode: 'AMMUNITION', sort: 39, topType: 'AMMUNITION' },
  { code: 'AMMUNITION_TOOL_WIRE', name: '电线', parentCode: 'AMMUNITION', sort: 38, topType: 'AMMUNITION' },
  { code: 'AMMUNITION_OTHER_TYPE', name: '其他弹药', parentCode: 'AMMUNITION', sort: 37, topType: 'AMMUNITION' },
  { code: 'PET', name: '宠物召唤', parentCode: null, sort: 54, topType: 'PET' },
  { code: 'MOUNT', name: '坐骑召唤', parentCode: null, sort: 55, topType: 'MOUNT' },
  { code: 'VANITY', name: '时装', parentCode: null, sort: 52, topType: 'VANITY' },
  { code: 'DYE', name: '染料', parentCode: null, sort: 53, topType: 'DYE' },
  { code: 'CRITTER', name: '小动物', parentCode: null, sort: 56, topType: 'CRITTER' },
  { code: 'MISC', name: '杂项', parentCode: null, sort: 57, topType: 'MISC' },
  { code: 'CONSUMABLE_POTION', name: '药水', parentCode: 'CONSUMABLE', sort: 10, topType: 'CONSUMABLE' },
  { code: 'CONSUMABLE_SUMMON', name: '召唤物品', parentCode: 'CONSUMABLE', sort: 9, topType: 'CONSUMABLE' },
  { code: 'CONSUMABLE_GRAB_BAG', name: '抓包与宝匣', parentCode: 'CONSUMABLE', sort: 8, topType: 'CONSUMABLE' },
  { code: 'CONSUMABLE_PERMANENT_BOOSTER', name: '永久增益', parentCode: 'CONSUMABLE', sort: 7, topType: 'CONSUMABLE' },
  { code: 'CONSUMABLE_MISC', name: '其他消耗品', parentCode: 'CONSUMABLE', sort: 6, topType: 'CONSUMABLE' },
  { code: 'CONSUMABLE_FOOD', name: '食物与饮品', parentCode: 'CONSUMABLE', sort: 5, topType: 'CONSUMABLE' },
  { code: 'MATERIAL_ORE', name: '矿石', parentCode: 'MATERIAL', sort: 15, topType: 'MATERIAL' },
  { code: 'MATERIAL_BAR', name: '锭', parentCode: 'MATERIAL', sort: 14, topType: 'MATERIAL' },
  { code: 'MATERIAL_GEM', name: '宝石', parentCode: 'MATERIAL', sort: 13, topType: 'MATERIAL' },
  { code: 'MATERIAL_SEED', name: '种子', parentCode: 'MATERIAL', sort: 12, topType: 'MATERIAL' },
  { code: 'MATERIAL_POTION_INGREDIENT', name: '药水材料', parentCode: 'MATERIAL', sort: 11, topType: 'MATERIAL' },
  { code: 'MATERIAL_BLOCK', name: '物块', parentCode: 'MATERIAL', sort: 10, topType: 'MATERIAL' },
  { code: 'MATERIAL_BRICK', name: '砖块', parentCode: 'MATERIAL', sort: 9, topType: 'MATERIAL' },
  { code: 'MATERIAL_WALL', name: '墙', parentCode: 'MATERIAL', sort: 8, topType: 'MATERIAL' },
  { code: 'MATERIAL_MISC', name: '其他材料', parentCode: 'MATERIAL', sort: 7, topType: 'MATERIAL' },
  { code: 'MATERIAL_CURRENCY', name: '货币', parentCode: 'MATERIAL', sort: 6, topType: 'MATERIAL' },
  { code: 'MATERIAL_KEY', name: '钥匙', parentCode: 'MATERIAL', sort: 5, topType: 'MATERIAL' },
  { code: 'FURNITURE_CRAFTING_STATION', name: '制作站', parentCode: 'FURNITURE', sort: 65, topType: 'FURNITURE' },
  { code: 'FURNITURE_STORAGE', name: '收纳家具', parentCode: 'FURNITURE', sort: 64, topType: 'FURNITURE' },
  { code: 'FURNITURE_LIGHT', name: '光源', parentCode: 'FURNITURE', sort: 63, topType: 'FURNITURE' },
  { code: 'FURNITURE_FUNCTIONAL', name: '功能家具', parentCode: 'FURNITURE', sort: 62, topType: 'FURNITURE' },
  { code: 'FURNITURE_DECORATION', name: '装饰家具', parentCode: 'FURNITURE', sort: 61, topType: 'FURNITURE' },
  { code: 'WEAPON_MELEE', name: '近战武器', parentCode: 'WEAPON', sort: 90, topType: 'WEAPON' },
  { code: 'WEAPON_MELEE_SWORD', name: '剑', parentCode: 'WEAPON_MELEE', sort: 89, topType: 'WEAPON' },
  { code: 'WEAPON_MELEE_BOOMERANG', name: '回旋镖', parentCode: 'WEAPON_MELEE', sort: 88, topType: 'WEAPON' },
  { code: 'WEAPON_MELEE_YOYO', name: '悠悠球', parentCode: 'WEAPON_MELEE', sort: 87, topType: 'WEAPON' },
  { code: 'WEAPON_MELEE_SPEAR', name: '矛', parentCode: 'WEAPON_MELEE', sort: 86, topType: 'WEAPON' },
  { code: 'WEAPON_MELEE_FLAIL', name: '连枷', parentCode: 'WEAPON_MELEE', sort: 85, topType: 'WEAPON' },
  { code: 'WEAPON_MELEE_OTHER', name: '其他近战武器', parentCode: 'WEAPON_MELEE', sort: 84, topType: 'WEAPON' },
  { code: 'WEAPON_RANGED', name: '远程武器', parentCode: 'WEAPON', sort: 83, topType: 'WEAPON' },
  { code: 'WEAPON_RANGED_BOW_CROSSBOW', name: '弓和弩', parentCode: 'WEAPON_RANGED', sort: 82, topType: 'WEAPON' },
  { code: 'WEAPON_RANGED_GUN', name: '枪', parentCode: 'WEAPON_RANGED', sort: 81, topType: 'WEAPON' },
  { code: 'WEAPON_RANGED_LAUNCHER', name: '发射器', parentCode: 'WEAPON_RANGED', sort: 80, topType: 'WEAPON' },
  { code: 'WEAPON_RANGED_CONSUMABLE', name: '消耗型远程武器', parentCode: 'WEAPON_RANGED', sort: 79, topType: 'WEAPON' },
  { code: 'WEAPON_RANGED_OTHER', name: '其他远程武器', parentCode: 'WEAPON_RANGED', sort: 78, topType: 'WEAPON' },
  { code: 'WEAPON_MAGIC', name: '魔法武器', parentCode: 'WEAPON', sort: 77, topType: 'WEAPON' },
  { code: 'WEAPON_MAGIC_GUN', name: '魔法枪', parentCode: 'WEAPON_MAGIC', sort: 76, topType: 'WEAPON' },
  { code: 'WEAPON_MAGIC_SPELLBOOK', name: '魔法书', parentCode: 'WEAPON_MAGIC', sort: 75, topType: 'WEAPON' },
  { code: 'WEAPON_MAGIC_WAND', name: '魔杖', parentCode: 'WEAPON_MAGIC', sort: 74, topType: 'WEAPON' },
  { code: 'WEAPON_SUMMON', name: '召唤武器', parentCode: 'WEAPON', sort: 73, topType: 'WEAPON' },
  { code: 'WEAPON_SUMMON_WHIP', name: '鞭', parentCode: 'WEAPON_SUMMON', sort: 72, topType: 'WEAPON' },
  { code: 'WEAPON_SUMMON_MINION', name: '仆从法杖', parentCode: 'WEAPON_SUMMON', sort: 71, topType: 'WEAPON' },
  { code: 'WEAPON_SUMMON_SENTRY', name: '哨兵法杖', parentCode: 'WEAPON_SUMMON', sort: 70, topType: 'WEAPON' },
  { code: 'WEAPON_OTHER', name: '其他武器', parentCode: 'WEAPON', sort: 69, topType: 'WEAPON' },
  { code: 'WEAPON_OTHER_EXPLOSIVE', name: '爆炸物', parentCode: 'WEAPON_OTHER', sort: 68, topType: 'WEAPON' },
  { code: 'WEAPON_OTHER_TOOL', name: '工具武器', parentCode: 'WEAPON_OTHER', sort: 67, topType: 'WEAPON' },
  { code: 'TOOL_PICKAXE_DRILL', name: '采掘工具', parentCode: 'TOOL', sort: 29, topType: 'TOOL' },
  { code: 'TOOL_PICKAXE', name: '镐类', parentCode: 'TOOL_PICKAXE_DRILL', sort: 28, topType: 'TOOL' },
  { code: 'TOOL_DRILL', name: '钻头', parentCode: 'TOOL_PICKAXE_DRILL', sort: 27, topType: 'TOOL' },
  { code: 'TOOL_AXE_CHAINSAW', name: '砍伐工具', parentCode: 'TOOL', sort: 26, topType: 'TOOL' },
  { code: 'TOOL_AXE', name: '斧类', parentCode: 'TOOL_AXE_CHAINSAW', sort: 25, topType: 'TOOL' },
  { code: 'TOOL_CHAINSAW', name: '链锯', parentCode: 'TOOL_AXE_CHAINSAW', sort: 24, topType: 'TOOL' },
  { code: 'TOOL_GRAPPLE', name: '抓钩', parentCode: 'TOOL', sort: 23, topType: 'TOOL' },
  { code: 'TOOL_FISHING_ROD', name: '钓竿', parentCode: 'TOOL', sort: 22, topType: 'TOOL' },
  { code: 'TOOL_HAMMER', name: '锤类', parentCode: 'TOOL', sort: 21, topType: 'TOOL' },
  { code: 'TOOL_PAINT', name: '油漆工具', parentCode: 'TOOL', sort: 20, topType: 'TOOL' },
  { code: 'TOOL_CIRCUIT', name: '电路工具', parentCode: 'TOOL', sort: 19, topType: 'TOOL' },
  { code: 'TOOL_OTHER', name: '其他工具', parentCode: 'TOOL', sort: 18, topType: 'TOOL' },
  { code: 'TOOL_OTHER_PLACE_WAND', name: '放置魔杖', parentCode: 'TOOL_OTHER', sort: 17, topType: 'TOOL' },
  { code: 'TOOL_OTHER_OTHER', name: '其他杂项工具', parentCode: 'TOOL_OTHER', sort: 16, topType: 'TOOL' },
  { code: 'ARMOR_PART', name: '盔甲部件', parentCode: 'ARMOR', sort: 47, topType: 'ARMOR' },
  { code: 'ARMOR_PART_HEAD', name: '头盔', parentCode: 'ARMOR_PART', sort: 40, topType: 'ARMOR' },
  { code: 'ARMOR_PART_BODY', name: '胸甲', parentCode: 'ARMOR_PART', sort: 41, topType: 'ARMOR' },
  { code: 'ARMOR_PART_LEGS', name: '护腿', parentCode: 'ARMOR_PART', sort: 42, topType: 'ARMOR' },
  { code: 'ARMOR_OTHER', name: '其他盔甲', parentCode: 'ARMOR', sort: 43, topType: 'ARMOR' },
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
