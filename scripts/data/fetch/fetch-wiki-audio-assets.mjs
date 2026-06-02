#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { createWikiRequestGate } from '../lib/wiki-request-gate.mjs';
import { getProjectRoot, resolveSharedDataRoot } from '../lib/project-root.mjs';
import {
  buildActionProgressPayload,
  writeJsonFile
} from '../workflow/backend-refresh-runtime-state.mjs';

const ACTION_ID = 'wiki-audio-assets-refresh';
const API_URL = 'https://terraria.wiki.gg/api.php';
const repoRoot = getProjectRoot();
const DEFAULT_PROGRESS_PATH = path.join(repoRoot, 'data', 'generated', 'wiki-audio-assets-progress.latest.json');
const DEFAULT_OUTPUT_JSON_PATH = resolveSharedDataRoot('generated', 'wiki-audio-assets.latest.json');
const DEFAULT_OUTPUT_DIR = resolveSharedDataRoot('media', 'audio', 'wiki');
const DEFAULT_SCOPES = ['bgm', 'npcs', 'items'];
const DEFAULT_LIMIT_PER_SCOPE = 3;
const DEFAULT_MAX_API_PAGES_PER_PREFIX = 1;
const DEFAULT_MAX_TOTAL_FILES = 12;
const DEFAULT_MAX_FILE_BYTES = 10_485_760;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 1_000;
const DEFAULT_STALE_LOCK_MS = 30 * 60 * 1000;
const ALLOWED_MIME = new Set(['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg']);
const SAMPLE_CAPS = {
  limitPerScope: 50,
  maxApiPagesPerPrefix: 5,
  maxTotalFiles: 150
};

const SCOPE_PREFIXES = {
  bgm: [{ prefix: 'Music', kind: 'bgm_track' }],
  npcs: [
    { prefix: 'NPC_Hit', kind: 'npc_hit_sound' },
    { prefix: 'NPC_Killed', kind: 'npc_death_sound' }
  ],
  items: [{ prefix: 'Item_', kind: 'item_sound' }]
};
const SHARD_PREFIXES = {
  bgm: { prefix: 'Music', kind: 'bgm_track' },
  npc_hit: { prefix: 'NPC_Hit', kind: 'npc_hit_sound' },
  npc_death: { prefix: 'NPC_Killed', kind: 'npc_death_sound' },
  items: { prefix: 'Item_', kind: 'item_sound' }
};

await main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(argv = process.argv.slice(2), env = process.env) {
  const startedAt = new Date().toISOString();
  const args = parseArgs(argv);
  const config = resolveRunConfig(args, env, startedAt);
  let lock = null;
  let lastProgress = { current: 0, total: 0 };

  const writeProgress = (progress) => {
    lastProgress = {
      current: progress.current ?? lastProgress.current ?? 0,
      total: progress.total ?? lastProgress.total ?? 0
    };
    const generatedAt = progress.generatedAt ?? new Date().toISOString();
    const base = {
      startedAt,
      outputPath: config.outputJsonPath,
      reportPath: config.reportPath,
      batchOffset: 0,
      batchLimit: config.maxTotalFiles,
      queue: config.mode === 'sample' ? 'wiki audio assets' : 'wiki audio assets full crawl',
      dataStage: config.mode === 'sample'
        ? 'wiki allimages/imageinfo -> shared audio metadata'
        : 'wiki allimages manifest -> shared audio metadata',
      nextStep: progress.nextStep ?? 'review metadata, then decide whether to wire playback or DB import in a separate task',
      ...progress,
      generatedAt,
      lastHeartbeatAt: generatedAt
    };
    const payload = buildAudioProgressPayload(base, config.progressPath);
    writeJsonFile(config.progressPath, payload);
    if (path.resolve(config.progressPath) !== path.resolve(config.canonicalProgressPath)) {
      writeJsonFile(config.canonicalProgressPath, buildAudioProgressPayload(base, config.canonicalProgressPath));
    }
  };

  try {
    enforceFullCorpusGuard(config);
    lock = acquireLock(config);
    writeProgress({
      status: 'running',
      phase: 'start',
      message: 'starting wiki audio asset fetch',
      current: 0,
      total: 0
    });
    const mock = loadMock(env.TERRAPEDIA_WIKI_AUDIO_MOCK_API_RESPONSE);
    const gate = createWikiRequestGate();

    if (config.mode === 'discover') {
      const manifest = await discoverManifest({ config, gate, mock, writeProgress, startedAt });
      writeJsonFile(config.manifestOutputPath, manifest);
      const report = buildDiscoveryReport({ config, manifest, startedAt });
      writeJsonFile(config.reportPath, report);
      writeProgress({
        status: 'completed',
        phase: 'discover',
        message: `finished wiki audio discovery; audioRows=${manifest.summary.audioRows}`,
        current: manifest.summary.audioRows,
        total: manifest.summary.audioRows
      });
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    if (config.mode === 'all') {
      const manifest = await discoverManifest({ config, gate, mock, writeProgress, startedAt });
      writeJsonFile(config.manifestOutputPath, manifest);
      config.manifestJsonPath = config.manifestOutputPath;
    }

    let manifest = null;
    const candidates = config.mode === 'sample'
      ? await discoverCandidates({ config, gate, mock, writeProgress })
      : (() => {
          manifest = readJson(config.manifestJsonPath);
          config.manifestSummary = manifest.summary;
          const allowedShards = new Set(config.shards);
          return manifest.assets
            .map(normalizeManifestCandidate)
            .filter((asset) => allowedShards.size === 0 || allowedShards.has(asset.shard));
        })();
    if (candidates.length > config.maxTotalFiles) {
      throw new Error(`Discovered ${candidates.length} audio candidates, exceeding --max-total-files=${config.maxTotalFiles}`);
    }
    writeProgress({
      status: 'running',
      phase: 'download',
      message: `downloading ${candidates.length} audio assets`,
      current: 0,
      total: candidates.length
    });

    const resumeAssets = loadResumeAssets(config);
    const assets = [];
    const failures = [];
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      writeProgress({
        status: 'running',
        phase: 'download',
        message: `downloading ${candidate.name}`,
        current: index,
        total: candidates.length
      });
      try {
        const asset = await downloadAsset({ candidate, config, gate, mock, resumeAssets });
        assets.push(asset);
      } catch (error) {
        failures.push({
          assetId: candidate.assetId,
          scope: candidate.scope,
          shard: candidate.shard,
          prefix: candidate.prefix,
          name: candidate.name,
          reason: error instanceof Error ? error.message : String(error),
          attempts: error?.attempts ?? 1,
          retryExhausted: error?.retryExhausted === true
        });
      }
      writeProgress({
        status: 'running',
        phase: 'download',
        message: `processed ${index + 1}/${candidates.length} audio assets`,
        current: index + 1,
        total: candidates.length
      });
    }

    const payload = buildMetadataPayload({ config, assets, failures, startedAt });
    const report = buildReportPayload({ config, assets, failures, startedAt });
    const summary = report.summary;

    writeJsonFile(config.runOutputPath, payload);
    if (failures.length === 0 || config.publishPartial) {
      writeJsonFile(config.outputJsonPath, payload);
    }
    writeJsonFile(config.reportPath, report);

    writeProgress({
      status: failures.length > 0 ? 'failed' : 'completed',
      phase: 'write',
      message: failures.length > 0
        ? `finished with ${failures.length} audio asset failure(s)`
        : `finished wiki audio asset fetch; downloaded=${summary.downloaded}; skippedExisting=${summary.skippedExisting}`,
      current: candidates.length,
      total: candidates.length,
      nextStep: failures.length > 0
        ? 'inspect report failures before widening the fetch scope'
        : 'review metadata, then decide whether to wire playback or DB import in a separate task'
    });

    console.log(JSON.stringify(report, null, 2));
    if (failures.length > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeProgress({
      status: 'failed',
      phase: 'error',
      message,
      current: lastProgress.current,
      total: lastProgress.total,
      nextStep: 'check wiki audio fetch caps, mock payload, or wiki.gg availability before retrying'
    });
    throw error;
  } finally {
    releaseLock(lock);
  }
}

async function discoverCandidates({ config, gate, mock, writeProgress }) {
  const all = [];
  for (const scope of config.scopes) {
    const scopeCandidates = [];
    const prefixes = SCOPE_PREFIXES[scope] ?? [];
    for (const prefixConfig of prefixes) {
      writeProgress({
        status: 'running',
        phase: 'discover',
        message: `querying ${prefixConfig.prefix}`,
        current: all.length,
        total: 0
      });
      const rows = await fetchAllImages({
        prefix: prefixConfig.prefix,
        maxPages: config.maxApiPagesPerPrefix,
        gate,
        mock
      });
      for (const row of rows.rows) {
        if (scopeCandidates.length >= config.limitPerScope) break;
        const mime = String(row.mime ?? '').toLowerCase();
        if (!ALLOWED_MIME.has(mime)) continue;
        scopeCandidates.push(buildCandidate({ row, scope, kind: prefixConfig.kind }));
      }
    }
    all.push(...scopeCandidates.slice(0, config.limitPerScope));
  }
  return all.slice(0, config.maxTotalFiles + 1);
}

async function discoverManifest({ config, gate, mock, writeProgress, startedAt }) {
  const assets = [];
  const unsupported = [];
  const prefixes = [];
  const shardConfigs = resolveShardConfigs(config);
  for (const shardConfig of shardConfigs) {
    writeProgress({
      status: 'running',
      phase: 'discover',
      message: `querying ${shardConfig.prefix}`,
      current: assets.length,
      total: 0
    });
    const result = await fetchAllImages({
      prefix: shardConfig.prefix,
      maxPages: config.maxApiPagesPerPrefix,
      gate,
      mock
    });
    const audioRows = [];
    const unsupportedRows = [];
    for (const row of result.rows) {
      const mime = String(row.mime ?? '').toLowerCase();
      if (ALLOWED_MIME.has(mime)) {
        audioRows.push(row);
        assets.push(buildCandidate({
          row,
          scope: shardConfig.shard,
          shard: shardConfig.shard,
          kind: shardConfig.kind,
          prefix: shardConfig.prefix
        }));
      } else {
        const skipped = {
          prefix: shardConfig.prefix,
          name: String(row.name ?? ''),
          mime,
          size: Number(row.size ?? 0)
        };
        unsupportedRows.push(skipped);
        unsupported.push(skipped);
      }
    }
    prefixes.push({
      shard: shardConfig.shard,
      prefix: shardConfig.prefix,
      kind: shardConfig.kind,
      pagesFetched: result.pagesFetched,
      allRows: result.rows.length,
      audioRows: audioRows.length,
      unsupportedRows: unsupportedRows.length,
      totalBytes: audioRows.reduce((sum, row) => sum + Number(row.size ?? 0), 0),
      lastContinue: result.lastContinue,
      continuationComplete: result.continuationComplete
    });
    writeProgress({
      status: 'running',
      phase: 'discover',
      message: `discovered ${shardConfig.prefix}`,
      current: assets.length,
      total: assets.length
    });
  }
  if (assets.length > config.maxTotalFiles) {
    throw new Error(`Discovered ${assets.length} audio candidates, exceeding --max-total-files=${config.maxTotalFiles}`);
  }
  return {
    generatedAt: new Date().toISOString(),
    startedAt,
    contractVersion: 1,
    source: {
      apiUrl: API_URL,
      mode: 'wiki-allimages-audio-manifest'
    },
    summary: {
      prefixes: prefixes.length,
      allRows: prefixes.reduce((sum, entry) => sum + entry.allRows, 0),
      audioRows: assets.length,
      unsupportedRows: unsupported.length,
      totalBytes: assets.reduce((sum, asset) => sum + asset.size, 0),
      continuationComplete: prefixes.every((entry) => entry.continuationComplete)
    },
    prefixes,
    assets,
    unsupported
  };
}

async function fetchAllImages({ prefix, maxPages, gate, mock }) {
  if (mock) {
    const value = mock.allimages?.[prefix];
    if (!Array.isArray(value)) {
      return { rows: [], pagesFetched: 0, lastContinue: null, continuationComplete: true };
    }
    if (value.length > 0 && Object.hasOwn(value[0], 'rows')) {
      const pages = value.slice(0, maxPages);
      const rows = pages.flatMap((page) => Array.isArray(page.rows) ? page.rows : []);
      const lastPage = pages.at(-1);
      const lastContinue = lastPage?.continue ?? null;
      return {
        rows,
        pagesFetched: pages.length,
        lastContinue,
        continuationComplete: !lastContinue
      };
    }
    return { rows: value, pagesFetched: value.length > 0 ? 1 : 0, lastContinue: null, continuationComplete: true };
  }

  const rows = [];
  let continuation = null;
  let pagesFetched = 0;
  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL(API_URL);
    url.searchParams.set('action', 'query');
    url.searchParams.set('format', 'json');
    url.searchParams.set('list', 'allimages');
    url.searchParams.set('aiprefix', prefix);
    url.searchParams.set('ailimit', '50');
    url.searchParams.set('aiprop', 'url|mime|size');
    if (continuation) {
      url.searchParams.set('aicontinue', continuation);
    }
    const payload = await gate.runJsonRequest(url, {
      profile: 'revision',
      sourceKey: `audio:${prefix}`
    });
    pagesFetched += 1;
    rows.push(...(payload.query?.allimages ?? []));
    continuation = payload.continue?.aicontinue ?? null;
    if (!continuation) break;
  }
  return {
    rows,
    pagesFetched,
    lastContinue: continuation,
    continuationComplete: !continuation
  };
}

async function downloadAsset({ candidate, config, gate, mock, resumeAssets = new Map() }) {
  if (candidate.size > config.maxFileBytes) {
    throw new Error(`audio file exceeds --max-file-bytes=${config.maxFileBytes}`);
  }

  const extension = extensionFor(candidate);
  const fileName = `${candidate.slug}${extension}`;
  const shard = candidate.shard ?? candidate.scope;
  const absoluteLocalPath = path.join(config.outputDir, shard, fileName);
  const localPath = toSharedAudioPath(shard, fileName);
  const resumeAsset = resumeAssets.get(candidate.assetId);
  if (config.skipExisting && fs.existsSync(absoluteLocalPath)) {
    const stats = fs.statSync(absoluteLocalPath);
    const fileHash = crypto.createHash('sha256').update(fs.readFileSync(absoluteLocalPath)).digest('hex');
    if (stats.size === candidate.size) {
      const resumeMatches = resumeAsset?.size === candidate.size && resumeAsset?.sha256 === fileHash;
      return {
        ...baseAsset(candidate, { absoluteLocalPath, localPath, hash: fileHash }),
        status: resumeMatches ? 'skipped_existing' : 'skipped_existing_unverified_source',
        attempts: 0,
        owners: resumeAsset?.owners ?? []
      };
    }
  }
  let body = Buffer.alloc(0);
  let attempts = 0;

  if (!config.skipDownload) {
    body = await withRetry(async () => {
      attempts += 1;
      return fetchBinary(candidate.url, { gate, mock, timeoutMs: config.requestTimeoutMs });
    }, config);
    if (body.length > config.maxFileBytes) {
      throw new Error(`downloaded audio file exceeds --max-file-bytes=${config.maxFileBytes}`);
    }
    fs.mkdirSync(path.dirname(absoluteLocalPath), { recursive: true });
    const tempPath = `${absoluteLocalPath}.tmp`;
    fs.writeFileSync(tempPath, body);
    fs.renameSync(tempPath, absoluteLocalPath);
  }

  const hash = config.skipDownload
    ? null
    : crypto.createHash('sha256').update(body).digest('hex');

  return {
    ...baseAsset(candidate, { absoluteLocalPath, localPath, hash }),
    status: config.skipDownload ? 'metadata_only' : 'downloaded',
    attempts: attempts || 1,
    owners: []
  };
}

function baseAsset(candidate, { absoluteLocalPath, localPath, hash }) {
  return {
    assetId: candidate.assetId,
    scope: candidate.scope,
    shard: candidate.shard ?? candidate.scope,
    prefix: candidate.prefix,
    kind: candidate.kind,
    sourceKey: candidate.sourceKey,
    fileTitle: `File:${candidate.name}`,
    wikiFileUrl: `https://terraria.wiki.gg/wiki/File:${encodeURIComponent(candidate.name.replaceAll(' ', '_'))}`,
    sourceUrl: candidate.url,
    mime: candidate.mime,
    size: candidate.size,
    localPath,
    absoluteLocalPath,
    sha256: hash
  };
}

async function fetchBinary(url, { gate, mock, timeoutMs }) {
  if (mock) {
    const value = mock.binary?.[url];
    if (value == null) {
      throw new Error(`missing mock binary for ${url}`);
    }
    if (Array.isArray(value)) {
      const next = value.shift();
      if (next && typeof next === 'object' && next.error) {
        throw new Error(next.error);
      }
      return Buffer.from(String(next));
    }
    return Buffer.from(String(value));
  }

  const parsed = new URL(url);
  if (parsed.hostname.toLowerCase() !== 'terraria.wiki.gg' || !parsed.pathname.startsWith('/images/')) {
    throw new Error(`unsupported audio source URL: ${url}`);
  }
  const response = await gate.runBinaryRequest(url, {
    profile: 'page',
    sourceKey: url,
    timeoutMs
  });
  return response.body;
}

function buildCandidate({ row, scope, shard = scope, kind, prefix }) {
  const name = String(row.name ?? '').trim();
  const sourceKey = name.replace(/\.[^.]+$/, '');
  const slug = slugify(sourceKey);
  return {
    assetId: `${shard}:${slug}`,
    scope,
    shard,
    prefix,
    kind,
    sourceKey,
    name,
    slug,
    url: String(row.url ?? ''),
    mime: String(row.mime ?? ''),
    size: Number(row.size ?? 0)
  };
}

function buildMetadataPayload({ config, assets, failures, startedAt }) {
  return {
    generatedAt: new Date().toISOString(),
    startedAt,
    contractVersion: 1,
    source: {
      apiUrl: API_URL,
      mode: config.mode === 'sample' ? 'wiki-allimages-direct-media' : 'wiki-allimages-manifest-download'
    },
    summary: buildSummary(assets, failures, config),
    config: publicConfig(config),
    assets,
    unresolved: failures.map((failure) => ({
      scope: failure.scope,
      sourceKey: failure.name,
      reason: failure.reason,
      owners: []
    }))
  };
}

function buildReportPayload({ config, assets, failures, startedAt }) {
  return {
    generatedAt: new Date().toISOString(),
    startedAt,
    reportPath: config.reportPath,
    outputPath: config.outputJsonPath,
    runOutputPath: config.runOutputPath,
    manifestPath: config.manifestJsonPath,
    outputDir: config.outputDir,
    summary: buildSummary(assets, failures, config),
    prefixes: buildPrefixSummaries(assets, failures),
    assets,
    samples: assets.slice(0, 8).map((asset) => ({
      assetId: asset.assetId,
      scope: asset.scope,
      shard: asset.shard,
      mime: asset.mime,
      size: asset.size,
      localPath: asset.localPath
    })),
    failures
  };
}

function buildSummary(assets, failures, config = {}) {
  return {
    total: assets.length + failures.length,
    candidates: assets.length + failures.length,
    downloaded: assets.filter((asset) => asset.status === 'downloaded').length,
    skippedExisting: assets.filter((asset) => String(asset.status).startsWith('skipped_existing')).length,
    skippedUnsupportedMime: 0,
    missingFileMapping: failures.length,
    failed: failures.length,
    unsupported: Number(config.manifestSummary?.unsupportedRows ?? 0),
    retryExhausted: failures.filter((failure) => failure.retryExhausted).length,
    oversized: failures.filter((failure) => /max-file-bytes/.test(failure.reason)).length
  };
}

function buildPrefixSummaries(assets, failures) {
  const byPrefix = new Map();
  for (const entry of [...assets, ...failures]) {
    const key = entry.prefix ?? entry.shard ?? entry.scope ?? 'unknown';
    if (!byPrefix.has(key)) {
      byPrefix.set(key, {
        shard: entry.shard ?? entry.scope ?? key,
        prefix: entry.prefix ?? key,
        total: 0,
        downloaded: 0,
        skippedExisting: 0,
        failed: 0
      });
    }
    const summary = byPrefix.get(key);
    summary.total += 1;
    if (entry.status === 'downloaded') summary.downloaded += 1;
    if (String(entry.status).startsWith('skipped_existing')) summary.skippedExisting += 1;
    if (entry.reason) summary.failed += 1;
  }
  return [...byPrefix.values()];
}

function buildDiscoveryReport({ config, manifest, startedAt }) {
  return {
    generatedAt: new Date().toISOString(),
    startedAt,
    reportPath: config.reportPath,
    manifestPath: config.manifestOutputPath,
    outputPath: config.outputJsonPath,
    summary: manifest.summary,
    prefixes: manifest.prefixes,
    samples: manifest.assets.slice(0, 8),
    failures: []
  };
}

function buildAudioProgressPayload(progress, progressPath) {
  const payload = buildActionProgressPayload({
    actionId: ACTION_ID,
    status: progress.status,
    phase: progress.phase,
    message: progress.message,
    current: progress.current,
    total: progress.total,
    startedAt: progress.startedAt,
    batchOffset: progress.batchOffset,
    batchLimit: progress.batchLimit,
    overallCurrent: progress.current,
    overallTotal: progress.total,
    generatedAt: progress.generatedAt,
    lastHeartbeatAt: progress.lastHeartbeatAt,
    childStatusPath: progressPath
  });
  payload.percent = progress.total > 0 ? Math.round((progress.current / progress.total) * 10_000) / 100 : 0;
  payload.queue = progress.queue;
  payload.dataStage = progress.dataStage;
  payload.nextStep = progress.nextStep;
  payload.reportPath = progress.reportPath;
  payload.outputPath = progress.outputPath;
  return payload;
}

function resolveRunConfig(args, env, startedAt) {
  const timestampTag = startedAt.replace(/[:.]/g, '-');
  const dateTag = startedAt.slice(0, 10);
  const mode = String(args.mode ?? 'sample');
  if (!['sample', 'discover', 'download', 'all'].includes(mode)) {
    throw new Error(`Unsupported audio fetch mode: ${mode}`);
  }
  if (args.scopes && args.shards) {
    throw new Error('Use either --scopes or --shards, not both');
  }
  const scopes = String(args.scopes ?? DEFAULT_SCOPES.join(','))
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const scope of scopes) {
    if (!SCOPE_PREFIXES[scope]) {
      throw new Error(`Unsupported audio scope: ${scope}`);
    }
  }
  const shardValues = mode === 'sample' && !args.shards ? [] : String(args.shards ?? scopesToShards(scopes, mode).join(','))
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const shard of shardValues) {
    if (!SHARD_PREFIXES[shard]) {
      throw new Error(`Unsupported audio shard: ${shard}`);
    }
  }

  const outputJsonPath = path.resolve(args['output-json'] ?? DEFAULT_OUTPUT_JSON_PATH);
  const runOutputPath = path.resolve(args['run-output-json'] ?? resolveSharedDataRoot(
    'generated',
    'wiki-audio-assets.runs',
    `wiki-audio-assets-${timestampTag}.json`
  ));
  const manifestOutputPath = path.resolve(args['manifest-output-json'] ?? resolveSharedDataRoot(
    'generated',
    'wiki-audio-assets-manifests',
    `wiki-audio-assets-manifest-${timestampTag}.json`
  ));
  return {
    mode,
    scopes,
    shards: shardValues,
    limitPerScope: positiveInteger(args['limit-per-scope'], DEFAULT_LIMIT_PER_SCOPE),
    maxApiPagesPerPrefix: positiveInteger(args['max-api-pages-per-prefix'], DEFAULT_MAX_API_PAGES_PER_PREFIX),
    maxTotalFiles: positiveInteger(args['max-total-files'], DEFAULT_MAX_TOTAL_FILES),
    maxFileBytes: positiveInteger(args['max-file-bytes'], DEFAULT_MAX_FILE_BYTES),
    requestTimeoutMs: positiveInteger(args['request-timeout-ms'], DEFAULT_REQUEST_TIMEOUT_MS),
    maxAttempts: positiveInteger(args['max-attempts'], DEFAULT_MAX_ATTEMPTS),
    retryDelayMs: positiveInteger(args['retry-delay-ms'], DEFAULT_RETRY_DELAY_MS),
    staleLockMs: positiveInteger(args['stale-lock-ms'], DEFAULT_STALE_LOCK_MS),
    skipDownload: booleanOption(args['skip-download'], false),
    skipExisting: booleanOption(args['skip-existing'], true),
    resume: booleanOption(args.resume, true),
    resumeFromJson: args['resume-from-json'] ? path.resolve(args['resume-from-json']) : null,
    publishPartial: booleanOption(args['publish-partial'], false),
    allowFullAudioCorpus: booleanOption(args['allow-full-audio-corpus'], false),
    progressPath: path.resolve(args['progress-path'] ?? env.TERRAPEDIA_CRAWLER_PROGRESS_PATH ?? DEFAULT_PROGRESS_PATH),
    canonicalProgressPath: path.resolve(DEFAULT_PROGRESS_PATH),
    outputJsonPath,
    runOutputPath,
    outputDir: path.resolve(args['output-dir'] ?? DEFAULT_OUTPUT_DIR),
    manifestJsonPath: args['manifest-json'] ? path.resolve(args['manifest-json']) : null,
    manifestOutputPath,
    lockPath: path.resolve(args['lock-path'] ?? path.join(repoRoot, 'data', 'generated', 'wiki-audio-assets-refresh.lock')),
    reportPath: path.resolve(args['report-json'] ?? path.join(repoRoot, 'reports', `workflow-audio-fetch-${dateTag}.json`))
  };
}

function publicConfig(config) {
  return {
    scopes: config.scopes,
    shards: config.shards,
    mode: config.mode,
    limitPerScope: config.limitPerScope,
    maxApiPagesPerPrefix: config.maxApiPagesPerPrefix,
    maxTotalFiles: config.maxTotalFiles,
    maxFileBytes: config.maxFileBytes
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const raw = arg.slice(2);
    const separatorIndex = raw.indexOf('=');
    if (separatorIndex >= 0) {
      args[raw.slice(0, separatorIndex)] = raw.slice(separatorIndex + 1);
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args[raw] = next;
      index += 1;
    } else {
      args[raw] = true;
    }
  }
  return args;
}

function loadMock(mockPath) {
  if (!mockPath) return null;
  return JSON.parse(fs.readFileSync(mockPath, 'utf8'));
}

function positiveInteger(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.trunc(numeric);
}

function booleanOption(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'boolean') return value;
  return String(value).toLowerCase() === 'true';
}

function extensionFor(candidate) {
  const extension = path.extname(new URL(candidate.url).pathname) || path.extname(candidate.name);
  if (extension) return extension;
  if (candidate.mime === 'audio/mpeg') return '.mp3';
  if (candidate.mime === 'audio/ogg') return '.ogg';
  return '.wav';
}

function slugify(value) {
  return String(value ?? '')
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function toSharedAudioPath(scope, fileName) {
  return path.join('data', 'terraPedia', 'media', 'audio', 'wiki', scope, fileName).replaceAll('\\', '/');
}

function scopesToShards(scopes, mode) {
  if (mode === 'sample') {
    return DEFAULT_SCOPES;
  }
  const result = [];
  for (const scope of scopes) {
    if (scope === 'npcs') {
      result.push('npc_hit', 'npc_death');
    } else {
      result.push(scope);
    }
  }
  return result;
}

function resolveShardConfigs(config) {
  return config.shards.map((shard) => ({
    shard,
    ...SHARD_PREFIXES[shard]
  }));
}

function normalizeManifestCandidate(asset) {
  return {
    ...asset,
    scope: asset.scope ?? asset.shard,
    shard: asset.shard ?? asset.scope,
    slug: asset.slug ?? slugify(asset.sourceKey ?? asset.name),
    size: Number(asset.size ?? 0),
    mime: String(asset.mime ?? '')
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadResumeAssets(config) {
  if (!config.resume) return new Map();
  const candidates = [
    config.resumeFromJson,
    config.runOutputPath,
    config.outputJsonPath
  ].filter(Boolean);
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    const payload = readJson(filePath);
    const assets = Array.isArray(payload.assets) ? payload.assets : [];
    return new Map(assets.map((asset) => [asset.assetId, asset]));
  }
  return new Map();
}

async function withRetry(operation, config) {
  let lastError = null;
  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientError(error) || attempt >= config.maxAttempts) {
        error.attempts = attempt;
        error.retryExhausted = isTransientError(error) && attempt >= config.maxAttempts;
        throw error;
      }
      await delay(config.retryDelayMs);
    }
  }
  throw lastError;
}

function isTransientError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /fetch failed|timeout|HTTP 429|HTTP 5\d\d/i.test(message);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function enforceFullCorpusGuard(config) {
  if ((config.mode === 'discover' || config.mode === 'all') && !config.allowFullAudioCorpus) {
    throw new Error('Full audio corpus mode requires --allow-full-audio-corpus=true');
  }
  const exceedsSampleCaps = config.limitPerScope > SAMPLE_CAPS.limitPerScope
    || config.maxApiPagesPerPrefix > SAMPLE_CAPS.maxApiPagesPerPrefix
    || config.maxTotalFiles > SAMPLE_CAPS.maxTotalFiles;
  if (exceedsSampleCaps && !config.allowFullAudioCorpus) {
    throw new Error('Full audio corpus settings require --allow-full-audio-corpus=true');
  }
  if ((config.mode === 'download') && !config.manifestJsonPath) {
    throw new Error('--mode=download requires --manifest-json=<path>');
  }
}

function acquireLock(config) {
  fs.mkdirSync(path.dirname(config.lockPath), { recursive: true });
  const token = crypto.randomUUID();
  const payload = {
    actionId: ACTION_ID,
    pid: process.pid,
    token,
    startedAt: new Date().toISOString(),
    mode: config.mode,
    progressPath: config.progressPath
  };
  try {
    writeNewJsonFile(config.lockPath, payload);
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const existing = safeReadJson(config.lockPath);
    if (!existing) {
      throw new Error('wiki-audio-assets-refresh lock exists but is not readable yet');
    }
    const pid = Number(existing?.pid ?? 0);
    const startedAtMs = Date.parse(existing?.startedAt ?? '');
    const isLive = pid > 0 && processExists(pid);
    const isStaleByAge = Number.isFinite(startedAtMs) && Date.now() - startedAtMs > config.staleLockMs;
    if (isLive && !isStaleByAge) {
      throw new Error(`wiki-audio-assets-refresh lock is already held by pid ${pid}`);
    }
    fs.rmSync(config.lockPath, { force: true });
    try {
      writeNewJsonFile(config.lockPath, payload);
    } catch (secondError) {
      if (secondError?.code === 'EEXIST') {
        throw new Error('wiki-audio-assets-refresh lock was claimed by another process');
      }
      throw secondError;
    }
  }
  return {
    path: config.lockPath,
    token,
    pid: process.pid
  };
}

function writeNewJsonFile(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const handle = fs.openSync(filePath, 'wx');
  try {
    fs.writeFileSync(handle, JSON.stringify(payload, null, 2));
  } finally {
    fs.closeSync(handle);
  }
}

function releaseLock(lock) {
  if (!lock || !fs.existsSync(lock.path)) return;
  const current = safeReadJson(lock.path);
  if (current?.token === lock.token && Number(current?.pid) === lock.pid) {
    fs.rmSync(lock.path, { force: true });
  }
}

function safeReadJson(filePath) {
  try {
    return readJson(filePath);
  } catch {
    return null;
  }
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
