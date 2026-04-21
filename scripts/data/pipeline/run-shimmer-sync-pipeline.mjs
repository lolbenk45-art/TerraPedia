#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCliArgs } from '../lib/wiki-item-utils.mjs';
import { buildShimmerImportArgs } from './shimmer-sync-args.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const options = parseCliArgs(process.argv.slice(2));

runScript('scripts/data/pipeline/run-wiki-shimmer-extraction-pipeline.mjs', [], 'shimmer extract');
runScript(
  'scripts/data/import/import-wiki-shimmer-to-db.mjs',
  buildShimmerImportArgs(options),
  'shimmer import'
);

console.log('Shimmer sync pipeline finished successfully');

function runScript(scriptPath, args, label) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    throw new Error(`Failed during ${label}`);
  }
}
