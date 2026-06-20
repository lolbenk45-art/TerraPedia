#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { getProjectRoot } from '../lib/project-root.mjs';
import { parseCliArgs, sharedDataPath } from '../lib/wiki-item-utils.mjs';
import { rowsEqual } from '../lib/base-domain-row-reconcile.mjs';

const __filename = fileURLToPath(import.meta.url);
const moduleRequire = createRequire(import.meta.url);
const repoRoot = getProjectRoot();

export function buildWorldContextImportPlan({
  worldContexts = [],
  sourceFiles = {}
} = {}) {
  const records = Array.isArray(worldContexts) ? worldContexts : [];
  return {
    generatedAt: new Date().toISOString(),
    sourceFiles,
    worldContexts: records,
    summary: {
      worldContexts: makeStatsSection(records.length)
    }
  };
}

export async function importWorldContextDataset(conn, plan, { apply = false } = {}) {
  const summary = {
    worldContexts: makeStatsSection(Array.isArray(plan?.worldContexts) ? plan.worldContexts.length : 0)
  };
  const existingByCode = await loadWorldContextCodeMap(conn);
  for (let index = 0; index < (plan?.worldContexts ?? []).length; index += 1) {
    const record = normalizeWorldContextRecord(plan.worldContexts[index], index);
    if (!record) {
      summary.worldContexts.skipped += 1;
      pushError(summary.worldContexts, `worldContexts[${index}] skipped: missing code, nameEn, or contextType`);
      continue;
    }
    const existing = existingByCode.get(record.code);
    if (existing) {
      if (worldContextRowsEqual(existing, record)) {
        summary.worldContexts.skipped += 1;
        continue;
      }
      summary.worldContexts.updated += 1;
    } else {
      summary.worldContexts.created += 1;
    }
    if (apply) {
      await upsertWorldContext(conn, record);
    }
  }
  return summary;
}

export function assertPrimaryDb(database, allowNonPrimaryDb) {
  if (String(database || '').trim() === 'terria_v1_local') return;
  if (allowNonPrimaryDb) return;
  throw new Error(`Refusing to write to non-primary database '${database}'. Set TERRAPEDIA_DB_NAME=terria_v1_local or pass --allow-non-primary-db=true explicitly.`);
}

async function loadWorldContextCodeMap(conn) {
  const [rows] = await conn.query(`
    SELECT
      id,
      code,
      name_en,
      name_zh,
      context_type,
      description,
      icon_url,
      source_provider,
      source_page,
      source_revision_timestamp,
      last_synced_at,
      raw_json,
      sort_order,
      status,
      deleted
    FROM world_contexts
    WHERE deleted = 0
  `);
  return new Map(
    (Array.isArray(rows) ? rows : [])
      .map(row => [normalizeCode(row?.code), row])
      .filter(([code]) => code)
  );
}

function worldContextRowsEqual(existing, record) {
  return rowsEqual(worldContextDbSnapshot(existing), worldContextDbSnapshot(record), {
    columns: [
      'code',
      'name_en',
      'name_zh',
      'context_type',
      'description',
      'icon_url',
      'source_provider',
      'source_page',
      'source_revision_timestamp',
      'last_synced_at',
      'raw_json',
      'sort_order',
      'status',
      'deleted',
    ],
    jsonColumns: ['raw_json'],
    numericColumns: ['sort_order', 'status', 'deleted'],
  });
}

function worldContextDbSnapshot(row = {}) {
  return {
    code: row.code,
    name_en: row.name_en ?? row.nameEn,
    name_zh: row.name_zh ?? row.nameZh,
    context_type: row.context_type ?? row.contextType,
    description: row.description,
    icon_url: row.icon_url ?? row.iconUrl,
    source_provider: row.source_provider ?? row.sourceProvider,
    source_page: row.source_page ?? row.sourcePage,
    source_revision_timestamp: normalizeDbDateTime(row.source_revision_timestamp ?? row.sourceRevisionTimestamp),
    last_synced_at: normalizeDbDateTime(row.last_synced_at ?? row.lastSyncedAt),
    raw_json: row.raw_json ?? row.rawJson,
    sort_order: row.sort_order ?? row.sortOrder,
    status: row.status,
    deleted: row.deleted ?? 0,
  };
}

function normalizeDbDateTime(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return toDateTime(value.toISOString());
  const text = String(value).trim();
  if (!text) return null;
  const parsed = toDateTime(text);
  return parsed ?? text.replace('T', ' ').replace(/Z$/, '').slice(0, 19);
}

async function upsertWorldContext(conn, record) {
  await conn.execute(
    `INSERT INTO world_contexts
      (code, name_en, name_zh, context_type, description, icon_url, source_provider, source_page, source_revision_timestamp, last_synced_at, raw_json, sort_order, status, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON DUPLICATE KEY UPDATE
       name_en = VALUES(name_en),
       name_zh = VALUES(name_zh),
       context_type = VALUES(context_type),
       description = VALUES(description),
       icon_url = VALUES(icon_url),
       source_provider = VALUES(source_provider),
       source_page = VALUES(source_page),
       source_revision_timestamp = VALUES(source_revision_timestamp),
       last_synced_at = VALUES(last_synced_at),
       raw_json = VALUES(raw_json),
       sort_order = VALUES(sort_order),
       status = VALUES(status),
       deleted = 0,
       updated_at = NOW()`,
    [
      record.code,
      record.nameEn,
      record.nameZh,
      record.contextType,
      record.description,
      record.iconUrl,
      record.sourceProvider,
      record.sourcePage,
      record.sourceRevisionTimestamp,
      record.lastSyncedAt,
      record.rawJson,
      record.sortOrder,
      record.status
    ]
  );
}

function normalizeWorldContextRecord(raw, index) {
  const code = normalizeCode(raw?.code);
  const nameEn = toNullableString(raw?.nameEn);
  const contextType = normalizeCode(raw?.contextType);
  if (!code || !nameEn || !contextType) {
    return null;
  }
  return {
    code,
    nameEn,
    nameZh: toNullableString(raw?.nameZh),
    contextType,
    description: toNullableString(raw?.description),
    iconUrl: toNullableString(raw?.iconUrl),
    sourceProvider: toNullableString(raw?.sourceProvider) ?? 'wiki_gg',
    sourcePage: toNullableString(raw?.sourcePage),
    sourceRevisionTimestamp: toDateTime(raw?.sourceRevisionTimestamp),
    lastSyncedAt: toDateTime(raw?.lastSyncedAt) ?? toDateTime(new Date().toISOString()),
    rawJson: toNullableString(raw?.rawJson),
    sortOrder: toNullableInteger(raw?.sortOrder) ?? ((index + 1) * 10),
    status: toNullableInteger(raw?.status) ?? 1
  };
}

function makeStatsSection(input = 0) {
  return { input, created: 0, updated: 0, skipped: 0, errors: [] };
}

function pushError(sectionStats, message) {
  sectionStats.errors.push(message);
}

function toNullableString(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function toNullableInteger(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.trunc(num);
}

function toDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function normalizeCode(value) {
  const text = toNullableString(value);
  return text ? text.toUpperCase() : null;
}

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function extractDatabaseNameFromJdbcUrl(jdbcUrl) {
  if (!jdbcUrl) return null;
  const match = String(jdbcUrl).match(/jdbc:mysql:\/\/[^/]+\/([^?]+)/i);
  return match?.[1] ?? null;
}

function loadMysqlModule() {
  try {
    return createRequire(path.join(repoRoot, 'data-query-app', 'package.json'))('mysql2/promise');
  } catch (firstError) {
    try {
      return moduleRequire('mysql2/promise');
    } catch {
      throw firstError;
    }
  }
}

async function main(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);
  const apply = booleanOption(args.apply, false);
  const dateTag = new Date().toISOString().slice(0, 10);
  const inputPath = path.resolve(
    process.cwd(),
    args.input ?? args['input-json'] ?? sharedDataPath('generated', 'wiki-world-contexts.importable.latest.json')
  );
  const reportPath = path.resolve(
    process.cwd(),
    args['report-json'] ?? path.join(repoRoot, 'reports', `wiki-world-contexts-import-${dateTag}.json`)
  );
  const jdbcUrl = args['db-url'] ?? process.env.TERRAPEDIA_DB_URL ?? '';
  const database = args.database
    ?? process.env.TERRAPEDIA_DB_NAME
    ?? extractDatabaseNameFromJdbcUrl(jdbcUrl)
    ?? 'terria_v1_local';
  const allowNonPrimaryDb = booleanOption(
    args['allow-non-primary-db'] ?? args.allowNonPrimaryDb ?? process.env.TERRAPEDIA_ALLOW_NON_PRIMARY_DB,
    false
  );

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }
  if (apply) {
    assertPrimaryDb(database, allowNonPrimaryDb);
  }

  const dataset = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const plan = buildWorldContextImportPlan({
    worldContexts: dataset.worldContexts,
    sourceFiles: {
      wikiWorldContextsFile: inputPath
    }
  });

  let summary = plan.summary;
  if (apply || booleanOption(args['dry-run'], true)) {
    const mysql = loadMysqlModule();
    const conn = await mysql.createConnection({
      host: args.host ?? process.env.TERRAPEDIA_DB_HOST ?? '127.0.0.1',
      port: Number(args.port ?? process.env.TERRAPEDIA_DB_PORT ?? 3306),
      user: args.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? 'root',
      password: args.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? 'root',
      database,
      multipleStatements: false
    });
    try {
      await conn.query('SET NAMES utf8mb4');
      if (apply) {
        await conn.beginTransaction();
      }
      summary = await importWorldContextDataset(conn, plan, { apply });
      if (apply) {
        await conn.commit();
      }
    } catch (error) {
      if (apply) {
        await conn.rollback();
      }
      throw error;
    } finally {
      await conn.end();
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    apply,
    database,
    reportPath,
    sourceFiles: plan.sourceFiles,
    summary
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch(error => {
    console.error('[import-world-contexts-to-db] failed');
    console.error(error?.stack || error?.message || error);
    process.exit(1);
  });
}
