import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { resolveProjectPath } from '../lib/project-root.mjs';
import {
  DEFAULT_WIKI_API_URL,
  fetchWikiModuleContent,
  fetchWikiPageMetadataBatch,
  fetchWikiUrlText,
  isTerrariaWikiUrl,
  parseCliArgs,
  sharedDataPath,
  writeJson,
  writeJsonNoOverwrite
} from '../lib/wiki-item-utils.mjs';
import {
  createContentHash,
  DEFAULT_WIKI_SOURCE_MANIFEST_PATH,
  loadWikiSourceManifest,
  resolveIngestedRecord
} from '../lib/wiki-sync-manifest.mjs';
import { buildActionProgressPayload } from '../workflow/backend-refresh-runtime-state.mjs';
import { resolveConfiguredPath } from '../../scripts/lib/project-constants.mjs';
import { compareWikiSourceFingerprint } from './source-update-comparison.mjs';
import {
  probeSupplementarySource,
  SUPPLEMENTARY_SOURCE_DEFINITIONS
} from './supplementary-source-probes.mjs';
import { createSourceUpdateProgressHeartbeat } from './source-update-progress-heartbeat.mjs';
import { resolveOfficialCheckMode } from './source-update-monitor-options.mjs';

const terraPediaRoot = resolveProjectPath();
const OFFICIAL_SOURCE_MONITOR_USER_AGENT = 'TerraPedia-source-monitor/2.0 (+https://terraria.wiki.gg/api.php)';

const options = parseCliArgs(process.argv.slice(2));
const checkedAt = new Date().toISOString();
const timestamp = checkedAt.replaceAll(':', '-');
const reportDir = resolveOptionPath(options['report-dir'], sharedDataPath('reports', 'fetch'));
const statePath = resolveOptionPath(
  options['state-file'],
  sharedDataPath('generated', 'source-update-monitor.latest.json')
);
const manifestPath = resolveOptionPath(options['manifest-path'], DEFAULT_WIKI_SOURCE_MANIFEST_PATH);
const progressPath = resolveOptionPath(
  options['progress-path'] ?? process.env.TERRAPEDIA_CRAWLER_PROGRESS_PATH,
  sharedDataPath('generated', 'source-update-monitor-progress.latest.json')
);
const wikiApiUrl = options['wiki-api-url'] ?? DEFAULT_WIKI_API_URL;
const officialCheckMode = resolveOfficialCheckMode(options);
const monitorProgress = createSourceUpdateProgressHeartbeat({
  heartbeatMs: options['heartbeat-ms'] ?? options.heartbeatMs,
  writeProgress: writeMonitorProgress,
});
const sourceTotal = buildWikiSources().length + (officialCheckMode !== 'never' ? buildOfficialSources().length : 0);

try {
  monitorProgress.publish({
    status: 'running',
    phase: 'start',
    message: 'checking source update fingerprints',
    current: 0,
    total: sourceTotal
  });
} catch (error) {
  publishTerminalFailure({
    phase: 'initialization',
    message: `source monitor progress initialization failed: ${compactError(error)}`,
    current: 0,
    total: sourceTotal,
  });
  throw error;
}

let previousState;
let previousSourceMap;
let ingestionManifest;
try {
  previousState = readJsonIfExists(statePath);
  previousSourceMap = buildPreviousSourceMap(previousState);
  ingestionManifest = loadWikiSourceManifest(manifestPath);
} catch (error) {
  publishTerminalFailure({
    phase: 'initialization',
    message: `source monitor initialization failed: ${compactError(error)}`,
    current: 0,
    total: sourceTotal,
  });
  throw error;
}

function resolveOptionPath(value, fallback) {
  if (value == null || String(value).trim() === '') {
    return fallback;
  }
  const candidate = String(value);
  return resolveConfiguredPath(candidate, {
    repoRoot: terraPediaRoot,
    allowExternal: path.isAbsolute(candidate)
  });
}

const sources = [];
const reportPath = path.join(reportDir, `source-update-check-${timestamp}.json`);
try {
  for (const source of buildWikiSources()) {
    monitorProgress.assertHealthy();
    sources.push(await checkWikiSource(source));
    monitorProgress.assertHealthy();
    monitorProgress.publish({
      status: 'running',
      phase: 'wiki',
      message: `checked ${source.key}`,
      current: sources.length,
      total: sourceTotal
    });
  }

  if (officialCheckMode !== 'never') {
    for (const source of buildOfficialSources()) {
      monitorProgress.assertHealthy();
      sources.push(await checkOfficialSource(source));
      monitorProgress.assertHealthy();
      monitorProgress.publish({
        status: 'running',
        phase: 'official',
        message: `checked ${source.key}`,
        current: sources.length,
        total: sourceTotal
      });
    }
  }

  monitorProgress.assertHealthy();
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

  try {
    // Publish the immutable report first. The mutable latest state advances
    // only after the durable evidence exists, so a report failure cannot hide
    // an upstream change from the next probe.
    writeJsonNoOverwrite(reportPath, {
      ...payload,
      reportFile: toWorkspaceRelative(reportPath)
    });
  } catch (error) {
    throw new Error(`report publication failed: ${compactError(error)}`, { cause: error });
  }
  try {
    writeJson(statePath, payload);
  } catch (error) {
    throw new Error(`state publication failed: ${compactError(error)}`, { cause: error });
  }
  monitorProgress.publish({
    status: summary.probeHealthy ? 'completed' : 'failed',
    phase: 'write',
    message: summary.probeHealthy
      ? `checked ${summary.checkedSources} source(s); changed=${summary.changedSources}`
      : `source probe failed for ${summary.errorSources} source(s); automation blocked`,
    current: sources.length,
    total: sources.length,
    outputPath: statePath,
    reportPath
  });
  monitorProgress.stop();

  console.log(`Checked at: ${checkedAt}`);
  console.log(`Sources checked: ${summary.checkedSources}`);
  console.log(`Changed sources: ${summary.changedSources}`);
  console.log(`Needs full refetch: ${summary.requiresFullRefetch}`);
  console.log(`Probe healthy: ${summary.probeHealthy}`);
  console.log(`State: ${statePath}`);
  console.log(`Report: ${reportPath}`);

  if (!summary.probeHealthy) {
    process.exitCode = 1;
  }
} catch (error) {
  publishTerminalFailure({
    phase: 'publication',
    message: `source monitor failed: ${compactError(error)}`,
    current: sources.length,
    total: sourceTotal,
    outputPath: statePath,
    reportPath,
  });
  throw error;
}

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
    },
    ...Object.entries(SUPPLEMENTARY_SOURCE_DEFINITIONS).map(([domainId, definition]) => ({
      key: definition.sourceKey,
      category: 'supplementary_probe',
      locator: definition.locator,
      trigger: 'full_refetch',
      domainId
    }))
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
  const ingestedRecord = resolveIngestedRecord(ingestionManifest, {
    sourceKey: source.key,
    locator: source.locator
  });

  try {
    const apiFingerprint = await fetchWikiFingerprint(source);
    const comparison = compareWikiSourceFingerprint({
      source,
      apiFingerprint,
      ingestedRecord
    });

    return {
      key: source.key,
      provider: 'terraria.wiki.gg',
      category: source.category,
      locator: source.locator,
      trigger: source.trigger,
      status: comparison.status,
      checkedAt,
      currentValue: comparison.currentValue,
      previousValue: comparison.previousValue,
      ingestedValue: comparison.ingestedValue,
      changed: comparison.changed,
      meta: comparison.meta
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
      previousValue: ingestedRecord?.contentHash ?? ingestedRecord?.revisionId ?? ingestedRecord?.revisionTimestamp ?? null,
      changed: false,
      error: compactError(error),
      meta: {
        compareBasis: 'ingestion-manifest',
        compareField: null
      }
    };
  }
}

async function fetchWikiFingerprint(source) {
  if (source.category === 'supplementary_probe') {
    const snapshot = await probeSupplementarySource({
      domainId: source.domainId,
      wikiApiUrl
    });
    return {
      contentHash: snapshot.contentHash,
      revisionId: snapshot.revisionId,
      revisionTimestamp: snapshot.revisionTimestamp
    };
  }
  if (source.category === 'wiki_module' || source.key === 'wiki.page.template_getbuffinfo') {
    const result = await fetchWikiModuleContent({
      moduleTitle: source.locator,
      apiUrl: wikiApiUrl
    });
    return {
      contentHash: createContentHash(result.moduleContent),
      revisionId: result.revisionId ?? null,
      revisionTimestamp: result.revisionTimestamp ?? null
    };
  }
  const [metadata] = await fetchWikiPageMetadataBatch({
    titles: [source.locator],
    apiUrl: wikiApiUrl,
    includeLanglinks: false
  });
  return {
    revisionId: metadata?.revisionId ?? null,
    revisionTimestamp: metadata?.revisionTimestamp ?? null
  };
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
      'user-agent': OFFICIAL_SOURCE_MONITOR_USER_AGENT
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
  const failedSourceKeys = sources
    .filter((entry) => entry.status !== 'ok')
    .map((entry) => entry.key);

  return {
    checkedSources,
    okSources,
    errorSources,
    changedSources,
    wikiChangedSources,
    officialChangedSources,
    requiresFullRefetch,
    requiresStandardizeRefresh: requiresFullRefetch,
    probeHealthy: errorSources === 0,
    failedSourceKeys
  };
}

function buildRecommendedActions(summary) {
  if (!summary.probeHealthy) {
    return [
      {
        type: 'block_automation',
        reason: 'source_probe_failed',
        sourceKeys: summary.failedSourceKeys
      }
    ];
  }
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
          'node TerraPedia-dev/pipelines/workflow/seed-wiki-source-manifest.mjs',
          'node TerraPedia-dev/pipelines/workflow/run-wiki-sync.mjs --mode=apply'
        ]
      },
      {
        type: 'run_standardize_pipeline',
      reason: 'standardized_outputs_must_match_latest_raw_data',
      commands: [
        'node terraPedia/pipelines/normalize/normalize-wiki-items.mjs',
        'node TerraPedia-dev/pipelines/transform/standardize-existing-data.mjs',
        'node TerraPedia-dev/pipelines/transform/split-standardized-view.mjs'
      ]
    }
  ];
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

function writeMonitorProgress(progress) {
  const generatedAt = progress.generatedAt ?? new Date().toISOString();
  writeJson(progressPath, buildActionProgressPayload({
    ...progress,
    actionId: 'source-update-monitor-check',
    generatedAt,
    lastHeartbeatAt: generatedAt,
    childStatusPath: progressPath
  }));
}

function publishTerminalFailure({ phase, message, current, total, outputPath, reportPath }) {
  try {
    monitorProgress.publish({
      status: 'failed',
      phase: phase ?? 'failed',
      message: message ?? 'source monitor failed',
      current: current ?? 0,
      total: total ?? sourceTotal,
      ...(outputPath ? { outputPath } : {}),
      ...(reportPath ? { reportPath } : {}),
    });
  } catch (progressError) {
    console.error(`Unable to publish source monitor failed progress: ${compactError(progressError)}`);
  } finally {
    monitorProgress.stop();
  }
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
