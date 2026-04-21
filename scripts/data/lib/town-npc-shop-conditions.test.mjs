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

test('extractTownNpcShopConditions maps player-owned item conditions to item refs', () => {
  const lookup = buildTownNpcShopConditionLookup({
    biomes: [],
    items: [
      { id: 930, internalName: 'FlareGun', nameEn: 'Flare Gun', nameZh: '\u4fe1\u53f7\u67aa' },
      { id: 3105, internalName: 'NailGun', nameEn: 'Nail Gun', nameZh: '\u9489\u67aa' }
    ],
    worldContexts: []
  });

  const actual = extractTownNpcShopConditions(
    '\u5f53\u73a9\u5bb6\u7684\u7269\u54c1\u680f\u4e2d\u5e26\u6709 \u4fe1\u53f7\u67aa \u65f6\u3002\u5f53\u73a9\u5bb6\u62e5\u6709 \u9489\u67aa \u65f6\u3002',
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
      { refType: 'ITEM', refId: 930, code: 'FlareGun', label: '\u4fe1\u53f7\u67aa' },
      { refType: 'ITEM', refId: 3105, code: 'NailGun', label: '\u9489\u67aa' }
    ]
  );
});

test('extractTownNpcShopConditions maps active party phrasing to PARTY world context', () => {
  const lookup = buildTownNpcShopConditionLookup({
    biomes: [],
    worldContexts: [
      { id: 30, code: 'PARTY', nameZh: '\u6d3e\u5bf9', nameEn: 'Party', contextType: 'EVENT' }
    ]
  });

  const actual = extractTownNpcShopConditions(
    '\u6d3e\u5bf9\u8fdb\u884c\u4e2d\u65f6\u3002',
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
      { refType: 'WORLD_CONTEXT', refId: 30, code: 'PARTY', label: '\u6d3e\u5bf9' }
    ]
  );
});

test('getRequiredTownNpcWorldContexts includes stable live event contexts', () => {
  const actual = getRequiredTownNpcWorldContexts();

  assert.deepEqual(
    actual
      .filter((entry) => ['LANTERN_NIGHT', 'SOLAR_ECLIPSE'].includes(entry.code))
      .map((entry) => ({
        code: entry.code,
        nameZh: entry.nameZh,
        contextType: entry.contextType
      })),
    [
      { code: 'LANTERN_NIGHT', nameZh: '\u706f\u7b3c\u591c', contextType: 'EVENT' },
      { code: 'SOLAR_ECLIPSE', nameZh: '\u65e5\u98df', contextType: 'EVENT' }
    ]
  );
});

test('extractTownNpcShopConditions maps lantern night and solar eclipse event phrases', () => {
  const lookup = buildTownNpcShopConditionLookup({
    biomes: [],
    worldContexts: [
      { id: 40, code: 'LANTERN_NIGHT', nameZh: '\u706f\u7b3c\u591c', nameEn: 'Lantern Night', contextType: 'EVENT' },
      { id: 41, code: 'SOLAR_ECLIPSE', nameZh: '\u65e5\u98df', nameEn: 'Solar Eclipse', contextType: 'EVENT' }
    ]
  });

  const actual = extractTownNpcShopConditions(
    '\u706f\u7b3c\u591c \u671f\u95f4\u3002\u5728 \u65e5\u98df \u671f\u95f4\u3002',
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
      { refType: 'WORLD_CONTEXT', refId: 40, code: 'LANTERN_NIGHT', label: '\u706f\u7b3c\u591c' },
      { refType: 'WORLD_CONTEXT', refId: 41, code: 'SOLAR_ECLIPSE', label: '\u65e5\u98df' }
    ]
  );
});

test('getRequiredTownNpcWorldContexts includes time-of-day and moon phase range contexts', () => {
  const actual = getRequiredTownNpcWorldContexts();

  assert.deepEqual(
    actual
      .filter((entry) => ['DAY', 'MOON_PHASE_1_4', 'MOON_PHASE_LISTED'].includes(entry.code))
      .map((entry) => ({
        code: entry.code,
        nameZh: entry.nameZh,
        contextType: entry.contextType
      })),
    [
      { code: 'DAY', nameZh: '\u767d\u5929', contextType: 'TIME' },
      { code: 'MOON_PHASE_1_4', nameZh: '\u6708\u76f8 1\u20134', contextType: 'MOON_PHASE' },
      { code: 'MOON_PHASE_LISTED', nameZh: '\u4ee5\u4e0b\u6708\u76f8', contextType: 'MOON_PHASE' }
    ]
  );
});

test('extractTownNpcShopConditions maps time-of-day, biome, and moon phase range phrases', () => {
  const lookup = buildTownNpcShopConditionLookup({
    biomes: [
      { id: 95, code: 'glowing_mushroom', nameZh: '\u53d1\u5149\u8611\u83c7\u7fa4\u7cfb', nameEn: 'Glowing Mushroom' },
      { id: 96, code: 'ice', nameZh: '\u51b0\u96ea\u7fa4\u7cfb', nameEn: 'Ice biome' }
    ],
    worldContexts: [
      { id: 50, code: 'DAY', nameZh: '\u767d\u5929', nameEn: 'Day', contextType: 'TIME' },
      { id: 12, code: 'NIGHT', nameZh: '\u591c\u665a', nameEn: 'Night', contextType: 'TIME' },
      { id: 51, code: 'MOON_PHASE_1_4', nameZh: '\u6708\u76f8 1\u20134', nameEn: 'Moon Phase 1-4', contextType: 'MOON_PHASE' },
      { id: 52, code: 'MOON_PHASE_LISTED', nameZh: '\u4ee5\u4e0b\u6708\u76f8', nameEn: 'Listed Moon Phases', contextType: 'MOON_PHASE' }
    ]
  });

  const actual = extractTownNpcShopConditions(
    '\u5728 \u53d1\u5149\u8611\u83c7\u751f\u7269\u7fa4\u7cfb \u4e2d\u65f6\u3002\u5f53\u5728 \u51b0\u96ea\u751f\u7269\u7fa4\u7cfb \u4e2d\u4e0e\u5176\u4ea4\u8c08\u65f6\u3002\u5728 \u767d\u5929 \u3002\u591c\u95f4\u3002\u5728 \u6708\u76f8 1\u20134 \u671f\u95f4\uff1a\u4ee5\u4e0b\u6708\u76f8\u671f\u95f4\uff1a',
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
      { refType: 'BIOME', refId: 95, code: 'glowing_mushroom', label: '\u53d1\u5149\u8611\u83c7\u7fa4\u7cfb' },
      { refType: 'BIOME', refId: 96, code: 'ice', label: '\u51b0\u96ea\u7fa4\u7cfb' },
      { refType: 'WORLD_CONTEXT', refId: 50, code: 'DAY', label: '\u767d\u5929' },
      { refType: 'WORLD_CONTEXT', refId: 12, code: 'NIGHT', label: '\u591c\u665a' },
      { refType: 'WORLD_CONTEXT', refId: 51, code: 'MOON_PHASE_1_4', label: '\u6708\u76f8 1\u20134' },
      { refType: 'WORLD_CONTEXT', refId: 52, code: 'MOON_PHASE_LISTED', label: '\u4ee5\u4e0b\u6708\u76f8' }
    ]
  );
});

test('extractTownNpcShopConditions maps npc presence phrases alongside world context phrases', () => {
  const lookup = buildTownNpcShopConditionLookup({
    npcs: [
      { id: 201, internalName: 'TaxCollector', nameEn: 'Tax Collector', nameZh: '\u7a0e\u6536\u5b98' },
      { id: 202, internalName: 'Pirate', nameEn: 'Pirate', nameZh: '\u6d77\u76d7' },
      { id: 203, internalName: 'Angler', nameEn: 'Angler', nameZh: '\u6e14\u592b' }
    ],
    worldContexts: [
      { id: 52, code: 'MOON_PHASE_LISTED', nameZh: '\u4ee5\u4e0b\u6708\u76f8', nameEn: 'Listed Moon Phases', contextType: 'MOON_PHASE' }
    ]
  });

  const actual = extractTownNpcShopConditions(
    '\u82e5 \u7a0e\u6536\u5b98 \u5728\u573a\u3002\u6d77\u76d7 \u5728\u573a\u65f6\u3002\u5728\u4e0b\u5217 \u6708\u76f8 \u671f\u95f4\uff1a\uff0c\u5f53 \u6e14\u592b \u5728\u573a\u65f6\u3002',
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
      { refType: 'NPC', refId: 201, code: 'TaxCollector', label: '\u7a0e\u6536\u5b98' },
      { refType: 'NPC', refId: 202, code: 'Pirate', label: '\u6d77\u76d7' },
      { refType: 'WORLD_CONTEXT', refId: 52, code: 'MOON_PHASE_LISTED', label: '\u4ee5\u4e0b\u6708\u76f8' },
      { refType: 'NPC', refId: 203, code: 'Angler', label: '\u6e14\u592b' }
    ]
  );
});

test('extractTownNpcShopConditions maps single boss defeat phrases to npc refs', () => {
  const lookup = buildTownNpcShopConditionLookup({
    npcs: [
      { id: 175, internalName: 'Clown', nameEn: 'Clown', nameZh: '\u5c0f\u4e11' },
      { id: 505, internalName: 'CultistBoss', nameEn: 'Lunatic Cultist', nameZh: '\u62dc\u6708\u6559\u90aa\u6559\u5f92' },
      { id: 311, internalName: 'Golem', nameEn: 'Golem', nameZh: '\u77f3\u5de8\u4eba' }
    ],
    worldContexts: [
      { id: 50, code: 'DAY', nameZh: '\u767d\u5929', nameEn: 'Day', contextType: 'TIME' }
    ]
  });

  const actual = extractTownNpcShopConditions(
    '\u5982\u679c\u5df2\u6253\u8d25 \u5c0f\u4e11 \u3002\u767d\u5929\uff0c\u5982\u679c\u5df2\u6253\u8d25 \u62dc\u6708\u6559\u90aa\u6559\u5f92 \u3002\u6253\u8d25 \u77f3\u5de8\u4eba \u540e\u3002',
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
      { refType: 'NPC', refId: 175, code: 'Clown', label: '\u5c0f\u4e11' },
      { refType: 'WORLD_CONTEXT', refId: 50, code: 'DAY', label: '\u767d\u5929' },
      { refType: 'NPC', refId: 505, code: 'CultistBoss', label: '\u62dc\u6708\u6559\u90aa\u6559\u5f92' },
      { refType: 'NPC', refId: 311, code: 'Golem', label: '\u77f3\u5de8\u4eba' }
    ]
  );
});

test('extractTownNpcShopConditions maps already-defeated phrases with leading helper words', () => {
  const lookup = buildTownNpcShopConditionLookup({
    npcs: [
      { id: 101, internalName: 'SkeletronHead', nameEn: 'Skeletron', nameZh: '\u9ab7\u9ac5\u738b' },
      { id: 179, internalName: 'WallofFlesh', nameEn: 'Wall of Flesh', nameZh: '\u8840\u8089\u5899' }
    ]
  });

  const actual = extractTownNpcShopConditions(
    '\u5f53 \u9ab7\u9ac5\u738b \u5df2\u88ab\u6253\u8d25\u65f6\u3002\u5f53 \u8840\u8089\u5899 \u5df2\u88ab\u6253\u8d25\u65f6\u3002',
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
      { refType: 'NPC', refId: 101, code: 'SkeletronHead', label: '\u9ab7\u9ac5\u738b' },
      { refType: 'NPC', refId: 179, code: 'WallofFlesh', label: '\u8840\u8089\u5899' }
    ]
  );
});

test('extractTownNpcShopConditions does not force-structure event completion or multi-boss defeat phrases', () => {
  const lookup = buildTownNpcShopConditionLookup({
    npcs: [
      { id: 101, internalName: 'SkeletronHead', nameEn: 'Skeletron', nameZh: '\u9ab7\u9ac5\u738b' },
      { id: 179, internalName: 'WallofFlesh', nameEn: 'Wall of Flesh', nameZh: '\u8840\u8089\u5899' }
    ]
  });

  const actual = extractTownNpcShopConditions(
    '\u4efb\u4f55 \u673a\u68b0 Boss \u88ab\u6253\u8d25\u540e\u3002\u5f53\u6253\u8d25\u4e86 \u4e16\u754c\u541e\u566c\u602a \u3001 \u514b\u82cf\u9c81\u4e4b\u8111 \u3001 \u9ab7\u9ac5\u738b \u3001\u6216 \u8840\u8089\u5899 \u4e4b\u540e\u3002',
    lookup
  );

  assert.deepEqual(actual, []);
});

test('getRequiredTownNpcWorldContexts includes event completion contexts', () => {
  const actual = getRequiredTownNpcWorldContexts();

  assert.deepEqual(
    actual
      .filter((entry) => ['MARTIAN_MADNESS_COMPLETED', 'PIRATE_INVASION_COMPLETED', 'SNOW_LEGION_COMPLETED'].includes(entry.code))
      .map((entry) => ({
        code: entry.code,
        nameZh: entry.nameZh,
        contextType: entry.contextType
      })),
    [
      { code: 'MARTIAN_MADNESS_COMPLETED', nameZh: '\u706b\u661f\u66b4\u4e71\u5df2\u5b8c\u6210', contextType: 'PROGRESSION' },
      { code: 'PIRATE_INVASION_COMPLETED', nameZh: '\u6d77\u76d7\u5165\u4fb5\u5df2\u5b8c\u6210', contextType: 'PROGRESSION' },
      { code: 'SNOW_LEGION_COMPLETED', nameZh: '\u96ea\u4eba\u519b\u56e2\u5df2\u5b8c\u6210', contextType: 'PROGRESSION' }
    ]
  );
});

test('extractTownNpcShopConditions maps safe event completion phrases to world contexts', () => {
  const lookup = buildTownNpcShopConditionLookup({
    worldContexts: [
      { id: 61, code: 'MARTIAN_MADNESS_COMPLETED', nameZh: '\u706b\u661f\u66b4\u4e71\u5df2\u5b8c\u6210', nameEn: 'Martian Madness Completed', contextType: 'PROGRESSION' },
      { id: 62, code: 'PIRATE_INVASION_COMPLETED', nameZh: '\u6d77\u76d7\u5165\u4fb5\u5df2\u5b8c\u6210', nameEn: 'Pirate Invasion Completed', contextType: 'PROGRESSION' },
      { id: 63, code: 'SNOW_LEGION_COMPLETED', nameZh: '\u96ea\u4eba\u519b\u56e2\u5df2\u5b8c\u6210', nameEn: 'Snow Legion Completed', contextType: 'PROGRESSION' },
      { id: 52, code: 'MOON_PHASE_LISTED', nameZh: '\u4ee5\u4e0b\u6708\u76f8', nameEn: 'Listed Moon Phases', contextType: 'MOON_PHASE' }
    ],
    gamePeriods: [
      { id: 2, code: 'hardmode', nameZh: '\u56f0\u96be\u6a21\u5f0f', nameEn: 'Hardmode' }
    ]
  });

  const actual = extractTownNpcShopConditions(
    '\u5728\u6253\u8d25\u4e86 \u706b\u661f\u66b4\u4e71 \u4e8b\u4ef6\u540e\u5c31\u4e00\u76f4\u6709\u552e\u3002\u5728 Celebrationmk10 \u4e16\u754c\u4e2d\uff0c \u56f0\u96be\u6a21\u5f0f \u4e2d\uff0c \u6d77\u76d7\u5165\u4fb5 \u5df2\u88ab\u6253\u8d25\uff0c\u4e14\u5728\u4ee5\u4e0b \u6708\u76f8 \u671f\u95f4\uff1a \u3002\u5982\u679c\u5df2\u6253\u8d25 \u96ea\u4eba\u519b\u56e2 \u3002',
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
      { refType: 'WORLD_CONTEXT', refId: 61, code: 'MARTIAN_MADNESS_COMPLETED', label: '\u706b\u661f\u66b4\u4e71\u5df2\u5b8c\u6210' },
      { refType: 'GAME_PERIOD', refId: 2, code: 'hardmode', label: '\u56f0\u96be\u6a21\u5f0f' },
      { refType: 'WORLD_CONTEXT', refId: 62, code: 'PIRATE_INVASION_COMPLETED', label: '\u6d77\u76d7\u5165\u4fb5\u5df2\u5b8c\u6210' },
      { refType: 'WORLD_CONTEXT', refId: 52, code: 'MOON_PHASE_LISTED', label: '\u4ee5\u4e0b\u6708\u76f8' },
      { refType: 'WORLD_CONTEXT', refId: 63, code: 'SNOW_LEGION_COMPLETED', label: '\u96ea\u4eba\u519b\u56e2\u5df2\u5b8c\u6210' }
    ]
  );
});

test('getRequiredTownNpcWorldContexts includes mechanical boss progression contexts', () => {
  const actual = getRequiredTownNpcWorldContexts();

  assert.deepEqual(
    actual
      .filter((entry) => ['ANY_MECH_BOSS_DEFEATED', 'ALL_MECH_BOSSES_DEFEATED'].includes(entry.code))
      .map((entry) => ({
        code: entry.code,
        nameZh: entry.nameZh,
        contextType: entry.contextType
      })),
    [
      { code: 'ANY_MECH_BOSS_DEFEATED', nameZh: '\u4efb\u4e00\u673a\u68b0Boss\u5df2\u51fb\u8d25', contextType: 'PROGRESSION' },
      { code: 'ALL_MECH_BOSSES_DEFEATED', nameZh: '\u5168\u90e8\u673a\u68b0Boss\u5df2\u51fb\u8d25', contextType: 'PROGRESSION' }
    ]
  );
});

test('extractTownNpcShopConditions maps safe mechanical boss progression phrases to world contexts', () => {
  const lookup = buildTownNpcShopConditionLookup({
    worldContexts: [
      { id: 64, code: 'ANY_MECH_BOSS_DEFEATED', nameZh: '\u4efb\u4e00\u673a\u68b0Boss\u5df2\u51fb\u8d25', nameEn: 'Any Mechanical Boss Defeated', contextType: 'PROGRESSION' },
      { id: 65, code: 'ALL_MECH_BOSSES_DEFEATED', nameZh: '\u5168\u90e8\u673a\u68b0Boss\u5df2\u51fb\u8d25', nameEn: 'All Mechanical Bosses Defeated', contextType: 'PROGRESSION' }
    ],
    gamePeriods: [
      { id: 2, code: 'hardmode', nameZh: '\u56f0\u96be\u6a21\u5f0f', nameEn: 'Hardmode' }
    ]
  });

  const actual = extractTownNpcShopConditions(
    '\u4efb\u4f55 \u673a\u68b0 Boss \u88ab\u6253\u8d25\u540e\u3002\u6253\u8d25\u81f3\u5c11\u4e00\u4e2a \u673a\u68b0 Boss \u4e4b\u540e\u3002\u5f53\u4e16\u754c\u5904\u4e8e \u56f0\u96be\u6a21\u5f0f \u4e14\u5168\u90e8\u4e09\u4e2a \u673a\u68b0 Boss \u90fd\u5df2\u88ab\u6253\u8d25\u3002',
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
      { refType: 'WORLD_CONTEXT', refId: 64, code: 'ANY_MECH_BOSS_DEFEATED', label: '\u4efb\u4e00\u673a\u68b0Boss\u5df2\u51fb\u8d25' },
      { refType: 'GAME_PERIOD', refId: 2, code: 'hardmode', label: '\u56f0\u96be\u6a21\u5f0f' },
      { refType: 'WORLD_CONTEXT', refId: 65, code: 'ALL_MECH_BOSSES_DEFEATED', label: '\u5168\u90e8\u673a\u68b0Boss\u5df2\u51fb\u8d25' }
    ]
  );
});

test('extractTownNpcShopConditions maps at-least-one mechanical boss defeat phrasing to world context', () => {
  const lookup = buildTownNpcShopConditionLookup({
    worldContexts: [
      { id: 64, code: 'ANY_MECH_BOSS_DEFEATED', nameZh: '\u4efb\u4e00\u673a\u68b0Boss\u5df2\u51fb\u8d25', nameEn: 'Any Mechanical Boss Defeated', contextType: 'PROGRESSION' }
    ]
  });

  const actual = extractTownNpcShopConditions(
    '\u6253\u8d25\u81f3\u5c11\u4e00\u4e2a \u673a\u68b0 Boss \u4e4b\u540e\u3002',
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
      { refType: 'WORLD_CONTEXT', refId: 64, code: 'ANY_MECH_BOSS_DEFEATED', label: '\u4efb\u4e00\u673a\u68b0Boss\u5df2\u51fb\u8d25' }
    ]
  );
});
