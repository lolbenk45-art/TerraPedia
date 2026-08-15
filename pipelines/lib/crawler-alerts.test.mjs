import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  loadAlertConfig,
  recordCrawlerAlert
} from './crawler-alerts.mjs';

test('loadAlertConfig returns phase0 default thresholds when config is missing', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-alerts-'));
  const config = loadAlertConfig({ repoRoot: tempDir });

  assert.deepEqual(config, {
    heartbeatStaleAfterSeconds: 1800,
    consecutiveCloudflareFailures: 3,
    minioBucketSizeMaxGB: 50,
    wikiGateCooldownActiveTimeout: 1800
  });
});

test('recordCrawlerAlert appends alert records under reports/alerts', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-alerts-'));

  const result = recordCrawlerAlert({
    repoRoot: tempDir,
    type: 'cloudflare',
    entity: 'wiki-request-gate',
    message: 'three Cloudflare failures',
    now: new Date('2026-05-20T05:00:00.000Z'),
    context: { consecutiveFailures: 3 }
  });

  assert.equal(result.ok, true);
  assert.equal(result.path, path.join(tempDir, 'reports', 'alerts', '2026-05-20.json'));
  const records = JSON.parse(fs.readFileSync(result.path, 'utf8'));
  assert.equal(records.length, 1);
  assert.deepEqual(records[0], {
    generatedAt: '2026-05-20T05:00:00.000Z',
    type: 'cloudflare',
    entity: 'wiki-request-gate',
    severity: 'warning',
    message: 'three Cloudflare failures',
    context: { consecutiveFailures: 3 }
  });
});
