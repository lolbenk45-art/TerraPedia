import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { ensureDir, writeJson } from '../../../lib/wiki-item-utils.mjs';
import { buildNpcCoverageShard } from './build-npc-coverage-shard.mjs';

export async function runNpcCoverageShard({
  domain,
  coverageAuditPath,
  priority,
  limit,
  outputRoot
} = {}) {
  const resolvedDomain = String(domain ?? 'npc').trim();
  if (resolvedDomain !== 'npc') {
    throw new Error(`Only coverage-shard --domain=npc is supported, received: ${resolvedDomain}`);
  }

  const resolvedCoverageAuditPath = path.resolve(
    coverageAuditPath ?? path.join(process.cwd(), 'data', 'wiki-crawler', 'report', 'npc', 'coverage-audit.latest.json')
  );
  const resolvedOutputRoot = path.resolve(outputRoot ?? path.join(process.cwd(), 'data', 'wiki-crawler'));
  const coverageAuditPayload = JSON.parse(await fs.readFile(resolvedCoverageAuditPath, 'utf8'));
  const shard = buildNpcCoverageShard({
    coverageAuditPayload,
    priority,
    limit
  });

  const reportDir = path.join(resolvedOutputRoot, 'report', 'npc');
  ensureDir(reportDir);

  const prioritySlug = String(priority ?? 'all').trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'all';
  const limitSuffix = Number.isFinite(Number(limit)) && Number(limit) > 0 ? `.top${Number(limit)}` : '';
  const shardPath = path.join(reportDir, `coverage-shard.${prioritySlug}${limitSuffix}.latest.json`);
  writeJson(shardPath, shard);

  return {
    shardPath,
    shard
  };
}

const isMain = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  : false;

if (isMain) {
  try {
    const result = await runNpcCoverageShard();
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  }
}
