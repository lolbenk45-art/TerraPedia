#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {
  DEFAULT_WIKI_API_URL,
  ensureDir,
  fetchWikiApiJson,
  parseCliArgs,
  writeJson
} from '../lib/wiki-item-utils.mjs';

const repoRoot = process.cwd();
const options = parseCliArgs(process.argv.slice(2));
const generatedAt = new Date().toISOString();
const dateTag = generatedAt.slice(0, 10);
const pageTitle = options.page ?? '\u5fae\u5149';
const apiUrl = options.api ?? DEFAULT_WIKI_API_URL.replace('/api.php', '/zh/api.php');
const outputPath = path.resolve(options.output ?? path.join(repoRoot, 'data', 'generated', 'wiki-shimmer.latest.json'));
const reportPath = path.resolve(options['report-output'] ?? path.join(repoRoot, 'reports', `wiki-shimmer-summary-${dateTag}.md`));

const revision = await fetchRevision(pageTitle, apiUrl);
const sections = await fetchSections(pageTitle, apiUrl);
const html = await fetchRenderedHtml(pageTitle, apiUrl);

const payload = {
  entity: 'wiki_shimmer_page',
  generatedAt,
  sourceApi: apiUrl,
  requestedPageTitle: pageTitle,
  pageTitle: revision.pageTitle,
  pageId: revision.pageId,
  revisionId: revision.revisionId,
  revisionTimestamp: revision.revisionTimestamp,
  fetchedAt: generatedAt,
  sections,
  wikitext: revision.wikitext,
  html
};

writeJson(outputPath, payload);
ensureDir(path.dirname(reportPath));
fs.writeFileSync(reportPath, buildMarkdown(payload), 'utf8');

console.log(JSON.stringify({
  outputPath,
  reportPath,
  pageTitle: payload.pageTitle,
  pageId: payload.pageId,
  revisionTimestamp: payload.revisionTimestamp,
  sectionCount: payload.sections.length,
  htmlLength: payload.html.length
}, null, 2));

async function fetchRevision(title, wikiApiUrl) {
  const url = new URL(wikiApiUrl);
  url.searchParams.set('action', 'query');
  url.searchParams.set('titles', title);
  url.searchParams.set('prop', 'revisions');
  url.searchParams.set('rvprop', 'timestamp|ids|content');
  url.searchParams.set('redirects', '1');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('format', 'json');

  const body = await fetchWikiApiJson({ url, profile: 'revision', sourceKey: title });
  const page = body?.query?.pages?.[0];
  const revision = page?.revisions?.[0];
  if (!page || page.missing || !revision || typeof revision.content !== 'string') {
    throw new Error(`Wiki revision content missing for ${title}`);
  }

  return {
    pageTitle: page.title ?? title,
    pageId: page.pageid ?? null,
    revisionId: revision.revid ?? null,
    revisionTimestamp: revision.timestamp ?? null,
    wikitext: revision.content
  };
}

async function fetchSections(title, wikiApiUrl) {
  const url = new URL(wikiApiUrl);
  url.searchParams.set('action', 'parse');
  url.searchParams.set('page', title);
  url.searchParams.set('prop', 'sections');
  url.searchParams.set('redirects', '1');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('format', 'json');

  const body = await fetchWikiApiJson({ url, profile: 'parse', sourceKey: `${title}:sections` });
  return Array.isArray(body?.parse?.sections) ? body.parse.sections : [];
}

async function fetchRenderedHtml(title, wikiApiUrl) {
  const url = new URL(wikiApiUrl);
  url.searchParams.set('action', 'parse');
  url.searchParams.set('page', title);
  url.searchParams.set('prop', 'text');
  url.searchParams.set('redirects', '1');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('format', 'json');

  const body = await fetchWikiApiJson({ url, profile: 'parse', sourceKey: `${title}:html` });
  const html = body?.parse?.text;
  if (typeof html !== 'string' || html.trim() === '') {
    throw new Error(`Wiki rendered HTML missing for ${title}`);
  }
  return html;
}

function buildMarkdown(payload) {
  const lines = [];
  lines.push('# Wiki Shimmer Raw Snapshot');
  lines.push('');
  lines.push(`- Generated at: \`${payload.generatedAt}\``);
  lines.push(`- Source API: \`${payload.sourceApi}\``);
  lines.push(`- Page title: \`${payload.pageTitle}\``);
  lines.push(`- Page ID: \`${payload.pageId}\``);
  lines.push(`- Revision ID: \`${payload.revisionId}\``);
  lines.push(`- Revision timestamp: \`${payload.revisionTimestamp}\``);
  lines.push(`- Section count: \`${payload.sections.length}\``);
  lines.push(`- HTML length: \`${payload.html.length}\``);
  lines.push('');
  lines.push('## Sections');
  lines.push('');
  for (const section of payload.sections) {
    lines.push(`- ${section.number} | level=${section.level} | ${section.line}`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}
