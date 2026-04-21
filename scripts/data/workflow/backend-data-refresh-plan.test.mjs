import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBackendDataRefreshPlan,
  buildBackendDataRefreshReport,
  resolvePendingBackendDataRefreshActions
} from './backend-data-refresh-plan.mjs';

test('buildBackendDataRefreshPlan returns the default primary backend refresh actions', () => {
  const plan = buildBackendDataRefreshPlan();
  const ids = plan.actions.map((action) => action.id);

  assert.deepEqual(ids, [
    'wiki-core-refresh',
    'item-pages-refresh',
    'recipe-reference-sync',
    'item-detail-sync',
    'boss-sync',
    'biome-sync',
    'town-npc-sync'
  ]);

  const wikiCore = plan.actions.find((action) => action.id === 'wiki-core-refresh');
  assert.ok(wikiCore);
  assert.deepEqual(wikiCore.args, [
    'scripts/data/workflow/run-wiki-sync.mjs',
    '--mode=apply',
    '--entity=items,npcs,bosses,biomes,categories'
  ]);

  const recipeReferenceSync = plan.actions.find((action) => action.id === 'recipe-reference-sync');
  assert.ok(recipeReferenceSync);
  assert.ok(
    recipeReferenceSync.args.some((arg) => arg.includes('--recipe-reference='))
  );
  assert.ok(
    recipeReferenceSync.args.some((arg) => arg.includes('reports/backend-refresh/recipe-material-reference.latest.json'))
  );

  const townNpcSync = plan.actions.find((action) => action.id === 'town-npc-sync');
  assert.ok(townNpcSync);
  assert.ok(townNpcSync.args.includes('scripts/data/pipeline/run-town-npc-sync-pipeline.mjs'));
  assert.ok(townNpcSync.args.includes('--apply=true'));

  const bossSync = plan.actions.find((action) => action.id === 'boss-sync');
  assert.ok(bossSync);
  assert.ok(bossSync.args.includes('scripts/data/pipeline/run-boss-sync-pipeline.mjs'));
  assert.ok(bossSync.args.includes('--apply=true'));

  const biomeSync = plan.actions.find((action) => action.id === 'biome-sync');
  assert.ok(biomeSync);
  assert.ok(biomeSync.args.includes('scripts/data/pipeline/run-biome-sync-pipeline.mjs'));
  assert.ok(biomeSync.args.includes('--apply=true'));
});

test('buildBackendDataRefreshPlan allows overriding item page limit', () => {
  const plan = buildBackendDataRefreshPlan({ itemPageLimit: 25 });
  const itemPages = plan.actions.find((action) => action.id === 'item-pages-refresh');

  assert.ok(itemPages);
  assert.ok(itemPages.args.includes('--page-limit=25'));
  assert.ok(itemPages.args.includes('--with-recipes=true'));
});

test('buildBackendDataRefreshPlan allows selecting a subset of action ids', () => {
  const plan = buildBackendDataRefreshPlan({ steps: ['wiki-core-refresh', 'town-npc-fetch'] });

  assert.deepEqual(
    plan.actions.map((action) => action.id),
    ['wiki-core-refresh']
  );
});

test('buildBackendDataRefreshPlan assigns action timeouts and supports override', () => {
  const defaultPlan = buildBackendDataRefreshPlan();
  const overriddenPlan = buildBackendDataRefreshPlan({ timeoutMs: 1234 });

  assert.ok(defaultPlan.actions.every((action) => Number(action.timeoutMs) > 0));
  assert.ok(overriddenPlan.actions.every((action) => action.timeoutMs === 1234));
});

test('buildBackendDataRefreshReport summarizes action statuses', () => {
  const plan = buildBackendDataRefreshPlan();
  const report = buildBackendDataRefreshReport(plan, [
    { id: 'wiki-core-refresh', status: 'completed', durationMs: 1200 },
    { id: 'item-pages-refresh', status: 'failed', durationMs: 300 }
  ]);

  assert.equal(report.totalActions, 7);
  assert.equal(report.completedActions, 1);
  assert.equal(report.failedActions, 1);
  assert.equal(report.pendingActions, 5);
  assert.equal(report.runningActions, 0);
  assert.equal(report.actions[0].status, 'completed');
  assert.equal(report.actions[1].status, 'failed');
});

test('buildBackendDataRefreshReport counts running action statuses', () => {
  const plan = buildBackendDataRefreshPlan({ steps: ['wiki-core-refresh'] });
  const report = buildBackendDataRefreshReport(plan, [
    { id: 'wiki-core-refresh', status: 'running' }
  ]);

  assert.equal(report.runningActions, 1);
  assert.equal(report.pendingActions, 0);
});

test('buildBackendDataRefreshReport counts timed out actions', () => {
  const plan = buildBackendDataRefreshPlan({ steps: ['wiki-core-refresh'] });
  const report = buildBackendDataRefreshReport(plan, [
    { id: 'wiki-core-refresh', status: 'failed', timedOut: true }
  ]);

  assert.equal(report.failedActions, 1);
  assert.equal(report.timedOutActions, 1);
  assert.equal(report.actions[0].timedOut, true);
});

test('resolvePendingBackendDataRefreshActions skips completed actions for resume', () => {
  const plan = buildBackendDataRefreshPlan();
  const report = buildBackendDataRefreshReport(plan, [
    { id: 'wiki-core-refresh', status: 'completed' },
    { id: 'item-pages-refresh', status: 'failed' }
  ]);

  assert.deepEqual(
    resolvePendingBackendDataRefreshActions(plan, report).map((action) => action.id),
    [
      'item-pages-refresh',
      'recipe-reference-sync',
      'item-detail-sync',
      'boss-sync',
      'biome-sync',
      'town-npc-sync'
    ]
  );
});
