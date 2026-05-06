#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

import { getProjectRoot } from '../lib/project-root.mjs';
import { parseCliArgs } from '../lib/wiki-item-utils.mjs';
import { buildIndependentEntityFetchArgs, buildIndependentEntityImportArgs } from './independent-entity-sync-args.mjs';

const repoRoot = getProjectRoot();

const options = parseCliArgs(process.argv.slice(2));

runScript('scripts/data/workflow/run-wiki-sync.mjs', buildIndependentEntityFetchArgs(), 'independent entity fetch');
runScript('scripts/data/transform/standardize-existing-data.mjs', [], 'standardize independent entities');
runScript('scripts/data/import/import-independent-entities-to-db.mjs', buildIndependentEntityImportArgs(options), 'independent entity import');

console.log('Independent entity sync pipeline finished successfully');

function runScript(scriptPath, args, label) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    throw new Error(`Failed during ${label}`);
  }
}
