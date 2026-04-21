import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTownNpcFetchArgs, buildTownNpcImportArgs } from './town-npc-sync-args.mjs';

test('buildTownNpcFetchArgs maps output, source, limit and delay options', () => {
  assert.deepEqual(
    buildTownNpcFetchArgs({
      output: 'data/generated/town-npc.json',
      source: 'data/generated/npc-map.json',
      limit: '2',
      'delay-ms': '0'
    }),
    [
      '--output=data/generated/town-npc.json',
      '--source=data/generated/npc-map.json',
      '--limit=2',
      '--delay-ms=0'
    ]
  );
});

test('buildTownNpcImportArgs defaults to dry-run mode', () => {
  assert.deepEqual(
    buildTownNpcImportArgs({ input: 'data/generated/town-npc.json' }),
    [
      '--input=data/generated/town-npc.json',
      '--apply=false'
    ]
  );
});

test('buildTownNpcImportArgs allows apply mode', () => {
  assert.deepEqual(
    buildTownNpcImportArgs({ input: 'data/generated/town-npc.json', apply: 'true' }),
    [
      '--input=data/generated/town-npc.json',
      '--apply=true'
    ]
  );
});
