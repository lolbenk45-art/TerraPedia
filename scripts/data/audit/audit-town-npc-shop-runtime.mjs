#!/usr/bin/env node

import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import { parseCliArgs } from '../lib/wiki-item-utils.mjs';

const repoRoot = getProjectRoot();
const require = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'));
const mysql = require('mysql2/promise');

function assertIdentifier(value, label) {
  if (!/^[A-Za-z0-9_]+$/.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

function table(database, tableName) {
  assertIdentifier(database, 'database');
  assertIdentifier(tableName, 'table');
  return `\`${database}\`.\`${tableName}\``;
}

export function buildTownNpcShopRuntimeQueries({ database = 'terria_v1_local' } = {}) {
  const npcs = table(database, 'npcs');
  const shopEntries = table(database, 'npc_shop_entries');
  const shopConditions = table(database, 'npc_shop_conditions');
  const worldContexts = table(database, 'world_contexts');
  const conditionTerms = table(database, 'condition_terms');
  const gamePeriods = table(database, 'game_period');
  const items = table(database, 'items');
  const biomes = table(database, 'biomes');

  return [
    {
      id: 'town_npc_count',
      sql: `SELECT COUNT(*) AS total FROM ${npcs} WHERE deleted = 0 AND is_town_npc = 1`,
    },
    {
      id: 'shop_entry_count',
      sql: `SELECT COUNT(*) AS total FROM ${shopEntries} WHERE deleted = 0`,
    },
    {
      id: 'shop_entries_with_price_count',
      sql: `SELECT COUNT(*) AS total
FROM ${shopEntries}
WHERE deleted = 0
  AND price_text IS NOT NULL
  AND TRIM(price_text) <> ''`,
    },
    {
      id: 'shop_condition_count',
      sql: `SELECT COUNT(*) AS total FROM ${shopConditions}`,
    },
    {
      id: 'merchant_shop_entry_count',
      sql: `SELECT COUNT(*) AS total
FROM ${shopEntries} s
JOIN ${npcs} n ON n.id = s.npc_id
WHERE n.internal_name = 'Merchant' AND s.deleted = 0`,
    },
    {
      id: 'merchant_price_missing_count',
      sql: `SELECT COUNT(*) AS total
FROM ${shopEntries} s
JOIN ${npcs} n ON n.id = s.npc_id
WHERE n.internal_name = 'Merchant'
  AND s.deleted = 0
  AND (s.price_text IS NULL OR TRIM(s.price_text) = '')`,
    },
    {
      id: 'town_npc_missing_price_count',
      sql: `SELECT COUNT(*) AS total
FROM ${shopEntries} s
JOIN ${npcs} n ON n.id = s.npc_id
WHERE n.is_town_npc = 1
  AND n.deleted = 0
  AND s.deleted = 0
  AND (s.price_text IS NULL OR TRIM(s.price_text) = '')`,
    },
    {
      id: 'unreadable_shop_condition_count',
      sql: `SELECT COUNT(*) AS total
FROM ${shopConditions} c
JOIN ${shopEntries} s ON s.id = c.shop_entry_id
JOIN ${npcs} n ON n.id = s.npc_id
LEFT JOIN ${worldContexts} wc ON c.ref_type = 'WORLD_CONTEXT' AND wc.id = c.ref_id
LEFT JOIN ${conditionTerms} ct ON c.ref_type = 'CONDITION_TERM' AND ct.id = c.ref_id
LEFT JOIN ${gamePeriods} gp ON c.ref_type = 'GAME_PERIOD' AND gp.id = c.ref_id
LEFT JOIN ${npcs} rn ON c.ref_type = 'NPC' AND rn.id = c.ref_id
LEFT JOIN ${items} ri ON c.ref_type = 'ITEM' AND ri.id = c.ref_id
LEFT JOIN ${biomes} b ON c.ref_type = 'BIOME' AND b.id = c.ref_id
WHERE n.is_town_npc = 1
  AND s.deleted = 0
  AND COALESCE(wc.name_zh, wc.name_en, ct.name_zh, ct.name_en, gp.display_name_zh, gp.display_name_en, rn.name_zh, rn.name, ri.name_zh, ri.name, b.name_zh, b.name_en, c.notes, '') = ''`,
    },
  ];
}

export function buildTownNpcShopRuntimeReport({
  generatedAt = new Date().toISOString(),
  database = 'terria_v1_local',
  totals = {},
} = {}) {
  const summary = {
    townNpcCount: numberValue(totals.town_npc_count),
    shopEntryCount: numberValue(totals.shop_entry_count),
    shopEntriesWithPriceCount: numberValue(totals.shop_entries_with_price_count),
    shopConditionCount: numberValue(totals.shop_condition_count),
    merchantShopEntryCount: numberValue(totals.merchant_shop_entry_count),
    merchantPriceMissingCount: numberValue(totals.merchant_price_missing_count),
  };
  const townNpcMissingPriceCount = numberValue(totals.town_npc_missing_price_count);
  const unreadableShopConditionCount = numberValue(totals.unreadable_shop_condition_count);
  const failures = [];

  if (townNpcMissingPriceCount > 0) {
    failures.push({
      id: 'town_npc_missing_price',
      message: `${townNpcMissingPriceCount} town NPC shop rows are missing price_text.`,
      count: townNpcMissingPriceCount,
    });
  }
  if (summary.shopEntryCount > 0 && summary.shopConditionCount === 0) {
    failures.push({
      id: 'town_npc_shop_conditions_missing',
      message: 'Town NPC shop availability exists in source data but npc_shop_conditions is empty.',
      count: 0,
    });
  }
  if (unreadableShopConditionCount > 0) {
    failures.push({
      id: 'town_npc_shop_condition_unreadable',
      message: `${unreadableShopConditionCount} town NPC shop condition rows have no joined label and no notes fallback.`,
      count: unreadableShopConditionCount,
    });
  }

  return {
    generatedAt,
    database,
    status: failures.length > 0 ? 'fail' : 'pass',
    summary,
    diagnostics: {
      townNpcMissingPriceCount,
      unreadableShopConditionCount,
    },
    failures,
  };
}

export async function runTownNpcShopRuntimeAudit(options = {}, dependencies = {}) {
  const normalized = {
    database: options.database ?? 'terria_v1_local',
    generatedAt: options.generatedAt ?? new Date().toISOString(),
  };
  const queries = buildTownNpcShopRuntimeQueries({ database: normalized.database });
  const totals = {};

  if (dependencies.query) {
    for (const definition of queries) {
      totals[definition.id] = firstTotal(await dependencies.query(definition));
    }
    return buildTownNpcShopRuntimeReport({ ...normalized, totals });
  }

  const config = loadLocalStackConfig(repoRoot);
  const connection = await mysql.createConnection({
    host: options.host ?? process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
    port: Number(options.port ?? process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 3306),
    user: options.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
    password: options.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
    database: normalized.database,
  });
  try {
    for (const definition of queries) {
      const [rows] = await connection.query(definition.sql);
      totals[definition.id] = firstTotal(rows);
    }
    return buildTownNpcShopRuntimeReport({ ...normalized, totals });
  } finally {
    await connection.end();
  }
}

function firstTotal(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return numberValue(list[0]?.total ?? list[0]?.count);
}

function numberValue(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseArgs(argv) {
  const args = parseCliArgs(argv);
  return {
    database: args.database ?? 'terria_v1_local',
    generatedAt: args.generatedAt ?? args['generated-at'] ?? null,
    host: args.host,
    port: args.port,
    user: args.user,
    password: args.password,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const report = await runTownNpcShopRuntimeAudit(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'pass') {
    process.exitCode = 1;
  }
}
