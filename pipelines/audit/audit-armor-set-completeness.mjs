#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getProjectRoot } from '../lib/project-root.mjs';
import { parseCliArgs, writeJson } from '../lib/wiki-item-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = getProjectRoot();
const ARMOR_SUFFIX_RE = /\s+armor$/i;
const VARIANT_WORDS = [
  'hood',
  'hat',
  'helmet',
  'mask',
  'headgear',
  'headpiece',
  'head',
  'crown'
];

export function buildArmorSetCompletenessReport({
  wikiArmorSets = [],
  armorSets = [],
  definitionMap = null,
  items = [],
  itemPages = [],
  generatedAt = new Date().toISOString()
} = {}) {
  const normalizedWikiRows = readRows(wikiArmorSets);
  const definitions = readRows(armorSets).map(normalizeDefinition);
  const definitionByTextKey = new Map(definitions.filter((row) => row.textKey).map((row) => [row.textKey, row]));
  const itemById = new Map(readRows(items).filter((row) => Number(row?.id) > 0).map((row) => [Number(row.id), row]));
  const itemRows = readRows(items);
  const itemPageRows = readRows(itemPages);
  const mapEntries = readDefinitionMapEntries(definitionMap);
  const issues = [];

  for (const wikiRow of normalizedWikiRows) {
    const pageTitle = firstText(wikiRow?.pageTitle, wikiRow?.page_title, wikiRow?.nameEn, wikiRow?.name);
    if (!pageTitle) {
      continue;
    }
    const pageFamily = normalizeFamily(pageTitle);
    const interchangeableSetTitles = normalizeStringArray(wikiRow?.interchangeableSetTitles ?? wikiRow?.interchangeable_set_titles);
    const familyTokens = new Set([
      pageFamily,
      ...interchangeableSetTitles.map(normalizeFamily)
    ].filter(Boolean));
    const pageVariantLabels = extractPageVariantLabels(wikiRow, itemRows);
    const nearbyItems = findNearbyArmorItems({ familyTokens, itemRows, itemPageRows });
    const mapped = findMappedDefinitions({
      mapEntries,
      wikiRow,
      pageFamily,
      definitionByTextKey,
      definitions
    });
    const siblingDefinitions = findSiblingDefinitions(definitions, pageFamily);
    const expectedDefinitions = siblingDefinitions.length > mapped.length ? siblingDefinitions : mapped;
    const mappedTextKeys = new Set(mapped.map((row) => row.textKey).filter(Boolean));
    const expectedTextKeys = new Set(expectedDefinitions.map((row) => row.textKey).filter(Boolean));
    const definitionVariantLabels = collectDefinitionVariantLabels(mapped, itemById);
    const expectedVariantLabels = collectDefinitionVariantLabels(expectedDefinitions, itemById);
    const placeholders = expectedDefinitions.flatMap((definition) => definition.uniqueItemIds.filter((id) => Number(id) <= 0));

    addSplitDefinitionIssue({
      issues,
      pageTitle,
      mappedTextKeys,
      expectedTextKeys,
      mapped,
      expectedDefinitions,
      mapEntries,
      pageFamily,
      placeholders
    });
    addPageVariantMissingIssue({
      issues,
      pageTitle,
      pageVariantLabels,
      expectedVariantLabels,
      definitionVariantLabels,
      placeholders
    });
    addDefinitionVariantMissingIssue({
      issues,
      pageTitle,
      pageVariantLabels,
      expectedVariantLabels
    });
    addUnexpectedNearbyItemIssue({
      issues,
      pageTitle,
      nearbyItems,
      expectedDefinitions,
      pageVariantLabels
    });
    addInterchangeableFamilyIssue({
      issues,
      pageTitle,
      interchangeableSetTitles,
      definitions,
      mappedTextKeys,
      familyTokens
    });
  }

  return {
    generatedAt,
    sourceTotals: {
      wikiArmorSets: normalizedWikiRows.length,
      armorDefinitions: definitions.length,
      definitionMapEntries: mapEntries.length,
      items: itemRows.length,
      itemPages: itemPageRows.length
    },
    issueCount: issues.length,
    issues
  };
}

export function normalizeArmorLabel(value) {
  return firstText(value)
    .replace(ARMOR_SUFFIX_RE, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function main(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);
  const paths = {
    wikiArmorSets: path.resolve(args.wiki ?? args['wiki-armor-sets'] ?? path.join(repoRoot, 'data/generated/wiki-armor-sets.latest.json')),
    armorSets: path.resolve(args.definitions ?? args['armor-sets'] ?? path.join(repoRoot, 'data/standardized/armor_sets.standardized.json')),
    definitionMap: path.resolve(args['definition-map'] ?? path.join(repoRoot, 'data/generated/armor-set-definition-map.json')),
    items: path.resolve(args.items ?? path.join(repoRoot, 'data/standardized/items.standardized.json')),
    itemPages: path.resolve(args['item-pages'] ?? path.join(repoRoot, 'data/standardized/item_pages.standardized.json'))
  };
  const report = buildArmorSetCompletenessReport({
    wikiArmorSets: readJsonRows(paths.wikiArmorSets),
    armorSets: readJsonRows(paths.armorSets),
    definitionMap: readJsonPayload(paths.definitionMap),
    items: readJsonRows(paths.items),
    itemPages: readJsonRows(paths.itemPages)
  });
  const payload = { ...report, inputPaths: paths };
  const outputPath = resolveOutputPath(args);
  if (outputPath) {
    writeJson(outputPath, payload);
  }
  console.log(JSON.stringify(payload, null, 2));
}

function addSplitDefinitionIssue({
  issues,
  pageTitle,
  mappedTextKeys,
  expectedTextKeys,
  mapped,
  expectedDefinitions,
  mapEntries,
  pageFamily,
  placeholders
}) {
  const missingTextKeys = [...expectedTextKeys].filter((key) => !mappedTextKeys.has(key)).sort();
  const hasPlaceholderMap = mapEntries.some((entry) => {
    const status = firstText(entry?.status).toLowerCase();
    return normalizeFamily(entry?.name ?? entry?.internalCode) === pageFamily
      && (status === 'placeholder' || status === 'mapped_manual');
  });
  if (missingTextKeys.length || placeholders.length || (hasPlaceholderMap && expectedDefinitions.length > mapped.length)) {
    issues.push({
      code: 'split_definition_not_mapped',
      severity: 'warning',
      pageTitle,
      mappedTextKeys: [...mappedTextKeys].sort(),
      expectedTextKeys: [...expectedTextKeys].sort(),
      missingTextKeys,
      placeholderItemIds: uniqueSortedNumbers(placeholders),
      note: 'Mapped definition set does not cover all sibling split definitions or contains placeholder item ids.'
    });
  }
}

function addPageVariantMissingIssue({
  issues,
  pageTitle,
  pageVariantLabels,
  expectedVariantLabels,
  definitionVariantLabels,
  placeholders
}) {
  const comparisonLabels = definitionVariantLabels.length ? definitionVariantLabels : expectedVariantLabels;
  const normalizedDefinitionLabels = new Set(comparisonLabels.map(normalizeArmorLabel));
  const labels = pageVariantLabels
    .filter((label) => !normalizedDefinitionLabels.has(normalizeArmorLabel(label)))
    .sort();
  if (labels.length || placeholders.length) {
    issues.push({
      code: 'page_variant_label_missing_from_definition',
      severity: 'warning',
      pageTitle,
      labels,
      placeholderItemIds: uniqueSortedNumbers(placeholders),
      note: 'Page mentions armor variants that are not represented by mapped definition item ids, or the definition uses placeholder ids.'
    });
  }
}

function addDefinitionVariantMissingIssue({ issues, pageTitle, pageVariantLabels, expectedVariantLabels }) {
  if (!pageVariantLabels.length || !expectedVariantLabels.length) {
    return;
  }
  const normalizedPageLabels = new Set(pageVariantLabels.map(normalizeArmorLabel));
  const labels = expectedVariantLabels
    .filter((label) => !normalizedPageLabels.has(normalizeArmorLabel(label)))
    .sort();
  if (labels.length) {
    issues.push({
      code: 'definition_variant_missing_from_page_labels',
      severity: 'info',
      pageTitle,
      labels,
      note: 'Definitions contain variant labels not directly present in the page effect labels.'
    });
  }
}

function addUnexpectedNearbyItemIssue({ issues, pageTitle, nearbyItems, expectedDefinitions, pageVariantLabels }) {
  const definitionItemIds = new Set(expectedDefinitions.flatMap((definition) => definition.uniqueItemIds).filter((id) => Number(id) > 0));
  const pageLabels = new Set(pageVariantLabels.map(normalizeArmorLabel));
  const unexpected = nearbyItems.filter((row) => {
    const id = Number(row?.id);
    if (!Number.isFinite(id) || definitionItemIds.has(id)) {
      return false;
    }
    return !pageLabels.has(normalizeArmorLabel(firstText(row?.name, row?.itemName, row?.pageTitle, row?.internalName)));
  });
  if (unexpected.length) {
    issues.push({
      code: 'unexpected_nearby_armor_item',
      severity: 'warning',
      pageTitle,
      itemIds: unexpected.map((row) => Number(row.id)).sort((a, b) => a - b),
      itemInternalNames: unexpected.map((row) => firstText(row?.internalName, row?.itemInternalName)).filter(Boolean).sort(),
      itemNames: unexpected.map((row) => firstText(row?.name, row?.itemName, row?.pageTitle)).filter(Boolean).sort(),
      note: 'Nearby same-family armor items exist but are not supported by page labels or selected definitions.'
    });
  }
}

function addInterchangeableFamilyIssue({ issues, pageTitle, interchangeableSetTitles, definitions, mappedTextKeys, familyTokens }) {
  if (!interchangeableSetTitles.length || !mappedTextKeys.size) {
    return;
  }
  const candidateDefinitions = definitions.filter((definition) => {
    if (!definition.textKey || mappedTextKeys.has(definition.textKey)) {
      return false;
    }
    const family = normalizeDefinitionFamily(definition.textKey);
    return familyTokens.has(family);
  });
  const missingTextKeys = candidateDefinitions.map((definition) => definition.textKey).sort();
  if (missingTextKeys.length) {
    issues.push({
      code: 'interchangeable_family_not_collapsed',
      severity: 'warning',
      pageTitle,
      interchangeableSetTitles,
      missingTextKeys,
      note: 'The page declares interchangeable families, but mapped definitions do not include sibling family definitions.'
    });
  }
}

function findMappedDefinitions({ mapEntries, wikiRow, pageFamily, definitionByTextKey, definitions }) {
  const siblingDefinitions = findSiblingDefinitions(definitions, pageFamily);
  const siblingItemIds = new Set(siblingDefinitions.flatMap((definition) => definition.uniqueItemIds).filter((id) => Number(id) > 0));
  const pageNames = [
    wikiRow?.pageTitle,
    wikiRow?.page_title,
    wikiRow?.nameEn,
    wikiRow?.name_en,
    wikiRow?.nameZh,
    wikiRow?.name_zh,
    ...(Array.isArray(wikiRow?.interchangeableSetTitles) ? wikiRow.interchangeableSetTitles : [])
  ].map(normalizeFamily).filter(Boolean);
  const matchedMapEntries = mapEntries.filter((entry) => {
    const names = [entry?.name, entry?.internalCode, entry?.sourceKey, entry?.pageTitle].map(normalizeFamily);
    const entryItemIds = uniqueSortedNumbers(entry?.itemIds ?? entry?.item_ids ?? entry?.definition?.uniqueItemIds);
    const status = firstText(entry?.status).toLowerCase();
    const overlapsSiblingDefinition = ['placeholder', 'mapped_manual'].includes(status)
      && entryItemIds.some((id) => siblingItemIds.has(id));
    return names.some((name) => pageNames.includes(name))
      || overlapsSiblingDefinition;
  });
  const textKeys = new Set();
  for (const entry of matchedMapEntries) {
    const textKey = firstText(entry?.definition?.textKey, entry?.textKey);
    if (textKey) {
      textKeys.add(textKey);
    }
    for (const candidate of readRows(entry?.candidates)) {
      const candidateKey = firstText(candidate?.textKey);
      if (candidateKey) {
        textKeys.add(candidateKey);
      }
    }
  }
  if (!textKeys.size) {
    for (const definition of definitions) {
      if (normalizeDefinitionExactFamily(definition.textKey) === pageFamily) {
        textKeys.add(definition.textKey);
      }
    }
  }
  return [...textKeys].map((key) => definitionByTextKey.get(key)).filter(Boolean);
}

function findSiblingDefinitions(definitions, pageFamily) {
  return definitions.filter((definition) => normalizeDefinitionFamily(definition.textKey) === pageFamily);
}

function extractPageVariantLabels(wikiRow, itemRows) {
  const rawText = [
    wikiRow?.effectText,
    wikiRow?.effect_text,
    wikiRow?.setBonusText,
    wikiRow?.set_bonus_text
  ].filter(Boolean).join('\n');
  const labels = new Set();
  for (const itemName of normalizeStringArray(wikiRow?.itemNames ?? wikiRow?.items?.map?.((item) => item?.nameEn ?? item?.name))) {
    if (hasVariantWord(itemName)) {
      labels.add(firstText(itemName));
    }
  }
  for (const item of itemRows) {
    const name = firstText(item?.name, item?.itemName, item?.pageTitle);
    if (name && hasVariantWord(name) && rawText.toLowerCase().includes(name.toLowerCase())) {
      labels.add(name);
    }
  }
  for (const line of rawText.split(/\r?\n/)) {
    const label = firstText(line.split(/[:：]/)[0]);
    if (hasVariantWord(label)) {
      labels.add(label);
    }
  }
  return [...labels].sort();
}

function collectDefinitionVariantLabels(definitions, itemById) {
  const labels = new Set();
  for (const definition of definitions) {
    for (const id of definition.uniqueItemIds) {
      const item = itemById.get(Number(id));
      const label = firstText(item?.name, item?.itemName, item?.pageTitle, item?.internalName);
      if (label && hasVariantWord(label)) {
        labels.add(label);
      }
    }
  }
  return [...labels].sort();
}

function findNearbyArmorItems({ familyTokens, itemRows, itemPageRows }) {
  const pageTitleByInternalName = new Map(itemPageRows.map((row) => [
    firstText(row?.itemInternalName, row?.internalName),
    firstText(row?.pageTitle, row?.itemName)
  ]));
  return itemRows.filter((row) => {
    const label = firstText(row?.name, row?.itemName, row?.pageTitle, pageTitleByInternalName.get(firstText(row?.internalName)));
    if (!label || !hasVariantWord(label)) {
      return false;
    }
    const family = normalizeItemFamily(label);
    return familyTokens.has(family);
  });
}

function normalizeDefinition(row) {
  return {
    ...row,
    textKey: firstText(row?.textKey, row?.text_key),
    benefitExpression: firstText(row?.benefitExpression, row?.benefit_expression),
    sets: readRows(row?.sets ?? parseJsonArray(row?.setsJson ?? row?.sets_json)),
    uniqueItemIds: uniqueSortedNumbers(row?.uniqueItemIds ?? row?.unique_item_ids ?? parseJsonArray(row?.uniqueItemIdsJson ?? row?.unique_item_ids_json))
  };
}

function readDefinitionMapEntries(payload) {
  const records = payload?.records ?? payload;
  if (Array.isArray(records)) {
    return records;
  }
  if (records && typeof records === 'object') {
    return Object.values(records);
  }
  return [];
}

function readJsonRows(filePath) {
  return readRows(readJsonPayload(filePath));
}

function readJsonPayload(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readRows(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.records)) {
    return payload.records;
  }
  if (Array.isArray(payload?.data)) {
    return payload.data;
  }
  if (Array.isArray(payload?.items)) {
    return payload.items;
  }
  if (Array.isArray(payload?.armorSets)) {
    return payload.armorSets;
  }
  return [];
}

function normalizeDefinitionFamily(textKey) {
  const tail = firstText(textKey).split('.').at(-1) ?? '';
  const withoutRole = tail.replace(/(Summoner|Caster|Melee|Ranged|Magic|Mage|Ranger|Warrior)$/i, '');
  return normalizeCamelFamily(withoutRole);
}

function normalizeDefinitionExactFamily(textKey) {
  const tail = firstText(textKey).split('.').at(-1) ?? '';
  return normalizeCamelFamily(tail);
}

function normalizeFamily(value) {
  return normalizeArmorLabel(value);
}

function normalizeItemFamily(value) {
  let label = normalizeArmorLabel(value);
  for (const word of VARIANT_WORDS) {
    label = label.replace(new RegExp(`\\s+${word}$`, 'i'), '');
  }
  return label.trim();
}

function normalizeCamelFamily(value) {
  return firstText(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function hasVariantWord(value) {
  const text = normalizeArmorLabel(value);
  return VARIANT_WORDS.some((word) => new RegExp(`(^|\\s)${word}(\\s|$)`, 'i').test(text));
}

function normalizeStringArray(value) {
  return readRows(value).map(firstText).filter(Boolean);
}

function parseJsonArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value == null || value === '') {
    return [];
  }
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function uniqueSortedNumbers(values) {
  return [...new Set(readRows(values).map(Number).filter((value) => Number.isFinite(value)))].sort((a, b) => a - b);
}

function firstText(...values) {
  for (const value of values.flat()) {
    if (value == null) {
      continue;
    }
    const text = String(value).trim();
    if (text) {
      return text;
    }
  }
  return '';
}

function resolveOutputPath(args) {
  if (args.output) {
    return path.resolve(args.output);
  }
  if (args.date) {
    return path.join(repoRoot, 'reports/domain/armor_sets', `completeness-${args.date}.json`);
  }
  return null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
