import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveSelectedEntities, runIndependentEntityImport } from './import-independent-entities-to-db.mjs';

test('independent importer accepts a single NPC selection', () => {
  assert.deepEqual([...resolveSelectedEntities({ entity: 'npcs' })], ['npcs']);
});

test('independent importer preserves the all-domain default', () => {
  assert.deepEqual([...resolveSelectedEntities({})], ['buffs', 'projectiles', 'armor_sets', 'npcs']);
});

test('independent importer rejects an unknown selection', () => {
  assert.throws(() => resolveSelectedEntities({ entity: 'loot' }), /Unsupported independent entity selection/);
});

test('caller-owned transactions cannot run a rollback-only dry-run', async () => {
  await assert.rejects(
    runIndependentEntityImport({ entity: 'npcs', 'dry-run': 'true' }, { transactionOwner: 'caller' }),
    /caller-owned independent import requires apply=true/,
  );
});
