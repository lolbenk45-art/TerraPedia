import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveArmorSetDetailPath } from './entity-audit-api-path.mjs';

test('resolveArmorSetDetailPath uses the first valid armor set id', () => {
  assert.equal(resolveArmorSetDetailPath([{ id: 236 }]), '/admin/armor-sets/236');
});

test('resolveArmorSetDetailPath returns null when no valid id exists', () => {
  assert.equal(resolveArmorSetDetailPath([{ id: null }]), null);
});
