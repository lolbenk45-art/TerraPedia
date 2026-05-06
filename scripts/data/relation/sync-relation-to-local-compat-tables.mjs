#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { getProjectRoot } from '../../lib/project-root.mjs';

const repoRoot = getProjectRoot();
const require = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'));
const mysql = require('mysql2/promise');

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

export function parseArgs(argv) {
  const raw = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const index = body.indexOf('=');
    if (index >= 0) raw[body.slice(0, index)] = body.slice(index + 1);
    else raw[body] = 'true';
  }

  return {
    apply: booleanOption(raw.apply, false),
    localDatabase: raw['local-database'] ?? raw.localDatabase ?? 'terria_v1_local',
    relationDatabase: raw['relation-database'] ?? raw.relationDatabase ?? 'terria_v1_relation',
    dateTag: raw['date-tag'] ?? raw.dateTag ?? null
  };
}

function quoteIdentifier(value) {
  return `\`${String(value).replaceAll('`', '``')}\``;
}

function qualified(database, table) {
  return `${quoteIdentifier(database)}.${quoteIdentifier(table)}`;
}

function toDateTag(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

function normalizeQueryRows(result) {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0];
  if (Array.isArray(result)) return result;
  return [];
}

function firstTotal(result) {
  const rows = normalizeQueryRows(result);
  return Number(rows[0]?.total ?? rows[0]?.count ?? 0);
}

export function buildRelationCompatSyncSql({
  localDatabase = 'terria_v1_local',
  relationDatabase = 'terria_v1_relation'
} = {}) {
  const localItemSources = qualified(localDatabase, 'item_acquisition_sources');
  const localLoot = qualified(localDatabase, 'npc_loot_entries');
  const localShop = qualified(localDatabase, 'npc_shop_entries');
  const localShopConditions = qualified(localDatabase, 'npc_shop_conditions');
  const localItems = qualified(localDatabase, 'items');
  const localNpcs = qualified(localDatabase, 'npcs');
  const sourceFacts = qualified(relationDatabase, 'item_source_facts');
  const sourceDetails = qualified(relationDatabase, 'item_source_details');
  const lootRelations = qualified(relationDatabase, 'item_npc_loot_relations');
  const shopRelations = qualified(relationDatabase, 'item_npc_shop_relations');
  const acceptedReviewStatuses = "('accepted', 'resolved', 'promoted')";
  const publishableFactWhere = `f.deleted = 0
  AND f.status = 1
  AND f.review_status IN ${acceptedReviewStatuses}`;
  const publishableDetailJoin = `d.source_fact_key = f.record_key
 AND d.deleted = 0
 AND d.status = 1
 AND d.review_status IN ${acceptedReviewStatuses}`;
  const resolvedNpcDetailWhere = "d.source_ref_resolution IN ('resolved', 'exact_internal_name')";
  const publishableRelationWhere = `r.deleted = 0
  AND r.status = 1
  AND r.review_status IN ${acceptedReviewStatuses}`;

  return {
    item_acquisition_sources: {
      deleteSql: `DELETE FROM ${localItemSources}`,
      countSql: `SELECT COUNT(*) AS total
FROM ${sourceFacts} f
INNER JOIN ${localItems} i
  ON i.internal_name COLLATE utf8mb4_unicode_ci = f.item_internal_name COLLATE utf8mb4_unicode_ci
 AND i.deleted = 0
 AND i.status = 1
LEFT JOIN ${sourceDetails} d
  ON ${publishableDetailJoin}
LEFT JOIN ${localNpcs} n
  ON n.internal_name COLLATE utf8mb4_unicode_ci = d.source_ref_internal_name COLLATE utf8mb4_unicode_ci
 AND n.deleted = 0
 AND n.status = 1
WHERE ${publishableFactWhere}
  AND (f.source_ref_type IS NULL OR f.source_ref_type <> 'npc' OR (${resolvedNpcDetailWhere} AND n.id IS NOT NULL))`,
      sampleSql: `SELECT f.item_internal_name, f.source_type, f.source_ref_type, f.source_ref_name
FROM ${sourceFacts} f
INNER JOIN ${localItems} i
  ON i.internal_name COLLATE utf8mb4_unicode_ci = f.item_internal_name COLLATE utf8mb4_unicode_ci
 AND i.deleted = 0
 AND i.status = 1
LEFT JOIN ${sourceDetails} d
  ON ${publishableDetailJoin}
LEFT JOIN ${localNpcs} n
  ON n.internal_name COLLATE utf8mb4_unicode_ci = d.source_ref_internal_name COLLATE utf8mb4_unicode_ci
 AND n.deleted = 0
 AND n.status = 1
WHERE ${publishableFactWhere}
  AND (f.source_ref_type IS NULL OR f.source_ref_type <> 'npc' OR (${resolvedNpcDetailWhere} AND n.id IS NOT NULL))
LIMIT 5`,
      insertSql: `
INSERT INTO ${localItemSources}
  (\`item_id\`, \`source_type\`, \`source_ref_type\`, \`source_ref_id\`, \`source_ref_name\`, \`biome_id\`, \`quantity_min\`, \`quantity_max\`, \`quantity_text\`, \`chance_value\`, \`chance_text\`, \`conditions\`, \`notes\`, \`source_provider\`, \`source_page\`, \`source_revision_timestamp\`, \`sort_order\`, \`status\`, \`deleted\`)
SELECT
  i.id,
  f.source_type,
  f.source_ref_type,
  CASE WHEN f.source_ref_type = 'npc' THEN n.id ELSE NULL END,
  f.source_ref_name,
  NULL,
  d.quantity_min,
  d.quantity_max,
  d.quantity_text,
  d.chance_value,
  d.chance_text,
  NULL,
  d.notes,
  f.source_provider,
  f.source_page,
  f.source_revision_timestamp,
  f.sort_order,
  1,
  0
FROM ${sourceFacts} f
INNER JOIN ${localItems} i
  ON i.internal_name COLLATE utf8mb4_unicode_ci = f.item_internal_name COLLATE utf8mb4_unicode_ci
 AND i.deleted = 0
 AND i.status = 1
LEFT JOIN ${sourceDetails} d
  ON ${publishableDetailJoin}
LEFT JOIN ${localNpcs} n
  ON n.internal_name COLLATE utf8mb4_unicode_ci = d.source_ref_internal_name COLLATE utf8mb4_unicode_ci
 AND n.deleted = 0
 AND n.status = 1
WHERE ${publishableFactWhere}
  AND (f.source_ref_type IS NULL OR f.source_ref_type <> 'npc' OR (${resolvedNpcDetailWhere} AND n.id IS NOT NULL))`.trim()
    },
    npc_loot_entries: {
      deleteSql: `DELETE FROM ${localLoot}
WHERE drop_source_kind IS NULL
   OR drop_source_kind = 'npc_drop'`,
      countSql: `SELECT COUNT(*) AS total
FROM ${lootRelations} r
INNER JOIN ${sourceFacts} f
  ON f.record_key = r.source_fact_key
INNER JOIN ${localNpcs} n
  ON n.internal_name COLLATE utf8mb4_unicode_ci = r.npc_internal_name COLLATE utf8mb4_unicode_ci
 AND n.deleted = 0
 AND n.status = 1
INNER JOIN ${localItems} i
  ON i.internal_name COLLATE utf8mb4_unicode_ci = r.item_internal_name COLLATE utf8mb4_unicode_ci
 AND i.deleted = 0
 AND i.status = 1
WHERE ${publishableRelationWhere}
  AND ${publishableFactWhere}`,
      sampleSql: `SELECT r.npc_internal_name, r.item_internal_name, r.chance_text
FROM ${lootRelations} r
INNER JOIN ${sourceFacts} f
  ON f.record_key = r.source_fact_key
INNER JOIN ${localNpcs} n
  ON n.internal_name COLLATE utf8mb4_unicode_ci = r.npc_internal_name COLLATE utf8mb4_unicode_ci
 AND n.deleted = 0
 AND n.status = 1
INNER JOIN ${localItems} i
  ON i.internal_name COLLATE utf8mb4_unicode_ci = r.item_internal_name COLLATE utf8mb4_unicode_ci
 AND i.deleted = 0
 AND i.status = 1
WHERE ${publishableRelationWhere}
  AND ${publishableFactWhere}
LIMIT 5`,
      insertSql: `
INSERT INTO ${localLoot}
  (\`npc_id\`, \`item_id\`, \`source_item_id\`, \`drop_source_kind\`, \`quantity_min\`, \`quantity_max\`, \`quantity_text\`, \`chance_value\`, \`chance_text\`, \`conditions\`, \`notes\`, \`sort_order\`, \`status\`, \`deleted\`)
SELECT
  n.id,
  i.id,
  i.id,
  'npc_drop',
  r.quantity_min,
  r.quantity_max,
  r.quantity_text,
  r.chance_value,
  r.chance_text,
  r.conditions,
  r.condition_source_text,
  0,
  1,
  0
FROM ${lootRelations} r
INNER JOIN ${sourceFacts} f
  ON f.record_key = r.source_fact_key
INNER JOIN ${localNpcs} n
  ON n.internal_name COLLATE utf8mb4_unicode_ci = r.npc_internal_name COLLATE utf8mb4_unicode_ci
 AND n.deleted = 0
 AND n.status = 1
INNER JOIN ${localItems} i
  ON i.internal_name COLLATE utf8mb4_unicode_ci = r.item_internal_name COLLATE utf8mb4_unicode_ci
 AND i.deleted = 0
 AND i.status = 1
WHERE ${publishableRelationWhere}
  AND ${publishableFactWhere}`.trim()
    },
    npc_shop_entries: {
      deleteSql: `DELETE FROM ${localShop}`,
      countSql: `SELECT COUNT(*) AS total
FROM ${shopRelations} r
INNER JOIN ${sourceFacts} f
  ON f.record_key = r.source_fact_key
INNER JOIN ${localNpcs} n
  ON n.internal_name COLLATE utf8mb4_unicode_ci = r.npc_internal_name COLLATE utf8mb4_unicode_ci
 AND n.deleted = 0
 AND n.status = 1
INNER JOIN ${localItems} i
  ON i.internal_name COLLATE utf8mb4_unicode_ci = r.item_internal_name COLLATE utf8mb4_unicode_ci
 AND i.deleted = 0
 AND i.status = 1
WHERE ${publishableRelationWhere}
  AND ${publishableFactWhere}`,
      sampleSql: `SELECT r.npc_internal_name, r.item_internal_name, r.price_text
FROM ${shopRelations} r
INNER JOIN ${sourceFacts} f
  ON f.record_key = r.source_fact_key
INNER JOIN ${localNpcs} n
  ON n.internal_name COLLATE utf8mb4_unicode_ci = r.npc_internal_name COLLATE utf8mb4_unicode_ci
 AND n.deleted = 0
 AND n.status = 1
INNER JOIN ${localItems} i
  ON i.internal_name COLLATE utf8mb4_unicode_ci = r.item_internal_name COLLATE utf8mb4_unicode_ci
 AND i.deleted = 0
 AND i.status = 1
WHERE ${publishableRelationWhere}
  AND ${publishableFactWhere}
LIMIT 5`,
      insertSql: `
INSERT INTO ${localShop}
  (\`npc_id\`, \`item_id\`, \`source_item_id\`, \`price_text\`, \`notes\`, \`sort_order\`, \`status\`, \`deleted\`)
SELECT
  n.id,
  i.id,
  i.id,
  r.price_text,
  r.condition_source_text,
  0,
  1,
  0
FROM ${shopRelations} r
INNER JOIN ${sourceFacts} f
  ON f.record_key = r.source_fact_key
INNER JOIN ${localNpcs} n
  ON n.internal_name COLLATE utf8mb4_unicode_ci = r.npc_internal_name COLLATE utf8mb4_unicode_ci
 AND n.deleted = 0
 AND n.status = 1
INNER JOIN ${localItems} i
  ON i.internal_name COLLATE utf8mb4_unicode_ci = r.item_internal_name COLLATE utf8mb4_unicode_ci
 AND i.deleted = 0
 AND i.status = 1
WHERE ${publishableRelationWhere}
  AND ${publishableFactWhere}`.trim()
    },
    npc_shop_conditions: {
      deleteSql: `DELETE FROM ${localShopConditions}`,
      countSql: `SELECT COUNT(*) AS total
FROM ${shopRelations} r
INNER JOIN ${sourceFacts} f
  ON f.record_key = r.source_fact_key
INNER JOIN ${localNpcs} n
  ON n.internal_name COLLATE utf8mb4_unicode_ci = r.npc_internal_name COLLATE utf8mb4_unicode_ci
 AND n.deleted = 0
 AND n.status = 1
INNER JOIN ${localItems} i
  ON i.internal_name COLLATE utf8mb4_unicode_ci = r.item_internal_name COLLATE utf8mb4_unicode_ci
 AND i.deleted = 0
 AND i.status = 1
WHERE ${publishableRelationWhere}
  AND ${publishableFactWhere}
  AND (r.condition_events_json IS NOT NULL OR r.special_flags_json IS NOT NULL OR r.condition_source_text IS NOT NULL)`,
      sampleSql: `SELECT r.npc_internal_name, r.item_internal_name, r.condition_source_text
FROM ${shopRelations} r
INNER JOIN ${sourceFacts} f
  ON f.record_key = r.source_fact_key
INNER JOIN ${localNpcs} n
  ON n.internal_name COLLATE utf8mb4_unicode_ci = r.npc_internal_name COLLATE utf8mb4_unicode_ci
 AND n.deleted = 0
 AND n.status = 1
INNER JOIN ${localItems} i
  ON i.internal_name COLLATE utf8mb4_unicode_ci = r.item_internal_name COLLATE utf8mb4_unicode_ci
 AND i.deleted = 0
 AND i.status = 1
WHERE ${publishableRelationWhere}
  AND ${publishableFactWhere}
  AND (r.condition_events_json IS NOT NULL OR r.special_flags_json IS NOT NULL OR r.condition_source_text IS NOT NULL)
LIMIT 5`,
      insertSql: `
INSERT INTO ${localShopConditions}
  (\`shop_entry_id\`, \`ref_type\`, \`ref_id\`, \`condition_role\`, \`notes\`, \`sort_order\`)
SELECT
  se.id,
  'relation_condition',
  CRC32(COALESCE(r.source_fact_key, r.record_key)),
  'required',
  COALESCE(r.condition_source_text, r.condition_events_json, r.special_flags_json),
  0
FROM ${shopRelations} r
INNER JOIN ${sourceFacts} f
  ON f.record_key = r.source_fact_key
INNER JOIN ${localNpcs} n
  ON n.internal_name COLLATE utf8mb4_unicode_ci = r.npc_internal_name COLLATE utf8mb4_unicode_ci
 AND n.deleted = 0
 AND n.status = 1
INNER JOIN ${localItems} i
  ON i.internal_name COLLATE utf8mb4_unicode_ci = r.item_internal_name COLLATE utf8mb4_unicode_ci
 AND i.deleted = 0
 AND i.status = 1
INNER JOIN ${localShop} se
  ON se.npc_id = n.id
 AND (se.item_id <=> i.id)
 AND (se.price_text COLLATE utf8mb4_unicode_ci <=> r.price_text COLLATE utf8mb4_unicode_ci)
WHERE ${publishableRelationWhere}
  AND ${publishableFactWhere}
  AND (r.condition_events_json IS NOT NULL OR r.special_flags_json IS NOT NULL OR r.condition_source_text IS NOT NULL)`.trim()
    }
  };
}

async function defaultWriteReport(report) {
  const reportsDir = path.join(repoRoot, 'reports', 'relation');
  await fs.mkdir(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `relation-to-local-compat-sync-${report.dateTag}.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
}

async function defaultExecuteLocal(localDatabase, dependencies, fn) {
  const config = dependencies.config ?? loadLocalStackConfig(repoRoot);
  const connection = await mysql.createConnection({
    host: config.database?.host ?? '127.0.0.1',
    port: Number(config.database?.port ?? 3306),
    user: config.database?.username ?? 'root',
    password: config.database?.password ?? 'root',
    database: localDatabase
  });
  try {
    return await fn(connection);
  } finally {
    await connection.end();
  }
}

async function defaultSampleRows(connection, _tableName, definition) {
  const result = await connection.query(definition.sampleSql);
  return normalizeQueryRows(result);
}

export async function runRelationToLocalCompatSync(options = {}, dependencies = {}) {
  const now = dependencies.now ?? new Date();
  const normalized = {
    apply: Boolean(options.apply),
    localDatabase: options.localDatabase ?? 'terria_v1_local',
    relationDatabase: options.relationDatabase ?? 'terria_v1_relation',
    dateTag: options.dateTag ?? toDateTag(now)
  };
  const sql = buildRelationCompatSyncSql(normalized);
  const executeLocal = dependencies.executeLocal
    ?? ((fn) => defaultExecuteLocal(normalized.localDatabase, dependencies, fn));
  const sampleRows = dependencies.sampleRows ?? defaultSampleRows;
  const writeReport = dependencies.writeReport ?? defaultWriteReport;

  return executeLocal(async (connection) => {
    const tables = {};
    for (const [tableName, definition] of Object.entries(sql)) {
      const countResult = await connection.query(definition.countSql);
      tables[tableName] = {
        tableName,
        plannedRows: firstTotal(countResult),
        sampleRows: await sampleRows(connection, tableName, definition)
      };
    }

    if (normalized.apply) {
      await connection.query('SET FOREIGN_KEY_CHECKS = 0');
      try {
        for (const tableName of [
          'npc_shop_conditions',
          'npc_shop_entries',
          'npc_loot_entries',
          'item_acquisition_sources'
        ]) {
          await connection.query(sql[tableName].deleteSql);
        }
        for (const tableName of [
          'item_acquisition_sources',
          'npc_loot_entries',
          'npc_shop_entries',
          'npc_shop_conditions'
        ]) {
          await connection.query(sql[tableName].insertSql);
        }
      } finally {
        await connection.query('SET FOREIGN_KEY_CHECKS = 1');
      }
    }

    const report = {
      generatedAt: now.toISOString(),
      dateTag: normalized.dateTag,
      apply: normalized.apply,
      localDatabase: normalized.localDatabase,
      relationDatabase: normalized.relationDatabase,
      summary: {
        totalPlannedRows: Object.values(tables).reduce((sum, entry) => sum + entry.plannedRows, 0)
      },
      tables
    };
    const reportPath = await writeReport(report);
    return { report, reportPath };
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = await runRelationToLocalCompatSync(parseArgs(process.argv.slice(2)));
  console.log(`Apply: ${result.report.apply}`);
  console.log(`Local database: ${result.report.localDatabase}`);
  console.log(`Relation database: ${result.report.relationDatabase}`);
  for (const [tableName, entry] of Object.entries(result.report.tables)) {
    console.log(`${tableName}: plannedRows=${entry.plannedRows}`);
  }
  console.log(`Report: ${result.reportPath}`);
}
