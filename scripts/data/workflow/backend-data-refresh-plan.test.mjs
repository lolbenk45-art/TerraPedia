import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBackendDataRefreshPlan } from './backend-data-refresh-plan.mjs';

test('buildBackendDataRefreshPlan returns the default primary backend refresh actions', () => {
  const plan = buildBackendDataRefreshPlan();
  const ids = plan.actions.map((action) => action.id);

  assert.deepEqual(ids, [
    'wiki-core-refresh',
    'item-pages-refresh',
    'recipe-reference-sync',
    'item-detail-sync',
    'town-npc-fetch',
    'town-npc-import'
  ]);

  const wikiCore = plan.actions.find((action) => action.id === 'wiki-core-refresh');
  assert.ok(wikiCore);
  assert.deepEqual(wikiCore.args, [
    'scripts/data/workflow/run-wiki-sync.mjs',
    '--mode=apply',
    '--entity=items,npcs,bosses,biomes,categories'
  ]);

  const townNpcImport = plan.actions.find((action) => action.id === 'town-npc-import');
  assert.ok(townNpcImport);
  assert.ok(townNpcImport.args.includes('--apply=true'));
});

test('buildBackendDataRefreshPlan allows overriding item page limit', () => {
  const plan = buildBackendDataRefreshPlan({ itemPageLimit: 25 });
  const itemPages = plan.actions.find((action) => action.id === 'item-pages-refresh');

  assert.ok(itemPages);
  assert.ok(itemPages.args.includes('--page-limit=25'));
  assert.ok(itemPages.args.includes('--with-recipes=true'));
});
