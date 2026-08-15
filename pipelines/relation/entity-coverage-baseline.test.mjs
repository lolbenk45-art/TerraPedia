import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  resolveMysqlRequirePath
} from './entity-coverage-baseline.mjs';

test('resolveMysqlRequirePath resolves mysql2 relative to apps/admin-console package manifest', () => {
  const relativePath = path.relative(process.cwd(), resolveMysqlRequirePath()).replaceAll(path.sep, '/');

  assert.equal(relativePath, 'apps/admin-console/package.json');
});
