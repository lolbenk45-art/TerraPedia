#!/usr/bin/env node

import path from 'node:path';
import { createRequire } from 'node:module';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { parseCliArgs, writeJson } from '../lib/wiki-item-utils.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';

const repoRoot = getProjectRoot();
const require = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'));
const COMPOSITE_SHOP_TARGETS = new Map([
  ['demolitionistandskeletonmerchantfor', ['Demolitionist', 'Skeleton Merchant']],
  ['herfor', ['Party Girl']],
  ['the', ['Mechanic', 'Steampunker']],
  ['witchdoctorandsarmsdealer', ['Witch Doctor', 'Arms Dealer']],
  ['witchdoctorandarmsdealer', ['Witch Doctor', 'Arms Dealer']]
]);

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

export function parseCompositeShopSplitArgs(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const apply = booleanOption(options.apply, false);
  const confirmLocalCompat = booleanOption(options['confirm-local-compat'] ?? options.confirmLocalCompat, false);
  const allowBulk = booleanOption(options['allow-bulk'] ?? options.allowBulk, false);
  if (apply && !confirmLocalCompat) {
    throw new Error('composite shop split apply requires --confirm-local-compat=true');
  }
  if (apply && !allowBulk) {
    throw new Error('composite shop split apply requires --allow-bulk=true');
  }
  return {
    outputPath: options.output ?? null,
    backupDir: options['backup-dir'] ?? options.backupDir ?? path.join(process.cwd(), 'data', 'backups', 'item-source-composite-shop-split'),
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

export function classifyCompositeShopSource(name) {
  return COMPOSITE_SHOP_TARGETS.get(normalizeIdentity(name)) ?? null;
}

export function buildCompositeShopSplitPlan({ sourceRows = [], npcRows = [] } = {}) {
  const npcLookup = buildNpcLookup(npcRows);
  const splits = [];
  const blocked = [];
  for (const row of Array.isArray(sourceRows) ? sourceRows : []) {
    if (Number(row.status) !== 1 || Number(row.deleted) !== 0) continue;
    if (normalizeText(row.source_type) !== 'shop') continue;
    if (!['npc', 'unknown'].includes(normalizeText(row.source_ref_type)) || row.source_ref_id != null) continue;
    const sourceRefName = normalizeDisplayText(row.source_ref_name);
    const targetNames = classifyCompositeShopSource(sourceRefName);
    if (!targetNames) {
      blocked.push(blockedRow(row, 'not_reviewed_composite_shop_source'));
      continue;
    }
    const resolvedTargets = [];
    for (const targetName of targetNames) {
      const matches = npcLookup.get(normalizeIdentity(targetName)) ?? [];
      if (matches.length !== 1) {
        blocked.push(blockedRow(row, matches.length === 0 ? 'npc_name_not_found' : 'ambiguous_npc_name', targetName));
        resolvedTargets.length = 0;
        break;
      }
      resolvedTargets.push({ sourceRefName: targetName, sourceRefId: matches[0].id });
    }
    if (resolvedTargets.length !== targetNames.length) continue;
    splits.push({
      id: Number(row.id),
      itemId: toNullableInteger(row.item_id),
      oldSourceRefName: sourceRefName,
      oldSourceRefType: row.source_ref_type ?? null,
      oldSourceRefId: toNullableInteger(row.source_ref_id),
      updateTarget: resolvedTargets[0],
      insertTargets: resolvedTargets.slice(1)
    });
  }
  splits.sort((a, b) => a.id - b.id);
  blocked.sort((a, b) => a.id - b.id);
  return {
    summary: {
      inputRows: (Array.isArray(sourceRows) ? sourceRows : []).length,
      rowsToSplit: splits.length,
      insertRowsPlanned: splits.reduce((sum, split) => sum + split.insertTargets.length, 0),
      blockedRows: blocked.length,
      validationErrors: 0
    },
    splits,
    blocked
  };
}

export async function runCompositeShopSplit(options = {}, dependencies = {}) {
  const now = dependencies.now instanceof Date ? dependencies.now : new Date();
  const batchId = options.batchId ?? `item-source-composite-shop-split-${now.toISOString().replace(/[:.]/g, '-')}`;
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
    throw new Error(`Refusing composite shop split apply to non-local database: ${connectionConfig.database}`);
  }

  const connection = await mysqlModule.createConnection(connectionConfig);
  let plan;
  let beforeRows = [];
  let updatedRows = 0;
  let insertedRows = 0;
  const insertedIds = [];
  try {
    const [sourceRows, npcRows] = await Promise.all([
      readCandidateSourceRows(connection),
      readNpcs(connection)
    ]);
    plan = buildCompositeShopSplitPlan({ sourceRows, npcRows });
    const ids = plan.splits.map((row) => row.id);
    beforeRows = ids.length ? await readRowsByIds(connection, ids) : [];
    if (options.apply && ids.length) {
      await connection.beginTransaction();
      for (const split of plan.splits) {
        const [updateResult] = await connection.execute(
          `UPDATE \`item_acquisition_sources\`
SET \`source_ref_type\` = 'npc',
    \`source_ref_id\` = ?,
    \`source_ref_name\` = ?,
    \`updated_at\` = CURRENT_TIMESTAMP
WHERE \`id\` = ?
  AND \`status\` = 1
  AND \`deleted\` = 0
  AND \`source_ref_type\` IN ('npc', 'unknown')
  AND \`source_ref_id\` IS NULL`,
          [split.updateTarget.sourceRefId, split.updateTarget.sourceRefName, split.id]
        );
        updatedRows += Number(updateResult?.affectedRows ?? 0);
        for (const target of split.insertTargets) {
          const [insertResult] = await connection.execute(
            `INSERT INTO \`item_acquisition_sources\`
(\`item_id\`, \`source_type\`, \`source_ref_type\`, \`source_ref_id\`, \`source_ref_name\`, \`biome_id\`, \`quantity_min\`, \`quantity_max\`, \`quantity_text\`, \`chance_value\`, \`chance_text\`, \`conditions\`, \`notes\`, \`source_provider\`, \`source_page\`, \`source_revision_timestamp\`, \`sort_order\`, \`status\`, \`deleted\`, \`created_at\`, \`updated_at\`)
SELECT \`item_id\`, \`source_type\`, 'npc', ?, ?, \`biome_id\`, \`quantity_min\`, \`quantity_max\`, \`quantity_text\`, \`chance_value\`, \`chance_text\`, \`conditions\`, \`notes\`, \`source_provider\`, \`source_page\`, \`source_revision_timestamp\`, \`sort_order\`, \`status\`, \`deleted\`, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM \`item_acquisition_sources\`
WHERE \`id\` = ?
  AND \`status\` = 1
  AND \`deleted\` = 0`,
            [target.sourceRefId, target.sourceRefName, split.id]
          );
          insertedRows += Number(insertResult?.affectedRows ?? 0);
          if (insertResult?.insertId != null) insertedIds.push(Number(insertResult.insertId));
        }
      }
      if (updatedRows !== plan.splits.length) {
        throw new Error(`Expected to update ${plan.splits.length} composite rows, affected ${updatedRows}`);
      }
      if (insertedRows !== plan.summary.insertRowsPlanned) {
        throw new Error(`Expected to insert ${plan.summary.insertRowsPlanned} split rows, affected ${insertedRows}`);
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
      updatedRows,
      insertedRows
    },
    splits: plan.splits,
    blocked: plan.blocked,
    insertedIds,
    rollbackSql: buildRollbackSql(beforeRows, insertedIds)
  };
  if (options.outputPath) {
    writeJson(path.resolve(process.cwd(), options.outputPath), report);
  }
  return report;
}

async function readCandidateSourceRows(connection) {
  const [rows] = await connection.execute(
    `SELECT *
FROM \`item_acquisition_sources\`
WHERE \`status\` = 1
  AND \`deleted\` = 0
  AND \`source_type\` = 'shop'
  AND \`source_ref_type\` IN ('npc', 'unknown')
  AND \`source_ref_id\` IS NULL
ORDER BY \`id\``
  );
  return Array.isArray(rows) ? rows : [];
}

async function readNpcs(connection) {
  const [rows] = await connection.execute(
    `SELECT id, name, internal_name, status, deleted
FROM \`npcs\`
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

function buildNpcLookup(rows) {
  const lookup = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (Number(row.status) !== 1 || Number(row.deleted) !== 0) continue;
    const name = normalizeDisplayText(row.name);
    if (!name) continue;
    const key = normalizeIdentity(name);
    const list = lookup.get(key) ?? [];
    list.push({ id: Number(row.id), name, internalName: normalizeDisplayText(row.internal_name) });
    lookup.set(key, list);
  }
  return lookup;
}

function blockedRow(row, reason, targetName = null) {
  return {
    id: Number(row.id),
    itemId: toNullableInteger(row.item_id),
    sourceRefName: normalizeDisplayText(row.source_ref_name),
    targetName,
    reason
  };
}

function buildRollbackSql(rows, insertedIds = []) {
  const statements = [];
  if (Array.isArray(rows) && rows.length > 0) {
    const ids = rows.map((row) => Number(row.id)).filter(Number.isInteger);
    const sourceRefTypeCases = rows.map((row) => `WHEN ${Number(row.id)} THEN ${sqlString(row.source_ref_type)}`).join(' ');
    const sourceRefIdCases = rows.map((row) => `WHEN ${Number(row.id)} THEN ${row.source_ref_id == null ? 'NULL' : Number(row.source_ref_id)}`).join(' ');
    const sourceRefNameCases = rows.map((row) => `WHEN ${Number(row.id)} THEN ${sqlString(row.source_ref_name)}`).join(' ');
    statements.push(`UPDATE \`item_acquisition_sources\` SET \`source_ref_type\` = CASE \`id\` ${sourceRefTypeCases} END, \`source_ref_id\` = CASE \`id\` ${sourceRefIdCases} END, \`source_ref_name\` = CASE \`id\` ${sourceRefNameCases} END WHERE \`id\` IN (${ids.join(', ')});`);
  }
  const safeInsertedIds = (Array.isArray(insertedIds) ? insertedIds : []).filter(Number.isInteger);
  if (safeInsertedIds.length) {
    statements.push(`UPDATE \`item_acquisition_sources\` SET \`status\` = 0, \`deleted\` = 1 WHERE \`id\` IN (${safeInsertedIds.join(', ')});`);
  }
  return statements.length ? statements.join('\n') : null;
}

function sqlString(value) {
  if (value == null) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function normalizeText(value) {
  if (value == null) return null;
  const text = String(value).trim().toLowerCase();
  return text || null;
}

function normalizeDisplayText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeIdentity(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function toNullableInteger(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCompositeShopSplit(parseCompositeShopSplitArgs())
    .then((report) => {
      console.log(JSON.stringify(report.summary, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
