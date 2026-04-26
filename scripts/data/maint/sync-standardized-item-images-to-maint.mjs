#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

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

function toNullableText(value) {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

function toNullableNumber(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildRecordKey(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function readStandardizedItems(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(raw.records) ? raw.records : [];
}

export function buildMaintItemImageRows({
  standardizedItems = [],
  existingMaintImages = [],
} = {}) {
  const existing = new Set(
    existingMaintImages
      .map((row) => toNullableText(row.item_internal_name ?? row.itemInternalName))
      .filter(Boolean)
  );

  return standardizedItems
    .filter((item) => {
      const internalName = toNullableText(item.internalName);
      return internalName
        && toNullableText(item.imageUrl)
        && toNullableText(item.imageFileTitle)
        && !existing.has(internalName);
    })
    .map((item) => {
      const internalName = toNullableText(item.internalName);
      const imageUrl = toNullableText(item.imageUrl);
      const sourceFileTitle = toNullableText(item.imageFileTitle);
      return {
        recordKey: buildRecordKey(`standardized.items:${internalName}:${imageUrl}`),
        itemInternalName: internalName,
        itemName: toNullableText(item.name),
        role: 'icon',
        sourceProvider: 'standardized',
        sourceFileTitle,
        sourcePage: 'items.standardized.json',
        sourceRevisionTimestamp: null,
        originalUrl: imageUrl,
        cachedUrl: imageUrl,
        width: toNullableNumber(item.imageWidth),
        height: toNullableNumber(item.imageHeight),
        contentType: toNullableText(item.imageContentType),
        isPrimary: 1,
        sortOrder: 0,
        landingSourceId: 0,
        landingSourceKey: 'standardized.items',
        landingSourcePage: 'items.standardized.json',
        landingContentHash: buildRecordKey(`landing:standardized.items:${internalName}:${imageUrl}`),
        landingFetchedAt: null,
        landingParsedAt: null,
        rawJson: JSON.stringify(item),
        status: 1,
        deleted: 0,
      };
    });
}

function camelToSnake(name) {
  return String(name).replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function mapRowToDb(row) {
  const mapped = {};
  for (const [key, value] of Object.entries(row)) {
    mapped[camelToSnake(key)] = value;
  }
  return mapped;
}

async function upsertRows(connection, tableName, rows) {
  let total = 0;
  for (const row of rows) {
    const mapped = mapRowToDb(row);
    const columns = Object.keys(mapped);
    const placeholders = columns.map(() => '?').join(', ');
    const updates = columns
      .filter((column) => column !== 'record_key')
      .map((column) => `\`${column}\` = VALUES(\`${column}\`)`)
      .join(', ');
    await connection.execute(
      `INSERT INTO \`${tableName}\` (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`,
      columns.map((column) => mapped[column])
    );
    total += 1;
  }
  return total;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const apply = booleanOption(args.apply, false);
  const standardizedPath = path.resolve(process.cwd(), args.standardized ?? path.join('data', 'standardized', 'items.standardized.json'));
  const output = path.resolve(process.cwd(), args.output ?? path.join('reports', 'relation', `item-image-maint-sync-${new Date().toISOString().slice(0, 10)}.json`));
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
    const [existingMaintImages] = await connection.query('SELECT item_internal_name FROM maint_item_images WHERE deleted = 0');
    const rows = buildMaintItemImageRows({ standardizedItems, existingMaintImages });
    const summary = {
      generatedAt: new Date().toISOString(),
      apply,
      standardizedCount: standardizedItems.length,
      existingMaintImageCount: existingMaintImages.length,
      insertedCandidateCount: rows.length,
      sampleRows: rows.slice(0, 10).map((row) => ({
        itemInternalName: row.itemInternalName,
        sourceFileTitle: row.sourceFileTitle,
        originalUrl: row.originalUrl,
      })),
    };

    if (apply && rows.length > 0) {
      summary.upsertedCount = await upsertRows(connection, 'maint_item_images', rows);
    } else {
      summary.upsertedCount = 0;
    }

    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(summary, null, 2), 'utf8');
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await connection.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await run();
}
