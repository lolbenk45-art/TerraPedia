import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveRecipeImportApply } from './recipe-import-mode.mjs';

test('resolveRecipeImportApply keeps current import behavior by default', () => {
  assert.equal(resolveRecipeImportApply({}), true);
});

test('resolveRecipeImportApply disables writes for dry-run', () => {
  assert.equal(resolveRecipeImportApply({ 'dry-run': 'true' }), false);
});

test('resolveRecipeImportApply disables writes for explicit apply=false', () => {
  assert.equal(resolveRecipeImportApply({ apply: 'false' }), false);
});
