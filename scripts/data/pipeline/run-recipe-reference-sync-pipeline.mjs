#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCliArgs, sharedDataPath } from '../lib/wiki-item-utils.mjs';
import { buildRecipeReferenceImportArgs } from './recipe-reference-import-args.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

const options = parseCliArgs(process.argv.slice(2));
const buildScriptPath = path.join(repoRoot, 'scripts', 'data', 'fetch', 'build-item-relations-bundle.mjs');
const importRecipesScriptPath = path.join(repoRoot, 'scripts', 'data', 'import', 'import-recipes-from-external-data.mjs');
const auditScriptPath = path.join(repoRoot, 'scripts', 'data', 'audit', 'reconcile-live-recipe-coverage.mjs');

const relationsOutputPath = resolvePathOption(options['relations-output'] ?? options.output, sharedDataPath('normalized', 'item-relations.bundle.json'));
const recipeReferencePath = resolvePathOption(options['recipe-reference'], path.join(repoRoot, 'data', 'generated', 'recipe-material-reference.json'));

const buildArgs = [
  `--output=${relationsOutputPath}`,
  `--recipe-reference=${recipeReferencePath}`,
  '--refresh-recipe-reference=true'
];

if (typeof options.input === 'string' && options.input.trim() !== '') {
  buildArgs.push(`--input=${options.input.trim()}`);
}
if (typeof options['item-pages'] === 'string' && options['item-pages'].trim() !== '') {
  buildArgs.push(`--item-pages=${options['item-pages'].trim()}`);
}
if (typeof options['biome-pages'] === 'string' && options['biome-pages'].trim() !== '') {
  buildArgs.push(`--biome-pages=${options['biome-pages'].trim()}`);
}
if (typeof options.npcs === 'string' && options.npcs.trim() !== '') {
  buildArgs.push(`--npcs=${options.npcs.trim()}`);
}
if (typeof options.limit === 'string' && options.limit.trim() !== '') {
  buildArgs.push(`--limit=${options.limit.trim()}`);
}
if (typeof options.pages === 'string' && options.pages.trim() !== '') {
  buildArgs.push(`--pages=${options.pages.trim()}`);
}

runScript(buildScriptPath, buildArgs, 'recipe-reference bundle build');
runScript(auditScriptPath, [], 'live recipe reconciliation');

if (booleanOption(options['dry-run'] ?? options.dryRun, false) || booleanOption(options['skip-import'] ?? options.skipImport, false)) {
  console.log('Recipe reference sync pipeline finished without import');
  process.exit(0);
}

const importArgs = buildRecipeReferenceImportArgs(options, recipeReferencePath);
for (const key of ['host', 'port', 'user', 'password', 'database']) {
  if (typeof options[key] === 'string' && options[key].trim() !== '') {
    importArgs.push(`--${key}=${options[key].trim()}`);
  }
}

runScript(importRecipesScriptPath, importArgs, 'recipe db import');
runScript(auditScriptPath, importArgs, 'post-import live recipe reconciliation');
console.log('Recipe reference sync pipeline finished successfully');

function runScript(scriptPath, args, label, options = {}) {
  const result = spawnSync(process.execPath, [...(options.nodeArgs ?? []), scriptPath, ...args], {
    cwd: repoRoot,
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    throw new Error(`Failed during ${label}`);
  }
}

function resolvePathOption(value, fallback) {
  if (typeof value === 'string' && value.trim() !== '') {
    return path.resolve(repoRoot, value.trim());
  }
  return path.resolve(fallback);
}

function booleanOption(value, fallback) {
  if (value == null || value === '') {
    return fallback;
  }
  if (value === true || value === 'true' || value === '1' || value === 'yes') {
    return true;
  }
  if (value === false || value === 'false' || value === '0' || value === 'no') {
    return false;
  }
  return fallback;
}
