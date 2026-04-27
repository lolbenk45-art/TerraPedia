import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const redesignRoot = path.resolve(__dirname, '..', '..', '..');
const workspaceRoot = path.resolve(redesignRoot, '..');
const sharedDataRoot = path.join(workspaceRoot, 'data', 'terraPedia');

const sourceDataDir = path.resolve(
  process.cwd(),
  process.env.TERRAPEDIA_SOURCE_DATA_DIR ?? sharedDataRoot
);
const outputDir = path.resolve(
  process.cwd(),
  process.env.TERRAPEDIA_STANDARDIZED_OUTPUT_DIR ?? path.join(sharedDataRoot, 'standardized')
);

const generatedAt = new Date().toISOString();
const warnings = [];
const outputs = [];

ensureDir(outputDir);

const itemIdMaps = await loadItemIdMaps();

writeDataset({
  entity: 'items',
  sourcePath: path.join(sourceDataDir, 'normalized', 'items.wiki.json'),
  transform: (payload, sourcePath) => {
    const records = asArray(payload.items).map((item) => normalizeItem(item, itemIdMaps));
    return buildEnvelope({
      entity: 'items',
      records,
      sourcePath,
      upstreamMeta: pick(payload, [
        'source',
        'sourceApi',
        'sourcePageTitle',
        'sourceRevisionTimestamp',
        'fetchedAt',
        'wikiVersion',
        'moduleGeneratedAt',
        'generatedAt'
      ])
    });
  }
});

writeDataset({
  entity: 'buffs',
  sourcePath: path.join(sourceDataDir, 'raw', 'wiki', 'template__getbuffinfo.parsed.latest.json'),
  transform: (payload, sourcePath) => {
    const records = asArray(payload.buffs).map((buff) => normalizeBuff(buff));
    return buildEnvelope({
      entity: 'buffs',
      records,
      sourcePath,
      upstreamMeta: pick(payload, [
        'source',
        'sourceApi',
        'sourcePageTitle',
        'sourceRevisionTimestamp',
        'fetchedAt',
        'langs',
        'totalBuffs'
      ])
    });
  }
});

writeDataset({
  entity: 'npcs',
  sourcePath: path.join(sourceDataDir, 'raw', 'wiki', 'module__npcinfo__data.parsed.latest.json'),
  transform: (payload, sourcePath) => {
    const records = asArray(payload.npcs).map((npc) => normalizeNpc(npc));
    return buildEnvelope({
      entity: 'npcs',
      records,
      sourcePath,
      upstreamMeta: pick(payload, [
        'source',
        'sourceApi',
        'sourcePageTitle',
        'sourceRevisionTimestamp',
        'fetchedAt',
        'wikiVersion',
        'moduleGeneratedAt',
        'totalNpcs'
      ])
    });
  }
});

writeDataset({
  entity: 'projectiles',
  sourcePath: path.join(sourceDataDir, 'raw', 'wiki', 'module__projectileinfo__data.parsed.latest.json'),
  transform: (payload, sourcePath) => {
    const records = asArray(payload.projectiles).map((projectile) => normalizeProjectile(projectile));
    return buildEnvelope({
      entity: 'projectiles',
      records,
      sourcePath,
      upstreamMeta: pick(payload, [
        'source',
        'sourceApi',
        'sourcePageTitle',
        'sourceRevisionTimestamp',
        'fetchedAt',
        'moduleGeneratedAt',
        'moduleGeneratedFrom',
        'totalProjectiles'
      ])
    });
  }
});

writeDataset({
  entity: 'armor_sets',
  sourcePath: path.join(sourceDataDir, 'raw', 'wiki', 'module__armorsetbonuses.parsed.latest.json'),
  transform: (payload, sourcePath) => {
    const records = asArray(payload.armorSets).map((entry) => normalizeArmorSet(entry));
    return buildEnvelope({
      entity: 'armor_sets',
      records,
      sourcePath,
      upstreamMeta: pick(payload, [
        'source',
        'sourceApi',
        'sourcePageTitle',
        'sourceRevisionTimestamp',
        'fetchedAt',
        'terrariaVersion',
        'totalArmorSets'
      ])
    });
  }
});

writeDataset({
  entity: 'item_relations',
  sourcePath: path.join(sourceDataDir, 'normalized', 'item-relations.bundle.json'),
  transform: (payload, sourcePath) => {
    const records = {
      itemImages: asArray(payload.itemImages).map((entry) => normalizeLooseObject(entry)),
      recipes: asArray(payload.recipes).map((entry) => normalizeLooseObject(entry)),
      itemSources: asArray(payload.itemSources).map((entry) => normalizeLooseObject(entry)),
      biomes: asArray(payload.biomes).map((entry) => normalizeLooseObject(entry)),
      itemBiomes: asArray(payload.itemBiomes).map((entry) => normalizeLooseObject(entry)),
      snapshots: asArray(payload.snapshots).map((entry) => normalizeLooseObject(entry))
    };

    return deepSortObject({
      schemaVersion: '1.0.0',
      entity: 'item_relations',
      generatedAt,
      sourceDataDir,
      sourceFile: relativeFromWorkspace(sourcePath),
      upstreamMeta: pick(payload, ['source', 'overwriteExisting']),
      counts: {
        itemImages: records.itemImages.length,
        recipes: records.recipes.length,
        itemSources: records.itemSources.length,
        biomes: records.biomes.length,
        itemBiomes: records.itemBiomes.length,
        snapshots: records.snapshots.length
      },
      records
    });
  }
});

writeDataset({
  entity: 'boss_loot',
  sourcePath: path.join(sourceDataDir, 'normalized', 'boss-loot.bundle.json'),
  transform: (payload, sourcePath) => {
    const records = asArray(payload.bosses).map((entry) => normalizeLooseObject(entry));
    return deepSortObject({
      schemaVersion: '1.0.0',
      entity: 'boss_loot',
      generatedAt,
      sourceDataDir,
      sourceFile: relativeFromWorkspace(sourcePath),
      upstreamMeta: pick(payload, [
        'source',
        'relationsSourceFile',
        'npcSourceFile',
        'totalBosses',
        'totalDrops'
      ]),
      totalRecords: records.length,
      records
    });
  }
});

writeDataset({
  entity: 'biomes',
  sourcePath: path.join(sourceDataDir, 'raw', 'wiki', 'biomes'),
  transformDir: (dirPath) => {
    const files = fs
      .readdirSync(dirPath)
      .filter((name) => name.endsWith('.latest.json'))
      .sort((left, right) => left.localeCompare(right));

    const records = files.map((name) => {
      const fullPath = path.join(dirPath, name);
      const payload = readJson(fullPath);
      return deepSortObject({
        biomeCode: nullableString(payload.biomeCode),
        pageTitle: nullableString(payload.pageTitle),
        requestedPageTitle: nullableString(payload.requestedPageTitle),
        pageId: toFiniteNumber(payload.pageId),
        revisionTimestamp: nullableString(payload.revisionTimestamp),
        fetchedAt: nullableString(payload.fetchedAt),
        sourceApi: nullableString(payload.apiUrl),
        entityType: nullableString(payload.entityType),
        hasWikitext: typeof payload.wikitext === 'string',
        hasHtml: typeof payload.html === 'string',
        wikitextLength: typeof payload.wikitext === 'string' ? payload.wikitext.length : 0,
        htmlLength: typeof payload.html === 'string' ? payload.html.length : 0,
        sourceFile: relativeFromWorkspace(fullPath)
      });
    });

    return deepSortObject({
      schemaVersion: '1.0.0',
      entity: 'biomes',
      generatedAt,
      sourceDataDir,
      sourceDirectory: relativeFromWorkspace(dirPath),
      totalRecords: records.length,
      records
    });
  }
});

writeDataset({
  entity: 'item_pages',
  sourcePath: path.join(sourceDataDir, 'raw', 'wiki', 'item-pages'),
  transformDir: (dirPath) => {
    const files = fs
      .readdirSync(dirPath)
      .filter((name) => name.endsWith('.latest.json'))
      .sort((left, right) => left.localeCompare(right));

    const records = files.map((name) => {
      const fullPath = path.join(dirPath, name);
      const payload = readJson(fullPath);
      return deepSortObject({
        itemInternalName: nullableString(payload.itemInternalName),
        itemName: nullableString(payload.itemName),
        pageTitle: nullableString(payload.pageTitle),
        requestedPageTitle: nullableString(payload.requestedPageTitle),
        pageId: toFiniteNumber(payload.pageId),
        revisionTimestamp: nullableString(payload.revisionTimestamp),
        fetchedAt: nullableString(payload.fetchedAt),
        sourceApi: nullableString(payload.apiUrl),
        entityType: nullableString(payload.entityType),
        hasWikitext: typeof payload.wikitext === 'string',
        hasHtml: typeof payload.html === 'string',
        hasRecipesMarkup: typeof payload.recipesMarkup === 'string',
        wikitextLength: typeof payload.wikitext === 'string' ? payload.wikitext.length : 0,
        htmlLength: typeof payload.html === 'string' ? payload.html.length : 0,
        recipesMarkupLength: typeof payload.recipesMarkup === 'string' ? payload.recipesMarkup.length : 0,
        sourceFile: relativeFromWorkspace(fullPath)
      });
    });

    return deepSortObject({
      schemaVersion: '1.0.0',
      entity: 'item_pages',
      generatedAt,
      sourceDataDir,
      sourceDirectory: relativeFromWorkspace(dirPath),
      totalRecords: records.length,
      records
    });
  }
});

const manifest = deepSortObject({
  schemaVersion: '1.0.0',
  generatedAt,
  sourceDataDir,
  outputDirectory: relativeFromWorkspace(outputDir),
  datasets: outputs,
  warnings
});
const manifestPath = path.join(outputDir, '_manifest.standardized.json');
writeJson(manifestPath, manifest);

console.log(`Standardized output directory: ${outputDir}`);
for (const entry of outputs) {
  console.log(`- ${entry.entity}: ${entry.totalRecords} -> ${entry.file}`);
}
console.log(`- manifest: ${relativeFromWorkspace(manifestPath)}`);
if (warnings.length > 0) {
  console.warn('Warnings:');
  for (const message of warnings) {
    console.warn(`  - ${message}`);
  }
}

function writeDataset({ entity, sourcePath, transform, transformDir }) {
  try {
    const outputPath = path.join(outputDir, `${entity}.standardized.json`);
    let standardized;

    if (transformDir) {
      if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isDirectory()) {
        warnings.push(`Skipped ${entity}: source directory missing (${sourcePath})`);
        return;
      }
      standardized = transformDir(sourcePath);
    } else {
      if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
        warnings.push(`Skipped ${entity}: source file missing (${sourcePath})`);
        return;
      }
      standardized = transform(readJson(sourcePath), sourcePath);
    }

    writeJson(outputPath, standardized);
    outputs.push({
      entity,
      totalRecords: countRecords(standardized.records),
      file: relativeFromWorkspace(outputPath)
    });
  } catch (error) {
    warnings.push(`Failed ${entity}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function buildEnvelope({ entity, records, sourcePath, upstreamMeta }) {
  return deepSortObject({
    schemaVersion: '1.0.0',
    entity,
    generatedAt,
    sourceDataDir,
    sourceFile: relativeFromWorkspace(sourcePath),
    totalRecords: records.length,
    upstreamMeta: normalizeLooseObject(upstreamMeta),
    records
  });
}

function normalizeItem(item, itemMaps) {
  const internalName = nullableString(item.internalName);
  const itemName = nullableString(item.name);
  const id = resolveItemId({ internalName, itemName, itemMaps });

  return deepSortObject({
    id,
    internalName,
    name: itemName,
    categoryCode: nullableString(item.categoryCode),
    rarity: nullableString(item.rarity),
    rarityId: toFiniteNumber(item.rarityId),
    description: nullableString(item.description),
    tooltip: nullableString(item.tooltip),
    equipment: normalizeEquipmentSlots(item.equipment),
    status: toFiniteNumber(item.status),
    stats: {
      damage: toFiniteNumber(item.damage),
      defense: toFiniteNumber(item.defense),
      knockback: toFiniteNumber(item.knockback),
      useTime: toFiniteNumber(item.useTime),
      width: toFiniteNumber(item.width),
      height: toFiniteNumber(item.height)
    },
    economy: {
      buy: toFiniteNumber(item.buy),
      sell: toFiniteNumber(item.sell)
    },
    stack: {
      isStackable: toBoolean(item.isStackable),
      stackSize: toFiniteNumber(item.stackSize)
    }
  });
}

function normalizeEquipmentSlots(value) {
  const equipment = isObject(value) ? value : {};
  return deepSortObject({
    headSlot: toNullableSlot(equipment.headSlot),
    bodySlot: toNullableSlot(equipment.bodySlot),
    legSlot: toNullableSlot(equipment.legSlot)
  });
}

function toNullableSlot(value) {
  if (value == null || value === '') {
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return null;
  }
  return Math.round(number);
}

function normalizeBuff(buff) {
  const localized = isObject(buff.localized) ? buff.localized : {};

  return deepSortObject({
    id: toFiniteNumber(buff.id),
    internalName: nullableString(buff.internalName),
    englishName: nullableString(buff.englishName),
    type: nullableString(buff.type),
    image: nullableString(buff.image),
    localized: normalizeLooseObject(localized),
    sourceItemCount: toFiniteNumber(buff.sourceItemCount) ?? 0,
    sourceItems: asArray(buff.sourceItems).map((entry) => normalizeLooseObject(entry)),
    immuneNpcCount: toFiniteNumber(buff.immuneNpcCount) ?? 0,
    immuneNpcSample: asArray(buff.immuneNpcSample).map((entry) => normalizeLooseObject(entry))
  });
}

function normalizeNpc(npc) {
  const coreKeys = new Set([
    'id',
    'type',
    'netID',
    'name',
    'internalName',
    'aiStyle',
    'friendly',
    'boss',
    'noGravity',
    'noTileCollide',
    'damage',
    'defense',
    'lifeMax',
    'knockBackResist',
    'value',
    'width',
    'height',
    'scale',
    'banner',
    'buffImmune'
  ]);

  return deepSortObject({
    id: toFiniteNumber(npc.id),
    type: toFiniteNumber(npc.type),
    netID: toFiniteNumber(npc.netID),
    internalName: nullableString(npc.internalName),
    name: nullableString(npc.name),
    aiStyle: toFiniteNumber(npc.aiStyle),
    flags: {
      friendly: toBoolean(npc.friendly),
      boss: toBoolean(npc.boss),
      noGravity: toBoolean(npc.noGravity),
      noTileCollide: toBoolean(npc.noTileCollide)
    },
    combat: {
      damage: toFiniteNumber(npc.damage),
      defense: toFiniteNumber(npc.defense),
      lifeMax: toFiniteNumber(npc.lifeMax),
      knockBackResist: toFiniteNumber(npc.knockBackResist)
    },
    economy: {
      value: toFiniteNumber(npc.value)
    },
    dimensions: {
      width: toFiniteNumber(npc.width),
      height: toFiniteNumber(npc.height),
      scale: toFiniteNumber(npc.scale)
    },
    banner: toFiniteNumber(npc.banner),
    buffImmune: nullableString(npc.buffImmune),
    extras: normalizeLooseObject(omitKeys(npc, coreKeys))
  });
}

function normalizeProjectile(projectile) {
  const coreKeys = new Set([
    'id',
    'internalName',
    'name',
    'aiStyle',
    'friendly',
    'hostile',
    'magic',
    'melee',
    'ranged',
    'summon',
    'sentry',
    'trap',
    'tileCollide',
    'ignoreWater',
    'width',
    'height',
    'knockBack',
    'penetrate',
    'timeLeft',
    'extraUpdates',
    'scale'
  ]);

  return deepSortObject({
    id: toFiniteNumber(projectile.id),
    internalName: nullableString(projectile.internalName),
    name: nullableString(projectile.name),
    aiStyle: toFiniteNumber(projectile.aiStyle),
    flags: {
      friendly: toBoolean(projectile.friendly),
      hostile: toBoolean(projectile.hostile),
      magic: toBoolean(projectile.magic),
      melee: toBoolean(projectile.melee),
      ranged: toBoolean(projectile.ranged),
      summon: toBoolean(projectile.summon),
      sentry: toBoolean(projectile.sentry),
      trap: toBoolean(projectile.trap),
      tileCollide: toBoolean(projectile.tileCollide),
      ignoreWater: toBoolean(projectile.ignoreWater)
    },
    dimensions: {
      width: toFiniteNumber(projectile.width),
      height: toFiniteNumber(projectile.height),
      scale: toFiniteNumber(projectile.scale)
    },
    combat: {
      knockBack: toFiniteNumber(projectile.knockBack),
      penetrate: toFiniteNumber(projectile.penetrate)
    },
    lifecycle: {
      timeLeft: toFiniteNumber(projectile.timeLeft),
      extraUpdates: toFiniteNumber(projectile.extraUpdates)
    },
    extras: normalizeLooseObject(omitKeys(projectile, coreKeys))
  });
}

function normalizeArmorSet(entry) {
  const sets = asArray(entry.sets).map((value) => parseItemIdSet(value));
  const uniqueItemIds = [...new Set(sets.flat())].sort((left, right) => left - right);

  return deepSortObject({
    benefitExpression: nullableString(entry.benefitExpression),
    textKey: nullableString(entry.textKey),
    primaryPart: nullableString(entry.primaryPart),
    setCount: toFiniteNumber(entry.setCount),
    sets,
    uniqueItemIds
  });
}

function normalizeLooseObject(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeLooseObject(entry));
  }
  if (!isObject(value)) {
    if (typeof value === 'string') {
      return value.trim();
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'boolean' || value == null) {
      return value;
    }
    return String(value);
  }

  const normalized = {};
  for (const key of Object.keys(value)) {
    const rawValue = value[key];
    if (rawValue === undefined) {
      continue;
    }
    normalized[key] = normalizeLooseObject(rawValue);
  }
  return deepSortObject(normalized);
}

async function loadItemIdMaps() {
  const byInternalName = new Map();
  const byName = new Map();
  const duplicateInternalName = new Set();
  const duplicateName = new Set();

  const rawPath = path.join(sourceDataDir, 'raw', 'wiki', 'module__iteminfo__data.latest.json');
  const utilPath = path.join(redesignRoot, 'scripts', 'data', 'lib', 'wiki-item-utils.mjs');
  if (!fs.existsSync(rawPath) || !fs.existsSync(utilPath)) {
    warnings.push('Item id mapping fallback: raw iteminfo or parser utility is missing; item ids may be null.');
    return { byInternalName, byName };
  }

  try {
    const rawPayload = readJson(rawPath);
    const utilityUrl = pathToFileURL(utilPath).href;
    return await loadParsedItemIdMaps(rawPayload.moduleContent, utilityUrl, {
      byInternalName,
      byName,
      duplicateInternalName,
      duplicateName
    });
  } catch (error) {
    warnings.push(`Item id mapping failed: ${error instanceof Error ? error.message : String(error)}`);
    return { byInternalName, byName };
  }
}

function resolveItemId({ internalName, itemName, itemMaps }) {
  if (internalName && itemMaps.byInternalName.has(internalName)) {
    return itemMaps.byInternalName.get(internalName);
  }
  if (itemName && itemMaps.byName.has(itemName)) {
    return itemMaps.byName.get(itemName);
  }
  return null;
}

async function loadParsedItemIdMaps(moduleContent, utilityUrl, state) {
  const utility = await import(utilityUrl);
  if (typeof utility.parseIteminfoModulePayload !== 'function') {
    throw new Error('parseIteminfoModulePayload is not exported by wiki-item-utils.mjs');
  }

  const moduleData = utility.parseIteminfoModulePayload(moduleContent);
  for (const [key, value] of Object.entries(moduleData)) {
    if (!/^\d+$/.test(key) || !isObject(value)) {
      continue;
    }
    const id = Number(key);
    if (!Number.isFinite(id)) {
      continue;
    }

    const internalName = nullableString(value.internalName);
    const name = nullableString(value.name);
    insertUnique(state.byInternalName, state.duplicateInternalName, internalName, id);
    insertUnique(state.byName, state.duplicateName, name, id);
  }

  return {
    byInternalName: state.byInternalName,
    byName: state.byName
  };
}

function insertUnique(map, duplicates, key, value) {
  if (!key) {
    return;
  }
  if (duplicates.has(key)) {
    return;
  }
  if (map.has(key)) {
    map.delete(key);
    duplicates.add(key);
    return;
  }
  map.set(key, value);
}

function countRecords(records) {
  if (Array.isArray(records)) {
    return records.length;
  }
  if (isObject(records)) {
    return Object.values(records).reduce((accumulator, value) => {
      if (Array.isArray(value)) {
        return accumulator + value.length;
      }
      return accumulator;
    }, 0);
  }
  return 0;
}

function parseItemIdSet(value) {
  if (typeof value !== 'string') {
    return [];
  }
  return value
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part))
    .sort((left, right) => left - right);
}

function omitKeys(value, keys) {
  if (!isObject(value)) {
    return {};
  }
  const clone = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!keys.has(key)) {
      clone[key] = raw;
    }
  }
  return clone;
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 1 || value === '1' || value === 'true') {
    return true;
  }
  if (value === 0 || value === '0' || value === 'false') {
    return false;
  }
  return null;
}

function nullableString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function pick(value, keys) {
  if (!isObject(value)) {
    return {};
  }
  const selected = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      selected[key] = value[key];
    }
  }
  return selected;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepSortObject(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => deepSortObject(entry));
  }
  if (!isObject(value)) {
    return value;
  }

  const sorted = {};
  const keys = Object.keys(value).sort((left, right) => left.localeCompare(right));
  for (const key of keys) {
    sorted[key] = deepSortObject(value[key]);
  }
  return sorted;
}

function relativeFromWorkspace(targetPath) {
  return path.relative(workspaceRoot, targetPath).replaceAll('\\', '/');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}
