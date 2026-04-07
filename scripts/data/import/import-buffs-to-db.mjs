#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadStandardizedDataset } from '../lib/load-standardized-dataset.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const eq = body.indexOf('=');
    if (eq >= 0) args[body.slice(0, eq)] = body.slice(eq + 1);
    else args[body] = 'true';
  }
  return args;
}

function toNullableString(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function toNullableInteger(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.trunc(num);
}

function toNullablePositiveInteger(value) {
  const num = toNullableInteger(value);
  if (num == null || num <= 0) return null;
  return num;
}

function normalizeInternalName(value, fallback = '') {
  const text = toNullableString(value);
  if (text) return text;
  const generated = String(fallback || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return generated || null;
}

function makeStats() {
  return { input: 0, created: 0, updated: 0, errors: [] };
}

function makeRelationStats() {
  return { input: 0, inserted: 0, unmatched: 0, unmatchedSamples: [] };
}

function loadSourceItemLookup(records) {
  const bySourceId = new Map();
  const list = Array.isArray(records) ? records : [];
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    const sourceItemId = toNullableInteger(item?.id);
    const internalName = normalizeInternalName(item?.internalName, item?.name || sourceItemId || i);
    if (sourceItemId == null || !internalName) continue;
    bySourceId.set(sourceItemId, internalName);
  }
  return { bySourceId };
}

function recordUnmatched(relationStats, sample) {
  relationStats.unmatched += 1;
  if (relationStats.unmatchedSamples.length < 50) {
    relationStats.unmatchedSamples.push(sample);
  }
}

async function ensureBuffSchema(conn) {
  const sql = `
CREATE TABLE IF NOT EXISTS \`buffs\` (
  \`id\` BIGINT NOT NULL AUTO_INCREMENT,
  \`source_id\` INT NOT NULL,
  \`internal_name\` VARCHAR(255) NOT NULL,
  \`english_name\` VARCHAR(255) DEFAULT NULL,
  \`name_zh\` VARCHAR(255) DEFAULT NULL,
  \`tooltip_en\` TEXT DEFAULT NULL,
  \`tooltip_zh\` TEXT DEFAULT NULL,
  \`image\` VARCHAR(500) DEFAULT NULL,
  \`buff_type\` VARCHAR(64) DEFAULT NULL,
  \`source_item_count\` INT NOT NULL DEFAULT 0,
  \`immune_npc_count\` INT NOT NULL DEFAULT 0,
  \`source_items_json\` LONGTEXT DEFAULT NULL,
  \`immune_npc_sample_json\` LONGTEXT DEFAULT NULL,
  \`status\` INT NOT NULL DEFAULT 1,
  \`deleted\` TINYINT NOT NULL DEFAULT 0,
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_buffs_source_id\` (\`source_id\`),
  UNIQUE KEY \`uk_buffs_internal_name\` (\`internal_name\`),
  INDEX \`idx_buffs_name_zh\` (\`name_zh\`),
  INDEX \`idx_buffs_english_name\` (\`english_name\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS \`buff_source_items\` (
  \`id\` BIGINT NOT NULL AUTO_INCREMENT,
  \`buff_id\` BIGINT NOT NULL,
  \`source_item_id\` INT DEFAULT NULL,
  \`source_item_internal_name\` VARCHAR(255) DEFAULT NULL,
  \`source_item_name\` VARCHAR(255) DEFAULT NULL,
  \`item_id\` BIGINT DEFAULT NULL,
  \`buff_time\` INT DEFAULT NULL,
  \`sort_order\` INT NOT NULL DEFAULT 0,
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_buff_source_items\` (\`buff_id\`, \`sort_order\`),
  INDEX \`idx_buff_source_items_item_id\` (\`item_id\`),
  INDEX \`idx_buff_source_items_internal_name\` (\`source_item_internal_name\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

  await conn.query(sql);
}

async function loadTableColumns(conn, tableName) {
  const [rows] = await conn.query(`SHOW COLUMNS FROM \`${tableName}\``);
  return new Set(rows.map((row) => String(row.Field)));
}

async function loadItemsLookup(conn) {
  const [rows] = await conn.query('SELECT id, internal_name, name FROM items WHERE deleted = 0');
  const byInternal = new Map();
  for (const row of rows) {
    const internalName = normalizeInternalName(row.internal_name);
    if (!internalName) continue;
    byInternal.set(internalName, {
      id: Number(row.id),
      internalName,
      name: toNullableString(row.name),
    });
  }
  return { byInternal };
}

async function loadBuffCategoryId(conn) {
  try {
    const [rows] = await conn.query(
      `SELECT id, code
       FROM category
       WHERE deleted = 0
         AND code IN ('CATEGORY_BUFF', 'BUFF')
       ORDER BY FIELD(code, 'CATEGORY_BUFF', 'BUFF')
       LIMIT 1`
    );
    const row = rows[0];
    return row ? Number(row.id) : 0;
  } catch {
    return 0;
  }
}

function resolveMappedItem(sourceItemId, sourceItemLookup, itemLookup) {
  if (sourceItemId == null) {
    return { sourceItemId: null, internalName: null, dbItem: null, reason: 'missing_source_item_id' };
  }
  const internalName = sourceItemLookup.bySourceId.get(sourceItemId) ?? null;
  if (!internalName) {
    return { sourceItemId, internalName: null, dbItem: null, reason: 'source_item_id_not_found_in_standardized_items' };
  }
  const dbItem = itemLookup.byInternal.get(internalName) ?? null;
  if (!dbItem) {
    return { sourceItemId, internalName, dbItem: null, reason: 'internal_name_not_found_in_db_items' };
  }
  return { sourceItemId, internalName, dbItem, reason: null };
}

function buildColumnValueMap(record, index, buffCategoryId) {
  const internalName = normalizeInternalName(record.internalName, record.englishName || record.id || index);
  return {
    source_id: toNullableInteger(record.id),
    internal_name: internalName,
    english_name: toNullableString(record.englishName),
    name_zh: toNullableString(record.localized?.zh?.name),
    tooltip_en: toNullableString(record.localized?.en?.tooltip),
    tooltip_zh: toNullableString(record.localized?.zh?.tooltip),
    image: toNullableString(record.imageUrl ?? record.image),
    image_path: toNullableString(record.imageUrl ?? record.image),
    buff_type: toNullableString(record.type),
    source_item_count: toNullableInteger(record.sourceItemCount) ?? 0,
    immune_npc_count: toNullableInteger(record.immuneNpcCount) ?? 0,
    source_items_json: JSON.stringify(record.sourceItems ?? []),
    immune_npc_sample_json: JSON.stringify(record.immuneNpcSample ?? []),
    status: 1,
    deleted: 0,
    name: toNullableString(record.localized?.zh?.name) ?? toNullableString(record.englishName) ?? internalName,
    category_id: buffCategoryId,
  };
}

async function upsertBuff(conn, record, index, buffColumns, buffCategoryId) {
  const valuesByColumn = buildColumnValueMap(record, index, buffCategoryId);
  const internalName = valuesByColumn.internal_name;
  const sourceId = valuesByColumn.source_id;

  let existing = null;
  if (buffColumns.has('source_id') && sourceId != null) {
    const [rows] = await conn.execute('SELECT id FROM buffs WHERE source_id = ? LIMIT 1', [sourceId]);
    existing = rows[0] ?? null;
  }
  if (!existing && buffColumns.has('internal_name') && internalName) {
    const [rows] = await conn.execute('SELECT id FROM buffs WHERE internal_name = ? LIMIT 1', [internalName]);
    existing = rows[0] ?? null;
  }

  const writableColumns = Object.keys(valuesByColumn).filter((column) => buffColumns.has(column));
  if (writableColumns.length === 0) {
    throw new Error('No writable columns available in buffs table');
  }

  if (existing) {
    const assignments = writableColumns.map((column) => `\`${column}\` = ?`).join(', ');
    const params = writableColumns.map((column) => valuesByColumn[column]);
    params.push(Number(existing.id));
    await conn.execute(`UPDATE buffs SET ${assignments}, updated_at = NOW() WHERE id = ?`, params);
    return { id: Number(existing.id), isNew: false };
  }

  const placeholders = writableColumns.map(() => '?').join(', ');
  const params = writableColumns.map((column) => valuesByColumn[column]);
  const [result] = await conn.execute(
    `INSERT INTO buffs (${writableColumns.map((column) => `\`${column}\``).join(', ')})
     VALUES (${placeholders})`,
    params
  );
  return { id: Number(result.insertId), isNew: true };
}

async function importBuffs(conn, buffs, itemLookup, sourceItemLookup, stats, relationStats, buffColumns, buffCategoryId) {
  stats.input = Array.isArray(buffs) ? buffs.length : 0;
  for (let i = 0; i < stats.input; i += 1) {
    const record = buffs[i];
    try {
      const buffInternalName = normalizeInternalName(record.internalName, record.englishName || record.id || i);
      const { id: buffId, isNew } = await upsertBuff(conn, record, i, buffColumns, buffCategoryId);
      if (isNew) stats.created += 1;
      else stats.updated += 1;

      await conn.execute('DELETE FROM buff_source_items WHERE buff_id = ?', [buffId]);
      const sourceItems = Array.isArray(record.sourceItems) ? record.sourceItems : [];
      relationStats.input += sourceItems.length;

      for (let sortOrder = 0; sortOrder < sourceItems.length; sortOrder += 1) {
        const sourceItem = sourceItems[sortOrder];
        const sourceItemId = toNullablePositiveInteger(sourceItem.itemId);
        const mapped = resolveMappedItem(sourceItemId, sourceItemLookup, itemLookup);
        if (sourceItemId != null && mapped.reason) {
          recordUnmatched(relationStats, {
            reason: mapped.reason,
            buffSourceId: toNullableInteger(record.id),
            buffInternalName,
            sourceItemId,
            standardizedItemInternalName: mapped.internalName,
            rawSourceItemInternalName: toNullableString(sourceItem.internalName),
            rawSourceItemName: toNullableString(sourceItem.name),
            sortOrder,
          });
        }
        await conn.execute(
          `INSERT INTO buff_source_items
            (buff_id, source_item_id, source_item_internal_name, source_item_name, item_id, buff_time, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            buffId,
            sourceItemId,
            mapped.internalName ?? toNullableString(sourceItem.internalName),
            mapped.dbItem?.name ?? toNullableString(sourceItem.name),
            mapped.dbItem?.id ?? null,
            toNullableInteger(sourceItem.buffTime),
            sortOrder,
          ]
        );
        relationStats.inserted += 1;
      }
    } catch (error) {
      stats.errors.push(`buffs[${i}]: ${error?.message ?? String(error)}`);
    }
  }
}

function assertPrimaryDb(database, allowNonPrimaryDb) {
  if (String(database || '').trim() === 'terria_v1_local') return;
  if (allowNonPrimaryDb) return;
  throw new Error(`Refusing to write to non-primary database '${database}'. Set TERRAPEDIA_DB_NAME=terria_v1_local or pass --allow-non-primary-db=true explicitly.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataDir = path.resolve(
    args['data-dir']
    ?? process.env.TERRAPEDIA_STANDARDIZED_OUTPUT_DIR
    ?? path.join(repoRoot, 'data', 'standardized')
  );

  const conn = await mysql.createConnection({
    host: args.host ?? process.env.TERRAPEDIA_DB_HOST ?? '127.0.0.1',
    port: Number(args.port ?? process.env.TERRAPEDIA_DB_PORT ?? 3306),
    user: args.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? 'root',
    password: args.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? 'root',
    database: args.database ?? process.env.TERRAPEDIA_DB_NAME ?? 'terria_v1_local',
    multipleStatements: true,
  });

  assertPrimaryDb(conn.config.database, args['allow-non-primary-db'] === 'true' || process.env.TERRAPEDIA_ALLOW_NON_PRIMARY_DB === 'true');

  const buffs = loadStandardizedDataset(dataDir, 'buffs').records ?? [];
  const sourceItems = loadStandardizedDataset(dataDir, 'items').records ?? [];
  const sourceItemLookup = loadSourceItemLookup(sourceItems);
  const summary = {
    generatedAt: new Date().toISOString(),
    database: conn.config.database,
    buffs: makeStats(),
    buffSourceItems: makeRelationStats(),
  };

  try {
    await conn.query('SET NAMES utf8mb4');
    await ensureBuffSchema(conn);
    const buffColumns = await loadTableColumns(conn, 'buffs');
    const itemLookup = await loadItemsLookup(conn);
    const buffCategoryId = await loadBuffCategoryId(conn);
    await conn.beginTransaction();
    await importBuffs(conn, buffs, itemLookup, sourceItemLookup, summary.buffs, summary.buffSourceItems, buffColumns, buffCategoryId);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.end();
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error('[import-buffs-to-db] failed');
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
