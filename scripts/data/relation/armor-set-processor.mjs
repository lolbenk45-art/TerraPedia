import {
  confidence,
  createRecordKey,
  normalizeText,
  normalizeTrace,
  relationStatus
} from './relation-trace.mjs';

function toNullableNumber(value) {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toBoolean(value) {
  if (value === true || value === false) return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return Boolean(value);
}

function parseJson(value, fallback) {
  if (value == null || value === '') {
    return fallback;
  }
  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
    return value;
  }
  if (typeof value !== 'string') {
    return fallback;
  }
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function asSetList(value) {
  const parsed = parseJson(value, []);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed
    .map((entry) => Array.isArray(entry) ? entry.map((item) => toNullableNumber(item) ?? 0) : [])
    .filter((entry) => entry.length > 0);
}

function asNumberList(value) {
  const parsed = parseJson(value, []);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.map((entry) => toNullableNumber(entry)).filter((entry) => entry != null);
}

function buildItemIndex(maintItems) {
  const bySourceId = new Map();
  for (const item of maintItems) {
    const sourceId = toNullableNumber(item.source_id ?? item.sourceId);
    if (sourceId != null) {
      bySourceId.set(sourceId, item);
    }
  }
  return bySourceId;
}

function getRawItem(item) {
  return parseJson(item?.raw_json ?? item?.rawJson, {});
}

function pickSlot(item) {
  const raw = getRawItem(item);
  const candidates = [
    ['head', 'headSlot', item?.head_slot ?? item?.headSlot ?? raw.headSlot],
    ['body', 'bodySlot', item?.body_slot ?? item?.bodySlot ?? raw.bodySlot],
    ['legs', 'legSlot', item?.leg_slot ?? item?.legSlot ?? raw.legSlot]
  ];
  for (const [partRole, slotType, rawValue] of candidates) {
    const slot = toNullableNumber(rawValue);
    if (slot != null && slot >= 0) {
      return {
        partRole,
        slotType,
        equipmentSlotId: slot
      };
    }
  }
  return {
    partRole: 'unknown',
    slotType: null,
    equipmentSlotId: null
  };
}

function normalizeImageRole(value) {
  const text = normalizeText(value)?.toLowerCase() ?? null;
  if (!text) return null;
  if (text === 'special') return 'demo';
  if (['male', 'female', 'demo', 'part', 'other'].includes(text)) {
    return text;
  }
  return 'other';
}

function buildArmorSetRecord(row) {
  const trace = normalizeTrace('maint_armor_sets', row);
  const textKey = normalizeText(row.text_key ?? row.textKey);
  const sets = asSetList(row.sets_json ?? row.setsJson);
  const uniqueItemIds = asNumberList(row.unique_item_ids_json ?? row.uniqueItemIdsJson);
  return {
    recordKey: createRecordKey({
      type: 'maint_armor_sets',
      sourceMaintRecordKey: trace.sourceMaintRecordKey ?? null,
      textKey
    }),
    textKey,
    benefitExpression: normalizeText(row.benefit_expression ?? row.benefitExpression),
    primaryPart: normalizeText(row.primary_part ?? row.primaryPart),
    setCount: toNullableNumber(row.set_count ?? row.setCount) ?? sets.length,
    uniqueItemCount: toNullableNumber(row.unique_item_count ?? row.uniqueItemCount) ?? uniqueItemIds.length,
    setsJson: JSON.stringify(sets),
    uniqueItemIdsJson: JSON.stringify(uniqueItemIds),
    terrariaVersion: normalizeText(row.terraria_version ?? row.terrariaVersion),
    reviewStatus: relationStatus.resolved,
    confidence: confidence.high,
    reason: 'maint_armor_sets_mirrored',
    rawJson: row.raw_json ?? row.rawJson ?? null,
    ...trace
  };
}

function buildArmorSetItemRecord({
  armorSet,
  textKey,
  setVariantIndex,
  partIndex,
  itemSourceId,
  itemRow
}) {
  const slot = itemRow ? pickSlot(itemRow) : { partRole: 'unknown', slotType: null, equipmentSlotId: null };
  const resolved = Boolean(itemRow);
  return {
    recordKey: createRecordKey({
      type: 'relation_armor_set_items',
      armorSetRecordKey: armorSet.recordKey,
      setVariantIndex,
      partIndex,
      itemSourceId
    }),
    armorSetRecordKey: armorSet.recordKey,
    textKey,
    setVariantIndex,
    partIndex,
    itemSourceId,
    itemInternalName: normalizeText(itemRow?.internal_name ?? itemRow?.internalName),
    itemName: normalizeText(itemRow?.english_name ?? itemRow?.name ?? itemRow?.name_zh),
    partRole: slot.partRole,
    slotType: slot.slotType,
    equipmentSlotId: slot.equipmentSlotId,
    reviewStatus: resolved ? relationStatus.resolved : relationStatus.unresolved,
    confidence: resolved ? confidence.high : confidence.none,
    reason: resolved ? 'armor_set_item_source_id_match' : 'armor_set_item_missing',
    rawJson: itemRow?.raw_json ?? itemRow?.rawJson ?? null,
    ...normalizeTrace('maint_items', itemRow ?? {})
  };
}

function buildArmorSetImageRecord(row, armorSetByTextKey) {
  const textKey = normalizeText(row.text_key ?? row.textKey);
  const armorSet = textKey ? armorSetByTextKey.get(textKey) : null;
  if (!armorSet) {
    return null;
  }
  const trace = normalizeTrace(row.source_maint_table ?? 'maint_armor_set_images', row);
  const imageRole = normalizeImageRole(row.image_role ?? row.imageRole ?? row.role);
  return {
    recordKey: createRecordKey({
      type: 'relation_armor_set_images',
      armorSetRecordKey: armorSet.recordKey,
      imageRole,
      sourceFileTitle: row.source_file_title ?? row.sourceFileTitle ?? null,
      sortOrder: row.sort_order ?? row.sortOrder ?? null
    }),
    armorSetRecordKey: armorSet.recordKey,
    textKey,
    imageRole,
    sourceFileTitle: normalizeText(row.source_file_title ?? row.sourceFileTitle),
    originalUrl: normalizeText(row.original_url ?? row.originalUrl),
    cachedUrl: normalizeText(row.cached_url ?? row.cachedUrl),
    width: toNullableNumber(row.width),
    height: toNullableNumber(row.height),
    contentType: normalizeText(row.content_type ?? row.contentType),
    isPrimary: toBoolean(row.is_primary ?? row.isPrimary),
    sortOrder: toNullableNumber(row.sort_order ?? row.sortOrder) ?? 0,
    reviewStatus: relationStatus.resolved,
    confidence: confidence.high,
    reason: 'maint_armor_set_image_mirrored',
    rawJson: row.raw_json ?? row.rawJson ?? null,
    ...trace
  };
}

export function buildArmorSetRelations({
  maintArmorSets = [],
  maintItems = [],
  maintArmorSetImages = []
} = {}) {
  const itemBySourceId = buildItemIndex(maintItems);
  const relationArmorSets = [];
  const relationArmorSetItems = [];
  const issues = [];

  for (const row of maintArmorSets) {
    const armorSet = buildArmorSetRecord(row);
    relationArmorSets.push(armorSet);
    const sets = asSetList(row.sets_json ?? row.setsJson);

    for (let setVariantIndex = 0; setVariantIndex < sets.length; setVariantIndex += 1) {
      const set = sets[setVariantIndex];
      for (let partIndex = 0; partIndex < set.length; partIndex += 1) {
        const itemSourceId = toNullableNumber(set[partIndex]);
        if (itemSourceId == null || itemSourceId <= 0) {
          continue;
        }
        const itemRow = itemBySourceId.get(itemSourceId) ?? null;
        const itemRecord = buildArmorSetItemRecord({
          armorSet,
          textKey: armorSet.textKey,
          setVariantIndex,
          partIndex,
          itemSourceId,
          itemRow
        });
        relationArmorSetItems.push(itemRecord);
        if (!itemRow) {
          issues.push({
            code: 'armor_set_item_missing',
            textKey: armorSet.textKey,
            itemSourceId,
            setVariantIndex,
            partIndex
          });
        }
      }
    }
  }

  const armorSetByTextKey = new Map(
    relationArmorSets
      .filter((row) => row.textKey)
      .map((row) => [row.textKey, row])
  );
  const relationArmorSetImages = maintArmorSetImages
    .map((row) => buildArmorSetImageRecord(row, armorSetByTextKey))
    .filter(Boolean);

  return {
    relationArmorSets,
    relationArmorSetItems,
    relationArmorSetImages,
    issues
  };
}
