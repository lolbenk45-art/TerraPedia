import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBuffApiRoutes, validateBuffApiResponse } from './run-full-recrawl-canonical-isolated.mjs';

test('Buff isolated API routes cover public list, detail, and admin readback only', () => {
  assert.deepEqual(buildBuffApiRoutes(1), [
    { routeId: 'public-buffs', params: {} },
    { routeId: 'public-buff-detail', params: { id: '1' } },
    { routeId: 'admin-buffs', params: {} },
  ]);
});

test('Buff API validators require exact 388-record list and source detail identity', () => {
  const acceptance = { apiExpectations: { totalBuffs: 388, detailId: 1, firstBuff: { sourceId: 1, internalName: 'ObsidianSkin' } } };
  for (const routeId of ['public-buffs', 'admin-buffs']) {
    const result = validateBuffApiResponse({
      routeId,
      payload: { success: true, data: [{ sourceId: 1, internalName: 'ObsidianSkin' }], pagination: { total: 388 } },
      acceptance,
    });
    assert.equal(result.totalBuffs, 388);
    assert.throws(() => validateBuffApiResponse({
      routeId,
      payload: { success: true, data: [{ sourceId: 2, internalName: 'Regeneration' }], pagination: { total: 389 } },
      acceptance,
    }), /total|identity/i);
  }
  assert.equal(validateBuffApiResponse({
    routeId: 'public-buff-detail',
    payload: { success: true, data: { id: 1, sourceId: 1, internalName: 'ObsidianSkin', sourceItems: [], inflictingNpcs: [], immuneNpcs: [] } },
    acceptance,
  }).identityVerified, true);
  assert.throws(() => validateBuffApiResponse({
    routeId: 'public-buff-detail',
    payload: { success: true, data: { id: 2, sourceId: 2, internalName: 'Regeneration', sourceItems: [], inflictingNpcs: [], immuneNpcs: [] } },
    acceptance,
  }), /identity|payload/i);
});
