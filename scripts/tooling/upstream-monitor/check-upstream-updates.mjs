import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { getProjectRoot, resolveSharedDataRoot } from '../../data/lib/project-root.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = getProjectRoot();
const sharedDataRoot = resolveSharedDataRoot();

const DEFAULT_WIKI_SOURCES = [
  { key: 'iteminfo', pageTitle: 'Module:Iteminfo/data', label: 'Items' },
  { key: 'npcinfo', pageTitle: 'Module:Npcinfo/data', label: 'NPCs' },
  { key: 'projectileinfo', pageTitle: 'Module:Projectileinfo/data', label: 'Projectiles' },
  { key: 'armorsetbonuses', pageTitle: 'Module:ArmorSetBonuses', label: 'Armor Sets' },
  { key: 'getbuffinfo', pageTitle: 'Template:GetBuffInfo', label: 'Buffs' }
];

const MODULE_ALIASES = {
  items: 'iteminfo',
  item: 'iteminfo',
  iteminfo: 'iteminfo',
  npcs: 'npcinfo',
  npc: 'npcinfo',
  npcinfo: 'npcinfo',
  projectiles: 'projectileinfo',
  projectile: 'projectileinfo',
  projectileinfo: 'projectileinfo',
  armor_sets: 'armorsetbonuses',
  armor_set: 'armorsetbonuses',
  armorsets: 'armorsetbonuses',
  armorsetbonuses: 'armorsetbonuses',
  armorset: 'armorsetbonuses',
  buffs: 'getbuffinfo',
  buff: 'getbuffinfo',
  getbuffinfo: 'getbuffinfo'
};

const options = parseCliArgs(process.argv.slice(2));
const now = new Date();
const startedAt = now.toISOString();

const defaultStateFile = resolveSharedDataRoot('generated', 'upstream-update-state.json');
const defaultOutputFile = resolveSharedDataRoot('generated', 'upstream-update-check.json');
const defaultManifestPath = resolveSharedDataRoot('standardized', '_manifest.standardized.json');

const config = {
  apiUrl: String(options['api-url'] ?? 'https://terraria.wiki.gg/api.php'),
  timeoutMs: numericOption(options['timeout-ms'], 20_000),
  checkOfficial: booleanOption(options['check-official'], true),
  writeState: booleanOption(options['write-state'], true),
  failOnChange: booleanOption(options['fail-on-change'], false),
  format: String(options.format ?? 'json').trim().toLowerCase(),
  stateFile: path.resolve(process.cwd(), String(options['state-file'] ?? defaultStateFile)),
  outputFile: path.resolve(process.cwd(), String(options['output-file'] ?? defaultOutputFile)),
  manifestPath: path.resolve(process.cwd(), String(options['manifest-path'] ?? defaultManifestPath))
};

if (!['json', 'text'].includes(config.format)) {
  failWithUsage(`Unsupported --format value: ${config.format}`);
}
if (!Number.isFinite(config.timeoutMs) || config.timeoutMs <= 0) {
  failWithUsage(`Unsupported --timeout-ms value: ${options['timeout-ms']}`);
}

const requestedSources = parseSourceFilter(options.modules);
const wikiSources = DEFAULT_WIKI_SOURCES.filter((entry) => requestedSources == null || requestedSources.has(entry.key));
if (wikiSources.length === 0) {
  failWithUsage('No wiki modules selected. Use --modules=iteminfo,npcinfo,...');
}

const wikiUtils = await loadWikiUtils();
const previousState = loadJsonIfExists(config.stateFile) ?? buildInitialState();
const baseline = loadBaseline(config.manifestPath);
const warnings = [];
const sources = [];

for (const source of wikiSources) {
  const result = await checkWikiSource({
    source,
    wikiUtils,
    apiUrl: config.apiUrl,
    timeoutMs: config.timeoutMs,
    previousEntry: previousState.sources[source.key] ?? null
  });
  sources.push(result.sourceEntry);
  warnings.push(...result.warnings);
}

if (config.checkOfficial) {
  const officialChecks = await Promise.all([
    checkSteamNews({
      previousEntry: previousState.sources.official_steam_news ?? null,
      timeoutMs: config.timeoutMs
    }),
    checkForumAnnouncements({
      previousEntry: previousState.sources.official_forum_news ?? null,
      timeoutMs: config.timeoutMs
    })
  ]);

  for (const result of officialChecks) {
    sources.push(result.sourceEntry);
    warnings.push(...result.warnings);
  }
}

const decision = buildDecision({ sources, warnings, baseline });
const finishedAt = new Date().toISOString();

const report = deepSortObject({
  schemaVersion: '1.0.0',
  project: 'TerraPedia',
  generatedAt: finishedAt,
  monitorRun: {
    startedAt,
    finishedAt,
    status: warnings.some((entry) => entry.severity === 'error') ? 'completed_with_errors' : 'success'
  },
  baseline,
  decision,
  sources,
  warnings
});

if (config.writeState) {
  const nextState = buildNextState({
    previousState,
    sources,
    warnings,
    decision,
    baseline,
    lastCheckedAt: finishedAt
  });
  writeJson(config.stateFile, nextState);
}

writeJson(config.outputFile, report);

const summary = buildSummary({
  finishedAt,
  config,
  sources,
  warnings,
  decision
});

if (config.format === 'json') {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log(renderTextSummary(summary));
}

if (decision.hasUpdates && config.failOnChange) {
  process.exit(10);
}
if (decision.hasUpdates) {
  process.exit(10);
}
process.exit(0);

async function checkWikiSource({ source, wikiUtils, apiUrl, timeoutMs, previousEntry }) {
  const warnings = [];
  const checkedAt = new Date().toISOString();

  try {
    const payload = await withTimeout(
      wikiUtils.fetchWikiModuleContent({
        moduleTitle: source.pageTitle,
        apiUrl
      }),
      timeoutMs,
      `Timeout checking ${source.pageTitle}`
    );

    const revisionTimestamp = nullableString(payload.revisionTimestamp);
    const contentHash = sha256(payload.moduleContent);
    const previousRevisionTimestamp = nullableString(previousEntry?.currentState?.revisionTimestamp);
    const previousContentHash = nullableString(previousEntry?.currentState?.contentHash);
    const changed =
      previousRevisionTimestamp != null
        ? previousRevisionTimestamp !== revisionTimestamp || previousContentHash !== contentHash
        : false;

    const sourceEntry = deepSortObject({
      sourceKey: source.key,
      provider: 'wiki_gg',
      kind: 'wiki_module',
      pageTitle: payload.pageTitle ?? source.pageTitle,
      apiUrl,
      lastCheckedAt: checkedAt,
      status: 'ok',
      previousState: {
        revisionTimestamp: previousRevisionTimestamp,
        contentHash: previousContentHash
      },
      currentState: {
        revisionTimestamp,
        contentHash,
        fetchedAt: nullableString(payload.fetchedAt),
        pageId: toFiniteNumber(payload.pageId)
      },
      change: {
        changed,
        changeType: changed ? 'revision_changed' : 'no_change'
      },
      severity: changed ? 'high' : 'none',
      refreshImpact: changed ? 'full_refresh' : 'none',
      metadata: {
        category: 'core_dataset',
        label: source.label
      }
    });

    return { sourceEntry, warnings };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const consecutiveFailures = (toFiniteNumber(previousEntry?.history?.consecutiveFailures) ?? 0) + 1;
    const severity = consecutiveFailures >= 7 ? 'error' : consecutiveFailures >= 3 ? 'warning' : 'info';
    warnings.push({
      code: 'wiki_source_check_failed',
      message: `${source.pageTitle}: ${message}`,
      severity,
      sourceKey: source.key
    });

    const sourceEntry = deepSortObject({
      sourceKey: source.key,
      provider: 'wiki_gg',
      kind: 'wiki_module',
      pageTitle: source.pageTitle,
      apiUrl,
      lastCheckedAt: checkedAt,
      status: 'error',
      previousState: {
        revisionTimestamp: nullableString(previousEntry?.currentState?.revisionTimestamp),
        contentHash: nullableString(previousEntry?.currentState?.contentHash)
      },
      currentState: null,
      change: {
        changed: false,
        changeType: 'check_failed'
      },
      severity,
      refreshImpact: 'warning_only',
      metadata: {
        category: 'core_dataset',
        label: source.label
      },
      history: {
        consecutiveFailures
      },
      error: {
        message
      }
    });

    return { sourceEntry, warnings };
  }
}

async function checkSteamNews({ previousEntry, timeoutMs }) {
  const sourceKey = 'official_steam_news';
  const checkedAt = new Date().toISOString();
  const warnings = [];

  try {
    const url = new URL('https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/');
    url.searchParams.set('appid', '105600');
    url.searchParams.set('count', '5');
    url.searchParams.set('maxlength', '500');
    url.searchParams.set('format', 'json');

    const response = await fetchJson(url, timeoutMs);
    const item = response?.appnews?.newsitems?.[0];
    if (!item?.gid) {
      throw new Error('Steam API returned no news items');
    }

    const publishedAt = toIsoDate(item.date);
    const detectedVersion = detectVersionText(`${item.title ?? ''}\n${item.contents ?? ''}`);
    const previousAnnouncementId = nullableString(previousEntry?.currentState?.latestAnnouncementId);
    const previousPublishedAt = nullableString(previousEntry?.currentState?.latestPublishedAt);
    const changed =
      previousAnnouncementId != null
        ? previousAnnouncementId !== String(item.gid) || previousPublishedAt !== publishedAt
        : false;
    const isVersionSignal = changed && looksLikeVersionAnnouncement(`${item.title ?? ''}\n${item.contents ?? ''}`);

    const sourceEntry = deepSortObject({
      sourceKey,
      provider: 'steam',
      kind: 'official_news',
      pageTitle: 'Steam Terraria News',
      apiUrl: url.toString(),
      lastCheckedAt: checkedAt,
      status: 'ok',
      previousState: {
        latestAnnouncementId: previousAnnouncementId,
        latestPublishedAt: previousPublishedAt
      },
      currentState: {
        latestAnnouncementId: String(item.gid),
        latestPublishedAt: publishedAt,
        latestTitle: nullableString(item.title),
        latestUrl: nullableString(item.url),
        detectedVersionText: detectedVersion
      },
      change: {
        changed,
        changeType: !changed ? 'no_change' : isVersionSignal ? 'new_version_announcement' : 'new_announcement'
      },
      severity: !changed ? 'none' : isVersionSignal ? 'high' : 'medium',
      refreshImpact: !changed ? 'none' : isVersionSignal ? 'full_refresh' : 'warning_only',
      metadata: {
        category: 'official_validation'
      }
    });

    return { sourceEntry, warnings };
  } catch (error) {
    return buildOfficialErrorResult({
      sourceKey,
      provider: 'steam',
      pageTitle: 'Steam Terraria News',
      apiUrl: 'https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=105600',
      previousEntry,
      checkedAt,
      error,
      warningCode: 'official_source_check_failed'
    });
  }
}

async function checkForumAnnouncements({ previousEntry, timeoutMs }) {
  const sourceKey = 'official_forum_news';
  const checkedAt = new Date().toISOString();

  try {
    const pageUrl = 'https://forums.terraria.org/index.php?forums/developer-news-announcements.12/';
    const html = await fetchText(pageUrl, timeoutMs);
    const item = parseForumLatestAnnouncement(html);
    if (!item?.link) {
      throw new Error('Forum page returned no latest announcement');
    }

    const latestAnnouncementId = nullableString(item.link);
    const latestPublishedAt = nullableString(item.publishedAt);
    const previousAnnouncementId = nullableString(previousEntry?.currentState?.latestAnnouncementId);
    const previousPublishedAt = nullableString(previousEntry?.currentState?.latestPublishedAt);
    const combinedText = `${item.title ?? ''}`;
    const changed =
      previousAnnouncementId != null
        ? previousAnnouncementId !== latestAnnouncementId || previousPublishedAt !== latestPublishedAt
        : false;
    const isVersionSignal = changed && looksLikeVersionAnnouncement(combinedText);

    const sourceEntry = deepSortObject({
      sourceKey,
      provider: 'terraria_forum',
      kind: 'official_news',
      pageTitle: 'Terraria Forum Developer News & Announcements',
      apiUrl: pageUrl,
      lastCheckedAt: checkedAt,
      status: 'ok',
      previousState: {
        latestAnnouncementId: previousAnnouncementId,
        latestPublishedAt: previousPublishedAt
      },
      currentState: {
        latestAnnouncementId,
        latestPublishedAt,
        latestTitle: nullableString(item.title),
        latestUrl: nullableString(item.link),
        detectedVersionText: detectVersionText(combinedText)
      },
      change: {
        changed,
        changeType: !changed ? 'no_change' : isVersionSignal ? 'new_version_announcement' : 'new_announcement'
      },
      severity: !changed ? 'none' : isVersionSignal ? 'high' : 'medium',
      refreshImpact: !changed ? 'none' : isVersionSignal ? 'full_refresh' : 'warning_only',
      metadata: {
        category: 'official_validation'
      }
    });

    return { sourceEntry, warnings: [] };
  } catch (error) {
    return buildOfficialErrorResult({
      sourceKey,
      provider: 'terraria_forum',
      pageTitle: 'Terraria Forum Developer News & Announcements',
      apiUrl: 'https://forums.terraria.org/index.php?forums/developer-news-announcements.12/',
      previousEntry,
      checkedAt,
      error,
      warningCode: 'official_source_check_failed'
    });
  }
}

function buildOfficialErrorResult({
  sourceKey,
  provider,
  pageTitle,
  apiUrl,
  previousEntry,
  checkedAt,
  error,
  warningCode
}) {
  const message = error instanceof Error ? error.message : String(error);
  const consecutiveFailures = (toFiniteNumber(previousEntry?.history?.consecutiveFailures) ?? 0) + 1;
  const severity = consecutiveFailures >= 7 ? 'error' : consecutiveFailures >= 3 ? 'warning' : 'info';
  const warnings = [
    {
      code: warningCode,
      message: `${pageTitle}: ${message}`,
      severity,
      sourceKey
    }
  ];

  const sourceEntry = deepSortObject({
    sourceKey,
    provider,
    kind: 'official_news',
    pageTitle,
    apiUrl,
    lastCheckedAt: checkedAt,
    status: 'error',
    previousState: {
      latestAnnouncementId: nullableString(previousEntry?.currentState?.latestAnnouncementId),
      latestPublishedAt: nullableString(previousEntry?.currentState?.latestPublishedAt)
    },
    currentState: null,
    change: {
      changed: false,
      changeType: 'check_failed'
    },
    severity,
    refreshImpact: 'warning_only',
    history: {
      consecutiveFailures
    },
    error: {
      message
    }
  });

  return { sourceEntry, warnings };
}

function buildDecision({ sources, warnings, baseline }) {
  const reasonCodes = [];
  let action = 'no_action';

  for (const source of sources) {
    if (!source?.change?.changed) {
      continue;
    }
    if (source.refreshImpact === 'full_refresh') {
      action = 'full_refresh_recommended';
      reasonCodes.push(
        source.kind === 'wiki_module' ? 'core_module_revision_changed' : 'official_news_new_version_detected'
      );
    } else if (action === 'no_action') {
      action = 'warning_only';
      reasonCodes.push('non_blocking_source_change_detected');
    }

    const publishedAt = nullableString(source.currentState?.latestPublishedAt);
    if (
      source.kind === 'official_news' &&
      publishedAt &&
      baseline.currentDatasetGeneratedAt &&
      publishedAt > baseline.currentDatasetGeneratedAt &&
      looksLikeVersionAnnouncement(`${source.currentState?.latestTitle ?? ''}\n${source.currentState?.detectedVersionText ?? ''}`)
    ) {
      action = 'full_refresh_recommended';
      reasonCodes.push('official_news_newer_than_dataset');
    }
  }

  if (warnings.some((entry) => entry.severity === 'error')) {
    if (action === 'no_action') {
      action = 'warning_only';
    }
    reasonCodes.push('source_check_errors_present');
  }

  const uniqueReasonCodes = [...new Set(reasonCodes)];
  return deepSortObject({
    action,
    hasUpdates: action === 'full_refresh_recommended' || action === 'full_refresh_required',
    reasonCodes: uniqueReasonCodes,
    summary: buildDecisionSummary(action, uniqueReasonCodes, sources)
  });
}

function buildDecisionSummary(action, reasonCodes, sources) {
  if (action === 'no_action') {
    return 'No upstream changes detected.';
  }
  const changedSources = sources.filter((entry) => entry?.change?.changed).map((entry) => entry.sourceKey);
  return `${action}: ${changedSources.join(', ') || 'changed sources'} (${reasonCodes.join(', ') || 'no reasons'})`;
}

function buildSummary({ finishedAt, config, sources, warnings, decision }) {
  return deepSortObject({
    checkedAt: finishedAt,
    hasUpdates: decision.hasUpdates,
    action: decision.action,
    modulesChecked: sources.filter((entry) => entry.kind === 'wiki_module').length,
    officialChecked: sources.filter((entry) => entry.kind === 'official_news').length,
    changes: sources
      .filter((entry) => entry?.change?.changed)
      .map((entry) => ({
        sourceKey: entry.sourceKey,
        sourceType: entry.kind,
        previousRevision:
          nullableString(entry.previousState?.revisionTimestamp) ?? nullableString(entry.previousState?.latestPublishedAt),
        currentRevision:
          nullableString(entry.currentState?.revisionTimestamp) ?? nullableString(entry.currentState?.latestPublishedAt),
        changed: true,
        reason: entry.change.changeType
      })),
    warnings,
    stateFile: normalizePathForOutput(config.stateFile),
    outputFile: normalizePathForOutput(config.outputFile)
  });
}

function buildNextState({ previousState, sources, warnings, decision, baseline, lastCheckedAt }) {
  const sourceMap = {};
  for (const source of sources) {
    const previousFailures = toFiniteNumber(previousState.sources?.[source.sourceKey]?.history?.consecutiveFailures) ?? 0;
    const nextFailures = source.status === 'error' ? previousFailures + 1 : 0;
    sourceMap[source.sourceKey] = deepSortObject({
      sourceKey: source.sourceKey,
      provider: source.provider,
      kind: source.kind,
      pageTitle: source.pageTitle,
      status: source.status,
      lastCheckedAt,
      currentState: source.currentState,
      history: {
        consecutiveFailures: nextFailures
      }
    });
  }

  return deepSortObject({
    schemaVersion: '1.0.0',
    project: 'TerraPedia',
    lastCheckedAt,
    baseline,
    lastResult: {
      action: decision.action,
      hasUpdates: decision.hasUpdates,
      warningCount: warnings.length
    },
    sources: sourceMap
  });
}

function buildInitialState() {
  return {
    schemaVersion: '1.0.0',
    project: 'TerraPedia',
    sources: {}
  };
}

function loadBaseline(manifestPath) {
  const manifest = loadJsonIfExists(manifestPath);
  return deepSortObject({
    standardizedManifestPath: normalizePathForOutput(manifestPath),
    currentDatasetGeneratedAt: nullableString(manifest?.generatedAt),
    sourceDataDir: nullableString(manifest?.sourceDataDir),
    outputDirectory: nullableString(manifest?.outputDirectory)
  });
}

async function loadWikiUtils() {
  const stubModulesRaw = nullableString(process.env.TERRAPEDIA_UPSTREAM_MONITOR_STUB_MODULES);
  if (stubModulesRaw) {
    const stubModules = JSON.parse(stubModulesRaw);
    return {
      fetchWikiModuleContent: async ({ moduleTitle, apiUrl }) => {
        const payload = stubModules?.[moduleTitle];
        if (!payload) {
          throw new Error(`Stub wiki module missing: ${moduleTitle}`);
        }
        return {
          ...payload,
          apiUrl: payload.apiUrl ?? apiUrl,
          moduleTitle: payload.moduleTitle ?? moduleTitle,
          pageTitle: payload.pageTitle ?? moduleTitle
        };
      }
    };
  }

  const utilityPath = path.join(repoRoot, 'scripts', 'data', 'lib', 'wiki-item-utils.mjs');
  const utilityUrl = pathToFileURL(utilityPath).href;
  const module = await import(utilityUrl);
  if (typeof module.fetchWikiModuleContent !== 'function') {
    throw new Error(`fetchWikiModuleContent missing in ${utilityPath}`);
  }
  return module;
}

async function fetchJson(url, timeoutMs) {
  const response = await withTimeout(fetch(url), timeoutMs, `Timeout fetching ${url}`);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function fetchText(url, timeoutMs) {
  const response = await withTimeout(fetch(url), timeoutMs, `Timeout fetching ${url}`);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function withTimeout(promise, timeoutMs, message) {
  let timer = null;
  try {
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer != null) {
      clearTimeout(timer);
    }
  }
}

function parseFirstRssItem(xml) {
  const itemMatch = xml.match(/<item>([\s\S]*?)<\/item>/i);
  if (!itemMatch) {
    return null;
  }
  const itemXml = itemMatch[1];
  return {
    title: decodeXml(extractXmlTag(itemXml, 'title')),
    link: decodeXml(extractXmlTag(itemXml, 'link')),
    guid: decodeXml(extractXmlTag(itemXml, 'guid')),
    pubDate: decodeXml(extractXmlTag(itemXml, 'pubDate')),
    description: decodeXml(extractCdataTag(itemXml, 'description') ?? extractXmlTag(itemXml, 'description'))
  };
}

function parseForumLatestAnnouncement(html) {
  if (typeof html !== 'string' || html.trim() === '') {
    return null;
  }

  const titleMatch = html.match(
    /<a href="([^"]+)" class="node-extra-title" title="([^"]+)">([\s\S]*?)<\/a>/i
  );
  const timeMatch = html.match(/<time\s+class="node-extra-date[^"]*"\s+[^>]*datetime="([^"]+)"/i);
  if (!titleMatch) {
    return null;
  }

  const href = decodeXml(titleMatch[1]);
  const title = decodeXml(titleMatch[2] || titleMatch[3]);
  const publishedAt = parseForumDatetimeToIso(timeMatch?.[1] ?? null);

  return {
    title,
    link: href?.startsWith('http') ? href : `https://forums.terraria.org${href}`,
    publishedAt
  };
}

function extractXmlTag(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return match?.[1]?.trim() ?? null;
}

function extractCdataTag(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tagName}>`, 'i'));
  return match?.[1]?.trim() ?? null;
}

function decodeXml(value) {
  if (typeof value !== 'string') {
    return null;
  }
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

function stripHtml(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function looksLikeVersionAnnouncement(text) {
  const normalized = String(text ?? '').toLowerCase();
  return (
    /\b\d+\.\d+(?:\.\d+){0,2}\b/.test(normalized) ||
    /(patch|hotfix|update|release|launch|version)/.test(normalized)
  );
}

function detectVersionText(text) {
  const match = String(text ?? '').match(/\b\d+\.\d+(?:\.\d+){0,2}\b/);
  return match?.[0] ?? null;
}

function toIsoDate(unixSeconds) {
  const value = Number(unixSeconds);
  if (!Number.isFinite(value)) {
    return null;
  }
  return new Date(value * 1000).toISOString();
}

function parseRfc822ToIso(value) {
  const timestamp = Date.parse(String(value ?? ''));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function parseForumDatetimeToIso(value) {
  const raw = nullableString(value);
  if (!raw) {
    return null;
  }

  const normalized = raw.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex')}`;
}

function parseSourceFilter(value) {
  const raw = nullableString(value);
  if (!raw) {
    return null;
  }

  const tokens = raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  const mapped = new Set();
  for (const token of tokens) {
    const normalized = MODULE_ALIASES[token] ?? token;
    mapped.add(normalized);
  }
  return mapped;
}

function parseCliArgs(argv) {
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

function numericOption(value, fallback) {
  if (value == null || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanOption(value, fallback) {
  if (value == null || value === '') {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function normalizePathForOutput(filePath) {
  const absolutePath = path.resolve(filePath);
  const normalizedRepoRoot = path.resolve(repoRoot);
  if (isPathInside(absolutePath, normalizedRepoRoot)) {
    return path.relative(normalizedRepoRoot, absolutePath).replaceAll('\\', '/');
  }
  const normalizedSharedDataRoot = path.resolve(sharedDataRoot);
  if (isPathInside(absolutePath, normalizedSharedDataRoot)) {
    return path.relative(normalizedSharedDataRoot, absolutePath).replaceAll('\\', '/');
  }
  return absolutePath.replaceAll('\\', '/');
}

function isPathInside(candidatePath, rootPath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function loadJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function deepSortObject(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => deepSortObject(entry));
  }
  if (!isObject(value)) {
    return value;
  }

  const sorted = {};
  for (const key of Object.keys(value).sort((left, right) => left.localeCompare(right))) {
    sorted[key] = deepSortObject(value[key]);
  }
  return sorted;
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function renderTextSummary(summary) {
  const lines = [
    `checkedAt: ${summary.checkedAt}`,
    `action: ${summary.action}`,
    `hasUpdates: ${summary.hasUpdates}`,
    `modulesChecked: ${summary.modulesChecked}`,
    `officialChecked: ${summary.officialChecked}`,
    `changes: ${summary.changes.length}`,
    `warnings: ${summary.warnings.length}`,
    `stateFile: ${summary.stateFile}`,
    `outputFile: ${summary.outputFile}`
  ];

  for (const change of summary.changes) {
    lines.push(`change: ${change.sourceKey} ${change.reason}`);
  }
  for (const warning of summary.warnings) {
    lines.push(`warning: [${warning.severity}] ${warning.message}`);
  }
  return lines.join('\n');
}

function failWithUsage(message) {
  console.error(message);
  process.exit(2);
}
