#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const args = parseArgs(process.argv.slice(2));
const apply = args.apply === 'true';
const standardizedPath = args.standardizedPath || path.join(process.cwd(), 'data', 'standardized', 'items.standardized.json');
const output = args.output || path.join(process.cwd(), 'reports', `items异常占位停用汇总_${new Date().toISOString().slice(0, 10)}.json`);

const db = {
  host: process.env.TERRAPEDIA_DB_HOST || '127.0.0.1',
  port: Number(process.env.TERRAPEDIA_DB_PORT || '3306'),
  user: process.env.TERRAPEDIA_DB_USERNAME || 'root',
  password: process.env.TERRAPEDIA_DB_PASSWORD || 'root',
  database: process.env.TERRAPEDIA_DB_NAME || 'terria_v1_local',
};

const standardized = JSON.parse(fs.readFileSync(standardizedPath, 'utf8'));
const records = Array.isArray(standardized.records) ? standardized.records : [];
const standardizedInternalNames = new Set(
  records
    .map((record) => normalizeInternalName(record?.internalName))
    .filter(Boolean)
);

const connection = await mysql.createConnection(db);

try {
  const [rows] = await connection.query(`
    SELECT id, internal_name, name, name_zh, status
    FROM items
    WHERE deleted = 0
    ORDER BY id ASC
  `);

  const extraItems = rows.filter((row) => {
    const internalName = normalizeInternalName(row.internal_name);
    return internalName && !standardizedInternalNames.has(internalName);
  });

  const summary = {
    generatedAt: new Date().toISOString(),
    apply,
    standardizedCount: records.length,
    extraItemCount: extraItems.length,
    disabledCount: 0,
    alreadyDisabledCount: 0,
    samples: [],
  };

  if (apply) {
    await connection.beginTransaction();
  }

  for (const row of extraItems) {
    if (Number(row.status ?? 1) === 0) {
      summary.alreadyDisabledCount += 1;
      pushSample(summary.samples, {
        id: Number(row.id),
        internalName: row.internal_name,
        name: row.name,
        statusBefore: row.status,
        action: 'already_disabled',
      });
      continue;
    }

    if (apply) {
      const [result] = await connection.execute(
        'UPDATE items SET status = 0, updated_at = NOW() WHERE id = ?',
        [row.id],
      );
      summary.disabledCount += Number(result.affectedRows || 0);
    } else {
      summary.disabledCount += 1;
    }

    pushSample(summary.samples, {
      id: Number(row.id),
      internalName: row.internal_name,
      name: row.name,
      nameZh: row.name_zh,
      statusBefore: row.status,
      statusAfter: 0,
      action: 'disabled',
    });
  }

  if (apply) {
    await connection.commit();
  }

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(summary, null, 2), 'utf8');
  console.log(JSON.stringify(summary, null, 2));
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

function normalizeInternalName(value) {
  if (value == null) return '';
  const text = String(value).trim();
  return text ? text.toLowerCase() : '';
}

function pushSample(samples, sample) {
  if (samples.length < 60) {
    samples.push(sample);
  }
}
