#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveRedisConfigFromEnv } from '../lib/crawler-heartbeat.mjs';
import {
  buildCrawlerMonitorRedisKey,
  writeCrawlerMonitorRedisState
} from '../lib/crawler-monitor-redis-state.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';

const MONITOR_FILES = [
  {
    stateId: 'backend-refresh:daemon',
    relativePath: path.join('reports', 'backend-refresh', 'backend-refresh-daemon.heartbeat.json')
  },
  {
    stateId: 'backend-refresh:scheduler',
    relativePath: path.join('reports', 'backend-refresh', 'backend-refresh-scheduler.latest.json')
  },
  {
    stateId: 'backend-refresh:lock',
    relativePath: path.join('reports', 'backend-refresh', 'backend-refresh.lock.json')
  },
  {
    stateId: 'item-pages-refresh:progress',
    relativePath: path.join('data', 'generated', 'wiki-sync-progress.latest.json')
  },
  {
    stateId: 'buff-page-immunity-refresh:progress',
    relativePath: path.join('data', 'generated', 'fetch-wiki-buffs-progress.latest.json')
  }
];

export function buildMonitorStateMigrationPlan({ repoRoot = getProjectRoot() } = {}) {
  const root = path.resolve(repoRoot);
  return MONITOR_FILES
    .map((entry) => {
      const filePath = path.join(root, entry.relativePath);
      const payload = readJsonFile(filePath);
      if (!payload) {
        return null;
      }
      return {
        stateId: entry.stateId,
        key: buildCrawlerMonitorRedisKey(entry.stateId),
        path: filePath,
        payload
      };
    })
    .filter(Boolean);
}

export async function runMonitorStateMigration({
  repoRoot = getProjectRoot(),
  redis = resolveRedisConfigFromEnv(),
  runCommand
} = {}) {
  const plan = buildMonitorStateMigrationPlan({ repoRoot });
  const results = [];
  for (const entry of plan) {
    const result = await writeCrawlerMonitorRedisState({
      redis,
      stateId: entry.stateId,
      payload: entry.payload,
      runCommand
    });
    results.push({ ...entry, ...result });
  }
  return {
    scanned: MONITOR_FILES.length,
    planned: plan.length,
    written: results.filter((entry) => entry.ok).length,
    failed: results.filter((entry) => !entry.ok).length,
    results
  };
}

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const result = {};
  for (const token of argv) {
    if (!token.startsWith('--')) {
      continue;
    }
    const body = token.slice(2);
    const separatorIndex = body.indexOf('=');
    if (separatorIndex === -1) {
      result[body] = 'true';
      continue;
    }
    result[body.slice(0, separatorIndex)] = body.slice(separatorIndex + 1);
  }
  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runMonitorStateMigration({
    repoRoot: options['repo-root'] ?? options.repoRoot ?? getProjectRoot(),
    redis: resolveRedisConfigFromEnv(options)
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.failed > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
