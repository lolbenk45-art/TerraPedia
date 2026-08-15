import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../nuxt.config.ts', import.meta.url), 'utf8');

test('admin Nuxt config delegates project defaults to the shared constants file', () => {
  assert.match(source, /project-constants\.mjs/);
  assert.doesNotMatch(source, /localhost:18088/);
  assert.doesNotMatch(source, /port:\s*3001/);
});
