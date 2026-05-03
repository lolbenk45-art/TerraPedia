#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { resolveItemCategoryCode } from '../lib/item-category-normalization.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const repoRoot = process.cwd();
const args = parseArgs(process.argv.slice(2));
const apply = args.apply === 'true';

const db = {
  host: process.env.TERRAPEDIA_DB_HOST || '127.0.0.1',
  port: Number(process.env.TERRAPEDIA_DB_PORT || '3306'),
  user: process.env.TERRAPEDIA_DB_USERNAME || 'root',
  password: process.env.TERRAPEDIA_DB_PASSWORD || 'root',
  database: process.env.TERRAPEDIA_DB_NAME || 'terria_v1_local',
};

const standardizedPath = path.join(repoRoot, 'data', 'standardized', 'items.standardized.json');
if (!fs.existsSync(standardizedPath)) {
  console.error(`Standardized item dataset not found: ${standardizedPath}`);
  process.exit(1);
}

const standardized = JSON.parse(fs.readFileSync(standardizedPath, 'utf8'));
const records = Array.isArray(standardized.records) ? standardized.records : [];
const categoryCodeByInternal = new Map();
for (const record of records) {
  const internalName = toText(record?.internalName);
  const categoryCode = resolveItemCategoryCode(record?.categoryCode, record);
  if (internalName && categoryCode && !categoryCodeByInternal.has(internalName)) {
    categoryCodeByInternal.set(internalName, categoryCode);
  }
}

const connection = await mysql.createConnection(db);
try {
  const [categories] = await connection.query('SELECT id, code FROM category WHERE deleted = 0');
  const categoryIdByCode = new Map(categories.map((row) => [String(row.code), Number(row.id)]));

  const [items] = await connection.query(`
    SELECT id, internal_name, category_id
    FROM items
    WHERE deleted = 0
      AND (category_id IS NULL OR category_id = 0)
    ORDER BY id ASC
  `);

  let uncategorized = 0;
  let matched = 0;
  let updated = 0;
  let missingStandardized = 0;
  let missingCategory = 0;
  const samples = [];

  if (apply) {
    await connection.beginTransaction();
  }

  for (const item of items) {
    uncategorized += 1;
    const internalName = toText(item.internal_name);
    const categoryCode = internalName ? categoryCodeByInternal.get(internalName) : null;
    if (!categoryCode) {
      missingStandardized += 1;
      if (samples.length < 30) {
        samples.push({ id: item.id, internalName, reason: 'missing_standardized' });
      }
      continue;
    }

    const categoryId = categoryIdByCode.get(categoryCode);
    if (!categoryId) {
      missingCategory += 1;
      if (samples.length < 30) {
        samples.push({ id: item.id, internalName, categoryCode, reason: 'missing_category' });
      }
      continue;
    }

    matched += 1;
    if (samples.length < 30) {
      samples.push({ id: item.id, internalName, categoryCode, categoryId, reason: 'matched' });
    }

    if (apply) {
      const [result] = await connection.execute(
        'UPDATE items SET category_id = ?, updated_at = NOW() WHERE id = ? AND (category_id IS NULL OR category_id = 0)',
        [categoryId, item.id]
      );
      updated += Number(result.affectedRows || 0);
    }
  }

  if (apply) {
    await connection.commit();
  }

  console.log(JSON.stringify({
    apply,
    db,
    standardizedRecords: records.length,
    uncategorized,
    matched,
    updated,
    missingStandardized,
    missingCategory,
    samples,
  }, null, 2));
} catch (error) {
  if (apply) {
    await connection.rollback();
  }
  throw error;
} finally {
  await connection.end();
}

function parseArgs(argv) {
  const out = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const index = body.indexOf('=');
    if (index >= 0) out[body.slice(0, index)] = body.slice(index + 1);
    else out[body] = 'true';
  }
  return out;
}

function toText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}
