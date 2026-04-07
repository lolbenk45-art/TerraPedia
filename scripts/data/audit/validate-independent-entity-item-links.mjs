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

function toInt(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : fallback;
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function toNullableString(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
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

function loadSourceItemLookup(itemsRecords) {
  const bySourceId = new Map();
  const list = Array.isArray(itemsRecords) ? itemsRecords : [];
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    const sourceId = toInt(item?.id, null);
    const internalName = normalizeInternalName(item?.internalName, item?.name || sourceId || i);
    if (sourceId == null || sourceId <= 0 || !internalName) continue;
    bySourceId.set(sourceId, internalName);
  }
  return { bySourceId };
}

function roundRate(numerator, denominator) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function formatLinkStats(row) {
  const total = toNumber(row.total);
  const sourceItemPositiveRows = toNumber(row.source_item_positive_rows);
  const resolvedSourceItemRows = toNumber(row.resolved_source_item_rows);
  const unresolvedSourceItemRows = sourceItemPositiveRows - resolvedSourceItemRows;
  const itemIdNonNull = toNumber(row.item_id_non_null);
  const itemIdNull = toNumber(row.item_id_null);
  return {
    total,
    sourceItemPositiveRows,
    resolvedSourceItemRows,
    unresolvedSourceItemRows,
    itemIdNonNull,
    itemIdNull,
    hitRatePercent: roundRate(resolvedSourceItemRows, sourceItemPositiveRows),
  };
}

async function queryLinkStats(conn, tableName) {
  if (tableName !== 'buff_source_items' && tableName !== 'armor_set_items') {
    throw new Error(`unsupported table: ${tableName}`);
  }
  const [rows] = await conn.query(
    `SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN source_item_id IS NOT NULL AND source_item_id > 0 THEN 1 ELSE 0 END) AS source_item_positive_rows,
      SUM(CASE WHEN source_item_id IS NOT NULL AND source_item_id > 0 AND item_id IS NOT NULL THEN 1 ELSE 0 END) AS resolved_source_item_rows,
      SUM(CASE WHEN item_id IS NOT NULL THEN 1 ELSE 0 END) AS item_id_non_null,
      SUM(CASE WHEN item_id IS NULL THEN 1 ELSE 0 END) AS item_id_null
    FROM ${tableName}`
  );
  return formatLinkStats(rows[0] ?? {});
}

async function queryUnmatchedSamples(conn, limit) {
  const safeLimit = Math.max(1, toInt(limit, 50));
  const [rows] = await conn.query(
    `SELECT *
     FROM (
       SELECT
         'buff_source_items' AS relation_table,
         bsi.id AS relation_id,
         bsi.created_at AS relation_created_at,
         bsi.source_item_id AS source_item_id,
         bsi.source_item_internal_name AS internal_name,
         bsi.item_id AS item_id,
         b.id AS owner_id,
         b.source_id AS owner_source_id,
         b.internal_name AS owner_internal_name,
         b.name_zh AS owner_display_name,
         bsi.sort_order AS sort_order,
         NULL AS set_variant_index,
         NULL AS part_index,
         NULL AS source_key,
         NULL AS text_key,
         NULL AS benefit_expression
       FROM buff_source_items bsi
       LEFT JOIN buffs b ON b.id = bsi.buff_id
       WHERE bsi.source_item_id IS NOT NULL
         AND bsi.source_item_id > 0
         AND bsi.item_id IS NULL

       UNION ALL

       SELECT
         'armor_set_items' AS relation_table,
         asi.id AS relation_id,
         asi.created_at AS relation_created_at,
         asi.source_item_id AS source_item_id,
         asi.item_internal_name AS internal_name,
         asi.item_id AS item_id,
         aset.id AS owner_id,
         NULL AS owner_source_id,
         NULL AS owner_internal_name,
         NULL AS owner_display_name,
         NULL AS sort_order,
         asi.set_variant_index AS set_variant_index,
         asi.part_index AS part_index,
         aset.source_key AS source_key,
         aset.text_key AS text_key,
         aset.benefit_expression AS benefit_expression
       FROM armor_set_items asi
       LEFT JOIN armor_sets aset ON aset.id = asi.armor_set_id
       WHERE asi.source_item_id IS NOT NULL
         AND asi.source_item_id > 0
         AND asi.item_id IS NULL
     ) unmatched
     ORDER BY unmatched.relation_created_at DESC, unmatched.relation_id DESC
     LIMIT ${safeLimit}`
  );

  return rows.map((row) => {
    if (row.relation_table === 'armor_set_items') {
      return {
        relationTable: row.relation_table,
        relationId: toNumber(row.relation_id),
        source_item_id: row.source_item_id,
        internal_name: row.internal_name,
        set_info: {
          armor_set_id: row.owner_id,
          source_key: row.source_key,
          text_key: row.text_key,
          benefit_expression: row.benefit_expression,
          set_variant_index: row.set_variant_index,
          part_index: row.part_index,
        },
      };
    }
    return {
      relationTable: row.relation_table,
      relationId: toNumber(row.relation_id),
      source_item_id: row.source_item_id,
      internal_name: row.internal_name,
      set_info: {
        buff_id: row.owner_id,
        buff_source_id: row.owner_source_id,
        buff_internal_name: row.owner_internal_name,
        buff_name_zh: row.owner_display_name,
        sort_order: row.sort_order,
      },
    };
  });
}

function mapCrossCheckRows(row) {
  const checkedRows = toNumber(row.checked_rows);
  const consistentRows = toNumber(row.consistent_rows);
  const mismatchedRows = checkedRows - consistentRows;
  return {
    checkedRows,
    consistentRows,
    mismatchedRows,
    mismatchRatePercent: roundRate(mismatchedRows, checkedRows),
  };
}

async function queryBuffCrossCheck(conn, limit) {
  const safeLimit = Math.max(1, toInt(limit, 50));
  const [statsRows] = await conn.query(
    `SELECT
      COUNT(*) AS checked_rows,
      SUM(
        CASE
          WHEN i.id IS NULL THEN 0
          WHEN NULLIF(TRIM(bsi.source_item_internal_name), '') IS NULL THEN 0
          WHEN NULLIF(TRIM(i.internal_name), '') IS NULL THEN 0
          WHEN UPPER(TRIM(bsi.source_item_internal_name)) = UPPER(TRIM(i.internal_name)) THEN 1
          ELSE 0
        END
      ) AS consistent_rows
    FROM buff_source_items bsi
    LEFT JOIN items i ON i.id = bsi.item_id
    WHERE bsi.item_id IS NOT NULL`
  );

  const [mismatchRows] = await conn.query(
    `SELECT
      bsi.id AS relation_id,
      bsi.source_item_id AS source_item_id,
      bsi.source_item_internal_name AS relation_internal_name,
      bsi.item_id AS item_id,
      i.internal_name AS item_internal_name,
      b.id AS buff_id,
      b.source_id AS buff_source_id,
      b.internal_name AS buff_internal_name,
      b.name_zh AS buff_name_zh,
      bsi.sort_order AS sort_order
    FROM buff_source_items bsi
    LEFT JOIN items i ON i.id = bsi.item_id
    LEFT JOIN buffs b ON b.id = bsi.buff_id
    WHERE bsi.item_id IS NOT NULL
      AND (
        i.id IS NULL
        OR NULLIF(TRIM(bsi.source_item_internal_name), '') IS NULL
        OR NULLIF(TRIM(i.internal_name), '') IS NULL
        OR UPPER(TRIM(bsi.source_item_internal_name)) <> UPPER(TRIM(i.internal_name))
      )
    ORDER BY bsi.id DESC
    LIMIT ${safeLimit}`
  );

  return {
    ...mapCrossCheckRows(statsRows[0] ?? {}),
    mismatchSamples: mismatchRows.map((row) => ({
      relationId: toNumber(row.relation_id),
      source_item_id: row.source_item_id,
      relation_internal_name: row.relation_internal_name,
      item_id: row.item_id,
      items_internal_name: row.item_internal_name,
      set_info: {
        buff_id: row.buff_id,
        buff_source_id: row.buff_source_id,
        buff_internal_name: row.buff_internal_name,
        buff_name_zh: row.buff_name_zh,
        sort_order: row.sort_order,
      },
    })),
  };
}

async function queryArmorSetCrossCheck(conn, limit) {
  const safeLimit = Math.max(1, toInt(limit, 50));
  const [statsRows] = await conn.query(
    `SELECT
      COUNT(*) AS checked_rows,
      SUM(
        CASE
          WHEN i.id IS NULL THEN 0
          WHEN NULLIF(TRIM(asi.item_internal_name), '') IS NULL THEN 0
          WHEN NULLIF(TRIM(i.internal_name), '') IS NULL THEN 0
          WHEN UPPER(TRIM(asi.item_internal_name)) = UPPER(TRIM(i.internal_name)) THEN 1
          ELSE 0
        END
      ) AS consistent_rows
    FROM armor_set_items asi
    LEFT JOIN items i ON i.id = asi.item_id
    WHERE asi.item_id IS NOT NULL`
  );

  const [mismatchRows] = await conn.query(
    `SELECT
      asi.id AS relation_id,
      asi.source_item_id AS source_item_id,
      asi.item_internal_name AS relation_internal_name,
      asi.item_id AS item_id,
      i.internal_name AS item_internal_name,
      aset.id AS armor_set_id,
      aset.source_key AS source_key,
      aset.text_key AS text_key,
      aset.benefit_expression AS benefit_expression,
      asi.set_variant_index AS set_variant_index,
      asi.part_index AS part_index
    FROM armor_set_items asi
    LEFT JOIN items i ON i.id = asi.item_id
    LEFT JOIN armor_sets aset ON aset.id = asi.armor_set_id
    WHERE asi.item_id IS NOT NULL
      AND (
        i.id IS NULL
        OR NULLIF(TRIM(asi.item_internal_name), '') IS NULL
        OR NULLIF(TRIM(i.internal_name), '') IS NULL
        OR UPPER(TRIM(asi.item_internal_name)) <> UPPER(TRIM(i.internal_name))
      )
    ORDER BY asi.id DESC
    LIMIT ${safeLimit}`
  );

  return {
    ...mapCrossCheckRows(statsRows[0] ?? {}),
    mismatchSamples: mismatchRows.map((row) => ({
      relationId: toNumber(row.relation_id),
      source_item_id: row.source_item_id,
      relation_internal_name: row.relation_internal_name,
      item_id: row.item_id,
      items_internal_name: row.item_internal_name,
      set_info: {
        armor_set_id: row.armor_set_id,
        source_key: row.source_key,
        text_key: row.text_key,
        benefit_expression: row.benefit_expression,
        set_variant_index: row.set_variant_index,
        part_index: row.part_index,
      },
    })),
  };
}

function formatNpcSubLinkStats(row, prefix) {
  const sourceItemPositiveRows = toNumber(row[`${prefix}_source_positive_rows`]);
  const resolvedSourceItemRows = toNumber(row[`${prefix}_resolved_rows`]);
  const unresolvedSourceItemRows = toNumber(row[`${prefix}_unresolved_rows`]);
  return {
    sourceItemPositiveRows,
    resolvedSourceItemRows,
    unresolvedSourceItemRows,
    hitRatePercent: roundRate(resolvedSourceItemRows, sourceItemPositiveRows),
  };
}

async function queryNpcLinkStats(conn) {
  const [rows] = await conn.query(
    `SELECT
      COUNT(*) AS total_npcs,
      SUM(CASE WHEN banner_source_item_id IS NOT NULL AND banner_source_item_id > 0 THEN 1 ELSE 0 END) AS banner_source_positive_rows,
      SUM(CASE WHEN banner_source_item_id IS NOT NULL AND banner_source_item_id > 0 AND banner_item_id IS NOT NULL THEN 1 ELSE 0 END) AS banner_resolved_rows,
      SUM(CASE WHEN banner_source_item_id IS NOT NULL AND banner_source_item_id > 0 AND banner_item_id IS NULL THEN 1 ELSE 0 END) AS banner_unresolved_rows,
      SUM(CASE WHEN catch_source_item_id IS NOT NULL AND catch_source_item_id > 0 THEN 1 ELSE 0 END) AS catch_source_positive_rows,
      SUM(CASE WHEN catch_source_item_id IS NOT NULL AND catch_source_item_id > 0 AND catch_item_id IS NOT NULL THEN 1 ELSE 0 END) AS catch_resolved_rows,
      SUM(CASE WHEN catch_source_item_id IS NOT NULL AND catch_source_item_id > 0 AND catch_item_id IS NULL THEN 1 ELSE 0 END) AS catch_unresolved_rows
    FROM npcs`
  );
  const row = rows[0] ?? {};
  return {
    totalNpcs: toNumber(row.total_npcs),
    banner: formatNpcSubLinkStats(row, 'banner'),
    catchItem: formatNpcSubLinkStats(row, 'catch'),
  };
}

async function queryNpcUnmatchedSamples(conn, limit) {
  const safeLimit = Math.max(1, toInt(limit, 50));
  const [rows] = await conn.query(
    `SELECT *
     FROM (
       SELECT
         'banner' AS link_type,
         n.id AS npc_id,
         n.source_id AS npc_source_id,
         n.internal_name AS npc_internal_name,
         n.name AS npc_name,
         n.banner_source_item_id AS source_item_id,
         n.banner_item_id AS item_id,
         n.updated_at AS row_updated_at
       FROM npcs n
       WHERE n.banner_source_item_id IS NOT NULL
         AND n.banner_source_item_id > 0
         AND n.banner_item_id IS NULL

       UNION ALL

       SELECT
         'catchItem' AS link_type,
         n.id AS npc_id,
         n.source_id AS npc_source_id,
         n.internal_name AS npc_internal_name,
         n.name AS npc_name,
         n.catch_source_item_id AS source_item_id,
         n.catch_item_id AS item_id,
         n.updated_at AS row_updated_at
       FROM npcs n
       WHERE n.catch_source_item_id IS NOT NULL
         AND n.catch_source_item_id > 0
         AND n.catch_item_id IS NULL
     ) npc_unmatched
     ORDER BY npc_unmatched.row_updated_at DESC, npc_unmatched.npc_id DESC
     LIMIT ${safeLimit}`
  );
  return rows.map((row) => ({
    relationTable: 'npcs',
    linkType: row.link_type,
    npcId: toNumber(row.npc_id),
    npcSourceId: toNumber(row.npc_source_id),
    npcInternalName: row.npc_internal_name,
    npcName: row.npc_name,
    source_item_id: row.source_item_id,
    item_id: row.item_id,
  }));
}

async function queryNpcCrossCheck(conn, sourceItemLookup, limit) {
  const safeLimit = Math.max(1, toInt(limit, 50));
  const [rows] = await conn.query(
    `SELECT
      'banner' AS link_type,
      n.id AS npc_id,
      n.source_id AS npc_source_id,
      n.internal_name AS npc_internal_name,
      n.name AS npc_name,
      n.banner_source_item_id AS source_item_id,
      n.banner_item_id AS item_id,
      i.internal_name AS item_internal_name
    FROM npcs n
    LEFT JOIN items i ON i.id = n.banner_item_id
    WHERE n.banner_source_item_id IS NOT NULL
      AND n.banner_source_item_id > 0
      AND n.banner_item_id IS NOT NULL

    UNION ALL

    SELECT
      'catchItem' AS link_type,
      n.id AS npc_id,
      n.source_id AS npc_source_id,
      n.internal_name AS npc_internal_name,
      n.name AS npc_name,
      n.catch_source_item_id AS source_item_id,
      n.catch_item_id AS item_id,
      i.internal_name AS item_internal_name
    FROM npcs n
    LEFT JOIN items i ON i.id = n.catch_item_id
    WHERE n.catch_source_item_id IS NOT NULL
      AND n.catch_source_item_id > 0
      AND n.catch_item_id IS NOT NULL`
  );

  let consistentRows = 0;
  const mismatchSamples = [];
  for (const row of rows) {
    const sourceItemId = toNumber(row.source_item_id);
    const expectedInternalName = sourceItemLookup.bySourceId.get(sourceItemId) ?? null;
    const itemInternalName = normalizeInternalName(row.item_internal_name);
    const expectedNormalized = normalizeInternalName(expectedInternalName);
    const isConsistent = Boolean(
      expectedNormalized
      && itemInternalName
      && expectedNormalized === itemInternalName
    );
    if (isConsistent) {
      consistentRows += 1;
      continue;
    }

    if (mismatchSamples.length < safeLimit) {
      let reason = 'internal_name_mismatch';
      if (!expectedNormalized) reason = 'source_item_id_not_found_in_standardized_items';
      else if (!itemInternalName) reason = 'item_id_not_found_in_items';
      mismatchSamples.push({
        reason,
        linkType: row.link_type,
        npcId: toNumber(row.npc_id),
        npcSourceId: toNumber(row.npc_source_id),
        npcInternalName: row.npc_internal_name,
        npcName: row.npc_name,
        source_item_id: sourceItemId,
        expected_internal_name: expectedNormalized,
        item_id: toNumber(row.item_id),
        item_internal_name: itemInternalName,
      });
    }
  }

  const checkedRows = rows.length;
  const mismatchedRows = checkedRows - consistentRows;
  return {
    checkedRows,
    consistentRows,
    mismatchedRows,
    mismatchRatePercent: roundRate(mismatchedRows, checkedRows),
    mismatchSamples,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sampleLimit = Math.max(1, toInt(args['sample-limit'] ?? process.env.TERRAPEDIA_VALIDATE_SAMPLE_LIMIT, 50));
  const crossCheckSampleLimit = Math.max(
    1,
    toInt(args['cross-check-sample-limit'] ?? process.env.TERRAPEDIA_VALIDATE_CROSS_CHECK_SAMPLE_LIMIT, 50)
  );
  const dataDir = path.resolve(
    args['data-dir']
    ?? process.env.TERRAPEDIA_STANDARDIZED_OUTPUT_DIR
    ?? path.join(repoRoot, 'data', 'standardized')
  );
  const sourceItems = loadStandardizedDataset(dataDir, 'items').records ?? [];
  const sourceItemLookup = loadSourceItemLookup(sourceItems);

  const connectionConfig = {
    host: args.host ?? process.env.TERRAPEDIA_DB_HOST ?? '127.0.0.1',
    port: Number(args.port ?? process.env.TERRAPEDIA_DB_PORT ?? 3306),
    user: args.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? 'root',
    password: args.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? 'root',
    database: args.database ?? process.env.TERRAPEDIA_DB_NAME ?? 'terria_v1_local',
  };

  const conn = await mysql.createConnection(connectionConfig);
  try {
    await conn.query('SET NAMES utf8mb4');

    const [
      buffSourceItemsStats,
      armorSetItemsStats,
      npcLinkStats,
      unmatchedSamples,
      npcUnmatchedSamples,
      buffCrossCheck,
      armorSetCrossCheck,
      npcCrossCheck,
    ] = await Promise.all([
      queryLinkStats(conn, 'buff_source_items'),
      queryLinkStats(conn, 'armor_set_items'),
      queryNpcLinkStats(conn),
      queryUnmatchedSamples(conn, sampleLimit),
      queryNpcUnmatchedSamples(conn, sampleLimit),
      queryBuffCrossCheck(conn, crossCheckSampleLimit),
      queryArmorSetCrossCheck(conn, crossCheckSampleLimit),
      queryNpcCrossCheck(conn, sourceItemLookup, crossCheckSampleLimit),
    ]);

    const summary = {
      generatedAt: new Date().toISOString(),
      database: connectionConfig.database,
      relationLinkStats: {
        buff_source_items: buffSourceItemsStats,
        armor_set_items: armorSetItemsStats,
        npcs: npcLinkStats,
      },
      unmatchedSamplesLimit: sampleLimit,
      unmatchedSamples: {
        buffAndArmor: unmatchedSamples,
        npcs: npcUnmatchedSamples,
      },
      crossCheck: {
        note: 'cross-check compares relation internal_name with items.internal_name by item_id (case-insensitive, trimmed).',
        buff_source_items: buffCrossCheck,
        armor_set_items: armorSetCrossCheck,
        npcs: {
          note: 'cross-check compares mapped source item internal_name with items.internal_name by npc link item_id.',
          ...npcCrossCheck,
        },
      },
    };

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error('[validate-independent-entity-item-links] failed');
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
