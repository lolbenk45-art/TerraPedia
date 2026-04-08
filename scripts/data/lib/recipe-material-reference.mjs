export const RECIPE_HOME_PAGE_URL = 'https://terraria.wiki.gg/wiki/Recipes';
export const RECIPE_GROUP_SOURCE_URLS = [
  'https://terraria.wiki.gg/wiki/Alternative_crafting_ingredients',
  'https://terraria.wiki.gg/zh/wiki/%E5%8F%AF%E9%80%89%E6%8B%A9%E5%88%B6%E4%BD%9C%E6%9D%90%E6%96%99'
];

const GROUP_ALIAS_SETS = [
  ['Any Wood', ['Any Wood', '\u4efb\u4f55\u6728\u6750', '\u4efb\u610f\u6728\u6750']],
  ['Any Torch', ['Any Torch', '\u4efb\u4f55\u706b\u628a', '\u4efb\u610f\u706b\u628a']],
  ['Any Iron Bar', ['Any Iron Bar', '\u4efb\u4f55\u94c1\u952d', '\u4efb\u610f\u94c1\u952d']],
  ['Any Cobalt Bar', ['Any Cobalt Bar', '\u4efb\u4f55\u94b4\u952d', '\u4efb\u610f\u94b4\u952d']],
  ['Any Mythril Bar', ['Any Mythril Bar', '\u4efb\u4f55\u79d8\u94f6\u952d', '\u4efb\u610f\u79d8\u94f6\u952d']],
  ['Any Adamantite Bar', ['Any Adamantite Bar', '\u4efb\u4f55\u7cbe\u91d1\u952d', '\u4efb\u610f\u7cbe\u91d1\u952d']],
  ['Any Sand Block', ['Any Sand Block', 'Any Sand', '\u4efb\u4f55\u6c99', '\u4efb\u4f55\u6c99\u5757', '\u4efb\u610f\u6c99\u5757']],
  ['Any Stone Block', ['Any Stone Block', 'Any Stone', '\u4efb\u4f55\u77f3', '\u4efb\u4f55\u77f3\u5757', '\u4efb\u610f\u77f3\u5757']],
  ['Any Pressure Plate', ['Any Pressure Plate', '\u4efb\u4f55\u538b\u529b\u677f', '\u4efb\u610f\u538b\u529b\u677f']],
  ['Any Bird', ['Any Bird', '\u4efb\u4f55\u9e1f', '\u4efb\u610f\u9e1f\u7c7b']],
  ['Any Scorpion', ['Any Scorpion', '\u4efb\u4f55\u874e\u5b50', '\u4efb\u610f\u874e\u5b50']],
  ['Any Squirrel', ['Any Squirrel', '\u4efb\u4f55\u677e\u9f20', '\u4efb\u610f\u677e\u9f20']],
  ['Any Jungle Bug', ['Any Jungle Bug', '\u4efb\u4f55\u4e1b\u6797\u866b\u5b50', '\u4efb\u4f55\u4e1b\u6797\u6606\u866b', '\u4efb\u610f\u4e1b\u6797\u6606\u866b']],
  ['Any Duck', ['Any Duck', '\u4efb\u4f55\u9e2d', '\u4efb\u610f\u9e2d\u5b50']],
  ['Any Butterfly', ['Any Butterfly', '\u4efb\u4f55\u8774\u8776', '\u4efb\u610f\u8774\u8776']],
  ['Any Firefly', ['Any Firefly', '\u4efb\u4f55\u8424\u706b\u866b', '\u4efb\u610f\u8424\u706b\u866b']],
  ['Any Snail', ['Any Snail', '\u4efb\u4f55\u8717\u725b', '\u4efb\u610f\u8717\u725b']],
  ['Any Turtle', ['Any Turtle', '\u4efb\u4f55\u9f9f', '\u4efb\u4f55\u6d77\u9f9f', '\u4efb\u610f\u6d77\u9f9f']],
  ['Any Macaw', ['Any Macaw', '\u4efb\u4f55\u91d1\u521a\u9e66\u9e49', '\u4efb\u610f\u91d1\u521a\u9e66\u9e49']],
  ['Any Cockatiel', ['Any Cockatiel', '\u4efb\u4f55\u7384\u51e4\u9e66\u9e49', '\u4efb\u610f\u9e21\u5c3e\u9e66\u9e49']],
  ['Any Dragonfly', ['Any Dragonfly', '\u4efb\u4f55\u873b\u8713', '\u4efb\u610f\u873b\u8713']],
  ['Any Jellyfish', ['Any Jellyfish', '\u4efb\u4f55\u6c34\u6bcd', '\u4efb\u610f\u6c34\u6bcd']],
  ['Any Gem Critter', ['Any Gem Critter', '\u4efb\u4f55\u5b9d\u77f3\u5c0f\u52a8\u7269', '\u4efb\u610f\u5b9d\u77f3\u5c0f\u52a8\u7269']],
  ['Any Fruit', ['Any Fruit', '\u4efb\u4f55\u6c34\u679c', '\u4efb\u610f\u6c34\u679c']],
  ['Any Balloon', ['Any Balloon', '\u4efb\u4f55\u6c14\u7403', '\u4efb\u610f\u6c14\u7403']],
  ['Any Cloud Balloon', ['Any Cloud Balloon', 'Any Cloud in a Balloon', '\u4efb\u4f55\u4e91\u6c14\u7403', '\u4efb\u610f\u4e91\u6735\u6c14\u7403']],
  ['Any Blizzard Balloon', ['Any Blizzard Balloon', 'Any Blizzard in a Balloon', '\u4efb\u4f55\u66b4\u96ea\u6c14\u7403', '\u4efb\u610f\u66b4\u96ea\u6c14\u7403']],
  ['Any Sandstorm Balloon', ['Any Sandstorm Balloon', 'Any Sandstorm in a Balloon', '\u4efb\u4f55\u6c99\u5c18\u66b4\u6c14\u7403', '\u4efb\u610f\u6c99\u66b4\u6c14\u7403']],
  ['Any Guide to Critter Companionship', ['Any Guide to Critter Companionship', '\u4efb\u4f55\u5c0f\u52a8\u7269\u53cb\u8c0a\u6307\u5357', '\u4efb\u610f\u5c0f\u52a8\u7269\u53cb\u8c0a\u6307\u5357']],
  ['Any Guide to Environmental Preservation', ['Any Guide to Environmental Preservation', '\u4efb\u4f55\u73af\u5883\u4fdd\u62a4\u6307\u5357', '\u4efb\u610f\u73af\u5883\u4fdd\u62a4\u6307\u5357']],
  ['Any Seashell or Starfish', ['Any Seashell or Starfish', 'Any Seashell', '\u4efb\u4f55\u8d1d\u58f3', '\u4efb\u4f55\u8d1d\u58f3\u6216\u6d77\u661f', '\u4efb\u610f\u6d77\u8d1d\u6216\u6d77\u661f']],
  ['Any Fragment', ['Any Fragment', '\u4efb\u4f55\u788e\u7247', '\u4efb\u610f\u788e\u7247']],
  ['Any Magic Mirror', ['Any Magic Mirror', '\u4efb\u4f55\u9b54\u955c', '\u4efb\u610f\u9b54\u955c']]
];

const GROUP_ALIAS_LOOKUP = new Map(
  GROUP_ALIAS_SETS.flatMap(([canonicalName, aliases]) =>
    aliases
      .filter((alias) => normalizeRecipeReferenceKey(alias) !== '')
      .map((alias) => [normalizeRecipeReferenceKey(alias), canonicalName])
  )
);

const GROUP_DISPLAY_NAME_ZH_LOOKUP = new Map(
  GROUP_ALIAS_SETS.map(([canonicalName, aliases]) => {
    const zhAlias = aliases.find((alias) => /[\u4e00-\u9fff]/.test(alias)) ?? canonicalName;
    return [canonicalName, zhAlias];
  })
);

export function normalizeRecipeReferenceKey(value) {
  return String(value ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function canonicalizeRecipeGroupName(value) {
  const text = normalizeRecipeMaterialLabel(value);
  if (!text) {
    return null;
  }
  return GROUP_ALIAS_LOOKUP.get(normalizeRecipeReferenceKey(text)) ?? text;
}

export function getRecipeGroupDisplayNameZh(value) {
  const canonicalName = canonicalizeRecipeGroupName(value);
  if (!canonicalName) {
    return null;
  }
  return GROUP_DISPLAY_NAME_ZH_LOOKUP.get(canonicalName) ?? null;
}

export function normalizeRecipeMaterialLabel(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const text = value
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text === '' ? null : text;
}

export function isRecipeGroupName(value) {
  const text = normalizeRecipeMaterialLabel(value);
  if (!text) {
    return false;
  }
  const key = normalizeRecipeReferenceKey(text);
  return GROUP_ALIAS_LOOKUP.has(key) || text.startsWith('Any ') || text.startsWith('\u4efb\u4f55') || text.startsWith('\u4efb\u610f');
}

export function hasFiniteAlternativeSeparator(value) {
  const text = normalizeRecipeMaterialLabel(value);
  if (!text) {
    return false;
  }
  return /\bor\b|\/|and\/or/i.test(text);
}
