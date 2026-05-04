#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import {
  clearPublicItemCaches,
  resolveRedisConfigFromEnv,
  skippedPublicItemCacheResult,
} from '../lib/public-item-cache.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const args = parseArgs(process.argv.slice(2));
const apply = args.apply === 'true';
const allowNonPrimaryDb = args['allow-non-primary-db'] === 'true' || process.env.TERRAPEDIA_ALLOW_NON_PRIMARY_DB === 'true';
const output = args.output || path.join(process.cwd(), 'reports', `item-rarity-period-sync-${new Date().toISOString().slice(0, 10)}.json`);

const db = {
  host: process.env.TERRAPEDIA_DB_HOST || '127.0.0.1',
  port: Number(process.env.TERRAPEDIA_DB_PORT || '3306'),
  user: process.env.TERRAPEDIA_DB_USERNAME || 'root',
  password: process.env.TERRAPEDIA_DB_PASSWORD || 'root',
  database: args.database || process.env.TERRAPEDIA_DB_NAME || 'terria_v1_local',
};
const redis = resolveRedisConfigFromEnv(args);

assertPrimaryDb(db.database, apply, allowNonPrimaryDb);

const repoRoot = process.cwd();
const standardizedItemsPath = path.join(repoRoot, 'data', 'standardized', 'items.standardized.json');
const itemPagesPath = path.join(repoRoot, 'data', 'standardized', 'item_pages.standardized.json');
const rawItemPagesDirCandidates = [
  path.resolve(repoRoot, '..', 'terraPedia', 'data', 'raw', 'wiki', 'item-pages'),
  path.resolve(repoRoot, '..', '..', 'data', 'terraPedia', 'raw', 'wiki', 'item-pages'),
];
const rawItemPagesDir = rawItemPagesDirCandidates.find((candidate) => fs.existsSync(candidate));
if (!rawItemPagesDir) {
  throw new Error(`Raw wiki item-pages directory not found. Tried: ${rawItemPagesDirCandidates.join(', ')}`);
}

const standardizedItems = readRecords(standardizedItemsPath);
const itemPages = readRecords(itemPagesPath);
const standardizedByInternal = new Map(standardizedItems.map((item) => [toKey(item.internalName), item]));
const itemPageByInternal = new Map(itemPages.map((entry) => [toKey(entry.itemInternalName), entry]));
const iteminfoModule = await loadIteminfoModuleData();
const iteminfoByInternal = new Map(
  Object.entries(iteminfoModule)
    .filter(([key, value]) => key !== '0' && !key.startsWith('_') && value && typeof value === 'object')
    .map(([, value]) => [toKey(value.internalName), value]),
);

const conn = await mysql.createConnection(db);

try {
  await ensureLookupTables(conn);
  await ensureItemColumnTypes(conn);

  const [rows] = await conn.query(`
    SELECT id, internal_name, name, rarity_id, game_period_id
    FROM items
    WHERE deleted = 0
    ORDER BY id ASC
  `);

  const normalizedRecords = [];
  const summary = {
    generatedAt: new Date().toISOString(),
    apply,
    database: db.database,
    totalItems: rows.length,
    normalizedCount: 0,
    candidateUpdated: 0,
    candidateRarityUpdated: 0,
    candidatePeriodUpdated: 0,
    appliedUpdated: 0,
    appliedRarityUpdated: 0,
    appliedPeriodUpdated: 0,
    unresolved: 0,
    reasonCounts: {},
    samples: [],
  };

  if (apply) {
    await conn.beginTransaction();
  }

  for (const row of rows) {
    const internalKey = toKey(row.internal_name);
    const standardized = standardizedByInternal.get(internalKey) || null;
    const pageMeta = itemPageByInternal.get(internalKey) || null;
    const rawPage = loadRawPage(pageMeta?.sourceFile, row.internal_name);
    const iteminfo = iteminfoByInternal.get(internalKey) || null;

    const rarityId = normalizeRarityId(
      standardized?.rarityId ?? iteminfo?.rare ?? iteminfo?.rarity ?? row.rarity_id
    );
    const rarityCode = rarityCodeFromId(rarityId);
    const period = classifyItemPeriod({ row, iteminfo, rawPage });

    if (!period) {
      summary.unresolved += 1;
      pushSample(summary.samples, {
        id: row.id,
        internalName: row.internal_name,
        name: row.name,
        status: 'unresolved',
      });
      continue;
    }

    summary.normalizedCount += 1;
    summary.reasonCounts[period.reason] = (summary.reasonCounts[period.reason] || 0) + 1;

    const normalized = {
      id: row.id,
      internalName: row.internal_name,
      name: row.name,
      rarityId,
      rarityCode,
      gamePeriodId: period.id,
      gamePeriodCode: period.code,
      source: {
        standardizedRarityId: standardized?.rarityId ?? null,
        standardizedRarity: standardized?.rarity ?? null,
        iteminfoRare: iteminfo?.rare ?? iteminfo?.rarity ?? null,
        periodReason: period.reason,
      },
    };
    normalizedRecords.push(normalized);

    const rarityChanged = Number(row.rarity_id ?? 0) !== Number(rarityId ?? 0);
    const periodChanged = Number(row.game_period_id ?? 0) !== Number(period.id ?? 0);
    if (rarityChanged) summary.candidateRarityUpdated += 1;
    if (periodChanged) summary.candidatePeriodUpdated += 1;
    if (rarityChanged || periodChanged) summary.candidateUpdated += 1;

    if (apply) {
      const [result] = await conn.execute(
        `UPDATE items
            SET rarity_id = ?,
                game_period_id = ?,
                updated_at = NOW()
          WHERE id = ?
            AND (
              COALESCE(rarity_id, 0) <> COALESCE(?, 0)
              OR COALESCE(game_period_id, 0) <> COALESCE(?, 0)
            )`,
        [rarityId, period.id, row.id, rarityId, period.id],
      );
      if (Number(result.affectedRows || 0) > 0) {
        summary.appliedUpdated += 1;
        if (rarityChanged) summary.appliedRarityUpdated += 1;
        if (periodChanged) summary.appliedPeriodUpdated += 1;
      }
    }

    pushSample(summary.samples, normalized);
  }

  if (apply) {
    await conn.commit();
  }

  const publicItemCache = apply && summary.appliedUpdated > 0
    ? await clearPublicItemCaches(redis)
    : skippedPublicItemCacheResult(apply ? 'no_public_item_rows_changed' : 'dry_run');

  writeJson(output, {
    summary,
    publicItemCache,
    recordsPreview: normalizedRecords.slice(0, 50),
  });
  console.log(JSON.stringify({ ...summary, publicItemCache }, null, 2));
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

function classifyItemPeriod({ row, iteminfo, rawPage }) {
  const direct = classifyFromRawPage(rawPage);
  if (direct) return direct;

  const local = classifyFromLocalOnlySignals({ row, iteminfo, rawPage });
  if (local) return local;

  return {
    id: 1,
    code: 'pre_hardmode',
    reason: 'fallback_default_pre_hardmode',
  };
}

function classifyFromRawPage(rawPage) {
  if (!rawPage) return null;

  const wikitext = String(rawPage.wikitext || '');
  if (/\[\[Category:Hardmode-only items\]\]/i.test(wikitext)) {
    return { id: 2, code: 'hardmode', reason: 'raw_category_hardmode_only' };
  }

  const lead = extractLeadText(wikitext);
  if (/\bpre-Hardmode\b/i.test(lead)) {
    return { id: 1, code: 'pre_hardmode', reason: 'raw_lead_pre_hardmode' };
  }
  if (/(^|[^-])\bHardmode\b/i.test(lead)) {
    return { id: 2, code: 'hardmode', reason: 'raw_lead_hardmode' };
  }

  return null;
}

function classifyFromLocalOnlySignals({ iteminfo, rawPage }) {
  const wikitext = String(rawPage?.wikitext || '');
  if (/\[\[Category:Hardmode-only items\]\]/i.test(wikitext)) {
    return { id: 2, code: 'hardmode', reason: 'raw_category_hardmode_only' };
  }
  if (/\[\[Category:(Mythril or Orichalcum Anvil|Ancient Manipulator|Autohammer|Lunar Crafting Station|Hardmode Forges)\]\]/i.test(wikitext)) {
    return { id: 2, code: 'hardmode', reason: 'raw_category_hardmode_station' };
  }

  const rawRare = Number(iteminfo?.rare);
  if (Number.isFinite(rawRare) && rawRare >= 4) {
    return { id: 2, code: 'hardmode', reason: 'iteminfo_rarity_hardmode_heuristic' };
  }

  return null;
}

function extractLeadText(wikitext) {
  const head = String(wikitext || '').split(/\n==[^=]/)[0] || '';
  const paragraphs = head
    .split(/\n\s*\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => !entry.startsWith('{{'))
    .filter((entry) => !entry.startsWith('#REDIRECT'))
    .filter((entry) => !entry.startsWith('[[Category:'));
  const firstParagraph = paragraphs[0] || '';
  return firstParagraph
    .replace(/\{\{[^{}]*\}\}/g, ' ')
    .replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2')
    .replace(/'''?/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeRarityId(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : 0;
}

function rarityCodeFromId(id) {
  const table = {
    [-13]: 'master',
    [-12]: 'expert',
    [-11]: 'quest',
    [-1]: 'gray',
    0: 'white',
    1: 'blue',
    2: 'green',
    3: 'orange',
    4: 'light_red',
    5: 'pink',
    6: 'light_purple',
    7: 'lime',
    8: 'yellow',
    9: 'cyan',
    10: 'red',
    11: 'purple',
  };
  return table[id] || 'white';
}

function loadRawPage(sourceFile, internalName) {
  const candidates = [];
  if (sourceFile) {
    const normalized = String(sourceFile).replace(/^terraPedia[\\/]/i, '');
    candidates.push(path.resolve(path.dirname(rawItemPagesDir), '..', normalized.replace(/^data[\\/]/i, '')));
    candidates.push(path.resolve(path.dirname(rawItemPagesDir), '..', '..', normalized));
  }
  const fallbackName = `${String(internalName || '').trim().toLowerCase()}.latest.json`;
  candidates.push(path.join(rawItemPagesDir, fallbackName));

  for (const filePath of candidates) {
    if (!filePath || !fs.existsSync(filePath)) continue;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return null;
    }
  }
  return null;
}

async function ensureLookupTables(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS item_rarity (
      id BIGINT NOT NULL,
      code VARCHAR(32) NOT NULL,
      display_name_zh VARCHAR(64) NOT NULL,
      display_name_en VARCHAR(64) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      status INT NOT NULL DEFAULT 1,
      deleted TINYINT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_item_rarity_code (code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS game_period (
      id BIGINT NOT NULL,
      code VARCHAR(32) NOT NULL,
      display_name_zh VARCHAR(64) NOT NULL,
      display_name_en VARCHAR(64) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      status INT NOT NULL DEFAULT 1,
      deleted TINYINT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_game_period_code (code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await conn.query(`
    INSERT INTO item_rarity (id, code, display_name_zh, display_name_en, sort_order, status, deleted)
    VALUES
      (-13, 'master', '大师', 'Master', 1, 1, 0),
      (-12, 'expert', '专家', 'Expert', 2, 1, 0),
      (-11, 'quest', '任务', 'Quest', 3, 1, 0),
      (-1, 'gray', '灰色', 'Gray', 4, 1, 0),
      (0, 'white', '白色', 'White', 5, 1, 0),
      (1, 'blue', '蓝色', 'Blue', 6, 1, 0),
      (2, 'green', '绿色', 'Green', 7, 1, 0),
      (3, 'orange', '橙色', 'Orange', 8, 1, 0),
      (4, 'light_red', '浅红色', 'Light Red', 9, 1, 0),
      (5, 'pink', '粉红色', 'Pink', 10, 1, 0),
      (6, 'light_purple', '浅紫色', 'Light Purple', 11, 1, 0),
      (7, 'lime', '黄绿色', 'Lime', 12, 1, 0),
      (8, 'yellow', '黄色', 'Yellow', 13, 1, 0),
      (9, 'cyan', '青色', 'Cyan', 14, 1, 0),
      (10, 'red', '红色', 'Red', 15, 1, 0),
      (11, 'purple', '紫色', 'Purple', 16, 1, 0)
    ON DUPLICATE KEY UPDATE
      code = VALUES(code),
      display_name_zh = VALUES(display_name_zh),
      display_name_en = VALUES(display_name_en),
      sort_order = VALUES(sort_order),
      status = VALUES(status),
      deleted = VALUES(deleted),
      updated_at = NOW()
  `);
  await conn.query(`
    INSERT INTO game_period (id, code, display_name_zh, display_name_en, sort_order, status, deleted)
    VALUES
      (1, 'pre_hardmode', '困难模式前', 'Pre-Hardmode', 1, 1, 0),
      (2, 'hardmode', '困难模式后', 'Hardmode', 2, 1, 0)
    ON DUPLICATE KEY UPDATE
      code = VALUES(code),
      display_name_zh = VALUES(display_name_zh),
      display_name_en = VALUES(display_name_en),
      sort_order = VALUES(sort_order),
      status = VALUES(status),
      deleted = VALUES(deleted),
      updated_at = NOW()
  `);
}

async function ensureItemColumnTypes(conn) {
  const [columns] = await conn.query(`
    SELECT COLUMN_NAME AS columnName, COLUMN_TYPE AS columnType
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'items'
      AND COLUMN_NAME IN ('rarity_id', 'game_period_id', 'game_model_id')
  `);

  const typeByName = new Map(columns.map((row) => [String(row.columnName), String(row.columnType).toLowerCase()]));
  const alters = [];
  if ((typeByName.get('rarity_id') || '').includes('unsigned')) {
    alters.push('MODIFY COLUMN rarity_id BIGINT NULL');
  }
  if ((typeByName.get('game_period_id') || '').includes('unsigned')) {
    alters.push('MODIFY COLUMN game_period_id BIGINT NULL');
  }
  if ((typeByName.get('game_model_id') || '').includes('unsigned')) {
    alters.push('MODIFY COLUMN game_model_id BIGINT NULL');
  }

  if (alters.length > 0) {
    await conn.query(`ALTER TABLE items ${alters.join(', ')}`);
  }
}

async function loadIteminfoModuleData() {
  const helperPath = pathToFileURL(path.join(repoRoot, 'scripts', 'data', 'lib', 'wiki-item-utils.mjs')).href;
  const helper = await import(helperPath);
  const rawPathCandidates = [
    path.join(repoRoot, 'data', 'raw', 'wiki', 'module__iteminfo__data.latest.json'),
    path.resolve(repoRoot, '..', 'data', 'terraPedia', 'raw', 'wiki', 'module__iteminfo__data.latest.json'),
  ];
  const rawPath = rawPathCandidates.find((candidate) => fs.existsSync(candidate));
  if (!rawPath) {
    throw new Error(`module__iteminfo__data.latest.json not found. Tried: ${rawPathCandidates.join(', ')}`);
  }
  const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
  return helper.parseIteminfoModulePayload(raw.moduleContent);
}

function readRecords(filePath) {
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(payload.records) ? payload.records : [];
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

function toKey(value) {
  return String(value || '').trim().toLowerCase();
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

function assertPrimaryDb(database, apply, allowNonPrimaryDb) {
  if (!apply) return;
  if (String(database || '').trim() === 'terria_v1_local') return;
  if (allowNonPrimaryDb) return;
  throw new Error(`Refusing to write to non-primary database '${database}'. Set TERRAPEDIA_DB_NAME=terria_v1_local or pass --allow-non-primary-db=true explicitly.`);
}
