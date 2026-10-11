import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';

import {
  runCaptureBuffPageEvidence,
  verifyBuffNpcPageInflictionCapture,
} from './buff-npc-infliction-evidence.mjs';

const BUFF_INPUT = {
  buffs: [
    { id: 37, internalName: 'Horrified', englishName: 'Horrified' },
    { id: 38, internalName: 'TheTongue', englishName: 'The Tongue' },
  ],
};

const TARGET_SOURCE_BYTES = Buffer.from('standardized NPC source fixture');
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

const WALL_PAGE = {
  requestedPageTitle: 'Wall of Flesh',
  pageTitle: 'Wall of Flesh',
  pageId: 10220,
  revisionId: 1032375,
  revisionTimestamp: '2026-09-28T10:16:13Z',
  wikitext: `{{npc infobox
| auto = 113
| image = Wall of Flesh.gif
| debuff = Horrified
| debuffduration = While the player is within 120 tiles from the boss.
| debuff2 = The Tongue
| debuffduration2 = While the player is inflicted with Horrified.
}}
`,
  html: '<th>Immune to</th><td>On Fire!</td>',
  sections: [],
};

const TARGETS = {
  schemaVersion: 'buff-npc-page-targets/v1',
  scope: 'all-standardized-npc-page-targets',
  totalTargets: 1,
  sourceSha256: hash(TARGET_SOURCE_BYTES),
  targets: [{
    pageTitle: 'Wall of Flesh',
    entityId: 'wall-of-flesh',
    targetEntityIds: ['wall-of-flesh'],
    standardizedRecords: [{ id: 113, internalName: 'WallofFlesh', name: 'Wall of Flesh' }],
  }],
};

function captureBytes() {
  const inputBytes = Buffer.from(JSON.stringify(BUFF_INPUT));
  const targetsBytes = Buffer.from(JSON.stringify(TARGETS));
  const rawBytes = Buffer.from(JSON.stringify(WALL_PAGE));
  const manifestBytes = Buffer.from(JSON.stringify({
    schemaVersion: 'buff-npc-page-infliction-raw-capture/v1',
    sourceKind: 'npc-page-inflictions',
    status: 'completed',
    input: { sha256: hash(inputBytes), buffIds: [37, 38] },
    targets: { sha256: hash(targetsBytes), pageCount: 1, scope: TARGETS.scope, totalTargets: TARGETS.totalTargets, sourceSha256: TARGETS.sourceSha256 },
    scopeCompleteness: 'all-npc-page-targets',
    pages: [{
      requestedPageTitle: 'Wall of Flesh',
      pageTitle: 'Wall of Flesh',
      pageId: 10220,
      revisionId: 1032375,
      revisionTimestamp: WALL_PAGE.revisionTimestamp,
      targetPageTitle: 'Wall of Flesh',
      standardizedRecords: TARGETS.targets[0].standardizedRecords,
      path: 'page-001.json',
      sha256: hash(rawBytes),
    }],
  }));
  return { inputBytes, targetsBytes, manifestBytes, rawPages: [{ path: 'page-001.json', bytes: rawBytes }], standardizedBytes: TARGET_SOURCE_BYTES };
}

test('verifies an exhaustive revision-bound NPC page capture and reverse infliction map', () => {
  const result = verifyBuffNpcPageInflictionCapture(captureBytes());
  assert.equal(result.completeness, 'complete-exhaustive-npc-page-scope');
  assert.deepEqual(result.facts.map(fact => [fact.npcSourceId, fact.buffId]), [[113, 37], [113, 38]]);
  assert.deepEqual(result.source.factSources, [{
    pageTitle: 'Wall of Flesh', pageId: 10220, revisionId: 1032375,
    revisionTimestamp: WALL_PAGE.revisionTimestamp, rawSha256: hash(captureBytes().rawPages[0].bytes),
  }]);
  assert.equal(result.facts[0].sourceRawSha256, result.source.factSources[0].rawSha256);
  assert.deepEqual(result.factsByBuffId['37'].map(fact => fact.npcInternalName), ['WallofFlesh']);
  assert.equal(result.factsByBuffId['99']?.length ?? 0, 0);
});

test('verifies an unkeyed named top-level infobox as the requested NPC identity', () => {
  const inputBytes = Buffer.from(JSON.stringify({ buffs: [{ id: 24, internalName: 'OnFire', englishName: 'On Fire!' }] }));
  const targets = {
    ...TARGETS,
    totalTargets: 1,
    targets: [{
      pageTitle: 'Golem',
      entityId: 'golem',
      targetEntityIds: ['golem'],
      standardizedRecords: [{ id: 245, internalName: 'Golem', name: 'Golem' }],
    }],
  };
  const targetsBytes = Buffer.from(JSON.stringify(targets));
  const raw = {
    requestedPageTitle: 'Golem',
    pageTitle: 'Golem',
    pageId: 14022,
    revisionId: 1032187,
    revisionTimestamp: '2026-09-27T15:39:23Z',
    wikitext: `{{npc infobox
| name = Golem
| debuff = On Fire!
| debuffduration = permanent
}}
{{npc infobox|auto=246|name=Golem Head}}`,
  };
  const rawBytes = Buffer.from(JSON.stringify(raw));
  const manifestBytes = Buffer.from(JSON.stringify({
    schemaVersion: 'buff-npc-page-infliction-raw-capture/v1',
    sourceKind: 'npc-page-inflictions',
    status: 'completed',
    input: { sha256: hash(inputBytes), buffIds: [24] },
    targets: { sha256: hash(targetsBytes), pageCount: 1, scope: TARGETS.scope, totalTargets: 1, sourceSha256: TARGETS.sourceSha256 },
    scopeCompleteness: 'all-npc-page-targets',
    pages: [{
      requestedPageTitle: 'Golem',
      targetPageTitle: 'Golem',
      pageTitle: 'Golem',
      resolvedPageTitle: 'Golem',
      rawRequestedPageTitle: 'Golem',
      pageId: raw.pageId,
      revisionId: raw.revisionId,
      revisionTimestamp: raw.revisionTimestamp,
      path: 'page-001.json',
      sha256: hash(rawBytes),
    }],
  }));

  const result = verifyBuffNpcPageInflictionCapture({
    inputBytes,
    targetsBytes,
    manifestBytes,
    standardizedBytes: TARGET_SOURCE_BYTES,
    rawPages: [{ path: 'page-001.json', bytes: rawBytes }],
  });

  assert.deepEqual(result.facts.map(fact => [fact.npcSourceId, fact.buffId]), [[245, 24]]);
  assert.deepEqual(result.source.unresolvedNpcSourceIds, []);
});

test('retains summary inflictions when a component repeats the same NPC auto ID', () => {
  const capture = captureBytes();
  const raw = JSON.parse(capture.rawPages[0].bytes);
  raw.wikitext += '{{npc infobox|auto=113|image=Wall of Flesh Mouth.gif}}';
  capture.rawPages[0].bytes = Buffer.from(JSON.stringify(raw));
  const manifest = JSON.parse(capture.manifestBytes);
  manifest.pages[0].sha256 = hash(capture.rawPages[0].bytes);
  capture.manifestBytes = Buffer.from(JSON.stringify(manifest));

  const result = verifyBuffNpcPageInflictionCapture(capture);
  assert.deepEqual(result.facts.map(fact => [fact.npcSourceId, fact.buffId]), [[113, 37], [113, 38]]);
});

test('does not certify variant rows without debuff fields as empty when a shared page has inflictions', () => {
  const capture = captureBytes();
  const targets = JSON.parse(capture.targetsBytes);
  targets.targets[0].standardizedRecords.push({ id: 114, internalName: 'WallofFleshEye', name: 'Wall of Flesh Eye' });
  capture.targetsBytes = Buffer.from(JSON.stringify(targets));
  const raw = JSON.parse(capture.rawPages[0].bytes);
  raw.wikitext += '{{npc infobox|auto=114|image=Wall of Flesh Eye.gif}}';
  capture.rawPages[0].bytes = Buffer.from(JSON.stringify(raw));
  const manifest = JSON.parse(capture.manifestBytes);
  manifest.targets.sha256 = hash(capture.targetsBytes);
  manifest.pages[0].sha256 = hash(capture.rawPages[0].bytes);
  capture.manifestBytes = Buffer.from(JSON.stringify(manifest));

  const result = verifyBuffNpcPageInflictionCapture(capture);
  assert.equal(result.completeness, 'complete-exhaustive-npc-page-scope-with-unresolved-variants');
  assert.deepEqual(result.source.unresolvedNpcSourceIds, [114]);
  assert.deepEqual(result.facts.map(fact => [fact.npcSourceId, fact.buffId]), [[113, 37], [113, 38]]);
});

test('permits a verified empty infliction page but never derives facts from Immune to HTML', () => {
  const capture = captureBytes();
  const raw = JSON.parse(capture.rawPages[0].bytes);
  raw.wikitext = '{{npc infobox|auto=113|image=Wall of Flesh.gif}}';
  capture.rawPages[0].bytes = Buffer.from(JSON.stringify(raw));
  const manifest = JSON.parse(capture.manifestBytes);
  manifest.pages[0].sha256 = hash(capture.rawPages[0].bytes);
  capture.manifestBytes = Buffer.from(JSON.stringify(manifest));
  const result = verifyBuffNpcPageInflictionCapture(capture);
  assert.deepEqual(result.facts, []);
});

test('rejects target, page, hash, and source-identity drift before promotion', () => {
  const cases = [
    ['input drift', capture => { const value = JSON.parse(capture.inputBytes); value.buffs[0].id = 99; capture.inputBytes = Buffer.from(JSON.stringify(value)); }, /input hash/],
    ['target drift', capture => { const value = JSON.parse(capture.targetsBytes); value.targets[0].pageTitle = 'Moon Lord'; capture.targetsBytes = Buffer.from(JSON.stringify(value)); }, /target hash/],
    ['page drift', capture => { const value = JSON.parse(capture.rawPages[0].bytes); value.pageTitle = 'Moon Lord'; capture.rawPages[0].bytes = Buffer.from(JSON.stringify(value)); const manifest = JSON.parse(capture.manifestBytes); manifest.pages[0].sha256 = hash(capture.rawPages[0].bytes); capture.manifestBytes = Buffer.from(JSON.stringify(manifest)); }, /revision binding/],
    ['raw hash drift', capture => { capture.rawPages[0].bytes = Buffer.from(JSON.stringify({ ...WALL_PAGE, revisionId: 999 })); }, /raw page hash/],
    ['missing NPC infobox', capture => { const value = JSON.parse(capture.rawPages[0].bytes); value.wikitext = '{{npc infobox|auto=114|image=Other.gif}}'; capture.rawPages[0].bytes = Buffer.from(JSON.stringify(value)); capture.manifestBytes = Buffer.from(JSON.stringify({ ...JSON.parse(capture.manifestBytes), pages: [{ ...JSON.parse(capture.manifestBytes).pages[0], sha256: hash(capture.rawPages[0].bytes) }] })); }, /NPC identity/],
  ];
  for (const [label, mutate, pattern] of cases) {
    const capture = captureBytes();
    mutate(capture);
    assert.throws(() => verifyBuffNpcPageInflictionCapture(capture), pattern, label);
  }
});

test('capture mode writes monitor-visible progress before the first NPC page request', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buff-npc-capture-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const inputPath = path.join(root, 'buffs.json');
  const targetsPath = path.join(root, 'targets.json');
  const outputDir = path.join(root, 'capture');
  const progressPath = path.join(root, 'progress.json');
  fs.writeFileSync(inputPath, JSON.stringify(BUFF_INPUT));
  fs.writeFileSync(targetsPath, JSON.stringify(TARGETS));
  const calls = [];
  const result = await runCaptureBuffPageEvidence({
    'source-kind': 'npc-page-inflictions',
    input: inputPath,
    'npc-targets': targetsPath,
    'output-dir': outputDir,
    'progress-path': progressPath,
  }, {
    repoRoot: root,
    writeRedisState: async () => {},
    fetchPage: async options => {
      calls.push(options);
      assert.equal(JSON.parse(fs.readFileSync(progressPath)).status, 'running');
      return WALL_PAGE;
    },
  });
  assert.deepEqual(calls, [{ pageTitle: 'Wall of Flesh', requireRevisionBinding: true }]);
  assert.equal(result.sourceKind, 'npc-page-inflictions');
  assert.equal(result.scopeCompleteness, 'all-npc-page-targets');
  assert.equal(result.pages.length, 1);
  assert.equal(JSON.parse(fs.readFileSync(progressPath)).status, 'completed');
});

test('verifies redirect targets that share one resolved revision-bound raw page', () => {
  const inputBytes = Buffer.from(JSON.stringify(BUFF_INPUT));
  const targets = {
    ...TARGETS,
    totalTargets: 2,
    targets: [
      { pageTitle: 'Moon Lord', targetEntityIds: ['moon-lord'], standardizedRecords: [{ id: 396, internalName: 'MoonLordHead', name: 'Moon Lord' }] },
      { pageTitle: "Moon Lord's Core", targetEntityIds: ['moon-lord-s-core'], standardizedRecords: [{ id: 398, internalName: 'MoonLordCore', name: "Moon Lord's Core" }] },
    ],
  };
  const targetsBytes = Buffer.from(JSON.stringify(targets));
  const raw = {
    requestedPageTitle: 'Moon Lord', pageTitle: 'Moon Lord', pageId: 7426,
    revisionId: 1029946, revisionTimestamp: '2026-09-16T20:11:12Z',
    wikitext: `{{npc infobox
| auto = 396
| image = Moon Lord.gif
| debuff = Horrified
}}
{{npc infobox
| auto = 398
| image = Moon Lord's Core.gif
| debuff = The Tongue
}}`,
  };
  const rawBytes = Buffer.from(JSON.stringify(raw));
  const manifestBytes = Buffer.from(JSON.stringify({
    schemaVersion: 'buff-npc-page-infliction-raw-capture/v1', sourceKind: 'npc-page-inflictions',
    status: 'completed', input: { sha256: hash(inputBytes), buffIds: [37, 38] },
    targets: { sha256: hash(targetsBytes), pageCount: 2, scope: TARGETS.scope, totalTargets: 2, sourceSha256: TARGETS.sourceSha256 },
    scopeCompleteness: 'all-npc-page-targets',
    pages: [
      { requestedPageTitle: 'Moon Lord', targetPageTitle: 'Moon Lord', pageTitle: 'Moon Lord', resolvedPageTitle: 'Moon Lord', rawRequestedPageTitle: 'Moon Lord',
        pageId: raw.pageId, revisionId: raw.revisionId, revisionTimestamp: raw.revisionTimestamp, path: 'page-001.json', sha256: hash(rawBytes) },
      { requestedPageTitle: "Moon Lord's Core", targetPageTitle: "Moon Lord's Core", pageTitle: 'Moon Lord', resolvedPageTitle: 'Moon Lord', rawRequestedPageTitle: 'Moon Lord',
        pageId: raw.pageId, revisionId: raw.revisionId, revisionTimestamp: raw.revisionTimestamp, path: 'page-001.json', sha256: hash(rawBytes) },
    ],
  }));
  const result = verifyBuffNpcPageInflictionCapture({
    inputBytes, targetsBytes, manifestBytes,
    standardizedBytes: TARGET_SOURCE_BYTES,
    rawPages: [{ path: 'page-001.json', bytes: rawBytes }],
  });
  assert.deepEqual(result.facts.map(fact => [fact.npcSourceId, fact.buffId]), [[396, 37], [398, 38]]);
});

test('records explicit no-page NPC exclusions without certifying an exhaustive replacement scope', () => {
  const capture = captureBytes();
  const targets = JSON.parse(capture.targetsBytes);
  targets.totalNpcRecords = 2;
  targets.pageNpcRecords = 1;
  targets.excludedNpcRecords = [{ id: 999, internalName: 'InternalPlaceholder', name: null,
    exclusionStatus: 'missing-dedicated-page', exclusionReason: 'placeholder_or_internal_test_helper_no_loot' }];
  capture.targetsBytes = Buffer.from(JSON.stringify(targets));
  const manifest = JSON.parse(capture.manifestBytes);
  manifest.targets.sha256 = hash(capture.targetsBytes);
  manifest.targets.totalNpcRecords = 2;
  manifest.targets.pageNpcRecords = 1;
  manifest.targets.excludedNpcCount = 1;
  capture.manifestBytes = Buffer.from(JSON.stringify(manifest));
  const result = verifyBuffNpcPageInflictionCapture(capture);
  assert.equal(result.completeness, 'complete-exhaustive-npc-page-scope-with-exclusions');
  assert.deepEqual(result.source.excludedNpcSourceIds, [999]);
  assert.equal(result.source.excludedNpcCount, 1);
});

test('accepts an explicitly reviewed source variant without a dedicated page', () => {
  const capture = captureBytes();
  const targets = JSON.parse(capture.targetsBytes);
  targets.totalNpcRecords = 2;
  targets.pageNpcRecords = 1;
  targets.excludedNpcRecords = [{ id: 999, internalName: 'InternalVariant', name: 'Variant',
    exclusionStatus: 'missing-dedicated-page', exclusionReason: 'no_dedicated_page_source_variant' }];
  capture.targetsBytes = Buffer.from(JSON.stringify(targets));
  const manifest = JSON.parse(capture.manifestBytes);
  manifest.targets.sha256 = hash(capture.targetsBytes);
  manifest.targets.totalNpcRecords = 2;
  manifest.targets.pageNpcRecords = 1;
  manifest.targets.excludedNpcCount = 1;
  capture.manifestBytes = Buffer.from(JSON.stringify(manifest));

  const result = verifyBuffNpcPageInflictionCapture(capture);
  assert.deepEqual(result.source.excludedNpcSourceIds, [999]);
});

test('retains zero and negative IDs in explicit no-page exclusions', () => {
  const capture = captureBytes();
  const targets = JSON.parse(capture.targetsBytes);
  targets.totalNpcRecords = 3;
  targets.pageNpcRecords = 1;
  targets.excludedNpcRecords = [
    { id: 0, internalName: 'None', name: null,
      exclusionStatus: 'missing-dedicated-page', exclusionReason: 'placeholder_or_internal_test_helper_no_loot' },
    { id: -55, internalName: 'BigRainZombie', name: 'Zombie',
      exclusionStatus: 'missing-dedicated-page', exclusionReason: 'no_dedicated_page_source_variant' },
  ];
  capture.targetsBytes = Buffer.from(JSON.stringify(targets));
  const manifest = JSON.parse(capture.manifestBytes);
  manifest.targets.sha256 = hash(capture.targetsBytes);
  manifest.targets.totalNpcRecords = 3;
  manifest.targets.pageNpcRecords = 1;
  manifest.targets.excludedNpcCount = 2;
  capture.manifestBytes = Buffer.from(JSON.stringify(manifest));

  const result = verifyBuffNpcPageInflictionCapture(capture);
  assert.deepEqual(result.source.excludedNpcSourceIds, [-55, 0]);
});
