#!/usr/bin/env node

import path from 'node:path';
import { createRequire } from 'node:module';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { parseCliArgs, writeJson } from '../lib/wiki-item-utils.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';

const repoRoot = getProjectRoot();
const require = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'));
const NPC_GROUP_NAMES = new Set([
  'angrybones',
  'armoredskeleton',
  'blackrecluse',
  'bluearmoredbones',
  'bloodcrawler',
  'crawdad',
  'crimera',
  'crimslime',
  'demoneye',
  'eaterofsouls',
  'enchantedswordnpc',
  'giantshelly',
  'ghouls',
  'hellarmoredbones',
  'hornet',
  'jellyfish',
  'lihzahrd',
  'mimics',
  'mosshornet',
  'mummies',
  'necromancer',
  'raggedcaster',
  'salamander',
  'sandpoacher',
  'sandsharks',
  'skeleton',
  'slimer',
  'slimes',
  'thetwins',
  'thedestroyer',
  'vampire',
  'wallcreeper',
  'wyvern',
  'zombie'
]);

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

export function parseNpcGroupRefReclassificationArgs(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const apply = booleanOption(options.apply, false);
  const confirmLocalCompat = booleanOption(options['confirm-local-compat'] ?? options.confirmLocalCompat, false);
  const allowBulk = booleanOption(options['allow-bulk'] ?? options.allowBulk, false);
  if (apply && !confirmLocalCompat) {
    throw new Error('NPC group ref reclassification apply requires --confirm-local-compat=true');
  }
  if (apply && !allowBulk) {
    throw new Error('NPC group ref reclassification apply requires --allow-bulk=true');
  }
  return {
    outputPath: options.output ?? null,
    backupDir: options['backup-dir'] ?? options.backupDir ?? path.join(process.cwd(), 'data', 'backups', 'item-source-npc-group-ref-reclassification'),
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

export function classifyNpcGroupSource(name, sourceType) {
  if (normalizeText(sourceType) !== 'drop') return null;
  if (!NPC_GROUP_NAMES.has(normalizeIdentity(name))) return null;
  return { sourceRefType: 'npc_group', reason: 'ambiguous_npc_family_or_group' };
}

export function buildNpcGroupRefReclassificationPlan({ sourceRows = [] } = {}) {
  const updates = [];
  const blocked = [];
  for (const row of Array.isArray(sourceRows) ? sourceRows : []) {
    if (Number(row.status) !== 1 || Number(row.deleted) !== 0) continue;
    if (normalizeText(row.source_ref_type) !== 'npc' || row.source_ref_id != null) continue;
    const sourceRefName = normalizeDisplayText(row.source_ref_name);
    const classification = classifyNpcGroupSource(sourceRefName, row.source_type);
    if (!classification) {
      blocked.push(blockedRow(row, 'not_reviewed_npc_group_source'));
      continue;
    }
    updates.push({
      id: Number(row.id),
      itemId: toNullableInteger(row.item_id),
      sourceType: normalizeDisplayText(row.source_type),
      sourceRefName,
      oldSourceRefType: row.source_ref_type ?? null,
      oldSourceRefId: toNullableInteger(row.source_ref_id),
      newSourceRefType: classification.sourceRefType,
      newSourceRefId: null,
      reason: classification.reason
    });
  }
  updates.sort((a, b) => a.id - b.id);
  blocked.sort((a, b) => a.id - b.id);
  return {
    summary: {
      inputRows: (Array.isArray(sourceRows) ? sourceRows : []).length,
      rowsToUpdate: updates.length,
      blockedRows: blocked.length,
      validationErrors: 0
    },
    updates,
    blocked
  };
}

export async function runNpcGroupRefReclassification(options = {}, dependencies = {}) {
  const now = dependencies.now instanceof Date ? dependencies.now : new Date();
  const batchId = options.batchId ?? `item-source-npc-group-ref-reclassification-${now.toISOString().replace(/[:.]/g, '-')}`;
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
    throw new Error(`Refusing NPC group ref reclassification apply to non-local database: ${connectionConfig.database}`);
  }

  const connection = await mysqlModule.createConnection(connectionConfig);
  let plan;
  let beforeRows = [];
  let updatedRows = 0;
  try {
    const sourceRows = await readCandidateSourceRows(connection);
    plan = buildNpcGroupRefReclassificationPlan({ sourceRows });
    const ids = plan.updates.map((row) => row.id);
    beforeRows = ids.length ? await readRowsByIds(connection, ids) : [];
    if (options.apply && ids.length) {
      await connection.beginTransaction();
      for (const update of plan.updates) {
        const [result] = await connection.execute(
          `UPDATE \`item_acquisition_sources\`
SET \`source_ref_type\` = ?,
    \`source_ref_id\` = ?,
    \`updated_at\` = CURRENT_TIMESTAMP
WHERE \`id\` = ?
  AND \`status\` = 1
  AND \`deleted\` = 0
  AND \`source_ref_type\` = 'npc'
  AND \`source_ref_id\` IS NULL`,
          [update.newSourceRefType, update.newSourceRefId, update.id]
        );
        updatedRows += Number(result?.affectedRows ?? 0);
      }
      if (updatedRows !== plan.updates.length) {
        throw new Error(`Expected to reclassify ${plan.updates.length} rows, affected ${updatedRows}`);
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
    blocked: plan.blocked,
    rollbackSql: buildRollbackSql(beforeRows)
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
  AND \`source_ref_type\` = 'npc'
  AND \`source_ref_id\` IS NULL
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

function blockedRow(row, reason) {
  return {
    id: Number(row.id),
    itemId: toNullableInteger(row.item_id),
    sourceType: normalizeDisplayText(row.source_type),
    sourceRefName: normalizeDisplayText(row.source_ref_name),
    reason
  };
}

function buildRollbackSql(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const ids = rows.map((row) => Number(row.id)).filter(Number.isInteger);
  const sourceRefTypeCases = rows.map((row) => `WHEN ${Number(row.id)} THEN ${sqlString(row.source_ref_type)}`).join(' ');
  const sourceRefIdCases = rows.map((row) => `WHEN ${Number(row.id)} THEN ${row.source_ref_id == null ? 'NULL' : Number(row.source_ref_id)}`).join(' ');
  return `UPDATE \`item_acquisition_sources\` SET \`source_ref_type\` = CASE \`id\` ${sourceRefTypeCases} END, \`source_ref_id\` = CASE \`id\` ${sourceRefIdCases} END WHERE \`id\` IN (${ids.join(', ')});`;
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
  runNpcGroupRefReclassification(parseNpcGroupRefReclassificationArgs())
    .then((report) => {
      console.log(JSON.stringify(report.summary, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
