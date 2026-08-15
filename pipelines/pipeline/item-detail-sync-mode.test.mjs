import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveItemDetailSyncMode } from './item-detail-sync-mode.mjs';

test('resolveItemDetailSyncMode keeps apply mode by default', () => {
  assert.deepEqual(resolveItemDetailSyncMode({}), {
    dryRun: false,
    skipItemImport: false,
    skipRelationImport: false,
    bossLootDryRun: false
  });
});

test('resolveItemDetailSyncMode turns pipeline dry-run into non-writing mode', () => {
  assert.deepEqual(resolveItemDetailSyncMode({ 'dry-run': 'true' }), {
    dryRun: true,
    skipItemImport: true,
    skipRelationImport: true,
    bossLootDryRun: true
  });
});

test('resolveItemDetailSyncMode keeps explicit boss loot dry-run override', () => {
  assert.deepEqual(resolveItemDetailSyncMode({ 'dry-run': 'true', 'boss-loot-dry-run': 'false' }), {
    dryRun: true,
    skipItemImport: true,
    skipRelationImport: true,
    bossLootDryRun: false
  });
});
