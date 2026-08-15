import fs from 'node:fs';
import path from 'node:path';

import { getProjectRoot } from './project-root.mjs';
import { writeJsonFile } from '../workflow/backend-refresh-runtime-state.mjs';

export const DEFAULT_ALERT_CONFIG = Object.freeze({
  heartbeatStaleAfterSeconds: 1800,
  consecutiveCloudflareFailures: 3,
  minioBucketSizeMaxGB: 50,
  wikiGateCooldownActiveTimeout: 1800
});

export function loadAlertConfig({
  repoRoot = getProjectRoot(),
  configPath = path.join(repoRoot, 'reports', 'backend-refresh', 'alert-config.json')
} = {}) {
  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_ALERT_CONFIG };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return {
      ...DEFAULT_ALERT_CONFIG,
      ...Object.fromEntries(
        Object.entries(parsed ?? {}).filter(([, value]) => Number.isFinite(Number(value)))
      )
    };
  } catch {
    return { ...DEFAULT_ALERT_CONFIG };
  }
}

export function recordCrawlerAlert({
  repoRoot = getProjectRoot(),
  type,
  entity,
  severity = 'warning',
  message,
  context = {},
  now = new Date()
} = {}) {
  const generatedAt = toDate(now).toISOString();
  const targetPath = path.join(repoRoot, 'reports', 'alerts', `${generatedAt.slice(0, 10)}.json`);
  const records = readExistingRecords(targetPath);
  records.push({
    generatedAt,
    type: String(type ?? 'crawler'),
    entity: String(entity ?? 'crawler'),
    severity: String(severity ?? 'warning'),
    message: String(message ?? ''),
    context
  });
  writeJsonFile(targetPath, records);
  return { ok: true, path: targetPath, count: records.length };
}

function readExistingRecords(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : new Date();
}
