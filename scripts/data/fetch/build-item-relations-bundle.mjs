import fs from 'node:fs';
import path from 'node:path';

import { generateRecipeMaterialReference } from '../generate/generate-recipe-material-reference.mjs';
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
const recipeReferencePath = path.resolve(process.cwd(), options['recipe-reference'] ?? path.join(process.cwd(), 'data', 'generated', 'recipe-material-reference.json'));
const outputPath = path.resolve(process.cwd(), options.output ?? sharedDataPath('normalized', 'item-relations.bundle.json'));
const reportDir = sharedDataPath('reports', 'normalize');
const limit = numericOption(options.limit, null);
const refreshRecipeReference = booleanOption(options['refresh-recipe-reference'] ?? options.refreshRecipeReference, false);

ensureDir(path.dirname(outputPath));
ensureDir(reportDir);

let recipeReferenceRefreshSummary = null;
if (refreshRecipeReference) {
  const recipeReferenceOptions = {
    output: recipeReferencePath,
    items: inputPath
  };
  if (typeof options.pages === 'string' && options.pages.trim() !== '') {
    recipeReferenceOptions.pages = options.pages.trim();
  }
  recipeReferenceRefreshSummary = await generateRecipeMaterialReference(recipeReferenceOptions);
}

const normalizedItemsPayload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const items = Array.isArray(normalizedItemsPayload?.items) ? normalizedItemsPayload.items : [];
const itemByInternalName = new Map(items.map((item) => [item.internalName, item]));
const itemLookup = buildItemLookup(items);
const npcLookup = loadNpcLookup(npcParsedPath);
const recipeReference = loadRecipeReference(recipeReferencePath);

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
const npcSourceRefStats = {
  totalDropNpcSources: 0,
  boundByExactInternalName: 0,
  boundBySingleCandidate: 0,
  boundBySinglePositiveCandidate: 0,
  boundByPositiveIdFallback: 0,
  unresolvedNoMatch: 0,
  unresolvedNoStableCandidate: 0
};
const unresolvedNpcSourceRefs = new Map();

for (const fileName of selectedItemPageFiles) {
  const payload = JSON.parse(fs.readFileSync(path.join(itemPageDir, fileName), 'utf8'));
  const item = itemByInternalName.get(payload.itemInternalName) ?? resolveItemFromLookup(itemLookup, payload.itemName);
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

  const parsedRecipeRows = parseRecipeTable(payload.recipesMarkup);
  const supplementalRecipeRows = resolveSupplementalRecipeRows(recipeReference, item);
  const recipeSourceRows = shouldUseRecipeReferenceAsPrimary(recipeReference)
    ? supplementalRecipeRows
    : [...parsedRecipeRows, ...supplementalRecipeRows];
  const recipeRows = dedupeBy(
    recipeSourceRows,
    (recipeRow) => JSON.stringify({
      sourceContextPage: recipeRow.sourceContextPage ?? null,
      versionScope: recipeRow.versionScope ?? null,
      ingredients: recipeRow.ingredients.map((ingredient) => [ingredient.ingredientNameRaw, ingredient.ingredientGroupType, ingredient.quantityText ?? null]),
      stations: recipeRow.stations.map((station) => [station.stationNameRaw, Boolean(station.isAlternative)])
    })
  );
  recipeRows.forEach((recipeRow, recipeIndex) => {
    recipes.push({
      resultInternalName: item.internalName,
      resultName: item.name,
      resultQuantity: recipeRow.resultQuantity ?? 1,
      versionScope: recipeRow.versionScope,
      notes: recipeRow.notes ?? null,
      sourceProvider: recipeRow.sourceProvider ?? 'wiki_gg',
      sourcePage: recipeRow.sourcePage ?? payload.pageTitle,
      sourceRevisionTimestamp: recipeRow.sourceRevisionTimestamp ?? payload.revisionTimestamp,
      sourceContextPage: recipeRow.sourceContextPage ?? null,
      sourceContextPageSlug: recipeRow.sourceContextPageSlug ?? null,
      sourceContextDisplayName: recipeRow.sourceContextDisplayName ?? null,
      sourceContextUrl: recipeRow.sourceContextUrl ?? null,
      sourceContextRevisionId: recipeRow.sourceContextRevisionId ?? null,
      sourceFetchedAt: recipeRow.sourceFetchedAt ?? null,
      ingredients: recipeRow.ingredients.map((ingredient, ingredientIndex) => ({
        ingredientInternalName: ingredient.ingredientInternalName
          ?? resolveItemFromLookup(itemLookup, ingredient.ingredientName, ingredient.ingredientNameRaw)?.internalName
          ?? null,
        ingredientName: ingredient.ingredientName,
        ingredientNameRaw: ingredient.ingredientNameRaw,
        ingredientGroupType: ingredient.ingredientGroupType,
        quantityMin: ingredient.quantityMin,
        quantityMax: ingredient.quantityMax,
        quantityText: ingredient.quantityText,
        sortOrder: ingredient.sortOrder ?? ingredientIndex
      })),
      stations: recipeRow.stations.map((station, stationIndex) => ({
        stationInternalName: station.stationInternalName
          ?? resolveItemFromLookup(itemLookup, station.stationName, station.stationNameRaw)?.internalName
          ?? null,
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

  const resolvedSources = dedupedSources.map((source) => resolveNpcSourceBinding({
    item,
    npcLookup,
    source,
    stats: npcSourceRefStats,
    unresolvedByName: unresolvedNpcSourceRefs
  }));

  resolvedSources.forEach((source) => {
    itemSources.push({
      itemInternalName: item.internalName,
      itemName: item.name,
      ...source
    });
  });

  const sourceBiomeCodes = [...new Set(resolvedSources.map((source) => source.biomeCode).filter(Boolean))];
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
      itemInternalName: resolveItemFromLookup(itemLookup, resourceName)?.internalName ?? null,
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
  refreshRecipeReference,
  recipeReferencePath,
  recipeReferenceRefreshSummary,
  itemPageCount: selectedItemPageFiles.length,
  biomePageCount: biomePageFiles.length,
  itemImages: itemImages.length,
  recipes: recipes.length,
  itemSources: itemSources.length,
  biomes: biomes.length,
  itemBiomes: itemBiomes.length,
  snapshots: snapshots.length,
  npcSourceRefStats,
  unresolvedNpcSourceRefs: [...unresolvedNpcSourceRefs.values()].sort((left, right) => {
    return (
      right.occurrences - left.occurrences
      || String(left.sourceRefName ?? '').localeCompare(String(right.sourceRefName ?? ''))
    );
  }),
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
console.log(`NPC source refs resolved: ${npcSourceRefStats.totalDropNpcSources - npcSourceRefStats.unresolvedNoMatch - npcSourceRefStats.unresolvedNoStableCandidate}`);
console.log(`NPC source refs unresolved: ${npcSourceRefStats.unresolvedNoMatch + npcSourceRefStats.unresolvedNoStableCandidate}`);
console.log(`Bundle: ${outputPath}`);
console.log(`Report: ${reportPath}`);

function loadNpcLookup(filePath) {
  if (!fs.existsSync(filePath)) {
    return new Map();
  }

  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const npcs = Array.isArray(payload?.npcs) ? payload.npcs : [];
  const byName = new Map();
  for (const npc of npcs) {
    const name = normalizeName(npc?.name);
    if (!name) {
      continue;
    }
    const key = name.toLowerCase();
    const candidates = byName.get(key) ?? [];
    candidates.push({
      boss: npc?.boss === true || npc?.boss === 1,
      id: toNullableInteger(npc?.id),
      internalName: normalizeName(npc?.internalName),
      name,
      type: toNullableInteger(npc?.type)
    });
    byName.set(key, candidates);
  }

  return new Map(
    [...byName.entries()].map(([key, candidates]) => [
      key,
      {
        boss: candidates.some((candidate) => candidate.boss === true),
        candidates: candidates
          .slice()
          .sort((left, right) => {
            const leftPositive = left.id != null && left.id > 0 ? 0 : 1;
            const rightPositive = right.id != null && right.id > 0 ? 0 : 1;
            return (
              leftPositive - rightPositive
              || (left.id ?? Number.MAX_SAFE_INTEGER) - (right.id ?? Number.MAX_SAFE_INTEGER)
              || String(left.internalName ?? '').localeCompare(String(right.internalName ?? ''))
            );
          })
      }
    ])
  );
}

function resolveNpcSourceBinding({ item, npcLookup, source, stats, unresolvedByName }) {
  if (source?.sourceType !== 'drop' || source?.sourceRefType !== 'npc') {
    return source;
  }

  stats.totalDropNpcSources += 1;
  const sourceRefName = normalizeName(source.sourceRefName);
  const resolution = resolveNpcSourceCandidate(sourceRefName, npcLookup);
  if (resolution.status === 'resolved') {
    if (resolution.strategy === 'exact_internal_name') stats.boundByExactInternalName += 1;
    else if (resolution.strategy === 'single_candidate') stats.boundBySingleCandidate += 1;
    else if (resolution.strategy === 'single_positive_candidate') stats.boundBySinglePositiveCandidate += 1;
    else if (resolution.strategy === 'positive_id_fallback') stats.boundByPositiveIdFallback += 1;

    return {
      ...source,
      sourceRefId: resolution.npcId,
      sourceRefInternalName: resolution.internalName,
      sourceRefResolution: resolution.strategy
    };
  }

  if (resolution.reason === 'no_match') {
    stats.unresolvedNoMatch += 1;
  } else {
    stats.unresolvedNoStableCandidate += 1;
  }

  rememberUnresolvedNpcSource({
    item,
    resolution,
    sourceRefName,
    unresolvedByName
  });

  return {
    ...source,
    sourceRefId: null,
    sourceRefInternalName: null,
    sourceRefResolution: resolution.reason
  };
}

function resolveNpcSourceCandidate(sourceRefName, npcLookup) {
  if (!sourceRefName) {
    return { status: 'unresolved', reason: 'no_match', candidates: [] };
  }

  const entry = npcLookup.get(sourceRefName.toLowerCase());
  const candidates = Array.isArray(entry?.candidates) ? entry.candidates : [];
  if (candidates.length === 0) {
    return { status: 'unresolved', reason: 'no_match', candidates: [] };
  }

  const normalizedSourceName = normalizeIdentity(sourceRefName);
  const exactInternalMatches = candidates.filter((candidate) => normalizeIdentity(candidate.internalName) === normalizedSourceName);
  if (exactInternalMatches.length === 1 && exactInternalMatches[0].id != null) {
    return {
      status: 'resolved',
      strategy: 'exact_internal_name',
      npcId: exactInternalMatches[0].id,
      internalName: exactInternalMatches[0].internalName,
      candidates
    };
  }

  if (candidates.length === 1 && candidates[0].id != null) {
    return {
      status: 'resolved',
      strategy: 'single_candidate',
      npcId: candidates[0].id,
      internalName: candidates[0].internalName,
      candidates
    };
  }

  const positiveCandidates = candidates.filter((candidate) => candidate.id != null && candidate.id > 0);
  if (positiveCandidates.length === 1) {
    return {
      status: 'resolved',
      strategy: 'single_positive_candidate',
      npcId: positiveCandidates[0].id,
      internalName: positiveCandidates[0].internalName,
      candidates
    };
  }

  if (positiveCandidates.length > 1) {
    const primaryPositive = positiveCandidates[0];
    return {
      status: 'resolved',
      strategy: 'positive_id_fallback',
      npcId: primaryPositive.id,
      internalName: primaryPositive.internalName,
      candidates
    };
  }

  return {
    status: 'unresolved',
    reason: 'no_stable_candidate',
    candidates
  };
}

function rememberUnresolvedNpcSource({ item, resolution, sourceRefName, unresolvedByName }) {
  const key = String(sourceRefName ?? '').trim().toLowerCase();
  const current = unresolvedByName.get(key) ?? {
    sourceRefName,
    reason: resolution.reason,
    occurrences: 0,
    candidates: [],
    sampleItems: []
  };
  current.occurrences += 1;
  current.reason = resolution.reason;
  current.candidates = resolution.candidates.map((candidate) => ({
    boss: candidate.boss,
    id: candidate.id,
    internalName: candidate.internalName,
    name: candidate.name,
    type: candidate.type
  }));
  const itemLabel = normalizeName(item?.name) ?? normalizeName(item?.internalName);
  if (itemLabel && current.sampleItems.length < 10 && !current.sampleItems.includes(itemLabel)) {
    current.sampleItems.push(itemLabel);
  }
  unresolvedByName.set(key, current);
}

function normalizeName(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function buildItemLookup(items) {
  const byName = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    rememberItemLookup(byName, item?.internalName, item);
    rememberItemLookup(byName, item?.name, item);
    rememberItemLookup(byName, item?.nameZh, item);
  }
  return { byName };
}

function rememberItemLookup(byName, value, item) {
  const key = normalizeIdentity(value);
  if (!key || byName.has(key)) {
    return;
  }
  byName.set(key, item);
}

function resolveItemFromLookup(itemLookup, ...names) {
  for (const name of names) {
    const key = normalizeIdentity(name);
    if (!key) {
      continue;
    }
    const item = itemLookup.byName.get(key);
    if (item) {
      return item;
    }
  }
  return null;
}

function loadRecipeReference(filePath) {
  if (!fs.existsSync(filePath)) {
    return { sourceType: null, recipesByResultInternalName: new Map(), groupsByCanonicalName: new Map() };
  }
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const supplementalRecipes = Array.isArray(payload?.supplementalRecipes) ? payload.supplementalRecipes : [];
  const groups = Array.isArray(payload?.groups) ? payload.groups : [];

  return {
    sourceType: typeof payload?.sourceType === 'string' ? payload.sourceType : null,
    recipesByResultInternalName: new Map(
      supplementalRecipes.reduce((acc, recipe) => {
        const key = normalizeIdentity(recipe?.resultInternalName);
        if (!key) return acc;
        const bucket = acc.find(([bucketKey]) => bucketKey === key);
        if (bucket) bucket[1].push(recipe);
        else acc.push([key, [recipe]]);
        return acc;
      }, [])
    ),
    groupsByCanonicalName: new Map(
      groups
        .map((group) => [normalizeIdentity(group?.canonicalName), group])
        .filter(([key]) => key)
    )
  };
}

function resolveSupplementalRecipeRows(recipeReference, item) {
  const key = normalizeIdentity(item?.internalName);
  if (!key) {
    return [];
  }
  const rows = recipeReference.recipesByResultInternalName.get(key) ?? [];
  return rows.map((row) => ({
    ...row,
    ingredients: Array.isArray(row?.ingredients) ? row.ingredients.map((ingredient) => ({ ...ingredient })) : [],
    stations: Array.isArray(row?.stations) ? row.stations.map((station) => ({ ...station })) : []
  }));
}

function shouldUseRecipeReferenceAsPrimary(recipeReference) {
  return recipeReference?.sourceType === 'wiki_gg_live_english_recipes';
}

function normalizeIdentity(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function toNullableInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
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

function booleanOption(value, fallback) {
  if (value == null || value === '') {
    return fallback;
  }
  if (value === true || value === 'true' || value === '1' || value === 'yes') {
    return true;
  }
  if (value === false || value === 'false' || value === '0' || value === 'no') {
    return false;
  }
  return fallback;
}
