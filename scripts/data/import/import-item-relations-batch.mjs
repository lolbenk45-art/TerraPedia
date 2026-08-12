#!/usr/bin/env node
/**
 * Batch item-relations import via direct DB (runStandardizedImportWithConnection).
 * Processes 4 pre-built bundle parts in sequence.
 * Usage:
 *   node scripts/data/import/import-item-relations-batch.mjs --dry-run
 *   node scripts/data/import/import-item-relations-batch.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { runStandardizedImportWithConnection } from './import-standardized-to-db.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import { resolveSharedDataRoot } from '../lib/project-root.mjs';

// mysql2 is installed under data-query-app, not at the repo root —
// resolve from there so createRequire can find it.
const require = createRequire(
  new URL('../../../data-query-app/package.json', import.meta.url)
);
const mysql = require('mysql2/promise');

const sharedRoot = resolveSharedDataRoot();
const BUNDLES = [1, 2, 3, 4].map(
  (n) => path.join(sharedRoot, 'normalized', `item-relations.part${n}.bundle.json`)
);

const dryRun = !process.argv.includes('--apply');

const connConfig = {
  host: '127.0.0.1',
  port: 13306,
  user: 'root',
  password: 'root',
  database: 'terria_v1_local',
  multipleStatements: false,
};

console.log(`Mode: ${dryRun ? 'DRY-RUN (pass --apply to write)' : 'APPLY'}`);
console.log(`Bundles: ${BUNDLES.join(', ')}\n`);

let totalImages = 0, totalRecipes = 0, totalSources = 0;
let totalBiomes = 0, totalSnapshots = 0, totalErrors = 0;

for (let i = 0; i < BUNDLES.length; i++) {
  const bundlePath = BUNDLES[i];
  const bundleName = path.basename(bundlePath);
  console.log(`=== batch ${i + 1}/${BUNDLES.length}: ${bundleName} ===`);

  if (!fs.existsSync(bundlePath)) {
    console.error(`  Bundle not found: ${bundlePath}`);
    process.exit(1);
  }

  const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));

  const conn = await mysql.createConnection(connConfig);
  try {
    const report = await runStandardizedImportWithConnection(conn, {
      dryRun,
      datasets: {
        // items already in DB from slice import — skip item upsert, keep lookup
        itemsDataset: { records: [] },
        // bundle keys (itemImages/recipes/itemSources/biomes/itemBiomes/snapshots)
        // match relationsDataset.records exactly
        relationsDataset: { records: bundle },
      },
    });

    const s = report.summary;
    const batchErrors =
      (s.itemImages?.errors ?? 0) + (s.recipes?.errors ?? 0) +
      (s.itemSources?.errors ?? 0) + (s.itemBiomes?.errors ?? 0) +
      (s.snapshots?.errors ?? 0);

    console.log(`  itemImages:  in=${s.itemImages?.input ?? 0}  new=${s.itemImages?.created ?? 0}  upd=${s.itemImages?.updated ?? 0}  skip=${s.itemImages?.skipped ?? 0}  err=${s.itemImages?.errors ?? 0}`);
    console.log(`  recipes:     in=${s.recipes?.input ?? 0}  new=${s.recipes?.created ?? 0}  upd=${s.recipes?.updated ?? 0}  skip=${s.recipes?.skipped ?? 0}  err=${s.recipes?.errors ?? 0}`);
    console.log(`  itemSources: in=${s.itemSources?.input ?? 0}  new=${s.itemSources?.created ?? 0}  upd=${s.itemSources?.updated ?? 0}  skip=${s.itemSources?.skipped ?? 0}  err=${s.itemSources?.errors ?? 0}`);
    console.log(`  itemBiomes:  in=${s.itemBiomes?.input ?? 0}  new=${s.itemBiomes?.created ?? 0}  upd=${s.itemBiomes?.updated ?? 0}  skip=${s.itemBiomes?.skipped ?? 0}  err=${s.itemBiomes?.errors ?? 0}`);
    console.log(`  snapshots:   in=${s.snapshots?.input ?? 0}  new=${s.snapshots?.created ?? 0}  upd=${s.snapshots?.updated ?? 0}  skip=${s.snapshots?.skipped ?? 0}  err=${s.snapshots?.errors ?? 0}`);

    totalImages    += (s.itemImages?.created  ?? 0) + (s.itemImages?.updated  ?? 0);
    totalRecipes   += (s.recipes?.created     ?? 0) + (s.recipes?.updated     ?? 0);
    totalSources   += (s.itemSources?.created ?? 0) + (s.itemSources?.updated ?? 0);
    totalBiomes    += (s.itemBiomes?.created  ?? 0) + (s.itemBiomes?.updated  ?? 0);
    totalSnapshots += (s.snapshots?.created   ?? 0) + (s.snapshots?.updated   ?? 0);
    totalErrors    += batchErrors;

    if (batchErrors > 0) {
      console.error(`\n!! ${batchErrors} errors in batch ${i + 1} — aborting`);
      process.exit(1);
    }
  } finally {
    await conn.end();
  }
}

console.log(`\n=== TOTALS (${dryRun ? 'dry-run' : 'applied'}) ===`);
console.log(`  images=${totalImages}  recipes=${totalRecipes}  sources=${totalSources}  biomes=${totalBiomes}  snapshots=${totalSnapshots}  errors=${totalErrors}`);
if (totalErrors > 0) process.exit(1);
