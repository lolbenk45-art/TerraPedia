#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

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

export function buildRestoreStatements({ database, backups = [] } = {}) {
  return backups.flatMap(({ originalTable, backupTable }) => [
    `DROP VIEW IF EXISTS \`${database}\`.\`${originalTable}\``,
    `DROP TABLE IF EXISTS \`${database}\`.\`${originalTable}\``,
    `RENAME TABLE \`${database}\`.\`${backupTable}\` TO \`${database}\`.\`${originalTable}\``,
  ]);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const apply = booleanOption(args.apply, false);
  const manifest = path.resolve(process.cwd(), args.manifest ?? '');
  if (!manifest || !fs.existsSync(manifest)) {
    throw new Error('manifest is required and must exist');
  }

  const payload = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  const database = args.database ?? payload.database ?? 'terria_v1_local';
  const backups = Array.isArray(payload.backups) ? payload.backups : [];
  const connection = await mysql.createConnection({
    host: args.host ?? '127.0.0.1',
    port: Number(args.port ?? 3306),
    user: args.user ?? 'root',
    password: args.password ?? 'root',
  });

  try {
    const statements = buildRestoreStatements({ database, backups });
    if (apply) {
      for (const sql of statements) {
        await connection.query(sql);
      }
    }
    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      apply,
      database,
      statements,
    }, null, 2));
  } finally {
    await connection.end();
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) {
  await run();
}
