import test from 'node:test';
import assert from 'node:assert/strict';

import { prepareTownNpcShopConditionContext } from './import-wiki-town-npcs-to-db.mjs';

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
