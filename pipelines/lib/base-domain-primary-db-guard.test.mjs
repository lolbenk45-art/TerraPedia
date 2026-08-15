import test from 'node:test';
import assert from 'node:assert/strict';

import { assertPrimaryDb } from './base-domain-primary-db-guard.mjs';

test('assertPrimaryDb rejects non-local apply writes unless explicitly allowed', () => {
  assert.doesNotThrow(() => assertPrimaryDb('terria_v1_local', true, false));
  assert.doesNotThrow(() => assertPrimaryDb('terria_v1_maint', false, false));
  assert.throws(
    () => assertPrimaryDb('terria_v1_maint', true, false),
    /Refusing to write to non-primary database/
  );
  assert.doesNotThrow(() => assertPrimaryDb('terria_v1_maint', true, true));
});
