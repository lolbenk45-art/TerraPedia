import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { getProjectConstants } from '../../scripts/lib/project-constants.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const retiredPaths = [
  'back',
  'front-nuxt',
  'data-query-app',
  'shared/article-runtime',
  'scripts/dev',
  'scripts/ops',
  'scripts/tooling',
  'scripts/data',
];

test('the closed compatibility window has no live alias contract or consumer', () => {
  const constants = getProjectConstants();

  assert.equal(constants.compatibility.migrationStatus, 'closed');
  assert.equal('aliases' in constants.compatibility, false);
  assert.equal('legacyPath' in constants.applications.publicWeb, false);
  assert.equal('legacyStart' in constants.commands, false);

  for (const relativePath of retiredPaths) {
    assert.equal(fs.existsSync(path.join(repoRoot, relativePath)), false, `retired path remains: ${relativePath}`);
  }

  const authE2eRunner = fs.readFileSync(path.join(repoRoot, 'platform/local/run-user-auth-e2e.sh'), 'utf8');
  assert.equal(authE2eRunner.includes('$repo_root/back'), false);
});
