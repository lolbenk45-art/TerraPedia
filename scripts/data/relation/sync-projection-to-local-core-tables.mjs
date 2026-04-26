#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { DOMAIN_CONFIG } from './replacement-readiness-audit.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

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

export function buildInsertProjectionSql({
  localDatabase,
  relationDatabase,
  localTable,
  projectionTable,
  columns
}) {
  if (!columns.length) {
    throw new Error(`No shared columns available for ${localTable} <= ${projectionTable}`);
  }
  const columnList = columns.map(quoteIdentifier).join(', ');
  return `INSERT INTO ${qualified(localDatabase, localTable)} (${columnList}) SELECT ${columnList} FROM ${qualified(relationDatabase, projectionTable)}`;
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
  const connection = await mysql.createConnection(mysqlOptions);
  try {
    return await fn(connection);
  } finally {
    await connection.end();
  }
}

async function backupAndReplaceDomain(connection, options, domain) {
  const localTableName = qualified(options.localDatabase, domain.localTable);
  const backupTable = `${domain.localTable}_relation_backup_${options.backupSuffix}`;
  const backupTableName = qualified(options.localDatabase, backupTable);
  await connection.query(`CREATE TABLE ${backupTableName} LIKE ${localTableName}`);
  await connection.query(`INSERT INTO ${backupTableName} SELECT * FROM ${localTableName}`);
  await connection.query('START TRANSACTION');
  try {
    await connection.query(`DELETE FROM ${localTableName}`);
    await connection.query(buildInsertProjectionSql({
      localDatabase: options.localDatabase,
      relationDatabase: options.relationDatabase,
      localTable: domain.localTable,
      projectionTable: domain.projectionTable,
      columns: domain.columnsToSync
    }));
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
      domains[domainName] = {
        domain: domainName,
        localTable: config.localTable,
        projectionTable: config.projectionTable,
        backupTable: `${config.localTable}_relation_backup_${normalized.backupSuffix}`,
        localRowsBefore: localRows,
        projectionRows,
        columnsToSync: intersectColumns(localColumns, projectionColumns)
      };
    }

    if (normalized.apply) {
      await connection.query('SET FOREIGN_KEY_CHECKS = 0');
      try {
        for (const domain of Object.values(domains)) {
          domain.backupTable = await backupAndReplaceDomain(connection, normalized, domain);
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
