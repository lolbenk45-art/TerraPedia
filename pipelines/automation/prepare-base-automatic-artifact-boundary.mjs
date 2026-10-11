#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RELATIVE_ROOT = 'reports/authorization/canonical/automatic';
const REQUIRED_PRIVATE_ANCESTORS = new Set([
  'reports/authorization',
  'reports/authorization/canonical',
  RELATIVE_ROOT,
]);

export function prepareBaseAutomaticArtifactBoundary({ repoRoot, serviceUid = process.getuid?.() } = {}) {
  if (process.platform !== 'linux' || typeof process.getuid !== 'function') {
    throw new Error('base automatic artifact boundary requires a Linux service UID');
  }
  if (!Number.isInteger(serviceUid) || serviceUid < 0) {
    throw new Error('base automatic artifact boundary requires a valid service UID');
  }
  const root = path.resolve(requireText(repoRoot, 'repoRoot'));
  assertCanonicalDirectory(root, 'repository root');
  assertOwned(root, serviceUid, 'repository root');
  assertNotGroupWritable(root, 'repository root');

  const changedPaths = [];
  let current = root;
  for (const segment of RELATIVE_ROOT.split('/')) {
    current = path.join(current, segment);
    const relativePath = path.relative(root, current).replaceAll(path.sep, '/');
    if (!fs.existsSync(current)) {
      fs.mkdirSync(current, { mode: 0o700 });
      changedPaths.push(relativePath);
    }
    assertCanonicalDirectory(current, `base automatic artifact ancestor: ${relativePath}`);
    assertOwned(current, serviceUid, `base automatic artifact ancestor: ${relativePath}`);
    if (REQUIRED_PRIVATE_ANCESTORS.has(relativePath)) {
      const mode = fs.statSync(current).mode & 0o7777;
      if (mode !== 0o700) {
        fs.chmodSync(current, 0o700);
        changedPaths.push(relativePath);
      }
    } else {
      assertNotGroupWritable(current, `base automatic artifact ancestor: ${relativePath}`);
    }
  }

  return Object.freeze({
    repoRoot: root,
    relativeRoot: RELATIVE_ROOT,
    artifactRoot: current,
    serviceUid,
    changedPaths: Object.freeze(changedPaths),
  });
}

function assertCanonicalDirectory(directoryPath, label) {
  const stat = fs.lstatSync(directoryPath);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a canonical ordinary directory`);
  }
  if (path.resolve(fs.realpathSync(directoryPath)) !== path.resolve(directoryPath)) {
    throw new Error(`${label} must be a canonical ordinary directory`);
  }
}

function assertOwned(directoryPath, serviceUid, label) {
  const stat = fs.statSync(directoryPath);
  if (Number(stat.uid) !== Number(serviceUid)) {
    throw new Error(`${label} must be owned by the automation service UID`);
  }
}

function assertNotGroupWritable(directoryPath, label) {
  const stat = fs.statSync(directoryPath);
  if ((stat.mode & 0o022) !== 0) {
    throw new Error(`${label} must not be group/other writable`);
  }
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function parseArgs(argv) {
  const values = {};
  for (const token of argv) {
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`);
    const [key, ...rest] = token.slice(2).split('=');
    values[key] = rest.length ? rest.join('=') : 'true';
  }
  return values;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const args = parseArgs(process.argv.slice(2));
  const result = prepareBaseAutomaticArtifactBoundary({ repoRoot: args['repo-root'] ?? process.cwd() });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
