#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig, resolveAdminAuth, resolveBackendApiBase } from '../../lib/local-runtime-config.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import { parseCliArgs, writeJson } from '../lib/wiki-item-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = getProjectRoot();

export function buildArmorSetStableKey(row) {
  const compositionKind = normalizeKeyPart(resolveCompositionKind(row));
  const sourceKey = normalizeKeyPart(firstText(
    row?.pageTitle,
    row?.page_title,
    row?.sourceKey,
    row?.source_key
  ));
  if (!compositionKind || !sourceKey) {
    return null;
  }
  return `${compositionKind}|${sourceKey}`;
}

export function buildArmorSetCoverageReport({
  sourceRows = [],
  projectionRows = [],
  apiRows = []
} = {}) {
  const acceptedSourceRows = sourceRows.filter(isAcceptedSourceRow);
  const sourceEntries = acceptedSourceRows.map((row) => ({ key: buildArmorSetStableKey(row), row }));
  const keyedSourceEntries = sourceEntries.filter((entry) => entry.key);
  const sourceMap = groupEntriesByKey(keyedSourceEntries);
  const projectionMap = groupRowsByStableKey(projectionRows);
  const apiMap = groupRowsByStableKey(apiRows);

  return {
    sourceTotal: acceptedSourceRows.length,
    projectionTotal: projectionRows.length,
    apiTotal: apiRows.length,
    missingFromProjection: findMissing(sourceMap, projectionMap),
    missingFromApi: findMissing(sourceMap, apiMap),
    unmappedItems: sourceEntries
      .filter((entry) => !entry.key)
      .map((entry) => summarizeRow(entry.row))
  };
}

export function readSourceArmorSetRows(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.records)) {
    return payload.records;
  }
  if (Array.isArray(payload?.armorSets)) {
    return payload.armorSets;
  }
  if (Array.isArray(payload?.data)) {
    return payload.data;
  }
  return [];
}

async function main(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);
  const inputPath = path.resolve(args.input ?? path.join(repoRoot, 'data', 'generated', 'wiki-armor-sets.latest.json'));
  const outputPath = args.output ? path.resolve(args.output) : null;
  const sourcePayload = JSON.parse(await fs.promises.readFile(inputPath, 'utf8'));
  const sourceRows = readSourceArmorSetRows(sourcePayload);
  const projectionRows = shouldLoadProjection(args) ? await loadProjectionArmorSets(args) : [];
  const apiRows = shouldLoadApi(args) ? await loadApiArmorSets(args) : [];
  const report = buildArmorSetCoverageReport({ sourceRows, projectionRows, apiRows });
  const payload = {
    ...report,
    inputPath,
    projectionLoaded: shouldLoadProjection(args),
    apiLoaded: shouldLoadApi(args)
  };

  if (outputPath) {
    writeJson(outputPath, payload);
  }
  console.log(JSON.stringify(payload, null, 2));
}

async function loadProjectionArmorSets(args) {
  const require = createRequire(import.meta.url);
  const mysql = require('mysql2/promise');
  const config = loadLocalStackConfig(repoRoot);
  const db = {
    host: args.host ?? process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
    port: Number(args.port ?? process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 3306),
    user: args.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
    password: args.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
    database: args['relation-database'] ?? args.relationDatabase ?? process.env.TERRAPEDIA_RELATION_DB_NAME ?? 'terria_v1_relation'
  };
  const conn = await mysql.createConnection(db);
  try {
    const columns = await getTableColumns(conn, db.database, 'projection_armor_sets');
    const entityTypeSelect = columns.has('entity_type')
      ? 'entity_type AS entityType'
      : "'armor_set' AS entityType";
    const compositionKindSelect = columns.has('composition_kind')
      ? 'composition_kind AS compositionKind'
      : "CASE WHEN unique_item_count = 1 THEN 'single_piece_set' ELSE 'traditional_set' END AS compositionKind";
    const [rows] = await conn.execute(`
      SELECT id,
             ${entityTypeSelect},
             ${compositionKindSelect},
             source_key AS sourceKey,
             text_key AS textKey,
             name,
             name_en AS nameEn,
             unique_item_count AS uniqueItemCount,
             set_count AS setCount,
             current_item_ids_json AS currentItemIdsJson,
             unique_item_ids_json AS uniqueItemIdsJson,
             mapping_status AS mappingStatus
        FROM projection_armor_sets
       WHERE deleted = 0
       ORDER BY id ASC
    `);
    return rows;
  } finally {
    await conn.end();
  }
}

async function getTableColumns(conn, schemaName, tableName) {
  const [rows] = await conn.execute(
    `
    SELECT COLUMN_NAME
      FROM information_schema.columns
     WHERE table_schema = ?
       AND table_name = ?
    `,
    [schemaName, tableName]
  );
  return new Set(rows.map((row) => row.COLUMN_NAME));
}

async function loadApiArmorSets(args) {
  const apiBase = trimTrailingSlash(resolveBackendApiBase(args));
  const { username, password } = resolveAdminAuth(args);
  const token = await loginAndGetToken(apiBase, { username, password });
  const rows = [];
  let page = 1;
  const limit = Math.max(1, Math.min(100, Number(args['api-limit'] ?? args.apiLimit ?? 100) || 100));

  while (true) {
    const response = await fetchJson(`${apiBase}/admin/armor-sets?page=${page}&limit=${limit}`, token);
    const data = Array.isArray(response?.data) ? response.data : [];
    rows.push(...data);
    const total = Number(response?.pagination?.total ?? response?.total ?? 0);
    if (data.length < limit || (total > 0 && rows.length >= total)) {
      break;
    }
    page += 1;
  }
  return rows;
}

async function loginAndGetToken(apiBase, credentials) {
  const response = await fetch(`${apiBase}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(credentials)
  });
  if (!response.ok) {
    throw new Error(`Login failed with status ${response.status}`);
  }
  const payload = await response.json();
  const token = payload?.data?.token;
  if (!token) {
    throw new Error('Login response missing token');
  }
  return token;
}

async function fetchJson(url, token) {
  const response = await fetch(url, {
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) {
    throw new Error(`Fetch failed for ${url}: ${response.status}`);
  }
  return response.json();
}

function shouldLoadProjection(args) {
  return booleanOption(args.projection ?? args.db ?? args['with-projection'], false);
}

function shouldLoadApi(args) {
  return booleanOption(args.api ?? args['with-api'], false);
}

function isAcceptedSourceRow(row) {
  const status = firstText(
    row?.mappingStatus,
    row?.mapping_status,
    row?.reviewStatus,
    row?.review_status,
    row?.status
  ).toLowerCase();
  if (!status) {
    return true;
  }
  if (['rejected', 'ignored', 'skipped', 'unmapped', 'unresolved', 'disabled', 'deleted'].includes(status)) {
    return false;
  }
  return true;
}

function resolveCompositionKind(row) {
  const explicit = firstText(
    row?.compositionKind,
    row?.composition_kind,
    row?.kind
  );
  if (explicit) {
    return explicit;
  }

  const itemCount = firstFiniteNumber(
    row?.uniqueItemCount,
    row?.unique_item_count,
    parseArray(row?.currentItemIdsJson ?? row?.current_item_ids_json).length,
    parseArray(row?.uniqueItemIdsJson ?? row?.unique_item_ids_json).length
  );
  return itemCount === 1 ? 'single_piece_set' : 'traditional_set';
}

function groupRowsByStableKey(rows) {
  return groupEntriesByKey(rows.map((row) => ({ key: buildArmorSetStableKey(row), row })).filter((entry) => entry.key));
}

function groupEntriesByKey(entries) {
  const map = new Map();
  for (const entry of entries) {
    const bucket = map.get(entry.key) ?? [];
    bucket.push(entry.row);
    map.set(entry.key, bucket);
  }
  return map;
}

function findMissing(sourceMap, targetMap) {
  return [...sourceMap.entries()]
    .filter(([key]) => !targetMap.has(key))
    .map(([key, rows]) => ({
      key,
      source: summarizeRow(rows[0])
    }));
}

function summarizeRow(row) {
  return {
    key: buildArmorSetStableKey(row),
    compositionKind: resolveCompositionKind(row),
    pageTitle: firstText(row?.pageTitle, row?.page_title) || null,
    sourceKey: firstText(row?.sourceKey, row?.source_key) || null
  };
}

function parseArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value == null || value === '') {
    return [];
  }
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return null;
}

function firstText(...values) {
  for (const value of values) {
    const text = toText(value);
    if (text) {
      return text;
    }
  }
  return '';
}

function toText(value) {
  if (value == null) {
    return '';
  }
  return String(value).trim();
}

function normalizeKeyPart(value) {
  return toText(value).replace(/\s+/g, ' ').toLowerCase();
}

function booleanOption(value, fallback = false) {
  if (value == null || value === '') {
    return fallback;
  }
  const text = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(text)) {
    return true;
  }
  if (['false', '0', 'no', 'n', 'off'].includes(text)) {
    return false;
  }
  return fallback;
}

function trimTrailingSlash(value) {
  let result = String(value ?? '').trim();
  while (result.endsWith('/')) {
    result = result.slice(0, -1);
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
