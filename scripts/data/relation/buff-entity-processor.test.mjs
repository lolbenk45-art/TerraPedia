import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBuffEntityRelations } from './buff-entity-processor.mjs';

test('buildBuffEntityRelations mirrors maint buff rows into relation buffs', () => {
  const actual = buildBuffEntityRelations({
    maintBuffs: [{
      id: 1,
      record_key: 'a'.repeat(64),
      source_id: 1,
      internal_name: 'ObsidianSkin',
      english_name: 'Obsidian Skin',
      name_zh: '黑曜石皮',
      flags_json: '{"buffType":"buff"}',
      major_value: 1,
      combat_value: 0,
        raw_json: JSON.stringify({
          type: 'buff',
          image: 'Obsidian Skin.png',
          localized: {
            en: { tooltip: 'Immune to lava' },
            zh: { tooltip: '对熔岩免疫' }
          },
          sourceItems: [{ itemId: 288, internalName: 'ObsidianSkinPotion' }],
          immuneNpcs: [
            { npcId: 68, internalName: 'DungeonGuardian', name: 'Dungeon Guardian' },
            { npcId: 69, internalName: 'Clinger', name: 'Clinger' }
          ],
          immuneNpcCount: 2,
          immuneNpcSample: [{ npcId: 68, internalName: 'DungeonGuardian', name: 'Dungeon Guardian' }]
        }),
      landing_source_id: 42,
      landing_source_key: 'wiki.template.getbuffinfo',
      landing_content_hash: 'b'.repeat(64),
      source_provider: 'terraria.wiki.gg',
      source_page: 'Template:GetBuffInfo',
      source_revision_timestamp: '2026-03-01T03:21:12Z'
    }]
  });

  assert.equal(actual.relationBuffs.length, 1);
  assert.equal(actual.relationBuffs[0].internalName, 'ObsidianSkin');
  assert.equal(actual.relationBuffs[0].englishName, 'Obsidian Skin');
  assert.equal(actual.relationBuffs[0].nameZh, '黑曜石皮');
  assert.equal(actual.relationBuffs[0].buffType, 'buff');
  assert.equal(actual.relationBuffs[0].tooltipEn, 'Immune to lava');
  assert.equal(actual.relationBuffs[0].tooltipZh, '对熔岩免疫');
  assert.equal(actual.relationBuffs[0].sourceItemCount, 1);
  assert.equal(actual.relationBuffs[0].immuneNpcCount, 2);
  assert.deepEqual(JSON.parse(actual.relationBuffs[0].sourceItemsJson), [
    { itemId: 288, internalName: 'ObsidianSkinPotion' }
  ]);
  assert.deepEqual(JSON.parse(actual.relationBuffs[0].immuneNpcsJson), [
    { npcId: 68, internalName: 'DungeonGuardian', name: 'Dungeon Guardian' },
    { npcId: 69, internalName: 'Clinger', name: 'Clinger' }
  ]);
  assert.equal(actual.relationBuffs[0].sourceMaintTable, 'maint_buffs');
});
