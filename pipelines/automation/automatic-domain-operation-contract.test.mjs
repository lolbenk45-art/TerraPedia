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

test('Items and Projectiles are immutable dry-run lanes', () => {
  for (const domain of ['items', 'projectiles']) {
    const config = requireAutoDomainOperation(domain);
    assert.equal(config.databaseMode, 'DRY_RUN');
    assert.deepEqual(config.ownedTables, []);
  }
});

test('the remaining six domains require activation-gated database apply', () => {
  for (const domain of ['npcs', 'buffs', 'armor_sets', 'audio', 'bosses', 'shimmer']) {
    const config = requireAutoDomainOperation(domain);
    assert.equal(config.databaseMode, 'ACTIVATION_GATED_APPLY');
    assert.ok(config.ownedTables.length > 0);
  }
});

test('unknown domains fail closed', () => {
  assert.throws(() => requireAutoDomainOperation('npc_loot'), /unsupported automatic domain/);
});
