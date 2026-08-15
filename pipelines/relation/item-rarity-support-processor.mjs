import {
  confidence,
  createRecordKey,
  normalizeText,
  relationStatus
} from './relation-trace.mjs';

export const DEFAULT_ITEM_RARITY_SUPPORT_ROWS = [
  { id: -13, code: 'master', display_name_zh: '大师', display_name_en: 'Master', sort_order: 1, status: 1, deleted: 0 },
  { id: -12, code: 'expert', display_name_zh: '专家', display_name_en: 'Expert', sort_order: 2, status: 1, deleted: 0 },
  { id: -11, code: 'quest', display_name_zh: '任务', display_name_en: 'Quest', sort_order: 3, status: 1, deleted: 0 },
  { id: -1, code: 'gray', display_name_zh: '灰色', display_name_en: 'Gray', sort_order: 4, status: 1, deleted: 0 },
  { id: 0, code: 'white', display_name_zh: '白色', display_name_en: 'White', sort_order: 5, status: 1, deleted: 0 },
  { id: 1, code: 'blue', display_name_zh: '蓝色', display_name_en: 'Blue', sort_order: 6, status: 1, deleted: 0 },
  { id: 2, code: 'green', display_name_zh: '绿色', display_name_en: 'Green', sort_order: 7, status: 1, deleted: 0 },
  { id: 3, code: 'orange', display_name_zh: '橙色', display_name_en: 'Orange', sort_order: 8, status: 1, deleted: 0 },
  { id: 4, code: 'light_red', display_name_zh: '浅红色', display_name_en: 'Light Red', sort_order: 9, status: 1, deleted: 0 },
  { id: 5, code: 'pink', display_name_zh: '粉红色', display_name_en: 'Pink', sort_order: 10, status: 1, deleted: 0 },
  { id: 6, code: 'light_purple', display_name_zh: '浅紫色', display_name_en: 'Light Purple', sort_order: 11, status: 1, deleted: 0 },
  { id: 7, code: 'lime', display_name_zh: '黄绿色', display_name_en: 'Lime', sort_order: 12, status: 1, deleted: 0 },
  { id: 8, code: 'yellow', display_name_zh: '黄色', display_name_en: 'Yellow', sort_order: 13, status: 1, deleted: 0 },
  { id: 9, code: 'cyan', display_name_zh: '青色', display_name_en: 'Cyan', sort_order: 14, status: 1, deleted: 0 },
  { id: 10, code: 'red', display_name_zh: '红色', display_name_en: 'Red', sort_order: 15, status: 1, deleted: 0 },
  { id: 11, code: 'purple', display_name_zh: '紫色', display_name_en: 'Purple', sort_order: 16, status: 1, deleted: 0 }
];

function toNullableNumber(value) {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function buildRelationItemRarities({ supportRows = DEFAULT_ITEM_RARITY_SUPPORT_ROWS } = {}) {
  return supportRows.map((row) => ({
    id: toNullableNumber(row.id),
    recordKey: createRecordKey({
      type: 'support_item_rarity',
      rarityId: toNullableNumber(row.id),
      code: normalizeText(row.code)
    }),
    code: normalizeText(row.code),
    displayNameZh: normalizeText(row.display_name_zh),
    displayNameEn: normalizeText(row.display_name_en),
    sortOrder: toNullableNumber(row.sort_order),
    reviewStatus: relationStatus.resolved,
    confidence: confidence.high,
    reason: 'support_item_rarity_dictionary',
    rawJson: JSON.stringify(row),
    sourceMaintTable: 'support_item_rarity',
    sourceMaintRecordKey: null,
    sourceMaintId: toNullableNumber(row.id),
    landingSourceId: null,
    landingSourceKey: 'support_domain:item_rarity_dictionary_v1',
    landingContentHash: null,
    sourceProvider: 'terrapedia_support_domain',
    sourcePage: 'item_rarity_dictionary_v1',
    sourceRevisionTimestamp: null,
    status: toNullableNumber(row.status) ?? 1,
    deleted: toNullableNumber(row.deleted) ?? 0
  }));
}
