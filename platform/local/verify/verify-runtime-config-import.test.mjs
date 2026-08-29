import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const scripts = [
  'platform/local/verify/verify-module-api-smoke.mjs',
  'platform/local/verify/verify-article-comments-api-smoke.mjs',
];

test('local verify scripts import the canonical runtime config helper', () => {
  for (const script of scripts) {
    const source = fs.readFileSync(script, 'utf8');
    assert.match(source, /from ['"]\.\.\/\.\.\/\.\.\/scripts\/lib\/local-runtime-config\.mjs['"]/u, script);
    assert.doesNotMatch(source, /from ['"]\.\.\/\.\.\/lib\/local-runtime-config\.mjs['"]/u, script);
  }
});
