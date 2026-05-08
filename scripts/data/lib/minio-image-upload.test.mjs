import test from 'node:test';
import assert from 'node:assert/strict';

import { isManagedUrl } from './minio-image-upload.mjs';

test('entity-specific managed prefixes should not treat items URLs as npc/projectile canonical hits', () => {
  const npcPrefixes = ['http://localhost:9000/terrapedia-images/npcs'];
  const projectilePrefixes = ['http://localhost:9000/terrapedia-images/projectiles'];

  assert.equal(isManagedUrl('http://localhost:9000/terrapedia-images/items/guide.png', npcPrefixes), false);
  assert.equal(isManagedUrl('http://localhost:9000/terrapedia-images/items/wooden-arrow.png', projectilePrefixes), false);
  assert.equal(isManagedUrl('http://localhost:9000/terrapedia-images/npcs/guide.png', npcPrefixes), true);
  assert.equal(isManagedUrl('http://localhost:9000/terrapedia-images/projectiles/wooden-arrow.png', projectilePrefixes), true);
});
