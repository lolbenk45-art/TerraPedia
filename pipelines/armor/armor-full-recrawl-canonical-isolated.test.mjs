import test from 'node:test';
import assert from 'node:assert/strict';

import { validateArmorApiResponse } from './run-armor-full-recrawl-canonical-isolated.mjs';

test('Armor public and admin list readback accepts only source-bound set identities', () => {
  const acceptance = { readback: { projectionArmorSets: 64 }, setTextKeys: ['ArmorSetBonus.Wood'] };
  const result = validateArmorApiResponse({
    routeId: 'public-armor-sets',
    payload: { success: true, data: [{ textKey: 'ArmorSetBonus.Wood' }], pagination: { total: 64 } },
    acceptance,
  });
  assert.equal(result.identityVerified, true);
  assert.equal(result.total, 64);

  assert.throws(() => validateArmorApiResponse({
    routeId: 'admin-armor-sets',
    payload: { success: true, data: [{ textKey: 'ArmorSetBonus.NotInSource' }], pagination: { total: 64 } },
    acceptance,
  }), /source set identities/);
});
