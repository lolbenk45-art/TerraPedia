import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const itemsPath = path.join(repoRoot, 'data', 'standardized', 'items.standardized.json');

let itemLookupCache = null;

export function extractCategoryItemRecords(payload) {
  const itemLookup = loadItemLookup();
  const topLevel = normalizeText(payload?.topLevel);
  const templateTitle = normalizeText(payload?.templateTitle);
  const records = [];

  for (const section of Array.isArray(payload?.sections) ? payload.sections : []) {
    const sectionTitle = normalizeText(section?.title);
    for (const row of Array.isArray(section?.rows) ? section.rows : []) {
      const groupName = normalizeText(row?.group);
      for (const item of Array.isArray(row?.items) ? row.items : []) {
        flattenCategoryItemNode({
          node: item,
          topLevel,
          templateTitle,
          sectionTitle,
          groupName,
          parentItemName: null,
          depth: 0,
          records,
          itemLookup,
        });
      }
    }
  }

  return records;
}

function flattenCategoryItemNode(context) {
  const {
    node,
    topLevel,
    templateTitle,
    sectionTitle,
    groupName,
    parentItemName,
    depth,
    records,
    itemLookup,
  } = context;

  const itemName = normalizeText(node?.name);
  if (!itemName) {
    return;
  }

  const matchedItem = resolveItem(itemName, normalizeText(node?.href), itemLookup);
  const children = Array.isArray(node?.children) ? node.children : [];
  records.push({
    topLevel,
    templateTitle,
    sectionTitle,
    groupName,
    itemName,
    itemHref: normalizeText(node?.href),
    itemCount: Number(node?.itemCount ?? 0) || null,
    itemInternalName: matchedItem?.internalName ?? null,
    itemEnglishName: matchedItem?.name ?? itemName,
    parentItemName,
    depth,
    isGroupNode: children.length > 0,
  });

  for (const child of children) {
    flattenCategoryItemNode({
      node: child,
      topLevel,
      templateTitle,
      sectionTitle,
      groupName,
      parentItemName: itemName,
      depth: depth + 1,
      records,
      itemLookup,
    });
  }
}

function resolveItem(name, href, itemLookup) {
  const candidates = buildLookupCandidates(name, href);
  for (const key of candidates) {
    const matched = itemLookup.get(key);
    if (matched) {
      return matched;
    }
  }
  return null;
}

function loadItemLookup() {
  if (itemLookupCache) {
    return itemLookupCache;
  }
  const lookup = new Map();
  try {
    const payload = JSON.parse(fs.readFileSync(itemsPath, 'utf8'));
    for (const record of Array.isArray(payload?.records) ? payload.records : []) {
      rememberLookup(lookup, record?.internalName, record);
      rememberLookup(lookup, record?.name, record);
      rememberLookup(lookup, record?.nameZh, record);
      rememberLookup(lookup, buildWikiTitle(record?.name), record);
    }
  } catch {
    // Keep empty lookup if standardized items are unavailable.
  }
  itemLookupCache = lookup;
  return lookup;
}

function rememberLookup(lookup, value, record) {
  const key = normalizeLookupKey(value);
  if (!key || lookup.has(key)) {
    return;
  }
  lookup.set(key, record);
}

function normalizeLookupKey(value) {
  const text = normalizeText(value);
  return text ? text.toLowerCase() : '';
}

function buildLookupCandidates(name, href) {
  const candidates = [];
  pushCandidate(candidates, name);
  pushCandidate(candidates, buildHrefTitle(href));
  pushCandidate(candidates, normalizeWikiTitle(name));
  return [...new Set(candidates)];
}

function pushCandidate(target, value) {
  const key = normalizeLookupKey(value);
  if (key) {
    target.push(key);
  }
}

function buildHrefTitle(href) {
  const text = normalizeText(href);
  if (!text) {
    return null;
  }
  const lastSegment = text.split('/').pop();
  if (!lastSegment) {
    return null;
  }
  return decodeURIComponent(lastSegment).replaceAll('_', ' ');
}

function buildWikiTitle(name) {
  const text = normalizeText(name);
  return text ? text.replaceAll('_', ' ') : null;
}

function normalizeWikiTitle(name) {
  const text = normalizeText(name);
  if (!text) {
    return null;
  }
  if (text.endsWith(' Potion')) {
    return text.replace(/ Potion$/, '');
  }
  return text;
}

function normalizeText(value) {
  if (value == null) {
    return null;
  }
  const text = String(value).trim();
  return text.length ? text : null;
}
