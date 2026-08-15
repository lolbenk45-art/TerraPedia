import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../../nuxt.config.ts', import.meta.url), 'utf8');

test('public Nuxt config delegates the dev port to project constants', () => {
  assert.match(source, /project-constants\.mjs/);
  assert.doesNotMatch(source, /port:\s*5176/);
});
