import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DEFAULT_OUTPUT,
  DEFAULT_RAW_DIR,
  DEFAULT_SOURCE_DATA_DIR,
  DEFAULT_VIEW_DIR,
  buildItemPageMetadataPayload,
  runItemPageMetadataRefresh
} from './refresh-item-page-standardized-metadata.mjs';
import { resolveProjectConstantPath, resolveSharedDataConstantPath } from '../../scripts/lib/project-constants.mjs';

const fixtureDir = path.join(import.meta.dirname, 'fixtures', 'item-pages');

test('default item-page metadata paths come from project constants', () => {
  assert.equal(DEFAULT_RAW_DIR, resolveSharedDataConstantPath('crawler.itemPageRawRoot'));
  assert.equal(DEFAULT_OUTPUT, resolveProjectConstantPath('dataLayers.standardized', { suffix: ['item_pages.standardized.json'] }));
  assert.equal(DEFAULT_VIEW_DIR, resolveProjectConstantPath('dataLayers.standardizedView', { suffix: ['item_pages'] }));
  assert.match(DEFAULT_SOURCE_DATA_DIR, /data[\\/]terraPedia$/);
});

test('buildItemPageMetadataPayload writes metadata records without raw body fields', async () => {
  const payload = await buildItemPageMetadataPayload({
    rawDir: fixtureDir,
    sourceDataDir: '/home/lolben/data/terraPedia'
  });

  assert.equal(payload.entity, 'item_pages');
  assert.equal(payload.totalRecords, 3);
  assert.equal(payload.records[0].hasHtml, true);
  assert.equal(payload.records[0].hasWikitext, true);
  assert.equal(payload.records[0].hasRecipesMarkup, true);
  assert.equal(payload.records[0].html, undefined);
  assert.equal(payload.records[0].wikitext, undefined);
  assert.equal(payload.records[0].recipesMarkup, undefined);
});

test('runItemPageMetadataRefresh writes output and sharded standardized-view parts', async () => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tp-item-page-meta-'));
  const output = path.join(tempDir, 'data', 'standardized', 'item_pages.standardized.json');
  const viewDir = path.join(tempDir, 'data', 'standardized-view', 'item_pages');

  const summary = await runItemPageMetadataRefresh({
    rawDir: fixtureDir,
    output,
    viewDir,
    partSize: 2,
    sourceDataDir: '/home/lolben/data/terraPedia'
  });

  assert.equal(summary.totalRecords, 3);
  assert.equal(summary.partCount, 2);
  const written = JSON.parse(await fs.promises.readFile(output, 'utf8'));
  assert.equal(written.totalRecords, 3);
  assert.equal(fs.existsSync(path.join(viewDir, 'part-0001.json')), true);
  assert.equal(fs.existsSync(path.join(viewDir, 'part-0002.json')), true);
});
