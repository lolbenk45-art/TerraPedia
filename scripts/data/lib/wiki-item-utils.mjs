import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { createWikiRequestGate } from './wiki-request-gate.mjs';
import { getProjectRoot, resolveSharedDataRoot } from './project-root.mjs';

export const DEFAULT_WIKI_API_URL = 'https://terraria.wiki.gg/api.php';
export const DEFAULT_MODULE_TITLE = 'Module:Iteminfo/data';
export const DEFAULT_WIKI_USER_AGENT = 'TerraPedia-data-sync/2.0';
export const WORKSPACE_ROOT = getProjectRoot();
export const DEFAULT_SHARED_DATA_ROOT = resolveSharedDataRoot();
const wikiRequestGate = createWikiRequestGate({
  userAgent: DEFAULT_WIKI_USER_AGENT
});

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

export function sharedDataPath(...segments) {
  return path.join(DEFAULT_SHARED_DATA_ROOT, ...segments);
}

export function parseCliArgs(argv) {
  const options = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      continue;
    }
    const option = arg.slice(2);
    const separatorIndex = option.indexOf('=');
    if (separatorIndex === -1) {
      options[option] = true;
      continue;
    }
    const key = option.slice(0, separatorIndex);
    const value = option.slice(separatorIndex + 1);
    options[key] = value;
  }
  return options;
}

export async function fetchWikiModuleContent({
  moduleTitle = DEFAULT_MODULE_TITLE,
  apiUrl = DEFAULT_WIKI_API_URL
} = {}) {
  const url = new URL(apiUrl);
  url.searchParams.set('action', 'query');
  url.searchParams.set('titles', moduleTitle);
  url.searchParams.set('prop', 'revisions');
  url.searchParams.set('rvprop', 'content|timestamp');
  url.searchParams.set('rvslots', 'main');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');

  const body = await wikiRequestGate.runJsonRequest(url, {
    profile: 'revision',
    sourceKey: moduleTitle
  });
  const page = body?.query?.pages?.[0];
  const revision = page?.revisions?.[0];
  const content = revision?.slots?.main?.content;

  if (!page || page.missing) {
    throw new Error(`Wiki module not found: ${moduleTitle}`);
  }
  if (typeof content !== 'string' || content.trim() === '') {
    throw new Error(`Wiki module content missing: ${moduleTitle}`);
  }

  return {
    apiUrl,
    moduleTitle,
    fetchedAt: new Date().toISOString(),
    pageId: page.pageid ?? null,
    pageTitle: page.title ?? moduleTitle,
    revisionTimestamp: revision?.timestamp ?? null,
    moduleContent: content
  };
}

export async function fetchWikiPagePayload({
  pageTitle,
  apiUrl = DEFAULT_WIKI_API_URL
} = {}) {
  if (typeof pageTitle !== 'string' || pageTitle.trim() === '') {
    throw new Error('pageTitle is required');
  }

  const parseUrl = buildWikiPageParseUrl({ pageTitle, apiUrl });

  const parseBody = await wikiRequestGate.runJsonRequest(parseUrl, {
    profile: 'parse',
    sourceKey: pageTitle
  });
  const parsed = parseBody?.parse;
  if (!parsed?.pageid || typeof parsed?.wikitext !== 'string' || typeof parsed?.text !== 'string') {
    throw new Error(`Wiki page parse result missing for ${pageTitle}`);
  }

  const revisionTimestamp = await fetchWikiPageRevisionTimestamp({ pageTitle: parsed.title ?? pageTitle, apiUrl });

  return {
    apiUrl,
    requestedPageTitle: pageTitle,
    pageTitle: parsed.title ?? pageTitle,
    pageId: parsed.pageid,
    revisionTimestamp,
    fetchedAt: new Date().toISOString(),
    wikitext: parsed.wikitext,
    html: parsed.text
  };
}

export function buildWikiPageParseUrl({
  pageTitle,
  apiUrl = DEFAULT_WIKI_API_URL
} = {}) {
  if (typeof pageTitle !== 'string' || pageTitle.trim() === '') {
    throw new Error('pageTitle is required');
  }

  const parseUrl = new URL(apiUrl);
  parseUrl.searchParams.set('action', 'parse');
  parseUrl.searchParams.set('page', pageTitle);
  parseUrl.searchParams.set('prop', 'wikitext|text');
  parseUrl.searchParams.set('format', 'json');
  parseUrl.searchParams.set('formatversion', '2');
  parseUrl.searchParams.set('redirects', '1');
  return parseUrl;
}

export async function fetchWikiPageRevisionTimestamp({
  pageTitle,
  apiUrl = DEFAULT_WIKI_API_URL
} = {}) {
  const url = new URL(apiUrl);
  url.searchParams.set('action', 'query');
  url.searchParams.set('titles', pageTitle);
  url.searchParams.set('prop', 'revisions');
  url.searchParams.set('rvprop', 'timestamp');
  url.searchParams.set('rvslots', 'main');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');

  const body = await wikiRequestGate.runJsonRequest(url, {
    profile: 'revision',
    sourceKey: pageTitle
  });
  return body?.query?.pages?.[0]?.revisions?.[0]?.timestamp ?? null;
}

export async function expandWikiText({
  text,
  apiUrl = DEFAULT_WIKI_API_URL
} = {}) {
  const url = new URL(apiUrl);
  url.searchParams.set('action', 'expandtemplates');
  url.searchParams.set('prop', 'wikitext');
  url.searchParams.set('format', 'json');

  const body = await wikiRequestGate.runJsonRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8'
    },
    body: new URLSearchParams({ text }),
    profile: 'expand',
    sourceKey: 'expandtemplates'
  });
  return body?.expandtemplates?.wikitext ?? '';
}

export async function fetchWikiImageInfo({
  fileTitle,
  apiUrl = DEFAULT_WIKI_API_URL
} = {}) {
  if (typeof fileTitle !== 'string' || fileTitle.trim() === '') {
    throw new Error('fileTitle is required');
  }

  const normalizedTitle = fileTitle.startsWith('File:') ? fileTitle : `File:${fileTitle}`;
  const url = new URL(apiUrl);
  url.searchParams.set('action', 'query');
  url.searchParams.set('titles', normalizedTitle);
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url|size|mime');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');

  const body = await wikiRequestGate.runJsonRequest(url, {
    profile: 'revision',
    sourceKey: normalizedTitle
  });
  const page = body?.query?.pages?.[0];
  const imageinfo = page?.imageinfo?.[0];
  if (!page || page.missing || !imageinfo?.url) {
    return null;
  }

  return {
    fileTitle: page.title ?? normalizedTitle,
    url: imageinfo.url,
    descriptionUrl: imageinfo.descriptionurl ?? null,
    mime: imageinfo.mime ?? null,
    width: imageinfo.width ?? null,
    height: imageinfo.height ?? null,
    size: imageinfo.size ?? null
  };
}

export function parseLuaDataTable(moduleContent) {
  if (typeof moduleContent !== 'string' || moduleContent.trim() === '') {
    throw new Error('Module content is empty');
  }

  const withoutComments = moduleContent.replace(/^\s*--.*$/gm, '');
  const returnIndex = withoutComments.indexOf('return');
  const firstBraceIndex = withoutComments.indexOf('{', returnIndex);
  const lastBraceIndex = withoutComments.lastIndexOf('}');

  if (returnIndex === -1 || firstBraceIndex === -1 || lastBraceIndex === -1) {
    throw new Error('Unable to locate Lua return table');
  }

  const luaTable = withoutComments.slice(firstBraceIndex, lastBraceIndex + 1);
  const objectLiteral = luaTable
    .replace(/\[(?:"([^"]+)"|'([^']+)')\]\s*=/g, (_match, dqKey, sqKey) => {
      return `${JSON.stringify(dqKey ?? sqKey)}:`;
    })
    .replace(/\[\s*(-?\d+(?:\.\d+)?)\s*\]\s*=/g, (_match, numericKey) => {
      return `${JSON.stringify(numericKey)}:`;
    })
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*=/g, (_match, prefix, bareKey) => {
      return `${prefix}${JSON.stringify(bareKey)}:`;
    })
    .replace(/\bnil\b/g, 'null');

  return vm.runInNewContext(`(${objectLiteral})`, Object.create(null), {
    timeout: 5_000
  });
}

export function extractLuaLongStringField(moduleContent, fieldName) {
  const escapedFieldName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\["${escapedFieldName}"\\]\\s*=\\s*\\[(=*)\\[(.*?)\\]\\1\\]`, 's');
  const match = moduleContent.match(pattern);

  if (!match) {
    throw new Error(`Unable to locate long-string field "${fieldName}" in wiki module`);
  }

  return match[2];
}

export function parseIteminfoModulePayload(moduleContent) {
  const itemDataJson = extractLuaLongStringField(moduleContent, 'data');
  return JSON.parse(itemDataJson);
}

export function parseNpcinfoModulePayload(moduleContent) {
  return parseLuaDataTable(moduleContent);
}

export function numericOption(value, fallback) {
  if (value == null || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function chunkArray(list, size) {
  const normalizedSize = Math.max(1, Number.isFinite(Number(size)) ? Number(size) : 1);
  const chunks = [];
  for (let index = 0; index < list.length; index += normalizedSize) {
    chunks.push(list.slice(index, index + normalizedSize));
  }
  return chunks;
}

export async function fetchWikiApiJson({
  url,
  method = 'GET',
  headers = {},
  body,
  profile = 'revision',
  sourceKey = null
} = {}) {
  if (!url) {
    throw new Error('url is required');
  }
  return wikiRequestGate.runJsonRequest(url, {
    method,
    headers,
    body,
    profile,
    sourceKey
  });
}

export function buildWikiPageUrl({
  pageTitle,
  lang = 'en',
  origin = 'https://terraria.wiki.gg'
} = {}) {
  const normalizedTitle = String(pageTitle ?? '').trim();
  if (!normalizedTitle) {
    throw new Error('pageTitle is required');
  }

  const normalizedLang = String(lang ?? 'en').trim().toLowerCase();
  const prefix = normalizedLang && normalizedLang !== 'en'
    ? `/${normalizedLang}/wiki/`
    : '/wiki/';
  const encodedTitle = encodeURIComponent(normalizedTitle).replace(/%2F/g, '/');

  return `${origin}${prefix}${encodedTitle}`;
}

export async function fetchWikiPageHtmlSnapshot({
  pageTitle,
  pageUrl,
  lang = 'en',
  timeoutMs = 20_000
} = {}) {
  const targetUrl = pageUrl
    ? String(pageUrl)
    : buildWikiPageUrl({ pageTitle, lang });
  const html = await wikiRequestGate.runTextRequest(targetUrl, {
    profile: 'page',
    sourceKey: pageTitle ?? targetUrl,
    timeoutMs
  });
  const metadata = extractWikiHtmlMetadata(html);

  return {
    url: targetUrl,
    lang,
    requestedPageTitle: pageTitle ?? null,
    pageTitle: metadata.pageTitle ?? pageTitle ?? null,
    pageName: metadata.pageName,
    pageId: metadata.pageId,
    revisionId: metadata.revisionId,
    revisionTimestamp: metadata.revisionTimestamp,
    lastModifiedText: metadata.lastModifiedText,
    fetchedAt: new Date().toISOString(),
    html
  };
}

export async function fetchWikiRenderedHtml({
  pageTitle,
  apiUrl = DEFAULT_WIKI_API_URL
} = {}) {
  const url = new URL(apiUrl);
  url.searchParams.set('action', 'parse');
  url.searchParams.set('page', pageTitle);
  url.searchParams.set('prop', 'text');
  url.searchParams.set('redirects', '1');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('format', 'json');
  const body = await fetchWikiApiJson({
    url,
    profile: 'parse',
    sourceKey: pageTitle
  });
  return String(body?.parse?.text ?? '');
}

export async function fetchWikiPageSections({
  pageTitle,
  apiUrl = DEFAULT_WIKI_API_URL
} = {}) {
  const url = new URL(apiUrl);
  url.searchParams.set('action', 'parse');
  url.searchParams.set('page', pageTitle);
  url.searchParams.set('prop', 'sections');
  url.searchParams.set('redirects', '1');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('format', 'json');
  const body = await fetchWikiApiJson({
    url,
    profile: 'parse',
    sourceKey: pageTitle
  });
  return Array.isArray(body?.parse?.sections) ? body.parse.sections : [];
}

export async function fetchWikiPageMetadataBatch({
  titles,
  apiUrl = DEFAULT_WIKI_API_URL,
  includeLanglinks = false,
  langlinksLanguage = 'zh',
  batchSize = 50,
  fetchWikiApiJsonImpl = fetchWikiApiJson
} = {}) {
  const requestedTitles = [...new Set((Array.isArray(titles) ? titles : []).map((title) => String(title ?? '').trim()).filter(Boolean))];
  if (requestedTitles.length === 0) {
    return [];
  }

  const pages = [];
  for (const batch of chunkArray(requestedTitles, batchSize)) {
    const url = new URL(apiUrl);
    url.searchParams.set('action', 'query');
    url.searchParams.set('titles', batch.join('|'));
    url.searchParams.set('prop', includeLanglinks ? 'revisions|langlinks' : 'revisions');
    url.searchParams.set('rvprop', 'timestamp|ids');
    url.searchParams.set('redirects', '1');
    if (includeLanglinks) {
      url.searchParams.set('lllang', langlinksLanguage);
    }
    url.searchParams.set('formatversion', '2');
    url.searchParams.set('format', 'json');

    const body = await fetchWikiApiJsonImpl({
      url,
      profile: 'revision',
      sourceKey: batch[0]
    });
    const rawPages = Array.isArray(body?.query?.pages) ? body.query.pages : [];
    const redirectTargetBySource = new Map(
      (Array.isArray(body?.query?.redirects) ? body.query.redirects : [])
        .map((redirect) => [
          String(redirect?.from ?? '').trim().toLowerCase(),
          String(redirect?.to ?? '').trim().toLowerCase()
        ])
        .filter(([from, to]) => from && to)
    );
    const pageByTitle = new Map(rawPages.map((page) => [String(page?.title ?? '').trim().toLowerCase(), page]));
    for (const requestedTitle of batch) {
      const requestedKey = String(requestedTitle).trim().toLowerCase();
      const redirectedKey = redirectTargetBySource.get(requestedKey);
      const matchedPage = pageByTitle.get(redirectedKey)
        ?? pageByTitle.get(requestedKey)
        ?? rawPages.find((page) => page?.missing && String(page?.title ?? '').trim().toLowerCase() === requestedKey)
        ?? null;
      pages.push({
        ...matchedPage,
        requestedTitle
      });
    }
  }

  return pages.map((page) => {
    const revision = page?.revisions?.[0];
    return {
      missing: Boolean(page?.missing),
      pageId: page?.pageid ?? null,
      pageTitle: page?.title ?? null,
      redirectTarget: page?.redirect ?? null,
      requestedTitle: page?.requestedTitle ?? page?.title ?? null,
      revisionId: revision?.revid ?? null,
      revisionTimestamp: revision?.timestamp ?? null,
      zhTitle: includeLanglinks ? page?.langlinks?.find((entry) => entry?.lang === langlinksLanguage)?.title ?? null : null
    };
  });
}

export function getWikiRequestGateState() {
  return wikiRequestGate.getStateSnapshot();
}

export function clearWikiRequestGateCooldown() {
  wikiRequestGate.clearCooldown();
}

function extractWikiHtmlMetadata(html) {
  const pageTitle = extractEmbeddedJsonString(html, 'wgTitle');
  const pageName = extractEmbeddedJsonString(html, 'wgPageName');
  const pageId = extractEmbeddedNumber(html, 'wgArticleId');
  const revisionId = extractEmbeddedNumber(html, 'wgRevisionId');
  const lastModifiedText = extractFooterLastModifiedText(html);

  return {
    pageTitle,
    pageName,
    pageId,
    revisionId,
    revisionTimestamp: parseFooterLastModifiedTimestamp(lastModifiedText),
    lastModifiedText
  };
}

function extractEmbeddedJsonString(html, key) {
  if (typeof html !== 'string' || typeof key !== 'string' || key.trim() === '') {
    return null;
  }

  const pattern = new RegExp(`"${escapeRegExp(key)}":"((?:\\\\.|[^"\\\\])*)"`);
  const match = html.match(pattern);
  if (!match) {
    return null;
  }

  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return null;
  }
}

function extractEmbeddedNumber(html, key) {
  if (typeof html !== 'string' || typeof key !== 'string' || key.trim() === '') {
    return null;
  }

  const pattern = new RegExp(`"${escapeRegExp(key)}":(-?\\d+)`);
  const match = html.match(pattern);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function extractFooterLastModifiedText(html) {
  if (typeof html !== 'string') {
    return null;
  }

  const match = html.match(/<li id="footer-info-lastmod">\s*([\s\S]*?)<\/li>/i);
  if (!match) {
    return null;
  }

  const text = match[1]
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text === '' ? null : text;
}

function parseFooterLastModifiedTimestamp(lastModifiedText) {
  const text = String(lastModifiedText ?? '').trim();
  if (!text) {
    return null;
  }

  const zhMatch = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日.*?(\d{1,2}):(\d{2})/);
  if (zhMatch) {
    return buildLocalTimestamp(zhMatch[1], zhMatch[2], zhMatch[3], zhMatch[4], zhMatch[5]);
  }

  const enMatch = text.match(/(\d{1,2}) ([A-Za-z]+) (\d{4}),? at (\d{1,2}):(\d{2})/i);
  if (enMatch) {
    const month = EN_MONTH_MAP[enMatch[2].toLowerCase()];
    if (month) {
      return buildLocalTimestamp(enMatch[3], month, enMatch[1], enMatch[4], enMatch[5]);
    }
  }

  return null;
}

function buildLocalTimestamp(year, month, day, hour, minute) {
  return [
    String(year).padStart(4, '0'),
    '-',
    String(month).padStart(2, '0'),
    '-',
    String(day).padStart(2, '0'),
    'T',
    String(hour).padStart(2, '0'),
    ':',
    String(minute).padStart(2, '0'),
    ':00'
  ].join('');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const EN_MONTH_MAP = {
  january: '01',
  february: '02',
  march: '03',
  april: '04',
  may: '05',
  june: '06',
  july: '07',
  august: '08',
  september: '09',
  october: '10',
  november: '11',
  december: '12'
};
