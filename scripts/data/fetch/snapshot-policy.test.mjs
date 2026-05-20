import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const timestampSnapshotFetchers = [
  'fetch-wiki-armorsetbonuses.mjs',
  'fetch-wiki-armor-set-images.mjs',
  'fetch-wiki-armor-sets.mjs',
  'fetch-wiki-buffs.mjs',
  'fetch-wiki-item-pages.mjs',
  'fetch-wiki-iteminfo.mjs',
  'fetch-wiki-npcinfo.mjs',
  'fetch-wiki-projectileinfo.mjs'
];

test('timestamp snapshot fetchers all use the shared keep-snapshot option', () => {
  for (const fileName of timestampSnapshotFetchers) {
    const source = fs.readFileSync(path.join(__dirname, fileName), 'utf8');
    assert.match(source, /shouldKeepSnapshot/, `${fileName} should gate timestamp snapshots with shouldKeepSnapshot`);
  }
});
