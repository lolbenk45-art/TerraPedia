#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertPrimaryDb } from '../lib/base-domain-primary-db-guard.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import { parseCliArgs, writeJson } from '../lib/wiki-item-utils.mjs';

const __filename = fileURLToPath(import.meta.url);

export const BASE_DOMAIN_TABLES = [
  'items',
  'item_images',
  'item_acquisition_sources',
  'item_biomes',
  'category',
  'item_category_rel',
  'npcs',
  'npc_loot_entries',
  'npc_biomes',
  'npc_shop_entries',
  'npc_shop_conditions',
  'buffs',
  'buff_source_items',
  'biomes',
  'biome_resources',
  'boss_groups',
  'projectiles',
  'armor_sets',
  'armor_set_items',
  'world_contexts',
  'recipes',
  'recipe_ingredients',
  'recipe_stations',
  'crafting_stations',
  'audio_assets',
  'audio_asset_links',
  'shimmer_item_transforms',
  'shimmer_npc_transforms',
  'shimmer_item_decrafters',
  'shimmer_coin_luck',
];

export function buildBaselinePlan({
  database = 'terria_v1_local',
  outputDir = path.join('reports', 'data', 'base-domain-baseline'),
  timestamp = new Date().toISOString().replace(/[:.]/g, '-'),
  allowNonPrimaryDb = false,
} = {}) {
  assertPrimaryDb(database, true, allowNonPrimaryDb);
  const sqlPath = path.join(outputDir, `base-domain-counts-${timestamp}.sql`);
  const dumpPath = path.join(outputDir, `base-domain-${timestamp}.sql`);
  const tables = [...BASE_DOMAIN_TABLES];

  return {
    generatedAt: new Date().toISOString(),
    database,
    outputDir,
    tables,
    executesDatabaseCommands: false,
    mysqldumpCommand: [
      'mysqldump',
      '--single-transaction',
      '--skip-lock-tables',
      quoteShell(database),
      ...tables.map(quoteShell),
      '>',
      quoteShell(dumpPath),
    ].join(' '),
    countAndUpdatedAtSql: buildCountAndUpdatedAtSql(tables),
    countAndUpdatedAtSqlPath: sqlPath,
  };
}

export function buildCountAndUpdatedAtSql(tables = BASE_DOMAIN_TABLES) {
  return tables
    .map((table) => `SELECT '${escapeSqlLiteral(table)}' AS table_name, COUNT(*) AS row_count, MAX(updated_at) AS max_updated_at FROM \`${table}\``)
    .join('\nUNION ALL\n')
    + ';\n';
}

function quoteShell(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function escapeSqlLiteral(value) {
  return String(value).replace(/'/g, "''");
}

async function main(argv = process.argv.slice(2)) {
  const repoRoot = getProjectRoot();
  const args = parseCliArgs(argv);
  const outputDir = path.resolve(repoRoot, args.output ?? args.outputDir ?? path.join('reports', 'data', 'base-domain-baseline'));
  const plan = buildBaselinePlan({
    database: args.database ?? process.env.TERRAPEDIA_DB_NAME ?? 'terria_v1_local',
    outputDir,
    allowNonPrimaryDb: booleanOption(args['allow-non-primary-db'] ?? process.env.TERRAPEDIA_ALLOW_NON_PRIMARY_DB, false),
  });
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(plan.countAndUpdatedAtSqlPath, plan.countAndUpdatedAtSql, 'utf8');
  const reportPath = path.join(outputDir, 'base-domain-baseline-plan.json');
  writeJson(reportPath, { ...plan, reportPath });
  console.log(JSON.stringify({ reportPath, sqlPath: plan.countAndUpdatedAtSqlPath, mysqldumpCommand: plan.mysqldumpCommand }, null, 2));
}

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  return fallback;
}

if (process.argv[1] === __filename) {
  main().catch((error) => {
    console.error('[build-base-domain-ingest-baseline-plan] failed');
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}
