#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { parseCliArgs } from '../lib/wiki-item-utils.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

const args = parseCliArgs(process.argv.slice(2));
const apply = booleanOption(args.apply, false);
const allowNonPrimaryDb = booleanOption(
  args['allow-non-primary-db'] ?? args.allowNonPrimaryDb ?? process.env.TERRAPEDIA_ALLOW_NON_PRIMARY_DB,
  false
);
const dateTag = new Date().toISOString().slice(0, 10);
const shimmerRawPath = path.resolve(args.raw ?? path.join(repoRoot, 'data', 'generated', 'wiki-shimmer.latest.json'));
const shimmerDir = path.resolve(args.input ?? path.join(repoRoot, 'data', 'generated', 'shimmer'));
const reportPath = path.resolve(args.output ?? path.join(repoRoot, 'reports', `wiki-shimmer-db-import-${dateTag}.json`));

const config = loadLocalStackConfig(repoRoot);
const db = {
  host: args.host ?? process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
  port: Number(args.port ?? process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 3306),
  user: args.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
  password: args.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
  database: args.database ?? process.env.TERRAPEDIA_DB_NAME ?? config.database?.name ?? 'terria_v1_local'
};

assertPrimaryDb(db.database, apply, allowNonPrimaryDb);

const requiredFiles = {
  raw: shimmerRawPath,
  context: path.join(shimmerDir, 'wiki-shimmer-context.importable.latest.json'),
  itemTransforms: path.join(shimmerDir, 'wiki-shimmer-item-transforms.importable.latest.json'),
  decraftRules: path.join(shimmerDir, 'wiki-shimmer-decraft-rules.importable.latest.json'),
  entityTransforms: path.join(shimmerDir, 'wiki-shimmer-entity-transforms.importable.latest.json'),
  npcTransforms: path.join(shimmerDir, 'wiki-shimmer-npc-transforms.importable.latest.json'),
  manifest: path.join(shimmerDir, 'wiki-shimmer-manifest.latest.json')
};

for (const [label, filePath] of Object.entries(requiredFiles)) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label} file: ${filePath}`);
  }
}

const rawPayload = readJson(requiredFiles.raw);
const contextPayload = readJson(requiredFiles.context);
const itemTransformsPayload = readJson(requiredFiles.itemTransforms);
const decraftRulesPayload = readJson(requiredFiles.decraftRules);
const entityTransformsPayload = readJson(requiredFiles.entityTransforms);
const npcTransformsPayload = readJson(requiredFiles.npcTransforms);
const manifestPayload = readJson(requiredFiles.manifest);

const conn = await mysql.createConnection(db);
try {
  await conn.query('SET NAMES utf8mb4');

  const summary = {
    generatedAt: new Date().toISOString(),
    apply,
    database: db.database,
    reportPath,
    input: {
      raw: path.relative(repoRoot, requiredFiles.raw).replaceAll('\\', '/'),
      directory: path.relative(repoRoot, shimmerDir).replaceAll('\\', '/')
    },
    counts: {
      itemTransforms: Array.isArray(itemTransformsPayload.records) ? itemTransformsPayload.records.length : 0,
      decraftRules: Array.isArray(decraftRulesPayload.records) ? decraftRulesPayload.records.length : 0,
      entityTransforms: Array.isArray(entityTransformsPayload.records) ? entityTransformsPayload.records.length : 0,
      npcTransforms: Array.isArray(npcTransformsPayload.records) ? npcTransformsPayload.records.length : 0,
      unresolvedTitles: Number(manifestPayload?.resolution?.unresolvedCount ?? 0)
    },
    before: {
      shimmerWorldContext: await loadWorldContextByCode(conn, 'SHIMMER'),
      shimmerSnapshots: await loadSnapshotStats(conn, rawPayload.pageTitle ?? '\u5fae\u5149'),
      shimmerTables: await loadShimmerTableStats(conn)
    },
    worldContext: {
      created: 0,
      updated: 0,
      id: null
    },
    snapshots: {
      created: 0,
      updated: 0,
      entries: []
    },
    shimmerTables: {
      itemTransforms: { created: 0, replaced: 0 },
      decraftRules: { created: 0, replaced: 0 },
      entityTransforms: { created: 0, replaced: 0 },
      npcTransforms: { created: 0, replaced: 0 }
    }
  };

  if (apply) {
    await conn.beginTransaction();
  }

  await ensureShimmerTables(conn, apply);

  const worldContextId = await upsertWorldContext(conn, contextPayload.worldContext, summary.worldContext, apply);
  summary.worldContext.id = worldContextId;

  const snapshotDefinitions = [
    buildSnapshotDefinition('wiki_shimmer_page', rawPayload, requiredFiles.raw, rawPayload, 'wiki_page'),
    buildSnapshotDefinition('wiki_shimmer_context', contextPayload, requiredFiles.context, contextPayload, 'generated_json'),
    buildSnapshotDefinition('wiki_shimmer_item_transforms', itemTransformsPayload, requiredFiles.itemTransforms, contextPayload, 'generated_json'),
    buildSnapshotDefinition('wiki_shimmer_decraft_rules', decraftRulesPayload, requiredFiles.decraftRules, contextPayload, 'generated_json'),
    buildSnapshotDefinition('wiki_shimmer_entity_transforms', entityTransformsPayload, requiredFiles.entityTransforms, contextPayload, 'generated_json'),
    buildSnapshotDefinition('wiki_shimmer_npc_transforms', npcTransformsPayload, requiredFiles.npcTransforms, contextPayload, 'generated_json'),
    buildSnapshotDefinition('wiki_shimmer_manifest', manifestPayload, requiredFiles.manifest, contextPayload, 'generated_json')
  ];

  for (const definition of snapshotDefinitions) {
    const result = await upsertSnapshot(conn, definition, apply);
    summary.snapshots[result.action] += 1;
    summary.snapshots.entries.push({
      entityType: definition.entityType,
      action: result.action,
      sourceLocator: definition.sourceLocator,
      parseStatus: definition.parseStatus
    });
  }

  await importShimmerItemTransforms(
    conn,
    contextPayload.worldContext.code,
    itemTransformsPayload.records ?? [],
    summary.shimmerTables.itemTransforms,
    apply
  );
  await importShimmerDecraftRules(
    conn,
    contextPayload.worldContext.code,
    decraftRulesPayload.records ?? [],
    summary.shimmerTables.decraftRules,
    apply
  );
  await importShimmerEntityTransforms(
    conn,
    contextPayload.worldContext.code,
    entityTransformsPayload.records ?? [],
    summary.shimmerTables.entityTransforms,
    apply
  );
  await importShimmerNpcTransforms(
    conn,
    contextPayload.worldContext.code,
    npcTransformsPayload.records ?? [],
    summary.shimmerTables.npcTransforms,
    apply
  );

  if (apply) {
    await conn.commit();
  }

  summary.after = {
    shimmerWorldContext: await loadWorldContextByCode(conn, 'SHIMMER'),
    shimmerSnapshots: await loadSnapshotStats(conn, rawPayload.pageTitle ?? '\u5fae\u5149'),
    shimmerTables: await loadShimmerTableStats(conn)
  };

  await fs.promises.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.promises.writeFile(reportPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  if (apply) {
    await conn.rollback();
  }
  throw error;
} finally {
  await conn.end();
}

async function ensureShimmerTables(connection, shouldApply) {
  if (!shouldApply) {
    return;
  }

  await connection.query(`
    CREATE TABLE IF NOT EXISTS shimmer_item_transforms (
      id BIGINT NOT NULL AUTO_INCREMENT,
      context_code VARCHAR(100) NOT NULL,
      input_kind VARCHAR(32) NOT NULL,
      input_name_en VARCHAR(255) DEFAULT NULL,
      input_name_zh VARCHAR(255) DEFAULT NULL,
      input_internal_name VARCHAR(255) DEFAULT NULL,
      output_kind VARCHAR(32) NOT NULL,
      output_name_en VARCHAR(255) DEFAULT NULL,
      output_name_zh VARCHAR(255) DEFAULT NULL,
      output_internal_name VARCHAR(255) DEFAULT NULL,
      conditions_json LONGTEXT DEFAULT NULL,
      notes TEXT DEFAULT NULL,
      source_provider VARCHAR(64) DEFAULT NULL,
      source_page VARCHAR(255) DEFAULT NULL,
      source_revision_timestamp DATETIME DEFAULT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      status INT NOT NULL DEFAULT 1,
      deleted TINYINT NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_shimmer_item_transforms_source (source_provider, source_page),
      INDEX idx_shimmer_item_transforms_context (context_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS shimmer_decraft_rules (
      id BIGINT NOT NULL AUTO_INCREMENT,
      context_code VARCHAR(100) NOT NULL,
      rule_type VARCHAR(64) NOT NULL,
      group_label VARCHAR(255) DEFAULT NULL,
      input_kind VARCHAR(32) NOT NULL,
      input_name_en VARCHAR(255) DEFAULT NULL,
      input_name_zh VARCHAR(255) DEFAULT NULL,
      input_internal_name VARCHAR(255) DEFAULT NULL,
      outputs_json LONGTEXT DEFAULT NULL,
      conditions_json LONGTEXT DEFAULT NULL,
      notes TEXT DEFAULT NULL,
      source_provider VARCHAR(64) DEFAULT NULL,
      source_page VARCHAR(255) DEFAULT NULL,
      source_revision_timestamp DATETIME DEFAULT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      status INT NOT NULL DEFAULT 1,
      deleted TINYINT NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_shimmer_decraft_rules_source (source_provider, source_page),
      INDEX idx_shimmer_decraft_rules_context (context_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS shimmer_entity_transforms (
      id BIGINT NOT NULL AUTO_INCREMENT,
      context_code VARCHAR(100) NOT NULL,
      transform_group VARCHAR(64) NOT NULL,
      input_entity_type VARCHAR(32) DEFAULT NULL,
      input_name_en VARCHAR(255) DEFAULT NULL,
      input_name_zh VARCHAR(255) DEFAULT NULL,
      input_internal_name VARCHAR(255) DEFAULT NULL,
      output_entity_type VARCHAR(32) DEFAULT NULL,
      output_name_en VARCHAR(255) DEFAULT NULL,
      output_name_zh VARCHAR(255) DEFAULT NULL,
      output_internal_name VARCHAR(255) DEFAULT NULL,
      source_provider VARCHAR(64) DEFAULT NULL,
      source_page VARCHAR(255) DEFAULT NULL,
      source_revision_timestamp DATETIME DEFAULT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      status INT NOT NULL DEFAULT 1,
      deleted TINYINT NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_shimmer_entity_transforms_source (source_provider, source_page),
      INDEX idx_shimmer_entity_transforms_context (context_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS shimmer_npc_transforms (
      id BIGINT NOT NULL AUTO_INCREMENT,
      context_code VARCHAR(100) NOT NULL,
      npc_name_en VARCHAR(255) DEFAULT NULL,
      npc_name_zh VARCHAR(255) DEFAULT NULL,
      npc_internal_name VARCHAR(255) DEFAULT NULL,
      appearance_variant VARCHAR(64) DEFAULT NULL,
      effect_type VARCHAR(64) DEFAULT NULL,
      variant_image_url VARCHAR(500) DEFAULT NULL,
      variant_image_alt VARCHAR(255) DEFAULT NULL,
      notes TEXT DEFAULT NULL,
      source_provider VARCHAR(64) DEFAULT NULL,
      source_page VARCHAR(255) DEFAULT NULL,
      source_revision_timestamp DATETIME DEFAULT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      status INT NOT NULL DEFAULT 1,
      deleted TINYINT NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_shimmer_npc_transforms_source (source_provider, source_page),
      INDEX idx_shimmer_npc_transforms_context (context_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function buildSnapshotDefinition(entityType, payload, absolutePath, sourceMetaPayload, sourceKind) {
  const unresolvedCount = Number(payload?.resolution?.unresolvedCount ?? 0);
  const page = sourceMetaPayload?.page ?? {};
  return {
    entityType,
    provider: toText(payload?.sourceProvider) ?? 'wiki_zh',
    sourceKind,
    sourceLocator: path.relative(repoRoot, absolutePath).replaceAll('\\', '/'),
    sourcePage: toText(page?.sourcePage) ?? toText(sourceMetaPayload?.pageTitle) ?? '\u5fae\u5149',
    sourceRevisionTimestamp: toDateTime(page?.sourceRevisionTimestamp ?? sourceMetaPayload?.revisionTimestamp),
    payloadJson: JSON.stringify(payload),
    fetchedAt: toDateTime(payload?.generatedAt ?? new Date().toISOString()),
    parseStatus: unresolvedCount > 0 ? 'partial' : 'parsed'
  };
}

async function upsertWorldContext(connection, worldContext, stats, shouldApply) {
  const payload = normalizeWorldContext(worldContext);
  const existing = await loadWorldContextByCode(connection, payload.code);
  const nextId = existing?.id ?? null;

  if (!shouldApply) {
    if (existing) stats.updated += 1;
    else stats.created += 1;
    return nextId;
  }

  if (existing) {
    await connection.execute(
      `UPDATE world_contexts
          SET name_en = ?,
              name_zh = ?,
              context_type = ?,
              description = ?,
              icon_url = ?,
              sort_order = ?,
              status = 1,
              deleted = 0,
              updated_at = NOW()
        WHERE id = ?`,
      [
        payload.nameEn,
        payload.nameZh,
        payload.contextType,
        payload.description,
        payload.iconUrl,
        payload.sortOrder,
        existing.id
      ]
    );
    stats.updated += 1;
    return existing.id;
  }

  const [result] = await connection.execute(
    `INSERT INTO world_contexts
      (code, name_en, name_zh, context_type, description, icon_url, sort_order, status, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)`,
    [
      payload.code,
      payload.nameEn,
      payload.nameZh,
      payload.contextType,
      payload.description,
      payload.iconUrl,
      payload.sortOrder
    ]
  );
  stats.created += 1;
  return Number(result.insertId);
}

function normalizeWorldContext(worldContext) {
  return {
    code: toText(worldContext?.code) ?? 'SHIMMER',
    nameEn: toText(worldContext?.nameEn) ?? 'Shimmer',
    nameZh: toText(worldContext?.nameZh) ?? '\u5fae\u5149',
    contextType: toText(worldContext?.contextType) ?? 'ENVIRONMENT',
    description: toText(worldContext?.description),
    iconUrl: toText(worldContext?.iconUrl),
    sortOrder: Number.isFinite(Number(worldContext?.sortOrder)) ? Number(worldContext.sortOrder) : 30
  };
}

async function upsertSnapshot(connection, definition, shouldApply) {
  const [existingRows] = await connection.execute(
    `SELECT id
       FROM entity_source_snapshots
      WHERE entity_type = ?
        AND provider = ?
        AND source_kind = ?
        AND COALESCE(source_locator, '') = ?
      LIMIT 1`,
    [definition.entityType, definition.provider, definition.sourceKind, definition.sourceLocator]
  );

  const action = existingRows.length > 0 ? 'updated' : 'created';
  if (!shouldApply) {
    return { action };
  }

  const payload = [
    definition.entityType,
    null,
    definition.provider,
    definition.sourceKind,
    definition.sourceLocator,
    definition.sourcePage,
    definition.sourceRevisionTimestamp,
    definition.payloadJson,
    definition.fetchedAt,
    1,
    definition.parseStatus
  ];

  if (existingRows.length > 0) {
    await connection.execute(
      `UPDATE entity_source_snapshots
          SET entity_type = ?,
              entity_id = ?,
              provider = ?,
              source_kind = ?,
              source_locator = ?,
              source_page = ?,
              source_revision_timestamp = ?,
              payload_json = ?,
              fetched_at = ?,
              is_current = ?,
              parse_status = ?,
              updated_at = NOW()
        WHERE id = ?`,
      [...payload, Number(existingRows[0].id)]
    );
  } else {
    await connection.execute(
      `INSERT INTO entity_source_snapshots
        (entity_type, entity_id, provider, source_kind, source_locator, source_page, source_revision_timestamp, payload_json, fetched_at, is_current, parse_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      payload
    );
  }

  return { action };
}

async function loadWorldContextByCode(connection, code) {
  const [[row]] = await connection.execute(
    `SELECT id, code, name_en AS nameEn, name_zh AS nameZh, context_type AS contextType, sort_order AS sortOrder
       FROM world_contexts
      WHERE code = ?
      LIMIT 1`,
    [code]
  );
  return row
    ? {
        id: Number(row.id),
        code: row.code,
        nameEn: row.nameEn,
        nameZh: row.nameZh,
        contextType: row.contextType,
        sortOrder: Number(row.sortOrder ?? 0)
      }
    : null;
}

async function loadSnapshotStats(connection, sourcePage) {
  const [rows] = await connection.execute(
    `SELECT entity_type AS entityType,
            parse_status AS parseStatus,
            COUNT(*) AS count
       FROM entity_source_snapshots
      WHERE provider = 'wiki_zh'
        AND source_page = ?
      GROUP BY entity_type, parse_status
      ORDER BY entity_type ASC, parse_status ASC`,
    [sourcePage]
  );
  return rows.map((row) => ({
    entityType: row.entityType,
    parseStatus: row.parseStatus,
    count: Number(row.count ?? 0)
  }));
}

async function loadShimmerTableStats(connection) {
  const tables = [
    'shimmer_item_transforms',
    'shimmer_decraft_rules',
    'shimmer_entity_transforms',
    'shimmer_npc_transforms'
  ];
  const stats = {};
  for (const table of tables) {
    try {
      const [[row]] = await connection.query(
        `SELECT COUNT(*) AS c
           FROM ${table}
          WHERE deleted = 0
            AND COALESCE(source_provider, '') = 'wiki_zh'
            AND source_page = ?`,
        ['\u5fae\u5149']
      );
      stats[table] = Number(row.c ?? 0);
    } catch {
      stats[table] = null;
    }
  }
  return stats;
}

async function importShimmerItemTransforms(connection, contextCode, records, stats, shouldApply) {
  const count = Array.isArray(records) ? records.length : 0;
  if (!shouldApply) {
    stats.created = count;
    return;
  }
  const existingCount = await replaceSourceScopedRows(connection, 'shimmer_item_transforms');
  stats.replaced = existingCount;
  for (const [index, record] of records.entries()) {
    await connection.execute(
      `INSERT INTO shimmer_item_transforms
        (context_code, input_kind, input_name_en, input_name_zh, input_internal_name, output_kind, output_name_en, output_name_zh, output_internal_name, conditions_json, notes, source_provider, source_page, source_revision_timestamp, sort_order, status, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        contextCode,
        toText(record?.inputKind) ?? 'item',
        toText(record?.inputNameEn),
        toText(record?.inputNameZh),
        toText(record?.inputInternalName),
        toText(record?.outputKind) ?? 'item',
        toText(record?.outputNameEn),
        toText(record?.outputNameZh),
        toText(record?.outputInternalName),
        JSON.stringify(Array.isArray(record?.conditions) ? record.conditions : []),
        toText(record?.notes),
        'wiki_zh',
        toText(record?.sourcePage) ?? '\u5fae\u5149',
        toDateTime(record?.sourceRevisionTimestamp),
        index + 1
      ]
    );
  }
  stats.created = count;
}

async function importShimmerDecraftRules(connection, contextCode, records, stats, shouldApply) {
  const count = Array.isArray(records) ? records.length : 0;
  if (!shouldApply) {
    stats.created = count;
    return;
  }
  const existingCount = await replaceSourceScopedRows(connection, 'shimmer_decraft_rules');
  stats.replaced = existingCount;
  for (const [index, record] of records.entries()) {
    await connection.execute(
      `INSERT INTO shimmer_decraft_rules
        (context_code, rule_type, group_label, input_kind, input_name_en, input_name_zh, input_internal_name, outputs_json, conditions_json, notes, source_provider, source_page, source_revision_timestamp, sort_order, status, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        contextCode,
        toText(record?.ruleType),
        toText(record?.groupLabel),
        toText(record?.input?.kind) ?? 'item',
        toText(record?.input?.nameEn),
        toText(record?.input?.nameZh),
        toText(record?.input?.internalName),
        JSON.stringify(Array.isArray(record?.outputs) ? record.outputs : []),
        JSON.stringify(Array.isArray(record?.conditions) ? record.conditions : []),
        toText(record?.notes),
        'wiki_zh',
        toText(record?.sourcePage) ?? '\u5fae\u5149',
        toDateTime(record?.sourceRevisionTimestamp),
        index + 1
      ]
    );
  }
  stats.created = count;
}

async function importShimmerEntityTransforms(connection, contextCode, records, stats, shouldApply) {
  const count = Array.isArray(records) ? records.length : 0;
  if (!shouldApply) {
    stats.created = count;
    return;
  }
  const existingCount = await replaceSourceScopedRows(connection, 'shimmer_entity_transforms');
  stats.replaced = existingCount;
  for (const [index, record] of records.entries()) {
    await connection.execute(
      `INSERT INTO shimmer_entity_transforms
        (context_code, transform_group, input_entity_type, input_name_en, input_name_zh, input_internal_name, output_entity_type, output_name_en, output_name_zh, output_internal_name, source_provider, source_page, source_revision_timestamp, sort_order, status, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        contextCode,
        toText(record?.transformGroup),
        toText(record?.input?.kind),
        toText(record?.input?.nameEn),
        toText(record?.input?.nameZh),
        toText(record?.input?.internalName),
        toText(record?.output?.kind),
        toText(record?.output?.nameEn),
        toText(record?.output?.nameZh),
        toText(record?.output?.internalName),
        'wiki_zh',
        toText(record?.sourcePage) ?? '\u5fae\u5149',
        toDateTime(record?.sourceRevisionTimestamp),
        index + 1
      ]
    );
  }
  stats.created = count;
}

async function importShimmerNpcTransforms(connection, contextCode, records, stats, shouldApply) {
  const count = Array.isArray(records) ? records.length : 0;
  if (!shouldApply) {
    stats.created = count;
    return;
  }
  const existingCount = await replaceSourceScopedRows(connection, 'shimmer_npc_transforms');
  stats.replaced = existingCount;
  for (const [index, record] of records.entries()) {
    await connection.execute(
      `INSERT INTO shimmer_npc_transforms
        (context_code, npc_name_en, npc_name_zh, npc_internal_name, appearance_variant, effect_type, variant_image_url, variant_image_alt, notes, source_provider, source_page, source_revision_timestamp, sort_order, status, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        contextCode,
        toText(record?.npc?.nameEn),
        toText(record?.npc?.nameZh),
        toText(record?.npc?.internalName),
        toText(record?.appearanceVariant),
        toText(record?.effectType),
        toText(record?.variantImageUrl),
        toText(record?.variantImageAlt),
        toText(record?.notes),
        'wiki_zh',
        toText(record?.sourcePage) ?? '\u5fae\u5149',
        toDateTime(record?.sourceRevisionTimestamp),
        index + 1
      ]
    );
  }
  stats.created = count;
}

async function replaceSourceScopedRows(connection, tableName) {
  const [[countRow]] = await connection.execute(
    `SELECT COUNT(*) AS c
       FROM ${tableName}
      WHERE deleted = 0
        AND COALESCE(source_provider, '') = 'wiki_zh'
        AND source_page = ?`,
    ['\u5fae\u5149']
  );
  await connection.execute(
    `DELETE FROM ${tableName}
      WHERE COALESCE(source_provider, '') = 'wiki_zh'
        AND source_page = ?`,
    ['\u5fae\u5149']
  );
  return Number(countRow.c ?? 0);
}

function toText(value) {
  if (value == null) {
    return null;
  }
  const text = String(value).trim();
  return text ? text : null;
}

function toDateTime(value) {
  const text = toText(value);
  if (!text) {
    return null;
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function booleanOption(value, fallback) {
  if (value == null || value === '') {
    return fallback;
  }
  if (value === true || value === 'true' || value === '1' || value === 'yes') {
    return true;
  }
  if (value === false || value === 'false' || value === '0' || value === 'no') {
    return false;
  }
  return fallback;
}

function assertPrimaryDb(database, shouldApply, allowNonPrimary) {
  if (!shouldApply) {
    return;
  }
  if (String(database || '').trim() === 'terria_v1_local') {
    return;
  }
  if (allowNonPrimary) {
    return;
  }
  throw new Error(`Refusing to write to non-primary database '${database}'. Set TERRAPEDIA_DB_NAME=terria_v1_local or pass --allow-non-primary-db=true explicitly.`);
}
