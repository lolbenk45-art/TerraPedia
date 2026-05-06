#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

import { getProjectRoot } from '../lib/project-root.mjs';
import { parseCliArgs } from '../lib/wiki-item-utils.mjs';
import { buildBiomeImportArgs, shouldRunBiomeImport } from './biome-sync-args.mjs';

const repoRoot = getProjectRoot();

const options = parseCliArgs(process.argv.slice(2));
const wikiBiomesFile = options.wikiBiomesFile ?? options['wiki-biomes-file'] ?? 'data/generated/wiki-biomes.importable.latest.json';

runScript('scripts/data/fetch/fetch-wiki-biomes.mjs', [], 'biome fetch');
runScript('scripts/data/transform/transform-wiki-biomes-to-import.mjs', [], 'biome transform');

if (shouldRunBiomeImport(options)) {
  runScript('scripts/data/import/import-standardized-to-db.mjs', buildBiomeImportArgs({ ...options, wikiBiomesFile }), 'biome import');
} else {
  console.log('Biome import skipped because apply mode is not enabled');
}

console.log('Biome sync pipeline finished successfully');

function runScript(scriptPath, args, label) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    throw new Error(`Failed during ${label}`);
  }
}
