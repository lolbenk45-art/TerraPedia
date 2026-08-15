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
