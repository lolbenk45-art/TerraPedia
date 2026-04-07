import fs from 'node:fs';
import path from 'node:path';

import {
  ensureDir,
  numericOption,
  parseCliArgs,
  parseIteminfoModulePayload,
  sharedDataPath,
  writeJson
} from '../lib/wiki-item-utils.mjs';

const options = parseCliArgs(process.argv.slice(2));
const rawPath = path.resolve(
  process.cwd(),
  options.input ?? sharedDataPath('raw', 'wiki', 'module__iteminfo__data.latest.json')
);
const outputPath = path.resolve(
  process.cwd(),
  options.output ?? sharedDataPath('normalized', 'items.wiki.json')
);
const overridesPath = path.resolve(
  process.cwd(),
  options.overrides ?? sharedDataPath('mappings', 'category-overrides.json')
);
const reportDir = sharedDataPath('reports', 'normalize');
const limit = numericOption(options.limit ?? options.max, null);

ensureDir(path.dirname(outputPath));
ensureDir(reportDir);

const rawPayload = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
const moduleData = parseIteminfoModulePayload(rawPayload.moduleContent);
const wikiVersion = moduleData._terrariaversion ?? null;
const moduleGeneratedAt = moduleData._generated ?? null;
const overrides = readOverrides(overridesPath);

const rawItems = Object.entries(moduleData)
  .filter(([key, value]) => key !== '0' && /^\d+$/.test(key) && value && typeof value === 'object')
  .map(([key, value]) => ({
    id: Number(key),
    ...value
  }))
  .sort((left, right) => left.id - right.id);

const normalizedItems = rawItems
  .map((item) => normalizeItem(item, overrides))
  .filter(Boolean)
  .slice(0, Number.isFinite(limit) && limit > 0 ? limit : undefined)
  .map(stripUndefinedFields);

const categoryCounts = normalizedItems.reduce((accumulator, item) => {
  accumulator[item.categoryCode] = (accumulator[item.categoryCode] ?? 0) + 1;
  return accumulator;
}, {});

const output = {
  source: 'terraria.wiki.gg:Module:Iteminfo/data',
  sourceApi: rawPayload.apiUrl,
  sourcePageTitle: rawPayload.pageTitle,
  sourceRevisionTimestamp: rawPayload.revisionTimestamp,
  fetchedAt: rawPayload.fetchedAt,
  wikiVersion,
  moduleGeneratedAt,
  overwriteExisting: true,
  generatedAt: new Date().toISOString(),
  totalItems: normalizedItems.length,
  items: normalizedItems
};

writeJson(outputPath, output);

const reportPath = path.join(
  reportDir,
  `normalize-${new Date().toISOString().replaceAll(':', '-')}.json`
);
writeJson(reportPath, {
  input: rawPath,
  output: outputPath,
  wikiVersion,
  moduleGeneratedAt,
  fetchedAt: rawPayload.fetchedAt,
  totalRawItems: rawItems.length,
  selectedItems: normalizedItems.length,
  overridesPath: fs.existsSync(overridesPath) ? overridesPath : null,
  categoryCounts
});

console.log(`Normalized input: ${rawPath}`);
console.log(`Output: ${outputPath}`);
console.log(`Wiki version: ${wikiVersion ?? 'unknown'}`);
console.log(`Module generated: ${moduleGeneratedAt ?? 'unknown'}`);
console.log(`Selected items: ${normalizedItems.length}`);
console.log(`Report: ${reportPath}`);

function readOverrides(filePath) {
  if (!fs.existsSync(filePath)) {
    return {
      exactInternalName: {},
      exactName: {}
    };
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return {
    exactInternalName: parsed.exactInternalName ?? {},
    exactName: parsed.exactName ?? {}
  };
}

function classifyCategory(item, mappingOverrides) {
  if (!item || typeof item.name !== 'string' || item.name.trim() === '') {
    return null;
  }
  if (!item.internalName || item.internalName === 'None') {
    return null;
  }

  if (mappingOverrides.exactInternalName[item.internalName]) {
    return mappingOverrides.exactInternalName[item.internalName];
  }
  if (mappingOverrides.exactName[item.name]) {
    return mappingOverrides.exactName[item.name];
  }

  if (toNumber(item.pick, 0) > 0) {
    return 'PICKAXE';
  }
  if (toNumber(item.axe, 0) > 0) {
    return 'AXE';
  }
  if (toNumber(item.headSlot, -1) >= 0) {
    return 'HELMET';
  }
  if (toNumber(item.bodySlot, -1) >= 0) {
    return 'CHESTPLATE';
  }
  if (toNumber(item.legSlot, -1) >= 0) {
    return 'LEGGINGS';
  }
  if (toNumber(item.hammer, 0) > 0 || toNumber(item.fishingPole, 0) > 0) {
    return 'TOOL';
  }
  if (
    item.potion === true ||
    toNumber(item.healLife, 0) > 0 ||
    toNumber(item.healMana, 0) > 0 ||
    toNumber(item.bait, 0) > 0
  ) {
    return 'CONSUMABLE';
  }
  if (toNumber(item.ammo, 0) > 0) {
    return 'MATERIAL';
  }
  if (
    item.melee === true ||
    item.ranged === true ||
    item.magic === true ||
    item.summon === true ||
    item.sentry === true ||
    toNumber(item.damage, 0) > 0
  ) {
    return 'WEAPON';
  }
  if (
    item.material === true ||
    toNumber(item.useAmmo, 0) > 0
  ) {
    return 'MATERIAL';
  }
  if (toNumber(item.createTile, -1) >= 0 || toNumber(item.createWall, -1) >= 0) {
    return 'FURNITURE';
  }
  if (item.consumable === true) {
    return 'CONSUMABLE';
  }
  if (toNumber(item.defense, 0) > 0) {
    return 'ARMOR';
  }

  return 'MATERIAL';
}

function normalizeItem(item, mappingOverrides) {
  const categoryCode = classifyCategory(item, mappingOverrides);
  if (!categoryCode) {
    return null;
  }

  const rarity = mapRarity(item);
  const stackSize = inferStackSize(item, categoryCode);
  const tooltip = sanitizeText(item.ToolTip);
  const buy = positiveInteger(item.value);

  return {
    name: item.name.trim(),
    internalName: item.internalName.trim(),
    categoryCode,
    description: tooltip,
    tooltip,
    rarity: rarity.label,
    rarityId: rarity.id,
    damage: nullableInteger(item.damage),
    defense: nullableInteger(item.defense),
    knockback: nullableInteger(item.knockBack),
    useTime: nullableInteger(item.useAnimation ?? item.useTime),
    width: nullableInteger(item.width),
    height: nullableInteger(item.height),
    buy,
    sell: buy == null ? undefined : Math.max(1, Math.floor(buy / 5)),
    isStackable: stackSize > 1,
    stackSize,
    status: 1
  };
}

function mapRarity(item) {
  const rawValue = Math.max(
    toNumber(item.rare, Number.NEGATIVE_INFINITY),
    toNumber(item.rarity, Number.NEGATIVE_INFINITY)
  );

  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return { id: 1, label: 'common' };
  }
  if (rawValue <= 2) {
    return { id: 2, label: 'rare' };
  }
  if (rawValue <= 5) {
    return { id: 3, label: 'epic' };
  }
  return { id: 4, label: 'legendary' };
}

function nullableInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return null;
  }
  return Math.round(number);
}

function positiveInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }
  return Math.round(number);
}

function inferStackSize(item, categoryCode) {
  const explicitStack = positiveInteger(item.maxStack);
  const forcedSingleStackCategories = new Set([
    'WEAPON',
    'TOOL',
    'PICKAXE',
    'AXE',
    'ARMOR',
    'HELMET',
    'CHESTPLATE',
    'LEGGINGS'
  ]);
  const equipLike =
    item.accessory === true ||
    toNumber(item.headSlot, -1) >= 0 ||
    toNumber(item.bodySlot, -1) >= 0 ||
    toNumber(item.legSlot, -1) >= 0 ||
    toNumber(item.neckSlot, -1) >= 0 ||
    toNumber(item.frontSlot, -1) >= 0 ||
    toNumber(item.backSlot, -1) >= 0 ||
    toNumber(item.shieldSlot, -1) >= 0 ||
    toNumber(item.handOffSlot, -1) >= 0 ||
    toNumber(item.handOnSlot, -1) >= 0 ||
    toNumber(item.shoeSlot, -1) >= 0 ||
    toNumber(item.waistSlot, -1) >= 0 ||
    toNumber(item.wingSlot, -1) >= 0 ||
    toNumber(item.balloonSlot, -1) >= 0 ||
    toNumber(item.faceSlot, -1) >= 0 ||
    toNumber(item.beardSlot, -1) >= 0;
  const shouldStack =
    item.consumable === true ||
    item.material === true ||
    toNumber(item.ammo, 0) > 0 ||
    categoryCode === 'FURNITURE';

  if (equipLike || forcedSingleStackCategories.has(categoryCode)) {
    return 1;
  }
  if (shouldStack) {
    return explicitStack ?? 9999;
  }

  return 1;
}

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sanitizeText(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function stripUndefinedFields(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)
  );
}
