import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  buildReplacementReadinessAudit,
  resolveMysqlRequirePath
} from './replacement-readiness-audit.mjs';

test('resolveMysqlRequirePath resolves mysql2 relative to data-query-app package manifest', () => {
  const relativePath = path.relative(process.cwd(), resolveMysqlRequirePath()).replaceAll(path.sep, '/');

  assert.equal(relativePath, 'data-query-app/package.json');
});

test('buildReplacementReadinessAudit reports blocked domains and sample field gaps', () => {
  const actual = buildReplacementReadinessAudit({
    localData: {
      items: [
        { internal_name: 'IronPickaxe', name: 'Iron Pickaxe', name_zh: '铁镐', image: 'a.png', damage: 5, buy: 2000, rarity_id: 1 },
        { internal_name: 'CopperShortsword', name: 'Copper Shortsword', name_zh: '铜短剑', image: 'b.png', damage: 4, buy: 500, rarity_id: 0 }
      ],
      npcs: [
        { internal_name: 'Merchant', name: 'Merchant', name_zh: '商人', is_boss: 0 }
      ],
      projectiles: [],
      buffs: []
    },
    projectionData: {
      projection_items: [
        { internal_name: 'IronPickaxe', name: 'Iron Pickaxe', name_zh: null, image: 'a.png', damage: 5, buy: 2000, rarity_id: 1 },
        { internal_name: 'CopperShortsword', name: 'Copper Shortsword', name_zh: null, image: null, damage: 4, buy: 500, rarity_id: 0 }
      ],
      projection_npcs: [
        { internal_name: 'Merchant', name: 'Merchant', name_zh: null, is_boss: 0 }
      ],
      projection_projectiles: [],
      projection_buffs: []
    }
  });

  assert.equal(actual.domainResults.items.status, 'blocked');
  assert.equal(actual.domainResults.npcs.status, 'blocked');
  assert.ok(actual.domainResults.items.blockingFields.some((field) => field.field === 'name_zh'));
  assert.ok(actual.domainResults.items.blockingFields.some((field) => field.field === 'image'));
  assert.equal(actual.domainResults.items.missingInProjection.length, 0);
  assert.equal(actual.summary.switchableDomains.length, 2);
  assert.ok(actual.summary.blockedDomains.includes('items'));
  assert.ok(actual.summary.blockedDomains.includes('npcs'));
});

test('buildReplacementReadinessAudit blocks domains with projection-only keys', () => {
  const actual = buildReplacementReadinessAudit({
    localData: {
      items: [
        { internal_name: 'IronPickaxe', name: 'Iron Pickaxe' }
      ],
      npcs: [],
      projectiles: [],
      buffs: []
    },
    projectionData: {
      projection_items: [
        { internal_name: 'IronPickaxe', name: 'Iron Pickaxe' },
        { internal_name: 'ProjectionOnly', name: 'Projection Only' }
      ],
      projection_npcs: [],
      projection_projectiles: [],
      projection_buffs: []
    }
  });

  assert.equal(actual.domainResults.items.status, 'blocked');
  assert.equal(actual.domainResults.items.extraInProjectionCount, 1);
  assert.deepEqual(actual.domainResults.items.extraInProjection, ['ProjectionOnly']);
  assert.ok(actual.summary.blockedDomains.includes('items'));
});

test('buildReplacementReadinessAudit includes projectile source relation json fields', () => {
  const actual = buildReplacementReadinessAudit({
    localData: {
      items: [],
      npcs: [],
      projectiles: [
        {
          internal_name: 'WoodenArrowFriendly',
          source_items_json: '[{"internalName":"TrainingBow"}]',
          source_npcs_json: '[{"internalName":"TrainingTarget"}]'
        }
      ],
      buffs: []
    },
    projectionData: {
      projection_items: [],
      projection_npcs: [],
      projection_projectiles: [
        {
          internal_name: 'WoodenArrowFriendly',
          source_items_json: null,
          source_npcs_json: null
        }
      ],
      projection_buffs: []
    }
  });

  assert.equal(actual.domainResults.projectiles.status, 'blocked');
  assert.deepEqual(
    actual.domainResults.projectiles.blockingFields.map((field) => field.field),
    ['source_items_json', 'source_npcs_json']
  );
});
