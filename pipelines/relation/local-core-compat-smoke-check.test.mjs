import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLocalCoreCompatSmokeCheck,
  parseArgs,
  resolveLocalCoreMysqlOptions,
  resolveMysqlRequirePath,
  runLocalCoreCompatSmokeCheck
} from './local-core-compat-smoke-check.mjs';

test('local core smoke resolves mysql from the maintained admin dependency root', () => {
  assert.match(resolveMysqlRequirePath('/repo'), /\/apps\/admin-console\/package\.json$/);
});

test('local core smoke uses the configured loopback database port', () => {
  assert.deepEqual(
    resolveLocalCoreMysqlOptions({
      config: { database: { host: '127.0.0.1', port: 13306, username: 'root', password: 'secret' } },
      env: {},
    }),
    { host: '127.0.0.1', port: 13306, user: 'root', password: 'secret' },
  );
});

test('parseArgs defaults to strict local core compatibility smoke check', () => {
  const actual = parseArgs([]);

  assert.deepEqual(actual, {
    localDatabase: 'terria_v1_local',
    relationDatabase: 'terria_v1_relation',
    port: null,
    dateTag: null,
    throwOnFailure: true
  });
});

test('buildLocalCoreCompatSmokeCheck passes when row counts keys and blocking fields align', () => {
  const actual = buildLocalCoreCompatSmokeCheck({
    localData: {
      items: [{ internal_name: 'IronPickaxe', name: 'Iron Pickaxe', image: 'item.png' }],
      npcs: [],
      projectiles: [],
      buffs: []
    },
    projectionData: {
      projection_items: [{ internal_name: 'IronPickaxe', name: 'Iron Pickaxe', image: 'item.png' }],
      projection_npcs: [],
      projection_projectiles: [],
      projection_buffs: []
    }
  });

  assert.equal(actual.ok, true);
  assert.deepEqual(actual.failedDomains, []);
  assert.equal(actual.domainResults.items.rowCountMismatch, false);
});

test('buildLocalCoreCompatSmokeCheck allows documented zh recipe local-only item rows', () => {
  const actual = buildLocalCoreCompatSmokeCheck({
    localData: {
      items: [
        { internal_name: 'IronPickaxe', name: 'Iron Pickaxe', image: 'item.png' },
        {
          internal_name: 'ZH_RECIPE_BLUE_JELLYFISH_BAIT',
          name: 'Blue Jellyfish (bait)',
          source_provider: 'wiki_zh_recipe_import'
        }
      ],
      npcs: [],
      projectiles: [],
      buffs: []
    },
    projectionData: {
      projection_items: [{ internal_name: 'IronPickaxe', name: 'Iron Pickaxe', image: 'item.png' }],
      projection_npcs: [],
      projection_projectiles: [],
      projection_buffs: []
    }
  });

  assert.equal(actual.ok, true);
  assert.deepEqual(actual.failedDomains, []);
  assert.equal(actual.domainResults.items.rowCountMismatch, false);
  assert.deepEqual(actual.domainResults.items.acceptedLocalOnlyExceptions, ['ZH_RECIPE_BLUE_JELLYFISH_BAIT']);
});

test('buildLocalCoreCompatSmokeCheck fails on projection-only key and field gaps', () => {
  const actual = buildLocalCoreCompatSmokeCheck({
    localData: {
      items: [
        { internal_name: 'IronPickaxe', name: 'Iron Pickaxe', image: 'item.png' }
      ],
      npcs: [],
      projectiles: [],
      buffs: []
    },
    projectionData: {
      projection_items: [
        { internal_name: 'IronPickaxe', name: 'Iron Pickaxe', image: null },
        { internal_name: 'ProjectionOnly', name: 'Projection Only', image: 'projection.png' }
      ],
      projection_npcs: [],
      projection_projectiles: [],
      projection_buffs: []
    }
  });

  assert.equal(actual.ok, false);
  assert.deepEqual(actual.failedDomains, ['items']);
  assert.equal(actual.domainResults.items.rowCountMismatch, true);
  assert.equal(actual.domainResults.items.keyMismatch, true);
  assert.equal(actual.domainResults.items.fieldMismatch, true);
});

test('runLocalCoreCompatSmokeCheck throws when strict smoke check fails', async () => {
  await assert.rejects(
    () => runLocalCoreCompatSmokeCheck(
      {
        localDatabase: 'terria_v1_local',
        relationDatabase: 'terria_v1_relation',
        dateTag: '2026-04-26',
        throwOnFailure: true
      },
      {
        loadData: async () => ({
          localData: {
            items: [{ internal_name: 'IronPickaxe', name: 'Iron Pickaxe', image: 'item.png' }],
            npcs: [],
            projectiles: [],
            buffs: []
          },
          projectionData: {
            projection_items: [{ internal_name: 'IronPickaxe', name: 'Iron Pickaxe', image: null }],
            projection_npcs: [],
            projection_projectiles: [],
            projection_buffs: []
          }
        }),
        writeReport: async () => 'reports/relation/local-core-compat-smoke-2026-04-26.json'
      }
    ),
    /Local core compatibility smoke check failed: items/
  );
});
