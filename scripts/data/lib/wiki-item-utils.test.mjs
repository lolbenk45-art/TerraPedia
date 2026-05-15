import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWikiPageParseUrl,
  fetchWikiPagePayload,
  fetchWikiPageMetadataBatch,
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
