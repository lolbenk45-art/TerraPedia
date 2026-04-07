import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const DEFAULT_WIKI_API_URL = 'https://terraria.wiki.gg/api.php';
export const DEFAULT_MODULE_TITLE = 'Module:Iteminfo/data';
const DEFAULT_USER_AGENT = 'TerraPedia V1-data sync/1.0';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
export const DEFAULT_SHARED_DATA_ROOT = path.join(WORKSPACE_ROOT, 'data', 'terraPedia');

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

  const response = await fetch(url, {
    headers: {
      'user-agent': DEFAULT_USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`Wiki API request failed: ${response.status} ${response.statusText}`);
  }

  const body = await response.json();
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

  const parseUrl = new URL(apiUrl);
  parseUrl.searchParams.set('action', 'parse');
  parseUrl.searchParams.set('page', pageTitle);
  parseUrl.searchParams.set('prop', 'wikitext|text');
  parseUrl.searchParams.set('format', 'json');
  parseUrl.searchParams.set('formatversion', '2');

  const parseResponse = await fetch(parseUrl, {
    headers: {
      'user-agent': DEFAULT_USER_AGENT
    }
  });

  if (!parseResponse.ok) {
    throw new Error(`Wiki parse request failed: ${parseResponse.status} ${parseResponse.statusText}`);
  }

  const parseBody = await parseResponse.json();
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

  const response = await fetch(url, {
    headers: {
      'user-agent': DEFAULT_USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`Wiki revision request failed: ${response.status} ${response.statusText}`);
  }

  const body = await response.json();
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

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'user-agent': DEFAULT_USER_AGENT
    },
    body: new URLSearchParams({ text })
  });

  if (!response.ok) {
    throw new Error(`Expandtemplates failed: ${response.status} ${response.statusText}`);
  }

  const body = await response.json();
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

  const response = await fetch(url, {
    headers: {
      'user-agent': DEFAULT_USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`Imageinfo request failed: ${response.status} ${response.statusText}`);
  }

  const body = await response.json();
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
