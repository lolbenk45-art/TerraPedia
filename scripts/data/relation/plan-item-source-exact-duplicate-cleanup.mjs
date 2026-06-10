#!/usr/bin/env node

import path from 'node:path';
import { createRequire } from 'node:module';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { parseCliArgs, writeJson } from '../lib/wiki-item-utils.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';

const repoRoot = getProjectRoot();
const require = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'));

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

export function parseItemSourceExactDuplicateCleanupArgs(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const apply = booleanOption(options.apply, false);
  const confirmLocalCompat = booleanOption(options['confirm-local-compat'] ?? options.confirmLocalCompat, false);
  const allowBulk = booleanOption(options['allow-bulk'] ?? options.allowBulk, false);
  if (apply && !confirmLocalCompat) {
    throw new Error('item source exact duplicate cleanup apply requires --confirm-local-compat=true');
  }
  if (apply && !allowBulk) {
    throw new Error('item source exact duplicate cleanup apply requires --allow-bulk=true');
  }
  return {
    outputPath: options.output ?? null,
    backupDir: options['backup-dir'] ?? options.backupDir ?? path.join(process.cwd(), 'data', 'backups', 'item-source-exact-duplicate-cleanup'),
    batchId: options['batch-id'] ?? options.batchId ?? null,
    apply,
    confirmLocalCompat,
    allowBulk,
    database: options.database ?? 'terria_v1_local',
    host: options.host ?? null,
    port: options.port ?? null,
    user: options.user ?? null,
    password: options.password ?? null
  };
}

export function buildExactDuplicateCleanupPlan(rows) {
  const activeRows = (Array.isArray(rows) ? rows : []).filter((row) => Number(row.status) === 1 && Number(row.deleted) === 0);
  const byKey = new Map();
  const skippedGroups = [];
  for (const row of activeRows) {
    if (normalizeText(row.source_ref_type) === 'biome_wikitext') {
      rememberGroup(skippedGroups, row, 'biome_wikitext');
      continue;
    }
    const key = buildDuplicateKey(row);
    const group = byKey.get(key) ?? [];
    group.push(row);
    byKey.set(key, group);
  }

  const groups = [];
  const rowsToSoftDelete = [];
  for (const groupRows of byKey.values()) {
    if (groupRows.length < 2) continue;
    const sorted = groupRows.slice().sort(compareRowsToKeep);
    const keep = sorted[0];
    const deleteRows = sorted.slice(1).sort((a, b) => Number(a.id) - Number(b.id));
    const entry = {
      itemId: toNullableInteger(keep.item_id),
      itemInternalName: keep.item_internal_name ?? null,
      itemName: keep.item_name ?? null,
      sourceType: keep.source_type ?? null,
      sourceRefType: keep.source_ref_type ?? null,
      sourceRefId: toNullableInteger(keep.source_ref_id),
      sourceRefName: keep.source_ref_name ?? null,
      quantityText: keep.quantity_text ?? null,
      chanceText: keep.chance_text ?? null,
      conditions: keep.conditions ?? null,
      keepId: Number(keep.id),
      deleteIds: deleteRows.map((row) => Number(row.id)),
      rowCount: groupRows.length
    };
    groups.push(entry);
    for (const row of deleteRows) {
      rowsToSoftDelete.push({
        id: Number(row.id),
        keepId: Number(keep.id),
        itemId: toNullableInteger(row.item_id),
        itemInternalName: row.item_internal_name ?? null,
        itemName: row.item_name ?? null,
        sourceType: row.source_type ?? null,
        sourceRefType: row.source_ref_type ?? null,
        sourceRefId: toNullableInteger(row.source_ref_id),
        sourceRefName: row.source_ref_name ?? null,
        quantityText: row.quantity_text ?? null,
        chanceText: row.chance_text ?? null,
        conditions: row.conditions ?? null,
        sourcePage: row.source_page ?? null
      });
    }
  }
  groups.sort((a, b) => a.itemId - b.itemId || a.keepId - b.keepId);
  rowsToSoftDelete.sort((a, b) => a.id - b.id);

  return {
    summary: {
      inputRows: activeRows.length,
      duplicateGroups: groups.length,
      rowsToSoftDelete: rowsToSoftDelete.length,
      skippedGroups: skippedGroups.length
    },
    groups,
    rowsToSoftDelete,
    skippedGroups
  };
}

export async function runItemSourceExactDuplicateCleanup(options = {}, dependencies = {}) {
  const now = dependencies.now instanceof Date ? dependencies.now : new Date();
  const batchId = options.batchId ?? `item-source-exact-duplicate-cleanup-${now.toISOString().replace(/[:.]/g, '-')}`;
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
    throw new Error(`Refusing item source exact duplicate cleanup apply to non-local database: ${connectionConfig.database}`);
  }

  const connection = await mysqlModule.createConnection(connectionConfig);
  let plan;
  let beforeRows = [];
  let softDeleted = 0;
  try {
    const rows = await readActiveRows(connection);
    plan = buildExactDuplicateCleanupPlan(rows);
    const ids = plan.rowsToSoftDelete.map((row) => row.id);
    beforeRows = ids.length ? await readRowsByIds(connection, ids) : [];
    if (options.apply && ids.length) {
      await connection.beginTransaction();
      const placeholders = ids.map(() => '?').join(', ');
      const [result] = await connection.execute(
        `UPDATE \`item_acquisition_sources\`
SET \`status\` = 0,
    \`deleted\` = 1,
    \`updated_at\` = CURRENT_TIMESTAMP
WHERE \`id\` IN (${placeholders})
  AND \`status\` = 1
  AND \`deleted\` = 0`,
        ids
      );
      softDeleted = Number(result?.affectedRows ?? 0);
      if (softDeleted !== ids.length) {
        throw new Error(`Expected to soft-delete ${ids.length} rows, affected ${softDeleted}`);
      }
      await connection.commit();
    }
  } catch (error) {
    if (options.apply) await connection.rollback();
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
      ...plan.summary,
      softDeleted
    },
    groups: plan.groups,
    rowsToSoftDelete: plan.rowsToSoftDelete,
    skippedGroups: plan.skippedGroups,
    rollbackSql: buildRollbackSql(beforeRows)
  };
  if (options.outputPath) {
    writeJson(path.resolve(process.cwd(), options.outputPath), report);
  }
  return report;
}

async function readActiveRows(connection) {
  const [rows] = await connection.execute(
    `SELECT s.*,
       i.internal_name AS item_internal_name,
       i.name AS item_name
FROM \`item_acquisition_sources\` s
JOIN \`items\` i ON i.id = s.item_id
WHERE s.status = 1
  AND s.deleted = 0
ORDER BY s.item_id, s.source_type, s.source_ref_type, s.source_ref_name, s.source_ref_id, s.id`
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

function buildDuplicateKey(row) {
  return JSON.stringify([
    toNullableInteger(row.item_id),
    normalizeText(row.source_type),
    normalizeText(row.source_ref_type),
    toNullableInteger(row.source_ref_id),
    normalizeText(row.source_ref_name),
    normalizeText(row.quantity_text),
    normalizeText(row.chance_text),
    normalizeText(row.conditions)
  ]);
}

function compareRowsToKeep(left, right) {
  return scoreRow(right) - scoreRow(left) || Number(left.id) - Number(right.id);
}

function scoreRow(row) {
  let score = 0;
  if (!isWikiUrl(row.source_page)) score += 100;
  if (normalizeText(row.notes)) score += 20;
  if (normalizeText(row.conditions)) score += 10;
  if (normalizeText(row.source_revision_timestamp)) score += 5;
  if (Number(row.id) >= 198517) score += 3;
  return score;
}

function rememberGroup(groups, row, reason) {
  const key = `${reason}|${row.item_id}|${row.source_type}|${row.source_ref_type}|${row.source_ref_name}|${row.quantity_text ?? ''}|${row.chance_text ?? ''}|${row.conditions ?? ''}`;
  let group = groups.find((entry) => entry.key === key);
  if (!group) {
    group = { key, reason, ids: [] };
    groups.push(group);
  }
  group.ids.push(Number(row.id));
}

function buildRollbackSql(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const ids = rows.map((row) => Number(row.id)).filter(Number.isInteger);
  const statusCases = rows.map((row) => `WHEN ${Number(row.id)} THEN ${Number(row.status)}`).join(' ');
  const deletedCases = rows.map((row) => `WHEN ${Number(row.id)} THEN ${Number(row.deleted)}`).join(' ');
  return `UPDATE \`item_acquisition_sources\` SET \`status\` = CASE \`id\` ${statusCases} END, \`deleted\` = CASE \`id\` ${deletedCases} END WHERE \`id\` IN (${ids.join(', ')});`;
}

function isWikiUrl(value) {
  return /^https:\/\/terraria\.wiki\.gg\/wiki\//i.test(normalizeText(value));
}

function normalizeText(value) {
  if (value == null) return '';
  return String(value).trim();
}

function toNullableInteger(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runItemSourceExactDuplicateCleanup(parseItemSourceExactDuplicateCleanupArgs())
    .then((report) => {
      console.log(JSON.stringify(report.summary, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
