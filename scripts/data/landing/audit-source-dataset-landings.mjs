#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { resolveProjectPath } from '../lib/project-root.mjs';

const repoRoot = resolveProjectPath();
const require = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'));
const mysql = require('mysql2/promise');

const LANDING_INTEGRITY_COUNT_KEYS = [
  'duplicateCurrentIdentityCount',
  'governedCurrentMissingIdentityCount',
  'governedCompatExportCount',
  'duplicateBootstrapManifestCount',
];

function parseArgs(argv) {
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

function formatDateTag(value) {
  const date = value instanceof Date ? value : new Date(value);
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function buildQualifiedCountSql(databaseName, tableName) {
  return `SELECT COUNT(*) AS total FROM \`${databaseName}\`.\`${tableName}\``;
}

export function buildDomainAuditPlan(compareDatabase) {
  return [
    { datasetType: 'items_raw', localTable: 'items', compareDatabase, compareTable: 'items' },
    { datasetType: 'npcs_raw', localTable: 'npcs', compareDatabase, compareTable: 'npcs' },
    { datasetType: 'projectiles_raw', localTable: 'projectiles', compareDatabase, compareTable: 'projectiles' },
    { datasetType: 'armor_sets_raw', localTable: 'armor_sets', compareDatabase, compareTable: 'armor_sets' },
    { datasetType: 'buffs_raw', localTable: 'buffs', compareDatabase, compareTable: 'buffs' },
    { datasetType: 'bosses_raw', localTable: 'boss_groups', compareDatabase, compareTable: 'boss_groups' },
    { datasetType: 'biomes_raw', localTable: 'biomes', compareDatabase, compareTable: 'biomes' },
    { datasetType: 'categories_raw', localTable: 'category', compareDatabase, compareTable: 'category' },
    { datasetType: 'recipes_raw', localTable: 'recipes', compareDatabase, compareTable: 'recipes' },
  ];
}

export function resolveAuditDatabases(args = {}, env = process.env, databaseConfig = {}) {
  const primaryDatabase = args.database
    ?? env.TERRAPEDIA_DB_NAME
    ?? databaseConfig.name
    ?? 'terria_v1_local';
  return {
    primaryDatabase,
    compareDatabase: args['compare-db'] ?? env.TERRAPEDIA_COMPARE_DB_NAME ?? primaryDatabase,
  };
}

export function buildLandingIntegrityQueries() {
  return [
    {
      id: 'duplicateCurrentIdentityCount',
      sql: `SELECT COUNT(*) AS total
FROM (
  SELECT dataset_type, provider, source_key, source_page
  FROM source_dataset_landings
  WHERE current_slot = 1
  GROUP BY dataset_type, provider, source_key, source_page
  HAVING COUNT(*) > 1
) duplicate_currents`,
    },
    {
      id: 'governedCurrentMissingIdentityCount',
      sql: `SELECT COUNT(*) AS total
FROM source_dataset_landings
WHERE dataset_type = 'item_groups_raw'
  AND current_slot = 1
  AND (
    artifact_role IS NULL
    OR producer_id IS NULL
    OR producer_version IS NULL
    OR producer_run_key IS NULL
    OR full_file_content_hash IS NULL
    OR full_file_byte_size IS NULL
  )`,
    },
    {
      id: 'governedCompatExportCount',
      sql: `SELECT COUNT(*) AS total
FROM source_dataset_landings
WHERE dataset_type = 'item_groups_raw'
  AND artifact_role = 'compat_export'`,
    },
    {
      id: 'duplicateBootstrapManifestCount',
      sql: `SELECT COUNT(*) AS total
FROM (
  SELECT dataset_type, provider, source_key, source_page, bootstrap_manifest_hash
  FROM source_dataset_landings
  WHERE bootstrap_manifest_hash IS NOT NULL
  GROUP BY dataset_type, provider, source_key, source_page, bootstrap_manifest_hash
  HAVING COUNT(*) > 1
) duplicate_bootstraps`,
    },
  ];
}

export async function queryLandingIntegrityCounts(connection) {
  const counts = {};
  for (const { id, sql } of buildLandingIntegrityQueries()) {
    const [rows] = await connection.query(sql);
    const rawTotal = rows?.[0]?.total;
    const total = ['number', 'string'].includes(typeof rawTotal) && String(rawTotal).trim()
      ? Number(rawTotal)
      : Number.NaN;
    if (rows?.length !== 1 || !Number.isFinite(total)) {
      throw new Error(`landing integrity query rejected: ${id} must return one numeric total`);
    }
    counts[id] = total;
  }
  return counts;
}

export function buildLandingAuditSummary({
  generatedAt,
  landingByType = [],
  landingByProvider = [],
  businessTableCounts = [],
  integrityCounts = {},
}) {
  const byType = {};
  let totalRows = 0;
  for (const row of landingByType) {
    const datasetType = row.datasetType ?? row.dataset_type;
    const total = Number(row.total ?? 0);
    byType[datasetType] = total;
    totalRows += total;
  }

  const byProvider = {};
  for (const row of landingByProvider) {
    const provider = row.provider;
    byProvider[provider] = Number(row.total ?? 0);
  }

  const business = {};
  for (const row of businessTableCounts) {
    business[row.datasetType] = {
      localTable: row.localTable,
      localCount: Number(row.localCount ?? 0),
      compareDatabase: row.compareDatabase,
      compareTable: row.compareTable,
      compareCount: Number(row.compareCount ?? 0),
      deltaLocalMinusCompare: Number(row.localCount ?? 0) - Number(row.compareCount ?? 0),
    };
  }

  const normalizedIntegrityCounts = Object.fromEntries(
    LANDING_INTEGRITY_COUNT_KEYS.map((key) => [key, Number(integrityCounts[key] ?? 0)]),
  );
  const blockingCount = Object.values(normalizedIntegrityCounts).filter((count) => count !== 0).length;

  return {
    generatedAt,
    landing: {
      totalRows,
      byType,
      byProvider,
    },
    integrity: {
      status: blockingCount > 0 ? 'blocked' : 'pass',
      blockingCount,
      ...normalizedIntegrityCounts,
    },
    business,
  };
}

async function queryCount(connection, databaseName, tableName) {
  const [rows] = await connection.query(buildQualifiedCountSql(databaseName, tableName));
  return Number(rows[0]?.total ?? 0);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadLocalStackConfig(repoRoot);
  const { primaryDatabase, compareDatabase } = resolveAuditDatabases(args, process.env, config.database);
  const generatedAt = new Date().toISOString();
  const reportPath = path.resolve(
    repoRoot,
    args.output ?? path.join('reports', `source-dataset-landing-audit-${formatDateTag(generatedAt)}.json`),
  );

  const connection = await mysql.createConnection({
    host: args.host ?? process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
    port: Number(args.port ?? process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 3306),
    user: args.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
    password: args.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
    database: primaryDatabase,
  });

  try {
    const [landingByType] = await connection.query(
      `SELECT dataset_type AS datasetType, COUNT(*) AS total
       FROM source_dataset_landings
       WHERE current_slot = 1
       GROUP BY dataset_type
       ORDER BY dataset_type`,
    );
    const [landingByProvider] = await connection.query(
      `SELECT provider, COUNT(*) AS total
       FROM source_dataset_landings
       WHERE current_slot = 1
       GROUP BY provider
       ORDER BY provider`,
    );
    const integrityCounts = await queryLandingIntegrityCounts(connection);

    const businessTableCounts = [];
    for (const planEntry of buildDomainAuditPlan(compareDatabase)) {
      businessTableCounts.push({
        ...planEntry,
        localCount: await queryCount(connection, primaryDatabase, planEntry.localTable),
        compareCount: await queryCount(connection, compareDatabase, planEntry.compareTable),
      });
    }

    const summary = buildLandingAuditSummary({
      generatedAt,
      landingByType,
      landingByProvider,
      businessTableCounts,
      integrityCounts,
    });

    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(summary, null, 2), 'utf8');
    console.log(JSON.stringify({ reportPath, ...summary }, null, 2));
  } finally {
    await connection.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
