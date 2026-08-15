import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { getProjectConstants } from './project-constants.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const retiredPaths = [
  'front-nuxt',
  'data-query-app',
  'back',
  'shared/article-runtime',
  'scripts/dev',
  'scripts/ops',
  'scripts/tooling',
  'scripts/data',
];
const canonicalPaths = [
  'apps/public-web',
  'apps/admin-console',
  'services/catalog-api',
  'packages/content-runtime',
  'pipelines',
  'platform/local',
  'platform/operations',
  'platform/tooling',
  'scripts/lib',
];

test('structure compatibility window is closed at the filesystem boundary', () => {
  const constants = getProjectConstants();

  assert.equal(constants.compatibility.migrationStatus, 'closed');
  assert.equal('aliases' in constants.compatibility, false);
  for (const relativePath of retiredPaths) {
    assert.equal(
      fs.existsSync(path.join(repoRoot, relativePath)),
      false,
      `retired path still exists: ${relativePath}`,
    );
  }
  for (const relativePath of canonicalPaths) {
    const stat = fs.lstatSync(path.join(repoRoot, relativePath));
    assert.equal(stat.isDirectory(), true, `canonical path is not a directory: ${relativePath}`);
    assert.equal(stat.isSymbolicLink(), false, `canonical path is a symlink: ${relativePath}`);
  }
});
