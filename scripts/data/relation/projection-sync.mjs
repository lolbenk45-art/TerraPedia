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

function toSlug(value) {
  const text = String(value ?? '').trim();
  return text ? text.toLowerCase() : null;
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

export function buildProjectionPayload({
  relationItems = [],
  relationItemImages = [],
  relationItemRarities = [],
  relationNpcs = [],
  relationNpcImages = [],
  relationProjectiles = [],
  relationProjectileImages = [],
  relationBuffs = [],
  relationBuffImages = []
} = {}) {
  const itemImages = buildImageIndex(relationItemImages, 'itemInternalName');
  const itemRarities = new Map(
    relationItemRarities
      .filter((row) => row?.id != null)
      .map((row) => [Number(row.id), row])
  );
  const npcImages = buildImageIndex(relationNpcImages, 'npcInternalName');
  const projectileImages = buildImageIndex(relationProjectileImages, 'projectileInternalName');
  const buffImages = buildImageIndex(relationBuffImages, 'buffInternalName');

  const projectionItems = relationItems.map((row) => {
    const raw = parseJsonObject(row.rawJson);
    const image = itemImages.get(row.internalName)?.cachedUrl ?? null;
    const rareRaw = toNullableNumber(row.rareRaw ?? raw.rare);
    const valueRaw = toNullableNumber(row.valueRaw ?? raw.value);
    return {
      id: toNullableNumber(row.sourceId),
      relationRecordKey: row.recordKey,
      name: row.englishName ?? null,
      nameZh: row.nameZh ?? null,
      internalName: row.internalName ?? null,
      slug: toSlug(row.internalName),
      image,
      categoryId: null,
      description: null,
      descriptionZh: null,
      damage: toNullableNumber(raw.damage),
      defense: toNullableNumber(raw.defense ?? row.defenseValue),
      knockback: toNullableNumber(raw.knockBack),
      useTime: toNullableNumber(row.useTime ?? raw.useTime),
      width: toNullableNumber(row.width),
      height: toNullableNumber(row.height),
      buy: valueRaw,
      sell: toNullableNumber(row.sellRaw),
      tooltip: null,
      tooltipZh: null,
      sourceProvider: row.sourceProvider ?? null,
      sourcePage: row.sourcePage ?? null,
      sourceRevisionTimestamp: row.sourceRevisionTimestamp ?? null,
      lastSyncedAt: null,
      rarityId: rareRaw != null && itemRarities.has(rareRaw) ? rareRaw : null,
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

  const projectionNpcs = relationNpcs.map((row) => {
    const raw = parseJsonObject(row.rawJson);
    const flags = parseJsonObject(row.flagsJson);
    void npcImages;
    return {
      id: toNullableNumber(row.sourceId),
      relationRecordKey: row.recordKey,
      gameId: toNullableNumber(row.sourceId),
      sourceId: toNullableNumber(row.sourceId),
      internalName: row.internalName ?? null,
      name: row.englishName ?? null,
      nameZh: row.nameZh ?? null,
      subName: null,
      subNameZh: row.subNameZh ?? null,
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
    void projectileImages;
    return {
      id: toNullableNumber(row.sourceId),
      relationRecordKey: row.recordKey,
      sourceId: toNullableNumber(row.sourceId),
      internalName: row.internalName ?? null,
      name: row.englishName ?? null,
      nameZh: row.nameZh ?? null,
      aiStyle: toNullableNumber(raw.aiStyle),
      damage: toNullableNumber(raw.damage ?? row.combatValue),
      knockBack: toNullableNumber(raw.knockBack),
      penetrate: toNullableNumber(raw.penetrate),
      timeLeft: toNullableNumber(raw.timeLeft),
      width: toNullableNumber(row.width),
      height: toNullableNumber(row.height),
      scale: toNullableNumber(raw.scale),
      friendly: toFlag(raw.friendly),
      hostile: toFlag(raw.hostile),
      tileCollide: toFlag(raw.tileCollide),
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
    englishName: row.englishName ?? null,
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

  return {
    projectionItems,
    projectionNpcs,
    projectionProjectiles,
    projectionBuffs
  };
}
