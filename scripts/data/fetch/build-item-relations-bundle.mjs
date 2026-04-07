import fs from 'node:fs';
import path from 'node:path';

import {
  ensureDir,
  numericOption,
  parseCliArgs,
  sharedDataPath,
  writeJson
} from '../lib/wiki-item-utils.mjs';
import {
  extractDropSourcesFromHtml,
  extractIntroParagraphs,
  extractItemInfoboxImages,
  extractNarrativeSources,
  extractVendorSourcesFromWikitext,
  normalizeText,
  parseRecipeTable
} from '../lib/wiki-page-utils.mjs';

const DEFAULT_BIOME_CONFIG = {
  forest: {
    title: 'Forest',
    code: 'forest',
    layerType: 'surface',
    biomeType: 'pure',
    aliasEn: null,
    resources: ['Wood', 'Daybloom', 'Sunflower']
  },
  jungle: {
    title: 'Jungle',
    code: 'jungle',
    layerType: 'surface',
    biomeType: 'jungle',
    aliasEn: null,
    resources: ['Mud Block', 'Jungle grass', 'Mahogany tree', 'Bamboo']
  },
  desert: {
    title: 'Desert',
    code: 'desert',
    layerType: 'surface',
    biomeType: 'desert',
    aliasEn: null,
    resources: ['Sand Block', 'Cactus']
  },
  snow: {
    title: 'Snow biome',
    code: 'snow',
    layerType: 'surface',
    biomeType: 'snow',
    aliasEn: 'Tundra',
    resources: ['Snow Block', 'Ice Block', 'Boreal Wood', 'Shiverthorn']
  },
  crimson: {
    title: 'The Crimson',
    code: 'crimson',
    layerType: 'surface',
    biomeType: 'crimson',
    aliasEn: 'Crimson',
    resources: ['Crimson grass', 'Crimson Tree', 'Vicious Mushroom', 'Crimson Heart', 'Crimson Altar'],
    relations: [{ relatedBiomeCode: 'corruption', relationType: 'counterpart' }]
  },
  corruption: {
    title: 'The Corruption',
    code: 'corruption',
    layerType: 'surface',
    biomeType: 'corruption',
    aliasEn: 'Corruption',
    resources: ['Corrupt grass', 'Ebonstone Block', 'Shadow Orb'],
    relations: [{ relatedBiomeCode: 'crimson', relationType: 'counterpart' }]
  },
  hallow: {
    title: 'Hallow',
    code: 'hallow',
    layerType: 'surface',
    biomeType: 'hallow',
    aliasEn: null,
    resources: ['Pearlsand Block', 'Pearlstone Block', 'Pixie Dust']
  }
};

const options = parseCliArgs(process.argv.slice(2));
const inputPath = path.resolve(process.cwd(), options.input ?? sharedDataPath('normalized', 'items.wiki.json'));
const itemPageDir = path.resolve(process.cwd(), options['item-pages'] ?? sharedDataPath('raw', 'wiki', 'item-pages'));
const biomeDir = path.resolve(process.cwd(), options['biome-pages'] ?? sharedDataPath('raw', 'wiki', 'biomes'));
const npcParsedPath = path.resolve(process.cwd(), options.npcs ?? sharedDataPath('raw', 'wiki', 'module__npcinfo__data.parsed.latest.json'));
const outputPath = path.resolve(process.cwd(), options.output ?? sharedDataPath('normalized', 'item-relations.bundle.json'));
const reportDir = sharedDataPath('reports', 'normalize');
const limit = numericOption(options.limit, null);

ensureDir(path.dirname(outputPath));
ensureDir(reportDir);

const normalizedItemsPayload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const items = Array.isArray(normalizedItemsPayload?.items) ? normalizedItemsPayload.items : [];
const itemByInternalName = new Map(items.map((item) => [item.internalName, item]));
const itemByName = new Map(items.map((item) => [item.name, item]));
const npcLookup = loadNpcLookup(npcParsedPath);

const itemPageFiles = fs.existsSync(itemPageDir)
  ? fs.readdirSync(itemPageDir).filter((name) => name.endsWith('.latest.json')).sort()
  : [];
const selectedItemPageFiles = itemPageFiles.slice(0, Number.isFinite(limit) && limit > 0 ? limit : undefined);

const itemImages = [];
const recipes = [];
const itemSources = [];
const itemBiomes = [];
const snapshots = [];
const errors = [];

for (const fileName of selectedItemPageFiles) {
  const payload = JSON.parse(fs.readFileSync(path.join(itemPageDir, fileName), 'utf8'));
  const item = itemByInternalName.get(payload.itemInternalName) ?? itemByName.get(payload.itemName);
  if (!item) {
    errors.push(`Missing normalized item for page snapshot ${fileName}`);
    continue;
  }

  const images = extractItemInfoboxImages(payload.html);
  images.forEach((image, index) => {
    itemImages.push({
      itemInternalName: item.internalName,
      itemName: item.name,
      role: index === 0 ? 'icon' : 'detail',
      provider: 'wiki_gg',
      sourceFileTitle: image.fileTitle,
      sourcePage: payload.pageTitle,
      sourceRevisionTimestamp: payload.revisionTimestamp,
      originalUrl: image.url,
      cachedUrl: image.url,
      width: image.width,
      height: image.height,
      contentType: image.contentType,
      isPrimary: index === 0,
      sortOrder: index
    });
  });

  const recipeRows = parseRecipeTable(payload.recipesMarkup);
  recipeRows.forEach((recipeRow, recipeIndex) => {
    recipes.push({
      resultInternalName: item.internalName,
      resultName: item.name,
      resultQuantity: 1,
      versionScope: recipeRow.versionScope,
      notes: null,
      sourceProvider: 'wiki_gg',
      sourcePage: payload.pageTitle,
      sourceRevisionTimestamp: payload.revisionTimestamp,
      ingredients: recipeRow.ingredients.map((ingredient, ingredientIndex) => ({
        ingredientInternalName: itemByName.get(ingredient.ingredientName)?.internalName ?? null,
        ingredientName: ingredient.ingredientName,
        ingredientNameRaw: ingredient.ingredientNameRaw,
        ingredientGroupType: ingredient.ingredientGroupType,
        quantityMin: ingredient.quantityMin,
        quantityMax: ingredient.quantityMax,
        quantityText: ingredient.quantityText,
        sortOrder: ingredient.sortOrder ?? ingredientIndex
      })),
      stations: recipeRow.stations.map((station, stationIndex) => ({
        stationInternalName: itemByName.get(station.stationName)?.internalName ?? null,
        stationName: station.stationName,
        stationNameRaw: station.stationNameRaw,
        isAlternative: station.isAlternative,
        sortOrder: station.sortOrder ?? stationIndex
      }))
    });
  });

  const introParagraphs = extractIntroParagraphs(payload.html);
  const rawSources = [
    ...extractVendorSourcesFromWikitext(payload.wikitext),
    ...extractDropSourcesFromHtml(payload.html, npcLookup),
    ...extractNarrativeSources(introParagraphs, payload.pageTitle)
  ];
  const dedupedSources = dedupeBy(
    rawSources.map((source, sourceIndex) => ({
      ...source,
      biomeCode: inferBiomeCode([
        source.sourceRefName,
        source.conditions,
        source.notes,
        ...introParagraphs
      ]),
      sortOrder: source.sortOrder ?? sourceIndex,
      sourceProvider: 'wiki_gg',
      sourcePage: payload.pageTitle,
      sourceRevisionTimestamp: payload.revisionTimestamp
    })),
    (source) => `${source.sourceType}|${source.sourceRefType}|${source.sourceRefName}|${source.quantityText ?? ''}|${source.chanceText ?? ''}|${source.conditions ?? ''}|${source.notes ?? ''}`
  );

  dedupedSources.forEach((source) => {
    itemSources.push({
      itemInternalName: item.internalName,
      itemName: item.name,
      ...source
    });
  });

  const sourceBiomeCodes = [...new Set(dedupedSources.map((source) => source.biomeCode).filter(Boolean))];
  sourceBiomeCodes.forEach((biomeCode, index) => {
    itemBiomes.push({
      itemInternalName: item.internalName,
      itemName: item.name,
      biomeCode,
      relationType: 'found_in',
      notes: `Inferred from ${payload.pageTitle} page text`,
      sortOrder: index
    });
  });

  snapshots.push({
    entityType: 'item',
    itemInternalName: item.internalName,
    itemName: item.name,
    provider: 'wiki_gg',
    sourceKind: 'page',
    sourceLocator: payload.requestedPageTitle ?? payload.pageTitle,
    sourcePage: payload.pageTitle,
    sourceRevisionTimestamp: payload.revisionTimestamp,
    payloadJson: JSON.stringify(payload),
    fetchedAt: payload.fetchedAt,
    isCurrent: true,
    parseStatus: 'parsed'
  });
}

const biomes = [];
const biomePageFiles = fs.existsSync(biomeDir)
  ? fs.readdirSync(biomeDir).filter((name) => name.endsWith('.latest.json')).sort()
  : [];

for (const fileName of biomePageFiles) {
  const payload = JSON.parse(fs.readFileSync(path.join(biomeDir, fileName), 'utf8'));
  const config = DEFAULT_BIOME_CONFIG[payload.biomeCode];
  if (!config) {
    continue;
  }

  const introParagraphs = extractIntroParagraphs(payload.html);
  const description = introParagraphs[0] ?? '';
  const images = extractItemInfoboxImages(payload.html);

  biomes.push({
    code: config.code,
    nameEn: config.title,
    aliasEn: config.aliasEn,
    layerType: config.layerType,
    biomeType: config.biomeType,
    description,
    iconUrl: images[0]?.url ?? null,
    sourceProvider: 'wiki_gg',
    sourcePage: payload.pageTitle,
    sourceRevisionTimestamp: payload.revisionTimestamp,
    lastSyncedAt: payload.fetchedAt,
    relations: (config.relations ?? []).map((relation) => ({
      relatedBiomeCode: relation.relatedBiomeCode,
      relationType: relation.relationType,
      notes: null
    })),
    resources: (config.resources ?? []).map((resourceName, index) => ({
      itemInternalName: itemByName.get(resourceName)?.internalName ?? null,
      itemName: resourceName,
      resourceNameRaw: resourceName,
      resourceType: classifyResourceType(resourceName),
      notes: `Inferred from ${payload.pageTitle} page`,
      sortOrder: index
    }))
  });

  snapshots.push({
    entityType: 'biome',
    biomeCode: config.code,
    provider: 'wiki_gg',
    sourceKind: 'page',
    sourceLocator: payload.requestedPageTitle ?? payload.pageTitle,
    sourcePage: payload.pageTitle,
    sourceRevisionTimestamp: payload.revisionTimestamp,
    payloadJson: JSON.stringify(payload),
    fetchedAt: payload.fetchedAt,
    isCurrent: true,
    parseStatus: 'parsed'
  });
}

const output = {
  source: 'terraria.wiki.gg:item-page-assembly',
  overwriteExisting: true,
  itemImages,
  recipes,
  itemSources,
  biomes,
  itemBiomes,
  snapshots
};

writeJson(outputPath, output);

const reportPath = path.join(reportDir, `item-relations-${new Date().toISOString().replaceAll(':', '-')}.json`);
writeJson(reportPath, {
  inputPath,
  itemPageDir,
  biomeDir,
  outputPath,
  itemPageCount: selectedItemPageFiles.length,
  biomePageCount: biomePageFiles.length,
  itemImages: itemImages.length,
  recipes: recipes.length,
  itemSources: itemSources.length,
  biomes: biomes.length,
  itemBiomes: itemBiomes.length,
  snapshots: snapshots.length,
  errors
});

console.log(`Items input: ${inputPath}`);
console.log(`Item pages used: ${selectedItemPageFiles.length}`);
console.log(`Biome pages used: ${biomePageFiles.length}`);
console.log(`Images: ${itemImages.length}`);
console.log(`Recipes: ${recipes.length}`);
console.log(`Sources: ${itemSources.length}`);
console.log(`Biomes: ${biomes.length}`);
console.log(`Item-biomes: ${itemBiomes.length}`);
console.log(`Snapshots: ${snapshots.length}`);
console.log(`Bundle: ${outputPath}`);
console.log(`Report: ${reportPath}`);

function loadNpcLookup(filePath) {
  if (!fs.existsSync(filePath)) {
    return new Map();
  }

  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const npcs = Array.isArray(payload?.npcs) ? payload.npcs : [];
  return new Map(
    npcs
      .filter((npc) => typeof npc?.name === 'string' && npc.name.trim() !== '')
      .map((npc) => [
        npc.name.trim().toLowerCase(),
        { boss: npc.boss === true || npc.boss === 1 }
      ])
  );
}

function inferBiomeCode(values) {
  const text = values
    .map((value) => normalizeText(String(value ?? '')))
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (text.includes('crimson')) return 'crimson';
  if (text.includes('corruption')) return 'corruption';
  if (text.includes('hallow')) return 'hallow';
  if (text.includes('snow') || text.includes('tundra')) return 'snow';
  if (text.includes('jungle')) return 'jungle';
  if (text.includes('desert')) return 'desert';
  if (text.includes('forest')) return 'forest';
  return null;
}

function classifyResourceType(resourceName) {
  const text = String(resourceName ?? '').toLowerCase();
  if (text.includes('block')) return 'block';
  if (text.includes('grass') || text.includes('tree') || text.includes('bamboo') || text.includes('mushroom')) return 'plant';
  return 'feature';
}

function dedupeBy(values, keySelector) {
  const seen = new Set();
  return values.filter((value) => {
    const key = keySelector(value);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
