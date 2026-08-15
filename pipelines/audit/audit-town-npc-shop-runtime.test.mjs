import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTownNpcShopRuntimeQueries,
  buildTownNpcShopRuntimeReport,
  runTownNpcShopRuntimeAudit,
} from './audit-town-npc-shop-runtime.mjs';

test('buildTownNpcShopRuntimeQueries emits SELECT-only runtime checks', () => {
  const queries = buildTownNpcShopRuntimeQueries({ database: 'terria_v1_local' });

  assert.ok(queries.length >= 8);
  assert.ok(queries.every((query) => query.sql.trimStart().toUpperCase().startsWith('SELECT')));
  assert.ok(queries.every((query) => !/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|REPLACE)\b/i.test(query.sql)));

  const byId = new Map(queries.map((query) => [query.id, query.sql]));
  assert.match(byId.get('town_npc_count'), /FROM `terria_v1_local`\.`npcs`/);
  assert.match(byId.get('merchant_price_missing_count'), /internal_name = 'Merchant'/);
  assert.match(byId.get('unreadable_shop_condition_count'), /LEFT JOIN `terria_v1_local`\.`world_contexts`/);
});

test('runTownNpcShopRuntimeAudit reports current broken baseline as fail', async () => {
  const counts = new Map([
    ['town_npc_count', 39],
    ['shop_entry_count', 938],
    ['shop_entries_with_price_count', 5],
    ['shop_condition_count', 0],
    ['merchant_shop_entry_count', 31],
    ['merchant_price_missing_count', 31],
    ['town_npc_missing_price_count', 31],
    ['unreadable_shop_condition_count', 0],
  ]);

  const report = await runTownNpcShopRuntimeAudit(
    { database: 'terria_v1_local', generatedAt: '2026-05-26T00:00:00.000Z' },
    {
      query: async (definition) => [{ total: counts.get(definition.id) ?? 0 }],
    },
  );

  assert.deepEqual(report.summary, {
    townNpcCount: 39,
    shopEntryCount: 938,
    shopEntriesWithPriceCount: 5,
    shopConditionCount: 0,
    merchantShopEntryCount: 31,
    merchantPriceMissingCount: 31,
  });
  assert.equal(report.status, 'fail');
  assert.deepEqual(
    report.failures.map((failure) => failure.id),
    ['town_npc_missing_price', 'town_npc_shop_conditions_missing'],
  );
});

test('buildTownNpcShopRuntimeReport fails unreadable condition labels even when counts look populated', () => {
  const report = buildTownNpcShopRuntimeReport({
    generatedAt: '2026-05-26T00:00:00.000Z',
    database: 'terria_v1_local',
    totals: {
      town_npc_count: 39,
      shop_entry_count: 938,
      shop_entries_with_price_count: 938,
      shop_condition_count: 25,
      merchant_shop_entry_count: 31,
      merchant_price_missing_count: 0,
      town_npc_missing_price_count: 0,
      unreadable_shop_condition_count: 2,
    },
  });

  assert.equal(report.status, 'fail');
  assert.deepEqual(report.failures, [
    {
      id: 'town_npc_shop_condition_unreadable',
      message: '2 town NPC shop condition rows have no joined label and no notes fallback.',
      count: 2,
    },
  ]);
});

test('buildTownNpcShopRuntimeReport passes when price and condition closure are present', () => {
  const report = buildTownNpcShopRuntimeReport({
    generatedAt: '2026-05-26T00:00:00.000Z',
    database: 'terria_v1_local',
    totals: {
      town_npc_count: 39,
      shop_entry_count: 938,
      shop_entries_with_price_count: 938,
      shop_condition_count: 25,
      merchant_shop_entry_count: 31,
      merchant_price_missing_count: 0,
      town_npc_missing_price_count: 0,
      unreadable_shop_condition_count: 0,
    },
  });

  assert.equal(report.status, 'pass');
  assert.deepEqual(report.failures, []);
});
