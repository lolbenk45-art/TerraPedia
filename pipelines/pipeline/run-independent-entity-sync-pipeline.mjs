#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

import { getProjectRoot } from '../lib/project-root.mjs';
import { parseCliArgs } from '../lib/wiki-item-utils.mjs';
import { buildIndependentEntityFetchArgs, buildIndependentEntityImportArgs } from './independent-entity-sync-args.mjs';

const repoRoot = getProjectRoot();

const options = parseCliArgs(process.argv.slice(2));

runScript('pipelines/workflow/run-wiki-sync.mjs', buildIndependentEntityFetchArgs(options.entity), 'independent entity fetch');
runScript('pipelines/transform/standardize-existing-data.mjs', [], 'standardize independent entities');
runScript('pipelines/import/import-independent-entities-to-db.mjs', buildIndependentEntityImportArgs({ ...options, entity: options.entity }), 'independent entity import');

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
