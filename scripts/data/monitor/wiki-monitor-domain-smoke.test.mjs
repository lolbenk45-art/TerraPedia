import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  WIKI_MONITOR_DOMAIN_SMOKE_DOMAINS,
  buildDomainSmokePlan
} from './wiki-monitor-domain-smoke.mjs';

const EXPECTED_DOMAINS = [
  'items',
  'npcs',
  'projectiles',
  'buffs',
  'armor_sets',
  'recipes',
  'biomes',
  'bosses',
  'town_npc_maintenance',
  'shimmer'
];
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const scriptPath = path.join(__dirname, 'wiki-monitor-domain-smoke.mjs');

test('wiki monitor domain smoke covers every monitored wiki domain', () => {
  assert.deepEqual(
    WIKI_MONITOR_DOMAIN_SMOKE_DOMAINS.map((domain) => domain.domain),
    EXPECTED_DOMAINS
  );
  assert.equal(new Set(WIKI_MONITOR_DOMAIN_SMOKE_DOMAINS.map((domain) => domain.sourceKey)).size, EXPECTED_DOMAINS.length);
  assert.equal(WIKI_MONITOR_DOMAIN_SMOKE_DOMAINS.every((domain) => Array.isArray(domain.queries) && domain.queries.length >= 2), true);
});

test('wiki monitor domain smoke plan clamps every run to 10 records per domain', () => {
  const plan = buildDomainSmokePlan({
    'run-id': 'manual-smoke-test',
    limit: 500,
    'progress-path': 'reports/crawler-monitor/manual-smoke-progress.json'
  });

  assert.equal(plan.actionId, 'wiki-monitor-domain-smoke');
  assert.equal(plan.runId, 'manual-smoke-test');
  assert.equal(plan.limit, 10);
  assert.equal(plan.domains.length, 10);
  assert.ok(plan.reportPath.endsWith(path.join('reports', 'crawler-monitor', 'manual-smoke-test.json')));
  assert.ok(plan.outputDir.endsWith(path.join('reports', 'crawler-monitor', 'manual-smoke-test')));
  assert.ok(plan.progressPath.endsWith(path.join('reports', 'crawler-monitor', 'manual-smoke-progress.json')));
  assert.ok(plan.latestReportPath.endsWith(path.join('reports', 'crawler-monitor', 'wiki-monitor-domain-smoke.latest.json')));
  for (const domain of plan.domains) {
    assert.equal(domain.limit, 10);
    assert.ok(domain.outputPath.endsWith(path.join('reports', 'crawler-monitor', 'manual-smoke-test', `${domain.domain}.json`)));
  }
});

test('wiki monitor domain smoke plan can target selected domains only', () => {
  const plan = buildDomainSmokePlan({
    'run-id': 'manual-selected-smoke-test',
    domains: 'items,buffs',
    limit: 10
  });

  assert.deepEqual(plan.selectedDomains, ['items', 'buffs']);
  assert.deepEqual(plan.domains.map((domain) => domain.domain), ['items', 'buffs']);
  assert.equal(plan.domains.length, 2);
  for (const domain of plan.domains) {
    assert.equal(domain.limit, 10);
    assert.ok(domain.outputPath.endsWith(path.join('reports', 'crawler-monitor', 'manual-selected-smoke-test', `${domain.domain}.json`)));
  }
});

test('wiki monitor domain smoke plan rejects unknown selected domains', () => {
  assert.throws(
    () => buildDomainSmokePlan({ domains: 'items,unknown_domain' }),
    /Unknown wiki monitor domain smoke domain\(s\): unknown_domain/
  );
});

test('wiki monitor domain smoke progress carries exact V2 attempt identity offline', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-domain-smoke-v2-'));
  const fixturePath = path.join(tempDir, 'fixture.json');
  const progressPath = path.join(tempDir, 'progress.json');
  fs.writeFileSync(fixturePath, JSON.stringify({ items: 10 }), 'utf8');

  const result = spawnSync(process.execPath, [
    scriptPath,
    '--run-id=v2-identity-smoke',
    '--domains=items',
    `--fixture=${fixturePath}`,
    `--output-dir=${path.join(tempDir, 'out')}`,
    `--report-path=${path.join(tempDir, 'report.json')}`,
    `--latest-report-path=${path.join(tempDir, 'latest.json')}`,
    `--progress-path=${progressPath}`
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      TERRAPEDIA_CRAWLER_QUEUE_ID: 'queue-smoke-1',
      TERRAPEDIA_CRAWLER_ATTEMPT_ID: 'attempt-smoke-1',
      TERRAPEDIA_CRAWLER_FENCE_TOKEN: '142',
      TERRAPEDIA_CRAWLER_STATE_STORE_EPOCH: 'epoch-smoke-1',
      TERRAPEDIA_CRAWLER_INITIAL_STATE_VERSION: '3',
      TERRAPEDIA_CRAWLER_PROGRESS_SEQUENCE: '7'
    }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  assert.equal(progress.queueId, 'queue-smoke-1');
  assert.equal(progress.attemptId, 'attempt-smoke-1');
  assert.equal(progress.fenceToken, 142);
  assert.equal(progress.stateStoreEpoch, 'epoch-smoke-1');
  assert.equal(progress.stateVersion, 3);
  assert.ok(progress.progressSequence > 7);
});
