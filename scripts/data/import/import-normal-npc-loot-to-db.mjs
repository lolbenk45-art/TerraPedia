#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { parseCliArgs, writeJson } from '../lib/wiki-item-utils.mjs';
import {
  buildBossNameLookup,
  getKnownNpcSourceBossNames,
  isCollectiveBossSourceName,
  resolveBossNameFromSourceName,
  toNullableText,
} from '../lib/boss-loot-source-utils.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

const args = parseCliArgs(process.argv.slice(2));
const dryRun = booleanOption(args['dry-run'], false);
const dateTag = new Date().toISOString().slice(0, 10);
const reportPath = path.resolve(args['report-json'] ?? path.join(repoRoot, 'reports', `normal-npc-loot-import-${dateTag}.json`));

main().catch((error) => {
  console.error('[import-normal-npc-loot-to-db] failed');
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});

async function main() {
  const localStackConfig = loadLocalStackConfig(repoRoot);
  const conn = await mysql.createConnection({
    host: args.host ?? process.env.TERRAPEDIA_DB_HOST ?? localStackConfig.database?.host ?? '127.0.0.1',
    port: Number(args.port ?? process.env.TERRAPEDIA_DB_PORT ?? localStackConfig.database?.port ?? 3306),
    user: args.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? localStackConfig.database?.username ?? 'root',
    password: args.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? localStackConfig.database?.password ?? 'root',
    database: args.database ?? process.env.TERRAPEDIA_DB_NAME ?? localStackConfig.database?.name ?? 'terria_v1_local',
    multipleStatements: true,
  });

  assertPrimaryDb(conn.config.database, args['allow-non-primary-db'] === 'true' || process.env.TERRAPEDIA_ALLOW_NON_PRIMARY_DB === 'true');
  await conn.query('SET NAMES utf8mb4');
  await ensureSchema(conn);

  const npcLookup = await loadTargetNpcs(conn);
  const bossLaneNameLookup = await loadBossLaneNameLookup(conn);
  const sourceBuckets = await loadSourceBuckets(conn);

  const summary = {
    generatedAt: new Date().toISOString(),
    database: conn.config.database,
    dryRun,
    targetNpcCount: npcLookup.totalNpcs,
    sourceRowCount: sourceBuckets.totalRows,
    sourceNameCount: sourceBuckets.byName.size,
    matchedSourceNames: 0,
    handledByBossLaneSourceNames: 0,
    unmatchedSourceNames: [],
    bossLaneSourceNames: [],
    unresolvedSourceRows: sourceBuckets.unresolvedRows,
    matchedNpcCount: 0,
    managedRowsBeforeSync: 0,
    replacedLootRows: 0,
    insertedLootRows: 0,
    importedPlans: 0,
    dropSourceKind: 'npc_drop',
    samples: [],
  };

  const plans = [];
  const matchedNpcIds = new Set();

  for (const [normalizedName, bucket] of sourceBuckets.byName.entries()) {
    const targets = npcLookup.byName.get(normalizedName) ?? [];
    if (targets.length === 0) {
      const bossLaneName = resolveBossNameFromSourceName(bucket.sourceRefName, bossLaneNameLookup);
      if (bossLaneName || isCollectiveBossSourceName(bucket.sourceRefName)) {
        summary.handledByBossLaneSourceNames += 1;
        recordSample(summary.bossLaneSourceNames, {
          sourceRefName: bucket.sourceRefName,
          sourceRows: bucket.rows.length,
          bossName: bossLaneName ?? toNullableText(bucket.sourceRefName),
          reason: 'handled_by_boss_lane',
        });
        continue;
      }
      recordSample(summary.unmatchedSourceNames, {
        sourceRefName: bucket.sourceRefName,
        sourceRows: bucket.rows.length,
        reason: 'no_non_boss_npc_name_match',
      });
      continue;
    }

    const dedupedRows = dedupeSourceRows(bucket.rows);
    summary.matchedSourceNames += 1;

    for (const npc of targets) {
      matchedNpcIds.add(npc.id);
      plans.push({
        npc,
        sourceRefName: bucket.sourceRefName,
        rows: dedupedRows.map((row, index) => ({
          itemId: row.itemId,
          sourceItemId: null,
          dropSourceKind: 'npc_drop',
          quantityMin: row.quantityMin,
          quantityMax: row.quantityMax,
          quantityText: row.quantityText,
          chanceValue: row.chanceValue,
          chanceText: row.chanceText,
          conditions: row.conditions,
          notes: row.notes,
          sortOrder: index + 1,
          itemInternalName: row.itemInternalName,
          itemName: row.itemName,
          itemNameZh: row.itemNameZh,
        })),
      });
    }
  }

  summary.matchedNpcCount = matchedNpcIds.size;
  summary.importedPlans = plans.length;
  summary.managedRowsBeforeSync = await countManagedNpcDropRows(conn);

  const existingCounts = await loadExistingLootCounts(conn, Array.from(matchedNpcIds));

  try {
    await conn.beginTransaction();

    if (!dryRun) {
      await clearManagedNpcDropRows(conn);
    }

    for (const plan of plans) {
      const existingRows = existingCounts.get(plan.npc.id) ?? 0;
      summary.replacedLootRows += existingRows;
      summary.insertedLootRows += plan.rows.length;

      if (!dryRun) {
        for (const row of plan.rows) {
          await conn.execute(
            `INSERT INTO npc_loot_entries
              (npc_id, item_id, source_item_id, drop_source_kind, quantity_min, quantity_max, quantity_text, chance_value, chance_text, conditions, notes, sort_order, status, deleted)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
            [
              plan.npc.id,
              row.itemId,
              row.sourceItemId,
              row.dropSourceKind,
              row.quantityMin,
              row.quantityMax,
              row.quantityText,
              row.chanceValue,
              row.chanceText,
              row.conditions,
              row.notes,
              row.sortOrder,
            ]
          );
        }
      }

      if (summary.samples.length < 24) {
        summary.samples.push({
          npcId: plan.npc.id,
          gameId: plan.npc.gameId,
          internalName: plan.npc.internalName,
          name: plan.npc.name,
          nameZh: plan.npc.nameZh,
          sourceRefName: plan.sourceRefName,
          existingRows,
          insertedRows: plan.rows.length,
          uniqueItemCount: countUniqueRows(plan.rows),
        });
      }
    }

    if (dryRun) {
      await conn.rollback();
    } else {
      await conn.commit();
    }
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.end();
  }

  writeJson(reportPath, summary);
  console.log(`Database: ${summary.database}`);
  console.log(`Dry run: ${summary.dryRun}`);
  console.log(`Matched NPCs: ${summary.matchedNpcCount}`);
  console.log(`Inserted loot rows: ${summary.insertedLootRows}`);
  console.log(`Report: ${reportPath}`);
}

async function ensureSchema(conn) {
  const sqlPath = path.join(repoRoot, 'back', 'src', 'main', 'resources', 'db', 'migration', 'V34__add_drop_source_kind_to_npc_loot_entries.sql');
  await conn.query(fs.readFileSync(sqlPath, 'utf8'));
}

async function loadTargetNpcs(conn) {
  const [rows] = await conn.query(
    `SELECT id, game_id AS gameId, internal_name AS internalName, name, name_zh AS nameZh
     FROM npcs
     WHERE deleted = 0
       AND (is_boss = 0 OR is_boss IS NULL)
       AND boss_group_id IS NULL
       AND TRIM(COALESCE(name, '')) <> ''
       AND LOWER(TRIM(name)) NOT IN (
         SELECT LOWER(TRIM(name_en))
         FROM boss_groups
         WHERE deleted = 0
           AND TRIM(COALESCE(name_en, '')) <> ''
       )
     ORDER BY id ASC`
  );

  const byName = new Map();
  for (const row of rows) {
    const npc = {
      id: Number(row.id),
      gameId: toNullableInteger(row.gameId),
      internalName: toNullableString(row.internalName),
      name: toNullableString(row.name),
      nameZh: toNullableString(row.nameZh),
    };
    const key = normalizeKey(npc.name);
    if (!key) {
      continue;
    }
    const bucket = byName.get(key) ?? [];
    bucket.push(npc);
    byName.set(key, bucket);
  }

  return {
    byName,
    totalNpcs: rows.length,
  };
}

async function loadBossLaneNameLookup(conn) {
  const [rows] = await conn.query(
    `SELECT name_en AS nameEn
     FROM boss_groups
     WHERE deleted = 0
       AND TRIM(COALESCE(name_en, '')) <> ''`
  );
  const names = [];
  for (const row of rows) {
    const normalizedName = toNullableText(row.nameEn);
    if (normalizedName) {
      names.push(normalizedName);
    }
  }
  names.push(...getKnownNpcSourceBossNames());
  return buildBossNameLookup(names);
}

async function loadSourceBuckets(conn) {
  const [rows] = await conn.query(
    `SELECT
       ias.id,
       ias.item_id AS itemId,
       ias.source_ref_name AS sourceRefName,
       ias.quantity_min AS quantityMin,
       ias.quantity_max AS quantityMax,
       ias.quantity_text AS quantityText,
       ias.chance_value AS chanceValue,
       ias.chance_text AS chanceText,
       ias.conditions,
       ias.notes,
       ias.sort_order AS sortOrder,
       i.internal_name AS itemInternalName,
       i.name AS itemName,
       i.name_zh AS itemNameZh
     FROM item_acquisition_sources ias
     LEFT JOIN items i ON i.id = ias.item_id AND i.deleted = 0
     WHERE ias.deleted = 0
       AND ias.status = 1
       AND ias.source_type = 'drop'
       AND ias.source_ref_type = 'npc'
     ORDER BY LOWER(TRIM(ias.source_ref_name)) ASC, ias.sort_order ASC, ias.id ASC`
  );

  const byName = new Map();
  const unresolvedRows = [];

  for (const row of rows) {
    const sourceRefName = toNullableString(row.sourceRefName);
    const key = normalizeKey(sourceRefName);
    if (!key) {
      recordSample(unresolvedRows, {
        rowId: row.id,
        reason: 'missing_source_ref_name',
      });
      continue;
    }
    if (row.itemId == null) {
      recordSample(unresolvedRows, {
        rowId: row.id,
        sourceRefName,
        reason: 'missing_item_id',
      });
      continue;
    }

    const bucket = byName.get(key) ?? { sourceRefName, rows: [] };
    bucket.rows.push({
      id: Number(row.id),
      itemId: Number(row.itemId),
      quantityMin: toNullableInteger(row.quantityMin),
      quantityMax: toNullableInteger(row.quantityMax),
      quantityText: toNullableString(row.quantityText),
      chanceValue: toNullableDecimal(row.chanceValue),
      chanceText: toNullableString(row.chanceText),
      conditions: toNullableString(row.conditions),
      notes: toNullableString(row.notes),
      sortOrder: toNullableInteger(row.sortOrder),
      itemInternalName: toNullableString(row.itemInternalName),
      itemName: toNullableString(row.itemName),
      itemNameZh: toNullableString(row.itemNameZh),
    });
    byName.set(key, bucket);
  }

  return {
    byName,
    totalRows: rows.length,
    unresolvedRows,
  };
}

function dedupeSourceRows(rows) {
  const deduped = [];
  const seen = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = [
      row.itemId ?? '',
      row.itemInternalName ?? '',
      row.itemName ?? '',
      row.quantityMin ?? '',
      row.quantityMax ?? '',
      row.quantityText ?? '',
      row.chanceValue ?? '',
      row.chanceText ?? '',
      row.conditions ?? '',
      row.notes ?? '',
    ].join('|');
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(row);
  }
  return deduped;
}

async function loadExistingLootCounts(conn, npcIds) {
  if (!Array.isArray(npcIds) || npcIds.length === 0) {
    return new Map();
  }
  const placeholders = npcIds.map(() => '?').join(',');
  const [rows] = await conn.query(
    `SELECT npc_id AS npcId, COUNT(*) AS total
     FROM npc_loot_entries
     WHERE deleted = 0
       AND drop_source_kind = 'npc_drop'
       AND npc_id IN (${placeholders})
     GROUP BY npc_id`,
    npcIds
  );
  return new Map(rows.map((row) => [Number(row.npcId), Number(row.total ?? 0)]));
}

async function countManagedNpcDropRows(conn) {
  const [[row]] = await conn.query(
    `SELECT COUNT(*) AS total
     FROM npc_loot_entries nle
     JOIN npcs n ON n.id = nle.npc_id
     WHERE nle.deleted = 0
       AND nle.drop_source_kind = 'npc_drop'
       AND n.deleted = 0
       AND (n.is_boss = 0 OR n.is_boss IS NULL)`
  );
  return Number(row?.total ?? 0);
}

async function clearManagedNpcDropRows(conn) {
  await conn.query(
    `DELETE nle
     FROM npc_loot_entries nle
     JOIN npcs n ON n.id = nle.npc_id
     WHERE nle.deleted = 0
       AND nle.drop_source_kind = 'npc_drop'
       AND n.deleted = 0
       AND (n.is_boss = 0 OR n.is_boss IS NULL)`
  );
}

function countUniqueRows(rows) {
  const keys = new Set();
  for (const row of rows) {
    const key = [
      row.itemId ?? '',
      row.itemInternalName ?? '',
      row.itemName ?? '',
    ].join('|');
    if (key !== '||') {
      keys.add(key);
    }
  }
  return keys.size;
}

function normalizeKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

function toNullableString(value) {
  if (value == null) {
    return null;
  }
  const text = String(value).trim();
  return text === '' ? null : text;
}

function toNullableInteger(value) {
  if (value == null || value === '') {
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return null;
  }
  return Math.trunc(number);
}

function toNullableDecimal(value) {
  if (value == null || value === '') {
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return null;
  }
  return number;
}

function booleanOption(value, fallback) {
  if (value == null) {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }
  return fallback;
}

function assertPrimaryDb(database, allowNonPrimaryDb) {
  if (String(database || '').trim() === 'terria_v1_local') {
    return;
  }
  if (allowNonPrimaryDb) {
    return;
  }
  throw new Error(`Refusing to write to non-primary database '${database}'. Set TERRAPEDIA_DB_NAME=terria_v1_local or pass --allow-non-primary-db=true explicitly.`);
}

function recordSample(list, sample) {
  if (!Array.isArray(list)) {
    return;
  }
  if (list.length < 100) {
    list.push(sample);
  }
}
