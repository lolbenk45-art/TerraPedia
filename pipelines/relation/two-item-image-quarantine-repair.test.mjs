import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTwoItemImageQuarantineRepairPlan,
  executeTwoItemImageQuarantineRepairTransaction,
  validateTwoItemImageQuarantineRepairPreview,
} from './two-item-image-quarantine-repair.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;

function row({ internalName, replacement = false }) {
  const cachedUrl = `/terrapedia-images/items/old-${internalName}.png`;
  return {
    id: internalName === 'FallenStar' ? 75 : 3398,
    internalName,
    sourceFileTitle: `${internalName}.png`,
    sourcePage: internalName,
    sourceRevisionTimestamp: '2026-08-20T00:00:00Z',
    originalUrl: `https://terraria.wiki.gg/images/${internalName}.png`,
    objectReplacement: replacement ? {
      managedUrl: '/terrapedia-images/items/new-severed-hand-banner.png',
      sha256: HASH,
      contentType: 'image/png',
      width: 12,
      height: 28,
    } : null,
    layers: {
      maint: { id: 1, beforeCachedUrl: cachedUrl },
      relation: { id: 2, beforeCachedUrl: cachedUrl },
      local: { id: 3, beforeCachedUrl: cachedUrl },
      projection: { id: 4, beforeImage: cachedUrl },
      item: { id: internalName === 'FallenStar' ? 75 : 3398, beforeImage: cachedUrl },
    },
  };
}

function preview() {
  return {
    schemaVersion: 1,
    operationId: 'canonical-two-item-image-quarantine-repair',
    scope: { rows: [row({ internalName: 'FallenStar' }), row({ internalName: 'SeveredHandBanner', replacement: true })] },
  };
}

test('accepts the exact two-item scope with replacement limited to SeveredHandBanner', () => {
  const value = preview();
  assert.doesNotThrow(() => validateTwoItemImageQuarantineRepairPreview(value));
  const plan = buildTwoItemImageQuarantineRepairPlan(value);
  assert.equal(plan.rows.length, 2);
  assert.equal(plan.rows[0].cachedUrlAfter, plan.rows[0].cachedUrlBefore);
  assert.equal(plan.rows[1].cachedUrlAfter, '/terrapedia-images/items/new-severed-hand-banner.png');
  assert.equal(plan.rows[1].itemImageAfter, '/terrapedia-images/items/new-severed-hand-banner.png');
  assert.equal(plan.rows[0].itemImageAfter, plan.rows[0].layers.item.beforeImage);
});

test('rejects an object replacement for FallenStar', () => {
  const value = preview();
  value.scope.rows[0].objectReplacement = structuredClone(value.scope.rows[1].objectReplacement);
  assert.throws(() => validateTwoItemImageQuarantineRepairPreview(value), /FallenStar.*replacement/i);
});

test('rejects any identity other than the two quarantined records', () => {
  const value = preview();
  value.scope.rows[1].internalName = 'CopperShortsword';
  assert.throws(() => validateTwoItemImageQuarantineRepairPreview(value), /identity/i);
});

test('transaction locks before permit, rolls back on an affected-row mismatch, and does not commit', async () => {
  const plan = buildTwoItemImageQuarantineRepairPlan(preview());
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async execute() { events.push('update'); return [{ affectedRows: 0 }]; },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
  };
  await assert.rejects(() => executeTwoItemImageQuarantineRepairTransaction({
    connection,
    plan,
    readCurrent: async () => ({ rows: plan.rows }),
    readback: async () => ({ rows: plan.rows }),
    consumeDispatchPermit: async () => events.push('permit'),
  }), /affected row/i);
  assert.deepEqual(events, ['begin', 'permit', 'update', 'rollback']);
});
