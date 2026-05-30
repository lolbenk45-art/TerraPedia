import { isManagedImageUrl } from './managed-image-url-policy.mjs';

const BOSS_MANAGED_IMAGE_URL_PREFIXES = [
  'http://localhost:9000/terrapedia-images/bosses/',
  'http://127.0.0.1:9000/terrapedia-images/bosses/',
];

function parseJsonObject(value) {
  if (value == null) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toPositiveNumberSet(values = []) {
  return new Set(
    values
      .map((value) => toNullableNumber(value))
      .filter((value) => value != null && value > 0)
  );
}

function flattenSetIds(sets = []) {
  const ids = [];
  for (const set of sets) {
    if (Array.isArray(set)) {
      ids.push(...set);
    } else {
      ids.push(set);
    }
  }
  return ids;
}

function setsEqual(left, right) {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

function armorRelatedItemId(item) {
  return toNullableNumber(item?.itemId ?? item?.item_id ?? item?.sourceId ?? item?.source_id ?? item?.id);
}

export function validateProjectionArmorSetConsistency(rows = []) {
  const issues = [];
  for (const row of rows) {
    const textKey = row?.textKey ?? row?.text_key ?? null;
    const compositionKind = row?.compositionKind ?? row?.composition_kind ?? null;
    const sets = parseJsonArray(row?.setsJson ?? row?.sets_json);
    const uniqueIds = parseJsonArray(row?.uniqueItemIdsJson ?? row?.unique_item_ids_json);
    const currentIds = parseJsonArray(row?.currentItemIdsJson ?? row?.current_item_ids_json);
    const relatedItems = parseJsonArray(row?.relatedItemsJson ?? row?.related_items_json);
    const setIdSet = toPositiveNumberSet(flattenSetIds(sets));
    const uniqueIdSet = toPositiveNumberSet(uniqueIds);
    const currentIdSet = toPositiveNumberSet(currentIds);
    const relatedIdSet = toPositiveNumberSet(relatedItems.map((item) => armorRelatedItemId(item)));

    if (!setsEqual(uniqueIdSet, setIdSet)) {
      issues.push({
        code: 'armor_set_unique_ids_mismatch',
        textKey,
        expectedIds: [...setIdSet],
        actualIds: [...uniqueIdSet]
      });
    }
    if (!setsEqual(currentIdSet, relatedIdSet)) {
      issues.push({
        code: 'armor_set_current_items_mismatch',
        textKey,
        expectedIds: [...relatedIdSet],
        actualIds: [...currentIdSet]
      });
    }
    const missingCurrentSetMemberIds = [...setIdSet].filter((itemId) => !currentIdSet.has(itemId));
    if (missingCurrentSetMemberIds.length > 0) {
      issues.push({
        code: 'armor_set_current_items_missing_set_members',
        textKey,
        expectedIds: [...setIdSet],
        actualIds: [...currentIdSet],
        missingIds: missingCurrentSetMemberIds
      });
    }
    const missingRelatedSetMemberIds = [...setIdSet].filter((itemId) => !relatedIdSet.has(itemId));
    if (missingRelatedSetMemberIds.length > 0) {
      issues.push({
        code: 'armor_set_related_items_missing_set_members',
        textKey,
        expectedIds: [...setIdSet],
        actualIds: [...relatedIdSet],
        missingIds: missingRelatedSetMemberIds
      });
    }

    for (const item of relatedItems) {
      const itemId = armorRelatedItemId(item);
      if (itemId != null && itemId > 0 && !setIdSet.has(itemId)) {
        issues.push({
          code: 'armor_set_related_item_not_in_sets',
          textKey,
          itemId,
          internalName: item?.internalName ?? item?.internal_name ?? null
        });
      }
    }

    if (compositionKind === 'single_piece_set' || compositionKind === 'nonstandard_piece_set') {
      if (relatedIdSet.size !== 1 || setIdSet.size !== 1) {
        issues.push({
          code: 'armor_set_single_piece_member_count',
          textKey,
          compositionKind,
          setItemCount: setIdSet.size,
          relatedItemCount: relatedIdSet.size
        });
      }
    }
  }
  return issues;
}

function toNullableNumber(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toFlag(value) {
  if (value == null) return null;
  return value ? 1 : 0;
}

function coalesceDefined(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined) {
      return value;
    }
  }
  return null;
}

function toSlug(value) {
  const text = String(value ?? '').trim();
  return text ? text.toLowerCase() : null;
}

function toBossCode(value) {
  const text = String(value ?? '').trim();
  return text
    ? text
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
    : null;
}

function stablePositiveBigIntId(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash === 0 ? 1 : hash;
}

function buildImageIndex(rows = [], entityKey, managedImageUrlPrefixes = []) {
  const index = new Map();
  for (const row of rows) {
    const key = row[entityKey];
    if (!key) continue;
    const current = index.get(key);
    if (!current || comparePreferredImageRows(row, current, managedImageUrlPrefixes) < 0) {
      index.set(key, row);
    }
  }
  return index;
}

function resolveProjectedImageUrl(imageRow, managedImageUrlPrefixes = []) {
  return hasProjectedImageUrl(imageRow, managedImageUrlPrefixes) ? imageRow.cachedUrl.trim() : null;
}

function resolveManagedProjectionImageValue(value, managedImageUrlPrefixes = []) {
  return isManagedImageUrl(value, managedImageUrlPrefixes) ? value.trim() : null;
}

function resolveManagedRawImageUrl(raw, managedImageUrlPrefixes = []) {
  return resolveManagedProjectionImageValue(raw?.imageUrl, managedImageUrlPrefixes)
    ?? resolveManagedProjectionImageValue(raw?.image_url, managedImageUrlPrefixes)
    ?? resolveManagedProjectionImageValue(raw?.image, managedImageUrlPrefixes);
}

function hasProjectedImageUrl(imageRow, managedImageUrlPrefixes = []) {
  return isManagedImageUrl(imageRow?.cachedUrl, managedImageUrlPrefixes);
}

function comparePreferredImageRows(left, right, managedImageUrlPrefixes = []) {
  const managedDelta = Number(hasProjectedImageUrl(right, managedImageUrlPrefixes))
    - Number(hasProjectedImageUrl(left, managedImageUrlPrefixes));
  if (managedDelta !== 0) return managedDelta;
  const primaryDelta = Number(right?.isPrimary ?? 0) - Number(left?.isPrimary ?? 0);
  if (primaryDelta !== 0) return primaryDelta;
  return Number(left?.sortOrder ?? 0) - Number(right?.sortOrder ?? 0);
}

function buildRowsByKey(rows, keyName) {
  const map = new Map();
  for (const row of rows) {
    const key = row?.[keyName];
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(row);
  }
  return map;
}

function buildProjectionRowIndexes(rows = []) {
  const bySourceId = new Map();
  const byInternalName = new Map();
  for (const row of rows) {
    if (row?.id != null) {
      bySourceId.set(Number(row.id), row);
    }
    if (row?.internalName) {
      byInternalName.set(row.internalName, row);
    }
  }
  return { bySourceId, byInternalName };
}

function coalesceTraceValue(row, fallback, camelKey, snakeKey) {
  return row?.[camelKey] ?? row?.[snakeKey] ?? fallback?.[camelKey] ?? fallback?.[snakeKey] ?? null;
}

function buildTraceableRelationFields(row, fallback = null) {
  const relationRecordKey = row?.recordKey ?? row?.record_key ?? null;
  const sourceProvider = coalesceTraceValue(row, fallback, 'sourceProvider', 'source_provider');
  const sourcePage = coalesceTraceValue(row, fallback, 'sourcePage', 'source_page');
  const sourceRevisionTimestamp = coalesceTraceValue(
    row,
    fallback,
    'sourceRevisionTimestamp',
    'source_revision_timestamp'
  );

  if (relationRecordKey == null && sourceProvider == null && sourcePage == null && sourceRevisionTimestamp == null) {
    return {};
  }

  return {
    relationRecordKey,
    ...(sourceProvider == null ? {} : { sourceProvider }),
    ...(sourcePage == null ? {} : { sourcePage }),
    ...(sourceRevisionTimestamp == null ? {} : { sourceRevisionTimestamp })
  };
}

function appendMappedValue(map, key, value) {
  if (key == null || key === '') return;
  const normalizedKey = String(key);
  if (!map.has(normalizedKey)) {
    map.set(normalizedKey, []);
  }
  map.get(normalizedKey).push(value);
}

function sourceProjectileKeys(row) {
  return [
    row?.projectileInternalName,
    row?.projectileSourceId == null ? null : `source:${Number(row.projectileSourceId)}`
  ].filter((key) => key != null && key !== '');
}

function projectionProjectileKeys(row) {
  return [
    row?.internalName,
    row?.sourceId == null ? null : `source:${Number(row.sourceId)}`
  ].filter((key) => key != null && key !== '');
}

function collectMappedValues(map, keys) {
  const seen = new Set();
  const values = [];
  for (const key of keys) {
    for (const value of map.get(String(key)) ?? []) {
      if (seen.has(value)) continue;
      seen.add(value);
      values.push(value);
    }
  }
  return values;
}

function displaySortValue(value) {
  return String(value ?? '').toLocaleLowerCase('en-US');
}

function compareProjectionSummary(left, right) {
  const leftName = displaySortValue(left.name ?? left.itemName ?? left.npcName);
  const rightName = displaySortValue(right.name ?? right.itemName ?? right.npcName);
  if (leftName !== rightName) return leftName.localeCompare(rightName);

  const leftInternalName = displaySortValue(left.internalName ?? left.itemInternalName ?? left.npcInternalName);
  const rightInternalName = displaySortValue(right.internalName ?? right.itemInternalName ?? right.npcInternalName);
  if (leftInternalName !== rightInternalName) return leftInternalName.localeCompare(rightInternalName);

  return displaySortValue(left.sourceFactKey).localeCompare(displaySortValue(right.sourceFactKey));
}

function dedupeProjectionSummaries(rows, keyBuilder) {
  const seen = new Set();
  return rows
    .filter(Boolean)
    .filter((row) => {
      const key = keyBuilder(row);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(compareProjectionSummary);
}

function appendProjectionSummary(map, key, row, keyBuilder) {
  if (key == null || key === '') return;
  const normalizedKey = String(key);
  const current = map.get(normalizedKey) ?? [];
  current.push(row);
  map.set(normalizedKey, dedupeProjectionSummaries(current, keyBuilder));
}

function projectionItemForRelation(relation, itemIndexes) {
  const sourceId = toNullableNumber(relation?.itemSourceId);
  return (sourceId == null ? null : itemIndexes.bySourceId.get(sourceId))
    ?? itemIndexes.byInternalName.get(relation?.itemInternalName)
    ?? null;
}

function projectionNpcForRelation(relation, npcIndexes) {
  const sourceId = toNullableNumber(relation?.npcSourceId);
  return (sourceId == null ? null : npcIndexes.bySourceId.get(sourceId))
    ?? npcIndexes.byInternalName.get(relation?.npcInternalName)
    ?? null;
}

function itemRelationKeys(relation) {
  return [
    relation?.itemInternalName,
    relation?.itemSourceId == null ? null : `source:${Number(relation.itemSourceId)}`
  ].filter((key) => key != null && key !== '');
}

function npcRelationKeys(relation) {
  return [
    relation?.npcInternalName,
    relation?.npcSourceId == null ? null : `source:${Number(relation.npcSourceId)}`
  ].filter((key) => key != null && key !== '');
}

function buffRelationKeys(relation) {
  return [
    relation?.buffInternalName,
    relation?.buffSourceId == null ? null : `source:${Number(relation.buffSourceId)}`
  ].filter((key) => key != null && key !== '');
}

function projectionBuffKeys(row) {
  return [
    row?.internalName,
    row?.sourceId == null ? null : `source:${Number(row.sourceId)}`
  ].filter((key) => key != null && key !== '');
}

function buildSourceNpcSummary(relation, projectionNpc, relationType) {
  return {
    relationType,
    npcId: projectionNpc?.id ?? toNullableNumber(relation.npcSourceId),
    npcSourceId: toNullableNumber(relation.npcSourceId),
    npcInternalName: relation.npcInternalName ?? projectionNpc?.internalName ?? null,
    npcName: relation.npcName ?? projectionNpc?.name ?? null,
    npcNameZh: projectionNpc?.nameZh ?? null,
    npcImageUrl: projectionNpc?.imageUrl ?? null,
    chanceText: relation.chanceText ?? null,
    quantityText: relation.quantityText ?? null,
    priceText: relation.priceText ?? null,
    conditionText: resolveProjectionConditionText(relation),
    sourceFactKey: relation.sourceFactKey ?? null,
    ...buildTraceableRelationFields(relation)
  };
}

function buildBuffSourceItemSummary(relation, projectionItem) {
  const itemSourceId = toNullableNumber(relation.itemSourceId);
  const itemInternalName = relation.itemInternalName ?? projectionItem?.internalName ?? null;
  return {
    itemId: projectionItem?.id ?? itemSourceId,
    sourceId: itemSourceId ?? projectionItem?.id ?? null,
    internalName: itemInternalName,
    itemInternalName,
    name: relation.itemName ?? projectionItem?.name ?? itemInternalName,
    nameZh: projectionItem?.nameZh ?? null,
    imageUrl: projectionItem?.image ?? null,
    source: 'buff-page-causes',
    sourceKind: 'item',
    sourceSection: relation.sourceSection ?? 'From item',
    relationType: relation.relationType ?? 'buff_source_item',
    buffTime: toNullableNumber(relation.durationTicks),
    chanceText: relation.chanceText ?? null,
    conditions: relation.conditions ?? null,
    ...buildTraceableRelationFields(relation)
  };
}

function buildBuffInflictingNpcSummary(relation, projectionNpc) {
  const npcSourceId = toNullableNumber(relation.npcSourceId);
  const npcInternalName = relation.npcInternalName ?? projectionNpc?.internalName ?? null;
  return {
    npcId: projectionNpc?.id ?? npcSourceId,
    sourceId: npcSourceId ?? projectionNpc?.sourceId ?? null,
    internalName: npcInternalName,
    npcInternalName,
    name: relation.npcName ?? projectionNpc?.name ?? npcInternalName,
    nameZh: projectionNpc?.nameZh ?? null,
    imageUrl: projectionNpc?.imageUrl ?? null,
    source: 'buff-page-causes',
    sourceKind: 'enemy',
    sourceSection: relation.sourceSection ?? 'From enemy',
    relationType: relation.relationType ?? 'inflicts',
    buffTime: toNullableNumber(relation.durationTicks),
    chanceText: relation.chanceText ?? null,
    conditions: relation.conditions ?? null,
    ...buildTraceableRelationFields(relation)
  };
}

function buildNpcItemSummary(relation, projectionItem, relationType) {
  return {
    relationType,
    itemId: projectionItem?.id ?? toNullableNumber(relation.itemSourceId),
    itemSourceId: toNullableNumber(relation.itemSourceId) ?? projectionItem?.id ?? null,
    itemInternalName: relation.itemInternalName ?? projectionItem?.internalName ?? null,
    itemName: relation.itemName ?? projectionItem?.name ?? null,
    itemNameZh: projectionItem?.nameZh ?? null,
    itemImageUrl: projectionItem?.image ?? null,
    chanceText: relation.chanceText ?? null,
    quantityText: relation.quantityText ?? null,
    priceText: relation.priceText ?? null,
    conditionText: resolveProjectionConditionText(relation),
    sourceFactKey: relation.sourceFactKey ?? null,
    ...buildTraceableRelationFields(relation)
  };
}

function buildNpcSourceItemRows(raw, npcRow) {
  const rows = Array.isArray(raw?.sourceItems) ? [...raw.sourceItems] : [];
  const npcKey = npcRow?.internalName ?? npcRow?.internal_name ?? npcRow?.sourceId ?? npcRow?.source_id ?? 'unknown';
  const bannerSourceId = toNullableNumber(raw?.banner ?? raw?.bannerSourceItemId ?? raw?.banner_source_item_id);
  if (bannerSourceId != null && bannerSourceId > 0) {
    rows.push({
      relationType: 'banner',
      itemSourceId: bannerSourceId,
      conditionText: 'NPC banner item',
      sourceFactKey: `npc-source-item:banner:${npcKey}:${bannerSourceId}`
    });
  }
  const catchSourceId = toNullableNumber(raw?.catchItem ?? raw?.catchSourceItemId ?? raw?.catch_item ?? raw?.catch_source_item_id);
  if (catchSourceId != null && catchSourceId > 0) {
    rows.push({
      relationType: 'catch',
      itemSourceId: catchSourceId,
      conditionText: 'Caught NPC item',
      sourceFactKey: `npc-source-item:catch:${npcKey}:${catchSourceId}`
    });
  }
  return rows;
}

function buildNpcSourceItems(raw, itemIndexes, npcRow) {
  const rows = buildNpcSourceItemRows(raw, npcRow);
  return dedupeProjectionSummaries(
    rows.map((sourceItem) => {
      const sourceId = toNullableNumber(sourceItem.itemSourceId ?? sourceItem.itemId ?? sourceItem.sourceId);
      const projectionItem = (sourceId == null ? null : itemIndexes.bySourceId.get(sourceId))
        ?? itemIndexes.byInternalName.get(sourceItem.itemInternalName ?? sourceItem.internalName)
        ?? null;
      return {
        relationType: sourceItem.relationType ?? null,
        itemId: projectionItem?.id ?? sourceId,
        itemSourceId: sourceId ?? projectionItem?.id ?? null,
        itemInternalName: sourceItem.itemInternalName ?? sourceItem.internalName ?? projectionItem?.internalName ?? null,
        itemName: sourceItem.itemName ?? sourceItem.name ?? projectionItem?.name ?? null,
        itemNameZh: projectionItem?.nameZh ?? null,
        itemImageUrl: projectionItem?.image ?? null,
        conditionText: sourceItem.conditionText ?? sourceItem.conditions ?? null,
        sourceFactKey: sourceItem.sourceFactKey ?? null,
        ...buildTraceableRelationFields(sourceItem, npcRow)
      };
    }),
    (row) => JSON.stringify([row.relationType, row.itemInternalName, row.sourceFactKey])
  );
}

const ARMOR_SET_IMAGE_ALIASES = new Map([
  ['ArmorSetBonus.HallowedSummoner', 'ArmorSetBonus.Hallowed']
]);

function pickArmorSetImageUrl(rows, role, managedImageUrlPrefixes = []) {
  const candidates = rows
    .filter((row) => row?.imageRole === role)
    .sort((left, right) => comparePreferredImageRows(left, right, managedImageUrlPrefixes));
  return resolveProjectedImageUrl(candidates[0], managedImageUrlPrefixes);
}

function findArmorSetImageRows(row, imagesByRecordKey, imagesByTextKey) {
  const directRows = imagesByRecordKey.get(row.recordKey) ?? [];
  if (directRows.length) return directRows;
  const textKeyRows = imagesByTextKey.get(row.textKey) ?? [];
  if (textKeyRows.length) return textKeyRows;
  const aliasTextKey = ARMOR_SET_IMAGE_ALIASES.get(row.textKey);
  return aliasTextKey ? (imagesByTextKey.get(aliasTextKey) ?? []) : [];
}

function normalizeImageComparable(value) {
  return String(value ?? '')
    .replace(/\.[^.]+$/, '')
    .replace(/[^A-Za-z0-9]+/g, '')
    .toLowerCase();
}

function findArmorSetPartImageUrl(item, images, managedImageUrlPrefixes = []) {
  const keys = [
    normalizeImageComparable(item?.itemInternalName),
    normalizeImageComparable(item?.itemName)
  ].filter(Boolean);
  if (!keys.length) return null;
  const candidates = images
    .filter((row) => row?.imageRole === 'part')
    .sort((left, right) => comparePreferredImageRows(left, right, managedImageUrlPrefixes));
  for (const image of candidates) {
    const imageKey = normalizeImageComparable(image.sourceFileTitle);
    if (keys.some((key) => imageKey === key || imageKey.includes(key))) {
      return resolveProjectedImageUrl(image, managedImageUrlPrefixes);
    }
  }
  return null;
}

function displayArmorSetSourceKey(row, raw) {
  if (raw.pageTitle) return raw.pageTitle;
  const textKey = row.textKey ?? null;
  if (typeof textKey === 'string' && textKey.startsWith('WikiArmorSet.')) {
    return textKey.slice('WikiArmorSet.'.length);
  }
  return textKey;
}

function resolveProjectionConditionText(relation = {}) {
  return relation.conditionSourceText ?? normalizeProjectionConditionFallback(relation.conditions);
}

function normalizeProjectionConditionFallback(value) {
  const text = typeof value === 'string' ? value.trim() : null;
  if (!text) return null;
  if (/^normal mode row$/i.test(text)) return null;
  return text;
}

function compareBossProjectionEntries(left, right) {
  const leftName = displaySortValue(left.name ?? left.itemName ?? left.targetName);
  const rightName = displaySortValue(right.name ?? right.itemName ?? right.targetName);
  if (leftName !== rightName) return leftName.localeCompare(rightName);
  return displaySortValue(left.internalName ?? left.itemInternalName ?? left.targetKey)
    .localeCompare(displaySortValue(right.internalName ?? right.itemInternalName ?? right.targetKey));
}

function dedupeBossProjectionEntries(rows, keyBuilder) {
  const seen = new Set();
  return rows
    .filter(Boolean)
    .filter((row) => {
      const key = keyBuilder(row);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(compareBossProjectionEntries);
}

function firstManagedBossImage(...values) {
  return values.find((value) => value != null) ?? null;
}

function bossManagedImageUrlPrefixes(managedImageUrlPrefixes = []) {
  return [...new Set([...(Array.isArray(managedImageUrlPrefixes) ? managedImageUrlPrefixes : []), ...BOSS_MANAGED_IMAGE_URL_PREFIXES])];
}

export function buildProjectionPayload({
  relationItems = [],
  relationItemImages = [],
  relationItemRarities = [],
  itemNumericOverrides = [],
  itemRarityOverrides = [],
  itemTextOverrides = [],
  relationNpcs = [],
  relationNpcImages = [],
  relationProjectiles = [],
  relationProjectileImages = [],
  itemNpcShopRelations = [],
  itemNpcLootRelations = [],
  itemProjectileRelations = [],
  npcProjectileRelations = [],
  itemBuffRelations = [],
  npcBuffRelations = [],
  relationBosses = [],
  bossItemRewardRelations = [],
  bossEffectRelations = [],
  relationBuffs = [],
  relationBuffImages = [],
  relationArmorSets = [],
  relationArmorSetItems = [],
  relationArmorSetImages = [],
  relationArmorAttributeRows = [],
  relationEquipmentEffectAttributes = [],
  managedImageUrlPrefixes = []
} = {}) {
  const itemImages = buildImageIndex(relationItemImages, 'itemInternalName', managedImageUrlPrefixes);
  const itemRarities = new Map(
    relationItemRarities
      .filter((row) => row?.id != null)
      .map((row) => [Number(row.id), row])
  );
  const rarityOverrides = new Map(
    itemRarityOverrides
      .filter((row) => row?.itemInternalName && row?.rarityId != null)
      .map((row) => [row.itemInternalName, Number(row.rarityId)])
  );
  const numericOverrides = new Map(
    itemNumericOverrides
      .filter((row) => row?.itemInternalName)
      .map((row) => [row.itemInternalName, row])
  );
  const textOverrides = new Map(
    itemTextOverrides
      .filter((row) => row?.itemInternalName)
      .map((row) => [row.itemInternalName, row])
  );
  const npcImages = buildImageIndex(relationNpcImages, 'npcInternalName', managedImageUrlPrefixes);
  const projectileImages = buildImageIndex(relationProjectileImages, 'projectileInternalName', managedImageUrlPrefixes);
  const buffImages = buildImageIndex(relationBuffImages, 'buffInternalName', managedImageUrlPrefixes);
  const armorSetItemsByRecordKey = buildRowsByKey(relationArmorSetItems, 'armorSetRecordKey');
  const armorSetImagesByRecordKey = buildRowsByKey(relationArmorSetImages, 'armorSetRecordKey');
  const armorSetImagesByTextKey = buildRowsByKey(relationArmorSetImages, 'textKey');

  const projectionItems = relationItems.map((row) => {
    const raw = parseJsonObject(row.rawJson);
    const image = resolveProjectedImageUrl(itemImages.get(row.internalName), managedImageUrlPrefixes);
    const numericOverride = numericOverrides.get(row.internalName) ?? null;
    const textOverride = textOverrides.get(row.internalName) ?? null;
    const rareRaw = toNullableNumber(row.rareRaw ?? raw.rare);
    const valueRaw = toNullableNumber(row.valueRaw ?? raw.value);
    return {
      id: toNullableNumber(row.sourceId),
      relationRecordKey: row.recordKey,
      name: row.englishName ?? row.internalName ?? null,
      nameZh: row.nameZh ?? null,
      internalName: row.internalName ?? null,
      slug: toSlug(row.internalName),
      image,
      categoryId: null,
      description: null,
      descriptionZh: textOverride?.descriptionZh ?? null,
      damage: toNullableNumber(coalesceDefined(numericOverride?.damageValue, row.combatValue, raw.damage)),
      defense: toNullableNumber(coalesceDefined(numericOverride?.defenseValue, row.defenseValue, raw.defense)),
      knockback: toNullableNumber(coalesceDefined(numericOverride?.knockbackValue, raw.knockBack)),
      useTime: toNullableNumber(coalesceDefined(numericOverride?.useTime, row.useTime, raw.useTime)),
      width: toNullableNumber(row.width),
      height: toNullableNumber(row.height),
      buy: toNullableNumber(coalesceDefined(numericOverride?.buyValue, row.majorValue, valueRaw)),
      sell: toNullableNumber(coalesceDefined(numericOverride?.sellValue, row.sellRaw)),
      tooltip: null,
      tooltipZh: textOverride?.tooltipZh ?? null,
      sourceProvider: row.sourceProvider ?? null,
      sourcePage: row.sourcePage ?? null,
      sourceRevisionTimestamp: row.sourceRevisionTimestamp ?? null,
      lastSyncedAt: null,
      rarityId: rareRaw != null && itemRarities.has(rareRaw)
        ? rareRaw
        : (rarityOverrides.get(row.internalName) ?? null),
      gamePeriodId: null,
      gameModelId: null,
      isStackable: toFlag(toNullableNumber(row.stackSize) > 1),
      stackSize: toNullableNumber(row.stackSize),
      sourceNpcsJson: JSON.stringify([]),
      status: 1,
      deleted: 0,
      createdAt: null,
      updatedAt: null
    };
  });
  const projectionItemBySourceId = new Map(
    projectionItems
      .filter((row) => row?.id != null)
      .map((row) => [Number(row.id), row])
  );
  const projectionItemIndexes = buildProjectionRowIndexes(projectionItems);

  const projectionNpcs = relationNpcs.map((row) => {
    const raw = parseJsonObject(row.rawJson);
    const flags = parseJsonObject(row.flagsJson);
    const image = npcImages.get(row.internalName);
    return {
      id: toNullableNumber(row.sourceId),
      relationRecordKey: row.recordKey,
      gameId: toNullableNumber(row.sourceId),
      sourceId: toNullableNumber(row.sourceId),
      internalName: row.internalName ?? null,
      name: row.englishName ?? row.internalName ?? null,
      nameZh: row.nameZh ?? null,
      subName: null,
      subNameZh: row.subNameZh ?? null,
      imageUrl: resolveProjectedImageUrl(image, managedImageUrlPrefixes),
      categoryId: null,
      gamePeriodId: null,
      gameModelId: null,
      isBoss: toFlag(flags.boss),
      bossGroupId: null,
      bossRole: null,
      isFriendly: toFlag(flags.friendly),
      isTownNpc: toFlag(flags.townNpc),
      behaviorNotes: null,
      netId: toNullableNumber(raw.netID),
      npcType: toNullableNumber(raw.type),
      aiStyle: toNullableNumber(raw.aiStyle),
      damage: toNullableNumber(raw.damage ?? row.combatValue),
      defense: toNullableNumber(raw.defense ?? row.defenseValue),
      lifeMax: toNullableNumber(raw.lifeMax),
      knockBackResist: toNullableNumber(raw.knockBackResist),
      width: toNullableNumber(row.width),
      height: toNullableNumber(row.height),
      scale: toNullableNumber(raw.scale),
      value: toNullableNumber(raw.value ?? row.majorValue),
      bannerSourceItemId: toNullableNumber(raw.banner),
      bannerItemId: null,
      catchSourceItemId: toNullableNumber(raw.catchItem),
      catchItemId: null,
      buffImmune: raw.buffImmune ?? null,
      rawJson: row.rawJson ?? null,
      lootItemsJson: JSON.stringify([]),
      shopItemsJson: JSON.stringify([]),
      sourceItemsJson: JSON.stringify(buildNpcSourceItems(raw, projectionItemIndexes, row)),
      status: 1,
      deleted: 0,
      createdAt: null,
      updatedAt: null
    };
  });
  const projectionNpcIndexes = buildProjectionRowIndexes(projectionNpcs);

  const sourceNpcsByItemKey = new Map();
  const lootItemsByNpcKey = new Map();
  const shopItemsByNpcKey = new Map();

  for (const relation of itemNpcLootRelations) {
    const projectionItem = projectionItemForRelation(relation, projectionItemIndexes);
    const projectionNpc = projectionNpcForRelation(relation, projectionNpcIndexes);
    const sourceNpcSummary = buildSourceNpcSummary(relation, projectionNpc, 'drop');
    for (const key of itemRelationKeys(relation)) {
      appendProjectionSummary(
        sourceNpcsByItemKey,
        key,
        sourceNpcSummary,
        (row) => JSON.stringify([row.relationType, row.npcInternalName, row.sourceFactKey])
      );
    }

    const lootItemSummary = buildNpcItemSummary(relation, projectionItem, 'loot');
    for (const key of npcRelationKeys(relation)) {
      appendProjectionSummary(
        lootItemsByNpcKey,
        key,
        lootItemSummary,
        (row) => JSON.stringify([row.relationType, row.itemInternalName, row.sourceFactKey])
      );
    }
  }

  for (const relation of itemNpcShopRelations) {
    const projectionItem = projectionItemForRelation(relation, projectionItemIndexes);
    const projectionNpc = projectionNpcForRelation(relation, projectionNpcIndexes);
    const sourceNpcSummary = buildSourceNpcSummary(relation, projectionNpc, 'shop');
    for (const key of itemRelationKeys(relation)) {
      appendProjectionSummary(
        sourceNpcsByItemKey,
        key,
        sourceNpcSummary,
        (row) => JSON.stringify([row.relationType, row.npcInternalName, row.sourceFactKey])
      );
    }

    const shopItemSummary = buildNpcItemSummary(relation, projectionItem, 'shop');
    for (const key of npcRelationKeys(relation)) {
      appendProjectionSummary(
        shopItemsByNpcKey,
        key,
        shopItemSummary,
        (row) => JSON.stringify([row.relationType, row.itemInternalName, row.sourceFactKey])
      );
    }
  }

  for (const row of projectionItems) {
    const values = collectMappedValues(sourceNpcsByItemKey, [
      row.internalName,
      row.id == null ? null : `source:${Number(row.id)}`
    ].filter(Boolean));
    row.sourceNpcsJson = JSON.stringify(dedupeProjectionSummaries(
      values,
      (entry) => JSON.stringify([entry.relationType, entry.npcInternalName, entry.sourceFactKey])
    ));
  }

  for (const row of projectionNpcs) {
    const npcKeys = [
      row.internalName,
      row.sourceId == null ? null : `source:${Number(row.sourceId)}`
    ].filter(Boolean);
    row.lootItemsJson = JSON.stringify(dedupeProjectionSummaries(
      collectMappedValues(lootItemsByNpcKey, npcKeys),
      (entry) => JSON.stringify([entry.relationType, entry.itemInternalName, entry.sourceFactKey])
    ));
    row.shopItemsJson = JSON.stringify(dedupeProjectionSummaries(
      collectMappedValues(shopItemsByNpcKey, npcKeys),
      (entry) => JSON.stringify([entry.relationType, entry.itemInternalName, entry.sourceFactKey])
    ));
  }

  const sourceItemsByBuffKey = new Map();
  for (const relation of itemBuffRelations) {
    const projectionItem = projectionItemForRelation(relation, projectionItemIndexes);
    const summary = buildBuffSourceItemSummary(relation, projectionItem);
    for (const key of buffRelationKeys(relation)) {
      appendProjectionSummary(
        sourceItemsByBuffKey,
        key,
        summary,
        (row) => JSON.stringify([row.relationType, row.internalName, row.sourceId])
      );
    }
  }

  const inflictingNpcsByBuffKey = new Map();
  for (const relation of npcBuffRelations) {
    const relationType = String(relation?.relationType ?? 'inflicts').trim().toLowerCase();
    if (relationType !== 'inflicts') {
      continue;
    }
    const projectionNpc = projectionNpcForRelation(relation, projectionNpcIndexes);
    const summary = buildBuffInflictingNpcSummary(relation, projectionNpc);
    for (const key of buffRelationKeys(relation)) {
      appendProjectionSummary(
        inflictingNpcsByBuffKey,
        key,
        summary,
        (row) => JSON.stringify([row.relationType, row.internalName, row.sourceId])
      );
    }
  }

  const sourceItemsByProjectileKey = new Map();
  for (const relation of itemProjectileRelations) {
    const itemSourceId = toNullableNumber(relation.itemSourceId);
    const projectionItem = (itemSourceId == null ? null : projectionItemIndexes.bySourceId.get(itemSourceId))
      ?? projectionItemIndexes.byInternalName.get(relation.itemInternalName)
      ?? null;
    const summary = {
      itemId: projectionItem?.id ?? itemSourceId,
      sourceId: itemSourceId,
      internalName: relation.itemInternalName ?? null,
      name: relation.itemName ?? projectionItem?.name ?? null,
      nameZh: projectionItem?.nameZh ?? null,
      image: projectionItem?.image ?? null,
      relationType: relation.relationType ?? null
    };
    for (const key of sourceProjectileKeys(relation)) {
      appendMappedValue(sourceItemsByProjectileKey, key, summary);
    }
  }

  const sourceNpcsByProjectileKey = new Map();
  for (const relation of npcProjectileRelations) {
    const npcSourceId = toNullableNumber(relation.npcSourceId);
    const projectionNpc = (npcSourceId == null ? null : projectionNpcIndexes.bySourceId.get(npcSourceId))
      ?? projectionNpcIndexes.byInternalName.get(relation.npcInternalName)
      ?? null;
    const summary = {
      npcId: projectionNpc?.id ?? npcSourceId,
      sourceId: npcSourceId,
      internalName: relation.npcInternalName ?? null,
      name: relation.npcName ?? projectionNpc?.name ?? null,
      nameZh: projectionNpc?.nameZh ?? null,
      image: projectionNpc?.imageUrl ?? null,
      relationType: relation.relationType ?? null
    };
    for (const key of sourceProjectileKeys(relation)) {
      appendMappedValue(sourceNpcsByProjectileKey, key, summary);
    }
  }

  const projectionProjectiles = relationProjectiles.map((row) => {
    const raw = parseJsonObject(row.rawJson);
    const flags = parseJsonObject(row.flagsJson);
    const image = projectileImages.get(row.internalName);
    const projectileKeys = projectionProjectileKeys(row);
    const sourceItems = collectMappedValues(sourceItemsByProjectileKey, projectileKeys);
    const sourceNpcs = collectMappedValues(sourceNpcsByProjectileKey, projectileKeys);
    return {
      id: toNullableNumber(row.sourceId),
      relationRecordKey: row.recordKey,
      sourceId: toNullableNumber(row.sourceId),
      internalName: row.internalName ?? null,
      name: row.englishName ?? row.internalName ?? null,
      nameZh: row.nameZh ?? null,
      imageUrl: resolveProjectedImageUrl(image, managedImageUrlPrefixes)
        ?? resolveManagedRawImageUrl(raw, managedImageUrlPrefixes),
      aiStyle: toNullableNumber(raw.aiStyle),
      damage: toNullableNumber(raw.damage ?? row.combatValue),
      knockBack: toNullableNumber(raw.knockBack),
      penetrate: toNullableNumber(raw.penetrate),
      timeLeft: toNullableNumber(raw.timeLeft),
      width: toNullableNumber(row.width),
      height: toNullableNumber(row.height),
      scale: toNullableNumber(raw.scale),
      friendly: toFlag(coalesceDefined(flags.friendly, raw.friendly)),
      hostile: toFlag(coalesceDefined(flags.hostile, raw.hostile)),
      tileCollide: toFlag(coalesceDefined(flags.tileCollide, raw.tileCollide)),
      sourceItemsJson: JSON.stringify(sourceItems),
      sourceNpcsJson: JSON.stringify(sourceNpcs),
      rawJson: row.rawJson ?? null,
      status: 1,
      deleted: 0,
      createdAt: null,
      updatedAt: null
    };
  });

  const projectionBuffs = relationBuffs.map((row) => {
    const sourceItems = dedupeProjectionSummaries(
      collectMappedValues(sourceItemsByBuffKey, projectionBuffKeys(row)),
      (entry) => JSON.stringify([entry.relationType, entry.internalName, entry.sourceId])
    );
    const inflictingNpcs = dedupeProjectionSummaries(
      collectMappedValues(inflictingNpcsByBuffKey, projectionBuffKeys(row)),
      (entry) => JSON.stringify([entry.relationType, entry.internalName, entry.sourceId])
    );
    return {
      id: toNullableNumber(row.sourceId),
      relationRecordKey: row.recordKey,
      sourceId: toNullableNumber(row.sourceId),
      internalName: row.internalName ?? null,
      englishName: row.englishName ?? row.internalName ?? null,
      nameZh: row.nameZh ?? null,
      tooltipEn: row.tooltipEn ?? null,
      tooltipZh: row.tooltipZh ?? null,
      image: resolveProjectedImageUrl(buffImages.get(row.internalName), managedImageUrlPrefixes),
      buffType: row.buffType ?? null,
      sourceItemCount: sourceItems.length,
      immuneNpcCount: toNullableNumber(row.immuneNpcCount),
      sourceItemsJson: JSON.stringify(sourceItems),
      inflictingNpcsJson: JSON.stringify(inflictingNpcs),
      immuneNpcsJson: row.immuneNpcsJson ?? null,
      immuneNpcSampleJson: row.immuneNpcSampleJson ?? null,
      sourceEvidenceJson: row.sourceEvidenceJson ?? null,
      status: 1,
      deleted: 0,
      createdAt: null,
      updatedAt: null
    };
  });

  const bossRewardsByRecordKey = buildRowsByKey(bossItemRewardRelations, 'bossRecordKey');
  const bossEffectsByRecordKey = buildRowsByKey(bossEffectRelations, 'bossRecordKey');

  const projectionBosses = relationBosses.map((row) => {
    const memberInternalNames = [...new Set(
      parseJsonArray(coalesceDefined(row.npcMemberInternalNamesJson, row.npc_member_internal_names_json))
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
    )];
    const matchedNpcInternalName = coalesceDefined(row.npcInternalName, row.npc_internal_name);
    if (memberInternalNames.length === 0 && matchedNpcInternalName) {
      memberInternalNames.push(String(matchedNpcInternalName));
    }

    const memberNpcs = dedupeBossProjectionEntries(
      memberInternalNames.map((internalName) => {
        const projectionNpc = projectionNpcIndexes.byInternalName.get(internalName) ?? null;
        return {
          id: projectionNpc?.id ?? null,
          sourceId: projectionNpc?.sourceId ?? null,
          internalName,
          name: projectionNpc?.name ?? null,
          nameZh: projectionNpc?.nameZh ?? null,
          imageUrl: projectionNpc?.imageUrl ?? null,
        };
      }),
      (entry) => entry.internalName,
    );

    const lootItems = dedupeBossProjectionEntries(
      (bossRewardsByRecordKey.get(coalesceDefined(row.recordKey, row.record_key)) ?? []).map((rewardRow) => {
        const rewardItemInternalName = coalesceDefined(rewardRow.itemInternalName, rewardRow.item_internal_name);
        const projectionItem = projectionItemIndexes.byInternalName.get(rewardItemInternalName) ?? null;
        return {
          itemId: projectionItem?.id ?? null,
          itemInternalName: rewardItemInternalName ?? null,
          itemName: projectionItem?.name ?? null,
          itemNameZh: projectionItem?.nameZh ?? null,
          itemImageUrl: projectionItem?.image ?? null,
          rewardSourceType: coalesceDefined(rewardRow.rewardSourceType, rewardRow.reward_source_type) ?? null,
          npcMemberCount: toNullableNumber(coalesceDefined(rewardRow.npcMemberCount, rewardRow.npc_member_count)),
          chanceTexts: parseJsonArray(coalesceDefined(rewardRow.chanceTextsJson, rewardRow.chance_texts_json)),
          quantityTexts: parseJsonArray(coalesceDefined(rewardRow.quantityTextsJson, rewardRow.quantity_texts_json)),
        };
      }),
      (entry) => JSON.stringify([entry.itemInternalName, entry.rewardSourceType]),
    );

    const effects = dedupeBossProjectionEntries(
      (bossEffectsByRecordKey.get(coalesceDefined(row.recordKey, row.record_key)) ?? []).map((effectRow) => ({
        effectType: coalesceDefined(effectRow.effectType, effectRow.effect_type) ?? null,
        targetType: coalesceDefined(effectRow.targetType, effectRow.target_type) ?? null,
        targetKey: coalesceDefined(effectRow.targetKey, effectRow.target_key) ?? null,
        targetName: coalesceDefined(effectRow.targetName, effectRow.target_name) ?? null,
        evidenceText: coalesceDefined(effectRow.evidenceText, effectRow.evidence_text) ?? null,
      })),
      (entry) => JSON.stringify([entry.effectType, entry.targetType, entry.targetKey]),
    );

    const matchedNpc = matchedNpcInternalName ? projectionNpcIndexes.byInternalName.get(matchedNpcInternalName) ?? null : null;
    const bossManagedPrefixes = bossManagedImageUrlPrefixes(managedImageUrlPrefixes);
    const bossTitleEn = coalesceDefined(row.bossTitleEn, row.boss_title_en, row.pageTitleEn, row.page_title_en);
    const bossTitleZh = coalesceDefined(row.bossTitleZh, row.boss_title_zh, row.pageTitleZh, row.page_title_zh);

    return {
      id: stablePositiveBigIntId(coalesceDefined(row.recordKey, row.record_key, bossTitleEn)),
      relationRecordKey: coalesceDefined(row.recordKey, row.record_key) ?? null,
      code: toBossCode(bossTitleEn),
      nameEn: bossTitleEn ?? coalesceDefined(row.npcEnglishName, row.npc_english_name) ?? null,
      nameZh: bossTitleZh ?? null,
      pageTitleEn: coalesceDefined(row.pageTitleEn, row.page_title_en) ?? null,
      pageTitleZh: coalesceDefined(row.pageTitleZh, row.page_title_zh) ?? null,
      bossType: coalesceDefined(row.groupType, row.group_type) ?? null,
      progressionOrder: toNullableNumber(coalesceDefined(row.progressionOrder, row.progression_order)),
      orderWithinGroup: toNullableNumber(coalesceDefined(row.orderWithinGroup, row.order_within_group)),
      imageUrl: firstManagedBossImage(
        resolveManagedProjectionImageValue(coalesceDefined(row.imageUrl, row.image_url), bossManagedPrefixes),
        matchedNpc?.imageUrl ?? null,
        memberNpcs.find((entry) => entry.imageUrl)?.imageUrl ?? null,
      ),
      npcSourceId: toNullableNumber(coalesceDefined(row.npcSourceId, row.npc_source_id)),
      npcInternalName: matchedNpcInternalName ?? null,
      npcMatchStatus: coalesceDefined(row.npcMatchStatus, row.npc_match_status) ?? null,
      npcMatchCount: toNullableNumber(coalesceDefined(row.npcMatchCount, row.npc_match_count)),
      memberCount: memberNpcs.length,
      memberNpcsJson: JSON.stringify(memberNpcs),
      lootItemCount: lootItems.length,
      lootItemsJson: JSON.stringify(lootItems),
      effectCount: effects.length,
      effectsJson: JSON.stringify(effects),
      notes: row.notes ?? null,
      sourceProvider: coalesceDefined(row.sourceProvider, row.source_provider) ?? null,
      sourcePage: coalesceDefined(row.sourcePage, row.source_page) ?? null,
      sourceRevisionTimestamp: coalesceDefined(row.sourceRevisionTimestamp, row.source_revision_timestamp) ?? null,
      status: 1,
      deleted: 0,
      createdAt: null,
      updatedAt: null,
    };
  });

  const projectionArmorSets = relationArmorSets.map((row) => {
    const raw = parseJsonObject(row.rawJson);
    const setItems = (armorSetItemsByRecordKey.get(row.recordKey) ?? [])
      .slice()
      .sort((left, right) => {
        const variantDelta = Number(left.setVariantIndex ?? 0) - Number(right.setVariantIndex ?? 0);
        if (variantDelta !== 0) return variantDelta;
        return Number(left.partIndex ?? 0) - Number(right.partIndex ?? 0);
      });
    const images = findArmorSetImageRows(row, armorSetImagesByRecordKey, armorSetImagesByTextKey);
    const currentItemIds = [...new Set(
      setItems
        .map((item) => toNullableNumber(item.itemSourceId))
        .filter((id) => id != null && id > 0)
    )];
    const relatedItems = setItems.map((item) => {
      const sourceId = toNullableNumber(item.itemSourceId);
      const projectionItem = sourceId == null ? null : projectionItemBySourceId.get(sourceId);
      return {
        id: projectionItem?.id ?? sourceId ?? null,
        itemId: projectionItem?.id ?? sourceId ?? null,
        sourceId,
        internalName: item.itemInternalName ?? null,
        name: item.itemName ?? null,
        nameZh: projectionItem?.nameZh ?? null,
        image: resolveManagedProjectionImageValue(projectionItem?.image, managedImageUrlPrefixes)
          ?? findArmorSetPartImageUrl(item, images, managedImageUrlPrefixes),
        partRole: item.partRole ?? null,
        slotType: item.slotType ?? null,
        equipmentSlotId: toNullableNumber(item.equipmentSlotId),
        setVariantIndex: toNullableNumber(item.setVariantIndex) ?? 0,
        partIndex: toNullableNumber(item.partIndex) ?? 0
      };
    });
    const hasUnresolved = setItems.some((item) => item.reviewStatus === 'unresolved' || !item.itemInternalName);
    const relationId = toNullableNumber(row.id);

    return {
      id: relationId != null && relationId > 0 ? relationId : stablePositiveBigIntId(row.textKey ?? row.recordKey),
      relationRecordKey: row.recordKey,
      textKey: row.textKey ?? null,
      entityType: raw.entityType ?? 'armor_set',
      compositionKind: raw.compositionKind ?? 'traditional_set',
      name: raw.nameZh ?? raw.nameEn ?? raw.pageTitle ?? row.textKey ?? null,
      nameZh: raw.nameZh ?? raw.nameEn ?? raw.pageTitle ?? row.textKey ?? null,
      nameEn: raw.nameEn ?? raw.pageTitle ?? row.textKey ?? null,
      sourceKey: displayArmorSetSourceKey(row, raw),
      benefitExpression: row.benefitExpression ?? null,
      benefitZh: raw.effectText ?? row.benefitExpression ?? null,
      benefitEn: raw.effectTextEn ?? raw.effectText ?? row.benefitExpression ?? null,
      primaryPart: row.primaryPart ?? null,
      setCount: toNullableNumber(row.setCount),
      uniqueItemCount: toNullableNumber(row.uniqueItemCount),
      setsJson: row.setsJson ?? null,
      uniqueItemIdsJson: row.uniqueItemIdsJson ?? null,
      currentItemIdsJson: JSON.stringify(currentItemIds),
      relatedItemsJson: JSON.stringify(relatedItems),
      maleImages: pickArmorSetImageUrl(images, 'male', managedImageUrlPrefixes) ?? null,
      femaleImages: pickArmorSetImageUrl(images, 'female', managedImageUrlPrefixes) ?? null,
      specialImages: pickArmorSetImageUrl(images, 'demo', managedImageUrlPrefixes)
        ?? pickArmorSetImageUrl(images, 'other', managedImageUrlPrefixes)
        ?? null,
      mappingStatus: hasUnresolved ? 'partial' : 'mapped',
      sourceProvider: row.sourceProvider ?? null,
      sourcePage: row.sourcePage ?? null,
      sourceRevisionTimestamp: row.sourceRevisionTimestamp ?? null,
      status: 1,
      deleted: 0,
      createdAt: null,
      updatedAt: null
    };
  });

  const armorSetProjectionIdByRecordKey = new Map(
    projectionArmorSets
      .filter((row) => row?.relationRecordKey && row?.id != null)
      .map((row) => [row.relationRecordKey, row.id])
  );
  const projectionEquipmentEffectAttributes = relationEquipmentEffectAttributes
    .slice()
    .sort((left, right) => {
      const leftKey = String(coalesceDefined(left.recordKey, left.record_key) ?? '');
      const rightKey = String(coalesceDefined(right.recordKey, right.record_key) ?? '');
      return leftKey.localeCompare(rightKey);
    })
    .map((row, index) => {
      const ownerKind = coalesceDefined(row.ownerKind, row.owner_kind) ?? null;
      const ownerRecordKey = coalesceDefined(row.ownerRecordKey, row.owner_record_key) ?? null;
      const ownerProjectionId = ownerKind === 'armor_set'
        ? armorSetProjectionIdByRecordKey.get(ownerRecordKey)
        : null;
      return {
        id: index + 1,
        relationRecordKey: coalesceDefined(row.recordKey, row.record_key) ?? null,
        ownerKind,
        ownerId: toNullableNumber(ownerProjectionId ?? coalesceDefined(row.ownerId, row.owner_id)),
        ownerKey: coalesceDefined(row.ownerKey, row.owner_key) ?? null,
        sourceKind: coalesceDefined(row.sourceKind, row.source_kind) ?? null,
        sourceLine: coalesceDefined(row.sourceLine, row.source_line) ?? null,
        sourceLineIndex: toNullableNumber(coalesceDefined(row.sourceLineIndex, row.source_line_index)),
        effectIndex: toNullableNumber(coalesceDefined(row.effectIndex, row.effect_index)),
        applyScope: coalesceDefined(row.applyScope, row.apply_scope) ?? null,
        variantLabel: coalesceDefined(row.variantLabel, row.variant_label) ?? null,
        itemInternalName: coalesceDefined(row.itemInternalName, row.item_internal_name) ?? null,
        slotType: coalesceDefined(row.slotType, row.slot_type) ?? null,
        statKey: coalesceDefined(row.statKey, row.stat_key) ?? null,
        statLabelZh: coalesceDefined(row.statLabelZh, row.stat_label_zh) ?? null,
        classScope: coalesceDefined(row.classScope, row.class_scope) ?? null,
        operation: coalesceDefined(row.operation, row.operation) ?? null,
        valueDecimal: toNullableNumber(coalesceDefined(row.valueDecimal, row.value_decimal)),
        valueMaxDecimal: toNullableNumber(coalesceDefined(row.valueMaxDecimal, row.value_max_decimal)),
        unit: coalesceDefined(row.unit, row.unit) ?? null,
        conditionText: coalesceDefined(row.conditionText, row.condition_text) ?? null,
        rawText: coalesceDefined(row.rawText, row.raw_text) ?? null,
        parseStatus: coalesceDefined(row.parseStatus, row.parse_status) ?? null,
        confidence: toNullableNumber(coalesceDefined(row.confidence, row.confidence)),
        status: 1,
        deleted: 0,
        createdAt: null,
        updatedAt: null
      };
    });

  const projectionItemArmorAttributes = relationArmorAttributeRows
    .filter((row) => toNullableNumber(coalesceDefined(row.itemId, row.item_id)) != null)
    .slice()
    .sort((left, right) => {
      const leftKey = String(coalesceDefined(left.recordKey, left.record_key) ?? '');
      const rightKey = String(coalesceDefined(right.recordKey, right.record_key) ?? '');
      return leftKey.localeCompare(rightKey);
    })
    .map((row, index) => ({
      id: index + 1,
      relationRecordKey: coalesceDefined(row.recordKey, row.record_key) ?? null,
      itemId: toNullableNumber(coalesceDefined(row.itemId, row.item_id)),
      itemInternalName: coalesceDefined(row.itemInternalName, row.item_internal_name) ?? null,
      itemNameZh: coalesceDefined(row.itemNameZh, row.item_name_zh) ?? null,
      itemPageTitle: coalesceDefined(row.itemPageTitle, row.item_page_title) ?? null,
      itemHref: coalesceDefined(row.itemHref, row.item_href) ?? null,
      sectionCode: coalesceDefined(row.sectionCode, row.section_code) ?? null,
      slotGroup: coalesceDefined(row.slotGroup, row.slot_group) ?? null,
      defenseValue: toNullableNumber(coalesceDefined(row.defenseValue, row.defense_value)),
      rawCellsJson: coalesceDefined(row.rawCellsJson, row.raw_cells_json) ?? null,
      sourceProvider: coalesceDefined(row.sourceProvider, row.source_provider) ?? null,
      sourcePage: coalesceDefined(row.sourcePage, row.source_page) ?? null,
      sourceRevisionTimestamp: coalesceDefined(row.sourceRevisionTimestamp, row.source_revision_timestamp) ?? null,
      status: 1,
      deleted: 0,
      createdAt: null,
      updatedAt: null
    }));

  return {
    projectionItems,
    projectionNpcs,
    projectionBosses,
    projectionProjectiles,
    projectionBuffs,
    projectionArmorSets,
    projectionItemArmorAttributes,
    projectionEquipmentEffectAttributes
  };
}
