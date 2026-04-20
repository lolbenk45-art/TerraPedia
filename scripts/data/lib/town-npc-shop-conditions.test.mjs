import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTownNpcShopConditionLookup,
  extractTownNpcShopConditions,
  getRequiredTownNpcWorldContexts
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

test('getRequiredTownNpcWorldContexts includes stable public shop world contexts', () => {
  const actual = getRequiredTownNpcWorldContexts();

  assert.deepEqual(
    actual.map((entry) => ({
      code: entry.code,
      nameZh: entry.nameZh,
      contextType: entry.contextType
    })),
    [
      { code: 'NIGHT', nameZh: '夜晚', contextType: 'TIME' },
      { code: 'BLOOD_MOON', nameZh: '血月', contextType: 'EVENT' },
      { code: 'WINDY_DAY', nameZh: '大风天', contextType: 'WEATHER' }
    ]
  );
});

test('extractTownNpcShopConditions maps stable public shop world context phrases', () => {
  const lookup = buildTownNpcShopConditionLookup({
    biomes: [],
    worldContexts: [
      { id: 20, code: 'NIGHT', nameZh: '夜晚', nameEn: 'Night', contextType: 'TIME' },
      { id: 21, code: 'BLOOD_MOON', nameZh: '血月', nameEn: 'Blood Moon', contextType: 'EVENT' },
      { id: 22, code: 'WINDY_DAY', nameZh: '大风天', nameEn: 'Windy Day', contextType: 'WEATHER' }
    ]
  });

  const actual = extractTownNpcShopConditions(
    '在夜晚期间。在 血月 期间。在 大风天 时。',
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
      { refType: 'WORLD_CONTEXT', refId: 20, code: 'NIGHT', label: '夜晚' },
      { refType: 'WORLD_CONTEXT', refId: 21, code: 'BLOOD_MOON', label: '血月' },
      { refType: 'WORLD_CONTEXT', refId: 22, code: 'WINDY_DAY', label: '大风天' }
    ]
  );
});
