#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getProjectRoot } from '../lib/project-root.mjs';
import {
  DEFAULT_WIKI_API_URL,
  fetchWikiApiJson,
  parseCliArgs,
  writeJson
} from '../lib/wiki-item-utils.mjs';
import {
  buildActionProgressPayload,
  writeJsonFile
} from '../workflow/backend-refresh-runtime-state.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = getProjectRoot();
const ACTION_ID = 'wiki-monitor-domain-smoke';
const DEFAULT_LIMIT = 10;
const DEFAULT_PROGRESS_PATH = path.join(repoRoot, 'reports', 'crawler-monitor', 'wiki-monitor-domain-smoke-progress.latest.json');
const DEFAULT_LATEST_REPORT_PATH = path.join(repoRoot, 'reports', 'crawler-monitor', 'wiki-monitor-domain-smoke.latest.json');

export const WIKI_MONITOR_DOMAIN_SMOKE_DOMAINS = [
  smokeDomain('items', 'Items', 'wiki.module.iteminfo', ['item', 'incategory:Items']),
  smokeDomain('npcs', 'NPCs', 'wiki.module.npcinfo', ['NPC', 'enemy', 'town NPC']),
  smokeDomain('projectiles', 'Projectiles', 'wiki.module.projectileinfo', ['projectile', 'arrow', 'bullet']),
  smokeDomain('buffs', 'Buffs', 'wiki.page.template_getbuffinfo', ['buff', 'debuff', 'potion buff']),
  smokeDomain('armor_sets', 'Armor sets', 'wiki.module.armorsetbonuses', ['armor', 'helmet', 'breastplate']),
  smokeDomain('recipes', 'Recipes', 'wiki.zh.recipes', ['recipe', 'crafting recipe']),
  smokeDomain('biomes', 'Biomes', 'wiki.page.biomes_anchor', ['biome', 'forest biome', 'desert biome']),
  smokeDomain('bosses', 'Bosses', 'wiki.domain.bosses', ['boss', 'bosses', 'event boss']),
  smokeDomain('town_npc_maintenance', 'Town NPC maintenance', 'wiki.domain.town_npc_maintenance', ['town NPC shop', 'NPC shop', 'happiness']),
  smokeDomain('shimmer', 'Shimmer', 'wiki.domain.shimmer', ['shimmer', 'Aether', 'shimmer transmutation'])
];

export function buildDomainSmokePlan(rawOptions = {}) {
  const generatedAt = new Date().toISOString();
  const runId = String(rawOptions['run-id'] ?? rawOptions.runId ?? `wiki-monitor-domain-smoke-${generatedAt.replaceAll(/[^0-9A-Za-z]+/g, '-')}`).trim();
  const limit = normalizeLimit(rawOptions.limit ?? rawOptions.count, DEFAULT_LIMIT);
  const outputDir = path.resolve(
    repoRoot,
    rawOptions['output-dir'] ?? rawOptions.outputDir ?? path.join('reports', 'crawler-monitor', runId)
  );
  const reportPath = path.resolve(
    repoRoot,
    rawOptions['report-path'] ?? rawOptions.reportPath ?? path.join('reports', 'crawler-monitor', `${runId}.json`)
  );
  const progressPath = path.resolve(
    repoRoot,
    rawOptions['progress-path'] ?? rawOptions.progressPath ?? process.env.TERRAPEDIA_CRAWLER_PROGRESS_PATH ?? DEFAULT_PROGRESS_PATH
  );
  const latestReportPath = path.resolve(
    repoRoot,
    rawOptions['latest-report-path'] ?? rawOptions.latestReportPath ?? DEFAULT_LATEST_REPORT_PATH
  );

  return {
    actionId: ACTION_ID,
    runId,
    limit,
    generatedAt,
    progressPath,
    reportPath,
    latestReportPath,
    outputDir,
    domains: WIKI_MONITOR_DOMAIN_SMOKE_DOMAINS.map((domain) => ({
      ...domain,
      limit,
      outputPath: path.join(outputDir, `${domain.domain}.json`)
    }))
  };
}

export async function runDomainSmoke(rawOptions = {}, deps = {}) {
  const transport = {
    searchWikiPages: deps.searchWikiPages ?? searchWikiPages,
    fetchPageRevisions: deps.fetchPageRevisions ?? fetchPageRevisions
  };
  const plan = buildDomainSmokePlan(rawOptions);
  const startedAt = new Date().toISOString();
  const results = [];

  const writeProgress = (progress) => writeSmokeProgress(plan, {
    startedAt,
    ...progress
  });

  writeProgress({
    status: 'running',
    phase: 'start',
    message: `starting wiki monitor domain smoke for ${plan.domains.length} domains`,
    current: 0,
    total: plan.domains.length
  });

  for (let index = 0; index < plan.domains.length; index += 1) {
    const domain = plan.domains[index];
    writeProgress({
      status: 'running',
      phase: 'download',
      message: `downloading ${domain.domain} ${index + 1}/${plan.domains.length}`,
      current: index,
      total: plan.domains.length,
      domains: results
    });

    const result = await downloadDomainSample(domain, plan.limit, transport).catch((error) => ({
      domain: domain.domain,
      label: domain.label,
      sourceKey: domain.sourceKey,
      queries: domain.queries,
      requestedLimit: plan.limit,
      actualCount: 0,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      records: []
    }));

    writeJson(domain.outputPath, result);
    results.push({
      ...result,
      actionId: `${ACTION_ID}:${domain.domain}`,
      current: result.actualCount,
      total: plan.limit,
      progressPath: toRepoRelative(plan.progressPath),
      reportPath: toRepoRelative(plan.reportPath),
      outputPath: toRepoRelative(domain.outputPath),
      message: `${domain.domain} 样本${result.status === 'failed' ? '失败' : result.status === 'partial' ? '不足' : '完成'} ${result.actualCount}/${plan.limit}`
    });
    writeProgress({
      status: 'running',
      phase: 'download',
      message: `downloaded ${domain.domain} ${index + 1}/${plan.domains.length}`,
      current: index + 1,
      total: plan.domains.length,
      currentDomain: domain.domain,
      domains: results
    });
  }

  const completedAt = new Date().toISOString();
  const report = {
    actionId: ACTION_ID,
    runId: plan.runId,
    generatedAt: plan.generatedAt,
    startedAt,
    completedAt,
    status: results.some((result) => result.status === 'failed')
      ? 'failed'
      : results.some((result) => result.status === 'partial') ? 'partial' : 'completed',
    requestedLimit: plan.limit,
    domainCount: results.length,
    completedDomains: results.filter((result) => result.status === 'completed').length,
    failedDomains: results.filter((result) => result.status === 'failed').length,
    outputDir: toRepoRelative(plan.outputDir),
    progressPath: toRepoRelative(plan.progressPath),
    domains: results
  };

  writeJson(plan.reportPath, report);
  writeJson(plan.latestReportPath, report);
  writeProgress({
    status: report.status === 'failed' ? 'failed' : 'completed',
    phase: 'write',
    message: `${report.status} wiki monitor domain smoke; domains=${report.completedDomains}/${report.domainCount}`,
    current: plan.domains.length,
    total: plan.domains.length,
    domains: results
  });
  return report;
}

async function downloadDomainSample(domain, limit, deps = {}) {
  const searchPages = deps.searchWikiPages ?? searchWikiPages;
  const fetchRevisions = deps.fetchPageRevisions ?? fetchPageRevisions;
  const searchResults = [];
  for (const query of domain.queries) {
    if (unique(searchResults.map((result) => result.title)).length >= limit) {
      break;
    }
    searchResults.push(...await searchPages(query, limit));
  }
  const titles = unique(searchResults.map((result) => result.title)).slice(0, limit);
  const revisions = titles.length ? await fetchRevisions(titles) : [];
  return {
    domain: domain.domain,
    label: domain.label,
    sourceKey: domain.sourceKey,
    queries: domain.queries,
    requestedLimit: limit,
    actualCount: revisions.length,
    status: revisions.length >= limit ? 'completed' : 'partial',
    records: revisions.map((revision, index) => ({
      index: index + 1,
      title: revision.title,
      pageId: revision.pageId,
      revisionId: revision.revisionId,
      revisionTimestamp: revision.revisionTimestamp,
      contentLength: revision.contentLength
    }))
  };
}

async function searchWikiPages(search, limit) {
  const url = new URL(DEFAULT_WIKI_API_URL);
  url.searchParams.set('action', 'query');
  url.searchParams.set('list', 'search');
  url.searchParams.set('srsearch', search);
  url.searchParams.set('srlimit', String(limit));
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  const body = await fetchWikiApiJson({ url, profile: 'domain-smoke-search', sourceKey: search });
  return Array.isArray(body?.query?.search) ? body.query.search : [];
}

async function fetchPageRevisions(titles) {
  const url = new URL(DEFAULT_WIKI_API_URL);
  url.searchParams.set('action', 'query');
  url.searchParams.set('titles', titles.join('|'));
  url.searchParams.set('prop', 'revisions');
  url.searchParams.set('rvprop', 'ids|timestamp|content');
  url.searchParams.set('rvslots', 'main');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  const body = await fetchWikiApiJson({ url, profile: 'domain-smoke-revisions', sourceKey: titles.join('|') });
  return (Array.isArray(body?.query?.pages) ? body.query.pages : [])
    .filter((page) => !page.missing)
    .map((page) => {
      const revision = page.revisions?.[0] ?? {};
      const content = revision.slots?.main?.content ?? revision.content ?? '';
      return {
        title: page.title,
        pageId: page.pageid ?? null,
        revisionId: revision.revid ?? null,
        revisionTimestamp: revision.timestamp ?? null,
        contentLength: String(content ?? '').length
      };
    });
}

function writeSmokeProgress(plan, {
  status,
  phase,
  message,
  current,
  total,
  currentDomain,
  domains = [],
  startedAt,
  generatedAt = new Date().toISOString()
}) {
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
    childStatusPath: toRepoRelative(plan.progressPath)
  });
  payload.outputPath = toRepoRelative(plan.outputDir);
  payload.reportPath = toRepoRelative(plan.reportPath);
  payload.batchLimit = plan.limit;
  payload.queue = `limit=${plan.limit}; domains=${plan.domains.length}`;
  payload.currentDomain = currentDomain ?? null;
  payload.domains = domains.map((domain) => ({
    domain: domain.domain,
    label: domain.label,
    actionId: domain.actionId ?? `${ACTION_ID}:${domain.domain}`,
    sourceKey: domain.sourceKey,
    status: domain.status,
    actualCount: domain.actualCount,
    requestedLimit: domain.requestedLimit,
    limit: domain.requestedLimit ?? plan.limit,
    current: domain.current ?? domain.actualCount ?? 0,
    total: domain.total ?? domain.requestedLimit ?? plan.limit,
    progressPath: domain.progressPath ?? toRepoRelative(plan.progressPath),
    reportPath: domain.reportPath ?? toRepoRelative(plan.reportPath),
    outputPath: domain.outputPath,
    message: domain.message,
    error: domain.error
  }));
  writeJsonFile(plan.progressPath, payload);
}

const QUERY_TO_DOMAIN = new Map(
  WIKI_MONITOR_DOMAIN_SMOKE_DOMAINS.flatMap((domain) => domain.queries.map((query) => [query, domain.domain]))
);

export function createFixtureTransport(fixture = {}) {
  const specFor = (domain) => fixture[domain];
  return {
    async searchWikiPages(query) {
      const domain = QUERY_TO_DOMAIN.get(query) ?? query;
      const spec = specFor(domain);
      if (spec === 'fail') {
        throw new Error(`fixture transport: domain "${domain}" configured to fail`);
      }
      const count = Number.isFinite(Number(spec)) ? Math.max(0, Math.trunc(Number(spec))) : 0;
      return Array.from({ length: count }, (_unused, index) => ({ title: `${domain}::sample-${index + 1}` }));
    },
    async fetchPageRevisions(titles) {
      return titles.map((title, index) => ({
        title,
        pageId: 1000 + index,
        revisionId: 2000 + index,
        revisionTimestamp: '2026-06-21T00:00:00Z',
        contentLength: 128 + index
      }));
    }
  };
}

function smokeDomain(domain, label, sourceKey, queries) {
  return { domain, label, sourceKey, queries };
}

function normalizeLimit(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(DEFAULT_LIMIT, Math.max(1, Math.trunc(parsed)));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function toRepoRelative(filePath) {
  return path.relative(repoRoot, path.resolve(filePath)).replaceAll(path.sep, '/');
}

if (process.argv[1] === __filename) {
  const options = parseCliArgs(process.argv.slice(2));
  const deps = options.fixture
    ? createFixtureTransport(JSON.parse(fs.readFileSync(path.resolve(repoRoot, String(options.fixture)), 'utf8')))
    : {};
  runDomainSmoke(options, deps)
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
