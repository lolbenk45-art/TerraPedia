import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { buildTownNpcFetchArgs, buildTownNpcImageSyncArgs, buildTownNpcImportArgs } from './town-npc-sync-args.mjs';

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

test('buildTownNpcImageSyncArgs defaults to dry-run town NPC maintenance scope', () => {
  assert.deepEqual(
    buildTownNpcImageSyncArgs({}),
    ['--apply=false', '--scopes=town_npc_maintenance']
  );
});

test('buildTownNpcImageSyncArgs uses the same generated maintenance file as fetch/import', () => {
  assert.deepEqual(
    buildTownNpcImageSyncArgs({ output: 'data/generated/town-npc-custom.json' }),
    ['--apply=false', '--scopes=town_npc_maintenance', '--input=data/generated/town-npc-custom.json']
  );
});

test('buildTownNpcImageSyncArgs supports apply mode and custom api base', () => {
  assert.deepEqual(
    buildTownNpcImageSyncArgs({
      apply: 'true',
      input: 'data/generated/town-npc-custom.json',
      apiBase: 'http://127.0.0.1:18088/api',
    }),
    [
      '--apply=true',
      '--scopes=town_npc_maintenance',
      '--input=data/generated/town-npc-custom.json',
      '--apiBase=http://127.0.0.1:18088/api',
    ]
  );
});

test('town NPC pipeline runs image sync between fetch and import', () => {
  const script = fs.readFileSync(new URL('./run-town-npc-sync-pipeline.mjs', import.meta.url), 'utf8');
  const fetchIndex = script.indexOf("'town npc fetch'");
  const imageIndex = script.indexOf("'town npc image sync'");
  const importIndex = script.indexOf("'town npc import'");

  assert.ok(fetchIndex >= 0, 'fetch step is present');
  assert.ok(imageIndex > fetchIndex, 'image sync runs after fetch');
  assert.ok(importIndex > imageIndex, 'import runs after image sync');
  assert.match(script, /run-image-sync\.mjs/);
  assert.match(script, /buildTownNpcImageSyncArgs/);
});

test('town NPC pipeline uses one maintenance data path for fetch, image sync and import', () => {
  const script = fs.readFileSync(new URL('./run-town-npc-sync-pipeline.mjs', import.meta.url), 'utf8');

  assert.match(script, /const maintenanceDataPath = options\.output \?\? options\.input/);
  assert.match(script, /output: maintenanceDataPath/);
  assert.match(script, /input: maintenanceDataPath/);
  assert.doesNotMatch(script, /input: options\.output/);
});
