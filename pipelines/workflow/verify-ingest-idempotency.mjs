#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);

export const PLAN_A_IDEMPOTENCY_TEST_FILES = [
  'pipelines/lib/base-domain-row-reconcile.test.mjs',
  'pipelines/lib/base-domain-primary-db-guard.test.mjs',
  'pipelines/backfill/base-domain-manual-idempotency.test.mjs',
  'pipelines/backfill/backfill-npc-flags-from-standardized.test.mjs',
  'pipelines/import/import-biome-wikitext-resolved-to-db.test.mjs',
  'pipelines/import/import-biomes-to-db.test.mjs',
  'pipelines/import/import-boss-loot-to-db.test.mjs',
  'pipelines/import/import-buffs-to-db.test.mjs',
  'pipelines/import/import-independent-entities-to-db.test.mjs',
  'pipelines/import/import-normal-npc-loot-to-db.test.mjs',
  'pipelines/import/import-recipes-from-external-data.test.mjs',
  'pipelines/import/import-standardized-to-db.test.mjs',
  'pipelines/import/import-wiki-audio-assets-to-db.test.mjs',
  'pipelines/import/import-wiki-bosses-to-db.test.mjs',
  'pipelines/import/import-wiki-shimmer-to-db.test.mjs',
  'pipelines/import/import-wiki-town-npcs-to-db.test.mjs',
  'pipelines/import/import-wiki-zh-recipes-to-db.test.mjs',
  'pipelines/import/import-world-contexts-to-db.test.mjs',
  'pipelines/sync/sync-item-categories-from-wiki-pages.test.mjs',
  'pipelines/sync/sync-standardized-entities-to-db.test.mjs',
  'pipelines/workflow/build-base-domain-ingest-baseline-plan.test.mjs',
  'pipelines/workflow/verify-ingest-idempotency.test.mjs',
];

export function buildNodeTestArgs({ reporter = 'spec' } = {}) {
  return ['--test', `--test-reporter=${reporter}`, ...PLAN_A_IDEMPOTENCY_TEST_FILES];
}

async function main() {
  const child = spawn(process.execPath, buildNodeTestArgs(), {
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exitCode = code ?? 1;
  });
}

if (process.argv[1] === __filename) {
  main().catch((error) => {
    console.error('[verify-ingest-idempotency] failed');
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}
