import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ENTRYPOINTS = [
  new URL('./audit-recipe-provider-suppression-by-item.mjs', import.meta.url),
  new URL('./audit-wiki-zh-recipe-source-coverage.mjs', import.meta.url)
];

for (const entrypoint of ENTRYPOINTS) {
  test(`${entrypoint.pathname.split('/').at(-1)} resolves mysql2 through the repository loader`, () => {
    const source = fs.readFileSync(entrypoint, 'utf8');

    assert.match(source, /import \{ loadMysqlModule \} from '\.\.\/lib\/mysql-module\.mjs';/);
    assert.match(source, /const mysql = loadMysqlModule\(\);/);
    assert.doesNotMatch(source, /createRequire\(import\.meta\.url\)/);
  });
}
