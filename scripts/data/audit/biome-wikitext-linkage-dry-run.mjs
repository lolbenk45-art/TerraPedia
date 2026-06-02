#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getProjectRoot } from '../lib/project-root.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = getProjectRoot();
const DEFAULT_API_URL = 'https://terraria.wiki.gg/api.php';
const DEFAULT_PAGES = ['Forest', 'Desert', 'Jungle', 'The Underworld', 'Snow biome'];
const CHARACTER_SECTION = 'Characters';
const ITEM_SECTIONS = new Set(['Unique Drops', 'Unique Treasures', 'For Sale']);

export function parseBiomeInfocardEntries({ biomeCode, pageTitle, wikitext }) {
  const text = stripComments(String(wikitext ?? ''));
  const tokens = tokenizeInfocard(text);
  const entries = [];
  let section = null;
  let source = null;

  for (const token of tokens) {
    if (token.type === 'mainheading') {
      section = cleanWikiText(token.value);
      source = null;
      continue;
    }
    if (token.type === 'box') {
      source = extractBoxTitle(token.value);
      continue;
    }
    if (token.type !== 'item' || !section) continue;
    if (section !== CHARACTER_SECTION && !ITEM_SECTIONS.has(section)) continue;

    const item = parseItemTemplate(token.value);
    if (!item.name) continue;
    entries.push({
      biomeCode: biomeCode ?? null,
      pageTitle: pageTitle ?? null,
      section,
      source,
      name: item.name,
      note: item.note,
      rawTemplate: token.raw
    });
  }

  return entries;
}

export function buildNameLookup(records, { entityType }) {
  const byName = new Map();
  for (const raw of Array.isArray(records) ? records : []) {
    const record = normalizeLookupRecord(raw, entityType);
    for (const value of [record.name, record.nameZh, record.internalName]) {
      const key = normalizeNameKey(value);
      if (!key) continue;
      const bucket = byName.get(key) ?? [];
      if (!bucket.some((entry) => String(entry.id) === String(record.id))) {
        bucket.push(record);
      }
      byName.set(key, bucket);
    }
  }
  return { entityType, byName };
}

export function buildBiomePageLookup(records) {
  const lookup = new Map();
  for (const raw of Array.isArray(records) ? records : []) {
    const code = normalizeBiomeCode(raw?.biomeCode ?? raw?.code);
    const pageTitle = toNullableText(raw?.pageTitle ?? raw?.title ?? raw?.nameEn ?? raw?.name_en);
    if (!code && !pageTitle) continue;
    const biome = { code: code ?? normalizeBiomeCode(pageTitle), pageTitle };
    for (const value of [code, pageTitle]) {
      const key = normalizeNameKey(value);
      if (key) lookup.set(key, biome);
    }
  }
  return lookup;
}

export function matchBiomeWikitextEntries({ biome, entries, itemLookup, npcLookup }) {
  const matchedEntries = entries.map((entry) => {
    const matchType = entry.section === CHARACTER_SECTION ? 'npc' : 'item';
    const lookup = matchType === 'npc' ? npcLookup : itemLookup;
    const matches = lookup?.byName?.get(normalizeNameKey(entry.name)) ?? [];
    const matchStatus = matches.length === 0 ? 'missing' : matches.length === 1 ? 'resolved' : 'ambiguous';
    return {
      ...entry,
      biomeCode: entry.biomeCode ?? biome?.code ?? null,
      pageTitle: entry.pageTitle ?? biome?.pageTitle ?? null,
      matchType,
      matchStatus,
      matches
    };
  });

  return {
    biome,
    summary: summarizeMatchedEntries(matchedEntries),
    entries: matchedEntries
  };
}

export function buildResolvedOnlyCandidates(results) {
  const itemBiomeCandidates = [];
  const npcBiomeCandidates = [];

  for (const result of Array.isArray(results) ? results : []) {
    for (const entry of result.entries ?? []) {
      if (entry.matchStatus !== 'resolved' || !Array.isArray(entry.matches) || entry.matches.length !== 1) continue;
      const match = entry.matches[0];
      if (entry.matchType === 'item') {
        itemBiomeCandidates.push({
          biomeCode: entry.biomeCode ?? result.biome?.code ?? null,
          itemInternalName: match.internalName ?? null,
          itemName: match.name ?? entry.name,
          relationType: inferItemBiomeRelationType(entry),
          source: entry.source,
          note: entry.note,
          sourcePage: entry.pageTitle ?? result.biome?.pageTitle ?? null
        });
      } else if (entry.matchType === 'npc') {
        npcBiomeCandidates.push({
          biomeCode: entry.biomeCode ?? result.biome?.code ?? null,
          npcInternalName: match.internalName ?? null,
          npcName: match.name ?? entry.name,
          source: entry.source,
          note: entry.note,
          sourcePage: entry.pageTitle ?? result.biome?.pageTitle ?? null
        });
      }
    }
  }

  return {
    summary: {
      total: itemBiomeCandidates.length + npcBiomeCandidates.length,
      itemBiomeCandidates: itemBiomeCandidates.length,
      npcBiomeCandidates: npcBiomeCandidates.length
    },
    itemBiomeCandidates,
    npcBiomeCandidates
  };
}

export function summarizeMatchedEntries(entries) {
  const summary = {
    totalEntries: entries.length,
    item: makeStatusBucket(),
    npc: makeStatusBucket(),
    bySection: {}
  };
  for (const entry of entries) {
    const bucket = summary[entry.matchType];
    if (bucket) {
      bucket.total += 1;
      bucket[entry.matchStatus] += 1;
    }
    const section = summary.bySection[entry.section] ?? makeStatusBucket();
    section.total += 1;
    section[entry.matchStatus] += 1;
    summary.bySection[entry.section] = section;
  }
  return summary;
}

function makeStatusBucket() {
  return { total: 0, resolved: 0, ambiguous: 0, missing: 0 };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const apiUrl = String(options['api-url'] ?? DEFAULT_API_URL);
  const pages = String(options.pages ?? DEFAULT_PAGES.join(','))
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const dateTag = new Date().toISOString().slice(0, 10);
  const outputPath = path.resolve(
    process.cwd(),
    options.output ?? path.join(repoRoot, 'reports', `biome-wikitext-linkage-dry-run-${dateTag}.json`)
  );

  const biomes = loadStandardizedRecords(path.join(repoRoot, 'data', 'standardized', 'biomes.standardized.json'), 'records');
  const items = loadStandardizedRecords(path.join(repoRoot, 'data', 'standardized', 'items.standardized.json'), 'records');
  const npcs = loadStandardizedRecords(path.join(repoRoot, 'data', 'standardized', 'npcs.standardized.json'), 'records');
  const biomeLookup = buildBiomePageLookup(biomes);
  const itemLookup = buildNameLookup(items, { entityType: 'item' });
  const npcLookup = buildNameLookup(npcs, { entityType: 'npc' });

  const results = [];
  for (const pageTitle of pages) {
    const payload = await fetchWikiWikitext({ apiUrl, pageTitle });
    const biome = biomeLookup.get(normalizeNameKey(payload.pageTitle))
      ?? biomeLookup.get(normalizeNameKey(pageTitle))
      ?? { code: normalizeBiomeCode(pageTitle), pageTitle: payload.pageTitle };
    const entries = parseBiomeInfocardEntries({
      biomeCode: biome.code,
      pageTitle: payload.pageTitle,
      wikitext: payload.wikitext
    });
    const result = matchBiomeWikitextEntries({ biome, entries, itemLookup, npcLookup });
    results.push({
      ...result,
      wiki: {
        requestedPageTitle: pageTitle,
        pageTitle: payload.pageTitle,
        pageId: payload.pageId,
        fetchedAt: payload.fetchedAt,
        sourceApi: apiUrl
      }
    });
  }

  const report = {
    entity: 'biome_wikitext_linkage_dry_run',
    generatedAt: new Date().toISOString(),
    sourceApi: apiUrl,
    pages,
    localSources: {
      biomes: 'data/standardized/biomes.standardized.json',
      items: 'data/standardized/items.standardized.json',
      npcs: 'data/standardized/npcs.standardized.json'
    },
    summary: summarizeResults(results),
    resolvedOnly: buildResolvedOnlyCandidates(results),
    results
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ outputPath, summary: report.summary }, null, 2));
}

function inferItemBiomeRelationType(entry) {
  if (entry.section === 'For Sale') return 'for_sale';
  const source = `${entry.source ?? ''} ${entry.note ?? ''}`;
  if (/fishing|angler/i.test(source)) return 'fishing';
  if (/terrain|vegetation|shaking|chest|treasure|crate|pot/i.test(source)) return 'resource';
  return 'drop';
}

function summarizeResults(results) {
  const summary = {
    biomeCount: results.length,
    totalEntries: 0,
    item: makeStatusBucket(),
    npc: makeStatusBucket(),
    byBiome: []
  };
  for (const result of results) {
    summary.totalEntries += result.summary.totalEntries;
    for (const type of ['item', 'npc']) {
      for (const key of ['total', 'resolved', 'ambiguous', 'missing']) {
        summary[type][key] += result.summary[type][key];
      }
    }
    summary.byBiome.push({
      code: result.biome?.code ?? null,
      pageTitle: result.wiki?.pageTitle ?? result.biome?.pageTitle ?? null,
      totalEntries: result.summary.totalEntries,
      item: result.summary.item,
      npc: result.summary.npc
    });
  }
  return summary;
}

async function fetchWikiWikitext({ apiUrl, pageTitle }) {
  const url = new URL(apiUrl);
  url.searchParams.set('action', 'parse');
  url.searchParams.set('page', pageTitle);
  url.searchParams.set('prop', 'wikitext');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('redirects', '1');
  const response = await fetch(url, {
    headers: { 'User-Agent': 'TerraPedia/2.0 biome-wikitext-linkage-dry-run' }
  });
  const body = await response.json();
  if (!response.ok || body.error) {
    throw new Error(`Wiki parse failed for ${pageTitle}: ${body.error?.info ?? response.status}`);
  }
  return {
    pageTitle: body.parse?.title ?? pageTitle,
    pageId: body.parse?.pageid ?? null,
    wikitext: String(body.parse?.wikitext ?? ''),
    fetchedAt: new Date().toISOString()
  };
}

function tokenizeInfocard(text) {
  const tokens = [];
  let index = 0;
  while (index < text.length) {
    const start = text.indexOf('{{', index);
    if (start < 0) break;
    const parsed = readTemplate(text, start);
    if (!parsed) {
      index = start + 2;
      continue;
    }
    const [name, ...args] = splitTemplateArgs(parsed.inner);
    const normalizedName = String(name ?? '').trim().toLowerCase();
    if (normalizedName === 'infocard/mainheading') {
      tokens.push({ type: 'mainheading', value: args.join('|'), raw: parsed.raw });
      index = parsed.end;
    } else if (normalizedName === 'infocard/box') {
      tokens.push({ type: 'box', value: args.join('|'), raw: parsed.raw });
      index = start + 2;
    } else if (normalizedName === 'item') {
      tokens.push({ type: 'item', value: args.join('|'), raw: parsed.raw });
      index = parsed.end;
    } else {
      index = start + 2;
    }
  }
  return tokens;
}

function readTemplate(text, start) {
  if (text.slice(start, start + 2) !== '{{') return null;
  let depth = 0;
  for (let index = start; index < text.length - 1; index += 1) {
    const pair = text.slice(index, index + 2);
    if (pair === '{{') {
      depth += 1;
      index += 1;
      continue;
    }
    if (pair === '}}') {
      depth -= 1;
      index += 1;
      if (depth === 0) {
        const end = index + 1;
        return {
          raw: text.slice(start, end),
          inner: text.slice(start + 2, end - 2),
          end
        };
      }
    }
  }
  return null;
}

function parseItemTemplate(raw) {
  const args = splitTemplateArgs(raw);
  const positional = [];
  const named = new Map();
  for (const arg of args) {
    const eq = arg.indexOf('=');
    if (eq > 0 && /^[a-zA-Z0-9_ -]+$/.test(arg.slice(0, eq).trim())) {
      named.set(arg.slice(0, eq).trim(), arg.slice(eq + 1).trim());
    } else {
      positional.push(arg);
    }
  }
  return {
    name: cleanWikiText(positional[positional.length - 1] ?? positional[0]),
    note: cleanWikiText(named.get('note2') ?? named.get('note')) || null
  };
}

function splitTemplateArgs(raw) {
  const args = [];
  let current = '';
  let curly = 0;
  let square = 0;
  for (let index = 0; index < String(raw ?? '').length; index += 1) {
    const char = raw[index];
    const pair = raw.slice(index, index + 2);
    if (pair === '{{') {
      curly += 1;
      current += pair;
      index += 1;
      continue;
    }
    if (pair === '}}') {
      curly = Math.max(0, curly - 1);
      current += pair;
      index += 1;
      continue;
    }
    if (pair === '[[') {
      square += 1;
      current += pair;
      index += 1;
      continue;
    }
    if (pair === ']]') {
      square = Math.max(0, square - 1);
      current += pair;
      index += 1;
      continue;
    }
    if (char === '|' && curly === 0 && square === 0) {
      args.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  args.push(current.trim());
  return args;
}

function extractBoxTitle(raw) {
  const args = splitTemplateArgs(raw);
  for (const arg of args) {
    const match = /^title\s*=\s*(.+)$/s.exec(arg);
    if (match) return cleanWikiText(match[1]);
  }
  return null;
}

function cleanWikiText(value) {
  const text = toNullableText(value);
  if (!text) return null;
  return text
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\{\{chance\|([^{}]+)\}\}/g, '$1')
    .replace(/\{\{expert\|([^{}]+)\}\}/g, '$1')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/:+$/g, '')
    .replace(/\s+/g, ' ')
    .trim() || null;
}

function stripComments(text) {
  return text.replace(/<!--|-->/g, '');
}

function normalizeLookupRecord(raw, entityType) {
  return {
    entityType,
    id: raw?.id ?? raw?.gameId ?? raw?.game_id ?? raw?.type ?? raw?.internalName ?? raw?.name,
    internalName: toNullableText(raw?.internalName ?? raw?.internal_name),
    name: toNullableText(raw?.name ?? raw?.nameEn ?? raw?.name_en),
    nameZh: toNullableText(raw?.nameZh ?? raw?.name_zh)
  };
}

function loadStandardizedRecords(filePath, fallbackKey) {
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.[fallbackKey])) return payload[fallbackKey];
  for (const key of ['records', 'items', 'npcs', 'biomes', 'data']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function parseCliArgs(argv) {
  const options = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, ...rest] = arg.slice(2).split('=');
    options[key] = rest.length > 0 ? rest.join('=') : true;
  }
  return options;
}

function normalizeNameKey(value) {
  return toNullableText(value)?.toLowerCase() ?? null;
}

function normalizeBiomeCode(value) {
  return toNullableText(value)
    ?.toLowerCase()
    .replace(/\bbiomes?\b/g, '')
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') ?? null;
}

function toNullableText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

if (process.argv[1] === __filename) {
  main().catch((error) => {
    console.error('[biome-wikitext-linkage-dry-run] failed');
    console.error(error);
    process.exitCode = 1;
  });
}
