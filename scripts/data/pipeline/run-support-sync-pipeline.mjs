#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCliArgs } from '../lib/wiki-item-utils.mjs';
import {
  buildCategorySyncArgs,
  buildImageSyncArgs,
  buildLocalizationArgs
} from './support-sync-args.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const options = parseCliArgs(process.argv.slice(2));

runScript(
  'scripts/data/workflow/run-zh-enrich.mjs',
  buildLocalizationArgs(options),
  'support localization sync'
);
runScript(
  'scripts/data/workflow/run-image-sync.mjs',
  buildImageSyncArgs(options),
  'support image sync'
);
runScript(
  'scripts/data/sync/sync-item-categories-from-wiki-pages.mjs',
  buildCategorySyncArgs(options),
  'support category sync'
);

console.log('Support sync pipeline finished successfully');

function runScript(scriptPath, args, label) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    throw new Error(`Failed during ${label}`);
  }
}
