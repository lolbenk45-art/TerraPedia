import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { resolveProjectPath } from '../lib/project-root.mjs';
import {
  DEFAULT_WIKI_API_URL,
  ensureDir,
  fetchWikiPageRevisionTimestamp,
  fetchWikiUrlText,
  isTerrariaWikiUrl,
  parseCliArgs,
  sharedDataPath,
  writeJson
} from '../lib/wiki-item-utils.mjs';

const terraPediaRoot = resolveProjectPath();

const options = parseCliArgs(process.argv.slice(2));
const checkedAt = new Date().toISOString();
const timestamp = checkedAt.replaceAll(':', '-');
const reportDir = path.resolve(process.cwd(), options['report-dir'] ?? sharedDataPath('reports', 'fetch'));
const statePath = path.resolve(
  process.cwd(),
  options['state-file'] ?? sharedDataPath('generated', 'source-update-monitor.latest.json')
);
const wikiApiUrl = options['wiki-api-url'] ?? DEFAULT_WIKI_API_URL;
const officialCheckMode = resolveOfficialCheckMode(options);
const previousState = readJsonIfExists(statePath);
const previousSourceMap = buildPreviousSourceMap(previousState);

ensureDir(reportDir);
ensureDir(path.dirname(statePath));

const sources = [];

for (const source of buildWikiSources()) {
  sources.push(await checkWikiSource(source));
}

if (officialCheckMode !== 'never') {
  for (const source of buildOfficialSources()) {
    sources.push(await checkOfficialSource(source));
  }
}

const summary = buildSummary(sources);
const recommendedActions = buildRecommendedActions(summary);
const payload = {
  schemaVersion: '1.0.0',
  checkedAt,
  wikiApiUrl,
  officialCheckMode,
  stateFile: toWorkspaceRelative(statePath),
  summary,
  recommendedActions,
  sources
};

const reportPath = path.join(reportDir, `source-update-check-${timestamp}.json`);
writeJson(statePath, payload);
writeJson(reportPath, {
  ...payload,
  reportFile: toWorkspaceRelative(reportPath)
});

console.log(`Checked at: ${checkedAt}`);
console.log(`Sources checked: ${summary.checkedSources}`);
console.log(`Changed sources: ${summary.changedSources}`);
console.log(`Needs full refetch: ${summary.requiresFullRefetch}`);
console.log(`State: ${statePath}`);
console.log(`Report: ${reportPath}`);

function buildWikiSources() {
  return [
    {
      key: 'wiki.module.iteminfo',
      category: 'wiki_module',
      locator: 'Module:Iteminfo/data',
      trigger: 'full_refetch'
    },
    {
      key: 'wiki.module.npcinfo',
      category: 'wiki_module',
      locator: 'Module:Npcinfo/data',
      trigger: 'full_refetch'
    },
    {
      key: 'wiki.module.projectileinfo',
      category: 'wiki_module',
      locator: 'Module:Projectileinfo/data',
      trigger: 'full_refetch'
    },
    {
      key: 'wiki.module.armorsetbonuses',
      category: 'wiki_module',
      locator: 'Module:ArmorSetBonuses',
      trigger: 'full_refetch'
    },
    {
      key: 'wiki.page.template_getbuffinfo',
      category: 'wiki_page',
      locator: 'Template:GetBuffInfo',
      trigger: 'full_refetch'
    },
    {
      key: 'wiki.page.biomes_anchor',
      category: 'wiki_page',
      locator: 'Forest',
      trigger: 'partial_review'
    }
  ];
}

function buildOfficialSources() {
  return [
    {
      key: 'official.steam.news',
      category: 'official_release_feed',
      locator: 'https://store.steampowered.com/news/app/105600',
      trigger: 'full_refetch'
    },
    {
      key: 'official.forum.announcements',
      category: 'official_release_feed',
      locator: 'https://forums.terraria.org/',
      trigger: 'full_refetch'
    }
  ];
}

async function checkWikiSource(source) {
  const previous = previousSourceMap.get(source.key);

  try {
    const revisionTimestamp = await fetchWikiPageRevisionTimestamp({
      pageTitle: source.locator,
      apiUrl: wikiApiUrl
    });
    const changed = hasChanged(previous?.currentValue, revisionTimestamp);

    return {
      key: source.key,
      provider: 'terraria.wiki.gg',
      category: source.category,
      locator: source.locator,
      trigger: source.trigger,
      status: revisionTimestamp ? 'ok' : 'missing',
      checkedAt,
      currentValue: revisionTimestamp,
      previousValue: previous?.currentValue ?? null,
      changed,
      meta: {
        compareField: 'revisionTimestamp'
      }
    };
  } catch (error) {
    return {
      key: source.key,
      provider: 'terraria.wiki.gg',
      category: source.category,
      locator: source.locator,
      trigger: source.trigger,
      status: 'error',
      checkedAt,
      currentValue: null,
      previousValue: previous?.currentValue ?? null,
      changed: false,
      error: compactError(error),
      meta: {
        compareField: 'revisionTimestamp'
      }
    };
  }
}

async function checkOfficialSource(source) {
  const previous = previousSourceMap.get(source.key);

  try {
    const html = isTerrariaWikiUrl(source.locator)
      ? await fetchWikiUrlText({
          url: source.locator,
          profile: 'page',
          sourceKey: source.key,
          timeoutMs: 20_000
        })
      : await fetchOfficialSourceText(source.locator);
    const normalizedText = normalizeText(html);
    const contentHash = crypto.createHash('sha256').update(normalizedText).digest('hex');
    const preview = extractOfficialPreview(html);
    const stableSignature = buildOfficialStableSignature(preview);
    const currentValue = stableSignature ?? contentHash;
    const changed = hasChanged(previous?.currentValue, currentValue);

    return {
      key: source.key,
      provider: 'official',
      category: source.category,
      locator: source.locator,
      trigger: source.trigger,
      status: 'ok',
      checkedAt,
      currentValue,
      previousValue: previous?.currentValue ?? null,
      changed,
      meta: {
        compareField: stableSignature ? 'stableSignature' : 'contentHash',
        rawContentHash: contentHash,
        latestVersionHint: preview.latestVersionHint,
        latestDateHint: preview.latestDateHint,
        titleHint: preview.titleHint
      }
    };
  } catch (error) {
    return {
      key: source.key,
      provider: 'official',
      category: source.category,
      locator: source.locator,
      trigger: source.trigger,
      status: 'error',
      checkedAt,
      currentValue: null,
      previousValue: previous?.currentValue ?? null,
      changed: false,
      error: compactError(error),
      meta: {
        compareField: 'contentHash'
      }
    };
  }
}

async function fetchOfficialSourceText(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'TerraPedia source monitor/1.0'
    },
    signal: AbortSignal.timeout(20_000)
  });

  if (!response.ok) {
    throw new Error(`Official source request failed: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function buildSummary(sources) {
  const checkedSources = sources.length;
  const okSources = sources.filter((entry) => entry.status === 'ok').length;
  const errorSources = sources.filter((entry) => entry.status === 'error').length;
  const changedSources = sources.filter((entry) => entry.changed).length;
  const wikiChangedSources = sources.filter((entry) => entry.changed && entry.provider === 'terraria.wiki.gg').length;
  const officialChangedSources = sources.filter((entry) => entry.changed && entry.provider === 'official').length;
  const requiresFullRefetch = sources.some((entry) => entry.changed && entry.trigger === 'full_refetch');

  return {
    checkedSources,
    okSources,
    errorSources,
    changedSources,
    wikiChangedSources,
    officialChangedSources,
    requiresFullRefetch,
    requiresStandardizeRefresh: requiresFullRefetch
  };
}

function buildRecommendedActions(summary) {
  if (!summary.requiresFullRefetch) {
    return [
      {
        type: 'noop',
        reason: 'no_upstream_change_detected'
      }
    ];
  }

    return [
      {
        type: 'run_safe_wiki_workflow',
        reason: 'upstream_source_changed',
        commands: [
          'node TerraPedia-dev/scripts/data/workflow/seed-wiki-source-manifest.mjs',
          'node TerraPedia-dev/scripts/data/workflow/run-wiki-sync.mjs --mode=apply'
        ]
      },
      {
        type: 'run_standardize_pipeline',
      reason: 'standardized_outputs_must_match_latest_raw_data',
      commands: [
        'node terraPedia/scripts/data/normalize/normalize-wiki-items.mjs',
        'node TerraPedia-dev/scripts/data/transform/standardize-existing-data.mjs',
        'node TerraPedia-dev/scripts/data/transform/split-standardized-view.mjs'
      ]
    }
  ];
}

function resolveOfficialCheckMode(rawOptions) {
  const mode = String(rawOptions['official-check-mode'] ?? rawOptions.officialCheckMode ?? 'always').trim().toLowerCase();
  if (mode === 'always' || mode === 'never') {
    return mode;
  }
  return 'always';
}

function buildPreviousSourceMap(previousState) {
  const entries = Array.isArray(previousState?.sources) ? previousState.sources : [];
  return new Map(entries.filter((entry) => typeof entry?.key === 'string').map((entry) => [entry.key, entry]));
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function hasChanged(previousValue, currentValue) {
  if (!previousValue || !currentValue) {
    return false;
  }
  return previousValue !== currentValue;
}

function compactError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, ' ').trim().slice(0, 400);
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractOfficialPreview(html) {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const versionMatch = html.match(/\b(?:v(?:ersion)?\s*)?(\d+\.\d+(?:\.\d+)*)\b/i);
  const dateMatch = html.match(
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},\s+\d{4}\b/i
  );

  return {
    titleHint: titleMatch?.[1]?.trim() ?? null,
    latestVersionHint: versionMatch?.[1] ?? null,
    latestDateHint: dateMatch?.[0] ?? null
  };
}

function buildOfficialStableSignature(preview) {
  const parts = [
    preview?.titleHint ?? '',
    preview?.latestVersionHint ?? '',
    preview?.latestDateHint ?? ''
  ].filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  return crypto.createHash('sha256').update(parts.join('|')).digest('hex');
}

function toWorkspaceRelative(targetPath) {
  return path.relative(terraPediaRoot, targetPath).replaceAll('\\', '/');
}
