#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { getProjectRoot } from '../lib/project-root.mjs';
import { parseCliArgs, sharedDataPath } from '../lib/wiki-item-utils.mjs';

const repoRoot = getProjectRoot();

const options = parseCliArgs(process.argv.slice(2));
const scriptPath = path.join(repoRoot, 'scripts', 'data', 'import', 'import-boss-loot-to-db.mjs');
const args = [];

if (typeof options.input === 'string' && options.input.trim() !== '') {
  args.push(`--input=${options.input.trim()}`);
}
if (typeof options.bundle === 'string' && options.bundle.trim() !== '') {
  args.push(`--bundle=${options.bundle.trim()}`);
}
if (typeof options.relations === 'string' && options.relations.trim() !== '') {
  args.push(`--relations=${options.relations.trim()}`);
} else {
  args.push(`--relations=${sharedDataPath('normalized', 'item-relations.bundle.json')}`);
}
if (typeof options.npcs === 'string' && options.npcs.trim() !== '') {
  args.push(`--npcs=${options.npcs.trim()}`);
} else {
  args.push(`--npcs=${sharedDataPath('raw', 'wiki', 'module__npcinfo__data.parsed.latest.json')}`);
}
if (typeof options['report-json'] === 'string' && options['report-json'].trim() !== '') {
  args.push(`--report-json=${options['report-json'].trim()}`);
}
if (booleanOption(options['dry-run'], false)) {
  args.push('--dry-run=true');
}
if (booleanOption(options['regenerate-bundle'] ?? options.regenerateBundle, true)) {
  args.push('--regenerate-bundle=true');
}
if (booleanOption(options.strict, false)) {
  args.push('--strict=true');
}
if (booleanOption(options['allow-non-primary-db'], false)) {
  args.push('--allow-non-primary-db=true');
}
for (const key of ['host', 'port', 'user', 'password', 'database']) {
  if (typeof options[key] === 'string' && options[key].trim() !== '') {
    args.push(`--${key}=${options[key].trim()}`);
  }
}

const result = spawnSync(process.execPath, [scriptPath, ...args], {
  cwd: repoRoot,
  stdio: 'inherit'
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log('Boss loot sync pipeline finished successfully');

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
