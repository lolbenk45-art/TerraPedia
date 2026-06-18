import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

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
