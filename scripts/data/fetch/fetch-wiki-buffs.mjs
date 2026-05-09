import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ensureDir,
  expandWikiText,
  fetchWikiModuleContent,
  fetchWikiRenderedHtml,
  parseCliArgs,
  parseIteminfoModulePayload,
  sharedDataPath,
  writeJson
} from '../lib/wiki-item-utils.mjs';
import {
  buildActionProgressPayload,
  writeJsonFile
} from '../workflow/backend-refresh-runtime-state.mjs';
import {
  parseBuffPageImmunityFacts
} from './buff-immunity-page-parser.mjs';

const DEFAULT_TEMPLATE_TITLE = 'Template:GetBuffInfo';
const DEFAULT_LANGS = ['en', 'zh'];
const EXPAND_BATCH_SIZE = 25;
const DEFAULT_BUFF_PROGRESS_PATH = sharedDataPath('generated', 'fetch-wiki-buffs-progress.latest.json');

async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const templateTitle = options.template ?? DEFAULT_TEMPLATE_TITLE;
  const rawDir = path.resolve(process.cwd(), options['raw-dir'] ?? sharedDataPath('raw', 'wiki'));
  const reportDir = sharedDataPath('reports', 'fetch');
  const langs = parseLanguages(options.langs);
  const progressPath = path.resolve(process.cwd(), options['progress-path'] ?? DEFAULT_BUFF_PROGRESS_PATH);
  const startedAt = new Date().toISOString();

  ensureDir(rawDir);
  ensureDir(reportDir);
  writeBuffFetchProgress(progressPath, {
    status: 'running',
    phase: 'module',
    message: 'fetching Template:GetBuffInfo and preparing localized buff expansion',
    current: 0,
    total: 0,
    startedAt
  });

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
  writeBuffFetchProgress(progressPath, {
    status: 'running',
    phase: 'expand',
    message: `expanding localized fields for ${baseBuffs.length} buff(s) across ${langs.length} language(s)`,
    current: 0,
    total: baseBuffs.length,
    overallCurrent: 0,
    overallTotal: baseBuffs.length,
    startedAt
  });

  for (const lang of langs) {
    localizedByLang[lang] = await expandLocalizedBuffFields(baseBuffs.map((buff) => buff.id), lang);
  }

  const relations = loadBuffRelations();
  const pageFacts = await collectBuffPageImmunityFacts({
    buffs: baseBuffs,
    localizedByLang,
    enabled: options['skip-buff-page-immunities'] !== true && options['skip-buff-page-immunities'] !== 'true',
    progressCallback: ({ current, total, pageTitle }) => {
      writeBuffFetchProgress(progressPath, {
        status: 'running',
        phase: 'buff-page-immunities',
        message: `scraping rendered immunity pages ${current}/${total}: ${pageTitle}`,
        current,
        total,
        overallCurrent: current,
        overallTotal: total,
        startedAt
      });
    }
  });
  const buffs = buildBuffRecords({
    baseBuffs,
    localizedByLang,
    langs,
    relations,
    pageFacts
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
    buffPageImmunityFactCount: pageFacts.size,
    langs,
    latestJsonPath,
    latestMarkupPath,
    latestParsedPath,
    snapshotJsonPath,
    snapshotParsedPath
  });
  writeBuffFetchProgress(progressPath, {
    status: 'completed',
    phase: 'write',
    message: `finished buff fetch; buffs=${buffs.length}; page immunity facts=${pageFacts.size}`,
    current: buffs.length,
    total: buffs.length,
    overallCurrent: buffs.length,
    overallTotal: buffs.length,
    startedAt,
    outputPath: latestParsedPath,
    reportPath
  });

  console.log(`Fetched template: ${result.pageTitle}`);
  console.log(`Revision timestamp: ${result.revisionTimestamp ?? 'unknown'}`);
  console.log(`Total buffs: ${buffs.length}`);
  console.log(`Buffs: ${buffCount}`);
  console.log(`Debuffs: ${debuffCount}`);
  console.log(`Buffs with source items: ${sourcedBuffCount}`);
  console.log(`Buffs with page immunity facts: ${pageFacts.size}`);
  console.log(`Latest JSON: ${latestJsonPath}`);
  console.log(`Latest parsed JSON: ${latestParsedPath}`);
  console.log(`Latest wikitext: ${latestMarkupPath}`);
  console.log(`Report: ${reportPath}`);
}

export function buildBuffRecords({
  baseBuffs,
  localizedByLang,
  langs,
  relations,
  pageFacts = new Map()
}) {
  return baseBuffs.map((buff) => {
    const localized = {};
    for (const lang of langs) {
      localized[lang] = localizedByLang[lang]?.[String(buff.id)] ?? {
        name: null,
        page: null,
        tooltip: null,
        namesub: null
      };
    }

    const sourceItems = relations.sourceItemsByBuffId.get(buff.id) ?? [];
    const pageFact = pageFacts.get(buff.id);
    const fallbackCount = relations.immuneNpcCountByBuffId.get(buff.id) ?? 0;
    const immuneNpcCount = pageFact?.immuneNpcCount ?? fallbackCount;
    const immuneNpcSample = pageFact?.immuneNpcSample ?? relations.immuneNpcSampleByBuffId.get(buff.id) ?? [];
    const immuneNpcSource = pageFact?.immuneNpcSource
      ?? relations.immuneNpcSourceByBuffId.get(buff.id)
      ?? (fallbackCount > 0 ? 'npcinfo-module' : null);
    const immuneNpcSampleSemantics = pageFact?.immuneNpcSampleSemantics
      ?? relations.immuneNpcSampleSemanticsByBuffId.get(buff.id)
      ?? (fallbackCount > 0 ? 'first up to 10 npcinfo module rows with this buffImmune id; immuneNpcCount is the full npcinfo-module match count' : null);

    return {
      ...buff,
      localized,
      sourceItemCount: sourceItems.length,
      sourceItems,
      immuneNpcCount,
      immuneNpcSample,
      immuneNpcSource,
      immuneNpcSampleSemantics
    };
  });
}

export async function collectBuffPageImmunityFacts({
  buffs,
  localizedByLang,
  enabled = true,
  fetchRenderedHtml = fetchWikiRenderedHtml,
  sampleLimit = 10,
  progressCallback = null
} = {}) {
  const factsByBuffId = new Map();
  if (!enabled) {
    return factsByBuffId;
  }

  const total = Array.isArray(buffs) ? buffs.filter((buff) => Number.isInteger(buff?.id)).length : 0;
  let current = 0;

  for (const buff of buffs ?? []) {
    if (!Number.isInteger(buff.id)) {
      continue;
    }

    const pageTitle = pickBuffPageTitle(buff, localizedByLang);
    current += 1;
    if (typeof progressCallback === 'function') {
      progressCallback({
        buffId: buff.id,
        pageTitle,
        current,
        total
      });
    }
    if (typeof pageTitle !== 'string' || pageTitle.trim() === '') {
      continue;
    }

    try {
      const html = await fetchRenderedHtml({ pageTitle });
      const facts = parseBuffPageImmunityFacts({
        buffId: buff.id,
        buffName: buff.englishName ?? pageTitle,
        pageTitle,
        html,
        sampleLimit
      });
      if (facts) {
        factsByBuffId.set(buff.id, facts);
      }
    } catch (error) {
      console.warn(`Failed to parse buff page immunities for ${pageTitle}: ${error.message}`);
    }
  }

  return factsByBuffId;
}

function writeBuffFetchProgress(progressPath, {
  status,
  phase,
  message,
  current,
  total,
  overallCurrent = current,
  overallTotal = total,
  startedAt,
  outputPath = null,
  reportPath = null
} = {}) {
  const generatedAt = new Date().toISOString();
  const payload = buildActionProgressPayload({
    actionId: 'buff-page-immunity-refresh',
    status,
    phase,
    message,
    current,
    total,
    startedAt,
    overallCurrent,
    overallTotal,
    generatedAt,
    lastHeartbeatAt: generatedAt,
    childStatusPath: progressPath
  });
  if (outputPath) {
    payload.outputPath = outputPath;
  }
  if (reportPath) {
    payload.reportPath = reportPath;
  }
  payload.queue = 'buff source refresh';
  payload.dataStage = 'wiki buff pages -> immunity evidence';
  payload.nextStep = 'standardize buffs, rebuild npc bridge, then backfill npc_buff_relations';
  writeJsonFile(progressPath, payload);
}

function pickBuffPageTitle(buff, localizedByLang) {
  const buffKey = String(buff?.id ?? '');
  return firstNonEmptyText(
    localizedByLang?.en?.[buffKey]?.page,
    localizedByLang?.en?.[buffKey]?.title,
    localizedByLang?.zh?.[buffKey]?.page,
    localizedByLang?.zh?.[buffKey]?.title,
    buff?.englishName
  );
}

function firstNonEmptyText(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) {
      return text;
    }
  }
  return null;
}

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
  const immuneNpcSourceByBuffId = new Map();
  const immuneNpcSampleSemanticsByBuffId = new Map();

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
        immuneNpcSourceByBuffId.set(buffId, 'npcinfo-module');
        immuneNpcSampleSemanticsByBuffId.set(
          buffId,
          'first up to 10 npcinfo module rows with this buffImmune id; immuneNpcCount is the full npcinfo-module match count'
        );

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
    immuneNpcSampleByBuffId,
    immuneNpcSourceByBuffId,
    immuneNpcSampleSemanticsByBuffId
  };
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
