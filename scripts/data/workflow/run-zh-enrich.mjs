#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {
  fetchWikiApiJson,
  fetchWikiPageMetadataBatch,
  parseCliArgs,
  sharedDataPath
} from '../lib/wiki-item-utils.mjs';
import {
  buildResolvedProjectileZhEntries,
  isProjectileNamePlaceholder,
} from '../lib/projectile-name-resolver.mjs';

const options = parseCliArgs(process.argv.slice(2));
const apply = booleanOption(options.apply, false);
const scopes = resolveScopes(options.scopes ?? options.scope ?? 'projectiles,buffs');
const standardizedRoot = path.resolve(process.cwd(), 'data', 'standardized');
const generatedRoot = path.resolve(process.cwd(), 'data', 'generated');
const reportPath = path.resolve(
  process.cwd(),
  options.output ?? path.join(process.cwd(), 'reports', `workflow-zh-enrich-${new Date().toISOString().slice(0, 10)}.json`)
);

const summary = {
  apply,
  generatedAt: new Date().toISOString(),
  reportPath,
  scopes,
  modules: {}
};

for (const scope of scopes) {
  if (scope === 'items') {
    summary.modules.items = await enrichItems();
  } else if (scope === 'npcs') {
    summary.modules.npcs = await enrichNpcs();
  } else if (scope === 'projectiles') {
    summary.modules.projectiles = await enrichProjectiles();
  } else if (scope === 'buffs') {
    summary.modules.buffs = await enrichBuffs();
  }
}

writeJson(reportPath, summary);
console.log(JSON.stringify(summary, null, 2));

async function enrichItems() {
  const filePath = path.join(standardizedRoot, 'items.standardized.json');
  const result = await enrichWithLanglinks({
    filePath,
    scope: 'items',
    titleAccessor: (record) => toText(record?.name),
    applyLocalized: (record, zhTitle) => {
      if (toText(zhTitle)) {
        record.nameZh = zhTitle;
      }
    }
  });
  if (apply) {
    writeZhMap(path.join(generatedRoot, 'item-zh-map.json'), result.mapRecords, 'items');
  }
  return result.summary;
}

async function enrichNpcs() {
  const filePath = path.join(standardizedRoot, 'npcs.standardized.json');
  const result = await enrichWithLanglinks({
    filePath,
    scope: 'npcs',
    titleAccessor: (record) => toText(record?.name),
    applyLocalized: (record, zhTitle) => {
      if (toText(zhTitle)) {
        record.nameZh = zhTitle;
      }
    }
  });
  if (apply) {
    writeZhMap(path.join(generatedRoot, 'npc-zh-map.json'), result.mapRecords, 'npcs');
  }
  return result.summary;
}

async function enrichProjectiles() {
  const filePath = path.join(standardizedRoot, 'projectiles.standardized.json');
  const payload = readJson(filePath);
  const records = Array.isArray(payload?.records) ? payload.records : [];
  const zhMap = await fetchProjectileZhMap();

  let changed = 0;
  let alreadyLocalized = 0;
  let candidates = 0;
  let missingSource = 0;

  for (const record of records) {
    const internalName = toText(record?.internalName);
    const currentZh = toText(record?.nameZh);
    if (currentZh && !isProjectileNamePlaceholder(currentZh)) {
      alreadyLocalized += 1;
      continue;
    }
    if (!internalName) {
      missingSource += 1;
      continue;
    }
    const nextZh = toText(zhMap.get(internalName)?.nameZh);
    if (!nextZh) {
      missingSource += 1;
      continue;
    }
    candidates += 1;
    record.nameZh = nextZh;
    changed += 1;
  }

  if (apply && changed > 0) {
    writeJson(filePath, payload);
  }

  return {
    alreadyLocalized,
    apply,
    candidates,
    changed,
    filePath,
    missingSource,
    total: records.length
  };
}

async function enrichBuffs() {
  const filePath = path.join(standardizedRoot, 'buffs.standardized.json');
  const payload = readJson(filePath);
  const records = Array.isArray(payload?.records) ? payload.records : [];

  let changed = 0;
  let alreadyLocalized = 0;
  let candidates = 0;
  let missingSource = 0;

  for (const record of records) {
    const currentZh = toText(record?.nameZh);
    if (currentZh) {
      alreadyLocalized += 1;
      continue;
    }
    const nextZh = toText(record?.localized?.zh?.name);
    if (!nextZh) {
      missingSource += 1;
      continue;
    }
    candidates += 1;
    record.nameZh = nextZh;
    changed += 1;
  }

  if (apply && changed > 0) {
    writeJson(filePath, payload);
  }

  return {
    alreadyLocalized,
    apply,
    candidates,
    changed,
    filePath,
    missingSource,
    total: records.length
  };
}

async function enrichWithLanglinks({ filePath, scope, titleAccessor, applyLocalized }) {
  const payload = readJson(filePath);
  const records = Array.isArray(payload?.records) ? payload.records : [];
  const pending = records
    .filter((record) => !toText(record?.nameZh))
    .map((record) => ({
      record,
      title: titleAccessor(record)
    }))
    .filter((entry) => entry.title);

  const titleMap = new Map();
  const uniqueTitles = [...new Set(pending.map((entry) => entry.title))];
  for (let index = 0; index < uniqueTitles.length; index += 50) {
    const batch = uniqueTitles.slice(index, index + 50);
    const pages = await fetchWikiPageMetadataBatch({
      titles: batch,
      includeLanglinks: true
    });
    pages.forEach((page) => {
      if (!toText(page?.requestedTitle)) {
        return;
      }
      titleMap.set(page.requestedTitle, toText(page?.zhTitle));
    });
  }

  let changed = 0;
  let alreadyLocalized = 0;
  let candidates = 0;
  let missingSource = 0;
  const mapRecords = [];

  for (const record of records) {
    if (toText(record?.nameZh)) {
      alreadyLocalized += 1;
      mapRecords.push(buildMapRecord(record, toText(record?.nameZh)));
      continue;
    }
    const title = titleAccessor(record);
    if (!title) {
      missingSource += 1;
      continue;
    }
    const zhTitle = titleMap.get(title);
    if (!toText(zhTitle)) {
      missingSource += 1;
      continue;
    }
    candidates += 1;
    applyLocalized(record, zhTitle);
    changed += 1;
    mapRecords.push(buildMapRecord(record, zhTitle));
  }

  if (apply && changed > 0) {
    writeJson(filePath, payload);
  }

  return {
    mapRecords,
    summary: {
      alreadyLocalized,
      apply,
      candidates,
      changed,
      filePath,
      missingSource,
      scope,
      total: records.length
    }
  };
}

async function fetchProjectileZhMap() {
  const apiUrl = new URL('https://terraria.wiki.gg/zh/api.php');
  apiUrl.searchParams.set('action', 'query');
  apiUrl.searchParams.set('titles', 'Terraria Wiki:语言包/.Projectiles.json/ProjectileName');
  apiUrl.searchParams.set('prop', 'revisions');
  apiUrl.searchParams.set('rvslots', 'main');
  apiUrl.searchParams.set('rvprop', 'content');
  apiUrl.searchParams.set('format', 'json');
  apiUrl.searchParams.set('formatversion', '2');

  const data = await fetchWikiApiJson({
    url: apiUrl,
    profile: 'revision',
    sourceKey: 'Terraria Wiki:语言包/.Projectiles.json/ProjectileName'
  });
  const content = data?.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content;
  if (!toText(content)) {
    throw new Error('Projectile zh language page did not return content');
  }

  const rawEntries = new Map();
  const rows = String(content).match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
  for (const row of rows) {
    const headerMatch = row.match(/<th[^>]*>([\s\S]*?)<\/th>/i);
    if (!headerMatch) continue;
    const internalName = cleanCellText(headerMatch[1]);
    if (!internalName || internalName === '内部名称') continue;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => cleanCellText(match[1]));
    const builtInZh = toText(cells[1]);
    const langPackZh = toText(cells[2]);
    const nameZh = langPackZh || builtInZh;
    rawEntries.set(internalName, { internalName, nameZh });
  }
  return buildResolvedProjectileZhEntries(rawEntries);
}

function cleanCellText(value) {
  return decodeHtmlEntities(
    String(value ?? '')
      .replace(/<code[^>]*>[\s\S]*?<\/code>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function resolveScopes(rawValue) {
  return [...new Set(
    String(rawValue ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  )].filter((scope) => ['items', 'npcs', 'projectiles', 'buffs'].includes(scope));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeZhMap(filePath, records, scope) {
  writeJson(filePath, {
    generatedAt: new Date().toISOString(),
    records: Object.fromEntries(
      records
        .filter((record) => toText(record.key) && toText(record.nameZh))
        .map((record) => [record.key, record])
    ),
    scope,
    total: records.length
  });
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function buildMapRecord(record, nameZh) {
  return {
    id: record?.id ?? null,
    internalName: toText(record?.internalName),
    key: toText(record?.internalName) ?? toText(record?.name),
    name: toText(record?.name) ?? toText(record?.englishName),
    nameZh: toText(nameZh)
  };
}

function toText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function booleanOption(value, fallback) {
  if (value == null || value === '') return fallback;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return fallback;
}
