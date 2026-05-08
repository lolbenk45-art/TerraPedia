import test from 'node:test';
import assert from 'node:assert/strict';

import { isManagedUrl, isManagedUrlForEntity, resolveEntityManagedUrlPrefixes } from './minio-image-upload.mjs';

test('entity-specific managed prefixes should not treat items URLs as npc/projectile canonical hits', () => {
  const npcPrefixes = ['http://localhost:9000/terrapedia-images/npcs'];
  const projectilePrefixes = ['http://localhost:9000/terrapedia-images/projectiles'];

  assert.equal(isManagedUrl('http://localhost:9000/terrapedia-images/items/guide.png', npcPrefixes), false);
  assert.equal(isManagedUrl('http://localhost:9000/terrapedia-images/items/wooden-arrow.png', projectilePrefixes), false);
  assert.equal(isManagedUrl('http://localhost:9000/terrapedia-images/npcs/guide.png', npcPrefixes), true);
  assert.equal(isManagedUrl('http://localhost:9000/terrapedia-images/projectiles/wooden-arrow.png', projectilePrefixes), true);
});

test('resolveEntityManagedUrlPrefixes filters managed prefixes to the requested domain', () => {
  const prefixes = [
    'http://localhost:9000/terrapedia-images/items',
    'http://localhost:9000/terrapedia-images/npcs',
    'http://localhost:9000/terrapedia-images/bosses'
  ];

  assert.deepEqual(resolveEntityManagedUrlPrefixes('bosses', prefixes), [
    'http://localhost:9000/terrapedia-images/bosses'
  ]);
});

test('resolveEntityManagedUrlPrefixes derives entity suffix from generic bucket root prefixes', () => {
  const prefixes = ['http://localhost:9000/terrapedia-images'];

  assert.deepEqual(resolveEntityManagedUrlPrefixes('bosses', prefixes), [
    'http://localhost:9000/terrapedia-images/bosses'
  ]);
});

test('isManagedUrlForEntity rejects cross-domain managed URLs', () => {
  const prefixes = [
    'http://localhost:9000/terrapedia-images/npcs',
    'http://localhost:9000/terrapedia-images/bosses'
  ];

  assert.equal(
    isManagedUrlForEntity('http://localhost:9000/terrapedia-images/npcs/lunar-tower-solar.png', 'bosses', prefixes),
    false
  );
  assert.equal(
    isManagedUrlForEntity('http://localhost:9000/terrapedia-images/bosses/lunar-tower-solar.png', 'bosses', prefixes),
    true
  );
});
