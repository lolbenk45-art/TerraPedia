#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { getProjectRoot } from '../lib/project-root.mjs';
import {
  DEFAULT_MANAGED_IMAGE_URL_PREFIXES,
  isManagedImageUrl,
  resolveManagedImageUrlPrefixes,
} from '../relation/managed-image-url-policy.mjs';

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
SELECT \`id\`, \`internal_name\` AS internalName, \`image\`
FROM ${qualified(relationDatabase, 'projection_items')}
WHERE \`deleted\` = 0
ORDER BY \`id\` ASC
`.trim(),
    projectionImageField: 'image',
    coreImageAccessor: (row) => firstText(row?.image),
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
SELECT \`id\`, \`internal_name\` AS internalName, \`english_name\` AS englishName, \`name_zh\` AS nameZh, \`image\`
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
    coreImageAccessor: (row) => firstText(row?.image, row?.imagePath, row?.image_path),
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
    coreQuery: (relationDatabase) => `
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
    coreImageAccessor: (row) => firstText(row?.maleImages, row?.male_images, row?.femaleImages, row?.female_images, row?.specialImages, row?.special_images),
    projectionKeyAccessor: (row) => firstText(row?.sourceKey, row?.source_key, row?.textKey, row?.text_key),
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
    output: raw.output ?? null,
    repoRoot: raw.repoRoot ?? null,
    generatedAt: raw.generatedAt ?? null,
    maintDatabase: raw.maintDatabase ?? DEFAULT_MAINT_DATABASE,
    relationDatabase: raw.relationDatabase ?? DEFAULT_RELATION_DATABASE,
    localDatabase: raw.localDatabase ?? DEFAULT_LOCAL_DATABASE,
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
        core: config.coreQuery(coreDatabaseName),
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
} = {}) {
  const entityReports = {};

  for (const entityType of ENTITY_ORDER) {
    entityReports[entityType] = summarizeEntityLineage(entityType, entities[entityType] ?? {}, managedUrlPrefixes);
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

function summarizeEntityLineage(entityType, entityData, managedUrlPrefixes) {
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
      },
    },
  };
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const root = args.repoRoot ? path.resolve(repoRoot, args.repoRoot) : repoRoot;
  const reportPath = resolveImageSourceLineageReportPath({
    generatedAt,
    output: args.output,
    root,
  });

  const entities = args.source === 'db'
    ? await loadEntitiesFromDatabase(args)
    : {};

  const report = buildImageSourceLineageReport({
    generatedAt,
    reportPath,
    entities,
    managedUrlPrefixes: resolveManagedImageUrlPrefixes({ repoRoot: root }),
  });
  const output = `${JSON.stringify(report, null, 2)}\n`;

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, output, 'utf8');
  process.stdout.write(output);
}

async function loadEntitiesFromDatabase(args) {
  const queries = buildImageSourceLineageQueries(args);
  const require = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'));
  const mysql = require('mysql2/promise');
  const connection = await mysql.createConnection({
    host: process.env.TERRAPEDIA_DB_HOST ?? '127.0.0.1',
    port: Number(process.env.TERRAPEDIA_DB_PORT ?? 3306),
    user: process.env.TERRAPEDIA_DB_USERNAME ?? 'root',
    password: process.env.TERRAPEDIA_DB_PASSWORD ?? 'root',
    database: args.localDatabase,
  });

  try {
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
    return imageUrl ? isManagedImageUrl(imageUrl, managedUrlPrefixes) : false;
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
    return isManagedImageUrl(imageUrl, managedUrlPrefixes) && !isManagedImageUrl(imageUrl, expectedPrefixes);
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
