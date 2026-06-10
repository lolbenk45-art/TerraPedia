#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { parseCliArgs, writeJson } from '../lib/wiki-item-utils.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';

const repoRoot = getProjectRoot();
const require = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'));
const ITEM_BACKED_REF_TYPES = new Set(['item', 'container', 'crate', 'treasure_bag']);
const NPC_BACKED_REF_TYPES = new Set(['npc']);
const SUPPORTED_REF_TYPES = new Set(['item', 'container', 'crate', 'treasure_bag', 'npc', 'world']);

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

export function parseApplyItemSourceCandidateLocalCompatArgs(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const apply = booleanOption(options.apply, false);
  const confirmLocalCompat = booleanOption(options['confirm-local-compat'] ?? options.confirmLocalCompat, false);
  const allowBulk = booleanOption(options['allow-bulk'] ?? options.allowBulk, false);
  if (apply && !confirmLocalCompat) {
    throw new Error('local compat apply requires --confirm-local-compat=true');
  }
  return {
    inputPath: options.input ?? path.join(process.cwd(), 'data', 'reports', 'item-source-candidate-import-plan.latest.json'),
    outputPath: options.output ?? null,
    backupDir: options['backup-dir'] ?? options.backupDir ?? path.join(process.cwd(), 'data', 'backups', 'item-source-candidate-local-compat'),
    apply,
    confirmLocalCompat,
    allowBulk,
    sample: options.sample ?? null,
    database: options.database ?? 'terria_v1_local',
    host: options.host ?? null,
    port: options.port ?? null,
    user: options.user ?? null,
    password: options.password ?? null,
    batchId: options['batch-id'] ?? options.batchId ?? null
  };
}

export function buildLocalCompatRows(plan, { sample = null, allowBulk = false } = {}) {
  const selected = selectCandidates(plan, { sample, allowBulk });
  const rows = [];
  const blocked = [];
  for (const candidate of selected) {
    const itemId = toNullableInteger(candidate?.itemResolution?.id);
    if (itemId == null) {
      blocked.push({ itemInternalName: candidate?.itemInternalName, reason: 'item_id_missing' });
      continue;
    }
    for (const source of Array.isArray(candidate.plannedSources) ? candidate.plannedSources : []) {
      const sourceRefType = normalizeText(source.sourceRefType)?.toLowerCase() ?? null;
      if (!SUPPORTED_REF_TYPES.has(sourceRefType)) {
        blocked.push(blockedSource(candidate, source, 'unsupported_source_ref_type'));
        continue;
      }
      const sourceRefId = resolveSourceRefId(source);
      if (sourceRefType !== 'world' && sourceRefId == null) {
        blocked.push(blockedSource(candidate, source, 'source_ref_id_missing'));
        continue;
      }
      const quantity = parseQuantity(source.quantityText);
      rows.push({
        fingerprint: buildFingerprint({
          itemId,
          sourceType: normalizeText(source.sourceType)?.toLowerCase(),
          sourceRefType,
          sourceRefId,
          sourceRefName: normalizeText(source.sourceRefName),
          quantityText: source.quantityText ?? null,
          chanceText: source.chanceText ?? null,
          conditions: source.conditions ?? null,
          sourcePage: source.sourcePage ?? candidate.pageTitle ?? null,
          sourceRevisionTimestamp: source.sourceRevisionTimestamp ?? candidate.sourceRevisionTimestamp ?? null
        }),
        itemId,
        itemInternalName: candidate.itemInternalName,
        itemName: candidate.itemName,
        sourceType: normalizeText(source.sourceType)?.toLowerCase(),
        sourceRefType,
        sourceRefId,
        sourceRefName: normalizeText(source.sourceRefName),
        biomeId: null,
        quantityMin: quantity.min,
        quantityMax: quantity.max,
        quantityText: source.quantityText ?? null,
        chanceValue: null,
        chanceText: source.chanceText ?? null,
        conditions: source.conditions ?? null,
        notes: source.notes ?? null,
        sourceProvider: 'wiki_gg',
        sourcePage: source.sourcePage ?? candidate.pageTitle ?? null,
        sourceRevisionTimestamp: toMysqlDateTime(source.sourceRevisionTimestamp ?? candidate.sourceRevisionTimestamp),
        sortOrder: Number.isInteger(Number(source.sortOrder)) ? Number(source.sortOrder) : rows.length,
        status: 1,
        deleted: 0
      });
    }
  }
  return { rows, blocked, selectedCandidates: selected.length };
}

export async function runItemSourceCandidateLocalCompatApply(options = {}, dependencies = {}) {
  const now = dependencies.now instanceof Date ? dependencies.now : new Date();
  const batchId = options.batchId ?? `item-source-local-${now.toISOString().replace(/[:.]/g, '-')}`;
  const plan = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), options.inputPath), 'utf8'));
  const built = buildLocalCompatRows(plan, {
    sample: options.sample,
    allowBulk: options.allowBulk
  });
  const config = dependencies.config ?? loadLocalStackConfig(repoRoot);
  const mysqlModule = dependencies.mysqlModule ?? require('mysql2/promise');
  const connectionConfig = {
    host: options.host ?? process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
    port: Number(options.port ?? process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 13306),
    user: options.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
    password: options.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
    database: options.database ?? process.env.TERRAPEDIA_DB_NAME ?? config.database?.name ?? 'terria_v1_local'
  };

  if (options.apply && connectionConfig.database !== 'terria_v1_local') {
    throw new Error(`Refusing local compat apply to non-local database: ${connectionConfig.database}`);
  }
  if (options.apply && built.selectedCandidates > 1 && !options.allowBulk) {
    throw new Error('Bulk local compat apply requires --allow-bulk=true');
  }

  const connection = await mysqlModule.createConnection(connectionConfig);
  const insertedIds = [];
  const skipped = [];
  const validationErrors = [];
  const insertable = [];
  let beforeRows = [];

  try {
    beforeRows = await readBeforeRows(connection, built.rows);
    if (options.apply) {
      await connection.beginTransaction();
    }
    for (const row of built.rows) {
      const validation = await validateRowRefs(connection, row);
      if (validation) {
        validationErrors.push({ fingerprint: row.fingerprint, reason: validation, row });
        continue;
      }
      const duplicateId = await findDuplicateId(connection, row);
      if (duplicateId != null) {
        skipped.push({ id: duplicateId, fingerprint: row.fingerprint, reason: 'duplicate' });
        continue;
      }
      insertable.push(row);
      if (options.apply) {
        const [result] = await connection.execute(buildInsertSql(), insertParams(row));
        if (result?.insertId != null) {
          insertedIds.push(Number(result.insertId));
        }
      }
    }
    if (options.apply) {
      await connection.commit();
    }
  } catch (error) {
    if (options.apply) {
      await connection.rollback();
    }
    throw error;
  } finally {
    await connection.end();
  }

  const backupPath = path.resolve(process.cwd(), options.backupDir, `${batchId}.before.json`);
  writeJson(backupPath, {
    generatedAt: now.toISOString(),
    batchId,
    connection: { host: connectionConfig.host, port: connectionConfig.port, database: connectionConfig.database },
    rows: beforeRows
  });

  const report = {
    generatedAt: now.toISOString(),
    batchId,
    apply: Boolean(options.apply),
    inputPath: path.resolve(process.cwd(), options.inputPath),
    backupPath,
    connection: { host: connectionConfig.host, port: connectionConfig.port, database: connectionConfig.database, user: connectionConfig.user },
    summary: {
      selectedCandidates: built.selectedCandidates,
      plannedRows: built.rows.length,
      blockedRows: built.blocked.length,
      validationErrors: validationErrors.length,
      duplicates: skipped.length,
      toInsert: insertable.length,
      inserted: insertedIds.length
    },
    blocked: built.blocked,
    validationErrors,
    skipped,
    insertedIds,
    plannedRows: built.rows,
    rollbackSql: insertedIds.length
      ? `DELETE FROM \`item_acquisition_sources\` WHERE \`id\` IN (${insertedIds.join(', ')});`
      : null
  };
  if (options.outputPath) {
    writeJson(path.resolve(process.cwd(), options.outputPath), report);
  }
  return report;
}

function selectCandidates(plan, { sample = null, allowBulk = false } = {}) {
  const candidates = Array.isArray(plan?.eligibleCandidates) ? plan.eligibleCandidates : [];
  const sampleKey = normalizeIdentity(sample);
  const selected = sampleKey
    ? candidates.filter((candidate) => [candidate.itemInternalName, candidate.itemName].some((value) => normalizeIdentity(value) === sampleKey))
    : candidates;
  if (!allowBulk && !sampleKey && selected.length > 1) {
    throw new Error('Refusing to select multiple candidates without --sample or --allow-bulk=true');
  }
  return selected;
}

function resolveSourceRefId(source) {
  const sourceRefType = normalizeText(source.sourceRefType)?.toLowerCase();
  if (sourceRefType === 'world') return null;
  if (ITEM_BACKED_REF_TYPES.has(sourceRefType) || NPC_BACKED_REF_TYPES.has(sourceRefType)) {
    return toNullableInteger(source?.resolvedRef?.id);
  }
  return null;
}

function parseQuantity(value) {
  const text = normalizeText(value);
  if (!text) return { min: null, max: null };
  const range = text.match(/^(\d+)\s*[–-]\s*(\d+)$/u);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const single = text.match(/^(\d+)$/u);
  if (single) return { min: Number(single[1]), max: Number(single[1]) };
  return { min: null, max: null };
}

async function readBeforeRows(connection, rows) {
  const itemIds = [...new Set(rows.map((row) => row.itemId).filter((id) => id != null))];
  if (!itemIds.length) return [];
  const placeholders = itemIds.map(() => '?').join(', ');
  const [result] = await connection.execute(
    `SELECT * FROM \`item_acquisition_sources\` WHERE \`item_id\` IN (${placeholders}) ORDER BY \`item_id\`, \`sort_order\`, \`id\``,
    itemIds
  );
  return Array.isArray(result) ? result : [];
}

async function validateRowRefs(connection, row) {
  const [items] = await connection.execute(
    'SELECT id FROM `items` WHERE `id` = ? AND `status` = 1 AND `deleted` = 0 LIMIT 1',
    [row.itemId]
  );
  if (!Array.isArray(items) || items.length === 0) return 'item_missing';
  if (ITEM_BACKED_REF_TYPES.has(row.sourceRefType)) {
    const [sourceItems] = await connection.execute(
      'SELECT id FROM `items` WHERE `id` = ? AND `status` = 1 AND `deleted` = 0 LIMIT 1',
      [row.sourceRefId]
    );
    return Array.isArray(sourceItems) && sourceItems.length > 0 ? null : 'source_item_missing';
  }
  if (NPC_BACKED_REF_TYPES.has(row.sourceRefType)) {
    const [npcs] = await connection.execute(
      'SELECT id FROM `npcs` WHERE `id` = ? AND `status` = 1 AND `deleted` = 0 LIMIT 1',
      [row.sourceRefId]
    );
    return Array.isArray(npcs) && npcs.length > 0 ? null : 'source_npc_missing';
  }
  return null;
}

async function findDuplicateId(connection, row) {
  const [rows] = await connection.execute(
    `SELECT id
FROM \`item_acquisition_sources\`
WHERE \`item_id\` = ?
  AND \`source_type\` = ?
  AND COALESCE(\`source_ref_type\`, '') = COALESCE(?, '')
  AND COALESCE(\`source_ref_id\`, -1) = COALESCE(?, -1)
  AND COALESCE(\`source_ref_name\`, '') = COALESCE(?, '')
  AND COALESCE(\`quantity_text\`, '') = COALESCE(?, '')
  AND COALESCE(\`chance_text\`, '') = COALESCE(?, '')
  AND COALESCE(\`conditions\`, '') = COALESCE(?, '')
  AND COALESCE(\`source_page\`, '') = COALESCE(?, '')
  AND \`status\` = 1
  AND \`deleted\` = 0
LIMIT 1`,
    [
      row.itemId,
      row.sourceType,
      row.sourceRefType,
      row.sourceRefId,
      row.sourceRefName,
      row.quantityText,
      row.chanceText,
      row.conditions,
      row.sourcePage
    ]
  );
  return Array.isArray(rows) && rows[0]?.id != null ? Number(rows[0].id) : null;
}

function buildInsertSql() {
  return `
INSERT INTO \`item_acquisition_sources\`
  (\`item_id\`, \`source_type\`, \`source_ref_type\`, \`source_ref_id\`, \`source_ref_name\`, \`biome_id\`, \`quantity_min\`, \`quantity_max\`, \`quantity_text\`, \`chance_value\`, \`chance_text\`, \`conditions\`, \`notes\`, \`source_provider\`, \`source_page\`, \`source_revision_timestamp\`, \`sort_order\`, \`status\`, \`deleted\`)
VALUES
  (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`.trim();
}

function insertParams(row) {
  return [
    row.itemId,
    row.sourceType,
    row.sourceRefType,
    row.sourceRefId,
    row.sourceRefName,
    row.biomeId,
    row.quantityMin,
    row.quantityMax,
    row.quantityText,
    row.chanceValue,
    row.chanceText,
    row.conditions,
    row.notes,
    row.sourceProvider,
    row.sourcePage,
    row.sourceRevisionTimestamp,
    row.sortOrder,
    row.status,
    row.deleted
  ];
}

function blockedSource(candidate, source, reason) {
  return {
    itemInternalName: candidate?.itemInternalName,
    sourceRefName: source?.sourceRefName,
    sourceRefType: source?.sourceRefType,
    reason
  };
}

function buildFingerprint(row) {
  return JSON.stringify([
    row.itemId,
    row.sourceType,
    row.sourceRefType,
    row.sourceRefId,
    row.sourceRefName,
    row.quantityText,
    row.chanceText,
    row.conditions,
    row.sourcePage,
    row.sourceRevisionTimestamp
  ]);
}

function toMysqlDateTime(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function toNullableInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeIdentity(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function isDirectRun(metaUrl) {
  return process.argv[1] && metaUrl === new URL(`file://${path.resolve(process.argv[1])}`).href;
}

if (isDirectRun(import.meta.url)) {
  try {
    const report = await runItemSourceCandidateLocalCompatApply(parseApplyItemSourceCandidateLocalCompatArgs());
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
