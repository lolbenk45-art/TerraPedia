import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  WORLD_CONTEXT_SOURCE_PAGES,
  buildWorldContextProgressPayload,
  fetchWorldContextSources
} from './fetch-wiki-world-contexts.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const scriptPath = path.join(__dirname, 'fetch-wiki-world-contexts.mjs');

test('world context fetch exposes bounded source page list', () => {
  assert.deepEqual(WORLD_CONTEXT_SOURCE_PAGES.map(page => page.title), [
    'Day and night cycle',
    'Moon phase',
    'Events',
    'Rain',
    'Sandstorm',
    'Windy Day',
    'Thunderstorm',
    'Starfall',
    'Blood Moon',
    'Party',
    'Lantern Night',
    'Goblin Army',
    'Slime Rain',
    "Old One's Army",
    'The Torch God',
    'Frost Legion',
    'Solar Eclipse',
    'Pirate Invasion',
    'Pumpkin Moon',
    'Frost Moon',
    'Martian Madness',
    'Lunar Events',
    'Weather',
    'Snow biome',
    'Graveyard',
    'Shimmer'
  ]);
});

test('world context progress payload follows monitor contract shape', () => {
  const payload = buildWorldContextProgressPayload({
    actionId: 'world-contexts-refresh',
    status: 'running',
    phase: 'fetch',
    message: 'fetching Events',
    current: 2,
    total: 6,
    startedAt: '2026-05-22T00:00:00.000Z',
    progressPath: '/tmp/world-context-progress.json',
    generatedAt: '2026-05-22T00:01:00.000Z'
  });

  assert.equal(payload.actionId, 'world-contexts-refresh');
  assert.equal(payload.status, 'running');
  assert.equal(payload.phase, 'fetch');
  assert.equal(payload.message, 'fetching Events');
  assert.equal(payload.current, 2);
  assert.equal(payload.total, 6);
  assert.equal(payload.overallCurrent, 2);
  assert.equal(payload.overallTotal, 6);
  assert.equal(payload.childStatusPath, '/tmp/world-context-progress.json');
  assert.equal(payload.lastHeartbeatAt, '2026-05-22T00:01:00.000Z');
});

test('world context fetch rejects wiki chrome images as representative icons', async () => {
  const { records, unresolved } = await fetchWorldContextSources({
    pages: [{ title: 'Events', domain: 'event' }],
    fetchWikiPagePayloadImpl: async () => ({
      pageTitle: 'Events',
      pageId: 303,
      revisionId: 202,
      revisionTimestamp: '2026-05-20T00:00:00Z',
      fetchedAt: '2026-05-22T00:00:00Z',
      html: `
        <div class="mw-parser-output">
          <table class="infobox">
            <tr><td><img alt="Desktop version" src="/images/Desktop_only.png?8fb4d9" /></td></tr>
            <tr><td><img alt="Minecart" src="/images/Minecart.png?123abc" /></td></tr>
          </table>
          <p>Events are temporary occurrences.</p>
        </div>`,
      sections: []
    })
  });

  assert.equal(unresolved.length, 0);
  assert.equal(records.length, 1);
  assert.equal(records[0].iconUrl, null);
});

test('world context fetch writes source JSON and completed progress with mock wiki payload', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-world-contexts-'));
  const worktreeRoot = path.join(tempDir, 'feature-worktree');
  const sharedDataRoot = path.join(worktreeRoot, 'data', 'terraPedia');
  const progressPath = path.join(tempDir, 'progress.json');
  const mockApiPath = writeWorldContextMock(tempDir);

  fs.mkdirSync(worktreeRoot, { recursive: true });

  const result = spawnSync(process.execPath, [
    scriptPath,
    `--progress-path=${progressPath}`
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      WORKTREE_ROOT: worktreeRoot,
      TERRAPEDIA_SHARED_DATA_ROOT: sharedDataRoot,
      TERRAPEDIA_CRAWLER_ACTION_ID: 'test-world-contexts-refresh',
      NODE_ENV: 'test',
      TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mockApiPath
    }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  assert.equal(progress.actionId, 'test-world-contexts-refresh');
  assert.equal(progress.status, 'completed');
  assert.equal(progress.phase, 'write');
  assert.equal(progress.current, WORLD_CONTEXT_SOURCE_PAGES.length);
  assert.equal(progress.total, WORLD_CONTEXT_SOURCE_PAGES.length);
  assert.match(progress.outputPath, /wiki-world-contexts\.latest\.json$/);
  assert.match(progress.reportPath, /wiki-world-contexts-summary-\d{4}-\d{2}-\d{2}\.md$/);

  const output = JSON.parse(fs.readFileSync(path.join(sharedDataRoot, 'generated', 'wiki-world-contexts.latest.json'), 'utf8'));
  assert.equal(output.entity, 'wiki_world_contexts');
  assert.equal(output.pages.length, WORLD_CONTEXT_SOURCE_PAGES.length);
  assert.equal(output.pages[0].requestedTitle, 'Day and night cycle');
  assert.equal(output.pages[0].sourceUrl, 'https://terraria.wiki.gg/wiki/Mock%20page');
});

function writeWorldContextMock(tempDir) {
  const mockPath = path.join(tempDir, 'mock-api.json');
  fs.writeFileSync(mockPath, JSON.stringify({
    parse: {
      title: 'Mock page',
      pageid: 303,
      wikitext: 'Mock wikitext',
      text: '<div class="mw-parser-output"><p>Mock page summary.</p><img alt="Mock" src="/images/Mock.png" /></div>',
      sections: [
        { level: '2', line: 'Contents' }
      ]
    },
    query: {
      pages: [{
        pageid: 101,
        title: 'Mock page',
        revisions: [{
          revid: 202,
          timestamp: '2026-05-20T00:00:00Z'
        }]
      }]
    }
  }), 'utf8');
  return mockPath;
}
