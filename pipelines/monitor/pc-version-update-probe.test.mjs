import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  DEFAULT_PC_VERSION_BASELINE,
  DEFAULT_PC_VERSION_UPDATE_PROGRESS_PATH,
  PC_VERSION_UPDATE_ACTION_ID,
  comparePcVersions,
  extractDesktopCurrentVersion,
  extractDesktopHistoryVersions,
  extractReleaseBulletins,
  finalizePcVersionProbeReport,
  parseProbeCliArgs,
  publishPcVersionProbeReport,
  planDesktopReleaseCatchUp,
  probePcVersionUpdates
} from './pc-version-update-probe.mjs';
import { buildPcVersionIdentityCatalog } from './pc-version-update-identity-catalog.mjs';

const CURRENT_VERSIONS_FIXTURE = `
<!-- desktop-only source field -->
{{#vardefine:currentversions:desktop-version|1.4.5.10}}
{{#vardefine:currentversions:console-version|1.4.5.10.1}}
{{#vardefine:currentversions:mobile-equivalent|1.4.5.10}}
{{#vardefine:currentversions:tmodloader-version|2026.10.2.1}}
`;

const DESKTOP_HISTORY_FIXTURE = `
{| class="terraria sortable"
|-
| {{anchor|1.4.5.8}} '''[[1.4.5.8]]'''
| {{date|2026|8|23}}
| Hotfixes
|-
| {{anchor|1.4.5.9}} '''[[1.4.5.9]]'''
| {{date|2026|9|12}}
| Patches
|-
| {{anchor|1.4.5.10}} '''[[1.4.5.10]]'''
| {{date|2026|10|1}}
| Patches
|}
`;

function sourcePage(pageTitle, wikitext, pageId, revisionId) {
  return {
    requestedPageTitle: pageTitle,
    pageTitle,
    pageId,
    revisionId,
    revisionTimestamp: `2026-10-${String(pageId % 28 + 1).padStart(2, '0')}T00:00:00Z`,
    wikitext,
    html: '<div class="mw-parser-output"></div>',
    sections: []
  };
}

test('extracts only the exact Desktop version field from the current-version template', () => {
  assert.equal(extractDesktopCurrentVersion(CURRENT_VERSIONS_FIXTURE), '1.4.5.10');
});

test('fails closed when the Desktop version source is missing or ambiguous', () => {
  assert.throws(() => extractDesktopCurrentVersion('{{#vardefine:currentversions:console-version|1.4.5.10.1}}'), /desktop.*version.*missing/i);
  assert.throws(() => extractDesktopCurrentVersion([
    '{{#vardefine:currentversions:desktop-version|1.4.5.8}}',
    '{{#vardefine:currentversions:desktop-version|1.4.5.9}}'
  ].join('\n')), /desktop.*version.*ambiguous/i);
});

test('ignores a Desktop version definition inside an HTML comment', () => {
  assert.throws(() => extractDesktopCurrentVersion('<!-- {{#vardefine:currentversions:desktop-version|1.4.5.9}} -->'), /desktop.*version.*missing/i);
  assert.equal(extractDesktopCurrentVersion([
    '<!-- {{#vardefine:currentversions:desktop-version|1.4.5.9}} -->',
    '{{#vardefine:currentversions:desktop-version|1.4.5.8}}'
  ].join('\n')), '1.4.5.8');
});

test('extracts Desktop history entries only from anchored release rows', () => {
  assert.deepEqual(
    extractDesktopHistoryVersions(DESKTOP_HISTORY_FIXTURE).map((entry) => entry.version),
    ['1.4.5.8', '1.4.5.9', '1.4.5.10']
  );
});

test('ignores commented Desktop history rows and commented changelog sections', () => {
  assert.deepEqual(extractDesktopHistoryVersions([
    '<!-- | {{anchor|9.9.9}} [[9.9.9]] -->',
    '| {{anchor|1.4.5.8}} [[1.4.5.8]]'
  ].join('\n')).map((entry) => entry.version), ['1.4.5.8']);
  assert.deepEqual(extractReleaseBulletins([
    '<!-- == Changelog == -->',
    '== Changelog ==',
    '=== Bug Fixes ===',
    '* Fixed [[Last Prism]].'
  ].join('\n'), '1.4.5.9').map((bulletin) => bulletin.text), ['Fixed Last Prism.']);
});

test('keeps bulletin identities stable when release bullets are reordered', () => {
  const firstOrder = extractReleaseBulletins([
    '== Changelog ==',
    '=== Changes ===',
    '* [[Last Prism]] fades when mana is low.',
    '* [[Bee Gun]] receives a display fix.'
  ].join('\n'), '1.4.5.9');
  const secondOrder = extractReleaseBulletins([
    '== Changelog ==',
    '=== Changes ===',
    '* [[Bee Gun]] receives a display fix.',
    '* [[Last Prism]] fades when mana is low.'
  ].join('\n'), '1.4.5.9');

  const firstIds = new Map(firstOrder.map((bulletin) => [bulletin.text, bulletin.bulletinId]));
  const secondIds = new Map(secondOrder.map((bulletin) => [bulletin.text, bulletin.bulletinId]));
  assert.deepEqual(secondIds, firstIds);
  assert.notEqual(firstIds.get('Last Prism fades when mana is low.'), firstIds.get('Bee Gun receives a display fix.'));
});

test('keeps bulletin identity stable when only an HTML comment changes', () => {
  const withComment = extractReleaseBulletins([
    '== Changelog ==',
    '=== Changes ===',
    '* [[Last Prism]] fades when mana is low. <!-- editor note A -->'
  ].join('\n'), '1.4.5.9');
  const editedComment = extractReleaseBulletins([
    '== Changelog ==',
    '=== Changes ===',
    '* [[Last Prism]] fades when mana is low. <!-- editor note B -->'
  ].join('\n'), '1.4.5.9');

  assert.equal(withComment[0].bulletinId, editedComment[0].bulletinId);
});

test('orders version components numerically rather than lexically', () => {
  assert.equal(comparePcVersions('1.4.5.10', '1.4.5.9'), 1);
  assert.equal(comparePcVersions('1.4.6', '1.4.5.99'), 1);
  assert.equal(comparePcVersions('1.4.5.8', '1.4.5.8'), 0);
});

test('uses the pinned 1.4.5.8 baseline to catch up every later Desktop release in order', () => {
  assert.equal(DEFAULT_PC_VERSION_BASELINE, '1.4.5.8');
  assert.deepEqual(planDesktopReleaseCatchUp({
    currentVersion: '1.4.5.10',
    historyVersions: ['1.4.5.8', '1.4.5.9', '1.4.5.10']
  }), ['1.4.5.9', '1.4.5.10']);
});

test('returns no releases when the Desktop version has not advanced past the cursor', () => {
  assert.deepEqual(planDesktopReleaseCatchUp({
    currentVersion: '1.4.5.8',
    historyVersions: ['1.4.5.8']
  }), []);
});

test('fails closed when history is missing, duplicated, or inconsistent with Desktop current version', () => {
  assert.throws(() => extractDesktopHistoryVersions('No release rows here'), /desktop.*history.*missing/i);
  assert.throws(() => extractDesktopHistoryVersions([
    '| {{anchor|1.4.5.8}} [[1.4.5.8]]',
    '| {{anchor|1.4.5.8}} [[1.4.5.8]]'
  ].join('\n')), /duplicate.*1\.4\.5\.8|ambiguous/i);
  assert.throws(() => planDesktopReleaseCatchUp({
    currentVersion: '1.4.5.10',
    historyVersions: ['1.4.5.8', '1.4.5.9']
  }), /current.*version.*history/i);
  assert.throws(() => planDesktopReleaseCatchUp({
    currentVersion: '1.4.5.10',
    lastEvaluatedVersion: '1.4.5.9',
    historyVersions: ['1.4.5.8', '1.4.5.10']
  }), /cursor.*history/i);
});

test('probes missing releases serially and returns revision-bound report evidence', async () => {
  const calls = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const pages = new Map([
    ['Template:Current versions', sourcePage('Template:Current versions', CURRENT_VERSIONS_FIXTURE, 10, 100)],
    ['Desktop version history', sourcePage('Desktop version history', DESKTOP_HISTORY_FIXTURE, 20, 200)],
    ['1.4.5.9', sourcePage('1.4.5.9', '== Changelog ==\n=== Changes ===\n* Changed Widget timing.\n', 29, 209)],
    ['1.4.5.10', sourcePage('1.4.5.10', '== Changelog ==\n=== Bug Fixes ===\n* Fixed Widget crash.\n', 30, 210)]
  ]);
  const progressWrites = [];

  const report = await probePcVersionUpdates({
    progressPath: 'reports/test/pc-version-progress.json',
    heartbeatMs: 5
  }, {
    async fetchWikiPagePayloadImpl(options) {
      calls.push({ title: options.pageTitle, requireRevisionBinding: options.requireRevisionBinding });
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      const page = pages.get(options.pageTitle);
      if (!page) throw new Error(`unexpected page ${options.pageTitle}`);
      return page;
    },
    writeProgress: (filePath, payload) => progressWrites.push({ filePath, payload })
  });

  assert.deepEqual(calls.map((call) => call.title), [
    'Template:Current versions', 'Desktop version history', '1.4.5.9', '1.4.5.10'
  ]);
  assert.ok(calls.every((call) => call.requireRevisionBinding));
  assert.equal(maxInFlight, 1);
  assert.deepEqual(report.plannedReleaseVersions, ['1.4.5.9', '1.4.5.10']);
  assert.deepEqual(report.releases.map((release) => release.version), ['1.4.5.9', '1.4.5.10']);
  assert.deepEqual(report.releases.map((release) => release.bulletins[0].text), [
    'Changed Widget timing.', 'Fixed Widget crash.'
  ]);
  assert.equal(report.releases[0].source.pageId, 29);
  assert.equal(report.releases[0].source.revisionId, 209);
  assert.equal(report.releases[0].source.revisionTimestamp, pages.get('1.4.5.9').revisionTimestamp);
});

test('publishes a complete run report to an explicit repository-contained output path', async () => {
  const reportWrites = [];
  const progressWrites = [];
  const pages = new Map([
    ['Template:Current versions', sourcePage('Template:Current versions', '{{#vardefine:currentversions:desktop-version|1.4.5.8}}', 10, 100)],
    ['Desktop version history', sourcePage('Desktop version history', '| {{anchor|1.4.5.8}} [[1.4.5.8]]', 20, 200)]
  ]);
  const report = await probePcVersionUpdates({ outputPath: 'reports/test/pc-version-report.json' }, {
    async fetchWikiPagePayloadImpl({ pageTitle }) { return pages.get(pageTitle); },
    writeProgress: (_path, payload) => progressWrites.push(payload)
  });
  publishPcVersionProbeReport(report, { writeReport: (filePath, payload) => reportWrites.push({ filePath, payload }) });

  const reportWrite = reportWrites[0];
  assert.equal(reportWrite.filePath, path.resolve(process.cwd(), 'reports/test/pc-version-report.json'));
  assert.equal(reportWrite.payload.currentDesktopVersion, '1.4.5.8');
  assert.equal(progressWrites.at(-1).status, 'completed');
  assert.equal(report.schemaVersion, reportWrite.payload.schemaVersion);
  assert.ok(report.runId);
  assert.deepEqual(parseProbeCliArgs(['--output-path=reports/runs/run-1.json']), {
    outputPath: 'reports/runs/run-1.json'
  });
});

test('rejects an output path outside the repository before fetching sources', async () => {
  let fetchCount = 0;
  await assert.rejects(probePcVersionUpdates({ outputPath: path.resolve(os.tmpdir(), 'pc-probe-report.json') }, {
    async fetchWikiPagePayloadImpl() { fetchCount += 1; },
    writeProgress: () => {}
  }), /output path must remain inside the repository/i);
  assert.equal(fetchCount, 0);
});

test('report publication fails closed when the output path escapes the repository', () => {
  assert.throws(() => publishPcVersionProbeReport({ outputPath: path.resolve(os.tmpdir(), 'outside.json') }, {
    writeReport: () => assert.fail('report writer must not be called')
  }), /output path must remain inside the repository/i);
});

test('report publication failure replaces completed progress with a failed terminal state', () => {
  const writes = [];
  assert.throws(() => finalizePcVersionProbeReport({
    outputPath: 'reports/test/report.json'
  }, { progressPath: 'reports/test/progress.json' }, {
    writeReport: () => { throw new Error('simulated immutable report failure'); },
    writeProgress: (filePath, payload) => writes.push({ filePath, payload })
  }), /simulated immutable report failure/);
  assert.equal(writes[0].filePath, path.resolve(process.cwd(), 'reports/test/progress.json'));
  assert.equal(writes[0].payload.status, 'failed');
  assert.equal(writes[0].payload.phase, 'report-publication');
});

test('passes raw release Wiki links through the identity catalog into acknowledgement candidates', async () => {
  const pages = new Map([
    ['Template:Current versions', sourcePage('Template:Current versions', '{{#vardefine:currentversions:desktop-version|1.4.5.9}}', 10, 100)],
    ['Desktop version history', sourcePage('Desktop version history', [
      '| {{anchor|1.4.5.8}} [[1.4.5.8]]',
      '| {{anchor|1.4.5.9}} [[1.4.5.9]]'
    ].join('\n'), 20, 200)],
    ['1.4.5.9', sourcePage('1.4.5.9', '== Changelog ==\n=== Changes ===\n* [[Last Prism]] now fades when mana is low.\n', 29, 209)]
  ]);
  const identityCatalog = buildPcVersionIdentityCatalog({
    items: { generatedAt: '2026-06-04T00:00:00Z', records: [{ itemInternalName: 'LastPrism', itemName: 'Last Prism', pageTitle: 'Last Prism' }] }
  });

  const report = await probePcVersionUpdates({}, {
    identityCatalog,
    fetchWikiPagePayloadImpl: async ({ pageTitle }) => pages.get(pageTitle),
    writeProgress: () => {}
  });

  const [bulletin] = report.releases[0].bulletins;
  assert.equal(report.identityCatalogProvenance.items.status, 'available');
  assert.equal(report.identityCatalogProvenance.items.sourcePath, 'data/standardized/item_pages.standardized.json');
  assert.equal(bulletin.mappingStatus, 'mapped');
  assert.equal(bulletin.impactStatus, 'unspecified_by_release_note');
  assert.equal(bulletin.targets[0].domain, 'items');
  assert.equal(bulletin.targets[0].stableIdentity.value, 'LastPrism');
  assert.deepEqual(bulletin.targets[0].impactFields, []);
});

test('writes registered progress before the first request and uses default and explicit paths', async () => {
  assert.equal(PC_VERSION_UPDATE_ACTION_ID, 'pc-version-update-probe');
  assert.equal(
    DEFAULT_PC_VERSION_UPDATE_PROGRESS_PATH,
    path.join('reports', 'crawler-monitor', 'pc-version-update-triage', 'progress.latest.json')
  );
  assert.deepEqual(parseProbeCliArgs(['--progress-path', 'reports/custom/progress.json']), {
    progressPath: 'reports/custom/progress.json'
  });

  for (const [requestedPath, expectedPath] of [
    [undefined, DEFAULT_PC_VERSION_UPDATE_PROGRESS_PATH],
    ['reports/custom/progress.json', 'reports/custom/progress.json']
  ]) {
    const writes = [];
    let firstRequestSawRunning = false;
    const pageByTitle = new Map([
      ['Template:Current versions', sourcePage('Template:Current versions', '{{#vardefine:currentversions:desktop-version|1.4.5.8}}', 1, 11)],
      ['Desktop version history', sourcePage('Desktop version history', '| {{anchor|1.4.5.8}} [[1.4.5.8]]', 2, 12)]
    ]);
    await probePcVersionUpdates(requestedPath ? { progressPath: requestedPath } : {}, {
      async fetchWikiPagePayloadImpl({ pageTitle }) {
        firstRequestSawRunning = writes.some(({ payload }) => payload.status === 'running');
        return pageByTitle.get(pageTitle);
      },
      writeProgress: (filePath, payload) => writes.push({ filePath, payload })
    });

    assert.equal(firstRequestSawRunning, true);
    assert.ok(writes.every(({ payload }) => payload.actionId === PC_VERSION_UPDATE_ACTION_ID));
    assert.equal(writes[0].filePath, path.resolve(process.cwd(), expectedPath));
    assert.equal(writes[0].payload.status, 'running');
    assert.equal(writes[0].payload.childStatusPath, expectedPath.replaceAll(path.sep, '/'));
    for (const key of ['generatedAt', 'lastHeartbeatAt', 'childStatusPath', 'phase', 'message', 'current', 'total']) {
      assert.ok(Object.hasOwn(writes[0].payload, key), `progress payload missing ${key}`);
    }
    assert.equal(writes.at(-1).payload.status, 'completed');
  }
});

test('writes the action payload to an isolated explicit progress file', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pc-version-probe-progress-'));
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  const child = runIsolatedProbe(tempRoot, `
    const versionPage = {
      'Template:Current versions': '{{#vardefine:currentversions:desktop-version|1.4.5.8}}',
      'Desktop version history': '| {{anchor|1.4.5.8}} [[1.4.5.8]]'
    };
    const fetchWikiPagePayloadImpl = async ({ pageTitle }) => ({
      requestedPageTitle: pageTitle,
      pageTitle,
      pageId: pageTitle === 'Template:Current versions' ? 1 : 2,
      revisionId: pageTitle === 'Template:Current versions' ? 11 : 12,
      revisionTimestamp: '2026-10-01T00:00:00Z',
      wikitext: versionPage[pageTitle]
    });
    await probePcVersionUpdates({}, { fetchWikiPagePayloadImpl });
    await probePcVersionUpdates({ progressPath: 'reports/custom/progress.json' }, { fetchWikiPagePayloadImpl });
  `);
  assert.equal(child.status, 0, child.stderr);

  for (const relativePath of [
    DEFAULT_PC_VERSION_UPDATE_PROGRESS_PATH,
    'reports/custom/progress.json'
  ]) {
    const progressFile = path.join(tempRoot, relativePath);
    const payload = JSON.parse(await fs.readFile(progressFile, 'utf8'));
    assert.equal(payload.actionId, PC_VERSION_UPDATE_ACTION_ID);
    assert.equal(payload.status, 'completed');
    assert.equal(payload.childStatusPath, relativePath);
    for (const key of ['generatedAt', 'lastHeartbeatAt', 'childStatusPath', 'phase', 'message', 'current', 'total']) {
      assert.ok(Object.hasOwn(payload, key), `progress payload missing ${key}`);
    }
  }
});

test('rejects an absolute progress path outside the repository before any request', async () => {
  let fetchCalls = 0;
  const outsidePath = path.join(os.tmpdir(), `pc-version-probe-outside-${process.pid}.json`);
  await assert.rejects(probePcVersionUpdates({ progressPath: outsidePath }, {
    async fetchWikiPagePayloadImpl() {
      fetchCalls += 1;
    },
    writeProgress: () => {}
  }), /progress path must remain inside the repository/i);
  assert.equal(fetchCalls, 0);
});

test('rejects symlinked progress parents and destinations under an isolated WORKTREE_ROOT', async (t) => {
  const parentRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pc-version-probe-parent-link-'));
  const destinationRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pc-version-probe-destination-link-'));
  t.after(async () => {
    await Promise.all([
      fs.rm(parentRoot, { recursive: true, force: true }),
      fs.rm(destinationRoot, { recursive: true, force: true })
    ]);
  });

  const parentTarget = path.join(parentRoot, 'external');
  await fs.mkdir(parentTarget);
  await fs.symlink(parentTarget, path.join(parentRoot, 'reports'), 'dir');
  const parentResult = runIsolatedProbe(parentRoot, `
    let fetchCalls = 0;
    try {
      await probePcVersionUpdates({}, { fetchWikiPagePayloadImpl: async () => { fetchCalls += 1; } });
    } catch (error) {
      process.stdout.write(String(error.message) + String.fromCharCode(10) + 'fetchCalls=' + fetchCalls);
    }
  `);
  assert.equal(parentResult.status, 0, parentResult.stderr);
  assert.match(parentResult.stdout, /progress path contains a symlink/i);
  assert.match(parentResult.stdout, /fetchCalls=0/);

  const progressFile = path.join(destinationRoot, DEFAULT_PC_VERSION_UPDATE_PROGRESS_PATH);
  const destinationTarget = path.join(destinationRoot, 'outside-progress.json');
  await fs.mkdir(path.dirname(progressFile), { recursive: true });
  await fs.writeFile(destinationTarget, '{}\n');
  await fs.symlink(destinationTarget, progressFile, 'file');
  const destinationResult = runIsolatedProbe(destinationRoot, `
    let fetchCalls = 0;
    try {
      await probePcVersionUpdates({}, { fetchWikiPagePayloadImpl: async () => { fetchCalls += 1; } });
    } catch (error) {
      process.stdout.write(String(error.message) + String.fromCharCode(10) + 'fetchCalls=' + fetchCalls);
    }
  `);
  assert.equal(destinationResult.status, 0, destinationResult.stderr);
  assert.match(destinationResult.stdout, /progress path contains a symlink/i);
  assert.match(destinationResult.stdout, /fetchCalls=0/);
});

test('a same-version probe fetches only the two version sources and emits no release pages', async () => {
  const calls = [];
  const pages = new Map([
    ['Template:Current versions', sourcePage('Template:Current versions', '{{#vardefine:currentversions:desktop-version|1.4.5.8}}', 1, 11)],
    ['Desktop version history', sourcePage('Desktop version history', '| {{anchor|1.4.5.8}} [[1.4.5.8]]', 2, 12)]
  ]);
  const report = await probePcVersionUpdates({}, {
    async fetchWikiPagePayloadImpl({ pageTitle }) {
      calls.push(pageTitle);
      return pages.get(pageTitle);
    },
    writeProgress: () => {}
  });

  assert.deepEqual(calls, ['Template:Current versions', 'Desktop version history']);
  assert.deepEqual(report.releases, []);
});

test('publishes a failed terminal progress state when a source fetch fails', async () => {
  const writes = [];
  await assert.rejects(probePcVersionUpdates({}, {
    async fetchWikiPagePayloadImpl() {
      throw new Error('source unavailable');
    },
    writeProgress: (filePath, payload) => writes.push(payload)
  }), /source unavailable/);

  assert.equal(writes[0].status, 'running');
  assert.equal(writes.at(-1).status, 'failed');
});

test('refreshes heartbeat while a Wiki request is still pending', async () => {
  const writes = [];
  const pages = new Map([
    ['Template:Current versions', sourcePage('Template:Current versions', '{{#vardefine:currentversions:desktop-version|1.4.5.8}}', 1, 11)],
    ['Desktop version history', sourcePage('Desktop version history', '| {{anchor|1.4.5.8}} [[1.4.5.8]]', 2, 12)]
  ]);
  await probePcVersionUpdates({ heartbeatMs: 5 }, {
    async fetchWikiPagePayloadImpl({ pageTitle }) {
      if (pageTitle === 'Template:Current versions') await new Promise((resolve) => setTimeout(resolve, 25));
      return pages.get(pageTitle);
    },
    writeProgress: (filePath, payload) => writes.push(payload)
  });

  const heartbeats = writes.filter((payload) => payload.status === 'running');
  assert.ok(heartbeats.length >= 2);
  assert.ok(Date.parse(heartbeats.at(-1).lastHeartbeatAt) > Date.parse(heartbeats[0].lastHeartbeatAt));
});

test('surfaces an asynchronous heartbeat write failure after the pending request returns', async () => {
  let writes = 0;
  const page = sourcePage('Template:Current versions', '{{#vardefine:currentversions:desktop-version|1.4.5.8}}', 1, 11);
  await assert.rejects(probePcVersionUpdates({ heartbeatMs: 5 }, {
    async fetchWikiPagePayloadImpl() {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return page;
    },
    writeProgress() {
      writes += 1;
      if (writes > 1) throw new Error('simulated progress disk failure');
    }
}), /progress write failed.*simulated progress disk failure/i);
});

function runIsolatedProbe(worktreeRoot, body) {
  const moduleUrl = pathToFileURL(path.resolve('pipelines/monitor/pc-version-update-probe.mjs')).href;
  const script = `import { probePcVersionUpdates } from ${JSON.stringify(moduleUrl)};\n${body}`;
  return spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: worktreeRoot,
    env: { ...process.env, WORKTREE_ROOT: worktreeRoot },
    encoding: 'utf8'
  });
}
