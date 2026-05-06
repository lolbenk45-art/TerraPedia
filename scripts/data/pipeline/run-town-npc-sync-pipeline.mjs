#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { getProjectRoot } from '../lib/project-root.mjs';
import { parseCliArgs } from '../lib/wiki-item-utils.mjs';
import { buildTownNpcFetchArgs, buildTownNpcImportArgs } from './town-npc-sync-args.mjs';

const repoRoot = getProjectRoot();

const options = parseCliArgs(process.argv.slice(2));
const fetchScriptPath = path.join(repoRoot, 'scripts', 'data', 'fetch', 'fetch-wiki-town-npc-maintenance.py');
const importScriptPath = path.join(repoRoot, 'scripts', 'data', 'import', 'import-wiki-town-npcs-to-db.mjs');

const fetchArgs = buildTownNpcFetchArgs(options);
const importArgs = buildTownNpcImportArgs({
  input: options.output,
  apply: options.apply
});

runScript('python', fetchScriptPath, fetchArgs, 'town npc fetch');
runScript(process.execPath, importScriptPath, importArgs, 'town npc import');
console.log('Town NPC sync pipeline finished successfully');

function runScript(command, scriptPath, args, label) {
  const result = spawnSync(command, [scriptPath, ...args], {
    cwd: repoRoot,
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    throw new Error(`Failed during ${label}`);
  }
}
