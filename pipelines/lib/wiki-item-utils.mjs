import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { randomBytes } from 'node:crypto';

import { createWikiRequestGate } from './wiki-request-gate.mjs';
import { getProjectRoot, resolveSharedDataRoot } from './project-root.mjs';
import { WIKI_USER_AGENT } from './wiki-user-agent.mjs';

export { reportHeartbeat } from './crawler-heartbeat.mjs';

export const DEFAULT_WIKI_API_URL = 'https://terraria.wiki.gg/api.php';
export const DEFAULT_MODULE_TITLE = 'Module:Iteminfo/data';
export const DEFAULT_WIKI_USER_AGENT = WIKI_USER_AGENT;
export const WORKSPACE_ROOT = getProjectRoot();
export const DEFAULT_SHARED_DATA_ROOT = resolveSharedDataRoot();
const wikiRequestGate = createWikiRequestGate({
  userAgent: DEFAULT_WIKI_USER_AGENT
});
const BOOLEAN_CLI_OPTIONS = new Set([
  'apply',
  'allow-full-corpus',
  'allow-local-item-image-fallback',
  'allow-non-primary-db',
  'allow-unsafe-empty-relation-input',
  'clear-cooldown',
  'create-database',
  'dry-run',
  'fail-on-blocked',
  'fail-on-warning',
  'keep-snapshot',
  'print-checklist',
  'print-sql',
  'regenerate-bundle',
  'resume',
  'skip-buff-page-immunities',
  'strict',
  'with-recipes',
  'write'
]);

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function writeJson(filePath, value) {
  return writeJsonAtomic(filePath, value, { noOverwrite: false });
}

export function writeJsonNoOverwrite(filePath, value) {
  return writeJsonAtomic(filePath, value, { noOverwrite: true });
}

function writeJsonAtomic(filePath, value, { noOverwrite }) {
  const targetPath = path.resolve(String(filePath));
  const parentPath = path.dirname(targetPath);
  const targetName = path.basename(targetPath);
  if (!targetName || targetName === '.' || targetName === path.sep) {
    throw new Error('JSON output path must name a file');
  }

  ensureDirectoryChainNoFollow(parentPath);
  const directoryFd = openDirectoryNoFollow(parentPath);
  const directoryPath = descriptorDirectoryPath(directoryFd);
  const temporaryPath = path.join(
    directoryPath,
    `.${targetName}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`,
  );
  let temporaryFd = null;
  let temporaryCreated = false;
  try {
    const noFollow = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
    temporaryFd = fs.openSync(
      temporaryPath,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | noFollow,
      0o600,
    );
    temporaryCreated = true;
    fs.writeFileSync(temporaryFd, `${JSON.stringify(value, null, 2)}\n`);
    fs.fchmodSync(temporaryFd, 0o600);
    fs.fsyncSync(temporaryFd);
    fs.closeSync(temporaryFd);
    temporaryFd = null;

    const destinationPath = path.join(directoryPath, targetName);
    if (noOverwrite) {
      fs.linkSync(temporaryPath, destinationPath);
      assertPrivateJsonFile(destinationPath);
      fs.unlinkSync(temporaryPath);
      temporaryCreated = false;
    } else {
      fs.renameSync(temporaryPath, destinationPath);
      temporaryCreated = false;
    }
    fs.fsyncSync(directoryFd);
  } catch (error) {
    if (noOverwrite && error?.code === 'EEXIST') {
      throw new Error(`JSON output already exists and cannot be overwritten: ${targetPath}`, { cause: error });
    }
    throw error;
  } finally {
    if (temporaryFd != null) fs.closeSync(temporaryFd);
    if (temporaryCreated) {
      try { fs.unlinkSync(temporaryPath); } catch {}
    }
    fs.closeSync(directoryFd);
  }
}

function ensureDirectoryChainNoFollow(directoryPath) {
  const absolutePath = path.resolve(directoryPath);
  const filesystemRoot = path.parse(absolutePath).root;
  let currentPath = filesystemRoot;
  for (const segment of path.relative(filesystemRoot, absolutePath).split(path.sep).filter(Boolean)) {
    const nextPath = path.join(currentPath, segment);
    let stats;
    try {
      stats = fs.lstatSync(nextPath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      fs.mkdirSync(nextPath, { mode: 0o700 });
      stats = fs.lstatSync(nextPath);
    }
    assertSafeJsonDirectory(stats, nextPath);
    currentPath = nextPath;
  }
}

function openDirectoryNoFollow(directoryPath) {
  if (process.platform !== 'linux'
      || typeof fs.constants.O_DIRECTORY !== 'number'
      || typeof fs.constants.O_NOFOLLOW !== 'number'
      || !fs.existsSync('/proc/self/fd')) {
    throw new Error('secure JSON publication is unavailable on this platform');
  }
  const absolutePath = path.resolve(directoryPath);
  const filesystemRoot = path.parse(absolutePath).root;
  const flags = fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW;
  let directoryFd = fs.openSync(filesystemRoot, flags);
  try {
    assertSafeJsonDirectory(fs.fstatSync(directoryFd), filesystemRoot);
    for (const segment of path.relative(filesystemRoot, absolutePath).split(path.sep).filter(Boolean)) {
      const nextPath = path.join(descriptorDirectoryPath(directoryFd), segment);
      const nextFd = fs.openSync(nextPath, flags);
      assertSafeJsonDirectory(fs.fstatSync(nextFd), path.join(absolutePath, segment));
      fs.closeSync(directoryFd);
      directoryFd = nextFd;
    }
    return directoryFd;
  } catch (error) {
    fs.closeSync(directoryFd);
    throw error;
  }
}

function descriptorDirectoryPath(directoryFd) {
  return `/proc/self/fd/${directoryFd}`;
}

function assertSafeJsonDirectory(stats, directoryPath) {
  if (!stats?.isDirectory?.() || stats.isSymbolicLink?.()) {
    throw new Error(`JSON output parent is not a canonical directory: ${directoryPath}`);
  }
  if ((stats.mode & 0o022) !== 0 && (stats.mode & 0o1000) === 0) {
    throw new Error(`JSON output parent is group/other writable: ${directoryPath}`);
  }
}

function assertPrivateJsonFile(filePath) {
  const noFollow = fs.constants.O_NOFOLLOW;
  const fileFd = fs.openSync(filePath, fs.constants.O_RDONLY | noFollow);
  try {
    const stats = fs.fstatSync(fileFd);
    if (!stats.isFile() || (stats.mode & 0o077) !== 0) {
      throw new Error(`JSON output must be an owner-only regular file: ${filePath}`);
    }
  } finally {
    fs.closeSync(fileFd);
  }
}

export function sharedDataPath(...segments) {
  return path.join(DEFAULT_SHARED_DATA_ROOT, ...segments);
}

export function parseCliArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      continue;
    }
    const option = arg.slice(2);
    const separatorIndex = option.indexOf('=');
    if (separatorIndex === -1) {
      const nextArg = argv[index + 1];
      const booleanOptionKeepsNextArg = BOOLEAN_CLI_OPTIONS.has(option)
        && nextArg != null
        && !['true', 'false'].includes(String(nextArg).toLowerCase());
      if (nextArg && !nextArg.startsWith('--') && !booleanOptionKeepsNextArg) {
        options[option] = nextArg;
        index += 1;
      } else {
        options[option] = true;
      }
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

  const body = await fetchWikiApiJson({
    url,
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
  apiUrl = DEFAULT_WIKI_API_URL,
  requireRevisionBinding = false,
  fetchWikiApiJsonImpl = fetchWikiApiJson
} = {}) {
  if (typeof pageTitle !== 'string' || pageTitle.trim() === '') {
    throw new Error('pageTitle is required');
  }

  const parseUrl = buildWikiPageParseUrl({ pageTitle, apiUrl });
  let selectedRevision = null;
  let selectedPage = null;
  if (requireRevisionBinding) {
    const metadataUrl = new URL(apiUrl);
    for (const [key, value] of Object.entries({ action: 'query', titles: pageTitle, prop: 'revisions',
      rvprop: 'ids|timestamp', rvslots: 'main', redirects: '1', format: 'json', formatversion: '2' })) {
      metadataUrl.searchParams.set(key, value);
    }
    const metadata = await fetchWikiApiJsonImpl({ url: metadataUrl, profile: 'revision', sourceKey: pageTitle });
    selectedPage = metadata?.query?.pages?.[0];
    selectedRevision = selectedPage?.revisions?.[0];
    if (!Number.isSafeInteger(selectedPage?.pageid) || selectedPage.pageid <= 0
        || !Number.isSafeInteger(selectedRevision?.revid) || selectedRevision.revid <= 0
        || !Number.isFinite(Date.parse(selectedRevision?.timestamp))) {
      throw new Error(`Wiki page revision identity missing for ${pageTitle}`);
    }
    parseUrl.searchParams.delete('page');
    parseUrl.searchParams.set('oldid', String(selectedRevision.revid));
    parseUrl.searchParams.set('prop', 'wikitext|text|sections|revid');
  }

  const parseBody = await fetchWikiApiJsonImpl({
    url: parseUrl,
    profile: 'parse',
    sourceKey: pageTitle
  });
  const parsed = parseBody?.parse;
  if (!parsed?.pageid || typeof parsed?.wikitext !== 'string' || typeof parsed?.text !== 'string') {
    throw new Error(`Wiki page parse result missing for ${pageTitle}`);
  }

  if (selectedRevision && (parsed.revid !== selectedRevision.revid || parsed.pageid !== selectedPage.pageid)) {
    throw new Error(`Wiki page revision binding mismatch for ${pageTitle}`);
  }
  const revisionTimestamp = selectedRevision?.timestamp ?? await fetchWikiPageRevisionTimestamp({
    pageTitle: parsed.title ?? pageTitle,
    apiUrl,
    fetchWikiApiJsonImpl
  });

  return {
    apiUrl,
    requestedPageTitle: pageTitle,
    pageTitle: parsed.title ?? pageTitle,
    pageId: parsed.pageid,
    revisionTimestamp,
    ...(selectedRevision ? { revisionId: selectedRevision.revid } : {}),
    fetchedAt: new Date().toISOString(),
    wikitext: parsed.wikitext,
    html: parsed.text,
    sections: Array.isArray(parsed.sections) ? parsed.sections : []
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
  parseUrl.searchParams.set('prop', 'wikitext|text|sections');
  parseUrl.searchParams.set('format', 'json');
  parseUrl.searchParams.set('formatversion', '2');
  parseUrl.searchParams.set('redirects', '1');
  return parseUrl;
}

export async function fetchWikiPageRevisionTimestamp({
  pageTitle,
  apiUrl = DEFAULT_WIKI_API_URL,
  fetchWikiApiJsonImpl = fetchWikiApiJson
} = {}) {
  const url = new URL(apiUrl);
  url.searchParams.set('action', 'query');
  url.searchParams.set('titles', pageTitle);
  url.searchParams.set('prop', 'revisions');
  url.searchParams.set('rvprop', 'timestamp');
  url.searchParams.set('rvslots', 'main');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');

  const body = await fetchWikiApiJsonImpl({
    url,
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
  url.searchParams.set('iiprop', 'url|size|mime|timestamp');
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
    revisionTimestamp: imageinfo.timestamp ?? null,
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

export function booleanOption(value, fallback = false) {
  if (value == null || value === '') {
    return fallback;
  }
  if (value === true || value === 'true' || value === '1' || value === 'yes' || value === 'on') {
    return true;
  }
  if (value === false || value === 'false' || value === '0' || value === 'no' || value === 'off') {
    return false;
  }
  return fallback;
}

export function shouldKeepSnapshot(options = {}) {
  return booleanOption(options['keep-snapshot'] ?? options.keepSnapshot, false);
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
  if (process.env.NODE_ENV === 'test' && process.env.TERRAPEDIA_WIKI_MOCK_API_RESPONSE) {
    return readMockWikiApiResponse(url);
  }
  return wikiRequestGate.runJsonRequest(url, {
    method,
    headers,
    body,
    profile,
    sourceKey
  });
}

function readMockWikiApiResponse(url) {
  const payload = JSON.parse(fs.readFileSync(process.env.TERRAPEDIA_WIKI_MOCK_API_RESPONSE, 'utf8'));
  if (!payload || !payload.__byRequest) {
    return payload;
  }
  const requestUrl = new URL(String(url));
  const action = requestUrl.searchParams.get('action') || '';
  const prop = requestUrl.searchParams.get('prop') || '';
  const title = requestUrl.searchParams.get('titles') || requestUrl.searchParams.get('page') || '';
  const requestKeys = [
    `${action}:${prop}:${title}`,
    `${action}:*:${title}`,
    `${action}:${title}`,
  ];
  for (const key of requestKeys) {
    if (Object.hasOwn(payload.__byRequest, key)) {
      return payload.__byRequest[key];
    }
  }
  throw new Error(`Missing mock wiki API response for ${action}:${prop}:${title}`);
}

export function isTerrariaWikiUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return false;
  }
  try {
    return new URL(value).hostname.toLowerCase() === 'terraria.wiki.gg';
  } catch {
    return false;
  }
}

export async function fetchWikiUrlText({
  url,
  method = 'GET',
  headers = {},
  body,
  profile = 'page',
  sourceKey = null,
  timeoutMs = 20_000
} = {}) {
  if (!url) {
    throw new Error('url is required');
  }
  return wikiRequestGate.runTextRequest(url, {
    method,
    headers,
    body,
    profile,
    sourceKey,
    timeoutMs
  });
}

export async function fetchWikiUrlJson({
  url,
  method = 'GET',
  headers = {},
  body,
  profile = 'revision',
  sourceKey = null,
  timeoutMs = 20_000
} = {}) {
  if (!url) {
    throw new Error('url is required');
  }
  return wikiRequestGate.runJsonRequest(url, {
    method,
    headers,
    body,
    profile,
    sourceKey,
    timeoutMs
  });
}

export async function fetchWikiUrlBinary({
  url,
  method = 'GET',
  headers = {},
  body,
  profile = 'page',
  sourceKey = null,
  timeoutMs = 30_000
} = {}) {
  if (!url) {
    throw new Error('url is required');
  }
  return wikiRequestGate.runBinaryRequest(url, {
    method,
    headers,
    body,
    profile,
    sourceKey,
    timeoutMs
  });
}

export async function fetchWikiUrlResponse(options = {}) {
  const result = await fetchWikiUrlBinary(options);
  const body = Buffer.from(result.body ?? []);
  return {
    ok: result.status >= 200 && result.status < 300,
    status: result.status,
    statusText: result.statusText,
    headers: {
      get(name) {
        return result.headers?.[String(name).toLowerCase()] ?? null;
      }
    },
    text: async () => body.toString('utf8'),
    json: async () => JSON.parse(body.toString('utf8')),
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)
  };
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
