const KNOWN_NPC_SOURCE_BOSS_NAMES = Object.freeze([
  'Betsy',
  'Dark Mage',
  'Everscream',
  'Flying Dutchman',
  'Ice Queen',
  'Lunatic Cultist',
  'Mechdusa',
  'Mourning Wood',
  'Nebula Pillar',
  'Ogre',
  'Pumpking',
  'Santa-NK1',
  'Solar Pillar',
  'Stardust Pillar',
  'Vortex Pillar',
]);

const COLLECTIVE_BOSS_SOURCE_NAMES = Object.freeze([
  'Celestial Pillars',
]);

export function buildBossNameLookup(values = []) {
  const lookup = new Map();
  for (const value of values) {
    const text = toNullableText(value);
    if (!text) {
      continue;
    }
    lookup.set(normalizeBossNameKey(text), text);
  }
  return lookup;
}

export function getKnownNpcSourceBossNames() {
  return [...KNOWN_NPC_SOURCE_BOSS_NAMES];
}

export function isCollectiveBossSourceName(value) {
  const normalized = normalizeBossNameKey(value);
  return COLLECTIVE_BOSS_SOURCE_NAMES.some((entry) => normalizeBossNameKey(entry) === normalized);
}

export function normalizeBossNameKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function parseTreasureBagBossName(value) {
  const normalized = toNullableText(value);
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^Treasure Bag\s*\((.+)\)$/);
  return match?.[1]?.trim() || null;
}

export function resolveBossNameFromSourceName(sourceName, bossNameLookup) {
  if (!(bossNameLookup instanceof Map) || bossNameLookup.size === 0) {
    return null;
  }

  const directName = toNullableText(sourceName);
  if (directName) {
    const matched = bossNameLookup.get(normalizeBossNameKey(directName));
    if (matched) {
      return matched;
    }
  }

  const bagBossName = parseTreasureBagBossName(sourceName);
  if (!bagBossName) {
    return null;
  }

  return bossNameLookup.get(normalizeBossNameKey(bagBossName)) ?? null;
}

export function resolveBossNameFromStructuredSource(source, bossNameLookup) {
  const directMatch = resolveBossNameFromSourceName(source?.sourceRefName, bossNameLookup);
  if (directMatch) {
    return directMatch;
  }

  if (!isCollectiveBossSourceName(source?.sourceRefName)) {
    return null;
  }

  const pillarBossName = resolveCelestialPillarBossName(source);
  if (!pillarBossName) {
    return null;
  }

  if (bossNameLookup instanceof Map && bossNameLookup.size > 0) {
    return bossNameLookup.get(normalizeBossNameKey(pillarBossName)) ?? null;
  }
  return pillarBossName;
}

export function toNullableText(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function resolveCelestialPillarBossName(source) {
  const candidates = [
    toNullableText(source?.itemInternalName),
    toNullableText(source?.itemName),
    toNullableText(source?.sourcePage),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const normalized = normalizeBossNameKey(candidate);
    if (normalized.includes('solar')) {
      return 'Solar Pillar';
    }
    if (normalized.includes('nebula')) {
      return 'Nebula Pillar';
    }
    if (normalized.includes('vortex')) {
      return 'Vortex Pillar';
    }
    if (normalized.includes('stardust')) {
      return 'Stardust Pillar';
    }
  }

  return null;
}
