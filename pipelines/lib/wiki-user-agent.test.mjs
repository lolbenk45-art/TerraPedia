import test from 'node:test';
import assert from 'node:assert/strict';

import { createWikiRequestGate } from './wiki-request-gate.mjs';
import { WIKI_USER_AGENT } from './wiki-user-agent.mjs';

test('wiki request gate uses the shared TerraPedia user agent by default', () => {
  const gate = createWikiRequestGate({
    fetchFn: async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({ ok: true })
    }),
    externalRequestFn: null
  });

  assert.equal(WIKI_USER_AGENT, 'TerraPedia/2.0 (+https://terraria.wiki.gg/api.php)');
  assert.equal(gate.userAgent, WIKI_USER_AGENT);
});
