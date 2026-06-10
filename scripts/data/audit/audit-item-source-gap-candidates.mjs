import fs from 'node:fs';
import path from 'node:path';

import {
  extractDropSourcesFromHtml,
  extractIntroParagraphs,
  extractNarrativeSources,
  extractTypeRowSourcesFromHtml,
  extractVendorSourcesFromWikitext,
  parseRecipeTable,
  normalizeText
} from '../lib/wiki-page-utils.mjs';
import {
  numericOption,
  parseCliArgs,
  sharedDataPath,
  writeJson
} from '../lib/wiki-item-utils.mjs';

const MUTATION_FLAGS = new Set(['apply', 'write-db', 'sync']);

export function parseAuditItemSourceGapCandidatesArgs(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  for (const [key, value] of Object.entries(options)) {
    if (MUTATION_FLAGS.has(key) && value !== false && value !== 'false') {
      throw new Error(`read-only audit refuses mutation flag: --${key}`);
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
    outputPath: options.output ?? null
  };
}

export function auditItemSourceGapCandidates({
  rawItemPageDir = '/home/lolben/data/terraPedia/raw/wiki/item-pages',
  npcParsedPath = sharedDataPath('raw', 'wiki', 'module__npcinfo__data.parsed.latest.json'),
  standardizedNpcsPath = path.join(process.cwd(), 'data', 'standardized', 'npcs.standardized.json'),
  standardizedItemsPath = path.join(process.cwd(), 'data', 'standardized', 'items.standardized.json'),
  itemSourcesDir = path.join(process.cwd(), 'data', 'standardized-view', 'item_relations', 'itemSources'),
  npcLookup = null,
  sample = null,
  limit = null
} = {}) {
  const items = loadStandardizedItems(standardizedItemsPath);
  npcLookup ??= loadNpcLookup(npcParsedPath, standardizedNpcsPath);
  const itemByInternalName = new Map(items.map((item) => [normalizeIdentity(item.internalName), item]));
  const itemByName = new Map(items.map((item) => [normalizeIdentity(item.name), item]).filter(([key]) => key));
  const sourceCountsByItem = loadItemSourceCounts(itemSourcesDir);
  const sampleKey = normalizeIdentity(sample);

  const files = fs.existsSync(rawItemPageDir)
    ? fs.readdirSync(rawItemPageDir).filter((name) => name.endsWith('.latest.json')).sort()
    : [];
  const candidates = [];
  const inspected = [];
  let parsedRawItemPages = 0;
  let rawPagesWithExtractedSources = 0;
  let candidateSourceRows = 0;

  for (const fileName of files) {
    const rawPath = path.join(rawItemPageDir, fileName);
    const payload = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
    parsedRawItemPages += 1;
    const item = itemByInternalName.get(normalizeIdentity(payload.itemInternalName))
      ?? itemByName.get(normalizeIdentity(payload.itemName));
    const internalName = normalizeText(item?.internalName ?? payload.itemInternalName);
    if (!internalName) {
      continue;
    }
    if (sampleKey && sampleKey !== normalizeIdentity(internalName) && sampleKey !== normalizeIdentity(item?.name ?? payload.itemName)) {
      continue;
    }

    inspected.push(internalName);
    const extractedSources = extractSourcesFromRawPayload(payload, npcLookup);
    const extractedRecipes = parseRecipeTable(payload.html);
    if (extractedSources.length > 0) {
      rawPagesWithExtractedSources += 1;
    }
    const standardizedSourceCount = sourceCountsByItem.get(internalName) ?? 0;
    if (extractedSources.length > 0 && standardizedSourceCount === 0) {
      candidateSourceRows += extractedSources.length;
      candidates.push({
        itemInternalName: internalName,
        itemName: normalizeText(item?.name ?? payload.itemName),
        pageTitle: normalizeText(payload.pageTitle),
        rawPath,
        rawSourceCount: extractedSources.length,
        standardizedSourceCount,
        classification: classifyCandidate(payload, extractedSources),
        extractedSources,
        extractedRecipes,
        sourceRevisionTimestamp: payload.revisionTimestamp ?? null
      });
    }

    if (Number.isFinite(limit) && limit > 0 && candidates.length >= limit) {
      break;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    inputs: {
      rawItemPageDir,
      npcParsedPath,
      standardizedNpcsPath,
      standardizedItemsPath,
      itemSourcesDir,
      sample,
      limit
    },
    parsedRawItemPages,
    inspectedRawPages: inspected.length,
    rawPagesWithExtractedSources,
    totalCandidates: candidates.length,
    rawExtractedButStandardizedZeroCandidates: candidates.length,
    candidateSourceRows,
    classificationCounts: countBy(candidates, (candidate) => candidate.classification),
    candidates
  };
}

function extractSourcesFromRawPayload(payload, npcLookup) {
  const introParagraphs = extractIntroParagraphs(payload.html);
  const sources = [
    ...extractVendorSourcesFromWikitext(payload.wikitext),
    ...extractDropSourcesFromHtml(payload.html, npcLookup),
    ...extractTypeRowSourcesFromHtml(payload.html),
    ...extractNarrativeSources(introParagraphs, payload.pageTitle)
  ];
  return dedupeBy(
    sources.map((source) => ({
      sourceType: source.sourceType,
      sourceRefType: source.sourceRefType,
      sourceRefName: source.sourceRefName,
      quantityText: source.quantityText ?? null,
      chanceText: source.chanceText ?? null,
      conditions: source.conditions ?? null,
      notes: source.notes ?? null,
      sourceSectionTitle: source.sourceSectionTitle ?? null,
      sourceRowText: source.sourceRowText ?? null,
      sourceTargetItemName: source.sourceTargetItemName ?? null
    })),
    (source) => `${source.sourceType}|${source.sourceRefType}|${source.sourceRefName}|${source.quantityText ?? ''}|${source.chanceText ?? ''}|${source.conditions ?? ''}|${source.sourceSectionTitle ?? ''}|${source.sourceRowText ?? ''}|${source.sourceTargetItemName ?? ''}`
  );
}

function classifyCandidate(payload, extractedSources) {
  if (extractedSources.some((source) => source.sourceRefType === 'unknown')) {
    return 'polluted_candidate';
  }

  const title = normalizeText(payload.pageTitle) ?? '';
  const itemName = normalizeText(payload.itemName) ?? '';
  if (title && itemName && isLikelyFamilyPageTitle(title, itemName)) {
    return 'family_page_candidate';
  }

  return 'high_confidence';
}

function isLikelyFamilyPageTitle(title, itemName) {
  const normalizedTitle = normalizeIdentity(title);
  const normalizedItemName = normalizeIdentity(itemName);
  if (!normalizedTitle || !normalizedItemName || normalizedTitle === normalizedItemName) {
    return false;
  }
  if (normalizedTitle === `${normalizedItemName}s` || normalizedTitle === pluralizeIdentity(normalizedItemName)) {
    return false;
  }
  return /(?:s|ies)$/.test(title.trim().toLowerCase());
}

function pluralizeIdentity(value) {
  if (value.endsWith('y')) {
    return `${value.slice(0, -1)}ies`;
  }
  return `${value}s`;
}

function loadStandardizedItems(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(payload?.records)
    ? payload.records
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload)
        ? payload
        : [];
}

function loadItemSourceCounts(dirPath) {
  const counts = new Map();
  if (!fs.existsSync(dirPath)) {
    return counts;
  }

  for (const fileName of fs.readdirSync(dirPath).filter((name) => name.endsWith('.json')).sort()) {
    const payload = JSON.parse(fs.readFileSync(path.join(dirPath, fileName), 'utf8'));
    const rows = Array.isArray(payload?.itemSources) ? payload.itemSources : Array.isArray(payload) ? payload : [];
    for (const row of rows) {
      const internalName = normalizeText(row.itemInternalName ?? row.item_internal_name);
      if (!internalName) continue;
      counts.set(internalName, (counts.get(internalName) ?? 0) + 1);
    }
  }
  return counts;
}

function loadNpcLookup(filePath, fallbackFilePath) {
  const lookup = new Map();
  const resolvedFilePath = fs.existsSync(filePath) ? filePath : fallbackFilePath;
  if (!fs.existsSync(resolvedFilePath)) {
    return lookup;
  }

  const payload = JSON.parse(fs.readFileSync(resolvedFilePath, 'utf8'));
  const npcs = Array.isArray(payload?.npcs)
    ? payload.npcs
    : Array.isArray(payload?.records)
      ? payload.records
      : Array.isArray(payload)
        ? payload
        : [];
  for (const npc of npcs) {
    const name = normalizeText(npc?.name);
    if (!name) continue;
    const meta = { boss: npc?.boss === true || npc?.boss === 1 || npc?.flags?.boss === true };
    lookup.set(name.toLowerCase(), meta);
    if (!name.toLowerCase().endsWith('s')) {
      lookup.set(`${name}s`.toLowerCase(), meta);
    }
  }
  return lookup;
}

function countBy(values, keySelector) {
  const counts = {};
  for (const value of values) {
    const key = keySelector(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function dedupeBy(values, keySelector) {
  const seen = new Set();
  return values.filter((value) => {
    const key = keySelector(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
    const options = parseAuditItemSourceGapCandidatesArgs();
    const outputPath = options.outputPath;
    const summary = auditItemSourceGapCandidates(options);
    if (outputPath) {
      writeJson(path.resolve(process.cwd(), outputPath), summary);
    }
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
