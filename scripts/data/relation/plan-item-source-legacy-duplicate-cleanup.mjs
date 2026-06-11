#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { parseCliArgs, writeJson } from '../lib/wiki-item-utils.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';

const repoRoot = getProjectRoot();
const require = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'));
const DEFAULT_REVIEWED_SOURCE_PAGES = ['Torches', 'Ropes', 'Block-placing wands'];
const DEFAULT_REVIEWED_ROW_MIN_ID = 198517;
const NPC_REF_TYPES = new Set(['npc', 'boss']);

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

export function parseItemSourceLegacyDuplicateCleanupArgs(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const apply = booleanOption(options.apply, false);
  const confirmLocalCompat = booleanOption(options['confirm-local-compat'] ?? options.confirmLocalCompat, false);
  if (apply && !confirmLocalCompat) {
    throw new Error('item source legacy duplicate cleanup apply requires --confirm-local-compat=true');
  }
  return {
    itemIds: parseIntegerList(options['item-ids'] ?? options.itemIds),
    reviewedRowMinId: Number(options['reviewed-row-min-id'] ?? options.reviewedRowMinId ?? DEFAULT_REVIEWED_ROW_MIN_ID),
    reviewedSourcePages: parseTextList(options['reviewed-source-pages'] ?? options.reviewedSourcePages, DEFAULT_REVIEWED_SOURCE_PAGES),
    outputPath: options.output ?? null,
    backupDir: options['backup-dir'] ?? options.backupDir ?? path.join(process.cwd(), 'data', 'backups', 'item-source-legacy-duplicate-cleanup'),
    apply,
    confirmLocalCompat,
    database: options.database ?? 'terria_v1_local',
    host: options.host ?? null,
    port: options.port ?? null,
    user: options.user ?? null,
    password: options.password ?? null,
    batchId: options['batch-id'] ?? options.batchId ?? null
  };
}

export function buildLegacyDuplicateCleanupPlan(rows, {
  reviewedRowMinId = DEFAULT_REVIEWED_ROW_MIN_ID,
  reviewedSourcePages = DEFAULT_REVIEWED_SOURCE_PAGES
} = {}) {
  const activeRows = (Array.isArray(rows) ? rows : []).filter((entry) => Number(entry.status) === 1 && Number(entry.deleted) === 0);
  const reviewedPages = new Set(reviewedSourcePages.map(normalizeText).filter(Boolean));
  const reviewedRows = activeRows.filter((entry) => Number(entry.id) >= reviewedRowMinId && reviewedPages.has(normalizeText(entry.source_page)));
  const legacyRows = activeRows.filter((entry) => Number(entry.id) < reviewedRowMinId);
  const rowsToSoftDelete = [];
  const unsafeOverlaps = [];

  for (const legacyRow of legacyRows) {
    const coveringRow = reviewedRows.find((reviewedRow) => coversLegacyRow(reviewedRow, legacyRow));
    if (coveringRow) {
      rowsToSoftDelete.push(buildSoftDeleteEntry(legacyRow, coveringRow));
      continue;
    }
    const unsafe = reviewedRows.find((reviewedRow) => overlapsByName(reviewedRow, legacyRow));
    if (unsafe) {
      unsafeOverlaps.push(buildUnsafeOverlapEntry(legacyRow, unsafe));
    }
  }

  rowsToSoftDelete.sort((a, b) => a.id - b.id);
  unsafeOverlaps.sort((a, b) => a.id - b.id);

  return {
    reviewedRowMinId,
    reviewedSourcePages,
    summary: {
      inputRows: activeRows.length,
      reviewedRows: reviewedRows.length,
      legacyRows: legacyRows.length,
      rowsToSoftDelete: rowsToSoftDelete.length,
      unsafeOverlaps: unsafeOverlaps.length
    },
    rowsToSoftDelete,
    unsafeOverlaps
  };
}

export async function runItemSourceLegacyDuplicateCleanup(options = {}, dependencies = {}) {
  const now = dependencies.now instanceof Date ? dependencies.now : new Date();
  const batchId = options.batchId ?? `item-source-legacy-cleanup-${now.toISOString().replace(/[:.]/g, '-')}`;
  const config = dependencies.config ?? loadLocalStackConfig(repoRoot);
  const mysqlModule = dependencies.mysqlModule ?? require('mysql2/promise');
  const connectionConfig = {
    host: options.host ?? process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
    port: Number(options.port ?? process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 13306),
    user: options.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
    password: options.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
    database: options.database ?? process.env.TERRAPEDIA_DB_NAME ?? config.database?.name ?? 'terria_v1_local'
  };

  if (!Array.isArray(options.itemIds) || options.itemIds.length === 0) {
    throw new Error('item source legacy duplicate cleanup requires --item-ids');
  }
  if (options.apply && connectionConfig.database !== 'terria_v1_local') {
    throw new Error(`Refusing item source legacy duplicate cleanup apply to non-local database: ${connectionConfig.database}`);
  }

  const connection = await mysqlModule.createConnection(connectionConfig);
  let rows = [];
  let beforeRows = [];
  let softDeleted = 0;
  let plan;
  try {
    rows = await readRowsForItems(connection, options.itemIds);
    plan = buildLegacyDuplicateCleanupPlan(rows, {
      reviewedRowMinId: options.reviewedRowMinId ?? DEFAULT_REVIEWED_ROW_MIN_ID,
      reviewedSourcePages: options.reviewedSourcePages ?? DEFAULT_REVIEWED_SOURCE_PAGES
    });
    const plannedIds = plan.rowsToSoftDelete.map((entry) => entry.id);
    beforeRows = plannedIds.length ? await readRowsByIds(connection, plannedIds) : [];
    if (options.apply && plannedIds.length) {
      await connection.beginTransaction();
      const placeholders = plannedIds.map(() => '?').join(', ');
      const [result] = await connection.execute(
        `UPDATE \`item_acquisition_sources\`
SET \`status\` = 0,
    \`deleted\` = 1,
    \`updated_at\` = CURRENT_TIMESTAMP
WHERE \`id\` IN (${placeholders})
  AND \`status\` = 1
  AND \`deleted\` = 0`,
        plannedIds
      );
      softDeleted = Number(result?.affectedRows ?? 0);
      if (softDeleted !== plannedIds.length) {
        throw new Error(`Expected to soft-delete ${plannedIds.length} rows, affected ${softDeleted}`);
      }
      await connection.commit();
    }
  } catch (error) {
    if (options.apply) {
      await connection.rollback();
    }
    throw error;
  } finally {
    await connection.end();
  }

  const backupPath = path.resolve(process.cwd(), options.backupDir, `${batchId}.before.json`);
  writeJson(backupPath, {
    generatedAt: now.toISOString(),
    batchId,
    connection: { host: connectionConfig.host, port: connectionConfig.port, database: connectionConfig.database },
    rows: beforeRows
  });

  const report = {
    generatedAt: now.toISOString(),
    batchId,
    apply: Boolean(options.apply),
    connection: { host: connectionConfig.host, port: connectionConfig.port, database: connectionConfig.database, user: connectionConfig.user },
    itemIds: options.itemIds,
    backupPath,
    summary: {
      ...plan.summary,
      softDeleted
    },
    rowsToSoftDelete: plan.rowsToSoftDelete,
    unsafeOverlaps: plan.unsafeOverlaps,
    rollbackSql: buildRollbackSql(beforeRows)
  };
  if (options.outputPath) {
    writeJson(path.resolve(process.cwd(), options.outputPath), report);
  }
  return report;
}

function coversLegacyRow(reviewedRow, legacyRow) {
  if (!sameSourceShape(reviewedRow, legacyRow)) return false;
  if (NPC_REF_TYPES.has(normalizeText(legacyRow.source_ref_type))) {
    if (toNullableInteger(reviewedRow.source_ref_id) === toNullableInteger(legacyRow.source_ref_id)) {
      return true;
    }
    return normalizeIdentity(reviewedRow.source_ref_name) === normalizeIdentity(legacyRow.source_ref_name)
      && toNullableInteger(reviewedRow.source_npc_type) != null
      && toNullableInteger(reviewedRow.source_npc_type) === toNullableInteger(legacyRow.source_npc_type);
  }
  return toNullableInteger(reviewedRow.source_ref_id) === toNullableInteger(legacyRow.source_ref_id)
    && normalizeIdentity(reviewedRow.source_ref_name) === normalizeIdentity(legacyRow.source_ref_name);
}

function overlapsByName(reviewedRow, legacyRow) {
  return sameSourceShape(reviewedRow, legacyRow)
    && normalizeIdentity(reviewedRow.source_ref_name)
    && normalizeIdentity(reviewedRow.source_ref_name) === normalizeIdentity(legacyRow.source_ref_name);
}

function sameSourceShape(a, b) {
  return toNullableInteger(a.item_id) === toNullableInteger(b.item_id)
    && normalizeText(a.source_type) === normalizeText(b.source_type)
    && normalizeText(a.source_ref_type) === normalizeText(b.source_ref_type);
}

function buildSoftDeleteEntry(legacyRow, coveringRow) {
  return {
    id: Number(legacyRow.id),
    itemId: toNullableInteger(legacyRow.item_id),
    itemName: legacyRow.item_name ?? null,
    itemInternalName: legacyRow.item_internal_name ?? null,
    sourceType: legacyRow.source_type ?? null,
    sourceRefType: legacyRow.source_ref_type ?? null,
    sourceRefId: toNullableInteger(legacyRow.source_ref_id),
    sourceRefName: legacyRow.source_ref_name ?? null,
    sourceNpcType: toNullableInteger(legacyRow.source_npc_type),
    quantityText: legacyRow.quantity_text ?? null,
    chanceText: legacyRow.chance_text ?? null,
    conditions: legacyRow.conditions ?? null,
    sourcePage: legacyRow.source_page ?? null,
    coveringReviewedRowId: Number(coveringRow.id),
    coveringSourceRefId: toNullableInteger(coveringRow.source_ref_id),
    coveringSourceRefName: coveringRow.source_ref_name ?? null,
    coveringSourceNpcType: toNullableInteger(coveringRow.source_npc_type),
    coveringSourcePage: coveringRow.source_page ?? null,
    coverageReason: toNullableInteger(coveringRow.source_ref_id) === toNullableInteger(legacyRow.source_ref_id)
      ? 'exact_ref_id'
      : 'canonical_npc_type'
  };
}

function buildUnsafeOverlapEntry(legacyRow, reviewedRow) {
  return {
    id: Number(legacyRow.id),
    itemId: toNullableInteger(legacyRow.item_id),
    itemName: legacyRow.item_name ?? null,
    sourceType: legacyRow.source_type ?? null,
    sourceRefType: legacyRow.source_ref_type ?? null,
    sourceRefId: toNullableInteger(legacyRow.source_ref_id),
    sourceRefName: legacyRow.source_ref_name ?? null,
    sourceNpcType: toNullableInteger(legacyRow.source_npc_type),
    sourcePage: legacyRow.source_page ?? null,
    reviewedRowId: Number(reviewedRow.id),
    reviewedSourceRefId: toNullableInteger(reviewedRow.source_ref_id),
    reviewedSourceNpcType: toNullableInteger(reviewedRow.source_npc_type),
    reviewedSourcePage: reviewedRow.source_page ?? null,
    reason: 'same_display_name_without_exact_or_canonical_match'
  };
}

async function readRowsForItems(connection, itemIds) {
  const placeholders = itemIds.map(() => '?').join(', ');
  const [rows] = await connection.execute(
    `SELECT s.*,
       i.name AS item_name,
       i.internal_name AS item_internal_name,
       n.npc_type AS source_npc_type
FROM \`item_acquisition_sources\` s
JOIN \`items\` i ON i.id = s.item_id
LEFT JOIN \`npcs\` n
  ON s.source_ref_type IN ('npc', 'boss')
 AND n.id = s.source_ref_id
WHERE s.item_id IN (${placeholders})
ORDER BY s.item_id, s.source_type, s.source_ref_type, s.source_ref_name, s.source_ref_id, s.id`,
    itemIds
  );
  return Array.isArray(rows) ? rows : [];
}

async function readRowsByIds(connection, ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await connection.execute(
    `SELECT * FROM \`item_acquisition_sources\` WHERE \`id\` IN (${placeholders}) ORDER BY \`id\``,
    ids
  );
  return Array.isArray(rows) ? rows : [];
}

function buildRollbackSql(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const ids = rows.map((row) => Number(row.id)).filter(Number.isInteger);
  const statusCases = rows.map((row) => `WHEN ${Number(row.id)} THEN ${Number(row.status)}`).join(' ');
  const deletedCases = rows.map((row) => `WHEN ${Number(row.id)} THEN ${Number(row.deleted)}`).join(' ');
  return [
    'UPDATE `item_acquisition_sources` SET',
    `  \`status\` = CASE \`id\` ${statusCases} END,`,
    `  \`deleted\` = CASE \`id\` ${deletedCases} END`,
    `WHERE \`id\` IN (${ids.join(', ')});`
  ].join(' ');
}

function parseIntegerList(value) {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isInteger);
  if (value == null || value === '') return [];
  return String(value).split(',').map((entry) => Number(entry.trim())).filter(Number.isInteger);
}

function parseTextList(value, fallback) {
  if (value == null || value === '') return fallback;
  return String(value).split(',').map((entry) => entry.trim()).filter(Boolean);
}

function normalizeText(value) {
  if (value == null) return '';
  return String(value).trim();
}

function normalizeIdentity(value) {
  return normalizeText(value).toLowerCase().replace(/[_\s-]+/g, '');
}

function toNullableInteger(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runItemSourceLegacyDuplicateCleanup(parseItemSourceLegacyDuplicateCleanupArgs())
    .then((report) => {
      console.log(JSON.stringify(report.summary, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
