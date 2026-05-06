#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { resolveBossLootSchemaSqlPath } from './boss-loot-schema-path.mjs';
import { resolveBossLootOwnerContext } from './boss-loot-owner.mjs';
import { buildBossLootBundle } from '../generate/generate-boss-loot-bundle.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import {
  parseCliArgs,
  sharedDataPath,
  writeJson,
} from '../lib/wiki-item-utils.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const repoRoot = getProjectRoot();

const args = parseCliArgs(process.argv.slice(2));
const dryRun = booleanOption(args['dry-run'], false);
const regenerateBundle = booleanOption(args['regenerate-bundle'], false);
const dateTag = new Date().toISOString().slice(0, 10);
const defaultBundlePath = path.resolve(args.bundle ?? sharedDataPath('normalized', 'boss-loot.bundle.json'));
const bundleInputPath = args.input ? path.resolve(process.cwd(), args.input) : null;
const relationsPath = path.resolve(args.relations ?? sharedDataPath('normalized', 'item-relations.bundle.json'));
const npcPath = path.resolve(args.npcs ?? sharedDataPath('raw', 'wiki', 'module__npcinfo__data.parsed.latest.json'));
const reportPath = path.resolve(args['report-json'] ?? path.join(repoRoot, 'reports', `boss-loot-import-${dateTag}.json`));

main().catch((error) => {
  console.error('[import-boss-loot-to-db] failed');
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

  const bossGroups = await loadBossGroups(conn);
  const bundleResult = loadOrGenerateBundle({
    bundleInputPath,
    bundlePath: defaultBundlePath,
    relationsPath,
    npcPath,
    regenerateBundle,
    bossNameOverrides: Array.from(bossGroups.byName.values())
      .map((bossGroup) => bossGroup.nameEn)
      .filter((value) => typeof value === 'string' && value.trim() !== ''),
  });
  const bundle = bundleResult.payload;
  const itemLookup = await loadItemLookup(conn);

  const summary = {
    generatedAt: new Date().toISOString(),
    database: conn.config.database,
    dryRun,
    regenerateBundle,
    bundleSourcePath: bundleResult.sourcePath,
    bundleGeneratedPath: bundleResult.generatedPath,
    generatedBundleWritten: bundleResult.generated,
    relationsPath: bundleResult.generated ? relationsPath : null,
    npcPath: bundleResult.generated ? npcPath : null,
    totalBossRecords: Array.isArray(bundle?.bosses) ? bundle.bosses.length : 0,
    totalDropRecords: Number(bundle?.totalDrops ?? 0),
    targetedBossGroups: 0,
    importedBosses: 0,
    skippedBosses: 0,
    replacedLootRows: 0,
    insertedLootRows: 0,
    directBossRows: 0,
    treasureBagRows: 0,
    unresolvedBosses: [],
    referenceOnlyBosses: [],
    unresolvedItems: [],
    samples: [],
  };

  try {
    await conn.beginTransaction();

    for (const bossRecord of Array.isArray(bundle?.bosses) ? bundle.bosses : []) {
      const normalizedBossName = normalizeKey(bossRecord?.bossName);
      const bossGroup = bossGroups.byName.get(normalizedBossName) ?? null;
      if (!bossGroup) {
        recordSample(summary.unresolvedBosses, {
          bossName: bossRecord?.bossName ?? null,
          reason: 'boss_group_not_found',
        });
        summary.skippedBosses += 1;
        continue;
      }

      summary.targetedBossGroups += 1;
      const ownerContext = resolveBossLootOwnerContext(bossGroup);
      const ownerNpc = ownerContext.ownerNpc;
      if (!ownerNpc) {
        const unresolvedRecord = {
          bossName: bossRecord?.bossName ?? null,
          bossGroupCode: bossGroup.code,
          reason: ownerContext.skipReason,
          memberCount: bossGroup.members.length,
          ownerMode: ownerContext.ownerMode,
        };
        if (ownerContext.ownerMode === 'reference_only_composite_without_npc_owner') {
          recordSample(summary.referenceOnlyBosses, unresolvedRecord);
        } else {
          recordSample(summary.unresolvedBosses, unresolvedRecord);
        }
        summary.skippedBosses += 1;
        continue;
      }

      const rowsToInsert = [];
      const drops = Array.isArray(bossRecord?.drops) ? bossRecord.drops : [];
      for (let index = 0; index < drops.length; index += 1) {
        const drop = drops[index];
        const resolvedItem = resolveItem(drop, itemLookup);
        if (!resolvedItem.dbItem) {
          recordSample(summary.unresolvedItems, {
            bossName: bossRecord?.bossName ?? null,
            bossGroupCode: bossGroup.code,
            ownerNpcId: ownerNpc.id,
            ownerNpcInternalName: ownerNpc.internalName,
            itemInternalName: toNullableString(drop?.itemInternalName),
            itemName: toNullableString(drop?.itemName),
            dropSourceKind: normalizeDropSourceKind(drop?.dropSourceKind),
            reason: resolvedItem.reason,
          });
          continue;
        }
        rowsToInsert.push({
          npcId: ownerNpc.id,
          itemId: resolvedItem.dbItem.id,
          sourceItemId: null,
          dropSourceKind: normalizeDropSourceKind(drop?.dropSourceKind),
          quantityMin: toNullableInteger(drop?.quantityMin),
          quantityMax: toNullableInteger(drop?.quantityMax),
          quantityText: toNullableString(drop?.quantityText),
          chanceValue: toNullableDecimal(drop?.chanceValue),
          chanceText: toNullableString(drop?.chanceText),
          conditions: toNullableString(drop?.conditions),
          notes: toNullableString(drop?.notes),
          sortOrder: index + 1,
          itemInternalName: resolvedItem.dbItem.internalName,
          itemName: resolvedItem.dbItem.name,
          itemNameZh: resolvedItem.dbItem.nameZh,
        });
      }

      if (rowsToInsert.length == 0) {
        recordSample(summary.unresolvedBosses, {
          bossName: bossRecord?.bossName ?? null,
          bossGroupCode: bossGroup.code,
          ownerNpcId: ownerNpc.id,
          ownerNpcInternalName: ownerNpc.internalName,
          reason: 'no_resolved_loot_rows',
          sourceDropCount: drops.length,
        });
        summary.skippedBosses += 1;
        continue;
      }

      const existingRows = await countExistingLootRows(conn, ownerNpc.id);
      summary.replacedLootRows += existingRows;
      summary.insertedLootRows += rowsToInsert.length;
      summary.directBossRows += rowsToInsert.filter((row) => row.dropSourceKind === 'direct_boss').length;
      summary.treasureBagRows += rowsToInsert.filter((row) => row.dropSourceKind === 'treasure_bag').length;
      summary.importedBosses += 1;

      if (!dryRun) {
        await conn.execute('DELETE FROM npc_loot_entries WHERE npc_id = ?', [ownerNpc.id]);
        for (const row of rowsToInsert) {
          await conn.execute(
            `INSERT INTO npc_loot_entries
              (npc_id, item_id, source_item_id, drop_source_kind, quantity_min, quantity_max, quantity_text, chance_value, chance_text, conditions, notes, sort_order, status, deleted)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
            [
              row.npcId,
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

      if (summary.samples.length < 20) {
        summary.samples.push({
          bossName: bossRecord?.bossName ?? null,
          bossGroupCode: bossGroup.code,
          ownerNpcId: ownerNpc.id,
          ownerNpcInternalName: ownerNpc.internalName,
          existingRows,
          insertedRows: rowsToInsert.length,
          directBossRows: rowsToInsert.filter((row) => row.dropSourceKind === 'direct_boss').length,
          treasureBagRows: rowsToInsert.filter((row) => row.dropSourceKind === 'treasure_bag').length,
          uniqueItemCount: countUniqueRows(rowsToInsert),
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
  console.log(`Bundle: ${summary.bundleSourcePath}`);
  if (summary.generatedBundleWritten && summary.bundleGeneratedPath) {
    console.log(`Generated bundle: ${summary.bundleGeneratedPath}`);
  }
  console.log(`Dry run: ${summary.dryRun}`);
  console.log(`Imported bosses: ${summary.importedBosses}`);
  console.log(`Inserted loot rows: ${summary.insertedLootRows}`);
  console.log(`Report: ${reportPath}`);
}

function loadOrGenerateBundle({
  bundleInputPath,
  bundlePath,
  relationsPath,
  npcPath,
  regenerateBundle,
  bossNameOverrides = [],
}) {
  if (bundleInputPath) {
    return {
      payload: loadJson(bundleInputPath),
      sourcePath: bundleInputPath,
      generatedPath: null,
      generated: false,
    };
  }

  if (!regenerateBundle && fs.existsSync(bundlePath)) {
    return {
      payload: loadJson(bundlePath),
      sourcePath: bundlePath,
      generatedPath: null,
      generated: false,
    };
  }

  const relationPayload = loadJson(relationsPath);
  const npcPayload = loadJson(npcPath);
  const bundle = buildBossLootBundle({
    relationPayload,
    npcPayload,
    bossNameOverrides,
    relationsSourceFile: relationsPath,
    npcSourceFile: npcPath,
  });
  writeJson(bundlePath, bundle);
  return {
    payload: bundle,
    sourcePath: bundlePath,
    generatedPath: bundlePath,
    generated: true,
  };
}

async function loadBossGroups(conn) {
  const [rows] = await conn.query(
    `SELECT
       bg.id,
       bg.code,
       bg.name_en AS nameEn,
       bg.name_zh AS nameZh,
       n.id AS npcId,
       n.game_id AS npcGameId,
       n.internal_name AS npcInternalName,
       n.name AS npcName,
       n.name_zh AS npcNameZh,
       n.boss_role AS bossRole
     FROM boss_groups bg
     LEFT JOIN npcs n ON n.boss_group_id = bg.id AND n.deleted = 0
     WHERE bg.deleted = 0
     ORDER BY bg.id ASC, n.id ASC`
  );

  const byName = new Map();
  for (const row of rows) {
    const key = normalizeKey(row.nameEn);
    if (!key) {
      continue;
    }
    let bossGroup = byName.get(key);
    if (!bossGroup) {
      bossGroup = {
        id: Number(row.id),
        code: toNullableString(row.code),
        nameEn: toNullableString(row.nameEn),
        nameZh: toNullableString(row.nameZh),
        members: [],
      };
      byName.set(key, bossGroup);
    }
    if (row.npcId != null) {
      bossGroup.members.push({
        id: Number(row.npcId),
        gameId: toNullableInteger(row.npcGameId),
        internalName: toNullableString(row.npcInternalName),
        name: toNullableString(row.npcName),
        nameZh: toNullableString(row.npcNameZh),
        bossRole: toNullableString(row.bossRole),
      });
    }
  }
  return { byName };
}

async function loadItemLookup(conn) {
  const [rows] = await conn.query(
    `SELECT id, internal_name AS internalName, name, name_zh AS nameZh
     FROM items
     WHERE deleted = 0`
  );
  const byInternal = new Map();
  const byNameBuckets = new Map();

  for (const row of rows) {
    const record = {
      id: Number(row.id),
      internalName: toNullableString(row.internalName),
      name: toNullableString(row.name),
      nameZh: toNullableString(row.nameZh),
    };
    const internalKey = normalizeKey(record.internalName);
    if (internalKey) {
      byInternal.set(internalKey, record);
    }
    const nameKey = normalizeKey(record.name);
    if (nameKey) {
      const bucket = byNameBuckets.get(nameKey) ?? [];
      bucket.push(record);
      byNameBuckets.set(nameKey, bucket);
    }
  }

  const byNameUnique = new Map();
  for (const [key, bucket] of byNameBuckets.entries()) {
    if (bucket.length === 1) {
      byNameUnique.set(key, bucket[0]);
    }
  }

  return { byInternal, byNameUnique };
}

function resolveItem(drop, itemLookup) {
  const internalName = toNullableString(drop?.itemInternalName);
  const itemName = toNullableString(drop?.itemName);
  if (internalName) {
    const dbItem = itemLookup.byInternal.get(normalizeKey(internalName)) ?? null;
    if (dbItem) {
      return { dbItem, reason: null };
    }
  }
  if (itemName) {
    const dbItem = itemLookup.byNameUnique.get(normalizeKey(itemName)) ?? null;
    if (dbItem) {
      return { dbItem, reason: internalName ? 'internal_name_not_found_name_fallback_used' : null };
    }
  }
  if (internalName) {
    return { dbItem: null, reason: 'internal_name_not_found_in_db_items' };
  }
  if (itemName) {
    return { dbItem: null, reason: 'item_name_not_found_in_db_items' };
  }
  return { dbItem: null, reason: 'missing_item_identity' };
}

async function countExistingLootRows(conn, npcId) {
  const [[row]] = await conn.execute(
    'SELECT COUNT(*) AS total FROM npc_loot_entries WHERE npc_id = ? AND deleted = 0',
    [npcId]
  );
  return Number(row?.total ?? 0);
}

async function ensureSchema(conn) {
  const sqlPath = resolveBossLootSchemaSqlPath(repoRoot);
  await conn.query(fs.readFileSync(sqlPath, 'utf8'));
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

function countUniqueRows(rows) {
  const keys = new Set();
  for (const row of rows) {
    const key = normalizeKey(row.itemInternalName) || normalizeKey(row.itemName) || String(row.itemId || '');
    if (key) {
      keys.add(key);
    }
  }
  return keys.size;
}

function recordSample(list, value) {
  if (!Array.isArray(list)) {
    return;
  }
  if (list.length < 100) {
    list.push(value);
  }
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeDropSourceKind(value) {
  const text = toNullableString(value);
  if (!text) {
    return null;
  }
  const normalized = text.trim().toLowerCase();
  if (normalized === 'direct_boss' || normalized === 'treasure_bag') {
    return normalized;
  }
  return text;
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
