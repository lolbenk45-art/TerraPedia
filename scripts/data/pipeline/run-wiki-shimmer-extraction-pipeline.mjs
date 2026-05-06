#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { getProjectRoot } from '../lib/project-root.mjs';
import { parseCliArgs } from '../lib/wiki-item-utils.mjs';

const repoRoot = getProjectRoot();
const options = parseCliArgs(process.argv.slice(2));

const fetchScriptPath = path.join(repoRoot, 'scripts', 'data', 'fetch', 'fetch-wiki-shimmer-page.mjs');
const transformScriptPath = path.join(repoRoot, 'scripts', 'data', 'transform', 'transform-wiki-shimmer-to-importable.mjs');

const fetchArgs = [];
if (typeof options.api === 'string' && options.api.trim() !== '') fetchArgs.push(`--api=${options.api.trim()}`);
if (typeof options.page === 'string' && options.page.trim() !== '') fetchArgs.push(`--page=${options.page.trim()}`);
if (typeof options.input === 'string' && options.input.trim() !== '') fetchArgs.push(`--output=${path.resolve(repoRoot, options.input.trim())}`);

const transformArgs = [];
if (typeof options.api === 'string' && options.api.trim() !== '') transformArgs.push(`--api=${options.api.trim()}`);
if (typeof options.items === 'string' && options.items.trim() !== '') transformArgs.push(`--items=${path.resolve(repoRoot, options.items.trim())}`);
if (typeof options.npcs === 'string' && options.npcs.trim() !== '') transformArgs.push(`--npcs=${path.resolve(repoRoot, options.npcs.trim())}`);
if (typeof options.output === 'string' && options.output.trim() !== '') transformArgs.push(`--output=${path.resolve(repoRoot, options.output.trim())}`);
if (typeof options.input === 'string' && options.input.trim() !== '') transformArgs.push(`--input=${path.resolve(repoRoot, options.input.trim())}`);

runScript(fetchScriptPath, fetchArgs, 'wiki shimmer fetch');
runScript(transformScriptPath, transformArgs, 'wiki shimmer transform');
console.log('Wiki shimmer extraction pipeline finished successfully');

function runScript(scriptPath, args, label) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    throw new Error(`Failed during ${label}`);
  }
}
