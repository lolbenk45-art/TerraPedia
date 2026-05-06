#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { getProjectRoot } from '../lib/project-root.mjs';
import { DEFAULT_MANAGED_IMAGE_URL_PREFIXES, isManagedImageUrl } from '../relation/managed-image-url-policy.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = getProjectRoot();
const DEFAULT_MAINT_DATABASE = 'terria_v1_maint';
const DEFAULT_RELATION_DATABASE = 'terria_v1_relation';
const DEFAULT_LOCAL_DATABASE = 'terria_v1_local';
const ENTITY_ORDER = ['items', 'buffs', 'npcs', 'projectiles', 'biomes'];

const ENTITY_CONFIG = {
  items: {
    contractKey: 'item.image',
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
    projectionQuery: () => `
SELECT \`id\`, \`internal_name\` AS internalName, \`image\`
FROM \`projection_items\`
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
    coreQuery: (localDatabase) => `
SELECT \`id\`, \`internal_name\` AS internalName, \`english_name\` AS englishName, \`name_zh\` AS nameZh, \`image\`, \`image_path\` AS imagePath
FROM ${qualified(localDatabase, 'buffs')}
WHERE \`deleted\` = 0
ORDER BY \`id\` ASC
`.trim(),
    projectionQuery: () => `
SELECT \`id\`, \`internal_name\` AS internalName, \`image\`
FROM \`projection_buffs\`
WHERE \`deleted\` = 0
ORDER BY \`id\` ASC
`.trim(),
    projectionImageField: 'image',
    coreImageAccessor: (row) => firstText(row?.image, row?.imagePath, row?.image_path),
    projectionKeyAccessor: (row) => firstText(row?.internalName, row?.internal_name),
    projectionImageAccessor: (row) => firstText(row?.image),
    requiresMaintTable: false,
    requiresRelationTable: false,
    requiresRelationRowsForReady: false,
  },
  npcs: {
    contractKey: 'npc.imageUrl',
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
    projectionQuery: () => `
SELECT \`id\`, \`internal_name\` AS internalName, \`image_url\` AS imageUrl
FROM \`projection_npcs\`
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
  projectiles: {
    contractKey: 'projectile.imageUrl',
    coreQuery: (localDatabase) => `
SELECT \`id\`, \`internal_name\` AS internalName, \`name\`, \`name_zh\` AS nameZh, \`image_url\` AS imageUrl, \`raw_json\` AS rawJson
FROM ${qualified(localDatabase, 'projectiles')}
WHERE \`deleted\` = 0
ORDER BY \`id\` ASC
`.trim(),
    projectionQuery: () => `
SELECT \`id\`, \`internal_name\` AS internalName, \`image_url\` AS imageUrl
FROM \`projection_projectiles\`
WHERE \`deleted\` = 0
ORDER BY \`id\` ASC
`.trim(),
    projectionImageField: 'imageUrl',
    coreImageAccessor: (row) => firstText(row?.imageUrl, row?.image_url, parseJsonField(row?.rawJson, 'imageUrl')),
    projectionKeyAccessor: (row) => firstText(row?.internalName, row?.internal_name),
    projectionImageAccessor: (row) => firstText(row?.imageUrl, row?.image_url),
    requiresMaintTable: false,
    requiresRelationTable: false,
    requiresRelationRowsForReady: false,
  },
  biomes: {
    contractKey: 'biome.iconUrl',
    coreQuery: (localDatabase) => `
SELECT \`id\`, \`code\`, \`name_en\` AS nameEn, \`name_zh\` AS nameZh, \`icon_url\` AS iconUrl, \`raw_json\` AS rawJson
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
      const entry = {
        core: config.coreQuery(localDatabase),
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

  const coreImageCount = countRowsWithImage(coreRows, config.coreImageAccessor);
  const maintStructuredCount = countStructuredImageRows(maintImageRows);
  const relationStructuredCount = countStructuredImageRows(relationImageRows);
  const projectionImageCount = countRowsWithImage(projectionRows, config.projectionImageAccessor);
  const projectionManagedCount = countRowsWithManagedProjectionImage(projectionRows, config.projectionImageAccessor, managedUrlPrefixes);
  const hasProjectionField = Boolean(config.projectionImageField);

  if (coreImageCount === 0) {
    gapReasons.push('missing_core_image_evidence');
  }
  if (config.requiresMaintTable === false) {
    gapReasons.push('missing_maint_image_table');
  } else if (maintImageRows.length === 0) {
    gapReasons.push('missing_maint_image_rows');
  }
  if (config.requiresRelationTable === false) {
    gapReasons.push('missing_relation_image_table');
  } else if (relationImageRows.length === 0) {
    gapReasons.push('missing_relation_image_rows');
  }
  if (!hasProjectionField) {
    gapReasons.push('missing_projection_image_field');
  } else if (projectionRows.length === 0) {
    gapReasons.push('missing_projection_rows');
  } else if (projectionImageCount === 0) {
    gapReasons.push('missing_projection_image_values');
  } else if (projectionManagedCount < projectionImageCount) {
    gapReasons.push('projection_image_not_managed');
  }
  if (config.requiresMaintTable && maintImageRows.length > 0 && maintStructuredCount === 0) {
    gapReasons.push('maint_rows_missing_original_or_cached_url');
  }
  if (config.requiresRelationTable && relationImageRows.length > 0 && relationStructuredCount === 0) {
    gapReasons.push('relation_rows_missing_original_or_cached_url');
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
      },
      projection: {
        table: config.projectionQuery ? deriveProjectionTableName(entityType) : null,
        imageField: config.projectionImageField ?? null,
        rowCount: projectionRows.length,
        rowsWithImage: projectionImageCount,
        rowsWithManagedImage: projectionManagedCount,
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

function countStructuredImageRows(rows) {
  return rows.filter((row) => firstText(row?.originalUrl, row?.original_url, row?.cachedUrl, row?.cached_url)).length;
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

function deriveMaintTableName(entityType) {
  if (entityType === 'items') return 'maint_item_images';
  if (entityType === 'npcs') return 'maint_npc_images';
  return null;
}

function deriveRelationTableName(entityType) {
  if (entityType === 'items') return 'relation_item_images';
  if (entityType === 'npcs') return 'relation_npc_images';
  return null;
}

function deriveProjectionTableName(entityType) {
  if (entityType === 'items') return 'projection_items';
  if (entityType === 'buffs') return 'projection_buffs';
  if (entityType === 'npcs') return 'projection_npcs';
  if (entityType === 'projectiles') return 'projection_projectiles';
  return null;
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
