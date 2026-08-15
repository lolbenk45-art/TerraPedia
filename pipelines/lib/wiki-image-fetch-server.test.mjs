import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchWikiImageThroughGate } from './wiki-image-fetch-server.mjs';

test('fetchWikiImageThroughGate resolves wiki File pages and fetches binary image through gate', async () => {
  const calls = [];
  const gate = {
    runJsonRequest: async (url, options) => {
      calls.push({ type: 'json', url: String(url), options });
      return {
        query: {
          pages: {
            123: {
              imageinfo: [
                {
                  url: 'https://terraria.wiki.gg/images/Torch.png',
                  mime: 'image/png'
                }
              ]
            }
          }
        }
      };
    },
    runBinaryRequest: async (url, options) => {
      calls.push({ type: 'binary', url: String(url), options });
      return {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'image/png' },
        body: Buffer.from([0x89, 0x50, 0x4e, 0x47])
      };
    }
  };

  const result = await fetchWikiImageThroughGate({
    url: 'https://terraria.wiki.gg/wiki/File:Torch.png',
    gate
  });

  assert.equal(result.status, 200);
  assert.equal(result.sourceUrl, 'https://terraria.wiki.gg/images/Torch.png');
  assert.deepEqual([...result.body], [0x89, 0x50, 0x4e, 0x47]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].type, 'json');
  assert.match(calls[0].url, /action=query/);
  assert.match(calls[0].url, /titles=File%3ATorch\.png/);
  assert.equal(calls[1].type, 'binary');
  assert.equal(calls[1].url, 'https://terraria.wiki.gg/images/Torch.png');
});

test('fetchWikiImageThroughGate rejects non-wiki image URLs', async () => {
  await assert.rejects(
    () => fetchWikiImageThroughGate({
      url: 'https://example.com/images/Torch.png',
      gate: {}
    }),
    /Unsupported wiki image URL/
  );
});
