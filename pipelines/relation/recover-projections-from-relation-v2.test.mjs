import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PROJECTION_RECOVERY_V2_OPERATION_ID,
  PROJECTION_RECOVERY_V2_ALLOW_LIST,
  buildProjectionRecoveryPlan,
  applyBossImageOverrides,
  applyProjectionPreservation,
} from './recover-projections-from-relation-v2.mjs';

test('binds projection recovery to the five projection tables and managed image policy', () => {
  const plan = buildProjectionRecoveryPlan({
    relationBundleSha256: `sha256:${'a'.repeat(64)}`,
    managedImageUrlPrefixes: ['http://localhost:9000/terrapedia-images/'],
    counts: { projectionItems: 6146, projectionNpcs: 762, projectionBosses: 33, projectionProjectiles: 1111, projectionBuffs: 388 },
  });

  assert.equal(plan.operationId, PROJECTION_RECOVERY_V2_OPERATION_ID);
  assert.deepEqual(plan.allowList, [...PROJECTION_RECOVERY_V2_ALLOW_LIST]);
  assert.deepEqual(plan.managedImageUrlPrefixes, ['http://localhost:9000/terrapedia-images/']);
  assert.equal(plan.databaseWrites, true);
  assert.equal(plan.networkAccess, false);
});

test('applies local Boss images using the projection English title when code is absent', () => {
  const projectionBosses = [{ code: null, nameEn: 'Solar Pillar', imageUrl: null }];
  applyBossImageOverrides({
    projectionBosses,
    localBossImages: [{ code: 'SOLAR_PILLAR', image_url: 'http://localhost:9000/terrapedia-images/bosses/solar.png' }],
  });

  assert.equal(projectionBosses[0].imageUrl, 'http://localhost:9000/terrapedia-images/bosses/solar.png');
});

test('preserves existing projectile and buff source JSON when relation source rows are absent', () => {
  const payload = {
    projectionProjectiles: [{ internalName: 'WoodenArrowFriendly', sourceItemsJson: '[]', sourceNpcsJson: '[]', imageUrl: null }],
    projectionBuffs: [{ internalName: 'ObsidianSkin', sourceItemsJson: '[]', inflictingNpcsJson: '[]', image: null }],
  };
  applyProjectionPreservation({
    payload,
    preservedProjectionRows: {
      projection_projectiles: [{
        internal_name: 'WoodenArrowFriendly',
        source_items_json: '[{"itemId":39}]',
        source_npcs_json: '[{"npcId":22}]',
        image_url: 'http://localhost:9000/terrapedia-images/projectiles/arrow.png',
      }],
      projection_buffs: [{
        internal_name: 'ObsidianSkin',
        source_items_json: '[{"itemId":288}]',
        inflicting_npcs_json: '[]',
        image: 'http://localhost:9000/terrapedia-images/buffs/obsidian.png',
      }],
    },
  });

  assert.equal(payload.projectionProjectiles[0].sourceItemsJson, '[{"itemId":39}]');
  assert.equal(payload.projectionProjectiles[0].sourceNpcsJson, '[{"npcId":22}]');
  assert.equal(payload.projectionProjectiles[0].imageUrl, 'http://localhost:9000/terrapedia-images/projectiles/arrow.png');
  assert.equal(payload.projectionBuffs[0].sourceItemsJson, '[{"itemId":288}]');
  assert.equal(payload.projectionBuffs[0].image, 'http://localhost:9000/terrapedia-images/buffs/obsidian.png');
});
