#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

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

export function buildLandingAuditSummary({
  generatedAt,
  landingByType = [],
  landingByProvider = [],
  businessTableCounts = [],
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

  return {
    generatedAt,
    landing: {
      totalRows,
      byType,
      byProvider,
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
  const compareDatabase = args['compare-db'] ?? 'terria_v1_item_staging_20260413_r2';
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
    database: args.database ?? process.env.TERRAPEDIA_DB_NAME ?? config.database?.name ?? 'terria_v1_local',
  });

  try {
    const [landingByType] = await connection.query(
      `SELECT dataset_type AS datasetType, COUNT(*) AS total
       FROM source_dataset_landings
       WHERE is_current = 1
       GROUP BY dataset_type
       ORDER BY dataset_type`,
    );
    const [landingByProvider] = await connection.query(
      `SELECT provider, COUNT(*) AS total
       FROM source_dataset_landings
       WHERE is_current = 1
       GROUP BY provider
       ORDER BY provider`,
    );

    const businessTableCounts = [];
    for (const planEntry of buildDomainAuditPlan(compareDatabase)) {
      businessTableCounts.push({
        ...planEntry,
        localCount: await queryCount(connection, connection.config.database, planEntry.localTable),
        compareCount: await queryCount(connection, compareDatabase, planEntry.compareTable),
      });
    }

    const summary = buildLandingAuditSummary({
      generatedAt,
      landingByType,
      landingByProvider,
      businessTableCounts,
    });

    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(summary, null, 2), 'utf8');
    console.log(JSON.stringify({ reportPath, ...summary }, null, 2));
  } finally {
    await connection.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
