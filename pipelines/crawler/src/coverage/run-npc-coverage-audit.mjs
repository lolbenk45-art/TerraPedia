import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { ensureDir, writeJson } from '../../../lib/wiki-item-utils.mjs';
import { getProjectRoot } from '../../../lib/project-root.mjs';
import {
  buildActionProgressPayload,
  createCrawlerProgressHeartbeat,
  writeJsonFile
} from '../../../workflow/backend-refresh-runtime-state.mjs';
import { buildNpcCoverageTargets } from './build-npc-coverage-targets.mjs';
import { auditNpcCoverageTargets } from './audit-npc-coverage-targets.mjs';
import { collectNpcCoverageEntityIds } from '../domains/npc-source-mapping.mjs';

const ACTION_ID = 'npc-coverage-audit';
const PROGRESS_TOTAL = 3;

export async function runNpcCoverageAudit({
  domain,
  sourceStandardizedDir,
  crawlerOutputRoot,
  outputRoot,
  progressPath,
  canonicalProgressPath,
  projectRoot,
  actionId,
  fetchWikiPageMetadataBatchImpl
} = {}) {
  const resolvedDomain = String(domain ?? 'npc').trim();
  if (resolvedDomain !== 'npc') {
    throw new Error(`Only coverage-audit --domain=npc is supported, received: ${resolvedDomain}`);
  }

  const resolvedSourceStandardizedDir = path.resolve(sourceStandardizedDir ?? path.join(process.cwd(), 'data', 'standardized'));
  const resolvedCrawlerOutputRoot = path.resolve(crawlerOutputRoot ?? path.join(process.cwd(), 'data', 'wiki-crawler'));
  const resolvedOutputRoot = path.resolve(outputRoot ?? resolvedCrawlerOutputRoot);
  const reportDir = path.join(resolvedOutputRoot, 'report', 'npc');
  const targetsPath = path.join(reportDir, 'coverage-targets.latest.json');
  const auditPath = path.join(reportDir, 'coverage-audit.latest.json');
  const resolvedProjectRoot = path.resolve(projectRoot ?? getProjectRoot());
  const resolvedProgressPath = path.resolve(
    progressPath
      ?? process.env.TERRAPEDIA_CRAWLER_PROGRESS_PATH
      ?? path.join(resolvedProjectRoot, 'data', 'generated', 'wiki-sync-progress.latest.json')
  );
  const resolvedCanonicalProgressPath = path.resolve(
    canonicalProgressPath ?? path.join(resolvedProjectRoot, 'data', 'generated', 'wiki-sync-progress.latest.json')
  );
  const resolvedActionId = String(actionId ?? process.env.TERRAPEDIA_CRAWLER_ACTION_ID ?? ACTION_ID).trim() || ACTION_ID;
  const startedAt = new Date().toISOString();
  let current = 0;

  const writeProgress = (progress, targetPath = resolvedProgressPath) => {
    const payload = buildActionProgressPayload({
      actionId: resolvedActionId,
      startedAt,
      childStatusPath: targetPath,
      outputPath: auditPath,
      reportPath: auditPath,
      ...progress
    });
    writeJsonFile(targetPath, payload);

    if (targetPath !== resolvedCanonicalProgressPath) {
      writeJsonFile(resolvedCanonicalProgressPath, buildActionProgressPayload({
        actionId: resolvedActionId,
        startedAt,
        childStatusPath: resolvedCanonicalProgressPath,
        outputPath: auditPath,
        reportPath: auditPath,
        ...progress
      }));
    }
  };
  const heartbeat = createCrawlerProgressHeartbeat({ writeProgress });
  const publish = (progress) => heartbeat.publish({
    current,
    total: PROGRESS_TOTAL,
    ...progress
  });

  publish({
    status: 'running',
    phase: 'load_inputs',
    message: 'loading standardized NPC coverage inputs'
  });

  try {
    const standardizedPayload = await readJson(path.join(resolvedSourceStandardizedDir, 'npcs.standardized.json'));
    const crawledEntityIds = await loadCrawledEntityIds(resolvedCrawlerOutputRoot);
    const targets = buildNpcCoverageTargets({
      standardizedPayload,
      crawledEntityIds
    });

    current = 1;
    publish({
      status: 'running',
      phase: 'resolve_page_metadata',
      message: `resolving wiki metadata for ${targets.targets.length} coverage targets`,
      overallCurrent: 0,
      overallTotal: targets.targets.length
    });
    const audit = await auditNpcCoverageTargets({
      targets: targets.targets,
      crawledEntityIds,
      fetchWikiPageMetadataBatchImpl
    });

    current = 2;
    publish({
      status: 'running',
      phase: 'write_reports',
      message: 'writing NPC coverage reports',
      overallCurrent: targets.targets.length,
      overallTotal: targets.targets.length
    });
    ensureDir(reportDir);
    writeJson(targetsPath, targets);
    writeJson(auditPath, audit);

    current = PROGRESS_TOTAL;
    publish({
      status: 'completed',
      phase: 'completed',
      message: 'NPC coverage audit completed',
      overallCurrent: targets.targets.length,
      overallTotal: targets.targets.length
    });

    return {
      targetsPath,
      auditPath,
      progressPath: resolvedProgressPath,
      canonicalProgressPath: resolvedCanonicalProgressPath,
      targets,
      audit
    };
  } catch (error) {
    publish({
      status: 'failed',
      phase: 'failed',
      message: error?.message ?? String(error),
      failedCount: 1
    });
    throw error;
  } finally {
    heartbeat.stop();
  }
}

async function loadCrawledEntityIds(crawlerOutputRoot) {
  const normalizedDir = path.join(crawlerOutputRoot, 'normalized-light', 'npc');
  try {
    const files = await fs.readdir(normalizedDir);
    const entityIds = new Set();

    for (const fileName of files.filter((name) => name.endsWith('.latest.json')).sort()) {
      const normalizedPath = path.join(normalizedDir, fileName);
      const normalized = JSON.parse(await fs.readFile(normalizedPath, 'utf8'));
      for (const entityId of collectNpcCoverageEntityIds(normalized)) {
        entityIds.add(entityId);
      }
    }

    return [...entityIds].sort();
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

const isMain = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  : false;

if (isMain) {
  try {
    const result = await runNpcCoverageAudit();
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  }
}
