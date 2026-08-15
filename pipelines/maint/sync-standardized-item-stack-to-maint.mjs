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

function toNullableNumber(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function readStandardizedItems(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(raw.records) ? raw.records : [];
}

export function buildMaintItemStackUpdates({
  standardizedItems = [],
  maintItems = [],
} = {}) {
  const standardizedByInternalName = new Map(
    standardizedItems
      .map((item) => [String(item?.internalName ?? '').trim(), toNullableNumber(item?.stack?.stackSize)])
      .filter(([internalName, stackSize]) => internalName && stackSize !== null)
  );

  return maintItems
    .filter((row) => {
      const internalName = String(row?.internal_name ?? '').trim();
      return internalName
        && (row.stack_size === null || row.stack_size === undefined)
        && standardizedByInternalName.has(internalName);
    })
    .map((row) => ({
      id: Number(row.id),
      internalName: String(row.internal_name).trim(),
      stackSize: standardizedByInternalName.get(String(row.internal_name).trim()),
    }));
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const apply = booleanOption(args.apply, false);
  const standardizedPath = path.resolve(process.cwd(), args.standardized ?? path.join('data', 'standardized', 'items.standardized.json'));
  const output = path.resolve(process.cwd(), args.output ?? path.join('reports', 'relation', `item-stack-maint-sync-${new Date().toISOString().slice(0, 10)}.json`));
  const database = args.database ?? process.env.TERRAPEDIA_DB_NAME ?? 'terria_v1_maint';

  const connection = await mysql.createConnection({
    host: args.host ?? process.env.TERRAPEDIA_DB_HOST ?? '127.0.0.1',
    port: Number(args.port ?? process.env.TERRAPEDIA_DB_PORT ?? 3306),
    user: args.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? 'root',
    password: args.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? 'root',
    database,
  });

  try {
    const standardizedItems = readStandardizedItems(standardizedPath);
    const [maintItems] = await connection.query('SELECT id, internal_name, stack_size FROM maint_items WHERE deleted = 0');
    const updates = buildMaintItemStackUpdates({ standardizedItems, maintItems });

    if (apply && updates.length > 0) {
      await connection.beginTransaction();
      try {
        for (const update of updates) {
          await connection.execute(
            'UPDATE maint_items SET stack_size = ?, updated_at = NOW() WHERE id = ?',
            [update.stackSize, update.id]
          );
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }

    const summary = {
      generatedAt: new Date().toISOString(),
      apply,
      standardizedCount: standardizedItems.length,
      maintCount: maintItems.length,
      updateCount: updates.length,
      sampleUpdates: updates.slice(0, 20),
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
