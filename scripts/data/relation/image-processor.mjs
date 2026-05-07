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
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  return Boolean(value);
}

function parseRawJson(value) {
  if (value && typeof value === 'object') {
    return value;
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeFileTitle(value) {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }
  return text.replace(/^File:/i, '');
}

function toWikiImageUrl(fileTitle) {
  const normalizedTitle = normalizeFileTitle(fileTitle);
  if (!normalizedTitle) {
    return null;
  }
  return `https://terraria.wiki.gg/images/${encodeURIComponent(normalizedTitle)}`;
}

function inferContentType(fileTitle) {
  const normalizedTitle = normalizeFileTitle(fileTitle);
  if (!normalizedTitle) {
    return null;
  }
  const dotIndex = normalizedTitle.lastIndexOf('.');
  const extension = dotIndex >= 0 ? normalizedTitle.slice(dotIndex + 1).toLowerCase() : '';
  if (extension === 'png') return 'image/png';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'svg') return 'image/svg+xml';
  return null;
}

function isUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

function firstManagedUrl(...values) {
  for (const value of values) {
    if (isUrl(value)) {
      return value.trim();
    }
  }
  return null;
}

function buildRowIndexByInternalName(rows = []) {
  return new Map(
    rows
      .filter((row) => row?.internal_name)
      .map((row) => [String(row.internal_name).trim(), row])
  );
}

function buildDerivedImageRecord({
  sourceMaintTable,
  row,
  sourceFileTitle,
  internalNameKey,
  nameKey
}) {
  const trace = normalizeTrace(sourceMaintTable, row);
  const normalizedTitle = normalizeFileTitle(sourceFileTitle);
  if (!normalizedTitle) {
    return null;
  }
  const imageUrl = toWikiImageUrl(normalizedTitle);
  return {
    recordKey: createRecordKey({
      type: `${sourceMaintTable}:image`,
      sourceMaintId: trace.sourceMaintId ?? null,
      internalName: row.internal_name ?? null,
      sourceFileTitle: normalizedTitle
    }),
    [internalNameKey]: normalizeText(row.internal_name),
    [nameKey]: normalizeText(row.english_name ?? row.name_zh),
    role: 'icon',
    sourceFileTitle: normalizedTitle,
    originalUrl: imageUrl,
    cachedUrl: imageUrl,
    width: null,
    height: null,
    contentType: inferContentType(normalizedTitle),
    isPrimary: true,
    sortOrder: 0,
    reviewStatus: relationStatus.resolved,
    confidence: confidence.high,
    reason: `${sourceMaintTable}_image_from_raw_json`,
    rawJson: row.raw_json ?? null,
    ...trace
  };
}

function buildRawJsonImageRows(rows, config) {
  return rows
    .map((row) => buildDerivedImageRecord({
      ...config,
      row,
      sourceFileTitle: parseRawJson(row.raw_json).image
    }))
    .filter(Boolean);
}

function buildBuffImageRows(rows, localBuffIndex = new Map()) {
  return rows
    .map((row) => {
      const parsedRawJson = parseRawJson(row.raw_json);
      const sourceFileTitle = parsedRawJson.image;
      const derived = buildDerivedImageRecord({
        sourceMaintTable: 'maint_buffs',
        row,
        sourceFileTitle,
        internalNameKey: 'buffInternalName',
        nameKey: 'buffName'
      });
      if (!derived) {
        return null;
      }

      const localRow = localBuffIndex.get(String(row.internal_name ?? '').trim()) ?? null;
      const managedCachedUrl = firstManagedUrl(
        localRow?.image_cached_url,
        localRow?.image,
        row.image_cached_url,
        row.image,
        parsedRawJson.image
      );
      if (!managedCachedUrl) {
        return derived;
      }

      return {
        ...derived,
        cachedUrl: managedCachedUrl,
        contentType: inferContentType(managedCachedUrl) ?? derived.contentType
      };
    })
    .filter(Boolean);
}

function buildProjectileImageRows(rows, localProjectileIndex = new Map()) {
  return rows
    .map((row) => {
      const parsedRawJson = parseRawJson(row.raw_json);
      const derived = buildDerivedImageRecord({
        sourceMaintTable: 'maint_projectiles',
        row,
        sourceFileTitle: parsedRawJson.image,
        internalNameKey: 'projectileInternalName',
        nameKey: 'projectileName'
      });
      if (!derived) {
        return null;
      }

      const localRow = localProjectileIndex.get(String(row.internal_name ?? '').trim()) ?? null;
      const managedCachedUrl = firstManagedUrl(localRow?.image_url, row.image_url);
      if (!managedCachedUrl) {
        return derived;
      }

      return {
        ...derived,
        cachedUrl: managedCachedUrl,
        contentType: inferContentType(managedCachedUrl) ?? derived.contentType
      };
    })
    .filter(Boolean);
}

export function buildImageRelations({
  maintItemImages = [],
  maintNpcImages = [],
  maintProjectiles = [],
  maintBuffs = [],
  localProjectiles = [],
  localBuffs = []
} = {}) {
  const localProjectileIndex = buildRowIndexByInternalName(localProjectiles);
  const localBuffIndex = buildRowIndexByInternalName(localBuffs);
  const mirrorNpcImages = maintNpcImages.map((row) => {
    const trace = normalizeTrace('maint_npc_images', row);
    return {
      recordKey: createRecordKey({
        type: 'maint_npc_images',
        sourceMaintRecordKey: trace.sourceMaintRecordKey ?? null,
        npcInternalName: row.npc_internal_name ?? null,
        role: row.role ?? null,
        sortOrder: row.sort_order ?? null
      }),
      npcInternalName: normalizeText(row.npc_internal_name),
      npcName: normalizeText(row.npc_name),
      role: normalizeText(row.role),
      sourceFileTitle: normalizeText(row.source_file_title),
      originalUrl: normalizeText(row.original_url),
      cachedUrl: normalizeText(row.cached_url),
      width: toNullableNumber(row.width),
      height: toNullableNumber(row.height),
      contentType: normalizeText(row.content_type),
      isPrimary: toBoolean(row.is_primary),
      sortOrder: toNullableNumber(row.sort_order) ?? 0,
      reviewStatus: relationStatus.resolved,
      confidence: confidence.high,
      reason: 'maint_npc_image_mirrored',
      rawJson: row.raw_json ?? null,
      ...trace
    };
  });

  return {
    relationItemImages: maintItemImages.map((row) => {
      const trace = normalizeTrace('maint_item_images', row);
      return {
        recordKey: createRecordKey({
          type: 'maint_item_images',
          sourceMaintRecordKey: trace.sourceMaintRecordKey ?? null,
          itemInternalName: row.item_internal_name ?? null,
          role: row.role ?? null,
          sortOrder: row.sort_order ?? null
        }),
        itemInternalName: normalizeText(row.item_internal_name),
        itemName: normalizeText(row.item_name),
        role: normalizeText(row.role),
        sourceFileTitle: normalizeText(row.source_file_title),
        originalUrl: normalizeText(row.original_url),
        cachedUrl: normalizeText(row.cached_url),
        width: toNullableNumber(row.width),
        height: toNullableNumber(row.height),
        contentType: normalizeText(row.content_type),
        isPrimary: toBoolean(row.is_primary),
        sortOrder: toNullableNumber(row.sort_order) ?? 0,
        reviewStatus: relationStatus.resolved,
        confidence: confidence.high,
        reason: 'maint_item_image_mirrored',
        rawJson: row.raw_json ?? null,
        ...trace
      };
    }),
    relationNpcImages: mirrorNpcImages,
    relationProjectileImages: buildProjectileImageRows(maintProjectiles, localProjectileIndex),
    relationBuffImages: buildBuffImageRows(maintBuffs, localBuffIndex)
  };
}
