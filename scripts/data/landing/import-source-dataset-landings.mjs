#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { resolveProjectPath } from '../lib/project-root.mjs';
import {
  listSourceDatasetLandingInputs,
  resolveDatasetFilter,
} from './source-dataset-locator.mjs';
import {
  LANDING_DATASET_TYPES,
  LANDING_PARSE_STATUSES,
  LANDING_TABLE_NAME,
  buildSourceDatasetLandingCreateTableSql,
} from './source-dataset-landing-schema.mjs';

const require = createRequire(import.meta.url);
const defaultMysqlModule = require('mysql2/promise');

const defaultRepoRoot = resolveProjectPath();
const SINGLE_CURRENT_DATASET_TYPES = new Set([
  'buffs_raw',
]);

export function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith('--')) {
      continue;
    }
    const body = token.slice(2);
    const separatorIndex = body.indexOf('=');
    if (separatorIndex === -1) {
      args[body] = 'true';
      continue;
    }
    args[body.slice(0, separatorIndex)] = body.slice(separatorIndex + 1);
  }
  return args;
}

export function booleanOption(value, fallback = false) {
  if (value == null || value === '') {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

export function assertPrimaryDb(database, shouldApply, allowNonPrimaryDb) {
  if (!shouldApply || allowNonPrimaryDb || database === 'terria_v1_local') {
    return;
  }
  throw new Error(
    `Refusing to write to non-primary database '${database}'. Set TERRAPEDIA_DB_NAME=terria_v1_local or pass --allow-non-primary-db=true explicitly.`,
  );
}

export function formatDateTag(value) {
  const date = value instanceof Date ? value : new Date(value);
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function resolveImportOptions(rawArgs = {}, options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? defaultRepoRoot);
  const env = options.env ?? process.env;
  const config = options.config ?? loadLocalStackConfig(repoRoot);
  const now = options.now instanceof Date ? options.now : new Date();
  const dateTag = formatDateTag(now);
  const apply = booleanOption(rawArgs.apply, false);
  const allowNonPrimaryDb = booleanOption(
    rawArgs['allow-non-primary-db'] ?? rawArgs.allowNonPrimaryDb ?? env.TERRAPEDIA_ALLOW_NON_PRIMARY_DB,
    false,
  );

  return {
    apply,
    allowNonPrimaryDb,
    datasets: resolveDatasetFilter(rawArgs.datasets),
    repoRoot,
    sharedDataRoot:
      rawArgs['shared-data-root'] != null || options.sharedDataRoot != null
        ? path.resolve(rawArgs['shared-data-root'] ?? options.sharedDataRoot)
        : undefined,
    reportPath: path.resolve(
      repoRoot,
      rawArgs.output ?? path.join('reports', `source-dataset-landings-schema-${dateTag}.json`),
    ),
    db: {
      host: rawArgs.host ?? env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
      port: Number(rawArgs.port ?? env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 3306),
      user: rawArgs.user ?? env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
      password: rawArgs.password ?? env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
      database: rawArgs.database ?? env.TERRAPEDIA_DB_NAME ?? config.database?.name ?? 'terria_v1_local',
    },
  };
}

export function planLandingImportExecution(options = {}, datasetEntries = []) {
  const schemaSql = buildSourceDatasetLandingCreateTableSql();
  const byType = {};
  for (const entry of datasetEntries) {
    byType[entry.datasetType] = (byType[entry.datasetType] ?? 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    apply: Boolean(options.apply),
    database: options.db?.database ?? 'terria_v1_local',
    tableName: LANDING_TABLE_NAME,
    reportPath: options.reportPath ?? null,
    schema: {
      willApply: Boolean(options.apply),
      applied: false,
      datasetTypes: [...LANDING_DATASET_TYPES],
      parseStatuses: [...LANDING_PARSE_STATUSES],
      sqlLength: schemaSql.length,
      sqlPreview: schemaSql,
    },
    datasets: {
      requested: Array.isArray(options.datasets) ? [...options.datasets] : [],
      located: datasetEntries.length,
      byType,
    },
    rows: {
      inserted: 0,
      updated: 0,
      replaced: 0,
      unchanged: 0,
    },
  };
}

async function defaultWriteReport(reportPath, summary) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(summary, null, 2), 'utf8');
}

function normalizeText(value, fallback = '') {
  const text = String(value ?? fallback).trim();
  return text;
}

function toMysqlDateTime(value) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

async function resolveEntryPayload(entry) {
  if (entry.payload !== undefined) {
    return entry.payload;
  }
  if (typeof entry.loadPayload === 'function') {
    return entry.loadPayload();
  }
  return null;
}

function buildChunkPayload(basePayload, arrayKey, items, index, total) {
  return {
    ...basePayload,
    [arrayKey]: items,
    landingChunk: {
      key: arrayKey,
      index,
      total,
    },
  };
}

function measurePayloadBytes(payload) {
  return Buffer.byteLength(JSON.stringify(payload ?? null), 'utf8');
}

function splitOversizedArrayPayload(entry, payload, maxPayloadBytes) {
  const arrayEntries = Object.entries(payload ?? {}).filter(([, value]) => Array.isArray(value) && value.length > 0);
  if (arrayEntries.length === 0) {
    return [entry];
  }

  const [arrayKey, arrayItems] = arrayEntries
    .map(([key, value]) => [key, value, measurePayloadBytes(value)] )
    .sort((left, right) => right[2] - left[2])[0];
  const basePayload = { ...payload };
  delete basePayload[arrayKey];

  const chunks = [];
  let currentItems = [];
  for (const item of arrayItems) {
    const tentativeItems = currentItems.concat([item]);
    const tentativePayload = buildChunkPayload(basePayload, arrayKey, tentativeItems, 1, 1);
    if (measurePayloadBytes(tentativePayload) > maxPayloadBytes && currentItems.length > 0) {
      chunks.push(currentItems);
      currentItems = [item];
    } else {
      currentItems = tentativeItems;
    }
  }
  if (currentItems.length > 0) {
    chunks.push(currentItems);
  }

  if (chunks.length <= 1) {
    return [entry];
  }

  return chunks.map((items, index) => {
    const chunkIndex = index + 1;
    const chunkPayload = buildChunkPayload(basePayload, arrayKey, items, chunkIndex, chunks.length);
    const existingNotes = normalizeText(entry.notes);
    return {
      ...entry,
      sourceKey: `${entry.sourceKey}:chunk:${String(chunkIndex).padStart(4, '0')}`,
      sourcePage: `${entry.sourcePage}#${arrayKey}/${chunkIndex}`,
      payload: chunkPayload,
      payloadBytes: measurePayloadBytes(chunkPayload),
      notes: existingNotes
        ? `${existingNotes}; chunk ${chunkIndex}/${chunks.length} for ${arrayKey}`
        : `chunk ${chunkIndex}/${chunks.length} for ${arrayKey}`,
    };
  });
}

export async function expandLandingEntries(entries = [], options = {}) {
  const maxPayloadBytes = Number(options.maxPayloadBytes ?? 8 * 1024 * 1024);
  const expanded = [];

  for (const entry of entries) {
    const payloadBytes = Number(entry.payloadBytes ?? 0);
    if (payloadBytes > 0 && payloadBytes <= maxPayloadBytes) {
      expanded.push(entry);
      continue;
    }

    const payload = await resolveEntryPayload(entry);
    const resolvedPayloadBytes = payloadBytes > 0 ? payloadBytes : measurePayloadBytes(payload);
    if (resolvedPayloadBytes <= maxPayloadBytes) {
      expanded.push({
        ...entry,
        payloadBytes: resolvedPayloadBytes,
      });
      continue;
    }

    const splitEntries = splitOversizedArrayPayload(
      {
        ...entry,
        payload,
        payloadBytes: resolvedPayloadBytes,
      },
      payload,
      maxPayloadBytes,
    );
    expanded.push(...splitEntries);
  }

  return expanded;
}

function buildLandingRow(entry, payload) {
  return {
    datasetType: normalizeText(entry.datasetType),
    provider: normalizeText(entry.provider),
    sourceKind: normalizeText(entry.sourceKind),
    sourceKey: normalizeText(entry.sourceKey),
    sourceLocator: normalizeText(entry.sourceLocator),
    sourcePage: normalizeText(entry.sourcePage, normalizeText(entry.sourceKey)),
    sourceRevisionTimestamp: toMysqlDateTime(entry.sourceRevisionTimestamp),
    contentHash: normalizeText(entry.contentHash),
    payloadJson: JSON.stringify(payload ?? null),
    fetchedAt: toMysqlDateTime(entry.fetchedAt),
    parsedAt: toMysqlDateTime(entry.parsedAt),
    parseStatus: normalizeText(entry.parseStatus, 'ok') || 'ok',
    isCurrent: 1,
    notes: entry.notes == null ? null : String(entry.notes),
  };
}

async function loadCurrentLandingRows(connection, row) {
  const [rows] = await connection.execute(
    `SELECT id, content_hash, source_page
     FROM source_dataset_landings
     WHERE dataset_type = ?
       AND provider = ?
       AND source_key = ?
       AND is_current = 1
     ORDER BY id`,
    [row.datasetType, row.provider, row.sourceKey],
  );
  return rows;
}

async function loadCurrentDatasetRows(connection, row) {
  const [rows] = await connection.execute(
    `SELECT id, content_hash, source_page, provider, source_key
     FROM source_dataset_landings
     WHERE dataset_type = ?
       AND is_current = 1
     ORDER BY id`,
    [row.datasetType],
  );
  return rows;
}

async function insertLandingRow(connection, row) {
  await connection.execute(
    `INSERT INTO source_dataset_landings (
      dataset_type,
      provider,
      source_kind,
      source_key,
      source_locator,
      source_page,
      source_revision_timestamp,
      content_hash,
      payload_json,
      fetched_at,
      parsed_at,
      parse_status,
      is_current,
      notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.datasetType,
      row.provider,
      row.sourceKind,
      row.sourceKey,
      row.sourceLocator,
      row.sourcePage,
      row.sourceRevisionTimestamp,
      row.contentHash,
      row.payloadJson,
      row.fetchedAt,
      row.parsedAt,
      row.parseStatus,
      row.isCurrent,
      row.notes,
    ],
  );
}

async function updateLandingRow(connection, rowId, row) {
  await connection.execute(
    `UPDATE source_dataset_landings
     SET source_kind = ?,
         source_locator = ?,
         source_revision_timestamp = ?,
         content_hash = ?,
         payload_json = ?,
         fetched_at = ?,
         parsed_at = ?,
         parse_status = ?,
         notes = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      row.sourceKind,
      row.sourceLocator,
      row.sourceRevisionTimestamp,
      row.contentHash,
      row.payloadJson,
      row.fetchedAt,
      row.parsedAt,
      row.parseStatus,
      row.notes,
      rowId,
    ],
  );
}

async function clearArchivedLandingRowForKey(connection, row, sourcePage, keepRowId) {
  await connection.execute(
    `DELETE FROM source_dataset_landings
     WHERE dataset_type = ?
       AND provider = ?
       AND source_key = ?
       AND source_page <=> ?
       AND is_current = 0
       AND id <> ?`,
    [
      row.datasetType,
      row.provider,
      row.sourceKey,
      normalizeText(sourcePage, row.sourcePage),
      keepRowId,
    ],
  );
}

async function retireLandingRow(connection, rowId, row, sourcePage) {
  const retirementKey = {
    ...row,
    provider: normalizeText(row.provider),
    sourceKey: normalizeText(row.sourceKey),
  };
  await clearArchivedLandingRowForKey(connection, retirementKey, sourcePage, rowId);
  await connection.execute(
    `UPDATE source_dataset_landings
     SET is_current = 0,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [rowId],
  );
}

async function upsertLandingEntry(connection, entry, summary) {
  const payload = await resolveEntryPayload(entry);
  const row = buildLandingRow(entry, payload);
  const datasetCurrentRows = SINGLE_CURRENT_DATASET_TYPES.has(row.datasetType)
    ? await loadCurrentDatasetRows(connection, row)
    : [];
  const currentRows = await loadCurrentLandingRows(connection, row);
  if (!currentRows.length) {
    await insertLandingRow(connection, row);
    for (const stale of datasetCurrentRows) {
      await retireLandingRow(connection, Number(stale.id), { ...row, provider: stale.provider, sourceKey: stale.source_key }, stale.source_page);
    }
    if (datasetCurrentRows.length > 0) {
      summary.rows.replaced += 1;
    } else {
      summary.rows.inserted += 1;
    }
    return;
  }

  const exactCurrent = currentRows.find((current) => normalizeText(current.source_page, row.sourceKey) === row.sourcePage);
  if (exactCurrent && normalizeText(exactCurrent.content_hash) === row.contentHash) {
    for (const stale of datasetCurrentRows) {
      if (Number(stale.id) !== Number(exactCurrent.id)) {
        await retireLandingRow(connection, Number(stale.id), { ...row, provider: stale.provider, sourceKey: stale.source_key }, stale.source_page);
      }
    }
    await updateLandingRow(connection, Number(exactCurrent.id), row);
    summary.rows.unchanged += 1;
    return;
  }

  for (const current of currentRows) {
    await retireLandingRow(connection, Number(current.id), row, current.source_page);
  }
  await insertLandingRow(connection, row);
  summary.rows.replaced += 1;
}

export async function runLandingImport(options = {}, dependencies = {}) {
  const mysqlModule = dependencies.mysqlModule ?? defaultMysqlModule;
  const writeReport = dependencies.writeReport ?? defaultWriteReport;
  const locateDatasetEntries = dependencies.locateDatasetEntries
    ?? ((resolverOptions) => listSourceDatasetLandingInputs(resolverOptions));

  const datasetEntries = await locateDatasetEntries({
    repoRoot: options.repoRoot ?? defaultRepoRoot,
    sharedDataRoot: options.sharedDataRoot,
    datasets: options.datasets,
  });
  const expandedEntries = await expandLandingEntries(datasetEntries);
  const summary = planLandingImportExecution(options, expandedEntries);

  if (options.apply) {
    const connection = await mysqlModule.createConnection(options.db);
    try {
      if (typeof connection.beginTransaction === 'function') {
        await connection.beginTransaction();
      }
      await connection.query(buildSourceDatasetLandingCreateTableSql());
      summary.schema.applied = true;

      for (const entry of expandedEntries) {
        await upsertLandingEntry(connection, entry, summary);
      }

      if (typeof connection.commit === 'function') {
        await connection.commit();
      }
    } catch (error) {
      if (typeof connection.rollback === 'function') {
        await connection.rollback();
      }
      throw error;
    } finally {
      if (typeof connection.end === 'function') {
        await connection.end();
      }
    }
  }

  if (summary.reportPath) {
    await writeReport(summary.reportPath, summary);
  }

  return summary;
}

async function main() {
  const rawArgs = parseArgs(process.argv.slice(2));
  const resolvedOptions = resolveImportOptions(rawArgs);
  assertPrimaryDb(resolvedOptions.db.database, resolvedOptions.apply, resolvedOptions.allowNonPrimaryDb);
  const summary = await runLandingImport(resolvedOptions);
  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
