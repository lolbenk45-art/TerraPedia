#!/usr/bin/env node

import path from 'node:path';

import {
  ensureDir,
  fetchWikiApiJson,
  parseCliArgs,
  sharedDataPath,
  shouldKeepSnapshot,
  writeJson
} from '../lib/wiki-item-utils.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import { buildArmorSetSourceEvidence } from './armor-set-source-evidence.mjs';
import { parseArmorSetBonuses } from './armor-set-module-parser.mjs';
import { advanceWikiIngestionManifestForSource } from '../lib/wiki-sync-manifest.mjs';
import {
  buildActionProgressPayload,
  buildCrawlerWorkSummary,
  createCrawlerProgressHeartbeat,
  writeJsonFile
} from '../workflow/backend-refresh-runtime-state.mjs';

const options = parseCliArgs(process.argv.slice(2));
const root = getProjectRoot();
const standardizedPath = path.join(root, 'data', 'standardized', 'armor_sets.standardized.json');
const rawOutputPath = path.join(root, 'data', 'generated', 'wiki-armorsetbonuses.latest.json');
const reportPath = path.join(root, 'reports', `wiki-armorsetbonuses-refresh-${new Date().toISOString().slice(0, 10)}.json`);
const sharedRawDir = sharedDataPath('raw', 'wiki');
const sharedRawOutputPath = path.join(sharedRawDir, 'module__armorsetbonuses.latest.json');
const timestamp = new Date().toISOString().replaceAll(':', '-');
const keepSnapshot = shouldKeepSnapshot(options);
const actionId = process.env.TERRAPEDIA_CRAWLER_ACTION_ID ?? 'domain-source-armor-sets';
const defaultProgressPath = path.join(root, 'data', 'generated', 'domain-source-armor-sets-progress.latest.json');
const progressPath = path.resolve(process.cwd(), options['progress-path'] ?? process.env.TERRAPEDIA_CRAWLER_PROGRESS_PATH ?? defaultProgressPath);
const manifestPath = options['manifest-path'] ? path.resolve(process.cwd(), options['manifest-path']) : null;
const startedAt = new Date().toISOString();
const progressHeartbeat = createCrawlerProgressHeartbeat({ writeProgress });

progressHeartbeat.publish({
  status: 'running',
  phase: 'fetch',
  message: 'fetching Module:ArmorSetBonuses',
  current: 0,
  total: 1,
  startedAt
});

const moduleUrl = new URL('https://terraria.wiki.gg/api.php');
moduleUrl.searchParams.set('action', 'query');
moduleUrl.searchParams.set('titles', 'Module:ArmorSetBonuses');
moduleUrl.searchParams.set('prop', 'revisions');
moduleUrl.searchParams.set('rvprop', 'content|timestamp');
moduleUrl.searchParams.set('formatversion', '2');
moduleUrl.searchParams.set('format', 'json');

try {
  const payload = await fetchWikiApiJson({
    url: moduleUrl,
    profile: 'revision',
    sourceKey: 'Module:ArmorSetBonuses'
  });
  const page = payload?.query?.pages?.[0];
  const revision = page?.revisions?.[0];
  const content = String(revision?.content ?? revision?.slots?.main?.content ?? '');
  if (!content.trim()) {
    throw new Error('Module:ArmorSetBonuses returned empty content');
  }

  const records = parseArmorSetBonuses(content);
  const fetchedAt = new Date().toISOString();
  const rawPayload = {
    apiUrl: 'https://terraria.wiki.gg/api.php',
    fetchedAt,
    moduleContent: content,
    moduleTitle: 'Module:ArmorSetBonuses',
    pageId: page?.pageid ?? null,
    pageTitle: page?.title ?? 'Module:ArmorSetBonuses',
    revisionId: revision?.revid ?? null,
    sourceRevisionTimestamp: revision?.timestamp ?? null
  };
  rawPayload.revisionTimestamp = rawPayload.sourceRevisionTimestamp;
  const parsedPayload = {
    armorSets: records,
    fetchedAt,
    source: 'terraria.wiki.gg:Module:ArmorSetBonuses',
    sourceApi: rawPayload.apiUrl,
    sourcePageTitle: rawPayload.pageTitle,
    sourceRevisionId: rawPayload.revisionId,
    sourceRevisionTimestamp: rawPayload.revisionTimestamp,
    terrariaVersion: null,
    totalArmorSets: records.length
  };
  const standardized = {
    entity: 'armor_sets',
    generatedAt: fetchedAt,
    records,
    schemaVersion: '1.0.0',
    sourceFile: 'terraria.wiki.gg/api.php?action=query&titles=Module:ArmorSetBonuses&prop=revisions&rvprop=content',
    totalRecords: records.length,
    upstreamMeta: {
      fetchedAt,
      source: 'terraria.wiki.gg:Module:ArmorSetBonuses',
      sourceApi: 'https://terraria.wiki.gg/api.php',
      sourcePageTitle: 'Module:ArmorSetBonuses',
      sourceRevisionId: revision?.revid ?? null,
      sourceRevisionTimestamp: revision?.timestamp ?? null
    }
  };

  const report = {
    generatedAt: fetchedAt,
    moduleUrl: moduleUrl.toString(),
    revisionId: revision?.revid ?? null,
    revisionTimestamp: revision?.timestamp ?? null,
    sharedRawDir,
    totalRecords: records.length,
    samples: records.slice(0, 5)
  };
  report.sourceEvidence = buildArmorSetSourceEvidence({
    rawPayload,
    parsedPayload,
    standardizedPayload: standardized,
    report
  });

  ensureDir(path.dirname(standardizedPath));
  ensureDir(path.dirname(rawOutputPath));
  ensureDir(path.dirname(reportPath));
  ensureDir(sharedRawDir);
  writeJson(standardizedPath, standardized);
  writeJson(rawOutputPath, {
    fetchedAt,
    pageTitle: page?.title ?? null,
    revisionId: revision?.revid ?? null,
    revisionTimestamp: revision?.timestamp ?? null,
    content
  });
  writeJson(sharedRawOutputPath, rawPayload);
  if (keepSnapshot) {
    writeJson(path.join(sharedRawDir, `module__armorsetbonuses.${timestamp}.json`), rawPayload);
  }
  writeJson(path.join(sharedRawDir, 'module__armorsetbonuses.parsed.latest.json'), parsedPayload);
  if (keepSnapshot) {
    writeJson(path.join(sharedRawDir, `module__armorsetbonuses.parsed.${timestamp}.json`), parsedPayload);
  }

  writeJson(reportPath, report);
  if (manifestPath) {
    advanceWikiIngestionManifestForSource({
      sourceKey: 'wiki.module.armorsetbonuses',
      locator: 'Module:ArmorSetBonuses',
      entityFamily: 'armor_sets',
      sourceKind: 'module',
      outputPath: sharedRawOutputPath,
      manifestPath
    });
  }
  progressHeartbeat.publish({
    status: 'completed',
    phase: 'write',
    message: `finished Module:ArmorSetBonuses fetch; records=${records.length}`,
    current: 1,
    total: 1,
    startedAt,
    outputPath: sharedRawOutputPath,
    reportPath
  });
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  progressHeartbeat.publish({
    status: 'failed',
    phase: 'error',
    message: error instanceof Error ? error.message : String(error),
    current: 0,
    total: 1,
    startedAt,
    nextStep: 'check Module:ArmorSetBonuses wiki source availability'
  });
  throw error;
} finally {
  progressHeartbeat.stop();
}

function writeProgress(progress) {
  const generatedAt = progress.generatedAt ?? new Date().toISOString();
  writeJsonFile(progressPath, buildActionProgressPayload({
    ...buildCrawlerWorkSummary({
      status: progress.status,
      current: progress.current,
      total: progress.total,
      estimatedRequests: 1
    }),
    ...progress,
    actionId,
    generatedAt,
    lastHeartbeatAt: generatedAt,
    childStatusPath: progressPath
  }));
}
