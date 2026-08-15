import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLocalizationArgs,
  buildImageSyncArgs,
  buildCategorySyncArgs
} from './support-sync-args.mjs';

test('buildLocalizationArgs defaults to mature scopes in dry-run mode', () => {
  assert.deepEqual(
    buildLocalizationArgs({}),
    ['--apply=false', '--scopes=items,npcs,projectiles,buffs']
  );
});

test('buildImageSyncArgs supports apply mode and custom api base', () => {
  assert.deepEqual(
    buildImageSyncArgs({ apply: 'true', apiBase: 'http://127.0.0.1:18088/api' }),
    ['--apply=true', '--scopes=items,npcs,projectiles,buffs', '--apiBase=http://127.0.0.1:18088/api']
  );
});

test('buildCategorySyncArgs defaults to dry-run mode', () => {
  assert.deepEqual(
    buildCategorySyncArgs({}),
    ['--apply=false']
  );
});
