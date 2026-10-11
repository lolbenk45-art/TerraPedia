import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  buildWikiPageParseUrl,
  fetchWikiPagePayload,
  fetchWikiPageMetadataBatch,
  parseCliArgs,
  reportHeartbeat,
  writeJson,
  writeJsonNoOverwrite,
} from './wiki-item-utils.mjs';

test('buildWikiPageParseUrl enables redirect following for parse requests', () => {
  const url = buildWikiPageParseUrl({
    pageTitle: 'Torch',
    apiUrl: 'https://terraria.wiki.gg/api.php',
  });

  assert.equal(url.searchParams.get('action'), 'parse');
  assert.equal(url.searchParams.get('page'), 'Torch');
  assert.equal(url.searchParams.get('prop'), 'wikitext|text|sections');
  assert.equal(url.searchParams.get('format'), 'json');
  assert.equal(url.searchParams.get('formatversion'), '2');
  assert.equal(url.searchParams.get('redirects'), '1');
});

test('reportHeartbeat is exposed from wiki item utilities for fetchers', () => {
  assert.equal(typeof reportHeartbeat, 'function');
});

test('revision-bound page capture parses the exact selected revision instead of mutable latest', async () => {
  const calls = [];
  const payload = await fetchWikiPagePayload({ pageTitle: 'Mining Pants', requireRevisionBinding: true,
    fetchWikiApiJsonImpl: async ({ url }) => {
      calls.push(url);
      if (url.searchParams.get('action') === 'query') {
        return { query: { pages: [{ pageid: 123, title: 'Mining armor', revisions: [{ revid: 456, timestamp: '2026-09-28T00:00:00Z' }] }] } };
      }
      return { parse: { pageid: 123, revid: 456, title: 'Mining armor', wikitext: 'old revision text', text: '<p>old</p>' } };
    },
  });
  assert.equal(calls[0].searchParams.get('action'), 'query');
  assert.equal(calls[1].searchParams.get('page'), 'Mining Pants');
  assert.equal(calls[1].searchParams.has('oldid'), false);
  assert.equal(payload.revisionId, 456);
  assert.equal(payload.revisionTimestamp, '2026-09-28T00:00:00Z');
  assert.equal(payload.requestedPageTitle, 'Mining Pants');
});

test('revision-bound page capture rejects a parse result for a different revision', async () => {
  await assert.rejects(fetchWikiPagePayload({ pageTitle: 'Armor', requireRevisionBinding: true,
    fetchWikiApiJsonImpl: async ({ url }) => url.searchParams.get('action') === 'query'
      ? { query: { pages: [{ pageid: 123, title: 'Armor', revisions: [{ revid: 456, timestamp: '2026-09-28T00:00:00Z' }] }] } }
      : { parse: { pageid: 123, revid: 457, title: 'Armor', wikitext: 'new text', text: '<p>new</p>' } },
  }), /revision.*(match|drift)/i);
});

test('immutable JSON writer rejects a symbolic-link ancestor before publication', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-json-writer-symlink-'));
  const outside = path.join(root, 'outside');
  const linked = path.join(root, 'linked');
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, linked, 'dir');

  assert.throws(
    () => writeJsonNoOverwrite(path.join(linked, 'report.json'), { status: 'new' }),
    /symbolic|symlink|ancestor|unsafe/i,
  );
  assert.equal(fs.existsSync(path.join(outside, 'report.json')), false);
});

test('JSON writer rejects a group-or-other-writable ancestor', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-json-writer-mode-'));
  const unsafe = path.join(root, 'unsafe');
  fs.mkdirSync(unsafe);
  fs.chmodSync(unsafe, 0o777);

  assert.throws(
    () => writeJson(path.join(unsafe, 'report.json'), { status: 'new' }),
    /writable|unsafe|private/i,
  );
  assert.equal(fs.existsSync(path.join(unsafe, 'report.json')), false);
});

test('immutable JSON writer refuses to overwrite an existing report', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-json-writer-collision-'));
  const reportPath = path.join(root, 'source-update-check-2026-09-02.json');
  fs.writeFileSync(reportPath, '{"status":"original"}\n', 'utf8');

  assert.throws(
    () => writeJsonNoOverwrite(reportPath, { status: 'replacement' }),
    /exists|overwrite/i,
  );
  assert.equal(fs.readFileSync(reportPath, 'utf8'), '{"status":"original"}\n');
});

test('JSON writer does not delete a pre-existing temporary collision', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-json-writer-temp-collision-'));
  const reportPath = path.join(root, 'report.json');
  const originalOpenSync = fs.openSync;
  let injected = false;
  fs.openSync = (filePath, flags, ...args) => {
    if (!injected && String(filePath).includes('.report.json.') && String(filePath).endsWith('.tmp')) {
      injected = true;
      fs.writeFileSync(filePath, 'pre-existing temporary evidence', 'utf8');
      const error = new Error('simulated temporary collision');
      error.code = 'EEXIST';
      throw error;
    }
    return originalOpenSync(filePath, flags, ...args);
  };
  let collisionPath;
  try {
    assert.throws(() => writeJson(reportPath, { status: 'new' }), /temporary collision/i);
    collisionPath = fs.readdirSync(root).find((name) => name.endsWith('.tmp'));
  } finally {
    fs.openSync = originalOpenSync;
  }

  assert.ok(collisionPath);
  assert.equal(fs.readFileSync(path.join(root, collisionPath), 'utf8'), 'pre-existing temporary evidence');
});

test('parseCliArgs accepts equals and separated option values', () => {
  assert.deepEqual(parseCliArgs([
    '--output-dir=/tmp/generated',
    '--progress-path',
    '/tmp/progress.json',
    '--keep-snapshot',
    'ignored-positional',
  ]), {
    'output-dir': '/tmp/generated',
    'progress-path': '/tmp/progress.json',
    'keep-snapshot': true,
  });
});

test('fetchWikiUrlJson preserves wiki gate API error handling', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-wiki-url-json-'));
  const moduleUrl = new URL('./wiki-item-utils.mjs', import.meta.url).href;
  const workerCode = `
    import fs from 'node:fs';
    import path from 'node:path';
    const { fetchWikiUrlJson } = await import(${JSON.stringify(moduleUrl)});
    try {
      await fetchWikiUrlJson({
        url: 'data:application/json,{"error":{"code":"badvalue","info":"Invalid request"}}',
        sourceKey: 'JSON gate probe',
        timeoutMs: 1_000
      });
      console.error('missing expected rejection');
      process.exit(2);
    } catch (error) {
      console.log(String(error.message));
    }
    const state = JSON.parse(fs.readFileSync(path.join(process.env.TERRAPEDIA_SHARED_DATA_ROOT, 'generated', 'wiki-request-gate.latest.json'), 'utf8'));
    console.log(JSON.stringify({
      failureCount: state.failureCount,
      throttleFailureCount: state.throttleFailureCount
    }));
  `;
  const result = await runNodeModule(workerCode, {
    env: { ...process.env, TERRAPEDIA_SHARED_DATA_ROOT: tempDir }
  });

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Wiki API error: JSON gate probe \| badvalue \| Invalid request/);
  assert.match(result.stdout, /"failureCount":1/);
  assert.match(result.stdout, /"throttleFailureCount":0/);
});

test('fetchWikiPagePayload preserves parse sections for downstream evidence parsing', async () => {
  const calls = [];
  const fetchWikiApiJsonImpl = async ({ url }) => {
    calls.push(url);
    if (url.searchParams.get('action') === 'parse') {
      return {
        parse: {
          pageid: 39,
          title: 'Cursed Inferno',
          wikitext: 'page text',
          text: '<h2>Causes</h2>',
          sections: [{ line: 'From player', anchor: 'From_player' }]
        }
      };
    }
    return {
      query: {
        pages: [
          { revisions: [{ timestamp: '2026-05-15T00:00:00Z' }] }
        ]
      }
    };
  };

  const payload = await fetchWikiPagePayload({ pageTitle: 'Cursed Inferno', fetchWikiApiJsonImpl });
  assert.deepEqual(payload.sections, [{ line: 'From player', anchor: 'From_player' }]);
  assert.equal(calls[0].searchParams.get('prop'), 'wikitext|text|sections');
});

test('fetchWikiPageMetadataBatch maps requested redirect aliases to returned canonical pages', async () => {
  const calls = [];
  const pages = await fetchWikiPageMetadataBatch({
    titles: ['Fungo Fish', 'Giant Antlion Charger', 'Missing Alias'],
    apiUrl: 'https://terraria.wiki.gg/api.php',
    fetchWikiApiJsonImpl: async ({ url }) => {
      calls.push(url);
      return {
        query: {
          redirects: [
            { from: 'Fungo Fish', to: 'Jellyfish' },
            { from: 'Giant Antlion Charger', to: 'Antlion Charger' },
          ],
          pages: [
            {
              pageid: 123,
              title: 'Jellyfish',
              revisions: [{ revid: 1001, timestamp: '2026-05-12T00:00:00Z' }],
            },
            {
              pageid: 456,
              title: 'Antlion Charger',
              revisions: [{ revid: 1002, timestamp: '2026-05-12T00:00:01Z' }],
            },
            {
              ns: 0,
              title: 'Missing Alias',
              missing: true,
            },
          ],
        },
      };
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].searchParams.get('redirects'), '1');
  assert.deepEqual(
    pages.map((page) => ({
      requestedTitle: page.requestedTitle,
      pageTitle: page.pageTitle,
      pageId: page.pageId,
      missing: page.missing,
    })),
    [
      { requestedTitle: 'Fungo Fish', pageTitle: 'Jellyfish', pageId: 123, missing: false },
      { requestedTitle: 'Giant Antlion Charger', pageTitle: 'Antlion Charger', pageId: 456, missing: false },
      { requestedTitle: 'Missing Alias', pageTitle: 'Missing Alias', pageId: null, missing: true },
    ]
  );
});

function runNodeModule(source, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--input-type=module', '--eval', source], {
      cwd: path.dirname(fileURLToPath(import.meta.url)),
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => stdout += chunk);
    child.stderr.on('data', (chunk) => stderr += chunk);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('fetchWikiImageInfo requests and preserves the file revision, leaving absent evidence null', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-image-revision-'));
  const moduleUrl = new URL('./wiki-item-utils.mjs', import.meta.url).href;
  const result = await runNodeModule(`
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(new URL(url).searchParams.get('iiprop'));
      const image = { url: 'https://terraria.wiki.gg/images/Wood_armor.png', width: 64, height: 64, mime: 'image/png' };
      if (calls.length === 1) image.timestamp = '2026-06-01T12:34:56Z';
      return new Response(JSON.stringify({ query: { pages: [{ title: 'File:Wood armor.png', imageinfo: [image] }] } }));
    };
    const { fetchWikiImageInfo } = await import(${JSON.stringify(moduleUrl)});
    const present = await fetchWikiImageInfo({ fileTitle: 'Wood armor.png' });
    const missing = await fetchWikiImageInfo({ fileTitle: 'Wood armor.png' });
    console.log(JSON.stringify({ calls, present, missing }));
  `, { env: { ...process.env, WORKTREE_ROOT: tempDir, TERRAPEDIA_SHARED_DATA_ROOT: tempDir } });
  assert.equal(result.code, 0, result.stderr);
  const actual = JSON.parse(result.stdout);
  assert.ok(actual.calls.every(value => value.split('|').includes('timestamp')), 'request must ask for real file revision');
  assert.equal(actual.present.revisionTimestamp, '2026-06-01T12:34:56Z');
  assert.equal(actual.missing.revisionTimestamp, null);
});
