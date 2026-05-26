import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  classifyTownNpcShopItemDisposition,
  findItem,
  importTownNpcRecord,
  prepareTownNpcShopConditionContext,
  runImportWikiTownNpcsToDb,
} from './import-wiki-town-npcs-to-db.mjs';
import { buildTownNpcShopConditionLookup } from '../lib/town-npc-shop-conditions.mjs';

function createShopImportFixture({ shopItems }) {
  const statements = [];
  const connection = {
    async execute(sql, params = []) {
      statements.push({ sql, params });
      if (/SELECT id\s+FROM npc_shop_entries/i.test(sql)) return [[]];
      if (/INSERT INTO npc_shop_entries/i.test(sql)) return [{ insertId: 501 }];
      return [{ affectedRows: 1 }];
    }
  };
  const npc = {
    id: 17,
    gameId: 17,
    internalName: 'Merchant',
    gamePeriodId: null,
    behaviorNotes: null,
  };
  const items = [
    { id: 28, internalName: 'LesserHealingPotion', name: 'Lesser Healing Potion', nameZh: '弱效治疗药水' },
    { id: 188, internalName: 'HealingPotion', name: 'Healing Potion', nameZh: '治疗药水' },
  ];
  const itemLookup = {
    byAny: new Map(items.flatMap((item) => [
      [item.internalName.toLowerCase(), item],
      [item.name.toLowerCase(), item],
      [item.nameZh.toLowerCase(), item],
    ])),
  };

  return {
    connection,
    statements,
    record: {
      gameId: 17,
      internalName: 'Merchant',
      pageTitle: 'Merchant',
      shopItems,
    },
    context: {
      apply: true,
      npcLookup: {
        byGameId: new Map([[17, npc]]),
        byInternalName: new Map([['merchant', npc]]),
      },
      itemLookup,
      npcTargetLookup: {
        byAny: new Map([
          ['angler', { id: 369, internalName: 'Angler', name: 'Angler', nameZh: '渔夫' }],
        ]),
      },
      shopConditionLookup: buildTownNpcShopConditionLookup({
        gamePeriods: [
          { id: 2, code: 'hardmode', nameZh: '困难模式', nameEn: 'Hardmode' },
        ],
      }),
      replaceWhenNoMatchedShopEntries: false,
    },
  };
}

function createProfileImportFixture({ record }) {
  const base = createShopImportFixture({ shopItems: record.shopItems ?? [] });
  return {
    ...base,
    record: {
      gameId: 17,
      internalName: 'Merchant',
      pageTitle: 'Merchant',
      ...record,
    },
  };
}

test('prepareTownNpcShopConditionContext starts a transaction before mutating support terms in apply mode', async () => {
  const calls = [];
  const connection = {
    async beginTransaction() {
      calls.push('beginTransaction');
    }
  };

  const actual = await prepareTownNpcShopConditionContext(connection, true, {
    ensureWorldContexts: async (_connection, shouldApply) => {
      calls.push(`ensure:${shouldApply}`);
      return 3;
    },
    ensureConditionTerms: async (_connection, shouldApply) => {
      calls.push(`ensureTerms:${shouldApply}`);
      return 7;
    },
    loadShopConditionLookup: async () => {
      calls.push('load');
      return { loaded: true };
    }
  });

  assert.deepEqual(calls, ['beginTransaction', 'ensure:true', 'ensureTerms:true', 'load']);
  assert.equal(actual.createdWorldContextCount, 3);
  assert.equal(actual.createdConditionTermCount, 7);
  assert.deepEqual(actual.shopConditionLookup, { loaded: true });
});

test('importTownNpcRecord writes matched shop price and availability notes', async () => {
  const fixture = createShopImportFixture({
    shopItems: [
      {
        nameZh: '弱效治疗药水',
        nameEn: 'Lesser Healing Potion',
        priceText: '3 SC',
        availability: '一直有售。',
      },
    ],
  });

  const result = await importTownNpcRecord(fixture.connection, fixture.record, fixture.context);
  const insertShopEntry = fixture.statements.find((entry) => /INSERT INTO npc_shop_entries/i.test(entry.sql));

  assert.equal(result.insertedShopEntryCount, 1);
  assert.match(insertShopEntry.sql, /INSERT INTO npc_shop_entries/);
  assert.deepEqual(insertShopEntry.params.slice(3, 5), ['3 SC', '一直有售。']);
});

test('importTownNpcRecord writes parsed shop conditions with readable notes fallback', async () => {
  const fixture = createShopImportFixture({
    shopItems: [
      {
        nameZh: '治疗药水',
        nameEn: 'Healing Potion',
        priceText: '10 SC',
        availability: '在 困难模式 中。',
      },
    ],
  });

  const result = await importTownNpcRecord(fixture.connection, fixture.record, fixture.context);
  const conditionInsert = fixture.statements.find((entry) => /INSERT INTO npc_shop_conditions/i.test(entry.sql));

  assert.equal(result.insertedShopConditionCount, 1);
  assert.equal(conditionInsert.params[1], 'GAME_PERIOD');
  assert.equal(conditionInsert.params[3], 'required');
  assert.match(JSON.stringify(conditionInsert.params), /HARDMODE|困难模式/i);
  assert.match(String(conditionInsert.params[4]), /困难模式|Hardmode|HARDMODE/i);
});

test('importTownNpcRecord writes managed wiki assets and living preferences before shop replacement', async () => {
  const fixture = createProfileImportFixture({
    record: {
      wikiDetails: {
        spriteImage: 'http://localhost:9000/terrapedia-images/npcs/merchant.png',
        mapIconImage: 'http://localhost:9000/terrapedia-images/npcs/merchant-map.png',
        dialogPortraitImage: 'http://localhost:9000/terrapedia-images/npcs/merchant-dialog-portrait.png',
      },
      livingPreferences: [
        { targetType: 'biome', preference: 'like', targetName: 'Forest', targetNameZh: '森林' },
        { targetType: 'npc', preference: 'hate', targetName: 'Angler', targetNameZh: '渔夫' },
      ],
      shopItems: [],
    },
  });

  const result = await importTownNpcRecord(fixture.connection, fixture.record, fixture.context);
  const updateNpc = fixture.statements.find((entry) => /UPDATE npcs/i.test(entry.sql) && /wiki_assets_json/i.test(entry.sql));

  assert.equal(result.updatedWikiAssets, true);
  assert.equal(result.updatedLivingPreferences, true);
  assert.equal(result.shopReplaceSkipped, true);
  assert.match(updateNpc.sql, /wiki_assets_json/);
  assert.match(updateNpc.sql, /living_preferences_json/);
  assert.match(updateNpc.params.find((value) => String(value).includes('dialogPortraitImage')), /terrapedia-images\/npcs\/merchant-dialog-portrait\.png/);
  assert.match(updateNpc.params.find((value) => String(value).includes('targetType')), /Angler|渔夫/);
});

test('importTownNpcRecord rejects raw wiki asset urls in summary and skips storing them', async () => {
  const fixture = createProfileImportFixture({
    record: {
      wikiDetails: {
        spriteImage: 'http://terraria.wiki.gg/images/Merchant.png',
        mapIconImage: '//terraria.wiki.gg/images/Merchant_Map_Icon.png',
        dialogPortraitImage: 'https://static.TERRARIA.WIKI.GG/images/thumb/Merchant_%28portrait%29.png/70px-Merchant_%28portrait%29.png',
      },
      shopItems: [],
    },
  });

  const result = await importTownNpcRecord(fixture.connection, fixture.record, fixture.context);
  const updateNpc = fixture.statements.find((entry) => /UPDATE npcs/i.test(entry.sql) && /wiki_assets_json/i.test(entry.sql));

  assert.equal(result.rawWikiAssetUrlCount, 3);
  assert.equal(updateNpc, undefined);
});

test('runImportWikiTownNpcsToDb apply rejects unlocalized raw wiki assets before commit', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-town-npc-import-raw-assets-'));
  const inputPath = path.join(tempDir, 'town-npcs.json');
  fs.writeFileSync(
    inputPath,
    JSON.stringify({
      records: [
        {
          gameId: 17,
          internalName: 'Merchant',
          wikiDetails: {
            dialogPortraitImage: 'https://terraria.wiki.gg/images/thumb/Merchant.png/70px-Merchant.png',
          },
          shopItems: [],
        },
      ],
    }),
    'utf8',
  );

  const connection = {
    committed: false,
    rolledBack: false,
    async query(sql) {
      if (/SET NAMES/i.test(sql)) return [];
      if (/FROM npcs\s+WHERE COALESCE\(is_town_npc/i.test(sql)) {
        return [[{
          id: 17,
          gameId: 17,
          internalName: 'Merchant',
          gamePeriodId: null,
          behaviorNotes: null,
          wikiAssetsJson: null,
          livingPreferencesJson: null,
        }]];
      }
      if (/FROM items\s+WHERE deleted = 0/i.test(sql)) return [[]];
      if (/FROM biomes/i.test(sql)) return [[]];
      if (/FROM game_period/i.test(sql)) return [[]];
      if (/FROM world_contexts/i.test(sql)) return [[]];
      if (/FROM condition_terms/i.test(sql)) return [[]];
      return [[]];
    },
    async execute(sql) {
      if (/SELECT id\s+FROM npc_shop_entries/i.test(sql)) return [[]];
      return [{ affectedRows: 1 }];
    },
    async beginTransaction() {},
    async commit() {
      this.committed = true;
    },
    async rollback() {
      this.rolledBack = true;
    },
    async end() {},
  };

  await assert.rejects(
    () => runImportWikiTownNpcsToDb(
      [
        '--apply=true',
        `--input=${inputPath}`,
        '--database=terria_v1_local',
        `--output=${path.join(tempDir, 'latest.json')}`,
        `--snapshot-output=${path.join(tempDir, 'snapshot.json')}`,
      ],
      { createConnection: async () => connection },
    ),
    /raw wiki asset URLs/,
  );
  assert.equal(connection.committed, false);
  assert.equal(connection.rolledBack, true);
});

test('runImportWikiTownNpcsToDb resolves living preference NPC targets by display name', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-town-npc-import-pref-target-'));
  const inputPath = path.join(tempDir, 'town-npcs.json');
  fs.writeFileSync(
    inputPath,
    JSON.stringify({
      records: [
        {
          gameId: 17,
          internalName: 'Merchant',
          livingPreferences: [
            { targetType: 'npc', preference: 'like', targetName: 'Goblin Tinkerer', targetNameZh: '哥布林工匠' },
          ],
          shopItems: [],
        },
      ],
    }),
    'utf8',
  );
  const statements = [];
  const connection = {
    async query(sql) {
      if (/SET NAMES/i.test(sql)) return [];
      if (/FROM npcs\s+WHERE COALESCE\(is_town_npc/i.test(sql)) {
        return [[
          {
            id: 17,
            gameId: 17,
            internalName: 'Merchant',
            name: 'Merchant',
            nameZh: '商人',
            gamePeriodId: null,
            behaviorNotes: null,
            wikiAssetsJson: null,
            livingPreferencesJson: null,
          },
          {
            id: 107,
            gameId: 107,
            internalName: 'GoblinTinkerer',
            name: 'Goblin Tinkerer',
            nameZh: '哥布林工匠',
            gamePeriodId: null,
            behaviorNotes: null,
            wikiAssetsJson: null,
            livingPreferencesJson: null,
          },
        ]];
      }
      if (/FROM items\s+WHERE deleted = 0/i.test(sql)) return [[]];
      if (/FROM biomes/i.test(sql)) return [[]];
      if (/FROM game_period/i.test(sql)) return [[]];
      if (/FROM world_contexts/i.test(sql)) return [[]];
      if (/FROM condition_terms/i.test(sql)) return [[]];
      return [[]];
    },
    async execute(sql, params = []) {
      statements.push({ sql, params });
      if (/SELECT id\s+FROM npc_shop_entries/i.test(sql)) return [[]];
      return [{ affectedRows: 1 }];
    },
    async end() {},
  };

  const summary = await runImportWikiTownNpcsToDb(
    [
      '--apply=false',
      `--input=${inputPath}`,
      '--database=terria_v1_local',
      `--output=${path.join(tempDir, 'latest.json')}`,
      `--snapshot-output=${path.join(tempDir, 'snapshot.json')}`,
    ],
    { createConnection: async () => connection },
  );

  assert.equal(summary.npcResults[0].updatedLivingPreferences, true);
  assert.match(
    summary.npcResults[0].livingPreferencesPreview,
    /"targetId":107/,
  );
});

test('prepareTownNpcShopConditionContext skips transactions in dry-run mode', async () => {
  const calls = [];
  const connection = {
    async beginTransaction() {
      calls.push('beginTransaction');
    }
  };

  const actual = await prepareTownNpcShopConditionContext(connection, false, {
    ensureWorldContexts: async (_connection, shouldApply) => {
      calls.push(`ensure:${shouldApply}`);
      return 0;
    },
    ensureConditionTerms: async (_connection, shouldApply) => {
      calls.push(`ensureTerms:${shouldApply}`);
      return 7;
    },
    loadShopConditionLookup: async () => {
      calls.push('load');
      return { loaded: true };
    }
  });

  assert.deepEqual(calls, ['ensure:false', 'ensureTerms:false', 'load']);
  assert.equal(actual.createdWorldContextCount, 0);
  assert.equal(actual.createdConditionTermCount, 7);
  assert.deepEqual(actual.shopConditionLookup, { loaded: true });
});

test('findItem falls back to canonical item name after stripping trailing qualifiers', () => {
  const matchedItem = {
    id: 6124,
    internalName: 'PrincessDress',
    name: 'Princess Dress',
    nameZh: '公主裙',
  };
  const itemLookup = {
    byAny: new Map([
      ['公主裙', matchedItem],
    ]),
  };

  const actual = findItem(itemLookup, {
    nameZh: '公主裙（服装商）',
    nameEn: '公主裙（服装商）',
  });

  assert.deepEqual(actual, matchedItem);
});

test('findItem resolves known town npc shop legacy rename aliases', () => {
  const matchedItem = {
    id: 1586,
    internalName: 'CenxsWings',
    name: "Cenx's Wings",
    nameZh: 'Cenx的翅膀',
  };
  const itemLookup = {
    byAny: new Map([
      ["cenx's wings", matchedItem],
      ['cenx的翅膀', matchedItem],
    ]),
  };

  const actual = findItem(itemLookup, {
    nameZh: '闪耀翅膀',
    nameEn: '闪耀翅膀',
  });

  assert.deepEqual(actual, matchedItem);
});

test('classifyTownNpcShopItemDisposition marks verified legacy-only shop items as excluded', () => {
  const actual = classifyTownNpcShopItemDisposition({
    nameZh: '节日大礼帽',
    nameEn: '节日大礼帽',
  });

  assert.deepEqual(actual, {
    kind: 'ignored_legacy_only',
    canonicalName: null,
    reason: 'legacy_only_shop_item',
  });
});

test('classifyTownNpcShopItemDisposition marks generic choice placeholders as deferred placeholders', () => {
  const samples = [
    '任何晶塔',
    '堆石器',
    '逻辑门',
    '传送带',
  ];

  for (const sample of samples) {
    assert.deepEqual(
      classifyTownNpcShopItemDisposition({ nameZh: sample, nameEn: sample }),
      {
        kind: 'generic_choice_placeholder',
        canonicalName: null,
        reason: 'generic_choice_placeholder',
      },
      sample,
    );
  }
});

test('classifyTownNpcShopItemDisposition marks clothier variant-exclusive vanity items as excluded', () => {
  const samples = [
    '老手杖',
    'George的帽子',
    'George的西装上衣',
    'George的裤子',
    '绝妙丝带',
    '多乐头部',
    '粉白美头部',
    '希炼衣',
  ];

  for (const sample of samples) {
    assert.deepEqual(
      classifyTownNpcShopItemDisposition({ nameZh: sample, nameEn: sample }),
      {
        kind: 'ignored_legacy_only',
        canonicalName: null,
        reason: 'legacy_only_shop_item',
      },
      sample,
    );
  }
});
