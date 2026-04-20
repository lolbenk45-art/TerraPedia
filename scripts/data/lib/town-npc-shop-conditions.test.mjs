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
    actual
      .filter((entry) => ['NIGHT', 'BLOOD_MOON', 'WINDY_DAY'].includes(entry.code))
      .map((entry) => ({
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

test('getRequiredTownNpcWorldContexts includes stable public shop event contexts', () => {
  const actual = getRequiredTownNpcWorldContexts();

  assert.deepEqual(
    actual
      .filter((entry) => ['PARTY', 'HALLOWEEN', 'CHRISTMAS', 'VALENTINES_DAY', 'THANKSGIVING', 'OKTOBERFEST'].includes(entry.code))
      .map((entry) => ({
        code: entry.code,
        nameZh: entry.nameZh,
        contextType: entry.contextType
      })),
    [
      { code: 'PARTY', nameZh: '\u6d3e\u5bf9', contextType: 'EVENT' },
      { code: 'HALLOWEEN', nameZh: '\u4e07\u5723\u8282', contextType: 'EVENT' },
      { code: 'CHRISTMAS', nameZh: '\u5723\u8bde\u8282', contextType: 'EVENT' },
      { code: 'VALENTINES_DAY', nameZh: '\u60c5\u4eba\u8282', contextType: 'EVENT' },
      { code: 'THANKSGIVING', nameZh: '\u611f\u6069\u8282', contextType: 'EVENT' },
      { code: 'OKTOBERFEST', nameZh: '\u5341\u6708\u5564\u9152\u8282', contextType: 'EVENT' }
    ]
  );
});

test('extractTownNpcShopConditions maps stable seasonal and party event phrases', () => {
  const lookup = buildTownNpcShopConditionLookup({
    biomes: [],
    worldContexts: [
      { id: 30, code: 'PARTY', nameZh: '\u6d3e\u5bf9', nameEn: 'Party', contextType: 'EVENT' },
      { id: 31, code: 'HALLOWEEN', nameZh: '\u4e07\u5723\u8282', nameEn: 'Halloween', contextType: 'EVENT' },
      { id: 32, code: 'CHRISTMAS', nameZh: '\u5723\u8bde\u8282', nameEn: 'Christmas', contextType: 'EVENT' },
      { id: 33, code: 'VALENTINES_DAY', nameZh: '\u60c5\u4eba\u8282', nameEn: "Valentine's Day", contextType: 'EVENT' },
      { id: 34, code: 'THANKSGIVING', nameZh: '\u611f\u6069\u8282', nameEn: 'Thanksgiving', contextType: 'EVENT' },
      { id: 35, code: 'OKTOBERFEST', nameZh: '\u5341\u6708\u5564\u9152\u8282', nameEn: 'Oktoberfest', contextType: 'EVENT' }
    ]
  });

  const actual = extractTownNpcShopConditions(
    '\u6d3e\u5bf9 \u671f\u95f4\u3002\u5728 \u4e07\u5723\u8282 \u671f\u95f4\u3002\u5723\u8bde\u8282 \u671f\u95f4\u3002\u60c5\u4eba\u8282 \u671f\u95f4\u3002\u611f\u6069\u8282 \u671f\u95f4\u3002\u5341\u6708\u5564\u9152\u8282 \u671f\u95f4\u3002',
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
      { refType: 'WORLD_CONTEXT', refId: 30, code: 'PARTY', label: '\u6d3e\u5bf9' },
      { refType: 'WORLD_CONTEXT', refId: 31, code: 'HALLOWEEN', label: '\u4e07\u5723\u8282' },
      { refType: 'WORLD_CONTEXT', refId: 32, code: 'CHRISTMAS', label: '\u5723\u8bde\u8282' },
      { refType: 'WORLD_CONTEXT', refId: 33, code: 'VALENTINES_DAY', label: '\u60c5\u4eba\u8282' },
      { refType: 'WORLD_CONTEXT', refId: 34, code: 'THANKSGIVING', label: '\u611f\u6069\u8282' },
      { refType: 'WORLD_CONTEXT', refId: 35, code: 'OKTOBERFEST', label: '\u5341\u6708\u5564\u9152\u8282' }
    ]
  );
});

test('extractTownNpcShopConditions maps hardmode as game period alongside world contexts', () => {
  const lookup = buildTownNpcShopConditionLookup({
    biomes: [],
    gamePeriods: [
      { id: 2, code: 'hardmode', nameZh: '\u56f0\u96be\u6a21\u5f0f', nameEn: 'Hardmode' }
    ],
    worldContexts: [
      { id: 21, code: 'BLOOD_MOON', nameZh: '\u8840\u6708', nameEn: 'Blood Moon', contextType: 'EVENT' }
    ]
  });

  const actual = extractTownNpcShopConditions(
    '\u5728 \u56f0\u96be\u6a21\u5f0f \u4e2d\u3001 \u8840\u6708 \u671f\u95f4\u3002',
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
      { refType: 'GAME_PERIOD', refId: 2, code: 'hardmode', label: '\u56f0\u96be\u6a21\u5f0f' },
      { refType: 'WORLD_CONTEXT', refId: 21, code: 'BLOOD_MOON', label: '\u8840\u6708' }
    ]
  );
});
