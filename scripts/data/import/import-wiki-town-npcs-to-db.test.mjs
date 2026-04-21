import test from 'node:test';
import assert from 'node:assert/strict';

import { findItem, prepareTownNpcShopConditionContext } from './import-wiki-town-npcs-to-db.mjs';

test('prepareTownNpcShopConditionContext starts a transaction before mutating world contexts in apply mode', async () => {
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
    loadShopConditionLookup: async () => {
      calls.push('load');
      return { loaded: true };
    }
  });

  assert.deepEqual(calls, ['beginTransaction', 'ensure:true', 'load']);
  assert.equal(actual.createdWorldContextCount, 3);
  assert.deepEqual(actual.shopConditionLookup, { loaded: true });
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
    loadShopConditionLookup: async () => {
      calls.push('load');
      return { loaded: true };
    }
  });

  assert.deepEqual(calls, ['ensure:false', 'load']);
  assert.equal(actual.createdWorldContextCount, 0);
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
