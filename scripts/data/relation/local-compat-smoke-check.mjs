#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';

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

export function buildSmokeSummary({ domains = [] } = {}) {
  return {
    generatedAt: new Date().toISOString(),
    switchableDomains: domains.filter((entry) => entry.missingCount === 0 && entry.extraCount === 0 && entry.blockingFields.length === 0).map((entry) => entry.domain),
    blockedDomains: domains.filter((entry) => entry.missingCount !== 0 || entry.extraCount !== 0 || entry.blockingFields.length !== 0).map((entry) => entry.domain),
    domains,
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadLocalStackConfig(process.cwd());
  const localDatabase = args['local-database'] ?? 'terria_v1_local';
  const relationDatabase = args['relation-database'] ?? 'terria_v1_relation';
  const output = path.resolve(process.cwd(), args.output ?? path.join('reports', 'relation', `local-compat-smoke-check-${new Date().toISOString().slice(0, 10)}.json`));
  const connection = await mysql.createConnection({
    host: args.host ?? config.database?.host ?? '127.0.0.1',
    port: Number(args.port ?? config.database?.port ?? 3306),
    user: args.user ?? config.database?.username ?? 'root',
    password: args.password ?? config.database?.password ?? 'root',
  });

  const pairs = [
    ['items', 'items', 'internal_name'],
    ['npcs', 'npcs', 'internal_name'],
    ['projectiles', 'projectiles', 'internal_name'],
    ['buffs', 'buffs', 'internal_name'],
  ];

  try {
    const domains = [];
    for (const [domain, compatTable, key] of pairs) {
      const [localRows] = await connection.query(`SELECT COUNT(*) AS c FROM \`${localDatabase}\`.\`${domain}\``);
      const [compatRows] = await connection.query(`SELECT COUNT(*) AS c FROM \`${relationDatabase}\`.\`${compatTable}\``);
      const [missingRows] = await connection.query(
        `SELECT COUNT(*) AS c FROM \`${localDatabase}\`.\`${domain}\` l LEFT JOIN \`${relationDatabase}\`.\`${compatTable}\` c ON c.\`${key}\` COLLATE utf8mb4_unicode_ci = l.\`${key}\` COLLATE utf8mb4_unicode_ci WHERE c.\`${key}\` IS NULL`
      );
      const [extraRows] = await connection.query(
        `SELECT COUNT(*) AS c FROM \`${relationDatabase}\`.\`${compatTable}\` c LEFT JOIN \`${localDatabase}\`.\`${domain}\` l ON l.\`${key}\` COLLATE utf8mb4_unicode_ci = c.\`${key}\` COLLATE utf8mb4_unicode_ci WHERE l.\`${key}\` IS NULL`
      );
      domains.push({
        domain,
        localRowCount: Number(localRows[0]?.c ?? 0),
        compatRowCount: Number(compatRows[0]?.c ?? 0),
        missingCount: Number(missingRows[0]?.c ?? 0),
        extraCount: Number(extraRows[0]?.c ?? 0),
        blockingFields: [],
      });
    }

    const summary = buildSmokeSummary({ domains });
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
