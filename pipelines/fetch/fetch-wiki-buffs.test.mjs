import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  buildBuffFetchProgressPayload,
  buildBuffRecords,
  collectBuffPageImmunityFacts,
  fetchDefaultBuffPagePayload
} from './fetch-wiki-buffs.mjs';
import { verifyBuffIteminfoSemanticCapture } from './buff-iteminfo-evidence.mjs';
import { parseBuffPageEvidence } from './buff-immunity-page-parser.mjs';
import { normalizeBuffPageEvidence } from '../relation/sync-buffs-to-relation.mjs';

function buildSourceItemRecord(pageEvidence, moduleItems = []) {
  return buildBuffRecords({
    baseBuffs: [{ id: 24, englishName: 'On Fire!', internalName: 'OnFire' }],
    localizedByLang: {}, langs: [],
    relations: {
      sourceItemsByBuffId: new Map([[24, moduleItems]]),
      immuneNpcCountByBuffId: new Map(), immuneNpcSampleByBuffId: new Map(),
      immuneNpcSourceByBuffId: new Map(), immuneNpcSampleSemanticsByBuffId: new Map(),
    },
    pageFacts: new Map([[24, pageEvidence]]),
  })[0];
}

function sourceItemPageEvidence(causes = '') {
  return parseBuffPageEvidence({ buffId: 24, buffName: 'On Fire!', pageTitle: 'On Fire!',
    revisionId: 42, revisionTimestamp: '2026-09-30T00:00:00Z',
    html: `${causes}<h2><span id="Immune_NPCs" class="mw-headline">Immune NPCs</span></h2>
      <div class="heading">Enemies immune to On Fire!</div>
      <ul><li><a href="/wiki/Fire_Imp" title="Fire Imp">Fire Imp</a></li></ul>`,
  });
}

function semanticIteminfoCaptureForVenom() {
  const inputBytes = Buffer.from(JSON.stringify({ buffs: [
    { id: 71, internalName: 'WeaponImbueVenom' },
    { id: 395, internalName: 'PotentAcid' },
  ] }));
  const pages = [
    ['Module:Iteminfo/data', '-- This module contains a database with the statistics of all items, which is queried by Module:Iteminfo.\n-- It was generated from Module:Iteminfo/datagen.\nreturn { ["data"] = [=====[{"1340":{"name":"Flask of Venom","internalName":"FlaskofVenom","buffType":71,"buffTime":72000}}]=====] }'],
    ['Module:Iteminfo/doc', 'The buffType field identifies the Buff ID applied by an item.'],
    ['Module:Iteminfo/datagen', 'The generator emits every item row into Module:Iteminfo/data via convertToJsonData.'],
  ].map(([pageTitle, wikitext], index) => {
    const raw = { pageTitle, pageId: 19000 + index, revisionId: 52 + index,
      revisionTimestamp: '2026-09-30T00:00:00Z', wikitext };
    const rawBytes = Buffer.from(JSON.stringify(raw));
    return { ...raw, requestedPageTitle: pageTitle, rawBytes, sha256: `sha256:${createHash('sha256').update(rawBytes).digest('hex')}` };
  });
  const inputHash = `sha256:${createHash('sha256').update(inputBytes).digest('hex')}`;
  const manifest = {
    schemaVersion: 'buff-semantic-raw-capture/v1', sourceKind: 'iteminfo-semantics', status: 'completed',
    input: { sha256: inputHash }, selectedBuffIds: [71, 395],
    pages: pages.map(page => ({ pageTitle: page.pageTitle, requestedPageTitle: page.pageTitle,
      pageId: page.pageId, revisionId: page.revisionId, revisionTimestamp: page.revisionTimestamp,
      buffIds: [71, 395], sha256: page.sha256 })),
  };
  return { inputBytes, manifestBytes: Buffer.from(JSON.stringify(manifest)), semanticCapture: { pages } };
}

function pageEvidenceForBuff({ id, internalName, englishName, causes }) {
  const page = sourceItemPageEvidence(causes);
  page.buffId = id;
  page.buffName = englishName;
  page.sourceEvidence.pageTitle = englishName;
  page.sourceEvidence.canonicalPageTitle = englishName;
  page.sourceEvidence.revisionId = 1020000 + id;
  page.sourceEvidence.revisionTimestamp = '2026-09-30T00:00:00Z';
  page.sourceEvidence.factGroups = {
    ...page.sourceEvidence.factGroups,
    sourceItems: { ...page.sourceEvidence.factGroups.sourceItems, status: 'parsed' },
  };
  page.sourceEvidence.unresolvedFacts = [];
  page.internalName = internalName;
  return page;
}

function npcinfoCaptureForBuff(buffId = 24, internalName = 'OnFire') {
  const input = { buffs: [{ id: buffId, internalName }] };
  const inputBytes = Buffer.from(JSON.stringify(input));
  const raw = {
    requestedPageTitle: 'Module:Npcinfo/data', pageTitle: 'Module:Npcinfo/data', pageId: 18065,
    revisionId: 1022313, revisionTimestamp: '2026-08-20T18:13:10Z',
    wikitext: 'return { [1] = { internalName = "BlueSlime", name = "Blue Slime", buffImmune = "24" } }'
  };
  const rawBytes = Buffer.from(JSON.stringify(raw));
  const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const manifest = {
    schemaVersion: 'buff-npcinfo-raw-capture/v1', sourceKind: 'npcinfo', status: 'completed',
    input: { sha256: hash(inputBytes) }, selectedBuffIds: [buffId],
    pages: [{ requestedPageTitle: raw.pageTitle, pageTitle: raw.pageTitle, pageId: raw.pageId,
      revisionId: raw.revisionId, revisionTimestamp: raw.revisionTimestamp, sha256: hash(rawBytes) }]
  };
  return {
    inputBytes,
    rawBytes,
    manifestBytes: Buffer.from(JSON.stringify(manifest))
  };
}

function completeExpandedNpcinfoCaptureForBuff(buffId = 39, internalName = 'Weak') {
  const base = npcinfoCaptureForBuff(buffId, internalName);
  const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const input = { buffs: [{ id: buffId, internalName }] };
  const inputBytes = Buffer.from(JSON.stringify(input));
  const raw = JSON.parse(base.rawBytes);
  raw.wikitext = `return {
    [1] = { internalName = "BlueSlime", name = "Blue Slime", buffImmune = "${buffId}" },
    [2] = { internalName = "Hornet", name = "Hornet", buffImmuneAll = true },
  }`;
  const rawBytes = Buffer.from(JSON.stringify(raw));
  const manifest = {
    ...JSON.parse(base.manifestBytes),
    input: { sha256: hash(inputBytes), buffIds: [buffId] },
    selectedBuffIds: [buffId],
    scopeCompleteness: 'all-npc-rows',
    fieldSemantics: 'buffImmune-expanded-with-semantic-sources',
    npcCount: 2,
    pages: [{ ...JSON.parse(base.manifestBytes).pages[0], sha256: hash(rawBytes) }],
  };
  const semantic = [
    ['Module:Npcinfo/doc', 18032, 1004647, '| buffImmune || list\n| buffImmuneAll || all\n| buffImmuneAllNotWhips || except whips'],
    ['Module:Npcinfo/datagen', 18037, 1022307, 'ImmuneToAllBuffsThatAreNotWhips this.buffImmuneAll = true this.buffImmuneAllNotWhips = true'],
    ['Template:GetBuffInfo', 55467, 1023278, `<!--${buffId}-->|__buff:iname:${buffId}|${internalName}<!--${buffId}-->|__buff:ename:${buffId}|<!--${buffId}-->|__buff:type:${buffId}|debuff`],
    ['Whips', 5607, 1028291, "{{anchor|whip debuffs|contents=Electric Eel buff ID 362; Dark Harvest buff ID 310\n}}\n== History =="],
  ].map(([pageTitle, pageId, revisionId, wikitext]) => {
    const page = { pageTitle, pageId, revisionId, revisionTimestamp: '2026-09-30T00:00:00Z', wikitext };
    const rawBytes = Buffer.from(JSON.stringify(page));
    return { ...page, rawBytes, sha256: hash(rawBytes) };
  });
  return { inputBytes, rawBytes, manifestBytes: Buffer.from(JSON.stringify(manifest)), semanticCapture: { pages: semantic } };
}

test('missing page source section preserves module candidates without certifying them', () => {
  const page = sourceItemPageEvidence();
  const before = structuredClone(page);
  const fallback = [{ itemId: 1, internalName: 'ModuleItem', buffTime: 60 }];
  const record = buildSourceItemRecord(page, fallback);
  assert.deepEqual(record.sourceItems, fallback);
  assert.equal(record.sourceItemCount, 1);
  assert.equal(record.sourceItemsSource, 'iteminfo-module');
  assert.equal(record.sourceEvidence.factGroups.sourceItems.status, 'section_missing');
  assert.equal(record.sourceEvidence.parseStatus, 'parse_incomplete');
  assert.ok(record.sourceEvidence.unresolvedFacts.some(f => f.group === 'sourceItems' && f.status === 'section_missing'));
  assert.throws(() => normalizeBuffPageEvidence({ evidence: record }), /incomplete/);
  assert.deepEqual(page, before);
});

test('missing page and module source facts cannot become an accepted empty item set', () => {
  const record = buildSourceItemRecord(sourceItemPageEvidence());
  assert.deepEqual(record.sourceItems, []);
  assert.equal(record.sourceEvidence.parseStatus, 'parse_incomplete');
  assert.throws(() => normalizeBuffPageEvidence({ evidence: record }), /incomplete/);
});

test('empty source section preserves fallback and its no-rows failure', () => {
  const page = sourceItemPageEvidence('<h2><span id="From_player" class="mw-headline">From player</span></h2><p>No parseable rows.</p>');
  const record = buildSourceItemRecord(page, [{ itemId: 1 }]);
  assert.deepEqual(record.sourceItems, [{ itemId: 1 }]);
  assert.deepEqual(record.sourceEvidence.unresolvedFacts.filter(f => f.group === 'sourceItems'), [
    { group: 'sourceItems', status: 'no_rows', sections: ['From player'] },
  ]);
});

test('positive parsed page source facts retain precedence over module fallback', () => {
  const page = sourceItemPageEvidence('<h2><span id="From_player" class="mw-headline">From player</span></h2><ul><li><a href="/wiki/Flamethrower" title="Flamethrower">Flamethrower</a></li></ul>');
  const record = buildSourceItemRecord(page, [{ itemId: 1 }]);
  assert.deepEqual(record.sourceItems, page.sourceItems);
  assert.equal(record.sourceItemsSource, 'buff-page-causes');
  assert.equal(record.sourceEvidence.parseStatus, 'parsed');
  assert.equal(normalizeBuffPageEvidence({ evidence: record }).immuneNpcCount, 1);
});

test('complete Iteminfo buffType ownership rejects a page item assigned to another Buff', () => {
  const capture = semanticIteminfoCaptureForVenom();
  const records = buildBuffRecords({
    baseBuffs: [
      { id: 71, internalName: 'WeaponImbueVenom', englishName: 'Weapon Imbue: Venom' },
      { id: 395, internalName: 'PotentAcid', englishName: 'Potent Acid' },
    ],
    localizedByLang: {},
    langs: [],
    pageFacts: new Map([
      [71, pageEvidenceForBuff({ id: 71, internalName: 'WeaponImbueVenom', englishName: 'Weapon Imbue: Venom' })],
      [395, pageEvidenceForBuff({
        id: 395,
        internalName: 'PotentAcid',
        englishName: 'Potent Acid',
        causes: '<h2><span id="From_player" class="mw-headline">From player</span></h2><ul><li><a href="/wiki/Flask_of_Venom" title="Flask of Venom">Flask of Venom</a></li></ul>',
      })],
    ]),
    iteminfoSemanticCapture: capture,
    relations: {
      sourceItemsByBuffId: new Map(),
      immuneNpcCountByBuffId: new Map(),
      immuneNpcSampleByBuffId: new Map(),
      immuneNpcSourceByBuffId: new Map(),
      immuneNpcSampleSemanticsByBuffId: new Map(),
    },
  });
  const venom = records.find(row => row.id === 71);
  const potentAcid = records.find(row => row.id === 395);
  assert.deepEqual(venom.sourceItems.map(row => [row.itemId, row.internalName]), [[1340, 'FlaskofVenom']]);
  assert.deepEqual(potentAcid.sourceItems, []);
  assert.equal(potentAcid.sourceItemsSource, 'iteminfo-revision-bound');
});

test('parsed metadata cannot certify zero source rows or missing group evidence', () => {
  for (const status of ['parsed', undefined]) {
    const page = sourceItemPageEvidence();
    if (status) page.sourceEvidence.factGroups.sourceItems.status = status;
    else delete page.sourceEvidence.factGroups.sourceItems;
    const record = buildSourceItemRecord(page, [{ itemId: 1 }]);
    assert.equal(record.sourceEvidence.parseStatus, 'parse_incomplete');
    assert.equal(record.sourceItemsSource, 'iteminfo-module');
    assert.throws(() => normalizeBuffPageEvidence({ evidence: record }), /incomplete/);
  }
});

test('preserving source fallback leaves unrelated unresolved immunity evidence intact', () => {
  const page = sourceItemPageEvidence();
  page.sourceEvidence.parseStatus = 'parse_incomplete';
  page.sourceEvidence.unresolvedFacts = [{ group: 'immuneNpcs', status: 'target_mismatch', sections: ['Immune NPCs'] }];
  const record = buildSourceItemRecord(page, [{ itemId: 1 }]);
  assert.deepEqual(record.sourceEvidence.unresolvedFacts[0], page.sourceEvidence.unresolvedFacts[0]);
  assert.equal(record.sourceEvidence.unresolvedFacts.length, 2);
  assert.equal(page.sourceEvidence.unresolvedFacts.length, 1);
});

test('buildBuffRecords attaches verified NPCinfo positives as diagnostic source evidence', () => {
  const [record] = buildBuffRecords({
    baseBuffs: [{ id: 24, englishName: 'On Fire!', internalName: 'OnFire' }],
    localizedByLang: {},
    langs: [],
    relations: {
      sourceItemsByBuffId: new Map(),
      immuneNpcCountByBuffId: new Map(),
      immuneNpcSampleByBuffId: new Map(),
      immuneNpcSourceByBuffId: new Map(),
      immuneNpcSampleSemanticsByBuffId: new Map()
    },
    pageFacts: new Map([[24, sourceItemPageEvidence()]]),
    npcinfoCapture: npcinfoCaptureForBuff()
  });

  const evidence = record.sourceEvidence.immuneNpcPositiveEvidence;
  assert.equal(evidence.status, 'positive_sources_only');
  assert.deepEqual(evidence.npcinfo.positiveAssertions.map(row => row.npcId), [1]);
  assert.equal(evidence.page.status, 'parsed');
  assert.equal(evidence.canonicalImmuneNpcs, undefined);
});

test('buildBuffRecords threads revision-bound NPC-page infliction facts without creating immunity rows', () => {
  const pageEvidence = sourceItemPageEvidence();
  pageEvidence.buffId = 37;
  pageEvidence.buffName = 'Horrified';
  pageEvidence.sourceEvidence.pageTitle = 'Horrified';
  pageEvidence.sourceEvidence.canonicalPageTitle = 'Horrified';
  pageEvidence.sourceEvidence.revisionId = 1032375;
  pageEvidence.sourceEvidence.revisionTimestamp = '2026-09-30T00:00:00Z';
  pageEvidence.sourceEvidence.factGroups = {
    sourceItems: { status: 'section_missing', count: 0, sections: [] },
    inflictingNpcs: { status: 'section_missing', count: 0, sections: [] },
    immuneNpcs: { status: 'section_missing', count: 0, sections: [] },
  };
  pageEvidence.sourceEvidence.unresolvedFacts = [];
  pageEvidence.inflictingNpcs = [];
  pageEvidence.immuneNpcs = [];
  pageEvidence.immuneNpcCount = 0;
  pageEvidence.immuneNpcSample = [];

  const inflictionEvidence = {
    completeness: 'positive-infliction-facts-only',
    source: {
      provider: 'terraria.wiki.gg', pageTitle: 'Wall of Flesh', pageId: 10220,
      revisionId: 1032375, revisionTimestamp: '2026-09-30T00:00:00Z',
    },
    facts: [{
      relationType: 'inflicts', npcSourceId: 113, npcInternalName: 'WallofFlesh',
      npcName: 'Wall of Flesh', buffId: 37, buffInternalName: 'Horrified',
      buffName: 'Horrified', durationText: 'permanent', sourceField: 'debuff',
    }],
  };
  inflictionEvidence.facts.push({
    ...inflictionEvidence.facts[0],
    npcSourceId: -2,
    npcInternalName: 'OtherStableNpc',
    sourcePage: 'Other NPC',
    sourcePageId: 999,
    sourceRevisionId: 1032376,
  });
  inflictionEvidence.source.factSources = [
    { pageTitle: 'Wall of Flesh', pageId: 10220, revisionId: 1032375, revisionTimestamp: '2026-09-30T00:00:00Z' },
    { pageTitle: 'Other NPC', pageId: 999, revisionId: 1032376, revisionTimestamp: '2026-09-30T00:00:00Z' },
  ];
  const options = {
    baseBuffs: [{ id: 37, englishName: 'Horrified', internalName: 'Horrified', type: 'debuff' }],
    localizedByLang: {},
    langs: [],
    relations: {
      sourceItemsByBuffId: new Map(), immuneNpcCountByBuffId: new Map(),
      immuneNpcSampleByBuffId: new Map(), immuneNpcSourceByBuffId: new Map(),
      immuneNpcSampleSemanticsByBuffId: new Map(),
    },
    pageFacts: new Map([[37, pageEvidence]]),
    npcPageInflictionEvidenceByBuffId: new Map([[37, inflictionEvidence]]),
  };
  const [record] = buildBuffRecords(options);

  assert.deepEqual(record.inflictingNpcs.map(row => [row.npcId, row.internalName, row.relationType]), [
    [113, 'WallofFlesh', 'inflicts'],
    [-2, 'OtherStableNpc', 'inflicts'],
  ]);
  assert.deepEqual(record.inflictingNpcs.map(row => [row.sourcePage, row.sourcePageId, row.sourceRevisionId]), [
    ['Wall of Flesh', 10220, 1032375],
    ['Other NPC', 999, 1032376],
  ]);
  assert.deepEqual(record.immuneNpcs, []);
  assert.equal(record.sourceEvidence.inflictingNpcPositiveEvidence.status, 'positive-infliction-facts-only');
  assert.deepEqual(record.sourceEvidence.inflictingNpcPositiveEvidence.facts.map(fact => fact.relationType), ['inflicts', 'inflicts']);
  assert.equal(record.sourceEvidence.inflictingNpcPositiveEvidence.facts[0].sourceRevisionId, 1032375);

  pageEvidence.inflictingNpcs = [{ internalName: 'WallofFlesh', name: 'Wall of Flesh' }];
  pageEvidence.sourceEvidence.factGroups.inflictingNpcs = { status: 'parsed', count: 1, sections: ['Inflicted by'] };
  const [composed] = buildBuffRecords(options);
  assert.equal(composed.inflictingNpcs.length, 2);
  assert.equal(composed.inflictingNpcs[0].npcId, 113);
  assert.equal(composed.inflictingNpcs[0].sourcePageId, 10220);
  assert.equal(composed.sourceEvidence.factGroups.inflictingNpcs.count, 2);
  assert.equal(pageEvidence.sourceEvidence.factGroups.inflictingNpcs.count, 1);
});

test('buildBuffRecords replaces inflicting NPCs only from an exhaustive NPC-page source', () => {
  const pageEvidence = sourceItemPageEvidence();
  pageEvidence.buffId = 37;
  pageEvidence.buffName = 'Horrified';
  pageEvidence.sourceEvidence.pageTitle = 'Horrified';
  pageEvidence.sourceEvidence.canonicalPageTitle = 'Horrified';
  pageEvidence.sourceEvidence.factGroups = {
    sourceItems: { status: 'parsed', count: 0, sections: ['Iteminfo'] },
    inflictingNpcs: { status: 'section_missing', count: 0, sections: [] },
    immuneNpcs: { status: 'section_missing', count: 0, sections: [] },
  };
  pageEvidence.sourceEvidence.unresolvedFacts = [
    { group: 'inflictingNpcs', status: 'section_missing', sections: [] },
    { group: 'immuneNpcs', status: 'section_missing', sections: [] },
  ];
  pageEvidence.immuneNpcs = [];
  pageEvidence.immuneNpcCount = 0;
  pageEvidence.immuneNpcSample = [];
  pageEvidence.inflictingNpcs = [{ npcId: 999, internalName: 'StaleNpc' }];
  pageEvidence.immuneNpcs = [];
  pageEvidence.immuneNpcCount = 0;
  pageEvidence.immuneNpcSample = [];
  const complete = {
    completeness: 'complete-exhaustive-npc-page-scope',
    source: {
      provider: 'terraria.wiki.gg', inputSha256: 'sha256:' + '1'.repeat(64),
      targetsSha256: 'sha256:' + '2'.repeat(64), pageCount: 1, npcCount: 1,
      factSources: [{ pageTitle: 'Wall of Flesh', pageId: 10220, revisionId: 1032375,
        revisionTimestamp: '2026-09-30T00:00:00Z', rawSha256: 'sha256:' + '3'.repeat(64) }],
      scopeCompleteness: 'all-npc-page-targets',
    },
    facts: [{ relationType: 'inflicts', npcSourceId: 113, npcInternalName: 'WallofFlesh',
      npcName: 'Wall of Flesh', buffId: 37, buffInternalName: 'Horrified', buffName: 'Horrified',
      durationText: 'permanent', sourceField: 'debuff', sourcePage: 'Wall of Flesh', sourcePageId: 10220,
      sourceRevisionId: 1032375, sourceRevisionTimestamp: '2026-09-30T00:00:00Z',
      sourceRawSha256: 'sha256:' + '3'.repeat(64) }],
    factsByBuffId: { '37': [{ relationType: 'inflicts', npcSourceId: 113, npcInternalName: 'WallofFlesh',
      npcName: 'Wall of Flesh', buffId: 37, buffInternalName: 'Horrified', buffName: 'Horrified',
      durationText: 'permanent', sourceField: 'debuff', sourcePage: 'Wall of Flesh', sourcePageId: 10220,
      sourceRevisionId: 1032375, sourceRevisionTimestamp: '2026-09-30T00:00:00Z',
      sourceRawSha256: 'sha256:' + '3'.repeat(64) }] },
  };
  const [record] = buildBuffRecords({
    baseBuffs: [{ id: 37, englishName: 'Horrified', internalName: 'Horrified', type: 'debuff' }],
    localizedByLang: {}, langs: [],
    relations: { sourceItemsByBuffId: new Map(), immuneNpcCountByBuffId: new Map(),
      immuneNpcSampleByBuffId: new Map(), immuneNpcSourceByBuffId: new Map(), immuneNpcSampleSemanticsByBuffId: new Map() },
    pageFacts: new Map([[37, pageEvidence]]),
    npcPageInflictionCompleteEvidence: complete,
  });
  assert.deepEqual(record.inflictingNpcs.map(row => row.npcId), [113]);
  assert.equal(record.sourceEvidence.factGroups.inflictingNpcs.status, 'parsed');
  assert.equal(record.sourceEvidence.unresolvedFacts.some(fact => fact.group === 'inflictingNpcs'), false);
  assert.equal(record.sourceEvidence.inflictingNpcPositiveEvidence.status, 'complete-exhaustive-npc-page-scope');

  assert.throws(() => buildBuffRecords({
    baseBuffs: [{ id: 37, englishName: 'Horrified', internalName: 'Horrified', type: 'debuff' }],
    localizedByLang: {}, langs: [],
    relations: { sourceItemsByBuffId: new Map(), immuneNpcCountByBuffId: new Map(),
      immuneNpcSampleByBuffId: new Map(), immuneNpcSourceByBuffId: new Map(), immuneNpcSampleSemanticsByBuffId: new Map() },
    pageFacts: new Map([[37, pageEvidence]]),
    npcPageInflictionCompleteEvidence: { ...complete, factsByBuffId: { '37': [] } },
  }), /reverse map/);
});

test('buildBuffRecords rejects a reverse NPC-page fact with provenance drift', () => {
  const pageEvidence = sourceItemPageEvidence();
  pageEvidence.buffId = 37;
  pageEvidence.buffName = 'Horrified';
  pageEvidence.sourceEvidence.pageTitle = 'Horrified';
  pageEvidence.sourceEvidence.canonicalPageTitle = 'Horrified';
  pageEvidence.sourceEvidence.factGroups = {
    sourceItems: { status: 'parsed', count: 0, sections: ['Iteminfo'] },
    inflictingNpcs: { status: 'section_missing', count: 0, sections: [] },
    immuneNpcs: { status: 'section_missing', count: 0, sections: [] },
  };
  pageEvidence.sourceEvidence.unresolvedFacts = [
    { group: 'inflictingNpcs', status: 'section_missing', sections: [] },
    { group: 'immuneNpcs', status: 'section_missing', sections: [] },
  ];
  pageEvidence.immuneNpcs = [];
  pageEvidence.immuneNpcCount = 0;
  pageEvidence.immuneNpcSample = [];
  const fact = {
    relationType: 'inflicts', npcSourceId: 113, npcInternalName: 'WallofFlesh',
    npcName: 'Wall of Flesh', buffId: 37, buffInternalName: 'Horrified', buffName: 'Horrified',
    durationText: 'permanent', sourceField: 'debuff', sourcePage: 'Wall of Flesh', sourcePageId: 10220,
    sourceRevisionId: 1032375, sourceRevisionTimestamp: '2026-09-30T00:00:00Z',
    sourceRawSha256: 'sha256:' + '3'.repeat(64),
  };
  const complete = {
    completeness: 'complete-exhaustive-npc-page-scope',
    source: {
      provider: 'terraria.wiki.gg', inputSha256: 'sha256:' + '1'.repeat(64),
      targetsSha256: 'sha256:' + '2'.repeat(64), pageCount: 1, npcCount: 1,
      factSources: [{ pageTitle: 'Wall of Flesh', pageId: 10220, revisionId: 1032375,
        revisionTimestamp: '2026-09-30T00:00:00Z', rawSha256: 'sha256:' + '3'.repeat(64) }],
      scopeCompleteness: 'all-npc-page-targets',
    },
    facts: [fact],
    factsByBuffId: { '37': [{ ...fact, durationText: 'drifted' }] },
  };
  assert.throws(() => buildBuffRecords({
    baseBuffs: [{ id: 37, englishName: 'Horrified', internalName: 'Horrified', type: 'debuff' }],
    localizedByLang: {}, langs: [],
    relations: { sourceItemsByBuffId: new Map(), immuneNpcCountByBuffId: new Map(),
      immuneNpcSampleByBuffId: new Map(), immuneNpcSourceByBuffId: new Map(), immuneNpcSampleSemanticsByBuffId: new Map() },
    pageFacts: new Map([[37, pageEvidence]]),
    npcPageInflictionCompleteEvidence: complete,
  }), /reverse map/);

  const provenanceDrift = structuredClone(complete);
  provenanceDrift.factsByBuffId['37'] = [structuredClone(provenanceDrift.facts[0])];
  provenanceDrift.source.factSources[0].rawSha256 = 'sha256:' + '4'.repeat(64);
  assert.throws(() => buildBuffRecords({
    baseBuffs: [{ id: 37, englishName: 'Horrified', internalName: 'Horrified', type: 'debuff' }],
    localizedByLang: {}, langs: [],
    relations: { sourceItemsByBuffId: new Map(), immuneNpcCountByBuffId: new Map(),
      immuneNpcSampleByBuffId: new Map(), immuneNpcSourceByBuffId: new Map(), immuneNpcSampleSemanticsByBuffId: new Map() },
    pageFacts: new Map([[37, pageEvidence]]),
    npcPageInflictionCompleteEvidence: provenanceDrift,
  }), /provenance|source descriptor/i);
});

test('default Buff page capture requires a revision-bound page payload', async () => {
  let options;
  const payload = await fetchDefaultBuffPagePayload({
    pageTitle: 'Poisoned',
    fetchRenderedHtml: undefined,
    fetchPagePayloadImpl: async (value) => { options = value; return { pageTitle: 'Poisoned', revisionId: 123 }; }
  });
  assert.equal(payload.revisionId, 123);
  assert.equal(options.requireRevisionBinding, true);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const scriptPath = path.join(__dirname, 'fetch-wiki-buffs.mjs');

test('buff progress separates resumed page work from checkpoint skips', () => {
  const payload = buildBuffFetchProgressPayload('/tmp/buff-progress.json', {
    status: 'completed',
    phase: 'write',
    message: 'finished buff page work',
    current: 32,
    total: 32,
    startedAt: '2026-07-16T00:00:00.000Z',
    resumeFields: {
      resume: {
        mode: 'keyed_items',
        completed: 32,
        total: 32,
        inputFingerprint: 'fingerprint'
      }
    },
    resumeAction: 'resume',
    resumeReason: 'valid-state',
    resumeSkippedCount: 12
  });

  assert.equal(payload.plannedCount, 32);
  assert.equal(payload.actualCount, 20);
  assert.equal(payload.skippedCount, 12);
  assert.equal(payload.failedCount, 0);
  assert.equal(payload.estimatedRecords, 32);
  assert.equal(payload.resultKind, 'fetched');
  assert.equal(payload.resumeOutcome, 'resumed');
});

test('buff startup progress does not report an unknown page plan as zero', () => {
  const payload = buildBuffFetchProgressPayload('/tmp/buff-progress.json', {
    status: 'running',
    phase: 'module',
    message: 'fetching buff template before page discovery',
    current: 0,
    total: 0,
    startedAt: '2026-07-16T00:00:00.000Z'
  });

  assert.equal(payload.plannedCount, null);
  assert.equal(payload.actualCount, null);
  assert.equal(payload.estimatedRecords, null);
});

test('buildBuffRecords applies buff page immunity facts over npcinfo fallback and labels sample semantics', () => {
  const baseBuffs = [
    {
      id: 39,
      image: 'Cursed Inferno.png',
      internalName: 'CursedInferno',
      englishName: 'Cursed Inferno',
      type: 'debuff'
    }
  ];
  const localizedByLang = {
    en: {
      39: {
        name: 'Cursed Inferno',
        page: 'Cursed Inferno',
        tooltip: 'Losing life',
        namesub: null
      }
    },
    zh: {
      39: {
        name: '诅咒狱火',
        page: '诅咒狱火',
        tooltip: '正在损失生命',
        namesub: null
      }
    }
  };
  const relations = {
    sourceItemsByBuffId: new Map(),
    immuneNpcCountByBuffId: new Map([[39, 5]]),
    immuneNpcSampleByBuffId: new Map([
      [39, [{ npcId: 70, name: 'Spike Ball', internalName: 'SpikeBall' }]]
    ]),
    immuneNpcSourceByBuffId: new Map([[39, 'npcinfo-module']]),
    immuneNpcSampleSemanticsByBuffId: new Map([[39, 'first 10 npcinfo module rows with this buffImmune id']])
  };
  const pageFacts = new Map([
    [39, {
      immuneNpcCount: 29,
      immuneNpcSample: [
        {
          npcId: null,
          name: 'Ancient Vision',
          internalName: 'AncientVision',
          pageTitle: 'Ancient Vision',
          source: 'buff-page-immunities',
          sourceOrder: 1
        },
        {
          npcId: null,
          name: 'Dungeon Guardian',
          internalName: 'DungeonGuardian',
          pageTitle: 'Dungeon Guardian',
          source: 'buff-page-immunities',
          sourceOrder: 2
        }
      ],
      immuneNpcSource: 'buff-page-immunities',
      immuneNpcSampleSemantics: 'first 2 entries from the rendered buff page immunities list; immuneNpcCount is the full rendered list size'
    }]
  ]);

  const [record] = buildBuffRecords({
    baseBuffs,
    localizedByLang,
    langs: ['en', 'zh'],
    relations,
    pageFacts
  });

  assert.equal(record.immuneNpcCount, 29);
  assert.equal(record.immuneNpcSource, 'buff-page-immunities');
  assert.equal(
    record.immuneNpcSampleSemantics,
    'first 2 entries from the rendered buff page immunities list; immuneNpcCount is the full rendered list size'
  );
  assert.deepEqual(
    record.immuneNpcSample.map((entry) => entry.name),
    ['Ancient Vision', 'Dungeon Guardian']
  );
});

test('buildBuffRecords materializes complete expanded NPCinfo immunity when page immunity is missing', () => {
  const baseBuffs = [{ id: 39, englishName: 'Weak', internalName: 'Weak', type: 'debuff' }];
  const localizedByLang = { en: { 39: { name: 'Weak', page: 'Weak', tooltip: 'Weak', namesub: null } }, zh: { 39: { name: '虚弱', page: '虚弱', tooltip: '虚弱', namesub: null } } };
  const relations = { sourceItemsByBuffId: new Map(), immuneNpcCountByBuffId: new Map(), immuneNpcSampleByBuffId: new Map(), immuneNpcSourceByBuffId: new Map(), immuneNpcSampleSemanticsByBuffId: new Map() };
  const pageEvidence = sourceItemPageEvidence();
  pageEvidence.buffId = 39;
  pageEvidence.sourceEvidence.pageTitle = 'Weak';
  pageEvidence.sourceEvidence.canonicalPageTitle = 'Weak';
  pageEvidence.sourceEvidence.factGroups.immuneNpcs = { status: 'section_missing', count: 0, sections: [] };
  pageEvidence.immuneNpcs = [];
  pageEvidence.immuneNpcCount = 0;
  pageEvidence.immuneNpcSample = [];
  const npcinfoCapture = completeExpandedNpcinfoCaptureForBuff();
  const [record] = buildBuffRecords({
    baseBuffs,
    localizedByLang,
    langs: ['en', 'zh'],
    relations,
    pageFacts: new Map([[39, pageEvidence]]),
    npcinfoCapture,
  });
  assert.deepEqual(record.immuneNpcs.map((row) => row.npcId), [1, 2]);
  assert.equal(record.immuneNpcCount, 2);
  assert.equal(record.immuneNpcSource, 'npcinfo-module-expanded');
  assert.equal(record.immuneNpcSampleSemantics, 'complete expanded Npcinfo module scope');
});

test('buildBuffRecords preserves page source, inflicting, immune, and provenance evidence', () => {
  const [record] = buildBuffRecords({
    baseBuffs: [
      {
        id: 39,
        image: 'Cursed Inferno.png',
        internalName: 'CursedInferno',
        englishName: 'Cursed Inferno',
        type: 'debuff'
      }
    ],
    localizedByLang: {
      zh: {
        39: {
          name: '诅咒狱火',
          page: '诅咒狱火',
          tooltip: '正在损失生命',
          namesub: null
        }
      }
    },
    langs: ['zh'],
    relations: {
      sourceItemsByBuffId: new Map([
        [39, [{ itemId: 47, name: 'Module fallback item', internalName: 'ModuleFallbackItem' }]]
      ]),
      immuneNpcCountByBuffId: new Map(),
      immuneNpcSampleByBuffId: new Map(),
      immuneNpcSourceByBuffId: new Map(),
      immuneNpcSampleSemanticsByBuffId: new Map()
    },
    pageFacts: new Map([
      [39, {
        sourceItems: [
          { name: '诅咒箭', pageTitle: 'Cursed Arrow', sourceKind: 'player', sourceOrder: 1 },
          { name: '诅咒弹', pageTitle: 'Cursed Bullet', sourceKind: 'player', sourceOrder: 2 }
        ],
        inflictingNpcs: [
          { name: '爬藤怪', pageTitle: 'Clinger', sourceKind: 'enemy', sourceOrder: 1 }
        ],
        immuneNpcs: [
          { name: 'Dungeon Guardian', pageTitle: 'Dungeon Guardian', sourceOrder: 1 }
        ],
        immuneNpcCount: 1,
        immuneNpcSample: [
          { name: 'Dungeon Guardian', pageTitle: 'Dungeon Guardian', sourceOrder: 1 }
        ],
        immuneNpcSource: 'buff-page-immunities',
        immuneNpcSampleSemantics: 'first 1 entries from the rendered buff page immunities list; immuneNpcCount is the full rendered list size',
        sourceEvidence: {
          provider: 'terraria.wiki.gg',
          pageTitle: '诅咒狱火',
          sectionAnchors: ['原因', '来自玩家', '来自敌怪', '免疫的_NPC']
        }
      }]
    ])
  });

  assert.deepEqual(record.sourceItems.map((entry) => entry.name), ['诅咒箭', '诅咒弹']);
  assert.deepEqual(record.inflictingNpcs.map((entry) => entry.name), ['爬藤怪']);
  assert.deepEqual(record.immuneNpcs.map((entry) => entry.name), ['Dungeon Guardian']);
  assert.equal(record.sourceItemCount, 2);
  assert.equal(record.sourceEvidence.pageTitle, '诅咒狱火');
  assert.deepEqual(record.sourceEvidence.sectionAnchors, ['原因', '来自玩家', '来自敌怪', '免疫的_NPC']);
});

test('collectBuffPageImmunityFacts fetches rendered buff pages and parses Cursed Inferno and Poisoned samples', async () => {
  const htmlByPage = new Map([
    ['Cursed Inferno', `
      <h2><span class="mw-headline" id="Immune_NPCs">Immune NPCs</span></h2>
      <div class="heading">Enemies immune to Cursed Inferno</div>
      <div class="terraria mw-collapsible"><div class="mw-collapsible-content"><div class="itemlist"><ul>
        <li><span class="i"><a href="/wiki/Ancient_Vision" title="Ancient Vision"><img alt="Ancient Vision" /></a><span><span><a href="/wiki/Ancient_Vision" title="Ancient Vision">Ancient Vision</a></span></span></span></li>
        <li><span class="i"><a href="/wiki/Dungeon_Guardian" title="Dungeon Guardian"><img alt="Dungeon Guardian" /></a><span><span><a href="/wiki/Dungeon_Guardian" title="Dungeon Guardian">Dungeon Guardian</a></span></span></span></li>
      </ul></div></div></div>
      <h2><span class="mw-headline" id="Notes">Notes</span></h2>
    `],
    ['Poisoned', `
      <h2><span class="mw-headline" id="Immune_NPCs">Immune NPCs</span></h2>
      <div class="heading">Enemies immune to Poisoned</div>
      <div class="terraria mw-collapsible"><div class="mw-collapsible-content"><div class="itemlist"><ul>
        <li><span class="i"><a href="/wiki/Blue_Slime" title="Blue Slime"><img alt="Blue Slime" /></a><span><span><a href="/wiki/Blue_Slime" title="Blue Slime">Blue Slime</a></span></span></span></li>
        <li><span class="i"><a href="/wiki/Hornet" title="Hornet"><img alt="Hornet" /></a><span><span><a href="/wiki/Hornet" title="Hornet">Hornet</a></span></span></span></li>
        <li><span class="i"><a href="/wiki/Dungeon_Guardian" title="Dungeon Guardian"><img alt="Dungeon Guardian" /></a><span><span><a href="/wiki/Dungeon_Guardian" title="Dungeon Guardian">Dungeon Guardian</a></span></span></span></li>
      </ul></div></div></div>
      <h2><span class="mw-headline" id="History">History</span></h2>
    `]
  ]);

  const facts = await collectBuffPageImmunityFacts({
    buffs: [
      { id: 39, englishName: 'Cursed Inferno' },
      { id: 20, englishName: 'Poisoned' }
    ],
    localizedByLang: {
      en: {
        20: { page: 'Poisoned' },
        39: { page: 'Cursed Inferno' }
      }
    },
    fetchRenderedHtml: async ({ pageTitle }) => htmlByPage.get(pageTitle),
    sampleLimit: 2
  });

  assert.equal(facts.get(39).immuneNpcCount, 2);
  assert.deepEqual(
    facts.get(39).immuneNpcSample.map((entry) => entry.name),
    ['Ancient Vision', 'Dungeon Guardian']
  );
  assert.equal(facts.get(20).immuneNpcCount, 3);
  assert.deepEqual(
    facts.get(20).immuneNpcSample.map((entry) => entry.name),
    ['Blue Slime', 'Hornet']
  );
});

test('collectBuffPageImmunityFacts falls back to zh page title when en page title is unavailable', async () => {
  const htmlByPage = new Map([
    ['诅咒狱火', `
      <h2><span class="mw-headline" id="Immune_NPCs">Immune NPCs</span></h2>
      <div class="heading">Enemies immune to Cursed Inferno</div>
      <div class="terraria mw-collapsible"><div class="mw-collapsible-content"><div class="itemlist"><ul>
        <li><span class="i"><a href="/wiki/Ancient_Vision" title="Ancient Vision"><img alt="Ancient Vision" /></a><span><span><a href="/wiki/Ancient_Vision" title="Ancient Vision">Ancient Vision</a></span></span></span></li>
      </ul></div></div></div>
    `]
  ]);

  const facts = await collectBuffPageImmunityFacts({
    buffs: [
      { id: 39, englishName: 'Cursed Inferno' }
    ],
    localizedByLang: {
      zh: {
        39: { page: '诅咒狱火' }
      }
    },
    fetchRenderedHtml: async ({ pageTitle }) => htmlByPage.get(pageTitle)
  });

  assert.equal(facts.get(39).pageTitle, '诅咒狱火');
  assert.equal(facts.get(39).immuneNpcCount, 1);
});

test('collectBuffPageImmunityFacts uses full page payload and keeps canonical revision provenance', async () => {
  const facts = await collectBuffPageImmunityFacts({
    buffs: [
      { id: 20, englishName: 'Poisoned' }
    ],
    localizedByLang: {
      en: {
        20: { page: 'Poisoned' }
      }
    },
    fetchPagePayload: async ({ pageTitle }) => {
      assert.equal(pageTitle, 'Poisoned');
      return {
        requestedPageTitle: 'Poisoned',
        pageTitle: 'Poisoned',
        canonicalPageTitle: 'Poisoned',
        revisionId: 12345,
        revisionTimestamp: '2026-05-15T00:00:00Z',
        sections: [
          { line: 'From player', anchor: 'From_player' },
          { line: 'Immune NPCs', anchor: 'Immune_NPCs' }
        ],
        wikitext: 'wiki text',
        html: `
          <h2><span class="mw-headline" id="From_player">From player</span></h2>
          <table><tr><td><a href="/wiki/Poisoned_Knife" title="Poisoned Knife">Poisoned Knife</a></td></tr></table>
          <h2><span class="mw-headline" id="Immune_NPCs">Immune NPCs</span></h2>
          <ul><li><a href="/wiki/Blue_Slime" title="Blue Slime">Blue Slime</a></li></ul>
        `
      };
    },
    sampleLimit: 1
  });

  const evidence = facts.get(20);
  assert.deepEqual(evidence.sourceItems.map((entry) => entry.name), ['Poisoned Knife']);
  assert.equal(evidence.sourceEvidence.canonicalPageTitle, 'Poisoned');
  assert.equal(evidence.sourceEvidence.revisionId, 12345);
  assert.equal(evidence.sourceEvidence.revisionTimestamp, '2026-05-15T00:00:00Z');
});

test('buff fetch writes failed redis heartbeat before exiting on startup error', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-buffs-heartbeat-failed-'));
  const binDir = path.join(tempDir, 'bin');
  const redisLog = path.join(tempDir, 'redis-cli-args.jsonl');
  const worktreeRoot = path.join(tempDir, 'feature-worktree');
  const rawDir = path.join(tempDir, 'missing', 'raw');
  const progressPath = path.join(tempDir, 'progress.json');

  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, 'redis-cli'), `#!/usr/bin/env node
const fs = require('node:fs');
  fs.appendFileSync(${JSON.stringify(redisLog)}, JSON.stringify(process.argv.slice(2)) + '\\n');
`, { mode: 0o755 });
  fs.mkdirSync(worktreeRoot, { recursive: true });
  fs.mkdirSync(path.dirname(rawDir), { recursive: true });
  fs.writeFileSync(rawDir, 'not a directory', 'utf8');

  const result = spawnSync(process.execPath, [
    scriptPath,
    `--raw-dir=${rawDir}`,
    `--progress-path=${progressPath}`
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      WORKTREE_ROOT: worktreeRoot,
      TERRAPEDIA_REDIS_HOST: '127.0.0.1',
      TERRAPEDIA_REDIS_PORT: '6380',
      TERRAPEDIA_REDIS_DATABASE: '0'
    }
  });

  assert.notEqual(result.status, 0);
  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  assertBuffProgressPayload(progress, 'failed', progressPath);
  const calls = fs.readFileSync(redisLog, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.ok(calls.some((args) => {
    return args.includes('SETEX')
      && args.includes('terrapedia:crawler:buffs:heartbeat')
      && args.some((arg) => String(arg).includes('"status":"failed"'));
  }));
});

test('buff fetch failure uses the isolated shared-data canonical progress path by default', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-buffs-default-progress-'));
  const worktreeRoot = path.join(tempDir, 'feature-worktree');
  const sharedDataRoot = path.join(tempDir, 'shared');
  const rawDir = path.join(tempDir, 'missing', 'raw');
  fs.mkdirSync(worktreeRoot, { recursive: true });
  fs.mkdirSync(path.dirname(rawDir), { recursive: true });
  fs.writeFileSync(rawDir, 'not a directory', 'utf8');

  const result = spawnSync(process.execPath, [scriptPath, `--raw-dir=${rawDir}`], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      WORKTREE_ROOT: worktreeRoot,
      TERRAPEDIA_SHARED_DATA_ROOT: sharedDataRoot,
      TERRAPEDIA_REDIS_HOST: '',
      TERRAPEDIA_REDIS_PORT: '',
      TERRAPEDIA_REDIS_DATABASE: ''
    }
  });

  assert.notEqual(result.status, 0);
  const progressPath = path.join(sharedDataRoot, 'generated', 'fetch-wiki-buffs-progress.latest.json');
  assertBuffProgressPayload(JSON.parse(fs.readFileSync(progressPath, 'utf8')), 'failed', progressPath);
});

function assertBuffProgressPayload(progress, status, progressPath) {
  for (const field of [
    'actionId',
    'status',
    'generatedAt',
    'lastHeartbeatAt',
    'childStatusPath',
    'phase',
    'message',
    'current',
    'total'
  ]) {
    assert.ok(Object.hasOwn(progress, field), `missing ${field}`);
  }
  assert.equal(progress.actionId, 'buff-page-immunity-refresh');
  assert.equal(progress.status, status);
  assert.equal(path.resolve(progress.childStatusPath), path.resolve(progressPath));
}

test('buff fetch finalizes template ingestion manifest after writing latest raw output', () => {
  const source = fs.readFileSync(scriptPath, 'utf8');

  assert.match(source, /advanceWikiIngestionManifestForSource/);
  assert.match(source, /options\['manifest-path'\]/);
  assert.match(source, /sourceKey:\s*'wiki\.page\.template_getbuffinfo'/);
  assert.match(source, /locator:\s*DEFAULT_TEMPLATE_TITLE/);
  assert.match(source, /entityFamily:\s*'buffs'/);
  assert.match(source, /sourceKind:\s*'template'/);
  assert.match(source, /outputPath:\s*latestJsonPath/);
});
