import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMaintSyncSummary,
  extractMaintEntitiesFromLandingRow,
  parseArgs,
  runMaintSync,
} from './sync-landing-to-maint.mjs';

test('parseArgs parses scopes and apply flags', () => {
  assert.deepEqual(parseArgs(['--apply=true', '--scopes=items,npcs']), {
    apply: 'true',
    scopes: 'items,npcs',
  });
});

test('extractMaintEntitiesFromLandingRow expands items_raw into maint item rows', async () => {
  const itemLandingRow = {
    id: 11,
    dataset_type: 'items_raw',
    provider: 'terraria.wiki.gg',
    source_page: 'Module:Iteminfo/data',
    source_key: 'wiki.module.iteminfo',
    source_revision_timestamp: '2026-04-22T10:00:00Z',
    content_hash: 'a'.repeat(64),
    fetched_at: '2026-04-23T10:00:00Z',
    parsed_at: '2026-04-23T10:00:00Z',
    payload_json: JSON.stringify({
      moduleContent: 'return { ["data"] = [=====[{"_generated":"2026-04-22 10:00:00 (+00:00)","_terrariaversion":"1.4.5.6","1":{"name":"Iron Pickaxe","internalName":"IronPickaxe","damage":5,"useTime":20,"maxStack":1,"value":2000,"width":24,"height":28},"2":{"name":"Dirt Block","internalName":"DirtBlock","maxStack":9999,"value":0,"width":12,"height":12}}]=====] }',
      pageTitle: 'Module:Iteminfo/data',
    }),
  };

  const actual = await extractMaintEntitiesFromLandingRow(itemLandingRow);

  assert.equal(actual.scope, 'items');
  assert.equal(actual.rows.length, 2);
  assert.deepEqual(actual.rows[0], {
    scope: 'items',
    tableName: 'maint_items',
    sourceId: 1,
    internalName: 'IronPickaxe',
    englishName: 'Iron Pickaxe',
    nameZh: null,
    sourceProvider: 'terraria.wiki.gg',
    sourcePage: 'Module:Iteminfo/data',
    sourceRevisionTimestamp: '2026-04-22T10:00:00Z',
    landingSourceId: 11,
    landingSourceKey: 'wiki.module.iteminfo',
    landingSourcePage: 'Module:Iteminfo/data',
    landingContentHash: 'a'.repeat(64),
    landingFetchedAt: '2026-04-23T10:00:00Z',
    landingParsedAt: '2026-04-23T10:00:00Z',
    moduleGeneratedAt: '2026-04-22 10:00:00 (+00:00)',
    terrariaVersion: '1.4.5.6',
    majorValue: 2000,
    combatValue: 5,
    defenseValue: null,
    useTime: 20,
    stackSize: 1,
    width: 24,
    height: 28,
    flagsJson: null,
    rawJson: JSON.stringify({
      id: 1,
      name: 'Iron Pickaxe',
      internalName: 'IronPickaxe',
      damage: 5,
      useTime: 20,
      maxStack: 1,
      value: 2000,
      width: 24,
      height: 28,
    }),
  });
});

test('extractMaintEntitiesFromLandingRow expands parsed npc payload into maint npc rows', async () => {
  const npcLandingRow = {
    id: 21,
    dataset_type: 'npcs_raw',
    provider: 'terraria.wiki.gg',
    source_page: 'Module:Npcinfo/data',
    source_key: 'wiki.module.npcinfo',
    source_revision_timestamp: '2026-04-22T11:00:00Z',
    content_hash: 'b'.repeat(64),
    fetched_at: '2026-04-23T11:00:00Z',
    parsed_at: '2026-04-23T11:00:00Z',
    payload_json: JSON.stringify({
      moduleGeneratedAt: '2026-04-22 11:00:00 (+00:00)',
      wikiVersion: '1.4.5.1',
      npcs: [
        {
          id: 17,
          internalName: 'Merchant',
          name: 'Merchant',
          damage: 10,
          defense: 15,
          lifeMax: 250,
          width: 18,
          height: 40,
          value: 0,
          friendly: true,
          townNPC: true,
          boss: false,
        },
      ],
    }),
  };

  const actual = await extractMaintEntitiesFromLandingRow(npcLandingRow);

  assert.equal(actual.scope, 'npcs');
  assert.equal(actual.rows.length, 1);
  assert.equal(actual.rows[0].tableName, 'maint_npcs');
  assert.equal(actual.rows[0].internalName, 'Merchant');
  assert.equal(actual.rows[0].flagsJson, JSON.stringify({ friendly: true, townNpc: true, boss: false }));
});

test('buildMaintSyncSummary groups expanded rows by scope', () => {
  const summary = buildMaintSyncSummary(
    { apply: false, scopes: ['items', 'npcs'] },
    [
      { scope: 'items' },
      { scope: 'items' },
      { scope: 'npcs' },
    ],
  );

  assert.equal(summary.apply, false);
  assert.equal(summary.rows.total, 3);
  assert.equal(summary.rows.byScope.items, 2);
  assert.equal(summary.rows.byScope.npcs, 1);
});

test('runMaintSync skips connection in dry-run mode and reports expanded rows', async () => {
  let createConnectionCalled = false;
  const summary = await runMaintSync(
    { apply: false, scopes: ['items'] },
    {
      loadLandingRows: async () => [
        {
          id: 11,
          dataset_type: 'items_raw',
          provider: 'terraria.wiki.gg',
          source_page: 'Module:Iteminfo/data',
          source_key: 'wiki.module.iteminfo',
          source_revision_timestamp: '2026-04-22T10:00:00Z',
          content_hash: 'a'.repeat(64),
          fetched_at: '2026-04-23T10:00:00Z',
          parsed_at: '2026-04-23T10:00:00Z',
          payload_json: JSON.stringify({
            moduleContent: 'return { ["data"] = [=====[{"_generated":"2026-04-22 10:00:00 (+00:00)","_terrariaversion":"1.4.5.6","1":{"name":"Iron Pickaxe","internalName":"IronPickaxe"}}]=====] }',
          }),
        },
      ],
      mysqlModule: {
        async createConnection() {
          createConnectionCalled = true;
          throw new Error('should not connect');
        },
      },
      writeReport: async () => {},
    },
  );

  assert.equal(createConnectionCalled, false);
  assert.equal(summary.rows.total, 1);
  assert.equal(summary.writes.inserted, 0);
});

test('runMaintSync updates existing maint rows on repeated apply', async () => {
  const executeCalls = [];
  const summary = await runMaintSync(
    { apply: true, scopes: ['items'] },
    {
      loadLandingRows: async () => [
        {
          id: 11,
          dataset_type: 'items_raw',
          provider: 'terraria.wiki.gg',
          source_page: 'Module:Iteminfo/data',
          source_key: 'wiki.module.iteminfo',
          source_revision_timestamp: '2026-04-22T10:00:00Z',
          content_hash: 'a'.repeat(64),
          fetched_at: '2026-04-23T10:00:00Z',
          parsed_at: '2026-04-23T10:00:00Z',
          payload_json: JSON.stringify({
            moduleContent: 'return { ["data"] = [=====[{"_generated":"2026-04-22 10:00:00 (+00:00)","_terrariaversion":"1.4.5.6","1":{"name":"Iron Pickaxe","internalName":"IronPickaxe"}}]=====] }',
          }),
        },
      ],
      mysqlModule: {
        async createConnection() {
          return {
            async beginTransaction() {},
            async query() {},
            async execute(sql, params) {
              executeCalls.push({ sql, params });
              if (sql.startsWith('SELECT id FROM')) {
                return [[{ id: 1 }]];
              }
              return [{}];
            },
            async commit() {},
            async rollback() {},
            async end() {},
          };
        },
      },
      writeReport: async () => {},
    },
  );

  const updateCall = executeCalls.find((call) => call.sql.startsWith('UPDATE `maint_items`'));
  assert.ok(updateCall);
  assert.equal(updateCall.params.length, 24);
  assert.equal(summary.writes.updated, 1);
});
