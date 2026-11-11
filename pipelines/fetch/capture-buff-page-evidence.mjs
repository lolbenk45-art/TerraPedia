#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { fetchWikiPagePayload, parseCliArgs, writeJsonNoOverwrite } from '../lib/wiki-item-utils.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import { writeCrawlerMonitorRedisState } from '../lib/crawler-monitor-redis-state.mjs';
import { resolveRedisConfigFromEnv } from '../lib/crawler-heartbeat.mjs';
import { createCrawlerProgressHeartbeat, writeJsonFile } from '../workflow/backend-refresh-runtime-state.mjs';
import { buildBuffFetchProgressPayload } from './fetch-wiki-buffs.mjs';

// Diagnostic source capture only: no standardized patch, landing or DB mutation.
export async function runCaptureBuffPageEvidence(options = {}, dependencies = {}) {
  const sourceKind = options['source-kind'] ?? 'buff-page';
  if (!['buff-page', 'iteminfo', 'iteminfo-semantics', 'npcinfo-semantics', 'npc-page-inflictions'].includes(sourceKind)) throw new Error('Unsupported source-kind');
  if (sourceKind !== 'buff-page' && options.ids !== undefined) throw new Error(`${sourceKind} mode uses the input Buff scope; omit --ids`);
  if (!options.input || !options['output-dir']) throw new Error('--input and a fresh --output-dir are required');
  const inputPath = path.resolve(options.input);
  const inputBytes = fs.readFileSync(inputPath);
  const input = JSON.parse(inputBytes);
  const records = input.buffs ?? input.records;
  if (!Array.isArray(records)) throw new Error('Buff input records are required');
  const targetsPath = sourceKind === 'npc-page-inflictions' ? path.resolve(String(options['npc-targets'] ?? '')) : null;
  if (sourceKind === 'npc-page-inflictions' && !targetsPath) throw new Error('npc-page-inflictions mode requires --npc-targets');
  const targetsBytes = targetsPath ? fs.readFileSync(targetsPath) : null;
  const targetPayload = targetsBytes ? JSON.parse(targetsBytes) : null;
  const targets = sourceKind === 'npc-page-inflictions' ? targetPayload?.targets : null;
  if (sourceKind === 'npc-page-inflictions' && (!Array.isArray(targets) || targets.length === 0 || targets.length > 1000)) {
    throw new Error('NPC page target scope must contain 1–1000 targets');
  }
  const ids = sourceKind !== 'buff-page' ? records.map(record => record?.id)
    : String(options.ids ?? '').split(',').map(value => Number(value.trim()));
  const limit = sourceKind !== 'buff-page' ? 1000 : 20;
  if (!ids.length || ids.length > limit || ids.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
    throw new Error(`Require 1–${limit} distinct positive Buff IDs${sourceKind === 'buff-page' ? ' via --ids' : ' in input'}`);
  }
  const pages = new Map();
  if (sourceKind === 'npc-page-inflictions') {
    for (const target of targets) {
      const title = String(target?.pageTitle ?? '').trim();
      if (!title || pages.has(title) || !Array.isArray(target?.standardizedRecords) || target.standardizedRecords.length === 0) {
        throw new Error('NPC page target identity is invalid or duplicated');
      }
      pages.set(title, target);
    }
  }
  if (sourceKind === 'npcinfo-semantics') {
    for (const title of ['Module:Npcinfo/data', 'Module:Npcinfo/doc', 'Module:Npcinfo/datagen', 'Template:GetBuffInfo', 'Whips']) {
      pages.set(title, [...ids]);
    }
  }
  if (sourceKind === 'iteminfo-semantics') {
    for (const title of ['Module:Iteminfo/data', 'Module:Iteminfo/doc', 'Module:Iteminfo/datagen']) {
      pages.set(title, [...ids]);
    }
  }
  for (const id of ids) {
    if (sourceKind === 'npcinfo-semantics' || sourceKind === 'iteminfo-semantics' || sourceKind === 'npc-page-inflictions') continue;
    const matches = records.filter(record => record.id === id);
    if (matches.length !== 1) throw new Error(`Missing or duplicate Buff input: ${id}`);
    const record = matches[0];
    const title = sourceKind === 'iteminfo' ? 'Module:Iteminfo/data'
      : sourceKind === 'npcinfo-semantics' ? 'Module:Npcinfo/data'
      : record.localized?.en?.page ?? record.sourceEvidence?.pageTitle ?? record.englishName;
    if (typeof title !== 'string' || !title.trim()) throw new Error(`Buff page title missing: ${id}`);
    if (!pages.has(title)) pages.set(title, []);
    pages.get(title).push(id);
  }

  const repoRoot = dependencies.repoRoot ?? getProjectRoot();
  const canonicalProgress = path.join(repoRoot, 'data/generated/fetch-wiki-buffs-progress.latest.json');
  const progressPath = path.resolve(options['progress-path'] ?? canonicalProgress);
  const outputDir = path.resolve(options['output-dir']);
  const resolvedInput = resolveDestination(inputPath);
  const resolvedOutput = resolveDestination(outputDir);
  for (const destination of [progressPath, canonicalProgress]) {
    const resolvedProgress = resolveDestination(destination);
    if (resolvedProgress === resolvedInput) throw new Error('Progress path must not alias the source input');
    const relative = path.relative(resolvedOutput, resolvedProgress);
    if (!relative || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) {
      throw new Error('Progress path must be outside the capture directory');
    }
  }
  fs.mkdirSync(path.dirname(outputDir), { recursive: true });
  fs.mkdirSync(outputDir); // Existing runs must never be overwritten or resumed implicitly.
  const reportPath = path.join(outputDir, 'capture.json');
  const startedAt = new Date().toISOString();
  const report = {
    schemaVersion: sourceKind === 'npc-page-inflictions' ? 'buff-npc-page-infliction-raw-capture/v1'
      : ['npcinfo-semantics', 'iteminfo-semantics'].includes(sourceKind) ? 'buff-semantic-raw-capture/v1' : 'buff-page-raw-capture/v1', sourceKind, startedAt,
    input: { path: inputPath, sha256: hash(inputBytes) },
    selectedBuffIds: ids,
    ...(targetsBytes ? { targets: {
      path: targetsPath,
      sha256: hash(targetsBytes),
      pageCount: pages.size,
      scope: targetPayload?.scope ?? null,
      totalTargets: targetPayload?.totalTargets ?? pages.size,
      sourceSha256: targetPayload?.sourceSha256 ?? null,
    } } : {}),
    ...(sourceKind === 'npc-page-inflictions' ? { scopeCompleteness: 'all-npc-page-targets' } : {}),
    pages: [], databaseWrites: false,
  };
  const redis = dependencies.redis ?? resolveRedisConfigFromEnv(options);
  const redisWriter = dependencies.writeRedisState
    ?? (args => writeCrawlerMonitorRedisState({ ...args, redis }));
  let pendingRedis = Promise.resolve();
  const heartbeat = createCrawlerProgressHeartbeat({ writeProgress(progress) {
    const payload = buildBuffFetchProgressPayload(progressPath, {
      ...progress, total: pages.size, startedAt, reportPath, outputPath: outputDir,
    });
    payload.nextStep = 'Review raw source target identity and applicability; no import is performed';
    writeJsonFile(progressPath, payload);
    if (progressPath !== canonicalProgress) writeJsonFile(canonicalProgress, payload);
    // Serialize mirrors so a delayed running write cannot follow the terminal write.
    pendingRedis = pendingRedis.then(() => redisWriter({
      stateId: 'buff-page-immunity-refresh:progress', payload,
    })).catch(() => {});
  } });
  let current = 0;
  const rawByRevision = new Map();
  try {
    heartbeat.publish({ status: 'running', phase: 'capture', current, message: 'Starting bounded raw Buff page capture' });
    const fetchPage = dependencies.fetchPage ?? fetchWikiPagePayload;
    for (const [pageTitle, buffIds] of pages) {
      heartbeat.publish({ status: 'running', phase: 'capture', current, message: `Capturing ${pageTitle}` });
      const page = await fetchPage({ pageTitle, requireRevisionBinding: true });
      const expectedModuleTitle = ['iteminfo', 'iteminfo-semantics'].includes(sourceKind) && pageTitle === 'Module:Iteminfo/data'
        ? 'Module:Iteminfo/data' : null;
      if ((expectedModuleTitle && page.pageTitle !== expectedModuleTitle)
          || (sourceKind === 'npcinfo-semantics' && page.pageTitle !== pageTitle)
          || (sourceKind === 'iteminfo-semantics' && !['Module:Iteminfo/data', 'Module:Iteminfo/doc', 'Module:Iteminfo/datagen'].includes(pageTitle))
          || (sourceKind === 'npc-page-inflictions' && page.requestedPageTitle !== pageTitle)) {
        throw new Error(sourceKind === 'iteminfo' ? 'Iteminfo module title mismatch'
          : sourceKind === 'npcinfo-semantics' ? 'Npcinfo semantic source page title mismatch'
            : sourceKind === 'iteminfo-semantics' ? 'Iteminfo semantic source page title mismatch'
              : sourceKind === 'npc-page-inflictions' ? 'NPC page requested title mismatch'
                : 'Wiki page title mismatch');
      }
      if (!Number.isSafeInteger(page.revisionId) || page.revisionId <= 0
          || !Number.isSafeInteger(page.pageId) || page.pageId <= 0
          || !Number.isFinite(Date.parse(page.revisionTimestamp))
          || typeof page.pageTitle !== 'string' || !page.pageTitle.trim()
          || typeof page.html !== 'string' || typeof page.wikitext !== 'string') {
        throw new Error(`Incomplete page/revision evidence: ${pageTitle}`);
      }
      const revisionKey = `${page.pageId}:${page.revisionId}`;
      let rawEntry = rawByRevision.get(revisionKey);
      if (!rawEntry) {
        const rawPath = path.join(outputDir, `page-${String(rawByRevision.size + 1).padStart(3, '0')}.json`);
        writeJsonNoOverwrite(rawPath, page);
        rawEntry = { requestedPageTitle: page.requestedPageTitle ?? pageTitle,
          pageTitle: page.pageTitle, pageId: page.pageId, revisionId: page.revisionId,
          revisionTimestamp: page.revisionTimestamp, path: rawPath,
          sha256: hash(fs.readFileSync(rawPath)) };
        rawByRevision.set(revisionKey, rawEntry);
      }
      const targetEntry = { requestedPageTitle: pageTitle, pageTitle: page.pageTitle,
        resolvedPageTitle: page.pageTitle, rawRequestedPageTitle: rawEntry.requestedPageTitle,
        pageId: rawEntry.pageId, revisionId: rawEntry.revisionId, revisionTimestamp: rawEntry.revisionTimestamp,
        path: rawEntry.path, sha256: rawEntry.sha256 };
      if (sourceKind === 'npc-page-inflictions') {
        const target = pages.get(pageTitle);
        targetEntry.targetPageTitle = target.pageTitle;
        targetEntry.targetEntityIds = Array.isArray(target.targetEntityIds) ? [...target.targetEntityIds] : [];
        targetEntry.standardizedRecords = target.standardizedRecords;
      } else {
        targetEntry.buffIds = buffIds;
      }
      report.pages.push(targetEntry);
      current++;
    }
    report.status = 'completed';
    report.completedAt = new Date().toISOString();
    report.rawPageCount = rawByRevision.size;
    writeJsonNoOverwrite(reportPath, report);
    heartbeat.publish({ status: 'completed', phase: 'write', current, message: `Captured ${pages.size} targets across ${rawByRevision.size} resolved pages for ${ids.length} Buff IDs` });
    return report;
  } catch (error) {
    report.status = 'failed';
    report.error = error.message;
    writeJsonNoOverwrite(path.join(outputDir, 'failure.json'), report);
    heartbeat.publish({ status: 'failed', phase: 'error', current, message: error.message });
    throw error;
  } finally {
    heartbeat.stop();
    await pendingRedis;
  }
}

function hash(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

// Resolve existing ancestors too: a fresh output or progress file may sit
// beneath a symlink even though the final path does not yet exist.
function resolveDestination(destination) {
  try {
    return fs.realpathSync(destination);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const parent = path.dirname(destination);
    if (parent === destination) throw error;
    return path.join(resolveDestination(parent), path.basename(destination));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runCaptureBuffPageEvidence(parseCliArgs(process.argv.slice(2))).then(result => {
    console.log(JSON.stringify({ status: result.status, pages: result.pages.length, selectedBuffIds: result.selectedBuffIds }));
  }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
