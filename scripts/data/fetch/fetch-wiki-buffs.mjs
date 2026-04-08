import fs from 'node:fs';
import path from 'node:path';

import {
  ensureDir,
  fetchWikiModuleContent,
  parseCliArgs,
  parseIteminfoModulePayload,
  sharedDataPath,
  writeJson
} from '../lib/wiki-item-utils.mjs';

const DEFAULT_TEMPLATE_TITLE = 'Template:GetBuffInfo';
const DEFAULT_LANGS = ['en', 'zh'];
const EXPAND_BATCH_SIZE = 25;

const options = parseCliArgs(process.argv.slice(2));
const templateTitle = options.template ?? DEFAULT_TEMPLATE_TITLE;
const rawDir = path.resolve(process.cwd(), options['raw-dir'] ?? sharedDataPath('raw', 'wiki'));
const reportDir = sharedDataPath('reports', 'fetch');
const langs = parseLanguages(options.langs);

ensureDir(rawDir);
ensureDir(reportDir);

const result = await fetchWikiModuleContent({ moduleTitle: templateTitle });
const timestamp = new Date().toISOString().replaceAll(':', '-');
const baseName = templateTitle.replaceAll(':', '__').replaceAll('/', '__').replaceAll(' ', '_').toLowerCase();
const latestJsonPath = path.join(rawDir, `${baseName}.latest.json`);
const latestMarkupPath = path.join(rawDir, `${baseName}.latest.wikitext`);
const latestParsedPath = path.join(rawDir, `${baseName}.parsed.latest.json`);
const snapshotJsonPath = path.join(rawDir, `${baseName}.${timestamp}.json`);
const snapshotParsedPath = path.join(rawDir, `${baseName}.parsed.${timestamp}.json`);
const reportPath = path.join(reportDir, `fetch-${baseName}-${timestamp}.json`);

const baseBuffs = parseBaseBuffDatabase(result.moduleContent);
const localizedByLang = {};

for (const lang of langs) {
  localizedByLang[lang] = await expandLocalizedBuffFields(baseBuffs.map((buff) => buff.id), lang);
}

const relations = loadBuffRelations();
const buffs = baseBuffs.map((buff) => {
  const localized = {};
  for (const lang of langs) {
    localized[lang] = localizedByLang[lang][String(buff.id)] ?? {
      name: null,
      page: null,
      tooltip: null,
      namesub: null
    };
  }

  const sourceItems = relations.sourceItemsByBuffId.get(buff.id) ?? [];
  const immuneNpcSample = relations.immuneNpcSampleByBuffId.get(buff.id) ?? [];

  return {
    ...buff,
    localized,
    sourceItemCount: sourceItems.length,
    sourceItems,
    immuneNpcCount: relations.immuneNpcCountByBuffId.get(buff.id) ?? 0,
    immuneNpcSample
  };
});

const parsedPayload = {
  source: 'terraria.wiki.gg:Template:GetBuffInfo',
  sourceApi: result.apiUrl,
  sourcePageTitle: result.pageTitle,
  sourceRevisionTimestamp: result.revisionTimestamp,
  fetchedAt: result.fetchedAt,
  totalBuffs: buffs.length,
  langs,
  buffs
};

writeJson(latestJsonPath, result);
writeJson(snapshotJsonPath, result);
fs.writeFileSync(latestMarkupPath, result.moduleContent);
writeJson(latestParsedPath, parsedPayload);
writeJson(snapshotParsedPath, parsedPayload);

const debuffCount = buffs.filter((buff) => buff.type === 'debuff').length;
const buffCount = buffs.filter((buff) => buff.type === 'buff').length;
const sourcedBuffCount = buffs.filter((buff) => buff.sourceItemCount > 0).length;

writeJson(reportPath, {
  moduleTitle: result.moduleTitle,
  sourceApi: result.apiUrl,
  pageTitle: result.pageTitle,
  pageId: result.pageId,
  revisionTimestamp: result.revisionTimestamp,
  fetchedAt: result.fetchedAt,
  totalBuffs: buffs.length,
  buffCount,
  debuffCount,
  sourcedBuffCount,
  langs,
  latestJsonPath,
  latestMarkupPath,
  latestParsedPath,
  snapshotJsonPath,
  snapshotParsedPath
});

console.log(`Fetched template: ${result.pageTitle}`);
console.log(`Revision timestamp: ${result.revisionTimestamp ?? 'unknown'}`);
console.log(`Total buffs: ${buffs.length}`);
console.log(`Buffs: ${buffCount}`);
console.log(`Debuffs: ${debuffCount}`);
console.log(`Buffs with source items: ${sourcedBuffCount}`);
console.log(`Latest JSON: ${latestJsonPath}`);
console.log(`Latest parsed JSON: ${latestParsedPath}`);
console.log(`Latest wikitext: ${latestMarkupPath}`);
console.log(`Report: ${reportPath}`);

function parseLanguages(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return [...DEFAULT_LANGS];
  }

  return [...new Set(
    value
      .split(',')
      .map((lang) => lang.trim())
      .filter(Boolean)
  )];
}

function parseBaseBuffDatabase(templateContent) {
  const countMatch = templateContent.match(/\|__buff:count\|(\d+)<!--/);
  const expectedCount = Number(countMatch?.[1] ?? 0);
  const buffById = new Map();
  const fieldPattern = /__buff:(image|iname|ename|type):(\d+)\|([\s\S]*?)<!--/g;

  for (const match of templateContent.matchAll(fieldPattern)) {
    const field = match[1];
    const id = Number(match[2]);
    const value = sanitizeTemplateValue(match[3]);
    const current = buffById.get(id) ?? { id };
    current[field] = value;
    buffById.set(id, current);
  }

  const buffs = [...buffById.values()]
    .map((entry) => ({
      id: entry.id,
      image: entry.image ?? null,
      internalName: entry.iname ?? null,
      englishName: entry.ename ?? null,
      type: entry.type ?? null
    }))
    .sort((left, right) => left.id - right.id);

  if (expectedCount > 0 && buffs.length !== expectedCount) {
    console.warn(`Expected ${expectedCount} buffs, parsed ${buffs.length}`);
  }

  return buffs;
}

async function expandLocalizedBuffFields(ids, lang) {
  const localized = {};

  for (let index = 0; index < ids.length; index += EXPAND_BATCH_SIZE) {
    const batch = ids.slice(index, index + EXPAND_BATCH_SIZE);
    const text = batch.map((id) => {
      return [
        `@@REC:${id}@@`,
        `@@FLD@@{{getBuffInfo|${id}|name|lang=${lang}}}`,
        `@@FLD@@{{getBuffInfo|${id}|page|lang=${lang}}}`,
        `@@FLD@@{{getBuffInfo|${id}|tooltip|lang=${lang}}}`,
        `@@FLD@@{{getBuffInfo|${id}|namesub|lang=${lang}}}`,
        '@@ENDREC@@'
      ].join('');
    }).join('');

    const expanded = await expandTemplates(text);
    const recordPattern = /@@REC:(\d+)@@([\s\S]*?)@@ENDREC@@/g;

    for (const match of expanded.matchAll(recordPattern)) {
      const id = match[1];
      const parts = match[2].split('@@FLD@@').slice(1);
      localized[id] = {
        name: normalizeExpandedValue(parts[0]),
        page: normalizeExpandedValue(parts[1]),
        tooltip: normalizeExpandedValue(parts[2]),
        namesub: normalizeExpandedValue(parts[3])
      };
    }
  }

  return localized;
}

async function expandTemplates(text) {
  return expandWikiText({ text });
}

function normalizeExpandedValue(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === '' || trimmed === '(unknown)' ? null : trimmed;
}

function sanitizeTemplateValue(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function loadBuffRelations() {
  const sourceItemsByBuffId = new Map();
  const immuneNpcCountByBuffId = new Map();
  const immuneNpcSampleByBuffId = new Map();

  const itemRawPath = sharedDataPath('raw', 'wiki', 'module__iteminfo__data.latest.json');
  if (fs.existsSync(itemRawPath)) {
    const rawPayload = JSON.parse(fs.readFileSync(itemRawPath, 'utf8'));
    const itemData = parseIteminfoModulePayload(rawPayload.moduleContent);

    for (const [key, item] of Object.entries(itemData)) {
      if (!/^\d+$/.test(key) || !item || typeof item !== 'object') {
        continue;
      }

      const buffId = Number(item.buffType ?? 0);
      if (!Number.isInteger(buffId) || buffId <= 0) {
        continue;
      }

      const current = sourceItemsByBuffId.get(buffId) ?? [];
      current.push({
        itemId: Number(key),
        name: item.name ?? null,
        internalName: item.internalName ?? null,
        buffTime: Number(item.buffTime ?? 0) || null
      });
      sourceItemsByBuffId.set(buffId, current);
    }
  }

  const npcParsedPath = sharedDataPath('raw', 'wiki', 'module__npcinfo__data.parsed.latest.json');
  if (fs.existsSync(npcParsedPath)) {
    const npcPayload = JSON.parse(fs.readFileSync(npcParsedPath, 'utf8'));
    const npcs = Array.isArray(npcPayload.npcs) ? npcPayload.npcs : [];

    for (const npc of npcs) {
      const immuneIds = String(npc.buffImmune ?? '')
        .split(',')
        .map((part) => Number(part.trim()))
        .filter((value) => Number.isInteger(value) && value > 0);

      for (const buffId of immuneIds) {
        immuneNpcCountByBuffId.set(buffId, (immuneNpcCountByBuffId.get(buffId) ?? 0) + 1);

        const sample = immuneNpcSampleByBuffId.get(buffId) ?? [];
        if (sample.length < 10) {
          sample.push({
            npcId: npc.id,
            name: npc.name ?? null,
            internalName: npc.internalName ?? null
          });
          immuneNpcSampleByBuffId.set(buffId, sample);
        }
      }
    }
  }

  return {
    sourceItemsByBuffId,
    immuneNpcCountByBuffId,
    immuneNpcSampleByBuffId
  };
}
