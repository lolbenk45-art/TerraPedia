import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DOMAIN_IMAGE_PROJECTION_CONFIG,
  buildDomainImageProjectionChanges,
  buildDomainImageProjectionUpdateSql,
} from './domain-image-projection-contract.mjs';

test('domain image contract limits each lane to its projection image column', () => {
  assert.deepEqual(DOMAIN_IMAGE_PROJECTION_CONFIG.npcs, {
    table: 'projection_npcs',
    projectionColumn: 'image_url',
    relationTable: 'relation_npc_images',
    relationKey: 'npc_internal_name',
    projectionKey: 'internal_name',
  });
  assert.deepEqual(DOMAIN_IMAGE_PROJECTION_CONFIG.projectiles, {
    table: 'projection_projectiles',
    projectionColumn: 'image_url',
    relationTable: 'relation_projectile_images',
    relationKey: 'projectile_internal_name',
    projectionKey: 'internal_name',
  });
});

test('domain image proposal excludes sentinel identities and emits only changed managed rows', () => {
  const result = buildDomainImageProjectionChanges({
    domain: 'npcs',
    relationRows: [
      { internalName: 'Guide', cachedUrl: '/terrapedia-images/npcs/1.png' },
      { internalName: 'None', cachedUrl: '/terrapedia-images/npcs/2.png' },
    ],
    projectionRows: [
      { internalName: 'Guide', imageUrl: 'http://localhost:9000/old.gif' },
      { internalName: 'None', imageUrl: null },
    ],
    managedPrefixes: ['http://localhost:9000/terrapedia-images/npcs/'],
    quarantinedIdentities: ['None'],
  });
  assert.deepEqual(result.rows, [{ internalName: 'Guide', before: 'http://localhost:9000/old.gif', after: '/terrapedia-images/npcs/1.png' }]);
  assert.equal(result.excludedCount, 1);
});

test('domain image SQL updates only the configured projection image column', () => {
  const sql = buildDomainImageProjectionUpdateSql('npcs');
  assert.match(sql, /UPDATE `projection_npcs`/);
  assert.match(sql, /SET `image_url` = \?/);
  assert.doesNotMatch(sql, /relation_npc_images/);
  assert.doesNotMatch(sql, /INSERT|DROP|ALTER/i);
});
