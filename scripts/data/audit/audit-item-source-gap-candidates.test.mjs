import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  auditItemSourceGapCandidates,
  parseAuditItemSourceGapCandidatesArgs
} from './audit-item-source-gap-candidates.mjs';

test('parseAuditItemSourceGapCandidatesArgs rejects mutation flags', () => {
  for (const flag of ['--apply', '--apply=true', '--write-db', '--sync']) {
    assert.throws(
      () => parseAuditItemSourceGapCandidatesArgs([flag]),
      /read-only audit refuses mutation flag/
    );
  }
});

test('auditItemSourceGapCandidates reports MagicMirror as high confidence when raw has sources and standardized view has none', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'item-source-gap-audit-'));
  const rawDir = path.join(root, 'raw');
  const sourcesDir = path.join(root, 'itemSources');
  const itemsPath = path.join(root, 'items.standardized.json');
  fs.mkdirSync(rawDir, { recursive: true });
  fs.mkdirSync(sourcesDir, { recursive: true });

  fs.writeFileSync(itemsPath, JSON.stringify({
    items: [{ id: 50, internalName: 'MagicMirror', name: 'Magic Mirror' }]
  }));
  fs.writeFileSync(path.join(sourcesDir, 'itemSources.part-0001.json'), JSON.stringify({ itemSources: [] }));
  fs.writeFileSync(path.join(rawDir, 'magicmirror.latest.json'), JSON.stringify({
    itemInternalName: 'MagicMirror',
    itemName: 'Magic Mirror',
    pageTitle: 'Magic Mirrors',
    revisionTimestamp: '2026-04-02T10:40:10Z',
    wikitext: '',
    html: `
      <p>Magic Mirrors can be found in Chests generated in the Underground and Cavern layers.</p>
      <table class="drop">
        <tr><th>Entity</th><th>Qty</th><th>Chance</th></tr>
        <tr><td><a title="Gold Chest">Gold Chest</a></td><td>1</td><td>1/6 (16.67%)</td></tr>
        <tr><td><a title="Mimic">Mimic</a></td><td>1</td><td>16.67%</td></tr>
        <tr><td><a title="Frozen Chest">Frozen Chest</a></td><td>1</td><td>1/5 (20%)</td></tr>
      </table>
    `
  }));

  const summary = auditItemSourceGapCandidates({
    rawItemPageDir: rawDir,
    standardizedItemsPath: itemsPath,
    itemSourcesDir: sourcesDir,
    npcLookup: new Map([['mimic', { boss: false }]]),
    sample: 'MagicMirror'
  });

  assert.equal(summary.totalCandidates, 1);
  assert.equal(summary.parsedRawItemPages, 1);
  assert.equal(summary.rawPagesWithExtractedSources, 1);
  assert.equal(summary.rawExtractedButStandardizedZeroCandidates, 1);
  assert.equal(summary.candidateSourceRows, 4);
  assert.equal(summary.candidates[0].itemInternalName, 'MagicMirror');
  assert.equal(summary.candidates[0].classification, 'high_confidence');
  assert.deepEqual(
    summary.candidates[0].extractedSources.map((row) => [row.sourceRefName, row.sourceRefType]),
    [
      ['Gold Chest', 'container'],
      ['Mimic', 'npc'],
      ['Frozen Chest', 'container'],
      ['Magic Mirrors worldgen', 'world']
    ]
  );
});

test('auditItemSourceGapCandidates reads records payloads and includes vendor sources', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'item-source-gap-records-'));
  const rawDir = path.join(root, 'raw');
  const sourcesDir = path.join(root, 'itemSources');
  const itemsPath = path.join(root, 'items.standardized.json');
  fs.mkdirSync(rawDir, { recursive: true });
  fs.mkdirSync(sourcesDir, { recursive: true });

  fs.writeFileSync(itemsPath, JSON.stringify({
    records: [{ id: 123, internalName: 'VendorItem', name: 'Vendor Item' }]
  }));
  fs.writeFileSync(path.join(sourcesDir, 'itemSources.part-0001.json'), JSON.stringify([]));
  fs.writeFileSync(path.join(rawDir, 'vendoritem.latest.json'), JSON.stringify({
    itemInternalName: 'VendorItem',
    itemName: 'Vendor Item',
    pageTitle: 'Vendor Item',
    wikitext: '| tags = vendor:Merchant',
    html: '<p>A vendor test item.</p>'
  }));

  const summary = auditItemSourceGapCandidates({
    rawItemPageDir: rawDir,
    standardizedItemsPath: itemsPath,
    itemSourcesDir: sourcesDir,
    npcLookup: new Map(),
    sample: 'VendorItem'
  });

  assert.equal(summary.totalCandidates, 1);
  assert.equal(summary.candidateSourceRows, 1);
  assert.equal(summary.candidates[0].itemName, 'Vendor Item');
  assert.deepEqual(summary.candidates[0].extractedSources, [
    {
      sourceType: 'shop',
      sourceRefType: 'npc',
      sourceRefName: 'Merchant',
      quantityText: null,
      chanceText: null,
      conditions: null,
      notes: null
    }
  ]);
});

test('auditItemSourceGapCandidates separates exact plural item pages from family pages', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'item-source-gap-family-'));
  const rawDir = path.join(root, 'raw');
  const sourcesDir = path.join(root, 'itemSources');
  const itemsPath = path.join(root, 'items.standardized.json');
  fs.mkdirSync(rawDir, { recursive: true });
  fs.mkdirSync(sourcesDir, { recursive: true });

  fs.writeFileSync(itemsPath, JSON.stringify({
    records: [
      { internalName: 'MagicMirror', name: 'Magic Mirror' },
      { internalName: 'AetheriumBookcase', name: 'Aetherium Bookcase' }
    ]
  }));
  fs.writeFileSync(path.join(sourcesDir, 'itemSources.part-0001.json'), JSON.stringify([]));
  fs.writeFileSync(path.join(rawDir, 'magicmirror.latest.json'), JSON.stringify({
    itemInternalName: 'MagicMirror',
    itemName: 'Magic Mirror',
    pageTitle: 'Magic Mirrors',
    html: '<p>Magic Mirrors can be found in Chests generated in the Underground and Cavern layers.</p>',
    wikitext: ''
  }));
  fs.writeFileSync(path.join(rawDir, 'aetheriumbookcase.latest.json'), JSON.stringify({
    itemInternalName: 'AetheriumBookcase',
    itemName: 'Aetherium Bookcase',
    pageTitle: 'Bookcases',
    html: '<p>Some bookcases can also be found in Underground Cabins.</p>',
    wikitext: ''
  }));

  const summary = auditItemSourceGapCandidates({
    rawItemPageDir: rawDir,
    standardizedItemsPath: itemsPath,
    itemSourcesDir: sourcesDir,
    npcLookup: new Map()
  });

  const byInternalName = new Map(summary.candidates.map((candidate) => [candidate.itemInternalName, candidate]));
  assert.equal(byInternalName.get('MagicMirror')?.classification, 'high_confidence');
  assert.equal(byInternalName.get('AetheriumBookcase')?.classification, 'family_page_candidate');
});

test('audit item source gap CLI supports --sample and prints JSON summary', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'item-source-gap-cli-'));
  const rawDir = path.join(root, 'raw');
  const sourcesDir = path.join(root, 'itemSources');
  const itemsPath = path.join(root, 'items.standardized.json');
  fs.mkdirSync(rawDir, { recursive: true });
  fs.mkdirSync(sourcesDir, { recursive: true });
  fs.writeFileSync(itemsPath, JSON.stringify({ items: [{ internalName: 'MagicMirror', name: 'Magic Mirror' }] }));
  fs.writeFileSync(path.join(sourcesDir, 'itemSources.part-0001.json'), JSON.stringify([]));
  fs.writeFileSync(path.join(rawDir, 'magicmirror.latest.json'), JSON.stringify({
    itemInternalName: 'MagicMirror',
    itemName: 'Magic Mirror',
    pageTitle: 'Magic Mirrors',
    html: '<p>Magic Mirrors can be found in Chests generated in the Underground and Cavern layers.</p>',
    wikitext: ''
  }));

  const result = spawnSync(process.execPath, [
    'scripts/data/audit/audit-item-source-gap-candidates.mjs',
    '--raw-dir', rawDir,
    '--items', itemsPath,
    '--item-sources-dir', sourcesDir,
    '--sample', 'MagicMirror',
    '--limit', '1'
  ], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.candidates[0].itemInternalName, 'MagicMirror');
});
