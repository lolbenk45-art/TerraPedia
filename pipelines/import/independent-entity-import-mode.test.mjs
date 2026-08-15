import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveIndependentEntityImportApply } from './independent-entity-import-mode.mjs';

test('resolveIndependentEntityImportApply keeps apply mode by default', () => {
  assert.equal(resolveIndependentEntityImportApply({}), true);
});

test('resolveIndependentEntityImportApply disables writes for dry-run', () => {
  assert.equal(resolveIndependentEntityImportApply({ 'dry-run': 'true' }), false);
});

test('resolveIndependentEntityImportApply disables writes for explicit apply=false', () => {
  assert.equal(resolveIndependentEntityImportApply({ apply: 'false' }), false);
});
