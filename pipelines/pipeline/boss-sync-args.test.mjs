import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBossFetchArgs, buildBossImportArgs, buildBossLootArgs } from './boss-sync-args.mjs';

test('buildBossFetchArgs maps output json and report options', () => {
  assert.deepEqual(
    buildBossFetchArgs({
      outputJson: 'data/generated/wiki-bosses.latest.json',
      reportJson: 'reports/wiki-bosses-fetch.json'
    }),
    [
      '--output-json=data/generated/wiki-bosses.latest.json',
      '--report-json=reports/wiki-bosses-fetch.json'
    ]
  );
});

test('buildBossImportArgs defaults to dry-run mode', () => {
  assert.deepEqual(
    buildBossImportArgs({ input: 'data/generated/wiki-bosses.latest.json' }),
    [
      '--input=data/generated/wiki-bosses.latest.json',
      '--dry-run=true'
    ]
  );
});

test('buildBossLootArgs defaults to dry-run and supports apply mode', () => {
  assert.deepEqual(buildBossLootArgs({}), ['--dry-run=true']);
  assert.deepEqual(buildBossLootArgs({ apply: 'true' }), []);
});
