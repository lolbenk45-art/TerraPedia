import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBossSeriesRelations } from './boss-series-processor.mjs';

test('buildBossSeriesRelations maps bosses to npc identities, rewards, and explicit effects', () => {
  const actual = buildBossSeriesRelations({
    maintBossRows: [
      {
        id: 1,
        record_key: 'a'.repeat(64),
        progression_order: 1,
        order_within_group: 1,
        group_name_en: 'Pre-Hardmode bosses',
        group_name_zh: '困难模式之前的 Boss',
        group_type: 'PRE_HARDMODE',
        title_en: 'Brain of Cthulhu',
        title_zh: '克苏鲁之脑',
        page_title_en: 'Brain of Cthulhu',
        page_title_zh: '克苏鲁之脑',
        notes: 'Defeating the Brain of Cthulhu for the first time also allows the Tavernkeep NPC to spawn as the Unconscious Man, and allows meteorites to land.',
        source_page: 'Brain of Cthulhu'
      },
      {
        id: 2,
        record_key: 'b'.repeat(64),
        progression_order: 8,
        order_within_group: 8,
        group_name_en: 'Pre-Hardmode bosses',
        group_name_zh: '困难模式之前的 Boss',
        group_type: 'PRE_HARDMODE',
        title_en: 'Wall of Flesh',
        title_zh: '血肉墙',
        page_title_en: 'Wall of Flesh',
        page_title_zh: '血肉墙',
        notes: 'Once it is defeated, the world permanently converts to Hardmode , which brings new content and challenges.',
        source_page: 'Wall of Flesh'
      },
      {
        id: 3,
        record_key: 'c'.repeat(64),
        progression_order: 10,
        order_within_group: 2,
        group_name_en: 'Hardmode bosses',
        group_name_zh: '困难模式 Boss',
        group_type: 'HARDMODE',
        title_en: 'The Twins',
        title_zh: '双子魔眼',
        page_title_en: 'The Twins',
        page_title_zh: '双子魔眼',
        notes: 'The Twins are a Hardmode mechanical boss.',
        source_page: 'The Twins'
      }
    ],
    relationNpcRows: [
      {
        recordKey: 'npc-1',
        sourceId: 101,
        internalName: 'BrainofCthulhu',
        englishName: 'Brain of Cthulhu',
        sourceMaintRecordKey: 'npc-a'
      },
      {
        recordKey: 'npc-2',
        sourceId: 102,
        internalName: 'WallofFlesh',
        englishName: 'Wall of Flesh',
        sourceMaintRecordKey: 'npc-b'
      }
    ],
    itemNpcLootRelations: [
      {
        recordKey: 'loot-1',
        sourceFactKey: 'sf-1',
        itemInternalName: 'TissueSample',
        npcInternalName: 'BrainofCthulhu',
        chanceText: '100%',
        quantityText: '20-40'
      },
      {
        recordKey: 'loot-2',
        sourceFactKey: 'sf-2',
        itemInternalName: 'Pwnhammer',
        npcInternalName: 'WallofFlesh',
        chanceText: '100%',
        quantityText: '1'
      }
    ]
  });

  assert.equal(actual.relationBosses.length, 3);
  assert.equal(actual.bossItemRewardRelations.length, 2);
  assert.equal(actual.bossEffectRelations.length, 3);

  const brain = actual.relationBosses.find((row) => row.bossTitleEn === 'Brain of Cthulhu');
  assert.ok(brain);
  assert.equal(brain.npcMatchStatus, 'resolved');
  assert.equal(brain.npcMatchCount, 1);

  const twins = actual.relationBosses.find((row) => row.bossTitleEn === 'The Twins');
  assert.ok(twins);
  assert.equal(twins.npcMatchStatus, 'unresolved');
  assert.ok(actual.issues.some((issue) => issue.reason === 'boss_npc_unresolved'));

  const hardmodeEffect = actual.bossEffectRelations.find((row) => row.targetKey === 'hardmode');
  assert.ok(hardmodeEffect);
  assert.equal(hardmodeEffect.effectType, 'unlock_world_state');

  const tavernkeepEffect = actual.bossEffectRelations.find((row) => row.targetKey === 'tavernkeep');
  assert.ok(tavernkeepEffect);
  assert.equal(tavernkeepEffect.effectType, 'unlock_npc_spawn');

  const meteoriteEffect = actual.bossEffectRelations.find((row) => row.targetKey === 'meteorite_landings');
  assert.ok(meteoriteEffect);
  assert.equal(meteoriteEffect.targetType, 'world_event');
});
