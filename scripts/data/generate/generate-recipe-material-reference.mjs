#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { getProjectRoot, resolveSharedDataRoot } from '../lib/project-root.mjs';
import {
  buildWikiPageUrl,
  fetchWikiPageHtmlSnapshot,
  parseCliArgs,
  writeJson
} from '../lib/wiki-item-utils.mjs';
import { decodeHtmlEntities, stripHtml } from '../lib/wiki-page-utils.mjs';
import {
  RECIPE_GROUP_SOURCE_URLS,
  RECIPE_HOME_PAGE_URL,
  canonicalizeRecipeGroupName,
  getRecipeGroupDisplayNameZh,
  hasFiniteAlternativeSeparator,
  isRecipeGroupName,
  normalizeRecipeMaterialLabel
} from '../lib/recipe-material-reference.mjs';
import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const __filename = fileURLToPath(import.meta.url);
const repoRoot = getProjectRoot();
const sharedDataRoot = resolveSharedDataRoot();

const LIVE_RECIPE_PROVIDER = 'wiki_gg';
const RECIPE_SOURCE_TYPE = 'wiki_gg_live_english_recipes';
const RECIPE_HOME_SECTION = 'Recipes by crafting station';
const GROUP_SOURCE_KIND = 'group_reference';
const PAGE_SOURCE_KIND = 'recipe_page';

export async function generateRecipeMaterialReference(rawOptions = {}) {
  const options = resolveOptions(rawOptions);
  const normalizedItemsPayload = JSON.parse(await fs.promises.readFile(options.itemsPath, 'utf8'));
  const items = Array.isArray(normalizedItemsPayload?.items) ? normalizedItemsPayload.items : [];
  const itemLookup = await buildItemLookup(items);

  const homePage = await fetchWikiPageHtmlSnapshot({
    pageUrl: RECIPE_HOME_PAGE_URL
  });
  const discoveredCategoryPages = extractRecipeCategoryPagesFromHomeHtml(homePage.html);
  const categoryPages = options.pages.size === 0
    ? discoveredCategoryPages
    : discoveredCategoryPages.filter((page) => options.pages.has(page.pageTitle));

  const groupSourcePayloads = [];
  for (const pageUrl of RECIPE_GROUP_SOURCE_URLS) {
    groupSourcePayloads.push(await fetchWikiPageHtmlSnapshot({ pageUrl }));
  }

  const groups = mergeRecipeGroups(
    groupSourcePayloads.flatMap((payload) => parseRecipeGroupsFromHtml(payload.html, itemLookup))
  );

  const sourcePageSnapshots = [];
  const skippedRecipeSourcePages = [];
  const pageStats = [];
  const supplementalRecipes = [];

  for (const categoryPage of categoryPages) {
    try {
      const payload = await fetchWikiPageHtmlSnapshot({
        pageTitle: categoryPage.pageTitle
      });
      const pageResult = parseRecipePageRecipesFromHtml(payload.html, itemLookup, categoryPage, toSourceMeta(payload));
      pageStats.push(buildPageStat(categoryPage, payload, pageResult));
      sourcePageSnapshots.push(buildSourceSnapshot(categoryPage, payload, pageResult));
      supplementalRecipes.push(...pageResult.recipes);
    } catch (error) {
      const failureMessage = error?.message ?? String(error);
      skippedRecipeSourcePages.push({
        sourcePage: categoryPage.pageTitle,
        sourceUrl: categoryPage.pageUrl,
        message: failureMessage
      });
      pageStats.push(buildFailedPageStat(categoryPage, failureMessage));
    }
  }

  let dedupedRecipes = dedupeSupplementalRecipes(supplementalRecipes);
  let mergedSourcePageSnapshots = sourcePageSnapshots;
  let mergedSkippedRecipeSourcePages = skippedRecipeSourcePages;
  let mergedPageStats = pageStats;

  if (options.pages.size > 0 && fs.existsSync(options.outputPath) && fs.existsSync(options.pageStatsPath)) {
    const previousReference = JSON.parse(await fs.promises.readFile(options.outputPath, 'utf8'));
    const previousPageStats = JSON.parse(await fs.promises.readFile(options.pageStatsPath, 'utf8'));
    dedupedRecipes = mergeRecipesBySelectedPages(previousReference?.supplementalRecipes, dedupedRecipes, options.pages);
    mergedSourcePageSnapshots = mergeSnapshotsBySelectedPages(previousReference?.sourcePageSnapshots, sourcePageSnapshots, options.pages);
    mergedSkippedRecipeSourcePages = mergeSkippedPages(previousReference?.skippedRecipeSourcePages, skippedRecipeSourcePages, options.pages);
    mergedPageStats = mergePageStatsBySelectedPages(previousPageStats?.pages, pageStats, options.pages);
  }

  const sourceManifest = buildSourceManifest(homePage, discoveredCategoryPages, categoryPages);
  const reconciliation = await buildLiveRecipeReconciliation({
    categoryPages: discoveredCategoryPages,
    dedupedRecipes,
    groups,
    pageStats: mergedPageStats,
    skippedRecipeSourcePages: mergedSkippedRecipeSourcePages
  });

  writeJson(options.manifestPath, sourceManifest);
  writeJson(options.pageStatsPath, {
    generatedAt: new Date().toISOString(),
    sourceType: RECIPE_SOURCE_TYPE,
    homePageUrl: RECIPE_HOME_PAGE_URL,
    sourceSection: RECIPE_HOME_SECTION,
    pages: mergedPageStats
  });
  writeJson(options.reconciliationPath, reconciliation);
  writeJson(options.outputPath, {
    generatedAt: new Date().toISOString(),
    sourceType: RECIPE_SOURCE_TYPE,
    sourceUrls: [
      RECIPE_HOME_PAGE_URL,
      ...RECIPE_GROUP_SOURCE_URLS
    ],
    recipeSourcePages: discoveredCategoryPages.map((page) => page.pageTitle),
    sourcePageSnapshots: mergedSourcePageSnapshots,
    skippedRecipeSourcePages: mergedSkippedRecipeSourcePages,
    groups,
    supplementalRecipes: dedupedRecipes
  });

  return {
    outputPath: options.outputPath,
    manifestPath: options.manifestPath,
    pageStatsPath: options.pageStatsPath,
    reconciliationPath: options.reconciliationPath,
    categoryPages: discoveredCategoryPages.length,
    sourcePageSnapshots: mergedSourcePageSnapshots.length,
    skippedRecipeSourcePages: mergedSkippedRecipeSourcePages.length,
    groups: groups.length,
    supplementalRecipes: dedupedRecipes.length
  };
}

export function extractRecipeCategoryPagesFromHomeHtml(html) {
  const tocEntries = [...String(html ?? '').matchAll(/<li class="toclevel-2 tocsection-\d+">[\s\S]*?<a href="([^"]+)">[\s\S]*?<span class="tocnumber">([\d.]+)<\/span>[\s\S]*?<span class="toctext">([\s\S]*?)<\/span>/gi)]
    .map((match) => ({
      href: decodeHtmlEntities(match[1]),
      indexNumber: match[2],
      displayCategoryName: decodeHtmlEntities(match[3]).replace(/<[^>]+>/g, '').trim()
    }))
    .filter((entry) => entry.displayCategoryName && !/^(Gallery|See also|History|References)$/i.test(entry.displayCategoryName));

  const pageTitles = [...new Set(
    [...String(html ?? '').matchAll(/data-ajax-source-page="([^"]+)"/g)]
      .map((match) => normalizeRecipeMaterialLabel(decodeHtmlEntities(match[1])))
      .filter((value) => value && value.startsWith('Recipes/'))
  )];

  if (tocEntries.length !== pageTitles.length) {
    throw new Error(`Recipes homepage category mismatch: toc=${tocEntries.length}, sourcePages=${pageTitles.length}`);
  }

  return pageTitles.map((pageTitle, index) => {
    const toc = tocEntries[index];
    const pageSlug = normalizeRecipePageSlug(pageTitle);
    return {
      indexNumber: toc.indexNumber,
      displayCategoryName: toc.displayCategoryName,
      pageTitle,
      pageSlug,
      pageUrl: buildWikiPageUrl({ pageTitle }),
      sourceSection: RECIPE_HOME_SECTION,
      isMainCraftingStationCategory: true,
      tocHref: toc.href
    };
  });
}

export function parseRecipeGroupsFromHtml(html, itemLookup) {
  const groups = [];
  const pattern = /<h3[\s\S]*?<span class="mw-headline"[^>]*>(.*?)<\/span>[\s\S]*?<\/h3>\s*<div class="terraria">\s*<div class="itemlist"[\s\S]*?<ul>([\s\S]*?)<\/ul>[\s\S]*?<\/div>\s*<\/div>/gi;
  for (const match of String(html ?? '').matchAll(pattern)) {
    const rawDisplayName = normalizeRecipeMaterialLabel(stripHtml(match[1]));
    const displayNameSource = rawDisplayName === '编组的物品' ? '任何木材' : rawDisplayName;
    if (!displayNameSource || /^Grouped items$/i.test(displayNameSource)) {
      continue;
    }

    const canonicalName = canonicalizeRecipeGroupName(displayNameSource) ?? displayNameSource;
    const members = [];
    for (const liMatch of String(match[2]).matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
      const candidateTitle = extractFirstLinkedTitle(liMatch[1]) ?? normalizeRecipeMaterialLabel(stripHtml(liMatch[1]));
      if (!candidateTitle || /^Item IDs$/i.test(candidateTitle)) {
        continue;
      }
      const resolved = resolveItemByAnyName(itemLookup, candidateTitle);
      members.push({
        internalName: resolved?.internalName ?? null,
        name: resolved?.name ?? candidateTitle,
        nameZh: resolved?.nameZh ?? null
      });
    }

    groups.push({
      canonicalName,
      displayNameEn: /[A-Za-z]/.test(displayNameSource) ? displayNameSource : canonicalName,
      displayNameZh: getRecipeGroupDisplayNameZh(canonicalName),
      members: dedupeMembers(members)
    });
  }
  return groups;
}

export function parseRecipePageRecipesFromHtml(html, itemLookup, categoryPage, sourceMeta = {}) {
  const tableMatches = [...String(html ?? '').matchAll(/<table[^>]*class="[^"]*recipes[^"]*"[\s\S]*?<\/table>/gi)].map((match) => match[0]);
  const pageStats = {
    recipeTableCount: tableMatches.length,
    tableCaptions: [],
    rawRecipeRows: 0,
    importKeyRecipeRows: 0,
    uniqueResultItems: 0,
    groupIngredientRows: 0,
    alternativeIngredientExpansions: 0,
    versionScopedRows: 0,
    hasUnexpectedLayout: tableMatches.length === 0
  };
  const recipes = [];
  const uniqueResultItems = new Set();

  for (const table of tableMatches) {
    const captionHtml = table.match(/<caption>([\s\S]*?)<\/caption>/i)?.[1] ?? '';
    const captionText = normalizeRecipeMaterialLabel(stripHtml(captionHtml));
    if (captionText) {
      pageStats.tableCaptions.push(captionText);
    }
    const stationTitles = [...new Set(
      extractAllLinkedTitles(captionHtml)
        .map((title) => normalizeRecipeMaterialLabel(title))
        .filter(Boolean)
    )];
    const stationRequirementMode = inferStationRequirementMode(captionHtml, stationTitles);
    const stations = stationTitles.map((stationName, index) => {
      const resolved = resolveItemByAnyName(itemLookup, stationName);
      return {
        stationInternalName: resolved?.internalName ?? null,
        stationName: resolved?.name ?? stationName,
        stationNameRaw: resolved?.nameZh ?? stationName,
        isAlternative: stationRequirementMode === 'alternative' && index > 0,
        sortOrder: index
      };
    });

    const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].slice(1);
    pageStats.rawRecipeRows += rows.length;

    for (const rowMatch of rows) {
      const rowHtml = rowMatch[1];
      const resultCell = extractHtmlCellByClass(rowHtml, 'result');
      const ingredientsCell = extractHtmlCellByClass(rowHtml, 'ingredients');
      if (!resultCell || !ingredientsCell) {
        pageStats.hasUnexpectedLayout = true;
        continue;
      }

      const resultName = extractFirstLinkedTitle(resultCell) ?? normalizeRecipeMaterialLabel(stripHtml(resultCell));
      const resultItem = resolveItemByAnyName(itemLookup, resultName);
      if (!resultItem?.internalName) {
        continue;
      }
      uniqueResultItems.add(resultItem.internalName);

      const versionScope = parseEnglishVersionScope(resultCell);
      if (versionScope) {
        pageStats.versionScopedRows += 1;
      }

      const ingredientOptionSets = [...ingredientsCell.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
        .map((match, index) => parseRecipeIngredientOptions(match[1], index, itemLookup))
        .filter((options) => options.length > 0);
      if (ingredientOptionSets.length === 0) {
        continue;
      }
      const ingredientVariants = expandIngredientOptionSets(ingredientOptionSets);
      pageStats.alternativeIngredientExpansions += Math.max(0, ingredientVariants.length - 1);

      for (const ingredients of ingredientVariants) {
        if (ingredients.some((ingredient) => ingredient.ingredientGroupType === 'group')) {
          pageStats.groupIngredientRows += 1;
        }
        recipes.push({
          resultInternalName: resultItem.internalName,
          resultName: resultItem.name ?? resultName,
          resultQuantity: extractAmountFromResultCell(resultCell),
          versionScope,
          notes: null,
          sourceProvider: LIVE_RECIPE_PROVIDER,
          sourcePage: categoryPage.pageTitle,
          sourceRevisionTimestamp: sourceMeta.sourceRevisionTimestamp ?? null,
          sourceContextPage: categoryPage.pageTitle,
          sourceContextPageSlug: categoryPage.pageSlug,
          sourceContextDisplayName: categoryPage.displayCategoryName,
          sourceContextUrl: categoryPage.pageUrl,
          sourceContextRevisionId: sourceMeta.sourceContextRevisionId ?? null,
          sourceFetchedAt: sourceMeta.sourceFetchedAt ?? null,
          ingredients,
          stations: stations.map((station) => ({ ...station }))
        });
      }
    }
  }

  const importKeyCount = new Set(recipes.map((recipe) => buildAuditRecipeKey(recipe))).size;
  pageStats.importKeyRecipeRows = importKeyCount;
  pageStats.uniqueResultItems = uniqueResultItems.size;

  return {
    recipes,
    pageStats
  };
}

function resolveOptions(rawOptions) {
  const generatedDir = path.join(repoRoot, 'data', 'generated');
  const pages = String(rawOptions.pages ?? rawOptions['source-pages'] ?? '')
    .split(',')
    .map((value) => normalizeRecipeMaterialLabel(decodeHtmlEntities(value)))
    .filter(Boolean);
  return {
    itemsPath: path.resolve(rawOptions.items ?? path.join(sharedDataRoot, 'normalized', 'items.wiki.json')),
    outputPath: path.resolve(rawOptions.output ?? path.join(generatedDir, 'recipe-material-reference.json')),
    manifestPath: path.resolve(rawOptions['manifest-output'] ?? path.join(generatedDir, 'live-recipe-source-manifest.latest.json')),
    pageStatsPath: path.resolve(rawOptions['page-stats-output'] ?? path.join(generatedDir, 'live-recipe-page-stats.latest.json')),
    reconciliationPath: path.resolve(rawOptions['reconciliation-output'] ?? path.join(generatedDir, 'live-recipe-reconciliation.latest.json')),
    pages: new Set(pages)
  };
}

async function buildItemLookup(items) {
  const byName = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    rememberLookup(byName, item?.internalName, item);
    rememberLookup(byName, item?.name, item);
    rememberLookup(byName, item?.nameZh, item);
  }

  const config = loadLocalStackConfig(repoRoot);
  try {
    const conn = await mysql.createConnection({
      host: process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
      port: Number(process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 3306),
      user: process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
      password: process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
      database: process.env.TERRAPEDIA_DB_NAME ?? config.database?.name ?? 'terria_v1_local'
    });
    const [rows] = await conn.query('SELECT id, internal_name AS internalName, name, name_zh AS nameZh FROM items WHERE deleted = 0');
    await conn.end();
    for (const row of rows) {
      rememberLookup(byName, row?.internalName, row);
      rememberLookup(byName, row?.name, row);
      rememberLookup(byName, row?.nameZh, row);
    }
  } catch {
    // Keep file-only lookup when DB is unavailable.
  }

  return { byName };
}

function buildSourceManifest(homePage, discoveredCategoryPages, selectedCategoryPages) {
  return {
    generatedAt: new Date().toISOString(),
    sourceType: RECIPE_SOURCE_TYPE,
    homePageUrl: RECIPE_HOME_PAGE_URL,
    homePageTitle: homePage.pageTitle,
    homeRevisionId: homePage.revisionId,
    homeRevisionTimestamp: homePage.revisionTimestamp,
    sourceSection: RECIPE_HOME_SECTION,
    categoryPageCount: discoveredCategoryPages.length,
    selectedCategoryPageCount: selectedCategoryPages.length,
    categoryPages: discoveredCategoryPages,
    selectedCategoryPages: selectedCategoryPages.map((page) => page.pageTitle)
  };
}

function buildPageStat(categoryPage, payload, pageResult) {
  return {
    slug: categoryPage.pageSlug,
    displayName: categoryPage.displayCategoryName,
    pageTitle: categoryPage.pageTitle,
    pageUrl: categoryPage.pageUrl,
    revisionId: payload.revisionId ?? null,
    revisionTimestamp: payload.revisionTimestamp ?? null,
    fetchStatus: 'ok',
    httpStatus: 200,
    attemptedAt: payload.fetchedAt ?? new Date().toISOString(),
    ...pageResult.pageStats
  };
}

function buildFailedPageStat(categoryPage, message) {
  return {
    slug: categoryPage.pageSlug,
    displayName: categoryPage.displayCategoryName,
    pageTitle: categoryPage.pageTitle,
    pageUrl: categoryPage.pageUrl,
    revisionId: null,
    revisionTimestamp: null,
    fetchStatus: 'failed',
    httpStatus: null,
    attemptedAt: new Date().toISOString(),
    recipeTableCount: 0,
    tableCaptions: [],
    rawRecipeRows: 0,
    importKeyRecipeRows: 0,
    uniqueResultItems: 0,
    groupIngredientRows: 0,
    alternativeIngredientExpansions: 0,
    versionScopedRows: 0,
    hasUnexpectedLayout: false,
    errorMessage: message
  };
}

function buildSourceSnapshot(categoryPage, payload, pageResult) {
  return {
    sourceRole: PAGE_SOURCE_KIND,
    pageTitle: categoryPage.pageTitle,
    displayName: categoryPage.displayCategoryName,
    pageUrl: categoryPage.pageUrl,
    revisionId: payload.revisionId ?? null,
    revisionTimestamp: payload.revisionTimestamp ?? null,
    fetchedAt: payload.fetchedAt ?? null,
    status: 'ok',
    recipeCount: pageResult.pageStats.importKeyRecipeRows,
    resultItemCount: pageResult.pageStats.uniqueResultItems,
    tableCaptions: pageResult.pageStats.tableCaptions
  };
}

async function buildLiveRecipeReconciliation({ categoryPages, dedupedRecipes, groups, pageStats, skippedRecipeSourcePages }) {
  const missingPages = pageStats
    .filter((page) => page.fetchStatus !== 'ok' || page.recipeTableCount === 0 || page.rawRecipeRows === 0)
    .map((page) => page.pageTitle);
  const ambiguousGroups = groups
    .filter((group) => !Array.isArray(group.members) || group.members.length === 0)
    .map((group) => group.canonicalName);
  const pageCountByResult = new Map();
  for (const recipe of dedupedRecipes) {
    const key = recipe.resultInternalName ?? recipe.resultName ?? '';
    if (!key) {
      continue;
    }
    const bucket = pageCountByResult.get(key) ?? new Set();
    bucket.add(recipe.sourceContextPageSlug ?? recipe.sourceContextPage ?? 'unknown');
    pageCountByResult.set(key, bucket);
  }
  return {
    generatedAt: new Date().toISOString(),
    sourceType: RECIPE_SOURCE_TYPE,
    categoryPageCount: categoryPages.length,
    fetchedPageCount: pageStats.filter((page) => page.fetchStatus === 'ok').length,
    missingPageCount: Array.isArray(skippedRecipeSourcePages) ? skippedRecipeSourcePages.length : missingPages.length,
    rawRecipeRows: pageStats.reduce((sum, page) => sum + Number(page.rawRecipeRows ?? 0), 0),
    importKeyRecipeRows: new Set(dedupedRecipes.map((recipe) => buildAuditRecipeKey(recipe))).size,
    uniqueResultItems: pageCountByResult.size,
    groups: groups.length,
    ambiguousGroups,
    missingPages: Array.isArray(skippedRecipeSourcePages)
      ? skippedRecipeSourcePages.map((page) => page.sourcePage)
      : missingPages,
    duplicateRecipeKeys: summarizeDuplicateRecipeKeys(dedupedRecipes),
    missingResultItems: []
  };
}

function toSourceMeta(payload) {
  return {
    sourceContextPage: payload?.pageTitle ?? payload?.requestedPageTitle ?? null,
    sourceContextUrl: payload?.url ?? null,
    sourceContextRevisionId: payload?.revisionId ?? null,
    sourceRevisionTimestamp: payload?.revisionTimestamp ?? null,
    sourceFetchedAt: payload?.fetchedAt ?? null
  };
}

function rememberLookup(byName, value, item) {
  const key = normalizeLookupKey(value);
  if (!key || byName.has(key)) {
    return;
  }
  byName.set(key, item);
}

function resolveItemByAnyName(itemLookup, value) {
  const key = normalizeLookupKey(value);
  return key ? (itemLookup.byName.get(key) ?? null) : null;
}

function normalizeLookupKey(value) {
  const text = normalizeRecipeMaterialLabel(value);
  return text ? text.toLowerCase() : '';
}

function normalizeRecipePageSlug(pageTitle) {
  return String(pageTitle ?? '')
    .replace(/^Recipes\//i, '')
    .trim()
    .replace(/\s+/g, '_');
}

function extractHtmlCellByClass(rowHtml, className) {
  const pattern = new RegExp(`<td\\b[^>]*class="[^"]*${className}[^"]*"[^>]*>([\\s\\S]*?)<\\/td>`, 'i');
  return rowHtml.match(pattern)?.[1] ?? null;
}

function extractFirstLinkedTitle(html) {
  return extractAllLinkedTitles(html)[0] ?? null;
}

function extractAllLinkedTitles(html) {
  return [...new Set(
    [...String(html ?? '').matchAll(/<a\b[^>]*title="([^"]+)"/gi)]
      .map((match) => normalizeRecipeMaterialLabel(decodeHtmlEntities(match[1])))
      .filter(Boolean)
  )];
}

function extractAmountFromResultCell(resultCell) {
  const quantity = parseAmount(stripHtml(resultCell.match(/<span class="am">([\s\S]*?)<\/span>/i)?.[1] ?? ''));
  return quantity.min ?? 1;
}

function parseRecipeIngredientOptions(liHtml, sortOrder, itemLookup) {
  const quantity = parseAmount(stripHtml(liHtml.match(/<span class="am">([\s\S]*?)<\/span>/i)?.[1] ?? ''));
  const linkedTitles = [...new Set(
    extractAllLinkedTitles(liHtml)
      .map((title) => normalizeRecipeMaterialLabel(title))
      .filter(Boolean)
  )];
  const rawText = normalizeRecipeMaterialLabel(stripHtml(liHtml));
  const hasAlternative = hasFiniteAlternativeSeparator(rawText);

  if (linkedTitles.length > 1 && hasAlternative && linkedTitles.every((title) => !isRecipeGroupName(title))) {
    return linkedTitles
      .map((title) => buildIngredientEntry(title, quantity, sortOrder, itemLookup))
      .filter(Boolean);
  }

  const primaryName = canonicalizeIngredientName(linkedTitles[0] ?? rawText);
  if (!primaryName) {
    return [];
  }

  const ingredient = buildIngredientEntry(primaryName, quantity, sortOrder, itemLookup);
  return ingredient ? [ingredient] : [];
}

function canonicalizeIngredientName(value) {
  const text = normalizeRecipeMaterialLabel(value);
  if (!text) {
    return null;
  }
  return isRecipeGroupName(text) ? canonicalizeRecipeGroupName(text) : text;
}

function buildIngredientEntry(name, quantity, sortOrder, itemLookup) {
  const canonicalName = canonicalizeIngredientName(name);
  if (!canonicalName) {
    return null;
  }
  if (isRecipeGroupName(canonicalName)) {
    return {
      ingredientInternalName: null,
      ingredientName: canonicalName,
      ingredientNameRaw: canonicalName,
      ingredientGroupType: 'group',
      quantityMin: quantity.min,
      quantityMax: quantity.max,
      quantityText: quantity.text,
      sortOrder
    };
  }
  const resolved = resolveItemByAnyName(itemLookup, canonicalName);
  return {
    ingredientInternalName: resolved?.internalName ?? null,
    ingredientName: resolved?.name ?? canonicalName,
    ingredientNameRaw: resolved?.nameZh ?? canonicalName,
    ingredientGroupType: 'item',
    quantityMin: quantity.min,
    quantityMax: quantity.max,
    quantityText: quantity.text,
    sortOrder
  };
}

function expandIngredientOptionSets(optionSets) {
  if (!Array.isArray(optionSets) || optionSets.length === 0) {
    return [];
  }

  let variants = [[]];
  for (const [ingredientIndex, options] of optionSets.entries()) {
    const nextVariants = [];
    for (const variant of variants) {
      for (const option of options) {
        nextVariants.push([
          ...variant,
          {
            ...option,
            sortOrder: ingredientIndex
          }
        ]);
      }
    }
    variants = nextVariants;
  }
  return variants;
}

function parseEnglishVersionScope(resultCell) {
  const versionNoteHtml = resultCell.match(/<div class="version-note[^"]*">([\s\S]*?)<\/div>/i)?.[1] ?? '';
  if (!versionNoteHtml) {
    return null;
  }
  const normalized = stripHtml(
    decodeHtmlEntities(versionNoteHtml)
      .replace(/Desktop(?:, Console and Mobile)? versions?/gi, 'Desktop version Console version Mobile version')
      .replace(/Desktop, Console and Mobile versions?/gi, 'Desktop version Console version Mobile version')
      .replace(/Desktop and Mobile versions?/gi, 'Desktop version Mobile version')
      .replace(/Desktop version/gi, 'Desktop version')
      .replace(/Console version/gi, 'Console version')
      .replace(/Mobile version/gi, 'Mobile version')
      .replace(/Old-gen console version/gi, 'Old-gen console version')
      .replace(/Nintendo 3DS version/gi, 'Nintendo 3DS version')
  );
  if (!normalized) {
    return null;
  }
  const labels = [];
  if (/desktop/i.test(normalized)) labels.push('Desktop version');
  if (/console/i.test(normalized)) labels.push('Console version');
  if (/mobile/i.test(normalized)) labels.push('Mobile version');
  if (/old-gen/i.test(normalized)) labels.push('Old-gen console version');
  if (/3ds/i.test(normalized)) labels.push('Nintendo 3DS version');
  return labels.length === 0 ? normalized : `${labels.join(' ')} only`;
}

function parseAmount(value) {
  const text = normalizeRecipeMaterialLabel(value);
  if (!text) {
    return { min: null, max: null, text: null };
  }
  const rangeMatch = text.match(/(\d+)\s*[–-]\s*(\d+)/);
  if (rangeMatch) {
    return { min: Number(rangeMatch[1]), max: Number(rangeMatch[2]), text };
  }
  const singleMatch = text.match(/^(\d+)$/);
  if (singleMatch) {
    const amount = Number(singleMatch[1]);
    return { min: amount, max: amount, text };
  }
  return { min: null, max: null, text };
}

function dedupeMembers(members) {
  const seen = new Set();
  return members.filter((member) => {
    const key = [
      member.internalName ?? '',
      member.name ?? '',
      member.nameZh ?? ''
    ].join('|');
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function mergeRecipeGroups(groups) {
  const merged = new Map();
  for (const group of Array.isArray(groups) ? groups : []) {
    const canonicalName = canonicalizeRecipeGroupName(group?.canonicalName) ?? normalizeRecipeMaterialLabel(group?.canonicalName);
    if (!canonicalName) {
      continue;
    }
    const existing = merged.get(canonicalName);
    if (!existing) {
      merged.set(canonicalName, {
        canonicalName,
        displayNameEn: group?.displayNameEn ?? canonicalName,
        displayNameZh: group?.displayNameZh ?? getRecipeGroupDisplayNameZh(canonicalName),
        members: dedupeMembers(group?.members ?? [])
      });
      continue;
    }
    existing.displayNameZh = existing.displayNameZh ?? group?.displayNameZh ?? getRecipeGroupDisplayNameZh(canonicalName);
    existing.members = dedupeMembers([...(existing.members ?? []), ...(group?.members ?? [])]);
  }
  return [...merged.values()].sort((left, right) => left.canonicalName.localeCompare(right.canonicalName));
}

function dedupeSupplementalRecipes(recipes) {
  const seen = new Set();
  return recipes.filter((recipe) => {
    const key = buildAuditRecipeKey(recipe);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function summarizeDuplicateRecipeKeys(recipes) {
  const counts = new Map();
  for (const recipe of recipes) {
    const key = buildAuditRecipeKey(recipe);
    counts.set(key, Number(counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }));
}

function mergeRecipesBySelectedPages(existingRecipes, nextRecipes, selectedPages) {
  const selected = new Set([...selectedPages].map((value) => normalizeRecipeMaterialLabel(value)));
  const preserved = (Array.isArray(existingRecipes) ? existingRecipes : []).filter((recipe) => {
    const page = normalizeRecipeMaterialLabel(recipe?.sourceContextPage);
    return !page || !selected.has(page);
  });
  return dedupeSupplementalRecipes([...preserved, ...(Array.isArray(nextRecipes) ? nextRecipes : [])]);
}

function mergeSnapshotsBySelectedPages(existingSnapshots, nextSnapshots, selectedPages) {
  const selected = new Set([...selectedPages].map((value) => normalizeRecipeMaterialLabel(value)));
  const preserved = (Array.isArray(existingSnapshots) ? existingSnapshots : []).filter((snapshot) => {
    const page = normalizeRecipeMaterialLabel(snapshot?.pageTitle);
    return !page || !selected.has(page);
  });
  return dedupeBy([...preserved, ...(Array.isArray(nextSnapshots) ? nextSnapshots : [])], (snapshot) => snapshot?.pageTitle ?? snapshot?.sourceUrl ?? '')
    .sort((left, right) => String(left.pageTitle ?? '').localeCompare(String(right.pageTitle ?? '')));
}

function mergeSkippedPages(existingSkippedPages, nextSkippedPages, selectedPages) {
  const selected = new Set([...selectedPages].map((value) => normalizeRecipeMaterialLabel(value)));
  const preserved = (Array.isArray(existingSkippedPages) ? existingSkippedPages : []).filter((page) => {
    const pageTitle = normalizeRecipeMaterialLabel(page?.sourcePage);
    return !pageTitle || !selected.has(pageTitle);
  });
  return dedupeBy([...preserved, ...(Array.isArray(nextSkippedPages) ? nextSkippedPages : [])], (page) => page?.sourcePage ?? page?.sourceUrl ?? '')
    .sort((left, right) => String(left.sourcePage ?? '').localeCompare(String(right.sourcePage ?? '')));
}

function mergePageStatsBySelectedPages(existingPages, nextPages, selectedPages) {
  const selected = new Set([...selectedPages].map((value) => normalizeRecipeMaterialLabel(value)));
  const preserved = (Array.isArray(existingPages) ? existingPages : []).filter((page) => {
    const pageTitle = normalizeRecipeMaterialLabel(page?.pageTitle);
    return !pageTitle || !selected.has(pageTitle);
  });
  return dedupeBy([...preserved, ...(Array.isArray(nextPages) ? nextPages : [])], (page) => page?.pageTitle ?? page?.pageUrl ?? '')
    .sort((left, right) => String(left.pageTitle ?? '').localeCompare(String(right.pageTitle ?? '')));
}

export function buildAuditRecipeKey(recipe) {
  return [
    recipe?.resultInternalName ?? recipe?.resultName ?? '',
    normalizeSourceContextPageKey(recipe?.sourceContextPageSlug ?? recipe?.sourceContextPage ?? recipe?.sourcePage),
    normalizeRecipeMaterialLabel(recipe?.versionScope) ?? '',
    buildIngredientSignature(recipe?.ingredients),
    buildStationSignature(recipe?.stations)
  ].join('|');
}

function buildIngredientSignature(ingredients) {
  return (Array.isArray(ingredients) ? ingredients : [])
    .map((ingredient) => [
      ingredient?.ingredientInternalName ?? '',
      ingredient?.ingredientInternalName ? '' : (ingredient?.ingredientNameRaw ?? ''),
      ingredient?.ingredientGroupType ?? '',
      ingredient?.quantityText ?? '',
      ingredient?.quantityMin ?? '',
      ingredient?.quantityMax ?? ''
    ].join('~'))
    .join('||');
}

function buildStationSignature(stations) {
  return (Array.isArray(stations) ? stations : [])
    .map((station) => [
      station?.stationInternalName ?? '',
      station?.stationInternalName ? '' : (station?.stationNameRaw ?? ''),
      station?.isAlternative ? '1' : '0'
    ].join('~'))
    .join('||');
}

function inferStationRequirementMode(markup, stationTitles) {
  if (!Array.isArray(stationTitles) || stationTitles.length <= 1) {
    return 'single';
  }

  const text = normalizeRecipeMaterialLabel(stripHtml(markup))?.toLowerCase() ?? '';
  if (!text) {
    return 'alternative';
  }

  if (
    /(^|[\s(])and([\s):]|$)/i.test(text)
    || text.includes('同时')
    || text.includes('并且')
    || text.includes('以及')
    || text.includes('且')
    || text.includes('和')
  ) {
    return 'combination';
  }

  return 'alternative';
}

function dedupeBy(values, keySelector) {
  const seen = new Set();
  const result = [];
  for (const value of Array.isArray(values) ? values : []) {
    const key = keySelector(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }
  return result;
}

function normalizeSourceContextPageKey(value) {
  const text = normalizeRecipeMaterialLabel(decodeHtmlEntities(String(value ?? '')));
  if (!text) {
    return '';
  }
  return text
    .replace(/^Recipes\//i, '')
    .replace(/\s+/g, '_');
}

function isDirectExecution() {
  if (!process.argv[1]) {
    return false;
  }
  return path.resolve(process.argv[1]) === __filename;
}

if (isDirectExecution()) {
  const result = await generateRecipeMaterialReference(parseCliArgs(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
}
