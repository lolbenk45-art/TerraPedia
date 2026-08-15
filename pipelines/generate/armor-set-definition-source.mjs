export const EXPECTED_ARMOR_SET_PLACEHOLDERS = new Map([
  ['雨具盔甲', { itemIds: [1135, 1136], reason: 'wiki display set without Module:ArmorSetBonuses definition' }],
  ['钴盔甲', { itemIds: [372, 374, 375], reason: 'wiki display set represented by Cobalt class-specific bonus definitions' }],
  ['秘银盔甲', { itemIds: [377, 379, 380], reason: 'wiki display set represented by Mythril class-specific bonus definitions' }],
  ['精金盔甲', { itemIds: [401, 403, 404], reason: 'wiki display set represented by Adamantite class-specific bonus definitions' }],
  ['神圣盔甲', { itemIds: [551, 552, 559], reason: 'wiki display set is a page-specific Hallowed variant subset' }],
  ['远古神圣盔甲', { itemIds: [4899, 4900, 4901], reason: 'wiki display set is a page-specific Ancient Hallowed variant subset' }],
  ['甲虫盔甲', { itemIds: [2199, 2200, 2202], reason: 'wiki display set represented by Beetle Damage/Defense bonus definitions' }],
  ['蘑菇矿盔甲', { itemIds: [1546, 1549, 1550], reason: 'wiki display set without Module:ArmorSetBonuses definition' }],
  ['幽灵盔甲', { itemIds: [1504, 1505, 2189], reason: 'wiki display set represented by Spectre Healing/Damage bonus definitions' }],
  ['空桶', { itemIds: [205], reason: 'nonstandard single-piece equipped display' }],
  ['护目镜', { itemIds: [37], reason: 'nonstandard single-piece equipped display' }],
  ['绿帽', { itemIds: [867], reason: 'nonstandard single-piece equipped display' }],
  ['潜水头盔', { itemIds: [268], reason: 'nonstandard single-piece equipped display' }],
  ['夜视头盔', { itemIds: [3109], reason: 'nonstandard single-piece equipped display' }],
  ['维京海盗头盔', { itemIds: [879], reason: 'nonstandard single-piece equipped display' }],
  ['小雪怪皮毛外套', { itemIds: [5068], reason: 'nonstandard single-piece equipped display' }],
  ['稽古衣', { itemIds: [2277], reason: 'nonstandard single-piece equipped display' }],
  ['神灵诅咒', { itemIds: [3770], reason: 'nonstandard single-piece equipped display' }],
  ['月亮领主腿', { itemIds: [5001], reason: 'nonstandard single-piece equipped display' }],
]);

export function extractArmorSetCurrentItemIds(row) {
  const uniqueItemIds = parseNumberArray(row?.unique_item_ids_json);
  if (uniqueItemIds.length > 0) {
    return uniqueItemIds;
  }

  const sets = parseJson(row?.sets_json);
  if (Array.isArray(sets) && Array.isArray(sets[0])) {
    return sets[0].map(Number).filter(Number.isFinite);
  }
  return [];
}

export function toArmorSetDefinitionSeedRow(row) {
  return {
    armorSetId: Number(row?.id),
    name: toText(row?.source_key),
    internalCode: toText(row?.source_key),
    itemIds: extractArmorSetCurrentItemIds(row),
    textKey: toText(row?.text_key),
    setsJson: toText(row?.sets_json),
  };
}

export function resolveExpectedArmorSetPlaceholder(record) {
  const identity = toText(record?.internalCode ?? record?.name);
  const expected = EXPECTED_ARMOR_SET_PLACEHOLDERS.get(identity);
  const itemIds = Array.isArray(record?.itemIds)
    ? record.itemIds.map(Number).filter(Number.isFinite).sort((left, right) => left - right)
    : [];
  if (!expected || !sameNumberArray(itemIds, expected.itemIds)) {
    return null;
  }
  return { reason: expected.reason };
}

function parseNumberArray(value) {
  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.map(Number).filter(Number.isFinite);
}

function parseJson(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toText(value) {
  const text = String(value ?? '').trim();
  return text === '' ? null : text;
}

function sameNumberArray(left, right) {
  const normalizedRight = [...right].map(Number).sort((a, b) => a - b);
  return left.length === normalizedRight.length
    && left.every((value, index) => value === normalizedRight[index]);
}
