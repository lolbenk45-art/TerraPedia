import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  BOSS_SOURCE_REFRESH_OPERATION_ID,
  buildBossSourceRefreshPlan,
  runBossSourceRefreshOffline,
} from './boss-source-refresh-offline.mjs';

test('builds an offline Boss source-refresh plan bound to the frozen snapshot', () => {
  const plan = buildBossSourceRefreshPlan({
    inputPath: 'data/generated/wiki-bosses.latest.json',
    inputSha256: 'sha256:' + 'a'.repeat(64),
    actualSha256: 'sha256:' + 'a'.repeat(64),
    recordCount: 33,
  });

  assert.equal(BOSS_SOURCE_REFRESH_OPERATION_ID, 'canonical-boss-source-refresh-offline');
  assert.equal(plan.operationId, BOSS_SOURCE_REFRESH_OPERATION_ID);
  assert.equal(plan.networkAccess, false);
  assert.equal(plan.databaseWrites, true);
  assert.deepEqual(plan.datasets, ['bosses_raw']);
  assert.deepEqual(plan.allowList, [
    'local.source_dataset_landings.bosses_raw',
    'maint.maint_bosses',
    'relation.relation_bosses',
    'relation.projection_bosses.name_zh',
  ]);
});

test('rejects a Boss source-refresh plan when the frozen snapshot hash drifts', () => {
  assert.throws(() => buildBossSourceRefreshPlan({
    inputPath: 'data/generated/wiki-bosses.latest.json',
    inputSha256: 'sha256:' + 'a'.repeat(64),
    actualSha256: 'sha256:' + 'b'.repeat(64),
    recordCount: 33,
  }), /snapshot hash drift/i);
});

test('rejects a Boss source-refresh plan with an incomplete snapshot', () => {
  assert.throws(() => buildBossSourceRefreshPlan({
    inputPath: 'data/generated/wiki-bosses.latest.json',
    inputSha256: 'sha256:' + 'a'.repeat(64),
    actualSha256: 'sha256:' + 'a'.repeat(64),
    recordCount: 32,
  }), /33 Boss records/i);
});

test('refreshes local landing and writes only the approved maint/relation Boss fields', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-boss-refresh-'));
  const inputPath = path.join(root, 'bosses.json');
  fs.writeFileSync(inputPath, JSON.stringify({ records: Array.from({ length: 33 }, (_, index) => ({ id: index + 1 })) }));
  const expectedSha256 = `sha256:${(await import('node:crypto')).default.createHash('sha256').update(fs.readFileSync(inputPath)).digest('hex')}`;
  const calls = { landing: [], maint: null, relation: null };
  const result = await runBossSourceRefreshOffline({
    inputPath,
    expectedSha256,
    reportRoot: path.join(root, 'reports'),
    dependencies: {
      runLandingImport: async (options) => {
        calls.landing.push(options);
        return { apply: options.apply };
      },
      runMaintSync: async (options, dependencies) => {
        calls.maint = { options, dependencies };
        return { apply: options.apply };
      },
      runRelationSync: async (options) => {
        calls.relation = options;
        return { apply: options.apply };
      },
      loadLocalLandingRows: async () => [{ dataset_type: 'bosses_raw' }],
    },
  });

  assert.equal(calls.landing.length, 1);
  assert.equal(calls.landing[0].db.database, 'terria_v1_local');
  assert.equal(calls.maint.options.database, 'terria_v1_maint');
  assert.equal(typeof calls.maint.dependencies.loadLandingRows, 'function');
  assert.equal(calls.relation.apply, true);
  assert.equal(result.operationId, BOSS_SOURCE_REFRESH_OPERATION_ID);
});
