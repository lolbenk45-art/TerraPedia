#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const args = parseArgs(process.argv.slice(2));
const apply = args.apply === 'true';
const dbName = args.database || process.env.TERRAPEDIA_DB_NAME || 'terria_v1_local';
const output = args.output || path.join(process.cwd(), 'reports', `npc-zh-backfill-${new Date().toISOString().slice(0, 10)}.json`);

const db = {
  host: process.env.TERRAPEDIA_DB_HOST || '127.0.0.1',
  port: Number(process.env.TERRAPEDIA_DB_PORT || '3306'),
  user: process.env.TERRAPEDIA_DB_USERNAME || 'root',
  password: process.env.TERRAPEDIA_DB_PASSWORD || 'root',
  database: dbName,
};

const generatedPath = path.join(process.cwd(), 'data', 'generated', 'npc-id-row-images.json');
if (!fs.existsSync(generatedPath)) {
  throw new Error(`Missing generated NPC zh source: ${generatedPath}`);
}

const payload = JSON.parse(fs.readFileSync(generatedPath, 'utf8'));
const records = Array.isArray(payload?.records) ? payload.records : [];
const byGameId = new Map(
  records
    .map((record) => [toInt(record?.gameId ?? record?.id), record])
    .filter(([id, record]) => id != null && record)
);

const conn = await mysql.createConnection(db);

try {
  const summary = {
    generatedAt: new Date().toISOString(),
    apply,
    database: db.database,
    sourceCount: records.length,
    checked: 0,
    candidateUpdated: 0,
    appliedUpdated: 0,
    samples: [],
  };

  const [rows] = await conn.query(`
    SELECT id, game_id, internal_name, name, name_zh, sub_name_zh
    FROM npcs
    WHERE deleted = 0
    ORDER BY id ASC
  `);

  if (apply) {
    await conn.beginTransaction();
  }

  for (const row of rows) {
    summary.checked += 1;
    const source = byGameId.get(toInt(row.game_id));
    if (!source) continue;

    const nextNameZh = toText(source.nameZh);
    const nextSubNameZh = toText(source.subNameZh);
    const changed = nextNameZh !== toText(row.name_zh) || nextSubNameZh !== toText(row.sub_name_zh);
    if (!changed) continue;

    summary.candidateUpdated += 1;
    pushSample(summary.samples, {
      id: row.id,
      gameId: row.game_id,
      internalName: row.internal_name,
      nameZhBefore: row.name_zh,
      nameZhAfter: nextNameZh,
      subNameZhBefore: row.sub_name_zh,
      subNameZhAfter: nextSubNameZh,
    });

    if (apply) {
      const [result] = await conn.execute(
        `UPDATE npcs
           SET name_zh = ?,
               sub_name_zh = ?,
               updated_at = NOW()
         WHERE id = ?`,
        [nextNameZh, nextSubNameZh, row.id]
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

function toInt(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : null;
}

function toText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
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
