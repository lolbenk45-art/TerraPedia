import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildBackendDataRefreshPlan,
  buildBackendDataRefreshReport,
  resolvePendingBackendDataRefreshActions
} from './backend-data-refresh-plan.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('buildBackendDataRefreshPlan returns the default primary backend refresh actions', () => {
  const plan = buildBackendDataRefreshPlan();
  const ids = plan.actions.map((action) => action.id);

  assert.deepEqual(ids, [
    'wiki-core-refresh',
    'wiki-items-refresh',
    'wiki-npcs-refresh',
    'wiki-projectiles-refresh',
    'item-pages-refresh',
    'recipe-reference-sync',
    'item-detail-sync',
    'npc-loot-backfill',
    'boss-loot-backfill',
    'boss-sync',
    'biome-sync',
    'town-npc-sync',
    'independent-entity-sync',
    'shimmer-sync',
    'support-sync',
    'wiki-audio-assets-refresh'
  ]);

  const wikiCore = plan.actions.find((action) => action.id === 'wiki-core-refresh');
  assert.ok(wikiCore);
  assert.deepEqual(wikiCore.args, [
    'scripts/data/workflow/run-wiki-sync.mjs',
    '--mode=apply',
    '--entity=items,npcs,projectiles,bosses,biomes,categories'
  ]);

  assert.deepEqual(plan.actions.find((action) => action.id === 'wiki-items-refresh').args, [
    'scripts/data/workflow/run-wiki-sync.mjs',
    '--mode=apply',
    '--entity=items'
  ]);
  assert.deepEqual(plan.actions.find((action) => action.id === 'wiki-npcs-refresh').args, [
    'scripts/data/workflow/run-wiki-sync.mjs',
    '--mode=apply',
    '--entity=npcs'
  ]);
  assert.deepEqual(plan.actions.find((action) => action.id === 'wiki-projectiles-refresh').args, [
    'scripts/data/workflow/run-wiki-sync.mjs',
    '--mode=apply',
    '--entity=projectiles'
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

  const npcLootBackfill = plan.actions.find((action) => action.id === 'npc-loot-backfill');
  assert.ok(npcLootBackfill);
  assert.deepEqual(npcLootBackfill.args, [
    'scripts/data/import/import-normal-npc-loot-to-db.mjs',
    '--dry-run=true',
    '--report-json=<outputPath>'
  ]);

  const bossLootBackfill = plan.actions.find((action) => action.id === 'boss-loot-backfill');
  assert.ok(bossLootBackfill);
  assert.deepEqual(bossLootBackfill.args, [
    'scripts/data/import/import-boss-loot-to-db.mjs',
    '--dry-run=true',
    '--report-json=<outputPath>'
  ]);

  const biomeSync = plan.actions.find((action) => action.id === 'biome-sync');
  assert.ok(biomeSync);
  assert.ok(biomeSync.args.includes('scripts/data/pipeline/run-biome-sync-pipeline.mjs'));
  assert.ok(biomeSync.args.includes('--apply=true'));

  const independentEntitySync = plan.actions.find((action) => action.id === 'independent-entity-sync');
  assert.ok(independentEntitySync);
  assert.ok(independentEntitySync.args.includes('scripts/data/pipeline/run-independent-entity-sync-pipeline.mjs'));
  assert.ok(independentEntitySync.args.includes('--apply=true'));

  const shimmerSync = plan.actions.find((action) => action.id === 'shimmer-sync');
  assert.ok(shimmerSync);
  assert.ok(shimmerSync.args.includes('scripts/data/pipeline/run-shimmer-sync-pipeline.mjs'));
  assert.ok(shimmerSync.args.includes('--apply=true'));

  const supportSync = plan.actions.find((action) => action.id === 'support-sync');
  assert.ok(supportSync);
  assert.ok(supportSync.args.includes('scripts/data/pipeline/run-support-sync-pipeline.mjs'));
  assert.ok(supportSync.args.includes('--apply=true'));

  const audioAssetsRefresh = plan.actions.find((action) => action.id === 'wiki-audio-assets-refresh');
  assert.ok(audioAssetsRefresh);
  assert.deepEqual(audioAssetsRefresh.args, [
    'scripts/data/fetch/fetch-wiki-audio-assets.mjs',
    '--limit-per-scope=3',
    '--max-api-pages-per-prefix=1',
    '--max-total-files=12',
    '--max-file-bytes=10485760'
  ]);
  assert.ok(!audioAssetsRefresh.args.includes('--apply=true'));
});

test('buildBackendDataRefreshPlan can select bounded wiki audio asset refresh only', () => {
  const plan = buildBackendDataRefreshPlan({ steps: 'wiki-audio-assets-refresh' });

  assert.equal(plan.actions.length, 1);
  assert.equal(plan.actions[0].id, 'wiki-audio-assets-refresh');
  assert.deepEqual(plan.actions[0].args, [
    'scripts/data/fetch/fetch-wiki-audio-assets.mjs',
    '--limit-per-scope=3',
    '--max-api-pages-per-prefix=1',
    '--max-total-files=12',
    '--max-file-bytes=10485760'
  ]);
});

test('backend refresh plan keeps check force preview and apply commands distinct', () => {
  const plan = buildBackendDataRefreshPlan({
    steps: [
      'wiki-items-refresh',
      'wiki-items-force-refresh',
      'recipe-reference-sync',
      'recipe-reference-apply',
      'biome-preview',
      'biome-sync',
      'npc-loot-backfill',
      'npc-loot-apply',
      'boss-loot-backfill',
      'boss-loot-apply',
      'item-group-canonical-preview',
      'item-group-canonical-apply',
    ],
  });
  const action = (id) => plan.actions.find((entry) => entry.id === id);

  assert.deepEqual(action('wiki-items-force-refresh').args.slice(-2), [
    '--entity=items',
    '--force=true',
  ]);
  assert.ok(!action('wiki-items-refresh').args.includes('--force=true'));
  assert.ok(action('recipe-reference-sync').args.includes('--apply=false'));
  assert.ok(action('recipe-reference-apply').args.includes('--apply=true'));
  assert.ok(action('biome-preview').args.includes('--apply=false'));
  assert.ok(action('biome-sync').args.includes('--apply=true'));
  assert.ok(action('npc-loot-backfill').args.includes('--dry-run=true'));
  assert.ok(action('npc-loot-apply').args.includes('--dry-run=false'));
  assert.ok(action('boss-loot-backfill').args.includes('--dry-run=true'));
  assert.ok(action('boss-loot-apply').args.includes('--dry-run=false'));
  assert.deepEqual(action('item-group-canonical-preview').args, [
    'scripts/data/item-groups/item-group-canonical-action.mjs',
    '--action-id=item-group-canonical-preview',
  ]);
  assert.deepEqual(action('item-group-canonical-apply').args, [
    'scripts/data/item-groups/item-group-canonical-action.mjs',
    '--action-id=item-group-canonical-apply',
  ]);

  const defaultIds = buildBackendDataRefreshPlan().actions.map((entry) => entry.id);
  assert.ok(!defaultIds.includes('wiki-items-force-refresh'));
  assert.ok(!defaultIds.includes('recipe-reference-apply'));
  assert.ok(!defaultIds.includes('npc-loot-apply'));
  assert.ok(!defaultIds.includes('item-group-canonical-preview'));
  assert.ok(!defaultIds.includes('item-group-canonical-apply'));
});

test('run-backend-data-refresh replaces output path placeholders before spawning actions', () => {
  const source = fs.readFileSync(path.join(__dirname, 'run-backend-data-refresh.mjs'), 'utf8');

  assert.match(source, /replaceAll\('<outputPath>', options\.outputPath\)/);
  assert.match(source, /const child = spawn\(command, actionArgs,/);
  assert.doesNotMatch(source, /const child = spawn\(command, args,/);
});

test('buildBackendDataRefreshPlan allows overriding item page limit', () => {
  const plan = buildBackendDataRefreshPlan({ itemPageLimit: 25 });
  const itemPages = plan.actions.find((action) => action.id === 'item-pages-refresh');

  assert.ok(itemPages);
  assert.ok(itemPages.args.includes('--page-limit=25'));
  assert.ok(itemPages.args.includes('--with-recipes=true'));
});

test('buildBackendDataRefreshPlan allows selecting a subset of action ids', () => {
  const plan = buildBackendDataRefreshPlan({ steps: ['wiki-items-refresh', 'town-npc-fetch'] });

  assert.deepEqual(
    plan.actions.map((action) => action.id),
    ['wiki-items-refresh']
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
    {
      id: 'wiki-core-refresh',
      status: 'completed',
      durationMs: 1200,
      childStatusPath: 'reports/backend-refresh/history/run.runtime/wiki-core-refresh.child-status.json',
      current: 5,
      total: 5,
      percent: 100,
      phase: 'apply',
      message: 'completed wiki sync',
      lastHeartbeatAt: '2026-04-29T00:00:05.000Z',
      plannedCount: 5,
      actualCount: 5,
      skippedCount: 0,
      failedCount: 0,
      estimatedRequests: 5,
      estimatedRecords: null,
      resultKind: 'fetched',
      resumeOutcome: 'not_supported'
    },
    { id: 'item-pages-refresh', status: 'failed', durationMs: 300 }
  ]);

  assert.equal(report.totalActions, 16);
  assert.equal(report.completedActions, 1);
  assert.equal(report.failedActions, 1);
  assert.equal(report.pendingActions, 14);
  assert.equal(report.runningActions, 0);
  assert.equal(report.actions[0].status, 'completed');
  assert.equal(report.actions[0].childStatusPath, 'reports/backend-refresh/history/run.runtime/wiki-core-refresh.child-status.json');
  assert.equal(report.actions[0].current, 5);
  assert.equal(report.actions[0].total, 5);
  assert.equal(report.actions[0].percent, 100);
  assert.equal(report.actions[0].phase, 'apply');
  assert.equal(report.actions[0].message, 'completed wiki sync');
  assert.equal(report.actions[0].lastHeartbeatAt, '2026-04-29T00:00:05.000Z');
  assert.equal(report.actions[0].plannedCount, 5);
  assert.equal(report.actions[0].actualCount, 5);
  assert.equal(report.actions[0].skippedCount, 0);
  assert.equal(report.actions[0].failedCount, 0);
  assert.equal(report.actions[0].estimatedRequests, 5);
  assert.equal(report.actions[0].estimatedRecords, null);
  assert.equal(report.actions[0].resultKind, 'fetched');
  assert.equal(report.actions[0].resumeOutcome, 'not_supported');
  assert.equal(report.actions.find((action) => action.id === 'item-pages-refresh').status, 'failed');
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
      'wiki-items-refresh',
      'wiki-npcs-refresh',
      'wiki-projectiles-refresh',
      'item-pages-refresh',
      'recipe-reference-sync',
      'item-detail-sync',
      'npc-loot-backfill',
      'boss-loot-backfill',
      'boss-sync',
      'biome-sync',
      'town-npc-sync',
      'independent-entity-sync',
      'shimmer-sync',
      'support-sync',
      'wiki-audio-assets-refresh'
    ]
  );
});
