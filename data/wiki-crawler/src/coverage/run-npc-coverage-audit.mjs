import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { ensureDir, writeJson } from '../../../../scripts/data/lib/wiki-item-utils.mjs';
import { buildNpcCoverageTargets } from './build-npc-coverage-targets.mjs';
import { auditNpcCoverageTargets } from './audit-npc-coverage-targets.mjs';

export async function runNpcCoverageAudit({
  domain,
  sourceStandardizedDir,
  crawlerOutputRoot,
  outputRoot,
  fetchWikiPageMetadataBatchImpl
} = {}) {
  const resolvedDomain = String(domain ?? 'npc').trim();
  if (resolvedDomain !== 'npc') {
    throw new Error(`Only coverage-audit --domain=npc is supported, received: ${resolvedDomain}`);
  }

  const resolvedSourceStandardizedDir = path.resolve(sourceStandardizedDir ?? path.join(process.cwd(), 'data', 'standardized'));
  const resolvedCrawlerOutputRoot = path.resolve(crawlerOutputRoot ?? path.join(process.cwd(), 'data', 'wiki-crawler'));
  const resolvedOutputRoot = path.resolve(outputRoot ?? resolvedCrawlerOutputRoot);
  const standardizedPayload = await readJson(path.join(resolvedSourceStandardizedDir, 'npcs.standardized.json'));
  const crawledEntityIds = await loadCrawledEntityIds(resolvedCrawlerOutputRoot);

  const targets = buildNpcCoverageTargets({
    standardizedPayload,
    crawledEntityIds
  });
  const audit = await auditNpcCoverageTargets({
    targets: targets.targets,
    fetchWikiPageMetadataBatchImpl
  });

  const reportDir = path.join(resolvedOutputRoot, 'report', 'npc');
  ensureDir(reportDir);

  const targetsPath = path.join(reportDir, 'coverage-targets.latest.json');
  const auditPath = path.join(reportDir, 'coverage-audit.latest.json');

  writeJson(targetsPath, targets);
  writeJson(auditPath, audit);

  return {
    targetsPath,
    auditPath,
    targets,
    audit
  };
}

async function loadCrawledEntityIds(crawlerOutputRoot) {
  const normalizedDir = path.join(crawlerOutputRoot, 'normalized-light', 'npc');
  try {
    const files = await fs.readdir(normalizedDir);
    return files
      .filter((name) => name.endsWith('.latest.json'))
      .map((name) => name.replace(/\.latest\.json$/i, ''))
      .sort();
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
