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

function normalizeArmorDefinitionKey(value) {
  return normalizeText(value)
    ?.toLowerCase()
    .replace(/\s+armor$/i, '')
    .replace(/盔甲$/, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() ?? null;
}

function normalizeArmorFamilyToken(value) {
  return normalizeNameKey(value)
    ?.replace(/\s+armor$/i, '')
    .replace(/\s+/g, ' ')
    .trim() ?? null;
}

function buildInterchangeableFamilyTitles(record) {
  return stableUnique([
    record?.pageTitle,
    ...(Array.isArray(record?.interchangeableSetTitles) ? record.interchangeableSetTitles : [])
  ])
    .map((title) => ({
      title,
      baseTitle: armorSetBaseTitle(title),
      token: normalizeArmorFamilyToken(title)
    }))
    .filter((entry) => entry.baseTitle && entry.token);
}

function findArmorItemFamily(entry, familyTitles) {
  const itemName = normalizeText(
    entry?.item?.english_name
      ?? entry?.item?.englishName
      ?? entry?.item?.name
      ?? entry?.item?.internal_name
      ?? entry?.item?.internalName
  );
  if (!itemName) {
    return null;
  }
  return familyTitles.find((family) => isItemForArmorBase(itemName, family.baseTitle)) ?? null;
}

function removeWords(text, words) {
  let result = ` ${text} `;
  for (const word of words) {
    if (!word) continue;
    result = result.replace(new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), ' ');
  }
  return result.replace(/\s+/g, ' ').trim();
}

function armorItemVariantToken(entry, family) {
  const itemName = normalizeNameKey(
    entry?.item?.english_name
      ?? entry?.item?.englishName
      ?? entry?.item?.name
      ?? entry?.item?.internal_name
      ?? entry?.item?.internalName
  );
  if (!itemName) {
    return `item-${entry?.sourceId ?? ''}`;
  }
  const familyWords = String(family?.token ?? '')
    .split(/\s+/)
    .filter(Boolean);
  const token = removeWords(itemName, [...familyWords, 'ancient', 'pink']);
  return token || itemName;
}

function armorItemStatSignature(entry) {
  const raw = getRawItem(entry?.item);
  const defense = toNullableNumber(
    entry?.item?.defense_value
      ?? entry?.item?.defenseValue
      ?? entry?.item?.defense
      ?? raw.defense
      ?? raw.defenseValue
  );
  const effectText = normalizeNameKey(
    raw.tooltip
      ?? raw.tooltipZh
      ?? raw.tooltip_zh
      ?? raw.description
      ?? raw.descriptionZh
      ?? raw.description_zh
      ?? raw.effect
      ?? raw.effectText
  );
  return [
    `def:${defense ?? 'unknown'}`,
    `effect:${effectText ?? 'none'}`
  ].join('|');
}

function mappedArmorItemVariantToken(entry) {
  const itemName = normalizeNameKey(
    entry?.item?.english_name
      ?? entry?.item?.englishName
      ?? entry?.item?.name
      ?? entry?.item?.internal_name
      ?? entry?.item?.internalName
  );
  if (!itemName) {
    return `item-${entry?.sourceId ?? ''}`;
  }
  const token = removeWords(itemName, ['ancient', 'pink', 'snow']);
  return token || itemName;
}

function buildMappedDefinitionEquivalenceContext(effectiveSetItems, { forceEquivalentByRole = false } = {}) {
  const entriesByRole = new Map();
  for (const entry of effectiveSetItems) {
    const role = entry.slot?.partRole ?? 'unknown';
    if (role === 'unknown') {
      continue;
    }
    if (!entriesByRole.has(role)) {
      entriesByRole.set(role, []);
    }
    entriesByRole.get(role).push(entry);
  }
  const roleSignatureCounts = new Map();
  for (const [role, entries] of entriesByRole.entries()) {
    const signatures = new Set(entries.map((entry) => armorItemStatSignature(entry)));
    roleSignatureCounts.set(role, signatures.size);
  }
  if (![...entriesByRole.values()].some((entries) => entries.length > 1)) {
    return { enabled: false, keyBySourceId: new Map(), entriesByKey: new Map() };
  }

  const keyBySourceId = new Map();
  const entriesByKey = new Map();
  for (const entry of effectiveSetItems) {
    const role = entry.slot?.partRole ?? 'unknown';
    const statSignature = forceEquivalentByRole ? 'equivalent' : armorItemStatSignature(entry);
    const variantToken = forceEquivalentByRole || (roleSignatureCounts.get(role) ?? 0) <= 1
      ? 'equivalent'
      : mappedArmorItemVariantToken(entry);
    const key = `${role}:${variantToken}:${statSignature}`;
    keyBySourceId.set(entry.sourceId, key);
    if (!entriesByKey.has(key)) {
      entriesByKey.set(key, []);
    }
    entriesByKey.get(key).push(entry);
  }
  for (const entries of entriesByKey.values()) {
    entries.sort((left, right) => left.sourceId - right.sourceId);
  }
  return { enabled: true, keyBySourceId, entriesByKey };
}

function recordLooksLikeEquivalentArmorFamily(record) {
  const text = normalizeText([
    record?.pageTitle,
    record?.nameZh,
    record?.nameEn,
    record?.effectText,
    record?.benefitZh,
    record?.benefitEn
  ].filter(Boolean).join(' ')) ?? '';
  return /互换|可替换|可以和|interchange|interchangeable|swap|equivalent/i.test(text);
}

function mappedDefinitionHasEquivalentItemTokens(effectiveSetItems) {
  const tokensByRole = new Map();
  for (const entry of effectiveSetItems) {
    const role = entry.slot?.partRole ?? 'unknown';
    if (role === 'unknown') continue;
    tokensByRole.set(role, [...(tokensByRole.get(role) ?? []), mappedArmorItemVariantToken(entry)]);
  }
  return [...tokensByRole.values()].some((tokens) => tokens.length > new Set(tokens).size);
}

function buildArmorEquivalenceContext(record, effectiveSetItems, { hasMappedDefinition = false } = {}) {
  const familyTitles = buildInterchangeableFamilyTitles(record);
  const hasInterchangeable = familyTitles.length > 1;
  if (!hasInterchangeable) {
    const forceEquivalentByRole = recordLooksLikeEquivalentArmorFamily(record);
    return hasMappedDefinition && (
      forceEquivalentByRole
      || mappedDefinitionHasEquivalentItemTokens(effectiveSetItems)
    )
      ? buildMappedDefinitionEquivalenceContext(effectiveSetItems, { forceEquivalentByRole })
      : { enabled: false, keyBySourceId: new Map(), entriesByKey: new Map() };
  }

  const itemFamilyBySourceId = new Map();
  const roleCountsByFamily = new Map();
  for (const entry of effectiveSetItems) {
    const family = findArmorItemFamily(entry, familyTitles);
    if (!family) {
      continue;
    }
    itemFamilyBySourceId.set(entry.sourceId, family);
    const role = entry.slot?.partRole ?? 'unknown';
    const familyRoleKey = `${family.token}|${role}`;
    roleCountsByFamily.set(familyRoleKey, (roleCountsByFamily.get(familyRoleKey) ?? 0) + 1);
  }

  const maxRoleCount = new Map();
  for (const [familyRoleKey, count] of roleCountsByFamily.entries()) {
    const role = familyRoleKey.split('|').at(-1);
    maxRoleCount.set(role, Math.max(maxRoleCount.get(role) ?? 0, count));
  }

  const keyBySourceId = new Map();
  const entriesByKey = new Map();
  for (const entry of effectiveSetItems) {
    const role = entry.slot?.partRole ?? 'unknown';
    const family = itemFamilyBySourceId.get(entry.sourceId);
    const key = family
      ? `${role}:${(maxRoleCount.get(role) ?? 0) > 1 ? armorItemVariantToken(entry, family) : 'equivalent'}:${armorItemStatSignature(entry)}`
      : `${role}:source-${entry.sourceId}`;
    keyBySourceId.set(entry.sourceId, key);
    if (!entriesByKey.has(key)) {
      entriesByKey.set(key, []);
    }
    entriesByKey.get(key).push(entry);
  }

  for (const entries of entriesByKey.values()) {
    entries.sort((left, right) => left.sourceId - right.sourceId);
  }

  return { enabled: true, keyBySourceId, entriesByKey };
}

function collapseEquivalentCartesianVariants({ variants, equivalenceContext }) {
  if (!equivalenceContext?.enabled || !Array.isArray(variants) || variants.length === 0) {
    return variants;
  }
  const seen = new Set();
  const collapsed = [];
  for (const variant of variants) {
    const signature = variant
      .map((sourceId) => equivalenceContext.keyBySourceId.get(sourceId) ?? `source-${sourceId}`)
      .join('|');
    if (seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    collapsed.push(variant);
  }
  return collapsed.length > 0 ? collapsed : variants;
}

function expandEquivalentVariantEntries(variant, equivalenceContext, itemBySourceId) {
  if (!equivalenceContext?.enabled) {
    return variant.map((sourceId, partIndex) => ({
      sourceId,
      partIndex,
      entry: itemBySourceId.get(sourceId) ?? null
    }));
  }
  const rows = [];
  const emitted = new Set();
  for (let partIndex = 0; partIndex < variant.length; partIndex += 1) {
    const sourceId = variant[partIndex];
    const key = equivalenceContext.keyBySourceId.get(sourceId);
    const entries = key ? (equivalenceContext.entriesByKey.get(key) ?? []) : [];
    const alternatives = entries.length > 0 ? entries : [itemBySourceId.get(sourceId)].filter(Boolean);
    for (const entry of alternatives) {
      const rowKey = `${partIndex}:${entry.sourceId}`;
      if (emitted.has(rowKey)) {
        continue;
      }
      emitted.add(rowKey);
      rows.push({ sourceId: entry.sourceId, partIndex, entry });
    }
  }
  return rows;
}

function armorDefinitionKeyFromBenefitExpression(value) {
  return normalizeText(value)
    ?.replace(/^ArmorSetBonuses\.Benefits\./i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .trim() ?? null;
}

function addArmorDefinitionIndexEntry(index, key, definition) {
  if (!key) return;
  if (!index.has(key)) {
    index.set(key, []);
  }
  index.get(key).push(definition);
}

function buildArmorDefinitionLookup(maintArmorSets = []) {
  const byBaseTitle = new Map();
  const byBenefitName = new Map();
  const byTextKey = new Map();
  const all = [];

  for (const row of maintArmorSets) {
    const sets = asSetList(row.sets_json ?? row.setsJson);
    const uniqueItemIds = asNumberList(row.unique_item_ids_json ?? row.uniqueItemIdsJson);
    if (!sets.length || !uniqueItemIds.length) continue;
    const raw = parseJson(row.raw_json ?? row.rawJson, {});
    const titleKey = normalizeArmorDefinitionKey(
      raw?.nameEn
        ?? raw?.pageTitle
        ?? row.source_key
        ?? row.sourceKey
        ?? row.name
        ?? row.name_zh
    );
    const benefitKey = armorDefinitionKeyFromBenefitExpression(row.benefit_expression ?? row.benefitExpression);
    const textKey = normalizeText(row.text_key ?? row.textKey);
    const definition = { textKey, sets, uniqueItemIds, titleKey, benefitKey };
    all.push(definition);

    addArmorDefinitionIndexEntry(byBaseTitle, titleKey, definition);
    addArmorDefinitionIndexEntry(byBenefitName, benefitKey, definition);
    addArmorDefinitionIndexEntry(byTextKey, textKey, definition);
    if (textKey) {
      const textName = textKey.replace(/^ArmorSetBonus\./, '');
      const normalizedTextKey = normalizeNameKey(textName);
      addArmorDefinitionIndexEntry(byBenefitName, normalizedTextKey, definition);
    }
  }

  return { all, byBaseTitle, byBenefitName, byTextKey };
}

function buildArmorDefinitionMapLookup(armorSetDefinitionMap = null) {
  const byName = new Map();
  const records = armorSetDefinitionMap?.records && typeof armorSetDefinitionMap.records === 'object'
    ? Object.values(armorSetDefinitionMap.records)
    : [];

  for (const record of records) {
    const textKey = normalizeText(record?.definition?.textKey);
    if (!textKey) continue;
    for (const candidate of [record.name, record.internalCode]) {
      const key = normalizeArmorDefinitionKey(candidate);
      if (key && !byName.has(key)) byName.set(key, textKey);
    }
  }

  return byName;
}

function armorDefinitionPositiveIds(definition) {
  return stableUnique((definition?.uniqueItemIds ?? []).filter((sourceId) => sourceId > 0));
}

function armorDefinitionOverlap(definition, sourceIds) {
  const positiveIds = armorDefinitionPositiveIds(definition);
  const overlapIds = positiveIds.filter((sourceId) => sourceIds.has(sourceId));
  return { positiveIds, overlapIds };
}

function itemEntryForSourceId(sourceId, itemBySourceId) {
  const itemRow = itemBySourceId.get(sourceId);
  if (!itemRow) return null;
  return {
    item: itemRow,
    sourceId,
    slot: pickSlot(itemRow)
  };
}

function sourceIdsForRoles(sourceIds, itemBySourceId, roles) {
  const allowedRoles = new Set(roles);
  const ids = new Set();
  for (const sourceId of sourceIds) {
    const entry = itemEntryForSourceId(sourceId, itemBySourceId);
    if (entry && allowedRoles.has(entry.slot.partRole)) {
      ids.add(sourceId);
    }
  }
  return ids;
}

function armorDefinitionRoleIds(definition, itemBySourceId, roles) {
  return sourceIdsForRoles(armorDefinitionPositiveIds(definition), itemBySourceId, roles);
}

function countSharedIds(left, right) {
  let count = 0;
  for (const value of left) {
    if (right.has(value)) count += 1;
  }
  return count;
}

function uniqueDefinitions(definitions = []) {
  const seen = new Set();
  const result = [];
  for (const definition of definitions) {
    const key = definition?.textKey ?? JSON.stringify(definition?.uniqueItemIds ?? []);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(definition);
  }
  return result;
}

function definitionsFromIndex(index, key) {
  return key && index.has(key) ? index.get(key) : [];
}

function findArmorDefinitionBundleForWikiRecord(record, definitionLookup, definitionMapLookup, setItems, itemBySourceId) {
  const baseKey = normalizeArmorDefinitionKey(record.pageTitle);
  const nameKey = normalizeArmorDefinitionKey(record.nameZh ?? record.pageTitle);
  const mappedTextKey = (nameKey && definitionMapLookup.get(nameKey)) || (baseKey && definitionMapLookup.get(baseKey));
  const candidateSourceIds = new Set(setItems.map((entry) => entry.sourceId));
  const hasPageCandidates = candidateSourceIds.size > 0;
  const seedDefinitions = [];
  let hasDirectMappedSeed = false;

  for (const definition of definitionsFromIndex(definitionLookup.byTextKey, mappedTextKey)) {
    const { overlapIds } = armorDefinitionOverlap(definition, candidateSourceIds);
    if (!hasPageCandidates || overlapIds.length > 0) {
      seedDefinitions.push(definition);
      hasDirectMappedSeed = true;
    }
  }
  seedDefinitions.push(
    ...definitionsFromIndex(definitionLookup.byBaseTitle, baseKey),
    ...definitionsFromIndex(definitionLookup.byBenefitName, baseKey)
  );

  for (const definition of definitionLookup.all ?? []) {
    const { positiveIds, overlapIds } = armorDefinitionOverlap(definition, candidateSourceIds);
    if (positiveIds.length >= 3 && overlapIds.length >= Math.min(3, positiveIds.length)) {
      seedDefinitions.push(definition);
    }
  }

  const selected = uniqueDefinitions(seedDefinitions);
  if (selected.length === 0) {
    return null;
  }

  const selectedTextKeys = new Set(selected.map((definition) => definition.textKey).filter(Boolean));
  const selectedBodyLegIds = () => {
    const ids = new Set();
    for (const definition of selected) {
      for (const sourceId of armorDefinitionRoleIds(definition, itemBySourceId, ['body', 'legs'])) {
        ids.add(sourceId);
      }
    }
    return ids;
  };

  let changed = true;
  while (changed) {
    changed = false;
    const bodyLegIds = selectedBodyLegIds();
    for (const definition of definitionLookup.all ?? []) {
      if (!definition.textKey || selectedTextKeys.has(definition.textKey)) {
        continue;
      }
      const { positiveIds, overlapIds } = armorDefinitionOverlap(definition, candidateSourceIds);
      if (positiveIds.length < 3 || overlapIds.length === 0) {
        continue;
      }
      const definitionBodyLegIds = armorDefinitionRoleIds(definition, itemBySourceId, ['body', 'legs']);
      const sharedBodyLegCount = countSharedIds(definitionBodyLegIds, bodyLegIds);
      if (sharedBodyLegCount >= 2 || (sharedBodyLegCount > 0 && overlapIds.length === positiveIds.length)) {
        selected.push(definition);
        selectedTextKeys.add(definition.textKey);
        changed = true;
      }
    }
  }

  const sets = [];
  const setSignatures = new Set();
  const shouldFilterSets = !hasDirectMappedSeed
    || recordLooksLikeEquivalentArmorFamily(record)
    || buildInterchangeableFamilyTitles(record).length > 1;
  for (const definition of selected) {
    for (const set of definition.sets) {
      const normalizedSet = set.map((sourceId) => toNullableNumber(sourceId) ?? 0);
      const positiveSetIds = normalizedSet.filter((sourceId) => sourceId > 0);
      if (positiveSetIds.length === 0) continue;
      if (shouldFilterSets && hasPageCandidates && !positiveSetIds.some((sourceId) => candidateSourceIds.has(sourceId))) continue;
      const signature = normalizedSet.join('|');
      if (setSignatures.has(signature)) continue;
      setSignatures.add(signature);
      sets.push(normalizedSet);
    }
  }

  const positiveUniqueItemIds = stableUnique(sets.flat().filter((sourceId) => sourceId > 0));
  if (sets.length === 0 || positiveUniqueItemIds.length === 0) {
    return null;
  }
  return {
    definitions: selected,
    sets,
    uniqueItemIds: positiveUniqueItemIds
  };
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
  maintArmorSets = [],
  armorSetDefinitionMap = null,
  maintItems = [],
  maintArmorSetImages = [],
  existingRelationArmorSetImages = [],
  managedImageUrlPrefixes = []
} = {}) {
  const slotItems = buildArmorSlotItems(maintItems);
  const itemBySourceId = buildItemIndex(maintItems);
  const definitionLookup = buildArmorDefinitionLookup(maintArmorSets);
  const definitionMapLookup = buildArmorDefinitionMapLookup(armorSetDefinitionMap);
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
    const mappedDefinitionBundle = compositionKind === 'traditional_set'
      ? findArmorDefinitionBundleForWikiRecord(record, definitionLookup, definitionMapLookup, setItems, itemBySourceId)
      : null;
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
    const variants = mappedDefinitionBundle?.sets?.length
      ? mappedDefinitionBundle.sets
      : compositionKind === 'traditional_set'
        ? cartesianArmorSets(groups)
        : setItems.map((entry) => [entry.sourceId]);
    const uniqueItemIds = mappedDefinitionBundle?.uniqueItemIds?.length
      ? mappedDefinitionBundle.uniqueItemIds
      : stableUnique(setItems.map((entry) => entry.sourceId));
    const effectiveSetItems = mappedDefinitionBundle?.uniqueItemIds?.length
      ? mappedDefinitionBundle.uniqueItemIds
        .map((sourceId) => {
          const itemRow = itemBySourceId.get(sourceId);
          if (!itemRow) return null;
          return {
            item: itemRow,
            sourceId,
            slot: pickSlot(itemRow)
          };
        })
        .filter((entry) => entry && entry.slot.partRole !== 'unknown')
      : setItems;
    const equivalenceContext = compositionKind === 'traditional_set'
      ? buildArmorEquivalenceContext(record, effectiveSetItems, { hasMappedDefinition: Boolean(mappedDefinitionBundle?.sets?.length) })
      : { enabled: false, keyBySourceId: new Map(), entriesByKey: new Map() };
    const effectiveVariants = collapseEquivalentCartesianVariants({ variants, equivalenceContext });
    const expandedVariantEntries = effectiveVariants.map((variant) => expandEquivalentVariantEntries(
      variant,
      equivalenceContext,
      new Map(effectiveSetItems.map((entry) => [entry.sourceId, entry]))
    ));
    const effectiveSets = expandedVariantEntries.map((entries) => stableUnique(
      entries.map((row) => row.sourceId)
    ));
    const effectiveUniqueItemIds = stableUnique([
      ...expandedVariantEntries.flat().map((row) => row.sourceId),
      ...uniqueItemIds
    ]);
    const armorSet = buildWikiArmorSetRecord(record, effectiveSetItems, effectiveSets, effectiveUniqueItemIds);
    armorSet.rawPageTitle = pageTitle;
    relationArmorSets.push(armorSet);

    if (effectiveSetItems.length === 0) {
      issues.push({
        code: 'wiki_armor_set_items_missing',
        pageTitle,
        textKey: armorSet.textKey
      });
    }

    for (let setVariantIndex = 0; setVariantIndex < expandedVariantEntries.length; setVariantIndex += 1) {
      for (const row of expandedVariantEntries[setVariantIndex]) {
        const itemRecord = buildArmorSetItemRecord({
          armorSet,
          textKey: armorSet.textKey,
          setVariantIndex,
          partIndex: row.partIndex,
          itemSourceId: row.sourceId,
          itemRow: row.entry?.item ?? null
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
  armorSetDefinitionMap = null,
  maintItems = [],
  maintArmorSetImages = [],
  existingRelationArmorSetImages = [],
  managedImageUrlPrefixes = []
} = {}) {
  if (Array.isArray(wikiArmorSets) && wikiArmorSets.length > 0) {
    return buildWikiArmorSetRelations({
      wikiArmorSets,
      maintArmorSets,
      armorSetDefinitionMap,
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
