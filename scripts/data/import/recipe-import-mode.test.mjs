import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveRecipeImportApply } from './recipe-import-mode.mjs';

test('resolveRecipeImportApply defaults to dry-run mode', () => {
  assert.equal(resolveRecipeImportApply({}), false);
});

test('resolveRecipeImportApply disables writes for dry-run', () => {
  assert.equal(resolveRecipeImportApply({ 'dry-run': 'true' }), false);
});

test('resolveRecipeImportApply enables writes only for explicit apply=true', () => {
  assert.equal(resolveRecipeImportApply({ apply: 'true' }), true);
});

test('resolveRecipeImportApply lets dry-run override explicit apply', () => {
  assert.equal(resolveRecipeImportApply({ apply: 'true', 'dry-run': 'true' }), false);
});

test('resolveRecipeImportApply disables writes for explicit apply=false', () => {
  assert.equal(resolveRecipeImportApply({ apply: 'false' }), false);
});
