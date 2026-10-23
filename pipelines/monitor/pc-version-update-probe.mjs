import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  DEFAULT_WIKI_API_URL,
  fetchWikiPagePayload,
  writeJsonNoOverwrite
} from '../lib/wiki-item-utils.mjs';
import { resolveProjectPath } from '../lib/project-root.mjs';
import {
  buildActionProgressPayload,
  createCrawlerProgressHeartbeat,
  writeJsonFile
} from '../workflow/backend-refresh-runtime-state.mjs';
import { mapPcVersionBulletin } from './pc-version-update-mapping.mjs';
import { loadPcVersionIdentityCatalog } from './pc-version-update-identity-catalog.mjs';

export const DEFAULT_PC_VERSION_BASELINE = '1.4.5.8';
export const PC_VERSION_UPDATE_ACTION_ID = 'pc-version-update-probe';
export const DEFAULT_PC_VERSION_UPDATE_PROGRESS_PATH = path.join(
  'reports', 'crawler-monitor', 'pc-version-update-triage', 'progress.latest.json'
);

const CURRENT_VERSIONS_PAGE = 'Template:Current versions';
const DESKTOP_HISTORY_PAGE = 'Desktop version history';
const VERSION_PATTERN = /^[0-9]+(?:\.[0-9]+)+$/;

export function comparePcVersions(leftVersion, rightVersion) {
  const left = parsePcVersion(leftVersion);
  const right = parsePcVersion(rightVersion);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
}

export function extractDesktopCurrentVersion(wikitext) {
  if (typeof wikitext !== 'string') {
    throw new Error('Desktop version source is missing wikitext');
  }
  const visibleWikitext = stripHtmlComments(wikitext);
  const matches = [...visibleWikitext.matchAll(
    /\{\{\s*#vardefine\s*:\s*currentversions\s*:\s*desktop-version\s*\|\s*([0-9]+(?:\.[0-9]+)+)\s*\}\}/gi
  )];
  if (matches.length === 0) {
    throw new Error('Desktop version source is missing the desktop-version field');
  }
  if (matches.length !== 1) {
    throw new Error('Desktop version source is ambiguous: multiple desktop-version fields');
  }
  return matches[0][1];
}

export function extractDesktopHistoryVersions(wikitext) {
  if (typeof wikitext !== 'string') {
    throw new Error('Desktop history source is missing wikitext');
  }
  const releases = [];
  const seen = new Set();
  const lines = stripHtmlComments(wikitext).split(/\r?\n/);
  const anchorPattern = /\{\{\s*anchor\s*\|\s*([0-9]+(?:\.[0-9]+)+)\s*\}\}/gi;
  const releaseRowPattern = /^\s*\|\s*\{\{\s*anchor\s*\|\s*([0-9]+(?:\.[0-9]+)+)\s*\}\}\s*(?:'{1,5})?\s*\[\[\s*([0-9]+(?:\.[0-9]+)+)(?:\|[^\]]*)?\]\]\s*(?:'{1,5})?\s*$/;

  for (const [lineIndex, line] of lines.entries()) {
    const anchors = [...line.matchAll(anchorPattern)];
    if (anchors.length === 0) continue;
    if (anchors.length !== 1) {
      throw new Error(`Desktop history source is ambiguous at line ${lineIndex + 1}`);
    }
    const row = line.match(releaseRowPattern);
    if (!row || row[1] !== row[2]) {
      throw new Error(`Desktop history source has an unsupported or ambiguous release row at line ${lineIndex + 1}`);
    }
    const version = validatePcVersion(row[1], 'Desktop history release');
    if (seen.has(version)) {
      throw new Error(`Desktop history source has a duplicate release version: ${version}`);
    }
    seen.add(version);
    releases.push({ version, lineNumber: lineIndex + 1, rawLine: line.trim() });
  }

  if (releases.length === 0) {
    throw new Error('Desktop history source is missing recognized release rows');
  }
  return releases.sort((left, right) => comparePcVersions(left.version, right.version));
}

export function planDesktopReleaseCatchUp({
  currentVersion,
  historyVersions,
  lastEvaluatedVersion = DEFAULT_PC_VERSION_BASELINE
} = {}) {
  const current = validatePcVersion(currentVersion, 'current Desktop version');
  const cursor = validatePcVersion(lastEvaluatedVersion, 'last evaluated Desktop version');
  if (comparePcVersions(cursor, DEFAULT_PC_VERSION_BASELINE) < 0) {
    throw new Error(`Desktop version cursor predates the pinned baseline ${DEFAULT_PC_VERSION_BASELINE}`);
  }
  if (!Array.isArray(historyVersions) || historyVersions.length === 0) {
    throw new Error('Desktop version history is missing release versions');
  }

  const normalizedVersions = historyVersions.map((entry) => validatePcVersion(
    typeof entry === 'string' ? entry : entry?.version,
    'Desktop history release'
  ));
  const versionSet = new Set(normalizedVersions);
  if (versionSet.size !== normalizedVersions.length) {
    throw new Error('Desktop version history is ambiguous: duplicate release versions');
  }
  if (!versionSet.has(DEFAULT_PC_VERSION_BASELINE)) {
    throw new Error(`Desktop version history is missing the pinned baseline ${DEFAULT_PC_VERSION_BASELINE}`);
  }
  if (!versionSet.has(cursor)) {
    throw new Error(`Desktop version cursor ${cursor} is not present in history`);
  }
  if (!versionSet.has(current)) {
    throw new Error(`Current Desktop version ${current} is missing from Desktop history`);
  }
  if (comparePcVersions(current, cursor) < 0) {
    throw new Error(`Current Desktop version ${current} is older than history cursor ${cursor}`);
  }

  return normalizedVersions
    .filter((version) => comparePcVersions(version, cursor) > 0 && comparePcVersions(version, current) <= 0)
    .sort(comparePcVersions);
}

export async function probePcVersionUpdates(options = {}, dependencies = {}) {
  const apiUrl = options.apiUrl ?? DEFAULT_WIKI_API_URL;
  const cursor = options.lastEvaluatedDesktopVersion ?? DEFAULT_PC_VERSION_BASELINE;
  const configuredProgressPath = options.progressPath
    ?? process.env.TERRAPEDIA_CRAWLER_PROGRESS_PATH
    ?? DEFAULT_PC_VERSION_UPDATE_PROGRESS_PATH;
  const projectRoot = resolveProjectPath();
  const progressFilePath = resolveProgressFilePath(configuredProgressPath, projectRoot);
  const outputPath = options.outputPath ?? defaultProbeOutputPath();
  const reportFilePath = resolveContainedOutputPath(outputPath, projectRoot);
  const childStatusPath = path.relative(projectRoot, progressFilePath).split(path.sep).join('/');
  const writeFile = dependencies.writeProgress
    ?? ((filePath, payload) => writeJsonFile(filePath, payload));
  let progressWriteError = null;
  const heartbeat = createCrawlerProgressHeartbeat({
    intervalMs: positiveInteger(options.heartbeatMs, 15_000),
    writeProgress(payload) {
      if (progressWriteError) return;
      try {
        assertNoSymlinkedProgressPath(progressFilePath, projectRoot);
        writeFile(progressFilePath, payload);
      } catch (error) {
        progressWriteError = error instanceof Error ? error : new Error(String(error));
      }
    }
  });

  let current = 0;
  let total = 2;
  const startedAt = new Date().toISOString();
  const assertProgressHealthy = () => {
    if (progressWriteError) {
      throw new Error(`PC version probe progress write failed: ${compactError(progressWriteError)}`, {
        cause: progressWriteError
      });
    }
  };
  const publish = (status, phase, message) => {
    heartbeat.publish(buildActionProgressPayload({
      actionId: PC_VERSION_UPDATE_ACTION_ID,
      status,
      phase,
      message,
      current,
      total,
      overallCurrent: current,
      overallTotal: total,
      startedAt,
      generatedAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      childStatusPath,
      outputPath: path.relative(projectRoot, reportFilePath).split(path.sep).join('/'),
      reportPath: path.relative(projectRoot, reportFilePath).split(path.sep).join('/')
    }));
    assertProgressHealthy();
  };

  try {
    publish('running', 'start', 'checking Desktop version and history sources');

    const fetchPage = dependencies.fetchWikiPagePayloadImpl ?? fetchWikiPagePayload;
    const identityCatalog = dependencies.identityCatalog ?? loadPcVersionIdentityCatalog({ projectRoot });
    const currentPage = await fetchPage({
      pageTitle: CURRENT_VERSIONS_PAGE,
      apiUrl,
      requireRevisionBinding: true
    });
    assertProgressHealthy();
    current += 1;
    publish('running', 'current-version', `read ${CURRENT_VERSIONS_PAGE}`);
    const currentVersion = extractDesktopCurrentVersion(requireSourcePage(currentPage, CURRENT_VERSIONS_PAGE).wikitext);

    const historyPage = await fetchPage({
      pageTitle: DESKTOP_HISTORY_PAGE,
      apiUrl,
      requireRevisionBinding: true
    });
    assertProgressHealthy();
    current += 1;
    const historySource = requireSourcePage(historyPage, DESKTOP_HISTORY_PAGE);
    const historyReleases = extractDesktopHistoryVersions(historySource.wikitext);
    const releaseVersions = planDesktopReleaseCatchUp({
      currentVersion,
      historyVersions: historyReleases,
      lastEvaluatedVersion: cursor
    });
    total = current + releaseVersions.length;
    publish('running', 'release-plan', `found ${releaseVersions.length} unevaluated Desktop release(s)`);

    const releaseByVersion = new Map(historyReleases.map((release) => [release.version, release]));
    const releases = [];
    for (const version of releaseVersions) {
      const page = await fetchPage({
        pageTitle: version,
        apiUrl,
        requireRevisionBinding: true
      });
      assertProgressHealthy();
      const source = requireSourcePage(page, version);
      if (normalizeWikiTitle(source.pageTitle) !== version) {
        throw new Error(`PC release page title mismatch for ${version}: ${source.pageTitle}`);
      }
      const bulletins = extractReleaseBulletins(source.wikitext, version).map((bulletin) => ({
        ...bulletin,
        ...mapPcVersionBulletin({
          sectionTitle: bulletin.sectionTitle,
          rawText: bulletin.rawText,
          text: bulletin.text,
          catalog: identityCatalog
        })
      }));
      releases.push({
        version,
        historyEvidence: releaseByVersion.get(version),
        source: buildSourceEvidence(source, apiUrl),
        bulletins
      });
      current += 1;
      publish('running', 'release-page', `read Desktop release ${version}`);
    }

    const report = {
      schemaVersion: 'pc-version-update-probe/v1',
      actionId: PC_VERSION_UPDATE_ACTION_ID,
      runId: randomUUID(),
      generatedAt: new Date().toISOString(),
      targetPlatform: 'Desktop/PC',
      baselineVersion: DEFAULT_PC_VERSION_BASELINE,
      lastEvaluatedDesktopVersion: cursor,
      currentDesktopVersion: currentVersion,
      plannedReleaseVersions: releaseVersions,
      currentVersionSource: buildSourceEvidence(requireSourcePage(currentPage, CURRENT_VERSIONS_PAGE), apiUrl),
      historySource: buildSourceEvidence(historySource, apiUrl),
      identityCatalogProvenance: identityCatalog?.provenance ?? null,
      outputPath: path.relative(projectRoot, reportFilePath).split(path.sep).join('/'),
      releases
    };
    publish('completed', 'complete', `completed Desktop version probe through ${currentVersion}`);
    return report;
  } catch (error) {
    try {
      publish('failed', 'error', compactError(error));
    } catch {
      // Preserve the source/probe error when progress publication also fails.
    }
    throw error;
  } finally {
    heartbeat.stop();
  }
}

export function extractReleaseBulletins(wikitext, version) {
  if (typeof wikitext !== 'string') {
    throw new Error(`PC release ${version} source is missing wikitext`);
  }
  const originalLines = wikitext.split(/\r?\n/);
  const lines = stripHtmlComments(wikitext).split(/\r?\n/);
  const changelogHeadings = [];
  for (const [index, line] of lines.entries()) {
    const heading = line.match(/^\s*==\s*([^=].*?)\s*==\s*$/);
    if (heading && heading[1].trim().toLowerCase() === 'changelog') changelogHeadings.push(index);
  }
  if (changelogHeadings.length !== 1) {
    throw new Error(`PC release ${version} changelog section is ${changelogHeadings.length === 0 ? 'missing' : 'ambiguous'}`);
  }

  const start = changelogHeadings[0] + 1;
  let end = lines.length;
  for (let index = start; index < lines.length; index += 1) {
    if (/^\s*==\s*[^=].*?\s*==\s*$/.test(lines[index])) {
      end = index;
      break;
    }
  }

  const bulletins = [];
  let sectionTitle = 'Changelog';
  let sectionIndex = -1;
  let position = 0;
  const bulletinOccurrences = new Map();
  for (let index = start; index < end; index += 1) {
    const section = lines[index].match(/^\s*===\s*(.*?)\s*===\s*$/);
    if (section) {
      sectionTitle = section[1].trim();
      sectionIndex += 1;
      position = 0;
      continue;
    }
    const bullet = lines[index].match(/^\s*([*#]+)\s+(.+?)\s*$/);
    if (!bullet || !bullet[2]) continue;
    const originalBullet = originalLines[index].match(/^\s*([*#]+)\s+(.+?)\s*$/);
    if (!originalBullet) continue;
    const canonicalText = stripHtmlComments(originalBullet[2]).normalize('NFKC').replace(/\s+/g, ' ').trim();
    const canonicalSection = sectionTitle.normalize('NFKC').trim().toLocaleLowerCase('en-US');
    const occurrenceKey = `${canonicalSection}\n${canonicalText}`;
    const occurrence = bulletinOccurrences.get(occurrenceKey) ?? 0;
    bulletinOccurrences.set(occurrenceKey, occurrence + 1);
    const bulletinId = createHash('sha256')
      .update(`${version}\n${occurrenceKey}\n${occurrence}`)
      .digest('hex');
    bulletins.push({
      bulletinId: `${version}:${bulletinId}`,
      sectionTitle,
      sectionIndex: Math.max(sectionIndex, 0),
      position,
      sourceLine: index + 1,
      rawText: originalBullet[2],
      text: stripWikiMarkup(bullet[2])
    });
    position += 1;
  }

  if (bulletins.length === 0) {
    throw new Error(`PC release ${version} changelog contains no recognized bulletins`);
  }
  return bulletins;
}

export function parseProbeCliArgs(argv = []) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = String(argv[index]);
    if (!argument.startsWith('--')) throw new Error(`unexpected probe argument: ${argument}`);
    const [name, inlineValue] = argument.slice(2).split(/=(.*)/s, 2);
    if (!['progress-path', 'output-path', 'last-evaluated-version', 'wiki-api-url', 'heartbeat-ms'].includes(name)) {
      throw new Error(`unsupported probe option: --${name}`);
    }
    const value = inlineValue ?? argv[index + 1];
    if (value == null || String(value).startsWith('--')) throw new Error(`missing value for --${name}`);
    if (inlineValue == null) index += 1;
    const key = {
      'progress-path': 'progressPath',
      'output-path': 'outputPath',
      'last-evaluated-version': 'lastEvaluatedDesktopVersion',
      'wiki-api-url': 'apiUrl',
      'heartbeat-ms': 'heartbeatMs'
    }[name];
    options[key] = key === 'heartbeatMs' ? Number(value) : String(value);
  }
  return options;
}

export function publishPcVersionProbeReport(report, dependencies = {}) {
  const projectRoot = dependencies.projectRoot ?? resolveProjectPath();
  const reportPath = resolveContainedOutputPath(report?.outputPath, projectRoot);
  assertNoSymlinkedProgressPath(reportPath, projectRoot);
  const writeReport = dependencies.writeReport
    ?? ((filePath, payload) => writeJsonNoOverwrite(filePath, payload));
  writeReport(reportPath, report);
  return path.relative(projectRoot, reportPath).split(path.sep).join('/');
}

export function finalizePcVersionProbeReport(report, options = {}, dependencies = {}) {
  try {
    return publishPcVersionProbeReport(report, dependencies);
  } catch (error) {
    const projectRoot = dependencies.projectRoot ?? resolveProjectPath();
    const progressPath = options.progressPath
      ?? process.env.TERRAPEDIA_CRAWLER_PROGRESS_PATH
      ?? DEFAULT_PC_VERSION_UPDATE_PROGRESS_PATH;
    const progressFilePath = resolveProgressFilePath(progressPath, projectRoot);
    const now = new Date().toISOString();
    const payload = buildActionProgressPayload({
      actionId: PC_VERSION_UPDATE_ACTION_ID,
      status: 'failed',
      phase: 'report-publication',
      message: `PC version report publication failed: ${compactError(error)}`,
      current: null,
      total: null,
      generatedAt: now,
      lastHeartbeatAt: now,
      childStatusPath: path.relative(projectRoot, progressFilePath).split(path.sep).join('/'),
      outputPath: report?.outputPath ?? null,
      reportPath: report?.outputPath ?? null
    });
    const writeProgress = dependencies.writeProgress
      ?? ((filePath, progress) => writeJsonFile(filePath, progress));
    writeProgress(progressFilePath, payload);
    throw error;
  }
}

function parsePcVersion(value) {
  const version = String(value ?? '').trim();
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`invalid Desktop version: ${version || '(empty)'}`);
  }
  return version.split('.').map(Number);
}

function validatePcVersion(value, label) {
  const version = String(value ?? '').trim();
  if (!VERSION_PATTERN.test(version)) throw new Error(`${label} is missing or invalid: ${version || '(empty)'}`);
  return version;
}

function requireSourcePage(page, requestedTitle) {
  if (typeof page?.wikitext !== 'string' || page.wikitext.trim() === '') {
    throw new Error(`Wiki source page is missing or revisionless: ${requestedTitle}`);
  }
  const pageTitle = normalizeWikiTitle(page.pageTitle ?? page.requestedPageTitle);
  if (pageTitle !== normalizeWikiTitle(requestedTitle)) {
    throw new Error(`Wiki source page title mismatch for ${requestedTitle}: ${page.pageTitle ?? '(missing)'}`);
  }
  if (!Number.isSafeInteger(Number(page.pageId)) || Number(page.pageId) <= 0
      || !Number.isSafeInteger(Number(page.revisionId)) || Number(page.revisionId) <= 0
      || !Number.isFinite(Date.parse(page.revisionTimestamp))) {
    throw new Error(`Wiki source page revision identity is missing for ${requestedTitle}`);
  }
  return {
    ...page,
    pageTitle,
    pageId: Number(page.pageId),
    revisionId: Number(page.revisionId)
  };
}

function buildSourceEvidence(page, apiUrl) {
  return {
    pageTitle: page.pageTitle,
    pageId: page.pageId,
    revisionId: page.revisionId,
    revisionTimestamp: page.revisionTimestamp,
    pageUrl: buildWikiPageUrl(page.pageTitle, apiUrl)
  };
}

function buildWikiPageUrl(pageTitle, apiUrl) {
  const api = new URL(apiUrl);
  const basePath = api.pathname.replace(/\/api\.php$/i, '/wiki/');
  const title = encodeURIComponent(String(pageTitle).replaceAll(' ', '_'));
  return `${api.origin}${basePath}${title}`;
}

function normalizeWikiTitle(value) {
  return String(value ?? '').replaceAll('_', ' ').trim();
}

function resolveProgressFilePath(configuredPath, projectRoot) {
  if (typeof configuredPath !== 'string' || configuredPath.trim() === '') {
    throw new Error('PC version probe progress path must be a non-empty path');
  }
  const resolved = path.isAbsolute(configuredPath)
    ? path.resolve(configuredPath)
    : path.resolve(projectRoot, configuredPath);
  const relative = path.relative(projectRoot, resolved);
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('PC version probe progress path must remain inside the repository root');
  }
  assertNoSymlinkedProgressPath(resolved, projectRoot);
  return resolved;
}

function resolveContainedOutputPath(configuredPath, projectRoot) {
  if (typeof configuredPath !== 'string' || configuredPath.trim() === '') {
    throw new Error('PC version probe output path must be a non-empty path');
  }
  const resolved = path.isAbsolute(configuredPath)
    ? path.resolve(configuredPath)
    : path.resolve(projectRoot, configuredPath);
  const relative = path.relative(projectRoot, resolved);
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('PC version probe output path must remain inside the repository root');
  }
  assertNoSymlinkedProgressPath(resolved, projectRoot);
  return resolved;
}

function defaultProbeOutputPath() {
  const timestamp = new Date().toISOString().replace(/[^0-9A-Za-z]+/g, '-');
  return path.join('reports', 'crawler-monitor', 'pc-version-update-triage', 'runs', `pc-version-update-probe-${timestamp}-${randomUUID()}.json`);
}

function assertNoSymlinkedProgressPath(targetPath, projectRoot) {
  const normalizedRoot = path.resolve(projectRoot);
  if (fs.realpathSync(normalizedRoot) !== normalizedRoot) {
    throw new Error('PC version probe repository root contains a symlink');
  }
  const rootStats = fs.lstatSync(normalizedRoot);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw new Error('PC version probe repository root is not a canonical directory');
  }

  const relative = path.relative(normalizedRoot, targetPath);
  let currentPath = normalizedRoot;
  const segments = relative.split(path.sep).filter(Boolean);
  for (const [index, segment] of segments.entries()) {
    currentPath = path.join(currentPath, segment);
    let stats;
    try {
      stats = fs.lstatSync(currentPath);
    } catch (error) {
      if (error?.code === 'ENOENT') break;
      throw error;
    }
    if (stats.isSymbolicLink()) {
      throw new Error(`PC version probe progress path contains a symlink: ${currentPath}`);
    }
    if (index < segments.length - 1 && !stats.isDirectory()) {
      throw new Error(`PC version probe progress parent is not a directory: ${currentPath}`);
    }
  }
}

function stripWikiMarkup(value) {
  return String(value)
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\s]+)\s+([^\]]+)\]/g, '$2')
    .replace(/'{2,5}/g, '')
    .replace(/<ref\b[^>]*\/\s*>/gi, '')
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/\{\{sic\}\}/gi, '[sic]')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtmlComments(value) {
  return String(value ?? '').replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, ' '));
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function compactError(error) {
  return String(error?.message ?? error ?? 'unknown probe error').replace(/\s+/g, ' ').slice(0, 400);
}

async function runCli() {
  try {
    const options = parseProbeCliArgs(process.argv.slice(2));
    const report = await probePcVersionUpdates(options);
    finalizePcVersionProbeReport(report, options);
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } catch (error) {
    process.stderr.write(`${compactError(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await runCli();
}
