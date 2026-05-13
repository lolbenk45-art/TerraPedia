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
        { internal_name: 'IronPickaxe', name: 'Iron Pickaxe', name_zh: 'zh-iron-pickaxe', image: 'a.png', damage: 5, buy: 2000, rarity_id: 1 },
        { internal_name: 'CopperShortsword', name: 'Copper Shortsword', name_zh: 'zh-copper-shortsword', image: 'b.png', damage: 4, buy: 500, rarity_id: 0 }
      ],
      npcs: [
        { internal_name: 'Merchant', name: 'Merchant', name_zh: 'zh-merchant', is_boss: 0 }
      ],
      boss_groups: [
        { code: 'KING_SLIME', name_en: 'King Slime', name_zh: '史莱姆王', image_url: 'boss.png', boss_type: 'PRE_HARDMODE' }
      ],
      projectiles: [],
      buffs: [
        { internal_name: 'Sharpened', english_name: 'Sharpened', image_cached_url: 'buffs/sharpened.png', buff_type: 'station' }
      ]
    },
    projectionData: {
      projection_items: [
        { internal_name: 'IronPickaxe', name: 'Iron Pickaxe', name_zh: null, image: 'a.png', damage: 5, buy: 2000, rarity_id: 1 },
        { internal_name: 'CopperShortsword', name: 'Copper Shortsword', name_zh: null, image: null, damage: 4, buy: 500, rarity_id: 0 }
      ],
      projection_npcs: [
        { internal_name: 'Merchant', name: 'Merchant', name_zh: null, is_boss: 0 }
      ],
      projection_bosses: [
        { code: 'KING_SLIME', name_en: 'King Slime', name_zh: '史莱姆王', image_url: 'boss.png', boss_type: 'PRE_HARDMODE' }
      ],
      projection_projectiles: [],
      projection_buffs: [
        { internal_name: 'Sharpened', english_name: 'Sharpened', image: null, buff_type: 'station' }
      ]
    }
  });

  assert.equal(actual.domainResults.items.status, 'blocked');
  assert.equal(actual.domainResults.npcs.status, 'blocked');
  assert.equal(actual.domainResults.bosses.status, 'switchable');
  assert.equal(actual.domainResults.buffs.status, 'blocked');
  assert.ok(actual.domainResults.items.blockingFields.some((field) => field.field === 'name_zh'));
  assert.ok(actual.domainResults.items.blockingFields.some((field) => field.field === 'image'));
  assert.ok(actual.domainResults.buffs.blockingFields.some((field) => field.field === 'image_cached_url<=image'));
  assert.equal(actual.domainResults.items.missingInProjection.length, 0);
  assert.equal(actual.summary.switchableDomains.length, 2);
  assert.ok(actual.summary.blockedDomains.includes('items'));
  assert.ok(actual.summary.blockedDomains.includes('npcs'));
  assert.ok(actual.summary.blockedDomains.includes('buffs'));
});

test('buildReplacementReadinessAudit blocks domains with projection-only keys', () => {
  const actual = buildReplacementReadinessAudit({
    localData: {
      items: [
        { internal_name: 'IronPickaxe', name: 'Iron Pickaxe' }
      ],
      npcs: [],
      boss_groups: [],
      projectiles: [],
      buffs: []
    },
    projectionData: {
      projection_items: [
        { internal_name: 'IronPickaxe', name: 'Iron Pickaxe' },
        { internal_name: 'ProjectionOnly', name: 'Projection Only' }
      ],
      projection_npcs: [],
      projection_bosses: [],
      projection_projectiles: [],
      projection_buffs: []
    }
  });

  assert.equal(actual.domainResults.items.status, 'blocked');
  assert.equal(actual.domainResults.items.extraInProjectionCount, 1);
  assert.deepEqual(actual.domainResults.items.extraInProjection, ['ProjectionOnly']);
  assert.ok(actual.summary.blockedDomains.includes('items'));
});

test('buildReplacementReadinessAudit treats documented zh recipe local-only rows as accepted item exceptions', () => {
  const actual = buildReplacementReadinessAudit({
    localData: {
      items: [
        {
          internal_name: 'IronPickaxe',
          name: 'Iron Pickaxe'
        },
        {
          internal_name: 'ZH_RECIPE_BLUE_JELLYFISH_BAIT',
          name: 'Blue Jellyfish (bait)',
          source_provider: 'wiki_zh_recipe_import'
        }
      ],
      npcs: [],
      boss_groups: [],
      projectiles: [],
      buffs: []
    },
    projectionData: {
      projection_items: [
        { internal_name: 'IronPickaxe', name: 'Iron Pickaxe' }
      ],
      projection_npcs: [],
      projection_bosses: [],
      projection_projectiles: [],
      projection_buffs: []
    }
  });

  assert.equal(actual.domainResults.items.status, 'switchable');
  assert.equal(actual.domainResults.items.missingInProjectionCount, 0);
  assert.deepEqual(actual.domainResults.items.acceptedLocalOnlyExceptions, ['ZH_RECIPE_BLUE_JELLYFISH_BAIT']);
  assert.ok(actual.summary.switchableDomains.includes('items'));
});

test('buildReplacementReadinessAudit includes projectile source relation json fields', () => {
  const actual = buildReplacementReadinessAudit({
    localData: {
      items: [],
      npcs: [],
      boss_groups: [],
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
      projection_bosses: [],
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

test('buildReplacementReadinessAudit supports boss and buff column-name mappings', () => {
  const actual = buildReplacementReadinessAudit({
    localData: {
      items: [],
      npcs: [],
      boss_groups: [
        { code: 'EYE_OF_CTHULHU', name_en: 'Eye of Cthulhu', image_url: 'bosses/eye.png' }
      ],
      projectiles: [],
      buffs: [
        { internal_name: 'ObsidianSkin', english_name: 'Obsidian Skin', image_cached_url: 'buffs/obsidian.png' }
      ]
    },
    projectionData: {
      projection_items: [],
      projection_npcs: [],
      projection_bosses: [
        { code: 'EYE_OF_CTHULHU', name_en: 'Eye of Cthulhu', image_url: 'bosses/eye.png' }
      ],
      projection_projectiles: [],
      projection_buffs: [
        { internal_name: 'ObsidianSkin', english_name: 'Obsidian Skin', image: 'buffs/obsidian.png' }
      ]
    }
  });

  assert.equal(actual.domainResults.bosses.status, 'switchable');
  assert.equal(actual.domainResults.buffs.status, 'switchable');
  assert.deepEqual(actual.domainResults.buffs.blockingFields, []);
});
