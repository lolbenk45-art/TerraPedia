#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import { buildRelationSchemaStatements } from './relation-schema.mjs';
import { buildProjectionSchemaStatements } from './projection-schema.mjs';
import { buildBuffEntityRelations } from './buff-entity-processor.mjs';
import { buildSecondaryRelations } from './secondary-relation-processor.mjs';
import { buildProjectionPayload } from './projection-sync.mjs';

const repoRoot = getProjectRoot();
const moduleRequire = createRequire(import.meta.url);
let mysqlModule = null;

const BUFF_RELATION_TABLES = [
  'item_buff_relations',
  'npc_buff_relations',
  'projection_buffs',
  'relation_buffs',
];

function loadMysqlModule() {
  if (mysqlModule) return mysqlModule;
  try {
    mysqlModule = moduleRequire('mysql2/promise');
  } catch (error) {
    if (error?.code !== 'MODULE_NOT_FOUND') throw error;
    mysqlModule = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'))('mysql2/promise');
  }
  return mysqlModule;
}

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function formatDateTag(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function camelToSnake(value) {
  return String(value).replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function mapRowToDb(row) {
  const mapped = {};
  for (const [key, value] of Object.entries(row)) {
    mapped[camelToSnake(key)] = value;
  }
  return mapped;
}

async function queryRows(connection, sql) {
  const [rows] = await connection.query(sql);
  return rows;
}

async function upsertRows(connection, tableName, rows) {
  if (!rows || rows.length === 0) return 0;
  let total = 0;
  for (const row of rows) {
    const mapped = mapRowToDb(row);
    const columns = Object.keys(mapped);
    const placeholders = columns.map(() => '?').join(', ');
    const updates = columns
      .filter((column) => column !== 'record_key')
      .map((column) => `\`${column}\` = VALUES(\`${column}\`)`)
      .join(', ');
    const sql = `
INSERT INTO \`${tableName}\` (${columns.map((column) => `\`${column}\``).join(', ')})
VALUES (${placeholders})
ON DUPLICATE KEY UPDATE ${updates || '`record_key` = VALUES(`record_key`)'}
`.trim();
    await connection.execute(sql, columns.map((column) => mapped[column]));
    total += 1;
  }
  return total;
}

async function clearBuffRelationTables(connection) {
  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  try {
    for (const tableName of BUFF_RELATION_TABLES) {
      await connection.query(`DELETE FROM \`${tableName}\``);
    }
  } finally {
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
  }
}

async function getTableColumns(connection, databaseName, tableName) {
  const [rows] = await connection.query(
    'SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = ? AND table_name = ?',
    [databaseName, tableName]
  );
  return new Set(rows.map((row) => row.COLUMN_NAME));
}

async function ensureBuffRelationMigrations(connection, databaseName) {
  const migrations = [
    {
      tableName: 'relation_buffs',
      columns: [
        ['inflicting_npcs_json', 'LONGTEXT AFTER `source_items_json`'],
        ['source_evidence_json', 'LONGTEXT AFTER `immune_npc_sample_json`'],
      ],
    },
    {
      tableName: 'projection_buffs',
      columns: [
        ['inflicting_npcs_json', 'LONGTEXT AFTER `source_items_json`'],
        ['source_evidence_json', 'LONGTEXT AFTER `immune_npc_sample_json`'],
      ],
    },
  ];
  for (const migration of migrations) {
    const columns = await getTableColumns(connection, databaseName, migration.tableName);
    for (const [columnName, ddl] of migration.columns) {
      if (!columns.has(columnName)) {
        await connection.query(`ALTER TABLE \`${databaseName}\`.\`${migration.tableName}\` ADD COLUMN \`${columnName}\` ${ddl}`);
      }
    }
  }
}

async function ensureBuffRelationSchema(connection, databaseName = 'terria_v1_relation') {
  const relationStatements = buildRelationSchemaStatements()
    .filter((statement) => BUFF_RELATION_TABLES.some((tableName) => statement.includes(`\`${tableName}\``)));
  const projectionStatements = buildProjectionSchemaStatements()
    .filter((statement) => statement.includes('`projection_buffs`'));
  for (const statement of [...relationStatements, ...projectionStatements]) {
    await connection.query(statement);
  }
  await ensureBuffRelationMigrations(connection, databaseName);
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

  const dateTag = raw['date-tag'] ?? raw.dateTag ?? formatDateTag();
  return {
    apply: booleanOption(raw.apply, false),
    maintDatabase: raw['maint-database'] ?? raw.maintDatabase ?? 'terria_v1_local',
    relationDatabase: raw['relation-database'] ?? raw.relationDatabase ?? 'terria_v1_relation',
    localDatabase: raw['local-database'] ?? raw.localDatabase ?? 'terria_v1_local',
    output: raw.output ?? path.join(repoRoot, 'reports', 'relation', `buff-relation-sync-${dateTag}.json`),
  };
}

export function buildBuffRelationSyncPayload({
  maintBuffRows = [],
  maintItemRows = [],
  maintNpcRows = [],
  relationBuffImageRows = [],
  managedImageUrlPrefixes = [],
} = {}) {
  const { relationBuffs } = buildBuffEntityRelations({ maintBuffs: maintBuffRows });
  const secondary = buildSecondaryRelations({
    maintBuffRows,
    maintItemRows,
    maintNpcRows,
  });
  const projection = buildProjectionPayload({
    relationBuffs,
    relationBuffImages: relationBuffImageRows,
    relationItems: maintItemRows.map((row) => ({
      sourceId: row.source_id,
      internalName: row.internal_name,
      englishName: row.english_name,
      nameZh: row.name_zh,
      sourceProvider: row.source_provider,
      sourcePage: row.source_page,
      sourceRevisionTimestamp: row.source_revision_timestamp,
      rawJson: row.raw_json,
    })),
    relationNpcs: maintNpcRows.map((row) => ({
      sourceId: row.source_id,
      internalName: row.internal_name,
      englishName: row.english_name,
      nameZh: row.name_zh,
      subNameZh: row.sub_name_zh,
      sourceProvider: row.source_provider,
      sourcePage: row.source_page,
      sourceRevisionTimestamp: row.source_revision_timestamp,
      rawJson: row.raw_json,
    })),
    itemBuffRelations: secondary.itemBuffRelations,
    npcBuffRelations: secondary.npcBuffRelations,
    managedImageUrlPrefixes,
  });
  return {
    relationBuffs,
    itemBuffRelations: secondary.itemBuffRelations,
    npcBuffRelations: secondary.npcBuffRelations,
    projectionBuffs: projection.projectionBuffs,
    issues: secondary.issues,
  };
}

async function defaultWriteReport(reportPath, payload) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(payload, null, 2), 'utf8');
  return reportPath;
}

export async function runBuffRelationSync(options = {}, dependencies = {}) {
  const config = dependencies.config ?? loadLocalStackConfig(repoRoot);
  const mysqlOptions = {
    host: options.host ?? process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
    port: Number(options.port ?? process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 3306),
    user: options.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
    password: options.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
  };
  const writeReport = dependencies.writeReport ?? defaultWriteReport;
  const mysql = dependencies.mysqlModule ?? loadMysqlModule();

  const queryMaint = dependencies.queryMaint ?? (async (sql) => {
    const connection = await mysql.createConnection({ ...mysqlOptions, database: options.maintDatabase });
    try {
      return await queryRows(connection, sql);
    } finally {
      await connection.end();
    }
  });
  const queryRelation = dependencies.queryRelation ?? (async (sql) => {
    const connection = await mysql.createConnection({ ...mysqlOptions, database: options.relationDatabase });
    try {
      return await queryRows(connection, sql);
    } finally {
      await connection.end();
    }
  });
  const executeRelation = dependencies.executeRelation ?? (async (callback) => {
    const connection = await mysql.createConnection({ ...mysqlOptions, database: options.relationDatabase });
    try {
      await connection.beginTransaction();
      await callback(connection);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      await connection.end();
    }
  });

  const [maintBuffRows, maintItemRows, maintNpcRows, relationBuffImageRows] = await Promise.all([
    queryMaint('SELECT * FROM maint_buffs WHERE status = 1 AND deleted = 0'),
    queryMaint('SELECT * FROM maint_items WHERE status = 1 AND deleted = 0'),
    queryMaint('SELECT * FROM maint_npcs WHERE status = 1 AND deleted = 0'),
    queryRelation('SELECT * FROM relation_buff_images WHERE deleted = 0'),
  ]);
  const payload = buildBuffRelationSyncPayload({
    maintBuffRows,
    maintItemRows,
    maintNpcRows,
    relationBuffImageRows,
    managedImageUrlPrefixes: dependencies.managedImageUrlPrefixes ?? [],
  });
  const report = {
    generatedAt: new Date().toISOString(),
    apply: Boolean(options.apply),
    maintDatabase: options.maintDatabase,
    relationDatabase: options.relationDatabase,
    rows: {
      relationBuffs: payload.relationBuffs.length,
      projectionBuffs: payload.projectionBuffs.length,
      itemBuffRelations: payload.itemBuffRelations.length,
      npcBuffRelations: payload.npcBuffRelations.length,
      issues: payload.issues.length,
    },
    writes: {
      relationBuffs: 0,
      projectionBuffs: 0,
      itemBuffRelations: 0,
      npcBuffRelations: 0,
      total: 0,
    },
    issueSamples: payload.issues.slice(0, 20),
  };

  if (options.apply) {
    await executeRelation(async (connection) => {
      await ensureBuffRelationSchema(connection, options.relationDatabase);
      await clearBuffRelationTables(connection);
      report.writes.relationBuffs = await upsertRows(connection, 'relation_buffs', payload.relationBuffs);
      report.writes.itemBuffRelations = await upsertRows(connection, 'item_buff_relations', payload.itemBuffRelations);
      report.writes.npcBuffRelations = await upsertRows(connection, 'npc_buff_relations', payload.npcBuffRelations);
      report.writes.projectionBuffs = await upsertRows(connection, 'projection_buffs', payload.projectionBuffs);
      report.writes.total = report.writes.relationBuffs
        + report.writes.itemBuffRelations
        + report.writes.npcBuffRelations
        + report.writes.projectionBuffs;
    });
  }

  if (options.output) {
    report.reportPath = await writeReport(options.output, report);
  }
  return report;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await runBuffRelationSync(options);
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
