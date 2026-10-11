import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  BOUNDED_BUFF_SCOPE,
  buildCurrentBuffSourceReplay,
  assertCurrentBuffSourceReplay,
  captureCurrentBuffSource,
  fetchRevisionBoundWikiModule,
} from './buff-current-source-replay.mjs';

const TIMESTAMP = '2026-10-11T00:00:00Z';

function sourcePage({ buffId, internalName, englishName, pageTitle, pageId, revisionId, itemName, itemInternalName, itemId }) {
  const sourceItem = { name: itemName, pageTitle: itemName, internalName: itemInternalName, itemId };
  return {
    pageTitle,
    pageId,
    revisionId,
    revisionTimestamp: TIMESTAMP,
    wikitext: `== From player ==\n${itemName}`,
    html: `<h2>From player</h2><a title="${itemName}">${itemName}</a>`,
    sections: [{ anchor: 'From_player', line: 'From player' }],
    record: {
      id: buffId,
      internalName,
      englishName,
      type: 'debuff',
      sourceItems: [sourceItem],
      inflictingNpcs: [{ name: 'Clothier', pageTitle: 'Clothier', internalName: 'Clothier' }],
      immuneNpcs: [{ name: 'Ancient Vision', pageTitle: 'Ancient Vision', internalName: 'AncientVision' }],
      immuneNpcCount: 1,
      immuneNpcSample: [{ name: 'Ancient Vision', pageTitle: 'Ancient Vision', internalName: 'AncientVision' }],
      sourceEvidence: {
        provider: 'terraria.wiki.gg',
        pageTitle,
        canonicalPageTitle: pageTitle,
        parseStatus: 'parsed',
        factGroups: {
          sourceItems: { status: 'parsed', count: 1, sections: ['From player'] },
          inflictingNpcs: { status: 'parsed', count: 1, sections: ['From NPCs'] },
          immuneNpcs: { status: 'parsed', count: 1, sections: ['Immune NPCs'] },
        },
        unresolvedFacts: [],
      },
    },
  };
}

function capture(overrides = {}) {
  return buildCurrentBuffSourceReplay({
    generatedAt: TIMESTAMP,
    buffCatalogModule: {
      pageTitle: 'Template:GetBuffInfo', pageId: 55467, revisionId: 1020000,
      revisionTimestamp: TIMESTAMP,
      moduleContent: '|__buff:count|2<!--\n|__buff:iname:153|ShadowFlame<!--\n|__buff:ename:153|Shadowflame<!--\n|__buff:type:153|debuff<!--\n|__buff:iname:70|Venom<!--\n|__buff:ename:70|Acid Venom<!--\n|__buff:type:70|debuff<!--',
    },
    itemInfoModule: {
      pageTitle: 'Module:Iteminfo/data', pageId: 18020, revisionId: 1020003,
      revisionTimestamp: TIMESTAMP, moduleContent: 'return { ["data"] = [=====[{"274":{"name":"Dark Lance","internalName":"DarkLance"},"1342":{"name":"Venom Bullet","internalName":"VenomBullet"}}]=====] }',
    },
    pages: [
      sourcePage({ buffId: 153, internalName: 'ShadowFlame', englishName: 'Shadowflame', pageTitle: 'Shadowflame', pageId: 9767, revisionId: 1020001, itemName: 'Dark Lance', itemInternalName: 'DarkLance', itemId: 274 }),
      sourcePage({ buffId: 70, internalName: 'Venom', englishName: 'Acid Venom', pageTitle: 'Acid Venom', pageId: 8675, revisionId: 1020002, itemName: 'Venom Bullet', itemInternalName: 'VenomBullet', itemId: 1342 }),
    ],
    ...overrides,
  });
}

test('bounded source scope is exactly ShadowFlame and Venom', () => {
  assert.deepEqual(BOUNDED_BUFF_SCOPE, [
    { id: 153, internalName: 'ShadowFlame' },
    { id: 70, internalName: 'Venom' },
  ]);
});

test('source replay rejects fixture identity, source drift, missing revision/hash, and forbidden Redis DBs', () => {
  const value = capture({ testRedisLogicalDb: 18 });
  assert.doesNotThrow(() => assertCurrentBuffSourceReplay(value));
  assert.throws(() => assertCurrentBuffSourceReplay({ ...value, manual_source_replay: false }), /manual_source_replay/i);
  for (const testRedisLogicalDb of [13, 14, 15, 16, 17]) {
    assert.throws(() => assertCurrentBuffSourceReplay({ ...value, testRedisLogicalDb }), /Redis DB18/i);
  }
  assert.throws(() => assertCurrentBuffSourceReplay({ ...value, records: value.records.map((record) => ({ ...record, fixtureId: 'buff-t1' })) }), /fixture/i);
  assert.throws(() => assertCurrentBuffSourceReplay({ ...value, records: [{ ...value.records[0], id: 1 }, value.records[1]] }), /scope|153|70/i);
  const missingRevision = structuredClone(value);
  delete missingRevision.records[0].sourceEvidence.revisionId;
  assert.throws(() => assertCurrentBuffSourceReplay(missingRevision), /revision/i);
  const badHash = structuredClone(value);
  badHash.source.module.rawSha256 = 'sha256:' + '0'.repeat(64);
  assert.throws(() => assertCurrentBuffSourceReplay(badHash), /hash/i);
});

test('source replay builder binds captured module and page revisions without fixture labels', () => {
  const value = capture();
  assert.equal(value.manual_source_replay, true);
  assert.equal(value.databaseWritesToFormalRuntime, false);
  assert.equal(value.testRedisLogicalDb, 18);
  assert.equal(value.records.length, 2);
  assert.ok(/^sha256:[a-f0-9]{64}$/.test(value.snapshotSha256));
  assert.ok(value.records.every((record) => record.sourceEvidence.revisionId > 0));
  assert.ok(value.records.every((record) => /^sha256:[a-f0-9]{64}$/.test(record.sourceEvidence.rawSha256)));
  assert.equal(value.records.some((record) => Object.hasOwn(record, 'fixtureId')), false);
});

test('module request reads current revision identity and rejects unregistered module titles', async () => {
  let requestedUrl;
  const result = await fetchRevisionBoundWikiModule({
    moduleTitle: 'Template:GetBuffInfo',
    fetchApiJsonImpl: async ({ url }) => {
      requestedUrl = new URL(url);
      return { query: { pages: [{ pageid: 55467, title: 'Template:GetBuffInfo', revisions: [{ revid: 1020000, timestamp: TIMESTAMP, slots: { main: { content: 'current module' } } }] }] } };
    },
  });
  assert.equal(result.revisionId, 1020000);
  assert.equal(requestedUrl.searchParams.get('rvprop'), 'ids|timestamp|content');
  await assert.rejects(() => fetchRevisionBoundWikiModule({ moduleTitle: 'Module:Npcinfo/data' }), /registered Wiki modules/i);
});

test('capture writes running progress before its first Wiki request and terminal failure afterward', async () => {
  const directory = await import('node:fs/promises').then((fs) => fs.mkdtemp('/tmp/buff-source-progress-'));
  const { readFile, rm } = await import('node:fs/promises');
  const progressPath = `${directory}/progress.json`;
  let firstRequestProgress = null;
  try {
    await assert.rejects(() => captureCurrentBuffSource({
      progressPath,
      fetchModuleImpl: async () => {
        firstRequestProgress = JSON.parse(await readFile(progressPath, 'utf8'));
        throw new Error('bounded source probe stop');
      },
    }), /bounded source probe stop/);
    assert.equal(firstRequestProgress.status, 'running');
    assert.equal(firstRequestProgress.actionId, 'buff-page-immunity-refresh');
    assert.ok(firstRequestProgress.lastHeartbeatAt);
    const terminal = JSON.parse(await readFile(progressPath, 'utf8'));
    assert.equal(terminal.status, 'failed');
    assert.equal(terminal.actionId, 'buff-page-immunity-refresh');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('bounded capture parses both current page payloads and binds page item identities to Iteminfo', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'buff-source-replay-capture-'));
  const progressPath = path.join(directory, 'progress.json');
  const titles = [];
  const catalogContent = '|__buff:count|2<!--\n|__buff:iname:153|ShadowFlame<!--\n|__buff:ename:153|Shadowflame<!--\n|__buff:type:153|debuff<!--\n|__buff:iname:70|Venom<!--\n|__buff:ename:70|Acid Venom<!--\n|__buff:type:70|debuff<!--';
  const iteminfoContent = 'return { ["data"] = [=====[{"274":{"name":"Dark Lance","internalName":"DarkLance"},"1342":{"name":"Venom Bullet","internalName":"VenomBullet"}}]=====] }';
  const pages = new Map([
    ['Shadowflame', { pageId: 9767, revisionId: 1020001 }],
    ['Acid Venom', { pageId: 8675, revisionId: 1020002 }],
  ]);
  try {
    const replay = await captureCurrentBuffSource({
      progressPath,
      generatedAt: TIMESTAMP,
      fetchModuleImpl: async ({ moduleTitle }) => {
        titles.push(moduleTitle);
        return {
          pageTitle: moduleTitle,
          pageId: moduleTitle === 'Template:GetBuffInfo' ? 55467 : 18020,
          revisionId: moduleTitle === 'Template:GetBuffInfo' ? 1020000 : 1020003,
          revisionTimestamp: TIMESTAMP,
          moduleContent: moduleTitle === 'Template:GetBuffInfo' ? catalogContent : iteminfoContent,
        };
      },
      fetchPageImpl: async ({ pageTitle }) => {
        const revision = pages.get(pageTitle);
        return {
          pageTitle,
          ...revision,
          revisionTimestamp: TIMESTAMP,
          wikitext: `== From player ==\n[[${pageTitle === 'Shadowflame' ? 'Dark Lance' : 'Venom Bullet'}]]\n== From NPCs ==\n[[Clothier]]\n== Immune NPCs ==\n{{immunities|${pageTitle}}}`,
          html: `<h2><span class="mw-headline" id="From_player">From player</span></h2><ul><li><a title="${pageTitle === 'Shadowflame' ? 'Dark Lance' : 'Venom Bullet'}">${pageTitle === 'Shadowflame' ? 'Dark Lance' : 'Venom Bullet'}</a></li></ul><h2><span class="mw-headline" id="From_NPCs">From NPCs</span></h2><ul><li><a title="Clothier">Clothier</a></li></ul><h2><span class="mw-headline" id="Immune_NPCs">Immune NPCs</span></h2><div class="heading">Enemies immune to ${pageTitle}</div><ul><li><a title="Ancient Vision">Ancient Vision</a></li></ul>`,
          sections: [
            { anchor: 'From_player', line: 'From player' },
            { anchor: 'From_NPCs', line: 'From NPCs' },
            { anchor: 'Immune_NPCs', line: 'Immune NPCs' },
          ],
        };
      },
    });
    assertCurrentBuffSourceReplay(replay);
    assert.deepEqual(titles, ['Template:GetBuffInfo', 'Module:Iteminfo/data']);
    assert.deepEqual(replay.records.map((record) => record.sourceItems[0].itemId), [274, 1342]);
    assert.equal(replay.records[0].sourceEvidence.revisionId, 1020001);
    assert.equal(replay.records[1].sourceEvidence.revisionId, 1020002);
    const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
    assert.equal(progress.status, 'completed');
    assert.equal(progress.current, 4);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
