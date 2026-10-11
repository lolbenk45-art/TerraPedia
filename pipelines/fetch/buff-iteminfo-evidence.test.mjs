import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { verifyBuffIteminfoCapture, verifyBuffIteminfoSemanticCapture } from './buff-iteminfo-evidence.mjs';
import { buildBuffRecords } from './fetch-wiki-buffs.mjs';

const hash = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
function iteminfoFixture() {
  const inputBytes = Buffer.from(JSON.stringify({ buffs: [{ id: 1, internalName: 'ObsidianSkin' }] }));
  const data = JSON.stringify({ 288: { name: 'Obsidian Skin Potion', internalName: 'ObsidianSkinPotion', buffType: 1, buffTime: 21600 }, 2: { name: 'Other' } });
  const rawBytes = Buffer.from(JSON.stringify({ pageTitle: 'Module:Iteminfo/data', pageId: 18021,
    revisionId: 42, revisionTimestamp: '2026-09-30T00:00:00Z',
    wikitext: `return { ["data"] = [=====[${data}]=====] }` }));
  const manifestBytes = Buffer.from(JSON.stringify({ schemaVersion: 'buff-page-raw-capture/v1', sourceKind: 'iteminfo',
    status: 'completed', input: { sha256: hash(inputBytes) }, selectedBuffIds: [1],
    pages: [{ pageTitle: 'Module:Iteminfo/data', requestedPageTitle: 'Module:Iteminfo/data', revisionId: 42,
      buffIds: [1], sha256: hash(rawBytes) }] }));
  return { inputBytes, rawBytes, manifestBytes };
}

function replaceModuleData(capture, data) {
  const raw = JSON.parse(capture.rawBytes);
  raw.wikitext = `return { ["data"] = [=====[${JSON.stringify(data)}]=====] }`;
  const rawBytes = Buffer.from(JSON.stringify(raw));
  const manifest = JSON.parse(capture.manifestBytes);
  manifest.pages[0].sha256 = hash(rawBytes);
  return { ...capture, rawBytes, manifestBytes: Buffer.from(JSON.stringify(manifest)) };
}

function iteminfoSemanticFixture() {
  const inputBytes = Buffer.from(JSON.stringify({ buffs: [
    { id: 1, internalName: 'ObsidianSkin' },
    { id: 2, internalName: 'Regeneration' },
  ] }));
  const pages = [
    ['Module:Iteminfo/data', '-- This module contains a database with the statistics of all items, which is queried by Module:Iteminfo.\n-- It was generated from Module:Iteminfo/datagen.\nreturn { ["data"] = [=====[{"288":{"name":"Obsidian Skin Potion","internalName":"ObsidianSkinPotion","buffType":1,"buffTime":21600}}]=====] }'],
    ['Module:Iteminfo/doc', 'The buffType field identifies the Buff ID applied by an item.'],
    ['Module:Iteminfo/datagen', 'The generator emits every item row into Module:Iteminfo/data via convertToJsonData.'],
  ].map(([pageTitle, wikitext], index) => {
    const raw = { pageTitle, pageId: 19000 + index, revisionId: 52 + index,
      revisionTimestamp: '2026-09-30T00:00:00Z', wikitext };
    const rawBytes = Buffer.from(JSON.stringify(raw));
    return { ...raw, requestedPageTitle: pageTitle, rawBytes, sha256: hash(rawBytes) };
  });
  const manifest = {
    schemaVersion: 'buff-semantic-raw-capture/v1', sourceKind: 'iteminfo-semantics', status: 'completed',
    input: { sha256: hash(inputBytes) }, selectedBuffIds: [1, 2],
    pages: pages.map(page => ({ pageTitle: page.pageTitle, requestedPageTitle: page.pageTitle,
      pageId: page.pageId, revisionId: page.revisionId, revisionTimestamp: page.revisionTimestamp,
      buffIds: [1, 2], sha256: page.sha256 })),
  };
  return { inputBytes, manifestBytes: Buffer.from(JSON.stringify(manifest)), semanticCapture: { pages } };
}

test('zero buffType is no positive assertion; malformed positive identities and durations fail', () => {
  const capture = iteminfoFixture();
  assert.deepEqual(verifyBuffIteminfoCapture(replaceModuleData(capture, { 0: { buffType: 0 } })).assertions, []);
  for (const data of [
    { 0: { buffType: 1, internalName: 'Bad' } },
    { 288: { buffType: true, internalName: 'Bad' } },
    { 288: { buffType: '1', internalName: 'Bad' } },
    { '9007199254740992': { buffType: 1, internalName: 'Bad' } },
    { 288: { buffType: 1, internalName: 'Bad', buffTime: -1 } },
    { 288: { buffType: 1, internalName: 'Bad', buffTime: 'invalid' } },
    { 288: { buffType: 1, internalName: 'One' }, '0288': { buffType: 1, internalName: 'Two' } },
  ]) assert.throws(() => verifyBuffIteminfoCapture(replaceModuleData(capture, data)));
});

test('verifier derives positive item assertions from exact bound module bytes', () => {
  const capture = iteminfoFixture();
  const result = verifyBuffIteminfoCapture(capture);
  assert.equal(result.source.revisionId, 42);
  assert.equal(result.source.rawSha256, hash(capture.rawBytes));
  assert.equal(result.source.manifestSha256, hash(capture.manifestBytes));
  assert.equal(result.scope[0].internalName, 'ObsidianSkin');
  assert.deepEqual(result.assertions, [{ buffId: 1, buffInternalName: 'ObsidianSkin', itemId: 288,
    internalName: 'ObsidianSkinPotion', name: 'Obsidian Skin Potion', buffTime: 21600 }]);
  assert.equal(result.completeness, 'positive-assertions-only');
});

test('raw and input corruption fails hash binding', () => {
  for (const key of ['inputBytes', 'rawBytes']) {
    const capture = iteminfoFixture();
    capture[key] = Buffer.concat([capture[key], Buffer.from(' ')]);
    assert.throws(() => verifyBuffIteminfoCapture(capture), /hash/);
  }
});

test('wrong module, revision drift, invalid identities and out-of-scope targets fail closed', () => {
  for (const [label, mutate] of [
    ({ raw }) => { raw.pageTitle = 'Module:Other'; },
    ({ raw }) => { raw.revisionId = 43; },
    ({ raw }) => { raw.pageId = null; },
    ({ raw }) => { raw.revisionTimestamp = 'invalid'; },
    ({ raw }) => { raw.wikitext = raw.wikitext.replace('"buffType":1', '"buffType":2'); },
    ({ input }) => { input.buffs.push(input.buffs[0]); },
    ({ input }) => { input.buffs[0].internalName = ''; },
    ({ manifest }) => { manifest.pages[0].buffIds = [2]; },
    ({ manifest }) => { manifest.selectedBuffIds = [2]; },
    ({ manifest }) => { manifest.status = 'failed'; },
  ].map((mutate, index) => [`case-${index}`, mutate])) {
    const original = iteminfoFixture();
    const value = { input: JSON.parse(original.inputBytes), raw: JSON.parse(original.rawBytes), manifest: JSON.parse(original.manifestBytes) };
    mutate(value);
    const inputBytes = Buffer.from(JSON.stringify(value.input));
    const rawBytes = Buffer.from(JSON.stringify(value.raw));
    value.manifest.input.sha256 = hash(inputBytes);
    value.manifest.pages[0].sha256 = hash(rawBytes);
    assert.throws(() => verifyBuffIteminfoCapture({ inputBytes, rawBytes, manifestBytes: Buffer.from(JSON.stringify(value.manifest)) }), undefined, label);
  }
});

test('grouped revision-bound assertions feed source items without certifying page completeness', () => {
  const capture = iteminfoFixture();
  const result = verifyBuffIteminfoCapture(capture);
  const options = {
    baseBuffs: [{ id: 1, internalName: 'ObsidianSkin', englishName: 'Obsidian Skin' }],
    localizedByLang: {}, langs: [], pageFacts: new Map([[1, {
      sourceItems: [], inflictingNpcs: [], immuneNpcs: [], immuneNpcCount: 0, immuneNpcSample: [],
      sourceEvidence: { parseStatus: 'parse_incomplete', unresolvedFacts: [{ group: 'sourceItems', status: 'section_missing', sections: [] }],
        factGroups: { sourceItems: { status: 'section_missing', sections: [] }, immuneNpcs: { status: 'target_unverified', sections: ['Immune NPCs'] } } }
    }]]),
    iteminfoCapture: capture,
    relations: { sourceItemsByBuffId: new Map(), immuneNpcCountByBuffId: new Map(), immuneNpcSampleByBuffId: new Map(),
      immuneNpcSourceByBuffId: new Map(), immuneNpcSampleSemanticsByBuffId: new Map() },
  };
  const [record] = buildBuffRecords(options);
  assert.equal(record.sourceItemsSource, 'iteminfo-revision-bound');
  assert.equal(record.sourceItems.length, 1);
  assert.deepEqual(record.sourceEvidence.sourceItemEvidence, { ...result.source, buffId: 1, buffInternalName: 'ObsidianSkin', completeness: 'positive-assertions-only' });
  assert.equal(record.sourceEvidence.parseStatus, 'parse_incomplete');
  assert.throws(() => buildBuffRecords({ ...options, baseBuffs: [{ id: 1, internalName: 'Different' }] }), /identity/);
  assert.throws(() => buildBuffRecords({ ...options, iteminfoCapture: { ...capture, rawBytes: Buffer.from('{}') } }), /hash/);
});

test('semantic Iteminfo capture proves exhaustive item scope and preserves empty Buff groups', () => {
  const capture = iteminfoSemanticFixture();
  const result = verifyBuffIteminfoSemanticCapture(capture);
  assert.equal(result.completeness, 'complete-exhaustive-item-scope');
  assert.deepEqual(result.assertionsByBuffId[1].map(row => row.itemId), [288]);
  assert.deepEqual(result.assertionsByBuffId[2], []);
  assert.equal(result.semantic.schemaVersion, 'buff-iteminfo-semantic/v1');
  assert.equal(result.source.pages.length, 3);
});

test('semantic Iteminfo verifier fails closed when the documentation or generator contract drifts', () => {
  for (const mutate of [
    capture => { const page = capture.semanticCapture.pages[1]; page.wikitext = 'buffType is described'; },
    capture => { const page = capture.semanticCapture.pages[2]; page.wikitext = 'generator output changed'; },
    capture => { capture.semanticCapture.pages.pop(); },
    capture => { capture.semanticCapture.pages[0].revisionId += 1; },
  ]) {
    const capture = iteminfoSemanticFixture();
    mutate(capture);
    assert.throws(() => verifyBuffIteminfoSemanticCapture(capture));
  }
});

test('buildBuffRecords replaces a missing source-item group only with complete semantic Iteminfo evidence', () => {
  const capture = iteminfoSemanticFixture();
  const options = {
    baseBuffs: [
      { id: 1, internalName: 'ObsidianSkin', englishName: 'Obsidian Skin' },
      { id: 2, internalName: 'Regeneration', englishName: 'Regeneration' },
    ],
    localizedByLang: {}, langs: [],
    pageFacts: new Map([1, 2].map(id => [id, {
      sourceItems: [], inflictingNpcs: [], immuneNpcs: [], immuneNpcCount: 0, immuneNpcSample: [],
      sourceEvidence: { parseStatus: 'parse_incomplete', unresolvedFacts: [
        { group: 'sourceItems', status: 'section_missing', sections: [] },
        { group: 'inflictingNpcs', status: 'section_missing', sections: [] },
      ], factGroups: {
        sourceItems: { status: 'section_missing', sections: [] },
        inflictingNpcs: { status: 'section_missing', sections: [] },
        immuneNpcs: { status: 'section_missing', sections: [] },
      } }
    }])),
    iteminfoSemanticCapture: capture,
    relations: { sourceItemsByBuffId: new Map([[2, [{ itemId: 999, internalName: 'OldFallback' }]]]),
      immuneNpcCountByBuffId: new Map(), immuneNpcSampleByBuffId: new Map(),
      immuneNpcSourceByBuffId: new Map(), immuneNpcSampleSemanticsByBuffId: new Map() },
  };
  const records = buildBuffRecords(options);
  assert.deepEqual(records[0].sourceItems.map(row => row.itemId), [288]);
  assert.deepEqual(records[1].sourceItems, []);
  assert.equal(records[1].sourceItemsSource, 'iteminfo-revision-bound');
  assert.equal(records[1].sourceEvidence.sourceItemEvidence.completeness, 'complete-exhaustive-item-scope');
  assert.deepEqual(records[1].sourceEvidence.unresolvedFacts.map(fact => fact.group), ['inflictingNpcs']);
  assert.equal(records[1].sourceEvidence.factGroups.sourceItems.status, 'parsed');
});
