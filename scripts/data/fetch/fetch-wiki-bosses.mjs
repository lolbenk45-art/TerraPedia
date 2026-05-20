#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { fetchWikiApiJson } from '../lib/wiki-item-utils.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';

const repoRoot = getProjectRoot();

const API_URL = 'https://terraria.wiki.gg/api.php';
const generatedAt = new Date().toISOString();
const dateTag = generatedAt.slice(0, 10);

const args = parseArgs(process.argv.slice(2));
const outputJsonPath = path.resolve(args['output-json'] ?? path.join(repoRoot, 'data', 'generated', 'wiki-bosses.latest.json'));
const reportPath = path.resolve(args['report-json'] ?? path.join(repoRoot, 'reports', `wiki-bosses-fetch-${dateTag}.json`));

const GROUP_CONFIG = {
  'Pre-Hardmode bosses': { groupType: 'PRE_HARDMODE', groupNameZh: '困难模式之前的 Boss' },
  'Hardmode bosses': { groupType: 'HARDMODE', groupNameZh: '困难模式 Boss' },
  'Event bosses': { groupType: 'EVENT', groupNameZh: '事件 Boss' },
  'Special world seed-exclusive boss': { groupType: 'SPECIAL_SEED', groupNameZh: '特殊世界种子专属 Boss' },
};

const overview = await fetchBossSections();
const bossEntries = discoverBossEntries(overview.sections);
const records = await mapWithConcurrency(bossEntries, 1, hydrateBossEntry);
const sortedRecords = records
  .filter((record) => record != null)
  .sort((a, b) => a.progressionOrder - b.progressionOrder);

const payload = {
  entity: 'wiki_bosses',
  generatedAt,
  schemaVersion: '1.0.0',
  sourceApi: API_URL,
  overview: {
    title: overview.title,
    pageId: overview.pageId,
    sourceUrl: 'https://terraria.wiki.gg/wiki/Bosses',
    groupCount: Object.keys(GROUP_CONFIG).length,
    bossCount: sortedRecords.length,
  },
  records: sortedRecords,
};

const report = {
  generatedAt,
  outputJsonPath: toRepoRelative(outputJsonPath),
  totalBosses: sortedRecords.length,
  byGroup: summarizeByGroup(sortedRecords),
  unresolved: sortedRecords.filter((record) => record.status !== 'ok').map((record) => ({
    titleEn: record.titleEn,
    pageTitleEn: record.pageTitleEn,
    status: record.status,
    error: record.error ?? null,
  })),
  samples: sortedRecords.slice(0, 8).map((record) => ({
    progressionOrder: record.progressionOrder,
    groupType: record.groupType,
    titleEn: record.titleEn,
    titleZh: record.titleZh,
    revisionTimestamp: record.revisionTimestamp,
  })),
};

fs.mkdirSync(path.dirname(outputJsonPath), { recursive: true });
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(outputJsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(JSON.stringify(report, null, 2));

async function fetchBossSections() {
  const url = new URL(API_URL);
  url.searchParams.set('action', 'parse');
  url.searchParams.set('page', 'Bosses');
  url.searchParams.set('prop', 'sections');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  const json = await fetchJson(url);
  return {
    title: String(json?.parse?.title ?? 'Bosses'),
    pageId: Number(json?.parse?.pageid ?? 0),
    sections: Array.isArray(json?.parse?.sections) ? json.parse.sections : [],
  };
}

function discoverBossEntries(sections) {
  const entries = [];
  let currentGroup = null;
  let progressionOrder = 1;
  let orderWithinGroup = 0;

  for (const section of sections) {
    const level = Number(section?.level ?? 0);
    const line = cleanText(section?.line);
    if (!line) continue;

    if (level === 2) {
      currentGroup = GROUP_CONFIG[line] ? { line, ...GROUP_CONFIG[line] } : null;
      orderWithinGroup = 0;
      continue;
    }

    if (level === 3 && currentGroup) {
      orderWithinGroup += 1;
      entries.push({
        progressionOrder: progressionOrder++,
        orderWithinGroup,
        groupNameEn: currentGroup.line,
        groupNameZh: currentGroup.groupNameZh,
        groupType: currentGroup.groupType,
        titleEn: line,
        pageTitleEn: line,
      });
    }
  }

  return entries;
}

async function hydrateBossEntry(entry) {
  try {
    const meta = await fetchBossPageMeta(entry.pageTitleEn);
    const html = await fetchBossRenderedHtml(meta.pageTitleEn);
    const intro = extractIntro(html);
    const imageUrl = extractBossImageUrl(html);
    return {
      ...entry,
      status: 'ok',
      pageId: meta.pageId,
      revisionId: meta.revisionId,
      revisionTimestamp: meta.revisionTimestamp,
      titleZh: meta.titleZh,
      pageTitleZh: meta.titleZh,
      sourceUrl: buildWikiUrl(meta.pageTitleEn),
      sourceUrlZh: meta.titleZh ? `https://terraria.wiki.gg/zh/wiki/${encodeURIComponent(meta.titleZh.replaceAll(' ', '_'))}` : null,
      imageUrl,
      notes: intro,
    };
  } catch (error) {
    return {
      ...entry,
      status: 'error',
      pageId: null,
      revisionId: null,
      revisionTimestamp: null,
      titleZh: null,
      pageTitleZh: null,
      sourceUrl: buildWikiUrl(entry.pageTitleEn),
      sourceUrlZh: null,
      imageUrl: null,
      notes: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchBossPageMeta(title) {
  const url = new URL(API_URL);
  url.searchParams.set('action', 'query');
  url.searchParams.set('titles', title);
  url.searchParams.set('prop', 'revisions|langlinks');
  url.searchParams.set('rvprop', 'timestamp|ids');
  url.searchParams.set('lllang', 'zh');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  const json = await fetchJson(url);
  const page = json?.query?.pages?.[0];
  const revision = page?.revisions?.[0];
  if (!page || page.missing) {
    throw new Error(`Boss page not found: ${title}`);
  }
  const zhTitle = page?.langlinks?.find((link) => link?.lang === 'zh')?.title ?? null;
  return {
    pageTitleEn: String(page.title ?? title),
    pageId: Number(page.pageid ?? 0),
    revisionId: Number(revision?.revid ?? 0),
    revisionTimestamp: revision?.timestamp ?? null,
    titleZh: zhTitle ? String(zhTitle) : null,
  };
}

async function fetchBossRenderedHtml(title) {
  const url = new URL(API_URL);
  url.searchParams.set('action', 'parse');
  url.searchParams.set('page', title);
  url.searchParams.set('prop', 'text');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  const json = await fetchJson(url);
  const text = String(json?.parse?.text ?? '');
  if (!text.trim()) {
    throw new Error(`Rendered HTML is empty for ${title}`);
  }
  return text;
}

function extractIntro(html) {
  const withoutTables = html
    .replace(/<table[\s\S]*?<\/table>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<div[^>]*class="[^"]*message-box[^"]*"[\s\S]*?<\/div>/gi, ' ');

  const paragraphs = [...withoutTables.matchAll(/<p>([\s\S]*?)<\/p>/gi)]
    .map((match) => decodeEntities(stripTags(match[1])))
    .map((text) => text.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((text) => !/^This article/i.test(text))
    .filter((text) => !/^Desktop version/i.test(text))
    .filter((text) => text.length >= 40);

  return paragraphs[0] ?? null;
}

function extractBossImageUrl(html) {
  const imageSectionMatch = html.match(/<div[^>]*class="[^"]*section images[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  const scopedHtml = imageSectionMatch?.[1] ?? html;
  const matches = [...scopedHtml.matchAll(/<img[^>]+src="([^"]+)"[^>]*>/gi)]
    .map((match) => String(match[1] ?? '').trim())
    .filter(Boolean)
    .filter((src) => !/Desktop_only|Console_only|Mobile_only|Classic_Mode|Expert_Mode|Master_Mode/i.test(src));
  if (matches.length === 0) {
    return null;
  }
  return normalizeImageUrl(matches[0]);
}

function normalizeImageUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  try {
    return new URL(raw, 'https://terraria.wiki.gg').toString();
  } catch {
    return raw.startsWith('/') ? `https://terraria.wiki.gg${raw}` : raw;
  }
}

async function fetchJson(url) {
  return fetchWikiApiJson({
    url,
    profile: 'parse',
    sourceKey: 'Bosses'
  });
}

async function mapWithConcurrency(list, concurrency, worker) {
  const out = new Array(list.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (cursor < list.length) {
      const current = cursor;
      cursor += 1;
      out[current] = await worker(list[current], current);
    }
  });
  await Promise.all(runners);
  return out;
}

function summarizeByGroup(records) {
  const grouped = new Map();
  for (const record of records) {
    const key = record.groupType;
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...grouped.entries()]);
}

function buildWikiUrl(title) {
  return `https://terraria.wiki.gg/wiki/${encodeURIComponent(String(title).replaceAll(' ', '_'))}`;
}

function cleanText(value) {
  return decodeEntities(stripTags(String(value ?? ''))).replace(/\s+/g, ' ').trim();
}

function stripTags(html) {
  return String(html ?? '').replace(/<[^>]+>/g, ' ');
}

function decodeEntities(text) {
  return String(text ?? '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, '-')
    .replace(/&#8212;/g, '-')
    .replace(/&#8230;/g, '...');
}

function parseArgs(argv) {
  const parsed = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const eq = body.indexOf('=');
    if (eq >= 0) parsed[body.slice(0, eq)] = body.slice(eq + 1);
    else parsed[body] = 'true';
  }
  return parsed;
}

function toRepoRelative(filePath) {
  return path.relative(repoRoot, filePath).replaceAll('\\', '/');
}
