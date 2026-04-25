import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBaseEntityRelations } from './base-entity-processor.mjs';

test('buildBaseEntityRelations mirrors maint entity rows into relation base tables', () => {
  const actual = buildBaseEntityRelations({
    maintItems: [{
      id: 10,
      record_key: 'a'.repeat(64),
      source_id: 1,
      internal_name: 'IronPickaxe',
      english_name: 'Iron Pickaxe',
      name_zh: '铁镐',
      module_generated_at: '2026-03-09',
      terraria_version: '1.4.5.6',
      major_value: 2000,
      combat_value: 5,
      defense_value: null,
      use_time: 13,
      stack_size: null,
      width: 24,
      height: 28,
      flags_json: null,
      raw_json: '{"value":2000,"rare":1}',
      landing_source_id: 100,
      landing_source_key: 'wiki.module.iteminfo',
      landing_content_hash: 'b'.repeat(64),
      source_provider: 'terraria.wiki.gg',
      source_page: 'Module:Iteminfo/data',
      source_revision_timestamp: '2026-03-09T22:52:58Z'
    }],
    maintNpcs: [{
      id: 20,
      record_key: 'c'.repeat(64),
      source_id: -65,
      internal_name: 'BigHornetStingy',
      english_name: 'Hornet',
      name_zh: null,
      flags_json: '{"boss":false}',
      raw_json: '{}'
    }],
    maintProjectiles: [{
      id: 30,
      record_key: 'd'.repeat(64),
      source_id: 0,
      internal_name: 'None',
      english_name: null,
      name_zh: null,
      raw_json: '{}'
    }]
  });

  assert.equal(actual.relationItems.length, 1);
  assert.equal(actual.relationNpcs.length, 1);
  assert.equal(actual.relationProjectiles.length, 1);
  assert.equal(actual.relationItems[0].internalName, 'IronPickaxe');
  assert.equal(actual.relationItems[0].rareRaw, 1);
  assert.equal(actual.relationItems[0].valueRaw, 2000);
  assert.equal(actual.relationItems[0].reviewStatus, 'resolved');
  assert.equal(actual.relationItems[0].sourceMaintTable, 'maint_items');
  assert.equal(actual.relationNpcs[0].sourceMaintTable, 'maint_npcs');
  assert.equal(actual.relationProjectiles[0].sourceMaintTable, 'maint_projectiles');
});
