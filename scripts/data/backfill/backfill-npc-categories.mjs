#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const args = parseArgs(process.argv.slice(2));
const apply = args.apply === 'true';
const dbName = args.database || process.env.TERRAPEDIA_DB_NAME || 'terria_v1_local';
const output = args.output || path.join(process.cwd(), 'reports', `npc-category-backfill-${new Date().toISOString().slice(0, 10)}.json`);

const standardizedNpcPath = path.join(process.cwd(), 'data', 'standardized', 'npcs.standardized.json');
if (!fs.existsSync(standardizedNpcPath)) {
  throw new Error(`Missing standardized NPC file: ${standardizedNpcPath}`);
}

const standardizedPayload = JSON.parse(fs.readFileSync(standardizedNpcPath, 'utf8'));
const standardizedRecords = Array.isArray(standardizedPayload.records) ? standardizedPayload.records : [];
const npcByInternal = new Map(
  standardizedRecords
    .map((record) => [toText(record?.internalName), record])
    .filter(([internalName, record]) => internalName && record)
);

const db = {
  host: process.env.TERRAPEDIA_DB_HOST || '127.0.0.1',
  port: Number(process.env.TERRAPEDIA_DB_PORT || '3306'),
  user: process.env.TERRAPEDIA_DB_USERNAME || 'root',
  password: process.env.TERRAPEDIA_DB_PASSWORD || 'root',
  database: dbName,
};

const conn = await mysql.createConnection(db);

try {
  const [categoryRows] = await conn.query('SELECT id, code FROM category WHERE deleted = 0');
  const categoryByCode = new Map(
    categoryRows
      .map((row) => [toText(row.code), toInt(row.id)])
      .filter(([code, id]) => code && id != null)
  );

  const [npcRows] = await conn.query(`
    SELECT id, source_id, game_id, internal_name, category_id
    FROM npcs
    WHERE deleted = 0
    ORDER BY id ASC
  `);

  const summary = {
    generatedAt: new Date().toISOString(),
    apply,
    database: db.database,
    checked: npcRows.length,
    candidateUpdated: 0,
    appliedUpdated: 0,
    categoryCounts: {},
    samples: [],
  };

  if (apply) {
    await conn.beginTransaction();
  }

  for (const row of npcRows) {
    const record = npcByInternal.get(toText(row.internal_name));
    if (!record) continue;
    const nextCategoryId = inferNpcCategoryId(record, categoryByCode);
    if (nextCategoryId === 0 || Number(row.category_id ?? 0) === nextCategoryId) {
      continue;
    }

    summary.candidateUpdated += 1;
    summary.categoryCounts[nextCategoryId] = (summary.categoryCounts[nextCategoryId] || 0) + 1;
    pushSample(summary.samples, {
      id: row.id,
      gameId: row.game_id,
      internalName: row.internal_name,
      categoryIdBefore: row.category_id,
      categoryIdAfter: nextCategoryId,
    });

    if (apply) {
      const [result] = await conn.execute(
        `UPDATE npcs
           SET category_id = ?,
               updated_at = NOW()
         WHERE id = ?`,
        [nextCategoryId, row.id]
      );
      summary.appliedUpdated += Number(result.affectedRows || 0);
    }
  }

  if (apply) {
    await conn.commit();
  }

  writeJson(output, summary);
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  if (apply) {
    await conn.rollback();
  }
  writeJson(output, {
    generatedAt: new Date().toISOString(),
    apply,
    database: db.database,
    error: error instanceof Error ? error.message : String(error),
  });
  throw error;
} finally {
  await conn.end();
}

function inferNpcCategoryId(record, categoryByCode) {
  const friendly = record?.flags?.friendly === true;
  const townNpc = record?.extras?.townNPC === true || record?.extras?.townnpc === true;

  if (friendly) {
    if (townNpc) {
      return firstCategoryId(categoryByCode, [
        'CATEGORY_NPC_FRIENDLY_TOWN',
        'NPC_FRIENDLY_TOWN',
        'CATEGORY_NPC_FRIENDLY',
        'NPC_FRIENDLY',
        'CATEGORY_NPC',
      ]);
    }
    return firstCategoryId(categoryByCode, [
      'CATEGORY_NPC_FRIENDLY_OTHER',
      'NPC_FRIENDLY_OTHER',
      'CATEGORY_NPC_FRIENDLY',
      'NPC_FRIENDLY',
      'CATEGORY_NPC',
    ]);
  }

  return firstCategoryId(categoryByCode, [
    'CATEGORY_NPC_ENEMY',
    'NPC_ENEMY',
    'CATEGORY_NPC',
  ]);
}

function firstCategoryId(categoryByCode, codes) {
  for (const code of codes) {
    const id = categoryByCode.get(code);
    if (id != null) return id;
  }
  return 0;
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
  return text.length ? text : null;
}

function toInt(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : null;
}

function pushSample(samples, sample) {
  if (samples.length < 50) {
    samples.push(sample);
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}
