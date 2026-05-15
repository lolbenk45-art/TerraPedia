#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  fetchWikiPagePayload,
  parseCliArgs,
  writeJson
} from '../lib/wiki-item-utils.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import {
  buildActionProgressPayload,
  writeJsonFile
} from '../workflow/backend-refresh-runtime-state.mjs';
import { parseBuffPageEvidence } from './buff-immunity-page-parser.mjs';

const repoRoot = getProjectRoot();
const DEFAULT_BUFF_PROGRESS_PATH = path.join(repoRoot, 'data', 'generated', 'fetch-wiki-buffs-progress.latest.json');

function toNullableInteger(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function normalizeInternalName(value) {
  const text = String(value ?? '').trim();
  return text.length ? text : null;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveRecord(records, { buffId, internalName }) {
  return records.find((record) => {
    if (buffId != null && toNullableInteger(record.id) === buffId) return true;
    if (internalName && record.internalName === internalName) return true;
    return false;
  }) ?? null;
}

function buildItemIndexes(itemRecords = []) {
  const byInternalName = new Map();
  for (const item of itemRecords) {
    const internalName = normalizeInternalName(item?.internalName);
    if (!internalName || byInternalName.has(internalName)) continue;
    byInternalName.set(internalName, item);
  }
  return { byInternalName };
}

function normalizeSourceItemInternalName(internalName, itemIndexes) {
  if (itemIndexes.byInternalName.has(internalName)) {
    return internalName;
  }
  const lowerCaseMatch = [...itemIndexes.byInternalName.keys()].find((candidate) => {
    return candidate.toLowerCase() === String(internalName ?? '').toLowerCase();
  });
  return lowerCaseMatch ?? internalName;
}

function attachSourceItemIds(sourceItems, itemIndexes) {
  return (Array.isArray(sourceItems) ? sourceItems : []).map((entry) => {
    const normalizedInternalName = normalizeSourceItemInternalName(entry?.internalName, itemIndexes);
    const item = itemIndexes.byInternalName.get(normalizedInternalName) ?? null;
    return {
      ...entry,
      internalName: normalizedInternalName,
      itemId: toNullableInteger(entry?.itemId) ?? toNullableInteger(item?.id)
    };
  });
}

export function applyBuffPageEvidenceToStandardizedPayload({
  standardizedPayload,
  evidence,
  itemRecords = [],
  buffId = null,
  internalName = null,
  generatedAt = new Date().toISOString()
} = {}) {
  if (!standardizedPayload || !Array.isArray(standardizedPayload.records)) {
    throw new Error('standardizedPayload.records is required');
  }

  const target = resolveRecord(standardizedPayload.records, { buffId, internalName });
  if (!target) {
    throw new Error(`Target buff not found: ${internalName ?? buffId}`);
  }

  const itemIndexes = buildItemIndexes(itemRecords);
  const sourceItems = shouldReplaceFactGroup({ evidence, group: 'sourceItems', currentRows: target.sourceItems })
    ? attachSourceItemIds(evidence?.sourceItems ?? [], itemIndexes)
    : (target.sourceItems ?? []);
  const inflictingNpcs = shouldReplaceFactGroup({ evidence, group: 'inflictingNpcs', currentRows: target.inflictingNpcs })
    ? (Array.isArray(evidence?.inflictingNpcs) ? evidence.inflictingNpcs : [])
    : (target.inflictingNpcs ?? []);
  const replaceImmuneNpcs = shouldReplaceFactGroup({ evidence, group: 'immuneNpcs', currentRows: target.immuneNpcs });
  const immuneNpcs = replaceImmuneNpcs
    ? (Array.isArray(evidence?.immuneNpcs) ? evidence.immuneNpcs : [])
    : (target.immuneNpcs ?? []);
  const immuneNpcSample = replaceImmuneNpcs
    ? (Array.isArray(evidence?.immuneNpcSample) ? evidence.immuneNpcSample : immuneNpcs.slice(0, 10))
    : (target.immuneNpcSample ?? immuneNpcs.slice(0, 10));
  const patchedRecord = {
    ...target,
    sourceItemCount: sourceItems.length,
    sourceItems,
    inflictingNpcs,
    immuneNpcCount: replaceImmuneNpcs
      ? (toNullableInteger(evidence?.immuneNpcCount) ?? immuneNpcs.length)
      : (toNullableInteger(target.immuneNpcCount) ?? immuneNpcs.length),
    immuneNpcs,
    immuneNpcSample,
    immuneNpcSource: evidence?.immuneNpcSource ?? (immuneNpcs.length ? 'buff-page-immunities' : target.immuneNpcSource ?? null),
    immuneNpcSampleSemantics: evidence?.immuneNpcSampleSemantics ?? target.immuneNpcSampleSemantics ?? null,
    sourceEvidence: evidence?.sourceEvidence ?? null
  };

  const records = standardizedPayload.records.map((record) => {
    return record === target ? patchedRecord : record;
  });
  return {
    ...standardizedPayload,
    generatedAt,
    records
  };
}

function shouldReplaceFactGroup({ evidence, group, currentRows } = {}) {
  const rows = Array.isArray(evidence?.[group]) ? evidence[group] : [];
  if (rows.length > 0) {
    return true;
  }
  const parseStatus = evidence?.sourceEvidence?.parseStatus;
  if (parseStatus && parseStatus !== 'parsed') {
    return false;
  }
  const existingRows = Array.isArray(currentRows) ? currentRows : [];
  if (existingRows.length === 0) {
    return true;
  }
  return false;
}

function buildRawBuffPayloadFromStandardized(standardizedPayload, outputRecords) {
  return {
    source: standardizedPayload.upstreamMeta?.source ?? 'terraria.wiki.gg:Template:GetBuffInfo',
    sourceApi: standardizedPayload.upstreamMeta?.sourceApi ?? 'https://terraria.wiki.gg/api.php',
    sourcePageTitle: standardizedPayload.upstreamMeta?.sourcePageTitle ?? 'Template:GetBuffInfo',
    sourceRevisionTimestamp: standardizedPayload.upstreamMeta?.sourceRevisionTimestamp ?? null,
    fetchedAt: new Date().toISOString(),
    totalBuffs: outputRecords.length,
    langs: standardizedPayload.upstreamMeta?.langs ?? ['en', 'zh'],
    buffs: outputRecords
  };
}

function resolveOutputPath(value, fallback) {
  return path.resolve(process.cwd(), value ?? fallback);
}

export async function runRefreshTargetBuffPageEvidence(rawOptions = {}, dependencies = {}) {
  const inputPath = resolveOutputPath(
    rawOptions.input,
    path.join(repoRoot, 'data', 'standardized', 'buffs.standardized.json')
  );
  const itemsPath = resolveOutputPath(
    rawOptions.items,
    path.join(repoRoot, 'data', 'standardized', 'items.standardized.json')
  );
  const outputPath = resolveOutputPath(rawOptions.output, inputPath);
  const rawOutputPath = rawOptions['raw-output']
    ? resolveOutputPath(rawOptions['raw-output'])
    : null;
  const progressPath = resolveOutputPath(rawOptions['progress-path'], DEFAULT_BUFF_PROGRESS_PATH);
  const buffId = toNullableInteger(rawOptions['buff-id'] ?? rawOptions.buffId);
  const internalName = normalizeInternalName(rawOptions['internal-name'] ?? rawOptions.internalName);
  const pageTitle = normalizeInternalName(rawOptions.page ?? rawOptions.pageTitle);
  if (buffId == null && !internalName) {
    throw new Error('Pass --buff-id=<id> or --internal-name=<name>');
  }

  const startedAt = new Date().toISOString();
  writeTargetBuffProgress(progressPath, {
    status: 'running',
    phase: 'load',
    message: 'loading standardized buff and item inputs',
    current: 0,
    total: 1,
    startedAt,
    dependencies
  });

  const standardizedPayload = dependencies.readJson?.(inputPath) ?? readJson(inputPath);
  const itemPayload = dependencies.readJson?.(itemsPath) ?? readJson(itemsPath);
  const target = resolveRecord(standardizedPayload.records ?? [], { buffId, internalName });
  if (!target) {
    throw new Error(`Target buff not found: ${internalName ?? buffId}`);
  }

  const fetchPagePayload = dependencies.fetchPagePayload ?? fetchWikiPagePayload;
  const resolvedPageTitle = pageTitle
    ?? target.localized?.en?.page
    ?? target.englishName
    ?? target.localized?.zh?.page
    ?? target.internalName;
  writeTargetBuffProgress(progressPath, {
    status: 'running',
    phase: 'buff-page-immunities',
    message: `fetching rendered immunity page: ${resolvedPageTitle}`,
    current: 0,
    total: 1,
    startedAt,
    dependencies
  });
  const pagePayload = await fetchPagePayload({ pageTitle: resolvedPageTitle });
  const evidence = parseBuffPageEvidence({
    buffId: toNullableInteger(target.id),
    buffName: target.englishName ?? target.internalName,
    pageTitle: pagePayload.pageTitle ?? resolvedPageTitle,
    canonicalPageTitle: pagePayload.canonicalPageTitle ?? pagePayload.pageTitle ?? resolvedPageTitle,
    revisionId: pagePayload.revisionId ?? null,
    revisionTimestamp: pagePayload.revisionTimestamp ?? null,
    html: pagePayload.html,
    wikitext: pagePayload.wikitext,
    sections: pagePayload.sections,
    sampleLimit: toNullableInteger(rawOptions['sample-limit'] ?? rawOptions.sampleLimit) ?? 10
  });
  const patched = applyBuffPageEvidenceToStandardizedPayload({
    standardizedPayload,
    evidence,
    itemRecords: itemPayload.records ?? [],
    buffId: toNullableInteger(target.id),
    internalName: target.internalName
  });
  const writeJsonImpl = dependencies.writeJson ?? writeJson;
  writeJsonImpl(outputPath, patched);
  if (rawOutputPath) {
    writeJsonImpl(rawOutputPath, buildRawBuffPayloadFromStandardized(patched, patched.records));
  }

  const patchedTarget = resolveRecord(patched.records, { buffId: toNullableInteger(target.id), internalName: target.internalName });
  writeTargetBuffProgress(progressPath, {
    status: 'completed',
    phase: 'write',
    message: `updated buff page evidence for ${patchedTarget.englishName ?? patchedTarget.internalName}`,
    current: 1,
    total: 1,
    startedAt,
    outputPath,
    dependencies
  });
  return {
    inputPath,
    outputPath,
    rawOutputPath,
    progressPath,
    buffId: patchedTarget.id,
    internalName: patchedTarget.internalName,
    pageTitle: pagePayload.pageTitle ?? resolvedPageTitle,
    sourceItemCount: patchedTarget.sourceItemCount,
    inflictingNpcCount: patchedTarget.inflictingNpcs.length,
    immuneNpcCount: patchedTarget.immuneNpcCount,
    immuneNpcSampleCount: patchedTarget.immuneNpcSample.length
  };
}

function writeTargetBuffProgress(progressPath, {
  status,
  phase,
  message,
  current,
  total,
  startedAt,
  outputPath = null,
  dependencies = {}
} = {}) {
  const generatedAt = new Date().toISOString();
  const payload = buildActionProgressPayload({
    actionId: 'buff-page-immunity-refresh',
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
  if (outputPath) {
    payload.outputPath = outputPath;
  }
  payload.queue = 'buff source refresh';
  payload.dataStage = 'wiki buff pages -> immunity evidence';
  payload.nextStep = 'standardize buffs, rebuild npc bridge, then backfill npc_buff_relations';
  const writer = dependencies.writeJson ?? writeJsonFile;
  writer(progressPath, payload);
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  return fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

if (isDirectExecution()) {
  runRefreshTargetBuffPageEvidence(parseCliArgs(process.argv.slice(2))).then((summary) => {
    console.log(JSON.stringify(summary, null, 2));
  }).catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
  });
}
