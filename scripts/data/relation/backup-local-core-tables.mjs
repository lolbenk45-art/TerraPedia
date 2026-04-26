#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';

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

function toSuffix(value = new Date()) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  const date = value instanceof Date ? value : new Date(value);
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

export function buildBackupName(tableName, suffix) {
  return `${tableName}_backup_${suffix}`;
}

export function buildBackupStatements({ database, suffix, tables = LOCAL_CORE_TABLES } = {}) {
  return tables.flatMap((tableName) => {
    const backupTable = buildBackupName(tableName, suffix);
    return [
      `CREATE TABLE \`${database}\`.\`${backupTable}\` LIKE \`${database}\`.\`${tableName}\``,
      `INSERT INTO \`${database}\`.\`${backupTable}\` SELECT * FROM \`${database}\`.\`${tableName}\``,
    ];
  });
}

async function tableExists(connection, database, tableName) {
  const [rows] = await connection.query(
    'SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
    [database, tableName]
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function getRowCount(connection, database, tableName) {
  const [rows] = await connection.query(`SELECT COUNT(*) AS c FROM \`${database}\`.\`${tableName}\``);
  return Number(rows[0]?.c ?? 0);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const apply = booleanOption(args.apply, false);
  const config = loadLocalStackConfig(process.cwd());
  const database = args.database ?? config.database?.name ?? 'terria_v1_local';
  const suffix = toSuffix(args.suffix);
  const output = path.resolve(process.cwd(), args.output ?? path.join('reports', 'relation', `local-cutover-backup-${suffix}.json`));
  const connection = await mysql.createConnection({
    host: args.host ?? config.database?.host ?? '127.0.0.1',
    port: Number(args.port ?? config.database?.port ?? 3306),
    user: args.user ?? config.database?.username ?? 'root',
    password: args.password ?? config.database?.password ?? 'root',
  });

  try {
    const backups = [];
    for (const tableName of LOCAL_CORE_TABLES) {
      const backupTable = buildBackupName(tableName, suffix);
      const exists = await tableExists(connection, database, backupTable);
      if (exists) {
        throw new Error(`Backup table already exists: ${database}.${backupTable}`);
      }

      if (apply) {
        for (const sql of buildBackupStatements({ database, suffix, tables: [tableName] })) {
          await connection.query(sql);
        }
      }

      backups.push({
        originalTable: tableName,
        backupTable,
        sourceRowCount: await getRowCount(connection, database, tableName),
        backupRowCount: apply ? await getRowCount(connection, database, backupTable) : null,
      });
    }

    const summary = {
      generatedAt: new Date().toISOString(),
      apply,
      database,
      suffix,
      backups,
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
