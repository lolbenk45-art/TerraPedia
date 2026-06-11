#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  auditItemSourceGapCandidates
} from './audit-item-source-gap-candidates.mjs';
import {
  isFamilyPageAllowedForSharedSource
} from './item-source-family-page-policy.mjs';
import {
  numericOption,
  parseCliArgs,
  sharedDataPath,
  writeJson
} from '../lib/wiki-item-utils.mjs';
import { normalizeText } from '../lib/wiki-page-utils.mjs';

const MUTATION_FLAGS = new Set([
  'apply',
  'write-db',
  'sync',
  'import',
  'materialize',
  'backfill',
  'refresh',
  'pipeline'
]);

const ALLOWED_SOURCE_TYPES = new Set([
  'drop',
  'shop',
  'container',
  'crate',
  'treasure_bag',
  'shimmer',
  'worldgen',
  'mining',
  'quest_reward',
  'craft',
  'unknown'
]);

const ALLOWED_SOURCE_REF_TYPES = new Set([
  'npc',
  'boss',
  'item',
  'container',
  'crate',
  'treasure_bag',
  'world',
  'unknown'
]);

const ITEM_BACKED_SOURCE_REF_TYPES = new Set(['item', 'container', 'crate', 'treasure_bag']);
const NPC_BACKED_SOURCE_REF_TYPES = new Set(['npc', 'boss']);
const CONTAINER_LIKE_NPC_POLLUTION = /\b(chest|crate|treasure\s+bag|lock\s*box|present|bag)\b/i;
const PROMOTION_SCOPES = new Set(['family', 'polluted', 'all']);
const GOODIE_BAG_POLLUTED_PAGES = new Set([
  'Cat set',
  'Creeper set',
  'Fox set',
  'Karate Tortoise set',
  'Leprechaun set',
  'Princess set',
  'Pumpkin set',
  'Robot set',
  'Space Creature set',
  'Unicorn set',
  'Vampire set',
  'Witch set',
  'Wolf set',
  'Bride of Frankenstein set',
  'Ghost set',
  'Pixie set',
  'Reaper set',
  'Treasure Hunter set'
]);
const MUMMY_SET_SOURCE_NPCS = [
  'Blood Mummy',
  'Dark Mummy',
  'Light Mummy',
  'Mummy'
];

export function parseBuildItemSourceCandidateImportPlanArgs(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  for (const [key, value] of Object.entries(options)) {
    if (MUTATION_FLAGS.has(key) && value !== false && value !== 'false') {
      throw new Error(`read-only import plan refuses mutation flag: --${key}`);
    }
  }

  return {
    rawItemPageDir: options['raw-dir'] ?? options.rawDir ?? '/home/lolben/data/terraPedia/raw/wiki/item-pages',
    npcParsedPath: options.npcs ?? sharedDataPath('raw', 'wiki', 'module__npcinfo__data.parsed.latest.json'),
    standardizedNpcsPath: options['standardized-npcs'] ?? path.join(process.cwd(), 'data', 'standardized', 'npcs.standardized.json'),
    standardizedItemsPath: options.items ?? options['standardized-items'] ?? path.join(process.cwd(), 'data', 'standardized', 'items.standardized.json'),
    itemSourcesDir: options['item-sources-dir'] ?? options.itemSourcesDir ?? path.join(process.cwd(), 'data', 'standardized-view', 'item_relations', 'itemSources'),
    sample: options.sample ?? null,
    limit: numericOption(options.limit, null),
    outputPath: options.output ?? null,
    bundleRoot: options['bundle-root'] ?? options.bundleRoot ?? null,
    promotionScope: normalizePromotionScope(options['promotion-scope'] ?? options.promotionScope ?? 'all')
  };
}

export function buildItemSourceCandidateImportPlan({
  auditSummary = null,
  rawItemPageDir = '/home/lolben/data/terraPedia/raw/wiki/item-pages',
  npcParsedPath = sharedDataPath('raw', 'wiki', 'module__npcinfo__data.parsed.latest.json'),
  standardizedNpcsPath = path.join(process.cwd(), 'data', 'standardized', 'npcs.standardized.json'),
  standardizedItemsPath = path.join(process.cwd(), 'data', 'standardized', 'items.standardized.json'),
  itemSourcesDir = path.join(process.cwd(), 'data', 'standardized-view', 'item_relations', 'itemSources'),
  sample = null,
  limit = null,
  promotionScope = 'all'
} = {}) {
  const normalizedPromotionScope = normalizePromotionScope(promotionScope);
  const summary = auditSummary ?? auditItemSourceGapCandidates({
    rawItemPageDir,
    npcParsedPath,
    standardizedNpcsPath,
    standardizedItemsPath,
    itemSourcesDir,
    sample,
    limit
  });
  const itemLookup = buildEntityLookup(loadEntityRecords(standardizedItemsPath), {
    includePlural: false
  });
  const npcLookup = buildEntityLookup(loadEntityRecords(fs.existsSync(npcParsedPath) ? npcParsedPath : standardizedNpcsPath), {
    includePlural: true
  });

  const eligibleCandidates = [];
  const blockedCandidates = [];
  let plannedSourceRows = 0;
  let blockedSourceRows = 0;

  for (const candidate of Array.isArray(summary.candidates) ? summary.candidates : []) {
    const classification = normalizeText(candidate.classification) ?? 'unknown';
    const itemResolution = resolveEntityRef(itemLookup, candidate.itemInternalName, candidate.itemName);
    const sourcePlans = dedupeSourcePlans(normalizeCandidateSourcesForPlanning(candidate, candidate.extractedSources)
      .map((source, sourceIndex) => buildSourcePlan({
        candidate,
        source,
        sourceIndex,
        itemLookup,
        npcLookup
      })));
    const candidateBlockReason = classifyCandidateBlockReason(candidate, itemResolution, sourcePlans, {
      promotionScope: normalizedPromotionScope
    });

    const blockedSources = sourcePlans.filter((source) => source.blockedReason);
    if (candidateBlockReason || blockedSources.length > 0) {
      const blockedReason = candidateBlockReason ?? 'blocked_source_rows';
      blockedSourceRows += sourcePlans.length;
      blockedCandidates.push({
        itemInternalName: candidate.itemInternalName,
        itemName: candidate.itemName,
        pageTitle: candidate.pageTitle,
        rawPath: candidate.rawPath,
        classification,
        blockedReason,
        itemResolution,
        rawSourceCount: candidate.rawSourceCount,
        standardizedSourceCount: candidate.standardizedSourceCount,
        sourceRevisionTimestamp: candidate.sourceRevisionTimestamp ?? null,
        blockedSources: sourcePlans.map((source) => ({
          ...source,
          blockedReason: source.blockedReason ?? blockedReason
        }))
      });
      continue;
    }

    plannedSourceRows += sourcePlans.length;
    eligibleCandidates.push({
      itemInternalName: candidate.itemInternalName,
      itemName: candidate.itemName,
      itemResolution,
      pageTitle: candidate.pageTitle,
      rawPath: candidate.rawPath,
      classification,
      rawSourceCount: candidate.rawSourceCount,
      standardizedSourceCount: candidate.standardizedSourceCount,
      sourceRevisionTimestamp: candidate.sourceRevisionTimestamp ?? null,
      plannedSources: sourcePlans
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    mode: 'candidate_import_plan',
    inputs: {
      rawItemPageDir,
      npcParsedPath,
      standardizedNpcsPath,
      standardizedItemsPath,
      itemSourcesDir,
      sample,
      limit,
      promotionScope: normalizedPromotionScope
    },
    sourceAudit: {
      generatedAt: summary.generatedAt,
      readOnly: summary.readOnly,
      parsedRawItemPages: summary.parsedRawItemPages,
      inspectedRawPages: summary.inspectedRawPages,
      rawPagesWithExtractedSources: summary.rawPagesWithExtractedSources,
      rawExtractedButStandardizedZeroCandidates: summary.rawExtractedButStandardizedZeroCandidates
    },
    summary: {
      totalCandidates: Number(summary.totalCandidates ?? 0),
      eligibleCandidates: eligibleCandidates.length,
      blockedCandidates: blockedCandidates.length,
      plannedSourceRows,
      blockedSourceRows,
      classificationCounts: summary.classificationCounts ?? {},
      blockedReasonCounts: countBy(blockedCandidates, (candidate) => candidate.blockedReason),
      plannedSourceRefTypeCounts: countBy(
        eligibleCandidates.flatMap((candidate) => candidate.plannedSources),
        (source) => source.sourceRefType ?? 'unknown'
      )
    },
    eligibleCandidates,
    blockedCandidates
  };
}

export function buildItemSourceCandidateBundle(plan) {
  const itemSources = (Array.isArray(plan?.eligibleCandidates) ? plan.eligibleCandidates : [])
    .flatMap((candidate) => Array.isArray(candidate.plannedSources) ? candidate.plannedSources : [])
    .map((source) => ({ ...source.landingRow }));

  return {
    source: 'terraria.wiki.gg:item-source-gap-repair',
    generatedAt: plan?.generatedAt ?? new Date().toISOString(),
    overwriteExisting: false,
    itemImages: [],
    recipes: [],
    itemSources,
    biomes: [],
    itemBiomes: [],
    snapshots: [],
    importPlanSummary: plan?.summary ?? null
  };
}

function classifyCandidateBlockReason(candidate, itemResolution, sourcePlans = [], { promotionScope = 'all' } = {}) {
  const classification = normalizeText(candidate.classification) ?? 'unknown';
  if (itemResolution.status !== 'resolved') return 'item_unresolved';
  if (classification === 'high_confidence') return null;
  if (classification === 'family_page_candidate') {
    if (!['family', 'all'].includes(promotionScope)) return 'family_page_candidate';
    return isAllowedFamilyCandidate(candidate, sourcePlans) ? null : 'family_page_candidate';
  }
  if (classification === 'polluted_candidate') {
    if (!['polluted', 'all'].includes(promotionScope)) return 'polluted_candidate';
    return isAllowedPollutedCandidate(candidate, sourcePlans) ? null : 'polluted_candidate';
  }
  if (classification !== 'high_confidence') return classification;
  return null;
}

function normalizePromotionScope(value) {
  const normalized = normalizeText(value)?.toLowerCase() ?? 'all';
  if (!PROMOTION_SCOPES.has(normalized)) {
    throw new Error(`invalid promotion scope: ${value}`);
  }
  return normalized;
}

function isAllowedFamilyCandidate(candidate, sourcePlans) {
  return sourcePlans.length > 0
    && sourcePlans.every((source) =>
      !source.blockedReason
      && isFamilyPageAllowedForSharedSource({
        pageTitle: candidate.pageTitle,
        sourceType: source.sourceType,
        sourceRefType: source.sourceRefType
      }));
}

function isAllowedPollutedCandidate(candidate, sourcePlans) {
  const pageTitle = normalizeText(candidate.pageTitle);
  if (GOODIE_BAG_POLLUTED_PAGES.has(pageTitle)) {
    return sourcePlans.length > 0
      && sourcePlans.every((source) =>
        !source.blockedReason
        && source.sourceType === 'drop'
        && source.sourceRefType === 'item'
        && source.sourceRefName === 'Goodie Bag');
  }
  if (pageTitle === 'Flairon') {
    return sourcePlans.length > 0
      && sourcePlans.every((source) =>
        !source.blockedReason
        && (
          (source.sourceType === 'drop' && source.sourceRefType === 'boss' && source.sourceRefName === 'Duke Fishron')
          || (source.sourceType === 'treasure_bag' && source.sourceRefType === 'treasure_bag' && source.sourceRefName === 'Treasure Bag (Duke Fishron)')
        ))
      && sourcePlans.some((source) => source.sourceRefType === 'boss' && source.sourceRefName === 'Duke Fishron')
      && sourcePlans.some((source) => source.sourceRefType === 'treasure_bag' && source.sourceRefName === 'Treasure Bag (Duke Fishron)');
  }
  if (pageTitle === 'Shucked Oyster') {
    return sourcePlans.length === 1
      && sourcePlans.every((source) =>
        !source.blockedReason
        && source.sourceType === 'drop'
        && source.sourceRefType === 'item'
        && source.sourceRefName === 'Oyster');
  }
  if (pageTitle === 'Mummy set') {
    const expected = new Set(MUMMY_SET_SOURCE_NPCS);
    return sourcePlans.length === expected.size
      && sourcePlans.every((source) =>
        !source.blockedReason
        && source.sourceType === 'drop'
        && source.sourceRefType === 'npc'
        && expected.has(source.sourceRefName));
  }
  if (pageTitle === 'Block-placing wands') {
    const itemName = normalizeText(candidate.itemName);
    return sourcePlans.length > 0
      && sourcePlans.every((source) =>
        !source.blockedReason
        && normalizeText(source.sourceSectionTitle) === itemName);
  }
  if (pageTitle === 'Torches') {
    return sourcePlans.length > 0
      && sourcePlans.every((source) =>
        !source.blockedReason
        && ['drop', 'container', 'shop', 'craft', 'shimmer'].includes(source.sourceType)
        && source.sourceRefType !== 'unknown');
  }
  if (pageTitle === 'Ropes') {
    return sourcePlans.length > 0
      && sourcePlans.every((source) =>
        !source.blockedReason
        && ['drop', 'container', 'shop', 'craft'].includes(source.sourceType)
        && source.sourceRefType !== 'unknown');
  }
  return false;
}

function normalizeCandidateSourcesForPlanning(candidate, sources) {
  const normalized = (Array.isArray(sources) ? sources : [])
    .flatMap((source) => normalizeSourceForPlanning(candidate, source))
    .filter((source) => !isDroppedPollutedNoiseSource(candidate, source));
  if (normalizeText(candidate?.pageTitle) === 'Torches') {
    return normalizeTorchSources(candidate, normalized);
  }
  if (normalizeText(candidate?.pageTitle) === 'Ropes') {
    return normalizeRopeSources(candidate, normalized);
  }
  if (normalizeText(candidate?.pageTitle) === 'Block-placing wands') {
    return normalizeBlockPlacingWandSources(candidate, normalized);
  }
  if (normalizeText(candidate?.pageTitle) !== 'Flairon') {
    return normalized;
  }

  const expertModeSources = normalized.filter((source) =>
    source.sourceType === 'drop'
    && source.sourceRefType === 'unknown'
    && source.sourceRefName === 'Expert Mode');
  if (!expertModeSources.length) {
    return normalized;
  }

  return normalized
    .filter((source) => !expertModeSources.includes(source))
    .map((source) => {
      if (source.sourceRefType !== 'treasure_bag') return source;
      return {
        ...source,
        conditions: mergeText(source.conditions, 'Expert Mode')
      };
    });
}

function normalizeTorchSources(candidate, sources) {
  const itemName = normalizeText(candidate.itemName);
  const recipeSources = buildExactRecipeSources(candidate);
  const exactTypeSources = sources.filter((source) => normalizeText(source.sourceTargetItemName) === itemName);
  if (itemName !== 'Torch') {
    return [...exactTypeSources, ...recipeSources];
  }
  return [
    ...normalizeBaseMatrixItemSources(sources),
    ...recipeSources
  ];
}

function normalizeRopeSources(candidate, sources) {
  const itemName = normalizeText(candidate.itemName);
  if (itemName === 'Vine Rope') {
    return [{
      sourceType: 'drop',
      sourceRefType: 'world',
      sourceRefName: 'Vines',
      quantityText: '1',
      chanceText: null,
      conditions: 'Guide to Plant Fiber Cordage equipped',
      notes: 'Vine Rope is acquired by destroying vines while the Guide to Plant Fiber Cordage is equipped.'
    }];
  }
  const recipeSources = buildExactRecipeSources(candidate);
  if (itemName !== 'Rope') {
    return recipeSources;
  }
  return [
    ...normalizeBaseMatrixItemSources(sources),
    ...splitCompositeMerchantSource({
      sourceType: 'shop',
      sourceRefType: 'npc',
      sourceRefName: 'Merchant and Skeleton Merchant',
      quantityText: null,
      chanceText: null,
      conditions: null,
      notes: 'Rope can be purchased from the Merchant and Skeleton Merchant.'
    })
  ];
}

function normalizeBaseMatrixItemSources(sources) {
  return sources
    .filter((source) => !normalizeText(source.sourceTargetItemName))
    .filter((source) => !isBonusDropMarker(source))
    .flatMap(splitCompositeMerchantSource);
}

function isBonusDropMarker(source) {
  return source.sourceType === 'drop'
    && source.sourceRefType === 'unknown'
    && normalizeText(source.sourceRefName) === 'Bonus drop';
}

function splitCompositeMerchantSource(source) {
  if (
    source.sourceType !== 'shop'
    || source.sourceRefType !== 'npc'
    || !/Merchant\s+(?:or|and)\s+Skeleton Merchant/i.test(source.sourceRefName ?? '')
  ) {
    return [source];
  }
  return ['Merchant', 'Skeleton Merchant'].map((sourceRefName) => ({
    ...source,
    sourceRefName,
    conditions: null
  }));
}

function buildExactRecipeSources(candidate) {
  const itemName = normalizeText(candidate.itemName);
  const recipes = Array.isArray(candidate.extractedRecipes) ? candidate.extractedRecipes : [];
  return recipes
    .filter((recipe) => normalizeRecipeResultName(recipe?.resultName) === itemName)
    .flatMap((recipe) => buildRecipeSourceRows(candidate, recipe));
}

function buildRecipeSourceRows(candidate, recipe) {
  const ingredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
  const resultQuantity = Number(recipe?.resultQuantity);
  const quantityText = Number.isFinite(resultQuantity) && resultQuantity > 0 ? String(resultQuantity) : '1';
  const sourceType = inferRecipeSourceType(candidate, recipe);
  const conditions = sourceType === 'shimmer' ? 'Shimmer transmutation' : recipeConditionText(recipe);
  const notes = recipeIngredientSummary(ingredients);
  return ingredients
    .filter((ingredient) => normalizeText(ingredient?.ingredientName))
    .map((ingredient) => {
      const sourceRefType = normalizeText(ingredient.ingredientGroupType) === 'item' ? 'item' : 'world';
      return {
        sourceType,
        sourceRefType,
        sourceRefName: normalizeText(ingredient.ingredientName),
        quantityText,
        chanceText: null,
        conditions,
        notes
      };
    });
}

function inferRecipeSourceType(candidate, recipe) {
  const itemName = normalizeText(candidate.itemName);
  const ingredientNames = (Array.isArray(recipe?.ingredients) ? recipe.ingredients : [])
    .map((ingredient) => normalizeText(ingredient?.ingredientName))
    .filter(Boolean);
  if (normalizeText(candidate.pageTitle) === 'Torches' && itemName === 'Aether Torch' && ingredientNames.includes('Any Torch')) {
    return 'shimmer';
  }
  return 'craft';
}

function recipeConditionText(recipe) {
  const stations = (Array.isArray(recipe?.stations) ? recipe.stations : [])
    .map((station) => normalizeText(station?.stationName ?? station?.stationNameRaw))
    .filter(Boolean);
  if (!stations.length || stations.every((station) => station === 'By Hand')) {
    return 'Crafted by hand';
  }
  return stations.length ? `Crafted at ${stations.join(' + ')}` : 'Crafted by hand';
}

function recipeIngredientSummary(ingredients) {
  const parts = (Array.isArray(ingredients) ? ingredients : [])
    .map((ingredient) => {
      const name = normalizeText(ingredient?.ingredientName);
      if (!name) return null;
      const quantity = normalizeText(ingredient?.quantityText);
      return quantity ? `${name} x${quantity}` : name;
    })
    .filter(Boolean);
  return parts.length ? `Recipe ingredients: ${parts.join(', ')}` : null;
}

function normalizeRecipeResultName(value) {
  const text = normalizeText(value);
  if (!text) return null;
  return text
    .replace(/^only:\s*/i, '')
    .replace(/\s*\([^)]*versions?\)/gi, '')
    .replace(/\s+\d+(?:\.\d+)?$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSourceForPlanning(candidate, source) {
  const sourceType = normalizeText(source?.sourceType)?.toLowerCase() ?? 'unknown';
  let sourceRefType = normalizeText(source?.sourceRefType)?.toLowerCase() ?? 'unknown';
  const sourceRefName = normalizeSourceRefNameForPlanning(sourceRefType, source?.sourceRefName);
  if (
    GOODIE_BAG_POLLUTED_PAGES.has(normalizeText(candidate?.pageTitle))
    && sourceType === 'drop'
    && sourceRefType === 'unknown'
    && sourceRefName === 'Goodie Bag'
  ) {
    sourceRefType = 'item';
  }
  if (
    normalizeText(candidate?.pageTitle) === 'Shucked Oyster'
    && sourceType === 'drop'
    && sourceRefType === 'unknown'
    && sourceRefName === 'Oyster'
  ) {
    sourceRefType = 'item';
  }
  if (
    normalizeText(candidate?.pageTitle) === 'Mummy set'
    && sourceType === 'drop'
    && sourceRefType === 'unknown'
    && sourceRefName === 'Mummies'
  ) {
    return MUMMY_SET_SOURCE_NPCS.map((name) => ({
      ...source,
      sourceType,
      sourceRefType: 'npc',
      sourceRefName: name
    }));
  }
  return {
    ...source,
    sourceType,
    sourceRefType,
    sourceRefName
  };
}

function isDroppedPollutedNoiseSource(candidate, source) {
  return normalizeText(candidate?.pageTitle) === 'Witch set'
    && source.sourceType === 'worldgen'
    && source.sourceRefType === 'world'
    && source.sourceRefName === 'Witch set worldgen'
    && /\bVampirism worlds?\b/i.test(source.conditions ?? '');
}

function normalizeBlockPlacingWandSources(candidate, sources) {
  const itemName = normalizeText(candidate.itemName);
  const matching = sources.filter((source) => normalizeText(source.sourceSectionTitle) === itemName);
  const hasTreeSource = new Set(matching
    .filter((source) => isBlockPlacingWandTreeSource(source))
    .map((source) => blockPlacingWandSourceRowKey(source)));

  return matching
    .filter((source) => {
      if (normalizeText(source.sourceRefName) !== 'Shaking') return true;
      return !hasTreeSource.has(blockPlacingWandSourceRowKey(source));
    })
    .map((source) => {
      if (!isBlockPlacingWandTreeSource(source)) return source;
      return {
        ...source,
        sourceType: 'drop',
        sourceRefType: 'world',
        conditions: mergeText(source.conditions, 'Shaking')
      };
    });
}

function isBlockPlacingWandTreeSource(source) {
  return source.sourceType === 'drop'
    && source.sourceRefType === 'unknown'
    && /^(?:Forest|Mahogany) tree$/i.test(normalizeText(source.sourceRefName) ?? '');
}

function blockPlacingWandSourceRowKey(source) {
  return JSON.stringify([
    normalizeText(source.sourceSectionTitle),
    source.quantityText ?? null,
    source.chanceText ?? null,
    source.sourceRowText ?? null
  ]);
}

function buildSourcePlan({
  candidate,
  source,
  sourceIndex,
  itemLookup,
  npcLookup
}) {
  const sourceType = normalizeText(source.sourceType)?.toLowerCase() ?? 'unknown';
  const sourceRefType = normalizeText(source.sourceRefType)?.toLowerCase() ?? 'unknown';
  const sourceRefName = normalizeSourceRefNameForPlanning(sourceRefType, source.sourceRefName);
  const base = {
    importPlanKey: createImportPlanKey(candidate, source, sourceIndex),
    sourceType,
    sourceRefType,
    sourceRefName,
    quantityText: source.quantityText ?? null,
    chanceText: source.chanceText ?? null,
    conditions: source.conditions ?? null,
    notes: source.notes ?? null,
    sourcePage: candidate.pageTitle ?? null,
    sourceRevisionTimestamp: candidate.sourceRevisionTimestamp ?? null,
    sourceSectionTitle: source.sourceSectionTitle ?? null,
    sourceRowText: source.sourceRowText ?? null,
    sortOrder: sourceIndex,
    landingRow: {
      itemInternalName: candidate.itemInternalName,
      itemName: candidate.itemName,
      sourceType,
      sourceRefType,
      sourceRefName,
      quantityText: source.quantityText ?? null,
      chanceText: source.chanceText ?? null,
      conditions: source.conditions ?? null,
      notes: source.notes ?? null,
      sourceProvider: 'wiki_gg',
      sourcePage: candidate.pageTitle ?? null,
      sourceRevisionTimestamp: candidate.sourceRevisionTimestamp ?? null,
      sortOrder: sourceIndex
    }
  };

  const blockedReason = validateSourceContract({ sourceType, sourceRefType, sourceRefName });
  if (blockedReason) {
    return {
      ...base,
      resolutionStatus: 'blocked',
      resolvedRef: null,
      blockedReason
    };
  }

  if (sourceRefType === 'world') {
    return {
      ...base,
      resolutionStatus: 'world_text_ref',
      resolvedRef: null,
      blockedReason: null
    };
  }

  if (ITEM_BACKED_SOURCE_REF_TYPES.has(sourceRefType)) {
    const resolvedRef = resolveEntityRef(itemLookup, sourceRefName);
    if (resolvedRef.status !== 'resolved') {
      return {
        ...base,
        resolutionStatus: resolvedRef.status,
        resolvedRef,
        blockedReason: 'source_item_ref_unresolved'
      };
    }
    return {
      ...base,
      resolutionStatus: 'resolved_item_ref',
      resolvedRef,
      blockedReason: null
    };
  }

  if (NPC_BACKED_SOURCE_REF_TYPES.has(sourceRefType)) {
    const resolvedRef = resolveEntityRef(npcLookup, sourceRefName);
    if (resolvedRef.status !== 'resolved') {
      return {
        ...base,
        resolutionStatus: resolvedRef.status,
        resolvedRef,
        blockedReason: sourceRefType === 'boss' ? 'source_boss_ref_unresolved' : 'source_npc_ref_unresolved'
      };
    }
    return {
      ...base,
      resolutionStatus: sourceRefType === 'boss' ? 'resolved_boss_ref' : 'resolved_npc_ref',
      resolvedRef,
      blockedReason: null
    };
  }

  return {
    ...base,
    resolutionStatus: 'blocked',
    resolvedRef: null,
    blockedReason: 'unsupported_source_ref_type'
  };
}

function dedupeSourcePlans(sourcePlans) {
  const deduped = new Map();
  for (const source of sourcePlans) {
    const key = JSON.stringify([
      source.sourceType,
      source.sourceRefType,
      source.sourceRefName,
      source.quantityText ?? null,
      source.chanceText ?? null,
      source.conditions ?? null
    ]);
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, source);
      continue;
    }
    deduped.set(key, mergeSourcePlan(existing, source));
  }
  return reindexSourcePlans(dropCoveredCompositeNpcRows([...deduped.values()]));
}

function reindexSourcePlans(sourcePlans) {
  return sourcePlans.map((source, index) => ({
    ...source,
    sortOrder: index,
    landingRow: {
      ...source.landingRow,
      sortOrder: index
    }
  }));
}

function dropCoveredCompositeNpcRows(sourcePlans) {
  return sourcePlans.flatMap((source) => {
    const components = compositeNpcComponents(source);
    if (!components.length) return [source];

    const coveredRows = components.map((name) => sourcePlans.find((candidate) =>
      !candidate.blockedReason
      && candidate.sourceType === source.sourceType
      && candidate.sourceRefType === source.sourceRefType
      && candidate.sourceRefName === name
    ));
    if (coveredRows.some((row) => !row)) return [source];

    for (const row of coveredRows) {
      row.notes = mergeText(row.notes, source.notes);
      row.landingRow = {
        ...row.landingRow,
        notes: row.notes
      };
    }
    return [];
  });
}

function compositeNpcComponents(source) {
  if (
    source.sourceRefType !== 'npc'
    || source.blockedReason !== 'source_npc_ref_unresolved'
    || !/\s+and\s+/i.test(source.sourceRefName ?? '')
  ) {
    return [];
  }
  return String(source.sourceRefName)
    .split(/\s+and\s+/i)
    .map((value) => normalizeText(value))
    .filter(Boolean);
}

function mergeSourcePlan(primary, fallback) {
  const notes = mergeText(primary.notes, fallback.notes);
  return {
    ...primary,
    notes,
    landingRow: {
      ...primary.landingRow,
      notes
    }
  };
}

function mergeText(primary, fallback) {
  const first = normalizeText(primary);
  const second = normalizeText(fallback);
  if (!first) return second ?? null;
  if (!second || first === second) return first;
  return `${first} ${second}`;
}

function normalizeSourceRefNameForPlanning(sourceRefType, value) {
  const text = normalizeText(value);
  if (!text || !NPC_BACKED_SOURCE_REF_TYPES.has(sourceRefType)) return text;
  const withoutNpcSuffix = text.replace(/\s+NPC\s+for$/i, '').trim();
  const duringMatch = withoutNpcSuffix.match(/^(.+?)\s+during\b.+\s+for(?:\b.*)?$/i);
  if (duringMatch) return duringMatch[1].trim();
  const withoutForTail = withoutNpcSuffix.replace(/\s+for(?:\b.*)?$/i, '').trim();
  return withoutForTail || text;
}

function validateSourceContract({ sourceType, sourceRefType, sourceRefName }) {
  if (!ALLOWED_SOURCE_TYPES.has(sourceType)) return 'invalid_source_type';
  if (!ALLOWED_SOURCE_REF_TYPES.has(sourceRefType)) return 'invalid_source_ref_type';
  if (sourceType === 'unknown' || sourceRefType === 'unknown') return 'unknown_source_contract';
  if (sourceRefType === 'npc' && CONTAINER_LIKE_NPC_POLLUTION.test(sourceRefName ?? '')) {
    return 'forbidden_npc_container_mapping';
  }
  return null;
}

function createImportPlanKey(candidate, source, sourceIndex) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      itemInternalName: candidate.itemInternalName ?? null,
      sourceType: source.sourceType ?? null,
      sourceRefType: source.sourceRefType ?? null,
      sourceRefName: source.sourceRefName ?? null,
      quantityText: source.quantityText ?? null,
      chanceText: source.chanceText ?? null,
      conditions: source.conditions ?? null,
      sourceRevisionTimestamp: candidate.sourceRevisionTimestamp ?? null,
      sourceIndex
    }))
    .digest('hex');
}

function loadEntityRecords(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return [];
  }
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(payload?.records)
    ? payload.records
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.npcs)
        ? payload.npcs
        : Array.isArray(payload)
          ? payload
          : [];
}

function buildEntityLookup(records, { includePlural = false } = {}) {
  const byKey = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    rememberEntity(byKey, record?.internalName ?? record?.internal_name, record);
    rememberEntity(byKey, record?.name, record);
    rememberEntity(byKey, record?.nameZh ?? record?.name_zh, record);
    if (includePlural && typeof record?.name === 'string' && !record.name.toLowerCase().endsWith('s')) {
      rememberEntity(byKey, `${record.name}s`, record);
    }
  }
  return byKey;
}

function rememberEntity(byKey, value, record) {
  const key = normalizeIdentity(value);
  if (!key || byKey.has(key)) {
    return;
  }
  byKey.set(key, record);
}

function resolveEntityRef(lookup, ...names) {
  for (const name of names) {
    const key = normalizeIdentity(name);
    if (!key) continue;
    const record = lookup.get(key);
    if (record) {
      return {
        status: 'resolved',
        id: record.id ?? record.sourceId ?? record.source_id ?? null,
        internalName: record.internalName ?? record.internal_name ?? null,
        name: record.name ?? null
      };
    }
  }
  return {
    status: 'unresolved',
    id: null,
    internalName: null,
    name: normalizeText(names.find((value) => normalizeText(value))) ?? null
  };
}

function countBy(values, keySelector) {
  const counts = {};
  for (const value of values) {
    const key = keySelector(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function normalizeIdentity(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function isDirectRun(metaUrl) {
  return process.argv[1] && metaUrl === new URL(`file://${path.resolve(process.argv[1])}`).href;
}

if (isDirectRun(import.meta.url)) {
  try {
    const options = parseBuildItemSourceCandidateImportPlanArgs();
    const outputPath = options.outputPath;
    const bundleRoot = options.bundleRoot;
    const plan = buildItemSourceCandidateImportPlan(options);
    if (outputPath) {
      writeJson(path.resolve(process.cwd(), outputPath), plan);
    }
    if (bundleRoot) {
      writeJson(
        path.resolve(process.cwd(), bundleRoot, 'normalized', 'item-relations.bundle.json'),
        buildItemSourceCandidateBundle(plan)
      );
    }
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
