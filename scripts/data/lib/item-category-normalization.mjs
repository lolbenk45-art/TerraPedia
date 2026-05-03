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
