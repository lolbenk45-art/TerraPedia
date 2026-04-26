#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { RELATION_COMPAT_VIEWS } from './create-local-compat-views.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

export const LOCAL_CORE_TABLES = ['items', 'npcs', 'projectiles', 'buffs'];

function parseArgs(argv = []) {
  const raw = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const index = body.indexOf('=');
    if (index >= 0) raw[body.slice(0, index)] = body.slice(index + 1);
    else raw[body] = 'true';
  }
  return raw;
}

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

async function getTableColumns(connection, database, tableName) {
  const [rows] = await connection.query(
    'SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = ? AND table_name = ? ORDER BY ORDINAL_POSITION ASC',
    [database, tableName]
  );
  return rows.map((row) => row.COLUMN_NAME);
}

async function getRowCount(connection, database, tableName) {
  const [rows] = await connection.query(`SELECT COUNT(*) AS c FROM \`${database}\`.\`${tableName}\``);
  return Number(rows[0]?.c ?? 0);
}

export function buildReplaceSql({ localDatabase, relationDatabase, tableName, columns }) {
  const columnList = columns.map((column) => `\`${column}\``).join(', ');
  return {
    deleteSql: `DELETE FROM \`${localDatabase}\`.\`${tableName}\``,
    insertSql: `INSERT INTO \`${localDatabase}\`.\`${tableName}\` (${columnList}) SELECT ${columnList} FROM \`${relationDatabase}\`.\`${tableName}\``,
  };
}

async function buildTablePlan(connection, { localDatabase, relationDatabase, tableName }) {
  const configuredColumns = RELATION_COMPAT_VIEWS[tableName]?.columns ?? [];
  const localColumns = new Set(await getTableColumns(connection, localDatabase, tableName));
  const relationColumns = new Set(await getTableColumns(connection, relationDatabase, tableName));
  const columns = configuredColumns.filter((column) => localColumns.has(column) && relationColumns.has(column));

  return {
    tableName,
    columns,
    localBeforeCount: await getRowCount(connection, localDatabase, tableName),
    relationSourceCount: await getRowCount(connection, relationDatabase, tableName),
    ...buildReplaceSql({ localDatabase, relationDatabase, tableName, columns }),
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const apply = booleanOption(args.apply, false);
  const config = loadLocalStackConfig(process.cwd());
  const localDatabase = args['local-database'] ?? args.localDatabase ?? config.database?.name ?? 'terria_v1_local';
  const relationDatabase = args['relation-database'] ?? args.relationDatabase ?? 'terria_v1_relation';
  const output = path.resolve(process.cwd(), args.output ?? path.join('reports', 'relation', `local-core-materialization-${new Date().toISOString().slice(0, 10)}.json`));

  const connection = await mysql.createConnection({
    host: args.host ?? config.database?.host ?? '127.0.0.1',
    port: Number(args.port ?? config.database?.port ?? 3306),
    user: args.user ?? config.database?.username ?? 'root',
    password: args.password ?? config.database?.password ?? 'root',
    multipleStatements: true,
  });

  try {
    const tables = [];
    for (const tableName of LOCAL_CORE_TABLES) {
      tables.push(await buildTablePlan(connection, { localDatabase, relationDatabase, tableName }));
    }

    if (apply) {
      await connection.beginTransaction();
      try {
        await connection.query('SET FOREIGN_KEY_CHECKS = 0');
        for (const table of tables) {
          await connection.query(table.deleteSql);
          await connection.query(table.insertSql);
          table.localAfterCount = await getRowCount(connection, localDatabase, table.tableName);
        }
        await connection.query('SET FOREIGN_KEY_CHECKS = 1');
        await connection.commit();
      } catch (error) {
        await connection.query('SET FOREIGN_KEY_CHECKS = 1');
        await connection.rollback();
        throw error;
      }
    }

    const summary = {
      generatedAt: new Date().toISOString(),
      apply,
      localDatabase,
      relationDatabase,
      tables,
    };

    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(summary, null, 2), 'utf8');
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await connection.end();
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) {
  await run();
}
