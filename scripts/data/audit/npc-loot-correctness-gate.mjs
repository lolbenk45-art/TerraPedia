#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { evaluateMimicFamilyRows } from './audit-mimic-family-loot-contract.mjs';
import { classifyNpcLootSource } from '../lib/npc-loot-source-taxonomy.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = getProjectRoot();
const require = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'));
const mysql = require('mysql2/promise');

const MIMIC_VARIANTS = Object.freeze([
  'PresentMimic',
  'BigMimicCorruption',
  'BigMimicCrimson',
  'BigMimicHallow',
  'BigMimicJungle',
]);

const MIMIC_CONTROLS = Object.freeze([
  'Mimic',
  'IceMimic',
  'WaterBoltMimic',
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
    maintDatabase: raw['maint-database'] ?? 'terria_v1_maint',
    relationDatabase: raw['relation-database'] ?? 'terria_v1_relation',
    localDatabase: raw['local-database'] ?? 'terria_v1_local',
    writeReport: booleanOption(raw['write-report'], true),
    dateTag: raw['date-tag'] ?? new Date().toISOString().slice(0, 10),
    output: raw.output ?? null,
  };
}

export { classifyNpcLootSource };

export function evaluateMimicFamilyLoot(rows, mimicContract = null) {
  return evaluateMimicFamilyRows(rows, mimicContract);
}

export function evaluateCollectiveBucketRows(rows = []) {
  return rows
    .map((row) => ({ ...row, classification: classifyNpcLootSource(row) }))
    .filter((row) => row.classification.status === 'generic_bucket');
}

export function buildNpcLootCorrectnessReport({ sourceRows = [], mimicVariantStates = [] } = {}) {
  const mimicContract = evaluateMimicFamilyRows(sourceRows);
  const classifiedRows = sourceRows.map((row) => ({
    ...row,
    classification: classifyNpcLootSource(row),
  }));
  const acceptedVariantRows = classifiedRows.filter((row) =>
    MIMIC_VARIANTS.includes(row.sourceRefInternalName)
    && row.classification.status === 'accepted'
    && row.classification.reason === 'variant_exact_npc_source'
  );
  const acceptedVariantCountByName = countAcceptedVariantRowsByName(acceptedVariantRows);
  const blockedVariants = mimicVariantStates
    .filter((state) => MIMIC_VARIANTS.includes(state.internalName))
    .filter((state) => (acceptedVariantCountByName.get(state.internalName) ?? 0) === 0)
    .filter((state) =>
      Number(state.localLootCount ?? 0) === 0
      && Number(state.relationLootCount ?? 0) === 0
      && Number(state.projectionLootCount ?? 0) === 0
    )
    .map((state) => ({
      ...state,
      status: 'blocked',
      reason: 'variant_specific_source_missing',
    }));
  const pollutedVariants = mimicVariantStates
    .filter((state) => MIMIC_VARIANTS.includes(state.internalName))
    .map((state) => ({
      ...state,
      acceptedVariantItemInternalNames: acceptedVariantRows
        .filter((row) => row.sourceRefInternalName === state.internalName)
        .map((row) => row.itemInternalName)
        .filter(Boolean),
    }))
    .filter((state) => variantHasUnbackedLoot(state, acceptedVariantCountByName.get(state.internalName) ?? 0))
    .map((state) => ({
      ...state,
      status: 'fail',
      reason: 'variant_loot_count_not_backed_by_exact_source_rows',
      acceptedVariantRows: acceptedVariantCountByName.get(state.internalName) ?? 0,
    }));

  const contractMismatch = classifiedRows.filter((row) => row.classification.status === 'contract_mismatch');
  const genericBucket = classifiedRows.filter((row) => row.classification.status === 'generic_bucket');
  const nonNpcSourceMisclassified = classifiedRows.filter((row) => row.classification.status === 'non_npc_source_misclassified');
  const blockingCount = contractMismatch.length + genericBucket.length + nonNpcSourceMisclassified.length + pollutedVariants.length;

  return {
    auditName: 'npc-loot-correctness-gate',
    generatedAt: new Date().toISOString(),
    auditStatus: blockingCount > 0 || mimicContract.auditStatus !== 'pass' ? 'blocked' : 'pass',
    evidenceHealth: 'sufficient',
    checks: [
      ...mimicContract.checks,
      {
        id: 'generic_bucket_no_unreviewed_promotion',
        status: genericBucket.length === 0 ? 'pass' : 'fail',
        rows: genericBucket,
      },
      {
        id: 'non_npc_source_not_promoted',
        status: nonNpcSourceMisclassified.length === 0 ? 'pass' : 'fail',
        rows: nonNpcSourceMisclassified,
      },
      {
        id: 'mimic_variants_explicitly_blocked',
        status: pollutedVariants.length === 0 ? 'pass' : 'fail',
        rows: blockedVariants,
        pollutedRows: pollutedVariants,
      },
      {
        id: 'mimic_variants_have_exact_source',
        status: acceptedVariantRows.length > 0 || blockedVariants.length > 0 ? 'pass' : 'warning',
        rows: acceptedVariantRows,
      },
    ],
    mimicCorrectness: {
      ordinaryMimic: mimicContract.ordinaryMimic,
      blockedVariants,
      pollutedVariants,
      acceptedVariantRows,
      mismatchRows: mimicContract.mismatchRows,
    },
    sourceRefPollution: {
      genericBucketRows: genericBucket,
      nonNpcSourceRows: nonNpcSourceMisclassified,
    },
    summary: {
      totalRows: classifiedRows.length,
      accepted: classifiedRows.filter((row) => row.classification.status === 'accepted').length,
      contractMismatch: contractMismatch.length,
      genericBucket: genericBucket.length,
      nonNpcSourceMisclassified: nonNpcSourceMisclassified.length,
      blockedVariants: blockedVariants.length,
      pollutedVariants: pollutedVariants.length,
      acceptedVariantRows: acceptedVariantRows.length,
      blockingCount,
    },
  };
}

export async function runNpcLootCorrectnessGate(options = {}, dependencies = {}) {
  const normalized = normalizeOptions(options);

  if (dependencies.sourceRows || dependencies.mimicVariantStates) {
    return {
      report: buildNpcLootCorrectnessReport({
        sourceRows: dependencies.sourceRows ?? [],
        mimicVariantStates: dependencies.mimicVariantStates ?? [],
      }),
      reportPath: null,
    };
  }

  let connection = dependencies.connection ?? null;
  let shouldClose = false;
  try {
    if (!connection) {
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

    const [sourceRows, mimicVariantStates] = await Promise.all([
      loadPromotedNpcLootRows(connection, normalized),
      loadMimicVariantStates(connection, normalized),
    ]);
    const report = buildNpcLootCorrectnessReport({ sourceRows, mimicVariantStates });
    report.options = sanitizeOptions(normalized);
    let reportPath = null;
    if (normalized.writeReport) {
      reportPath = await writeReport(report, normalized);
    }
    return { report, reportPath };
  } catch (error) {
    const report = buildBlockedReport(normalized, error);
    let reportPath = null;
    if (normalized.writeReport) {
      reportPath = await writeReport(report, normalized);
    }
    return { report, reportPath };
  } finally {
    if (shouldClose && connection) {
      await connection.end();
    }
  }
}

export async function loadPromotedNpcLootRows(connection, options = {}) {
  const normalized = normalizeOptions(options);
  const relationDatabase = table(normalized.relationDatabase, 'item_npc_loot_relations');
  const detailsTable = table(normalized.relationDatabase, 'item_source_details');
  const [rows] = await connection.query(`
    SELECT
      r.item_internal_name AS itemInternalName,
      r.item_name AS itemName,
      COALESCE(d.source_ref_name, r.npc_name, r.npc_internal_name) AS sourceRefName,
      d.source_ref_internal_name AS sourceRefInternalName,
      d.source_ref_resolution AS sourceRefResolution,
      r.npc_internal_name AS npcInternalName,
      r.record_key AS relationRecordKey,
      r.source_fact_key AS sourceFactKey
    FROM ${relationDatabase} r
    LEFT JOIN ${detailsTable} d
      ON d.source_fact_key = r.source_fact_key
    WHERE r.deleted = 0
      AND r.status = 1
    ORDER BY r.npc_internal_name, r.item_internal_name, r.record_key
  `);
  return rows;
}

function countAcceptedVariantRowsByName(rows = []) {
  const counts = new Map();
  for (const row of rows) {
    const internalName = row?.sourceRefInternalName;
    if (!internalName) continue;
    counts.set(internalName, (counts.get(internalName) ?? 0) + 1);
  }
  return counts;
}

function variantHasUnbackedLoot(state = {}, acceptedVariantRows = 0) {
  const acceptedItems = normalizeItemSet(state.acceptedVariantItemInternalNames);
  const materializedItemSets = [
    normalizeItemSet(state.localItemInternalNames),
    normalizeItemSet(state.relationItemInternalNames),
    normalizeItemSet(state.projectionItemInternalNames),
  ];
  if (acceptedItems.size > 0 && materializedItemSets.some((items) => items.size > 0)) {
    return materializedItemSets
      .filter((items) => items.size > 0)
      .some((items) => !sameSet(items, acceptedItems));
  }

  const counts = [
    Number(state.localLootCount ?? 0),
    Number(state.relationLootCount ?? 0),
    Number(state.projectionLootCount ?? 0),
  ];
  const maxCount = Math.max(...counts);
  if (acceptedVariantRows <= 0) {
    return maxCount > 0;
  }
  return counts.some((count) => count > 0 && count !== acceptedVariantRows);
}

function normalizeItemSet(values) {
  const list = Array.isArray(values)
    ? values
    : typeof values === 'string'
      ? values.split(',')
      : [];
  return new Set(list
    .map((value) => String(value ?? '').trim())
    .filter(Boolean));
}

function sameSet(left, right) {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

export async function loadMimicVariantStates(connection, options = {}) {
  const normalized = normalizeOptions(options);
  const targets = [...MIMIC_CONTROLS, ...MIMIC_VARIANTS];
  const placeholders = targets.map(() => '?').join(', ');
  const localNpcs = table(normalized.localDatabase, 'npcs');
  const localLoot = table(normalized.localDatabase, 'npc_loot_entries');
  const relationLoot = table(normalized.relationDatabase, 'item_npc_loot_relations');
  const projectionNpcs = table(normalized.relationDatabase, 'projection_npcs');
  const [rows] = await connection.query(
    `
    SELECT
      n.internal_name AS internalName,
      n.game_id AS gameId,
      n.name AS name,
      COUNT(DISTINCT l.id) AS localLootCount,
      GROUP_CONCAT(DISTINCT li.internal_name ORDER BY li.internal_name SEPARATOR ',') AS localItemInternalNames,
      (
        SELECT COUNT(*)
        FROM ${relationLoot} r
        WHERE r.deleted = 0
          AND r.status = 1
          AND r.npc_internal_name COLLATE utf8mb4_unicode_ci = n.internal_name COLLATE utf8mb4_unicode_ci
      ) AS relationLootCount,
      (
        SELECT GROUP_CONCAT(DISTINCT r.item_internal_name ORDER BY r.item_internal_name SEPARATOR ',')
        FROM ${relationLoot} r
        WHERE r.deleted = 0
          AND r.status = 1
          AND r.npc_internal_name COLLATE utf8mb4_unicode_ci = n.internal_name COLLATE utf8mb4_unicode_ci
      ) AS relationItemInternalNames,
      COALESCE(JSON_LENGTH(p.loot_items_json), 0) AS projectionLootCount,
      p.loot_items_json AS projectionLootItemsJson
    FROM ${localNpcs} n
    LEFT JOIN ${localLoot} l
      ON l.npc_id = n.id AND l.deleted = 0
    LEFT JOIN ${table(normalized.localDatabase, 'items')} li
      ON li.id = l.item_id AND li.deleted = 0
    LEFT JOIN ${projectionNpcs} p
      ON p.internal_name COLLATE utf8mb4_unicode_ci = n.internal_name COLLATE utf8mb4_unicode_ci
     AND p.deleted = 0
     AND p.status = 1
    WHERE n.internal_name IN (${placeholders})
    GROUP BY n.internal_name, n.game_id, n.name, p.loot_items_json
    ORDER BY n.internal_name
    `,
    targets
  );
  return rows.map((row) => ({
    ...row,
    projectionItemInternalNames: extractProjectionItemInternalNames(row.projectionLootItemsJson),
  }));
}

function extractProjectionItemInternalNames(value) {
  if (!value) return [];
  try {
    const rows = JSON.parse(String(value));
    if (!Array.isArray(rows)) return [];
    return rows
      .map((row) => row?.itemInternalName ?? row?.internalName ?? row?.item_internal_name)
      .map((itemInternalName) => String(itemInternalName ?? '').trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function writeReport(report, options = {}) {
  const normalized = normalizeOptions(options);
  const reportPath = normalized.output
    ? path.resolve(normalized.output)
    : path.join(repoRoot, 'reports', 'audit', `npc-loot-correctness-gate-${normalized.dateTag}.json`);
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
  return reportPath;
}

function buildBlockedReport(options, error) {
  return {
    auditName: 'npc-loot-correctness-gate',
    generatedAt: new Date().toISOString(),
    options: sanitizeOptions(options),
    auditStatus: 'blocked',
    evidenceHealth: 'db_unavailable',
    checks: [
      {
        id: 'db_connection',
        status: 'fail',
        message: error?.message ?? String(error),
      },
    ],
    mimicCorrectness: {
      ordinaryMimic: {
        acceptedItems: [],
        missingItems: [],
        extraItems: [],
      },
      blockedVariants: [],
      pollutedVariants: [],
      acceptedVariantRows: [],
      mismatchRows: [],
    },
    sourceRefPollution: {
      genericBucketRows: [],
      nonNpcSourceRows: [],
    },
    summary: {
      totalRows: 0,
      accepted: 0,
      contractMismatch: 0,
      genericBucket: 0,
      nonNpcSourceMisclassified: 0,
      blockedVariants: 0,
      pollutedVariants: 0,
      acceptedVariantRows: 0,
      blockingCount: 1,
    },
    error: {
      message: error?.message ?? String(error),
      code: error?.code ?? null,
    },
  };
}

function normalizeOptions(options = {}) {
  return {
    maintDatabase: options.maintDatabase ?? 'terria_v1_maint',
    relationDatabase: options.relationDatabase ?? 'terria_v1_relation',
    localDatabase: options.localDatabase ?? 'terria_v1_local',
    writeReport: options.writeReport ?? true,
    dateTag: options.dateTag ?? new Date().toISOString().slice(0, 10),
    output: options.output ?? null,
  };
}

function sanitizeOptions(options = {}) {
  return {
    maintDatabase: options.maintDatabase,
    relationDatabase: options.relationDatabase,
    localDatabase: options.localDatabase,
    writeReport: options.writeReport,
    dateTag: options.dateTag,
    output: options.output,
  };
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

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runNpcLootCorrectnessGate(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify({ reportPath: result.reportPath, ...result.report }, null, 2));
  if (result.report.auditStatus === 'blocked') {
    process.exitCode = 1;
  }
}
