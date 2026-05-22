import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyTownNpcShopItemDisposition,
  findItem,
  prepareTownNpcShopConditionContext,
} from './import-wiki-town-npcs-to-db.mjs';

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
