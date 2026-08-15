#!/usr/bin/env node

import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_WIKI_API_URL,
  fetchWikiApiJson,
  parseCliArgs,
  writeJson
} from '../lib/wiki-item-utils.mjs';

export const DEFAULT_LANGLINK_BATCH_SIZE = 8;

export async function fetchShimmerLanglinks(
  { titles, apiUrl, batchSize = DEFAULT_LANGLINK_BATCH_SIZE, onPhase } = {},
  { fetchJson = fetchWikiApiJson } = {}
) {
  const requestedTitles = freezeTitleList(titles);
  const limit = positiveInteger(batchSize, DEFAULT_LANGLINK_BATCH_SIZE);
  const byRequested = new Map(requestedTitles.map((title) => [title, blankRecord(title)]));
  const responseHashes = [];

  for (let offset = 0; offset < requestedTitles.length; offset += limit) {
    const batch = requestedTitles.slice(offset, offset + limit);
    onPhase?.({
      phase: 'fetch_langlinks',
      current: offset,
      total: requestedTitles.length,
      batchSize: batch.length
    });
    const response = await fetchJson({
      url: buildLanglinkUrl(batch, apiUrl),
      profile: 'langlinks',
      sourceKey: `shimmer-langlinks:${batch[0]}`
    });
    const responseSha256 = sha256Canonical(response);
    responseHashes.push(responseSha256);
    applyBatchResponse({ batch, response, responseSha256, byRequested });
  }

  const records = requestedTitles.map((title) => byRequested.get(title));
  return {
    entity: 'wiki_shimmer_langlink_evidence',
    apiUrl: String(apiUrl ?? ''),
    batchSize: limit,
    requestedTitles,
    records,
    summary: {
      total: records.length,
      resolved: records.filter((record) => record.status === 'resolved').length,
      unresolved: records.filter((record) => record.status === 'unresolved').length
    },
    responseSha256: sha256Canonical(responseHashes)
  };
}

function applyBatchResponse({ batch, response, responseSha256, byRequested }) {
  const redirectByFrom = new Map(
    (response?.query?.redirects ?? [])
      .map((entry) => [normalizeTitle(entry?.from), normalizeTitle(entry?.to)])
      .filter(([from, to]) => from && to)
  );
  const pageByTitle = new Map(
    (response?.query?.pages ?? [])
      .map((page) => [normalizeTitle(page?.title), page])
      .filter(([title]) => title)
  );

  for (const requestedTitle of batch) {
    const resolvedTitle = redirectByFrom.get(requestedTitle) ?? requestedTitle;
    const page = pageByTitle.get(resolvedTitle) ?? null;
    const nameEn = normalizeTitle(
      (page?.langlinks ?? []).find((entry) => entry?.lang === 'en' || entry?.lang === undefined)?.title
    );
    const missing = !page || page.missing === true;
    byRequested.set(requestedTitle, {
      requestedTitle,
      resolvedTitle: page ? normalizeTitle(page.title) ?? resolvedTitle : resolvedTitle,
      redirectSource: redirectByFrom.has(requestedTitle) ? requestedTitle : null,
      nameEn: missing ? null : nameEn,
      pageId: missing ? null : (page.pageid ?? null),
      revisionId: missing ? null : (page.revisions?.[0]?.revid ?? null),
      status: !missing && nameEn ? 'resolved' : 'unresolved',
      responseSha256
    });
  }
}

function blankRecord(requestedTitle) {
  return {
    requestedTitle,
    resolvedTitle: requestedTitle,
    redirectSource: null,
    nameEn: null,
    pageId: null,
    revisionId: null,
    status: 'unresolved',
    responseSha256: null
  };
}

function buildLanglinkUrl(batch, apiUrl) {
  const url = new URL(String(apiUrl ?? DEFAULT_WIKI_API_URL));
  url.searchParams.set('action', 'query');
  url.searchParams.set('titles', batch.join('|'));
  url.searchParams.set('prop', 'langlinks|revisions');
  url.searchParams.set('lllang', 'en');
  url.searchParams.set('lllimit', 'max');
  url.searchParams.set('rvprop', 'ids');
  url.searchParams.set('redirects', '1');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('format', 'json');
  return url;
}

function freezeTitleList(titles) {
  const unique = new Set();
  for (const title of Array.isArray(titles) ? titles : []) {
    const text = normalizeTitle(title);
    if (text) unique.add(text);
  }
  return [...unique].sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
}

function normalizeTitle(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || null;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sha256Canonical(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseCliArgs(process.argv.slice(2));
  const titlesPath = options.titles;
  if (!titlesPath) {
    throw new Error('--titles=<frozen-title-list.json> is required');
  }
  const { readFileSync } = await import('node:fs');
  const payload = JSON.parse(readFileSync(path.resolve(titlesPath), 'utf8'));
  const evidence = await fetchShimmerLanglinks({
    titles: Array.isArray(payload) ? payload : payload.titles ?? payload.records,
    apiUrl: options.api ?? DEFAULT_WIKI_API_URL.replace('/api.php', '/zh/api.php'),
    batchSize: options['batch-size'],
    onPhase: (event) => console.error(JSON.stringify(event))
  });
  writeJson(path.resolve(options.output ?? 'data/generated/wiki-shimmer-langlinks.latest.json'), evidence);
  console.log(JSON.stringify(evidence.summary, null, 2));
}
