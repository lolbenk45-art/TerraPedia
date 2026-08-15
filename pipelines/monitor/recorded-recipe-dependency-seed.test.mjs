import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectRecordedRecipeDependencyNames,
  seedRecordedRecipeDependencies,
} from './recorded-recipe-dependency-seed.mjs';

test('recorded Recipe dependency seed derives only required item and station names', () => {
  const dependencies = collectRecordedRecipeDependencyNames({
    records: [{
      pageTitle: '配方/工作台',
      recipeTables: [{
        stations: ['工作台'],
        rows: [{
          resultName: '火把',
          ingredients: [
            { linkedTitles: ['木材'], text: '木材' },
            { linkedTitles: ['任何木材'], text: '任何木材' },
          ],
        }],
      }],
    }],
  });

  assert.deepEqual(dependencies.itemNames, ['木材', '火把']);
  assert.deepEqual(dependencies.stationNames, ['工作台']);
  assert.equal(dependencies.recipeCount, 1);
});

test('recorded Recipe dependency seed copies only the response closure through read-only source access', async () => {
  const sourceCalls = [];
  const targetCalls = [];
  const source = {
    async query(sql, params = []) {
      sourceCalls.push({ sql, params });
      if (/FROM `terria_v1_local`\.`items`/i.test(sql)) {
        return [[
          { id: 1, internal_name: 'Wood', name: 'Wood', name_zh: '木材', deleted: 0 },
          { id: 2, internal_name: 'Torch', name: 'Torch', name_zh: '火把', deleted: 0 },
          { id: 3, internal_name: 'WorkBench', name: 'Work Bench', name_zh: '工作台', deleted: 0 },
        ]];
      }
      if (/FROM `terria_v1_local`\.`crafting_stations`/i.test(sql)) {
        return [[{ id: 7, item_id: 3, internal_name: 'WorkBench', name_en: 'Work Bench', name_zh: '工作台', deleted: 0 }]];
      }
      throw new Error(`unexpected source query: ${sql}`);
    },
    async end() {},
  };
  const target = {
    async query(sql, params = []) {
      targetCalls.push({ sql, params });
      if (/SELECT COUNT\(\*\) AS count/i.test(sql)) return [[{ count: 3 }]];
      return [{}];
    },
    async end() {},
  };
  const result = await seedRecordedRecipeDependencies({
    payload: {
      records: [{ recipeTables: [{ stations: ['工作台'], rows: [{ resultName: '火把', ingredients: [{ linkedTitles: ['木材'] }] }] }] }],
    },
    databases: { local: 'terria_v1_automation_acceptance_abc_0123456789abcdef_local' },
    mysql: { host: '127.0.0.1', port: 13306, readonlyUsername: 'readonly', readonlyPassword: 'readonly-secret', username: 'provisioner', password: 'provisioner-secret' },
    createConnectionImpl: async ({ user, database }) => {
      if (user === 'readonly') {
        assert.equal(database, 'terria_v1_local');
        return source;
      }
      assert.equal(database, 'terria_v1_automation_acceptance_abc_0123456789abcdef_local');
      return target;
    },
  });

  assert.deepEqual(result, { recipeCount: 1, itemDependencies: 2, stationDependencies: 1, copiedItems: 3, copiedStations: 1 });
  assert.equal(sourceCalls.every((call) => call.params.includes('木材') || call.params.includes('火把') || call.params.includes('工作台') || call.params.includes(3)), true);
  assert.equal(sourceCalls.some((call) => /LIMIT\s+\d+/i.test(call.sql)), false);
  assert.equal(targetCalls.filter((call) => /INSERT INTO `terria_v1_automation_acceptance_abc_0123456789abcdef_local`\.`items`/i.test(call.sql)).length, 3);
  assert.equal(targetCalls.filter((call) => /INSERT INTO `terria_v1_automation_acceptance_abc_0123456789abcdef_local`\.`crafting_stations`/i.test(call.sql)).length, 1);
});
