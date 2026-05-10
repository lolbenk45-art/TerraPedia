#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { getProjectRoot } from '../lib/project-root.mjs';
import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = getProjectRoot();
const require = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'));
const mysql = require('mysql2/promise');

const DEFAULTS = Object.freeze({
  relationDatabase: 'terria_v1_relation',
  localDatabase: 'terria_v1_local',
  apiBaseUrl: 'http://localhost:18088',
  apiMode: 'public-detail',
  adminToken: null,
  writeReport: true,
  output: null,
  dateTag: new Date().toISOString().slice(0, 10),
});

const BLOCKING_STATUSES = new Set([
  'projection_gap',
  'local_gap',
  'api_gap',
  'runtime_fallback_only',
  'projection_only',
  'duplicate_or_polluted',
  'count_parity_only',
]);

const FALLBACK_RUNTIME_MODES = new Set([
  'prototype',
  'same_name',
  'derived',
  'fallback',
  'inherited',
]);

const TRUSTED_RUNTIME_MODES = new Set([
  'direct',
]);

const KNOWN_RUNTIME_MODES = new Set([
  ...TRUSTED_RUNTIME_MODES,
  ...FALLBACK_RUNTIME_MODES,
  'projection_only',
]);

export function parseArgs(argv = process.argv.slice(2)) {
  const raw = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const index = body.indexOf('=');
    if (index >= 0) raw[body.slice(0, index)] = body.slice(index + 1);
    else raw[body] = 'true';
  }
  return {
    relationDatabase: raw['relation-database'] ?? raw.relationDatabase ?? DEFAULTS.relationDatabase,
    localDatabase: raw['local-database'] ?? raw.localDatabase ?? DEFAULTS.localDatabase,
    apiBaseUrl: raw['api-base-url'] ?? raw.apiBaseUrl ?? DEFAULTS.apiBaseUrl,
    apiMode: raw['api-mode'] ?? raw.apiMode ?? DEFAULTS.apiMode,
    adminToken: raw['admin-token'] ?? raw.adminToken ?? process.env.TERRAPEDIA_ADMIN_TOKEN ?? DEFAULTS.adminToken,
    writeReport: booleanOption(raw['write-report'] ?? raw.writeReport, DEFAULTS.writeReport),
    output: raw.output ?? DEFAULTS.output,
    dateTag: raw['date-tag'] ?? raw.dateTag ?? DEFAULTS.dateTag,
  };
}

export function buildNpcLootRuntimeParityReport({
  relationRows = [],
  projectionRows = [],
  localRows = [],
  apiRows = [],
  options = {},
} = {}) {
  const normalized = {
    relationRows: normalizeRows(relationRows, 'relation'),
    projectionRows: normalizeRows(projectionRows, 'projection'),
    localRows: normalizeRows(localRows, 'local'),
    apiRows: filterProjectionOnlyApiDuplicates(normalizeRows(apiRows, 'api')),
  };
  const relation = buildStageIndex(normalized.relationRows);
  const projection = buildStageIndex(normalized.projectionRows);
  const local = buildStageIndex(normalized.localRows);
  const api = buildStageIndex(normalized.apiRows);
  const npcNames = collectNpcNames(normalized);

  const rows = [...npcNames].sort().map((npcInternalName) => classifyNpcRuntimeParity({
    npcInternalName,
    relation,
    projection,
    local,
    api,
  }));

  const byStatus = summarizeByStatus(rows);
  const blockingCount = rows.filter((row) => BLOCKING_STATUSES.has(row.status)).length;

  return {
    auditName: 'npc-loot-runtime-parity',
    generatedAt: new Date().toISOString(),
    options: sanitizeOptions(options),
    auditStatus: blockingCount > 0 ? 'blocked' : 'pass',
    evidenceHealth: 'sufficient',
    summary: {
      totalNpcs: rows.length,
      blockingCount,
      byStatus,
      stageRows: {
        relation: normalized.relationRows.length,
        projection: normalized.projectionRows.length,
        local: normalized.localRows.length,
        api: normalized.apiRows.length,
      },
    },
    rows,
  };
}

export async function runNpcLootRuntimeParityAudit(options = {}, dependencies = {}) {
  const normalized = normalizeOptions(options);
  let connection = dependencies.connection ?? null;
  let shouldClose = false;

  try {
    if (!connection && needsDefaultConnection(dependencies)) {
      const config = dependencies.config ?? loadLocalStackConfig(repoRoot);
      const mysqlFactory = dependencies.mysqlFactory ?? mysql;
      connection = await mysqlFactory.createConnection({
        host: config.database?.host ?? '127.0.0.1',
        port: Number(config.database?.port ?? 3306),
        user: config.database?.username ?? 'root',
        password: config.database?.password ?? 'root',
      });
      shouldClose = true;
    }

    const relationRows = await (dependencies.loadRelationRows ?? defaultLoadRelationRows)(connection, normalized);
    const projectionRows = await (dependencies.loadProjectionRows ?? defaultLoadProjectionRows)(connection, normalized);
    const localRows = await (dependencies.loadLocalRows ?? defaultLoadLocalRows)(connection, normalized);
    const apiRows = await (dependencies.loadApiRows ?? defaultLoadApiRows)(normalized, { ...dependencies, connection });

    const report = buildNpcLootRuntimeParityReport({
      relationRows,
      projectionRows,
      localRows,
      apiRows,
      options: normalized,
    });
    const reportPath = normalized.writeReport ? await writeReport(report, normalized) : null;
    return { report, reportPath };
  } catch (error) {
    const report = buildBlockedReport(normalized, error);
    const reportPath = normalized.writeReport ? await writeReport(report, normalized) : null;
    return { report, reportPath };
  } finally {
    if (shouldClose && connection) {
      await connection.end();
    }
  }
}

export function classifyNpcRuntimeParity({ npcInternalName, relation, projection, local, api }) {
  const relationRows = relation.byNpc.get(npcInternalName) ?? [];
  const projectionRows = projection.byNpc.get(npcInternalName) ?? [];
  const localRows = local.byNpc.get(npcInternalName) ?? [];
  const apiRows = api.byNpc.get(npcInternalName) ?? [];
  const relationKeys = keysForRows(relationRows);
  const projectionKeys = keysForRows(projectionRows);
  const localKeys = keysForRows(localRows);
  const apiKeys = keysForRows(apiRows);
  const duplicateKeys = [
    ...duplicateIdentityKeys(relationRows),
    ...duplicateIdentityKeys(projectionRows),
    ...duplicateIdentityKeys(localRows),
    ...duplicateIdentityKeys(apiRows),
  ];
  const hasApiFallback = apiRows.some((row) => FALLBACK_RUNTIME_MODES.has(row.runtimeMode));
  const hasApiProjectionOnly = apiRows.some((row) => row.runtimeMode === 'projection_only');
  const hasUnknownApiRuntimeMode = apiRows.some((row) => !KNOWN_RUNTIME_MODES.has(row.runtimeMode));
  let status = 'trusted_direct_loot';
  let reason = 'relation_projection_local_api_identity_match';

  if (duplicateKeys.length > 0) {
    status = 'duplicate_or_polluted';
    reason = 'duplicate_stable_identity';
  } else if (hasUnknownApiRuntimeMode && relationKeys.size > 0) {
    status = 'duplicate_or_polluted';
    reason = 'api_runtime_mode_missing_or_unknown';
  } else if (hasApiProjectionOnly || (projectionKeys.size > 0 && localKeys.size === 0 && relationKeys.size === 0)) {
    status = 'projection_only';
    reason = 'projection_json_visible_without_trusted_local_rows';
  } else if (hasApiFallback) {
    status = 'runtime_fallback_only';
    reason = 'api_visible_only_through_runtime_fallback';
  } else if (relationKeys.size === 0 && localKeys.size > 0) {
    status = 'duplicate_or_polluted';
    reason = 'local_visible_without_relation_provenance';
  } else if (relationKeys.size === 0 && apiKeys.size > 0) {
    status = 'duplicate_or_polluted';
    reason = 'api_visible_without_relation_provenance';
  } else if (sameCountsButDifferentIdentity(relationKeys, projectionKeys, localKeys, apiKeys)) {
    status = 'count_parity_only';
    reason = 'stage_counts_match_but_stable_identity_differs';
  } else if (relationKeys.size > 0 && !isSubset(relationKeys, projectionKeys)) {
    status = 'projection_gap';
    reason = 'relation_identity_missing_from_projection';
  } else if (relationKeys.size > 0 && !isSubset(relationKeys, localKeys)) {
    status = 'local_gap';
    reason = 'projection_or_relation_identity_missing_from_local';
  } else if (relationKeys.size > 0 && !isSubset(relationKeys, apiKeys)) {
    status = 'api_gap';
    reason = 'local_or_relation_identity_missing_from_api';
  } else if (hasPollution(relationKeys, projectionKeys, localKeys, apiKeys)) {
    status = 'duplicate_or_polluted';
    reason = 'runtime_contains_untrusted_extra_identity';
  } else if (relationKeys.size === 0 && projectionKeys.size === 0 && localKeys.size === 0 && apiKeys.size === 0) {
    status = 'unknown';
    reason = 'no_runtime_or_chain_evidence';
  }

  return {
    npcInternalName,
    status,
    reason,
    countParityOnly: status === 'count_parity_only',
    counts: {
      relation: relationRows.length,
      projection: projectionRows.length,
      local: localRows.length,
      api: apiRows.length,
    },
    identityCounts: {
      relation: relationKeys.size,
      projection: projectionKeys.size,
      local: localKeys.size,
      api: apiKeys.size,
    },
    missingIdentityKeys: {
      projection: difference(relationKeys, projectionKeys),
      local: difference(relationKeys, localKeys),
      api: difference(relationKeys, apiKeys),
    },
    extraIdentityKeys: {
      projection: difference(projectionKeys, relationKeys),
      local: difference(localKeys, relationKeys),
      api: difference(apiKeys, relationKeys),
    },
    duplicateIdentityKeys: [...new Set(duplicateKeys)].sort(),
    runtimeModes: [...new Set(apiRows.map((row) => row.runtimeMode).filter(Boolean))].sort(),
    sampleRows: {
      relation: relationRows.slice(0, 5),
      projection: projectionRows.slice(0, 5),
      local: localRows.slice(0, 5),
      api: apiRows.slice(0, 5),
    },
  };
}

async function defaultLoadRelationRows(connection, options) {
  assertConnection(connection);
  const [rows] = await connection.query(`
    SELECT
      npc_internal_name AS npcInternalName,
      item_internal_name AS itemInternalName,
      quantity_text AS quantityText,
      chance_text AS chanceText,
      conditions AS conditionText,
      source_fact_key AS sourceFactKey,
      record_key AS relationRecordKey
    FROM ${table(options.relationDatabase, 'item_npc_loot_relations')}
    WHERE deleted = 0 AND status = 1
    ORDER BY npc_internal_name, item_internal_name, source_fact_key, record_key
  `);
  return rows;
}

async function defaultLoadProjectionRows(connection, options) {
  assertConnection(connection);
  const [rows] = await connection.query(`
    SELECT
      internal_name AS npcInternalName,
      loot_items_json AS lootItemsJson
    FROM ${table(options.relationDatabase, 'projection_npcs')}
    WHERE deleted = 0 AND status = 1
      AND loot_items_json IS NOT NULL
      AND JSON_VALID(loot_items_json) = 1
      AND JSON_LENGTH(loot_items_json) > 0
    ORDER BY internal_name
  `);
  return rows.flatMap((row) => parseProjectionLootRows(row));
}

async function defaultLoadLocalRows(connection, options) {
  assertConnection(connection);
  const [rows] = await connection.query(`
    SELECT
      n.internal_name AS npcInternalName,
      i.internal_name AS itemInternalName,
      l.quantity_text AS quantityText,
      l.chance_text AS chanceText,
      l.conditions AS conditionText,
      l.id AS localEntryId
    FROM ${table(options.localDatabase, 'npc_loot_entries')} l
    JOIN ${table(options.localDatabase, 'npcs')} n ON n.id = l.npc_id AND n.deleted = 0
    LEFT JOIN ${table(options.localDatabase, 'items')} i ON i.id = l.item_id AND i.deleted = 0
    WHERE l.deleted = 0
    ORDER BY n.internal_name, i.internal_name, l.id
  `);
  return rows;
}

async function defaultLoadApiRows(options, dependencies = {}) {
  if (options.apiMode === 'admin-list') {
    throw new Error('admin-list API does not expose structured NPC loot relations; use public-detail or inject loadApiRows');
  }
  const apiClient = dependencies.apiClient ?? defaultApiClient;
  const baseUrl = String(options.apiBaseUrl).replace(/\/$/, '');
  const targetNpcs = await (dependencies.loadApiTargetNpcs ?? defaultLoadApiTargetNpcs)(dependencies.connection, options);
  const rows = [];
  for (const npc of targetNpcs) {
    const id = npc.id ?? npc.npcId;
    if (id == null) continue;
    const response = await apiClient(`${baseUrl}/api/public/npcs/${id}/aggregate?include=loot`, buildApiRequestOptions(options));
    if (response && typeof response === 'object' && 'ok' in response && !response.ok && response.status === 404) {
      continue;
    }
    const payload = await normalizeApiResponse(response);
    rows.push(...extractPublicAggregateLootRows(payload?.data ?? payload, npc));
  }
  return rows;
}

async function defaultApiClient(url, requestOptions = {}) {
  if (typeof fetch !== 'function') {
    throw new Error('global fetch is unavailable');
  }
  return fetch(url, requestOptions);
}

function buildApiRequestOptions(options) {
  const headers = {};
  if (options.adminToken) headers.Authorization = `Bearer ${options.adminToken}`;
  return { headers };
}

async function normalizeApiResponse(response) {
  if (response && typeof response === 'object' && 'ok' in response && !response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }
  if (response && typeof response.json === 'function') {
    return response.json();
  }
  return response;
}

function extractApiLootRows(npc) {
  const npcInternalName = normalizeText(npc?.internalName ?? npc?.npcInternalName);
  if (!npcInternalName) return [];
  const directRows = normalizeArray(npc?.lootEntries).map((row) => ({
    ...row,
    npcInternalName,
    runtimeMode: normalizeRuntimeMode(row?.runtimeMode ?? row?.lootSourceMode ?? row?.sourceMode),
  }));
  const inheritedRows = [
    ...normalizeArray(npc?.inheritedLootEntries).map((row) => ({ ...row, runtimeMode: 'prototype' })),
    ...normalizeArray(npc?.derivedLootEntries).map((row) => ({ ...row, runtimeMode: 'derived' })),
  ].map((row) => ({ ...row, npcInternalName }));
  const projectionRows = parseJsonArray(npc?.lootItemsJson).map((row) => ({
    ...row,
    npcInternalName,
    runtimeMode: 'projection_only',
  }));
  return directRows.length || inheritedRows.length
    ? [...directRows, ...inheritedRows]
    : projectionRows;
}

async function defaultLoadApiTargetNpcs(connection, options) {
  assertConnection(connection);
  const [rows] = await connection.query(`
    SELECT id, internal_name AS npcInternalName, game_id AS gameId, name
    FROM ${table(options.localDatabase, 'npcs')}
    WHERE deleted = 0 AND status = 1
    ORDER BY internal_name
  `);
  return rows;
}

function extractPublicAggregateLootRows(aggregate, fallbackNpc = {}) {
  const npc = aggregate?.npc ?? {};
  const npcInternalName = normalizeText(npc.internalName ?? npc.npcInternalName ?? fallbackNpc.npcInternalName ?? fallbackNpc.internalName);
  if (!npcInternalName) return [];
  return normalizeArray(aggregate?.loot).map((row) => ({
    ...row,
    npcInternalName,
    runtimeMode: normalizeRuntimeMode(row?.runtimeMode ?? row?.lootSourceMode ?? row?.sourceMode),
  }));
}

function parseProjectionLootRows(row) {
  return parseJsonArray(row?.lootItemsJson ?? row?.loot_items_json).map((entry) => ({
    ...entry,
    npcInternalName: row.npcInternalName ?? row.internalName ?? row.internal_name,
  }));
}

function normalizeRows(rows, stage) {
  return normalizeArray(rows)
    .flatMap((row) => {
      if (stage === 'projection' && (row.lootItemsJson || row.loot_items_json)) {
        return parseProjectionLootRows(row);
      }
      return [row];
    })
    .map((row) => normalizeRow(row, stage))
    .filter((row) => row.npcInternalName && row.itemInternalName);
}

function filterProjectionOnlyApiDuplicates(rows) {
  const trustedApiKeys = new Set(
    rows
      .filter((row) => row.runtimeMode !== 'projection_only')
      .map(identityKey)
  );
  return rows.filter((row) => row.runtimeMode !== 'projection_only' || !trustedApiKeys.has(identityKey(row)));
}

function normalizeRow(row, stage) {
  return {
    stage,
    npcInternalName: normalizeText(row.npcInternalName ?? row.npc_internal_name ?? row.internalName ?? row.internal_name),
    itemInternalName: normalizeText(row.itemInternalName ?? row.item_internal_name ?? row.internalName ?? row.internal_name),
    quantityText: normalizeText(row.quantityText ?? row.quantity_text),
    chanceText: normalizeText(row.chanceText ?? row.chance_text),
    conditionText: normalizeText(row.conditionText ?? row.condition_text ?? row.conditions),
    sourceFactKey: normalizeText(row.sourceFactKey ?? row.source_fact_key),
    relationRecordKey: normalizeText(row.relationRecordKey ?? row.recordKey ?? row.record_key),
    localEntryId: row.localEntryId ?? row.local_entry_id ?? row.id ?? null,
    runtimeMode: normalizeRuntimeMode(row.runtimeMode ?? row.lootSourceMode ?? row.sourceMode),
  };
}

function buildStageIndex(rows) {
  const byNpc = new Map();
  for (const row of rows) {
    const existing = byNpc.get(row.npcInternalName) ?? [];
    existing.push(row);
    byNpc.set(row.npcInternalName, existing);
  }
  return { rows, byNpc };
}

function collectNpcNames(stages) {
  const names = new Set();
  for (const rows of Object.values(stages)) {
    for (const row of rows) {
      if (row.npcInternalName) names.add(row.npcInternalName);
    }
  }
  return names;
}

function identityKey(row) {
  return JSON.stringify([
    row.npcInternalName,
    row.itemInternalName,
    row.quantityText || '',
    row.chanceText || '',
    row.conditionText || '',
  ]);
}

function keysForRows(rows) {
  return new Set(rows.map(identityKey));
}

function duplicateIdentityKeys(rows) {
  const counts = new Map();
  for (const row of rows) {
    const key = identityKey(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key);
}

function hasPollution(relationKeys, projectionKeys, localKeys, apiKeys) {
  if (relationKeys.size === 0) return false;
  return difference(projectionKeys, relationKeys).length > 0
    || difference(localKeys, relationKeys).length > 0
    || difference(apiKeys, relationKeys).length > 0;
}

function sameCountsButDifferentIdentity(...sets) {
  const nonEmpty = sets.filter((set) => set.size > 0);
  if (nonEmpty.length < 2) return false;
  const size = nonEmpty[0].size;
  return nonEmpty.every((set) => set.size === size) && !nonEmpty.every((set) => sameSet(set, nonEmpty[0]));
}

function isSubset(left, right) {
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

function sameSet(left, right) {
  return left.size === right.size && isSubset(left, right);
}

function difference(left, right) {
  return [...left].filter((value) => !right.has(value)).sort();
}

function summarizeByStatus(rows) {
  const summary = {};
  for (const row of rows) {
    summary[row.status] = (summary[row.status] ?? 0) + 1;
  }
  return summary;
}

function buildBlockedReport(options, error) {
  return {
    auditName: 'npc-loot-runtime-parity',
    generatedAt: new Date().toISOString(),
    options: sanitizeOptions(options),
    auditStatus: 'blocked',
    evidenceHealth: classifyUnavailable(error),
    summary: {
      totalNpcs: 0,
      blockingCount: 1,
      byStatus: {},
      stageRows: {},
    },
    rows: [],
    error: {
      message: error?.message ?? String(error),
      code: error?.code ?? null,
    },
  };
}

function classifyUnavailable(error) {
  const message = String(error?.message ?? error ?? '').toLowerCase();
  if (message.includes('401') || message.includes('authorization') || message.includes('auth')) {
    return 'api_auth_unavailable';
  }
  if (message.includes('api') || message.includes('fetch') || message.includes('http')) {
    return 'api_unavailable';
  }
  return 'db_unavailable';
}

function normalizeOptions(options = {}) {
  return {
    relationDatabase: options.relationDatabase ?? DEFAULTS.relationDatabase,
    localDatabase: options.localDatabase ?? DEFAULTS.localDatabase,
    apiBaseUrl: options.apiBaseUrl ?? DEFAULTS.apiBaseUrl,
    apiMode: options.apiMode ?? DEFAULTS.apiMode,
    adminToken: options.adminToken ?? DEFAULTS.adminToken,
    writeReport: options.writeReport ?? DEFAULTS.writeReport,
    output: options.output ?? DEFAULTS.output,
    dateTag: options.dateTag ?? DEFAULTS.dateTag,
  };
}

function sanitizeOptions(options = {}) {
  return {
    relationDatabase: options.relationDatabase,
    localDatabase: options.localDatabase,
    apiBaseUrl: options.apiBaseUrl,
    apiMode: options.apiMode,
    adminToken: options.adminToken ? '<redacted>' : null,
    writeReport: options.writeReport,
    output: options.output,
    dateTag: options.dateTag,
  };
}

async function writeReport(report, options) {
  const outputPath = options.output
    ? path.resolve(repoRoot, options.output)
    : path.join(repoRoot, 'reports', 'audit', `npc-loot-runtime-parity-${options.dateTag}.json`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return outputPath;
}

function needsDefaultConnection(dependencies) {
  return !(dependencies.loadRelationRows && dependencies.loadProjectionRows && dependencies.loadLocalRows);
}

function assertConnection(connection) {
  if (!connection) {
    throw new Error('database connection is unavailable');
  }
}

function assertIdentifier(value, label) {
  if (!/^[A-Za-z0-9_]+$/.test(String(value ?? ''))) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

function table(database, tableName) {
  assertIdentifier(database, 'database');
  assertIdentifier(tableName, 'table');
  return `\`${database}\`.\`${tableName}\``;
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeRuntimeMode(value) {
  const text = normalizeText(value);
  return text ? text.toLowerCase() : null;
}

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runNpcLootRuntimeParityAudit(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify({ reportPath: result.reportPath, ...result.report }, null, 2));
  if (result.report.auditStatus === 'blocked') {
    process.exitCode = 1;
  }
}
