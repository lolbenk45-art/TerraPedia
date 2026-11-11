import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AUTO_DOMAIN_OPERATION_CONFIG,
  requireAutoDomainOperation,
} from './automatic-domain-operation-contract.mjs';

test('automatic operation contract covers exactly the eight scheduler domains', () => {
  assert.deepEqual(Object.keys(AUTO_DOMAIN_OPERATION_CONFIG).sort(), [
    'armor_sets',
    'audio',
    'bosses',
    'buffs',
    'items',
    'npcs',
    'projectiles',
    'shimmer',
  ]);
});

test('Items and Projectiles use activation-gated base-table applies', () => {
  for (const domain of ['items', 'projectiles']) {
    const config = requireAutoDomainOperation(domain);
    assert.equal(config.databaseMode, 'ACTIVATION_GATED_APPLY');
    assert.deepEqual(config.ownedTables, [{ databaseRole: 'local', table: domain }]);
  }
});

test('all eight domains require activation-gated database apply', () => {
  for (const domain of ['items', 'npcs', 'projectiles', 'buffs', 'armor_sets', 'audio', 'bosses', 'shimmer']) {
    const config = requireAutoDomainOperation(domain);
    assert.equal(config.databaseMode, 'ACTIVATION_GATED_APPLY');
    assert.ok(config.ownedTables.length > 0);
  }
});

test('Buff automatic owned tables preserve the persisted policy order', () => {
  assert.deepEqual(requireAutoDomainOperation('buffs').ownedTables, [
    { databaseRole: 'local', table: 'buff_source_items' },
    { databaseRole: 'local', table: 'buffs' },
  ]);
});

test('unknown domains fail closed', () => {
  assert.throws(() => requireAutoDomainOperation('npc_loot'), /unsupported automatic domain/);
});
