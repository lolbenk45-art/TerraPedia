import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTownNpcShopConditionLookup,
  extractTownNpcShopConditions
} from './town-npc-shop-conditions.mjs';

test('extractTownNpcShopConditions maps stable biome and world context phrases from availability text', () => {
  const lookup = buildTownNpcShopConditionLookup({
    biomes: [
      { id: 2, code: 'jungle', nameZh: '丛林', nameEn: 'Jungle' },
      { id: 4, code: 'snow', nameZh: '雪原', nameEn: 'Snow biome' },
      { id: 112, code: 'graveyard', nameZh: '墓地', nameEn: 'Graveyard' }
    ],
    worldContexts: [
      { id: 7, code: 'FULL_MOON', nameZh: '满月', nameEn: 'Full Moon', contextType: 'MOON_PHASE' }
    ]
  });

  const actual = extractTownNpcShopConditions(
    '当在 雪原生物群系 中与其说话时。在 满月 时。当前在 丛林 中与其对话时。',
    lookup
  );

  assert.deepEqual(
    actual.map((condition) => ({
      refType: condition.refType,
      refId: condition.refId,
      code: condition.code,
      label: condition.label
    })),
    [
      { refType: 'BIOME', refId: 4, code: 'snow', label: '雪原' },
      { refType: 'WORLD_CONTEXT', refId: 7, code: 'FULL_MOON', label: '满月' },
      { refType: 'BIOME', refId: 2, code: 'jungle', label: '丛林' }
    ]
  );
});

test('extractTownNpcShopConditions de-duplicates repeated phrases and ignores unsupported text', () => {
  const lookup = buildTownNpcShopConditionLookup({
    biomes: [
      { id: 112, code: 'graveyard', nameZh: '墓地', nameEn: 'Graveyard' }
    ],
    worldContexts: []
  });

  const actual = extractTownNpcShopConditions(
    '在 墓地 附近。再次提到 墓地 。当玩家物品栏中带有 信号枪 时。',
    lookup
  );

  assert.deepEqual(
    actual.map((condition) => ({
      refType: condition.refType,
      refId: condition.refId,
      code: condition.code
    })),
    [
      { refType: 'BIOME', refId: 112, code: 'graveyard' }
    ]
  );
});
