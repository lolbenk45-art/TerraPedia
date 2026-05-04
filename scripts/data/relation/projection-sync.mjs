import { isManagedImageUrl } from './managed-image-url-policy.mjs';

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
    conditionText: relation.conditionSourceText ?? relation.conditions ?? null,
    sourceFactKey: relation.sourceFactKey ?? null,
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
    conditionText: relation.conditionSourceText ?? relation.conditions ?? null,
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
  relationBuffs = [],
  relationBuffImages = [],
  relationArmorSets = [],
  relationArmorSetItems = [],
  relationArmorSetImages = [],
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
      imageUrl: resolveProjectedImageUrl(image, managedImageUrlPrefixes),
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

  const projectionBuffs = relationBuffs.map((row) => ({
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
    sourceItemCount: toNullableNumber(row.sourceItemCount),
    immuneNpcCount: toNullableNumber(row.immuneNpcCount),
    sourceItemsJson: row.sourceItemsJson ?? null,
    immuneNpcSampleJson: row.immuneNpcSampleJson ?? null,
    status: 1,
    deleted: 0,
    createdAt: null,
    updatedAt: null
  }));

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

    return {
      id: stablePositiveBigIntId(row.textKey ?? row.recordKey),
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

  return {
    projectionItems,
    projectionNpcs,
    projectionProjectiles,
    projectionBuffs,
    projectionArmorSets
  };
}
