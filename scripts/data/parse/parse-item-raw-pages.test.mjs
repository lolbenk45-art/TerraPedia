import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildItemRawPageParseProgressPayload,
  parseItemRawPagePayload,
  runItemRawPagesParse
} from './parse-item-raw-pages.mjs';

const fixtureDir = path.join(import.meta.dirname, 'fixtures', 'item-pages');

test('parseItemRawPagePayload keys records by itemInternalName and extracts safe item page evidence', () => {
  const payload = readFixture('demonbow.latest.json');
  const record = parseItemRawPagePayload(payload, 'demonbow.latest.json');

  assert.equal(record.itemInternalName, 'DemonBow');
  assert.equal(record.itemName, 'Demon Bow');
  assert.equal(record.requestedPageTitle, 'Demon Bow');
  assert.equal(record.pageTitle, 'Demon Bow');
  assert.equal(record.isGroupPage, false);
  assert.equal(record.hasHtml, true);
  assert.equal(record.hasWikitext, true);
  assert.equal(record.recipesMarkupLength, 0);
  assert.equal(record.recipeStatus, 'empty_markup');
  assert.ok(Array.isArray(record.images));
  assert.ok(record.images.length > 0);
  assert.equal(record.evidence.sourceProvider, 'terraria.wiki.gg');
});

test('parseItemRawPagePayload marks redirected group pages and does not trust intro description', () => {
  const payload = readFixture('workbench.latest.json');
  const record = parseItemRawPagePayload(payload, 'workbench.latest.json');

  assert.equal(record.itemInternalName, 'WorkBench');
  assert.equal(record.requestedPageTitle, 'Work Bench');
  assert.equal(record.pageTitle, 'Work Benches');
  assert.equal(record.isGroupPage, true);
  assert.equal(record.safeDescription, null);
  assert.deepEqual(record.images, []);
  assert.deepEqual(record.sell, { sellText: null, sellValue: null });
  assert.ok(record.groupPageEvidence);
  assert.ok(record.safetyWarnings.includes('page_title_differs_from_requested_title'));
});

test('parseItemRawPagePayload quarantines group page image and sell evidence', () => {
  const payload = readFixture('adamantiteleggings.latest.json');
  const record = parseItemRawPagePayload(payload, 'adamantiteleggings.latest.json');

  assert.equal(record.itemInternalName, 'AdamantiteLeggings');
  assert.equal(record.pageTitle, 'Adamantite armor');
  assert.equal(record.isGroupPage, true);
  assert.deepEqual(record.images, []);
  assert.deepEqual(record.sell, { sellText: null, sellValue: null });
  assert.ok(record.groupPageEvidence.images.length > 0);
  assert.ok(record.groupPageEvidence.sell.sellText);
  assert.equal(record.groupPageEvidence.memberImageEvidence.summary.status, 'verified');
  assert.equal(record.groupPageEvidence.memberImageEvidence.summary.candidateCount, 1);
  assert.equal(
    record.groupPageEvidence.memberImageEvidence.candidates[0].fileTitle,
    'Adamantite Leggings.png'
  );
  assert.ok(record.safetyWarnings.includes('group_page_images_quarantined'));
  assert.ok(record.safetyWarnings.includes('group_page_sell_quarantined'));
});

test('buildItemRawPageParseProgressPayload writes monitor-visible batch progress fields', () => {
  const payload = buildItemRawPageParseProgressPayload({
    status: 'running',
    phase: 'parse',
    message: 'parsed item raw pages 2/3',
    current: 2,
    total: 3,
    batchOffset: 0,
    batchLimit: 3,
    overallCurrent: 2,
    overallTotal: 6131,
    progressPath: 'data/generated/wiki-sync-progress.latest.json',
    reportPath: 'reports/item-raw-pages-parse-test.json',
    outputPath: 'data/generated/item-raw-pages-parsed.latest.json',
    startedAt: '2026-06-04T00:00:00.000Z',
    now: '2026-06-04T00:00:02.000Z'
  });

  assert.equal(payload.actionId, 'item-raw-pages-parse');
  assert.equal(payload.status, 'running');
  assert.equal(payload.phase, 'parse');
  assert.equal(payload.childStatusPath, 'data/generated/wiki-sync-progress.latest.json');
  assert.equal(payload.current, 2);
  assert.equal(payload.total, 3);
  assert.equal(payload.batchOffset, 0);
  assert.equal(payload.batchLimit, 3);
  assert.equal(payload.overallCurrent, 2);
  assert.equal(payload.overallTotal, 6131);
  assert.equal(payload.percent, (2 / 6131) * 100);
  assert.equal(payload.dataStage, 'raw/wiki/item-pages -> data/generated/item-raw-pages-parsed.latest.json');
  assert.equal(payload.nextStep, 'continue parsing local raw item pages');
  assert.equal(payload.lastHeartbeatAt, '2026-06-04T00:00:02.000Z');
});

test('runItemRawPagesParse writes output, report, and completed progress without network', async () => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tp-item-raw-parse-'));
  const outputPath = path.join(tempDir, 'item-raw-pages-parsed.latest.json');
  const reportPath = path.join(tempDir, 'item-raw-pages-parse-report.json');
  const progressPath = path.join(tempDir, 'wiki-sync-progress.latest.json');

  const summary = await runItemRawPagesParse({
    rawDir: fixtureDir,
    output: outputPath,
    report: reportPath,
    progressPath,
    batchSize: 2
  });

  assert.equal(summary.totalRawPages, 3);
  assert.equal(summary.parsedCount, 3);
  assert.equal(summary.errorCount, 0);
  assert.equal(summary.emptyRecipesMarkupCount, 3);
  assert.equal(summary.groupPageCount, 2);

  const output = JSON.parse(await fs.promises.readFile(outputPath, 'utf8'));
  assert.equal(output.records.length, 3);
  assert.equal(output.summary.parsedCount, 3);

  const report = JSON.parse(await fs.promises.readFile(reportPath, 'utf8'));
  assert.equal(report.summary.errorCount, 0);

  const progress = JSON.parse(await fs.promises.readFile(progressPath, 'utf8'));
  assert.equal(progress.actionId, 'item-raw-pages-parse');
  assert.equal(progress.status, 'completed');
  assert.equal(progress.current, 3);
  assert.equal(progress.total, 3);
});

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixtureDir, name), 'utf8'));
}
