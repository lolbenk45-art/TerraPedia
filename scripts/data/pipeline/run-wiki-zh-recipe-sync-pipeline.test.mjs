import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('recipe pipeline database stages resolve mysql2 through the declared package loader', () => {
  const stages = [
    'scripts/data/import/import-wiki-zh-recipes-to-db.mjs',
    'scripts/data/backfill/backfill-recipe-zh-display-names.mjs',
    'scripts/data/sync/consolidate-recipe-provider-priority.mjs',
  ];

  for (const relativePath of stages) {
    const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
    assert.match(source, /import \{ loadMysqlModule \} from '\.\.\/lib\/mysql-module\.mjs';/);
    assert.match(source, /const mysql = loadMysqlModule\(\);/);
    assert.doesNotMatch(source, /createRequire\(import\.meta\.url\)/);
  }
});
