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

export function parseItemSourcePageNormalizationArgs(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const apply = booleanOption(options.apply, false);
  const confirmLocalCompat = booleanOption(options['confirm-local-compat'] ?? options.confirmLocalCompat, false);
  const allowBulk = booleanOption(options['allow-bulk'] ?? options.allowBulk, false);
  if (apply && !confirmLocalCompat) {
    throw new Error('item source page normalization apply requires --confirm-local-compat=true');
  }
  if (apply && !allowBulk) {
    throw new Error('item source page normalization apply requires --allow-bulk=true');
  }
  return {
    outputPath: options.output ?? null,
    backupDir: options['backup-dir'] ?? options.backupDir ?? path.join(process.cwd(), 'data', 'backups', 'item-source-page-normalization'),
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

export function normalizeWikiSourcePage(value) {
  const text = normalizeText(value);
  if (!text || !/^https:\/\/terraria\.wiki\.gg\/wiki\//i.test(text)) return text;
  const url = new URL(text);
  const rawTitle = decodeURIComponent(url.pathname.replace(/^\/wiki\//, ''));
  return rawTitle.replace(/_/g, ' ').trim() || text;
}

export function buildItemSourcePageNormalizationPlan(rows) {
  const activeRows = (Array.isArray(rows) ? rows : []).filter((row) => Number(row.status) === 1 && Number(row.deleted) === 0);
  const updates = [];
  for (const row of activeRows) {
    const oldSourcePage = normalizeText(row.source_page);
    const newSourcePage = normalizeWikiSourcePage(oldSourcePage);
    if (!oldSourcePage || oldSourcePage === newSourcePage) continue;
    const identityBefore = identityKey(row);
    const identityAfter = identityKey({ ...row, source_page: newSourcePage });
    updates.push({
      id: Number(row.id),
      itemId: toNullableInteger(row.item_id),
      oldSourcePage,
      newSourcePage,
      sourceType: row.source_type ?? null,
      sourceRefType: row.source_ref_type ?? null,
      sourceRefId: toNullableInteger(row.source_ref_id),
      sourceRefName: row.source_ref_name ?? null,
      identityDiff: identityBefore !== identityAfter
    });
  }
  updates.sort((a, b) => a.id - b.id);
  const duplicateGroups = countNonBiomeDuplicateGroups(activeRows.map((row) => {
    const update = updates.find((entry) => entry.id === Number(row.id));
    return update ? { ...row, source_page: update.newSourcePage } : row;
  }));
  return {
    summary: {
      inputRows: activeRows.length,
      rowsToUpdate: updates.length,
      identityDiffCount: updates.filter((entry) => entry.identityDiff).length,
      predictedNonBiomeDuplicateGroups: duplicateGroups
    },
    updates
  };
}

export async function runItemSourcePageNormalization(options = {}, dependencies = {}) {
  const now = dependencies.now instanceof Date ? dependencies.now : new Date();
  const batchId = options.batchId ?? `item-source-page-normalization-${now.toISOString().replace(/[:.]/g, '-')}`;
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
    throw new Error(`Refusing item source page normalization apply to non-local database: ${connectionConfig.database}`);
  }

  const connection = await mysqlModule.createConnection(connectionConfig);
  let plan;
  let beforeRows = [];
  let updatedRows = 0;
  try {
    const rows = await readActiveRows(connection);
    plan = buildItemSourcePageNormalizationPlan(rows);
    const ids = plan.updates.map((row) => row.id);
    beforeRows = ids.length ? await readRowsByIds(connection, ids) : [];
    if (options.apply && ids.length) {
      await connection.beginTransaction();
      for (const update of plan.updates) {
        const [result] = await connection.execute(
          `UPDATE \`item_acquisition_sources\`
SET \`source_page\` = ?,
    \`updated_at\` = CURRENT_TIMESTAMP
WHERE \`id\` = ?
  AND \`status\` = 1
  AND \`deleted\` = 0`,
          [update.newSourcePage, update.id]
        );
        updatedRows += Number(result?.affectedRows ?? 0);
      }
      if (updatedRows !== plan.updates.length) {
        throw new Error(`Expected to update ${plan.updates.length} source_page rows, affected ${updatedRows}`);
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
      updatedRows
    },
    updates: plan.updates,
    rollbackSql: buildRollbackSql(beforeRows)
  };
  if (options.outputPath) {
    writeJson(path.resolve(process.cwd(), options.outputPath), report);
  }
  return report;
}

async function readActiveRows(connection) {
  const [rows] = await connection.execute(
    `SELECT *
FROM \`item_acquisition_sources\`
WHERE \`status\` = 1
  AND \`deleted\` = 0
ORDER BY \`id\``
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

function identityKey(row) {
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

function countNonBiomeDuplicateGroups(rows) {
  const counts = new Map();
  for (const row of rows) {
    if (normalizeText(row.source_ref_type) === 'biome_wikitext') continue;
    const key = identityKey(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.values()).filter((count) => count > 1).length;
}

function buildRollbackSql(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const sourcePageCases = rows
    .map((row) => `WHEN ${Number(row.id)} THEN ${sqlString(row.source_page)}`)
    .join(' ');
  const ids = rows.map((row) => Number(row.id)).filter(Number.isInteger);
  return `UPDATE \`item_acquisition_sources\` SET \`source_page\` = CASE \`id\` ${sourcePageCases} END WHERE \`id\` IN (${ids.join(', ')});`;
}

function sqlString(value) {
  if (value == null) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function normalizeText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function toNullableInteger(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runItemSourcePageNormalization(parseItemSourcePageNormalizationArgs())
    .then((report) => {
      console.log(JSON.stringify(report.summary, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
