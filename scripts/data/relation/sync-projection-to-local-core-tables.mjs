#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import { DOMAIN_CONFIG } from './replacement-readiness-audit.mjs';

const require = createRequire(import.meta.url);
let mysqlModule = null;

function loadMysqlModule() {
  if (mysqlModule) {
    return mysqlModule;
  }
  try {
    mysqlModule = require('mysql2/promise');
  } catch (error) {
    if (error?.code !== 'MODULE_NOT_FOUND') {
      throw error;
    }
    mysqlModule = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'))('mysql2/promise');
  }
  return mysqlModule;
}

const repoRoot = getProjectRoot();

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
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

  return {
    apply: booleanOption(raw.apply, false),
    localDatabase: raw['local-database'] ?? raw.localDatabase ?? 'terria_v1_local',
    relationDatabase: raw['relation-database'] ?? raw.relationDatabase ?? 'terria_v1_relation',
    domains: raw.domains
      ? String(raw.domains).split(',').map((value) => value.trim()).filter(Boolean)
      : null,
    dateTag: raw['date-tag'] ?? raw.dateTag ?? null,
    backupSuffix: raw['backup-suffix'] ?? raw.backupSuffix ?? null
  };
}

function quoteIdentifier(value) {
  return `\`${String(value).replaceAll('`', '``')}\``;
}

function qualified(database, table) {
  return `${quoteIdentifier(database)}.${quoteIdentifier(table)}`;
}

function toDateTag(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

function toBackupSuffix(value = new Date()) {
  return value.toISOString().replace(/\D/g, '').slice(0, 14);
}

function intersectColumns(localColumns, projectionColumns) {
  const projectionSet = new Set(projectionColumns);
  return localColumns.filter((column) => projectionSet.has(column));
}

const LOCAL_PRESERVE_COLUMNS = {
  items: new Set([
    'category_id',
    'description',
    'game_period_id',
    'game_model_id',
    'last_synced_at',
    'tooltip',
    'created_at',
    'updated_at'
  ]),
  npcs: new Set([
    'category_id',
    'game_period_id',
    'game_model_id',
    'boss_group_id',
    'boss_role',
    'behavior_notes',
    'banner_item_id',
    'catch_item_id',
    'created_at',
    'updated_at'
  ]),
  boss_groups: new Set([
    'summon_method',
    'created_at',
    'updated_at'
  ]),
  buffs: new Set([
    'image_original_url',
    'image_content_type',
    'image_last_verified_at',
    'image_provider',
    'image_source_page',
    'image_source_file_title',
    'image_source_revision_timestamp',
    'source_items_json',
    'immune_npcs_json',
    'immune_npc_sample_json',
    'source_evidence_json',
    'created_at',
    'updated_at'
  ])
};

const DOMAIN_COLUMN_MAPPINGS = {
  buffs: [
    ['image_cached_url', 'image']
  ]
};

function selectColumnsToSync(domainName, localTable, localColumns, projectionColumns) {
  const sharedColumns = intersectColumns(localColumns, projectionColumns)
    .map((column) => [column, column]);
  const localColumnSet = new Set(localColumns);
  const projectionColumnSet = new Set(projectionColumns);
  const mappedColumns = [...sharedColumns];
  for (const [localColumn, projectionColumn] of DOMAIN_COLUMN_MAPPINGS[domainName] ?? []) {
    if (!localColumnSet.has(localColumn) || !projectionColumnSet.has(projectionColumn)) {
      continue;
    }
    if (mappedColumns.some(([existingLocal]) => existingLocal === localColumn)) {
      continue;
    }
    mappedColumns.push([localColumn, projectionColumn]);
  }
  const protectedColumns = LOCAL_PRESERVE_COLUMNS[localTable] ?? new Set();
  const selectedMappings = mappedColumns.filter(([localColumn]) => !protectedColumns.has(localColumn));
  return {
    columnMappings: selectedMappings,
    columnsToSync: selectedMappings.map(([localColumn]) => localColumn),
    skippedProtectedColumns: mappedColumns
      .map(([localColumn]) => localColumn)
      .filter((column) => protectedColumns.has(column))
      .sort()
  };
}

function formatTableName(database, table) {
  return `${database}.${table}`;
}

export function buildInsertProjectionSql({
  localDatabase,
  relationDatabase,
  localTable,
  projectionTable,
  columnMappings
}) {
  if (!columnMappings.length) {
    throw new Error(`No shared columns available for ${localTable} <= ${projectionTable}`);
  }
  const localColumnList = columnMappings.map(([localColumn]) => quoteIdentifier(localColumn)).join(', ');
  const projectionColumnList = columnMappings.map(([, projectionColumn]) => quoteIdentifier(projectionColumn)).join(', ');
  return `INSERT INTO ${qualified(localDatabase, localTable)} (${localColumnList}) SELECT ${projectionColumnList} FROM ${qualified(relationDatabase, projectionTable)}`;
}

export function buildUpsertProjectionSql({
  localDatabase,
  relationDatabase,
  localTable,
  projectionTable,
  columnMappings
}) {
  if (!columnMappings.length) {
    throw new Error(`No shared columns available for ${localTable} <= ${projectionTable}`);
  }
  const localColumns = columnMappings.map(([localColumn]) => localColumn);
  const projectionColumns = columnMappings.map(([, projectionColumn]) => projectionColumn);
  const columnList = localColumns.map(quoteIdentifier).join(', ');
  const projectionSelectList = projectionColumns.map(quoteIdentifier).join(', ');
  const updateColumns = localColumns.filter((column) => column !== 'id');
  const updateList = updateColumns.length > 0
    ? updateColumns.map((column) => `${quoteIdentifier(column)} = VALUES(${quoteIdentifier(column)})`).join(', ')
    : `${quoteIdentifier(localColumns[0])} = ${quoteIdentifier(localColumns[0])}`;
  return `INSERT INTO ${qualified(localDatabase, localTable)} (${columnList}) SELECT ${projectionSelectList} FROM ${qualified(relationDatabase, projectionTable)} ON DUPLICATE KEY UPDATE ${updateList}`;
}

async function defaultListColumns(connection, database, table) {
  const [rows] = await connection.query(
    `
    SELECT COLUMN_NAME
    FROM information_schema.columns
    WHERE table_schema = ?
      AND table_name = ?
    ORDER BY ORDINAL_POSITION
    `.trim(),
    [database, table]
  );
  return rows.map((row) => row.COLUMN_NAME);
}

async function defaultCountRows(connection, database, table) {
  const [rows] = await connection.query(`SELECT COUNT(*) AS total FROM ${qualified(database, table)}`);
  return Number(rows[0]?.total ?? 0);
}

async function defaultWriteReport(report) {
  const reportsDir = path.join(repoRoot, 'reports', 'relation');
  await fs.mkdir(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `projection-to-local-core-sync-${report.dateTag}.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
}

async function defaultExecuteLocal(localDatabase, dependencies, fn) {
  const config = dependencies.config ?? loadLocalStackConfig(repoRoot);
  const mysqlOptions = {
    host: config.database?.host ?? '127.0.0.1',
    port: Number(config.database?.port ?? 3306),
    user: config.database?.username ?? 'root',
    password: config.database?.password ?? 'root',
    database: localDatabase
  };
  const connection = await loadMysqlModule().createConnection(mysqlOptions);
  try {
    return await fn(connection);
  } finally {
    await connection.end();
  }
}

async function backupAndApplyDomain(connection, options, domain) {
  const localTableName = qualified(options.localDatabase, domain.localTable);
  const backupTable = `${domain.localTable}_relation_backup_${options.backupSuffix}`;
  const backupTableName = qualified(options.localDatabase, backupTable);
  await connection.query(`CREATE TABLE ${backupTableName} LIKE ${localTableName}`);
  await connection.query(`INSERT INTO ${backupTableName} SELECT * FROM ${localTableName}`);
  await connection.query('START TRANSACTION');
  try {
    if (domain.syncStrategy === 'upsert_preserve_local') {
      await connection.query(buildUpsertProjectionSql({
        localDatabase: options.localDatabase,
        relationDatabase: options.relationDatabase,
        localTable: domain.localTable,
        projectionTable: domain.projectionTable,
        columnMappings: domain.columnMappings
      }));
    } else {
      await connection.query(`DELETE FROM ${localTableName}`);
      await connection.query(buildInsertProjectionSql({
        localDatabase: options.localDatabase,
        relationDatabase: options.relationDatabase,
        localTable: domain.localTable,
        projectionTable: domain.projectionTable,
        columnMappings: domain.columnMappings
      }));
    }
    await connection.query('COMMIT');
  } catch (error) {
    await connection.query('ROLLBACK');
    throw error;
  }
  return backupTable;
}

export async function runProjectionToLocalCoreSync(options = {}, dependencies = {}) {
  const now = dependencies.now ?? new Date();
  const normalized = {
    apply: Boolean(options.apply),
    localDatabase: options.localDatabase ?? 'terria_v1_local',
    relationDatabase: options.relationDatabase ?? 'terria_v1_relation',
    domains: Array.isArray(options.domains) && options.domains.length > 0 ? options.domains : Object.keys(DOMAIN_CONFIG),
    dateTag: options.dateTag ?? toDateTag(now),
    backupSuffix: options.backupSuffix ?? toBackupSuffix(now)
  };
  const listColumns = dependencies.listColumns ?? defaultListColumns;
  const countRows = dependencies.countRows ?? defaultCountRows;
  const writeReport = dependencies.writeReport ?? defaultWriteReport;
  const executeLocal = dependencies.executeLocal
    ?? ((fn) => defaultExecuteLocal(normalized.localDatabase, dependencies, fn));

  return executeLocal(async (connection) => {
    const domains = {};
    for (const [domainName, config] of Object.entries(DOMAIN_CONFIG).filter(([domainName]) => normalized.domains.includes(domainName))) {
      const [localColumns, projectionColumns, localRows, projectionRows] = await Promise.all([
        listColumns(connection, normalized.localDatabase, config.localTable),
        listColumns(connection, normalized.relationDatabase, config.projectionTable),
        countRows(connection, normalized.localDatabase, config.localTable),
        countRows(connection, normalized.relationDatabase, config.projectionTable)
      ]);
      const columnSelection = selectColumnsToSync(domainName, config.localTable, localColumns, projectionColumns);
      const syncStrategy = LOCAL_PRESERVE_COLUMNS[config.localTable]
        ? 'upsert_preserve_local'
        : 'replace';
      domains[domainName] = {
        domain: domainName,
        localTable: config.localTable,
        projectionTable: config.projectionTable,
        backupTable: `${config.localTable}_relation_backup_${normalized.backupSuffix}`,
        localRowsBefore: localRows,
        projectionRows,
        syncStrategy,
        columnMappings: columnSelection.columnMappings,
        columnsToSync: columnSelection.columnsToSync,
        skippedProtectedColumns: columnSelection.skippedProtectedColumns
      };
    }

    if (normalized.apply) {
      const emptyProjectionBlockers = Object.values(domains)
        .filter((domain) => domain.localRowsBefore > 0 && domain.projectionRows === 0);
      if (emptyProjectionBlockers.length > 0) {
        const details = emptyProjectionBlockers
          .map((domain) => `Refusing to replace ${formatTableName(normalized.localDatabase, domain.localTable)} from empty ${formatTableName(normalized.relationDatabase, domain.projectionTable)}`)
          .join('; ');
        throw new Error(`${details}. Rebuild relation projections before applying local core sync.`);
      }
      await connection.query('SET FOREIGN_KEY_CHECKS = 0');
      try {
        for (const domain of Object.values(domains)) {
          domain.backupTable = await backupAndApplyDomain(connection, normalized, domain);
        }
      } finally {
        await connection.query('SET FOREIGN_KEY_CHECKS = 1');
      }
    }

    const report = {
      generatedAt: now.toISOString(),
      dateTag: normalized.dateTag,
      apply: normalized.apply,
      localDatabase: normalized.localDatabase,
      relationDatabase: normalized.relationDatabase,
      backupSuffix: normalized.backupSuffix,
      summary: {
        totalLocalRowsBefore: Object.values(domains).reduce((sum, domain) => sum + domain.localRowsBefore, 0),
        totalProjectionRows: Object.values(domains).reduce((sum, domain) => sum + domain.projectionRows, 0)
      },
      domains
    };
    const reportPath = await writeReport(report);
    return { report, reportPath };
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = await runProjectionToLocalCoreSync(parseArgs(process.argv.slice(2)));
  console.log(`Apply: ${result.report.apply}`);
  console.log(`Local database: ${result.report.localDatabase}`);
  console.log(`Relation database: ${result.report.relationDatabase}`);
  console.log(`Report: ${result.reportPath}`);
}
