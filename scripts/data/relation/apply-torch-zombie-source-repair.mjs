#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { parseCliArgs, writeJson } from '../lib/wiki-item-utils.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';

const repoRoot = getProjectRoot();
const require = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'));

const TARGET_IDS = [198599, 192158, 192159];
const WRONG_REVIEWED_ROW_ID = 198599;
const LEGACY_ROW_IDS = [192158, 192159];
const TORCH_ITEM_ID = 8;
const ARMED_TORCH_ZOMBIE_ID = 591;
const TORCH_ZOMBIE_ID = 590;

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

export function parseTorchZombieSourceRepairArgs(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const apply = booleanOption(options.apply, false);
  const confirmLocalCompat = booleanOption(options['confirm-local-compat'] ?? options.confirmLocalCompat, false);
  if (apply && !confirmLocalCompat) {
    throw new Error('torch zombie source repair apply requires --confirm-local-compat=true');
  }
  return {
    outputPath: options.output ?? null,
    backupDir: options['backup-dir'] ?? options.backupDir ?? path.join(process.cwd(), 'data', 'backups', 'item-source-torch-zombie-repair'),
    batchId: options['batch-id'] ?? options.batchId ?? null,
    apply,
    confirmLocalCompat,
    database: options.database ?? 'terria_v1_local',
    host: options.host ?? null,
    port: options.port ?? null,
    user: options.user ?? null,
    password: options.password ?? null
  };
}

export function buildTorchZombieSourceRepairPlan(rows) {
  const byId = new Map((Array.isArray(rows) ? rows : []).map((row) => [Number(row.id), row]));
  const wrong = byId.get(WRONG_REVIEWED_ROW_ID);
  const legacyRows = LEGACY_ROW_IDS.map((id) => byId.get(id)).filter(Boolean);
  const validationErrors = [];

  if (!wrong) validationErrors.push('wrong_reviewed_row_missing');
  if (wrong && (Number(wrong.source_ref_id) !== -55 || normalizeText(wrong.source_ref_name) !== 'Zombie')) {
    validationErrors.push('wrong_reviewed_row_unexpected_identity');
  }
  for (const id of LEGACY_ROW_IDS) {
    const row = byId.get(id);
    if (!row) validationErrors.push(`legacy_row_missing:${id}`);
    else if (Number(row.status) !== 1 || Number(row.deleted) !== 0) validationErrors.push(`legacy_row_not_active:${id}`);
  }

  return {
    validationErrors,
    updateWrongReviewedRow: {
      id: WRONG_REVIEWED_ROW_ID,
      target: {
        sourceRefId: ARMED_TORCH_ZOMBIE_ID,
        sourceRefName: 'Armed Torch Zombie',
        sourcePage: 'Torches',
        sourceRevisionTimestamp: '2026-05-22 20:22:49'
      }
    },
    insertRows: [{
      itemId: TORCH_ITEM_ID,
      sourceType: 'drop',
      sourceRefType: 'npc',
      sourceRefId: TORCH_ZOMBIE_ID,
      sourceRefName: 'Torch Zombie',
      quantityMin: 5,
      quantityMax: 20,
      quantityText: '5–20',
      chanceValue: null,
      chanceText: '100%',
      conditions: null,
      notes: null,
      sourceProvider: 'wiki_gg',
      sourcePage: 'Torches',
      sourceRevisionTimestamp: '2026-05-22 20:22:49',
      sortOrder: 13,
      status: 1,
      deleted: 0
    }],
    softDeleteIds: legacyRows.map((row) => Number(row.id)).sort((a, b) => a - b)
  };
}

export async function runTorchZombieSourceRepair(options = {}, dependencies = {}) {
  const now = dependencies.now instanceof Date ? dependencies.now : new Date();
  const batchId = options.batchId ?? `torch-zombie-source-repair-${now.toISOString().replace(/[:.]/g, '-')}`;
  const config = dependencies.config ?? loadLocalStackConfig(repoRoot);
  const mysqlModule = dependencies.mysqlModule ?? require('mysql2/promise');
  const connectionConfig = {
    host: options.host ?? process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
    port: Number(options.port ?? process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 13306),
    user: options.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
    password: options.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
    database: options.database ?? process.env.TERRAPEDIA_DB_NAME ?? config.database?.name ?? 'terria_v1_local'
  };
  if (options.apply && connectionConfig.database !== 'terria_v1_local') {
    throw new Error(`Refusing torch zombie source repair apply to non-local database: ${connectionConfig.database}`);
  }

  const connection = await mysqlModule.createConnection(connectionConfig);
  let beforeRows = [];
  let plan;
  const insertedIds = [];
  let updated = 0;
  let softDeleted = 0;
  try {
    beforeRows = await readSourceRowsByIds(connection, TARGET_IDS);
    plan = buildTorchZombieSourceRepairPlan(beforeRows);
    await validateDatabaseRefs(connection);
    for (const insertRow of plan.insertRows) {
      const duplicateId = await findDuplicateId(connection, insertRow);
      if (duplicateId != null) {
        plan.validationErrors.push(`insert_duplicate_exists:${duplicateId}`);
      }
    }
    if (plan.validationErrors.length > 0) {
      if (options.apply) {
        throw new Error(`torch zombie source repair validation failed: ${plan.validationErrors.join(', ')}`);
      }
    } else if (options.apply) {
      await connection.beginTransaction();
      const [updateResult] = await connection.execute(
        `UPDATE \`item_acquisition_sources\`
SET \`source_ref_id\` = ?,
    \`source_ref_name\` = ?,
    \`source_page\` = ?,
    \`source_revision_timestamp\` = ?,
    \`updated_at\` = CURRENT_TIMESTAMP
WHERE \`id\` = ?
  AND \`item_id\` = ?
  AND \`source_ref_id\` = -55
  AND \`source_ref_name\` = 'Zombie'
  AND \`status\` = 1
  AND \`deleted\` = 0`,
        [
          plan.updateWrongReviewedRow.target.sourceRefId,
          plan.updateWrongReviewedRow.target.sourceRefName,
          plan.updateWrongReviewedRow.target.sourcePage,
          plan.updateWrongReviewedRow.target.sourceRevisionTimestamp,
          plan.updateWrongReviewedRow.id,
          TORCH_ITEM_ID
        ]
      );
      updated = Number(updateResult?.affectedRows ?? 0);
      if (updated !== 1) {
        throw new Error(`Expected to update 1 wrong reviewed row, affected ${updated}`);
      }

      for (const insertRow of plan.insertRows) {
        const [insertResult] = await connection.execute(buildInsertSql(), insertParams(insertRow));
        if (insertResult?.insertId != null) {
          insertedIds.push(Number(insertResult.insertId));
        }
      }

      if (plan.softDeleteIds.length) {
        const placeholders = plan.softDeleteIds.map(() => '?').join(', ');
        const [deleteResult] = await connection.execute(
          `UPDATE \`item_acquisition_sources\`
SET \`status\` = 0,
    \`deleted\` = 1,
    \`updated_at\` = CURRENT_TIMESTAMP
WHERE \`id\` IN (${placeholders})
  AND \`status\` = 1
  AND \`deleted\` = 0`,
          plan.softDeleteIds
        );
        softDeleted = Number(deleteResult?.affectedRows ?? 0);
        if (softDeleted !== plan.softDeleteIds.length) {
          throw new Error(`Expected to soft-delete ${plan.softDeleteIds.length} rows, affected ${softDeleted}`);
        }
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
    backupPath,
    summary: {
      validationErrors: plan.validationErrors.length,
      toUpdate: plan.validationErrors.length ? 0 : 1,
      toInsert: plan.validationErrors.length ? 0 : plan.insertRows.length,
      toSoftDelete: plan.validationErrors.length ? 0 : plan.softDeleteIds.length,
      updated,
      inserted: insertedIds.length,
      softDeleted
    },
    validationErrors: plan.validationErrors,
    updateWrongReviewedRow: plan.updateWrongReviewedRow,
    insertRows: plan.insertRows,
    softDeleteIds: plan.softDeleteIds,
    insertedIds,
    rollbackSql: buildRollbackSql(beforeRows, insertedIds)
  };
  if (options.outputPath) {
    writeJson(path.resolve(process.cwd(), options.outputPath), report);
  }
  return report;
}

async function readSourceRowsByIds(connection, ids) {
  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await connection.execute(
    `SELECT * FROM \`item_acquisition_sources\` WHERE \`id\` IN (${placeholders}) ORDER BY \`id\``,
    ids
  );
  return Array.isArray(rows) ? rows : [];
}

async function validateDatabaseRefs(connection) {
  const [items] = await connection.execute('SELECT id FROM `items` WHERE `id` = ? AND `status` = 1 AND `deleted` = 0 LIMIT 1', [TORCH_ITEM_ID]);
  if (!Array.isArray(items) || items.length === 0) throw new Error('Torch item missing');
  for (const npcId of [ARMED_TORCH_ZOMBIE_ID, TORCH_ZOMBIE_ID]) {
    const [npcs] = await connection.execute('SELECT id FROM `npcs` WHERE `id` = ? AND `status` = 1 AND `deleted` = 0 LIMIT 1', [npcId]);
    if (!Array.isArray(npcs) || npcs.length === 0) throw new Error(`NPC missing: ${npcId}`);
  }
}

async function findDuplicateId(connection, row) {
  const [rows] = await connection.execute(
    `SELECT id
FROM \`item_acquisition_sources\`
WHERE \`item_id\` = ?
  AND \`source_type\` = ?
  AND \`source_ref_type\` = ?
  AND \`source_ref_id\` = ?
  AND \`source_ref_name\` = ?
  AND COALESCE(\`quantity_text\`, '') = COALESCE(?, '')
  AND COALESCE(\`chance_text\`, '') = COALESCE(?, '')
  AND COALESCE(\`source_page\`, '') = COALESCE(?, '')
  AND \`status\` = 1
  AND \`deleted\` = 0
LIMIT 1`,
    [
      row.itemId,
      row.sourceType,
      row.sourceRefType,
      row.sourceRefId,
      row.sourceRefName,
      row.quantityText,
      row.chanceText,
      row.sourcePage
    ]
  );
  return Array.isArray(rows) && rows[0]?.id != null ? Number(rows[0].id) : null;
}

function buildInsertSql() {
  return `
INSERT INTO \`item_acquisition_sources\`
  (\`item_id\`, \`source_type\`, \`source_ref_type\`, \`source_ref_id\`, \`source_ref_name\`, \`biome_id\`, \`quantity_min\`, \`quantity_max\`, \`quantity_text\`, \`chance_value\`, \`chance_text\`, \`conditions\`, \`notes\`, \`source_provider\`, \`source_page\`, \`source_revision_timestamp\`, \`sort_order\`, \`status\`, \`deleted\`)
VALUES
  (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`.trim();
}

function insertParams(row) {
  return [
    row.itemId,
    row.sourceType,
    row.sourceRefType,
    row.sourceRefId,
    row.sourceRefName,
    null,
    row.quantityMin,
    row.quantityMax,
    row.quantityText,
    row.chanceValue,
    row.chanceText,
    row.conditions,
    row.notes,
    row.sourceProvider,
    row.sourcePage,
    row.sourceRevisionTimestamp,
    row.sortOrder,
    row.status,
    row.deleted
  ];
}

function buildRollbackSql(beforeRows, insertedIds) {
  const statements = [];
  if (insertedIds.length) {
    statements.push(`UPDATE \`item_acquisition_sources\` SET \`status\` = 0, \`deleted\` = 1 WHERE \`id\` IN (${insertedIds.join(', ')});`);
  }
  if (Array.isArray(beforeRows) && beforeRows.length) {
    const ids = beforeRows.map((row) => Number(row.id));
    const statusCases = beforeRows.map((row) => `WHEN ${Number(row.id)} THEN ${Number(row.status)}`).join(' ');
    const deletedCases = beforeRows.map((row) => `WHEN ${Number(row.id)} THEN ${Number(row.deleted)}`).join(' ');
    const refIdCases = beforeRows.map((row) => `WHEN ${Number(row.id)} THEN ${row.source_ref_id == null ? 'NULL' : Number(row.source_ref_id)}`).join(' ');
    const refNameCases = beforeRows.map((row) => `WHEN ${Number(row.id)} THEN ${sqlString(row.source_ref_name)}`).join(' ');
    const pageCases = beforeRows.map((row) => `WHEN ${Number(row.id)} THEN ${sqlString(row.source_page)}`).join(' ');
    const revisionCases = beforeRows.map((row) => `WHEN ${Number(row.id)} THEN ${sqlString(formatMysqlDateTime(row.source_revision_timestamp))}`).join(' ');
    statements.push([
      'UPDATE `item_acquisition_sources` SET',
      `  \`status\` = CASE \`id\` ${statusCases} END,`,
      `  \`deleted\` = CASE \`id\` ${deletedCases} END,`,
      `  \`source_ref_id\` = CASE \`id\` ${refIdCases} END,`,
      `  \`source_ref_name\` = CASE \`id\` ${refNameCases} END,`,
      `  \`source_page\` = CASE \`id\` ${pageCases} END,`,
      `  \`source_revision_timestamp\` = CASE \`id\` ${revisionCases} END`,
      `WHERE \`id\` IN (${ids.join(', ')});`
    ].join(' '));
  }
  return statements.length ? statements.join('\n') : null;
}

function sqlString(value) {
  if (value == null) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function formatMysqlDateTime(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value.toISOString().slice(0, 19).replace('T', ' ');
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 19).replace('T', ' ');
  return String(value);
}

function normalizeText(value) {
  if (value == null) return '';
  return String(value).trim();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runTorchZombieSourceRepair(parseTorchZombieSourceRepairArgs())
    .then((report) => {
      console.log(JSON.stringify(report.summary, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
