import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WIKI_MONITOR_DOMAIN_RULES,
  buildWikiMonitorDomains,
  resolveWikiMonitorAction
} from './wiki-monitor-domain-rules.mjs';

test('wiki monitor exposes the ten minimum closure domains with whitelisted actions', () => {
  assert.deepEqual(
    WIKI_MONITOR_DOMAIN_RULES.map((rule) => rule.domain),
    [
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
    ]
  );

  for (const rule of WIKI_MONITOR_DOMAIN_RULES) {
    assert.equal(rule.dispatchMode, 'manual');
    assert.equal(rule.requiresApproval, true);
    assert.equal(rule.autoEligible, false);
    assert.ok(rule.recommendedActionId);
    assert.ok(rule.progressPath);
    assert.ok(Array.isArray(rule.command));
    assert.ok(rule.command.length >= 2);
  }
});

test('wiki monitor domains merge source state into changed and pending approval rows', () => {
  const sourceState = {
    checkedAt: '2026-06-14T00:00:00Z',
    sources: [
      {
        key: 'wiki.module.iteminfo',
        locator: 'Module:Iteminfo/data',
        checkedAt: '2026-06-14T00:00:00Z',
        currentValue: '2026-06-13T00:00:00Z',
        previousValue: '2026-06-01T00:00:00Z',
        changed: true,
        status: 'ok'
      }
    ]
  };

  const domains = buildWikiMonitorDomains({ sourceState });
  const items = domains.find((domain) => domain.domain === 'items');

  assert.equal(items.status, 'changed');
  assert.equal(items.changed, true);
  assert.equal(items.recommendedActionId, 'wiki-items-refresh');
  assert.equal(items.progressPath, 'reports/backend-refresh/history/<run>.runtime/wiki-items-refresh.child-status.json');
  assert.equal(items.requiresApproval, true);
  assert.match(items.message, /awaiting approval/i);
});

test('wiki monitor core module domains expose independent backend actions', () => {
  const actionByDomain = new Map(WIKI_MONITOR_DOMAIN_RULES.map((rule) => [rule.domain, rule]));

  assert.equal(actionByDomain.get('items').recommendedActionId, 'wiki-items-refresh');
  assert.equal(actionByDomain.get('npcs').recommendedActionId, 'wiki-npcs-refresh');
  assert.equal(actionByDomain.get('projectiles').recommendedActionId, 'wiki-projectiles-refresh');

  assert.deepEqual(actionByDomain.get('items').command, [
    'node',
    'scripts/data/workflow/run-backend-data-refresh.mjs',
    '--mode=apply',
    '--steps=wiki-items-refresh',
    '--output=<reportPath>'
  ]);
  assert.deepEqual(actionByDomain.get('npcs').command, [
    'node',
    'scripts/data/workflow/run-backend-data-refresh.mjs',
    '--mode=apply',
    '--steps=wiki-npcs-refresh',
    '--output=<reportPath>'
  ]);
  assert.deepEqual(actionByDomain.get('projectiles').command, [
    'node',
    'scripts/data/workflow/run-backend-data-refresh.mjs',
    '--mode=apply',
    '--steps=wiki-projectiles-refresh',
    '--output=<reportPath>'
  ]);
});

test('wiki monitor action resolver rejects unknown domain action pairs', () => {
  assert.equal(resolveWikiMonitorAction('items', 'wiki-items-refresh').actionId, 'wiki-items-refresh');
  assert.throws(
    () => resolveWikiMonitorAction('items', 'domain-source-shimmer'),
    /not allowed/
  );
});

test('wiki monitor rules expose executable command arrays and canonical progress paths for every domain', () => {
  const actionByDomain = new Map(WIKI_MONITOR_DOMAIN_RULES.map((rule) => [rule.domain, rule]));

  assert.deepEqual(actionByDomain.get('items').command, [
    'node',
    'scripts/data/workflow/run-backend-data-refresh.mjs',
    '--mode=apply',
    '--steps=wiki-items-refresh',
    '--output=<reportPath>'
  ]);
  assert.deepEqual(actionByDomain.get('bosses').command, [
    'node',
    'scripts/data/fetch/fetch-wiki-bosses.mjs',
    '--progress-path=data/generated/domain-source-bosses-progress.latest.json'
  ]);
  assert.deepEqual(actionByDomain.get('armor_sets').command, [
    'node',
    'scripts/data/fetch/fetch-wiki-armorsetbonuses.mjs',
    '--progress-path=data/generated/domain-source-armor-sets-progress.latest.json'
  ]);
  assert.deepEqual(actionByDomain.get('town_npc_maintenance').command, [
    'node',
    'scripts/data/fetch/fetch-wiki-town-npc-maintenance.mjs',
    '--progress-path=data/generated/domain-source-town-npc-maintenance-progress.latest.json'
  ]);

  for (const rule of WIKI_MONITOR_DOMAIN_RULES) {
    assert.equal(rule.command[0], 'node', `unexpected executable in ${rule.domain}`);
    assert.ok(rule.command.every((part) => !/[;&|`$]/.test(part)), `unsafe shell token in ${rule.domain}`);
    if (rule.command.includes('--output=<reportPath>')) {
      assert.match(rule.progressPath, /<run>\.runtime\/.+\.child-status\.json$/);
    } else {
      assert.ok(rule.command.some((part) => part === `--progress-path=${rule.progressPath}`), `missing canonical progress path in ${rule.domain}`);
    }
  }
});
