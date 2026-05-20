import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pythonFetchers = [
  'scripts/data/fetch/fetch_wiki_shimmer_via_bs4.py',
  'scripts/data/fetch/fetch-wiki-town-npc-maintenance.py'
];

test('python wiki fetchers use the wiki request gate bridge instead of direct HTTP clients', () => {
  for (const filePath of pythonFetchers) {
    const source = fs.readFileSync(filePath, 'utf8');

    assert.match(source, /WikiRequestGateClient/);
    assert.doesNotMatch(source, /\brequests\./);
    assert.doesNotMatch(source, /\bhttpx\.Client\b/);
    assert.doesNotMatch(source, /headers=\{"User-Agent":/);
  }
});
