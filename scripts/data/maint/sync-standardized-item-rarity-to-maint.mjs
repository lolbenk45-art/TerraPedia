#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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

function buildRecordKey(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function readStandardizedItems(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(raw.records) ? raw.records : [];
}

export function buildMaintItemRarityOverrides({
  standardizedItems = [],
} = {}) {
  return standardizedItems
    .filter((item) => item?.internalName && item?.rarityId != null)
    .map((item) => ({
      recordKey: buildRecordKey(`maint_item_rarity_overrides:${item.internalName}:${item.rarityId}`),
      itemInternalName: item.internalName,
      rarityId: Number(item.rarityId),
      rarityCode: item.rarity ?? null,
      sourceProvider: 'standardized',
      sourcePage: 'items.standardized.json',
      rawJson: JSON.stringify(item),
      status: 1,
      deleted: 0,
    }));
}

function mapRowToDb(row) {
  const mapped = {};
  for (const [key, value] of Object.entries(row)) {
    mapped[key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`)] = value;
  }
  return mapped;
}

async function upsertRows(connection, rows) {
  for (const row of rows) {
    const mapped = mapRowToDb(row);
    const columns = Object.keys(mapped);
    const placeholders = columns.map(() => '?').join(', ');
    const updates = columns
      .filter((column) => column !== 'record_key')
      .map((column) => `\`${column}\` = VALUES(\`${column}\`)`)
      .join(', ');
    await connection.execute(
      `INSERT INTO \`maint_item_rarity_overrides\` (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`,
      columns.map((column) => mapped[column])
    );
  }
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const apply = booleanOption(args.apply, false);
  const standardizedPath = path.resolve(process.cwd(), args.standardized ?? path.join('data', 'standardized', 'items.standardized.json'));
  const output = path.resolve(process.cwd(), args.output ?? path.join('reports', 'relation', `item-rarity-override-sync-${new Date().toISOString().slice(0, 10)}.json`));

  const connection = await mysql.createConnection({
    host: args.host ?? process.env.TERRAPEDIA_DB_HOST ?? '127.0.0.1',
    port: Number(args.port ?? process.env.TERRAPEDIA_DB_PORT ?? 3306),
    user: args.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? 'root',
    password: args.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? 'root',
    database: args.database ?? process.env.TERRAPEDIA_DB_NAME ?? 'terria_v1_maint',
  });

  try {
    const standardizedItems = readStandardizedItems(standardizedPath);
    const rows = buildMaintItemRarityOverrides({ standardizedItems });
    if (apply && rows.length > 0) {
      await connection.beginTransaction();
      try {
        await upsertRows(connection, rows);
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
      overrideCount: rows.length,
      sampleRows: rows.slice(0, 20),
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
