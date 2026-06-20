#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { getProjectRoot } from '../lib/project-root.mjs';

const require = createRequire(import.meta.url);
const repoRoot = getProjectRoot();
const DEFAULT_INPUT_JSON = '/home/lolben/data/terraPedia/generated/wiki-audio-assets.latest.json';
const PRIMARY_DB = 'terria_v1_local';
const LOCAL_ITEM_STANDARDIZED_PATH = path.join(repoRoot, 'data', 'standardized', 'items.standardized.json');
const LOCAL_ITEM_ZH_MAP_PATH = path.join(repoRoot, 'data', 'generated', 'item-zh-map.json');
const LOCAL_NPC_STANDARDIZED_PATH = path.join(repoRoot, 'data', 'standardized', 'npcs.standardized.json');
const LOCAL_NPC_ZH_MAP_PATH = path.join(repoRoot, 'data', 'generated', 'npc-zh-map.json');
const LOCAL_BGM_DISPLAY_NAMES_PATH = path.join(repoRoot, 'data', 'generated', 'audio-bgm-display-names.latest.json');
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
  const itemLookup = buildItemLookup(options.itemRows ?? []);
  const npcSoundLookup = buildNpcSoundLookup(options.npcRows ?? []);
  const bgmDisplayNameLookup = buildBgmDisplayNameLookup(options.bgmDisplayNameRows ?? []);
  return assets.map((asset) => ({
    assetId: String(asset.assetId),
    shard: String(asset.shard ?? asset.scope ?? ''),
    kind: String(asset.kind ?? ''),
    sourceKey: nullable(asset.sourceKey),
    displayNameZh: nullable(asset.displayNameZh ?? resolveDisplayName(asset, { itemLookup, npcSoundLookup, bgmDisplayNameLookup }, 'zh')),
    displayNameEn: nullable(asset.displayNameEn ?? resolveDisplayName(asset, { itemLookup, npcSoundLookup, bgmDisplayNameLookup }, 'en')),
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

function buildItemLookup(itemRows = []) {
  const bySourceId = new Map();
  const byInternal = new Map();
  for (const row of itemRows) {
    const sourceId = row?.source_id ?? row?.sourceId ?? row?.game_id ?? row?.id;
    if (sourceId != null) bySourceId.set(Number(sourceId), row);
    const internalName = normalize(row?.internal_name ?? row?.internalName);
    if (internalName) byInternal.set(internalName, row);
  }
  return { bySourceId, byInternal };
}

function resolveItemDisplayName(asset, itemLookup, locale) {
  const shard = String(asset.shard ?? asset.scope ?? '');
  if (shard !== 'items') return null;
  const sourceKey = String(asset.sourceKey ?? '');
  const sourceId = extractItemSourceId(sourceKey);
  const row = (sourceId != null ? itemLookup.bySourceId.get(sourceId) : null)
    ?? itemLookup.byInternal.get(normalize(sourceKey));
  if (!row) return null;
  return locale === 'zh'
    ? nullable(row.name_zh ?? row.nameZh)
    : nullable(row.name ?? row.name_en ?? row.nameEn ?? row.internal_name ?? row.internalName);
}

function resolveDisplayName(asset, lookups, locale) {
  return resolveBgmDisplayName(asset, lookups.bgmDisplayNameLookup, locale)
    ?? resolveItemDisplayName(asset, lookups.itemLookup, locale)
    ?? resolveNpcSoundFamilyDisplayName(asset, lookups.npcSoundLookup, locale);
}

function buildBgmDisplayNameLookup(rows = []) {
  const bySourceKey = new Map();
  for (const row of rows) {
    const sourceKey = normalizeMusicSourceKey(row?.sourceKey ?? row?.source_key);
    if (!sourceKey) continue;
    bySourceKey.set(sourceKey, row);
  }
  return bySourceKey;
}

function resolveBgmDisplayName(asset, bgmDisplayNameLookup, locale) {
  const shard = String(asset.shard ?? asset.scope ?? '');
  if (shard !== 'bgm') return null;
  const sourceKey = normalizeMusicSourceKey(asset.sourceKey);
  const row = bgmDisplayNameLookup.get(sourceKey);
  if (!row) return null;
  return locale === 'zh'
    ? nullable(row.displayNameZh ?? row.display_name_zh)
    : nullable(row.displayNameEn ?? row.display_name_en);
}

function buildNpcSoundLookup(npcRows = []) {
  const bySoundKey = new Map();
  for (const row of npcRows) {
    const extras = npcExtras(row);
    for (const key of soundKeys(extras.HitSound ?? extras.hitSound)) {
      appendNpcSoundOwner(bySoundKey, key, row);
    }
    for (const key of soundKeys(extras.DeathSound ?? extras.deathSound ?? extras.KilledSound ?? extras.killedSound)) {
      appendNpcSoundOwner(bySoundKey, key, row);
    }
  }
  return bySoundKey;
}

function appendNpcSoundOwner(lookup, soundKey, row) {
  if (!soundKey) return;
  const owners = lookup.get(soundKey) ?? [];
  owners.push({
    nameZh: nullable(row.name_zh ?? row.nameZh),
    nameEn: nullable(row.name ?? row.name_en ?? row.nameEn ?? row.internal_name ?? row.internalName)
  });
  lookup.set(soundKey, owners);
}

function resolveNpcSoundFamilyDisplayName(asset, npcSoundLookup, locale) {
  const shard = String(asset.shard ?? asset.scope ?? '');
  if (shard !== 'npc_hit' && shard !== 'npc_death') return null;
  const sourceKey = String(asset.sourceKey ?? '');
  const owners = npcSoundLookup.get(sourceKey) ?? [];
  if (!owners.length) return null;
  const names = uniqueNonEmpty(owners.map((owner) => locale === 'zh' ? owner.nameZh : owner.nameEn));
  if (!names.length) return null;
  const sample = names.slice(0, 3).join(locale === 'zh' ? '、' : ', ');
  const suffix = owners.length === 1 ? '1 NPC' : `${owners.length} NPC`;
  return locale === 'zh'
    ? `音效族：${sample} (${suffix})`
    : `Sound family: ${sample} (${suffix})`;
}

function npcExtras(row) {
  if (row?.extras && typeof row.extras === 'object') return row.extras;
  const raw = row?.raw_json ?? row?.rawJson;
  if (!raw) return {};
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed?.extras && typeof parsed.extras === 'object' ? parsed.extras : {};
  } catch {
    return {};
  }
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadLocalItemRows(options = {}) {
  const standardizedPath = options.standardizedPath ?? LOCAL_ITEM_STANDARDIZED_PATH;
  const zhMapPath = options.zhMapPath ?? LOCAL_ITEM_ZH_MAP_PATH;
  const standardized = readJsonIfExists(standardizedPath);
  const zhMap = readJsonIfExists(zhMapPath)?.records ?? {};
  const records = Array.isArray(standardized?.records) ? standardized.records : [];
  return records.map((record) => {
    const internalName = nullable(record.internalName ?? record.internal_name);
    const zhMeta = internalName ? zhMap[internalName] : null;
    return {
      id: record.id,
      source_id: record.id,
      internal_name: internalName,
      name: nullable(record.name),
      name_zh: nullable(record.name_zh ?? record.nameZh ?? zhMeta?.nameZh)
    };
  });
}

function loadLocalNpcRows(options = {}) {
  const standardizedPath = options.standardizedPath ?? LOCAL_NPC_STANDARDIZED_PATH;
  const zhMapPath = options.zhMapPath ?? LOCAL_NPC_ZH_MAP_PATH;
  const standardized = readJsonIfExists(standardizedPath);
  const zhMap = readJsonIfExists(zhMapPath)?.records ?? {};
  const records = Array.isArray(standardized?.records) ? standardized.records : [];
  return records.map((record) => {
    const internalName = nullable(record.internalName ?? record.internal_name);
    const zhMeta = internalName ? zhMap[internalName] : null;
    return {
      id: record.id,
      source_id: record.id,
      internal_name: internalName,
      name: nullable(record.name),
      name_zh: nullable(record.name_zh ?? record.nameZh ?? zhMeta?.nameZh),
      extras: record.extras ?? {},
      raw_json: JSON.stringify(record)
    };
  });
}

function loadLocalBgmDisplayNameRows(options = {}) {
  const displayNamePath = options.displayNamePath ?? LOCAL_BGM_DISPLAY_NAMES_PATH;
  const payload = readJsonIfExists(displayNamePath);
  const displayNames = payload?.displayNames;
  if (!displayNames || typeof displayNames !== 'object') return [];
  return Object.entries(displayNames).map(([sourceKey, row]) => ({
    sourceKey: row?.sourceKey ?? sourceKey,
    displayNameZh: row?.displayNameZh ?? row?.display_name_zh,
    displayNameEn: row?.displayNameEn ?? row?.display_name_en
  }));
}

function mergeRowsByIdentity(primaryRows = [], fallbackRows = []) {
  const result = [];
  const bySourceId = new Map();
  const byInternalName = new Map();
  for (const row of [...primaryRows, ...fallbackRows]) {
    const sourceId = row?.source_id ?? row?.sourceId ?? row?.game_id ?? row?.id;
    const internalName = normalize(row?.internal_name ?? row?.internalName);
    const sourceKey = sourceId == null ? null : String(sourceId);
    const existing = (sourceKey ? bySourceId.get(sourceKey) : null)
      ?? (internalName ? byInternalName.get(internalName) : null);
    if (existing) {
      mergeRowFields(existing, row);
      const mergedSourceId = existing.source_id ?? existing.sourceId ?? existing.game_id ?? existing.id;
      const mergedInternalName = normalize(existing.internal_name ?? existing.internalName);
      if (mergedSourceId != null) bySourceId.set(String(mergedSourceId), existing);
      if (mergedInternalName) byInternalName.set(mergedInternalName, existing);
      continue;
    }
    const copy = { ...row };
    result.push(copy);
    if (sourceKey) bySourceId.set(sourceKey, copy);
    if (internalName) byInternalName.set(internalName, copy);
  }
  return result;
}

function mergeRowFields(target, source) {
  for (const [key, value] of Object.entries(source ?? {})) {
    if (key === 'id' && target.id != null) continue;
    if (target[key] == null || target[key] === '') {
      target[key] = value;
    }
  }
}

function soundKeys(value) {
  if (value == null) return [];
  return String(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function uniqueNonEmpty(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const text = nullable(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeMusicSourceKey(value) {
  const text = String(value ?? '')
    .trim()
    .replace(/^File:/, '')
    .replace(/\.[^.]+$/, '')
    .replace(/\s+/g, '_')
    .replace(/^Music_/, 'Music-')
    .replace(/^Music\s+/, 'Music-');
  return text || null;
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

function firstResult(result) {
  return Array.isArray(result?.[0]) ? result[0] : result;
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
    const rows = firstResult(await connection.execute('SELECT id, source_id, internal_name, name, name_zh FROM items WHERE deleted = 0'));
    return rows;
  } catch (error) {
    if (error?.code !== 'ER_BAD_FIELD_ERROR' && !/Unknown column 'source_id'/i.test(String(error?.message ?? ''))) {
      throw error;
    }
    const rows = firstResult(await connection.execute('SELECT id, internal_name, name, name_zh FROM items WHERE deleted = 0'));
    return rows.map((row) => ({ ...row, source_id: null }));
  }
}

async function loadNpcRows(connection) {
  const rows = firstResult(await connection.execute('SELECT id, internal_name, name, name_zh, raw_json FROM npcs WHERE deleted = 0'));
  return rows;
}

async function loadExistingAssetIds(connection, assetIds) {
  if (!assetIds.length) return new Set();
  const placeholders = assetIds.map(() => '?').join(', ');
  const [rows] = await connection.execute(`SELECT id FROM audio_assets WHERE asset_id IN (${placeholders})`, assetIds);
  return new Set(rows.map((row) => String(row.id)));
}

async function upsertAsset(connection, row) {
  const [existing] = await connection.execute(
    `SELECT id, asset_id, shard, kind, source_key, display_name_zh, display_name_en,
            file_title, wiki_file_url, source_url, local_path, absolute_local_path, mime,
            size_bytes, sha256, provider, status, crawl_report_path, raw_json, deleted
       FROM audio_assets
      WHERE asset_id = ?`,
    [row.assetId]
  );
  if (existing.length > 0 && audioAssetRowsEqual(existing[0], row)) {
    return 'skipped';
  }
  await connection.execute(
    `INSERT INTO audio_assets (
      asset_id, shard, kind, source_key, display_name_zh, display_name_en, file_title, wiki_file_url, source_url,
      local_path, absolute_local_path, mime, size_bytes, sha256, provider, status,
      last_verified_at, crawl_report_path, raw_json, deleted
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    ON DUPLICATE KEY UPDATE
      shard = VALUES(shard),
      kind = VALUES(kind),
      source_key = VALUES(source_key),
      display_name_zh = VALUES(display_name_zh),
      display_name_en = VALUES(display_name_en),
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
      row.assetId, row.shard, row.kind, row.sourceKey, row.displayNameZh, row.displayNameEn, row.fileTitle, row.wikiFileUrl,
      row.sourceUrl, row.localPath, row.absoluteLocalPath, row.mime, row.sizeBytes,
      row.sha256, row.provider, row.status, row.lastVerifiedAt, row.crawlReportPath, row.rawJson
    ]
  );
  return existing.length > 0 ? 'updated' : 'inserted';
}

async function upsertLink(connection, row, assetDbId) {
  const [existing] = await connection.execute(
    `SELECT id, audio_asset_id, entity_type, entity_id, source_key, relation_type,
            match_status, match_reason, sort_order, deleted
       FROM audio_asset_links
     WHERE audio_asset_id = ? AND entity_type = ? AND source_key <=> ? AND relation_type = ?`,
    [assetDbId, row.entityType, row.sourceKey, row.relationType]
  );
  if (existing.length > 0 && audioLinkRowsEqual(existing[0], row, assetDbId)) {
    return 'skipped';
  }
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

function audioAssetRowsEqual(existing, target) {
  return JSON.stringify(normalizeAudioAssetRow(existing)) === JSON.stringify(normalizeAudioAssetRow(target));
}

function normalizeAudioAssetRow(row) {
  return {
    assetId: nullable(row.assetId ?? row.asset_id),
    shard: nullable(row.shard),
    kind: nullable(row.kind),
    sourceKey: nullable(row.sourceKey ?? row.source_key),
    displayNameZh: nullable(row.displayNameZh ?? row.display_name_zh),
    displayNameEn: nullable(row.displayNameEn ?? row.display_name_en),
    fileTitle: nullable(row.fileTitle ?? row.file_title),
    wikiFileUrl: nullable(row.wikiFileUrl ?? row.wiki_file_url),
    sourceUrl: nullable(row.sourceUrl ?? row.source_url),
    localPath: nullable(row.localPath ?? row.local_path),
    absoluteLocalPath: nullable(row.absoluteLocalPath ?? row.absolute_local_path),
    mime: nullable(row.mime),
    sizeBytes: Number(row.sizeBytes ?? row.size_bytes ?? 0),
    sha256: nullable(row.sha256),
    provider: nullable(row.provider),
    status: nullable(row.status),
    crawlReportPath: nullable(row.crawlReportPath ?? row.crawl_report_path),
    rawJson: normalizeJsonText(row.rawJson ?? row.raw_json),
    deleted: Number(row.deleted ?? 0),
  };
}

function audioLinkRowsEqual(existing, target, assetDbId) {
  return JSON.stringify(normalizeAudioLinkRow(existing)) === JSON.stringify(normalizeAudioLinkRow({ ...target, audioAssetId: assetDbId }));
}

function normalizeAudioLinkRow(row) {
  return {
    audioAssetId: Number(row.audioAssetId ?? row.audio_asset_id),
    entityType: nullable(row.entityType ?? row.entity_type),
    entityId: nullableNumber(row.entityId ?? row.entity_id),
    sourceKey: nullable(row.sourceKey ?? row.source_key),
    relationType: nullable(row.relationType ?? row.relation_type),
    matchStatus: nullable(row.matchStatus ?? row.match_status),
    matchReason: nullable(row.matchReason ?? row.match_reason),
    sortOrder: Number(row.sortOrder ?? row.sort_order ?? 0),
    deleted: Number(row.deleted ?? 0),
  };
}

function normalizeJsonText(value) {
  const text = nullable(value);
  if (!text) return null;
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return text;
  }
}

function nullableNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function runAudioAssetImport(options = {}, dependencies = {}) {
  const metadata = JSON.parse(fs.readFileSync(options.inputJsonPath, 'utf8'));
  const validation = validateAudioMetadata(metadata);
  const assets = metadata.assets ?? [];
  const localItemRows = dependencies.localItemRows ?? loadLocalItemRows(dependencies.localDataOptions?.items);
  const localNpcRows = dependencies.localNpcRows ?? loadLocalNpcRows(dependencies.localDataOptions?.npcs);
  const localBgmDisplayNameRows = dependencies.localBgmDisplayNameRows ?? loadLocalBgmDisplayNameRows(dependencies.localDataOptions?.bgm);
  let itemRows = mergeRowsByIdentity(dependencies.itemRows ?? [], localItemRows);
  let npcRows = mergeRowsByIdentity(dependencies.npcRows ?? [], localNpcRows);
  const assetRows = buildAudioAssetRows(assets, { reportPath: options.reportPath, itemRows, npcRows, bgmDisplayNameRows: localBgmDisplayNameRows });
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
      skippedAssets: 0,
      insertedLinks: 0,
      updatedLinks: 0,
      skippedLinks: 0,
      matched: linkRows.filter((row) => row.matchStatus === 'matched').length,
      unmatched: linkRows.filter((row) => row.matchStatus === 'unmatched').length,
      ambiguous: linkRows.filter((row) => row.matchStatus === 'ambiguous').length,
      displayNameZhAssets: assetRows.filter((row) => row.displayNameZh).length,
      displayNameEnAssets: assetRows.filter((row) => row.displayNameEn).length,
      applied: Boolean(options.apply)
    },
    failures: validation.failures,
    samples: [
      ...assetRows.filter((row) => row.displayNameZh || row.displayNameEn).slice(0, 4),
      ...assetRows.slice(0, 4)
    ].slice(0, 8)
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
      itemRows = mergeRowsByIdentity(dependencies.itemRows ?? await loadItemRows(connection), localItemRows);
      npcRows = mergeRowsByIdentity(dependencies.npcRows ?? await loadNpcRows(connection), localNpcRows);
      const enrichedAssetRows = buildAudioAssetRows(assets, { reportPath: options.reportPath, itemRows, npcRows, bgmDisplayNameRows: localBgmDisplayNameRows });
      linkRows = buildAudioLinkRows(assets, itemRows);
      for (const row of enrichedAssetRows) {
        const result = await upsertAsset(connection, row);
        report.summary[result === 'inserted' ? 'insertedAssets' : result === 'updated' ? 'updatedAssets' : 'skippedAssets'] += 1;
      }
      const [assetIdRows] = await connection.execute(
        `SELECT id, asset_id FROM audio_assets WHERE asset_id IN (${enrichedAssetRows.map(() => '?').join(', ')})`,
        enrichedAssetRows.map((row) => row.assetId)
      );
      const dbIdByAssetId = new Map(assetIdRows.map((row) => [String(row.asset_id), Number(row.id)]));
      for (const row of linkRows) {
        const assetDbId = dbIdByAssetId.get(row.assetId);
        if (!assetDbId) continue;
        const result = await upsertLink(connection, row, assetDbId);
        report.summary[result === 'inserted' ? 'insertedLinks' : result === 'updated' ? 'updatedLinks' : 'skippedLinks'] += 1;
      }
      report.summary.matched = linkRows.filter((row) => row.matchStatus === 'matched').length;
      report.summary.unmatched = linkRows.filter((row) => row.matchStatus === 'unmatched').length;
      report.summary.ambiguous = linkRows.filter((row) => row.matchStatus === 'ambiguous').length;
      report.summary.displayNameZhAssets = enrichedAssetRows.filter((row) => row.displayNameZh).length;
      report.summary.displayNameEnAssets = enrichedAssetRows.filter((row) => row.displayNameEn).length;
      report.samples = [
        ...enrichedAssetRows.filter((row) => row.displayNameZh || row.displayNameEn).slice(0, 4),
        ...enrichedAssetRows.slice(0, 4)
      ].slice(0, 8);
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
