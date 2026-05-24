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
import { getProjectRoot } from '../lib/project-root.mjs';
import {
  buildActionProgressPayload,
  writeJsonFile
} from '../workflow/backend-refresh-runtime-state.mjs';

const repoRoot = getProjectRoot();
const ACTION_ID = 'domain-source-shimmer';
const DEFAULT_PROGRESS_PATH = path.join(repoRoot, 'data', 'generated', 'domain-source-shimmer-progress.latest.json');
const DEFAULT_OUTPUT_PATH = path.join(repoRoot, 'data', 'generated', 'wiki-shimmer.latest.json');

await main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const generatedAt = new Date().toISOString();
  const dateTag = generatedAt.slice(0, 10);
  const pageTitle = options.page ?? '\u5fae\u5149';
  const apiUrl = options.api ?? DEFAULT_WIKI_API_URL.replace('/api.php', '/zh/api.php');
  const outputPath = path.resolve(options.output ?? DEFAULT_OUTPUT_PATH);
  const reportPath = path.resolve(options['report-output'] ?? path.join(repoRoot, 'reports', `wiki-shimmer-summary-${dateTag}.md`));
  const progressPath = path.resolve(options['progress-path'] ?? process.env.TERRAPEDIA_CRAWLER_PROGRESS_PATH ?? DEFAULT_PROGRESS_PATH);
  const canonicalProgressPath = path.resolve(DEFAULT_PROGRESS_PATH);

  const writeProgress = (progress) => {
    const progressPayload = {
      startedAt: generatedAt,
      outputPath,
      reportPath,
      ...progress,
      generatedAt: progress.generatedAt ?? new Date().toISOString()
    };
    writeJsonFile(progressPath, buildShimmerProgressPayload({
      ...progressPayload,
      progressPath
    }));
    if (shouldMirrorProgressPath(progressPath, canonicalProgressPath)) {
      writeJsonFile(canonicalProgressPath, buildShimmerProgressPayload({
        ...progressPayload,
        progressPath: canonicalProgressPath
      }));
    }
  };

  writeProgress({
    status: 'running',
    phase: 'start',
    message: 'starting shimmer source fetch',
    current: 0,
    total: 3
  });

  try {
    const revision = await fetchRevision(pageTitle, apiUrl);
    writeProgress({
      status: 'running',
      phase: 'revision',
      message: `fetched shimmer revision for ${revision.pageTitle}`,
      current: 1,
      total: 3
    });
    const sections = await fetchSections(pageTitle, apiUrl);
    writeProgress({
      status: 'running',
      phase: 'sections',
      message: `fetched shimmer sections for ${pageTitle}`,
      current: 2,
      total: 3
    });
    const html = await fetchRenderedHtml(pageTitle, apiUrl);
    writeProgress({
      status: 'running',
      phase: 'html',
      message: `fetched shimmer rendered HTML for ${pageTitle}`,
      current: 3,
      total: 3
    });

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

    writeProgress({
      status: 'completed',
      phase: 'write',
      message: `finished shimmer source fetch; sections=${payload.sections.length}`,
      current: 3,
      total: 3
    });

    console.log(JSON.stringify({
      outputPath,
      reportPath,
      pageTitle: payload.pageTitle,
      pageId: payload.pageId,
      revisionTimestamp: payload.revisionTimestamp,
      sectionCount: payload.sections.length,
      htmlLength: payload.html.length
    }, null, 2));
  } catch (error) {
    writeProgress({
      status: 'failed',
      phase: 'error',
      message: error instanceof Error ? error.message : String(error),
      current: 0,
      total: 3,
      nextStep: 'check wiki shimmer page source availability'
    });
    throw error;
  }
}

function buildShimmerProgressPayload({
  status,
  phase,
  message,
  current,
  total,
  startedAt,
  progressPath,
  outputPath,
  reportPath,
  nextStep = null,
  generatedAt = new Date().toISOString()
} = {}) {
  const payload = buildActionProgressPayload({
    actionId: ACTION_ID,
    status,
    phase,
    message,
    current,
    total,
    startedAt,
    overallCurrent: current,
    overallTotal: total,
    generatedAt,
    lastHeartbeatAt: generatedAt,
    childStatusPath: progressPath
  });
  payload.outputPath = outputPath ?? null;
  payload.reportPath = reportPath ?? null;
  if (nextStep) payload.nextStep = nextStep;
  return payload;
}

function shouldMirrorProgressPath(progressPath, canonicalProgressPath) {
  if (path.resolve(progressPath) === path.resolve(canonicalProgressPath)) {
    return false;
  }
  return process.env.NODE_ENV !== 'test' || Boolean(process.env.WORKTREE_ROOT);
}

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
