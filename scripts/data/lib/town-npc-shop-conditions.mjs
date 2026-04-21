const BIOME_RULES = [
  { code: 'graveyard', patterns: ['\u5893\u5730\u9644\u8fd1', '\u5893\u5730'] },
  { code: 'underground_jungle', patterns: ['\u5730\u4e0b\u4e1b\u6797'] },
  { code: 'jungle_temple', patterns: ['\u4e1b\u6797\u795e\u5e99'] },
  { code: 'jungle', patterns: ['\u4e1b\u6797'] },
  { code: 'snow', patterns: ['\u96ea\u539f\u751f\u7269\u7fa4\u7cfb', '\u96ea\u539f'] },
  { code: 'ice', patterns: ['\u51b0\u96ea\u7fa4\u7cfb', '\u51b0\u96ea\u751f\u7269\u7fa4\u7cfb'] },
  { code: 'glowing_mushroom', patterns: ['\u53d1\u5149\u8611\u83c7\u751f\u7269\u7fa4\u7cfb', '\u53d1\u5149\u8611\u83c7\u7fa4\u7cfb'] },
  { code: 'desert', patterns: ['\u6c99\u6f20'] },
  { code: 'ocean', patterns: ['\u6d77\u6d0b'] },
  { code: 'dungeon', patterns: ['\u5730\u7262'] },
  { code: 'corruption', patterns: ['\u8150\u5316\u4e4b\u5730', '\u8150\u5316'] },
  { code: 'crimson', patterns: ['\u731d\u7ea2\u4e4b\u5730', '\u731d\u7ea2'] },
  { code: 'hallow', patterns: ['\u795e\u5723\u4e4b\u5730', '\u795e\u5723'] },
  { code: 'forest', patterns: ['\u68ee\u6797'] },
  { code: 'town', patterns: ['\u57ce\u9547'] },
];

const GAME_PERIOD_RULES = [
  { code: 'hardmode', patterns: ['\u5728 \u56f0\u96be\u6a21\u5f0f \u4e2d', '\u5728\u56f0\u96be\u6a21\u5f0f\u4e2d', '\u56f0\u96be\u6a21\u5f0f'] },
];

const WORLD_CONTEXT_RULES = [
  { code: 'DAY', patterns: ['\u767d\u5929', '\u5728 \u767d\u5929', '\u5728\u767d\u5929'] },
  { code: 'NIGHT', patterns: ['\u5728\u591c\u665a\u671f\u95f4', '\u591c\u665a\u671f\u95f4', '\u591c\u665a', '\u591c\u95f4'] },
  { code: 'BLOOD_MOON', patterns: ['\u5728 \u8840\u6708 \u671f\u95f4', '\u8840\u6708\u671f\u95f4', '\u8840\u6708'] },
  { code: 'WINDY_DAY', patterns: ['\u5728 \u5927\u98ce\u5929 \u65f6', '\u5927\u98ce\u5929\u65f6', '\u5927\u98ce\u5929'] },
  { code: 'PARTY', patterns: ['\u5728 \u6d3e\u5bf9 \u671f\u95f4', '\u6d3e\u5bf9\u671f\u95f4', '\u6d3e\u5bf9 \u671f\u95f4', '\u6d3e\u5bf9\u8fdb\u884c\u4e2d\u65f6'] },
  { code: 'LANTERN_NIGHT', patterns: ['\u5728 \u706f\u7b3c\u591c \u671f\u95f4', '\u706f\u7b3c\u591c\u671f\u95f4', '\u706f\u7b3c\u591c \u671f\u95f4'] },
  { code: 'SOLAR_ECLIPSE', patterns: ['\u5728 \u65e5\u98df \u671f\u95f4', '\u65e5\u98df\u671f\u95f4', '\u65e5\u98df \u671f\u95f4'] },
  { code: 'HALLOWEEN', patterns: ['\u5728 \u4e07\u5723\u8282 \u671f\u95f4', '\u4e07\u5723\u8282\u671f\u95f4', '\u4e07\u5723\u8282 \u671f\u95f4'] },
  { code: 'CHRISTMAS', patterns: ['\u5728 \u5723\u8bde\u8282 \u671f\u95f4', '\u5723\u8bde\u8282\u671f\u95f4', '\u5723\u8bde\u8282 \u671f\u95f4'] },
  { code: 'VALENTINES_DAY', patterns: ['\u5728 \u60c5\u4eba\u8282 \u671f\u95f4', '\u60c5\u4eba\u8282\u671f\u95f4', '\u60c5\u4eba\u8282 \u671f\u95f4'] },
  { code: 'THANKSGIVING', patterns: ['\u5728 \u611f\u6069\u8282 \u671f\u95f4', '\u611f\u6069\u8282\u671f\u95f4', '\u611f\u6069\u8282 \u671f\u95f4'] },
  { code: 'OKTOBERFEST', patterns: ['\u5728 \u5341\u6708\u5564\u9152\u8282 \u671f\u95f4', '\u5341\u6708\u5564\u9152\u8282\u671f\u95f4', '\u5341\u6708\u5564\u9152\u8282 \u671f\u95f4'] },
  { code: 'MOON_PHASE_1_4', patterns: ['\u6708\u76f8 1\u20134', '\u6708\u76f8 1-4', '\u5728 \u6708\u76f8 1\u20134 \u671f\u95f4', '\u5728 \u6708\u76f8 1-4 \u671f\u95f4'] },
  { code: 'MOON_PHASE_LISTED', patterns: ['\u4ee5\u4e0b\u6708\u76f8', '\u4ee5\u4e0b \u6708\u76f8', '\u4e0b\u5217 \u6708\u76f8', '\u5728\u4e0b\u5217 \u6708\u76f8 \u671f\u95f4', '\u5728\u4ee5\u4e0b \u6708\u76f8 \u671f\u95f4', '\u4ee5\u4e0b\u6708\u76f8\u671f\u95f4'] },
  { code: 'MARTIAN_MADNESS_COMPLETED', patterns: ['\u5728\u6253\u8d25\u4e86 \u706b\u661f\u66b4\u4e71 \u4e8b\u4ef6\u540e', '\u6253\u8d25\u4e86 \u706b\u661f\u66b4\u4e71 \u4e8b\u4ef6\u540e', '\u706b\u661f\u66b4\u4e71 \u4e8b\u4ef6\u540e', '\u706b\u661f\u66b4\u4e71\u4e8b\u4ef6\u540e'] },
  { code: 'PIRATE_INVASION_COMPLETED', patterns: ['\u6d77\u76d7\u5165\u4fb5 \u5df2\u88ab\u6253\u8d25', '\u6253\u8d25 \u6d77\u76d7\u5165\u4fb5 \u540e', '\u6253\u8d25\u4e86 \u6d77\u76d7\u5165\u4fb5 \u540e', '\u5df2\u6253\u8d25 \u6d77\u76d7\u5165\u4fb5'] },
  { code: 'SNOW_LEGION_COMPLETED', patterns: ['\u96ea\u4eba\u519b\u56e2 \u5df2\u88ab\u6253\u8d25', '\u6253\u8d25 \u96ea\u4eba\u519b\u56e2 \u540e', '\u6253\u8d25\u4e86 \u96ea\u4eba\u519b\u56e2 \u540e', '\u5df2\u6253\u8d25 \u96ea\u4eba\u519b\u56e2'] },
  { code: 'ANY_MECH_BOSS_DEFEATED', patterns: ['\u4efb\u4f55 \u673a\u68b0 Boss \u88ab\u6253\u8d25\u540e', '\u4efb\u610f \u673a\u68b0 Boss \u88ab\u6253\u8d25\u540e', '\u81f3\u5c11\u4e00\u4e2a \u673a\u68b0 Boss \u540e', '\u6253\u8d25\u81f3\u5c11\u4e00\u4e2a \u673a\u68b0 Boss \u4e4b\u540e', '\u6253\u8d25\u81f3\u5c11\u4e00\u4e2a \u673a\u68b0 Boss \u540e', '\u6253\u8d25\u4e86\u81f3\u5c11\u4e00\u4e2a \u673a\u68b0 Boss \u540e', '\u6709\u4efb\u4e00 \u673a\u68b0 Boss \u5df2\u88ab\u6253\u8d25', '\u4efb\u4e00 \u673a\u68b0 Boss \u5df2\u88ab\u6253\u8d25'] },
  { code: 'ALL_MECH_BOSSES_DEFEATED', patterns: ['\u5168\u90e8\u4e09\u4e2a \u673a\u68b0 Boss \u90fd\u5df2\u88ab\u6253\u8d25', '\u5168\u90e8\u4e09\u4e2a \u673a\u68b0 Boss \u5df2\u88ab\u6253\u8d25'] },
  { code: 'FULL_MOON', patterns: ['\u6ee1\u6708'] },
  { code: 'NEW_MOON', patterns: ['\u65b0\u6708'] },
  { code: 'FIRST_QUARTER', patterns: ['\u4e0a\u5f26\u6708'] },
  { code: 'LAST_QUARTER', patterns: ['\u4e0b\u5f26\u6708'] },
  { code: 'WAXING_CRESCENT', patterns: ['\u5a25\u7709\u6708'] },
  { code: 'WANING_CRESCENT', patterns: ['\u6b8b\u6708'] },
  { code: 'WAXING_GIBBOUS', patterns: ['\u76c8\u51f8\u6708'] },
  { code: 'WANING_GIBBOUS', patterns: ['\u4e8f\u51f8\u6708'] },
];

const REQUIRED_TOWN_NPC_WORLD_CONTEXTS = [
  {
    id: -900,
    code: 'DAY',
    nameEn: 'Day',
    nameZh: '\u767d\u5929',
    contextType: 'TIME',
    description: 'Public NPC shop condition for daytime availability.',
    sortOrder: 205,
    status: 1,
  },
  {
    id: -901,
    code: 'NIGHT',
    nameEn: 'Night',
    nameZh: '\u591c\u665a',
    contextType: 'TIME',
    description: 'Public NPC shop condition for night-only availability.',
    sortOrder: 210,
    status: 1,
  },
  {
    id: -902,
    code: 'BLOOD_MOON',
    nameEn: 'Blood Moon',
    nameZh: '\u8840\u6708',
    contextType: 'EVENT',
    description: 'Public NPC shop condition for Blood Moon availability.',
    sortOrder: 220,
    status: 1,
  },
  {
    id: -903,
    code: 'WINDY_DAY',
    nameEn: 'Windy Day',
    nameZh: '\u5927\u98ce\u5929',
    contextType: 'WEATHER',
    description: 'Public NPC shop condition for windy day availability.',
    sortOrder: 230,
    status: 1,
  },
  {
    id: -904,
    code: 'PARTY',
    nameEn: 'Party',
    nameZh: '\u6d3e\u5bf9',
    contextType: 'EVENT',
    description: 'Public NPC shop condition for party event availability.',
    sortOrder: 240,
    status: 1,
  },
  {
    id: -912,
    code: 'MOON_PHASE_1_4',
    nameEn: 'Moon Phase 1-4',
    nameZh: '\u6708\u76f8 1\u20134',
    contextType: 'MOON_PHASE',
    description: 'Public NPC shop condition for moon phase 1-4 availability.',
    sortOrder: 300,
    status: 1,
  },
  {
    id: -913,
    code: 'MOON_PHASE_LISTED',
    nameEn: 'Listed Moon Phases',
    nameZh: '\u4ee5\u4e0b\u6708\u76f8',
    contextType: 'MOON_PHASE',
    description: 'Public NPC shop condition for listed moon phase availability.',
    sortOrder: 310,
    status: 1,
  },
  {
    id: -914,
    code: 'MARTIAN_MADNESS_COMPLETED',
    nameEn: 'Martian Madness Completed',
    nameZh: '\u706b\u661f\u66b4\u4e71\u5df2\u5b8c\u6210',
    contextType: 'PROGRESSION',
    description: 'Public NPC shop condition for Martian Madness completion unlocks.',
    sortOrder: 320,
    status: 1,
  },
  {
    id: -915,
    code: 'PIRATE_INVASION_COMPLETED',
    nameEn: 'Pirate Invasion Completed',
    nameZh: '\u6d77\u76d7\u5165\u4fb5\u5df2\u5b8c\u6210',
    contextType: 'PROGRESSION',
    description: 'Public NPC shop condition for Pirate Invasion completion unlocks.',
    sortOrder: 330,
    status: 1,
  },
  {
    id: -916,
    code: 'SNOW_LEGION_COMPLETED',
    nameEn: 'Snow Legion Completed',
    nameZh: '\u96ea\u4eba\u519b\u56e2\u5df2\u5b8c\u6210',
    contextType: 'PROGRESSION',
    description: 'Public NPC shop condition for Snow Legion completion unlocks.',
    sortOrder: 340,
    status: 1,
  },
  {
    id: -917,
    code: 'ANY_MECH_BOSS_DEFEATED',
    nameEn: 'Any Mechanical Boss Defeated',
    nameZh: '\u4efb\u4e00\u673a\u68b0Boss\u5df2\u51fb\u8d25',
    contextType: 'PROGRESSION',
    description: 'Public NPC shop condition for any mechanical boss defeat unlocks.',
    sortOrder: 350,
    status: 1,
  },
  {
    id: -918,
    code: 'ALL_MECH_BOSSES_DEFEATED',
    nameEn: 'All Mechanical Bosses Defeated',
    nameZh: '\u5168\u90e8\u673a\u68b0Boss\u5df2\u51fb\u8d25',
    contextType: 'PROGRESSION',
    description: 'Public NPC shop condition for all mechanical bosses defeat unlocks.',
    sortOrder: 360,
    status: 1,
  },
  {
    id: -905,
    code: 'LANTERN_NIGHT',
    nameEn: 'Lantern Night',
    nameZh: '\u706f\u7b3c\u591c',
    contextType: 'EVENT',
    description: 'Public NPC shop condition for Lantern Night availability.',
    sortOrder: 245,
    status: 1,
  },
  {
    id: -906,
    code: 'SOLAR_ECLIPSE',
    nameEn: 'Solar Eclipse',
    nameZh: '\u65e5\u98df',
    contextType: 'EVENT',
    description: 'Public NPC shop condition for Solar Eclipse availability.',
    sortOrder: 248,
    status: 1,
  },
  {
    id: -907,
    code: 'HALLOWEEN',
    nameEn: 'Halloween',
    nameZh: '\u4e07\u5723\u8282',
    contextType: 'EVENT',
    description: 'Public NPC shop condition for Halloween availability.',
    sortOrder: 250,
    status: 1,
  },
  {
    id: -908,
    code: 'CHRISTMAS',
    nameEn: 'Christmas',
    nameZh: '\u5723\u8bde\u8282',
    contextType: 'EVENT',
    description: 'Public NPC shop condition for Christmas availability.',
    sortOrder: 260,
    status: 1,
  },
  {
    id: -909,
    code: 'VALENTINES_DAY',
    nameEn: "Valentine's Day",
    nameZh: '\u60c5\u4eba\u8282',
    contextType: 'EVENT',
    description: 'Public NPC shop condition for Valentine event availability.',
    sortOrder: 270,
    status: 1,
  },
  {
    id: -910,
    code: 'THANKSGIVING',
    nameEn: 'Thanksgiving',
    nameZh: '\u611f\u6069\u8282',
    contextType: 'EVENT',
    description: 'Public NPC shop condition for Thanksgiving availability.',
    sortOrder: 280,
    status: 1,
  },
  {
    id: -911,
    code: 'OKTOBERFEST',
    nameEn: 'Oktoberfest',
    nameZh: '\u5341\u6708\u5564\u9152\u8282',
    contextType: 'EVENT',
    description: 'Public NPC shop condition for Oktoberfest availability.',
    sortOrder: 290,
    status: 1,
  },
];

export function getRequiredTownNpcWorldContexts() {
  return REQUIRED_TOWN_NPC_WORLD_CONTEXTS.map((entry) => ({ ...entry }));
}

export function buildTownNpcShopConditionLookup({ biomes, gamePeriods, items, npcs, worldContexts }) {
  return {
    biomesByCode: new Map(
      (Array.isArray(biomes) ? biomes : [])
        .map((entry) => normalizeRef(entry, 'BIOME'))
        .filter(Boolean)
        .map((entry) => [entry.key, entry])
    ),
    gamePeriodsByCode: new Map(
      (Array.isArray(gamePeriods) ? gamePeriods : [])
        .map((entry) => normalizeRef(entry, 'GAME_PERIOD'))
        .filter(Boolean)
        .map((entry) => [entry.key, entry])
    ),
    itemsByAny: buildItemRefLookup(items),
    npcsByAny: buildNpcRefLookup(npcs),
    worldContextsByCode: new Map(
      (Array.isArray(worldContexts) ? worldContexts : [])
        .map((entry) => normalizeRef(entry, 'WORLD_CONTEXT'))
        .filter(Boolean)
        .map((entry) => [entry.key, entry])
    ),
  };
}

export function extractTownNpcShopConditions(availability, lookup) {
  const text = normalizeText(availability);
  if (!text) {
    return [];
  }

  const matches = [
    ...collectMatches(text, BIOME_RULES, lookup?.biomesByCode, 'BIOME'),
    ...collectMatches(text, GAME_PERIOD_RULES, lookup?.gamePeriodsByCode, 'GAME_PERIOD'),
    ...collectItemPossessionMatches(text, lookup?.itemsByAny),
    ...collectNpcDefeatMatches(text, lookup?.npcsByAny),
    ...collectNpcPresenceMatches(text, lookup?.npcsByAny),
    ...collectMatches(text, WORLD_CONTEXT_RULES, lookup?.worldContextsByCode, 'WORLD_CONTEXT'),
  ];

  const deduped = new Map();
  for (const match of matches) {
    const key = `${match.refType}:${match.refId}`;
    if (!deduped.has(key) || match.matchIndex < deduped.get(key).matchIndex) {
      deduped.set(key, match);
    }
  }

  return [...deduped.values()]
    .sort((left, right) => left.matchIndex - right.matchIndex)
    .map((match, index) => ({
      refType: match.refType,
      refId: match.refId,
      conditionRole: 'required',
      sortOrder: index,
      code: match.code,
      label: match.label,
      notes: null,
    }));
}

function collectMatches(text, rules, refMap, refType) {
  if (!(refMap instanceof Map) || refMap.size === 0) {
    return [];
  }

  const matches = [];
  for (const rule of Array.isArray(rules) ? rules : []) {
    const ref = refMap.get(normalizeCode(rule?.code));
    if (!ref) {
      continue;
    }

    const matchIndex = firstMatchIndex(text, Array.isArray(rule?.patterns) ? rule.patterns : []);
    if (matchIndex < 0) {
      continue;
    }

    matches.push({
      refType,
      refId: ref.id,
      code: ref.code,
      label: ref.label,
      matchIndex,
    });
  }
  return matches;
}

function collectItemPossessionMatches(text, itemMap) {
  if (!(itemMap instanceof Map) || itemMap.size === 0) {
    return [];
  }

  const matches = [];
  const patterns = [
    /\u5f53\u73a9\u5bb6\u7684\u7269\u54c1\u680f\u4e2d\u5e26\u6709\s*([^\u3002\uff1b\uff0c()（）]+?)\s*\u65f6/g,
    /\u5f53\u73a9\u5bb6\u62e5\u6709\s*([^\u3002\uff1b\uff0c()（）]+?)\s*(?:\u65f6|$|[()（）])/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const rawName = normalizeText(match[1]);
      const key = normalizeLookupKey(rawName);
      if (!key) {
        continue;
      }
      const ref = itemMap.get(key);
      if (!ref) {
        continue;
      }
      matches.push({
        refType: 'ITEM',
        refId: ref.id,
        code: ref.code,
        label: ref.label,
        matchIndex: match.index ?? 0,
      });
    }
  }
  return matches;
}

function collectNpcPresenceMatches(text, npcMap) {
  if (!(npcMap instanceof Map) || npcMap.size === 0) {
    return [];
  }

  const matches = [];
  const patterns = [
    /(?:^|[，。；：:（）()])\s*(?:若|当|如果|且当)?\s*([^，。；：:（）()]+?)\s*在场(?:时)?(?=$|[，。；：:（）()])/g
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const rawName = normalizeText(match[1]);
      const key = normalizeLookupKey(rawName);
      if (!key) {
        continue;
      }
      const ref = npcMap.get(key);
      if (!ref) {
        continue;
      }
      const fullMatch = normalizeText(match[0]) ?? '';
      const matchText = normalizeText(match[1]) ?? '';
      const candidateIndex = Math.max(
        match.index ?? 0,
        (match.index ?? 0) + fullMatch.indexOf(matchText)
      );
      matches.push({
        refType: 'NPC',
        refId: ref.id,
        code: ref.code,
        label: ref.label,
        matchIndex: candidateIndex,
      });
    }
  }
  return matches;
}

function collectNpcDefeatMatches(text, npcMap) {
  if (!(npcMap instanceof Map) || npcMap.size === 0) {
    return [];
  }

  const matches = [];
  const patterns = [
    /(?:\u5982\u679c\u5df2\u6253\u8d25|\u82e5\u5df2\u6253\u8d25)\s*([^\u3002\uff1b\uff0c\uff1a:()锛堬級]+?)(?=$|[\u3002\uff1b\uff0c\uff1a:()锛堬級])/g,
    /(?:\u6253\u8d25\u4e86|\u6253\u8d25|\u51fb\u8d25)\s*([^\u3002\uff1b\uff0c\uff1a:()锛堬級]+?)\s*\u540e/g,
    /([^\u3002\uff1b\uff0c\uff1a:()锛堬級]+?)\s*\u5df2\u88ab\u6253\u8d25(?:\u65f6|\u540e)?/g,
    /([^\u3002\uff1b\uff0c\uff1a:()锛堬級]+?)\s*\u88ab(?:\u6253|\u51fb)\u8d25\u540e/g,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const rawTarget = normalizeNpcDefeatTarget(match[1]);
      if (!rawTarget || looksLikeCompositeDefeatTarget(rawTarget)) {
        continue;
      }
      const key = normalizeLookupKey(rawTarget);
      if (!key) {
        continue;
      }
      const ref = npcMap.get(key);
      if (!ref) {
        continue;
      }
      const fullMatch = normalizeText(match[0]) ?? '';
      const matchText = normalizeText(match[1]) ?? '';
      const candidateIndex = Math.max(
        match.index ?? 0,
        (match.index ?? 0) + fullMatch.indexOf(matchText)
      );
      matches.push({
        refType: 'NPC',
        refId: ref.id,
        code: ref.code,
        label: ref.label,
        matchIndex: candidateIndex,
      });
    }
  }

  return matches;
}

function buildItemRefLookup(items) {
  const result = new Map();
  for (const entry of Array.isArray(items) ? items : []) {
    const ref = normalizeRef(entry, 'ITEM');
    if (!ref) {
      continue;
    }
    for (const value of [entry?.internalName, entry?.nameEn, entry?.name, entry?.nameZh]) {
      const key = normalizeLookupKey(value);
      if (key && !result.has(key)) {
        result.set(key, ref);
      }
    }
  }
  return result;
}

function buildNpcRefLookup(npcs) {
  const result = new Map();
  for (const entry of Array.isArray(npcs) ? npcs : []) {
    const ref = normalizeRef(entry, 'NPC');
    if (!ref) {
      continue;
    }
    for (const value of [entry?.internalName, entry?.nameEn, entry?.name, entry?.nameZh]) {
      const key = normalizeLookupKey(value);
      if (key && !result.has(key)) {
        result.set(key, ref);
      }
    }
  }
  return result;
}

function looksLikeCompositeDefeatTarget(value) {
  const text = normalizeText(value) ?? '';
  if (text === '') {
    return true;
  }
  return /[、/]|(?:\s*[和或及与]\s*)|(?:\u81f3\u5c11\u4e00\u4e2a)|(?:\u4efb\u610f)|(?:\u5168\u90e8)|(?:\u4e8b\u4ef6)|(?:\u5165\u4fb5)|(?:\u519b\u56e2)|(?:boss)/i.test(text);
}

function normalizeNpcDefeatTarget(value) {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }
  const normalized = text.replace(/^(?:(?:\u5f53|\u5982\u679c|\u82e5|\u5728)\s*)+/, '').trim();
  return normalized === '' ? null : normalized;
}

function firstMatchIndex(text, patterns) {
  let best = -1;
  for (const pattern of patterns) {
    const normalizedPattern = normalizeText(pattern);
    if (!normalizedPattern) {
      continue;
    }
    const index = text.indexOf(normalizedPattern);
    if (index >= 0 && (best < 0 || index < best)) {
      best = index;
    }
  }
  return best;
}

function normalizeRef(entry, fallbackType) {
  const id = toInt(entry?.id);
  const code = normalizeText(entry?.code ?? entry?.internalName ?? entry?.nameEn ?? entry?.name);
  const key = normalizeCode(entry?.code ?? entry?.internalName ?? entry?.nameEn ?? entry?.name);
  if (id == null || !code || !key) {
    return null;
  }

  return {
    id,
    code,
    key,
    refType: normalizeText(entry?.refType) ?? fallbackType,
    label: normalizeText(entry?.nameZh) ?? normalizeText(entry?.nameEn) ?? code,
  };
}

function normalizeCode(value) {
  const text = normalizeText(value);
  return text ? text.toLowerCase() : null;
}

function normalizeLookupKey(value) {
  const text = normalizeText(value);
  return text
    ? text
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
    : null;
}

function normalizeText(value) {
  if (value == null) {
    return null;
  }
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text === '' ? null : text;
}

function toInt(value) {
  if (value == null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}
