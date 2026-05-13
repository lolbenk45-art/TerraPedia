const COVERAGE_PAGE_TITLE_BY_INTERNAL_NAME = new Map([
  ['BlueJellyfish', 'Jellyfish'],
  ['PinkJellyfish', 'Jellyfish'],
  ['GreenJellyfish', 'Jellyfish'],
  ['Mummy', 'Mummies'],
  ['DarkMummy', 'Mummies'],
  ['LightMummy', 'Mummies'],
  ['BloodMummy', 'Mummies'],
  ['SlimeMasked', 'Slimes'],
  ['SlimeRibbonWhite', 'Slimes'],
  ['SlimeRibbonYellow', 'Slimes'],
  ['SlimeRibbonGreen', 'Slimes'],
  ['SlimeRibbonRed', 'Slimes'],
  ['Duck', 'Ducks'],
  ['Duck2', 'Ducks'],
  ['DuckWhite', 'Ducks'],
  ['DuckWhite2', 'Ducks'],
  ['ScorpionBlack', 'Scorpions'],
  ['Scorpion', 'Scorpions'],
  ['BlackDragonfly', 'Dragonflies'],
  ['BlueDragonfly', 'Dragonflies'],
  ['GreenDragonfly', 'Dragonflies'],
  ['OrangeDragonfly', 'Dragonflies'],
  ['RedDragonfly', 'Dragonflies'],
  ['YellowDragonfly', 'Dragonflies'],
  ['TownCat', 'Town Cat'],
  ['TownDog', 'Town Dog'],
  ['TownSlimeBlue', 'Town Slimes'],
  ['TownSlimeGreen', 'Town Slimes'],
  ['TownSlimeOld', 'Town Slimes'],
  ['TownSlimePurple', 'Town Slimes'],
  ['TownSlimeRainbow', 'Town Slimes'],
  ['TownSlimeRed', 'Town Slimes'],
  ['TownSlimeYellow', 'Town Slimes'],
  ['TownSlimeCopper', 'Town Slimes']
]);

const DISPLAY_NAME_BY_PAGE_TITLE = new Map([
  ['towncat', 'Cat'],
  ['towndog', 'Dog']
]);

const TOWN_SLIME_NAME_BY_AUTO_ID = new Map([
  ['670', 'Nerdy Slime'],
  ['678', 'Cool Slime'],
  ['679', 'Elder Slime'],
  ['680', 'Clumsy Slime'],
  ['681', 'Diva Slime'],
  ['682', 'Surly Slime'],
  ['683', 'Mystic Slime'],
  ['684', 'Squire Slime']
]);

const TOWN_SLIME_ROW_PATTERN = /\|\s*\{\{npc infobox\|auto=(\d+)\|type=NPC\}\}\s*\r?\n\|\s*([\s\S]*?)\s*\r?\n\|\s*\[\[File:Map Icon ([^|\]]+)\.png\|link=\]\]/gi;

export function getNpcCoveragePageTitle(record) {
  const internalName = toText(record?.internalName);
  if (internalName && COVERAGE_PAGE_TITLE_BY_INTERNAL_NAME.has(internalName)) {
    return COVERAGE_PAGE_TITLE_BY_INTERNAL_NAME.get(internalName);
  }
  return toText(record?.name);
}

export function getNpcCoverageEntityId(record) {
  return toEntityId(record?.name);
}

export function getNpcDisplayName({ pageTitle, fallbackName } = {}) {
  const normalizedTitle = normalizeKey(pageTitle);
  if (DISPLAY_NAME_BY_PAGE_TITLE.has(normalizedTitle)) {
    return DISPLAY_NAME_BY_PAGE_TITLE.get(normalizedTitle);
  }
  return toText(fallbackName) ?? toText(pageTitle) ?? '';
}

export function extractNpcGroupMembers({ pageTitle, revisionText } = {}) {
  if (normalizeKey(pageTitle) !== 'townslimes') {
    return [];
  }

  const text = String(revisionText ?? '');
  const members = [];
  let match;

  while ((match = TOWN_SLIME_ROW_PATTERN.exec(text)) !== null) {
    const autoId = String(match[1] ?? '').trim();
    const moveInCondition = cleanInlineText(match[2]);
    const iconName = cleanInlineText(match[3]);
    const name = iconName || TOWN_SLIME_NAME_BY_AUTO_ID.get(autoId) || '';
    if (!name) {
      continue;
    }

    members.push({
      entityId: toEntityId(name),
      name,
      pageTitle: 'Town Slimes',
      moveInCondition
    });
  }

  return dedupeGroupMembers(members);
}

export function collectNpcCoverageEntityIds(normalizedRecord) {
  const record = normalizedRecord ?? {};
  const ids = new Set();

  const primaryEntityId = toText(record?.entityId);
  if (primaryEntityId) {
    ids.add(primaryEntityId);
  }

  const displayEntityId = toEntityId(record?.display?.name);
  if (displayEntityId) {
    ids.add(displayEntityId);
  }

  const sourceEntityId = toEntityId(record?.source?.pageTitle);
  if (sourceEntityId) {
    ids.add(sourceEntityId);
  }

  for (const member of Array.isArray(record?.groupMembers) ? record.groupMembers : []) {
    const memberEntityId = toText(member?.entityId) ?? toEntityId(member?.name);
    if (memberEntityId) {
      ids.add(memberEntityId);
    }
  }

  return [...ids];
}

function dedupeGroupMembers(members) {
  const deduped = new Map();
  for (const member of members) {
    const key = toText(member?.entityId) ?? toText(member?.name);
    if (!key) {
      continue;
    }
    deduped.set(key, member);
  }
  return [...deduped.values()];
}

function cleanInlineText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function toEntityId(value) {
  const text = toText(value);
  if (!text) {
    return '';
  }
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toText(value) {
  if (value == null) {
    return null;
  }
  const text = String(value).trim();
  return text.length ? text : null;
}
