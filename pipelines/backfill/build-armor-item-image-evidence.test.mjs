import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildArmorItemImageEvidence,
  buildArmorItemImageProgressPayload,
  classifyArmorItem,
  extractImageCandidatesFromItemPage,
  probeDirectArmorItemImageCandidates
} from './build-armor-item-image-evidence.mjs';

test('classifyArmorItem identifies armor and vanity equipment item categories', () => {
  assert.equal(classifyArmorItem({ categoryCode: 'HELMET', internalName: 'CopperHelmet' }), 'head');
  assert.equal(classifyArmorItem({ categoryCode: 'CHESTPLATE', internalName: 'CopperChainmail' }), 'body');
  assert.equal(classifyArmorItem({ categoryCode: 'LEGGINGS', internalName: 'CopperGreaves' }), 'legs');
  assert.equal(classifyArmorItem({ categoryCode: 'MATERIAL', internalName: 'CopperBar' }), null);
  assert.equal(classifyArmorItem({ internalName: 'WizardHat' }), 'head');
  assert.equal(classifyArmorItem({ internalName: 'GypsyRobe' }), 'body');
});

test('extractImageCandidatesFromItemPage prefers matching item file titles from raw item pages', () => {
  const actual = extractImageCandidatesFromItemPage({
    itemName: 'Copper Helmet',
    pageTitle: 'Copper armor',
    html: '<img alt="Copper armor.png" src="/images/Copper_armor.png"><img alt="Copper Helmet.png" src="/images/Copper_Helmet.png">',
    wikitext: '[[File:Copper Chainmail.png]] [[File:Copper Helmet.png]]'
  });

  assert.deepEqual(actual.map((entry) => entry.fileTitle), ['Copper Helmet.png']);
  assert.equal(actual[0].sourceUrl, 'https://terraria.wiki.gg/images/Copper_Helmet.png');
});

test('extractImageCandidatesFromItemPage rejects legacy equipped and broad character images', () => {
  const actual = extractImageCandidatesFromItemPage({
    itemName: 'Wood Helmet',
    pageTitle: 'Wood armor',
    html: [
      '<img alt="Wood armor.png" src="/images/Wood_armor.png">',
      '<img alt="Wood Helmet (pre-1.3.2).png" src="/images/Wood_Helmet_(pre-1.3.2).png">',
      '<img alt="Wood Helmet (equipped).png" src="/images/Wood_Helmet_(equipped).png">',
      '<img alt="Wood Helmet.png" src="/images/Wood_Helmet.png">',
      '<img alt="Mummy.gif" src="/images/Mummy.gif">'
    ].join('')
  });

  assert.deepEqual(actual.map((entry) => entry.fileTitle), ['Wood Helmet.png']);
});

test('extractImageCandidatesFromItemPage only keeps item-icon png candidates', () => {
  const actual = extractImageCandidatesFromItemPage({
    itemName: 'Mummy Mask',
    pageTitle: 'Mummy set',
    html: [
      '<img alt="Mummy.gif" src="/images/Mummy.gif">',
      '<img alt="Mummy Mask (equipped).png" src="/images/Mummy_Mask_(equipped).png">',
      '<img alt="Mummy Mask.png" src="/images/Mummy_Mask.png">'
    ].join('')
  });

  assert.deepEqual(actual.map((entry) => entry.fileTitle), ['Mummy Mask.png']);
});

test('buildArmorItemImageEvidence builds candidates and unresolved rows without DB writes', () => {
  const evidence = buildArmorItemImageEvidence({
    items: [
      { id: 89, internalName: 'CopperHelmet', name: 'Copper Helmet', categoryCode: 'HELMET' },
      { id: 999, internalName: 'NoPageHelmet', name: 'No Page Helmet', categoryCode: 'HELMET' },
      { id: 1, internalName: 'CopperBar', name: 'Copper Bar', categoryCode: 'MATERIAL' }
    ],
    itemPagesByInternalName: new Map([
      ['CopperHelmet', {
        itemInternalName: 'CopperHelmet',
        itemName: 'Copper Helmet',
        pageTitle: 'Copper armor',
        html: '<img alt="Copper Helmet.png" src="/images/Copper_Helmet.png">'
      }]
    ])
  });

  assert.equal(evidence.summary.totalItems, 3);
  assert.equal(evidence.summary.armorItemCount, 2);
  assert.equal(evidence.summary.candidateCount, 1);
  assert.equal(evidence.summary.unresolvedCount, 1);
  assert.equal(evidence.candidates[0].internalName, 'CopperHelmet');
  assert.equal(evidence.candidates[0].imageFileTitle, 'Copper Helmet.png');
  assert.equal(evidence.unresolved[0].internalName, 'NoPageHelmet');
});

test('probeDirectArmorItemImageCandidates promotes exact item file matches and ignores misses', async () => {
  const unresolved = [
    { id: 89, internalName: 'CopperHelmet', name: 'Copper Helmet', role: 'head', pageTitle: 'Copper armor' },
    { id: 80, internalName: 'CopperChainmail', name: 'Copper Chainmail', role: 'body', pageTitle: 'Copper armor' }
  ];
  const seen = [];
  const result = await probeDirectArmorItemImageCandidates({
    unresolved,
    fetchImageInfo: async ({ fileTitle }) => {
      seen.push(fileTitle);
      if (fileTitle === 'Copper Helmet.png') {
        return {
          fileTitle: 'File:Copper Helmet.png',
          url: 'https://terraria.wiki.gg/images/Copper_Helmet.png',
          mime: 'image/png',
          width: 20,
          height: 20
        };
      }
      return null;
    }
  });

  assert.deepEqual(seen, ['Copper Helmet.png', 'Copper Chainmail.png']);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].internalName, 'CopperHelmet');
  assert.equal(result.candidates[0].imageFileTitle, 'Copper Helmet.png');
  assert.equal(result.candidates[0].sourceKind, 'direct_file_probe');
  assert.equal(result.unresolved.length, 1);
  assert.equal(result.unresolved[0].internalName, 'CopperChainmail');
});

test('probeDirectArmorItemImageCandidates reports progress for every probed unresolved item', async () => {
  const progress = [];
  await probeDirectArmorItemImageCandidates({
    unresolved: [
      { id: 1, internalName: 'OneHelmet', name: 'One Helmet', role: 'head' },
      { id: 2, internalName: 'TwoHelmet', name: 'Two Helmet', role: 'head' }
    ],
    fetchImageInfo: async () => null,
    onProgress: (current, total) => progress.push([current, total])
  });

  assert.deepEqual(progress, [[1, 2], [2, 2]]);
});

test('buildArmorItemImageProgressPayload uses monitor-visible crawler fields', () => {
  const payload = buildArmorItemImageProgressPayload({
    status: 'running',
    current: 5,
    total: 491,
    phase: 'direct_file_probe',
    message: 'building armor item image evidence',
    progressPath: 'data/generated/wiki-sync-progress.latest.json',
    outputPath: 'reports/armor-item-image-evidence-2026-06-04.json',
    overallCurrent: 671,
    overallTotal: 1221,
    startedAt: '2026-06-04T00:00:00.000Z',
    now: '2026-06-04T00:01:00.000Z'
  });

  assert.equal(payload.actionId, 'armor-item-images');
  assert.equal(payload.status, 'running');
  assert.equal(payload.phase, 'direct_file_probe');
  assert.equal(payload.current, 5);
  assert.equal(payload.total, 491);
  assert.equal(payload.overallCurrent, 671);
  assert.equal(payload.overallTotal, 1221);
  assert.equal(payload.childStatusPath, 'data/generated/wiki-sync-progress.latest.json');
  assert.equal(payload.outputPath, 'reports/armor-item-image-evidence-2026-06-04.json');
  assert.equal(payload.lastHeartbeatAt, '2026-06-04T00:01:00.000Z');
});
