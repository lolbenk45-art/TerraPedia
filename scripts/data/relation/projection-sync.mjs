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

function buildImageIndex(rows = [], entityKey) {
  const index = new Map();
  for (const row of rows) {
    const key = row[entityKey];
    if (!key) continue;
    const current = index.get(key);
    if (!current || Number(row.isPrimary ?? 0) > Number(current.isPrimary ?? 0)) {
      index.set(key, row);
    }
  }
  return index;
}

function resolveWikiImageUrl(imageRow) {
  return imageRow?.originalUrl ?? imageRow?.cachedUrl ?? null;
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

const ARMOR_SET_IMAGE_ALIASES = new Map([
  ['ArmorSetBonus.HallowedSummoner', 'ArmorSetBonus.Hallowed']
]);

function pickArmorSetImageUrl(rows, role) {
  const candidates = rows
    .filter((row) => row?.imageRole === role)
    .sort((left, right) => {
      const primaryDelta = Number(right.isPrimary ?? 0) - Number(left.isPrimary ?? 0);
      if (primaryDelta !== 0) return primaryDelta;
      return Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0);
    });
  return resolveWikiImageUrl(candidates[0]);
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

function findArmorSetPartImageUrl(item, images) {
  const keys = [
    normalizeImageComparable(item?.itemInternalName),
    normalizeImageComparable(item?.itemName)
  ].filter(Boolean);
  if (!keys.length) return null;
  const candidates = images
    .filter((row) => row?.imageRole === 'part')
    .sort((left, right) => Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0));
  for (const image of candidates) {
    const imageKey = normalizeImageComparable(image.sourceFileTitle);
    if (keys.some((key) => imageKey === key || imageKey.includes(key))) {
      return resolveWikiImageUrl(image);
    }
  }
  return null;
}

function wikiItemFileUrl(item) {
  const itemName = item?.itemName ?? item?.name;
  if (typeof itemName !== 'string' || itemName.trim() === '') {
    return null;
  }
  const fileName = `${itemName.trim().replace(/\s+/g, '_')}.png`;
  return `https://terraria.wiki.gg/images/${encodeURIComponent(fileName).replace(/%2F/gi, '/')}`;
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
  relationBuffs = [],
  relationBuffImages = [],
  relationArmorSets = [],
  relationArmorSetItems = [],
  relationArmorSetImages = []
} = {}) {
  const itemImages = buildImageIndex(relationItemImages, 'itemInternalName');
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
  const npcImages = buildImageIndex(relationNpcImages, 'npcInternalName');
  const projectileImages = buildImageIndex(relationProjectileImages, 'projectileInternalName');
  const buffImages = buildImageIndex(relationBuffImages, 'buffInternalName');
  const armorSetItemsByRecordKey = buildRowsByKey(relationArmorSetItems, 'armorSetRecordKey');
  const armorSetImagesByRecordKey = buildRowsByKey(relationArmorSetImages, 'armorSetRecordKey');
  const armorSetImagesByTextKey = buildRowsByKey(relationArmorSetImages, 'textKey');

  const projectionItems = relationItems.map((row) => {
    const raw = parseJsonObject(row.rawJson);
    const image = resolveWikiImageUrl(itemImages.get(row.internalName));
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
      imageUrl: resolveWikiImageUrl(image),
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
      status: 1,
      deleted: 0,
      createdAt: null,
      updatedAt: null
    };
  });

  const projectionProjectiles = relationProjectiles.map((row) => {
    const raw = parseJsonObject(row.rawJson);
    const flags = parseJsonObject(row.flagsJson);
    const image = projectileImages.get(row.internalName);
    return {
      id: toNullableNumber(row.sourceId),
      relationRecordKey: row.recordKey,
      sourceId: toNullableNumber(row.sourceId),
      internalName: row.internalName ?? null,
      name: row.englishName ?? row.internalName ?? null,
      nameZh: row.nameZh ?? null,
      imageUrl: resolveWikiImageUrl(image),
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
    image: buffImages.get(row.internalName)?.cachedUrl ?? null,
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
        image: projectionItem?.image ?? findArmorSetPartImageUrl(item, images) ?? wikiItemFileUrl(item),
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
      maleImages: pickArmorSetImageUrl(images, 'male') ?? null,
      femaleImages: pickArmorSetImageUrl(images, 'female') ?? null,
      specialImages: pickArmorSetImageUrl(images, 'demo') ?? pickArmorSetImageUrl(images, 'other') ?? null,
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
