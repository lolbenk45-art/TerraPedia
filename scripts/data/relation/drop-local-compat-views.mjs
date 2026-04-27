#!/usr/bin/env node

import { createRequire } from 'node:module';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { RELATION_COMPAT_VIEWS } from './create-local-compat-views.mjs';

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

export function buildDropViewStatements({ database, viewNames = Object.keys(RELATION_COMPAT_VIEWS) } = {}) {
  return viewNames.map((viewName) => `DROP VIEW IF EXISTS \`${database}\`.\`${viewName}\``);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const apply = booleanOption(args.apply, false);
  const config = loadLocalStackConfig(process.cwd());
  const database = args.database ?? 'terria_v1_relation';
  const connection = await mysql.createConnection({
    host: args.host ?? config.database?.host ?? '127.0.0.1',
    port: Number(args.port ?? config.database?.port ?? 3306),
    user: args.user ?? config.database?.username ?? 'root',
    password: args.password ?? config.database?.password ?? 'root',
  });

  try {
    const statements = buildDropViewStatements({ database });
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
