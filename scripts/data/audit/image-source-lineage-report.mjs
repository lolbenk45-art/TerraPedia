#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { getProjectRoot } from '../lib/project-root.mjs';
import {
  DEFAULT_MANAGED_IMAGE_URL_PREFIXES,
  isManagedImagePath,
  resolveManagedImageUrlPrefixes,
} from '../relation/managed-image-url-policy.mjs';
import {
  assertItemImageProjectionCompletedResult,
  assertItemImageProjectionInputContract,
  assertItemImageProjectionProposal,
  assertItemImageProjectionSnapshot,
  buildItemImageProjectionInputContract,
  buildItemImageProjectionAttemptPaths,
  canonicalItemImageProjectionHash,
} from '../relation/item-image-projection-contract.mjs';
import {
  assertRepositoryOrdinaryFile,
  assertRepositoryPathConfinement,
} from '../lib/private-repository-path.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = getProjectRoot();
const DEFAULT_MAINT_DATABASE = 'terria_v1_maint';
const DEFAULT_RELATION_DATABASE = 'terria_v1_relation';
const DEFAULT_LOCAL_DATABASE = 'terria_v1_local';
const ENTITY_ORDER = ['items', 'buffs', 'npcs', 'bosses', 'projectiles', 'armor_sets', 'biomes'];
const BOSS_MANAGED_IMAGE_URL_PREFIXES = [
  'http://localhost:9000/terrapedia-images/bosses/',
  'http://127.0.0.1:9000/terrapedia-images/bosses/',
];
const BUFF_MANAGED_IMAGE_URL_PREFIXES = [
  'http://localhost:9000/terrapedia-images/buffs/',
  'http://127.0.0.1:9000/terrapedia-images/buffs/',
];

const ENTITY_CONFIG = {
  items: {
    contractKey: 'item.image',
    coreDatabase: 'local',
    coreQuery: (localDatabase) => `
SELECT \`id\`, \`internal_name\` AS internalName, \`name\`, \`name_zh\` AS nameZh, \`image\`
FROM ${qualified(localDatabase, 'items')}
WHERE \`deleted\` = 0
ORDER BY \`id\` ASC
`.trim(),
    maintImagesQuery: (maintDatabase) => `
SELECT
  \`id\`,
  \`item_internal_name\` AS itemInternalName,
  \`item_name\` AS itemName,
  \`role\`,
  \`source_provider\` AS sourceProvider,
  \`source_file_title\` AS sourceFileTitle,
  \`source_page\` AS sourcePage,
  \`source_revision_timestamp\` AS sourceRevisionTimestamp,
  \`original_url\` AS originalUrl,
  \`cached_url\` AS cachedUrl,
  \`content_type\` AS contentType,
  \`is_primary\` AS isPrimary,
  \`sort_order\` AS sortOrder
FROM ${qualified(maintDatabase, 'maint_item_images')}
WHERE \`deleted\` = 0
ORDER BY \`id\` ASC
`.trim(),
    relationImagesQuery: (relationDatabase) => `
SELECT
  \`id\`,
  \`item_internal_name\` AS itemInternalName,
  \`item_name\` AS itemName,
  \`role\`,
  \`source_file_title\` AS sourceFileTitle,
  \`original_url\` AS originalUrl,
  \`cached_url\` AS cachedUrl,
  \`content_type\` AS contentType,
  \`is_primary\` AS isPrimary,
  \`sort_order\` AS sortOrder,
  \`source_maint_table\` AS sourceMaintTable,
  \`source_maint_id\` AS sourceMaintId
FROM ${qualified(relationDatabase, 'relation_item_images')}
WHERE \`deleted\` = 0
ORDER BY \`id\` ASC
`.trim(),
    projectionQuery: (relationDatabase) => `
SELECT \`id\`, \`relation_record_key\` AS relationRecordKey, \`internal_name\` AS internalName, \`image\`
FROM ${qualified(relationDatabase, 'projection_items')}
WHERE \`deleted\` = 0
ORDER BY \`id\` ASC
`.trim(),
    projectionImageField: 'image',
    coreImageAccessor: (row) => firstText(row?.image),
    coreKeyAccessor: (row) => firstText(row?.internalName, row?.internal_name),
    maintKeyAccessor: (row) => firstText(row?.itemInternalName, row?.item_internal_name),
    relationKeyAccessor: (row) => firstText(row?.itemInternalName, row?.item_internal_name),
    projectionKeyAccessor: (row) => firstText(row?.internalName, row?.internal_name),
    projectionImageAccessor: (row) => firstText(row?.image),
    requiresMaintTable: true,
    requiresRelationTable: true,
    requiresRelationRowsForReady: true,
  },
  buffs: {
    contractKey: 'buff.image',
    coreDatabase: 'local',
    coreQuery: (localDatabase) => `
SELECT \`id\`, \`internal_name\` AS internalName, \`english_name\` AS englishName, \`name_zh\` AS nameZh, \`image\`, \`image_cached_url\` AS imageCachedUrl
FROM ${qualified(localDatabase, 'buffs')}
WHERE \`deleted\` = 0
ORDER BY \`id\` ASC
`.trim(),
    maintImagesQuery: (maintDatabase) => `
SELECT
  \`id\`,
  \`internal_name\` AS buffInternalName,
  \`english_name\` AS buffName,
  \`raw_json\` AS rawJson,
  \`source_provider\` AS sourceProvider,
  \`source_page\` AS sourcePage,
  \`source_revision_timestamp\` AS sourceRevisionTimestamp
FROM ${qualified(maintDatabase, 'maint_buffs')}
WHERE \`deleted\` = 0
ORDER BY \`id\` ASC
`.trim(),
    relationImagesQuery: (relationDatabase) => `
SELECT
  \`id\`,
  \`buff_internal_name\` AS buffInternalName,
  \`buff_name\` AS buffName,
  \`source_file_title\` AS sourceFileTitle,
  \`original_url\` AS originalUrl,
  \`cached_url\` AS cachedUrl,
  \`content_type\` AS contentType,
  \`is_primary\` AS isPrimary,
  \`sort_order\` AS sortOrder,
  \`source_maint_table\` AS sourceMaintTable,
  \`source_maint_id\` AS sourceMaintId
FROM ${qualified(relationDatabase, 'relation_buff_images')}
WHERE \`deleted\` = 0
ORDER BY \`id\` ASC
`.trim(),
    projectionQuery: (relationDatabase) => `
SELECT \`id\`, \`internal_name\` AS internalName, \`image\`
FROM ${qualified(relationDatabase, 'projection_buffs')}
WHERE \`deleted\` = 0
ORDER BY \`id\` ASC
`.trim(),
    projectionImageField: 'image',
    coreImageAccessor: (row) => firstText(row?.imageCachedUrl, row?.image_cached_url, row?.image, row?.imagePath, row?.image_path),
    maintKeyAccessor: (row) => firstText(row?.buffInternalName, row?.buff_internal_name),
    relationKeyAccessor: (row) => firstText(row?.buffInternalName, row?.buff_internal_name),
    projectionKeyAccessor: (row) => firstText(row?.internalName, row?.internal_name),
    projectionImageAccessor: (row) => firstText(row?.image),
    maintRowReady: (row) => Boolean(
      firstText(parseJsonField(row?.rawJson, 'image'))
      && firstText(
        row?.sourceProvider,
        row?.source_provider,
        row?.sourcePage,
        row?.source_page,
        row?.sourceRevisionTimestamp,
        row?.source_revision_timestamp,
      )
    ),
    requiresMaintTable: true,
    requiresRelationTable: true,
    requiresRelationRowsForReady: false,
  },
  npcs: {
    contractKey: 'npc.imageUrl',
    coreDatabase: 'local',
    coreQuery: (localDatabase) => `
SELECT \`id\`, \`internal_name\` AS internalName, \`name\`, \`name_zh\` AS nameZh, \`image_url\` AS imageUrl
FROM ${qualified(localDatabase, 'npcs')}
WHERE \`deleted\` = 0
ORDER BY \`id\` ASC
`.trim(),
    maintImagesQuery: (maintDatabase) => `
SELECT
  \`id\`,
  \`npc_internal_name\` AS npcInternalName,
  \`npc_name\` AS npcName,
  \`role\`,
  \`source_provider\` AS sourceProvider,
  \`source_file_title\` AS sourceFileTitle,
  \`source_page\` AS sourcePage,
  \`source_revision_timestamp\` AS sourceRevisionTimestamp,
  \`original_url\` AS originalUrl,
  \`cached_url\` AS cachedUrl,
  \`content_type\` AS contentType,
  \`is_primary\` AS isPrimary,
  \`sort_order\` AS sortOrder
FROM ${qualified(maintDatabase, 'maint_npc_images')}
WHERE \`deleted\` = 0
ORDER BY \`id\` ASC
`.trim(),
    relationImagesQuery: (relationDatabase) => `
SELECT
  \`id\`,
  \`npc_internal_name\` AS npcInternalName,
  \`npc_name\` AS npcName,
  \`role\`,
  \`source_file_title\` AS sourceFileTitle,
  \`original_url\` AS originalUrl,
  \`cached_url\` AS cachedUrl,
  \`content_type\` AS contentType,
  \`is_primary\` AS isPrimary,
  \`sort_order\` AS sortOrder,
  \`source_maint_table\` AS sourceMaintTable,
  \`source_maint_id\` AS sourceMaintId
FROM ${qualified(relationDatabase, 'relation_npc_images')}
WHERE \`deleted\` = 0
ORDER BY \`id\` ASC
`.trim(),
    projectionQuery: (relationDatabase) => `
SELECT \`id\`, \`internal_name\` AS internalName, \`image_url\` AS imageUrl
FROM ${qualified(relationDatabase, 'projection_npcs')}
WHERE \`deleted\` = 0
ORDER BY \`id\` ASC
`.trim(),
    projectionImageField: 'imageUrl',
    coreImageAccessor: (row) => firstText(row?.imageUrl, row?.image_url),
    coreKeyAccessor: (row) => firstText(row?.internalName, row?.internal_name),
    maintKeyAccessor: (row) => firstText(row?.npcInternalName, row?.npc_internal_name),
    relationKeyAccessor: (row) => firstText(row?.npcInternalName, row?.npc_internal_name),
    projectionKeyAccessor: (row) => firstText(row?.internalName, row?.internal_name),
    projectionImageAccessor: (row) => firstText(row?.imageUrl, row?.image_url),
    requiresMaintTable: true,
    requiresRelationTable: true,
    requiresRelationRowsForReady: true,
  },
  bosses: {
    contractKey: 'boss.imageUrl',
    coreDatabase: 'local',
    coreQuery: (localDatabase) => `
SELECT \`id\`, \`code\`, \`name_en\` AS nameEn, \`name_zh\` AS nameZh, \`image_url\` AS imageUrl
FROM ${qualified(localDatabase, 'boss_groups')}
WHERE \`deleted\` = 0
ORDER BY \`progression_order\` ASC, \`id\` ASC
`.trim(),
    maintImagesQuery: (maintDatabase) => `
SELECT
  \`id\`,
  \`record_key\` AS recordKey,
  \`title_en\` AS bossTitleEn,
  \`title_zh\` AS bossTitleZh,
  \`page_title_en\` AS pageTitleEn,
  \`page_title_zh\` AS pageTitleZh,
  \`image_url\` AS imageUrl,
  \`source_provider\` AS sourceProvider,
  \`source_page\` AS sourcePage,
  \`source_revision_timestamp\` AS sourceRevisionTimestamp
FROM ${qualified(maintDatabase, 'maint_bosses')}
WHERE \`deleted\` = 0
ORDER BY \`id\` ASC
`.trim(),
    relationImagesQuery: (relationDatabase) => `
SELECT
  \`id\`,
  \`record_key\` AS recordKey,
  \`boss_title_en\` AS bossTitleEn,
  \`boss_title_zh\` AS bossTitleZh,
  \`page_title_en\` AS pageTitleEn,
  \`page_title_zh\` AS pageTitleZh,
  \`image_url\` AS imageUrl,
  \`source_provider\` AS sourceProvider,
  \`source_page\` AS sourcePage,
  \`source_revision_timestamp\` AS sourceRevisionTimestamp,
  \`source_maint_table\` AS sourceMaintTable,
  \`source_maint_id\` AS sourceMaintId
FROM ${qualified(relationDatabase, 'relation_bosses')}
WHERE \`deleted\` = 0
ORDER BY \`id\` ASC
`.trim(),
    projectionQuery: (relationDatabase) => `
SELECT \`id\`, \`code\`, \`name_en\` AS nameEn, \`name_zh\` AS nameZh, \`image_url\` AS imageUrl
FROM ${qualified(relationDatabase, 'projection_bosses')}
WHERE \`deleted\` = 0
ORDER BY \`progression_order\` ASC, \`id\` ASC
`.trim(),
    projectionImageField: 'imageUrl',
    coreImageAccessor: (row) => firstText(row?.imageUrl, row?.image_url),
    projectionImageAccessor: (row) => firstText(row?.imageUrl, row?.image_url),
    maintRowReady: (row) => hasBossLineageEvidence(row),
    relationRowReady: (row) => hasBossLineageEvidence(row),
    requiresMaintTable: true,
    requiresRelationTable: true,
    requiresRelationRowsForReady: true,
  },
  projectiles: {
    contractKey: 'projectile.imageUrl',
    coreDatabase: 'local',
    coreQuery: (localDatabase) => `
SELECT \`id\`, \`internal_name\` AS internalName, \`name\`, \`name_zh\` AS nameZh, \`image_url\` AS imageUrl, \`raw_json\` AS rawJson
FROM ${qualified(localDatabase, 'projectiles')}
WHERE \`deleted\` = 0
ORDER BY \`id\` ASC
`.trim(),
    maintImagesQuery: (maintDatabase) => `
SELECT
  \`id\`,
  \`internal_name\` AS projectileInternalName,
  \`english_name\` AS projectileName,
  \`raw_json\` AS rawJson
FROM ${qualified(maintDatabase, 'maint_projectiles')}
WHERE \`deleted\` = 0
ORDER BY \`id\` ASC
`.trim(),
    relationImagesQuery: (relationDatabase) => `
SELECT
  \`id\`,
  \`projectile_internal_name\` AS projectileInternalName,
  \`projectile_name\` AS projectileName,
  \`source_file_title\` AS sourceFileTitle,
  \`original_url\` AS originalUrl,
  \`cached_url\` AS cachedUrl,
  \`content_type\` AS contentType,
  \`is_primary\` AS isPrimary,
  \`sort_order\` AS sortOrder,
  \`source_maint_table\` AS sourceMaintTable,
  \`source_maint_id\` AS sourceMaintId
FROM ${qualified(relationDatabase, 'relation_projectile_images')}
WHERE \`deleted\` = 0
ORDER BY \`id\` ASC
`.trim(),
    projectionQuery: (relationDatabase) => `
SELECT \`id\`, \`internal_name\` AS internalName, \`image_url\` AS imageUrl
FROM ${qualified(relationDatabase, 'projection_projectiles')}
WHERE \`deleted\` = 0
ORDER BY \`id\` ASC
`.trim(),
    projectionImageField: 'imageUrl',
    coreImageAccessor: (row) => firstText(row?.imageUrl, row?.image_url, parseJsonField(row?.rawJson, 'imageUrl')),
    maintKeyAccessor: (row) => firstText(row?.projectileInternalName, row?.projectile_internal_name),
    relationKeyAccessor: (row) => firstText(row?.projectileInternalName, row?.projectile_internal_name),
    projectionKeyAccessor: (row) => firstText(row?.internalName, row?.internal_name),
    projectionImageAccessor: (row) => firstText(row?.imageUrl, row?.image_url),
    maintRowReady: (row) => Boolean(
      firstText(parseJsonField(row?.rawJson, 'image'))
      && firstText(
        row?.projectileName,
        row?.projectile_name,
        row?.sourceProvider,
        row?.source_provider,
        row?.sourcePage,
        row?.source_page,
        row?.sourceRevisionTimestamp,
        row?.source_revision_timestamp,
      )
    ),
    requiresMaintTable: true,
    requiresRelationTable: true,
    requiresRelationRowsForReady: false,
  },
  armor_sets: {
    contractKey: 'armor_set.images',
    coreDatabase: 'relation',
    coreQuery: (relationDatabase, { localDatabase = DEFAULT_LOCAL_DATABASE } = {}) => `
SELECT
  pas.\`id\`,
  pas.\`source_key\` AS sourceKey,
  pas.\`text_key\` AS textKey,
  pas.\`male_images\` AS maleImages,
  pas.\`female_images\` AS femaleImages,
  pas.\`special_images\` AS specialImages,
  pas.\`related_items_json\` AS relatedItemsJson,
  SUBSTRING_INDEX(
    GROUP_CONCAT(
      CASE
        WHEN ii.\`cached_url\` IS NOT NULL
          AND TRIM(ii.\`cached_url\`) <> ''
          AND LOWER(TRIM(ii.\`cached_url\`)) NOT LIKE '%(demo)%'
          AND LOWER(TRIM(ii.\`cached_url\`)) NOT LIKE '%28demo%29%'
          AND LOWER(TRIM(ii.\`cached_url\`)) NOT REGEXP '(^|[/_[:space:]-])demo([._?&#/-]|$)'
          AND LOWER(TRIM(ii.\`cached_url\`)) NOT LIKE '%(placed)%'
          AND LOWER(TRIM(ii.\`cached_url\`)) NOT LIKE '%28placed%29%'
          AND LOWER(TRIM(ii.\`cached_url\`)) NOT REGEXP '(^|[/_[:space:]-])placed([._?&#/-]|$)'
          AND (
            ii.\`original_url\` IS NULL
            OR TRIM(ii.\`original_url\`) = ''
            OR (
              LOWER(TRIM(ii.\`original_url\`)) NOT LIKE '%(demo)%'
              AND LOWER(TRIM(ii.\`original_url\`)) NOT LIKE '%28demo%29%'
              AND LOWER(TRIM(ii.\`original_url\`)) NOT REGEXP '(^|[/_[:space:]-])demo([._?&#/-]|$)'
              AND LOWER(TRIM(ii.\`original_url\`)) NOT LIKE '%(placed)%'
              AND LOWER(TRIM(ii.\`original_url\`)) NOT LIKE '%28placed%29%'
              AND LOWER(TRIM(ii.\`original_url\`)) NOT REGEXP '(^|[/_[:space:]-])placed([._?&#/-]|$)'
            )
          )
          THEN TRIM(ii.\`cached_url\`)
      END
      ORDER BY
        CASE
          WHEN ii.\`item_id\` = related_item.itemId THEN 0
          WHEN ii.\`item_id\` = related_item.itemIdSnake THEN 1
          WHEN ii.\`item_id\` = related_item.id THEN 2
          WHEN ii.\`item_id\` = related_item.sourceId THEN 3
          WHEN ii.\`item_id\` = related_item.sourceIdSnake THEN 4
          ELSE 5
        END ASC,
        ii.\`is_primary\` DESC,
        ii.\`sort_order\` ASC,
        ii.\`id\` ASC
      SEPARATOR ','
    ),
    ',',
    1
  ) AS fallbackImage
FROM ${qualified(relationDatabase, 'projection_armor_sets')} pas
LEFT JOIN JSON_TABLE(
  CASE
    WHEN JSON_VALID(pas.\`related_items_json\`) THEN pas.\`related_items_json\`
    ELSE '[]'
  END,
  '$[*]' COLUMNS (
    itemId BIGINT PATH '$.itemId' NULL ON EMPTY NULL ON ERROR,
    itemIdSnake BIGINT PATH '$.item_id' NULL ON EMPTY NULL ON ERROR,
    id BIGINT PATH '$.id' NULL ON EMPTY NULL ON ERROR,
    sourceId BIGINT PATH '$.sourceId' NULL ON EMPTY NULL ON ERROR,
    sourceIdSnake BIGINT PATH '$.source_id' NULL ON EMPTY NULL ON ERROR
  )
) related_item ON TRUE
LEFT JOIN ${qualified(localDatabase, 'item_images')} ii
  ON ii.\`deleted\` = 0
  AND ii.\`status\` = 1
  AND ii.\`item_id\` IN (
    related_item.itemId,
    related_item.itemIdSnake,
    related_item.id,
    related_item.sourceId,
    related_item.sourceIdSnake
  )
WHERE pas.\`deleted\` = 0
GROUP BY
  pas.\`id\`,
  pas.\`source_key\`,
  pas.\`text_key\`,
  pas.\`male_images\`,
  pas.\`female_images\`,
  pas.\`special_images\`,
  pas.\`related_items_json\`
ORDER BY pas.\`id\` ASC
`.trim(),
    projectionQuery: (relationDatabase) => `
SELECT
  \`id\`,
  \`source_key\` AS sourceKey,
  \`text_key\` AS textKey,
  \`male_images\` AS maleImages,
  \`female_images\` AS femaleImages,
  \`special_images\` AS specialImages
FROM ${qualified(relationDatabase, 'projection_armor_sets')}
WHERE \`deleted\` = 0
ORDER BY \`id\` ASC
`.trim(),
    projectionImageField: 'maleImages|femaleImages|specialImages',
    coreImageAccessor: (row) => firstText(
      row?.maleImages,
      row?.male_images,
      row?.femaleImages,
      row?.female_images,
      row?.specialImages,
      row?.special_images,
      row?.fallbackImage,
      row?.fallback_image,
      ...arrayValues(row?.fallbackImages, row?.fallback_images),
    ),
    coreKeyAccessor: (row) => firstText(row?.textKey, row?.text_key),
    projectionKeyAccessor: (row) => firstText(row?.textKey, row?.text_key),
    projectionImageAccessor: (row) => firstText(row?.maleImages, row?.male_images, row?.femaleImages, row?.female_images, row?.specialImages, row?.special_images),
    requiresMaintTable: false,
    requiresRelationTable: false,
    requiresRelationRowsForReady: false,
    emitMissingMaintTableGap: false,
    emitMissingRelationTableGap: false,
  },
  biomes: {
    contractKey: 'biome.iconUrl',
    coreDatabase: 'local',
    coreQuery: (localDatabase) => `
SELECT \`id\`, \`code\`, \`name_en\` AS nameEn, \`name_zh\` AS nameZh, \`icon_url\` AS iconUrl
FROM ${qualified(localDatabase, 'biomes')}
WHERE \`deleted\` = 0
ORDER BY \`id\` ASC
`.trim(),
    coreImageAccessor: (row) => firstText(row?.iconUrl, row?.icon_url, parseJsonField(row?.rawJson, 'iconUrl')),
    requiresMaintTable: false,
    requiresRelationTable: false,
    requiresRelationRowsForReady: false,
  },
};

export function parseArgs(argv = []) {
  const raw = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const index = body.indexOf('=');
    raw[toCamelCase(index >= 0 ? body.slice(0, index) : body)] = index >= 0 ? body.slice(index + 1) : 'true';
  }

  return {
    source: raw.source ?? 'db',
    attemptRoot: raw.attemptRoot ?? null,
    output: raw.output ?? null,
    repoRoot: raw.repoRoot ?? null,
    generatedAt: raw.generatedAt ?? null,
    maintDatabase: raw.maintDatabase ?? DEFAULT_MAINT_DATABASE,
    relationDatabase: raw.relationDatabase ?? DEFAULT_RELATION_DATABASE,
    localDatabase: raw.localDatabase ?? DEFAULT_LOCAL_DATABASE,
  };
}

export function resolveItemImageProjectionEvidencePaths({ attemptRoot } = {}) {
  const normalized = String(attemptRoot ?? '').trim().replaceAll('\\', '/');
  const prefix = 'reports/authorization/canonical/item-image-projection-apply/';
  if (path.isAbsolute(normalized)
      || path.posix.normalize(normalized) !== normalized
      || !normalized.startsWith(prefix)
      || !/^[a-f0-9]{64}$/.test(normalized.slice(prefix.length))) {
    throw new Error('item image projection attempt root must contain one exact lowercase SHA-256 attempt');
  }
  return {
    attemptRoot: normalized,
    inputPath: `${normalized}/input.json`,
    resultPath: `${normalized}/result.json`,
  };
}

export function buildImageSourceLineageQueries({
  maintDatabase = DEFAULT_MAINT_DATABASE,
  relationDatabase = DEFAULT_RELATION_DATABASE,
  localDatabase = DEFAULT_LOCAL_DATABASE,
} = {}) {
  return Object.fromEntries(
    ENTITY_ORDER.map((entityType) => {
      const config = ENTITY_CONFIG[entityType];
      const coreDatabaseName = config.coreDatabase === 'relation'
        ? relationDatabase
        : config.coreDatabase === 'maint'
          ? maintDatabase
          : localDatabase;
      const entry = {
        core: config.coreQuery(coreDatabaseName, { maintDatabase, relationDatabase, localDatabase }),
      };
      if (config.maintImagesQuery) {
        entry.maintImages = config.maintImagesQuery(maintDatabase);
      }
      if (config.relationImagesQuery) {
        entry.relationImages = config.relationImagesQuery(relationDatabase);
      }
      if (config.projectionQuery) {
        entry.projection = config.projectionQuery(relationDatabase);
      }
      return [entityType, entry];
    }),
  );
}

export function resolveImageSourceLineageReportPath({
  generatedAt = new Date().toISOString(),
  output = null,
  root = repoRoot,
} = {}) {
  if (output) {
    return path.resolve(root, output);
  }
  return path.resolve(root, 'reports', 'audit', `image-source-lineage-${toDateTag(generatedAt)}.json`);
}

export function buildImageSourceLineageReport({
  generatedAt = new Date().toISOString(),
  reportPath = null,
  entities = {},
  managedUrlPrefixes = DEFAULT_MANAGED_IMAGE_URL_PREFIXES,
  itemImageProjectionEvidence = null,
} = {}) {
  const entityReports = {};

  for (const entityType of ENTITY_ORDER) {
    entityReports[entityType] = summarizeEntityLineage(
      entityType,
      entities[entityType] ?? {},
      managedUrlPrefixes,
      itemImageProjectionEvidence,
    );
  }

  const readyEntityTypes = Object.values(entityReports).filter((entry) => entry.contractReady).length;
  const notReadyEntityTypes = ENTITY_ORDER.length - readyEntityTypes;

  return {
    generatedAt,
    reportPath,
    contractVersion: 'P1.1-image-source-lineage-v1',
    summary: {
      totalEntityTypes: ENTITY_ORDER.length,
      readyEntityTypes,
      notReadyEntityTypes,
    },
    entities: entityReports,
  };
}

function summarizeEntityLineage(
  entityType,
  entityData,
  managedUrlPrefixes,
  itemImageProjectionEvidence,
) {
  const config = ENTITY_CONFIG[entityType];
  const coreRows = Array.isArray(entityData.coreRows) ? entityData.coreRows : [];
  const maintImageRows = Array.isArray(entityData.maintImageRows) ? entityData.maintImageRows : [];
  const relationImageRows = Array.isArray(entityData.relationImageRows) ? entityData.relationImageRows : [];
  const projectionRows = Array.isArray(entityData.projectionRows) ? entityData.projectionRows : [];
  const gapReasons = [];
  const entityManagedUrlPrefixes = resolveEntityManagedUrlPrefixes(entityType, managedUrlPrefixes);
  const allowsPublicImageFallback = entityType === 'bosses';

  const coreImageCount = countRowsWithImage(coreRows, config.coreImageAccessor);
  const maintStructuredCount = countRowsMatching(maintImageRows, config.maintRowReady ?? defaultStructuredImageRowReady);
  const relationStructuredCount = countRowsMatching(relationImageRows, config.relationRowReady ?? defaultStructuredImageRowReady);
  const relationWrongManagedPrefixCount = countRowsWithWrongManagedImagePrefix(
    relationImageRows,
    relationImageAccessor(entityType),
    entityType,
    managedUrlPrefixes
  );
  const projectionImageCount = countRowsWithImage(projectionRows, config.projectionImageAccessor);
  const projectionManagedCount = countRowsWithManagedProjectionImage(projectionRows, config.projectionImageAccessor, entityManagedUrlPrefixes);
  const projectionWrongManagedPrefixCount = countRowsWithWrongManagedImagePrefix(
    projectionRows,
    config.projectionImageAccessor,
    entityType,
    managedUrlPrefixes
  );
  const projectionBlankButCoreImageAvailableCount = countBlankProjectionRowsWithCoreManagedImageAvailable(
    coreRows,
    projectionRows,
    config,
    entityManagedUrlPrefixes,
  );
  const hasProjectionField = Boolean(config.projectionImageField);

  if (coreImageCount === 0) {
    gapReasons.push('missing_core_image_evidence');
  }
  if (config.requiresMaintTable === false) {
    if (config.emitMissingMaintTableGap !== false) {
      gapReasons.push('missing_maint_image_table');
    }
  } else if (maintImageRows.length === 0) {
    gapReasons.push('missing_maint_image_rows');
  }
  if (config.requiresRelationTable === false) {
    if (config.emitMissingRelationTableGap !== false) {
      gapReasons.push('missing_relation_image_table');
    }
  } else if (relationImageRows.length === 0) {
    gapReasons.push('missing_relation_image_rows');
  }
  if (!hasProjectionField) {
    gapReasons.push('missing_projection_image_field');
  } else if (projectionRows.length === 0) {
    gapReasons.push('missing_projection_rows');
  } else if (projectionImageCount === 0 && !allowsPublicImageFallback) {
    gapReasons.push('missing_projection_image_values');
  } else if (projectionManagedCount < projectionImageCount && !allowsPublicImageFallback) {
    gapReasons.push('projection_image_not_managed');
  }
  if (config.requiresMaintTable && maintImageRows.length > 0 && maintStructuredCount === 0) {
    gapReasons.push('maint_rows_missing_original_or_cached_url');
  }
  if (config.requiresRelationTable && relationImageRows.length > 0 && relationStructuredCount === 0) {
    gapReasons.push('relation_rows_missing_original_or_cached_url');
  }
  if (relationWrongManagedPrefixCount > 0) {
    gapReasons.push('relation_image_wrong_managed_prefix');
  }
  if (projectionWrongManagedPrefixCount > 0) {
    gapReasons.push('projection_image_wrong_managed_prefix');
  }
  if (projectionBlankButCoreImageAvailableCount > 0) {
    gapReasons.push('projection_blank_but_core_image_available');
  }
  if (entityType === 'items') {
    gapReasons.push(...itemImageProjectionEvidenceGaps({
      evidence: itemImageProjectionEvidence,
      projectionRows,
    }));
  }

  const contractReady = gapReasons.length === 0;
  return {
    entityType,
    contractKey: config.contractKey,
    contractReady,
    gapReasons,
    lineage: {
      core: {
        rowCount: coreRows.length,
        rowsWithImage: coreImageCount,
      },
      maint: {
        table: config.maintImagesQuery ? deriveMaintTableName(entityType) : null,
        rowCount: maintImageRows.length,
        rowsWithStructuredImage: maintStructuredCount,
      },
      relation: {
        table: config.relationImagesQuery ? deriveRelationTableName(entityType) : null,
        rowCount: relationImageRows.length,
        rowsWithStructuredImage: relationStructuredCount,
        rowsWithWrongManagedPrefix: relationWrongManagedPrefixCount,
      },
      projection: {
        table: config.projectionQuery ? deriveProjectionTableName(entityType) : null,
        imageField: config.projectionImageField ?? null,
        rowCount: projectionRows.length,
        rowsWithImage: projectionImageCount,
        rowsWithManagedImage: projectionManagedCount,
        rowsWithWrongManagedPrefix: projectionWrongManagedPrefixCount,
        rowsBlankButCoreImageAvailable: projectionBlankButCoreImageAvailableCount,
      },
    },
  };
}

function itemImageProjectionEvidenceGaps({ evidence, projectionRows }) {
  if (evidence == null) return ['missing_item_image_projection_apply_evidence'];
  if (evidence.loadError) return [classifyItemImageProjectionEvidenceLoadError(evidence.loadError)];
  if (!evidence.result || !evidence.inputContract || !evidence.proposal || !evidence.snapshot
      || !evidence.inputBytes || !evidence.proposalBytes || !evidence.snapshotBytes
      || !Array.isArray(evidence.artifacts)) {
    return ['partial_item_image_projection_apply_evidence'];
  }
  if (evidence.result.status === 'failed') return ['failed_item_image_projection_apply_evidence'];
  if (evidence.result.status !== 'completed' || evidence.result.apply !== true) {
    return ['dry_run_item_image_projection_apply_evidence'];
  }
  if (Array.isArray(evidence.inputContract?.projectionAfterRows)
      && evidence.inputContract.projectionAfterRows.some((row) => (
        !isManagedImagePath(row?.image, evidence.inputContract.managedUrlPrefixes)
      ))) {
    return ['item_image_projection_unmanaged_evidence'];
  }
  try {
    assertItemImageProjectionInputContract(evidence.inputContract);
    assertItemImageProjectionProposal(evidence.proposal);
    assertItemImageProjectionSnapshot(evidence.snapshot);
    assertItemImageProjectionCompletedResult({
      result: evidence.result,
      inputContract: evidence.inputContract,
    });
    if (sha256Bytes(evidence.inputBytes) !== evidence.result.inputContractSha256) {
      return ['stale_item_image_projection_apply_evidence'];
    }
    if (sha256Bytes(evidence.proposalBytes) !== evidence.inputContract.proposalSha256) {
      return ['item_image_projection_proposal_hash_drifted'];
    }
    if (sha256Bytes(evidence.snapshotBytes) !== evidence.inputContract.snapshotSha256) {
      return ['item_image_projection_snapshot_hash_drifted'];
    }
    const expectedArtifacts = projectionEvidenceArtifactBindings(evidence.inputContract);
    const actualArtifacts = new Map();
    for (const entry of evidence.artifacts) {
      if (actualArtifacts.has(entry?.path)) {
        return ['partial_item_image_projection_apply_evidence'];
      }
      actualArtifacts.set(entry?.path, entry?.bytes);
    }
    for (const binding of expectedArtifacts) {
      const bytes = actualArtifacts.get(binding.path);
      if (bytes == null || sha256Bytes(bytes) !== binding.sha256) {
        return ['partial_item_image_projection_apply_evidence'];
      }
    }
    const rebuiltInput = buildItemImageProjectionInputContract({
      proposal: evidence.proposal,
      proposalPath: evidence.inputContract.proposalPath,
      proposalSha256: evidence.inputContract.proposalSha256,
    });
    if (canonicalItemImageProjectionHash(rebuiltInput)
        !== canonicalItemImageProjectionHash(evidence.inputContract)) {
      return ['item_image_projection_input_binding_drifted'];
    }
    const expectedSnapshot = {
      snapshotKind: 'canonical_item_image_projection_snapshot',
      operationId: evidence.inputContract.operationId,
      contractVersion: evidence.inputContract.contractVersion,
      generatedAt: evidence.inputContract.generatedAt,
      target: evidence.inputContract.target,
      managedUrlPolicy: evidence.inputContract.managedUrlPolicy,
      managedUrlPrefixes: evidence.inputContract.managedUrlPrefixes,
      keys: evidence.inputContract.keys,
      keySetSha256: evidence.inputContract.keySetSha256,
      relationRows: evidence.inputContract.relationRows,
      relationRowsSha256: evidence.inputContract.relationRowsSha256,
      projectionBeforeRows: evidence.inputContract.projectionBeforeRows,
      projectionBeforeSha256: evidence.inputContract.projectionBeforeSha256,
      targetRowCount: evidence.inputContract.targetRowCount,
    };
    if (canonicalItemImageProjectionHash(expectedSnapshot)
        !== canonicalItemImageProjectionHash(evidence.snapshot)) {
      return ['item_image_projection_snapshot_content_drifted'];
    }
  } catch (error) {
    return [classifyItemImageProjectionEvidenceError(error)];
  }

  const frozenKeys = new Set(evidence.inputContract.keys);
  const currentRows = projectionRows
    .filter((row) => frozenKeys.has(firstText(row?.internalName, row?.internal_name)))
    .map((row) => ({
      id: Number(row?.id),
      relationRecordKey: firstText(row?.relationRecordKey, row?.relation_record_key),
      internalName: firstText(row?.internalName, row?.internal_name),
      image: firstText(row?.image),
    }))
    .sort((left, right) => left.internalName.localeCompare(right.internalName));
  if (canonicalItemImageProjectionHash(currentRows)
      !== canonicalItemImageProjectionHash(evidence.inputContract.projectionAfterRows)) {
    return ['item_image_projection_after_rows_drifted'];
  }
  return [];
}

function projectionEvidenceArtifactBindings(inputContract) {
  return [
    {
      path: inputContract.proposalAuthorization.path,
      sha256: inputContract.proposalAuthorization.sha256,
      privateFile: true,
    },
    {
      path: inputContract.lineage.inputContractPath,
      sha256: inputContract.lineage.inputContractSha256,
      privateFile: true,
    },
    {
      path: inputContract.lineage.resultPath,
      sha256: inputContract.lineage.resultSha256,
      privateFile: true,
    },
    {
      path: inputContract.lineage.bundlePath,
      sha256: inputContract.lineage.bundleSha256,
      privateFile: false,
    },
    {
      path: inputContract.lineage.applySnapshotPath,
      sha256: inputContract.lineage.applySnapshotSha256,
      privateFile: true,
    },
    {
      path: inputContract.lineage.authorizationPacketPath,
      sha256: inputContract.lineage.authorizationPacketSha256,
      privateFile: true,
    },
    {
      path: inputContract.managedUrlPolicy.sourcePath,
      sha256: inputContract.managedUrlPolicy.sourceSha256,
      privateFile: false,
    },
  ];
}

function classifyItemImageProjectionEvidenceError(error) {
  const message = String(error?.message ?? error).toLowerCase();
  if (message.includes('count')) return 'item_image_projection_count_drifted';
  if (message.includes('lineage')) return 'item_image_projection_lineage_drifted';
  if (message.includes('target')) return 'item_image_projection_target_drifted';
  if (message.includes('key')) return 'item_image_projection_key_drifted';
  if (message.includes('after')) return 'item_image_projection_after_hash_drifted';
  if (message.includes('managed')) return 'item_image_projection_unmanaged_evidence';
  return 'invalid_item_image_projection_apply_evidence';
}

function classifyItemImageProjectionEvidenceLoadError(error) {
  const message = String(error?.message ?? error).toLowerCase();
  if (error?.code === 'ENOENT' || message.includes('no such file') || message.includes(' is missing')) {
    return 'missing_item_image_projection_apply_evidence';
  }
  return 'invalid_item_image_projection_apply_evidence';
}

function sha256Bytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export async function runImageSourceLineageReport(argv = process.argv.slice(2), dependencies = {}) {
  const args = parseArgs(argv);
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const root = args.repoRoot ? path.resolve(repoRoot, args.repoRoot) : repoRoot;
  const reportPath = resolveImageSourceLineageReportPath({
    generatedAt,
    output: args.output,
    root,
  });

  let itemImageProjectionEvidence = null;
  if (args.source === 'db') {
    const loadEvidence = dependencies.loadEvidence ?? loadItemImageProjectionEvidence;
    try {
      itemImageProjectionEvidence = await loadEvidence({
        repoRoot: root,
        attemptRoot: args.attemptRoot,
      });
    } catch (error) {
      itemImageProjectionEvidence = { loadError: error };
    }
  }
  const loadEntities = dependencies.loadEntities ?? loadEntitiesFromDatabase;
  const entities = args.source === 'db'
    ? await loadEntities(args)
    : {};

  const report = buildImageSourceLineageReport({
    generatedAt,
    reportPath,
    entities,
    managedUrlPrefixes: (dependencies.resolveManagedUrlPrefixes ?? resolveManagedImageUrlPrefixes)({
      repoRoot: root,
    }),
    itemImageProjectionEvidence,
  });
  const output = `${JSON.stringify(report, null, 2)}\n`;

  const writeReport = dependencies.writeReport ?? (async () => {
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, output, 'utf8');
  });
  await writeReport({ reportPath, output, report });
  (dependencies.writeOutput ?? ((value) => process.stdout.write(value)))(output);
  return report;
}

async function main(argv = process.argv.slice(2)) {
  return runImageSourceLineageReport(argv);
}

export async function loadItemImageProjectionEvidence({ repoRoot: root, attemptRoot } = {}) {
  const repositoryRoot = path.resolve(root);
  const paths = resolveItemImageProjectionEvidencePaths({ attemptRoot });
  const inputEntry = await readProjectionEvidenceFile({
    repoRoot: repositoryRoot,
    relativePath: paths.inputPath,
    label: 'projection readiness input contract',
    privateFile: true,
  });
  const inputContract = parseEvidenceJson(inputEntry.bytes, inputEntry.label);
  assertItemImageProjectionInputContract(inputContract);
  const expectedPaths = buildItemImageProjectionAttemptPaths(
    inputContract.proposalAuthorization.decisionIdentity,
  );
  if (expectedPaths.attemptRoot !== paths.attemptRoot
      || inputContract.attemptRoot !== paths.attemptRoot
      || expectedPaths.inputPath !== paths.inputPath
      || expectedPaths.resultPath !== paths.resultPath) {
    throw new Error('projection readiness evidence attempt identity drifted');
  }
  const resultEntry = await readProjectionEvidenceFile({
    repoRoot: repositoryRoot,
    relativePath: paths.resultPath,
    label: 'projection readiness result',
    privateFile: true,
  });
  const proposalEntry = await readProjectionEvidenceFile({
    repoRoot: repositoryRoot,
    relativePath: inputContract.proposalPath,
    label: 'projection readiness proposal',
    privateFile: true,
  });
  const snapshotEntry = await readProjectionEvidenceFile({
    repoRoot: repositoryRoot,
    relativePath: inputContract.snapshotPath,
    label: 'projection readiness snapshot',
    privateFile: true,
  });
  const artifacts = [];
  for (const binding of projectionEvidenceArtifactBindings(inputContract)) {
    const entry = await readProjectionEvidenceFile({
      repoRoot: repositoryRoot,
      relativePath: binding.path,
      label: `projection readiness artifact ${binding.path}`,
      privateFile: binding.privateFile,
    });
    if (sha256Bytes(entry.bytes) !== binding.sha256) {
      throw new Error(`projection readiness artifact hash drifted: ${binding.path}`);
    }
    artifacts.push({ path: binding.path, bytes: entry.bytes });
  }
  return {
    result: parseEvidenceJson(resultEntry.bytes, resultEntry.label),
    inputContract,
    proposal: parseEvidenceJson(proposalEntry.bytes, proposalEntry.label),
    snapshot: parseEvidenceJson(snapshotEntry.bytes, snapshotEntry.label),
    inputBytes: inputEntry.bytes,
    proposalBytes: proposalEntry.bytes,
    snapshotBytes: snapshotEntry.bytes,
    artifacts,
  };
}

async function readProjectionEvidenceFile({ repoRoot: root, relativePath, label, privateFile }) {
  const absolutePath = assertRepositoryPathConfinement({
    repoRoot: root,
    filePath: path.resolve(root, relativePath),
    label,
  });
  assertRepositoryOrdinaryFile({ repoRoot: root, filePath: absolutePath, label });
  const stat = await fs.stat(absolutePath);
  if (privateFile && (stat.mode & 0o077) !== 0) throw new Error(`${label} must be private`);
  return { label, bytes: await fs.readFile(absolutePath) };
}

function parseEvidenceJson(bytes, label) {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    throw new Error(`${label} must contain valid JSON`);
  }
}

export async function loadEntitiesFromDatabase(args, dependencies = {}) {
  const queries = buildImageSourceLineageQueries(args);
  const createConnection = dependencies.createConnection ?? (async (options) => {
    const require = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'));
    const mysql = require('mysql2/promise');
    return mysql.createConnection(options);
  });
  const connection = await createConnection({
    host: process.env.TERRAPEDIA_DB_HOST ?? '127.0.0.1',
    port: Number(process.env.TERRAPEDIA_DB_PORT ?? 3306),
    user: process.env.TERRAPEDIA_DB_USERNAME ?? 'root',
    password: process.env.TERRAPEDIA_DB_PASSWORD ?? 'root',
    database: args.localDatabase,
  });

  let transactionStarted = false;
  try {
    await connection.query('START TRANSACTION READ ONLY');
    transactionStarted = true;
    const entities = {};
    for (const entityType of ENTITY_ORDER) {
      const entityQueries = queries[entityType];
      const coreRows = await queryRows(connection, entityQueries.core);
      const maintImageRows = entityQueries.maintImages ? await queryRows(connection, entityQueries.maintImages) : [];
      const relationImageRows = entityQueries.relationImages ? await queryRows(connection, entityQueries.relationImages) : [];
      const projectionRows = entityQueries.projection ? await queryRows(connection, entityQueries.projection) : [];
      entities[entityType] = { coreRows, maintImageRows, relationImageRows, projectionRows };
    }
    return entities;
  } finally {
    if (transactionStarted) await connection.query('ROLLBACK');
    await connection.end();
  }
}

async function queryRows(connection, sql) {
  const [rows] = await connection.query(sql);
  return Array.isArray(rows) ? rows : [];
}

function countRowsWithImage(rows, accessor) {
  if (typeof accessor !== 'function') {
    return 0;
  }
  return rows.filter((row) => Boolean(accessor(row))).length;
}

function countRowsMatching(rows, predicate) {
  if (typeof predicate !== 'function') {
    return 0;
  }
  return rows.filter((row) => predicate(row)).length;
}

function defaultStructuredImageRowReady(row) {
  return Boolean(firstText(row?.originalUrl, row?.original_url, row?.cachedUrl, row?.cached_url));
}

function countRowsWithManagedProjectionImage(rows, accessor, managedUrlPrefixes) {
  if (typeof accessor !== 'function') {
    return 0;
  }
  return rows.filter((row) => {
    const imageUrl = accessor(row);
    return imageUrl ? isManagedImagePath(imageUrl, managedUrlPrefixes) : false;
  }).length;
}

function countRowsWithWrongManagedImagePrefix(rows, accessor, entityType, managedUrlPrefixes) {
  if (typeof accessor !== 'function') {
    return 0;
  }
  const expectedPrefixes = resolveEntityManagedUrlPrefixes(entityType, managedUrlPrefixes);
  return rows.filter((row) => {
    const imageUrl = accessor(row);
    if (!imageUrl) {
      return false;
    }
    return isManagedImagePath(imageUrl, managedUrlPrefixes) && !isManagedImagePath(imageUrl, expectedPrefixes);
  }).length;
}

function countBlankProjectionRowsWithCoreManagedImageAvailable(coreRows, projectionRows, config, managedUrlPrefixes) {
  if (
    typeof config.coreKeyAccessor !== 'function'
    || typeof config.coreImageAccessor !== 'function'
    || typeof config.projectionKeyAccessor !== 'function'
    || typeof config.projectionImageAccessor !== 'function'
  ) {
    return 0;
  }

  const coreKeysWithManagedImages = new Set();
  for (const row of coreRows) {
    const key = normalizeEntityKey(config.coreKeyAccessor(row));
    const imageUrl = config.coreImageAccessor(row);
    if (key && imageUrl && isManagedImagePath(imageUrl, managedUrlPrefixes)) {
      coreKeysWithManagedImages.add(key);
    }
  }

  return projectionRows.filter((row) => {
    if (config.projectionImageAccessor(row)) {
      return false;
    }
    const key = normalizeEntityKey(config.projectionKeyAccessor(row));
    return key ? coreKeysWithManagedImages.has(key) : false;
  }).length;
}

function relationImageAccessor(entityType) {
  if (entityType === 'bosses') {
    return (row) => firstText(row?.imageUrl, row?.image_url);
  }
  return (row) => firstText(row?.cachedUrl, row?.cached_url, row?.imageUrl, row?.image_url);
}

function deriveMaintTableName(entityType) {
  if (entityType === 'items') return 'maint_item_images';
  if (entityType === 'npcs') return 'maint_npc_images';
  if (entityType === 'bosses') return 'maint_bosses';
  if (entityType === 'buffs') return 'maint_buffs';
  if (entityType === 'projectiles') return 'maint_projectiles';
  return null;
}

function deriveRelationTableName(entityType) {
  if (entityType === 'items') return 'relation_item_images';
  if (entityType === 'npcs') return 'relation_npc_images';
  if (entityType === 'bosses') return 'relation_bosses';
  if (entityType === 'buffs') return 'relation_buff_images';
  if (entityType === 'projectiles') return 'relation_projectile_images';
  return null;
}

function deriveProjectionTableName(entityType) {
  if (entityType === 'items') return 'projection_items';
  if (entityType === 'buffs') return 'projection_buffs';
  if (entityType === 'npcs') return 'projection_npcs';
  if (entityType === 'bosses') return 'projection_bosses';
  if (entityType === 'projectiles') return 'projection_projectiles';
  if (entityType === 'armor_sets') return 'projection_armor_sets';
  return null;
}

function resolveEntityManagedUrlPrefixes(entityType, managedUrlPrefixes = []) {
  if (entityType === 'npcs') {
    return (Array.isArray(managedUrlPrefixes) ? managedUrlPrefixes : []).filter((prefix) => /\/npcs\/$/i.test(prefix));
  }
  if (entityType === 'projectiles') {
    return (Array.isArray(managedUrlPrefixes) ? managedUrlPrefixes : []).filter((prefix) => /\/projectiles\/$/i.test(prefix));
  }
  if (entityType === 'items') {
    return (Array.isArray(managedUrlPrefixes) ? managedUrlPrefixes : []).filter((prefix) => /\/items\/$/i.test(prefix));
  }
  if (entityType === 'buffs') {
    const configured = (Array.isArray(managedUrlPrefixes) ? managedUrlPrefixes : []).filter((prefix) => /\/buffs\/$/i.test(prefix));
    return [...new Set([...configured, ...BUFF_MANAGED_IMAGE_URL_PREFIXES])];
  }
  if (entityType !== 'bosses') {
    return managedUrlPrefixes;
  }
  return [...new Set([...(Array.isArray(managedUrlPrefixes) ? managedUrlPrefixes : []), ...BOSS_MANAGED_IMAGE_URL_PREFIXES])];
}

function hasBossLineageEvidence(row) {
  return Boolean(
    firstText(row?.imageUrl, row?.image_url)
    && firstText(
      row?.sourcePage,
      row?.source_page,
      row?.sourceProvider,
      row?.source_provider,
      row?.sourceRevisionTimestamp,
      row?.source_revision_timestamp,
      row?.sourceMaintTable,
      row?.source_maint_table,
    )
  );
}

function parseJsonField(rawJson, field) {
  const text = firstText(rawJson);
  if (!text) return null;
  try {
    const payload = JSON.parse(text);
    return firstText(payload?.[field]);
  } catch {
    return null;
  }
}

function qualified(database, tableName) {
  return `${quoteIdentifier(database)}.${quoteIdentifier(tableName)}`;
}

function quoteIdentifier(value) {
  const text = String(value ?? '');
  if (!/^[A-Za-z0-9_]+$/.test(text)) {
    throw new Error(`Invalid identifier: ${text}`);
  }
  return `\`${text}\``;
}

function firstText(...values) {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function arrayValues(...values) {
  return values.flatMap((value) => {
    if (Array.isArray(value)) {
      return value;
    }
    if (value == null) {
      return [];
    }
    return [value];
  });
}

function normalizeEntityKey(value) {
  const text = firstText(value);
  return text ? text.toLowerCase() : null;
}

function toDateTag(value) {
  const date = value instanceof Date ? value : new Date(value);
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toCamelCase(value) {
  return String(value).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
