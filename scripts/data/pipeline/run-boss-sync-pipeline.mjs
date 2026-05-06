#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

import { getProjectRoot } from '../lib/project-root.mjs';
import { parseCliArgs } from '../lib/wiki-item-utils.mjs';
import { buildBossFetchArgs, buildBossImportArgs, buildBossLootArgs } from './boss-sync-args.mjs';

const repoRoot = getProjectRoot();

const options = parseCliArgs(process.argv.slice(2));
const bossOutputPath = options.outputJson ?? options['output-json'] ?? 'data/generated/wiki-bosses.latest.json';

runScript('scripts/data/fetch/fetch-wiki-bosses.mjs', buildBossFetchArgs({ ...options, outputJson: bossOutputPath }), 'boss fetch');
runScript('scripts/data/import/import-wiki-bosses-to-db.mjs', buildBossImportArgs({ ...options, input: bossOutputPath }), 'boss import');
runScript('scripts/data/pipeline/run-boss-loot-sync-pipeline.mjs', buildBossLootArgs(options), 'boss loot sync');

console.log('Boss sync pipeline finished successfully');

function runScript(scriptPath, args, label) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    throw new Error(`Failed during ${label}`);
  }
}
