import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildItemImageSourceCandidateReport,
  loadItemImageComparisonSnapshot,
  runItemImageSourceCandidateAudit
} from './item-image-source-candidate-audit.mjs';

test('buildItemImageSourceCandidateReport keeps only unique exact filename matches', () => {
  const rawPagePayloadByFile = new Map([
    ['torch.latest.json', rawPage({
      internalName: 'Torch',
      itemName: 'Torch',
      requestedPageTitle: 'Torch',
      pageTitle: 'Torches',
      images: ['Torch.png', 'Blue_Torch.png']
    })],
    ['wrench.latest.json', rawPage({
      internalName: 'Wrench',
      itemName: 'Red Wrench',
      requestedPageTitle: 'Red Wrench',
      pageTitle: 'Wrenches',
      images: ['Red_Wrench.png', 'Red-Wrench.gif']
    })],
    ['adamantiteleggings.latest.json', rawPage({
      internalName: 'AdamantiteLeggings',
      itemName: 'Adamantite Leggings',
      requestedPageTitle: 'Adamantite Leggings',
      pageTitle: 'Adamantite armor',
      images: ['Adamantite_armor.png']
    })],
    ['demonbow.latest.json', rawPage({
      internalName: 'DemonBow',
      itemName: 'Demon Bow',
      requestedPageTitle: 'Demon Bow',
      pageTitle: 'Demon Bow',
      images: ['Demon_Bow.png', 'Demon_Bow_%28old%29.png']
    })]
  ]);
  const rawPageBytesByFile = new Map(
    [...rawPagePayloadByFile].map(([fileName, payload]) => [fileName, JSON.stringify(payload)])
  );
  const report = buildItemImageSourceCandidateReport({
    generatedAt: '2026-07-30T01:00:00.000Z',
    itemRecords: [
      missingImageItem('Torch', 'Torch'),
      missingImageItem('Wrench', 'Red Wrench'),
      missingImageItem('AdamantiteLeggings', 'Adamantite Leggings'),
      missingImageItem('DemonBow', 'Demon Bow'),
      {
        ...missingImageItem('IronPickaxe', 'Iron Pickaxe'),
        imageFileTitle: 'Iron Pickaxe.png',
        imageUrl: '/terrapedia-images/items/iron-pickaxe.png'
      }
    ],
    itemPageRecords: [
      pageMetadata('Torch', 'torch.latest.json'),
      pageMetadata('Wrench', 'wrench.latest.json'),
      pageMetadata('AdamantiteLeggings', 'adamantiteleggings.latest.json'),
      pageMetadata('DemonBow', 'demonbow.latest.json')
    ],
    rawPagePayloadByFile,
    rawPageBytesByFile,
    localComparisonRows: [{
      itemInternalName: 'Torch',
      sourceFileTitle: 'Different Torch.png',
      originalUrl: 'https://terraria.wiki.gg/images/Different_Torch.png'
    }],
    existingLineageRows: [{
      itemInternalName: 'DemonBow',
      sourceFileTitle: 'Demon Bow.png',
      originalUrl: 'https://terraria.wiki.gg/images/Demon_Bow.png'
    }]
  });

  assert.equal(report.schemaVersion, '2.0.0');
  assert.deepEqual(report.summary, {
    totalItems: 5,
    existingImageSourceItems: 1,
    missingImageSourceItems: 4,
    groupPages: 3,
    nonGroupPages: 1,
    rawVerified: 2,
    ambiguous: 1,
    unresolved: 1,
    candidateCount: 2,
    quarantinedGroupPages: 2,
    missingPageMetadata: 0,
    missingRawPages: 0,
    parseErrors: 0,
    localAgreement: 0,
    localConflict: 1,
    existingLineage: 1,
    localOnly: 1
  });
  assert.deepEqual(
    report.candidates.map((candidate) => ({
      internalName: candidate.itemInternalName,
      classification: candidate.classification,
      fileTitle: candidate.source.fileTitle
    })),
    [
      {
        internalName: 'DemonBow',
        classification: 'raw_verified',
        fileTitle: 'Demon Bow.png'
      },
      {
        internalName: 'Torch',
        classification: 'raw_verified',
        fileTitle: 'Torch.png'
      }
    ]
  );
  assert.equal(report.quarantine.groupPages.length, 2);
  assert.deepEqual(
    report.quarantine.groupPages.map((entry) => entry.reason).sort(),
    ['ambiguous_member_image_evidence', 'unresolved_member_image_evidence']
  );
  const torch = report.candidates.find((candidate) => candidate.itemInternalName === 'Torch');
  assert.equal(torch.source.authority, 'raw_wiki_evidence');
  assert.match(torch.source.rawFileSha256, /^sha256:[a-f0-9]{64}$/);
  assert.equal(torch.source.pageId, 1);
  assert.equal(torch.source.evidenceKind, 'table_row');
  assert.equal(torch.source.blockOrdinal, 1);
  assert.equal(torch.source.anchorTitle, 'Torch');
  assert.equal(torch.source.fileTitle, 'Torch.png');
  assert.equal(torch.comparison.local.status, 'conflict');
  assert.equal(torch.comparison.local.sourceFileTitle, 'Different Torch.png');
  assert.equal(torch.source.fileTitle, 'Torch.png');
  assert.equal(
    torch.source.rawFileSha256,
    sha256(rawPageBytesByFile.get('torch.latest.json'))
  );
});

test('runItemImageSourceCandidateAudit writes only the requested review artifact', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tp-item-image-candidates-'));
  const rawDir = path.join(root, 'raw');
  const itemsPath = path.join(root, 'items.standardized.json');
  const itemPagesPath = path.join(root, 'item_pages.standardized.json');
  const outputPath = path.join(root, 'reports', 'item-image-source-candidates.json');
  await fs.promises.mkdir(rawDir, { recursive: true });
  await fs.promises.writeFile(itemsPath, JSON.stringify({
    records: [missingImageItem('Torch', 'Torch')]
  }));
  await fs.promises.writeFile(itemPagesPath, JSON.stringify({
    records: [pageMetadata('Torch', 'torch.latest.json')]
  }));
  await fs.promises.writeFile(path.join(rawDir, 'torch.latest.json'), JSON.stringify(rawPage({
    internalName: 'Torch',
    itemName: 'Torch',
    requestedPageTitle: 'Torch',
    pageTitle: 'Torches',
    images: ['Torch.png']
  })));
  const itemsBefore = await fs.promises.readFile(itemsPath);
  const pagesBefore = await fs.promises.readFile(itemPagesPath);

  const summary = await runItemImageSourceCandidateAudit({
    itemsPath,
    itemPagesPath,
    rawDir,
    outputPath,
    generatedAt: '2026-07-30T01:00:00.000Z'
  });

  assert.equal(summary.candidateCount, 1);
  assert.deepEqual(await fs.promises.readFile(itemsPath), itemsBefore);
  assert.deepEqual(await fs.promises.readFile(itemPagesPath), pagesBefore);
  const output = JSON.parse(await fs.promises.readFile(outputPath, 'utf8'));
  assert.equal(output.schemaVersion, '2.0.0');
  assert.equal(output.entity, 'item_image_source_candidates');
  assert.equal(output.candidates[0].itemInternalName, 'Torch');
  assert.match(output.candidates[0].source.rawFileSha256, /^sha256:[a-f0-9]{64}$/);
  assert.match(output.inputs.items.sha256, /^sha256:[a-f0-9]{64}$/);
  assert.match(output.inputs.itemPages.sha256, /^sha256:[a-f0-9]{64}$/);
  assert.match(output.inputs.identitySetSha256, /^sha256:[a-f0-9]{64}$/);
});

test('loadItemImageComparisonSnapshot uses one read-only formal database snapshot', async () => {
  const statements = [];
  const connection = {
    async query(sql) {
      statements.push(sql);
      if (sql === 'START TRANSACTION READ ONLY' || sql === 'ROLLBACK') return [[], []];
      if (sql.includes('terria_v1_local') && sql.includes('item_images')) {
        return [[{
          itemInternalName: 'Torch',
          sourceFileTitle: 'Torch.png',
          originalUrl: 'https://terraria.wiki.gg/images/Torch.png',
          cachedUrl: '/terrapedia-images/items/torch.png'
        }], []];
      }
      if (sql.includes('terria_v1_relation') && sql.includes('relation_item_images')) {
        return [[{
          itemInternalName: 'Torch',
          sourceFileTitle: 'Torch.png',
          originalUrl: 'https://terraria.wiki.gg/images/Torch.png',
          cachedUrl: '/terrapedia-images/items/torch.png'
        }], []];
      }
      throw new Error(`unexpected SQL: ${sql}`);
    }
  };

  const snapshot = await loadItemImageComparisonSnapshot({ connection });

  assert.equal(snapshot.localComparisonRows.length, 1);
  assert.equal(snapshot.existingLineageRows.length, 1);
  assert.equal(statements[0], 'START TRANSACTION READ ONLY');
  assert.equal(statements.at(-1), 'ROLLBACK');
  assert.match(statements[1], /ROW_NUMBER\(\) OVER/i);
  assert.match(statements[2], /ROW_NUMBER\(\) OVER/i);
});

function missingImageItem(internalName, name) {
  return {
    id: internalName,
    internalName,
    name,
    imageFileTitle: null,
    imageUrl: null
  };
}

function pageMetadata(itemInternalName, sourceFile) {
  return {
    itemInternalName,
    sourceFile: `data/terraPedia/raw/wiki/item-pages/${sourceFile}`
  };
}

function rawPage({ internalName, itemName, requestedPageTitle, pageTitle, images }) {
  const imageMarkup = images.map((fileTitle) => (
    `<img src="/images/${fileTitle}" alt="${fileTitle}" width="16" height="16" />`
  )).join('');
  const isGroupPage = requestedPageTitle !== pageTitle;
  return {
    itemInternalName: internalName,
    itemName,
    requestedPageTitle,
    pageTitle,
    pageId: 1,
    revisionTimestamp: '2026-07-30T00:00:00.000Z',
    fetchedAt: '2026-07-30T00:01:00.000Z',
    entityType: 'item',
    wikitext: 'source',
    html: isGroupPage
      ? `<table><tr data-sort-value="${itemName}"><td><a title="${itemName}">${imageMarkup}</a></td></tr></table>`
      : `<div class="section images">${imageMarkup}</div><div class="section statistics"></div>`,
    recipesMarkup: ''
  };
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
