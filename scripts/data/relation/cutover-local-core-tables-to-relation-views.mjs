#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { LOCAL_CORE_TABLES } from './backup-local-core-tables.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

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

async function tableExists(connection, database, tableName) {
  const [rows] = await connection.query(
    'SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
    [database, tableName]
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

export function buildCutoverStatements({ localDatabase, relationDatabase, tableNames = LOCAL_CORE_TABLES } = {}) {
  return tableNames.flatMap((tableName) => [
    `DROP VIEW IF EXISTS \`${localDatabase}\`.\`${tableName}\``,
    `DROP TABLE IF EXISTS \`${localDatabase}\`.\`${tableName}\``,
    `CREATE OR REPLACE VIEW \`${localDatabase}\`.\`${tableName}\` AS SELECT * FROM \`${relationDatabase}\`.\`${tableName}\``,
  ]);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const apply = booleanOption(args.apply, false);
  const manifestPath = path.resolve(process.cwd(), args.manifest ?? '');
  if (!manifestPath || !fs.existsSync(manifestPath)) {
    throw new Error('manifest is required and must exist');
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const localDatabase = args['local-database'] ?? args.localDatabase ?? manifest.database ?? 'terria_v1_local';
  const relationDatabase = args['relation-database'] ?? args.relationDatabase ?? 'terria_v1_relation';
  const backups = Array.isArray(manifest.backups) ? manifest.backups : [];
  const tableNames = backups.map((entry) => entry.originalTable);
  const output = path.resolve(process.cwd(), args.output ?? path.join('reports', 'relation', `local-cutover-${new Date().toISOString().slice(0, 10)}.json`));

  const connection = await mysql.createConnection({
    host: args.host ?? '127.0.0.1',
    port: Number(args.port ?? 3306),
    user: args.user ?? 'root',
    password: args.password ?? 'root',
  });

  try {
    for (const backup of backups) {
      const exists = await tableExists(connection, localDatabase, backup.backupTable);
      if (!exists) {
        throw new Error(`Required backup table missing: ${localDatabase}.${backup.backupTable}`);
      }
    }

    const statements = buildCutoverStatements({ localDatabase, relationDatabase, tableNames });
    if (apply) {
      for (const sql of statements) {
        await connection.query(sql);
      }
    }

    const summary = {
      generatedAt: new Date().toISOString(),
      apply,
      localDatabase,
      relationDatabase,
      tableNames,
      statements,
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
