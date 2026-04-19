import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildNpcStandardizedBridge } from './build-npc-standardized-bridge.mjs';
import { matchNpcBridgeRecords } from './npc-bridge-match.mjs';
import { writeNpcBridgeDataDir } from './write-npc-bridge-data-dir.mjs';
import { buildNpcBridgeSummary, writeNpcBridgeSummaryReport } from '../report/npc-bridge-summary.mjs';

export async function runNpcStandardizedBridge({
  domain,
  sourceStandardizedDir,
  crawlerOutputRoot,
  outputRoot
} = {}) {
  const resolvedDomain = String(domain ?? 'npc').trim();
  if (resolvedDomain !== 'npc') {
    throw new Error(`Only bridge --domain=npc is supported, received: ${resolvedDomain}`);
  }

  const resolvedSourceStandardizedDir = path.resolve(sourceStandardizedDir ?? path.join(process.cwd(), 'data', 'standardized'));
  const resolvedCrawlerOutputRoot = path.resolve(crawlerOutputRoot ?? path.join(process.cwd(), 'data', 'wiki-crawler'));
  const resolvedOutputRoot = path.resolve(outputRoot ?? path.join(process.cwd(), 'data', 'generated', 'wiki-crawler-npc-bridge'));

  const standardizedPayload = await readJson(path.join(resolvedSourceStandardizedDir, 'npcs.standardized.json'));
  const crawlerRecords = await loadCrawlerNpcRecords({ crawlerOutputRoot: resolvedCrawlerOutputRoot });
  const bridgePayload = buildNpcStandardizedBridge({
    standardizedPayload,
    crawlerNormalizedRecords: crawlerRecords
  });

  const diagnostics = collectBridgeDiagnostics({
    crawlerRecords,
    standardizedRecords: standardizedPayload?.records
  });
  const summary = buildNpcBridgeSummary({
    crawlerNpcTotal: crawlerRecords.length,
    standardizedNpcTotal: Array.isArray(standardizedPayload?.records) ? standardizedPayload.records.length : 0,
    matches: diagnostics.matches,
    unmatchedCrawler: diagnostics.unmatchedCrawler,
    unenrichedStandardized: diagnostics.unenrichedStandardized,
    conflictSamples: diagnostics.conflictSamples
  });

  const writeResult = await writeNpcBridgeDataDir({
    sourceStandardizedDir: resolvedSourceStandardizedDir,
    bridgedNpcPayload: bridgePayload,
    outputRoot: resolvedOutputRoot
  });
  const reportPath = writeNpcBridgeSummaryReport({
    summary,
    outputRoot: resolvedOutputRoot
  });

  return {
    ...writeResult,
    reportPath,
    summary
  };
}

async function loadCrawlerNpcRecords({ crawlerOutputRoot }) {
  const normalizedDir = path.join(crawlerOutputRoot, 'normalized-light', 'npc');
  const auditDir = path.join(crawlerOutputRoot, 'audit', 'npc');
  const normalizedFiles = (await fs.readdir(normalizedDir))
    .filter((name) => name.endsWith('.json'))
    .sort();

  const records = [];
  for (const fileName of normalizedFiles) {
    const normalizedPath = path.join(normalizedDir, fileName);
    const auditPath = path.join(auditDir, fileName);
    const normalized = await readJson(normalizedPath);
    const audit = await readOptionalJson(auditPath) ?? {
      status: 'fail',
      reasons: ['missing audit payload']
    };

    records.push(...expandCrawlerRecords({
      normalized,
      audit,
      normalizedPath,
      auditPath
    }));
  }
  return records;
}

function expandCrawlerRecords({
  normalized,
  audit,
  normalizedPath,
  auditPath
}) {
  const baseRecord = {
    ...normalized,
    audit,
    sourceMetadata: {
      ...(normalized?.sourceMetadata ?? {}),
      entityId: normalized?.entityId ?? '',
      normalizedPath,
      auditPath
    }
  };

  const groupMembers = Array.isArray(normalized?.groupMembers) ? normalized.groupMembers : [];
  if (!groupMembers.length) {
    return [baseRecord];
  }

  return groupMembers.map((member) => ({
    ...baseRecord,
    entityId: member?.entityId ?? baseRecord.entityId,
    display: {
      ...(baseRecord.display ?? {}),
      name: member?.name ?? baseRecord.display?.name ?? ''
    },
    groupMember: {
      entityId: member?.entityId ?? '',
      name: member?.name ?? '',
      pageTitle: member?.pageTitle ?? baseRecord.source?.pageTitle ?? '',
      moveInCondition: member?.moveInCondition ?? ''
    },
    sourceMetadata: {
      ...baseRecord.sourceMetadata,
      entityId: member?.entityId ?? baseRecord.entityId,
      groupPageTitle: baseRecord.source?.pageTitle ?? '',
      groupMemberName: member?.name ?? ''
    }
  }));
}

function collectBridgeDiagnostics({
  crawlerRecords,
  standardizedRecords
} = {}) {
  const crawlerRows = Array.isArray(crawlerRecords) ? crawlerRecords : [];
  const standardizedRows = Array.isArray(standardizedRecords) ? standardizedRecords : [];
  const matches = [];
  const unmatchedCrawler = [];
  const conflictSamples = [];
  const matchedKeys = new Set();
  const crawlerByStandardizedKey = new Map();

  for (const crawlerRecord of crawlerRows) {
    const match = matchNpcBridgeRecords({
      crawlerRecord,
      standardizedRecords: standardizedRows
    });

    if (match.records.length === 0) {
      unmatchedCrawler.push({
        entityId: crawlerRecord?.entityId ?? '',
        pageTitle: crawlerRecord?.source?.pageTitle ?? crawlerRecord?.display?.name ?? '',
        reason: match.reason
      });
      continue;
    }

    for (const record of match.records) {
      const standardizedKey = buildStandardizedKey(record);
      matchedKeys.add(standardizedKey);
      matches.push({
        entityId: crawlerRecord?.entityId ?? '',
        pageTitle: crawlerRecord?.source?.pageTitle ?? crawlerRecord?.display?.name ?? '',
        internalName: record?.internalName ?? '',
        reason: match.reason
      });

      const existingEntityId = crawlerByStandardizedKey.get(standardizedKey);
      if (existingEntityId && existingEntityId !== crawlerRecord?.entityId && conflictSamples.length < 20) {
        conflictSamples.push({
          standardizedKey,
          entityId: crawlerRecord?.entityId ?? '',
          issue: `duplicate crawler match after ${existingEntityId}`
        });
      }
      crawlerByStandardizedKey.set(standardizedKey, crawlerRecord?.entityId ?? '');
    }
  }

  const unenrichedStandardized = standardizedRows
    .filter((record) => !matchedKeys.has(buildStandardizedKey(record)))
    .map((record) => ({
      internalName: record?.internalName ?? '',
      name: record?.name ?? ''
    }));

  return {
    matches,
    unmatchedCrawler,
    unenrichedStandardized,
    conflictSamples
  };
}

function buildStandardizedKey(record) {
  const internalName = String(record?.internalName ?? '').trim();
  if (internalName) {
    return `internal:${internalName.toLowerCase()}`;
  }
  const name = String(record?.name ?? '').trim();
  if (name) {
    return `name:${name.toLowerCase()}`;
  }
  return `id:${String(record?.id ?? '')}`;
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function readOptionalJson(filePath) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

const isMain = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  : false;

if (isMain) {
  try {
    const result = await runNpcStandardizedBridge();
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  }
}
