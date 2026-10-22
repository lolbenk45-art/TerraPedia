#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {
  buildActionProgressPayload,
  createCrawlerProgressHeartbeat,
  writeJsonFile,
} from '../workflow/backend-refresh-runtime-state.mjs';
import { fetchWikiPageMetadataBatch, sharedDataPath } from '../lib/wiki-item-utils.mjs';
import {
  buildLocalNpcSourceBinding,
  decideNpcHybridSource,
} from './npc-hybrid-source-selection.mjs';
import { loadWikiSourceManifest, resolveIngestedRecord } from '../lib/wiki-sync-manifest.mjs';

const ACTION_ID = 'domain-source-npcs';
const DEFAULT_PROGRESS_PATH = 'data/generated/domain-source-npcs-progress.latest.json';
const DEFAULT_DECISION_PATH = '.local/tmp/eight-domain-production-readiness/20261017/npcs/source-decision.json';

function writePrivateDecision(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temporaryPath, filePath);
  fs.chmodSync(filePath, 0o600);
}

export async function runNpcHybridSourceProbe({
  progressPath = DEFAULT_PROGRESS_PATH,
  decisionPath = DEFAULT_DECISION_PATH,
  localSource,
  fetchMetadata = ({ titles, timeoutMs, maxAttempts }) => fetchWikiPageMetadataBatch({ titles, timeoutMs, maxAttempts }),
  timeoutMs = 10_000,
  maxAttempts = 1,
} = {}) {
  if (!localSource) throw new Error('NPC hybrid source probe requires local source paths');
  const resolvedProgressPath = path.resolve(progressPath);
  const resolvedDecisionPath = path.resolve(decisionPath);
  const startedAt = new Date().toISOString();
  const heartbeat = createCrawlerProgressHeartbeat({
    intervalMs: 5_000,
    writeProgress: (payload) => writeJsonFile(resolvedProgressPath, payload),
  });
  const publish = (values) => heartbeat.publish(buildActionProgressPayload({
    actionId: ACTION_ID,
    childStatusPath: resolvedProgressPath,
    startedAt,
    total: 1,
    ...values,
  }));
  fs.mkdirSync(path.dirname(resolvedDecisionPath), { recursive: true, mode: 0o700 });
  publish({ status: 'running', phase: 'probe', message: 'probing Module:Npcinfo/data fingerprint', current: 0 });
  let localBinding;
  let phase = 'local-source-binding';
  try {
    localBinding = buildLocalNpcSourceBinding(localSource);
    phase = 'wiki-revision-probe';
    const pages = await fetchMetadata({ titles: ['Module:Npcinfo/data'], timeoutMs, maxAttempts });
    const [remoteFingerprint] = Array.isArray(pages) ? pages : [];
    const decision = decideNpcHybridSource({
      remoteFingerprint: { status: remoteFingerprint?.missing ? 'source_missing' : 'ok', ...remoteFingerprint },
      localBinding,
    });
    const result = {
      schemaVersion: 1,
      status: 'passed',
      generatedAt: new Date().toISOString(),
      actionId: ACTION_ID,
      mode: decision.mode,
      sourceKey: decision.sourceKey,
      recordCount: decision.recordCount,
      localBinding,
      remoteFingerprint: decision.remoteFingerprint,
    };
    writePrivateDecision(resolvedDecisionPath, result);
    publish({ status: 'completed', phase: 'decision', message: `selected ${decision.mode}`, current: 1 });
    heartbeat.stop();
    return result;
  } catch (error) {
    const failure = {
      schemaVersion: 1,
      status: phase === 'local-source-binding' ? 'source_ambiguous' : 'probe_unavailable',
      generatedAt: new Date().toISOString(),
      actionId: ACTION_ID,
      phase,
      reason: error?.message ?? String(error),
      localBinding: localBinding ?? null,
    };
    writePrivateDecision(resolvedDecisionPath, failure);
    publish({ status: 'failed', phase: 'probe', message: failure.reason, current: 0 });
    heartbeat.stop();
    throw error;
  }
}

function loadLocalManifestRecord() {
  const manifest = loadWikiSourceManifest(sharedDataPath('generated', 'wiki-source-manifest.latest.json'));
  const record = resolveIngestedRecord(manifest, {
    sourceKey: 'wiki.module.npcinfo',
    locator: 'Module:Npcinfo/data',
  });
  if (!record) throw new Error('NPC local source manifest record is missing');
  return record;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runNpcHybridSourceProbe({
    progressPath: process.env.TERRAPEDIA_CRAWLER_PROGRESS_PATH ?? DEFAULT_PROGRESS_PATH,
    decisionPath: process.env.TERRAPEDIA_NPC_HYBRID_DECISION_PATH ?? DEFAULT_DECISION_PATH,
    localSource: {
      standardizedPath: 'data/standardized/npcs.standardized.json',
      viewMetaPath: 'data/standardized-view/npcs/_meta.json',
      mapPath: 'data/generated/npc-standardized-map.json',
      wikiManifestRecord: process.env.TERRAPEDIA_NPC_LOCAL_MANIFEST_RECORD
        ? JSON.parse(process.env.TERRAPEDIA_NPC_LOCAL_MANIFEST_RECORD)
        : loadLocalManifestRecord(),
    },
  }).catch((error) => {
    console.error(`[${ACTION_ID}] ${error?.stack ?? error}`);
    process.exitCode = 1;
  });
}
