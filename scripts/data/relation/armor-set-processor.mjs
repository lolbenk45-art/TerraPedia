import {
  confidence,
  createRecordKey,
  normalizeText,
  normalizeTrace,
  relationStatus
} from './relation-trace.mjs';
import { isManagedImageUrl } from './managed-image-url-policy.mjs';

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

function stableUnique(values) {
  return [...new Set(values.filter((value) => value != null && value !== ''))];
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

function normalizeNameKey(value) {
  return normalizeText(value)
    ?.toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() ?? null;
}

function armorSetTextKey(pageTitle) {
  return `WikiArmorSet.${pageTitle}`;
}

function toMysqlDateTime(value) {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return text.replace('T', ' ').replace(/Z$/i, '').slice(0, 19);
  }
  return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

function normalizeUrlKey(value) {
  return normalizeText(value)
    ?.replace(/^https?:\/\//i, '')
    .replace(/^\/\//, '')
    .replace(/%20/gi, '_')
    .replace(/\s+/g, '_')
    .toLowerCase() ?? null;
}

function normalizeFileTitleKey(value) {
  return normalizeText(value)
    ?.replace(/^file:/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase() ?? null;
}

function buildManagedArmorImageLookup(
  maintArmorSetImages = [],
  existingRelationArmorSetImages = [],
  managedImageUrlPrefixes = []
) {
  const byOriginalUrl = new Map();
  const byPageRoleFile = new Map();
  for (const row of [...existingRelationArmorSetImages, ...maintArmorSetImages]) {
    const cachedUrl = normalizeText(row.cached_url ?? row.cachedUrl);
    if (!isManagedImageUrl(cachedUrl, managedImageUrlPrefixes)) {
      continue;
    }
    const originalUrl = normalizeUrlKey(row.original_url ?? row.originalUrl);
    if (originalUrl) {
      byOriginalUrl.set(originalUrl, cachedUrl);
    }
    const pageTitle = normalizeFileTitleKey(row.page_title ?? row.pageTitle);
    const role = normalizeImageRole(row.image_role ?? row.imageRole ?? row.role);
    const sourceFileTitle = normalizeFileTitleKey(row.source_file_title ?? row.sourceFileTitle);
    if (pageTitle && role && sourceFileTitle) {
      byPageRoleFile.set(`${pageTitle}|${role}|${sourceFileTitle}`, cachedUrl);
    }
  }
  return { byOriginalUrl, byPageRoleFile };
}

function armorSetBaseTitle(pageTitle) {
  return normalizeText(pageTitle)?.replace(/\s+armor$/i, '').trim() ?? null;
}

function isItemForArmorBase(itemName, baseTitle) {
  const itemKey = normalizeNameKey(itemName);
  const baseKey = normalizeNameKey(baseTitle);
  if (!itemKey || !baseKey) {
    return false;
  }
  return itemKey === baseKey || itemKey.startsWith(`${baseKey} `);
}

function buildArmorSlotItems(maintItems) {
  return maintItems
    .map((item) => ({ item, sourceId: toNullableNumber(item.source_id ?? item.sourceId), slot: pickSlot(item) }))
    .filter((entry) => entry.sourceId != null && entry.slot.partRole !== 'unknown');
}

function findWikiArmorItems(record, slotItems) {
  const titles = stableUnique([
    record.pageTitle,
    ...(Array.isArray(record.interchangeableSetTitles) ? record.interchangeableSetTitles : [])
  ]);
  const bases = titles.map(armorSetBaseTitle).filter(Boolean);
  const matchedBySourceId = new Map();
  for (const entry of slotItems) {
    const englishName = normalizeText(entry.item.english_name ?? entry.item.englishName ?? entry.item.name);
    if (!englishName) {
      continue;
    }
    if (bases.some((base) => isItemForArmorBase(englishName, base))) {
      matchedBySourceId.set(entry.sourceId, entry);
    }
  }
  return [...matchedBySourceId.values()].sort((left, right) => left.sourceId - right.sourceId);
}

function findWikiSinglePieceArmorSetItem(record, slotItems) {
  const pageKey = normalizeNameKey(record.pageTitle);
  if (!pageKey) {
    return [];
  }
  return slotItems
    .filter((entry) => {
      const itemKey = normalizeNameKey(
        entry.item.english_name
          ?? entry.item.englishName
          ?? entry.item.name
          ?? entry.item.internal_name
          ?? entry.item.internalName
      );
      return itemKey === pageKey;
    })
    .slice(0, 1);
}

function cartesianArmorSets(groups) {
  const activeGroups = groups.filter((group) => group.items.length > 0);
  if (activeGroups.length === 0) {
    return [];
  }
  let variants = [[]];
  for (const group of activeGroups) {
    const next = [];
    for (const variant of variants) {
      for (const item of group.items) {
        next.push([...variant, item.sourceId]);
      }
    }
    variants = next;
  }
  return variants;
}

function buildWikiArmorSetRecord(record, setItems, variants, uniqueItemIds) {
  const pageTitle = normalizeText(record.pageTitle);
  const textKey = armorSetTextKey(pageTitle);
  const raw = {
    entityType: normalizeText(record.entityType) ?? 'armor_set',
    compositionKind: normalizeText(record.compositionKind) ?? 'traditional_set',
    pageTitle,
    nameZh: normalizeText(record.nameZh),
    nameEn: normalizeText(record.nameEn) ?? pageTitle,
    section: normalizeText(record.section),
    effectText: normalizeText(record.effectText),
    sourceText: normalizeText(record.sourceText),
    interchangeableSetTitles: Array.isArray(record.interchangeableSetTitles) ? record.interchangeableSetTitles : [],
    images: Array.isArray(record.images) ? record.images : []
  };
  return {
    recordKey: createRecordKey({
      type: 'wiki_armor_sets',
      pageTitle
    }),
    textKey,
    benefitExpression: textKey,
    primaryPart: null,
    setCount: variants.length,
    uniqueItemCount: uniqueItemIds.length,
    setsJson: JSON.stringify(variants),
    uniqueItemIdsJson: JSON.stringify(uniqueItemIds),
    terrariaVersion: normalizeText(record.terrariaVersion),
    reviewStatus: setItems.length > 0 ? relationStatus.resolved : relationStatus.unresolved,
    confidence: setItems.length > 0 ? confidence.high : confidence.none,
    reason: 'wiki_armor_page_set_row',
    rawJson: JSON.stringify(raw),
    sourceProvider: 'terraria.wiki.gg',
    sourcePage: 'zh/wiki/盔甲',
    sourceRevisionTimestamp: toMysqlDateTime(record.sourceRevisionTimestamp),
    sourceMaintTable: 'wiki_armor_sets',
    sourceMaintRecordKey: null,
    sourceMaintId: null,
    landingSourceId: null,
    landingSourceKey: 'wiki.zh.armor',
    landingContentHash: null
  };
}

function buildWikiArmorSetImageRecord({ armorSet, image, index, managedImageLookup }) {
  const role = normalizeImageRole(image.role) ?? 'other';
  const originalUrl = normalizeText(image.url);
  const cachedUrl = managedImageLookup?.byOriginalUrl.get(normalizeUrlKey(originalUrl))
    ?? managedImageLookup?.byPageRoleFile.get(
      `${normalizeFileTitleKey(armorSet.rawPageTitle)}|${role}|${normalizeFileTitleKey(image.fileTitle)}`
    )
    ?? null;
  return {
    recordKey: createRecordKey({
      type: 'relation_armor_set_images',
      armorSetRecordKey: armorSet.recordKey,
      imageRole: role,
      sourceFileTitle: image.fileTitle ?? null,
      sortOrder: index
    }),
    armorSetRecordKey: armorSet.recordKey,
    textKey: armorSet.textKey,
    imageRole: role,
    sourceFileTitle: normalizeText(image.fileTitle),
    originalUrl,
    cachedUrl,
    width: toNullableNumber(image.width),
    height: toNullableNumber(image.height),
    contentType: normalizeText(image.contentType),
    isPrimary: role === 'male' && index === 0,
    sortOrder: index,
    reviewStatus: relationStatus.resolved,
    confidence: confidence.high,
    reason: 'wiki_armor_page_image',
    rawJson: JSON.stringify(image),
    sourceProvider: 'terraria.wiki.gg',
    sourcePage: 'zh/wiki/盔甲',
    sourceRevisionTimestamp: null,
    sourceMaintTable: 'wiki_armor_sets',
    sourceMaintRecordKey: null,
    sourceMaintId: null,
    landingSourceId: null,
    landingSourceKey: 'wiki.zh.armor',
    landingContentHash: null
  };
}

function buildWikiArmorSetRelations({
  wikiArmorSets = [],
  maintItems = [],
  maintArmorSetImages = [],
  existingRelationArmorSetImages = [],
  managedImageUrlPrefixes = []
} = {}) {
  const slotItems = buildArmorSlotItems(maintItems);
  const managedImageLookup = buildManagedArmorImageLookup(
    maintArmorSetImages,
    existingRelationArmorSetImages,
    managedImageUrlPrefixes
  );
  const relationArmorSets = [];
  const relationArmorSetItems = [];
  const relationArmorSetImages = [];
  const issues = [];

  for (const record of wikiArmorSets) {
    const pageTitle = normalizeText(record.pageTitle);
    if (!pageTitle) {
      continue;
    }
    const compositionKind = normalizeText(record.compositionKind) ?? 'traditional_set';
    const setItems = compositionKind === 'traditional_set'
      ? findWikiArmorItems(record, slotItems)
      : findWikiSinglePieceArmorSetItem(record, slotItems);
    const itemsByRole = new Map();
    for (const entry of setItems) {
      const role = entry.slot.partRole;
      if (!itemsByRole.has(role)) {
        itemsByRole.set(role, []);
      }
      itemsByRole.get(role).push(entry);
    }
    const groups = ['head', 'body', 'legs']
      .map((role) => ({ role, items: itemsByRole.get(role) ?? [] }))
      .filter((group) => group.items.length > 0);
    const variants = compositionKind === 'traditional_set'
      ? cartesianArmorSets(groups)
      : setItems.map((entry) => [entry.sourceId]);
    const uniqueItemIds = stableUnique(setItems.map((entry) => entry.sourceId));
    const armorSet = buildWikiArmorSetRecord(record, setItems, variants, uniqueItemIds);
    armorSet.rawPageTitle = pageTitle;
    relationArmorSets.push(armorSet);

    if (setItems.length === 0) {
      issues.push({
        code: 'wiki_armor_set_items_missing',
        pageTitle,
        textKey: armorSet.textKey
      });
    }

    const itemBySourceId = new Map(setItems.map((entry) => [entry.sourceId, entry]));
    for (let setVariantIndex = 0; setVariantIndex < variants.length; setVariantIndex += 1) {
      const variant = variants[setVariantIndex];
      for (let partIndex = 0; partIndex < variant.length; partIndex += 1) {
        const itemSourceId = variant[partIndex];
        const entry = itemBySourceId.get(itemSourceId);
        const itemRecord = buildArmorSetItemRecord({
          armorSet,
          textKey: armorSet.textKey,
          setVariantIndex,
          partIndex,
          itemSourceId,
          itemRow: entry?.item ?? null
        });
        relationArmorSetItems.push(itemRecord);
      }
    }

    const images = Array.isArray(record.images) ? record.images : [];
    for (let index = 0; index < images.length; index += 1) {
      relationArmorSetImages.push(buildWikiArmorSetImageRecord({
        armorSet,
        image: images[index],
        index,
        managedImageLookup
      }));
    }
    delete armorSet.rawPageTitle;
  }

  return {
    relationArmorSets,
    relationArmorSetItems,
    relationArmorSetImages,
    issues
  };
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

function buildArmorSetImageRecord(row, armorSetByTextKey, managedImageUrlPrefixes = []) {
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
    cachedUrl: isManagedImageUrl(row.cached_url ?? row.cachedUrl, managedImageUrlPrefixes)
      ? normalizeText(row.cached_url ?? row.cachedUrl)
      : null,
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
  wikiArmorSets = [],
  maintArmorSets = [],
  maintItems = [],
  maintArmorSetImages = [],
  existingRelationArmorSetImages = [],
  managedImageUrlPrefixes = []
} = {}) {
  if (Array.isArray(wikiArmorSets) && wikiArmorSets.length > 0) {
    return buildWikiArmorSetRelations({
      wikiArmorSets,
      maintItems,
      maintArmorSetImages,
      existingRelationArmorSetImages,
      managedImageUrlPrefixes
    });
  }

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
    .map((row) => buildArmorSetImageRecord(row, armorSetByTextKey, managedImageUrlPrefixes))
    .filter(Boolean);

  return {
    relationArmorSets,
    relationArmorSetItems,
    relationArmorSetImages,
    issues
  };
}
