import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runCaptureBuffPageEvidence } from './capture-buff-page-evidence.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buff-capture-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const input = path.join(root, 'input.json');
  fs.writeFileSync(input, JSON.stringify({ buffs: [
    { id: 165, internalName: 'DryadsWard', localized: { en: { page: "Dryad's Blessing" } } },
    { id: 186, internalName: 'DryadsWardDebuff', localized: { en: { page: "Dryad's Blessing" } } },
  ] }));
  return { root, input, outputDir: path.join(root, 'run'), canonical: path.join(root, 'data/generated/fetch-wiki-buffs-progress.latest.json') };
}

function page(pageTitle) {
  return { pageTitle, requestedPageTitle: pageTitle, pageId: 8, revisionId: 42,
    revisionTimestamp: '2026-09-28T00:00:00Z', html: '<p>raw</p>', wikitext: '{{buff infobox|auto=186}}', sections: [] };
}

test('explicit Iteminfo mode captures one fixed revision-bound module for the input Buff scope', async t => {
  const f = fixture(t);
  const calls = [];
  const result = await runCaptureBuffPageEvidence({ input: f.input, 'source-kind': 'iteminfo', 'output-dir': f.outputDir }, {
    repoRoot: f.root, writeRedisState: async () => {},
    fetchPage: async options => {
      calls.push(options);
      assert.equal(JSON.parse(fs.readFileSync(f.canonical)).status, 'running');
      return { ...page(options.pageTitle), wikitext: 'return { [1] = { buffType = 165 } }' };
    },
  });
  assert.deepEqual(calls, [{ pageTitle: 'Module:Iteminfo/data', requireRevisionBinding: true }]);
  assert.equal(result.sourceKind, 'iteminfo');
  assert.deepEqual(result.selectedBuffIds, [165, 186]);
  assert.equal(result.pages.length, 1);
  assert.equal(JSON.parse(fs.readFileSync(f.canonical)).status, 'completed');
});

test('Npcinfo semantic mode captures the revision-bound semantic source pages for the input Buff scope', async t => {
  const f = fixture(t);
  const result = await runCaptureBuffPageEvidence({ input: f.input, 'source-kind': 'npcinfo-semantics', 'output-dir': f.outputDir }, {
    repoRoot: f.root, writeRedisState: async () => {},
    fetchPage: async options => page(options.pageTitle),
  });
  assert.equal(result.schemaVersion, 'buff-semantic-raw-capture/v1');
  assert.equal(result.sourceKind, 'npcinfo-semantics');
  assert.deepEqual(result.selectedBuffIds, [165, 186]);
  assert.deepEqual(result.pages.map(row => row.pageTitle), ['Module:Npcinfo/data', 'Module:Npcinfo/doc', 'Module:Npcinfo/datagen', 'Template:GetBuffInfo', 'Whips']);
});

test('Iteminfo semantic mode captures data, documentation, and generator pages for the input Buff scope', async t => {
  const f = fixture(t);
  const calls = [];
  const result = await runCaptureBuffPageEvidence({ input: f.input, 'source-kind': 'iteminfo-semantics', 'output-dir': f.outputDir }, {
    repoRoot: f.root, writeRedisState: async () => {},
    fetchPage: async options => {
      calls.push(options);
      assert.equal(JSON.parse(fs.readFileSync(f.canonical)).status, 'running');
      return { ...page(options.pageTitle), wikitext: options.pageTitle === 'Module:Iteminfo/data'
        ? 'return { ["data"] = [=====[{"288":{"buffType":165}}]=====] }'
        : options.pageTitle === 'Module:Iteminfo/doc' ? 'buffType identifies the Buff applied by an item'
          : 'The generator emits every item row into Module:Iteminfo/data' };
    },
  });
  assert.deepEqual(calls.map(call => call.pageTitle), ['Module:Iteminfo/data', 'Module:Iteminfo/doc', 'Module:Iteminfo/datagen']);
  assert.ok(calls.every(call => call.requireRevisionBinding === true));
  assert.equal(result.schemaVersion, 'buff-semantic-raw-capture/v1');
  assert.equal(result.sourceKind, 'iteminfo-semantics');
  assert.deepEqual(result.pages.map(row => row.pageTitle), ['Module:Iteminfo/data', 'Module:Iteminfo/doc', 'Module:Iteminfo/datagen']);
  assert.deepEqual(result.pages.map(row => row.buffIds), [[165, 186], [165, 186], [165, 186]]);
  assert.ok(result.pages.every(row => Number.isSafeInteger(row.pageId) && Number.isSafeInteger(row.revisionId)
    && typeof row.revisionTimestamp === 'string'));
  assert.equal(JSON.parse(fs.readFileSync(f.canonical)).status, 'completed');
});

test('Iteminfo mode rejects ambiguous selectors and duplicate Buff input before progress', async t => {
  const f = fixture(t);
  const deps = { repoRoot: f.root, writeRedisState: async () => {}, fetchPage: async () => assert.fail('must not fetch') };
  for (const options of [{ 'source-kind': 'other', ids: '165' }, { 'source-kind': 'iteminfo', ids: '165' }]) {
    await assert.rejects(runCaptureBuffPageEvidence({ input: f.input, 'output-dir': f.outputDir, ...options }, deps));
  }
  const data = JSON.parse(fs.readFileSync(f.input));
  data.buffs.push(data.buffs[0]);
  fs.writeFileSync(f.input, JSON.stringify(data));
  await assert.rejects(runCaptureBuffPageEvidence({ input: f.input, 'source-kind': 'iteminfo', 'output-dir': f.outputDir }, deps));
  assert.equal(fs.existsSync(f.canonical), false);
});

test('Iteminfo capture rejects a revision-bound response for the wrong module', async t => {
  const f = fixture(t);
  await assert.rejects(runCaptureBuffPageEvidence({ input: f.input, 'source-kind': 'iteminfo', 'output-dir': f.outputDir }, {
    repoRoot: f.root, writeRedisState: async () => {}, fetchPage: async () => page('Module:Other'),
  }), /module title/i);
  assert.equal(JSON.parse(fs.readFileSync(f.canonical)).status, 'failed');
});

test('progress destinations cannot overwrite input or occupy the capture directory', async t => {
  for (const scenario of ['input', 'input-parent-alias', 'report', 'raw', 'failure', 'canonical-input', 'canonical-output']) {
    await t.test(scenario, async t => {
      const f = fixture(t);
      let input = f.input;
      let outputDir = f.outputDir;
      let progressPath;
      if (scenario === 'input') progressPath = input;
      if (scenario === 'input-parent-alias') {
        fs.symlinkSync(f.root, path.join(f.root, 'alias'), 'dir');
        progressPath = path.join(f.root, 'alias/input.json');
      }
      if (scenario === 'report') progressPath = path.join(outputDir, 'capture.json');
      if (scenario === 'raw') progressPath = path.join(outputDir, 'page-001.json');
      if (scenario === 'failure') progressPath = path.join(outputDir, 'failure.json');
      if (scenario === 'canonical-input') {
        fs.mkdirSync(path.dirname(f.canonical), { recursive: true });
        fs.copyFileSync(input, f.canonical);
        input = f.canonical;
      }
      if (scenario === 'canonical-output') outputDir = path.dirname(f.canonical);
      const before = fs.readFileSync(input);
      let requests = 0;
      await assert.rejects(runCaptureBuffPageEvidence({ input, ids: '165', 'output-dir': outputDir, 'progress-path': progressPath }, {
        repoRoot: f.root, writeRedisState: async () => {},
        fetchPage: async options => { requests++; return page(options.pageTitle); },
      }), /progress.*(input|capture)/i);
      assert.deepEqual(fs.readFileSync(input), before);
      assert.equal(requests, 0);
      assert.equal(fs.existsSync(outputDir), false);
    });
  }
});

test('explicit bounded capture publishes canonical progress before fetch and freezes shared raw page once', async t => {
  const f = fixture(t);
  const requests = [];
  const result = await runCaptureBuffPageEvidence({ input: f.input, ids: '165,186', 'output-dir': f.outputDir }, {
    repoRoot: f.root, writeRedisState: async () => {},
    fetchPage: async options => {
      requests.push(options);
      const progress = JSON.parse(fs.readFileSync(f.canonical));
      assert.equal(progress.status, 'running');
      for (const key of ['actionId', 'lastHeartbeatAt', 'generatedAt', 'childStatusPath', 'phase', 'message', 'current', 'total']) assert.ok(key in progress);
      assert.equal(progress.actionId, 'buff-page-immunity-refresh');
      assert.equal(options.requireRevisionBinding, true);
      return page(options.pageTitle);
    },
  });
  assert.equal(requests.length, 1);
  assert.deepEqual(result.pages[0].buffIds, [165, 186]);
  assert.match(result.pages[0].sha256, /^sha256:[a-f0-9]{64}$/);
  assert.equal(JSON.parse(fs.readFileSync(result.pages[0].path)).wikitext, '{{buff infobox|auto=186}}');
  assert.equal(JSON.parse(fs.readFileSync(f.canonical)).status, 'completed');
  assert.deepEqual(JSON.parse(fs.readFileSync(f.input)).buffs.map(r => r.id), [165, 186]);
});

test('custom progress mirrors canonical and a fetch error leaves failed terminal evidence', async t => {
  const f = fixture(t);
  const custom = path.join(f.root, 'custom.json');
  await assert.rejects(runCaptureBuffPageEvidence({ input: f.input, ids: '165', 'output-dir': f.outputDir, 'progress-path': custom }, {
    repoRoot: f.root, writeRedisState: async () => {}, fetchPage: async () => { throw new Error('network failed'); },
  }), /network failed/);
  const progress = JSON.parse(fs.readFileSync(custom));
  assert.equal(progress.status, 'failed');
  assert.deepEqual(JSON.parse(fs.readFileSync(f.canonical)), progress);
});

test('missing or unbounded selectors and existing output fail before requests or progress', async t => {
  const f = fixture(t);
  const deps = { repoRoot: f.root, fetchPage: async () => assert.fail('must not fetch') };
  for (const ids of [undefined, '', '999', '165,165', Array.from({ length: 21 }, (_, i) => i + 1).join(',')]) {
    await assert.rejects(runCaptureBuffPageEvidence({ input: f.input, ids, 'output-dir': f.outputDir }, deps));
  }
  fs.mkdirSync(f.outputDir);
  await assert.rejects(runCaptureBuffPageEvidence({ input: f.input, ids: '165', 'output-dir': f.outputDir }, deps), /exist/i);
  assert.equal(fs.existsSync(f.canonical), false);
});

test('unbound page response cannot be promoted to a completed capture', async t => {
  const f = fixture(t);
  await assert.rejects(runCaptureBuffPageEvidence({ input: f.input, ids: '165', 'output-dir': f.outputDir }, {
    repoRoot: f.root, writeRedisState: async () => {}, fetchPage: async () => ({ ...page("Dryad's Blessing"), revisionId: null }),
  }), /revision/i);
  assert.equal(JSON.parse(fs.readFileSync(f.canonical)).status, 'failed');
});

test('NPC page redirects keep each target binding while freezing one resolved raw page', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buff-npc-redirect-capture-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const inputPath = path.join(root, 'buffs.json');
  const targetsPath = path.join(root, 'targets.json');
  const outputDir = path.join(root, 'capture');
  const progressPath = path.join(root, 'progress.json');
  fs.writeFileSync(inputPath, JSON.stringify({ buffs: [{ id: 37, internalName: 'Horrified' }] }));
  fs.writeFileSync(targetsPath, JSON.stringify({
    schemaVersion: 'buff-npc-page-targets/v1',
    scope: 'all-standardized-npc-page-targets',
    totalTargets: 2,
    sourceSha256: 'sha256:' + '1'.repeat(64),
    targets: [
      { pageTitle: 'Moon Lord', targetEntityIds: ['moon-lord'], standardizedRecords: [{ id: 396, internalName: 'MoonLordHead', name: 'Moon Lord' }] },
      { pageTitle: "Moon Lord's Core", targetEntityIds: ['moon-lord-s-core'], standardizedRecords: [{ id: 398, internalName: 'MoonLordCore', name: "Moon Lord's Core" }] },
    ],
  }));
  const requests = [];
  const result = await runCaptureBuffPageEvidence({
    'source-kind': 'npc-page-inflictions', input: inputPath, 'npc-targets': targetsPath,
    'output-dir': outputDir, 'progress-path': progressPath,
  }, {
    repoRoot: root, writeRedisState: async () => {},
    fetchPage: async options => {
      requests.push(options.pageTitle);
      return {
        requestedPageTitle: options.pageTitle,
        pageTitle: 'Moon Lord', pageId: 7426, revisionId: 1029946,
        revisionTimestamp: '2026-09-16T20:11:12Z', html: '<p>raw</p>',
        wikitext: '{{npc infobox|auto=396|image=Moon Lord.gif}}', sections: [],
      };
    },
  });
  assert.deepEqual(requests, ['Moon Lord', "Moon Lord's Core"]);
  assert.equal(result.pages.length, 2);
  assert.equal(new Set(result.pages.map(page => page.path)).size, 1);
  assert.deepEqual(result.pages.map(page => [page.requestedPageTitle, page.pageTitle, page.resolvedPageTitle]), [
    ['Moon Lord', 'Moon Lord', 'Moon Lord'],
    ["Moon Lord's Core", 'Moon Lord', 'Moon Lord'],
  ]);
  assert.equal(fs.readdirSync(outputDir).filter(name => /^page-\d+\.json$/.test(name)).length, 1);
});
