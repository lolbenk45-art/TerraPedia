#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { getProjectRoot } from '../lib/project-root.mjs';

const require = createRequire(import.meta.url);
const repoRoot = getProjectRoot();
const DEFAULT_INPUT_JSON = '/home/lolben/data/terraPedia/generated/wiki-audio-assets.latest.json';
const PRIMARY_DB = 'terria_v1_local';
let mysqlModule = null;

export function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const eq = body.indexOf('=');
    if (eq >= 0) {
      args[body.slice(0, eq)] = body.slice(eq + 1);
    } else {
      args[body] = 'true';
    }
  }
  return args;
}

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function formatDateTag(value) {
  const date = value instanceof Date ? value : new Date(value);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

export function resolveImportOptions(rawArgs = {}, options = {}) {
  const env = options.env ?? process.env;
  const root = path.resolve(options.repoRoot ?? repoRoot);
  const now = options.now instanceof Date ? options.now : new Date();
  const apply = booleanOption(rawArgs.apply, false);
  const dateTag = formatDateTag(now);
  return {
    apply,
    allowNonPrimaryDb: booleanOption(rawArgs['allow-non-primary-db'] ?? rawArgs.allowNonPrimaryDb, false),
    inputJsonPath: path.resolve(rawArgs['input-json'] ?? rawArgs.inputJson ?? DEFAULT_INPUT_JSON),
    reportPath: rawArgs['report-json'] === 'false'
      ? null
      : path.resolve(root, rawArgs['report-json'] ?? path.join('reports', `audio-db-import-${apply ? 'apply' : 'dry-run'}-${dateTag}.json`)),
    db: {
      host: rawArgs.host ?? env.TERRAPEDIA_DB_HOST ?? '127.0.0.1',
      port: Number(rawArgs.port ?? env.TERRAPEDIA_DB_PORT ?? 3306),
      user: rawArgs.user ?? env.TERRAPEDIA_DB_USERNAME ?? 'root',
      password: rawArgs.password ?? env.TERRAPEDIA_DB_PASSWORD ?? 'root',
      database: rawArgs.database ?? env.TERRAPEDIA_DB_NAME ?? PRIMARY_DB
    }
  };
}

export function assertPrimaryDb(database, shouldApply, allowNonPrimaryDb) {
  if (!shouldApply || allowNonPrimaryDb || database === PRIMARY_DB) return;
  throw new Error(`Refusing to write to non-primary database '${database}'. Set TERRAPEDIA_DB_NAME=terria_v1_local or pass --allow-non-primary-db=true explicitly.`);
}

export function validateAudioMetadata(metadata) {
  if (!Array.isArray(metadata?.assets)) {
    throw new Error('audio metadata must contain an assets array');
  }
  const seen = new Set();
  const failures = [];
  for (const asset of metadata.assets) {
    const assetId = String(asset?.assetId ?? '').trim();
    const assetFailures = [];
    if (!assetId) assetFailures.push('missing assetId');
    if (assetId && seen.has(assetId)) assetFailures.push(`duplicate assetId ${assetId}`);
    if (assetId) seen.add(assetId);
    if (!asset?.sha256) assetFailures.push('missing sha256');
    if (!asset?.absoluteLocalPath || !fs.existsSync(asset.absoluteLocalPath)) {
      assetFailures.push('local file missing');
    } else {
      const actualSize = fs.statSync(asset.absoluteLocalPath).size;
      if (actualSize !== Number(asset.size ?? 0)) {
        assetFailures.push(`size mismatch expected=${asset.size} actual=${actualSize}`);
      }
    }
    for (const reason of assetFailures) {
      failures.push({ assetId: assetId || null, reason });
    }
  }
  const invalidIds = new Set(failures.map((failure) => failure.assetId));
  return {
    summary: {
      total: metadata.assets.length,
      valid: metadata.assets.filter((asset) => !invalidIds.has(String(asset?.assetId ?? '').trim())).length,
      invalid: metadata.assets.filter((asset) => invalidIds.has(String(asset?.assetId ?? '').trim())).length
    },
    failures
  };
}

export function buildAudioAssetRows(assets = [], options = {}) {
  const verifiedAt = toMysqlDateTime(options.verifiedAt ?? new Date());
  return assets.map((asset) => ({
    assetId: String(asset.assetId),
    shard: String(asset.shard ?? asset.scope ?? ''),
    kind: String(asset.kind ?? ''),
    sourceKey: nullable(asset.sourceKey),
    fileTitle: nullable(asset.fileTitle),
    wikiFileUrl: nullable(asset.wikiFileUrl),
    sourceUrl: nullable(asset.sourceUrl),
    localPath: nullable(asset.localPath),
    absoluteLocalPath: nullable(asset.absoluteLocalPath),
    mime: nullable(asset.mime),
    sizeBytes: Number(asset.size ?? 0),
    sha256: nullable(asset.sha256),
    provider: 'wiki_gg',
    status: 'active',
    lastVerifiedAt: verifiedAt,
    crawlReportPath: nullable(options.reportPath),
    rawJson: JSON.stringify(asset)
  }));
}

export function buildAudioLinkRows(assets = [], itemRows = []) {
  return assets.map((asset, index) => {
    const shard = String(asset.shard ?? asset.scope ?? '');
    const sourceKey = String(asset.sourceKey ?? '');
    if (shard === 'items') {
      return buildItemLink(asset, itemRows, index);
    }
    if (shard === 'npc_hit') {
      return baseLink(asset, 'npc_sound_family', null, sourceKey, 'npc_hit_sound', 'unmatched', 'npc sound family mapping not available', index);
    }
    if (shard === 'npc_death') {
      return baseLink(asset, 'npc_sound_family', null, sourceKey, 'npc_death_sound', 'unmatched', 'npc sound family mapping not available', index);
    }
    return baseLink(asset, 'bgm_track', null, sourceKey, 'bgm_track', 'unmatched', 'bgm ownership mapping not available', index);
  });
}

function buildItemLink(asset, itemRows, index) {
  const sourceKey = String(asset.sourceKey ?? '');
  const sourceId = extractItemSourceId(sourceKey);
  const matches = itemRows.filter((row) => {
    if (sourceId != null && Number(row.source_id) === sourceId) return true;
    return normalize(row.internal_name) === normalize(sourceKey);
  });
  if (matches.length === 1) {
    return baseLink(asset, 'item', Number(matches[0].id), sourceKey, 'item_use_sound', 'matched', `matched items.source_id from ${sourceKey}`, index);
  }
  if (matches.length > 1) {
    return baseLink(asset, 'item', null, sourceKey, 'item_use_sound', 'ambiguous', `ambiguous item match from ${sourceKey}`, index);
  }
  return baseLink(asset, 'item', null, sourceKey, 'item_use_sound', 'unmatched', `no item match from ${sourceKey}`, index);
}

function baseLink(asset, entityType, entityId, sourceKey, relationType, matchStatus, matchReason, sortOrder) {
  return {
    assetId: String(asset.assetId),
    entityType,
    entityId,
    sourceKey,
    relationType,
    matchStatus,
    matchReason,
    sortOrder
  };
}

function extractItemSourceId(sourceKey) {
  const match = /^Item[_-](\d+)$/i.exec(String(sourceKey ?? ''));
  return match ? Number(match[1]) : null;
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

function nullable(value) {
  if (value == null) return null;
  const text = String(value);
  return text.length ? text : null;
}

function toMysqlDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

function loadMysqlModule() {
  if (mysqlModule) return mysqlModule;
  try {
    mysqlModule = require('mysql2/promise');
  } catch (error) {
    if (error?.code !== 'MODULE_NOT_FOUND') throw error;
    mysqlModule = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'))('mysql2/promise');
  }
  return mysqlModule;
}

async function writeReport(reportPath, report) {
  if (!reportPath) return;
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
}

async function loadItemRows(connection) {
  try {
    const [rows] = await connection.execute('SELECT id, source_id, internal_name FROM items WHERE deleted = 0');
    return rows;
  } catch (error) {
    if (error?.code !== 'ER_BAD_FIELD_ERROR' && !/Unknown column 'source_id'/i.test(String(error?.message ?? ''))) {
      throw error;
    }
    const [rows] = await connection.execute('SELECT id, internal_name FROM items WHERE deleted = 0');
    return rows.map((row) => ({ ...row, source_id: null }));
  }
}

async function loadExistingAssetIds(connection, assetIds) {
  if (!assetIds.length) return new Set();
  const placeholders = assetIds.map(() => '?').join(', ');
  const [rows] = await connection.execute(`SELECT id FROM audio_assets WHERE asset_id IN (${placeholders})`, assetIds);
  return new Set(rows.map((row) => String(row.id)));
}

async function upsertAsset(connection, row) {
  const [existing] = await connection.execute('SELECT id FROM audio_assets WHERE asset_id = ?', [row.assetId]);
  await connection.execute(
    `INSERT INTO audio_assets (
      asset_id, shard, kind, source_key, file_title, wiki_file_url, source_url,
      local_path, absolute_local_path, mime, size_bytes, sha256, provider, status,
      last_verified_at, crawl_report_path, raw_json, deleted
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    ON DUPLICATE KEY UPDATE
      shard = VALUES(shard),
      kind = VALUES(kind),
      source_key = VALUES(source_key),
      file_title = VALUES(file_title),
      wiki_file_url = VALUES(wiki_file_url),
      source_url = VALUES(source_url),
      local_path = VALUES(local_path),
      absolute_local_path = VALUES(absolute_local_path),
      mime = VALUES(mime),
      size_bytes = VALUES(size_bytes),
      sha256 = VALUES(sha256),
      provider = VALUES(provider),
      status = VALUES(status),
      last_verified_at = VALUES(last_verified_at),
      crawl_report_path = VALUES(crawl_report_path),
      raw_json = VALUES(raw_json),
      deleted = 0`,
    [
      row.assetId, row.shard, row.kind, row.sourceKey, row.fileTitle, row.wikiFileUrl,
      row.sourceUrl, row.localPath, row.absoluteLocalPath, row.mime, row.sizeBytes,
      row.sha256, row.provider, row.status, row.lastVerifiedAt, row.crawlReportPath, row.rawJson
    ]
  );
  return existing.length > 0 ? 'updated' : 'inserted';
}

async function upsertLink(connection, row, assetDbId) {
  const [existing] = await connection.execute(
    `SELECT id FROM audio_asset_links
     WHERE audio_asset_id = ? AND entity_type = ? AND source_key <=> ? AND relation_type = ?`,
    [assetDbId, row.entityType, row.sourceKey, row.relationType]
  );
  await connection.execute(
    `INSERT INTO audio_asset_links (
      audio_asset_id, entity_type, entity_id, source_key, relation_type,
      match_status, match_reason, sort_order, deleted
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    ON DUPLICATE KEY UPDATE
      entity_id = VALUES(entity_id),
      match_status = VALUES(match_status),
      match_reason = VALUES(match_reason),
      sort_order = VALUES(sort_order),
      deleted = 0`,
    [assetDbId, row.entityType, row.entityId, row.sourceKey, row.relationType, row.matchStatus, row.matchReason, row.sortOrder]
  );
  return existing.length > 0 ? 'updated' : 'inserted';
}

export async function runAudioAssetImport(options = {}, dependencies = {}) {
  const metadata = JSON.parse(fs.readFileSync(options.inputJsonPath, 'utf8'));
  const validation = validateAudioMetadata(metadata);
  const assets = metadata.assets ?? [];
  const assetRows = buildAudioAssetRows(assets, { reportPath: options.reportPath });
  let itemRows = dependencies.itemRows ?? [];
  let linkRows = buildAudioLinkRows(assets, itemRows);
  const report = {
    mode: options.apply ? 'apply' : 'dry-run',
    inputJson: options.inputJsonPath,
    database: options.db?.database ?? PRIMARY_DB,
    generatedAt: new Date().toISOString(),
    summary: {
      ...validation.summary,
      wouldInsertAssets: options.apply ? 0 : assetRows.length,
      wouldUpdateAssets: 0,
      wouldInsertLinks: options.apply ? 0 : linkRows.length,
      wouldUpdateLinks: 0,
      insertedAssets: 0,
      updatedAssets: 0,
      insertedLinks: 0,
      updatedLinks: 0,
      matched: linkRows.filter((row) => row.matchStatus === 'matched').length,
      unmatched: linkRows.filter((row) => row.matchStatus === 'unmatched').length,
      ambiguous: linkRows.filter((row) => row.matchStatus === 'ambiguous').length,
      applied: Boolean(options.apply)
    },
    failures: validation.failures,
    samples: assetRows.slice(0, 8)
  };
  if (validation.failures.length > 0) {
    await writeReport(options.reportPath, report);
    return report;
  }
  if (options.apply) {
    const mysql = dependencies.mysqlModule ?? loadMysqlModule();
    const connection = await mysql.createConnection(options.db);
    try {
      if (typeof connection.beginTransaction === 'function') await connection.beginTransaction();
      itemRows = dependencies.itemRows ?? await loadItemRows(connection);
      linkRows = buildAudioLinkRows(assets, itemRows);
      for (const row of assetRows) {
        const result = await upsertAsset(connection, row);
        report.summary[result === 'inserted' ? 'insertedAssets' : 'updatedAssets'] += 1;
      }
      const [assetIdRows] = await connection.execute(
        `SELECT id, asset_id FROM audio_assets WHERE asset_id IN (${assetRows.map(() => '?').join(', ')})`,
        assetRows.map((row) => row.assetId)
      );
      const dbIdByAssetId = new Map(assetIdRows.map((row) => [String(row.asset_id), Number(row.id)]));
      for (const row of linkRows) {
        const assetDbId = dbIdByAssetId.get(row.assetId);
        if (!assetDbId) continue;
        const result = await upsertLink(connection, row, assetDbId);
        report.summary[result === 'inserted' ? 'insertedLinks' : 'updatedLinks'] += 1;
      }
      report.summary.matched = linkRows.filter((row) => row.matchStatus === 'matched').length;
      report.summary.unmatched = linkRows.filter((row) => row.matchStatus === 'unmatched').length;
      report.summary.ambiguous = linkRows.filter((row) => row.matchStatus === 'ambiguous').length;
      if (typeof connection.commit === 'function') await connection.commit();
    } catch (error) {
      if (typeof connection.rollback === 'function') await connection.rollback();
      throw error;
    } finally {
      if (typeof connection.end === 'function') await connection.end();
    }
  }
  await writeReport(options.reportPath, report);
  return report;
}

async function main() {
  const options = resolveImportOptions(parseArgs(process.argv.slice(2)));
  assertPrimaryDb(options.db.database, options.apply, options.allowNonPrimaryDb);
  const report = await runAudioAssetImport(options);
  console.log(JSON.stringify(report, null, 2));
  if (report.failures.length > 0) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
