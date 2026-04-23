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

test('extractMaintEntitiesFromLandingRow expands item page payload into maint item page rows', async () => {
  const landingRow = {
    id: 31,
    dataset_type: 'item_pages_raw',
    provider: 'terraria.wiki.gg',
    source_page: 'Zenith',
    source_key: 'wiki.page.item_detail:Zenith',
    source_revision_timestamp: '2026-03-16T22:11:59Z',
    content_hash: 'c'.repeat(64),
    fetched_at: '2026-03-28T04:15:57.931Z',
    parsed_at: '2026-03-28T04:15:57.931Z',
    payload_json: JSON.stringify({
      requestedPageTitle: 'Zenith',
      pageTitle: 'Zenith',
      pageId: 4649,
      revisionTimestamp: '2026-03-16T22:11:59Z',
      fetchedAt: '2026-03-28T04:15:57.931Z',
      wikitext: 'wiki text',
      html: '<p>Zenith</p>',
      recipesMarkup: '<table></table>',
      entityType: 'item',
      itemName: 'Zenith',
      itemInternalName: 'Zenith',
    }),
  };

  const actual = await extractMaintEntitiesFromLandingRow(landingRow);

  assert.equal(actual.scope, 'item_pages');
  assert.equal(actual.rows.length, 1);
  assert.equal(actual.rows[0].tableName, 'maint_item_pages');
  assert.equal(actual.rows[0].recordKey.length, 64);
  assert.equal(actual.rows[0].itemInternalName, 'Zenith');
  assert.equal(actual.rows[0].pageId, 4649);
  assert.equal(actual.rows[0].recipesMarkup, '<table></table>');
});

test('extractMaintEntitiesFromLandingRow expands relation bundle chunk into image and recipe rows', async () => {
  const landingRow = {
    id: 41,
    dataset_type: 'item_relations_bundle_raw',
    provider: 'terrapedia.generated',
    source_page: 'item-relations.bundle#snapshots/1',
    source_key: 'generated.item_relations_bundle:chunk:0001',
    source_revision_timestamp: null,
    content_hash: 'd'.repeat(64),
    fetched_at: '2026-04-21T21:28:48.044Z',
    parsed_at: '2026-04-21T21:28:48.044Z',
    payload_json: JSON.stringify({
      source: 'terraria.wiki.gg:item-page-assembly',
      itemImages: [
        {
          itemInternalName: 'Abeemination',
          itemName: 'Abeemination',
          role: 'icon',
          provider: 'wiki_gg',
          sourceFileTitle: 'Abeemination.png',
          sourcePage: 'Abeemination',
          originalUrl: 'https://terraria.wiki.gg/images/Abeemination.png',
          cachedUrl: 'https://terraria.wiki.gg/images/Abeemination.png',
          width: 32,
          height: 34,
          contentType: 'image/png',
          isPrimary: true,
          sortOrder: 0,
        },
      ],
      recipes: [
        {
          resultInternalName: 'AccentSlab',
          resultName: 'Stone Accent Slab',
          resultQuantity: 1,
          versionScope: null,
          notes: null,
          sourceProvider: 'wiki_gg',
          sourcePage: 'Recipes/Ecto Mist',
          sourceContextPage: 'Recipes/Ecto Mist',
          sourceContextPageSlug: 'Ecto_Mist',
          sourceContextDisplayName: 'Ecto Mist',
          sourceContextUrl: 'https://terraria.wiki.gg/wiki/Recipes/Ecto%20Mist',
          sourceContextRevisionId: 961725,
          sourceFetchedAt: '2026-04-21T21:28:48.044Z',
          ingredients: [{ ingredientInternalName: 'StoneBlock', ingredientName: 'Stone Block', sortOrder: 0 }],
          stations: [{ stationInternalName: 'HeavyWorkBench', stationName: 'Heavy Assembler', sortOrder: 0 }],
        },
      ],
    }),
  };

  const actual = await extractMaintEntitiesFromLandingRow(landingRow);

  assert.equal(actual.scope, 'bundle_relations');
  assert.equal(actual.rows.length, 2);
  const imageRow = actual.rows.find((row) => row.tableName === 'maint_item_images');
  const recipeRow = actual.rows.find((row) => row.tableName === 'maint_item_recipes');
  assert.ok(imageRow);
  assert.ok(recipeRow);
  assert.equal(imageRow.itemInternalName, 'Abeemination');
  assert.equal(recipeRow.resultInternalName, 'AccentSlab');
  assert.equal(recipeRow.ingredientsJson, JSON.stringify([{ ingredientInternalName: 'StoneBlock', ingredientName: 'Stone Block', sortOrder: 0 }]));
});

test('extractMaintEntitiesFromLandingRow expands relation bundle chunk into source and biome rows', async () => {
  const landingRow = {
    id: 51,
    dataset_type: 'item_relations_bundle_raw',
    provider: 'terrapedia.generated',
    source_page: 'item-relations.bundle#snapshots/1',
    source_key: 'generated.item_relations_bundle:chunk:0001',
    source_revision_timestamp: null,
    content_hash: 'f'.repeat(64),
    fetched_at: '2026-04-21T21:28:48.044Z',
    parsed_at: '2026-04-21T21:28:48.044Z',
    payload_json: JSON.stringify({
      itemSources: [
        {
          itemInternalName: 'Acorn',
          itemName: 'Acorn',
          sourceType: 'shop',
          sourceRefType: 'npc',
          sourceRefName: 'Dryad',
          sortOrder: 0,
          biomeCode: 'crimson',
          sourceProvider: 'wiki_gg',
          sourcePage: 'Acorn',
          sourceRevisionTimestamp: '2026-03-20T17:40:48Z',
        },
      ],
      itemBiomes: [
        {
          itemInternalName: 'Acorn',
          itemName: 'Acorn',
          biomeCode: 'crimson',
          relationType: 'found_in',
          notes: 'Inferred from Acorn page text',
          sortOrder: 0,
        },
      ],
      snapshots: [],
    }),
  };

  const actual = await extractMaintEntitiesFromLandingRow(landingRow);
  const sourceRow = actual.rows.find((row) => row.tableName === 'maint_item_sources');
  const biomeRow = actual.rows.find((row) => row.tableName === 'maint_item_biomes');
  assert.ok(sourceRow);
  assert.ok(biomeRow);
  assert.equal(sourceRow.itemInternalName, 'Acorn');
  assert.equal(sourceRow.sourceType, 'shop');
  assert.equal(biomeRow.biomeCode, 'crimson');
  assert.equal(biomeRow.relationType, 'found_in');
});

test('extractMaintEntitiesFromLandingRow expands relation bundle chunk into snapshot rows', async () => {
  const landingRow = {
    id: 61,
    dataset_type: 'item_relations_bundle_raw',
    provider: 'terrapedia.generated',
    source_page: 'item-relations.bundle#snapshots/1',
    source_key: 'generated.item_relations_bundle:chunk:0001',
    source_revision_timestamp: null,
    content_hash: '1'.repeat(64),
    fetched_at: '2026-04-21T21:28:48.044Z',
    parsed_at: '2026-04-21T21:28:48.044Z',
    payload_json: JSON.stringify({
      itemSources: [],
      itemBiomes: [],
      snapshots: [
        {
          entityType: 'item',
          itemInternalName: 'AaronsBreastplate',
          itemName: "Aaron's Breastplate",
          provider: 'wiki_gg',
          sourceKind: 'page',
          sourceLocator: "Aaron's Breastplate",
          sourcePage: "Aaron's Breastplate",
          sourceRevisionTimestamp: '2025-07-23T17:26:26Z',
          payloadJson: "{\"pageTitle\":\"Aaron's Breastplate\"}",
          fetchedAt: '2026-03-28T02:15:05.844Z',
          isCurrent: true,
          parseStatus: 'parsed',
        },
      ],
    }),
  };

  const actual = await extractMaintEntitiesFromLandingRow(landingRow);
  const snapshotRow = actual.rows.find((row) => row.tableName === 'maint_source_snapshots');
  assert.ok(snapshotRow);
  assert.equal(snapshotRow.entityType, 'item');
  assert.equal(snapshotRow.itemInternalName, 'AaronsBreastplate');
  assert.equal(snapshotRow.parseStatus, 'parsed');
});

test('extractMaintEntitiesFromLandingRow expands bosses_raw into boss maint rows', async () => {
  const landingRow = {
    id: 81,
    dataset_type: 'bosses_raw',
    provider: 'terraria.wiki.gg',
    source_page: 'Betsy',
    source_key: 'wiki.page.boss:Betsy',
    source_revision_timestamp: '2026-02-13T16:16:41Z',
    content_hash: '3'.repeat(64),
    fetched_at: '2026-04-21T21:14:46.349Z',
    parsed_at: '2026-04-21T21:14:46.349Z',
    payload_json: JSON.stringify({
      progressionOrder: 21,
      orderWithinGroup: 3,
      groupNameEn: 'Event bosses',
      groupNameZh: '事件 Boss',
      groupType: 'EVENT',
      titleEn: 'Betsy',
      pageTitleEn: 'Betsy',
      status: 'ok',
      pageId: 13003,
      revisionId: 974390,
      revisionTimestamp: '2026-02-13T16:16:41Z',
      titleZh: '双足翼龙',
      pageTitleZh: '双足翼龙',
      sourceUrl: 'https://terraria.wiki.gg/wiki/Betsy',
      sourceUrlZh: 'https://terraria.wiki.gg/zh/wiki/Betsy',
      imageUrl: 'https://terraria.wiki.gg/images/Betsy.gif',
      notes: 'note',
    }),
  };

  const actual = await extractMaintEntitiesFromLandingRow(landingRow);
  assert.equal(actual.scope, 'bosses');
  assert.equal(actual.rows.length, 1);
  assert.equal(actual.rows[0].tableName, 'maint_bosses');
  assert.equal(actual.rows[0].titleEn, 'Betsy');
  assert.equal(actual.rows[0].groupType, 'EVENT');
});

test('extractMaintEntitiesFromLandingRow expands biomes_raw into biome maint rows', async () => {
  const landingRow = {
    id: 82,
    dataset_type: 'biomes_raw',
    provider: 'terraria.wiki.gg',
    source_page: 'Desert',
    source_key: 'wiki.page.biome_detail:desert',
    source_revision_timestamp: '2026-03-05T15:29:17Z',
    content_hash: '4'.repeat(64),
    fetched_at: '2026-03-27T11:05:57.197Z',
    parsed_at: '2026-03-27T11:05:57.197Z',
    payload_json: JSON.stringify({
      requestedPageTitle: 'Desert',
      pageTitle: 'Desert',
      pageId: 4078,
      revisionTimestamp: '2026-03-05T15:29:17Z',
      fetchedAt: '2026-03-27T11:05:57.197Z',
      wikitext: 'wiki text',
      html: '<p>Desert</p>',
      entityType: 'biome',
      biomeCode: 'desert',
    }),
  };

  const actual = await extractMaintEntitiesFromLandingRow(landingRow);
  assert.equal(actual.scope, 'biomes');
  assert.equal(actual.rows.length, 1);
  assert.equal(actual.rows[0].tableName, 'maint_biomes');
  assert.equal(actual.rows[0].biomeCode, 'desert');
});

test('extractMaintEntitiesFromLandingRow expands armor_sets_raw into armor set rows', async () => {
  const landingRow = {
    id: 83,
    dataset_type: 'armor_sets_raw',
    provider: 'terraria.wiki.gg',
    source_page: 'Module:Armorsetbonuses',
    source_key: 'wiki.module.armorsetbonuses',
    source_revision_timestamp: '2026-04-07T02:20:00Z',
    content_hash: '5'.repeat(64),
    fetched_at: '2026-04-07T02:20:00Z',
    parsed_at: '2026-04-07T02:20:00Z',
    payload_json: JSON.stringify({
      terrariaVersion: '1.4.5.6',
      armorSets: [
        {
          benefitExpression: 'ArmorSetBonuses.Benefits.Wood',
          primaryPart: null,
          setCount: 7,
          sets: [[727, 728, 729]],
          textKey: 'ArmorSetBonus.Wood',
          uniqueItemIds: [727, 728, 729],
        },
      ],
    }),
  };

  const actual = await extractMaintEntitiesFromLandingRow(landingRow);
  assert.equal(actual.scope, 'armor_sets');
  assert.equal(actual.rows.length, 1);
  assert.equal(actual.rows[0].tableName, 'maint_armor_sets');
  assert.equal(actual.rows[0].textKey, 'ArmorSetBonus.Wood');
});

test('extractMaintEntitiesFromLandingRow expands categories_raw into category maint rows', async () => {
  const landingRow = {
    id: 84,
    dataset_type: 'categories_raw',
    provider: 'terraria.wiki.gg',
    source_page: 'Template:Master Template Consumables',
    source_key: 'wiki.template.item_categories:Template:Master Template Consumables',
    source_revision_timestamp: '2025-03-27T07:53:44Z',
    content_hash: '6'.repeat(64),
    fetched_at: '2026-04-07T02:17:22.790Z',
    parsed_at: '2026-04-07T02:17:22.790Z',
    payload_json: JSON.stringify({
      topLevel: 'Consumables',
      templateTitle: 'Template:Master Template Consumables',
      sourcePageId: 53962,
      sourceRevisionId: 932898,
      sourceRevisionTimestamp: '2025-03-27T07:53:44Z',
      renderedHtmlLength: 130765,
      sectionCount: 9,
      itemCount: 513,
      sections: [{ title: 'Potions', rowCount: 3 }],
    }),
  };

  const actual = await extractMaintEntitiesFromLandingRow(landingRow);
  assert.equal(actual.scope, 'categories');
  assert.equal(actual.rows.length, 1);
  assert.equal(actual.rows[0].tableName, 'maint_categories');
  assert.equal(actual.rows[0].templateTitle, 'Template:Master Template Consumables');
});

test('extractMaintEntitiesFromLandingRow expands shimmer_raw into shimmer page rows', async () => {
  const landingRow = {
    id: 85,
    dataset_type: 'shimmer_raw',
    provider: 'terraria.wiki.gg/zh',
    source_page: '微光',
    source_key: 'wiki.page.shimmer',
    source_revision_timestamp: '2026-03-09T05:12:48Z',
    content_hash: '7'.repeat(64),
    fetched_at: '2026-04-09T00:34:30.675Z',
    parsed_at: '2026-04-09T00:34:30.675Z',
    payload_json: JSON.stringify({
      entity: 'wiki_shimmer_page',
      generatedAt: '2026-04-09T00:34:30.675Z',
      requestedPageTitle: '微光',
      pageTitle: '微光',
      pageId: 26209,
      revisionId: 249846,
      revisionTimestamp: '2026-03-09T05:12:48Z',
      fetchedAt: '2026-04-09T00:34:30.675Z',
      sections: [{ line: '物品嬗变', number: '1' }],
      wikitext: 'wiki text',
      html: '<p>微光</p>',
    }),
  };

  const actual = await extractMaintEntitiesFromLandingRow(landingRow);
  assert.equal(actual.scope, 'shimmer');
  assert.equal(actual.rows.length, 1);
  assert.equal(actual.rows[0].tableName, 'maint_shimmer_pages');
  assert.equal(actual.rows[0].pageTitle, '微光');
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

test('runMaintSync processes async iterable landing rows incrementally', async () => {
  async function* loadLandingRows() {
    yield {
      id: 31,
      dataset_type: 'item_pages_raw',
      provider: 'terraria.wiki.gg',
      source_page: 'Zenith',
      source_key: 'wiki.page.item_detail:Zenith',
      source_revision_timestamp: '2026-03-16T22:11:59Z',
      content_hash: 'c'.repeat(64),
      fetched_at: '2026-03-28T04:15:57.931Z',
      parsed_at: '2026-03-28T04:15:57.931Z',
      payload_json: JSON.stringify({
        requestedPageTitle: 'Zenith',
        pageTitle: 'Zenith',
        pageId: 4649,
        revisionTimestamp: '2026-03-16T22:11:59Z',
        fetchedAt: '2026-03-28T04:15:57.931Z',
        wikitext: 'wiki text',
        html: '<p>Zenith</p>',
        recipesMarkup: '<table></table>',
        entityType: 'item',
        itemName: 'Zenith',
        itemInternalName: 'Zenith',
      }),
    };
  }

  const summary = await runMaintSync(
    { apply: false, scopes: ['item_pages'] },
    {
      loadLandingRows,
      writeReport: async () => {},
    },
  );

  assert.equal(summary.rows.total, 1);
  assert.equal(summary.rows.byScope.item_pages, 1);
});

test('runMaintSync de-duplicates record_key rows across bundle chunks', async () => {
  async function* loadLandingRows() {
    const payload = JSON.stringify({
      source: 'terraria.wiki.gg:item-page-assembly',
      itemImages: [
        {
          itemInternalName: 'Abeemination',
          itemName: 'Abeemination',
          role: 'icon',
          provider: 'wiki_gg',
          sourceFileTitle: 'Abeemination.png',
          sourcePage: 'Abeemination',
          originalUrl: 'https://terraria.wiki.gg/images/Abeemination.png',
          cachedUrl: 'https://terraria.wiki.gg/images/Abeemination.png',
          width: 32,
          height: 34,
          contentType: 'image/png',
          isPrimary: true,
          sortOrder: 0,
        },
      ],
      recipes: [],
    });
    yield {
      id: 41,
      dataset_type: 'item_relations_bundle_raw',
      provider: 'terrapedia.generated',
      source_page: 'item-relations.bundle#snapshots/1',
      source_key: 'generated.item_relations_bundle:chunk:0001',
      source_revision_timestamp: null,
      content_hash: 'd'.repeat(64),
      fetched_at: '2026-04-21T21:28:48.044Z',
      parsed_at: '2026-04-21T21:28:48.044Z',
      payload_json: payload,
    };
    yield {
      id: 42,
      dataset_type: 'item_relations_bundle_raw',
      provider: 'terrapedia.generated',
      source_page: 'item-relations.bundle#snapshots/2',
      source_key: 'generated.item_relations_bundle:chunk:0002',
      source_revision_timestamp: null,
      content_hash: 'e'.repeat(64),
      fetched_at: '2026-04-21T21:28:48.044Z',
      parsed_at: '2026-04-21T21:28:48.044Z',
      payload_json: payload,
    };
  }

  const summary = await runMaintSync(
    { apply: false, scopes: ['item_images'] },
    {
      loadLandingRows,
      writeReport: async () => {},
    },
  );

  assert.equal(summary.rows.total, 1);
  assert.equal(summary.rows.byScope.item_images, 1);
});

test('runMaintSync filters extracted bundle rows by requested scopes', async () => {
  async function* loadLandingRows() {
    yield {
      id: 71,
      dataset_type: 'item_relations_bundle_raw',
      provider: 'terrapedia.generated',
      source_page: 'item-relations.bundle#snapshots/1',
      source_key: 'generated.item_relations_bundle:chunk:0001',
      source_revision_timestamp: null,
      content_hash: '2'.repeat(64),
      fetched_at: '2026-04-21T21:28:48.044Z',
      parsed_at: '2026-04-21T21:28:48.044Z',
      payload_json: JSON.stringify({
        itemImages: [{ itemInternalName: 'A', itemName: 'A', role: 'icon', provider: 'wiki_gg', sourceFileTitle: 'A.png', sourcePage: 'A' }],
        recipes: [{ resultInternalName: 'B', resultName: 'B', ingredients: [], stations: [] }],
        itemSources: [{ itemInternalName: 'C', itemName: 'C', sourceType: 'shop' }],
        itemBiomes: [{ itemInternalName: 'D', itemName: 'D', biomeCode: 'forest', relationType: 'found_in' }],
        snapshots: [{ entityType: 'item', itemInternalName: 'E', itemName: 'E', provider: 'wiki_gg', sourceKind: 'page', sourceLocator: 'E', sourcePage: 'E' }],
      }),
    };
  }

  const summary = await runMaintSync(
    { apply: false, scopes: ['item_sources', 'item_biomes', 'source_snapshots'] },
    {
      loadLandingRows,
      writeReport: async () => {},
    },
  );

  assert.equal(summary.rows.total, 3);
  assert.equal(summary.rows.byScope.item_sources, 1);
  assert.equal(summary.rows.byScope.item_biomes, 1);
  assert.equal(summary.rows.byScope.source_snapshots, 1);
  assert.equal(summary.rows.byScope.item_images ?? 0, 0);
  assert.equal(summary.rows.byScope.item_recipes ?? 0, 0);
});
