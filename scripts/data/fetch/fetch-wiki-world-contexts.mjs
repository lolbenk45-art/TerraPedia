#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getProjectRoot } from '../lib/project-root.mjs';
import {
  buildWikiPageUrl,
  fetchWikiPagePayload,
  parseCliArgs,
  sharedDataPath
} from '../lib/wiki-item-utils.mjs';
import {
  extractIntroParagraphs,
  extractItemInfoboxImages
} from '../lib/wiki-page-utils.mjs';
import {
  buildActionProgressPayload,
  writeJsonFile
} from '../workflow/backend-refresh-runtime-state.mjs';

export const WORLD_CONTEXT_SOURCE_PAGES = [
  { title: 'Day and night cycle', domain: 'time' },
  { title: 'Moon phase', domain: 'moon_phase' },
  { title: 'Events', domain: 'event' },
  { title: 'Weather', domain: 'weather' },
  { title: 'Snow biome', domain: 'environment' },
  { title: 'Graveyard', domain: 'environment' },
  { title: 'Shimmer', domain: 'environment' }
];

const __filename = fileURLToPath(import.meta.url);
const repoRoot = getProjectRoot();
const DEFAULT_PROGRESS_PATH = sharedDataPath('generated', 'wiki-world-contexts-progress.latest.json');
const DEFAULT_OUTPUT_PATH = sharedDataPath('generated', 'wiki-world-contexts.latest.json');

export function buildWorldContextProgressPayload({
  actionId,
  status,
  phase,
  message,
  current,
  total,
  startedAt,
  progressPath,
  generatedAt = new Date().toISOString(),
  outputPath = null,
  reportPath = null
} = {}) {
  const payload = buildActionProgressPayload({
    actionId,
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
  payload.queue = 'wiki world contexts refresh';
  payload.dataStage = 'wiki pages -> generated world context source';
  payload.nextStep = 'transform wiki-world-contexts.latest.json to importable world contexts';
  if (outputPath) payload.outputPath = outputPath;
  if (reportPath) payload.reportPath = reportPath;
  return payload;
}

export async function fetchWorldContextSources({
  pages = WORLD_CONTEXT_SOURCE_PAGES,
  fetchWikiPagePayloadImpl = fetchWikiPagePayload,
  onProgress = () => {}
} = {}) {
  const records = [];
  const unresolved = [];
  for (let index = 0; index < pages.length; index += 1) {
    const source = pages[index];
    const current = index + 1;
    onProgress({
      status: 'running',
      phase: 'fetch',
      message: `fetching ${source.title}`,
      current,
      total: pages.length
    });
    try {
      const page = await fetchWikiPagePayloadImpl({ pageTitle: source.title });
      records.push(toSourceRecord(source, page));
    } catch (error) {
      unresolved.push({
        requestedTitle: source.title,
        domain: source.domain,
        error: String(error?.message ?? error)
      });
    }
  }
  return { records, unresolved };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const generatedAt = new Date().toISOString();
  const dateTag = generatedAt.slice(0, 10);
  const outputPath = path.resolve(process.cwd(), options['output-json'] ?? DEFAULT_OUTPUT_PATH);
  const reportPath = path.resolve(process.cwd(), options['report-md'] ?? path.join(repoRoot, 'reports', `wiki-world-contexts-summary-${dateTag}.md`));
  const progressPath = path.resolve(process.cwd(), options['progress-path'] ?? process.env.TERRAPEDIA_CRAWLER_PROGRESS_PATH ?? DEFAULT_PROGRESS_PATH);
  const actionId = process.env.TERRAPEDIA_CRAWLER_ACTION_ID ?? 'world-contexts-refresh';

  const writeProgress = (progress) => {
    writeJsonFile(progressPath, buildWorldContextProgressPayload({
      actionId,
      startedAt: generatedAt,
      progressPath,
      ...progress
    }));
  };

  writeProgress({
    status: 'running',
    phase: 'start',
    message: 'starting world context source fetch',
    current: 0,
    total: WORLD_CONTEXT_SOURCE_PAGES.length
  });

  const { records, unresolved } = await fetchWorldContextSources({
    onProgress: writeProgress
  });

  const payload = {
    entity: 'wiki_world_contexts',
    generatedAt,
    sourceProvider: 'wiki_gg',
    pages: records,
    unresolved,
    summary: {
      requestedPageCount: WORLD_CONTEXT_SOURCE_PAGES.length,
      fetchedPageCount: records.length,
      unresolvedPageCount: unresolved.length
    }
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.writeFileSync(reportPath, buildMarkdown(payload), 'utf8');

  writeProgress({
    status: unresolved.length > 0 ? 'failed' : 'completed',
    phase: 'write',
    message: `finished world context fetch; pages=${records.length}; unresolved=${unresolved.length}`,
    current: WORLD_CONTEXT_SOURCE_PAGES.length,
    total: WORLD_CONTEXT_SOURCE_PAGES.length,
    outputPath,
    reportPath
  });

  console.log(JSON.stringify({
    outputPath,
    reportPath,
    fetchedPageCount: records.length,
    unresolvedPageCount: unresolved.length
  }, null, 2));

  if (unresolved.length > 0) {
    process.exitCode = 1;
  }
}

function toSourceRecord(source, page) {
  const html = String(page?.html ?? '');
  const intro = extractIntroParagraphs(html)[0] ?? null;
  const image = extractItemInfoboxImages(html)[0] ?? null;
  const title = page?.pageTitle ?? page?.title ?? source.title;
  return {
    requestedTitle: source.title,
    domain: source.domain,
    title,
    pageId: page?.pageId ?? null,
    revisionId: page?.revisionId ?? null,
    revisionTimestamp: page?.revisionTimestamp ?? null,
    fetchedAt: page?.fetchedAt ?? new Date().toISOString(),
    sourceUrl: buildWikiPageUrl({ pageTitle: title }),
    intro,
    sections: Array.isArray(page?.sections)
      ? page.sections.map(section => ({
          level: section?.level ?? null,
          line: section?.line ?? null,
          anchor: section?.anchor ?? null
        }))
      : [],
    iconUrl: image?.url ?? null
  };
}

function buildMarkdown(payload) {
  const lines = [
    '# Wiki World Context Source Summary',
    '',
    `- Generated At: \`${payload.generatedAt}\``,
    `- Source Provider: \`${payload.sourceProvider}\``,
    `- Fetched Pages: \`${payload.summary.fetchedPageCount}\``,
    `- Unresolved Pages: \`${payload.summary.unresolvedPageCount}\``,
    ''
  ];
  for (const page of payload.pages) {
    lines.push(`## ${page.requestedTitle}`);
    lines.push('');
    lines.push(`- Resolved Title: \`${page.title}\``);
    lines.push(`- Revision: \`${page.revisionTimestamp ?? 'unknown'}\``);
    lines.push(`- URL: ${page.sourceUrl}`);
    if (page.intro) lines.push(`- Intro: ${page.intro}`);
    lines.push('');
  }
  if (payload.unresolved.length > 0) {
    lines.push('## Unresolved');
    lines.push('');
    for (const entry of payload.unresolved) {
      lines.push(`- ${entry.requestedTitle}: ${entry.error}`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
