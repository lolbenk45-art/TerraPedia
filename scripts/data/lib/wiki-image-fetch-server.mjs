import http from 'node:http';
import { createWikiRequestGate } from './wiki-request-gate.mjs';

const DEFAULT_PORT = 18099;

export async function fetchWikiImageThroughGate({
  url,
  gate = createWikiRequestGate()
} = {}) {
  const sourceUrl = normalizeSourceUrl(url);
  if (!isSupportedWikiImageUrl(sourceUrl)) {
    throw new Error(`Unsupported wiki image URL: ${sourceUrl}`);
  }

  const effectiveUrl = isTerrariaWikiFilePageUrl(sourceUrl)
    ? await resolveWikiFileImageUrl({ url: sourceUrl, gate })
    : sourceUrl;
  const response = await gate.runBinaryRequest(effectiveUrl, {
    profile: 'page',
    sourceKey: effectiveUrl,
    timeoutMs: 30_000
  });

  return {
    ...response,
    sourceUrl: effectiveUrl
  };
}

export function createWikiImageFetchServer({
  gate = createWikiRequestGate()
} = {}) {
  return http.createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/fetch-image') {
      response.writeHead(404);
      response.end();
      return;
    }

    try {
      const requestBody = await readRequestBody(request);
      const payload = JSON.parse(requestBody || '{}');
      const result = await fetchWikiImageThroughGate({ url: payload.url, gate });
      const headers = {
        'content-type': result.headers['content-type'] || 'application/octet-stream',
        'x-terrapedia-source-url': result.sourceUrl
      };
      response.writeHead(result.status, result.statusText, headers);
      response.end(result.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      response.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
      response.end(`${JSON.stringify({ error: message })}\n`);
    }
  });
}

async function resolveWikiFileImageUrl({ url, gate }) {
  const fileTitle = extractWikiFileTitle(url);
  if (!fileTitle) {
    throw new Error(`Unable to resolve wiki File title from URL: ${url}`);
  }
  const apiUrl = new URL('https://terraria.wiki.gg/api.php');
  apiUrl.searchParams.set('action', 'query');
  apiUrl.searchParams.set('redirects', '1');
  apiUrl.searchParams.set('prop', 'imageinfo');
  apiUrl.searchParams.set('iiprop', 'url|mime');
  apiUrl.searchParams.set('format', 'json');
  apiUrl.searchParams.set('titles', `File:${fileTitle}`);

  const payload = await gate.runJsonRequest(apiUrl, {
    profile: 'revision',
    sourceKey: `File:${fileTitle}`
  });
  const pages = payload?.query?.pages;
  const pageList = Array.isArray(pages) ? pages : Object.values(pages ?? {});
  for (const page of pageList) {
    const imageUrl = page?.imageinfo?.[0]?.url;
    if (isSupportedWikiImageUrl(imageUrl)) {
      return normalizeSourceUrl(imageUrl);
    }
  }
  throw new Error(`Wiki File page did not resolve to an image URL: ${url}`);
}

function extractWikiFileTitle(url) {
  const parsed = new URL(url);
  const match = parsed.pathname.match(/\/wiki\/File:(.+)$/i);
  if (!match) {
    return null;
  }
  return decodeURIComponent(match[1].split(/[?#]/, 1)[0]).replaceAll('_', ' ');
}

function normalizeSourceUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('url is required');
  }
  return new URL(value).toString();
}

function isSupportedWikiImageUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return false;
  }
  const parsed = new URL(value);
  const host = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname.toLowerCase();
  return host === 'terraria.wiki.gg' && (pathname.startsWith('/images/') || pathname.startsWith('/wiki/file:'));
}

function isTerrariaWikiFilePageUrl(value) {
  const parsed = new URL(value);
  return parsed.hostname.toLowerCase() === 'terraria.wiki.gg'
    && parsed.pathname.toLowerCase().startsWith('/wiki/file:');
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 32_768) {
        request.destroy(new Error('Request body too large'));
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.TERRAPEDIA_WIKI_IMAGE_FETCH_PORT || DEFAULT_PORT);
  const server = createWikiImageFetchServer();
  server.listen(port, '127.0.0.1', () => {
    console.log(`TerraPedia wiki image fetch gate listening on http://127.0.0.1:${port}/fetch-image`);
  });
}
