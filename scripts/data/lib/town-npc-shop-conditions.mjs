const BIOME_RULES = [
  { code: 'graveyard', patterns: ['墓地附近', '墓地'] },
  { code: 'underground_jungle', patterns: ['地下丛林'] },
  { code: 'jungle_temple', patterns: ['丛林神庙'] },
  { code: 'jungle', patterns: ['丛林'] },
  { code: 'snow', patterns: ['雪原生物群系', '雪原'] },
  { code: 'ice', patterns: ['冰雪群系'] },
  { code: 'desert', patterns: ['沙漠'] },
  { code: 'ocean', patterns: ['海洋'] },
  { code: 'dungeon', patterns: ['地牢'] },
  { code: 'corruption', patterns: ['腐化之地', '腐化'] },
  { code: 'crimson', patterns: ['猩红之地', '猩红'] },
  { code: 'hallow', patterns: ['神圣之地', '神圣'] },
  { code: 'forest', patterns: ['森林'] },
  { code: 'town', patterns: ['城镇'] },
];

const WORLD_CONTEXT_RULES = [
  { code: 'FULL_MOON', patterns: ['满月'] },
  { code: 'NEW_MOON', patterns: ['新月'] },
  { code: 'FIRST_QUARTER', patterns: ['上弦月'] },
  { code: 'LAST_QUARTER', patterns: ['下弦月'] },
  { code: 'WAXING_CRESCENT', patterns: ['娥眉月'] },
  { code: 'WANING_CRESCENT', patterns: ['残月'] },
  { code: 'WAXING_GIBBOUS', patterns: ['盈凸月'] },
  { code: 'WANING_GIBBOUS', patterns: ['亏凸月'] },
];

export function buildTownNpcShopConditionLookup({ biomes, worldContexts }) {
  return {
    biomesByCode: new Map(
      (Array.isArray(biomes) ? biomes : [])
        .map((entry) => normalizeRef(entry, 'BIOME'))
        .filter(Boolean)
        .map((entry) => [entry.key, entry])
    ),
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
  const code = normalizeText(entry?.code);
  const key = normalizeCode(entry?.code);
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
