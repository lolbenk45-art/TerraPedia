import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWikiPageParseUrl } from './wiki-item-utils.mjs';

test('buildWikiPageParseUrl enables redirect following for parse requests', () => {
  const url = buildWikiPageParseUrl({
    pageTitle: 'Torch',
    apiUrl: 'https://terraria.wiki.gg/api.php',
  });

  assert.equal(url.searchParams.get('action'), 'parse');
  assert.equal(url.searchParams.get('page'), 'Torch');
  assert.equal(url.searchParams.get('prop'), 'wikitext|text');
  assert.equal(url.searchParams.get('format'), 'json');
  assert.equal(url.searchParams.get('formatversion'), '2');
  assert.equal(url.searchParams.get('redirects'), '1');
});
