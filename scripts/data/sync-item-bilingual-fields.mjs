#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const args = parseArgs(process.argv.slice(2));
const apply = args.apply === 'true';

const db = {
  host: process.env.TERRAPEDIA_DB_HOST || '127.0.0.1',
  port: Number(process.env.TERRAPEDIA_DB_PORT || '3306'),
  user: process.env.TERRAPEDIA_DB_USERNAME || 'root',
  password: process.env.TERRAPEDIA_DB_PASSWORD || 'root',
  database: process.env.TERRAPEDIA_DB_NAME || 'terria_v1_local',
};

const standardized = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'standardized', 'items.standardized.json'), 'utf8'));
const records = Array.isArray(standardized.records) ? standardized.records : [];
const byInternal = new Map(records.map((record) => [String(record.internalName), record]));

const connection = await mysql.createConnection(db);
try {
  const [rows] = await connection.query(`
    SELECT id, name, name_zh, internal_name, description, description_zh, tooltip, tooltip_zh
    FROM items
    WHERE deleted = 0
    ORDER BY id ASC
  `);

  let checked = 0;
  let matched = 0;
  let updated = 0;
  const samples = [];

  if (apply) {
    await connection.beginTransaction();
  }

  for (const row of rows) {
    checked += 1;
    const standardizedRecord = byInternal.get(String(row.internal_name));
    if (!standardizedRecord) {
      continue;
    }
    matched += 1;

    const nextNameEn = toText(standardizedRecord.name) ?? row.name;
    const nextNameZh = toText(row.name_zh) ?? toText(row.name);
    const nextDescriptionEn = toText(row.description) ?? toText(standardizedRecord.description);
    const nextDescriptionZh = toText(row.description_zh);
    const nextTooltipEn = toText(row.tooltip) ?? toText(standardizedRecord.tooltip);
    const nextTooltipZh = toText(row.tooltip_zh);

    const changed =
      nextNameEn !== row.name ||
      nextNameZh !== row.name_zh ||
      nextDescriptionEn !== row.description ||
      nextDescriptionZh !== row.description_zh ||
      nextTooltipEn !== row.tooltip ||
      nextTooltipZh !== row.tooltip_zh;

    if (!changed) {
      continue;
    }

    if (samples.length < 30) {
      samples.push({
        id: row.id,
        internalName: row.internal_name,
        nameBefore: row.name,
        nameAfter: nextNameEn,
        nameZhBefore: row.name_zh,
        nameZhAfter: nextNameZh,
      });
    }

    if (apply) {
      const [result] = await connection.execute(
        `
        UPDATE items
        SET name = ?, name_zh = ?, description = ?, description_zh = ?, tooltip = ?, tooltip_zh = ?, updated_at = NOW()
        WHERE id = ?
        `,
        [nextNameEn, nextNameZh, nextDescriptionEn, nextDescriptionZh, nextTooltipEn, nextTooltipZh, row.id]
      );
      updated += Number(result.affectedRows || 0);
    } else {
      updated += 1;
    }
  }

  if (apply) {
    await connection.commit();
  }

  console.log(JSON.stringify({ apply, checked, matched, updated, samples }, null, 2));
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
